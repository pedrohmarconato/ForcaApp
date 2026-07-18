// __tests__/adaptationFlow.test.ts
// Fase 5 — fluxo no store: concluir uma série FORA do alvo levanta uma adaptação
// pendente; resolver aplica o efeito à próxima série e grava a escolha (best-effort),
// sem nunca aplicar sem a decisão do aluno.

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(error: any, options: { kind?: 'transport' | 'server'; status?: number } = {}) {
      super(error?.message ?? String(error));
      this.kind = options.kind ?? (options.status === 0 ? 'transport' : 'server');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    startSessionLog: jest.fn(),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(),
    getOpenSessionLog: jest.fn(),
    getLastLoadByExerciseName: jest.fn(),
    updateSetLogAdaptation: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (e: unknown) =>
      e instanceof SessionExecutionRequestError && e.kind === 'transport',
  };
});
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

import {
  startSessionLog,
  saveSetLog,
  getOpenSessionLog,
  getLastLoadByExerciseName,
  updateSetLogAdaptation,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const makeDetail = (injuryFlags: string[] = []): SessionDetail => ({
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
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
      rest_seconds: 90,
      target_rm_percent: 75,
      sets_planned: 2,
      reps_raw: '8-10',
      method: null,
      notes: null,
      injury_flags: injuryFlags,
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(loadDraft).mockResolvedValue(null);
  mock(saveDraft).mockResolvedValue(undefined);
  mock(getLastLoadByExerciseName).mockResolvedValue({});
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'log-1', startedAt: '2026-07-20T10:00:00Z' });
  mock(updateSetLogAdaptation).mockResolvedValue(undefined);
  // Echo do que foi enviado (a RPC preserva o outcome que o store calculou).
  mock(saveSetLog).mockImplementation((p: any) =>
    Promise.resolve({
      setLogId: 'sl-1',
      actualReps: p.actualReps,
      actualLoadKg: p.actualLoadKg,
      actualRir: p.actualRir,
      outcome: p.outcome,
    }),
  );
});

const store = () => useActiveSessionStore.getState();

it('série abaixo do alvo levanta pendingAdaptation; on_target não levanta', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

  // dentro do alvo (9 de 8–10) → NÃO incomoda
  store().setReps('ex-1', 1, 9);
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);
  expect(store().pendingAdaptation).toBeNull();

  // abaixo do alvo (5 de 8–10) → levanta a adaptação
  store().setReps('ex-1', 2, 5);
  store().setLoad('ex-1', 2, 50);
  await store().completeSet('ex-1', 2);
  const pending = store().pendingAdaptation;
  expect(pending).not.toBeNull();
  expect(pending!.recommendation.outcome).toBe('under');
  expect(pending!.setLogId).toBe('sl-1');
});

it('resolver aplica o ajuste à próxima série, grava a escolha e limpa o pendente', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

  store().setReps('ex-1', 1, 5); // under → recomenda reduzir carga
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);

  const rec = store().pendingAdaptation!.recommendation.recommended;
  expect(rec.kind).toBe('load'); // há uma sugestão concreta de carga

  await store().resolveAdaptation(rec);

  // aplicou à próxima série (set_order 2)
  const set2 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 2)!;
  if (rec.kind !== 'load') throw new Error('esperava load');
  expect(set2.targetLoadKg).toBe(rec.toKg);
  // registrou a escolha na série concluída (set_order 1)
  const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
  expect(set1.adaptation).toEqual(rec);
  // persistiu no servidor (best-effort) e limpou o pendente
  expect(mock(updateSetLogAdaptation)).toHaveBeenCalledWith('sl-1', rec);
  expect(store().pendingAdaptation).toBeNull();
});

it('recusar (manter) grava a decisão mas NÃO altera o alvo da próxima série', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

  store().setReps('ex-1', 1, 5);
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);

  const keep = store().pendingAdaptation!.recommendation.options.find((o) => o.kind === 'keep')!;
  expect(keep).toBeDefined();
  await store().resolveAdaptation(keep);

  const set2 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 2)!;
  expect(set2.targetLoadKg).toBeNull(); // alvo original preservado (recusa respeitada)
  expect(mock(updateSetLogAdaptation)).toHaveBeenCalledWith('sl-1', keep); // recusa registrada
  expect(store().pendingAdaptation).toBeNull();
});

it('lesão declarada com superávit → recomenda manter → NÃO abre o sheet (sem nag)', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail(['ombro']) });
  store().setReps('ex-1', 1, 12); // acima do alvo 8–10 (superávit)
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);
  // guardrail: lesão nunca sobe carga → recomendação é "manter" → nada a decidir → sem sheet
  expect(store().pendingAdaptation).toBeNull();
});
