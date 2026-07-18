// __tests__/replanBanner.test.tsx
// Fase 6 — o banner resume as mudanças propostas (redistribuição + corte de tempo,
// com as perdas registradas) e devolve a decisão do aluno; escondido sem mudanças.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReplanBanner from '../src/components/session/ReplanBanner';
import type { WeeklyReplanProposal } from '../src/engine/weeklyReplanner';

const PROPOSTA: WeeklyReplanProposal = {
  adherence: {
    sessionsDue: 2,
    sessionsCompleted: 1,
    sessionRate: 0.5,
    setsDue: 8,
    setsCompleted: 4,
    volumeRate: 0.5,
  },
  timeCut: {
    kind: 'time_cut',
    sessionId: 'hoje',
    availableMinutes: 40,
    estimatedMinutes: 60,
    ratio: 40 / 60,
    keptPriorities: ['primary', 'secondary'],
    cutExercises: [
      { exerciseId: 'ex-2', name: 'Tríceps Corda', priority: 'accessory', muscleGroup: 'Tríceps', setsCut: 3 },
    ],
  },
  redistribution: {
    kind: 'missed_redistribution',
    missedSessionIds: ['seg'],
    additions: [
      { targetSessionId: 'sex', exerciseId: 'f1', exerciseName: 'Supino', muscleGroup: 'Peito', addSets: 2 },
    ],
    losses: [{ missedSessionId: 'seg', muscleGroup: 'Peito', sets: 1, reason: 'nao_coube' }],
  },
  hasChanges: true,
};

const LABELS = { seg: 'Treino A · 2026-07-13', sex: 'Treino C · 2026-07-17' };

it('mostra faltas, adições, perdas registradas e o corte de tempo', () => {
  const { getByText } = render(
    <ReplanBanner
      proposal={PROPOSTA}
      sessionLabelById={LABELS}
      busy={false}
      onConfirm={jest.fn()}
      onDecline={jest.fn()}
    />,
  );
  getByText('Replanejar a semana?');
  getByText('• Treino A · 2026-07-13 será marcado como pulado');
  getByText('• +2 séries de Supino (Peito) em Treino C · 2026-07-17');
  getByText('• 1 série de Peito: não coube nas sessões restantes — perda registrada');
  getByText('Menos tempo hoje (40 de 60 min)');
  getByText('• Cortar Tríceps Corda (3 séries)');
});

it('confirmar e recusar disparam os callbacks; ocupado desabilita os botões', () => {
  const onConfirm = jest.fn();
  const onDecline = jest.fn();
  const { getByTestId, rerender } = render(
    <ReplanBanner
      proposal={PROPOSTA}
      sessionLabelById={LABELS}
      busy={false}
      onConfirm={onConfirm}
      onDecline={onDecline}
    />,
  );
  fireEvent.press(getByTestId('replan-confirm'));
  fireEvent.press(getByTestId('replan-decline'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onDecline).toHaveBeenCalledTimes(1);

  rerender(
    <ReplanBanner
      proposal={PROPOSTA}
      sessionLabelById={LABELS}
      busy
      onConfirm={onConfirm}
      onDecline={onDecline}
    />,
  );
  fireEvent.press(getByTestId('replan-confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1); // desabilitado não dispara
});

it('sem mudanças (ou sem proposta) não renderiza nada', () => {
  const semMudancas = { ...PROPOSTA, timeCut: null, redistribution: null, hasChanges: false };
  const a = render(
    <ReplanBanner
      proposal={semMudancas}
      sessionLabelById={{}}
      busy={false}
      onConfirm={jest.fn()}
      onDecline={jest.fn()}
    />,
  );
  expect(a.toJSON()).toBeNull();
  const b = render(
    <ReplanBanner
      proposal={null}
      sessionLabelById={{}}
      busy={false}
      onConfirm={jest.fn()}
      onDecline={jest.fn()}
    />,
  );
  expect(b.toJSON()).toBeNull();
});
