// __tests__/postQuestionnaireChatUnavailable.test.tsx
// Feature B — chat com IA indisponível e usuário retomando conversa em
// andamento. Garante que exista sempre uma saída: o ✓ "Finalizar ajustes"
// fica habilitado e um CTA "Gerar treino sem ajustes" aparece.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

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

// Chat em andamento: já há uma conversa (sem ser escolha inicial)
const mockChatEmAndamento = JSON.stringify({
  messages: [
    { role: 'model', parts: [{ text: 'Olá, Pedro!' }] },
    { role: 'user', parts: [{ text: 'Quero mais volume no treino' }] },
    { role: 'model', parts: [{ text: 'Entendido.' }] },
  ],
  interactionsCount: 1,
  isChatEnded: false,
  adjustments: ['Quero mais volume no treino'],
});

jest.mock('../src/services/auth/secureStorage', () => ({
  supabaseSecureStorage: {
    getItem: jest.fn(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      if (key.startsWith('@chat_messages_')) return mockChatEmAndamento;
      return null;
    }),
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
  testClaudeApiConnection: jest.fn(async () => false),
  callClaudeApi: jest.fn(async () => 'nunca chamado'),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { requestTrainingPlanGeneration } from '../src/services/api/trainingPlanService';

const mockRequestTrainingPlanGeneration = requestTrainingPlanGeneration as jest.Mock;

describe('PostQuestionnaireChat — IA indisponível com chat em andamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('mostra o CTA "Gerar treino sem ajustes" e o ✓ "Finalizar ajustes" habilitado', async () => {
    const { findByText, getByLabelText } = render(<PostQuestionnaireChat />);

    // Aviso persistente de indisponibilidade
    await findByText('Assistente indisponível no momento.');

    // CTA de saída aparece
    const cta = await findByText('Gerar treino sem ajustes');
    expect(cta).toBeTruthy();

    // O ✓ "Finalizar ajustes" NÃO está desabilitado (é a saída principal)
    const finalizar = getByLabelText('Finalizar ajustes');
    expect(finalizar.props.accessibilityState?.disabled).not.toBe(true);
  });

  it('tocar no CTA "Gerar treino sem ajustes" dispara a geração preservando ajustes', async () => {
    const { findByText } = render(<PostQuestionnaireChat />);

    const cta = await findByText('Gerar treino sem ajustes');
    fireEvent.press(cta);

    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1));

    // O ajuste acumulado na conversa precisa chegar à geração
    expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledWith(
      'user-123',
      expect.any(Object),
      expect.arrayContaining(['Quero mais volume no treino']),
    );
  });
});

describe('PostQuestionnaireChat — retry de geração falha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('em falha de geração, mostra "Tentar novamente" e redispara geração', async () => {
    // Primeira chamada falha, segunda sucede
    mockRequestTrainingPlanGeneration
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(async () => ({ success: true, planId: 'plan-2' }));

    // Limpa o storage de chat para que skipChat não dispare no init
    const { supabaseSecureStorage } = require('../src/services/auth/secureStorage');
    (supabaseSecureStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      return null;
    });

    // skipChat true para entrar direto no fluxo de geração (que falha)
    mockRouteParams.skipChat = true;

    const { findByText } = render(<PostQuestionnaireChat />);

    // Primeira tentativa dispara
    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(1));

    // Aparece o botão de retry
    const retry = await findByText('Tentar novamente');
    expect(retry).toBeTruthy();

    fireEvent.press(retry);

    // Segunda chamada dispara
    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(2));
  });
});

describe('PostQuestionnaireChat — sem avisos duplicados de indisponibilidade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
    // O describe de retry (acima) troca a implementação do getItem; este
    // cenário precisa do chat em andamento de volta.
    const { supabaseSecureStorage } = require('../src/services/auth/secureStorage');
    (supabaseSecureStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      if (key.startsWith('@chat_messages_')) return mockChatEmAndamento;
      return null;
    });
  });

  it('com o aviso de saída visível, o chatError de indisponibilidade não empilha', async () => {
    const { findByText, queryByText } = render(<PostQuestionnaireChat />);

    // O aviso com CTA (B2) é o único responsável por comunicar indisponibilidade
    await findByText('Assistente indisponível no momento.');

    // O chatError do init ("Assistente IA indisponível...") não pode aparecer
    // junto — dois banners dizendo a mesma coisa.
    expect(queryByText('Assistente IA indisponível. Você pode gerar o treino sem ajustes.')).toBeNull();
  });
});

describe('PostQuestionnaireChat — retry não dispara geração concorrente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('dois toques no "Tentar novamente" produzem UMA geração extra, não duas', async () => {
    // 1ª geração (init/skipChat) falha; 2ª (retry) fica pendurada.
    let resolver2!: (v: unknown) => void;
    mockRequestTrainingPlanGeneration
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(() => new Promise((resolve) => { resolver2 = resolve; }) as any);

    const { supabaseSecureStorage } = require('../src/services/auth/secureStorage');
    (supabaseSecureStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      return null;
    });
    mockRouteParams.skipChat = true;

    const { findByText } = render(<PostQuestionnaireChat />);

    const retry = await findByText('Tentar novamente');
    fireEvent.press(retry);
    fireEvent.press(retry); // toque duplo imediato

    await waitFor(() => expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockRequestTrainingPlanGeneration).toHaveBeenCalledTimes(2);

    resolver2({ success: true, planId: 'plan-3' });
  });
});
