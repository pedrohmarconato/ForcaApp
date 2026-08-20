// __tests__/profileScreen.test.tsx
// Perfil após a remodelagem para a Direção 02.
//
// O teste decisivo é o das métricas: falha ao carregar o histórico NÃO pode
// virar "0 sessões". Sem amostra confiável, a tela mostra "—".

import React from 'react';
import { Text } from 'react-native';
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

// ProfileScreen passou a importar apiClient (PUSH-01, 13-01) para persistir
// o opt-in de notificações — apiClient importa supabaseClient, que lança em
// module-load se as env vars não estiverem presentes. Mesmo mock de
// __tests__/apiClient.test.ts; o comportamento de push em si é coberto por
// __tests__/profileScreen.push.test.tsx.
jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'token-teste' } } })),
      refreshSession: jest.fn(),
      signOut: jest.fn(async () => ({})),
    },
  },
}));

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

let mockHasSessionInProgress = jest.fn();

jest.mock('../src/services/trainingRepository', () => ({
  hasSessionInProgress: (...args: unknown[]) => mockHasSessionInProgress(...args),
}));

import ProfileScreen from '../src/screens/ProfileScreen';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { NO_DATA } from '../src/components/ui/Feedback';
import { LINKING_CONFIG } from '../src/navigation/linkingConfig';

const renderProfile = () =>
  render(
    <ThemeProvider>
      <ProfileScreen />
    </ThemeProvider>,
  );

/** Sessão concluída há `diasAtras` dias, com tempo efetivo conhecido. */
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
    // Tempo efetivo (0028): é daqui que a duração exibida passa a sair.
    activeSeconds: duracaoMin * 60,
  };
};

