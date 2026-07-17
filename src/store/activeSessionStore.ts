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
  type OpenSessionLog,
} from '../services/sessionExecutionRepository';
import { saveDraft, loadDraft, clearDraft } from '../services/sessionDraftStorage';

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

const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : 'Erro inesperado ao falar com o servidor.';

// Trava de reentrância por série (duplo-toque/corrida). Fora do estado do Zustand
// para não disparar re-render: uma gravação por (log, planned_set) por vez (F2/F9).
// A chave inclui o sessionLogId para não colidir entre sessões distintas.
const inFlight = new Set<string>();

// Tempo máximo da RPC de gravação (F9): se a rede TRAVAR, a promessa precisa settle
// mesmo assim, senão o `finally` nunca roda e a trava prende a série para sempre.
// Exportado para o teste exercitar o limite sem esperar de verdade.
export const RPC_TIMEOUT_MS = 15000;

/**
 * Corre uma promessa contra um timeout. Se o limite vence, REJEITA (a série volta a
 * poder ser tentada) e SEMPRE limpa o timer no fim (sem handles pendurados). Garante
 * que o await de gravação settle para o `finally` liberar a trava de reentrância (F9).
 */
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Tempo esgotado ao gravar a série. Verifique a conexão e tente de novo.')),
      ms,
    );
  });
  return Promise.race([p, limite]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
};

/**
 * Erro ESTRUTURADO do banco (PostgREST/SQL/permissão) x erro de REDE/timeout.
 * PostgREST/Postgres devolvem erro com `.code` (ex.: '42501' permissão, '42P10'
 * índice, 'PGRST...'); erro de rede ('Network request failed') não tem `.code`.
 * Na reconciliação da retomada: estruturado → propaga como erro; rede → retomada
 * offline (F6). Sem isto, TUDO virava "offline" e mascarava falha real do servidor.
 */
const isStructuredDbError = (e: unknown): boolean => {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0;
};

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
const seedLastLoads = async (detail: SessionDetail): Promise<Record<string, number>> => {
  try {
    const nomes = (detail.planned_exercises ?? []).map((e) => e.name);
    return await getLastLoadByExerciseName(nomes);
  } catch (e) {
    console.warn('[activeSession] não foi possível semear cargas do histórico:', e);
    return {};
  }
};

