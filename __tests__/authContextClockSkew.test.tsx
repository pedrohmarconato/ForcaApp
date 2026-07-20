// __tests__/authContextClockSkew.test.tsx
// Reproduz o logout indevido visto no device em 20/07/2026:
//
//   ERROR [AuthContext] Erro ao verificar token:
//     {"code": "PGRST303", "message": "JWT issued at future"}
//   → "Detectado token expirado. Realizando logout automático."
//
// PGRST303 é desvio de relógio transitório entre o GoTrue (que emite o token)
// e o PostgREST (que o valida): logo após um TOKEN_REFRESHED o `iat` parece
// estar "no futuro" e a validação falha por 1–2 segundos. O token é VÁLIDO —
// deslogar o usuário por isso é bug. A verificação deve tolerar o skew
// (retentar e manter a sessão), reservando o logout para expiração real
// (401 / PGRST301 / "JWT expired").

import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';

let mockAuthCallback: ((event: string, session: unknown) => Promise<void>) | null = null;
let mockProbeDefault: { data: unknown; error: unknown } = { data: [], error: null };
const mockSession = { access_token: 'tok-valido', user: { id: 'user-1' } };

function mockBuilder() {
  const b: any = {};
  b.select = () => b;
  b.update = () => b;
  b.eq = () => b;
  // Sonda do verifyTokenValidity: select('id').limit(1)
  b.limit = async () => mockProbeDefault;
  // fetchProfile: select('*').eq().single() — perfil inexistente (PGRST116)
  b.single = async () => ({ data: null, error: { code: 'PGRST116', message: 'not found' }, status: 406 });
  return b;
}

jest.mock('../src/config/supabaseClient', () => ({
  storageReady: Promise.resolve(),
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
      onAuthStateChange: jest.fn((cb: any) => {
        mockAuthCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signOut: jest.fn(async () => ({ error: null })),
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
import { supabase } from '../src/config/supabaseClient';

const mockedSignOut = supabase.auth.signOut as jest.Mock;

const Consumer = () => {
  const { user, loadingSession } = useAuth();
  return <Text testID="estado">{loadingSession ? 'carregando' : user ? `logado:${user.id}` : 'deslogado'}</Text>;
};

const montarComSessao = async () => {
  const utils = render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  // Flui a checagem inicial de sessão (inclui a espera do retry de skew).
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  // Dispara o evento que o Supabase real emitiria na inicialização.
  await act(async () => {
    mockAuthCallback?.('INITIAL_SESSION', mockSession);
    await jest.advanceTimersByTimeAsync(10_000);
  });
  return utils;
};

describe('AuthContext — desvio de relógio (PGRST303) não pode deslogar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthCallback = null;
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    (console.error as jest.Mock).mockRestore();
    (console.warn as jest.Mock).mockRestore();
  });

  it('PGRST303 "JWT issued at future" mantém a sessão (sem signOut)', async () => {
    mockProbeDefault = {
      data: null,
      error: { code: 'PGRST303', message: 'JWT issued at future', details: null, hint: null },
    };

    const { getByTestId } = await montarComSessao();

    expect(mockedSignOut).not.toHaveBeenCalled();
    expect(getByTestId('estado').props.children).toBe('logado:user-1');
  });

  it('expiração REAL (PGRST301 "JWT expired") continua deslogando', async () => {
    mockProbeDefault = {
      data: null,
      error: { code: 'PGRST301', message: 'JWT expired', details: null, hint: null },
    };

    const { getByTestId } = await montarComSessao();

    expect(mockedSignOut).toHaveBeenCalled();
    expect(getByTestId('estado').props.children).toBe('deslogado');
  });

  it('token válido segue o fluxo normal (sem signOut)', async () => {
    mockProbeDefault = { data: [], error: null };

    const { getByTestId } = await montarComSessao();

    expect(mockedSignOut).not.toHaveBeenCalled();
    expect(getByTestId('estado').props.children).toBe('logado:user-1');
  });
});
