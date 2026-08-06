// Caminho manual no onboarding — modos de falha cobertos:
// - terceira opção ausente ou visualmente escondida quando a IA está fora;
// - questionário não chegar ao editor para o prefill permitido;
// - editor manual atualizar o perfil cedo e pular a revelação;
// - plano salvo fechar onboarding antes do toque explícito em "Começar".

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> | undefined;
const mockUpdateProfile = jest.fn(async () => undefined);

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({
    navigate: mockNavigate,
    addListener: jest.fn(() => jest.fn()),
    goBack: jest.fn(),
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      refreshSession: jest.fn(async () => ({ data: { session: null } })),
      signOut: jest.fn(async () => ({})),
    },
  },
}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      onboarding_completed: false,
      user_metadata: { full_name: 'Pedro' },
    },
    updateProfile: mockUpdateProfile,
  }),
}));

const questionnaire = {
  objetivo: 'muscle_gain',
  dias_treino: ['mon', 'wed', 'fri'],
  tempo_medio_treino_min: 50,
  inclui_cardio: false,
  inclui_alongamento: true,
};

jest.mock('../src/services/auth/secureStorage', () => ({
  supabaseSecureStorage: {
    getItem: jest.fn(async (key: string) =>
      key.startsWith('@questionnaire_data_') ? JSON.stringify(questionnaire) : null,
    ),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
  removeLegacyPlaintextCopy: jest.fn(async () => undefined),
}));
jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => true),
  callClaudeApi: jest.fn(async () => 'ok'),
}));
jest.mock('../src/services/api/trainingPlanService', () => ({
  requestTrainingPlanGeneration: jest.fn(),
  consolidateChat: jest.fn(),
  startPlanJob: jest.fn(),
  waitForPlanJob: jest.fn(),
}));
jest.mock('../src/services/exerciseCatalogService', () => ({
  ...jest.requireActual('../src/services/exerciseCatalogService'),
  getCatalog: jest.fn(async () => []),
}));
jest.mock('../src/services/trainingRepository', () => ({
  getActivePlanId: jest.fn(async () => null),
  getPlanSessions: jest.fn(async () => []),
  getSessionDetail: jest.fn(async () => null),
  getTrainingPlanMetadata: jest.fn(async () => null),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import ManualPlanEditorScreen from '../src/screens/ManualPlanEditorScreen';
import { useManualPlanStore } from '../src/store/manualPlanStore';
import { createManualPlanDraftFromQuestionnaire } from '../src/types/manualPlan';

const originalSave = useManualPlanStore.getState().save;

describe('onboarding manual', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRouteParams = undefined;
    useManualPlanStore.setState({ save: originalSave });
    await useManualPlanStore.getState().reset({ clearPersisted: false });
  });

  it('mostra a terceira opção e leva ao editor com somente os dados do questionário', async () => {
    const screen = render(<PostQuestionnaireChat />);

    fireEvent.press(await screen.findByLabelText('Prefiro montar meu treino'));

    expect(mockNavigate).toHaveBeenCalledWith('ManualPlanEditor', {
      onboarding: true,
      questionnaireData: questionnaire,
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('pré-preenche apenas dias, duração e preferências, sem escolher exercícios', () => {
    const draft = createManualPlanDraftFromQuestionnaire(questionnaire);

    expect(draft.treinos.map((workout) => workout.dia_offset)).toEqual([0, 2, 4]);
    expect(draft.treinos.every((workout) => workout.duracao_minutos === 50)).toBe(true);
    expect(draft.treinos.every((workout) => workout.incluir_alongamento)).toBe(true);
    expect(draft.treinos.every((workout) => !workout.incluir_aquecimento)).toBe(true);
    expect(draft.treinos.every((workout) => workout.exercicios.length === 0)).toBe(true);
  });

  it('salvar no editor volta à revelação, sem atualizar o perfil', async () => {
    mockRouteParams = { onboarding: true, questionnaireData: questionnaire };
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
    const store = useManualPlanStore.getState();
    store.addWorkout();
    store.addExercise(0, {
      exercise_key: 'agachamento_livre',
      nome: 'Agachamento Livre',
      equipamento: 'Barra',
      metrica: 'carga_reps',
      series: 3,
      repeticoes: '8-12',
      duracao_minutos: null,
      distancia_km: null,
      tempo_descanso: 90,
      prioridade: 'primario',
      percentual_rm: null,
      observacoes: null,
      tem_limitacao: false,
    });
    useManualPlanStore.setState({
      draftOrigin: 'onboarding',
      save: jest.fn(async () => 'manual-plan-1'),
    });

    const editor = render(<ManualPlanEditorScreen />);
    fireEvent.press(await editor.findByLabelText('Salvar plano'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      'PostQuestionnaireChat',
      expect.objectContaining({ manualPlanId: 'manual-plan-1' }),
    ));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('plano manual pronto só fecha onboarding no toque em Começar', async () => {
    mockRouteParams = { manualPlanId: 'manual-plan-1' };
    const screen = render(<PostQuestionnaireChat />);

    await screen.findByTestId('tela-revelacao');
    expect(mockUpdateProfile).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Começar'));

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledWith({
      onboarding_completed: true,
      current_plan_id: 'manual-plan-1',
    }));
  });
});
