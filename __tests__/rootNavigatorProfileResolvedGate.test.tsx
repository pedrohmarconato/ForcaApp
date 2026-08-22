// __tests__/rootNavigatorProfileResolvedGate.test.tsx
// Fix aprovado (bug PGRST116/RLS no cold boot, auditoria 19/08): o
// RootNavigator só pode cair no fallback profile===null -> OnboardingNavigator
// (RootNavigator.js:156-160) quando o AuthContext sinaliza
// profileResolved=true — a primeira resolução do usuário atual (incluindo a
// retentativa de fetchProfile em AuthContext.js, ver
// __tests__/authContextPgrst116RlsRetry.test.tsx) já terminou. Enquanto
// profileResolved=false, mesmo com profile===null e loadingProfile=false, o
// RootNavigator deve reaproveitar a tela de loading que já existe
// (RootNavigator.js:125-132), nunca o OnboardingNavigator — senão o
// questionário pisca no cold boot toda vez que o token está vencido.
//
// Molde: __tests__/rootNavigatorInviteTransition.test.tsx (mock de
// AuthContext, useSessionOutboxDrain e dos 3 navigators reais em Stacks
// mínimos, para o NavigationContainer ter algo de verdade por baixo).

import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock('../src/services/jointInvitePending', () => ({
  __esModule: true,
  consumirConvitePendente: jest.fn(async () => null),
  guardarConvitePendente: jest.fn(async () => ({ codigo: '', receivedAt: 0, versao: 0 })),
}));

const mockAuthState: any = {
  session: { user: { id: 'u1' } },
  profile: null,
  profileResolved: false,
  loadingSession: false,
  loadingProfile: false,
  errorProfile: null,
};
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../src/hooks/useSessionOutboxDrain', () => ({
  useSessionOutboxDrain: jest.fn(),
}));

jest.mock('../src/navigation/AuthNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: () => React.createElement(Text, null, 'Auth') };
});

jest.mock('../src/navigation/MainNavigator', () => {
  const React = require('react');
  const { createStackNavigator } = require('@react-navigation/stack');
  const { Text } = require('react-native');
  const Stack = createStackNavigator();
  const Tela = () => React.createElement(Text, { testID: 'main-tela' }, 'Main');
  return {
    __esModule: true,
    default: () =>
      React.createElement(
        Stack.Navigator,
        null,
        React.createElement(Stack.Screen, { name: 'Home', component: Tela }),
      ),
  };
});

jest.mock('../src/navigation/OnboardingNavigator', () => {
  const React = require('react');
  const { createStackNavigator } = require('@react-navigation/stack');
  const { Text } = require('react-native');
  const Stack = createStackNavigator();
  const Tela = () => React.createElement(Text, { testID: 'onboarding-tela' }, 'Onboarding');
  return {
    __esModule: true,
    default: () =>
      React.createElement(
        Stack.Navigator,
        null,
        React.createElement(Stack.Screen, { name: 'OnboardingHome', component: Tela }),
      ),
  };
});

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RootNavigator from '../src/navigation/RootNavigator';
import { __setLinkingBridge } from '../src/navigation/linking';

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.session = { user: { id: 'u1' } };
  mockAuthState.profile = null;
  mockAuthState.profileResolved = false;
  mockAuthState.loadingSession = false;
  mockAuthState.loadingProfile = false;
  mockAuthState.errorProfile = null;
  __setLinkingBridge({
    getInitialURL: async () => null,
    addEventListener: () => ({ remove: () => {} }),
  });
});

describe('RootNavigator — gate de profileResolved no fallback profile===null (questionário piscando no cold boot)', () => {
  it('profile===null e profileResolved===false: mostra loading, NUNCA o OnboardingNavigator', async () => {
    const { queryByTestId, getByText } = render(<RootNavigator />);

    await waitFor(() => expect(getByText('Carregando dados do usuário...')).toBeTruthy());
    expect(queryByTestId('onboarding-tela')).toBeNull();
    expect(queryByTestId('main-tela')).toBeNull();
  });

  it('profile===null e profileResolved===true: cai no OnboardingNavigator (fallback preservado, usuário genuinamente sem linha)', async () => {
    mockAuthState.profileResolved = true;
    const { getByTestId } = render(<RootNavigator />);

    await waitFor(() => expect(getByTestId('onboarding-tela')).toBeTruthy());
  });

  it('profileResolved vira true depois da retentativa em voo: sai do loading e só então decide (Onboarding, aqui sem linha real)', async () => {
    const { getByText, getByTestId, rerender } = render(<RootNavigator />);
    await waitFor(() => expect(getByText('Carregando dados do usuário...')).toBeTruthy());

    mockAuthState.profileResolved = true;
    rerender(<RootNavigator />);

    await waitFor(() => expect(getByTestId('onboarding-tela')).toBeTruthy());
  });
});
