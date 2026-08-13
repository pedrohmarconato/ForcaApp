// __tests__/sessionOutboxDrain.test.ts
// Fase 4 (REQ-07) — orquestrador da fila (único ponto que chama RPC sob
// timeout). Mock de sessionExecutionRepository no molde de
// completeSetAdaptacaoNaoDerruba.test.ts; mock manual de AsyncStorage (Map em
// memória) para exercitar loadOutbox/saveOutbox reais via sessionOutboxStorage.
//
// Cobre os 5 modos de classificação de drainAll (D-04/D-07/D-11/D-13/D-14):
// sucesso remove; transporte retenta com backoff; código definitivo
// quarentena; P0001 descarta a SUB-FILA INTEIRA da sessão (Pitfall 3); código
// desconhecido NUNCA quarentena antes de expirar (Pitfall 2). Mais:
// enqueueAndDrain não aguarda drainAll (D-05); resolução tardia de
// update_set_log_adaptation via getOpenSessionLog (Pitfall 1).

const mockAsyncStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (mockAsyncStore.has(k) ? mockAsyncStore.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    mockAsyncStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockAsyncStore.delete(k);
  }),
}));

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(
      error: any,
      options: { kind?: 'transport' | 'server'; status?: number } = {},
    ) {
      super(error?.message ?? String(error));
      this.name = 'SessionExecutionRequestError';
      this.kind = options.kind ?? (options.status === 0 ? 'transport' : 'server');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    saveSetLog: jest.fn(),
    updateSetLogAdaptation: jest.fn(),
    getOpenSessionLog: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (e: unknown) =>
      e instanceof SessionExecutionRequestError && e.kind === 'transport',
  };
});

import {
  saveSetLog,
  updateSetLogAdaptation,
  getOpenSessionLog,
  SessionExecutionRequestError,
} from '../src/services/sessionExecutionRepository';
import { enqueueItem, enqueueAndDrain, drainAll } from '../src/services/sessionOutboxDrain';
import { loadOutbox, saveOutbox } from '../src/services/sessionOutboxStorage';
import type { SaveSetLogPayload, UpdateSetLogAdaptationPayload } from '../src/services/sessionOutboxDrain';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

beforeEach(() => {
  mockAsyncStore.clear();
  jest.clearAllMocks();
});

const savePayload = (overrides: Partial<SaveSetLogPayload> = {}): SaveSetLogPayload => ({
  sessionLogId: 'log-1',
  plannedSetId: 'st-1',
  actualReps: 8,
  actualLoadKg: 40,
  actualRir: 2,
  outcome: 'on_target',
  ...overrides,
});

const savedRow = (overrides: Record<string, unknown> = {}) => ({
  setLogId: 'sl-1',
  actualReps: 8,
  actualLoadKg: 40,
  actualRir: 2,
  outcome: 'on_target',
  actualDurationSeconds: null,
  actualDistanceM: null,
  paceSecondsPerKm: null,
  perceivedEffort: null,
  completedAt: '2026-08-12T10:00:00.000Z',
  ...overrides,
});

