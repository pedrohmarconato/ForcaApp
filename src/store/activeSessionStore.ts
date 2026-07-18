// src/store/activeSessionStore.ts
// Fase 4 — Estado da sessão ATIVA (Zustand). Fino de propósito: guarda o rascunho,
// persiste no aparelho para retomada e delega I/O ao sessionExecutionRepository e
// o cálculo puro ao sessionModel. Regras que este store honra:
//  - erro do banco ao gravar uma série NÃO marca a série como feita (saveError);
//  - retomar (local ou pelo servidor) preserva as séries já registradas;
//  - a carga nunca é inventada (sugestão vem do plano/histórico ou null → pede).

import { create } from 'zustand';
import type { SessionDetail } from '../services/trainingRepository';
import {
  buildDraftFromDetail,
  computeOutcome,
  normalizeName,
  suggestLoad,
  canCompleteSet,
  type SessionDraft,
  type DraftExercise,
  type DraftSet,
} from '../engine/sessionModel';
import {
  startSessionLog,
  saveSetLog,
  finishSessionLog,
  getOpenSessionLog,
  getLastLoadByExerciseName,
  isTransportSessionExecutionError,
  SessionExecutionRequestError,
  type OpenSessionLog,
} from '../services/sessionExecutionRepository';
import {
  saveDraft,
  loadDraft,
  clearDraft,
} from '../services/sessionDraftStorage';

type Status = 'idle' | 'loading' | 'active' | 'finished' | 'error';

interface ActiveSessionState {
  draft: SessionDraft | null;
  status: Status;
  saveError: string | null;

  startOrResume: (args: {
    sessionId: string;
    userId: string;
    detail: SessionDetail;
  }) => Promise<void>;
  activateSet: (exerciseId: string, setOrder: number) => void;
  setReps: (exerciseId: string, setOrder: number, reps: number | null) => void;
  setLoad: (exerciseId: string, setOrder: number, load: number | null) => void;
  stepLoad: (exerciseId: string, setOrder: number, direction: 1 | -1) => void;
  setRir: (exerciseId: string, setOrder: number, rir: number | null) => void;
  completeSet: (exerciseId: string, setOrder: number) => Promise<boolean>;
  finishSession: () => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { message?: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return 'Erro inesperado ao falar com o servidor.';
};

// Trava de reentrância por série (duplo-toque/corrida). Fora do estado do Zustand
// para não disparar re-render: uma gravação por (log, planned_set) por vez (F2/F9).
// A chave inclui o sessionLogId para não colidir entre sessões distintas.
const inFlight = new Set<string>();

// Token monotônico de geração. sessionLogId sozinho não protege uma troca A -> B
// -> A (ABA), nem dois startOrResume concorrentes antes de qualquer log existir.
let operationEpoch = 0;

// Tempo máximo da RPC de gravação (F9): se a rede TRAVAR, a promessa precisa settle
// mesmo assim, senão o `finally` nunca roda e a trava prende a série para sempre.
// Exportado para o teste exercitar o limite sem esperar de verdade.
export const RPC_TIMEOUT_MS = 15000;

/**
 * Corre uma promessa contra um timeout. Se o limite vence, REJEITA (a série volta a
 * poder ser tentada) e SEMPRE limpa o timer no fim (sem handles pendurados). Garante
 * que o await de gravação settle para o `finally` liberar a trava de reentrância (F9).
 */
const withTimeout = <T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> => {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(
        new Error(
          'Tempo esgotado ao gravar a série. Verifique a conexão e tente de novo.',
        ),
      );
    }, ms);

    let pending: Promise<T>;
    try {
      pending = run(controller.signal);
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
      return;
    }

    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

const isClosedSessionError = (error: unknown): boolean =>
  error instanceof SessionExecutionRequestError && error.code === 'P0001';

/** Substitui uma série (imutável) aplicando `fn(set, exercise)`. */
const withSet = (
  draft: SessionDraft,
  exerciseId: string,
  setOrder: number,
  fn: (set: DraftSet, exercise: DraftExercise) => DraftSet,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) =>
    ex.exerciseId !== exerciseId
      ? ex
      : {
          ...ex,
          sets: ex.sets.map((s) => (s.setOrder !== setOrder ? s : fn(s, ex))),
        },
  ),
});

const findSet = (
  draft: SessionDraft,
  exerciseId: string,
  setOrder: number,
): { exercise: DraftExercise; set: DraftSet } | null => {
  const exercise = draft.exercises.find((e) => e.exerciseId === exerciseId);
  const set = exercise?.sets.find((s) => s.setOrder === setOrder);
  if (!exercise || !set) return null;
  return { exercise, set };
};

