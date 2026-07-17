// __tests__/fase3-home.test.tsx
// Fase 3 — a Home mostra o plano REAL persistido, sem dado inventado:
// - card do treino com a sessão vinda do banco (nada de texto fixo)
// - rótulo honesto: "hoje" só quando a data é hoje (achado #8 do review)
// - erro de banco ≠ "nenhum treino" (achado #9 do review)
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

// Data local de hoje no mesmo formato usado pela tela
const hojeLocalISO = () => {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
};

const sessaoBase = {
  id: 'sess-hoje',
  title: 'Push A',
  session_type: 'Hipertrofia',
  week_number: 1,
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito', 'Tríceps'],
};

// Estado mutável controlado por cada teste
let mockRespostaHoje: any = null;
let mockRespostaProximos: any[] = [];
let mockFalhaBanco: Error | null = null;

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => {
    if (mockFalhaBanco) throw mockFalhaBanco;
    return mockRespostaHoje;
  }),
  getUpcomingSessions: jest.fn(async () => {
    if (mockFalhaBanco) throw mockFalhaBanco;
    return mockRespostaProximos;
  }),
}));

import HomeScreen from '../src/screens/HomeScreen';

describe('Fase 3 — Home lê o plano persistido', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFalhaBanco = null;
    mockRespostaHoje = { ...sessaoBase, scheduled_date: hojeLocalISO() };
    mockRespostaProximos = [
      mockRespostaHoje,
      {
        id: 'sess-2',
        title: 'Pull A',
        session_type: 'Hipertrofia',
        week_number: 1,
        scheduled_date: '2099-01-03',
        estimated_minutes: 55,
        status: 'pending',
        muscle_groups: ['Costas', 'Bíceps'],
      },
    ];
  });

  it('exibe o treino real de hoje com o rótulo "hoje" e não repete na lista', async () => {
    const { getByText, queryByText, getAllByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Push A')).toBeTruthy());
    expect(getByText('Seu treino de hoje')).toBeTruthy();
    // o card antigo era texto fixo "Treino de Força" — não pode voltar
    expect(queryByText('Treino de Força')).toBeNull();
    expect(getAllByText('Push A')).toHaveLength(1);
    expect(getByText('Pull A')).toBeTruthy();
  });

  it('sessão com data futura ganha o rótulo honesto "Seu próximo treino" (achado #8)', async () => {
    mockRespostaHoje = { ...sessaoBase, scheduled_date: '2099-01-01' };

    const { getByText, queryByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Push A')).toBeTruthy());
    expect(getByText('Seu próximo treino')).toBeTruthy();
    expect(queryByText('Seu treino de hoje')).toBeNull();
  });

  it('erro de banco mostra erro — NUNCA "Nenhum treino pendente" (achado #9)', async () => {
    mockFalhaBanco = new Error('tabela não existe');

    const { getByText, queryByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Não foi possível carregar')).toBeTruthy());
    expect(getByText('Não foi possível carregar seus treinos.')).toBeTruthy();
    expect(queryByText('Nenhum treino pendente')).toBeNull();
    expect(queryByText('Nenhum treino agendado')).toBeNull();
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
