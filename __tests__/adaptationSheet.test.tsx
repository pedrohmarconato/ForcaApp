// __tests__/adaptationSheet.test.tsx
// Fase 5 — o bottom sheet mostra a opção recomendada destacada e devolve a escolha do
// aluno; escondido quando não há recomendação pendente.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AdaptationSheet from '../src/components/session/AdaptationSheet';
import type { Recommendation } from '../src/engine/intraSessionAdaptation';

const REC: Recommendation = {
  outcome: 'under',
  deviationReps: 3,
  tier: 'grande',
  recommended: {
    kind: 'load',
    direction: 'decrease',
    fromKg: 50,
    toKg: 45,
    deltaKg: -5,
    pct: 0.12,
    label: 'Reduzir para 45 kg',
    reason: 'Você ficou abaixo da faixa-alvo.',
  },
  options: [
    {
      kind: 'load',
      direction: 'decrease',
      fromKg: 50,
      toKg: 45,
      deltaKg: -5,
      pct: 0.12,
      label: 'Reduzir para 45 kg',
      reason: 'Você ficou abaixo da faixa-alvo.',
    },
    { kind: 'keep', label: 'Manter a carga', reason: 'Recusar o ajuste.' },
  ],
};

it('mostra a recomendada destacada e devolve a escolha ao tocar', () => {
  const onChoose = jest.fn();
  const { getByText, getByTestId } = render(
    <AdaptationSheet
      recommendation={REC}
      exerciseName="Supino"
      onChoose={onChoose}
      onDismiss={jest.fn()}
    />,
  );
  expect(getByText('Reduzir para 45 kg')).toBeTruthy();
  expect(getByText('Recomendado')).toBeTruthy();
  fireEvent.press(getByTestId('adaptation-option-0'));
  expect(onChoose).toHaveBeenCalledWith(REC.options[0]);
});

it('tocar no fundo recusa (onDismiss)', () => {
  const onDismiss = jest.fn();
  const { getByTestId } = render(
    <AdaptationSheet
      recommendation={REC}
      exerciseName="Supino"
      onChoose={jest.fn()}
      onDismiss={onDismiss}
    />,
  );
  fireEvent.press(getByTestId('adaptation-backdrop'));
  expect(onDismiss).toHaveBeenCalled();
});

it('escondido quando não há recomendação', () => {
  const { queryByText } = render(
    <AdaptationSheet
      recommendation={null}
      exerciseName=""
      onChoose={jest.fn()}
      onDismiss={jest.fn()}
    />,
  );
  expect(queryByText('Recomendado')).toBeNull();
});
