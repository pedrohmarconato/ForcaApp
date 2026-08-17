import {
  startLiveActivity,
  updateLiveActivity,
} from '../../modules/live-activity';
import { buildLiveActivityContentState } from '../engine/liveActivityContentState';
import { useActiveSessionStore } from '../store/activeSessionStore';

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

/** Único escritor JS→ActivityKit; reage somente a mudanças reais do store. */
export const initLiveActivitySync = (): (() => void) =>
  useActiveSessionStore.subscribe((state, previousState) => {
    if (state.status !== 'active' || !state.draft) return;

    if (previousState.status !== 'active') {
      publishStart(state.draft);
      return;
    }

    if (state.draft !== previousState.draft) {
      publishUpdate(state.draft);
    }
  });
