// __tests__/activeSessionScreen.test.tsx
// Fase 4 — exercita a SESSÃO INTEIRA na tela (o "verificar de verdade" headless):
// iniciar → registrar 2 séries com carga (2ª já sugere a última) → 1 série
// bodyweight (sem kg) → concluir o treino. Também cobre a barreira da 1ª carga
// e a ausência de campo de kg no bodyweight.

import React from 'react';
import { act, render, waitFor, fireEvent } from '@testing-library/react-native';

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

const mockAuthState = {
  user: { id: 'user-1', email: 'p@e.com' },
  profile: { full_name: 'Pedro' },
};
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind = 'server';
    code = null;
  }
  return {
    startSessionLog: jest.fn(async () => ({
      sessionLogId: 'sl-1',
      startedAt: 'T0',
    })),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(async () => undefined),
    getOpenSessionLog: jest.fn(async () => null),
    getLastLoadByExerciseName: jest.fn(async () => ({})),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: () => false,
  };
});
// Fase 6: o store passou a importar o repositório de replanejamento; mocka para
// não carregar o cliente Supabase real no jest (mesmo padrão dos demais services).
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(async () => undefined),
  loadDraft: jest.fn(async () => null),
  clearDraft: jest.fn(async () => undefined),
}));

const detail = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2026-07-20',
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
      planned_sets: [
        {
          id: 'st-1',
          exercise_id: 'ex-1',
          set_order: 1,
          target_reps_min: 8,
          target_reps_max: 10,
          target_load_kg: null,
          target_rir: 2,
        },
        {
          id: 'st-2',
          exercise_id: 'ex-1',
          set_order: 2,
          target_reps_min: 8,
          target_reps_max: 10,
          target_load_kg: null,
          target_rir: 2,
        },
      ],
    },
    {
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Flexão',
      muscle_group: 'Peito',
      priority: 'accessory',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: 'AMRAP',
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-3',
          exercise_id: 'ex-2',
          set_order: 1,
          target_reps_min: 10,
          target_reps_max: 20,
          target_load_kg: null,
          target_rir: 0,
        },
      ],
    },
  ],
};

jest.mock('../src/services/trainingRepository', () => ({
  getSessionDetail: jest.fn(async () => detail),
  formatExerciseTarget: jest.fn(() => '× reps'),
}));

import {
  saveSetLog,
  finishSessionLog,
} from '../src/services/sessionExecutionRepository';
import { clearDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import ActiveSessionScreen from '../src/screens/ActiveSessionScreen';

const mock = <T,>(fn: T) => fn as unknown as jest.Mock;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.setState({
    draft: null,
    status: 'idle',
    saveError: null,
  });
  mock(saveSetLog).mockImplementation(async (params: any) => ({
    setLogId: `set-${params.plannedSetId}`,
    actualReps: params.actualReps,
    actualLoadKg: params.actualLoadKg,
    actualRir: params.actualRir,
    outcome: params.outcome,
  }));
  mock(finishSessionLog).mockResolvedValue(undefined);
});

const renderScreen = () =>
  render(<ActiveSessionScreen route={{ params: { sessionId: 'sess-1' } }} />);

