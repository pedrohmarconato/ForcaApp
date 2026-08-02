// __tests__/homeScreenAtrasado.test.tsx
// Testes para o chip de atraso na HomeScreen

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

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

// Data local de hoje
const hojeLocalISO = () => {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
};

// Data de ontem
const ontemLocalISO = () => {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const mes = String(ontem.getMonth() + 1).padStart(2, '0');
  const dia = String(ontem.getDate()).padStart(2, '0');
  return `${ontem.getFullYear()}-${mes}-${dia}`;
};

// Data de amanhã
const amanhaLocalISO = () => {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const mes = String(amanha.getMonth() + 1).padStart(2, '0');
  const dia = String(amanha.getDate()).padStart(2, '0');
  return `${amanha.getFullYear()}-${mes}-${dia}`;
};

let mockTodaySession: any = null;
let mockUpcomingSessions: any[] = [];
let mockCompletedSessions: any[] = [];

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => mockTodaySession),
  getUpcomingSessions: jest.fn(async () => mockUpcomingSessions),
}));

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => mockCompletedSessions),
}));

import HomeScreen from '../src/screens/HomeScreen';

const sessaoBase = {
  id: 'sess-today',
  title: 'Push A',
  session_type: 'Hipertrofia',
  week_number: 1,
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito', 'Tríceps'],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTodaySession = null;
  mockUpcomingSessions = [];
  mockCompletedSessions = [];
});

describe('HomeScreen - Chip de atraso', () => {
  it('mostra chip "Atrasado" quando scheduled_date < hoje e status = pending', async () => {
    mockTodaySession = {
      ...sessaoBase,
      scheduled_date: ontemLocalISO(),
      status: 'pending',
    };
    mockUpcomingSessions = [mockTodaySession];

    const utils = render(<HomeScreen />);
    await waitFor(() => expect(utils.queryByText('Atrasado')).toBeTruthy());
  });

  it('não mostra chip "Atrasado" quando scheduled_date = hoje', async () => {
    mockTodaySession = {
      ...sessaoBase,
      scheduled_date: hojeLocalISO(),
      status: 'pending',
    };
    mockUpcomingSessions = [mockTodaySession];

    const utils = render(<HomeScreen />);
    await waitFor(() => expect(utils.getByText('Push A')).toBeTruthy());
    expect(utils.queryByText('Atrasado')).toBeNull();
  });

  it('não mostra chip "Atrasado" quando scheduled_date > hoje', async () => {
    mockTodaySession = {
      ...sessaoBase,
      scheduled_date: amanhaLocalISO(),
      status: 'pending',
    };
    mockUpcomingSessions = [mockTodaySession];

    const utils = render(<HomeScreen />);
    await waitFor(() => expect(utils.getByText('Push A')).toBeTruthy());
    expect(utils.queryByText('Atrasado')).toBeNull();
  });

  it('não mostra chip "Atrasado" quando status ≠ pending, mesmo com data passada', async () => {
    mockTodaySession = {
      ...sessaoBase,
      scheduled_date: ontemLocalISO(),
      status: 'completed',
    };
    mockUpcomingSessions = [mockTodaySession];

    const utils = render(<HomeScreen />);
    await waitFor(() => expect(utils.getByText('Push A')).toBeTruthy());
    expect(utils.queryByText('Atrasado')).toBeNull();
  });

  it('não mostra chip "Atrasado" quando scheduled_date é null', async () => {
    mockTodaySession = {
      ...sessaoBase,
      scheduled_date: null,
      status: 'pending',
    };
    mockUpcomingSessions = [mockTodaySession];

    const utils = render(<HomeScreen />);
    await waitFor(() => expect(utils.getByText('Push A')).toBeTruthy());
    expect(utils.queryByText('Atrasado')).toBeNull();
  });
});
