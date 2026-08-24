// __tests__/sessionModel.test.ts
// Fase 4 — modelo puro da sessão. Modos de falha cobertos:
// - outcome: reps < min = under, > max = over, dentro (bordas inclusive) = on_target
// - bodyweight vem do EQUIPAMENTO, não de a carga-alvo estar nula
// - carga NUNCA é inventada: sem fonte, suggestLoad = null e a série não conclui
// - stepper respeita o incremento e não desce abaixo de 0
// - buildDraftFromDetail mapeia detalhe → rascunho e semeia a última carga

import {
  computeOutcome,
  isBodyweightEquipment,
  suggestLoad,
  stepLoad,
  canCompleteSet,
  buildDraftFromDetail,
  sessionProgress,
  isSessionComplete,
  toNum,
  isFirstSetOfExerciseInSession,
  suggestReps,
  stepReps,
  resolveInheritedSet,
  coerceDraftNumerics,
  findPendingSetAfter,
  findActiveSet,
  findNextPendingSet,
  isIsometricHold,
} from '../src/engine/sessionModel';
import type { SessionDetail } from '../src/services/trainingRepository';
import type { DraftExercise, SetRef } from '../src/engine/sessionModel';

describe('computeOutcome', () => {
  it('reps abaixo do mínimo = under', () => {
    expect(computeOutcome(5, 6, 8)).toBe('under');
  });
  it('reps acima do máximo = over', () => {
    expect(computeOutcome(9, 6, 8)).toBe('over');
  });
  it('dentro da faixa = on_target (bordas inclusive)', () => {
    expect(computeOutcome(6, 6, 8)).toBe('on_target');
    expect(computeOutcome(8, 6, 8)).toBe('on_target');
    expect(computeOutcome(7, 6, 8)).toBe('on_target');
  });
  it('faixa de valor único (min == max)', () => {
    expect(computeOutcome(8, 8, 8)).toBe('on_target');
    expect(computeOutcome(7, 8, 8)).toBe('under');
    expect(computeOutcome(9, 8, 8)).toBe('over');
  });
});

describe('isBodyweightEquipment', () => {
  it('reconhece peso corporal em variações', () => {
    expect(isBodyweightEquipment('Peso corporal')).toBe(true);
    expect(isBodyweightEquipment('peso-corporal')).toBe(true);
    expect(isBodyweightEquipment('Body weight')).toBe(true);
    expect(isBodyweightEquipment('Calistenia')).toBe(true);
  });
  it('equipamento com carga NÃO é bodyweight', () => {
    expect(isBodyweightEquipment('Barra')).toBe(false);
    expect(isBodyweightEquipment('Halteres')).toBe(false);
    expect(isBodyweightEquipment('Máquina')).toBe(false);
  });
  it('equipamento ausente não é assumido como bodyweight', () => {
    expect(isBodyweightEquipment(null)).toBe(false);
    expect(isBodyweightEquipment(undefined)).toBe(false);
    expect(isBodyweightEquipment('')).toBe(false);
  });
});

describe('suggestLoad — nunca inventa kg', () => {
  it('sem carga digitada, sem alvo e sem histórico → null (pede ao aluno)', () => {
    expect(suggestLoad({ actualLoadKg: null, targetLoadKg: null, lastLoad: null })).toBeNull();
    expect(suggestLoad({ actualLoadKg: null, targetLoadKg: null, lastLoad: undefined })).toBeNull();
  });
  it('usa a carga já digitada acima de tudo', () => {
    expect(suggestLoad({ actualLoadKg: 42.5, targetLoadKg: 30, lastLoad: 20 })).toBe(42.5);
  });
  it('cai para a carga-alvo do plano quando não há digitada', () => {
    expect(suggestLoad({ actualLoadKg: null, targetLoadKg: 30, lastLoad: 20 })).toBe(30);
  });
  it('cai para a última carga conhecida quando não há alvo', () => {
    expect(suggestLoad({ actualLoadKg: null, targetLoadKg: null, lastLoad: 20 })).toBe(20);
  });
});

