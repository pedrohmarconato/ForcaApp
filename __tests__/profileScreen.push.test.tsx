/**
 * @jest-environment jsdom
 */
// __tests__/profileScreen.push.test.tsx
// Fase 13 Plano 01, Task 3 — estados do botão de notificações no Perfil:
// subscribed (com subscription existente -> "Desativar"), denied (aviso, sem
// botão) e default (habilitado, "Ativar"). Molda-se EXATAMENTE nos mocks já
// estabelecidos de __tests__/profileScreen.test.tsx.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSignOut = jest.fn(async () => ({}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const limpeza = cb();
      return () => {
        if (typeof limpeza === 'function') limpeza();
      };
    }, [cb]);
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

const mockAuthState = {
  user: { id: 'user-123', email: 'pedro@exemplo.com' },
  profile: { full_name: 'Pedro Marconato' },
  signOut: mockSignOut,
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => []),
}));

jest.mock('../src/services/trainingRepository', () => ({
  hasSessionInProgress: jest.fn(async () => false),
}));

// ProfileScreen chama apiClient.post() diretamente no fluxo de ativar
// (onAtivarNotificacoes). Mock completo do módulo evita tanto a cadeia real
// axios->supabaseClient->env vars quanto uma chamada de rede real em teste.
const mockApiPost = jest.fn();
jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => mockApiPost(...args) },
  ENDPOINTS: { PUSH: { SUBSCRIBE: '/push/subscribe' } },
}));

const mockSubscribeToPush = jest.fn();
const mockUnsubscribeFromPush = jest.fn();
const mockGetExistingSubscriptionState = jest.fn();
let mockIsPushSupported = jest.fn(() => true);

jest.mock('../src/services/pushSubscription', () => ({
  isPushSupported: () => mockIsPushSupported(),
  subscribeToPush: (...args: unknown[]) => mockSubscribeToPush(...args),
  unsubscribeFromPush: (...args: unknown[]) => mockUnsubscribeFromPush(...args),
  getExistingSubscriptionState: (...args: unknown[]) => mockGetExistingSubscriptionState(...args),
}));

import ProfileScreen from '../src/screens/ProfileScreen';

const setNotificationPermission = (permission: 'default' | 'denied' | 'granted') => {
  (global as any).Notification = { permission } as any;
};

describe('ProfileScreen — opt-in/opt-out de notificações (PUSH-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPushSupported = jest.fn(() => true);
    mockGetExistingSubscriptionState.mockResolvedValue('unsubscribed');
    mockApiPost.mockResolvedValue({ data: { status: 'subscribed' } });
  });

  it('Teste 5: permission "default" mostra "Ativar notificações" habilitado', async () => {
    setNotificationPermission('default');
    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Ativar notificações')).toBeTruthy());
  });

  it('Teste 4: permission "denied" mostra aviso e NÃO renderiza botão de ativar/desativar', async () => {
    setNotificationPermission('denied');
    const { getByText, queryByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Notificações desativadas')).toBeTruthy());
    expect(queryByText('Ativar notificações')).toBeNull();
    expect(queryByText('Desativar notificações')).toBeNull();
  });

  it('Teste 3: permission "granted" + subscription existente renderiza "Desativar notificações"; ao tocar, chama unsubscribe e volta para "Ativar notificações"', async () => {
    setNotificationPermission('granted');
    mockGetExistingSubscriptionState.mockResolvedValue('subscribed');
    mockUnsubscribeFromPush.mockResolvedValue(undefined);

    const { getByText, queryByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Desativar notificações')).toBeTruthy());

    fireEvent.press(getByText('Desativar notificações'));

    await waitFor(() => expect(mockUnsubscribeFromPush).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText('Ativar notificações')).toBeTruthy());
    expect(queryByText('Desativar notificações')).toBeNull();
  });

  it('permission "granted" SEM subscription existente (nunca ativou de fato) mostra "Ativar notificações"', async () => {
    setNotificationPermission('granted');
    mockGetExistingSubscriptionState.mockResolvedValue('unsubscribed');

    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Ativar notificações')).toBeTruthy());
  });

  it('"unsupported" (isPushSupported false) não renderiza nenhum bloco de notificações', async () => {
    mockIsPushSupported = jest.fn(() => false);
    const { getByText, queryByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());
    expect(queryByText('Ativar notificações')).toBeNull();
    expect(queryByText('Desativar notificações')).toBeNull();
    expect(queryByText('Notificações desativadas')).toBeNull();
  });

  it('ativar notificações com sucesso persiste e o botão vira "Desativar notificações"', async () => {
    setNotificationPermission('default');
    mockSubscribeToPush.mockResolvedValue({ endpoint: 'https://web.push.apple.com/x', keys: { p256dh: 'a', auth: 'b' } });

    const { getByText, queryByText } = render(<ProfileScreen />);
    await waitFor(() => expect(getByText('Ativar notificações')).toBeTruthy());

    fireEvent.press(getByText('Ativar notificações'));

    await waitFor(() => expect(getByText('Desativar notificações')).toBeTruthy());
    expect(queryByText('Ativar notificações')).toBeNull();
    expect(mockSubscribeToPush).toHaveBeenCalledTimes(1);
  });
});
