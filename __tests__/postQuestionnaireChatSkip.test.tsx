// __tests__/postQuestionnaireChatSkip.test.tsx
// Feature A — honrar route.params.skipChat na inicialização do chat.
//
// Quando o usuário vem do botão "Gerar treino direto" (QuestionnaireScreen),
// a tela não deve mostrar a escolha inicial nem criar boas-vindas; deve
// disparar o mesmo fluxo de handleUserDeclinesChat (salvar estado → marcar
// estado 'generating' → gerar plano), uma única vez.

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockRouteParams: { formData?: any; skipChat?: boolean } = {};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({ navigate: mockNavigate, addListener: jest.fn(() => jest.fn()), goBack: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-123',
      onboarding_completed: false,
      user_metadata: { full_name: 'Pedro' },
    },
    updateProfile: jest.fn(async () => ({})),
  }),
}));

const mockQuestionario = JSON.stringify({ objetivo: 'hipertrofia', nome: 'Pedro' });

jest.mock('../src/services/auth/secureStorage', () => ({
  supabaseSecureStorage: {
    getItem: jest.fn(async (key: string) =>
      key.startsWith('@questionnaire_data_') ? mockQuestionario : null,
    ),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => null),
}));

jest.mock('../src/services/api/trainingPlanService', () => ({
  requestTrainingPlanGeneration: jest.fn(async () => ({ success: true, planId: 'plan-1' })),
  consolidateChat: jest.fn(async () => ({
    preferencias: [],
    restricoes: [],
    excecoes_estruturais: [],
  })),
  startPlanJob: jest.fn(async () => 'job-1'),
  waitForPlanJob: jest.fn(async () => ({
    status: 'salvo',
    plan_id: 'plan-1',
    progress: { step: 'salvo', detail: 'Plano salvo.' },
  })),
}));

jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => true),
  callClaudeApi: jest.fn(async () => 'nunca chamado'),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { requestTrainingPlanGeneration, startPlanJob, waitForPlanJob } from '../src/services/api/trainingPlanService';
import { supabaseSecureStorage as secureStorage } from '../src/services/auth/secureStorage';

const mockStartPlanJob = startPlanJob as jest.Mock;
const mockWaitForPlanJob = waitForPlanJob as jest.Mock;
const mockRequestTrainingPlanGeneration = requestTrainingPlanGeneration as jest.Mock;

describe('PostQuestionnaireChat — skipChat no init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('com skipChat: true e chat novo, não mostra escolha inicial e dispara geração 1×', async () => {
    mockRouteParams.skipChat = true;

    let resolverGeracao!: (v: unknown) => void;
    mockWaitForPlanJob.mockImplementationOnce(
      () => new Promise((resolve) => { resolverGeracao = resolve; }) as any,
    );

    const { queryByText, findByText } = render(<PostQuestionnaireChat />);

    expect(queryByText('Quero ajustar')).toBeNull();
    expect(queryByText('Montar plano')).toBeNull();

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));

    await findByText('Consolidando suas preferências...');

    resolverGeracao({ status: 'salvo', plan_id: 'plan-1', progress: { step: 'salvo', detail: 'Plano salvo.' } });
  });

  it('com skipChat: true, grava STORAGE_KEY_CHAT_STATE como "generating" antes de gerar', async () => {
    mockRouteParams.skipChat = true;

    render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));

    const setItemMock = secureStorage.setItem as jest.Mock;
    const chamadasState = setItemMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('@chat_state_'),
    );
    expect(chamadasState.length).toBeGreaterThan(0);
    expect(chamadasState[0][1]).toBe('generating');
  });

  it('não dispara geração duplicada em re-render', async () => {
    mockRouteParams.skipChat = true;

    const { rerender } = render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));

    rerender(<PostQuestionnaireChat />);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockStartPlanJob).toHaveBeenCalledTimes(1);
  });

  it('skipChat: true com chat salvo em andamento — escolha ignorada, chat normal aparece', async () => {
    const chatSalvo = JSON.stringify({
      messages: [{ role: 'model', parts: [{ text: 'Olá!' }] }],
      interactionsCount: 0,
      isChatEnded: false,
      adjustments: [],
    });
    const chatStorage = secureStorage.getItem as jest.Mock;
    chatStorage.mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      if (key.startsWith('@chat_messages_')) return chatSalvo;
      return null;
    });

    mockRouteParams.skipChat = true;

    const { findByText } = render(<PostQuestionnaireChat />);

    await findByText('Olá!');

    await new Promise((r) => setTimeout(r, 50));
    expect(mockStartPlanJob).not.toHaveBeenCalled();
  });
});

describe('PostQuestionnaireChat — retomada com geração em andamento (pós-morte do app)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('retoma geração COM os ajustes salvos no chat quando @chat_state_ = "generating"', async () => {
    const chatConcluido = JSON.stringify({
      messages: [
        { role: 'user', parts: [{ text: 'Quero mais volume no treino' }] },
        { role: 'system', parts: [{ text: 'Ok, gerando seu plano...' }] },
      ],
      interactionsCount: 1,
      isChatEnded: true,
      adjustments: ['Quero mais volume no treino'],
    });
    const chatStorage = secureStorage.getItem as jest.Mock;
    chatStorage.mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      if (key.startsWith('@chat_state_')) return 'generating';
      if (key.startsWith('@chat_messages_')) return chatConcluido;
      return null;
    });

    render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));
  });
});
