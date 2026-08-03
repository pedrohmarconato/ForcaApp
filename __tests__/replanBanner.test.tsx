// __tests__/replanBanner.test.tsx
// Fase 6 — o banner resume as mudanças propostas (redistribuição + corte de
// tempo, com o volume que fica de fora) e devolve a decisão do aluno; escondido
// sem mudanças.
//
// Redesign 24/07/2026: os contratos de decisão continuam iguais; o que mudou é
// a leitura. O teste agora exige o RESULTADO (12 → 14 séries), não o delta
// solto, e proíbe o jargão do motor de chegar à tela.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReplanBanner from '../src/components/session/ReplanBanner';
import type {
  WeeklyReplanProposal,
  ReplanSession,
} from '../src/engine/weeklyReplanner';

const sessao = (
  id: string,
  title: string,
  data: string | null,
  exercicios: number,
  seriesPorExercicio: number,
): ReplanSession =>
  ({
    id,
    weekNumber: 1,
    title,
    sessionType: null,
    scheduledDate: data,
    status: 'pending',
    estimatedMinutes: 60,
    exercises: Array.from({ length: exercicios }, (_, i) => ({
      id: `${id}-ex-${i}`,
      name: `Exercício ${i}`,
      muscleGroup: 'Peito',
      priority: 'primary' as const,
      exerciseOrder: i,
      sets: Array.from({ length: seriesPorExercicio }, (_, j) => ({
        id: `${id}-s-${i}-${j}`,
        setOrder: j + 1,
      })),
    })),
  }) as ReplanSession;

// 2026-07-13 é segunda; 2026-07-17, sexta.
const SESSIONS: ReplanSession[] = [
  sessao('seg', 'Treino A', '2026-07-13', 3, 3), // 9 séries
  sessao('sex', 'Treino C', '2026-07-17', 4, 3), // 12 séries
  sessao('hoje', 'Treino B', '2026-07-15', 4, 3),
];

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

it('mostra cada mudança com antes → depois, sem jargão do motor', () => {
  const { getByText, getAllByText, queryByText } = render(
    <ReplanBanner
      proposal={PROPOSTA}
      reagendamento={null}
      sessions={SESSIONS}
      busy={false}
      onConfirm={jest.fn()}
      onConfirmReagendamento={jest.fn()}
      onDecline={jest.fn()}
    />,
  );

  // Resumo no topo: 1 pulada + 1 reforçada + 1 corte de tempo + 1 perda.
  getByText('4 mudanças na sua semana');

  // Sessão perdida, com o volume que some junto.
  getByText('Treino A · seg');
  getByText('pulado');
  getByText('9 séries que não aconteceram');

  // O RESULTADO, não o delta solto: 12 → 14 séries. O "12" aparece duas vezes
  // de propósito — é também o "antes" do cartão de tempo (a sessão de hoje
  // tem 12 séries planejadas).
  getByText('Treino C · sex');
  expect(getAllByText('12')).toHaveLength(2);
  getByText('14 séries');
  getByText('+2');
  getByText('Peito +2');

  // Corte de tempo: antes → depois em SÉRIES (12 na sessão de hoje, −3), com o
  // tempo como contexto. Dizer "60 → 40 min" seria apresentar o tempo que o
  // aluno declarou ter como duração apurada do treino cortado — o motor nunca
  // reestima isso.
  getByText('Hoje · menos tempo');
  getByText('9 séries');
  getByText('−3');
  getByText('você tem 40 dos 60 min estimados');
  getByText('Mantém principais e secundários');
  getByText('saem: Tríceps Corda (3)');
  expect(queryByText('40 min')).toBeNull();

  // O que fica de fora, em português de treinador.
  getByText('1 série fica de fora');
  getByText('não cabe no que sobrou da semana');

  // Nada da versão antiga sobrevive.
  expect(queryByText(/perda registrada/)).toBeNull();
  expect(queryByText(/não coube nas sessões restantes/)).toBeNull();
  expect(queryByText(/Replanejar a semana\?/)).toBeNull();
});

it('confirmar e recusar disparam os callbacks; ocupado desabilita os botões', () => {
  const onConfirm = jest.fn();
  const onDecline = jest.fn();
  const onConfirmReagendamento = jest.fn();
  const { getByTestId, rerender } = render(
    <ReplanBanner
      proposal={PROPOSTA}
      reagendamento={null}
      sessions={SESSIONS}
      busy={false}
      onConfirm={onConfirm}
      onConfirmReagendamento={onConfirmReagendamento}
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
      reagendamento={null}
      sessions={SESSIONS}
      busy
      onConfirm={onConfirm}
      onConfirmReagendamento={onConfirmReagendamento}
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
      reagendamento={null}
      sessions={[]}
      busy={false}
      onConfirm={jest.fn()}
      onConfirmReagendamento={jest.fn()}
      onDecline={jest.fn()}
    />,
  );
  expect(a.toJSON()).toBeNull();
  const b = render(
    <ReplanBanner
      proposal={null}
      reagendamento={null}
      sessions={[]}
      busy={false}
      onConfirm={jest.fn()}
      onConfirmReagendamento={jest.fn()}
      onDecline={jest.fn()}
    />,
  );
  expect(b.toJSON()).toBeNull();
});

it('sem as sessões em mãos ainda decide — cai no id, não quebra', () => {
  // Contexto incompleto (ex.: aberto offline): o cartão perde o rótulo bonito,
  // mas o aluno não pode ficar sem a decisão.
  const { getByTestId } = render(
    <ReplanBanner
      proposal={PROPOSTA}
      reagendamento={null}
      sessions={[]}
      busy={false}
      onConfirm={jest.fn()}
      onConfirmReagendamento={jest.fn()}
      onDecline={jest.fn()}
    />,
  );
  expect(getByTestId('replan-confirm')).toBeTruthy();
});

it('Nível 2: nada reencaixável — a semana fecha com menos volume, e isso é dito', () => {
  // Sem espaço até domingo, o banner NÃO silencia: mostra o fechamento honesto
  // (treinos/séries que não aconteceram + quais ficaram de fora), mesmo sem
  // mudanças proponíveis. "Entendi" reconhece; não há plano B.
  const onDecline = jest.fn();
  const { getByText, getByTestId, queryByText } = render(
    <ReplanBanner
      proposal={{ ...PROPOSTA, redistribution: null, timeCut: null, hasChanges: false }}
      reagendamento={{ movidas: [], semEncaixe: ['seg'] }}
      sessions={SESSIONS}
      busy={false}
      onConfirm={jest.fn()}
      onConfirmReagendamento={jest.fn()}
      onDecline={onDecline}
    />,
  );

  getByText('A semana fecha com menos volume');
  getByText('1 de 2 treinos');
  getByText('4 de 8 séries · 4 séries não aconteceram');
  getByText('Treino A · seg');

  // Botão único: reconhece o fechamento (sem jargão de motor, sem reencaixar).
  fireEvent.press(getByTestId('replan-entendi'));
  expect(onDecline).toHaveBeenCalledTimes(1);
  expect(queryByText('Reencaixar')).toBeNull();
  expect(queryByText(/perda registrada/)).toBeNull();
});
