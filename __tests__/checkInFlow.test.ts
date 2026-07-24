// __tests__/checkInFlow.test.ts
// Check-in obrigatório pré-treino (decisão do dono, 22/07/2026):
// - Sessão NOVA: startOrResume para em 'awaiting_checkin' e NÃO cria o
//   session_log; confirmCheckIn grava humor+minutos no start_session e só
//   então a sessão vira 'active'.
// - RETOMADA: nunca pergunta de novo — herda o check-in gravado no servidor.

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(
      error: any,
      options: { kind?: 'transport' | 'server'; status?: number } = {},
    ) {
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
    getLastLoadByExercise: jest.fn(),
    updateSetLogAdaptation: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (error: unknown) =>
      error instanceof SessionExecutionRequestError && error.kind === 'transport',
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
  getOpenSessionLog,
  getLastLoadByExercise,
} from '../src/services/sessionExecutionRepository';
import { loadDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const makeDetail = (): SessionDetail => ({
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
      sets_planned: 1,
      reps_raw: '8-10',
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-1',
          exercise_id: 'ex-1',
          set_order: 1,
          target_reps_min: 8,
          target_reps_max: 10,
          target_load_kg: null,
          target_rir: 2,
        },
      ],
    },
  ],
} as unknown as SessionDetail);

const resetStore = () => {
  useActiveSessionStore.getState().reset();
  jest.clearAllMocks();
  mock(loadDraft).mockResolvedValue(null);
  mock(getLastLoadByExercise).mockResolvedValue(new Map());
};

describe('check-in pré-treino — sessão nova', () => {
  beforeEach(resetStore);

  it('para em awaiting_checkin sem criar session_log', async () => {
    mock(getOpenSessionLog).mockResolvedValue(null);

    await useActiveSessionStore.getState().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(useActiveSessionStore.getState().status).toBe('awaiting_checkin');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('confirmCheckIn grava humor e minutos no start_session e ativa a sessão', async () => {
    mock(getOpenSessionLog).mockResolvedValue(null);
    mock(startSessionLog).mockResolvedValue({
      sessionLogId: 'log-1',
      startedAt: '2026-07-22T20:00:00Z',
    });

    const store = useActiveSessionStore.getState();
    await store.startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await useActiveSessionStore.getState().confirmCheckIn({
      mood: 'cansado',
      availableMinutes: 45,
    });

    const s = useActiveSessionStore.getState();
    expect(s.status).toBe('active');
    expect(s.draft?.sessionLogId).toBe('log-1');
    expect(s.sessionMood).toBe('cansado');
    expect(s.checkInMinutes).toBe(45);
    expect(startSessionLog).toHaveBeenCalledWith('sess-1', {
      mood: 'cansado',
      availableMinutes: 45,
    });
  });

  it('tempo cheio viaja como availableMinutes null', async () => {
    mock(getOpenSessionLog).mockResolvedValue(null);
    mock(startSessionLog).mockResolvedValue({
      sessionLogId: 'log-1',
      startedAt: '2026-07-22T20:00:00Z',
    });

    await useActiveSessionStore.getState().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await useActiveSessionStore.getState().confirmCheckIn({
      mood: 'com_energia',
      availableMinutes: null,
    });

    expect(startSessionLog).toHaveBeenCalledWith('sess-1', {
      mood: 'com_energia',
      availableMinutes: null,
    });
    expect(useActiveSessionStore.getState().checkInMinutes).toBeNull();
  });
});

describe('check-in pré-treino — retomada', () => {
  beforeEach(resetStore);

  it('sessão aberta no servidor NÃO pergunta de novo e herda o check-in gravado', async () => {
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'log-aberto',
      startedAt: '2026-07-22T19:00:00Z',
      setLogs: [],
      availableMinutes: 40,
      mood: 'cansado',
      adherenceSnapshot: null,
    });

    await useActiveSessionStore.getState().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    const s = useActiveSessionStore.getState();
    expect(s.status).toBe('active');
    expect(startSessionLog).not.toHaveBeenCalled();
    expect(s.sessionMood).toBe('cansado');
    expect(s.checkInMinutes).toBe(40);
  });
});