/** Carga sugerida para uma série, dado o estado atual do rascunho. */
export const suggestionFor = (
  draft: SessionDraft,
  exercise: DraftExercise,
  set: DraftSet,
): number | null => {
  if (exercise.isBodyweight) return null;
  return suggestLoad({
    actualLoadKg: set.actualLoadKg,
    targetLoadKg: set.targetLoadKg,
    lastLoad: draft.lastLoadByExercise[normalizeName(exercise.name)],
  });
};

/** Semente de última carga por nome (best-effort; falha não derruba o início). */
const seedLastLoads = async (
  detail: SessionDetail,
): Promise<Record<string, number>> => {
  try {
    const nomes = (detail.planned_exercises ?? []).map((e) => e.name);
    return await getLastLoadByExerciseName(nomes);
  } catch (e) {
    console.warn(
      '[activeSession] não foi possível semear cargas do histórico:',
      e,
    );
    return {};
  }
};

/** Reaplica no rascunho as séries já gravadas no servidor (retomada). */
const applyServerSetLogs = (
  draft: SessionDraft,
  aberta: OpenSessionLog,
): SessionDraft => {
  const porPlannedSet = new Map(
    aberta.setLogs.map((sl) => [sl.planned_set_id, sl]),
  );
  const lastLoad = { ...draft.lastLoadByExercise };
  const latestFromOpenLog = new Map<
    string,
    { load: number; completedAt: string }
  >();
  const exercises = draft.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => {
      const sl = porPlannedSet.get(s.plannedSetId);
      if (!sl) return s;
      if (sl.actual_load_kg != null && !ex.isBodyweight) {
        const key = normalizeName(ex.name);
        const previous = latestFromOpenLog.get(key);
        if (
          !previous ||
          String(sl.completed_at).localeCompare(previous.completedAt) > 0
        ) {
          latestFromOpenLog.set(key, {
            load: sl.actual_load_kg,
            completedAt: String(sl.completed_at),
          });
        }
      }
      return {
        ...s,
        status: 'done' as const,
        setLogId: sl.id,
        actualReps: sl.actual_reps,
        actualLoadKg: sl.actual_load_kg,
        actualRir: sl.actual_rir,
        outcome: sl.outcome,
      };
    }),
  }));
  // O seed global já vem em completed_at DESC e pode conter uma sessão mais nova.
  // O log aberto só completa lacunas; nunca o sobrescreve pela ordem do plano.
  for (const [key, value] of latestFromOpenLog) {
    if (!(key in lastLoad)) lastLoad[key] = value.load;
  }
  return {
    ...draft,
    sessionLogId: aberta.sessionLogId,
    startedAt: aberta.startedAt,
    exercises,
    lastLoadByExercise: lastLoad,
  };
};

