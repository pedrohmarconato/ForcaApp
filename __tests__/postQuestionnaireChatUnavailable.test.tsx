// __tests__/postQuestionnaireChatUnavailable.test.tsx
// Feature B — chat com IA indisponível e usuário retomando conversa em
// andamento. Garante que exista sempre uma saída: o ✓ "Finalizar ajustes"
// fica habilitado e um CTA "Gerar treino sem ajustes" aparece.
//
// Atualizado para a nova arquitetura: startPlanJob + waitForPlanJob +
// consolidateChat em vez de requestTrainingPlanGeneration.

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

// A tela agora consulta o plano ativo na retomada (achado #4 do review do
// PR #19); mock evita importar o cliente Supabase real no teste.
jest.mock('../src/services/trainingRepository', () => ({
  getActivePlanId: jest.fn(async () => null),
}));

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
  consolidateChat: jest.fn(async () => ({
    preferencias: [], restricoes: [], excecoes_estruturais: [],
  })),
  startPlanJob: jest.fn(async () => 'job-test'),
  waitForPlanJob: jest.fn(async () => ({
    status: 'salvo', plan_id: 'plan-1', progress: { step: 'salvo', detail: 'ok' },
  })),
}));

jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => false),
  callClaudeApi: jest.fn(async () => 'nunca chamado'),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { startPlanJob, waitForPlanJob } from '../src/services/api/trainingPlanService';

const mockStartPlanJob = startPlanJob as jest.Mock;
const mockWaitForPlanJob = waitForPlanJob as jest.Mock;

describe('PostQuestionnaireChat — IA indisponível com chat em andamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('mostra o CTA "Gerar treino sem ajustes" e o ✓ "Finalizar ajustes" habilitado', async () => {
    const { findByText, getByLabelText } = render(<PostQuestionnaireChat />);

    await findByText('Assistente indisponível no momento.');

    const cta = await findByText('Gerar treino sem ajustes');
    expect(cta).toBeTruthy();

    const finalizar = getByLabelText('Finalizar ajustes');
    expect(finalizar.props.accessibilityState?.disabled).not.toBe(true);
  });

  it('tocar no CTA "Gerar treino sem ajustes" dispara a geração via startPlanJob', async () => {
    const { findByText } = render(<PostQuestionnaireChat />);

    const cta = await findByText('Gerar treino sem ajustes');
    fireEvent.press(cta);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));
  });
});

describe('PostQuestionnaireChat — retry de geração falha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('em falha de geração, mostra "Tentar novamente" e redispara geração', async () => {
    mockWaitForPlanJob
      .mockImplementationOnce(async () => { throw new Error('boom'); })
      .mockImplementationOnce(async () => ({ status: 'salvo', plan_id: 'plan-2', progress: { step: 'salvo', detail: 'ok' } }));

    const { supabaseSecureStorage } = require('../src/services/auth/secureStorage');
    (supabaseSecureStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      return null;
    });

    mockRouteParams.skipChat = true;

    const { findByText } = render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));

    const retry = await findByText('Tentar novamente');
    expect(retry).toBeTruthy();

    fireEvent.press(retry);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(2));
  });
});

describe('PostQuestionnaireChat — sem avisos duplicados de indisponibilidade', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
    const { supabaseSecureStorage } = require('../src/services/auth/secureStorage');
    (supabaseSecureStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      if (key.startsWith('@chat_messages_')) return mockChatEmAndamento;
      return null;
    });
  });

  it('com o aviso de saída visível, o chatError de indisponibilidade não empilha', async () => {
    const { findByText, queryByText } = render(<PostQuestionnaireChat />);

    await findByText('Assistente indisponível no momento.');

    expect(queryByText('Assistente IA indisponível. Você pode gerar o treino sem ajustes.')).toBeNull();
  });
});

describe('PostQuestionnaireChat — retry não dispara geração concorrente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('dois toques no "Tentar novamente" produzem UMA geração extra, não duas', async () => {
    let resolver2!: (v: unknown) => void;
    mockWaitForPlanJob
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
    fireEvent.press(retry);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockStartPlanJob).toHaveBeenCalledTimes(2);

    resolver2({ status: 'salvo', plan_id: 'plan-3', progress: { step: 'salvo', detail: 'ok' } });
  });
});
