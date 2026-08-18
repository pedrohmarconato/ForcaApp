// __tests__/adaptationSheet.test.tsx
// Fase 5 — o bottom sheet mostra a opção recomendada destacada e devolve a escolha do
// aluno; escondido quando não há recomendação pendente.

import React from 'react';
import { render as renderNative, fireEvent } from '@testing-library/react-native';
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', neon_color: 'yellow' },
  }),
}));
jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));
import AdaptationSheet from '../src/components/session/AdaptationSheet';
import type { Recommendation } from '../src/engine/intraSessionAdaptation';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const render = (element: React.ReactElement) => {
  const utils = renderNative(<ThemeProvider>{element}</ThemeProvider>);
  return {
    ...utils,
    rerender: (nextElement: React.ReactElement) =>
      utils.rerender(<ThemeProvider>{nextElement}</ThemeProvider>),
  };
};

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
