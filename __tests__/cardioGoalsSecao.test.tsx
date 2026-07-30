// __tests__/cardioGoalsSecao.test.tsx
// A seção "Cardio" da aba Progresso (Fase 3). O motor já é testado em
// cardioGoals.test.ts; aqui o que importa é o que a TELA afirma.
//
// Modos de falha cobertos:
//  1. mostrar 0% (ou "0:00 /km") quando não existe esforço comparável — número
//     que parece medido e não é;
//  2. converter errado no sheet: km/min escolhidos pelo aluno têm de chegar ao
//     banco em metros e segundos;
//  3. oferecer "Bati esta meta" sem o dado sustentar, ou não oferecer quando
//     sustenta;
//  4. falha da RPC sumir em silêncio e a tela dar a meta como salva.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockDefinir = jest.fn(async () => ({}));
const mockArquivar = jest.fn(async () => ({}));
const mockBatida = jest.fn(async () => ({}));

jest.mock('../src/services/cardioGoalRepository', () => ({
  definirMeta: (...args: unknown[]) => mockDefinir(...(args as [])),
  arquivarMeta: (...args: unknown[]) => mockArquivar(...(args as [])),
  registrarMetaBatida: (...args: unknown[]) => mockBatida(...(args as [])),
}));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

import CardioGoalsSection from '../src/components/progress/CardioGoalsSection';
import type { CardioLog } from '../src/engine/cardioGoals';
import type { CardioGoal } from '../src/services/cardioGoalRepository';

const log = (
  name: string,
  durationSeconds: number | null,
  distanceM: number | null,
  completedAt: string,
): CardioLog => ({ identity: `k:${name}`, name, durationSeconds, distanceM, completedAt });

const metaDesempenho = (over: Partial<CardioGoal> = {}): CardioGoal => ({
  id: 'goal-1',
  kind: 'desempenho',
  modality: 'Corrida',
  targetDistanceM: 5000,
  targetDurationSeconds: 1800,
  targetWeek: null,
  weeklyMinutes: null,
  weeklySessions: null,
  status: 'active',
  achievedAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...over,
});

const metaConsistencia = (over: Partial<CardioGoal> = {}): CardioGoal => ({
  id: 'goal-2',
  kind: 'consistencia',
  modality: null,
  targetDistanceM: null,
  targetDurationSeconds: null,
  targetWeek: null,
  weeklyMinutes: 120,
  weeklySessions: 3,
  status: 'active',
  achievedAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...over,
});

const renderSecao = (props: Partial<React.ComponentProps<typeof CardioGoalsSection>> = {}) =>
  render(
    <CardioGoalsSection
      logs={[]}
      metas={[]}
      erro={false}
      onRecarregar={jest.fn()}
      {...props}
    />,
  );

beforeEach(() => jest.clearAllMocks());

describe('estados iniciais', () => {
  it('carregando não afirma nada', () => {
    const { queryByTestId, getByLabelText } = renderSecao({ logs: null, metas: null });

    expect(getByLabelText('Carregando metas de cardio')).toBeTruthy();
    expect(queryByTestId('card-meta-desempenho')).toBeNull();
  });

  it('sem meta, oferece definir as duas', () => {
    const { getByTestId } = renderSecao();

    expect(getByTestId('definir-meta-desempenho')).toBeTruthy();
    expect(getByTestId('definir-meta-consistencia')).toBeTruthy();
  });

  it('erro de carregamento mostra aviso com nova tentativa', () => {
    const onRecarregar = jest.fn();
    const { getByText, getByLabelText } = renderSecao({
      logs: null,
      metas: null,
      erro: true,
      onRecarregar,
    });

    expect(getByText('Não foi possível carregar suas metas de cardio')).toBeTruthy();
    fireEvent.press(getByLabelText('Tentar novamente'));
    expect(onRecarregar).toHaveBeenCalled();
  });
});

