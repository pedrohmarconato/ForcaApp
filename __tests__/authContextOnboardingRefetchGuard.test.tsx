// __tests__/authContextOnboardingRefetchGuard.test.tsx
// Janela confirmada (auditoria 21/08): a submissão do questionário grava
// onboarding_completed=true DIRETO no banco (onboardingRepository.ts),
// mantendo o `profile` local do AuthContext em `onboarding_completed:false`
// durante a sessão de onboarding — o flip do RootNavigator (gate em
// RootNavigator.js:41, troca de árvore :148-160) deve vir SÓ do
// updateProfile no fim do chat (PostQuestionnaireChat.tsx:360) ou do
// próximo cold start.
//
// O handler de TOKEN_REFRESHED/USER_UPDATED em AuthContext.js:361-371 refaz
// fetchProfile PARA O MESMO USUÁRIO. Se isso rodar no meio do onboarding
// (autoRefreshToken perto do TTL, ou qualquer 401 no chat/geração de plano
// que force refreshSession()), o setProfile(data) com onboarding_completed
// já true no banco arrancava o usuário do chat — reintroduzindo por via
// indireta o bug que a gravação direta no banco acabou de corrigir.
//
// Este arquivo prova que o refetch same-user (TOKEN_REFRESHED/USER_UPDATED)
// preserva a visão local de onboarding em progresso, e que os três outros
// caminhos (cold start, troca de usuário, updateProfile explícito)
// continuam lendo o banco como está.

import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';

let mockAuthCallback: ((event: string, session: unknown) => Promise<void>) | null = null;

// Estado "banco" controlado pelo teste — simula a linha `profiles` que o
// onboardingRepository/updateProfile leriam/gravariam.
let mockProfileRow: Record<string, unknown> = { id: 'user-1', onboarding_completed: false };

const sessionDe = (userId: string) => ({ access_token: `tok-${userId}`, user: { id: userId } });

function mockBuilder() {
  const b: any = {};
  let pendingUpdate: Record<string, unknown> | null = null;
  b.select = () => b;
  b.update = (updates: Record<string, unknown>) => {
    pendingUpdate = updates;
    return b;
  };
  b.eq = () => b;
  // Sonda do verifyTokenValidity: select('id').limit(1)
  b.limit = async () => ({ data: [], error: null });
  // fetchProfile: select('*').eq().single()
  // updateProfile: update(updates).eq().select().single()
  b.single = async () => {
    if (pendingUpdate) {
      const merged = { ...mockProfileRow, ...pendingUpdate };
      mockProfileRow = merged;
      pendingUpdate = null;
      return { data: merged, error: null };
    }
    return { data: mockProfileRow, error: null };
  };
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
  const { profile, loadingSession, updateProfile } = useAuth();
  return (
    <Pressable
      testID="flip-onboarding"
      onPress={() => updateProfile({ onboarding_completed: true })}
    >
      <Text testID="estado">
        {loadingSession
          ? 'carregando'
          : profile
            ? `onboarding_completed:${String(profile.onboarding_completed)}`
            : 'sem-perfil'}
      </Text>
    </Pressable>
  );
};

const montar = async () => {
  const utils = render(
    <AuthProvider>
      <Consumer />
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

const dispararEventoMesmoUsuario = async (event: string, userId: string) => {
  await act(async () => {
    mockAuthCallback?.(event, sessionDe(userId));
    await jest.advanceTimersByTimeAsync(10_000);
  });
};

describe('AuthContext — refetch same-user (TOKEN_REFRESHED/USER_UPDATED) não pode arrancar o usuário do onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthCallback = null;
    mockProfileRow = { id: 'user-1', onboarding_completed: false };
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

  it('(a+b+c) TOKEN_REFRESHED com banco onboarding_completed=true mantém o local em false', async () => {
    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');

    // Estado local começa alinhado ao banco (false).
    expect(getByTestId('estado').props.children).toBe('onboarding_completed:false');

    // O usuário termina o questionário: onboardingRepository grava true
    // DIRETO no banco, sem passar pelo AuthContext (é exatamente o cenário
    // do bug original, agora sob um refresh de token no meio do chat).
    mockProfileRow = { id: 'user-1', onboarding_completed: true };

    await dispararEventoMesmoUsuario('TOKEN_REFRESHED', 'user-1');

    // O RootNavigator usa este mesmo `profile.onboarding_completed` como
    // gate (RootNavigator.js:41,148-160) — se o valor local virasse `true`
    // aqui, o usuário seria arrancado do OnboardingNavigator no meio do chat.
    expect(getByTestId('estado').props.children).toBe('onboarding_completed:false');
  });

  it('(a+b+c) USER_UPDATED com banco onboarding_completed=true mantém o local em false', async () => {
    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');

    expect(getByTestId('estado').props.children).toBe('onboarding_completed:false');

    mockProfileRow = { id: 'user-1', onboarding_completed: true };

    await dispararEventoMesmoUsuario('USER_UPDATED', 'user-1');

    expect(getByTestId('estado').props.children).toBe('onboarding_completed:false');
  });

  it('(d) controle — updateProfile({onboarding_completed:true}) explícito no fim do chat flipa normalmente', async () => {
    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');

    expect(getByTestId('estado').props.children).toBe('onboarding_completed:false');

    await act(async () => {
      fireEvent.press(getByTestId('flip-onboarding'));
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(getByTestId('estado').props.children).toBe('onboarding_completed:true');
  });

  it('(e) controle — cold start com banco onboarding_completed=true entrega local true (sem guarda)', async () => {
    mockProfileRow = { id: 'user-1', onboarding_completed: true };

    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');

    expect(getByTestId('estado').props.children).toBe('onboarding_completed:true');
  });

  it('(f) controle — troca de usuário lê o banco do novo usuário, sem herdar o false do anterior', async () => {
    const { getByTestId } = await montar();
    await dispararEventoInicial('user-1');
    expect(getByTestId('estado').props.children).toBe('onboarding_completed:false');

    // Troca de usuário: user-2 já está com onboarding completo no banco.
    mockProfileRow = { id: 'user-2', onboarding_completed: true };
    await dispararEventoMesmoUsuario('SIGNED_IN', 'user-2');

    expect(getByTestId('estado').props.children).toBe('onboarding_completed:true');
  });
});
