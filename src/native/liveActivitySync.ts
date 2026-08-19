import {
  endLiveActivity,
  reconcileLiveActivityOrphans,
  startLiveActivity,
  updateLiveActivity,
} from '../../modules/live-activity';
import {
  buildLiveActivityContentState,
  type LiveActivityContentState,
} from '../engine/liveActivityContentState';
import { useActiveSessionStore } from '../store/activeSessionStore';

const FINISHED_DISMISSAL_AFTER_SECONDS = 180;
export const INACTIVITY_TIMEOUT_MS = 3 * 60 * 60 * 1000;

type ActiveDraft = NonNullable<ReturnType<typeof useActiveSessionStore.getState>['draft']>;

let inactivityTimeout: ReturnType<typeof setTimeout> | null = null;
let lastStartFailed = false;
const startFailureListeners = new Set<() => void>();

const clearInactivityTimeout = (): void => {
  if (inactivityTimeout === null) return;
  clearTimeout(inactivityTimeout);
  inactivityTimeout = null;
};

const resetInactivityTimeout = (): void => {
  clearInactivityTimeout();
  inactivityTimeout = setTimeout(() => {
    inactivityTimeout = null;
    void endLiveActivity('immediate').catch((error) => {
      console.warn('[liveActivity] não foi possível encerrar por inatividade:', error);
    });
  }, INACTIVITY_TIMEOUT_MS);
};

const recordStartFailure = (failed: boolean): void => {
  lastStartFailed = failed;
  if (!failed) return;
  for (const listener of startFailureListeners) listener();
};

export const getLastStartFailed = (): boolean => lastStartFailed;

export const subscribeLiveActivityStartFailure = (
  listener: () => void,
): (() => void) => {
  startFailureListeners.add(listener);
  return () => startFailureListeners.delete(listener);
};

/**
 * Detecta uma série que passou de não-done para done em `current` em relação
 * a `previous`, na MESMA sessão (D-08). É a ÚNICA transição que pode
 * substituir o prazo de inatividade de três horas — edição de reps, carga,
 * RIR ou ajuste de descanso publica update, mas não adia o encerramento.
 * Comparação por `plannedSetId`, identidade estável da série na sessão.
 */
const hasNewlyDoneSet = (previous: ActiveDraft, current: ActiveDraft): boolean => {
  if (previous.sessionLogId !== current.sessionLogId) return false;
  const previousDoneIds = new Set<string>();
  for (const ex of previous.exercises) {
    for (const s of ex.sets) {
      if (s.status === 'done') previousDoneIds.add(s.plannedSetId);
    }
  }
  for (const ex of current.exercises) {
    for (const s of ex.sets) {
      if (s.status === 'done' && !previousDoneIds.has(s.plannedSetId)) return true;
    }
  }
  return false;
};

const publishStart = (draft: NonNullable<ReturnType<typeof useActiveSessionStore.getState>['draft']>) => {
  if (!draft.sessionLogId) return;
  const contentState = buildLiveActivityContentState(draft);
  if (!contentState) return;
  void startLiveActivity(contentState, draft.sessionLogId)
    .then((started) => {
      recordStartFailure(!started);
      if (started && useActiveSessionStore.getState().status === 'active') {
        resetInactivityTimeout();
      }
    })
    .catch((error) => {
      clearInactivityTimeout();
      recordStartFailure(true);
      console.warn('[liveActivity] não foi possível iniciar a Activity:', error);
    });
};

/**
 * Depois de `updateLiveActivity` resolver `false` (Activity removida pelo
 * sistema ou pelo timeout de inatividade), tenta recriá-la — mas só se a
 * MESMA sessão que originou a publicação continua `active` com draft no
 * store no instante em que a promise resolve (guarda pós-await, D-06/D-11).
 * Sessão terminada, cancelada ou substituída por outra nunca ressuscita o
 * card. Não mexe na deadline de inatividade nem fabrica uma série concluída.
 */
const recoverAfterFailedUpdate = (originSessionLogId: string): void => {
  const current = useActiveSessionStore.getState();
  if (
    current.status !== 'active' ||
    !current.draft ||
    current.draft.sessionLogId !== originSessionLogId
  ) {
    return;
  }
  const contentState = buildLiveActivityContentState(current.draft);
  if (!contentState) return;
  void startLiveActivity(contentState, originSessionLogId).catch((error) => {
    console.warn(
      '[liveActivity] não foi possível recriar a Activity após update=false:',
      error,
    );
  });
};

const publishUpdate = (draft: NonNullable<ReturnType<typeof useActiveSessionStore.getState>['draft']>) => {
  const contentState = buildLiveActivityContentState(draft);
  if (!contentState) return;
  const sessionLogId = draft.sessionLogId;
  void updateLiveActivity(contentState)
    .then((updated) => {
      if (updated || !sessionLogId) return;
      recoverAfterFailedUpdate(sessionLogId);
    })
    .catch((error) => {
      console.warn('[liveActivity] não foi possível atualizar a Activity:', error);
    });
};