describe('meta de desempenho', () => {
  it('modo de falha 1: sem esforço comparável, explica em vez de mostrar 0%', () => {
    const { getByText, queryByLabelText } = renderSecao({
      // 1 km não é base equivalente para uma meta de 5 km.
      logs: [log('Corrida', 300, 1000, '2026-07-28T10:00:00Z')],
      metas: [metaDesempenho()],
    });

    expect(getByText(/Ainda sem registro comparável/)).toBeTruthy();
    // Sem barra de progresso: não há fração que se sustente.
    expect(queryByLabelText('Progresso da meta de desempenho')).toBeNull();
  });

  it('com esforço comparável, mostra o pace real, o alvo e o que falta', () => {
    const { getByText, getByLabelText } = renderSecao({
      logs: [log('Corrida', 1950, 5000, '2026-07-28T10:00:00Z')],
      metas: [metaDesempenho()],
    });

    // 1950 s / 5 km = 390 s/km = 6:30 /km; alvo 1800/5 = 360 = 6:00 /km.
    expect(getByText('6:30 /km')).toBeTruthy();
    expect(getByText('6:00 /km')).toBeTruthy();
    expect(getByLabelText('Progresso da meta de desempenho')).toBeTruthy();
    // (390 − 360) × 5 km = 150 s → "2:30".
    expect(getByText(/Faltam 2:30/)).toBeTruthy();
  });

  it('modo de falha 3: "Bati esta meta" só aparece quando o dado sustenta', () => {
    const longe = renderSecao({
      logs: [log('Corrida', 1950, 5000, '2026-07-28T10:00:00Z')],
      metas: [metaDesempenho()],
    });
    expect(longe.queryByTestId('meta-desempenho-bati')).toBeNull();

    const alcancou = renderSecao({
      logs: [log('Corrida', 1780, 5000, '2026-07-28T10:00:00Z')],
      metas: [metaDesempenho()],
    });
    expect(alcancou.getByTestId('meta-desempenho-bati')).toBeTruthy();
    expect(alcancou.getByText(/Meta alcançada/)).toBeTruthy();
  });

  it('carimbar a conquista chama a RPC e relê do servidor', async () => {
    const onRecarregar = jest.fn();
    const { getByTestId } = renderSecao({
      logs: [log('Corrida', 1780, 5000, '2026-07-28T10:00:00Z')],
      metas: [metaDesempenho()],
      onRecarregar,
    });

    fireEvent.press(getByTestId('meta-desempenho-bati'));

    await waitFor(() => expect(mockBatida).toHaveBeenCalledWith('goal-1'));
    expect(onRecarregar).toHaveBeenCalled();
  });

  it('remover arquiva a meta', async () => {
    const { getByLabelText } = renderSecao({
      logs: [],
      metas: [metaDesempenho()],
    });

    fireEvent.press(getByLabelText('Remover a meta de desempenho'));

    await waitFor(() => expect(mockArquivar).toHaveBeenCalledWith('goal-1'));
  });
});

describe('meta de consistência', () => {
  it('mostra minutos e dias da semana com as duas barras', () => {
    const agora = new Date();
    const { getByText, getByLabelText } = renderSecao({
      logs: [log('Corrida', 1800, 5000, agora.toISOString())],
      metas: [metaConsistencia()],
    });

    expect(getByText('30 de 120 min')).toBeTruthy();
    expect(getByText('1 de 3 dias com cardio')).toBeTruthy();
    expect(getByLabelText('Progresso dos minutos de cardio da semana')).toBeTruthy();
    expect(getByLabelText('Progresso dos dias com cardio na semana')).toBeTruthy();
  });

  it('semana vazia mostra zero — aqui o zero é o fato', () => {
    const { getByText } = renderSecao({ logs: [], metas: [metaConsistencia()] });

    expect(getByText('0 de 120 min')).toBeTruthy();
    expect(getByText('0 de 3 dias com cardio')).toBeTruthy();
  });

  it('eixo não declarado não vira barra', () => {
    const { queryByLabelText, getByText } = renderSecao({
      logs: [],
      metas: [metaConsistencia({ weeklySessions: null })],
    });

    expect(getByText('0 de 120 min')).toBeTruthy();
    expect(queryByLabelText('Progresso dos dias com cardio na semana')).toBeNull();
  });
});

describe('definir meta pelo sheet', () => {
  it('modo de falha 2: km e minutos chegam ao banco em metros e segundos', async () => {
    const { getByTestId, getByLabelText } = renderSecao();

    fireEvent.press(getByTestId('definir-meta-desempenho'));
    fireEvent.press(getByLabelText('Corrida'));
    fireEvent.press(getByLabelText('5 km'));
    fireEvent.press(getByLabelText('30 min'));
    fireEvent.press(getByTestId('cardio-goal-confirmar'));

    await waitFor(() =>
      expect(mockDefinir).toHaveBeenCalledWith({
        kind: 'desempenho',
        modality: 'Corrida',
        targetDistanceM: 5000,
        targetDurationSeconds: 1800,
      }),
    );
  });

  it('meta de rotina exige pelo menos um eixo', async () => {
    const { getByTestId } = renderSecao();

    fireEvent.press(getByTestId('definir-meta-consistencia'));
    expect(getByTestId('cardio-goal-confirmar').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('rotina só com dias envia minutos nulos', async () => {
    const { getByTestId, getByLabelText } = renderSecao();

    fireEvent.press(getByTestId('definir-meta-consistencia'));
    fireEvent.press(getByLabelText('3 dias'));
    fireEvent.press(getByTestId('cardio-goal-confirmar'));

    await waitFor(() =>
      expect(mockDefinir).toHaveBeenCalledWith({
        kind: 'consistencia',
        weeklyMinutes: null,
        weeklySessions: 3,
      }),
    );
  });

  it('modo de falha 4: falha da RPC aparece e a meta não é dada como salva', async () => {
    mockDefinir.mockRejectedValueOnce(new Error('meta ativa já existe'));
    const onRecarregar = jest.fn();
    const { getByTestId, getByLabelText, getByText } = renderSecao({ onRecarregar });

    fireEvent.press(getByTestId('definir-meta-consistencia'));
    fireEvent.press(getByLabelText('120 min'));
    fireEvent.press(getByTestId('cardio-goal-confirmar'));

    await waitFor(() => expect(getByText('meta ativa já existe')).toBeTruthy());
    expect(onRecarregar).not.toHaveBeenCalled();
  });
});
