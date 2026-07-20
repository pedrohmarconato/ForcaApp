// __tests__/fase3-home.test.tsx
// Fase 3 — a Home mostra o plano REAL persistido, sem dado inventado:
// - card do treino com a sessão vinda do banco (nada de texto fixo)
// - rótulo honesto: "hoje" só quando a data é hoje (achado #8 do review)
// - erro de banco ≠ "nenhum treino" (achado #9 do review)
// - lista de próximos treinos navegável por sessionId
//
// Atualizado na remodelagem para a Direção 02: o bloco de estatísticas com três
// "—" deu lugar a "Sua semana", alimentado pelo histórico REAL de execuções.
// A garantia é a mesma e ficou mais forte — sem amostra, estado vazio; com
// amostra, apenas contagem e dias observados. Nunca percentual de adesão, que
// exigiria uma meta semanal que o app não persiste.

import React from 'react';
import { render, waitFor, fireEvent, act } from '@testing-library/react-native';

const mockNavigate = jest.fn();

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
let mockConcluidas: any[] = [];
let mockFalhaHistorico: Error | null = null;

// Modo manual: cada chamada ao histórico vira uma promessa pendente que o
// teste resolve/rejeita quando quiser (para provar gate de loading e races).
let mockHistoricoManual = false;
let historicoPendentes: Array<{
  resolve: (v: any[]) => void;
  reject: (e: Error) => void;
}> = [];

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

const mockGetCompletedSessions = jest.fn((): Promise<any[]> => {
  if (mockHistoricoManual) {
    return new Promise((resolve, reject) => {
      historicoPendentes.push({ resolve, reject });
    });
  }
  if (mockFalhaHistorico) return Promise.reject(mockFalhaHistorico);
  return Promise.resolve(mockConcluidas);
});

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: (...args: unknown[]) => mockGetCompletedSessions(...(args as [])),
}));

import HomeScreen from '../src/screens/HomeScreen';

/** Sessão concluída hoje, com duração conhecida. */
const concluidaHoje = (title: string, duracaoMin: number) => {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - duracaoMin * 60000);
  return {
    sessionLogId: `log-${title}`,
    plannedSessionId: 'sess-x',
    title,
    weekNumber: 1,
    muscleGroups: ['Pernas'],
    startedAt: inicio.toISOString(),
    finishedAt: fim.toISOString(),
  };
};

describe('Fase 3 — Home lê o plano persistido', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFalhaBanco = null;
    mockFalhaHistorico = null;
    mockHistoricoManual = false;
    historicoPendentes = [];
    mockConcluidas = [];
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
});

describe('Home — "Sua semana" só mostra dado real', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockFalhaBanco = null;
    mockFalhaHistorico = null;
    mockHistoricoManual = false;
    historicoPendentes = [];
    mockConcluidas = [];
    mockRespostaHoje = { ...sessaoBase, scheduled_date: hojeLocalISO() };
    mockRespostaProximos = [];
  });

  it('sem execuções registradas, mostra estado vazio — nenhum número na tela', async () => {
    const { getByText, queryByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Nenhum treino concluído nesta semana')).toBeTruthy());
    expect(queryByTestId('card-semana')).toBeNull();
    // Sem histórico não existe bloco de última sessão
    expect(queryByTestId('linha-ultima-sessao')).toBeNull();
  });

  it('com execuções reais, conta os treinos concluídos da semana', async () => {
    mockConcluidas = [concluidaHoje('Lower body A', 48), concluidaHoje('Upper body A', 52)];

    const { getByTestId, getByText, queryByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('card-semana')).toBeTruthy());
    expect(getByText('2')).toBeTruthy();
    expect(getByText('treinos')).toBeTruthy();
    // Nada de percentual de adesão: não há meta semanal persistida
    expect(queryByText(/%/)).toBeNull();
  });

  it('usa o singular quando há exatamente um treino concluído', async () => {
    mockConcluidas = [concluidaHoje('Lower body A', 45)];

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('1')).toBeTruthy());
    expect(getByText('treino')).toBeTruthy();
  });

  it('mostra a última sessão com duração e data reais', async () => {
    mockConcluidas = [concluidaHoje('Lower body A', 48)];

    const { getByTestId, getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('linha-ultima-sessao')).toBeTruthy());
    expect(getByText(/48 min/)).toBeTruthy();
  });

  it('falha no histórico não derruba o card do treino de hoje', async () => {
    mockFalhaHistorico = new Error('rede caiu');

    const { getByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Push A')).toBeTruthy());
    expect(getByText('Não foi possível carregar sua semana')).toBeTruthy();
  });
});

