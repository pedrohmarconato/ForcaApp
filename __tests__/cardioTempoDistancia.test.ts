// __tests__/cardioTempoDistancia.test.ts
// Cardio e isometria (migration 0014). Cada teste reproduz um defeito REAL do
// plano gerado em homologação:
// - "20min" era parseado como 20 REPETIÇÕES e o player pedia "quantas reps?"
// - o motor de adaptação de CARGA opinava sobre uma caminhada
// - a retomada descartava séries de cardio (filtro exigia actual_reps)
// - não havia onde registrar tempo, distância nem pace

// formatExerciseTarget vive no repositório de leitura, que importa o cliente
// Supabase real (e com ele o AsyncStorage nativo) — mockado como nas demais suítes.
jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(error: any, options: { kind?: 'transport' | 'server' } = {}) {
      super(error?.message ?? String(error));
      this.kind = options.kind ?? 'server';
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    startSessionLog: jest.fn(),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(),
    getOpenSessionLog: jest.fn(),
    getLastLoadByExercise: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: () => false,
  };
});
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

import {
  startSessionLog,
  saveSetLog,
  getOpenSessionLog,
  getLastLoadByExercise,
} from '../src/services/sessionExecutionRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import {
  buildDraftFromDetail,
  canCompleteSet,
  computeCardioOutcome,
  formatDistance,
  formatDuration,
  formatPace,
  isTimeBased,
  metricOf,
  paceSecondsPerKm,
} from '../src/engine/sessionModel';
import { alvoDaSerie } from '../src/components/session/SessionPlayer';
import {
  formatExerciseTarget,
  type SessionDetail,
} from '../src/services/trainingRepository';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const detalheComCardio = (): SessionDetail => ({
  id: 'sess-c',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Sexta: Cardio + Core',
  session_type: 'Cardio',
  scheduled_date: '2026-07-24',
  estimated_minutes: 35,
  status: 'pending',
  muscle_groups: ['Cardio'],
  planned_exercises: [
    {
      id: 'ex-cardio',
      session_id: 'sess-c',
      exercise_order: 1,
      name: 'Caminhada',
      exercise_key: 'caminhada',
      metric: 'tempo_distancia',
      muscle_group: 'Cardio',
      priority: 'primary',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: null,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '25min',
      method: null,
      notes: '100-110 bpm.',
      planned_sets: [
        {
          id: 'st-c1',
          exercise_id: 'ex-cardio',
          set_order: 1,
          target_reps_min: null,
          target_reps_max: null,
          target_load_kg: null,
          target_rir: null,
          target_duration_seconds: 1500,
          target_distance_m: 3000,
        },
      ],
    },
    {
      id: 'ex-prancha',
      session_id: 'sess-c',
      exercise_order: 2,
      name: 'Prancha',
      exercise_key: 'prancha',
      metric: 'tempo',
      muscle_group: 'Abdômen',
      priority: 'accessory',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '45s',
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-p1',
          exercise_id: 'ex-prancha',
          set_order: 1,
          target_reps_min: null,
          target_reps_max: null,
          target_load_kg: null,
          target_rir: null,
          target_duration_seconds: 45,
          target_distance_m: null,
        },
      ],
    },
  ],
});

describe('pace: derivado, nunca inventado', () => {
  it('30 min em 5 km = 6:00 /km', () => {
    expect(paceSecondsPerKm(1800, 5000)).toBe(360);
    expect(formatPace(360)).toBe('6:00 /km');
  });

  it('arredonda para o segundo na exibição', () => {
    expect(formatPace(paceSecondsPerKm(1500, 4030))).toBe('6:12 /km');
  });

  it('sem distância NÃO há pace — devolve null e exibe "—"', () => {
    expect(paceSecondsPerKm(1800, null)).toBeNull();
    expect(paceSecondsPerKm(1800, 0)).toBeNull();
    expect(formatPace(null)).toBe('—');
  });

  it('sem duração também não há pace', () => {
    expect(paceSecondsPerKm(null, 5000)).toBeNull();
    expect(paceSecondsPerKm(0, 5000)).toBeNull();
  });

  it('formata duração e distância de forma legível', () => {
    expect(formatDuration(1500)).toBe('25:00');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDistance(5000)).toBe('5 km');
    expect(formatDistance(3500)).toBe('3,5 km');
    expect(formatDistance(null)).toBe('—');
  });
});

