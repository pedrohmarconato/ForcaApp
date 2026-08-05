// __tests__/trainingSessionReanchoragem.test.tsx
// Testes para o reencaixe de semana (atraso)

import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // A tela recarrega por foco (padrão da Home): o mock dispara o callback
  // como um focus inicial para o fetch acontecer uma vez na montagem.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { full_name: 'Pedro' } }),
}));

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn() } }));

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(),
  getPlanSessions: jest.fn(),
  getSessionDetail: jest.fn(),
  fecharSessoesDeSemanasVencidas: jest.fn(async () => ({ fechadas: 0 })),
  formatExerciseTarget: jest.fn(() => '4 séries × 8 reps'),
}));

jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(),
}));

jest.mock('../src/services/adherenceHistoryRepository', () => ({
  getHistoricoDeSemanas: jest.fn(),
}));

jest.mock('../src/services/planEditRepository', () => ({
  reordenarSessoesDaSemana: jest.fn(),
  reagendarSessoesDaSemana: jest.fn(),
  isPlanoDesatualizado: jest.fn(() => false),
}));

// Mock localTodayISO para retornar uma data fixa para testes
jest.mock('../src/engine/agendaDias', () => ({
  ...jest.requireActual('../src/engine/agendaDias'),
  localTodayISO: jest.fn(() => '2026-08-03'),
}));

import TrainingSessionScreen from '../src/screens/TrainingSessionScreen';
import {
  getPlanSessions,
  getSessionDetail,
  getTodaySession,
  fecharSessoesDeSemanasVencidas,
} from '../src/services/trainingRepository';
import {
  getAgendaDoAluno,
} from '../src/services/agendaRepository';
import { getHistoricoDeSemanas } from '../src/services/adherenceHistoryRepository';
import {
  reagendarSessoesDaSemana,
} from '../src/services/planEditRepository';

const getTodaySessionMock = getTodaySession as jest.Mock;
const getPlanSessionsMock = getPlanSessions as jest.Mock;
const getSessionDetailMock = getSessionDetail as jest.Mock;
const getAgendaMock = getAgendaDoAluno as jest.Mock;
const reagendarMock = reagendarSessoesDaSemana as jest.Mock;
const getHistoricoMock = getHistoricoDeSemanas as jest.Mock;

const sessao = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: `Sessão ${id}`,
  session_type: 'força',
  scheduled_date: null,
  estimated_minutes: 50,
  status: 'pending',
  muscle_groups: ['Pernas'],
  ...over,
});

// Semana com atraso: Alfa sexta (atrasada, da semana anterior), Beta quarta (pendente futura)
// Com hoje = 2026-08-03 (segunda), a semana anterior tem segunda 2026-07-27
// Alfa está em 2026-08-01 (sexta anterior) = atrasada
// Beta está em 2026-08-05 (quarta) = futura
const semanaComAtraso = [
  sessao('s1', { title: 'Sessão Alfa', scheduled_date: '2026-08-01', order_in_week: 1, status: 'pending' }),
  sessao('s2', { title: 'Sessão Beta', scheduled_date: '2026-08-05', order_in_week: 2, status: 'pending' }),
];

// Semana sem atraso: ambas pendentes com data futura
// Com hoje = 2026-08-03 (segunda), ambas estão no futuro
const semanaSemAtraso = [
  sessao('s3', { title: 'Sessão Gama', scheduled_date: '2026-08-03', order_in_week: 1, status: 'pending' }),
  sessao('s4', { title: 'Sessão Delta', scheduled_date: '2026-08-05', order_in_week: 2, status: 'pending' }),
];

const detalheS1 = {
  ...semanaComAtraso[0],
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 's1',
      exercise_order: 1,
      name: 'Agachamento',
      muscle_group: 'Pernas',
      priority: 'primary',
      equipment: null,
      load_increment_kg: 2.5,
      rest_seconds: null,
      target_rm_percent: null,
      sets_planned: 4,
      reps_raw: '8',
      method: null,
      notes: null,
      planned_sets: [],
    },
  ],
};

