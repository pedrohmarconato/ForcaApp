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
  lastRepsByExercise: {},
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

  describe('carga em edição (currentLoadKg/isLoadInherited/loadIncrementKg)', () => {
    it('measuring com carga real digitada usa a carga real e marca como não herdada', () => {
      const sets = [{ ...makeSet(1, 'active'), actualLoadKg: 40 }];
      const exercise = makeExercise(sets, { loadIncrementKg: 2.5 });

      expect(buildLiveActivityContentState(makeDraft(sets, [exercise]), now)).toMatchObject({
        phase: 'measuring',
        currentLoadKg: 40,
        isLoadInherited: false,
        loadIncrementKg: 2.5,
      });
    });

    it('measuring sem carga real herda a carga-alvo e marca como herdada', () => {
      const sets = [{ ...makeSet(1, 'active'), actualLoadKg: null, targetLoadKg: 50 }];
      const exercise = makeExercise(sets, { loadIncrementKg: 2.5 });

      expect(buildLiveActivityContentState(makeDraft(sets, [exercise]), now)).toMatchObject({
        phase: 'measuring',
        currentLoadKg: 50,
        isLoadInherited: true,
        loadIncrementKg: 2.5,
      });
    });

    it('measuring de exercício bodyweight não preenche os campos de carga', () => {
      const sets = [makeSet(1, 'active')];
      const exercise = makeExercise(sets, { isBodyweight: true });

      expect(buildLiveActivityContentState(makeDraft(sets, [exercise]), now)).toMatchObject({
        phase: 'measuring',
        currentLoadKg: null,
        isLoadInherited: false,
        loadIncrementKg: null,
      });
    });

    it('readyOvertime não preenche os campos de carga', () => {
      const draft = makeDraft([makeSet(1, 'active'), makeSet(2, 'pending')]);
      draft.restEndsAt = now.toISOString();

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'readyOvertime',
        currentLoadKg: null,
        isLoadInherited: false,
        loadIncrementKg: null,
      });
    });

    it('blockOnly não preenche os campos de carga', () => {
      const sets = [makeSet(1, 'active')];
      const exercise = makeExercise(sets, { metric: 'tempo', name: 'Alongamento' });

      expect(buildLiveActivityContentState(makeDraft(sets, [exercise]), now)).toMatchObject({
        phase: 'blockOnly',
        currentLoadKg: null,
        isLoadInherited: false,
        loadIncrementKg: null,
      });
    });
  });

  describe('reps em edição (currentReps/isRepsInherited — precedência híbrida D-17)', () => {
    it('1ª série do exercício na sessão: sem reps real, histórico vence do alvo (D-01)', () => {
      const sets = [{ ...makeSet(1, 'active'), actualReps: null, targetRepsMin: 8 }];
      const exercise = makeExercise(sets);
      const draft = makeDraft(sets, [exercise]);
      draft.lastRepsByExercise = { 'supino reto': 5 };

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        currentReps: 5,
        isRepsInherited: true,
      });
    });

    it('série seguinte do exercício na sessão: sem reps real, alvo vence do histórico (D-08)', () => {
      const sets = [
        { ...makeSet(1, 'done'), actualReps: 7 },
        { ...makeSet(2, 'active'), actualReps: null, targetRepsMin: 8 },
      ];
      const exercise = makeExercise(sets);
      const draft = makeDraft(sets, [exercise]);
      draft.lastRepsByExercise = { 'supino reto': 5 };

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        currentReps: 8,
        isRepsInherited: true,
      });
    });

    it('reps real digitada sempre vence, independente do ramo D-17', () => {
      const sets = [{ ...makeSet(1, 'active'), actualReps: 12, targetRepsMin: 8 }];
      const exercise = makeExercise(sets);
      const draft = makeDraft(sets, [exercise]);
      draft.lastRepsByExercise = { 'supino reto': 5 };

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        currentReps: 12,
        isRepsInherited: false,
      });
    });

    it('fase não-measuring não preenche currentReps/isRepsInherited', () => {
      const draft = makeDraft([makeSet(1, 'done'), makeSet(2, 'pending')]);
      draft.restEndsAt = '2026-08-16T12:01:30.000Z';

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'resting',
        currentReps: null,
        isRepsInherited: false,
      });
    });

    it('reps aparecem para exercício bodyweight (só a carga é omitida)', () => {
      const sets = [{ ...makeSet(1, 'active'), actualReps: null, targetRepsMin: 8 }];
      const exercise = makeExercise(sets, { isBodyweight: true });
      const draft = makeDraft(sets, [exercise]);
      draft.lastRepsByExercise = { 'supino reto': 5 };

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        currentLoadKg: null,
        currentReps: 5,
        isRepsInherited: true,
      });
    });
  });

  describe('antecipação "A SEGUIR" (next* — Fase 17, PRED-01)', () => {
    it('measuring: a série depois da ativa, mesmo exercício — D-17 ramo 2 (alvo vence do histórico)', () => {
      const exA = makeExercise(
        [
          { ...makeSet(1, 'done'), actualReps: 8, actualLoadKg: 40 },
          makeSet(2, 'active'),
          { ...makeSet(3, 'pending'), targetRepsMin: 8, targetLoadKg: 40 },
        ],
        { exerciseId: 'ex-a', name: 'A' },
      );
      const draft = makeDraft([], [exA]);
      draft.lastRepsByExercise = { a: 5 };
      draft.lastLoadByExercise = { a: 30 };

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        nextExerciseName: 'A',
        nextSetIndex: 3,
        nextSetTotal: 3,
        nextSuggestedReps: 8, // D-17 ramo 2: alvo (8) vence do histórico (5)
        nextSuggestedLoadKg: 40, // D-08 inalterada: alvo vence do histórico
        nextIsBodyweight: false,
      });
    });

    it('resting: a série depois da atual pertence ao exercício SEGUINTE (B), não um fallback repetindo A', () => {
      const exA = makeExercise([makeSet(1, 'done'), makeSet(2, 'pending')], {
        exerciseId: 'ex-a',
        name: 'A',
      });
      const exB = makeExercise([{ ...makeSet(1, 'pending'), targetRepsMin: 8, targetLoadKg: 40 }], {
        exerciseId: 'ex-b',
        name: 'B',
      });
      const draft = makeDraft([], [exA, exB]);
      draft.restEndsAt = '2026-08-16T12:01:30.000Z';
      draft.lastRepsByExercise = { b: 6 };

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'resting',
        exerciseName: 'A',
        nextExerciseName: 'B', // não repete A
        nextSetIndex: 1,
        nextSetTotal: 1,
        nextSuggestedReps: 6, // D-17 ramo 1 (1ª série de B na sessão): histórico vence
        nextSuggestedLoadKg: 40,
        nextIsBodyweight: false,
      });
    });

    it('current é a ÚLTIMA série pendente do treino: os 6 campos next* saem null', () => {
      const draft = makeDraft([makeSet(1, 'active')]);

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        nextExerciseName: null,
        nextSetIndex: null,
        nextSetTotal: null,
        nextSuggestedReps: null,
        nextSuggestedLoadKg: null,
        nextIsBodyweight: null,
      });
    });

    it('virada para bloco de cardio/alongamento: só o NOME antecipado, nunca prescrição de tempo/distância (D-03)', () => {
      const exA = makeExercise([makeSet(1, 'active')], { exerciseId: 'ex-a', name: 'A' });
      const exB = makeExercise([makeSet(1, 'pending')], {
        exerciseId: 'ex-b',
        name: 'Alongamento',
        metric: 'tempo',
      });
      const draft = makeDraft([], [exA, exB]);

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'measuring',
        nextExerciseName: 'Alongamento',
        nextSetIndex: null,
        nextSetTotal: null,
        nextSuggestedReps: null,
        nextSuggestedLoadKg: null,
        nextIsBodyweight: null,
      });
    });

    it('phase === blockOnly: os 6 campos next* saem null, mesmo havendo série de força depois', () => {
      const exA = makeExercise([makeSet(1, 'active')], {
        exerciseId: 'ex-a',
        name: 'Alongamento',
        metric: 'tempo',
      });
      const exB = makeExercise([makeSet(1, 'pending')], { exerciseId: 'ex-b', name: 'B' });
      const draft = makeDraft([], [exA, exB]);

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'blockOnly',
        nextExerciseName: null,
        nextSetIndex: null,
        nextSetTotal: null,
        nextSuggestedReps: null,
        nextSuggestedLoadKg: null,
        nextIsBodyweight: null,
      });
    });

    // REG-17 (review 2026-08-19): findPendingSetAfter ignorava só cutByReplan,
    // não skippedByUser — um exercício que o aluno RECUSOU explicitamente
    // continuava a ser anunciado como nextExerciseName na tela bloqueada.
    it('exercício RECUSADO pelo aluno (skippedByUser) entre a atual e a próxima não vira nextExerciseName', () => {
      const exA = makeExercise([makeSet(1, 'done'), makeSet(2, 'pending')], {
        exerciseId: 'ex-a',
        name: 'A',
      });
      const exRecusado = makeExercise([{ ...makeSet(1, 'pending'), targetRepsMin: 8, targetLoadKg: 40 }], {
        exerciseId: 'ex-recusado',
        name: 'Recusado',
        skippedByUser: true,
      });
      const exC = makeExercise([{ ...makeSet(1, 'pending'), targetRepsMin: 8, targetLoadKg: 40 }], {
        exerciseId: 'ex-c',
        name: 'C',
      });
      const draft = makeDraft([], [exA, exRecusado, exC]);
      draft.restEndsAt = '2026-08-16T12:01:30.000Z';

      expect(buildLiveActivityContentState(draft, now)).toMatchObject({
        phase: 'resting',
        exerciseName: 'A',
        nextExerciseName: 'C', // não "Recusado"
        nextSetIndex: 1,
        nextSetTotal: 1,
      });
    });
  });
});