export const useActiveSessionStore = create<ActiveSessionState>((set, get) => ({
  draft: null,
  status: 'idle',
  saveError: null,

  startOrResume: async ({ sessionId, userId, detail }) => {
    const epoch = ++operationEpoch;
    const isCurrent = () => operationEpoch === epoch;
    set({ status: 'loading', saveError: null });
    try {
      // 1. Rascunho local do MESMO treino ainda ativo → RECONCILIA com o servidor
      // antes de adotar (F3/F6): o SERVIDOR é autoritativo. Não gravamos série em log
      // finalizado, e não adotamos o rascunho local CRU (pode ter série "feita" que
      // nunca persistiu, ou carga obsoleta).
      const local = await loadDraft(userId, sessionId);
      if (!isCurrent()) return;
      if (
        local &&
        local.plannedSessionId === sessionId &&
        local.status === 'active'
      ) {
        // O try/catch envolve SÓ a chamada remota — para classificar o erro dela e não
        // engolir uma falha estruturada como se fosse "offline".
        let aberta: OpenSessionLog | null;
        try {
          aberta = await getOpenSessionLog(userId, sessionId);
        } catch (e) {
          if (!isCurrent()) return;
          if (!isTransportSessionExecutionError(e)) throw e;
          // Somente falha de transporte NORMALIZADA na fronteira do Supabase autoriza
          // retomada offline. 401/403/5xx sem `.code` continuam sendo erro.
          console.warn(
            '[activeSession] sem rede para reconciliar; retomando local:',
            e,
          );
          set({ draft: local, status: 'active' });
          return;
        }
        if (!isCurrent()) return;

        if (!aberta) {
          // Servidor PROVOU que a sessão foi finalizada. A decisão de estado vem ANTES
          // de limpar: clearDraft é best-effort e NÃO pode ressuscitar um draft já
          // provado finalizado (senão gravaríamos em log fechado — F6).
          set({ draft: null, status: 'finished' });
          try {
            await clearDraft(userId, sessionId, local.sessionLogId);
          } catch (e) {
            console.warn(
              '[activeSession] rascunho não removido (não-fatal):',
              e,
            );
          }
          return;
        }

        // Há log aberto (mesmo id ou não) → reconstrói do SERVIDOR (autoritativo),
        // nunca adota o local cru.
        const seed = await seedLastLoads(detail);
        if (!isCurrent()) return;
        const draftServidor = applyServerSetLogs(
          buildDraftFromDetail(detail, userId, seed),
          aberta,
        );
        set({ draft: draftServidor, status: 'active' });
        try {
          await saveDraft(draftServidor);
        } catch (e) {
          console.warn(
            '[activeSession] rascunho não persistido (não-fatal):',
            e,
          );
        }
        return;
      }

      // 2. Sem rascunho local (ou de outra sessão): reconstroi do servidor.
      const seed = await seedLastLoads(detail);
      if (!isCurrent()) return;
      let draft = buildDraftFromDetail(detail, userId, seed);

      // Já existe execução em aberto desta sessão? Retoma-a (não duplica session_log).
      const aberta = await getOpenSessionLog(userId, sessionId);
      if (!isCurrent()) return;
      if (aberta) {
        draft = applyServerSetLogs(draft, aberta);
      } else {
        const { sessionLogId, startedAt } = await startSessionLog(sessionId);
        if (!isCurrent()) return;
        draft = { ...draft, sessionLogId, startedAt };
      }

      set({ draft, status: 'active' });
      // Sessão já criada/retomada no servidor (verdade). Persistência local é secundária:
      // falhar aqui NÃO derruba o início para 'error' (mesma filosofia do completeSet).
      try {
        await saveDraft(draft);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
      }
    } catch (e) {
      if (isCurrent()) set({ status: 'error', saveError: errMsg(e) });
    }
  },

  activateSet: (exerciseId, setOrder) => {
    const draft = get().draft;
    if (!draft) return;
    // Só revela os inputs. NÃO pré-preenche a carga: a sugestão vira valor informado
    // apenas quando o aluno digita ou toca "usar sugestão" (F10: sugestão ≠ medição).
    const novo = withSet(draft, exerciseId, setOrder, (s) =>
      s.status !== 'pending' ? s : { ...s, status: 'active' },
    );
    set({ draft: novo });
  },

  setReps: (exerciseId, setOrder, reps) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualReps: reps,
      })),
    });
  },

  setLoad: (exerciseId, setOrder, load) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualLoadKg: load,
      })),
    });
  },

  stepLoad: (exerciseId, setOrder, direction) => {
    const draft = get().draft;
    if (!draft) return;
    const novo = withSet(draft, exerciseId, setOrder, (s, ex) => {
      if (ex.isBodyweight) return s;
      const fallback = suggestLoad({
        actualLoadKg: null,
        targetLoadKg: s.targetLoadKg,
        lastLoad: draft.lastLoadByExercise[normalizeName(ex.name)],
      });
      const base = s.actualLoadKg ?? fallback ?? 0;
      const next =
        Math.round(Math.max(0, base + direction * ex.loadIncrementKg) * 100) /
        100;
      return { ...s, actualLoadKg: next };
    });
    set({ draft: novo });
  },

  setRir: (exerciseId, setOrder, rir) => {
    const draft = get().draft;
    if (!draft) return;
    // Defesa em profundidade: RIR válido é 0–10 (CHECK do banco). A UI já clampa,
    // o núcleo garante (F12).
    const clamped =
      rir == null ? null : Math.min(10, Math.max(0, Math.trunc(rir)));
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualRir: clamped,
      })),
    });
  },

  completeSet: async (exerciseId, setOrder) => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente. Reabra o treino.' });
      return false;
    }
    const alvo = findSet(draft, exerciseId, setOrder);
    if (!alvo) return false;
    const { exercise, set: serie } = alvo;

    // Já concluída → idempotente, não regrava (F2).
    if (serie.status === 'done') return true;

    // CAS: fixa a sessão desta gravação ANTES do await (F7). A trava de reentrância é
    // por (log, série) (F9) — não colide entre sessões distintas.
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    const uid = draft.userId;
    const plannedSessionId = draft.plannedSessionId;
    const lockKey = `${sid}:${serie.plannedSetId}`;
    // Reentrância (duplo-toque / duas instâncias): uma gravação por série por vez (F2).
    if (inFlight.has(lockKey)) return false;

    if (!canCompleteSet(serie, exercise.isBodyweight)) {
      set({
        saveError: exercise.isBodyweight
          ? 'Informe as repetições realizadas.'
          : 'Informe repetições e carga antes de concluir a série.',
      });
      return false;
    }

    const actualReps = serie.actualReps as number;
    const actualLoadKg = exercise.isBodyweight
      ? null
      : (serie.actualLoadKg as number);
    const outcome = computeOutcome(
      actualReps,
      serie.targetRepsMin,
      serie.targetRepsMax,
    );

    inFlight.add(lockKey);
    try {
      // O timeout aborta a requisição no cliente. A 0005 preserva a primeira gravação
      // no banco caso o cancelamento chegue tarde e uma tentativa antiga sobreviva.
      const saved = await withTimeout(
        (signal) =>
          saveSetLog(
            {
              sessionLogId: sid,
              plannedSetId: serie.plannedSetId,
              actualReps,
              actualLoadKg,
              actualRir: serie.actualRir,
              outcome,
            },
            signal,
          ),
        RPC_TIMEOUT_MS,
      );

      // CAS (F7): se a sessão ativa MUDOU durante o await (usuário trocou de treino), a
      // gravação foi confirmada no servidor, mas NÃO escrevemos no draft de outra sessão.
      const atual = get().draft;
      if (
        operationEpoch !== epoch ||
        !atual ||
        atual.sessionLogId !== sid ||
        atual.status !== 'active'
      )
        return true;

      // Servidor CONFIRMOU → marca "feita" já. A persistência local é secundária:
      // falha ao salvar o rascunho NÃO reverte um insert confirmado nem faz o
      // chamador retry (F3 — insert confirmado nunca é reapresentado como falha).
      const lastLoad = { ...atual.lastLoadByExercise };
      if (saved.actualLoadKg != null && !exercise.isBodyweight) {
        lastLoad[normalizeName(exercise.name)] = saved.actualLoadKg;
      }
      const novo: SessionDraft = {
        ...withSet(atual, exerciseId, setOrder, (s) => ({
          ...s,
          status: 'done',
          actualReps: saved.actualReps,
          actualLoadKg: saved.actualLoadKg,
          actualRir: saved.actualRir,
          outcome: saved.outcome,
          setLogId: saved.setLogId,
        })),
        lastLoadByExercise: lastLoad,
      };
      set({ draft: novo, saveError: null });
      try {
        await saveDraft(novo);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
      }
      return true;
    } catch (e) {
      // Só erro do BANCO deixa a série NÃO concluída. E só mostra o erro se AINDA
      // estamos na mesma sessão (não polui a UI de uma sessão que o usuário já trocou).
      const atual = get().draft;
      if (operationEpoch === epoch && atual?.sessionLogId === sid) {
        if (isClosedSessionError(e)) {
          set({
            draft: { ...atual, status: 'finished' },
            status: 'finished',
            saveError: null,
          });
          try {
            await clearDraft(uid, plannedSessionId, sid);
          } catch (storageError) {
            console.warn(
              '[activeSession] rascunho não removido (não-fatal):',
              storageError,
            );
          }
        } else {
          set({ saveError: errMsg(e) });
        }
      }
      return false;
    } finally {
      inFlight.delete(lockKey);
    }
  },

  finishSession: async () => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente.' });
      return false;
    }
    // CAS: fixa a sessão desta conclusão ANTES do await (F7).
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    const uid = draft.userId;
    const plannedSessionId = draft.plannedSessionId;
    try {
      // RPC atômica e IDEMPOTENTE (0004): finaliza, ou é sucesso se já estava finalizada
      // (dela); só inexistente/alheia levanta erro — sem "concluído" falso (F4/F6).
      await finishSessionLog(sid);
    } catch (e) {
      // Só reporta o erro se AINDA estamos nesta sessão (não polui uma sessão trocada).
      if (operationEpoch === epoch && get().draft?.sessionLogId === sid) {
        set({ saveError: errMsg(e) });
      }
      return false;
    }

    // CAS (F7): se o usuário trocou de sessão durante o await, o servidor finalizou a
    // certa, mas NÃO mexemos no estado nem limpamos o rascunho da OUTRA sessão.
    const atual = get().draft;
    if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid)
      return true;

    set({
      draft: { ...atual, status: 'finished' },
      status: 'finished',
      saveError: null,
    });
    // Só limpa o rascunho DEPOIS de finalizar de verdade, e só porque o draft atual
    // AINDA é esta sessão (não por userId cego — evita apagar a sessão trocada).
    try {
      await clearDraft(uid, plannedSessionId, sid);
    } catch (e) {
      console.warn('[activeSession] rascunho não removido (não-fatal):', e);
    }
    return true;
  },

  clearError: () => set({ saveError: null }),

  reset: () => {
    operationEpoch += 1;
    set({ draft: null, status: 'idle', saveError: null });
  },
}));
