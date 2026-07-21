// __tests__/secureStorageWeb.test.ts
//
// Modo de falha que estes testes travam (encontrado ao portar o app para PWA):
//
//   secureStorage.ts importava expo-secure-store e chamava getItemAsync sem
//   olhar a plataforma. Na web o expo-secure-store NÃO tem implementação, então
//   a chamada estourava `getValueWithKeyAsync is not a function` dentro do
//   supabase-js, e o AuthContext registrava "Erro crítico ao buscar sessão
//   inicial" — a tela de login aparecia, mas nenhuma sessão carregava ou
//   persistia. O app web ficava permanentemente deslogado.
//
// Provado no navegador antes do fix; estes testes garantem que o caminho web
// não volte a chamar o SecureStore.

// Prefixo `mock` obrigatório: a factory do jest.mock não enxerga variáveis
// fora de escopo sem ele (gotcha já conhecido neste repo).
const mockSetItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

// secureStorage.ts só consome `Platform` do react-native, então um mock enxuto
// basta e evita carregar o runtime nativo inteiro sob Platform.OS='web'.
jest.mock('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: Record<string, unknown>) => obj.web ?? obj.default,
  },
}));

// Com Platform.OS='web', o AsyncStorage.native tenta resolver o módulo nativo
// e quebra no import. Só a migração de sessão legada o usa.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

/** localStorage de mentira: o ambiente do jest é node, não tem o do navegador. */
const criarLocalStorageFake = () => {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => (dados.has(k) ? dados.get(k)! : null),
    setItem: (k: string, v: string) => void dados.set(k, String(v)),
    removeItem: (k: string) => void dados.delete(k),
    clear: () => dados.clear(),
    key: (i: number) => Array.from(dados.keys())[i] ?? null,
    get length() {
      return dados.size;
    },
  };
};

describe('secureStorage na web (PWA)', () => {
  let storage: typeof import('../src/services/auth/secureStorage');

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: criarLocalStorageFake(),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.localStorage.clear();
    jest.isolateModules(() => {
      // isWeb é avaliado no import — o mock de Platform precisa vir antes
      storage = require('../src/services/auth/secureStorage');
    });
  });

  it('grava e lê pelo localStorage sem tocar no SecureStore', async () => {
    await storage.setItem('sb-projeto-auth-token', 'sessao-do-usuario');

    expect(await storage.getItem('sb-projeto-auth-token')).toBe('sessao-do-usuario');
    // O ponto do teste: na web o SecureStore não pode ser chamado — era isso
    // que estourava getValueWithKeyAsync e derrubava a autenticação.
    expect(mockSetItemAsync).not.toHaveBeenCalled();
    expect(mockGetItemAsync).not.toHaveBeenCalled();
  });

  it('remove a chave e devolve null depois', async () => {
    await storage.setItem('chave', 'valor');
    await storage.removeItem('chave');

    expect(await storage.getItem('chave')).toBeNull();
    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it('devolve null para chave que nunca existiu', async () => {
    expect(await storage.getItem('inexistente')).toBeNull();
  });

  it('preserva valores maiores que o limite de 2048 bytes do SecureStore', async () => {
    // Na web não há chunking: o valor tem de voltar inteiro, sem manifesto.
    const grande = 'x'.repeat(10_000);
    await storage.setItem('sessao-grande', grande);

    expect(await storage.getItem('sessao-grande')).toBe(grande);
  });

  it('sobrevive a localStorage indisponível (modo privado) sem lançar', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: acesso ao storage negado');
      },
    });

    try {
      await expect(storage.setItem('k', 'v')).resolves.toBeUndefined();
      await expect(storage.getItem('k')).resolves.toBeNull();
      await expect(storage.removeItem('k')).resolves.toBeUndefined();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });

  it('expõe o adapter que o supabase-js consome', () => {
    expect(typeof storage.supabaseSecureStorage.getItem).toBe('function');
    expect(typeof storage.supabaseSecureStorage.setItem).toBe('function');
    expect(typeof storage.supabaseSecureStorage.removeItem).toBe('function');
  });
});