it('executa a sessão de ponta a ponta e conclui o treino', async () => {
  const screen = renderScreen();
  // Check-in obrigatório (22/07/2026): responder as 2 perguntas para o treino abrir.
  await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Normal'));
  fireEvent.press(screen.getByLabelText('Tempo cheio'));
  fireEvent.press(screen.getByLabelText('Começar treino'));
  await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

  // --- Série 1 do Supino (barra): 1ª carga precisa ser informada ---
  fireEvent.press(screen.getAllByText('Iniciar série')[0]);
  // barreira da primeira carga: aparece a dica e o botão fica desabilitado
  expect(screen.getByText(/informe a carga usada/i)).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText('Repetições da série 1'), '8');
  fireEvent.changeText(screen.getByLabelText('Carga da série 1'), '40');
  fireEvent.press(screen.getByText('Concluir série'));

  await waitFor(() => expect(screen.getByText(/8 reps × 40 kg/)).toBeTruthy());
  // Redesign: outcome 'no alvo' não ganha selo na fila — o resultado real basta.
  expect(screen.getByText(/8 reps × 40 kg/)).toBeTruthy();

  // --- Série 2 do Supino: pós-conclusão o player entra em DESCANSO; pular
  // avança direto para a medição (auto-avanço do redesign). A sugestão 40
  // aparece, mas só vira valor gravado quando o aluno ACEITA (F10) ---
  fireEvent.press(screen.getByLabelText('Pular descanso'));
  fireEvent.changeText(screen.getByLabelText('Repetições da série 2'), '9');
  expect(screen.getByText('Usar sugestão: 40 kg')).toBeTruthy();
  fireEvent.press(screen.getByText('Usar sugestão: 40 kg'));
  fireEvent.press(screen.getByText('Concluir série'));
  await waitFor(() => expect(screen.getByText(/9 reps × 40 kg/)).toBeTruthy());

  // --- Flexão (bodyweight): pular o descanso avança; sem campo de kg ---
  fireEvent.press(screen.getByLabelText('Pular descanso'));
  expect(screen.getByText('Peso corporal')).toBeTruthy();
  expect(screen.queryByLabelText('Carga da série 1')).toBeNull(); // bodyweight não tem input de kg
  fireEvent.changeText(screen.getByLabelText('Repetições da série 1'), '15');
  fireEvent.press(screen.getByText('Concluir série'));
  await waitFor(() =>
    expect(screen.getByText(/15 reps · peso corporal/)).toBeTruthy(),
  );

  // a série bodyweight gravou carga nula
  const chamadas = mock(saveSetLog).mock.calls.map((c) => c[0]);
  const flexao = chamadas.find((p) => p.plannedSetId === 'st-3');
  expect(flexao.actualLoadKg).toBeNull();
  expect(flexao.outcome).toBe('on_target');

  // --- Concluir o treino (todas as séries feitas → sem confirmação) ---
  fireEvent.press(screen.getByText('Concluir treino'));
  await waitFor(() =>
    expect(screen.getByText(/Treino concluído/)).toBeTruthy(),
  );
  expect(finishSessionLog).toHaveBeenCalled();
  expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
});

it('erro ao carregar o detalhe mostra erro (não sessão vazia)', async () => {
  const { getSessionDetail } = require('../src/services/trainingRepository');
  (getSessionDetail as jest.Mock).mockRejectedValueOnce(new Error('rede'));

  const screen = renderScreen();
  await waitFor(() =>
    expect(screen.getByText(/Não foi possível abrir o treino/)).toBeTruthy(),
  );
});

it('bloqueia edição da medição enquanto a gravação está em voo', async () => {
  const pending = deferred<{
    setLogId: string;
    actualReps: number;
    actualLoadKg: number | null;
    actualRir: number | null;
    outcome: 'on_target';
  }>();
  mock(saveSetLog).mockReturnValueOnce(pending.promise);
  const screen = renderScreen();
  // Check-in obrigatório (22/07/2026): responder as 2 perguntas para o treino abrir.
  await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Normal'));
  fireEvent.press(screen.getByLabelText('Tempo cheio'));
  fireEvent.press(screen.getByLabelText('Começar treino'));
  await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

  fireEvent.press(screen.getAllByText('Iniciar série')[0]);
  fireEvent.changeText(screen.getByLabelText('Repetições da série 1'), '8');
  fireEvent.changeText(screen.getByLabelText('Carga da série 1'), '40');
  fireEvent.press(screen.getByText('Concluir série'));

  expect(screen.getByLabelText('Repetições da série 1').props.editable).toBe(
    false,
  );
  expect(screen.getByLabelText('Carga da série 1').props.editable).toBe(false);
  fireEvent.press(screen.getByLabelText('Aumentar carga da série 1'));
  expect(screen.getByLabelText('Carga da série 1').props.value).toBe('40');

  await act(async () => {
    pending.resolve({
      setLogId: 'set-st-1',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'on_target',
    });
  });
  await waitFor(() => expect(screen.getByText(/8 reps × 40 kg/)).toBeTruthy());
});
