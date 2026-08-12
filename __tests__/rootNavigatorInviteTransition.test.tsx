// __tests__/rootNavigatorInviteTransition.test.tsx
// Achado N2 (painel, review 2026-08-06): convite pendente guardado ainda
// deslogado NUNCA era consumido quando login/onboarding terminava no MESMO
// processo. `RootNavigator` sempre retorna o MESMO `<NavigationContainer>` na
// posição final da função (Onboarding OU Main) — React não desmonta esse
// elemento quando `ehMain` vira `true`, e o `onReady` do react-navigation só
// dispara UMA VEZ NA VIDA do componente (a promise de `useThenable` é fixada
// na 1ª render, ver node_modules/@react-navigation/native/src/useThenable.tsx
// e NavigationContainer.tsx: `useEffect(() => { if (isReady) onReadyRef
// .current?.(); }, [isReady])` só reroda quando `isReady` muda, e `isReady`
// não depende de `ehMain`). O convite ficava preso no AsyncStorage até o TTL
// de 15 min ou até um cold start.

import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

const mockConsumirConvitePendente = jest.fn(
  async (_dispatch: (codigo: string) => boolean | Promise<boolean>) => null,
);
jest.mock('../src/services/jointInvitePending', () => ({
  __esModule: true,
  consumirConvitePendente: (dispatch: (codigo: string) => boolean | Promise<boolean>) =>
    mockConsumirConvitePendente(dispatch),
  guardarConvitePendente: jest.fn(async () => ({ codigo: '', receivedAt: 0, versao: 0 })),
}));

const mockAuthState: any = {
  session: { user: { id: 'u1' } },
  profile: { onboarding_completed: false },
  loadingSession: false,
  loadingProfile: false,
  errorProfile: null,
};
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

// Fase 4 (REQ-07): RootNavigator monta useSessionOutboxDrain (D-10), que
// importa sessionOutboxDrain -> sessionExecutionRepository -> o cliente
// Supabase real (que exige EXPO_PUBLIC_SUPABASE_URL/ANON_KEY). Este teste não
// exercita a drenagem da fila — mocka o hook como no-op, no mesmo espírito de
// mockar AuthContext/navigators acima.
jest.mock('../src/hooks/useSessionOutboxDrain', () => ({
  useSessionOutboxDrain: jest.fn(),
}));

jest.mock('../src/navigation/AuthNavigator', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { __esModule: true, default: () => React.createElement(Text, null, 'Auth') };
});

// Onboarding e Main são Stacks REAIS (não um `<Text/>` solto): o container só
// fica pronto (isReady/onReady/focus listener) com um Navigator de verdade por
// baixo — é o mesmo padrão de __tests__/jointLinkingBack.test.tsx.
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
  mockAuthState.profile = { onboarding_completed: false };
  mockAuthState.loadingSession = false;
  mockAuthState.loadingProfile = false;
  mockAuthState.errorProfile = null;
  // `linkingInterceptor.getInitialURL` usa `import('react-native')` dinâmico —
  // sem --experimental-vm-modules o Jest não resolve isso. Injeta a fronteira
  // real usada em produção (ver `__setLinkingBridge`) para o teste não depender
  // desse detalhe de bundling e focar só na transição Onboarding→Main.
  __setLinkingBridge({
    getInitialURL: async () => null,
    addEventListener: () => ({ remove: () => {} }),
  });
});

describe('RootNavigator — convite pendente na transição Onboarding→Main (achado N2)', () => {
  it('consome o convite quando ehMain vira true no MESMO container, sem cold start', async () => {
    const { getByTestId, rerender } = render(<RootNavigator />);
    await waitFor(() => expect(getByTestId('onboarding-tela')).toBeTruthy());

    // container já ficou pronto (onReady disparou) enquanto ainda em
    // onboarding: ehMain era false, então nada deveria ter sido consumido.
    expect(mockConsumirConvitePendente).not.toHaveBeenCalled();

    // Onboarding completa NO MESMO processo: profile muda, ehMain vira true,
    // mas é o MESMO elemento <NavigationContainer> (mesma posição/tipo).
    mockAuthState.profile = { onboarding_completed: true };
    rerender(<RootNavigator />);

    await waitFor(() => expect(getByTestId('main-tela')).toBeTruthy());
    await waitFor(() => expect(mockConsumirConvitePendente).toHaveBeenCalledTimes(1));
  });

  it('cold start com ehMain=true desde o início consome exatamente 1 vez (sem despacho duplicado)', async () => {
    mockAuthState.profile = { onboarding_completed: true };
    const { getByTestId } = render(<RootNavigator />);

    await waitFor(() => expect(getByTestId('main-tela')).toBeTruthy());
    await waitFor(() => expect(mockConsumirConvitePendente).toHaveBeenCalledTimes(1));

    // Flush extra de re-renders/efeitos: não pode duplicar o despacho.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockConsumirConvitePendente).toHaveBeenCalledTimes(1);
  });
});
