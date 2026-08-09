// __tests__/cardioPrescritoSecao.test.tsx
// A seção "Cardio" da aba Progresso pós-REQ-02: prescrito × realizado, sem
// nenhuma ação de escrita de meta. O motor já é testado em
// cardioPrescrito.test.ts; aqui o que importa é o que a TELA afirma.
//
// Modos de falha cobertos:
//  1. sem cardio prescrito na semana → estado vazio explícito, nunca 0
//     inventado nem card de meta em branco;
//  2. com prescrição e semana sem registro, o realizado é 0 — fato, não "—"
//     (que afirmaria falsamente ausência de prescrição);
//  3. nenhuma ação de escrita de meta ("Trocar"/"Remover"/"Definir meta")
//     sobrevive na árvore renderizada — prova negativa de que a UI de
//     definição manual de meta foi removida (decisão travada do dono).

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

import CardioPrescritoSection from '../src/components/progress/CardioPrescritoSection';
import type { CardioLog } from '../src/engine/cardioGoals';
import type { PrescricaoCardio } from '../src/engine/cardioPrescrito';

const log = (
  name: string,
  durationSeconds: number | null,
  distanceM: number | null,
  completedAt: string,
): CardioLog => ({ identity: `k:${name}`, name, durationSeconds, distanceM, completedAt });

const prescricaoVazia: PrescricaoCardio = {
  distanciaM: null,
  duracaoSegundos: null,
  sessoes: 0,
};

const prescricaoRotina = (over: Partial<PrescricaoCardio> = {}): PrescricaoCardio => ({
  distanciaM: null,
  duracaoSegundos: 7200,
  sessoes: 3,
  ...over,
});

const renderSecao = (props: Partial<React.ComponentProps<typeof CardioPrescritoSection>> = {}) =>
  render(
    <CardioPrescritoSection
      logs={[]}
      prescricao={prescricaoRotina()}
      erro={false}
      onRecarregar={jest.fn()}
      {...props}
    />,
  );

describe('estados iniciais', () => {
  it('carregando não afirma nada', () => {
    const { getByLabelText, queryByTestId } = renderSecao({ logs: null, prescricao: null });

    expect(getByLabelText('Carregando cardio prescrito')).toBeTruthy();
    expect(queryByTestId('card-cardio-prescrito')).toBeNull();
  });

  it('erro de carregamento mostra aviso com nova tentativa', () => {
    const onRecarregar = jest.fn();
    const { getByText } = renderSecao({ logs: null, prescricao: null, erro: true, onRecarregar });

    expect(getByText('Não foi possível carregar seu cardio prescrito')).toBeTruthy();
  });

  it('modo de falha 1: sem cardio prescrito na semana mostra estado vazio explícito, nunca 0 inventado', () => {
    const { getByText, queryByTestId, queryByText } = renderSecao({
      logs: [],
      prescricao: prescricaoVazia,
    });

    expect(getByText('Sem cardio prescrito nesta semana')).toBeTruthy();
    expect(queryByTestId('card-cardio-prescrito')).toBeNull();
    expect(queryByText(/de.*min/)).toBeNull();
  });
});

describe('prescrito × realizado', () => {
  it('modo de falha 2: semana sem registro mostra realizado ZERO — aqui o zero é o fato, não "sem amostra"', () => {
    const { getByText } = renderSecao({ logs: [], prescricao: prescricaoRotina() });

    expect(getByText('0 de 120 min')).toBeTruthy();
    expect(getByText('0 de 3 dias com cardio')).toBeTruthy();
  });

  it('mostra minutos e dias realizados com as duas barras de progresso', () => {
    const agora = new Date();
    const { getByText, getByLabelText } = renderSecao({
      logs: [log('Corrida', 1800, 5000, agora.toISOString())],
      prescricao: prescricaoRotina(),
    });

    expect(getByText('30 de 120 min')).toBeTruthy();
    expect(getByText('1 de 3 dias com cardio')).toBeTruthy();
    expect(getByLabelText('Progresso dos minutos de cardio prescritos')).toBeTruthy();
    expect(getByLabelText('Progresso dos dias de cardio prescritos')).toBeTruthy();
  });

  it('total semanal prescrito usa o formatador de duração longa, não o de série (mm:ss)', () => {
    const { getByText, queryByText } = renderSecao({
      logs: [],
      prescricao: prescricaoRotina({ duracaoSegundos: 7200 }), // 2h
    });

    expect(getByText('Prescrito: 2h no total')).toBeTruthy();
    expect(queryByText(/120:00/)).toBeNull();
  });

  it('total semanal prescrito não-redondo usa "Xh Ymin" (contrato de formatarDuracao)', () => {
    const { getByText, queryByText } = renderSecao({
      logs: [],
      prescricao: prescricaoRotina({ duracaoSegundos: 5400 }), // 1h30min
    });

    expect(getByText('Prescrito: 1h 30min no total')).toBeTruthy();
    expect(queryByText(/90:00/)).toBeNull();
  });

  it('eixo não prescrito não vira barra (só sessões, sem duração prescrita)', () => {
    const { queryByLabelText, getByText, queryByText } = renderSecao({
      logs: [],
      prescricao: { distanciaM: null, duracaoSegundos: null, sessoes: 3 },
    });

    expect(getByText('0 de 3 dias com cardio')).toBeTruthy();
    expect(queryByLabelText('Progresso dos minutos de cardio prescritos')).toBeNull();
    expect(queryByText(/de.*min/)).toBeNull();
  });
});

describe('nenhuma ação de escrita de meta sobrevive', () => {
  it('prova negativa: sem "Trocar", "Remover" ou "Definir meta" na árvore renderizada', () => {
    const { queryByText, queryByLabelText, queryByTestId } = renderSecao({
      logs: [log('Corrida', 1800, 5000, new Date().toISOString())],
      prescricao: prescricaoRotina(),
    });

    expect(queryByText('Trocar')).toBeNull();
    expect(queryByText('Remover')).toBeNull();
    expect(queryByText(/Definir meta/)).toBeNull();
    expect(queryByLabelText(/Trocar a meta/)).toBeNull();
    expect(queryByLabelText(/Remover a meta/)).toBeNull();
    expect(queryByTestId('definir-meta-desempenho')).toBeNull();
    expect(queryByTestId('definir-meta-consistencia')).toBeNull();
    expect(queryByTestId('meta-desempenho-bati')).toBeNull();
  });

  it('prova negativa no estado vazio: sem nenhum botão de definir meta', () => {
    const { queryByText, queryByTestId } = renderSecao({ logs: [], prescricao: prescricaoVazia });

    expect(queryByText(/Definir meta/)).toBeNull();
    expect(queryByTestId('definir-meta-desempenho')).toBeNull();
    expect(queryByTestId('definir-meta-consistencia')).toBeNull();
  });
});