describe('drainAll — classificação de erro (D-14/Pattern 3)', () => {
  it('sucesso remove o item da fila', async () => {
    mock(saveSetLog).mockResolvedValue(savedRow());
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'save_set_log', payload: savePayload() });

    const result = await drainAll('user-1');

    expect(result.pendingCount).toBe(0);
    expect(result.quarantineCount).toBe(0);
    expect(saveSetLog).toHaveBeenCalledTimes(1);
    expect((await loadOutbox('user-1')).items).toHaveLength(0);
  });

  it('erro de TRANSPORTE mantém o item pendente com backoff agendado (nunca quarentena)', async () => {
    mock(saveSetLog).mockRejectedValue(
      new SessionExecutionRequestError(new Error('sem rede'), { status: 0 }),
    );
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'save_set_log', payload: savePayload() });

    const result = await drainAll('user-1');

    expect(result.pendingCount).toBe(1);
    expect(result.quarantineCount).toBe(0);
    const doc = await loadOutbox('user-1');
    expect(doc.items[0].attempts).toBe(1);
    expect(new Date(doc.items[0].nextAttemptAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('código DEFINITIVO (23505 — substituiu P0005 na migration 0037) vai para quarentena e a drenagem segue', async () => {
    const err = Object.assign(new Error('exercício já tem série registrada'), { code: '23505' });
    mock(saveSetLog).mockRejectedValue(new SessionExecutionRequestError(err, { status: 400 }));
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'save_set_log', payload: savePayload() });

    const result = await drainAll('user-1');

    expect(result.pendingCount).toBe(0);
    expect(result.quarantineCount).toBe(1);
    const doc = await loadOutbox('user-1');
    expect(doc.quarantine[0].code).toBe('23505');
    expect(doc.quarantine[0].sessionLogId).toBe('log-1');
  });

  it('P0001 descarta TODOS os itens pendentes da sessionLogId (não só o que falhou) e chama onSessionClosed — sem quarentena (Pitfall 3)', async () => {
    const closed = Object.assign(new Error('session_log já finalizado'), { code: 'P0001' });
    mock(saveSetLog).mockRejectedValue(new SessionExecutionRequestError(closed, { status: 400 }));

    // Dois itens da MESMA sessão: save_set_log (cabeça) e finish_session (atrás
    // dele na FIFO). O P0001 na cabeça precisa arrastar o resto da sub-fila.
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'save_set_log', payload: savePayload() });
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'finish_session', payload: {} });

    const onSessionClosed = jest.fn();
    const result = await drainAll('user-1', { onSessionClosed });

    expect(onSessionClosed).toHaveBeenCalledWith('log-1');
    expect(result.pendingCount).toBe(0);
    expect(result.quarantineCount).toBe(0);
    const doc = await loadOutbox('user-1');
    expect(doc.items).toHaveLength(0);
    expect(doc.quarantine).toHaveLength(0);
  });

  it('código DESCONHECIDO nunca vira quarentena antes de expirar (Pitfall 2 — perda silenciosa)', async () => {
    const err = new Error('erro 503 sem code reconhecido');
    mock(saveSetLog).mockRejectedValue(new SessionExecutionRequestError(err, { status: 503 }));
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'save_set_log', payload: savePayload() });

    const result = await drainAll('user-1');

    expect(result.pendingCount).toBe(1);
    expect(result.quarantineCount).toBe(0);
  });

  it('item além do prazo de idade vai para quarentena mesmo com erro não classificado (D-11 backstop)', async () => {
    const err = new Error('ainda sem code');
    mock(saveSetLog).mockRejectedValue(new SessionExecutionRequestError(err, { status: 503 }));
    const doc = await enqueueItem('user-1', {
      sessionLogId: 'log-1',
      kind: 'save_set_log',
      payload: savePayload(),
    });
    // Força o item a já estar velho (8 dias > maxAgeDays=7).
    const oldEnqueuedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const aged = { ...doc, items: doc.items.map((it) => ({ ...it, enqueuedAt: oldEnqueuedAt, nextAttemptAt: oldEnqueuedAt })) };
    await saveOutbox('user-1', aged);

    const result = await drainAll('user-1');

    expect(result.pendingCount).toBe(0);
    expect(result.quarantineCount).toBe(1);
  });
});

describe('enqueueAndDrain — D-05: nunca aguarda a rede', () => {
  it('retorna contagem síncrona sem esperar drainAll terminar', async () => {
    let release: (() => void) | null = null;
    mock(saveSetLog).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(savedRow());
        }),
    );

    const result = await enqueueAndDrain('user-1', {
      sessionLogId: 'log-1',
      kind: 'save_set_log',
      payload: savePayload(),
    });

    expect(result.pendingCount).toBe(1);
    expect(result.quarantineCount).toBe(0);

    // Libera a RPC pendente para não vazar handle entre testes.
    release?.();
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe('update_set_log_adaptation — resolução tardia de setLogId (Pitfall 1)', () => {
  it('resolve setLogId via getOpenSessionLog pelo plannedSetId e chama updateSetLogAdaptation', async () => {
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'log-1',
      startedAt: '2026-08-12T09:00:00.000Z',
      setLogs: [
        {
          id: 'sl-resolved',
          planned_set_id: 'st-1',
          actual_reps: 8,
          actual_load_kg: 40,
          actual_rir: 2,
          outcome: 'on_target',
          adaptation: null,
          completed_at: '2026-08-12T09:05:00.000Z',
        },
      ],
      availableMinutes: null,
      adherenceSnapshot: null,
      mood: null,
      exerciseSkips: [],
      exerciseSwaps: [],
    });
    mock(updateSetLogAdaptation).mockResolvedValue(undefined);

    const payload: UpdateSetLogAdaptationPayload = {
      userId: 'user-1',
      plannedSessionId: 'sess-1',
      plannedSetId: 'st-1',
      adaptation: { kind: 'keep', auto: true },
    };
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'update_set_log_adaptation', payload });

    const result = await drainAll('user-1');

    expect(getOpenSessionLog).toHaveBeenCalledWith('user-1', 'sess-1');
    expect(updateSetLogAdaptation).toHaveBeenCalledWith('sl-resolved', { kind: 'keep', auto: true }, undefined);
    expect(result.pendingCount).toBe(0);
  });

  it('setLogId não resolvido (sessão fechada ou save_set_log ainda não confirmado): mantém pendente com backoff', async () => {
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'log-1',
      startedAt: '2026-08-12T09:00:00.000Z',
      setLogs: [],
      availableMinutes: null,
      adherenceSnapshot: null,
      mood: null,
      exerciseSkips: [],
      exerciseSwaps: [],
    });

    const payload: UpdateSetLogAdaptationPayload = {
      userId: 'user-1',
      plannedSessionId: 'sess-1',
      plannedSetId: 'st-1',
      adaptation: { kind: 'keep', auto: true },
    };
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'update_set_log_adaptation', payload });

    const result = await drainAll('user-1');

    expect(updateSetLogAdaptation).not.toHaveBeenCalled();
    expect(result.pendingCount).toBe(1);
    expect(result.quarantineCount).toBe(0);
  });
});
