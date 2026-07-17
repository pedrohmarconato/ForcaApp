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
// para não disparar re-render: uma gravação por planned_set por vez (F2 do review).
const inFlight = new Set<string>();

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
      // antes de adotar (F1): não podemos gravar séries num log já finalizado.
      const local = await loadDraft(userId);
      if (local && local.plannedSessionId === sessionId && local.status === 'active') {
        try {
          const aberta = await getOpenSessionLog(userId, sessionId);
          if (!aberta) {
            // Sessão foi finalizada (outro aparelho, ou clearDraft falhou). Não retoma.
            await clearDraft(userId);
            set({ draft: null, status: 'finished' });
            return;
          }
          if (aberta.sessionLogId === local.sessionLogId) {
            set({ draft: local, status: 'active' }); // mesmo log aberto → adota local
            return;
          }
          // Log aberto DIFERENTE do local → descarta o local e reconstrói do servidor.
          const seed = await seedLastLoads(detail);
          const draftServidor = applyServerSetLogs(
            buildDraftFromDetail(detail, userId, seed),
            aberta,
          );
          await saveDraft(draftServidor);
          set({ draft: draftServidor, status: 'active' });
          return;
        } catch (e) {
          // Servidor indisponível: retomada offline com o rascunho local (best-effort).
          console.warn('[activeSession] sem rede para reconciliar; retomando local:', e);
          set({ draft: local, status: 'active' });
          return;
        }
      }

      // 2. Sem rascunho local: reconstroi do servidor.
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

      await saveDraft(draft);
      set({ draft, status: 'active' });
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
    // Reentrância (duplo-toque / duas instâncias): uma gravação por série por vez (F2).
    if (inFlight.has(serie.plannedSetId)) return false;

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

    inFlight.add(serie.plannedSetId);
    try {
      // UPSERT idempotente (índice único no banco): retry atualiza a mesma linha.
      const { setLogId } = await saveSetLog({
        sessionLogId: draft.sessionLogId,
        plannedSetId: serie.plannedSetId,
        actualReps,
        actualLoadKg,
        actualRir: serie.actualRir,
        outcome,
      });

      // Servidor CONFIRMOU → marca "feita" já. A persistência local é secundária:
      // falha ao salvar o rascunho NÃO reverte um insert confirmado nem faz o
      // chamador retry (F3 — insert confirmado nunca é reapresentado como falha).
      const atual = get().draft;
      if (!atual) return true;
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
      // Só erro do BANCO deixa a série NÃO concluída e mostra o erro.
      set({ saveError: errMsg(e) });
      return false;
    } finally {
      inFlight.delete(serie.plannedSetId);
    }
  },

  finishSession: async () => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente.' });
      return false;
    }
    try {
      // RPC atômica; levanta erro se 0 linhas (não finaliza no vazio — F5/F6).
      await finishSessionLog(draft.sessionLogId);
      set({ draft: { ...draft, status: 'finished' }, status: 'finished', saveError: null });
      // Só limpa o rascunho DEPOIS de finalizar de verdade no servidor.
      try {
        await clearDraft(draft.userId);
      } catch (e) {
        console.warn('[activeSession] rascunho não removido (não-fatal):', e);
      }
      return true;
    } catch (e) {
      set({ saveError: errMsg(e) });
      return false;
    }
  },

  clearError: () => set({ saveError: null }),

  reset: () => set({ draft: null, status: 'idle', saveError: null }),
}));
