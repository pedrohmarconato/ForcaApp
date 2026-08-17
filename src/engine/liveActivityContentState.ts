import {
  findActiveSet,
  findNextPendingSet,
  type SessionDraft,
} from './sessionModel';

export type LiveActivityPhase =
  | 'measuring'
  | 'resting'
  | 'readyOvertime'
  | 'blockOnly';

/** Contrato mínimo espelhado por ActivityKit/WidgetKit. */
export type LiveActivityContentState = {
  phase: LiveActivityPhase;
  exerciseName: string;
  setIndex: number;
  setTotal: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetLoadKg: number | null;
  isBodyweight: boolean;
  restEndsAt: string | null;
  blockLabel: string | null;
  blockIndex: number | null;
  blockTotal: number | null;
};

const contentStateFor = (
  phase: LiveActivityPhase,
  exercise: NonNullable<ReturnType<typeof findActiveSet>>['exercise'],
  set: NonNullable<ReturnType<typeof findActiveSet>>['set'],
  restEndsAt: string | null,
): LiveActivityContentState => ({
  phase,
  exerciseName: exercise.name,
  setIndex: set.setOrder,
  setTotal: exercise.sets.length,
  targetRepsMin: set.targetRepsMin,
  targetRepsMax: set.targetRepsMax,
  targetLoadKg: set.targetLoadKg,
  isBodyweight: exercise.isBodyweight,
  restEndsAt: restEndsAt ? new Date(restEndsAt).toISOString() : null,
  blockLabel: null,
  blockIndex: null,
  blockTotal: null,
});

/** Deriva o estado nativo sem I/O e sem produzir timer para measuring. */
export const buildLiveActivityContentState = (
  draft: SessionDraft,
  now: Date = new Date(),
): LiveActivityContentState | null => {
  const next = findNextPendingSet(draft);
  const active = findActiveSet(draft);
  const restEndsAtMs = draft.restEndsAt ? Date.parse(draft.restEndsAt) : Number.NaN;

  if (next && Number.isFinite(restEndsAtMs) && restEndsAtMs > now.getTime()) {
    return contentStateFor('resting', next.exercise, next.set, draft.restEndsAt);
  }

  if (active) {
    return contentStateFor('measuring', active.exercise, active.set, null);
  }

  return null;
};
