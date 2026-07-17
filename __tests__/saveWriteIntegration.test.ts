// __tests__/saveWriteIntegration.test.ts
// Fase 4.2 — GRAVAÇÃO de verdade, ponta a ponta (repositório REAL + store REAL +
// modelo REAL; só o cliente Supabase mockado). Fecha o laço do BLOCKER (F1): o store
// chama o repositório REAL, que chama `rpc('save_set_log')` (NÃO mais `.upsert`).
// A RPC devolve a linha do jeito que o PostgREST devolve (numeric como STRING).

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  loadDraft: jest.fn(async () => null), // sem rascunho local → começa fresco
  saveDraft: jest.fn(async () => undefined),
  clearDraft: jest.fn(async () => undefined),
}));

import { supabase } from '../src/config/supabaseClient';
import { useActiveSessionStore, suggestionFor } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';

const fromMock = supabase.from as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;

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
  estimated_minutes: 60, status: 'pending', muscle_groups: ['Peito'],
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

it('completeSet grava via rpc(save_set_log) [não .upsert] e a próxima série sugere a carga como NÚMERO', async () => {
  useActiveSessionStore.setState({ draft: null, status: 'idle', saveError: null });
  fromMock.mockReset();
  rpcMock.mockReset();

  // Leituras (seedLastLoads + getOpenSessionLog) devolvem vazio → começa fresco.
  fromMock.mockReturnValue(builder({ data: [], error: null }));

  rpcMock.mockImplementation((fn: string) => {
    if (fn === 'start_session') {
      return Promise.resolve({ data: { id: 'sl-1', started_at: 'T0' }, error: null });
    }
    if (fn === 'save_set_log') {
      // A função retorna a linha de set_logs; numeric vem como STRING do PostgREST.
      return Promise.resolve({
        data: { id: 'setlog-1', planned_set_id: 'st-1', actual_reps: 8, actual_load_kg: '40', actual_rir: 2, outcome: 'on_target' },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: new Error('rpc inesperada: ' + fn) });
  });

  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
  expect(store().status).toBe('active');
  expect(store().draft?.sessionLogId).toBe('sl-1');

  store().activateSet('ex-1', 1);
  store().setReps('ex-1', 1, 8);
  store().setLoad('ex-1', 1, 40);
  store().setRir('ex-1', 1, 2);
  const ok = await store().completeSet('ex-1', 1);

  expect(ok).toBe(true);
  // O caminho de gravação passou pela RPC certa (não pelo .upsert que dá 42P10).
  expect(rpcMock).toHaveBeenCalledWith('save_set_log', {
    p_session_log_id: 'sl-1', p_planned_set_id: 'st-1', p_actual_reps: 8,
    p_actual_load_kg: 40, p_actual_rir: 2, p_outcome: 'on_target',
  });

  const s1 = store().draft!.exercises[0].sets[0];
  expect(s1.status).toBe('done');
  expect(s1.setLogId).toBe('setlog-1');

  // A 2ª série sugere a carga usada, como NÚMERO (não "40" string).
  const ex = store().draft!.exercises[0];
  const sugestao = suggestionFor(store().draft!, ex, ex.sets[1]);
  expect(sugestao).toBe(40);
  expect(typeof sugestao).toBe('number');
});
