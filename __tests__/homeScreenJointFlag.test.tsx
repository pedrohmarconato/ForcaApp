// __tests__/homeScreenJointFlag.test.tsx
// Achado A1 (review 2026-08-05): JointEntryCard aparecia na Home sem condição
// nenhuma. Em produção, sem a migration 0026 aplicada, o card quebra já na
// criação, e o lobby (JointLobbyScreen) é beco sem saída. Gate por flag:
// EXPO_PUBLIC_ENABLE_JOINT_TRAINING — 'true'/'false' explícito sempre vence;
// sem valor setado, cai no __DEV__ do bundle (dev local = ON, build de
// release/HML = OFF até a env ser setada).

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: jest.fn((cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, [cb]);
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

const mockAuthState = {
  user: { id: 'user-123', email: 'test@example.com' },
  profile: { full_name: 'Test User' },
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => null),
  getUpcomingSessions: jest.fn(async () => []),
  fecharSessoesDeSemanasVencidas: jest.fn(async () => ({ fechadas: 0 })),
}));

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => []),
}));

import HomeScreen from '../src/screens/HomeScreen';

const originalEnv = process.env;
const originalDev = (global as any).__DEV__;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
  delete process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING;
});

afterEach(() => {
  process.env = originalEnv;
  (global as any).__DEV__ = originalDev;
});

describe('HomeScreen — gate do card de treino conjunto (achado A1)', () => {
  it('flag OFF (env="false"): a Home NÃO renderiza o card de treino conjunto', async () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'false';

    const { queryByTestId, queryByText } = render(<HomeScreen />);
    await waitFor(() => expect(queryByTestId('card-treino-conjunto')).toBeNull());
    expect(queryByText('Treinar junto')).toBeNull();
  });

  it('flag ON (env="true"): a Home renderiza o card e o fluxo de criar/entrar continua', async () => {
    process.env.EXPO_PUBLIC_ENABLE_JOINT_TRAINING = 'true';

    const { getByTestId, getByText } = render(<HomeScreen />);
    await waitFor(() => expect(getByTestId('card-treino-conjunto')).toBeTruthy());

    fireEvent.press(getByText('Convidar alguém'));
    expect(mockNavigate).toHaveBeenCalledWith('JointInvite');

    fireEvent.press(getByText('Entrar com código'));
    expect(mockNavigate).toHaveBeenCalledWith('JointJoin', {});
  });

  it('sem env setada e __DEV__ false (produção): card fica OFF por default', async () => {
    (global as any).__DEV__ = false;

    const { queryByTestId } = render(<HomeScreen />);
    await waitFor(() => expect(queryByTestId('card-treino-conjunto')).toBeNull());
  });

  it('sem env setada e __DEV__ true (dev local): card fica ON por default', async () => {
    (global as any).__DEV__ = true;

    const { getByTestId } = render(<HomeScreen />);
    await waitFor(() => expect(getByTestId('card-treino-conjunto')).toBeTruthy());
  });
});
