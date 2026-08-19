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
const mockAck = jest.fn();
jest.mock(
  '../modules/live-activity',
  () => ({
    subscribeLiveActivityIntentAction: (...args: unknown[]) => mockSubscribe(...args),
    ackQueuedLiveActivityIntent: (...args: unknown[]) => mockAck(...args),
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
  lastRepsByExercise: {},
});

const mockGetState = useActiveSessionStore.getState as jest.Mock;

let completeSet: jest.Mock;
let activateSet: jest.Mock;
let adjustRest: jest.Mock;
let stepLoad: jest.Mock;
let stepReps: jest.Mock;

const setDraft = (value: ReturnType<typeof draft> | null): void => {
  mockGetState.mockReturnValue({
    draft: value,
    completeSet,
    activateSet,
    adjustRest,
    stepLoad,
    stepReps,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  completeSet = jest.fn();
  activateSet = jest.fn();
  adjustRest = jest.fn();
  stepLoad = jest.fn();
  stepReps = jest.fn();
});

const getHandler = (): ((event: unknown) => void) => {
  registerLiveActivityIntentListener();
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  return mockSubscribe.mock.calls[0]![0] as (event: unknown) => void;
};

describe('liveActivityIntentBridge', () => {
  it('completeSet com série ativa presente chama completeSet com a série ativa e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'completeSet', id: 'evt-1' });

    expect(completeSet).toHaveBeenCalledWith('ex-1', 1);
    expect(activateSet).not.toHaveBeenCalled();
    expect(mockAck).toHaveBeenCalledWith('evt-1');
  });

  it('completeSet sem série ativa mas com série pendente chama completeSet sobre a próxima pendente e confirma o ack', () => {
    const semAtiva = draft();
    semAtiva.exercises[0]!.sets[0]!.status = 'done';
    setDraft(semAtiva);
    const handler = getHandler();

    handler({ kind: 'completeSet', id: 'evt-2' });

    expect(completeSet).toHaveBeenCalledWith('ex-2', 1);
    expect(mockAck).toHaveBeenCalledWith('evt-2');
  });

  it('completeSet sem série ativa nem pendente (todas concluídas) não chama completeSet nem ackQueuedLiveActivityIntent', () => {
    const semAlvo = draft();
    semAlvo.exercises[0]!.sets[0]!.status = 'done';
    semAlvo.exercises[1]!.sets[0]!.status = 'done';
    setDraft(semAlvo);
    const handler = getHandler();

    handler({ kind: 'completeSet', id: 'evt-x' });

    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('skipRest chama activateSet sobre a série pendente, nunca completeSet, e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'skipRest', id: 'evt-3' });

    expect(activateSet).toHaveBeenCalledWith('ex-2', 1);
    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAck).toHaveBeenCalledWith('evt-3');
  });

  it('skipRest sem série pendente não chama activateSet nem ack', () => {
    const semPendente = draft();
    semPendente.exercises[1]!.sets[0]!.status = 'done';
    setDraft(semPendente);
    const handler = getHandler();

    handler({ kind: 'skipRest', id: 'evt-y' });

    expect(activateSet).not.toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('adjustRest chama adjustRest com o deltaSeconds exato e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'adjustRest', deltaSeconds: -30, id: 'evt-4' });

    expect(adjustRest).toHaveBeenCalledWith(-30);
    expect(mockAck).toHaveBeenCalledWith('evt-4');
  });

  it('draft null não chama nenhuma ação da store nem ack', () => {
    setDraft(null);
    const handler = getHandler();

    handler({ kind: 'completeSet', id: 'evt-5' });
    handler({ kind: 'skipRest', id: 'evt-6' });

    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('adjustLoad com série ativa presente e delta positivo chama stepLoad com direção +1 e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'adjustLoad', deltaLoadKg: 2.5, id: 'evt-7' });

    expect(stepLoad).toHaveBeenCalledWith('ex-1', 1, 1);
    expect(mockAck).toHaveBeenCalledWith('evt-7');
  });

  it('adjustLoad com delta negativo chama stepLoad com direção -1 e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'adjustLoad', deltaLoadKg: -2.5, id: 'evt-8' });

    expect(stepLoad).toHaveBeenCalledWith('ex-1', 1, -1);
    expect(mockAck).toHaveBeenCalledWith('evt-8');
  });

  it('adjustLoad sem série ativa mas com série pendente aplica sobre a próxima pendente e confirma o ack', () => {
    const semAtiva = draft();
    semAtiva.exercises[0]!.sets[0]!.status = 'done';
    setDraft(semAtiva);
    const handler = getHandler();

    handler({ kind: 'adjustLoad', deltaLoadKg: 2.5, id: 'evt-9' });

    expect(stepLoad).toHaveBeenCalledWith('ex-2', 1, 1);
    expect(mockAck).toHaveBeenCalledWith('evt-9');
  });

  it('adjustLoad sem série ativa nem pendente não chama stepLoad nem ack', () => {
    const semAlvo = draft();
    semAlvo.exercises[0]!.sets[0]!.status = 'done';
    semAlvo.exercises[1]!.sets[0]!.status = 'done';
    setDraft(semAlvo);
    const handler = getHandler();

    handler({ kind: 'adjustLoad', deltaLoadKg: 2.5, id: 'evt-z' });

    expect(stepLoad).not.toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('adjustReps com série ativa presente e delta positivo chama stepReps com direção +1 e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'adjustReps', deltaReps: 1, id: 'evt-r1' });

    expect(stepReps).toHaveBeenCalledWith('ex-1', 1, 1);
    expect(mockAck).toHaveBeenCalledWith('evt-r1');
  });

  it('adjustReps com delta negativo chama stepReps com direção -1 e confirma o ack', () => {
    setDraft(draft());
    const handler = getHandler();

    handler({ kind: 'adjustReps', deltaReps: -1, id: 'evt-r2' });

    expect(stepReps).toHaveBeenCalledWith('ex-1', 1, -1);
    expect(mockAck).toHaveBeenCalledWith('evt-r2');
  });

  it('adjustReps sem série ativa mas com série pendente aplica sobre a próxima pendente e confirma o ack', () => {
    const semAtiva = draft();
    semAtiva.exercises[0]!.sets[0]!.status = 'done';
    setDraft(semAtiva);
    const handler = getHandler();

    handler({ kind: 'adjustReps', deltaReps: 1, id: 'evt-r3' });

    expect(stepReps).toHaveBeenCalledWith('ex-2', 1, 1);
    expect(mockAck).toHaveBeenCalledWith('evt-r3');
  });

  it('adjustReps sem série ativa nem pendente não chama stepReps nem ack', () => {
    const semAlvo = draft();
    semAlvo.exercises[0]!.sets[0]!.status = 'done';
    semAlvo.exercises[1]!.sets[0]!.status = 'done';
    setDraft(semAlvo);
    const handler = getHandler();

    handler({ kind: 'adjustReps', deltaReps: 1, id: 'evt-r4' });

    expect(stepReps).not.toHaveBeenCalled();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('registerLiveActivityIntentListener chama subscribeLiveActivityIntentAction exatamente uma vez', () => {
    setDraft(draft());
    registerLiveActivityIntentListener();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(typeof mockSubscribe.mock.calls[0]![0]).toBe('function');
  });
});
