// __tests__/secureStorage.test.ts
// Garante que o storage seguro: (1) persiste e recupera valores grandes
// via chunks (limite de 2048 bytes do SecureStore), (2) remove todos os
// chunks ao apagar, (3) não deixa restos de valores maiores anteriores.

import { setItem, getItem, removeItem } from '../src/services/auth/secureStorage';

// Mock em memória do expo-secure-store
const mockMemoryStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockMemoryStore.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => (mockMemoryStore.has(key) ? mockMemoryStore.get(key)! : null)),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockMemoryStore.delete(key);
  }),
}));

describe('secureStorage', () => {
  beforeEach(() => {
    mockMemoryStore.clear();
    jest.clearAllMocks();
  });

  it('persiste e recupera um valor pequeno (chunk única)', async () => {
    await setItem('token', 'valor-curto');
    await expect(getItem('token')).resolves.toBe('valor-curto');
  });

  it('divide valores maiores que o limite do SecureStore em chunks e recompõe', async () => {
    const bigValue = 'x'.repeat(5000); // ~2.7 chunks de 1800
    await setItem('session', bigValue);

    // Deve ter gravado o contador e 3 chunks
    expect(mockMemoryStore.get('session_count')).toBe('3');
    expect(mockMemoryStore.get('session_chunk_0')!.length).toBe(1800);
    expect(mockMemoryStore.get('session_chunk_2')!.length).toBe(1400);

    await expect(getItem('session')).resolves.toBe(bigValue);
  });

  it('remove todas as chunks e o contador ao apagar', async () => {
    const bigValue = 'y'.repeat(4000);
    await setItem('session', bigValue);
    await removeItem('session');

    expect(mockMemoryStore.get('session_count')).toBeUndefined();
    expect(mockMemoryStore.get('session_chunk_0')).toBeUndefined();
    await expect(getItem('session')).resolves.toBeNull();
  });

  it('não deixa sobras ao sobrescrever um valor maior por um menor', async () => {
    await setItem('session', 'z'.repeat(5000)); // 3 chunks
    await setItem('session', 'curto'); // 1 chunk

    expect(mockMemoryStore.get('session_chunk_1')).toBeUndefined();
    await expect(getItem('session')).resolves.toBe('curto');
  });

  it('retorna null se alguma chunk estiver corrompida/ausente', async () => {
    await setItem('session', 'w'.repeat(4000));
    mockMemoryStore.delete('session_chunk_1'); // simula corrupção

    await expect(getItem('session')).resolves.toBeNull();
  });

  it('sanitiza chaves com caracteres não permitidos pelo SecureStore', async () => {
    await setItem('sb:ref/auth token', 'valor');
    await expect(getItem('sb:ref/auth token')).resolves.toBe('valor');
    // Nenhuma chave armazenada pode conter caracteres inválidos
    for (const key of mockMemoryStore.keys()) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });
});
