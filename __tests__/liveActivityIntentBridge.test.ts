jest.mock('../src/store/activeSessionStore', () => ({
  useActiveSessionStore: { getState: jest.fn() },
}));

import {
  registerLiveActivityIntentListener,
} from '../src/native/liveActivityIntentBridge';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDraft } from '../src/engine/sessionModel';

// A subscription real do módulo nativo (`subscribeLiveActivityIntentAction`) só
// existe em runtime iOS. Para testar `handleIntentAction` isoladamente, o
// handler é acessado através do listener registrado — mockamos
// `subscribeLiveActivityIntentAction` para capturar a função passada.
const mockSubscribe = jest.fn();
jest.mock(
  '../modules/live-activity',
  () => ({
    subscribeLiveActivityIntentAction: (...args: unknown[]) => mockSubscribe(...args),
  }),
  { virtual: true },
);

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
    {
      exerciseId: 'ex-2',
      name: 'Agachamento',
      order: 2,
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
          plannedSetId: 'set-2',
          setOrder: 1,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetLoadKg: 60,
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

const mockGetState = useActiveSessionStore.getState as jest.Mock;

let completeSet: jest.Mock;
let activateSet: jest.Mock;
let adjustRest: jest.Mock;

const setDraft = (value: ReturnType<typeof draft> | null): void => {
  mockGetState.mockReturnValue({
    draft: value,
    completeSet,
    activateSet,
    adjustRest,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  completeSet = jest.fn();
  activateSet = jest.fn();
  adjustRest = jest.fn();
});

const getHandler = (): ((event: unknown) => void) => {
  registerLiveActivityIntentListener();
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  return mockSubscribe.mock.calls[0]![0] as (event: unknown) => void;
};

describe('liveActivityIntentBridge', () => {
  it('completeSet com série ativa presente chama completeSet com a série ativa', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'completeSet' });

    expect(completeSet).toHaveBeenCalledWith('ex-1', 1);
    expect(activateSet).not.toHaveBeenCalled();
  });

  it('completeSet sem série ativa mas com série pendente chama completeSet sobre a próxima pendente', () => {
    const semAtiva = draft();
    semAtiva.exercises[0]!.sets[0]!.status = 'done';
    setDraft(semAtiva);
    const handler = getHandler();

    handler({ kind: 'completeSet' });

    expect(completeSet).toHaveBeenCalledWith('ex-2', 1);
  });

  it('skipRest chama activateSet sobre a série pendente, nunca completeSet', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'skipRest' });

    expect(activateSet).toHaveBeenCalledWith('ex-2', 1);
    expect(completeSet).not.toHaveBeenCalled();
  });

  it('adjustRest chama adjustRest com o deltaSeconds exato', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'adjustRest', deltaSeconds: -30 });

    expect(adjustRest).toHaveBeenCalledWith(-30);
  });

  it('draft null não chama nenhuma ação da store', () => {
    setDraft(null);
    const handler = getHandler();

    handler({ kind: 'completeSet' });
    handler({ kind: 'skipRest' });

    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
  });

  it('registerLiveActivityIntentListener chama subscribeLiveActivityIntentAction exatamente uma vez', () => {
    setDraft(draft());
    registerLiveActivityIntentListener();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(typeof mockSubscribe.mock.calls[0]![0]).toBe('function');
  });
});
