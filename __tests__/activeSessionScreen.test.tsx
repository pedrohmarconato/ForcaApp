// __tests__/activeSessionScreen.test.tsx
// Fase 4 — exercita a SESSÃO INTEIRA na tela (o "verificar de verdade" headless):
// iniciar → registrar 2 séries com carga (2ª já sugere a última) → 1 série
// bodyweight (sem kg) → concluir o treino. Também cobre a barreira da 1ª carga
// e a ausência de campo de kg no bodyweight.

import React from 'react';
import { Alert, Modal, Platform } from 'react-native';
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
    getLastLoadByExercise: jest.fn(async () => ({})),
    skipSessionExercise: jest.fn(async () => undefined),
    unskipSessionExercise: jest.fn(async () => undefined),
    swapSessionExercise: jest.fn(async () => undefined),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: () => false,
  };
});
// Fase 3 (REQ-06): a tela passou a ler modalidades aceitas do questionário
// para o SwapModalitySheet; sem este mock, o import do módulo real puxaria o
// cliente Supabase real e quebraria o teste no import (mesmo motivo dos
// outros mocks de serviço deste arquivo).
jest.mock('../src/services/cardioModalidadesAceitasRepository', () => ({
  getModalidadesAceitas: jest.fn(async () => ['Remo Ergômetro']),
}));
// Fase 6: o store passou a importar o repositório de replanejamento; mocka para
// não carregar o cliente Supabase real no jest (mesmo padrão dos demais services).
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
// Fase 5: o store passou a importar agendaRepository e planEditRepository;
// mocka para não carregar o cliente Supabase real (mesmo padrão dos demais services).
jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(async () => ({ agenda: [], origem: 'ausente' })),
}));
jest.mock('../src/services/planEditRepository', () => {
  class PlanEditError extends Error {
    code: string | null;
    constructor(message: string, code: string | null = null) {
      super(message);
      this.name = 'PlanEditError';
      this.code = code;
    }
  }
  return {
    PlanEditError,
    isPlanoDesatualizado: jest.fn(() => false),
    reagendarSessoesDaSemana: jest.fn(async () => ({ week: 1, moved: 0 })),
  };
});
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
  swapSessionExercise,
  skipSessionExercise,
} from '../src/services/sessionExecutionRepository';
import { clearDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import ActiveSessionScreen from '../src/screens/ActiveSessionScreen';
import { getSessionDetail } from '../src/services/trainingRepository';

// Fixture local de 1 exercício de cardio — NÃO reutiliza/modifica o `detail`
// module-level (fixture de força, dezenas de asserções já fixas nele).
// Mesmo shape mínimo de detalheComCardio() em cardioTempoDistancia.test.ts.
const detailComCardio = {
  id: 'sess-c',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Sexta: Cardio',
  session_type: 'Cardio',
  scheduled_date: '2026-07-24',
  estimated_minutes: 25,
  status: 'pending',
  muscle_groups: ['Cardio'],
  planned_exercises: [
    {
      id: 'ex-cardio',
      session_id: 'sess-c',
      exercise_order: 1,
      name: 'Caminhada',
      exercise_key: 'caminhada',
      metric: 'tempo_distancia',
      muscle_group: 'Cardio',
      priority: 'primary',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: null,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '25min',
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-c1',
          exercise_id: 'ex-cardio',
          set_order: 1,
          target_reps_min: null,
          target_reps_max: null,
          target_load_kg: null,
          target_rir: null,
          target_duration_seconds: 1500,
          target_distance_m: 3000,
        },
      ],
    },
  ],
};

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