describe('Home — correções do review adversarial do PR #13', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGetCompletedSessions.mockClear();
    mockFalhaBanco = null;
    mockFalhaHistorico = null;
    mockHistoricoManual = false;
    historicoPendentes = [];
    mockConcluidas = [];
    mockRespostaHoje = { ...sessaoBase, scheduled_date: hojeLocalISO() };
    mockRespostaProximos = [];
  });

  it('histórico ainda pendente NÃO vira "nenhum treino" (achado #8)', async () => {
    mockHistoricoManual = true;

    const { getByText, queryByText } = render(<HomeScreen />);

    await waitFor(() => expect(getByText('Push A')).toBeTruthy());
    // A consulta do histórico ainda não respondeu: "não sei" ≠ "nenhum"
    expect(queryByText('Nenhum treino concluído nesta semana')).toBeNull();

    historicoPendentes[0].resolve([]);
    await waitFor(() =>
      expect(getByText('Nenhum treino concluído nesta semana')).toBeTruthy(),
    );
  });

  it('o card inteiro do treino em destaque navega ao toque (achado #11)', async () => {
    const { getByTestId } = render(<HomeScreen />);

    await waitFor(() => expect(getByTestId('card-treino-destaque')).toBeTruthy());
    fireEvent.press(getByTestId('card-treino-destaque'));

    expect(mockNavigate).toHaveBeenCalledWith('WorkoutDetail', { sessionId: 'sess-hoje' });
  });

  it('erro no histórico oferece retry que recarrega a semana (achado #8)', async () => {
    mockFalhaHistorico = new Error('rede caiu');

    const { getByText, getByTestId } = render(<HomeScreen />);
    await waitFor(() => expect(getByText('Não foi possível carregar sua semana')).toBeTruthy());

    mockFalhaHistorico = null;
    mockConcluidas = [concluidaHoje('Lower body A', 45)];
    fireEvent.press(getByText('Tentar novamente'));

    await waitFor(() => expect(getByTestId('card-semana')).toBeTruthy());
  });

  it('resposta atrasada de uma carga antiga não apaga a mais nova (achado #9)', async () => {
    mockHistoricoManual = true;

    const { getByTestId, queryByText } = render(<HomeScreen />);
    await waitFor(() => expect(historicoPendentes).toHaveLength(1));

    // Nova carga (ex.: tela ganhou foco) dispara uma segunda consulta
    act(() => dispararFocus());
    await waitFor(() => expect(historicoPendentes).toHaveLength(2));

    // A consulta NOVA responde primeiro, com dado real
    historicoPendentes[1].resolve([concluidaHoje('Upper body A', 50)]);
    await waitFor(() => expect(getByTestId('card-semana')).toBeTruthy());

    // A consulta ANTIGA falha depois — não pode sobrescrever o resultado novo
    historicoPendentes[0].reject(new Error('timeout da carga antiga'));
    await new Promise((r) => setTimeout(r, 0));

    expect(getByTestId('card-semana')).toBeTruthy();
    expect(queryByText('Não foi possível carregar sua semana')).toBeNull();
  });

  it('ganhar foco de novo recarrega plano e histórico (achado #6)', async () => {
    const { getByText, getByTestId, queryByTestId } = render(<HomeScreen />);
    await waitFor(() => expect(getByText('Nenhum treino concluído nesta semana')).toBeTruthy());
    expect(queryByTestId('card-semana')).toBeNull();

    // Usuário conclui a sessão e volta via popToTop: a Home não remonta,
    // mas ganha foco — e precisa reler o histórico
    mockConcluidas = [concluidaHoje('Lower body A', 45)];
    act(() => dispararFocus());

    await waitFor(() => expect(getByTestId('card-semana')).toBeTruthy());
    expect(getByText('1')).toBeTruthy();
  });
});
