/**
 * @jest-environment jsdom
 */
// __tests__/authContextSignOut.test.tsx
// WR-01 (13-REVIEW.md, iteração 2): unsubscribeFromPush() existia mas nunca
// era chamado a partir de signOut() — num browser/device compartilhado, a
// subscription (escopo origem+SW, não conta) sobrevive ao logout e pode ser
// silenciosamente reassinada pela próxima conta que ativar notificações, ou
// continuar entregando pushes da conta anterior na tela do device atual.
// Este teste prova que signOut() chama unsubscribeFromPush() best-effort:
// nunca aguardado de forma bloqueante e nunca capaz de impedir o logout.

import React from 'react';
import { Text } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

let mockAuthCallback: ((event: string, session: unknown) => Promise<void>) | null = null;
const mockSession = { access_token: 'tok-valido', user: { id: 'user-1' } };

function mockBuilder() {
  const b: any = {};
  b.select = () => b;
  b.update = () => b;
  b.eq = () => b;
  b.limit = async () => ({ data: [], error: null });
  b.single = async () => ({ data: null, error: { code: 'PGRST116', message: 'not found' }, status: 406 });
  return b;
}

const mockSupabaseSignOut = jest.fn(async () => ({ error: null }));

jest.mock('../src/config/supabaseClient', () => ({
  storageReady: Promise.resolve(),
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
      onAuthStateChange: jest.fn((cb: any) => {
        mockAuthCallback = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signOut: (...args: unknown[]) => mockSupabaseSignOut(...args),
    },
    from: jest.fn(() => mockBuilder()),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

let mockIsPushSupported = jest.fn(() => true);
const mockUnsubscribeFromPush = jest.fn(async () => undefined);

jest.mock('../src/services/pushSubscription', () => ({
  isPushSupported: () => mockIsPushSupported(),
  unsubscribeFromPush: (...args: unknown[]) => mockUnsubscribeFromPush(...args),
}));

import { AuthProvider, useAuth } from '../src/contexts/AuthContext';

const Consumer = () => {
  const { user, loadingSession, signOut } = useAuth();
  return (
    <Text testID="estado" onPress={() => signOut()}>
      {loadingSession ? 'carregando' : user ? `logado:${user.id}` : 'deslogado'}
    </Text>
  );
};

const montarComSessao = async () => {
  const utils = render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(10_000);
  });
  await act(async () => {
    mockAuthCallback?.('INITIAL_SESSION', mockSession);
    await jest.advanceTimersByTimeAsync(10_000);
  });
  return utils;
};

describe('AuthContext — signOut desativa push best-effort (WR-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthCallback = null;
    mockIsPushSupported = jest.fn(() => true);
    mockUnsubscribeFromPush.mockResolvedValue(undefined);
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

  it('signOut() chama unsubscribeFromPush() quando o push é suportado (web)', async () => {
    const { getByTestId } = await montarComSessao();

    await act(async () => {
      fireEvent.press(getByTestId('estado'));
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(mockUnsubscribeFromPush).toHaveBeenCalledTimes(1);
    expect(getByTestId('estado').props.children).toBe('deslogado');
  });

  it('signOut() completa o logout mesmo se unsubscribeFromPush() rejeitar (best-effort, nunca bloqueia)', async () => {
    mockUnsubscribeFromPush.mockRejectedValue(new Error('falha de rede simulada'));
    const { getByTestId } = await montarComSessao();

    await act(async () => {
      fireEvent.press(getByTestId('estado'));
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(mockSupabaseSignOut).toHaveBeenCalledTimes(1);
    expect(getByTestId('estado').props.children).toBe('deslogado');
  });

  it('signOut() NÃO chama unsubscribeFromPush() quando o push não é suportado (nativo)', async () => {
    mockIsPushSupported = jest.fn(() => false);
    const { getByTestId } = await montarComSessao();

    await act(async () => {
      fireEvent.press(getByTestId('estado'));
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(mockUnsubscribeFromPush).not.toHaveBeenCalled();
    expect(getByTestId('estado').props.children).toBe('deslogado');
  });
});