// A fila expandida agora vive dentro do modal "Ver andamento": abrir antes de
// afirmar qualquer conteúdo de série concluída/pendente da fila.
const abrirAndamento = async (screen: any) => {
  fireEvent.press(screen.getByTestId('ver-andamento'));
  await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());
};

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

  // A fila (com a linha da série feita) fica no modal "Ver andamento".
  await abrirAndamento(screen);
  await waitFor(() => expect(screen.getByText(/8 reps × 40 kg/)).toBeTruthy());
  // Redesign: outcome 'no alvo' não ganha selo na fila — o resultado real basta.
  expect(screen.getByText(/8 reps × 40 kg/)).toBeTruthy();

  // Fecha o modal antes de seguir com o player.
  fireEvent.press(screen.getByLabelText('Fechar andamento'));

  // --- Série 2 do Supino: pós-conclusão o player entra em DESCANSO; pular
  // avança direto para a medição (auto-avanço do redesign). A sugestão 40
  // aparece, mas só vira valor gravado quando o aluno ACEITA (F10) ---
  fireEvent.press(screen.getByLabelText('Pular descanso'));
  fireEvent.changeText(screen.getByLabelText('Repetições da série 2'), '9');
  expect(screen.getByText('Usar sugestão: 40 kg')).toBeTruthy();
  fireEvent.press(screen.getByText('Usar sugestão: 40 kg'));
  fireEvent.press(screen.getByText('Concluir série'));
  await abrirAndamento(screen);
  await waitFor(() => expect(screen.getByText(/9 reps × 40 kg/)).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Fechar andamento'));

  // Era a ÚLTIMA série do Supino: o descanso precisa anunciar o fim do
  // exercício e o que vem depois — sem isso, trocar de exercício passa batido
  // (relato do dono em 24/07/2026).
  expect(screen.getByText('Supino Reto concluído')).toBeTruthy();
  expect(screen.getByText(/A SEGUIR · EXERCÍCIO 2 DE 2/)).toBeTruthy();
  // O nome do próximo aparece de propósito no anúncio do descanso; na fila,
  // dentro do modal (já fechado aqui — o anúncio basta para a transição).
  expect(screen.getByText('Flexão')).toBeTruthy();

  // --- Flexão (bodyweight): pular o descanso avança; sem campo de kg ---
  fireEvent.press(screen.getByLabelText('Pular descanso'));
  expect(screen.getByText('Peso corporal')).toBeTruthy();
  expect(screen.queryByLabelText('Carga da série 1')).toBeNull(); // bodyweight não tem input de kg
  fireEvent.changeText(screen.getByLabelText('Repetições da série 1'), '15');
  fireEvent.press(screen.getByText('Concluir série'));
  await abrirAndamento(screen);
  await waitFor(() =>
    expect(screen.getByText(/15 reps · peso corporal/)).toBeTruthy(),
  );
  fireEvent.press(screen.getByLabelText('Fechar andamento'));

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

it('achado 2 (painel 05-02): quarentena da fila fica VISÍVEL na tela, não some em silêncio', async () => {
  const screen = renderScreen();
  await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Normal'));
  fireEvent.press(screen.getByLabelText('Tempo cheio'));
  fireEvent.press(screen.getByLabelText('Começar treino'));
  await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());

  // Simula o que drainAll faz de verdade quando um item é recusado em
  // definitivo (código 23505/42501/22023/22004/P0002 ou WR-02): incrementa
  // quarantineCount via onSummaryChanged/setOutboxSummary. Antes do fix,
  // NENHUMA UI observava este campo — o item saía da fila sem aviso.
  act(() => {
    useActiveSessionStore.getState().setOutboxSummary(0, 2);
  });

  await waitFor(() =>
    expect(screen.getByText(/2 registros.*recusad/i)).toBeTruthy(),
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
  await abrirAndamento(screen);
  await waitFor(() => expect(screen.getByText(/8 reps × 40 kg/)).toBeTruthy());
});

describe('modal "Ver andamento" — uma camada nativa também no Android', () => {
  const abrirSessao = async (screen: any) => {
    await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Normal'));
    fireEvent.press(screen.getByLabelText('Tempo cheio'));
    fireEvent.press(screen.getByLabelText('Começar treino'));
    await waitFor(() => expect(screen.getByText('Push A')).toBeTruthy());
  };

  const modaisVisiveis = (screen: any) =>
    screen.root.findAll((node: any) => node.type === Modal && node.props.visible);

  it('começa FECHADO (fila não montada) e o botão tem accessibilityLabel', async () => {
    const screen = renderScreen();
    await abrirSessao(screen);

    // Fila fora da árvore enquanto o modal está fechado.
    expect(screen.queryByText('S1')).toBeNull();
    // Botão visível e acessível.
    const btn = screen.getByTestId('ver-andamento');
    expect(btn.props.accessibilityRole).toBe('button');
    expect(btn.props.accessibilityLabel).toBe('Ver andamento do treino');
  });

  it('Android ativa série sem onDismiss e fecha a única camada', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
    const screen = renderScreen();
    await abrirSessao(screen);

    fireEvent.press(screen.getByTestId('ver-andamento'));
    await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());
    // Concluídas/atual/pendentes: fila montada (S1 de cada exercício).
    expect(screen.getAllByText('S1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText(/Pular para a série 1 de Supino Reto/)).toBeTruthy();

    fireEvent.press(screen.getByLabelText(/Pular para a série 1 de Supino Reto/));
    await waitFor(() => expect(screen.queryByText('Andamento do treino')).toBeNull());
    expect(useActiveSessionStore.getState().draft!.exercises[0].sets[0].status).toBe('active');
    expect(modaisVisiveis(screen)).toHaveLength(0);
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('Android recusa exercício no conteúdo embutido: nunca monta dois Modals', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
    const screen = renderScreen();
    await abrirSessao(screen);

    fireEvent.press(screen.getByTestId('ver-andamento'));
    await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

    fireEvent.press(screen.getByLabelText(/Não vou fazer Flexão/));
    await waitFor(() => expect(screen.getByText('Não vou fazer Flexão')).toBeTruthy());
    expect(modaisVisiveis(screen)).toHaveLength(1);
    fireEvent.press(screen.getByTestId('skip-reason-nao_gosto'));
    fireEvent.press(screen.getByTestId('skip-reason-confirm'));
    await waitFor(() => expect(useActiveSessionStore.getState().draft!.exercises[1].skippedByUser).toBe(true));
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('Android desfaz recusa sem onDismiss manual', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    try {
    const screen = renderScreen();
    await abrirSessao(screen);

    // Pré-condição: exercício recusado no rascunho (unskip disponível).
    useActiveSessionStore.setState((s: any) => ({
      draft: {
        ...s.draft!,
        exercises: s.draft!.exercises.map((ex: any, i: number) =>
          i === 0
            ? {
                ...ex,
                skippedByUser: true,
                skipReason: 'nao_gosto',
                sets: ex.sets.map((set: any) => ({ ...set, status: 'pending' })),
              }
            : ex,
        ),
      },
    }));

    fireEvent.press(screen.getByTestId('ver-andamento'));
    await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

    fireEvent.press(screen.getByLabelText(/Voltar a fazer Supino Reto/));
    await waitFor(() => expect(screen.queryByText('Andamento do treino')).toBeNull());
    await waitFor(() =>
      expect(useActiveSessionStore.getState().draft!.exercises[0].skippedByUser).toBe(false),
    );
    expect(modaisVisiveis(screen)).toHaveLength(0);
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('entry point 1: abre o sheet de troca a partir da fila, confirma e fecha', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mock(getSessionDetail).mockResolvedValueOnce(detailComCardio as any);
    try {
      const screen = renderScreen();
      await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Normal'));
      fireEvent.press(screen.getByLabelText('Tempo cheio'));
      fireEvent.press(screen.getByLabelText('Começar treino'));
      await waitFor(() => expect(screen.getByText('Sexta: Cardio')).toBeTruthy());

      fireEvent.press(screen.getByTestId('ver-andamento'));
      await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

      fireEvent.press(screen.getByLabelText('Trocar modalidade de Caminhada'));
      await waitFor(() => expect(screen.getByText('Trocar Caminhada')).toBeTruthy());

      fireEvent.press(screen.getByTestId('swap-modality-Remo Ergômetro'));
      fireEvent.press(screen.getByTestId('swap-modality-confirm'));

      await waitFor(() => expect(mock(swapSessionExercise)).toHaveBeenCalledWith(
        expect.objectContaining({ plannedExerciseId: 'ex-cardio', toModality: 'Remo Ergômetro' }),
      ));
      // Mesmo padrão de onConfirmarRecusa: sucesso fecha o modal inteiro.
      await waitFor(() => expect(screen.queryByText('Andamento do treino')).toBeNull());
      expect(useActiveSessionStore.getState().draft!.exercises[0].name).toBe('Remo Ergômetro');
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('entry point 2: sem_equipamento em cardio oferece troca em vez de recusar', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mock(getSessionDetail).mockResolvedValueOnce(detailComCardio as any);
    try {
      const screen = renderScreen();
      await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Normal'));
      fireEvent.press(screen.getByLabelText('Tempo cheio'));
      fireEvent.press(screen.getByLabelText('Começar treino'));
      await waitFor(() => expect(screen.getByText('Sexta: Cardio')).toBeTruthy());

      fireEvent.press(screen.getByTestId('ver-andamento'));
      await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

      // "Não vou fazer" da fila abre o SkipReasonSheet, não o de troca.
      fireEvent.press(screen.getByLabelText('Não vou fazer Caminhada'));
      await waitFor(() => expect(screen.getByText('Não vou fazer Caminhada')).toBeTruthy());

      fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
      fireEvent.press(screen.getByTestId('skip-reason-oferecer-troca'));

      // O caminho de troca abre o MESMO SwapModalitySheet do entry point 1.
      await waitFor(() => expect(screen.getByText('Trocar Caminhada')).toBeTruthy());
      expect(mock(skipSessionExercise)).not.toHaveBeenCalled();

      fireEvent.press(screen.getByTestId('swap-modality-Remo Ergômetro'));
      fireEvent.press(screen.getByTestId('swap-modality-confirm'));

      await waitFor(() => expect(mock(swapSessionExercise)).toHaveBeenCalledWith(
        expect.objectContaining({ plannedExerciseId: 'ex-cardio', toModality: 'Remo Ergômetro' }),
      ));
      expect(mock(skipSessionExercise)).not.toHaveBeenCalled();
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('entry point 1: some "Trocar modalidade" quando a série já está concluída', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mock(getSessionDetail).mockResolvedValueOnce(detailComCardio as any);
    try {
      const screen = renderScreen();
      await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Normal'));
      fireEvent.press(screen.getByLabelText('Tempo cheio'));
      fireEvent.press(screen.getByLabelText('Começar treino'));
      await waitFor(() => expect(screen.getByText('Sexta: Cardio')).toBeTruthy());

      // Pré-condição: a única série do exercício já está concluída — mesmo
      // predicado do guard de CR-01 (activeSessionStore.swapExercise).
      useActiveSessionStore.setState((s: any) => ({
        draft: {
          ...s.draft!,
          exercises: s.draft!.exercises.map((ex: any) =>
            ex.exerciseId === 'ex-cardio'
              ? {
                  ...ex,
                  sets: ex.sets.map((set: any) => ({
                    ...set,
                    status: 'done',
                    actualDurationSeconds: 1500,
                    actualDistanceM: 3000,
                  })),
                }
              : ex,
          ),
        },
      }));

      fireEvent.press(screen.getByTestId('ver-andamento'));
      await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

      expect(screen.queryByLabelText('Trocar modalidade de Caminhada')).toBeNull();
      expect(screen.getByLabelText('Não vou fazer Caminhada')).toBeTruthy();
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('entry point 2: SkipReasonSheet não oferece troca quando a série já está concluída', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mock(getSessionDetail).mockResolvedValueOnce(detailComCardio as any);
    try {
      const screen = renderScreen();
      await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Normal'));
      fireEvent.press(screen.getByLabelText('Tempo cheio'));
      fireEvent.press(screen.getByLabelText('Começar treino'));
      await waitFor(() => expect(screen.getByText('Sexta: Cardio')).toBeTruthy());

      // Mesma pré-condição do teste anterior: série já concluída.
      useActiveSessionStore.setState((s: any) => ({
        draft: {
          ...s.draft!,
          exercises: s.draft!.exercises.map((ex: any) =>
            ex.exerciseId === 'ex-cardio'
              ? {
                  ...ex,
                  sets: ex.sets.map((set: any) => ({
                    ...set,
                    status: 'done',
                    actualDurationSeconds: 1500,
                    actualDistanceM: 3000,
                  })),
                }
              : ex,
          ),
        },
      }));

      fireEvent.press(screen.getByTestId('ver-andamento'));
      await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

      fireEvent.press(screen.getByLabelText('Não vou fazer Caminhada'));
      await waitFor(() => expect(screen.getByText('Não vou fazer Caminhada')).toBeTruthy());

      fireEvent.press(screen.getByTestId('skip-reason-sem_equipamento'));
      expect(screen.queryByTestId('skip-reason-oferecer-troca')).toBeNull();
      expect(screen.getByTestId('skip-reason-confirm')).toHaveTextContent('Não vou fazer');
    } finally { if (descriptor) Object.defineProperty(Platform, 'OS', descriptor); }
  });

  it('falha ao trocar: fila offline-first (D-05 estendido) aplica a troca e fecha o sheet mesmo com a RPC rejeitando', async () => {
    // Fase 4 (REQ-07): swapExercise passou a enfileirar em vez de aguardar a
    // RPC direto — a troca aplica na tela IMEDIATAMENTE e o sheet fecha, sem
    // Alert, mesmo que a chamada ao servidor (agora em segundo plano, via
    // fila) rejeite. Substitui o teste pré-fase "falha ao trocar: Alert avisa
    // e o sheet permanece aberto", que testava o comportamento síncrono
    // anterior (removido nesta fase).
    const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mock(getSessionDetail).mockResolvedValueOnce(detailComCardio as any);
    mock(swapSessionExercise).mockRejectedValueOnce(new Error('falhou'));
    try {
      const screen = renderScreen();
      await waitFor(() => expect(screen.getByLabelText('Começar treino')).toBeTruthy());
      fireEvent.press(screen.getByLabelText('Normal'));
      fireEvent.press(screen.getByLabelText('Tempo cheio'));
      fireEvent.press(screen.getByLabelText('Começar treino'));
      await waitFor(() => expect(screen.getByText('Sexta: Cardio')).toBeTruthy());

      fireEvent.press(screen.getByTestId('ver-andamento'));
      await waitFor(() => expect(screen.getByText('Andamento do treino')).toBeTruthy());

      fireEvent.press(screen.getByLabelText('Trocar modalidade de Caminhada'));
      await waitFor(() => expect(screen.getByText('Trocar Caminhada')).toBeTruthy());

      fireEvent.press(screen.getByTestId('swap-modality-Remo Ergômetro'));
      fireEvent.press(screen.getByTestId('swap-modality-confirm'));

      await waitFor(() =>
        expect(useActiveSessionStore.getState().draft!.exercises[0].name).toBe('Remo Ergômetro'),
      );
      // O sheet FECHA — a troca aplica local mesmo com a RPC subjacente rejeitando.
      await waitFor(() => expect(screen.queryByText('Trocar Caminhada')).toBeNull());
      expect(alertSpy).not.toHaveBeenCalled();
    } finally {
      alertSpy.mockRestore();
      if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
    }
  });
});
