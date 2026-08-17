import {
  buildLiveActivityContentState,
} from '../src/engine/liveActivityContentState';
import type {
  DraftExercise,
  DraftSet,
  SessionDraft,
} from '../src/engine/sessionModel';

const makeSet = (setOrder: number, status: DraftSet['status']): DraftSet => ({
  plannedSetId: `set-${setOrder}`,
  setOrder,
  targetRepsMin: 8,
  targetRepsMax: 10,
  targetLoadKg: 40,
  targetRir: 2,
  actualReps: null,
  actualLoadKg: null,
  actualRir: null,
  status,
  outcome: null,
  setLogId: null,
  adaptation: null,
  activatedAt: null,
  completedAt: null,
});

const makeExercise = (sets: DraftSet[]): DraftExercise => ({
  exerciseId: 'ex-1',
  name: 'Supino reto',
  order: 1,
  metric: 'carga_reps',
  equipment: 'Barra',
  isBodyweight: false,
  hasInjury: false,
  loadIncrementKg: 2.5,
  restSeconds: 90,
  priority: 'primary',
  targetRmPercent: 75,
  repsRaw: '8-10',
  sets,
});

const makeDraft = (sets: DraftSet[]): SessionDraft => ({
  version: 1,
  plannedSessionId: 'session-1',
  sessionLogId: 'log-1',
  userId: 'user-1',
  title: 'Treino A',
  weekNumber: 1,
  startedAt: '2026-08-16T11:00:00.000Z',
  status: 'active',
  restEndsAt: null,
  exercises: [makeExercise(sets)],
  lastLoadByExercise: {},
});

describe('buildLiveActivityContentState', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('retorna null quando não há série ativa nem descanso', () => {
    expect(buildLiveActivityContentState(makeDraft([makeSet(1, 'pending')]), now)).toBeNull();
  });

  it('propaga o exercício, a série seguinte e restEndsAt durante o descanso', () => {
    const restEndsAt = '2026-08-16T12:01:30.000Z';
    const draft = makeDraft([makeSet(1, 'done'), makeSet(2, 'pending')]);
    draft.restEndsAt = restEndsAt;

    expect(buildLiveActivityContentState(draft, now)).toEqual({
      phase: 'resting',
      exerciseName: 'Supino reto',
      setIndex: 2,
      setTotal: 2,
      targetRepsMin: 8,
      targetRepsMax: 10,
      targetLoadKg: 40,
      isBodyweight: false,
      restEndsAt,
      blockLabel: null,
      blockIndex: null,
      blockTotal: null,
    });
  });

  it('retorna measuring com restEndsAt nulo quando existe série ativa', () => {
    const draft = makeDraft([makeSet(1, 'active'), makeSet(2, 'pending')]);

    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'measuring',
      exerciseName: 'Supino reto',
      setIndex: 1,
      setTotal: 2,
      restEndsAt: null,
    });
  });

  it('não trata um descanso expirado como timer nativo de contagem regressiva', () => {
    const draft = makeDraft([makeSet(1, 'active'), makeSet(2, 'pending')]);
    draft.restEndsAt = '2026-08-16T11:59:59.000Z';

    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'measuring',
      restEndsAt: null,
    });
  });
});