describe('stepLoad', () => {
  it('incrementa e decrementa pelo passo do exercício', () => {
    expect(stepLoad(20, 2.5, 1)).toBe(22.5);
    expect(stepLoad(20, 2.5, -1)).toBe(17.5);
  });
  it('parte da sugestão (fallback) quando ainda não há carga', () => {
    expect(stepLoad(null, 2.5, 1, 20)).toBe(22.5);
    expect(stepLoad(null, 2.5, -1, 20)).toBe(17.5);
  });
  it('nunca desce abaixo de 0', () => {
    expect(stepLoad(1, 2.5, -1)).toBe(0);
    expect(stepLoad(null, 2.5, -1)).toBe(0);
  });
});

describe('isFirstSetOfExerciseInSession — discriminador da precedência híbrida D-17', () => {
  it('nenhuma série anterior done → primeira série', () => {
    expect(
      isFirstSetOfExerciseInSession(
        { sets: [{ setOrder: 1, status: 'pending' } as any] },
        { setOrder: 1 },
      ),
    ).toBe(true);
  });
  it('série anterior do MESMO exercício já done → não é a primeira', () => {
    expect(
      isFirstSetOfExerciseInSession(
        {
          sets: [
            { setOrder: 1, status: 'done' } as any,
            { setOrder: 2, status: 'pending' } as any,
          ],
        },
        { setOrder: 2 },
      ),
    ).toBe(false);
  });
  it('série done com setOrder MAIOR não conta como anterior', () => {
    expect(
      isFirstSetOfExerciseInSession(
        {
          sets: [
            { setOrder: 1, status: 'pending' } as any,
            { setOrder: 2, status: 'done' } as any,
          ],
        },
        { setOrder: 1 },
      ),
    ).toBe(true);
  });
});

describe('suggestReps — precedência híbrida D-17 (nunca inventa reps)', () => {
  it('actual sempre vence, nos dois ramos', () => {
    expect(
      suggestReps({ actualReps: 8, targetRepsMin: 10, lastReps: 6, isFirstSetOfExerciseInSession: true }),
    ).toBe(8);
    expect(
      suggestReps({ actualReps: 8, targetRepsMin: 10, lastReps: 6, isFirstSetOfExerciseInSession: false }),
    ).toBe(8);
  });
  it('D-17 ramo 1ª série: histórico vence do alvo (D-01)', () => {
    expect(
      suggestReps({ actualReps: null, targetRepsMin: 10, lastReps: 6, isFirstSetOfExerciseInSession: true }),
    ).toBe(6);
  });
  it('D-17 ramo série seguinte: alvo (já reescrito pela adaptação) vence do histórico (D-08)', () => {
    expect(
      suggestReps({ actualReps: null, targetRepsMin: 10, lastReps: 6, isFirstSetOfExerciseInSession: false }),
    ).toBe(10);
  });
  it('estreia: sem histórico, cai no alvo mesmo no ramo D-01', () => {
    expect(
      suggestReps({ actualReps: null, targetRepsMin: 10, lastReps: null, isFirstSetOfExerciseInSession: true }),
    ).toBe(10);
  });
  it('ramo série seguinte sem alvo real: cai no histórico', () => {
    expect(
      suggestReps({ actualReps: null, targetRepsMin: null, lastReps: 6, isFirstSetOfExerciseInSession: false }),
    ).toBe(6);
  });
  it('nada inventado: sem actual, sem alvo, sem histórico → null', () => {
    expect(
      suggestReps({ actualReps: null, targetRepsMin: null, lastReps: null, isFirstSetOfExerciseInSession: true }),
    ).toBeNull();
  });
});

describe('stepReps', () => {
  it('incrementa/decrementa em passo fixo de 1', () => {
    expect(stepReps(8, 1)).toBe(9);
  });
  it('nunca desce abaixo de 0', () => {
    expect(stepReps(0, -1)).toBe(0);
  });
  it('usa fallback quando ainda não há valor', () => {
    expect(stepReps(null, 1, 10)).toBe(11);
  });
});

