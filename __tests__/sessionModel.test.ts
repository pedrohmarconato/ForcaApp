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
} from '../src/engine/sessionModel';
import type { SessionDetail } from '../src/services/trainingRepository';

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
