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
    getSessionLogFinishedStatus: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (e: unknown) =>
      e instanceof SessionExecutionRequestError && e.kind === 'transport',
  };
});

import {
  saveSetLog,
  updateSetLogAdaptation,
  getOpenSessionLog,
  getSessionLogFinishedStatus,
  SessionExecutionRequestError,
} from '../src/services/sessionExecutionRepository';
import { enqueueItem, enqueueAndDrain, drainAll } from '../src/services/sessionOutboxDrain';
import { loadOutbox, saveOutbox } from '../src/services/sessionOutboxStorage';
import type { SaveSetLogPayload, UpdateSetLogAdaptationPayload } from '../src/services/sessionOutboxDrain';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  it('CR-03: sessão REALMENTE fechada (não apenas set_log não confirmado) descarta a sub-fila e chama onSessionClosed', async () => {
    // getOpenSessionLog não encontra a sessão ABERTA (filtra finished_at IS
    // NULL) — sozinho, isso é ambíguo entre "fechada" e "save_set_log ainda
    // não confirmou" (Pitfall 1). A checagem extra (getSessionLogFinishedStatus,
    // SELECT simples, mesma RLS, sem RPC nova) resolve a ambiguidade.
    mock(getOpenSessionLog).mockResolvedValue(null);
    mock(getSessionLogFinishedStatus).mockResolvedValue({ finished: true });

    const payload: UpdateSetLogAdaptationPayload = {
      userId: 'user-1',
      plannedSessionId: 'sess-1',
      plannedSetId: 'st-1',
      adaptation: { kind: 'keep', auto: true },
    };
    // Sub-fila da MESMA sessão: item de adaptação sozinho (o save_set_log
    // correspondente já drenou em outra rodada/dispositivo) + um item extra
    // qualquer para provar que a sub-fila INTEIRA é descartada, não só o
    // item de adaptação (mesmo contrato de P0001, Pitfall 3).
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'update_set_log_adaptation', payload });
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'finish_session', payload: {} });

    const onSessionClosed = jest.fn();
    const result = await drainAll('user-1', { onSessionClosed });

    expect(onSessionClosed).toHaveBeenCalledWith('log-1');
    expect(updateSetLogAdaptation).not.toHaveBeenCalled();
    expect(result.pendingCount).toBe(0);
    expect(result.quarantineCount).toBe(0);
    const doc = await loadOutbox('user-1');
    expect(doc.items).toHaveLength(0);
    expect(doc.quarantine).toHaveLength(0);
  });
});

describe('CR-02: falha transitória de loadOutbox em enqueueItem NUNCA persiste por cima da fila real', () => {
  it('item real em disco sobrevive a uma leitura que falha durante um novo enfileiramento', async () => {
    // Semeia disco com um item PENDENTE de verdade (via saveOutbox direto,
    // sem passar pelo mock de leitura que vamos derrubar a seguir).
    const existing = await enqueueItem('user-1', {
      sessionLogId: 'log-1',
      kind: 'save_set_log',
      payload: savePayload({ plannedSetId: 'st-existing' }),
    });
    expect(existing.items).toHaveLength(1);

    // A PRÓXIMA leitura (dentro do enqueueItem seguinte) falha de forma
    // transitória — native module hiccup, não JSON corrompido (que
    // loadOutbox já trata sem lançar, ver sessionOutboxStorage.test.ts).
    mock(AsyncStorage.getItem).mockImplementationOnce(() =>
      Promise.reject(new Error('falha nativa transitória de leitura')),
    );

    await enqueueItem('user-1', {
      sessionLogId: 'log-2',
      kind: 'save_set_log',
      payload: savePayload({ plannedSetId: 'st-new' }),
    });

    // O item que já estava em disco ANTES da falha de leitura não pode ter
    // sido apagado por um saveOutbox que persistiu "fila vazia + item novo"
    // por cima dele (D-07).
    const doc = await loadOutbox('user-1');
    expect(doc.items.some((it) => it.id.includes('st-existing'))).toBe(true);
  });
});

