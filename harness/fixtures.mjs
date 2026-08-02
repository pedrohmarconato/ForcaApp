// harness/fixtures.mjs
// Fixtures determinísticas do harness visual (SEM credenciais de produção).
// O stub server devolve estes dados pelos endpoints Supabase (Auth + PostgREST +
// RPC) para a app REAL renderizar a sessão de treinamento de ponta a ponta.

export const USER = {
  id: 'user-1',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@forca.app',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: { full_name: 'Atleta Demo' },
};

export const PROFILE = {
  id: 'user-1',
  full_name: 'Atleta Demo',
  onboarding_completed: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export const TRAINING_PLAN = {
  id: 'plan-1',
  user_id: 'user-1',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
};

// Sessão planejada que a Home escolhe como "primeira pendente".
export const PLANNED_SESSION = {
  id: 'sess-v1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2026-08-01',
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito', 'Ombro', 'Tríceps'],
  skip_reason: null,
  skip_note: null,
  skipped_at: null,
  skip_source: null,
};

// Detalhe completo (exercícios + séries) — o que o getSessionDetail devolve.
const ST = (id, order, min, max, loadKg = null, rir = 2) => ({
  id,
  exercise_id: null, // preenchido pelo mapeador abaixo
  set_order: order,
  target_reps_min: min,
  target_reps_max: max,
  target_load_kg: loadKg,
  target_rir: rir,
  target_duration_seconds: null,
  target_distance_m: null,
});

export const SESSION_DETAIL = {
  ...PLANNED_SESSION,
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 'sess-v1',
      exercise_order: 1,
      name: 'Supino Reto',
      exercise_key: 'supino-reto',
      name_original: null,
      metric: 'carga_reps',
      muscle_group: 'Peito',
      priority: 'primary',
      equipment: 'Barra',
      load_increment_kg: 2.5,
      rest_seconds: 90,
      target_rm_percent: 75,
      sets_planned: 2,
      reps_raw: '8-10',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        ST('st-1', 1, 8, 10, 40),
        ST('st-2', 2, 8, 10, 40),
      ].map((s) => ({ ...s, exercise_id: 'ex-1' })),
    },
    {
      id: 'ex-2',
      session_id: 'sess-v1',
      exercise_order: 2,
      name: 'Puxada Alta',
      exercise_key: 'puxada-alta',
      name_original: null,
      metric: 'carga_reps',
      muscle_group: 'Costas',
      priority: 'secondary',
      equipment: 'Polia',
      load_increment_kg: 2.5,
      rest_seconds: 75,
      target_rm_percent: 70,
      sets_planned: 2,
      reps_raw: '10-12',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        ST('st-3', 1, 10, 12, 35),
        ST('st-4', 2, 10, 12, 35),
      ].map((s) => ({ ...s, exercise_id: 'ex-2' })),
    },
    {
      id: 'ex-3',
      session_id: 'sess-v1',
      exercise_order: 3,
      name: 'Elevação Lateral',
      exercise_key: 'elevacao-lateral',
      name_original: null,
      metric: 'carga_reps',
      muscle_group: 'Ombro',
      priority: 'accessory',
      equipment: 'Halteres',
      load_increment_kg: 1,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '12-15',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [ST('st-5', 1, 12, 15, 8)].map((s) => ({ ...s, exercise_id: 'ex-3' })),
    },
    {
      id: 'ex-4',
      session_id: 'sess-v1',
      exercise_order: 4,
      name: 'Tríceps Corda',
      exercise_key: 'triceps-corda',
      name_original: null,
      metric: 'carga_reps',
      muscle_group: 'Tríceps',
      priority: 'accessory',
      equipment: 'Polia',
      load_increment_kg: 1,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '12-15',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [ST('st-6', 1, 12, 15, 12)].map((s) => ({ ...s, exercise_id: 'ex-4' })),
    },
  ],
};

// Execução em aberto (retomada): série 1 feita, exercício ex-4 recusado, ex-3
// cortado por replan (adherence_snapshot com timeCut).
export const OPEN_SESSION_LOG = {
  id: 'log-1',
  user_id: 'user-1',
  planned_session_id: 'sess-v1',
  started_at: '2026-08-01T10:00:00Z',
  finished_at: null,
  available_minutes: null,
  mood: 'normal',
  adherence_snapshot: {
    version: 1,
    events: [
      {
        confirmedAtISO: '2026-08-01T09:55:00Z',
        planId: 'plan-1',
        weekNumber: 1,
        adherence: {
          sessionsDue: 1,
          sessionsCompleted: 0,
          sessionRate: 0,
          setsDue: 7,
          setsCompleted: 1,
          volumeRate: 0.14,
        },
        redistribution: null,
        timeCut: {
          sessionId: 'sess-v1',
          availableMinutes: 40,
          estimatedMinutes: 60,
          keptPriorities: ['primary', 'secondary'],
          cutExercises: [
            { exerciseId: 'ex-3', name: 'Elevação Lateral', setsCut: 1 },
          ],
        },
      },
    ],
  },
  set_logs: [
    {
      id: 'sl-1',
      planned_set_id: 'st-1',
      actual_reps: 8,
      actual_load_kg: 40,
      actual_rir: 2,
      actual_duration_seconds: null,
      actual_distance_m: null,
      perceived_effort: null,
      outcome: 'on_target',
      adaptation: null,
      completed_at: '2026-08-01T10:12:00Z',
    },
  ],
  exercise_skips: [
    { planned_exercise_id: 'ex-4', reason: 'nao_gosto', note: null },
  ],
};

// Histórico (Home "Última sessão" / semana): uma sessão concluída com o MESMO
// título do destaque — exercita o gatilho de repetição na Home.
export const COMPLETED_LOG = {
  id: 'log-0',
  user_id: 'user-1',
  planned_session_id: 'sess-antiga',
  started_at: '2026-07-29T10:00:00Z',
  finished_at: '2026-07-29T11:00:00Z',
  planned_sessions: {
    title: 'Push A',
    week_number: 0,
    muscle_groups: ['Peito', 'Ombro', 'Tríceps'],
  },
};

export const SET_LOG_ECHO = (body) => ({
  id: `sl-${body.p_planned_set_id}`,
  actual_reps: body.p_actual_reps,
  actual_load_kg: body.p_actual_load_kg,
  actual_rir: body.p_actual_rir,
  actual_duration_seconds: body.p_actual_duration_seconds,
  actual_distance_m: body.p_actual_distance_m,
  perceived_effort: body.p_perceived_effort,
  outcome: body.p_outcome,
  pace_seconds_per_km: null,
});
