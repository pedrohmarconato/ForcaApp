import {
  findActiveSet,
  findNextPendingSet,
  isTimeBased,
  metricOf,
  type SessionDraft,
} from './sessionModel';
import { posicaoNoBlocoDeMetrica } from './sessionFlow';

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
  blockPosition: { indice: number; total: number } | null = null,
): LiveActivityContentState => ({
  phase,
  exerciseName: exercise.name,
  setIndex: set.setOrder,
  setTotal: exercise.sets.length,
  targetRepsMin: phase === 'blockOnly' ? null : set.targetRepsMin,
  targetRepsMax: phase === 'blockOnly' ? null : set.targetRepsMax,
  targetLoadKg: phase === 'blockOnly' ? null : set.targetLoadKg,
  isBodyweight: exercise.isBodyweight,
  restEndsAt: restEndsAt ? new Date(restEndsAt).toISOString() : null,
  blockLabel: phase === 'blockOnly' ? exercise.name : null,
  blockIndex: phase === 'blockOnly' ? blockPosition?.indice ?? null : null,
  blockTotal: phase === 'blockOnly' ? blockPosition?.total ?? null : null,
});

/** Deriva o estado nativo sem I/O e sem produzir timer para measuring. */
export const buildLiveActivityContentState = (
  draft: SessionDraft,
  now: Date = new Date(),
): LiveActivityContentState | null => {
  const active = findActiveSet(draft);
  const next = findNextPendingSet(draft);
  const current = active ?? next;
  const restEndsAtMs = draft.restEndsAt ? Date.parse(draft.restEndsAt) : Number.NaN;
  const validRestEndsAt = Number.isFinite(restEndsAtMs) ? draft.restEndsAt : null;

  if (!current) return null;

  if (isTimeBased(metricOf(current.exercise))) {
    return contentStateFor(
      'blockOnly',
      current.exercise,
      current.set,
      validRestEndsAt,
      posicaoNoBlocoDeMetrica(draft, current.exercise.exerciseId),
    );
  }

  if (validRestEndsAt) {
    const phase = restEndsAtMs > now.getTime() ? 'resting' : 'readyOvertime';
    return contentStateFor(phase, current.exercise, current.set, validRestEndsAt);
  }

  return active
    ? contentStateFor('measuring', active.exercise, active.set, null)
    : null;
};