describe('resolveInheritedSet — materialização herdada dos dois ramos D-17', () => {
  it('série seguinte do exercício: reps por D-17 ramo 2 (alvo vence); carga inalterada (D-08, alvo vence)', () => {
    expect(
      resolveInheritedSet(
        { actualReps: null, actualLoadKg: null, targetRepsMin: 10, targetLoadKg: 50, setOrder: 2 },
        {
          isBodyweight: false,
          sets: [
            { setOrder: 1, status: 'done' } as any,
            { setOrder: 2, status: 'pending' } as any,
          ],
        },
        6,
        45,
      ),
    ).toEqual({ actualReps: 10, actualLoadKg: 50 });
  });
  it('1ª série do exercício: reps do HISTÓRICO (D-17 ramo 1); carga continua vindo do alvo (D-08 intacta)', () => {
    expect(
      resolveInheritedSet(
        { actualReps: null, actualLoadKg: null, targetRepsMin: 10, targetLoadKg: 50, setOrder: 1 },
        { isBodyweight: false, sets: [{ setOrder: 1, status: 'pending' } as any] },
        6,
        45,
      ),
    ).toEqual({ actualReps: 6, actualLoadKg: 50 });
  });
  it('reps já digitado preservado, nos dois ramos; carga cai no histórico por falta de alvo', () => {
    expect(
      resolveInheritedSet(
        { actualReps: 12, actualLoadKg: null, targetRepsMin: 10, targetLoadKg: null, setOrder: 1 },
        { isBodyweight: false, sets: [{ setOrder: 1, status: 'pending' } as any] },
        6,
        45,
      ),
    ).toEqual({ actualReps: 12, actualLoadKg: 45 });
  });
  it('bodyweight nunca tem carga, independente do ramo de reps', () => {
    const resultado = resolveInheritedSet(
      { actualReps: null, actualLoadKg: null, targetRepsMin: 10, targetLoadKg: 50, setOrder: 1 },
      { isBodyweight: true, sets: [{ setOrder: 1, status: 'pending' } as any] },
      6,
      45,
    );
    expect(resultado.actualLoadKg).toBeNull();
  });
});

describe('coerceDraftNumerics — lastRepsByExercise', () => {
  const draftBase: any = {
    version: 1,
    plannedSessionId: 'sess-1',
    sessionLogId: null,
    userId: 'user-1',
    title: 'Push A',
    weekNumber: 1,
    startedAt: null,
    status: 'active',
    restEndsAt: null,
    exercises: [],
    lastLoadByExercise: {},
  };

  it('lastRepsByExercise ausente (undefined) → devolve {}, nunca lança', () => {
    const draft = { ...draftBase };
    delete draft.lastRepsByExercise;
    expect(() => coerceDraftNumerics(draft)).not.toThrow();
    expect(coerceDraftNumerics(draft).lastRepsByExercise).toEqual({});
  });
  it('coage string do PostgREST em lastRepsByExercise', () => {
    const draft = { ...draftBase, lastRepsByExercise: { a: '12' } };
    expect(coerceDraftNumerics(draft).lastRepsByExercise).toEqual({ a: 12 });
  });
});

