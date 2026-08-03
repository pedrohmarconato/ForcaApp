// __tests__/trainingSessionReorder.test.tsx
// Modo "Reordenar" dos TREINOS da semana na aba Plano (Fase 2 da reordenação).
//
// A ordem dos treinos é a FILA REAL (permuta de scheduled_date): o chip do dia
// mostra o dia previsto do slot durante a edição, fixas não têm setas nem
// navegação, e o refetch pós-salvar é obrigatório — a "sessão da vez" pode
// legitimamente mudar.

import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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

jest.mock('../src/services/planEditRepository', () => {
  const actual = jest.requireActual('../src/services/planEditRepository');
  return { ...actual, reordenarSessoesDaSemana: jest.fn(async () => ({
    appliedWeeks: [1],
    skippedWeeks: [],
  })) };
});

import TrainingSessionScreen from '../src/screens/TrainingSessionScreen';
import {
  getPlanSessions,
  getSessionDetail,
  getTodaySession,
} from '../src/services/trainingRepository';
import {
  PlanEditError,
  reordenarSessoesDaSemana,
} from '../src/services/planEditRepository';

const getTodaySessionMock = getTodaySession as jest.Mock;
const getPlanSessionsMock = getPlanSessions as jest.Mock;
const getSessionDetailMock = getSessionDetail as jest.Mock;
const reordenarMock = reordenarSessoesDaSemana as jest.Mock;

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

// Semana 1: Alfa SEG (pendente, sessão da vez), Beta QUA (concluída),
// Gama SEX e Delta SÁB (pendentes). Semana 2 existe só para o ciclo.
const semana1 = [
  sessao('s1', { title: 'Sessão Alfa', scheduled_date: '2026-08-03', order_in_week: 1 }),
  sessao('s2', {
    title: 'Sessão Beta',
    scheduled_date: '2026-08-05',
    order_in_week: 2,
    status: 'completed',
  }),
  sessao('s3', { title: 'Sessão Gama', scheduled_date: '2026-08-07', order_in_week: 3 }),
  sessao('s4', { title: 'Sessão Delta', scheduled_date: '2026-08-08', order_in_week: 4 }),
];
const planSessionsBase = [
  ...semana1,
  sessao('s5', { title: 'Sessão Eco', scheduled_date: '2026-08-10', week_number: 2 }),
];

