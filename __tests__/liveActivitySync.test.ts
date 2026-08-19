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
  getLastStartFailed,
  INACTIVITY_TIMEOUT_MS,
  initLiveActivitySync,
  reconcileOrphanActivities,
  subscribeLiveActivityStartFailure,
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
  lastRepsByExercise: {},
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
  jest.useFakeTimers();
  jest.clearAllMocks();
  useActiveSessionStore.setState({ draft: null, status: 'idle' });
  mockStart.mockResolvedValue(true);
  mockUpdate.mockResolvedValue(true);
  mockEnd.mockResolvedValue(true);
  mockReconcile.mockResolvedValue(false);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
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

  it('inicia a Activity mesmo quando nenhuma série está active (sessão nova ou retomada reconstruída do servidor)', () => {
    // Regressão: bug live-activity-sessao-sumiu. startOrResume reconstrói o
    // rascunho a partir do servidor (applyServerSetLogs) e o status 'active'
    // local nunca é restaurado para a série em andamento — ela volta a
    // 'pending' até o aluno tocar de novo. O card precisa aparecer do mesmo
    // jeito, senão fica ausente pelo resto da sessão (updateActivity não cria
    // Activity nova quando currentActivity é nil no nativo).
    const stop = initLiveActivitySync();
    const draftReconstruido = draft();
    draftReconstruido.exercises[0]!.sets[0]!.status = 'pending';

    useActiveSessionStore.setState({ status: 'active', draft: draftReconstruido });

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'measuring', exerciseName: 'Supino reto', setIndex: 1 }),
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

  it('encerra a Activity após 3h sem update e preserva a sessão no store', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    await flushPromises();

    jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    await flushPromises();

    expect(mockEnd).toHaveBeenCalledWith('immediate');
    expect(useActiveSessionStore.getState()).toMatchObject({
      status: 'active',
      draft: current,
    });

    stop();
  });

  it('D-08: editar só reps/carga/RIR/descanso perto do prazo publica a atualização, mas o timeout ORIGINAL ainda encerra a Activity', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    await flushPromises();

    jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 1);
    const updated = {
      ...current,
      restEndsAt: new Date(Date.now() + 90_000).toISOString(),
    };
    useActiveSessionStore.setState({ status: 'active', draft: updated });
    await flushPromises();

    // A edição publica a atualização necessária...
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // ...mas não adia o prazo: 1ms depois ainda é o instante original.
    expect(mockEnd).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(mockEnd).toHaveBeenCalledWith('immediate');

    stop();
  });

  it('D-08: nova série done da mesma sessão substitui o deadline por três horas a partir da conclusão', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    await flushPromises();

    jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 1);
    const comSerieDone: SessionDraft = {
      ...current,
      exercises: [
        {
          ...current.exercises[0]!,
          sets: current.exercises[0]!.sets.map((s) =>
            s.plannedSetId === 'set-1' ? { ...s, status: 'done' as const } : s,
          ),
        },
      ],
    };
    useActiveSessionStore.setState({ status: 'active', draft: comSerieDone });
    await flushPromises();

    // O prazo original (que venceria em 1ms) foi substituído pela conclusão.
    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(mockEnd).not.toHaveBeenCalled();

    // Passa quase as novas três horas a partir da conclusão: ainda não vence.
    jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 2);
    await flushPromises();
    expect(mockEnd).not.toHaveBeenCalled();

    // No instante exato do novo prazo, encerra.
    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(mockEnd).toHaveBeenCalledWith('immediate');

    stop();
  });

  it('depois do timeout, update=false recria a Activity quando a sessão ainda é a mesma e active', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    await flushPromises();

    jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    await flushPromises();
    expect(mockEnd).toHaveBeenCalledWith('immediate');
    expect(mockStart).toHaveBeenCalledTimes(1);

    mockUpdate.mockResolvedValueOnce(false);
    const updated = {
      ...current,
      restEndsAt: new Date(Date.now() + 90_000).toISOString(),
    };
    useActiveSessionStore.setState({ status: 'active', draft: updated });
    await flushPromises();

    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'resting', restEndsAt: updated.restEndsAt }),
      'log-1',
    );

    stop();
  });

  it('finish antes de update=false resolver impede recriar a Activity de sessão que já terminou', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    await flushPromises();

    jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
    await flushPromises();
    expect(mockEnd).toHaveBeenCalledWith('immediate');
    mockEnd.mockClear();
    mockStart.mockClear();

    let resolveUpdate: ((value: boolean) => void) | undefined;
    mockUpdate.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const updated = {
      ...current,
      restEndsAt: new Date(Date.now() + 90_000).toISOString(),
    };
    useActiveSessionStore.setState({ status: 'active', draft: updated });

    // Sessão termina (draft some no mesmo frame) ANTES do update resolver.
    useActiveSessionStore.setState({ status: 'finished', draft: null });
    resolveUpdate?.(false);
    await flushPromises();

    expect(mockStart).not.toHaveBeenCalled();

    stop();
  });

  // JANELA ABERTA #6 (WINDOWS.md) — este teste DOCUMENTA um defeito, não o
  // aprova. Ele existe para que a correção quebre a suíte de propósito e o
  // conserto seja consciente, não acidental.
  //
  // O que acontece: reset() (activeSessionStore.ts:2286) leva o store de
  // 'active' para 'idle' com draft null. O subscriber abaixo faz early-return
  // nesse caso e endLiveActivity nunca roda — o único call site é
  // publishFinished, alcançável só por status 'finished'. Pior: a saída de
  // 'active' executa clearInactivityTimeout, que remove o único outro
  // mecanismo capaz de encerrar o card.
  //
  // Por que importa: reset() roda dentro de iniciar()
  // (ActiveSessionScreen.tsx:270), a CADA abertura de sessão. Se
  // getSessionDetail falhar (sem rede) ou devolver null, startOrResume nunca
  // roda e o card da sessão anterior fica preso na tela bloqueada mostrando
  // treino velho até o app reiniciar. Isso viola LOCK-03 na letra
  // ("nunca fica presa mostrando treino velho"). A reconciliação de boot NÃO
  // cobre o caso enquanto o app continua aberto.
  //
  // A correção está pendente de decisão do dono porque encerrar no subscriber
  // gera um ciclo end+start a cada abertura de sessão, e o orçamento de
  // start/update da ActivityKit é risco de plataforma já registrado neste
  // projeto, sem fonte oficial da Apple.
  it('JANELA #6 (defeito conhecido): reset() para idle durante active NÃO encerra a Activity — card fica preso até o boot', async () => {
    const stop = initLiveActivitySync();
    const current = draft();
    useActiveSessionStore.setState({ status: 'active', draft: current });
    await flushPromises();
    mockEnd.mockClear();

    // reset() (ActiveSessionScreen.iniciar, roda a cada abertura de sessão)
    // vai direto para status:'idle', draft:null — NÃO passa por 'finished'.
    useActiveSessionStore.setState({ status: 'idle', draft: null });
    await flushPromises();

    // Comportamento ATUAL, indesejado. Ao fechar a janela #6, esta asserção
    // vira expect(mockEnd).toHaveBeenCalled() — a quebra aqui é o sinal.
    expect(mockEnd).not.toHaveBeenCalled();

    stop();
  });

  it('limpa o timeout quando a sessão sai de active por outro caminho', async () => {
    const stop = initLiveActivitySync();
    try {
      const current = draft();
      useActiveSessionStore.setState({ status: 'active', draft: current });
      await flushPromises();

      jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS - 1);
      useActiveSessionStore.setState({ status: 'idle', draft: null });
      jest.advanceTimersByTime(1);
      jest.advanceTimersByTime(INACTIVITY_TIMEOUT_MS);
      await flushPromises();

      expect(mockEnd).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('registra uma falha de start e notifica o observador do aviso', async () => {
    const onFailure = jest.fn();
    const unsubscribe = subscribeLiveActivityStartFailure(onFailure);
    mockStart.mockResolvedValue(false);
    const stop = initLiveActivitySync();

    useActiveSessionStore.setState({ status: 'active', draft: draft() });
    await flushPromises();

    expect(getLastStartFailed()).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);

    unsubscribe();
    stop();
  });
});