describe('findPendingSetAfter — a série ESTRITAMENTE DEPOIS de uma referência (Fase 17, PRED-01)', () => {
  const makeExercicio = (
    exerciseId: string,
    name: string,
    sets: Array<{ setOrder: number; status: 'pending' | 'active' | 'done' }>,
    overrides: Partial<DraftExercise> = {},
  ): DraftExercise => ({
    exerciseId,
    name,
    order: 1,
    metric: 'carga_reps',
    equipment: 'Barra',
    isBodyweight: false,
    hasInjury: false,
    loadIncrementKg: 2.5,
    restSeconds: 90,
    priority: 'primary',
    targetRmPercent: null,
    repsRaw: null,
    sets: sets.map((s) => ({
      plannedSetId: `${exerciseId}-set-${s.setOrder}`,
      setOrder: s.setOrder,
      targetRepsMin: 8,
      targetRepsMax: 10,
      targetLoadKg: 40,
      targetRir: 2,
      actualReps: null,
      actualLoadKg: null,
      actualRir: null,
      status: s.status,
      outcome: null,
      setLogId: null,
      adaptation: null,
      activatedAt: null,
      completedAt: null,
    })),
    ...overrides,
  });

  const ex1 = makeExercicio('ex-1', 'Supino reto', [
    { setOrder: 1, status: 'done' },
    { setOrder: 2, status: 'active' },
    { setOrder: 3, status: 'pending' },
  ]);
  const ex2 = makeExercicio('ex-2', 'Remada curvada', [{ setOrder: 1, status: 'pending' }]);

  const draftBase = { exercises: [ex1, ex2] } as any;

  const ref = (ex: DraftExercise, setOrder: number): SetRef => ({
    exercise: ex,
    set: ex.sets.find((s) => s.setOrder === setOrder)!,
  });

  it('mesmo exercício: encontra a série seguinte, não a primeira pendente do draft', () => {
    expect(findPendingSetAfter(draftBase, ref(ex1, 2))).toEqual({
      exercise: ex1,
      set: ex1.sets[2],
    });
  });

  it('exercício esgotado: pula para a próxima série pendente do exercício seguinte', () => {
    expect(findPendingSetAfter(draftBase, ref(ex1, 3))).toEqual({
      exercise: ex2,
      set: ex2.sets[0],
    });
  });

  it('referência é a última série pendente do treino: devolve null (fim do treino)', () => {
    expect(findPendingSetAfter(draftBase, ref(ex2, 1))).toBeNull();
  });

  it('exercício com cutByReplan entre a referência e a próxima série real é ignorado', () => {
    const exCortado = makeExercicio('ex-cortado', 'Corrida', [{ setOrder: 1, status: 'pending' }], {
      cutByReplan: true,
    });
    const draft = { exercises: [ex1, exCortado, ex2] } as any;
    expect(findPendingSetAfter(draft, ref(ex1, 3))).toEqual({ exercise: ex2, set: ex2.sets[0] });
  });

  // REG-17 (review 2026-08-19): findPendingSetAfter filtrava só `cutByReplan`,
  // não a regra canônica `exercicioForaDeJogo` (cutByReplan || skippedByUser)
  // que as duas vizinhas findActiveSet/findNextPendingSet já usam — um
  // exercício RECUSADO pelo aluno continuava a ser anunciado como "A SEGUIR"
  // na tela bloqueada (liveActivityContentState.ts:99).
  it('exercício com skippedByUser entre a referência e a próxima série real é ignorado', () => {
    const exRecusado = makeExercicio('ex-recusado', 'Agachamento', [{ setOrder: 1, status: 'pending' }], {
      skippedByUser: true,
    });
    const draft = { exercises: [ex1, exRecusado, ex2] } as any;
    expect(findPendingSetAfter(draft, ref(ex1, 3))).toEqual({ exercise: ex2, set: ex2.sets[0] });
  });

  it('referência inexistente no draft (setOrder inválido) devolve null, nunca lança', () => {
    const exForaDoDraft = makeExercicio('ex-fantasma', 'Fantasma', [{ setOrder: 99, status: 'pending' }]);
    expect(() => findPendingSetAfter(draftBase, ref(exForaDoDraft, 99))).not.toThrow();
    expect(findPendingSetAfter(draftBase, ref(exForaDoDraft, 99))).toBeNull();
  });
});

