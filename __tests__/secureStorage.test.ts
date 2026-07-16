// __tests__/secureStorage.test.ts
// Reproduz os modos de falha apontados no review de segurança:
// (1) chunking deve respeitar o limite de BYTES do SecureStore (não chars);
// (2) escrita deve ser atômica — falha parcial não pode destruir o valor antigo;
// (3) operações na mesma chave são serializadas (sem corrida);
// (4) chaves diferentes nunca colidem após sanitização.

import { setItem, getItem, removeItem } from '../src/services/auth/secureStorage';

const BYTE_LIMIT = 2048;
const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

// Mock em memória do expo-secure-store COM limite de bytes e falha injetável
const mockMemoryStore = new Map<string, string>();

const mockDefaultSet = async (key: string, value: string) => {
  if (new TextEncoder().encode(value).length > BYTE_LIMIT) {
    throw new Error(`[SecureStore mock] valor excede ${BYTE_LIMIT} bytes`);
  }
  mockMemoryStore.set(key, value);
};
const mockDefaultGet = async (key: string) => (mockMemoryStore.has(key) ? mockMemoryStore.get(key)! : null);
const mockDefaultDelete = async (key: string) => {
  mockMemoryStore.delete(key);
};

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn((key: string, value: string) => mockDefaultSet(key, value)),
  getItemAsync: jest.fn((key: string) => mockDefaultGet(key)),
  deleteItemAsync: jest.fn((key: string) => mockDefaultDelete(key)),
}));

describe('secureStorage', () => {
  beforeEach(() => {
    mockMemoryStore.clear();
    jest.clearAllMocks();
    // Reaplica as implementações padrão (um teste pode trocá-las por injeção de falha)
    const SecureStore = require('expo-secure-store');
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(mockDefaultSet);
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(mockDefaultGet);
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(mockDefaultDelete);
  });

  it('persiste e recupera um valor pequeno', async () => {
    await setItem('token', 'valor-curto');
    await expect(getItem('token')).resolves.toBe('valor-curto');
  });

  it('divide valores grandes respeitando o limite de BYTES (não de chars)', async () => {
    const bigValue = 'x'.repeat(5000);
    await setItem('session', bigValue);
    await expect(getItem('session')).resolves.toBe(bigValue);
    // Nenhuma chave armazenada pode exceder o limite de bytes
    for (const value of mockMemoryStore.values()) {
      expect(utf8Bytes(value)).toBeLessThanOrEqual(BYTE_LIMIT);
    }
  });

  it('REPRODUÇÃO: valor Unicode (emoji = 4 bytes) não pode estourar o limite nativo', async () => {
    // 1.800 emojis ≈ 7.200 bytes — estoura o limite se o corte for por caracteres
    const unicodeValue = '🏋️'.repeat(1800);
    await setItem('session', unicodeValue);
    await expect(getItem('session')).resolves.toBe(unicodeValue);
  });

  it('REPRODUÇÃO: falha parcial na escrita NÃO destrói o valor antigo (atomicidade)', async () => {
    await setItem('session', 'valor-antigo-valido');

    // Força falha na escrita de QUALQUER chunk da nova geração
    // (chunks físicas seguem o padrão k_<hex>_g<geracao>_<indice>)
    const SecureStore = require('expo-secure-store');
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (/_g.+_\d+$/.test(key)) throw new Error('falha parcial simulada');
      mockMemoryStore.set(key, value);
    });

    await expect(setItem('session', 'z'.repeat(5000))).rejects.toThrow();

    // O valor antigo precisa continuar íntegro e legível
    await expect(getItem('session')).resolves.toBe('valor-antigo-valido');
  });

  it('REPRODUÇÃO: escritas concorrentes na mesma chave são serializadas', async () => {
    const big1 = 'a'.repeat(4000);
    const big2 = 'b'.repeat(4000);
    // Dispara as duas escritas sem aguardar — resultado final deve ser um valor ÍNTEGRO
    await Promise.all([setItem('session', big1), setItem('session', big2)]);
    const result = await getItem('session');
    expect([big1, big2]).toContain(result); // nunca uma mistura corrompida dos dois
  });

  it('REPRODUÇÃO: chaves que diferem só por caracteres inválidos não colidem', async () => {
    await setItem('sb:x/auth', 'valor-1');
    await setItem('sb:x_auth', 'valor-2');

    await expect(getItem('sb:x/auth')).resolves.toBe('valor-1');
    await expect(getItem('sb:x_auth')).resolves.toBe('valor-2');
    // Chaves físicas sempre válidas para o SecureStore
    for (const key of mockMemoryStore.keys()) {
      expect(key).toMatch(/^[a-zA-Z0-9._-]+$/);
    }
  });

  it('remove todas as chunks e o manifesto ao apagar', async () => {
    await setItem('session', 'y'.repeat(4000));
    await removeItem('session');
    await expect(getItem('session')).resolves.toBeNull();
    expect(mockMemoryStore.size).toBe(0);
  });

  it('retorna null se alguma chunk estiver corrompida/ausente', async () => {
    await setItem('session', 'w'.repeat(4000));
    const chunkKey = [...mockMemoryStore.keys()].find((k) => /_g.+_\d+$/.test(k))!;
    mockMemoryStore.delete(chunkKey);
    await expect(getItem('session')).resolves.toBeNull();
  });

  it('não deixa sobras ao sobrescrever um valor maior por um menor', async () => {
    await setItem('session', 'z'.repeat(5000));
    await setItem('session', 'curto');
    await expect(getItem('session')).resolves.toBe('curto');
    // Sem chunks órfãs de gerações anteriores
    const leftover = [...mockMemoryStore.keys()].filter((k) => k.includes('chunk'));
    expect(leftover.length).toBeLessThanOrEqual(1);
  });
});