const renderTela = async (
  planSessions = semanaComAtraso,
  agenda = [0, 2, 4],
  historico: unknown[] = [],
) => {
  const todaySessionId = planSessions[0].id;
  const sessionDetail = {
    ...planSessions[0],
    planned_exercises: [
      {
        id: 'ex-1',
        session_id: planSessions[0].id,
        exercise_order: 1,
        name: 'Agachamento',
        muscle_group: 'Pernas',
        priority: 'primary',
        equipment: null,
        load_increment_kg: 2.5,
        rest_seconds: null,
        target_rm_percent: null,
        sets_planned: 4,
        reps_raw: '8',
        method: null,
        notes: null,
        planned_sets: [],
      },
    ],
  };
  getTodaySessionMock.mockResolvedValue({ id: todaySessionId });
  getSessionDetailMock.mockResolvedValue(sessionDetail);
  getPlanSessionsMock.mockResolvedValue(planSessions);
  getAgendaMock.mockResolvedValue({ agenda, origem: 'plano' });
  getHistoricoMock.mockResolvedValue(historico);
  const utils = render(<TrainingSessionScreen />);
  await waitFor(() => expect(utils.getByTestId('visao-ciclo')).toBeTruthy());
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  reagendarMock.mockResolvedValue(undefined);
});

describe('TrainingSessionScreen - Reencaixe (atraso)', () => {
  it('botão "Gerar novo plano" navega para o questionário (achado nº 7 do review 67)', async () => {
    // Plano na semana 4 em curso; histórico das 3 semanas fechadas sem nenhuma
    // concluída → veredito 'abandono' → card do Nível 4 na tela.
    const plano = [
      sessao('s9', {
        title: 'Sessão Semana 4',
        week_number: 4,
        scheduled_date: '2026-08-03',
        order_in_week: 1,
        status: 'pending',
      }),
    ];
    const historico = [
      sessao('h1', { week_number: 1, scheduled_date: '2026-07-13', status: 'pending' }),
      sessao('h2', { week_number: 2, scheduled_date: '2026-07-20', status: 'pending' }),
      sessao('h3', { week_number: 3, scheduled_date: '2026-07-27', status: 'pending' }),
    ];

    const utils = await renderTela(plano, [0, 2, 4], historico);

    await waitFor(() => expect(utils.getByText('Gerar novo plano')).toBeTruthy());
    fireEvent.press(utils.getByText('Gerar novo plano'));
    // O botão morto (console.warn) virou navegação real para o fluxo de geração.
    expect(mockNavigate).toHaveBeenCalledWith('Questionnaire');
  });

  it('não mostra "Reencaixar" quando não há atraso', async () => {
    const utils = await renderTela(semanaSemAtraso);
    expect(utils.queryByText('Reencaixar')).toBeNull();
  });

  it('não mostra "Reencaixar" quando agenda está vazia', async () => {
    const utils = await renderTela(semanaComAtraso, []);
    expect(utils.queryByText('Reencaixar')).toBeNull();
  });

  it('mostra "Reencaixar" quando há atraso e agenda com dias', async () => {
    const utils = await renderTela(semanaComAtraso, [0, 2, 4]);
    expect(utils.getByText('Reencaixar')).toBeTruthy();
  });

  it('abre o preview ao tocar em "Reencaixar"', async () => {
    const utils = await renderTela(semanaComAtraso);
    fireEvent.press(utils.getByText('Reencaixar'));
    await waitFor(() => expect(utils.getByText('Reencaixar semana')).toBeTruthy());
    expect(utils.getByText('Treinos que mudam de dia:')).toBeTruthy();
  });

  it('mostra dia da semana por extenso no preview', async () => {
    const utils = await renderTela(semanaComAtraso);
    fireEvent.press(utils.getByText('Reencaixar'));
    await waitFor(() => {
      // Verifica que há uma renderização com data e dia (ex: "03/08/2026 (SEG)")
      expect(utils.getByText(/\(\w{3}\)/)).toBeTruthy();
    });
  });

  it('confirmar chama reagendarSessoesDaSemana com atribuições corretas', async () => {
    const utils = await renderTela(semanaComAtraso);
    fireEvent.press(utils.getByText('Reencaixar'));
    await waitFor(() => expect(utils.getByText('Confirmar')).toBeTruthy());
    fireEvent.press(utils.getByText('Confirmar'));

    await waitFor(() =>
      expect(reagendarMock).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'plan-1',
          weekNumber: 1,
          atribuicoes: expect.any(Array),
        }),
      ),
    );
  });

  it('refetch após confirmar', async () => {
    const utils = await renderTela(semanaComAtraso);
    expect(getPlanSessionsMock).toHaveBeenCalledTimes(1);
    expect(getTodaySessionMock).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByText('Reencaixar'));
    await waitFor(() => expect(utils.getByText('Confirmar')).toBeTruthy());
    fireEvent.press(utils.getByText('Confirmar'));

    await waitFor(() => expect(getPlanSessionsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getTodaySessionMock).toHaveBeenCalledTimes(2));
  });

  it('agenda vazia mostra aviso visível', async () => {
    const utils = await renderTela(semanaComAtraso, []);
    // Agenda vazia deve desabilitar a ação, então não há botão
    expect(utils.queryByText('Reencaixar')).toBeNull();
  });

  it('mostra "Reencaixar" e "Reordenar" juntos quando ambas condições valem', async () => {
    // Semana com atraso (para ter Reencaixar) e múltiplos pendentes (para ter Reordenar)
    const utils = await renderTela(semanaComAtraso, [0, 2, 4]);
    expect(utils.getByText('Reencaixar')).toBeTruthy();
    expect(utils.getByText('Reordenar')).toBeTruthy();
  });

  it('fecha semanas vencidas na abertura, antes de escolher o treino de hoje', async () => {
    const fecharMock = fecharSessoesDeSemanasVencidas as jest.Mock;
    const utils = await renderTela(semanaSemAtraso);
    // Fase 1: o fechador roda com a data local de hoje e o id do usuário.
    await waitFor(() =>
      expect(fecharMock).toHaveBeenCalledWith('user-1', '2026-08-03'),
    );
    // E o treino da semana corrente segue disponível (nada foi quebrado).
    expect(utils.getByTestId('visao-ciclo')).toBeTruthy();
  });

  it('falha do fechador é não-fatal: a tela segue com o treino de hoje', async () => {
    (fecharSessoesDeSemanasVencidas as jest.Mock).mockRejectedValueOnce(
      new Error('relation planned_session does not exist'),
    );
    const utils = await renderTela(semanaSemAtraso);
    expect(utils.getByTestId('visao-ciclo')).toBeTruthy();
    expect(getTodaySessionMock).toHaveBeenCalled();
  });
});