describe('findActiveSet / findNextPendingSet — regra canônica exercicioForaDeJogo (WR-01)', () => {
  const makeExercicio = (
    exerciseId: string,
    name: string,
    sets: Array<{ setOrder: number; status: 'pending' | 'active' | 'done' }>,
    overrides: Partial<DraftExercise> = {},
  ): DraftExercise => ({
    exerciseId,
    name,
    order: 1,
    metric: 'carga_reps',
    equipment: 'Barra',
    isBodyweight: false,
    hasInjury: false,
    loadIncrementKg: 2.5,
    restSeconds: 90,
    priority: 'primary',
    targetRmPercent: null,
    repsRaw: null,
    sets: sets.map((s) => ({
      plannedSetId: `${exerciseId}-set-${s.setOrder}`,
      setOrder: s.setOrder,
      targetRepsMin: 8,
      targetRepsMax: 10,
      targetLoadKg: 40,
      targetRir: 2,
      actualReps: null,
      actualLoadKg: null,
      actualRir: null,
      status: s.status,
      outcome: null,
      setLogId: null,
      adaptation: null,
      activatedAt: null,
      completedAt: null,
    })),
    ...overrides,
  });

  it('findActiveSet ignora série active de exercício skippedByUser e acha a próxima active elegível', () => {
    const exRecusado = makeExercicio('ex-recusado', 'Supino reto', [{ setOrder: 1, status: 'active' }], {
      skippedByUser: true,
    });
    const exElegivel = makeExercicio('ex-elegivel', 'Remada curvada', [{ setOrder: 1, status: 'active' }]);
    const draft = { exercises: [exRecusado, exElegivel] } as any;

    expect(findActiveSet(draft)).toEqual({ exercise: exElegivel, set: exElegivel.sets[0] });
  });

  it('findActiveSet devolve null quando a única série active pertence a exercício skippedByUser', () => {
    const exRecusado = makeExercicio('ex-recusado', 'Supino reto', [{ setOrder: 1, status: 'active' }], {
      skippedByUser: true,
    });
    const draft = { exercises: [exRecusado] } as any;

    expect(findActiveSet(draft)).toBeNull();
  });

  it('findNextPendingSet ignora pending de exercício skippedByUser e devolve a próxima pendente elegível', () => {
    const exRecusado = makeExercicio('ex-recusado', 'Supino reto', [{ setOrder: 1, status: 'pending' }], {
      skippedByUser: true,
    });
    const exElegivel = makeExercicio('ex-elegivel', 'Remada curvada', [{ setOrder: 1, status: 'pending' }]);
    const draft = { exercises: [exRecusado, exElegivel] } as any;

    expect(findNextPendingSet(draft)).toEqual({ exercise: exElegivel, set: exElegivel.sets[0] });
  });

  it('findNextPendingSet devolve null quando a única série pending pertence a exercício skippedByUser', () => {
    const exRecusado = makeExercicio('ex-recusado', 'Supino reto', [{ setOrder: 1, status: 'pending' }], {
      skippedByUser: true,
    });
    const draft = { exercises: [exRecusado] } as any;

    expect(findNextPendingSet(draft)).toBeNull();
  });

  it('regressão: cutByReplan continua ignorado por findActiveSet e findNextPendingSet', () => {
    const exCortadoActive = makeExercicio('ex-cortado-active', 'Corrida', [{ setOrder: 1, status: 'active' }], {
      cutByReplan: true,
    });
    const exCortadoPending = makeExercicio('ex-cortado-pending', 'Bike', [{ setOrder: 1, status: 'pending' }], {
      cutByReplan: true,
    });
    const exElegivel = makeExercicio('ex-elegivel', 'Remada curvada', [
      { setOrder: 1, status: 'active' },
      { setOrder: 2, status: 'pending' },
    ]);
    const draft = { exercises: [exCortadoActive, exCortadoPending, exElegivel] } as any;

    expect(findActiveSet(draft)).toEqual({ exercise: exElegivel, set: exElegivel.sets[0] });
    expect(findNextPendingSet(draft)).toEqual({ exercise: exElegivel, set: exElegivel.sets[1] });
  });
});