describe('métrica do exercício', () => {
  it('cardio e isometria são medidos por tempo; musculação não', () => {
    expect(isTimeBased('tempo_distancia')).toBe(true);
    expect(isTimeBased('tempo')).toBe(true);
    expect(isTimeBased('carga_reps')).toBe(false);
  });

  it('plano anterior à 0014 (sem metric) é tratado como carga × repetição', () => {
    expect(metricOf({ metric: undefined })).toBe('carga_reps');
    expect(metricOf({ metric: null })).toBe('carga_reps');
  });
});

describe('conclusão da série de cardio', () => {
  it('sem tempo informado NÃO conclui', () => {
    expect(
      canCompleteSet(
        { actualReps: null, actualLoadKg: null, actualDurationSeconds: null },
        true,
        'tempo_distancia',
      ),
    ).toBe(false);
  });

  it('com tempo conclui MESMO sem distância (bike sem hodômetro)', () => {
    expect(
      canCompleteSet(
        { actualReps: null, actualLoadKg: null, actualDurationSeconds: 1200 },
        true,
        'tempo_distancia',
      ),
    ).toBe(true);
  });

  it('musculação segue exigindo reps e carga', () => {
    expect(
      canCompleteSet(
        { actualReps: 8, actualLoadKg: null, actualDurationSeconds: null },
        false,
        'carga_reps',
      ),
    ).toBe(false);
    expect(
      canCompleteSet(
        { actualReps: 8, actualLoadKg: 40, actualDurationSeconds: null },
        false,
        'carga_reps',
      ),
    ).toBe(true);
  });
});

describe('outcome de cardio (por duração, com tolerância)', () => {
  it('bem abaixo do alvo = under', () => {
    expect(computeCardioOutcome(900, 1500)).toBe('under');
  });
  it('dentro da tolerância de 10% = on_target', () => {
    expect(computeCardioOutcome(1400, 1500)).toBe('on_target');
    expect(computeCardioOutcome(1600, 1500)).toBe('on_target');
  });
  it('bem acima = over', () => {
    expect(computeCardioOutcome(1900, 1500)).toBe('over');
  });
  it('sem alvo não inventa meta: qualquer execução é on_target', () => {
    expect(computeCardioOutcome(600, null)).toBe('on_target');
  });
});

describe('alvo exibido na tela', () => {
  it('cardio mostra tempo e distância — NUNCA "reps"', () => {
    const draft = buildDraftFromDetail(detalheComCardio(), 'user-1');
    const caminhada = draft.exercises[0];
    const texto = alvoDaSerie(caminhada, caminhada.sets[0]);
    expect(texto).toContain('25:00');
    expect(texto).toContain('3 km');
    expect(texto).not.toMatch(/REPS/i);
  });

  it('isometria mostra só o tempo', () => {
    const draft = buildDraftFromDetail(detalheComCardio(), 'user-1');
    const prancha = draft.exercises[1];
    expect(alvoDaSerie(prancha, prancha.sets[0])).toBe('0:45');
  });

  it('musculação continua em reps', () => {
    const draft = buildDraftFromDetail(detalheComCardio(), 'user-1');
    const falsoMusculacao = {
      ...draft.exercises[0],
      metric: 'carga_reps' as const,
    };
    const serie = { ...draft.exercises[0].sets[0], targetRepsMin: 8, targetRepsMax: 12 };
    expect(alvoDaSerie(falsoMusculacao, serie)).toBe('8–12 REPS');
  });
});