const detalheS1 = {
  ...semana1[0],
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

const renderTela = async (planSessions = planSessionsBase) => {
  getTodaySessionMock.mockResolvedValue({ id: 's1' });
  getSessionDetailMock.mockResolvedValue(detalheS1);
  getPlanSessionsMock.mockResolvedValue(planSessions);
  const utils = render(<TrainingSessionScreen />);
  await waitFor(() => expect(utils.getByTestId('visao-ciclo')).toBeTruthy());
  return utils;
};

const setasVisiveis = (utils: ReturnType<typeof render>) =>
  utils
    .queryAllByLabelText(/^Mover Sessão .+ para cima$/)
    .map((n) => String(n.props.accessibilityLabel));

beforeEach(() => {
  jest.clearAllMocks();
  reordenarMock.mockResolvedValue({ appliedWeeks: [1], skippedWeeks: [] });
});

describe('Aba Plano — visibilidade do modo Reordenar', () => {
  it('mostra a ação com 2+ treinos pendentes com data na semana', async () => {
    const utils = await renderTela();
    expect(utils.getByText('Reordenar')).toBeTruthy();
  });

  it('esconde a ação com menos de 2 pendentes na semana', async () => {
    const soUmaPendente = [
      semana1[0],
      { ...semana1[2], status: 'completed' },
      { ...semana1[3], status: 'skipped' },
      planSessionsBase[4],
    ];
    const utils = await renderTela(soUmaPendente);
    expect(utils.queryByText('Reordenar')).toBeNull();
  });
});

describe('Aba Plano — edição da ordem da semana', () => {
  it('pendentes ganham setas; fixas não; linhas não navegam no modo edição', async () => {
    const utils = await renderTela();

    // Fora do modo edição a linha navega normalmente.
    fireEvent.press(utils.getByText('Sessão Gama'));
    expect(mockNavigate).toHaveBeenCalledWith('WorkoutDetail', { sessionId: 's3' });
    mockNavigate.mockClear();

    fireEvent.press(utils.getByText('Reordenar'));

    expect(setasVisiveis(utils)).toEqual([
      'Mover Sessão Alfa para cima',
      'Mover Sessão Gama para cima',
      'Mover Sessão Delta para cima',
    ]);
    expect(utils.queryByLabelText('Mover Sessão Beta para cima')).toBeNull();

    fireEvent.press(utils.getByText('Sessão Gama'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('mover reatribui os slots: chips mostram o dia PREVISTO, fixa fica no lugar', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));

    // Delta (SÁB) sobe duas vezes: pendentes viram [Delta, Alfa, Gama].
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));

    // Slots pendentes: SEG(03) → Delta, SEX(07) → Alfa, SÁB(08) → Gama.
    expect(within(utils.getByTestId('sessao-semana-s4')).getByText('SEG')).toBeTruthy();
    expect(within(utils.getByTestId('sessao-semana-s1')).getByText('SEX')).toBeTruthy();
    expect(within(utils.getByTestId('sessao-semana-s3')).getByText('SÁB')).toBeTruthy();
    // Fixa segue com o próprio dia.
    expect(within(utils.getByTestId('sessao-semana-s2')).getByText('QUA')).toBeTruthy();
    expect(reordenarMock).not.toHaveBeenCalled();
  });

  it('Cancelar restaura a ordem e não chama o serviço', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Cancelar'));

    expect(reordenarMock).not.toHaveBeenCalled();
    expect(utils.getByText('Reordenar')).toBeTruthy();

    fireEvent.press(utils.getByText('Reordenar'));
    expect(setasVisiveis(utils)).toEqual([
      'Mover Sessão Alfa para cima',
      'Mover Sessão Gama para cima',
      'Mover Sessão Delta para cima',
    ]);
  });

  it('Salvar sem mudança sai do modo sem rede e sem abrir o sheet', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByText('Salvar'));

    await waitFor(() => expect(utils.getByText('Reordenar')).toBeTruthy());
    expect(utils.queryByText('Só nesta semana')).toBeNull();
    expect(reordenarMock).not.toHaveBeenCalled();
  });

  it('Salvar abre o sheet de escopo; "Só nesta semana" aplica e refaz o fetch', async () => {
    const utils = await renderTela();
    expect(getPlanSessionsMock).toHaveBeenCalledTimes(1);
    expect(getTodaySessionMock).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Salvar'));

    // O sheet decide o escopo — nada vai à rede antes da escolha.
    expect(utils.getByText('Só nesta semana')).toBeTruthy();
    expect(reordenarMock).not.toHaveBeenCalled();

    fireEvent.press(utils.getByText('Só nesta semana'));

    await waitFor(() =>
      expect(reordenarMock).toHaveBeenCalledWith({
        planId: 'plan-1',
        weekNumber: 1,
        orderedSessionIds: ['s4', 's1', 's3'],
        escopo: 'semana',
      }),
    );
    // Refetch: a sessão da vez pode ter mudado.
    await waitFor(() => expect(getPlanSessionsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getTodaySessionMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText('Reordenar')).toBeTruthy());
  });

  it('fechar o sheet pelo fundo volta à edição sem salvar', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Salvar'));

    fireEvent.press(utils.getByTestId('reorder-scope-backdrop'));

    expect(reordenarMock).not.toHaveBeenCalled();
    // Continua no modo edição, com o rascunho intacto.
    expect(setasVisiveis(utils)).toEqual([
      'Mover Sessão Alfa para cima',
      'Mover Sessão Delta para cima',
      'Mover Sessão Gama para cima',
    ]);
  });

  it('"Nesta e nas próximas semanas" envia escopo futuras e resume a propagação', async () => {
    reordenarMock.mockResolvedValueOnce({
      appliedWeeks: [1, 2, 3],
      skippedWeeks: [{ weekNumber: 5, reason: 'contagem_diferente' }],
    });
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Salvar'));
    fireEvent.press(utils.getByText('Nesta e nas próximas semanas'));

    await waitFor(() =>
      expect(reordenarMock).toHaveBeenCalledWith(
        expect.objectContaining({ escopo: 'futuras' }),
      ),
    );
    // Propagação nunca é silenciosa: aplicadas e mantidas aparecem no aviso.
    await waitFor(() => expect(utils.getByText(/semanas 1, 2 e 3/)).toBeTruthy());
    expect(utils.getByText(/Semana 5 mantida/)).toBeTruthy();
  });

  it('falha do serviço mostra aviso e preserva o rascunho', async () => {
    reordenarMock.mockRejectedValueOnce(new Error('network request failed'));
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Salvar'));
    fireEvent.press(utils.getByText('Só nesta semana'));

    await waitFor(() => expect(utils.getByText('Não foi possível salvar')).toBeTruthy());
    // Rascunho preservado: Delta continua acima de Gama.
    expect(setasVisiveis(utils)).toEqual([
      'Mover Sessão Alfa para cima',
      'Mover Sessão Delta para cima',
      'Mover Sessão Gama para cima',
    ]);
    expect(getPlanSessionsMock).toHaveBeenCalledTimes(1);
  });

  it('plano regenerado durante a edição (42501) recarrega e sai do modo — sem retry impossível', async () => {
    reordenarMock.mockRejectedValueOnce(
      new PlanEditError('plano inexistente, alheio ou não ativo', '42501'),
    );
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Salvar'));
    fireEvent.press(utils.getByText('Só nesta semana'));

    await waitFor(() => expect(getPlanSessionsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText(/mudou em outro lugar/)).toBeTruthy());
    expect(utils.queryByText('Não foi possível salvar')).toBeNull();
  });

  it('estado divergente (40001) recarrega e sai do modo edição', async () => {
    reordenarMock.mockRejectedValueOnce(
      new PlanEditError('lista divergente do estado atual — recarregue', '40001'),
    );
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Sessão Delta para cima'));
    fireEvent.press(utils.getByText('Salvar'));
    fireEvent.press(utils.getByText('Só nesta semana'));

    await waitFor(() => expect(getPlanSessionsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText(/mudou em outro lugar/)).toBeTruthy());
    expect(utils.getByText('Reordenar')).toBeTruthy();
  });
});