describe('CR-01: drainAll/enqueueItem concorrentes não perdem item pendente (D-07)', () => {
  it('item enfileirado ENQUANTO um drainAll anterior ainda está em voo sobrevive ao save desse drain', async () => {
    let releaseX: (() => void) | null = null;
    mock(saveSetLog).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseX = () => resolve(savedRow());
        }),
    );
    // Y (update_set_log_adaptation) pode chegar a ser despachado numa
    // rodada seguinte, depois de X sair da fila — mocks explícitos (em vez
    // de depender de implementação deixada por outro teste, jest.clearAllMocks
    // limpa histórico de chamadas mas NÃO reverte mockResolvedValue) fazem
    // esse despacho cair no ramo "ainda não confirmado" (retenta), não no
    // ramo "sessão fechada" (que descartaria a sub-fila e apagaria Y de
    // propósito — não é o que este teste quer provar).
    mock(getOpenSessionLog).mockResolvedValue(null);
    mock(getSessionLogFinishedStatus).mockResolvedValue({ finished: false });

    // X enfileirado e SEU drain (Drain-X) começa a rodada — fica preso na
    // RPC de saveSetLog (rede em voo), exatamente como completeSet dispara
    // save_set_log via enqueueAndDrain e segue sem aguardar (D-05).
    await enqueueItem('user-1', { sessionLogId: 'log-1', kind: 'save_set_log', payload: savePayload({ plannedSetId: 'st-x' }) });
    const drainXPromise = drainAll('user-1');
    // Espera de verdade Drain-X ter chamado saveSetLog (várias voltas de
    // withKeyQueue acontecem antes disso — número de ticks não é confiável).
    for (let i = 0; i < 50 && mock(saveSetLog).mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(mock(saveSetLog).mock.calls.length).toBeGreaterThan(0);

    // AINDA com Drain-X em voo (a RPC de X não resolveu), um segundo item Y
    // (kind diferente, mesma sessão) é enfileirado — reproduz completeSet
    // disparando update_set_log_adaptation logo depois de save_set_log, no
    // MESMO tick, antes do drain de X salvar (activeSessionStore.ts:1207 e
    // 1332).
    await enqueueItem('user-1', {
      sessionLogId: 'log-1',
      kind: 'update_set_log_adaptation',
      payload: {
        userId: 'user-1',
        plannedSessionId: 'sess-1',
        plannedSetId: 'st-y',
        adaptation: { kind: 'keep', auto: true },
      } satisfies UpdateSetLogAdaptationPayload,
    });

    // Libera a RPC de X: Drain-X remove X do SEU snapshot e persiste.
    releaseX?.();
    await drainXPromise;

    // Y NÃO pode ter sido apagado por um save de Drain-X baseado num
    // snapshot capturado ANTES de Y existir (o bug do CR-01: `drainAll`
    // salvava sua cópia em memória, stale em relação ao disco).
    const doc = await loadOutbox('user-1');
    expect(doc.items.some((it) => it.kind === 'update_set_log_adaptation')).toBe(true);
    expect(doc.items.some((it) => it.kind === 'save_set_log')).toBe(false);
  });
});

describe('WR-02: payload com shape inválido na fronteira da persistência nunca chega à RPC', () => {
  it('save_set_log com plannedSetId ausente (payload de versão futura/incompatível): quarentena direta, saveSetLog NUNCA chamado', async () => {
    // Simula um item persistido por uma versão FUTURA do app com o shape do
    // payload já mudado (campo renomeado/removido) — não dá para construir
    // isto via enqueueItem (o tipo TS impediria), então grava o documento
    // direto via saveOutbox, como o disco real teria.
    await saveOutbox('user-1', {
      version: 1,
      items: [
        {
          id: 'log-1:set:st-1',
          sessionLogId: 'log-1',
          kind: 'save_set_log',
          // payload malformado: sem plannedSetId (renomeado numa versão futura hipotética).
          payload: { sessionLogId: 'log-1', actualReps: 8, actualLoadKg: 40, actualRir: 2, outcome: 'on_target' },
          enqueuedAt: new Date().toISOString(),
          nextAttemptAt: new Date().toISOString(),
          attempts: 0,
        },
      ],
      quarantine: [],
    });

    const result = await drainAll('user-1');

    expect(saveSetLog).not.toHaveBeenCalled();
    expect(result.pendingCount).toBe(0);
    expect(result.quarantineCount).toBe(1);
    const doc = await loadOutbox('user-1');
    expect(doc.quarantine[0].reason).toMatch(/payload/i);
  });
});
