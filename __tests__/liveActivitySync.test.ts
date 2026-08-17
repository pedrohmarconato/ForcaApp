jest.mock(
  '../modules/live-activity',
  () => ({
    startLiveActivity: jest.fn(),
    updateLiveActivity: jest.fn(),
    endLiveActivity: jest.fn(),
    isLiveActivityRunning: jest.fn(),
    reconcileLiveActivityOrphans: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('../src/store/activeSessionStore', () => {
  const { create } = require('zustand');
  return {
    useActiveSessionStore: create(() => ({ draft: null, status: 'idle' })),
  };
});

import {
  endLiveActivity,
  reconcileLiveActivityOrphans,
  startLiveActivity,
  updateLiveActivity,
} from '../modules/live-activity';
import {
  initLiveActivitySync,
  reconcileOrphanActivities,
} from '../src/native/liveActivitySync';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDraft } from '../src/engine/sessionModel';

const draft = (): SessionDraft => ({
  version: 1,
  plannedSessionId: 'session-1',
  sessionLogId: 'log-1',
  userId: 'user-1',
  title: 'Treino A',
  weekNumber: 1,
  startedAt: '2026-08-16T11:00:00.000Z',
  status: 'active',
  restEndsAt: null,
  exercises: [
    {
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
      sets: [
        {
          plannedSetId: 'set-1',
          setOrder: 1,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetLoadKg: 40,
          targetRir: 2,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          status: 'active',
          outcome: null,
          setLogId: null,
          adaptation: null,
          activatedAt: null,
          completedAt: null,
        },
        {
          plannedSetId: 'set-2',
          setOrder: 2,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetLoadKg: 40,
          targetRir: 2,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          status: 'pending',
          outcome: null,
          setLogId: null,
          adaptation: null,
          activatedAt: null,
          completedAt: null,
        },
      ],
    },
  ],
  lastLoadByExercise: {},
});

const mockStart = startLiveActivity as jest.Mock;
const mockUpdate = updateLiveActivity as jest.Mock;
const mockEnd = endLiveActivity as jest.Mock;
const mockReconcile = reconcileLiveActivityOrphans as jest.Mock;

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.setState({ draft: null, status: 'idle' });
  mockStart.mockResolvedValue(true);
  mockUpdate.mockResolvedValue(true);
  mockEnd.mockResolvedValue(true);
  mockReconcile.mockResolvedValue(false);
});

describe('initLiveActivitySync', () => {
  it('inicia uma única Activity quando o status transiciona para active', () => {
    const stop = initLiveActivitySync();

    useActiveSessionStore.setState({ status: 'active', draft: draft() });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'measuring', exerciseName: 'Supino reto' }),
      'log-1',
    );

    stop();
  });

  it('atualiza a Activity quando o draft muda e o status já está active', () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    const restEndsAt = new Date(Date.now() + 90_000).toISOString();

    useActiveSessionStore.setState({
      status: 'active',
      draft: { ...current, restEndsAt },
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'resting', restEndsAt }),
    );

    stop();
  });

  it('termina com resumo e dismissalPolicy afterDate quando o draft sobrevive', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });

    useActiveSessionStore.setState({
      status: 'finished',
      draft: { ...current, status: 'finished' },
    });
    await flushPromises();

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ restEndsAt: null }),
    );
    expect(mockEnd).toHaveBeenCalledWith(
      'afterDate',
      expect.any(Number),
    );
    expect(mockEnd.mock.calls[0][1]).toBeGreaterThanOrEqual(120);
    expect(mockEnd.mock.calls[0][1]).toBeLessThanOrEqual(300);

    stop();
  });

  it('termina imediatamente quando skipWholeSession limpa o draft no mesmo frame', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });

    useActiveSessionStore.setState({ status: 'finished', draft: null });
    await flushPromises();

    expect(mockEnd).toHaveBeenCalledWith('immediate');
    expect(mockUpdate).not.toHaveBeenCalled();

    stop();
  });

  it('não propaga rejeição do encerramento ao cancelar ou terminar', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    mockEnd.mockRejectedValueOnce(new Error('Activity já não existe'));

    expect(() =>
      useActiveSessionStore.setState({ status: 'finished', draft: null }),
    ).not.toThrow();
    await flushPromises();

    expect(mockEnd).toHaveBeenCalledWith('immediate');
    stop();
  });

  it('não sobe uma Activity quando a reconciliação não encontra sessão ativa', async () => {
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    mockReconcile.mockResolvedValue(false);

    await reconcileOrphanActivities();

    expect(mockReconcile).toHaveBeenCalledWith('log-1');
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('sobe o card corrente depois de encerrar órfãos quando a sessão continua ativa', async () => {
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    mockReconcile.mockResolvedValue(true);

    await reconcileOrphanActivities();

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'measuring', exerciseName: 'Supino reto' }),
      'log-1',
    );
  });

  it('não publica a sessão antiga se o sessionLogId mudar durante a reconciliação', async () => {
    let resolveReconcile: ((value: boolean) => void) | undefined;
    mockReconcile.mockImplementation(
      () => new Promise<boolean>((resolve) => {
        resolveReconcile = resolve;
      }),
    );
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });

    const reconciliation = reconcileOrphanActivities();
    useActiveSessionStore.setState({
      status: 'active',
      draft: { ...current, sessionLogId: 'log-2' },
    });
    resolveReconcile?.(true);
    await reconciliation;

    expect(mockStart).not.toHaveBeenCalled();
  });
});