/** Reaplica no rascunho as séries já gravadas no servidor (retomada). */
const applyServerSetLogs = (draft: SessionDraft, aberta: OpenSessionLog): SessionDraft => {
  const porPlannedSet = new Map(aberta.setLogs.map((sl) => [sl.planned_set_id, sl]));
  const lastLoad = { ...draft.lastLoadByExercise };
  const exercises = draft.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => {
      const sl = porPlannedSet.get(s.plannedSetId);
      if (!sl) return s;
      if (sl.actual_load_kg != null && !ex.isBodyweight) {
        lastLoad[normalizeName(ex.name)] = sl.actual_load_kg;
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
    set({ status: 'loading', saveError: null });
    try {
      // 1. Rascunho local do MESMO treino ainda ativo → RECONCILIA com o servidor
      // antes de adotar (F3/F6): o SERVIDOR é autoritativo. Não gravamos série em log
      // finalizado, e não adotamos o rascunho local CRU (pode ter série "feita" que
      // nunca persistiu, ou carga obsoleta).
      const local = await loadDraft(userId);
      if (local && local.plannedSessionId === sessionId && local.status === 'active') {
        // O try/catch envolve SÓ a chamada remota — para classificar o erro dela e não
        // engolir uma falha estruturada como se fosse "offline".
        let aberta: OpenSessionLog | null;
        try {
          aberta = await getOpenSessionLog(userId, sessionId);
        } catch (e) {
          if (isStructuredDbError(e)) throw e; // SQL/permissão/PostgREST → status 'error'
          // Rede/timeout: retomada offline com o rascunho local (best-effort).
          console.warn('[activeSession] sem rede para reconciliar; retomando local:', e);
          set({ draft: local, status: 'active' });
          return;
        }

        if (!aberta) {
          // Servidor PROVOU que a sessão foi finalizada. A decisão de estado vem ANTES
          // de limpar: clearDraft é best-effort e NÃO pode ressuscitar um draft já
          // provado finalizado (senão gravaríamos em log fechado — F6).
          set({ draft: null, status: 'finished' });
          try {
            await clearDraft(userId);
          } catch (e) {
            console.warn('[activeSession] rascunho não removido (não-fatal):', e);
          }
          return;
        }

        // Há log aberto (mesmo id ou não) → reconstrói do SERVIDOR (autoritativo),
        // nunca adota o local cru.
        const seed = await seedLastLoads(detail);
        const draftServidor = applyServerSetLogs(buildDraftFromDetail(detail, userId, seed), aberta);
        set({ draft: draftServidor, status: 'active' });
        try {
          await saveDraft(draftServidor);
        } catch (e) {
          console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        }
        return;
      }

      // 2. Sem rascunho local (ou de outra sessão): reconstroi do servidor.
      const seed = await seedLastLoads(detail);
      let draft = buildDraftFromDetail(detail, userId, seed);

      // Já existe execução em aberto desta sessão? Retoma-a (não duplica session_log).
      const aberta = await getOpenSessionLog(userId, sessionId);
      if (aberta) {
        draft = applyServerSetLogs(draft, aberta);
      } else {
        const { sessionLogId, startedAt } = await startSessionLog(sessionId);
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
      set({ status: 'error', saveError: errMsg(e) });
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
    set({ draft: withSet(draft, exerciseId, setOrder, (s) => ({ ...s, actualReps: reps })) });
  },

  setLoad: (exerciseId, setOrder, load) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: withSet(draft, exerciseId, setOrder, (s) => ({ ...s, actualLoadKg: load })) });
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
      const next = Math.round(Math.max(0, base + direction * ex.loadIncrementKg) * 100) / 100;
      return { ...s, actualLoadKg: next };
    });
    set({ draft: novo });
  },

  setRir: (exerciseId, setOrder, rir) => {
    const draft = get().draft;
    if (!draft) return;
    // Defesa em profundidade: RIR válido é 0–10 (CHECK do banco). A UI já clampa,
    // o núcleo garante (F12).
    const clamped = rir == null ? null : Math.min(10, Math.max(0, Math.trunc(rir)));
    set({ draft: withSet(draft, exerciseId, setOrder, (s) => ({ ...s, actualRir: clamped })) });
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
    const sid = draft.sessionLogId;
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
    const actualLoadKg = exercise.isBodyweight ? null : (serie.actualLoadKg as number);
    const outcome = computeOutcome(actualReps, serie.targetRepsMin, serie.targetRepsMax);

    inFlight.add(lockKey);
    try {
      // RPC idempotente (ON CONFLICT no banco): retry atualiza a mesma linha. withTimeout
      // garante que o await settle mesmo se a rede travar → o finally libera a trava (F9).
      const { setLogId } = await withTimeout(
        saveSetLog({
          sessionLogId: sid,
          plannedSetId: serie.plannedSetId,
          actualReps,
          actualLoadKg,
          actualRir: serie.actualRir,
          outcome,
        }),
        RPC_TIMEOUT_MS,
      );

      // CAS (F7): se a sessão ativa MUDOU durante o await (usuário trocou de treino), a
      // gravação foi confirmada no servidor, mas NÃO escrevemos no draft de outra sessão.
      const atual = get().draft;
      if (!atual || atual.sessionLogId !== sid) return true;

      // Servidor CONFIRMOU → marca "feita" já. A persistência local é secundária:
      // falha ao salvar o rascunho NÃO reverte um insert confirmado nem faz o
      // chamador retry (F3 — insert confirmado nunca é reapresentado como falha).
      const lastLoad = { ...atual.lastLoadByExercise };
      if (actualLoadKg != null) lastLoad[normalizeName(exercise.name)] = actualLoadKg;
      const novo: SessionDraft = {
        ...withSet(atual, exerciseId, setOrder, (s) => ({
          ...s,
          status: 'done',
          outcome,
          actualLoadKg,
          setLogId,
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
      if (get().draft?.sessionLogId === sid) set({ saveError: errMsg(e) });
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
    const sid = draft.sessionLogId;
    const uid = draft.userId;
    try {
      // RPC atômica e IDEMPOTENTE (0004): finaliza, ou é sucesso se já estava finalizada
      // (dela); só inexistente/alheia levanta erro — sem "concluído" falso (F4/F6).
      await finishSessionLog(sid);
    } catch (e) {
      // Só reporta o erro se AINDA estamos nesta sessão (não polui uma sessão trocada).
      if (get().draft?.sessionLogId === sid) set({ saveError: errMsg(e) });
      return false;
    }

    // CAS (F7): se o usuário trocou de sessão durante o await, o servidor finalizou a
    // certa, mas NÃO mexemos no estado nem limpamos o rascunho da OUTRA sessão.
    const atual = get().draft;
    if (!atual || atual.sessionLogId !== sid) return true;

    set({ draft: { ...atual, status: 'finished' }, status: 'finished', saveError: null });
    // Só limpa o rascunho DEPOIS de finalizar de verdade, e só porque o draft atual
    // AINDA é esta sessão (não por userId cego — evita apagar a sessão trocada).
    try {
      await clearDraft(uid);
    } catch (e) {
      console.warn('[activeSession] rascunho não removido (não-fatal):', e);
    }
    return true;
  },

  clearError: () => set({ saveError: null }),

  reset: () => set({ draft: null, status: 'idle', saveError: null }),
}));
