// __tests__/legacySessionMigration.test.ts
// Reproduz o achado do review: a sessão Supabase gravada em texto puro no
// AsyncStorage pela versão ANTIGA do app precisa ser migrada para o
// SecureStore e APAGADA do AsyncStorage — não pode sobrar JWT legível.

import { migrateLegacySupabaseSession } from '../src/services/auth/secureStorage';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockSecure = new Map<string, string>();
const mockAsync = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (new TextEncoder().encode(value).length > 2048) throw new Error('excede limite');
    mockSecure.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => (mockSecure.has(key) ? mockSecure.get(key)! : null)),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecure.delete(key);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => (mockAsync.has(key) ? mockAsync.get(key)! : null)),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsync.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsync.delete(key);
  }),
}));

const SUPABASE_URL = 'https://meuprojeto.supabase.co';
const LEGACY_KEY = 'sb-meuprojeto-auth-token';
const JWT_FALSO = 'header.payload.signature';

describe('migração da sessão legada (AsyncStorage → SecureStore)', () => {
  beforeEach(() => {
    mockSecure.clear();
    mockAsync.clear();
    jest.clearAllMocks();
  });

  it('REPRODUÇÃO: migra a sessão para o SecureStore e APAGA do AsyncStorage', async () => {
    mockAsync.set(LEGACY_KEY, JWT_FALSO); // dispositivo vindo da versão antiga

    await migrateLegacySupabaseSession(SUPABASE_URL);

    // AsyncStorage não pode mais conter o token
    await expect(AsyncStorage.getItem(LEGACY_KEY)).resolves.toBeNull();
    // E o SecureStore passa a ter a sessão na MESMA chave lógica (supabase-js a lê)
    const { getItem } = require('../src/services/auth/secureStorage');
    await expect(getItem(LEGACY_KEY)).resolves.toBe(JWT_FALSO);
  });

  it('não sobrescreve uma sessão mais nova já existente no SecureStore', async () => {
    mockAsync.set(LEGACY_KEY, JWT_FALSO);
    const { setItem, getItem } = require('../src/services/auth/secureStorage');
    await setItem(LEGACY_KEY, 'sessao-nova-atual');

    await migrateLegacySupabaseSession(SUPABASE_URL);

    await expect(getItem(LEGACY_KEY)).resolves.toBe('sessao-nova-atual');
    // Mas o legado em texto puro ainda deve ser apagado
    await expect(AsyncStorage.getItem(LEGACY_KEY)).resolves.toBeNull();
  });

  it('não faz nada quando não há sessão legada', async () => {
    await migrateLegacySupabaseSession(SUPABASE_URL);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(mockSecure.size).toBe(0);
  });

  it('é resiliente a URL inválida (não lança)', async () => {
    await expect(migrateLegacySupabaseSession('nao-e-uma-url')).resolves.toBeUndefined();
  });
});