// Semana em curso (número 4): a "sessão da vez" da semana corrente, para que o
// histórico consultado (semanas 1-3) seja considerado fechado.
const semanaEmCurso = [
  sessao('s5', { title: 'Sessão Épsilon', scheduled_date: '2026-08-03', order_in_week: 1, week_number: 4, status: 'pending' }),
  sessao('s6', { title: 'Sessão Zeta', scheduled_date: '2026-08-05', order_in_week: 2, week_number: 4, status: 'pending' }),
];

const historicoDe = (concluidasPorSemana: number[]) => {
  const linhas: unknown[] = [];
  concluidasPorSemana.forEach((concluidas, idxSemana) => {
    for (let i = 0; i < 5; i += 1) {
      linhas.push(
        sessao(`h${idxSemana + 1}-${i}`, {
          week_number: idxSemana + 1,
          status: i < concluidas ? 'completed' : 'pending',
          scheduled_date: null,
        }),
      );
    }
  });
  return linhas;
};

describe('TrainingSessionScreen - Frequência (Nível 4)', () => {
  it('mostra o card de falta crônica quando as semanas fechadas têm aderência baixa', async () => {
    const utils = await renderTela(semanaEmCurso, [0, 2, 4], historicoDe([2, 2, 2]));
    await waitFor(() => expect(utils.getByText('Sua frequência caiu')).toBeTruthy());
    expect(
      utils.getByText('Nas últimas 3 semanas você treinou 2 dos 5 dias planejados.'),
    ).toBeTruthy();
  });

  it('não mostra o card quando a aderência das semanas fechadas é ok', async () => {
    const utils = await renderTela(semanaEmCurso, [0, 2, 4], historicoDe([5, 5, 5]));
    expect(utils.queryByText('Sua frequência caiu')).toBeNull();
  });

  it('não mostra o card durante sessão em andamento', async () => {
    const semanaEmAndamento = [
      sessao('s7', { title: 'Sessão Eta', scheduled_date: '2026-08-03', order_in_week: 1, week_number: 4, status: 'in_progress' }),
    ];
    const utils = await renderTela(semanaEmAndamento, [0, 2, 4], historicoDe([2, 2, 2]));
    expect(utils.queryByText('Sua frequência caiu')).toBeNull();
  });

  it('a janela pedida ao banco é a da CONFIG, não um 3 fixo no repositório', async () => {
    // O card lê FREQUENCY_CONFIG.semanasFechadasMinimas para o texto e para o
    // agregador; se a leitura continuasse com o default 3 do repositório,
    // subir a config desligaria o Nível 4 em silêncio (semanas.length < janela
    // → 'insuficiente_historico') em vez de mentir no texto.
    await renderTela(semanaEmCurso, [0, 2, 4], historicoDe([2, 2, 2]));

    const { FREQUENCY_CONFIG } = require('../src/engine/config');
    expect(getHistoricoMock).toHaveBeenCalledWith(
      expect.objectContaining({ quantidade: FREQUENCY_CONFIG.semanasFechadasMinimas }),
    );
  });
});