describe('ProfileScreen — identidade e navegação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFalha = null;
    mockConcluidas = [];
  });

  it('mostra nome e e-mail vindos do contexto de auth', async () => {
    const { getByText } = renderProfile();

    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());
    expect(getByText('pedro@exemplo.com')).toBeTruthy();
  });

  it('não expõe mais a linha de histórico — ela migrou para a aba Progresso (Direção 03)', async () => {
    const { getByText, queryByText } = renderProfile();

    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());
    // Regressão da migração: uma linha de histórico reaparecendo aqui viraria
    // controle duplicado com a aba Progresso.
    expect(queryByText('Histórico de treinos')).toBeNull();
  });

  it('encerra a sessão pelo botão Sair', async () => {
    const { getByLabelText } = renderProfile();

    await waitFor(() => expect(getByLabelText('Sair')).toBeTruthy());
    fireEvent.press(getByLabelText('Sair'));

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('mostra Preferencias antes de Refazer treino e abre Ajustes', async () => {
    const screen = renderProfile();

    await waitFor(() => expect(screen.getByText('Preferencias')).toBeTruthy());

    const labels = screen
      .UNSAFE_getAllByType(Text)
      .flatMap((node) => (Array.isArray(node.props.children) ? node.props.children : [node.props.children]))
      .filter((child): child is string => typeof child === 'string');

    expect(labels.indexOf('Preferencias')).toBeLessThan(labels.indexOf('Refazer treino'));
    expect(screen.getByText('Ajustes')).toBeTruthy();
    expect(screen.getByText('Aparencia')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Ajustes. Aparencia'));

    expect(mockNavigate).toHaveBeenCalledWith('Settings');
  });

  it('registra Settings no ProfileStack e no linking autenticado', () => {
    expect(LINKING_CONFIG.screens.Profile.initialRouteName).toBe('ProfileMain');
    expect(LINKING_CONFIG.screens.Profile.screens.Settings).toBe('settings');
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

    const { getAllByText, getByText, queryByText } = renderProfile();

    await waitFor(() => expect(getByText('Não foi possível carregar seus números')).toBeTruthy());
    // As três métricas ficam sem dado
    expect(getAllByText(NO_DATA)).toHaveLength(3);
    expect(queryByText('0')).toBeNull();
  });

  it('sem nenhum treino concluído, o zero é real e aparece como zero', async () => {
    mockConcluidas = [];

    const { getAllByText, queryByText } = renderProfile();

    // Sessões = 0 e Nesta semana = 0 são fatos; só o tempo total fica sem dado
    await waitFor(() => expect(getAllByText('0')).toHaveLength(2));
    expect(queryByText('Não foi possível carregar seus números')).toBeNull();
    // Tempo total sem amostra é "—", nunca "0 min" (achado #3)
    expect(queryByText('0 min')).toBeNull();
    expect(getAllByText(NO_DATA)).toHaveLength(1);
  });

  it('ganhar foco de novo recarrega o histórico (achado #6)', async () => {
    mockConcluidas = [concluida('log-1', 45)];

    const { getByText, getAllByText } = renderProfile();
    await waitFor(() => expect(getByText('45 min')).toBeTruthy());

    // Usuário conclui outro treino em outra tela e volta via popToTop
    mockConcluidas = [concluida('log-1', 45), concluida('log-2', 45)];
    act(() => dispararFocus());

    await waitFor(() => expect(getAllByText('2')).toHaveLength(2));
    expect(getByText('1h 30min')).toBeTruthy();
  });

  it('com execuções reais, soma sessões e tempo total', async () => {
    mockConcluidas = [concluida('log-1', 50), concluida('log-2', 40)];

    const { getAllByText, getByText } = renderProfile();

    // Ambas as sessões são de hoje: "Sessões" e "Nesta semana" valem 2
    await waitFor(() => expect(getAllByText('2')).toHaveLength(2));
    expect(getByText('1h 30min')).toBeTruthy();
  });

  it('separa o total de sessões da contagem da semana', async () => {
    // Uma nesta semana, outra há três semanas
    mockConcluidas = [concluida('log-1', 45), concluida('log-2', 45, 21)];

    const { getByText, getAllByText } = renderProfile();

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

    const { getByText } = renderProfile();

    // Duas linhas no histórico, mas só uma tem duração conhecida
    await waitFor(() => expect(getByText('45 min')).toBeTruthy());
  });
});

describe('ProfileScreen — Refazer treino (regeneração pelo Perfil)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFalha = null;
    mockConcluidas = [];
    mockHasSessionInProgress.mockResolvedValue(false);
  });

  it('guard livre: o sheet abre no estado normal de confirmação', async () => {
    const { getByLabelText, getByText } = renderProfile();
    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

    fireEvent.press(getByLabelText('Refazer treino'));

    // A checagem do guard é assíncrona: durante ela o sheet mostra o spinner e
    // não expõe o CTA — a confirmação só aparece depois de o guard liberar.
    await waitFor(() => expect(getByText('Refazer seu treino?')).toBeTruthy());
    expect(getByText('Continuar para o questionário')).toBeTruthy();
  });

  it('confirmar no sheet navega para o questionário e fecha o sheet', async () => {
    const { getByLabelText, getByText, queryByText } = renderProfile();
    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

    fireEvent.press(getByLabelText('Refazer treino'));
    await waitFor(() => expect(getByLabelText('Continuar para o questionário')).toBeTruthy());
    fireEvent.press(getByLabelText('Continuar para o questionário'));

    expect(mockNavigate).toHaveBeenCalledWith('Training', {
      screen: 'Questionnaire',
      initial: false,
    });
    // O modal não pode ficar por cima da aba de Treino após a navegação.
    await waitFor(() => expect(queryByText('Refazer seu treino?')).toBeNull());
  });

  it('guard bloqueado: sheet em estado de aviso, sem CTA, sem navegação', async () => {
    mockHasSessionInProgress.mockResolvedValue(true);
    const { getByLabelText, getByText, queryByText } = renderProfile();
    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

    fireEvent.press(getByLabelText('Refazer treino'));

    await waitFor(() => expect(getByText('Treino em andamento')).toBeTruthy());
    expect(
      getByText('Você tem um treino em andamento. Termine ou saia dele antes de gerar um novo plano.'),
    ).toBeTruthy();
    expect(queryByText('Continuar para o questionário')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('guard com erro: Notice com retry, sem navegação, e retry libera', async () => {
    mockHasSessionInProgress.mockRejectedValue(new Error('rede caiu'));
    const { getByLabelText, getByText, queryByText } = renderProfile();
    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

    fireEvent.press(getByLabelText('Refazer treino'));

    await waitFor(() =>
      expect(getByText('Não foi possível checar seu treino em andamento')).toBeTruthy(),
    );
    expect(queryByText('Refazer seu treino?')).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockHasSessionInProgress.mockResolvedValue(false);
    fireEvent.press(getByLabelText('Checar de novo'));
    await waitFor(() => expect(getByText('Refazer seu treino?')).toBeTruthy());
  });

  it('reabrir o sheet não herda o veredito bloqueado da rodada anterior', async () => {
    const { getByLabelText, getByText, queryByText } = renderProfile();
    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

    // Rodada 1: guard bloqueado → aviso; usuário fecha.
    mockHasSessionInProgress.mockResolvedValueOnce(true);
    fireEvent.press(getByLabelText('Refazer treino'));
    await waitFor(() => expect(getByText('Treino em andamento')).toBeTruthy());
    fireEvent.press(getByLabelText('Fechar'));
    await waitFor(() => expect(queryByText('Treino em andamento')).toBeNull());

    // Rodada 2: a sessão terminou, guard libera — o sheet NÃO pode reabrir
    // reapresentando o aviso da rodada anterior.
    mockHasSessionInProgress.mockResolvedValueOnce(false);
    fireEvent.press(getByLabelText('Refazer treino'));

    await waitFor(() => expect(getByText('Refazer seu treino?')).toBeTruthy());
    expect(queryByText('Treino em andamento')).toBeNull();
    expect(getByText('Continuar para o questionário')).toBeTruthy();
  });

  it('métricas e guard falhando mostram dois retries com labels distintos', async () => {
    mockFalha = new Error('rede caiu nas métricas');
    mockHasSessionInProgress.mockRejectedValue(new Error('rede caiu no guard'));
    const { getByLabelText, getByText } = renderProfile();

    await waitFor(() => expect(getByText('Não foi possível carregar seus números')).toBeTruthy());

    fireEvent.press(getByLabelText('Refazer treino'));
    await waitFor(() =>
      expect(getByText('Não foi possível checar seu treino em andamento')).toBeTruthy(),
    );

    // Labels distintos: cada retry pertence à própria falha (a11y sem ambiguidade).
    expect(getByLabelText('Tentar novamente')).toBeTruthy(); // métricas
    expect(getByLabelText('Checar de novo')).toBeTruthy(); // guard
  });

  it('toque duplo durante a checagem dispara uma única consulta', async () => {
    let resolver!: (v: boolean) => void;
    mockHasSessionInProgress.mockImplementationOnce(
      () => new Promise((resolve) => { resolver = resolve; }),
    );
    const { getByLabelText, getByText } = renderProfile();
    await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

    const botao = getByLabelText('Refazer treino');
    fireEvent.press(botao);
    fireEvent.press(botao);

    expect(mockHasSessionInProgress).toHaveBeenCalledTimes(1);

    await act(async () => resolver(false));
  });

  it('consulta pendurada além do limite vira erro de guard, sem liberar', async () => {
    jest.useFakeTimers();
    let resolver: ((v: boolean) => void) | undefined;
    try {
      mockHasSessionInProgress.mockImplementationOnce(
        () => new Promise((resolve) => { resolver = resolve; }),
      );
      const { getByLabelText, getByText } = renderProfile();
      await waitFor(() => expect(getByText('Pedro Marconato')).toBeTruthy());

      fireEvent.press(getByLabelText('Refazer treino'));

      // Bem além do teto de 10s: a checagem pendurada não pode deixar a ação
      // inerte nem liberar a regeneração.
      act(() => {
        jest.advanceTimersByTime(15000);
      });

      await waitFor(() =>
        expect(getByText('Não foi possível checar seu treino em andamento')).toBeTruthy(),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    } finally {
      // Encerra a promise pendente para não vazar handle, e volta ao relógio real.
      if (resolver) await act(async () => resolver(false));
      jest.useRealTimers();
    }
  });
});
