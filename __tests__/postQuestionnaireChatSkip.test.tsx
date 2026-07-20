// __tests__/postQuestionnaireChatSkip.test.tsx
// Feature A — honrar route.params.skipChat na inicialização do chat.
//
// Quando o usuário vem do botão "Gerar treino direto" (QuestionnaireScreen),
// a tela não deve mostrar a escolha inicial nem criar boas-vindas; deve
// disparar o mesmo fluxo de handleUserDeclinesChat (salvar estado → marcar
// chat completo → gerar plano), uma única vez.

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
}));

jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => true),
  callClaudeApi: jest.fn(async () => 'nunca chamado'),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { requestTrainingPlanGeneration } from '../src/services/api/trainingPlanService';
import { supabaseSecureStorage as secureStorage } from '../src/services/auth/secureStorage';

const mockRequestTrainingPlanGeneration = requestTrainingPlanGeneration as jest.Mock;

describe('PostQuestionnaireChat — skipChat no init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('com skipChat: true e chat novo, não mostra escolha inicial e dispara geração 1×', async () => {
    mockRouteParams.skipChat = true;
    // Mantém a geração pendente para o spinner "Solicitando geração..."
    // ficar visível (estado isGeneratingPlan=true).
    let resolverGeracao!: (v: unknown) => void;
    mockRequestTrainingPlanGeneration.mockImplementationOnce(
      () => new Promise((resolve) => { resolverGeracao = resolve; }) as any,
    );

    const { queryByText, findByText } = render(<PostQuestionnaireChat />);

    // Não deve exibir os botões da escolha inicial
    expect(queryByText('Quero ajustar')).toBeNull();
    expect(queryByText('Montar plano')).toBeNull();

    // Deve disparar a geração exatamente uma vez
    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1));

    // E mostrar o indicador de geração do plano (isGeneratingPlan=true)
    await findByText('Solicitando geração do plano...');

    // Libera a geração para não vazar estado entre testes
    resolverGeracao({ success: true, planId: 'plan-1' });
  });

  it('com skipChat: true, grava STORAGE_KEY_CHAT_COMPLETED antes de gerar', async () => {
    mockRouteParams.skipChat = true;

    render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1));

    // O marcador de chat concluído precisa ser gravado ANTES da geração,
    // para que a retomada (se o app morrer) re-dispare a geração.
    const setItemMock = secureStorage.setItem as jest.Mock;
    const chamadasCompleted = setItemMock.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('@chat_completed_'),
    );
    expect(chamadasCompleted.length).toBeGreaterThan(0);
    expect(chamadasCompleted[0][1]).toBe('true');
  });

  it('não dispara geração duplicada em re-render', async () => {
    mockRouteParams.skipChat = true;

    const { rerender } = render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1));

    // Re-render simula uma nova passagem de render sem remontar
    rerender(<PostQuestionnaireChat />);

    // Aguarda um pouco para garantir que nenhum segundo disparo ocorra
    await new Promise((r) => setTimeout(r, 50));
    expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1);
  });

  it('skipChat: true com chat salvo em andamento — escolha ignorada, chat normal aparece', async () => {
    // Simula chat já em andamento (novo, mas com estado salvo)
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

    // Chat existente: a mensagem de boas-vindas salva aparece
    await findByText('Olá!');

    // Geração NÃO dispara (skipChat é ignorado quando há chat salvo)
    await new Promise((r) => setTimeout(r, 50));
    expect(mockRequestTrainingPlanGeneration).not.toHaveBeenCalled();
  });
});

describe('PostQuestionnaireChat — retomada com chat concluído (pós-morte do app)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('gera o plano COM os ajustes salvos no chat (não com lista vazia)', async () => {
    // App morreu depois de marcar o chat como concluído (ex.: durante a
    // geração). O storage tem os ajustes do usuário — a retomada precisa
    // levá-los para a geração.
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
      if (key.startsWith('@chat_completed_')) return 'true';
      if (key.startsWith('@chat_messages_')) return chatConcluido;
      return null;
    });

    render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1));
    expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledWith(
      'user-123',
      expect.any(Object),
      ['Quero mais volume no treino'],
    );
  });
});
