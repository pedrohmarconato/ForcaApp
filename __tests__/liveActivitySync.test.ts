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

import {
  startLiveActivity,
  updateLiveActivity,
} from '../modules/live-activity';
import { initLiveActivitySync } from '../src/native/liveActivitySync';
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
      ],
    },
  ],
  lastLoadByExercise: {},
});

const mockStart = startLiveActivity as jest.Mock;
const mockUpdate = updateLiveActivity as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.setState({ draft: null, status: 'idle' });
  mockStart.mockResolvedValue(true);
  mockUpdate.mockResolvedValue(true);
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

    useActiveSessionStore.setState({
      status: 'active',
      draft: { ...current, restEndsAt: '2026-08-16T12:01:30.000Z' },
    });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'resting', restEndsAt: '2026-08-16T12:01:30.000Z' }),
    );

    stop();
  });
});