const buildFinishedContentState = (draft: ActiveDraft): LiveActivityContentState | null => {
  const exercise = [...draft.exercises]
    .reverse()
    .find((candidate) => candidate.sets.length > 0);
  const set = exercise?.sets[exercise.sets.length - 1];
  if (!exercise || !set) return null;

  return {
    phase: 'measuring',
    exerciseName: exercise.name,
    setIndex: set.setOrder,
    setTotal: exercise.sets.length,
    targetRepsMin: set.targetRepsMin,
    targetRepsMax: set.targetRepsMax,
    targetLoadKg: set.targetLoadKg,
    isBodyweight: exercise.isBodyweight,
    restEndsAt: null,
    blockLabel: null,
    blockIndex: null,
    blockTotal: null,
    currentLoadKg: null,
    isLoadInherited: false,
    loadIncrementKg: null,
    currentReps: null,
    isRepsInherited: false,
    nextExerciseName: null,
    nextSetIndex: null,
    nextSetTotal: null,
    nextSuggestedReps: null,
    nextSuggestedLoadKg: null,
    nextIsBodyweight: null,
  };
};

const publishFinished = async (draft: ActiveDraft | null): Promise<void> => {
  if (draft) {
    const summary = buildFinishedContentState(draft);
    if (summary) {
      try {
        await updateLiveActivity(summary);
      } catch (error) {
        console.warn('[liveActivity] não foi possível publicar o resumo:', error);
      }
    }

    try {
      await endLiveActivity('afterDate', FINISHED_DISMISSAL_AFTER_SECONDS);
    } catch (error) {
      console.warn('[liveActivity] não foi possível encerrar após terminar:', error);
    }
    return;
  }

  try {
    await endLiveActivity('immediate');
  } catch (error) {
    console.warn('[liveActivity] não foi possível encerrar após cancelar:', error);
  }
};

/**
 * Encerra o card quando a ABERTURA de uma sessão falha e nenhuma outra assume
 * o lugar. Janela #6 (WINDOWS.md): iniciar() chama reset(), que leva o store a
 * idle/draft null; o subscriber faz early-return nesse estado e a saída de
 * 'active' ainda limpa o timeout de inatividade — sem esta função o card da
 * sessão anterior ficava preso mostrando treino velho até o app reiniciar,
 * violando LOCK-03.
 *
 * A guarda de status é o que evita encerrar um card legítimo: se startOrResume
 * já colocou outra sessão em 'active', ela assumiu o card e nada é encerrado.
 */
export const endLiveActivityForAbandonedSession = async (): Promise<void> => {
  const { status, draft } = useActiveSessionStore.getState();
  if (status === 'active' && draft) return;
  try {
    await endLiveActivity('immediate');
  } catch (error) {
    console.warn('[liveActivity] não foi possível encerrar apos abertura falha:', error);
  }
};

/** Encerra Activities órfãs no boot e repõe somente o card da sessão ainda vigente. */
export const reconcileOrphanActivities = async (): Promise<void> => {
  const initialState = useActiveSessionStore.getState();
  const initialDraft = initialState.draft;
  const stillActiveSessionLogId =
    initialState.status === 'active' && initialDraft ? initialDraft.sessionLogId : null;

  let shouldRestart = false;
  try {
    shouldRestart = await reconcileLiveActivityOrphans(stillActiveSessionLogId);
  } catch (error) {
    console.warn('[liveActivity] não foi possível reconciliar Activities órfãs:', error);
    return;
  }

  if (!shouldRestart || !stillActiveSessionLogId) return;

  const currentState = useActiveSessionStore.getState();
  if (
    currentState.status !== 'active' ||
    !currentState.draft ||
    currentState.draft.sessionLogId !== stillActiveSessionLogId
  ) {
    return;
  }

  publishStart(currentState.draft);
};

/** Único escritor JS→ActivityKit; reage somente a mudanças reais do store. */
export const initLiveActivitySync = (): (() => void) =>
  (() => {
    const unsubscribe = useActiveSessionStore.subscribe((state, previousState) => {
      if (previousState.status === 'active' && state.status !== 'active') {
        clearInactivityTimeout();
      }

      if (state.status === 'finished' && previousState.status !== 'finished') {
        void publishFinished(state.draft);
        return;
      }

      if (state.status !== 'active' || !state.draft) return;

      if (previousState.status !== 'active') {
        publishStart(state.draft);
        return;
      }

      if (state.draft !== previousState.draft) {
        if (previousState.draft && hasNewlyDoneSet(previousState.draft, state.draft)) {
          resetInactivityTimeout();
        }
        publishUpdate(state.draft);
      }
    });

    return () => {
      unsubscribe();
      clearInactivityTimeout();
    };
  })();
