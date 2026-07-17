// __tests__/fase3-home.test.tsx
// Fase 3 — a Home mostra o plano REAL persistido, sem dado inventado:
// - card "treino de hoje" com a sessão vinda do banco (nada de texto fixo)
// - lista de próximos treinos navegável por sessionId
// - estatísticas sem execução registrada exibem "—" (nunca número fake)

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

// Objeto ESTÁVEL: identidade nova a cada render causaria loop infinito de efeito
const mockAuthState = {
  user: { id: 'user-123', email: 'pedro@exemplo.com' },
  profile: { full_name: 'Pedro Marconato' },
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

const mockHoje = {
  id: 'sess-hoje',
  title: 'Push A',
  session_type: 'Hipertrofia',
  week_number: 1,
  scheduled_date: '2026-07-20',
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito', 'Tríceps'],
};

const mockProximos = [
  mockHoje,
  {
    id: 'sess-2',
    title: 'Pull A',
    session_type: 'Hipertrofia',
    week_number: 1,
    scheduled_date: '2026-07-22',
    estimated_minutes: 55,
    status: 'pending',
    muscle_groups: ['Costas', 'Bíceps'],
  },
];

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => mockHoje),
  getUpcomingSessions: jest.fn(async () => mockProximos),
}));

import HomeScreen from '../src/screens/HomeScreen';

describe('Fase 3 — Home lê o plano persistido', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('exibe o treino de hoje real e não repete a sessão de hoje na lista', async () => {
    const { getByText, queryByText, getAllByText } = render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Push A')).toBeTruthy();
    });
    // o card antigo era texto fixo "Treino de Força" — não pode voltar
    expect(queryByText('Treino de Força')).toBeNull();
    // "Push A" (hoje) não se repete na lista de próximos; "Pull A" aparece
    expect(getAllByText('Push A')).toHaveLength(1);
    expect(getByText('Pull A')).toBeTruthy();
  });

  it('navega para o detalhe com o sessionId real', async () => {
    const { getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Pull A')).toBeTruthy());
    fireEvent.press(getByText('Pull A'));

    expect(mockNavigate).toHaveBeenCalledWith('WorkoutDetail', { sessionId: 'sess-2' });
  });

  it('sem execuções registradas, estatísticas mostram "—" (nada inventado)', async () => {
    const { getAllByText, getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Push A')).toBeTruthy());
    expect(getAllByText('—')).toHaveLength(3);
  });
});
