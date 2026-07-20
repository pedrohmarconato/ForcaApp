// __tests__/profileScreen.test.tsx
// Perfil após a remodelagem para a Direção 02.
//
// O teste decisivo é o das métricas: falha ao carregar o histórico NÃO pode
// virar "0 sessões". Sem amostra confiável, a tela mostra "—".

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSignOut = jest.fn(async () => ({}));

// Callbacks registrados via useFocusEffect, para simular a tela ganhando foco
// de novo (ex.: voltar de uma sessão concluída via popToTop — achado #6).
let mockFocusCallbacks: Array<() => void | (() => void)> = [];
const dispararFocus = () => mockFocusCallbacks.forEach((cb) => cb());

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => {
      mockFocusCallbacks.push(cb);
      const limpeza = cb();
      return () => {
        mockFocusCallbacks = mockFocusCallbacks.filter((registrado) => registrado !== cb);
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

let mockConcluidas: any[] = [];
let mockFalha: Error | null = null;

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => {
    if (mockFalha) throw mockFalha;
    return mockConcluidas;
  }),
}));

import ProfileScreen from '../src/screens/ProfileScreen';
import { NO_DATA } from '../src/components/ui/Feedback';

/** Sessão concluída há `diasAtras` dias, com duração conhecida. */
const concluida = (id: string, duracaoMin: number, diasAtras = 0) => {
  const fim = new Date();
  fim.setDate(fim.getDate() - diasAtras);
  const inicio = new Date(fim.getTime() - duracaoMin * 60000);
  return {
    sessionLogId: id,
    plannedSessionId: 'sess-x',
    title: 'Lower body A',
    weekNumber: 1,
    muscleGroups: ['Pernas'],
    startedAt: inicio.toISOString(),
    finishedAt: fim.toISOString(),
  };
};

describe('ProfileScreen — identidade e navegação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFalha = null;
    mockConcluidas = [];
  });

  it('mostra nome e e-mail vindos do contexto de auth', async () => {
    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());
    expect(getByText('pedro@exemplo.com')).toBeTruthy();
  });

  it('abre o histórico de treinos', async () => {
    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Histórico de treinos')).toBeTruthy());
    fireEvent.press(getByText('Histórico de treinos'));

    expect(mockNavigate).toHaveBeenCalledWith('SessionHistory');
  });

  it('encerra a sessão pelo botão Sair', async () => {
    const { getByLabelText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByLabelText('Sair')).toBeTruthy());
    fireEvent.press(getByLabelText('Sair'));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('ProfileScreen — métricas nunca inventam número', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFalha = null;
    mockConcluidas = [];
  });

  it('falha ao carregar o histórico mostra "—", NUNCA zero', async () => {
    mockFalha = new Error('rede caiu');

    const { getAllByText, getByText, queryByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('Não foi possível carregar seus números')).toBeTruthy());
    // As três métricas ficam sem dado
    expect(getAllByText(NO_DATA)).toHaveLength(3);
    expect(queryByText('0')).toBeNull();
  });

  it('sem nenhum treino concluído, o zero é real e aparece como zero', async () => {
    mockConcluidas = [];

    const { getAllByText, queryByText } = render(<ProfileScreen />);

    // Sessões = 0 e Nesta semana = 0 são fatos; só o tempo total fica sem dado
    await waitFor(() => expect(getAllByText('0')).toHaveLength(2));
    expect(queryByText('Não foi possível carregar seus números')).toBeNull();
    // Tempo total sem amostra é "—", nunca "0 min" (achado #3)
    expect(queryByText('0 min')).toBeNull();
    expect(getAllByText(NO_DATA)).toHaveLength(1);
  });

  it('ganhar foco de novo recarrega o histórico (achado #6)', async () => {
    mockConcluidas = [concluida('log-1', 45)];

    const { getByText, getAllByText } = render(<ProfileScreen />);
    await waitFor(() => expect(getByText('45 min')).toBeTruthy());

    // Usuário conclui outro treino em outra tela e volta via popToTop
    mockConcluidas = [concluida('log-1', 45), concluida('log-2', 45)];
    act(() => dispararFocus());

    await waitFor(() => expect(getAllByText('2')).toHaveLength(2));
    expect(getByText('1h 30min')).toBeTruthy();
  });

  it('com execuções reais, soma sessões e tempo total', async () => {
    mockConcluidas = [concluida('log-1', 50), concluida('log-2', 40)];

    const { getAllByText, getByText } = render(<ProfileScreen />);

    // Ambas as sessões são de hoje: "Sessões" e "Nesta semana" valem 2
    await waitFor(() => expect(getAllByText('2')).toHaveLength(2));
    expect(getByText('1h 30min')).toBeTruthy();
  });

  it('separa o total de sessões da contagem da semana', async () => {
    // Uma nesta semana, outra há três semanas
    mockConcluidas = [concluida('log-1', 45), concluida('log-2', 45, 21)];

    const { getByText, getAllByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText('2')).toBeTruthy()); // total de sessões
    expect(getAllByText('1')).toHaveLength(1); // só uma nesta semana
    expect(getByText('1h 30min')).toBeTruthy(); // tempo total soma as duas
  });

  it('sessão sem término não conta no tempo total', async () => {
    mockConcluidas = [
      concluida('log-1', 45),
      {
        sessionLogId: 'log-2',
        plannedSessionId: 'sess-y',
        title: 'Em andamento',
        weekNumber: 1,
        muscleGroups: [],
        startedAt: new Date().toISOString(),
        finishedAt: null,
      },
    ];

    const { getByText } = render(<ProfileScreen />);

    // Duas linhas no histórico, mas só uma tem duração conhecida
    await waitFor(() => expect(getByText('45 min')).toBeTruthy());
  });
});
