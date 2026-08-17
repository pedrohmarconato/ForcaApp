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

type ActiveDraft = NonNullable<ReturnType<typeof useActiveSessionStore.getState>['draft']>;

const publishStart = (draft: NonNullable<ReturnType<typeof useActiveSessionStore.getState>['draft']>) => {
  if (!draft.sessionLogId) return;
  const contentState = buildLiveActivityContentState(draft);
  if (!contentState) return;
  void startLiveActivity(contentState, draft.sessionLogId).catch((error) => {
    console.warn('[liveActivity] não foi possível iniciar a Activity:', error);
  });
};

const publishUpdate = (draft: NonNullable<ReturnType<typeof useActiveSessionStore.getState>['draft']>) => {
  const contentState = buildLiveActivityContentState(draft);
  if (!contentState) return;
  void updateLiveActivity(contentState).catch((error) => {
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
  useActiveSessionStore.subscribe((state, previousState) => {
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
      publishUpdate(state.draft);
    }
  });
