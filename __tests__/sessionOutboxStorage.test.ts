// __tests__/sessionOutboxStorage.test.ts
// Fase 4 (REQ-07) — I/O da fila offline-first (D-09), molde de
// sessionDraftStorage.ts com mock manual de AsyncStorage (Map em memória),
// no padrão de loadDraftCoercion.test.ts. Cobre version-guard (formato
// desconhecido/corrompido nunca lança) e isolamento por usuário (D-09: UMA
// chave por usuário — a fila precisa ser descoberta depois de finish_session,
// quando o rascunho ativo já foi limpo).

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

import { loadOutbox, saveOutbox } from '../src/services/sessionOutboxStorage';
import type { OutboxDocument } from '../src/engine/sessionOutboxPolicy';

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('loadOutbox', () => {
  it('sem dado gravado: devolve documento vazio (nunca null, nunca lança)', async () => {
    await expect(loadOutbox('user-1')).resolves.toEqual({
      version: 1,
      items: [],
      quarantine: [],
    });
  });

  it('JSON corrompido: devolve documento vazio, nunca lança', async () => {
    mockStore.set('@session_outbox_user-1', 'não é json {{{');
    await expect(loadOutbox('user-1')).resolves.toEqual({
      version: 1,
      items: [],
      quarantine: [],
    });
  });

  it('version !== 1: formato desconhecido é ignorado, devolve documento vazio', async () => {
    mockStore.set(
      '@session_outbox_user-1',
      JSON.stringify({ version: 99, items: [], quarantine: [] }),
    );
    await expect(loadOutbox('user-1')).resolves.toEqual({
      version: 1,
      items: [],
      quarantine: [],
    });
  });

  it('formato sem items/quarantine como array: documento vazio', async () => {
    mockStore.set('@session_outbox_user-1', JSON.stringify({ version: 1 }));
    await expect(loadOutbox('user-1')).resolves.toEqual({
      version: 1,
      items: [],
      quarantine: [],
    });
  });

  it('isolamento por usuário: userId diferente nunca lê a fila do outro (D-09)', async () => {
    const docA: OutboxDocument = {
      version: 1,
      items: [
        {
          id: 'a',
          sessionLogId: 's1',
          kind: 'save_set_log',
          payload: { x: 1 },
          enqueuedAt: 't0',
          nextAttemptAt: 't0',
          attempts: 0,
        },
      ],
      quarantine: [],
    };
    await saveOutbox('user-a', docA);

    expect(await loadOutbox('user-b')).toEqual({ version: 1, items: [], quarantine: [] });
    expect(await loadOutbox('user-a')).toEqual(docA);
  });
});

describe('saveOutbox', () => {
  it('persiste e loadOutbox devolve o MESMO documento', async () => {
    const doc: OutboxDocument = {
      version: 1,
      items: [
        {
          id: 'x',
          sessionLogId: 's1',
          kind: 'save_set_log',
          payload: { foo: 1 },
          enqueuedAt: 't0',
          nextAttemptAt: 't0',
          attempts: 0,
        },
      ],
      quarantine: [
        {
          id: 'y',
          sessionLogId: 's1',
          kind: 'save_set_log',
          payload: {},
          reason: 'código definitivo',
          code: 'P0005',
          quarantinedAt: 't0',
          expiresAt: 't30',
        },
      ],
    };
    await saveOutbox('user-1', doc);
    expect(await loadOutbox('user-1')).toEqual(doc);
  });

  it('a fila é descoberta por userId puro — independe de sessionLogId/plannedSessionId ativo (D-09)', async () => {
    // Uma única chave por usuário: a fila precisa aparecer mesmo depois que o
    // draft (chaveado por plannedSessionId) já foi limpo por finish_session.
    const doc: OutboxDocument = { version: 1, items: [], quarantine: [] };
    await saveOutbox('user-1', doc);
    expect(mockStore.has('@session_outbox_user-1')).toBe(true);
  });
});
