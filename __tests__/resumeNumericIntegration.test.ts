// __tests__/resumeNumericIntegration.test.ts
// Fase 4.1 — RETOMADA de verdade, ponta a ponta (repo REAL + store REAL + modelo
// REAL; só o cliente Supabase é mockado), com actual_load_kg vindo como STRING
// "50" — do jeito que o PostgREST devolve numeric. Prova que o stepper opera como
// NÚMERO após retomar (52.5), e não concatena string ("502.5") nem gera NaN.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  loadDraft: jest.fn(async () => null), // sem rascunho local → reconstrói do servidor
  saveDraft: jest.fn(async () => undefined),
  clearDraft: jest.fn(async () => undefined),
}));

import { supabase } from '../src/config/supabaseClient';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';

const fromMock = supabase.from as jest.Mock;

const builder = (result: { data?: unknown; error: unknown }) => {
  const b: any = {};
  const chain = () => b;
  ['select', 'eq', 'is', 'not', 'order', 'limit'].forEach((m) => (b[m] = jest.fn(chain)));
  b.single = () => Promise.resolve(result);
  b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  return b;
};

const detail: SessionDetail = {
  id: 'sess-1', plan_id: 'plan-1', user_id: 'user-1', week_number: 1, day_of_week: null,
  order_in_week: 1, title: 'Push A', session_type: null, scheduled_date: null,
  estimated_minutes: 60, status: 'in_progress', muscle_groups: ['Peito'],
  planned_exercises: [
    {
      id: 'ex-1', session_id: 'sess-1', exercise_order: 1, name: 'Supino Reto', muscle_group: 'Peito',
      priority: 'primary', equipment: 'Barra', load_increment_kg: 2.5, rest_seconds: 90,
      target_rm_percent: 75, sets_planned: 2, reps_raw: '8-10', method: null, notes: null,
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
  ],
};

const store = () => useActiveSessionStore.getState();

it('retoma do servidor com actual_load_kg="50" (string) e o stepper dá 52.5, não "502.5"', async () => {
  useActiveSessionStore.setState({ draft: null, status: 'idle', saveError: null });
  fromMock.mockReset();

  fromMock
    // 1) seedLastLoads → getLastLoadByExerciseName (set_logs): sem histórico
    .mockReturnValueOnce(builder({ data: [], error: null }))
    // 2) getOpenSessionLog → session_logs: existe log aberto
    .mockReturnValueOnce(builder({ data: [{ id: 'sl-1', started_at: 'T0' }], error: null }))
    // 3) getOpenSessionLog → set_logs: série 1 feita, carga como STRING do PostgREST
    .mockReturnValueOnce(
      builder({
        data: [
          { id: 'setlog-1', planned_set_id: 'st-1', actual_reps: 8, actual_load_kg: '50', actual_rir: 2, outcome: 'on_target' },
        ],
        error: null,
      }),
    );

  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });

  expect(store().status).toBe('active');
  // série 1 retomada: carga é NÚMERO 50 (coagida no repositório)
  const s1 = store().draft!.exercises[0].sets[0];
  expect(s1.status).toBe('done');
  expect(s1.actualLoadKg).toBe(50);
  expect(typeof s1.actualLoadKg).toBe('number');

  // série 2 (pendente): ativa e usa o stepper a partir da sugestão semeada (50)
  store().activateSet('ex-1', 2);
  store().stepLoad('ex-1', 2, 1);
  const s2 = store().draft!.exercises[0].sets[1];
  expect(s2.actualLoadKg).toBe(52.5); // NÃO "502.5", NÃO NaN
  expect(typeof s2.actualLoadKg).toBe('number');
});
