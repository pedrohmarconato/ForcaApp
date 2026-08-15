/**
 * @jest-environment jsdom
 */
// __tests__/pushInviteHost.test.tsx
// Fase 13 Plano 05 — convite ÚNICO de opt-in via alertShim (PUSH-01).
// Molda-se nos mocks já estabelecidos de __tests__/profileScreen.push.test.tsx
// (mesmo padrão de mock de pushSubscription/apiClient/AuthContext).

import React from 'react';
import { render, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockShowAlert = jest.fn();
jest.mock('../src/utils/alertShim', () => ({
  showAlert: (...args: unknown[]) => mockShowAlert(...args),
}));

const mockSubscribeToPush = jest.fn();
let mockIsPushSupported = jest.fn(() => true);
jest.mock('../src/services/pushSubscription', () => ({
  isPushSupported: () => mockIsPushSupported(),
  subscribeToPush: (...args: unknown[]) => mockSubscribeToPush(...args),
}));

const mockApiPost = jest.fn();
jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockApiPost(...args) },
  ENDPOINTS: { PUSH: { SUBSCRIBE: '/push/subscribe' } },
}));

let mockAuthState: { user: { id: string } | null; profile: { current_plan_id?: string } | null } = {
  user: { id: 'user-1' },
  profile: { current_plan_id: 'plan-1' },
};
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

import PushInviteHost from '../src/components/PushInviteHost';

const setNotificationPermission = (permission: 'default' | 'denied' | 'granted') => {
  (global as any).Notification = { permission } as any;
};

/** Flusha a promise de AsyncStorage.getItem antes do setTimeout ser agendado
 * — o efeito lê a flag de forma assíncrona antes de agendar o atraso de
 * exibição, então fake timers sozinhos não bastam sem um microtask tick. */
const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderEAguardarConvite = async () => {
  const utils = render(<PushInviteHost />);
  await flushMicrotasks();
  act(() => {
    jest.advanceTimersByTime(2000);
  });
  return utils;
};

describe('PushInviteHost — convite único de opt-in via alertShim (PUSH-01)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    await AsyncStorage.clear();
    mockIsPushSupported = jest.fn(() => true);
    mockAuthState = { user: { id: 'user-1' }, profile: { current_plan_id: 'plan-1' } };
    setNotificationPermission('default');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('Teste 1: autenticado, com plano, push suportado, permission default, sem flag — mostra o convite exatamente uma vez', async () => {
    await renderEAguardarConvite();

    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    expect(mockShowAlert).toHaveBeenCalledWith(
      'Ativar notificações?',
      expect.any(String),
      expect.any(Array),
    );
  });

  it('Teste 2: flag push_invite_shown já "true" — showAlert NUNCA é chamado', async () => {
    await AsyncStorage.setItem('push_invite_shown:user-1', 'true');

    await renderEAguardarConvite();

    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('Teste 3: onboarding incompleto (current_plan_id ausente) — showAlert nunca é chamado', async () => {
    mockAuthState = { user: { id: 'user-1' }, profile: {} };

    await renderEAguardarConvite();

    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('Teste 4: permission "granted" já decidida — showAlert nunca é chamado', async () => {
    setNotificationPermission('granted');

    await renderEAguardarConvite();

    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('Teste 4b: permission "denied" já decidida — showAlert nunca é chamado', async () => {
    setNotificationPermission('denied');

    await renderEAguardarConvite();

    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  it('Teste 5: toque em "Ativar" — subscribeToPush é chamado como primeira expressão do handler e a flag é gravada', async () => {
    mockSubscribeToPush.mockResolvedValue({ endpoint: 'https://web.push.apple.com/x' });

    await renderEAguardarConvite();
    expect(mockShowAlert).toHaveBeenCalledTimes(1);

    const buttons = mockShowAlert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const botaoAtivar = buttons.find((b) => b.text === 'Ativar');
    expect(botaoAtivar).toBeDefined();

    act(() => {
      botaoAtivar!.onPress?.();
    });

    expect(mockSubscribeToPush).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    expect(mockApiPost).toHaveBeenCalledWith('/push/subscribe', { endpoint: 'https://web.push.apple.com/x' });

    const flag = await AsyncStorage.getItem('push_invite_shown:user-1');
    expect(flag).toBe('true');
  });

  it('WR-02 (13-REVIEW.md): a flag "push_invite_shown" é isolada por usuário — conta B no MESMO navegador ainda vê o convite depois da conta A recusar/aceitar', async () => {
    // Conta A (user-1) recusa o convite no navegador compartilhado —
    // Teste 6 já prova que isso grava a flag para user-1.
    await renderEAguardarConvite();
    expect(mockShowAlert).toHaveBeenCalledTimes(1);
    const buttonsA = mockShowAlert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    act(() => {
      buttonsA.find((b) => b.text === 'Agora não')!.onPress?.();
    });
    await flushMicrotasks();

    // Conta B (user-2, ID DIFERENTE) loga no MESMO navegador/AsyncStorage —
    // nunca tomou decisão nenhuma sobre o convite. Antes do fix, a chave
    // fixa 'push_invite_shown' já estaria 'true' (gravada por A) e o
    // convite NUNCA apareceria para B.
    jest.clearAllMocks();
    mockAuthState = { user: { id: 'user-2' }, profile: { current_plan_id: 'plan-2' } };

    await renderEAguardarConvite();

    expect(mockShowAlert).toHaveBeenCalledTimes(1);
  });

  it('Teste 6: toque em "Agora não" — subscribeToPush NUNCA é chamado, mas a flag ainda assim é gravada', async () => {
    await renderEAguardarConvite();
    expect(mockShowAlert).toHaveBeenCalledTimes(1);

    const buttons = mockShowAlert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    const botaoAgoraNao = buttons.find((b) => b.text === 'Agora não');
    expect(botaoAgoraNao).toBeDefined();

    act(() => {
      botaoAgoraNao!.onPress?.();
    });

    expect(mockSubscribeToPush).not.toHaveBeenCalled();

    await flushMicrotasks();
    const flag = await AsyncStorage.getItem('push_invite_shown:user-1');
    expect(flag).toBe('true');
  });
});
