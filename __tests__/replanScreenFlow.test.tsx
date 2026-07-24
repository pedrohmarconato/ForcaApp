// __tests__/replanScreenFlow.test.tsx
// Fase 6 — exercita o REPLANEJAMENTO pela tela real (o "verificar de verdade"
// headless): abrir → banner com a falta detectada → recusar (nada muda) →
// "menos tempo hoje" (40 min) → banner com o corte → aplicar → exercício
// cortado sai do caminho. Tela + store + motor REAIS; só a rede é mockada.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    canGoBack: () => true,
    popToTop: jest.fn(),
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'p@e.com' }, profile: {} }),
}));
jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind = 'server';
    code = null;
  }
  return {
    startSessionLog: jest.fn(async () => ({ sessionLogId: 'log-1', startedAt: 'T0' })),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(async () => undefined),
    getOpenSessionLog: jest.fn(async () => null),
    getLastLoadByExercise: jest.fn(async () => ({})),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: () => false,
  };
});
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(async () => undefined),
  loadDraft: jest.fn(async () => null),
  clearDraft: jest.fn(async () => undefined),
}));
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));

const detail = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 2,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2020-01-07',
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito'],
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 'sess-1',
      exercise_order: 1,
      name: 'Supino Reto',
      muscle_group: 'Peito',
      priority: 'primary',
      equipment: 'Barra',
      load_increment_kg: 2.5,
      rest_seconds: 90,
      target_rm_percent: 75,
      sets_planned: 2,
      reps_raw: '8-10',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
    {
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Tríceps Corda',
      muscle_group: 'Tríceps',
      priority: 'accessory',
      equipment: 'Polia',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '10-12',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-3', exercise_id: 'ex-2', set_order: 1, target_reps_min: 10, target_reps_max: 12, target_load_kg: null, target_rir: null },
      ],
    },
  ],
};

jest.mock('../src/services/trainingRepository', () => ({
  getSessionDetail: jest.fn(async () => detail),
  formatExerciseTarget: jest.fn(() => '× reps'),
}));

import {
  getWeekReplanContext,
  applyConfirmedReplan,
} from '../src/services/weeklyReplanRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import ActiveSessionScreen from '../src/screens/ActiveSessionScreen';

const mock = <T,>(fn: T) => fn as unknown as jest.Mock;

// Semana no contexto: segunda PERDIDA (peito 4 séries) + a sessão de hoje
// (ex-1 peito primary 4 séries → teto 1; ex-2 acessório → cortável aos 40 min).
const makeContext = () => ({
  planId: 'plan-1',
  weekNumber: 1,
  userId: 'user-1',
  sessions: [
    {
      id: 'seg',
      weekNumber: 1,
      title: 'Treino A',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-05',
      status: 'pending',
      estimatedMinutes: 60,
      exercises: [
        {
          id: 'm1',
          name: 'Supino Inclinado',
          muscleGroup: 'Peito',
          priority: 'primary',
          exerciseOrder: 1,
          sets: [1, 2, 3, 4].map((i) => ({ id: `m1-s${i}`, setOrder: i })),
        },
      ],
    },
    {
      id: 'sess-1',
      weekNumber: 1,
      title: 'Push A',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-07',
      status: 'in_progress',
      estimatedMinutes: 60,
      exercises: [
        {
          id: 'ex-1',
          name: 'Supino Reto',
          muscleGroup: 'Peito',
          priority: 'primary',
          exerciseOrder: 1,
          sets: [1, 2, 3, 4].map((i) => ({ id: `ex1-s${i}`, setOrder: i })),
        },
        {
          id: 'ex-2',
          name: 'Tríceps Corda',
          muscleGroup: 'Tríceps',
          priority: 'accessory',
          exerciseOrder: 2,
          sets: [{ id: 'ex2-s1', setOrder: 1 }],
        },
      ],
    },
  ],
  completedSetsBySession: {},
  sessionLabelById: { seg: 'Treino A · 2020-01-05', 'sess-1': 'Push A · 2020-01-07' },
  raw: [],
  snapshotBySessionLogId: {},
});

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(getWeekReplanContext).mockImplementation(async () => makeContext());
  mock(applyConfirmedReplan).mockResolvedValue({ addedSets: [] });
});

const renderScreen = () =>
  render(<ActiveSessionScreen route={{ params: { sessionId: 'sess-1' } }} />);

it('abrir mostra o banner da falta; recusar mantém tudo; menos tempo corta; aplicar reflete na tela', async () => {
  const screen = renderScreen();
  // Check-in obrigatório (22/07/2026): responder as 2 perguntas para o treino abrir.
  await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Normal'));
  fireEvent.press(screen.getByLabelText('Tempo cheio'));
  fireEvent.press(screen.getByLabelText('Começar treino'));
  await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

  // 1. Recalculou ao abrir: banner com a falta da segunda
  await waitFor(() => expect(screen.getByText('Replanejar a semana?')).toBeTruthy());
  expect(screen.getByText('• Treino A · 2020-01-05 será marcado como pulado')).toBeTruthy();

  // 2. RECUSA: banner some, nada foi escrito, treino segue inteiro
  fireEvent.press(screen.getByTestId('replan-decline'));
  await waitFor(() => expect(screen.queryByText('Replanejar a semana?')).toBeNull());
  expect(mock(applyConfirmedReplan)).not.toHaveBeenCalled();
  // Redesign: número e nome vivem em Texts separados na fila compacta.
  expect(screen.getByText('Tríceps Corda')).toBeTruthy();

  // 3. Menos tempo hoje: 40 min → proposta de corte do acessório (sem a
  // redistribuição recusada de volta)
  fireEvent.press(screen.getByTestId('replan-time-toggle'));
  fireEvent.changeText(screen.getByTestId('replan-minutes-input'), '40');
  fireEvent.press(screen.getByTestId('replan-minutes-apply'));
  await waitFor(() =>
    expect(screen.getByText('Menos tempo hoje (40 de 60 min)')).toBeTruthy(),
  );
  expect(screen.getByText('• Cortar Tríceps Corda (1 série)')).toBeTruthy();
  expect(screen.queryByText(/será marcado como pulado/)).toBeNull();

  // 4. APLICAR: escreve via repositório e o acessório sai do caminho na tela
  fireEvent.press(screen.getByTestId('replan-confirm'));
  await waitFor(() => expect(mock(applyConfirmedReplan)).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText(/Cortado por tempo/)).toBeTruthy());
  expect(screen.queryByText('Replanejar a semana?')).toBeNull();
});
