// __tests__/authContextPgrst116RlsRetry.test.tsx
// Bug confirmado (auditoria 19/08): no cold boot com access token vencido,
// fetchProfile (AuthContext.js:218-242) recebia PGRST116 — a RLS nega a
// linha em silêncio porque verifyTokenValidity (probe select('id').limit(1)
// SEM .eq('id', userId), linha ~111) não filtra por usuário e não detecta o
// token vencido. O branch PGRST116 fazia setProfile(null) sem logout, e o
// RootNavigator (profile===null -> OnboardingNavigator) tratava sessão
// válida como conta nova. Segundos depois o TOKEN_REFRESHED refazia o
// fetch e o app pulava para Main — o questionário piscava toda vez que o
// dono abria o app.
//
// Fato-chave que valida o desenho do fix: on_auth_user_created
// (supabase/migrations/0000_profiles_base.sql:40-56) cria a linha de
// profiles no signup — todo usuário autenticado TEM perfil; PGRST116 para
// usuário logado nunca é "conta nova", é sessão/token/RLS.
//
// Este arquivo prova as pontas do fix: (a) retry com refreshSession()
// recupera o perfil sem nunca expor profile=null com profileResolved=true
// para um usuário que TEM linha; (b) PGRST116 persistente após a
// retentativa cai no fallback "assentado" (profileResolved=true,
// profile=null) preservado; (c) falha do próprio refreshSession() vira erro
// genérico (errorProfile), não onboarding; e que não há loop (no máximo uma
// retentativa por chamada de fetchProfile).

import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';

let mockAuthCallback: ((event: string, session: unknown) => Promise<void>) | null = null;
const sessionDe = (userId: string) => ({ access_token: `tok-${userId}`, user: { id: userId } });

let singleQueue: Array<{ data: unknown; error: unknown }> = [];
let singleFallback: { data: unknown; error: unknown } = {
  data: null,
  error: { code: 'PGRST116', message: 'not found' },
};
const mockRefreshSession = jest.fn(async () => ({ data: { session: sessionDe('user-1') }, error: null }));

function mockBuilder() {
  const b: any = {};
  b.select = () => b;
  b.update = () => b;
  b.eq = () => b;
  // Sonda do verifyTokenValidity: select('id').limit(1)
  b.limit = async () => ({ data: [], error: null });
  // fetchProfile: select('*').eq().single()
  b.single = async () => singleQueue.shift() ?? singleFallback;
  return b;
}

jest.mock('../src/config/supabaseClient', () => ({
  storageReady: Promise.resolve(),
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: sessionDe('user-1') }, error: null })),
      onAuthStateChange: jest.fn((cb: any) => {
        mockAuthCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signOut: jest.fn(async () => ({ error: null })),
      refreshSession: () => mockRefreshSession(),
    },
    from: jest.fn(() => mockBuilder()),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

const Consumer = () => {
  const { profile, profileResolved, errorProfile, loadingSession } = useAuth();
  const estado = loadingSession
    ? 'carregando'
    : errorProfile
      ? `erro:${errorProfile}`
      : `resolved:${String(profileResolved)}|perfil:${profile === null ? 'null' : String(profile.onboarding_completed)}`;
  return <Text testID="estado">{estado}</Text>;
};

let historico: string[] = [];
const ConsumerComHistorico = () => {
  const { profile, profileResolved, errorProfile } = useAuth();
  const linha = errorProfile
    ? `erro:${errorProfile}`
    : `resolved:${String(profileResolved)}|perfil:${profile === null ? 'null' : String(profile.onboarding_completed)}`;
  historico.push(linha);
  return <Text testID="estado">{linha}</Text>;
};

const montar = async (ComponenteConsumer: React.ComponentType = Consumer) => {
  const utils = render(
    <AuthProvider>
      <ComponenteConsumer />
    </AuthProvider>,
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  return utils;
};

const dispararEventoInicial = async (userId: string) => {
  await act(async () => {
    mockAuthCallback?.('INITIAL_SESSION', sessionDe(userId));
    await jest.advanceTimersByTimeAsync(10_000);
  });
};

describe('AuthContext — PGRST116 no cold boot tenta renovar sessão antes de aceitar "sem perfil"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthCallback = null;
    singleQueue = [];
    singleFallback = { data: null, error: { code: 'PGRST116', message: 'not found' } };
    mockRefreshSession.mockReset();
    mockRefreshSession.mockResolvedValue({ data: { session: sessionDe('user-1') }, error: null });
    historico = [];
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    (console.error as jest.Mock).mockRestore();
    (console.warn as jest.Mock).mockRestore();
    (console.log as jest.Mock).mockRestore();
  });

  it('(a) PGRST116 no primeiro fetch + refreshSession OK + refetch acha a linha: nunca expõe profile=null com profileResolved=true', async () => {
    singleQueue = [
      { data: null, error: { code: 'PGRST116', message: 'not found' } },
      { data: { id: 'user-1', onboarding_completed: true }, error: null },
    ];

    const { getByTestId } = await montar(ConsumerComHistorico);
    await dispararEventoInicial('user-1');

    // Nunca, em nenhum render, profile===null com profileResolved===true —
    // essa combinação é exatamente o que fazia o RootNavigator cair no
    // fallback de onboarding para um usuário que TEM perfil.
    expect(historico).not.toContain('resolved:true|perfil:null');

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(getByTestId('estado').props.children).toBe('resolved:true|perfil:true');
  });

  it('(b) PGRST116 persistente mesmo após a retentativa: cai no fallback assentado (profileResolved=true, profile=null)', async () => {
    singleFallback = { data: null, error: { code: 'PGRST116', message: 'not found' } };

    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(getByTestId('estado').props.children).toBe('resolved:true|perfil:null');
  });

  it('(c) falha do próprio refreshSession (rede) vira erro genérico (errorProfile), não onboarding', async () => {
    mockRefreshSession.mockRejectedValue(new Error('falha de rede simulada'));
    singleQueue = [{ data: null, error: { code: 'PGRST116', message: 'not found' } }];

    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(getByTestId('estado').props.children).toBe(
      'erro:Não foi possível carregar os dados do perfil.',
    );
  });

  it('não faz mais de UMA retentativa por chamada de fetchProfile (sem loop)', async () => {
    singleFallback = { data: null, error: { code: 'PGRST116', message: 'not found' } };

    await montar();
    await dispararEventoInicial('user-1');

    // refreshSession só é chamado pela chamada TOP-LEVEL de fetchProfile —
    // a chamada recursiva (isRetryAttempt=true) não tenta de novo, mesmo
    // com PGRST116 persistente.
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });
});