describe('canCompleteSet — barreira da primeira carga', () => {
  it('exercício com carga sem kg informado NÃO conclui (pede ao aluno)', () => {
    expect(canCompleteSet({ actualReps: 8, actualLoadKg: null }, false)).toBe(false);
    expect(canCompleteSet({ actualReps: 8, actualLoadKg: 0 }, false)).toBe(false);
  });
  it('exercício com carga conclui quando reps e kg informados', () => {
    expect(canCompleteSet({ actualReps: 8, actualLoadKg: 40 }, false)).toBe(true);
  });
  it('bodyweight conclui só com reps (sem kg)', () => {
    expect(canCompleteSet({ actualReps: 12, actualLoadKg: null }, true)).toBe(true);
  });
  it('sem reps não conclui', () => {
    expect(canCompleteSet({ actualReps: null, actualLoadKg: 40 }, false)).toBe(false);
  });
});

const detalheExemplo: SessionDetail = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 2,
  day_of_week: null,
  order_in_week: 1,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2026-07-20',
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito'],
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 'sess-1',
      exercise_order: 1,
      name: 'Supino Reto',
      muscle_group: 'Peito',
      priority: 'primary',
      equipment: 'Barra',
      load_increment_kg: 2.5,
      rest_seconds: 120,
      target_rm_percent: 75,
      sets_planned: 2,
      reps_raw: '8-10',
      method: null,
      notes: null,
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
    {
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Flexão de Braço',
      muscle_group: 'Peito',
      priority: 'accessory',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: 'AMRAP',
      method: null,
      notes: null,
      planned_sets: [
        { id: 'st-3', exercise_id: 'ex-2', set_order: 1, target_reps_min: 10, target_reps_max: 20, target_load_kg: null, target_rir: 0 },
      ],
    },
  ],
};

describe('buildDraftFromDetail', () => {
  it('mapeia exercícios/séries e marca bodyweight pelo equipamento', () => {
    const draft = buildDraftFromDetail(detalheExemplo, 'user-1');
    expect(draft.plannedSessionId).toBe('sess-1');
    expect(draft.userId).toBe('user-1');
    expect(draft.status).toBe('active');
    expect(draft.sessionLogId).toBeNull();
    expect(draft.exercises).toHaveLength(2);
    expect(draft.exercises[0].isBodyweight).toBe(false); // Barra
    expect(draft.exercises[1].isBodyweight).toBe(true); // Peso corporal
    expect(draft.exercises[0].sets).toHaveLength(2);
    expect(draft.exercises[0].sets[0].status).toBe('pending');
    expect(draft.exercises[0].sets[0].actualReps).toBeNull();
  });

  it('semeia a última carga por exercício quando fornecida', () => {
    const draft = buildDraftFromDetail(detalheExemplo, 'user-1', { 'supino reto': 60 });
    expect(draft.lastLoadByExercise['supino reto']).toBe(60);
  });

  it('coage numeric que vem como STRING do PostgREST (F4)', () => {
    const d: any = {
      ...detalheExemplo,
      planned_exercises: [
        {
          ...detalheExemplo.planned_exercises[0],
          load_increment_kg: '2.5',
          planned_sets: [
            { ...detalheExemplo.planned_exercises[0].planned_sets[0], target_load_kg: '40' },
          ],
        },
      ],
    };
    const draft = buildDraftFromDetail(d, 'user-1');
    expect(draft.exercises[0].loadIncrementKg).toBe(2.5);
    expect(typeof draft.exercises[0].loadIncrementKg).toBe('number');
    expect(draft.exercises[0].sets[0].targetLoadKg).toBe(40);
    // e o stepper funciona com número (não concatena string)
    expect(stepLoad(draft.exercises[0].sets[0].targetLoadKg, draft.exercises[0].loadIncrementKg, 1)).toBe(42.5);
  });

  it('mapeia muscle_group para muscleGroup', () => {
    const draft = buildDraftFromDetail(detalheExemplo, 'user-1');
    expect(draft.exercises[0].muscleGroup).toBe('Peito');
    expect(draft.exercises[1].muscleGroup).toBe('Peito');
  });
});