describe('store: registrar um cardio de verdade', () => {
  const store = () => useActiveSessionStore.getState();

  beforeEach(async () => {
    jest.clearAllMocks();
    useActiveSessionStore.setState({ draft: null, status: 'idle', saveError: null });
    mock(getLastLoadByExercise).mockResolvedValue({});
    mock(getOpenSessionLog).mockResolvedValue(null);
    mock(startSessionLog).mockResolvedValue({
      sessionLogId: 'sl-c',
      startedAt: '2026-07-24T10:00:00Z',
    });
    await store().startOrResume({
      sessionId: 'sess-c',
      userId: 'user-1',
      detail: detalheComCardio(),
    });
    const st = store();
    if (st.status === 'awaiting_checkin') {
      await st.confirmCheckIn({ mood: 'normal', availableMinutes: null });
    }
  });

  it('grava duração, distância e esforço — e NÃO manda reps nem carga', async () => {
    mock(saveSetLog).mockResolvedValue({
      setLogId: 'log-1',
      actualReps: null,
      actualLoadKg: null,
      actualRir: null,
      outcome: 'on_target',
      actualDurationSeconds: 1500,
      actualDistanceM: 3200,
      paceSecondsPerKm: 468.75,
      perceivedEffort: 'moderado',
    });

    store().activateSet('ex-cardio', 1);
    store().setDuration('ex-cardio', 1, 1500);
    store().setDistance('ex-cardio', 1, 3200);
    store().setEffort('ex-cardio', 1, 'moderado');
    const ok = await store().completeSet('ex-cardio', 1);

    expect(ok).toBe(true);
    const enviado = mock(saveSetLog).mock.calls[0][0];
    expect(enviado).toMatchObject({
      plannedSetId: 'st-c1',
      actualReps: null,
      actualLoadKg: null,
      actualDurationSeconds: 1500,
      actualDistanceM: 3200,
      perceivedEffort: 'moderado',
    });
    // RIR é vocabulário de musculação: não vai junto do cardio.
    expect(enviado.actualRir).toBeNull();

    const serie = store().draft!.exercises[0].sets[0];
    expect(serie.status).toBe('done');
    expect(serie.actualDurationSeconds).toBe(1500);
    expect(serie.actualDistanceM).toBe(3200);
  });

  it('não conclui sem tempo e diz por quê', async () => {
    store().activateSet('ex-cardio', 1);
    const ok = await store().completeSet('ex-cardio', 1);
    expect(ok).toBe(false);
    expect(store().saveError).toMatch(/tempo/i);
    expect(saveSetLog).not.toHaveBeenCalled();
  });

  it('o motor de CARGA não opina sobre uma caminhada', async () => {
    // Duração muito abaixo do alvo: em musculação isso abriria a proposta de
    // ajuste de carga. Em cardio não há carga para ajustar.
    mock(saveSetLog).mockResolvedValue({
      setLogId: 'log-2',
      actualReps: null,
      actualLoadKg: null,
      actualRir: null,
      outcome: 'under',
      actualDurationSeconds: 600,
      actualDistanceM: null,
      paceSecondsPerKm: null,
      perceivedEffort: null,
    });

    store().activateSet('ex-cardio', 1);
    store().setDuration('ex-cardio', 1, 600);
    await store().completeSet('ex-cardio', 1);

    expect(store().pendingAdaptation).toBeNull();
  });

  it('distância de exercício só-tempo (prancha) não é enviada', async () => {
    mock(saveSetLog).mockResolvedValue({
      setLogId: 'log-3',
      actualReps: null,
      actualLoadKg: null,
      actualRir: null,
      outcome: 'on_target',
      actualDurationSeconds: 45,
      actualDistanceM: null,
      paceSecondsPerKm: null,
      perceivedEffort: null,
    });

    store().activateSet('ex-prancha', 1);
    store().setDuration('ex-prancha', 1, 45);
    store().setDistance('ex-prancha', 1, 999);
    await store().completeSet('ex-prancha', 1);

    expect(mock(saveSetLog).mock.calls[0][0].actualDistanceM).toBeNull();
  });

  it('valor inválido de duração vira null, não zero (CHECK do banco)', () => {
    store().activateSet('ex-cardio', 1);
    store().setDuration('ex-cardio', 1, 0);
    expect(store().draft!.exercises[0].sets[0].actualDurationSeconds).toBeNull();
    store().setDuration('ex-cardio', 1, -30);
    expect(store().draft!.exercises[0].sets[0].actualDurationSeconds).toBeNull();
  });
});

describe('resumo do exercício na lista do treino', () => {
  it('cardio não mostra "null reps" — mostra tempo e distância', () => {
    const [caminhada] = detalheComCardio().planned_exercises;
    expect(formatExerciseTarget(caminhada)).toBe('25 min · 3 km');
  });

  it('isometria com várias séries mostra séries × tempo', () => {
    const prancha = {
      ...detalheComCardio().planned_exercises[1],
      sets_planned: 3,
    };
    expect(formatExerciseTarget(prancha)).toBe('3 séries × 45s');
  });

  it('musculação continua em reps', () => {
    const musculacao = {
      ...detalheComCardio().planned_exercises[0],
      metric: 'carga_reps' as const,
      sets_planned: 3,
      reps_raw: '8-12',
      planned_sets: [
        {
          id: 'st-m',
          exercise_id: 'ex-m',
          set_order: 1,
          target_reps_min: 8,
          target_reps_max: 12,
          target_load_kg: null,
          target_rir: null,
        },
      ],
    };
    expect(formatExerciseTarget(musculacao)).toBe('3 séries × 8-12 reps');
  });
});
