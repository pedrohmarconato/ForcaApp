// __tests__/workoutDetailReorder.test.tsx
// Modo "Reordenar" dos exercícios no detalhe da sessão (Fase 1 da reordenação).
//
// Modos de falha cobertos: ação ausente fora de 'pending' (inclui sessão em
// andamento), guarda de draft ativo, Cancelar sem rede, Salvar sem mudança sem
// rede, falha do serviço preserva o rascunho, e sucesso refaz o fetch — a UI
// nunca aplica a ordem localmente sem o servidor confirmar.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn() } }));

// Estado mutável do store: cada teste ajusta draft/pendingCheckIn.
const mockStoreState: {
  draft: { plannedSessionId: string } | null;
  pendingCheckIn: { sessionId: string } | null;
} = { draft: null, pendingCheckIn: null };

jest.mock('../src/store/activeSessionStore', () => ({
  useActiveSessionStore: (selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

jest.mock('../src/services/trainingRepository', () => ({
  getSessionDetail: jest.fn(),
  formatExerciseTarget: jest.fn(() => '4 séries × 8 reps'),
}));

jest.mock('../src/services/planEditRepository', () => {
  const actual = jest.requireActual('../src/services/planEditRepository');
  return { ...actual, reordenarExercicios: jest.fn(async () => {}) };
});

import WorkoutDetailScreen from '../src/screens/WorkoutDetailScreen';
import { getSessionDetail } from '../src/services/trainingRepository';
import { PlanEditError, reordenarExercicios } from '../src/services/planEditRepository';

const getSessionDetailMock = getSessionDetail as jest.Mock;
const reordenarMock = reordenarExercicios as jest.Mock;

const exercicio = (id: string, nome: string, ordem: number) => ({
  id,
  session_id: 'sess-1',
  exercise_order: ordem,
  name: nome,
  muscle_group: 'Pernas',
  priority: 'secondary' as const,
  equipment: null,
  load_increment_kg: 2.5,
  rest_seconds: null,
  target_rm_percent: null,
  sets_planned: 4,
  reps_raw: '8',
  method: null,
  notes: null,
  planned_sets: [],
});

const sessaoBase = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: 'segunda',
  order_in_week: 1,
  title: 'Treino A',
  session_type: 'força',
  scheduled_date: '2026-07-30',
  estimated_minutes: 50,
  status: 'pending' as 'pending' | 'in_progress' | 'completed' | 'skipped',
  muscle_groups: ['Pernas'],
  planned_exercises: [
    exercicio('ex-1', 'Agachamento', 1),
    exercicio('ex-2', 'Supino', 2),
    exercicio('ex-3', 'Remada', 3),
  ],
};

const renderTela = async (sessao = sessaoBase) => {
  getSessionDetailMock.mockResolvedValue(sessao);
  const utils = render(<WorkoutDetailScreen route={{ params: { sessionId: 'sess-1' } }} />);
  await waitFor(() => expect(utils.getByText('Treino A')).toBeTruthy());
  return utils;
};

/** Ordem visual das linhas pelo rótulo das setas de subir. */
const ordemVisivel = (utils: ReturnType<typeof render>) =>
  utils
    .getAllByLabelText(/^Mover .+ para cima$/)
    .map((node) => String(node.props.accessibilityLabel));

beforeEach(() => {
  getSessionDetailMock.mockReset();
  reordenarMock.mockReset();
  reordenarMock.mockResolvedValue(undefined);
  mockStoreState.draft = null;
  mockStoreState.pendingCheckIn = null;
});

describe('WorkoutDetail — visibilidade do modo Reordenar', () => {
  it('mostra a ação em sessão pendente com 2+ exercícios', async () => {
    const { getByText } = await renderTela();
    expect(getByText('Reordenar')).toBeTruthy();
  });

  it('esconde a ação em sessão concluída e em andamento', async () => {
    const concluida = await renderTela({ ...sessaoBase, status: 'completed' as const });
    expect(concluida.queryByText('Reordenar')).toBeNull();
    concluida.unmount();

    const emAndamento = await renderTela({ ...sessaoBase, status: 'in_progress' as const });
    expect(emAndamento.queryByText('Reordenar')).toBeNull();
  });

  it('esconde a ação com menos de 2 exercícios', async () => {
    const { queryByText } = await renderTela({
      ...sessaoBase,
      planned_exercises: [exercicio('ex-1', 'Agachamento', 1)],
    });
    expect(queryByText('Reordenar')).toBeNull();
  });

  it('esconde a ação quando há draft ativo desta sessão no store', async () => {
    mockStoreState.draft = { plannedSessionId: 'sess-1' };
    const { queryByText } = await renderTela();
    expect(queryByText('Reordenar')).toBeNull();
  });

  it('esconde a ação quando a sessão aguarda check-in no store', async () => {
    mockStoreState.pendingCheckIn = { sessionId: 'sess-1' };
    const { queryByText } = await renderTela();
    expect(queryByText('Reordenar')).toBeNull();
  });
});

describe('WorkoutDetail — edição da ordem', () => {
  it('setas movem o exercício no rascunho local; pontas ficam desabilitadas', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));

    expect(ordemVisivel(utils)).toEqual([
      'Mover Agachamento para cima',
      'Mover Supino para cima',
      'Mover Remada para cima',
    ]);

    fireEvent.press(utils.getByLabelText('Mover Supino para cima'));
    expect(ordemVisivel(utils)).toEqual([
      'Mover Supino para cima',
      'Mover Agachamento para cima',
      'Mover Remada para cima',
    ]);

    // Pontas: primeiro não sobe, último não desce.
    expect(
      utils.getByLabelText('Mover Supino para cima').props.accessibilityState?.disabled,
    ).toBe(true);
    expect(
      utils.getByLabelText('Mover Remada para baixo').props.accessibilityState?.disabled,
    ).toBe(true);
    // Nada foi para a rede durante a edição.
    expect(reordenarMock).not.toHaveBeenCalled();
  });

  it('Cancelar restaura a ordem original sem chamar o serviço', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Supino para cima'));
    fireEvent.press(utils.getByText('Cancelar'));

    expect(reordenarMock).not.toHaveBeenCalled();
    expect(utils.getByText('Iniciar treino')).toBeTruthy();

    fireEvent.press(utils.getByText('Reordenar'));
    expect(ordemVisivel(utils)).toEqual([
      'Mover Agachamento para cima',
      'Mover Supino para cima',
      'Mover Remada para cima',
    ]);
  });

  it('Salvar sem mudança sai do modo sem chamar o serviço', async () => {
    const utils = await renderTela();
    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByText('Salvar'));

    await waitFor(() => expect(utils.getByText('Iniciar treino')).toBeTruthy());
    expect(reordenarMock).not.toHaveBeenCalled();
  });

  it('Salvar envia a nova ordem e refaz o fetch do detalhe', async () => {
    const utils = await renderTela();
    expect(getSessionDetailMock).toHaveBeenCalledTimes(1);

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Supino para cima'));
    fireEvent.press(utils.getByText('Salvar'));

    await waitFor(() =>
      expect(reordenarMock).toHaveBeenCalledWith('sess-1', ['ex-2', 'ex-1', 'ex-3']),
    );
    await waitFor(() => expect(getSessionDetailMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText('Iniciar treino')).toBeTruthy());
  });

  it('falha do serviço mostra aviso e PRESERVA o rascunho para tentar de novo', async () => {
    reordenarMock.mockRejectedValueOnce(new Error('network request failed'));
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Supino para cima'));
    fireEvent.press(utils.getByText('Salvar'));

    await waitFor(() => expect(utils.getByText('Não foi possível salvar')).toBeTruthy());
    // Continua no modo edição, com a ordem editada intacta.
    expect(ordemVisivel(utils)[0]).toBe('Mover Supino para cima');
    expect(getSessionDetailMock).toHaveBeenCalledTimes(1);

    // Tentar novamente: agora dá certo.
    fireEvent.press(utils.getByText('Salvar'));
    await waitFor(() =>
      expect(reordenarMock).toHaveBeenLastCalledWith('sess-1', ['ex-2', 'ex-1', 'ex-3']),
    );
    await waitFor(() => expect(getSessionDetailMock).toHaveBeenCalledTimes(2));
  });

  it('sessão que deixou de ser pendente (55000) recarrega e sai do modo — sem retry impossível', async () => {
    // Fix M1 do review: 55000/42501 não são falha de rede — retry jamais
    // funcionaria. Tratamento igual ao 40001: descarta o draft e recarrega.
    reordenarMock.mockRejectedValueOnce(
      new PlanEditError('sessão completed não pode ser reordenada', '55000'),
    );
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Supino para cima'));
    fireEvent.press(utils.getByText('Salvar'));

    await waitFor(() => expect(getSessionDetailMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText(/mudou em outro lugar/)).toBeTruthy());
    expect(utils.queryByText('Não foi possível salvar')).toBeNull();
  });

  it('estado divergente (40001) recarrega a lista e sai do modo edição', async () => {
    reordenarMock.mockRejectedValueOnce(
      new PlanEditError('lista divergente do estado atual — recarregue', '40001'),
    );
    const utils = await renderTela();

    fireEvent.press(utils.getByText('Reordenar'));
    fireEvent.press(utils.getByLabelText('Mover Supino para cima'));
    fireEvent.press(utils.getByText('Salvar'));

    await waitFor(() => expect(getSessionDetailMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText(/mudou em outro lugar/)).toBeTruthy());
    expect(utils.getByText('Iniciar treino')).toBeTruthy();
  });
});