// Cronômetro de isometria (prancha e afins): tempo + grupo fora de
// Mobilidade/Cardio. Sem grupo conhecido (legado/incompleto) o cronômetro é
// um assistente inofensivo — nunca escondido por precaução.
describe('isIsometricHold', () => {
  it('tempo + grupo fora de Mobilidade/Cardio (ex.: Abdômen) => true', () => {
    expect(isIsometricHold({ metric: 'tempo', muscleGroup: 'Abdômen' })).toBe(true);
  });
  it('tempo + muscleGroup ausente (null/undefined/omitido) => true', () => {
    expect(isIsometricHold({ metric: 'tempo', muscleGroup: null })).toBe(true);
    expect(isIsometricHold({ metric: 'tempo', muscleGroup: undefined })).toBe(true);
    expect(isIsometricHold({ metric: 'tempo' })).toBe(true);
  });
  it('tempo + Mobilidade (alongamento) => false', () => {
    expect(isIsometricHold({ metric: 'tempo', muscleGroup: 'Mobilidade' })).toBe(false);
  });
  it('tempo + Cardio (Pular Corda, HIIT) => false — decisão do dono', () => {
    expect(isIsometricHold({ metric: 'tempo', muscleGroup: 'Cardio' })).toBe(false);
  });
  it('carga_reps não é isometria mesmo com grupo elegível', () => {
    expect(isIsometricHold({ metric: 'carga_reps', muscleGroup: 'Abdômen' })).toBe(false);
  });
  it('tempo_distancia com grupo elegível também conta como isometria (é tempo-based)', () => {
    expect(isIsometricHold({ metric: 'tempo_distancia', muscleGroup: 'Abdômen' })).toBe(true);
  });
});

describe('toNum — coerção de numeric do PostgREST', () => {
  it('string numérica → number; null/inválido → null', () => {
    expect(toNum('50')).toBe(50);
    expect(toNum('2.5')).toBe(2.5);
    expect(toNum(40)).toBe(40);
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum('abc')).toBeNull();
  });
});

describe('sessionProgress / isSessionComplete', () => {
  it('conta séries feitas e detecta sessão completa', () => {
    const draft = buildDraftFromDetail(detalheExemplo, 'user-1');
    expect(sessionProgress(draft)).toEqual({ done: 0, total: 3 });
    expect(isSessionComplete(draft)).toBe(false);

    draft.exercises.forEach((ex) => ex.sets.forEach((s) => (s.status = 'done')));
    expect(sessionProgress(draft)).toEqual({ done: 3, total: 3 });
    expect(isSessionComplete(draft)).toBe(true);
  });
});

describe('sessionProgress com exercício cortado por tempo (Fase 6)', () => {
  it('séries PENDENTES de exercício cortado saem da conta; as feitas continuam', () => {
    const draft = buildDraftFromDetail(detalheExemplo, 'user-1');
    // 3 séries no total; marca a 1ª do 1º exercício como feita e corta esse exercício
    draft.exercises[0].sets[0].status = 'done';
    draft.exercises[0].cutByReplan = true;
    const progresso = sessionProgress(draft);
    // a série feita conta; as pendentes do exercício cortado não seguram a conclusão
    expect(progresso.done).toBe(1);
    const pendentesForaDoCorte = draft.exercises
      .filter((ex) => ex.cutByReplan !== true)
      .reduce((n, ex) => n + ex.sets.length, 0);
    expect(progresso.total).toBe(1 + pendentesForaDoCorte);

    // completa o resto (fora do corte) → sessão é considerada completa
    draft.exercises
      .filter((ex) => ex.cutByReplan !== true)
      .forEach((ex) => ex.sets.forEach((s) => (s.status = 'done')));
    expect(isSessionComplete(draft)).toBe(true);
  });
});
