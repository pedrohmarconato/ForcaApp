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

const makeExercise = (
  sets: DraftSet[],
  overrides: Partial<DraftExercise> = {},
): DraftExercise => ({
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
  ...overrides,
});

const makeDraft = (sets: DraftSet[], exercises?: DraftExercise[]): SessionDraft => ({
  version: 1,
  plannedSessionId: 'session-1',
  sessionLogId: 'log-1',
  userId: 'user-1',
  title: 'Treino A',
  weekNumber: 1,
  startedAt: '2026-08-16T11:00:00.000Z',
  status: 'active',
  restEndsAt: null,
  exercises: exercises ?? [makeExercise(sets)],
  lastLoadByExercise: {},
});

describe('buildLiveActivityContentState', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('deriva measuring para a próxima série pendente quando não há série ativa nem descanso (sessão nova/retomada)', () => {
    // Regressão: bug live-activity-sessao-sumiu. `active` é estado de UI local
    // (só setado por activateSet()) e nunca é restaurado ao reconstruir o
    // rascunho a partir do servidor — uma sessão nova (série 1 'pending') ou
    // uma retomada (série em andamento volta a 'pending') não podem cair em
    // null aqui, senão o card nunca aparece (nem no início, nem na retomada).
    expect(buildLiveActivityContentState(makeDraft([makeSet(1, 'pending')]), now)).toMatchObject({
      phase: 'measuring',
      exerciseName: 'Supino reto',
      setIndex: 1,
      setTotal: 1,
      restEndsAt: null,
    });
  });

  it('retorna null quando não há mais nenhuma série (ativa, pendente ou em descanso)', () => {
    expect(buildLiveActivityContentState(makeDraft([makeSet(1, 'done')]), now)).toBeNull();
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
    draft.restEndsAt = now.toISOString();

    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'readyOvertime',
      restEndsAt: draft.restEndsAt,
    });
  });

  it.each([
    ['série ativa', [makeSet(1, 'active'), makeSet(2, 'pending')], null],
    [
      'descanso do bloco',
      [makeSet(1, 'done'), makeSet(2, 'pending')],
      '2026-08-16T12:01:30.000Z',
    ],
  ])('deriva blockOnly para exercício medido por tempo durante %s', (_, sets, restEndsAt) => {
    const exercise = makeExercise(sets, {
      metric: 'tempo',
      name: 'Alongamento',
    });
    const draft = makeDraft(sets, [exercise]);
    draft.restEndsAt = restEndsAt;

    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'blockOnly',
      exerciseName: 'Alongamento',
      targetRepsMin: null,
      targetRepsMax: null,
      targetLoadKg: null,
      blockLabel: 'Alongamento',
      blockIndex: 1,
      blockTotal: 1,
    });
    expect(buildLiveActivityContentState(draft, now)?.phase).not.toBe('measuring');
  });

  it('deriva blockOnly para exercício medido por tempo e distância', () => {
    const sets = [makeSet(1, 'active')];
    const exercise = makeExercise(sets, {
      metric: 'tempo_distancia',
      name: 'Corrida',
    });

    expect(buildLiveActivityContentState(makeDraft(sets, [exercise]), now)).toMatchObject({
      phase: 'blockOnly',
      blockLabel: 'Corrida',
      targetRepsMin: null,
      targetRepsMax: null,
      targetLoadKg: null,
    });
  });

  it('propaga readyOvertime e resting com o timestamp absoluto', () => {
    const draft = makeDraft([makeSet(1, 'done'), makeSet(2, 'pending')]);
    const restEndsAt = '2026-08-16T12:01:30.000Z';
    draft.restEndsAt = restEndsAt;

    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'resting',
      restEndsAt,
    });

    draft.restEndsAt = '2026-08-16T11:59:59.000Z';
    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'readyOvertime',
      restEndsAt: draft.restEndsAt,
    });
  });

  it('conta o progresso do bloco de tempo sem incluir musculação', () => {
    const exercises = [
      makeExercise([makeSet(1, 'done')], {
        exerciseId: 'forca-1',
        name: 'Supino reto',
        metric: 'carga_reps',
      }),
      makeExercise([makeSet(1, 'done')], {
        exerciseId: 'alongamento-1',
        name: 'Alongamento',
        metric: 'tempo',
      }),
      makeExercise([makeSet(1, 'pending')], {
        exerciseId: 'alongamento-2',
        name: 'Alongamento',
        metric: 'tempo',
      }),
    ];
    const draft = makeDraft([], exercises);

    expect(buildLiveActivityContentState(draft, now)).toMatchObject({
      phase: 'blockOnly',
      blockIndex: 2,
      blockTotal: 2,
      blockLabel: 'Alongamento',
    });
  });
});
