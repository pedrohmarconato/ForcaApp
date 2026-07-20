// __tests__/postQuestionnaireChatInit.test.tsx
// Inicialização do chat pós-questionário com backend indisponível.
//
// Achado do review: uma falha de readiness gerava até TRÊS warnings (inter-
// ceptor, claudeService e esta tela) e o erro de chat abria console.error
// para uma falha operacional já tratada pela UI. A política pós-correção:
// quem loga a indisponibilidade é o interceptor do apiClient (UMA linha de
// warn); serviço e tela não somam warn/error próprios.
//
// Aqui o claudeService é mockado (o comportamento dele é coberto por
// apiClientRetryFlow.test.ts); o que se verifica é a contribuição da TELA:
// zero console.warn e zero console.error, com o fallback amigável visível.

import React from 'react';
import { render } from '@testing-library/react-native';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: {} }),
  useNavigation: () => ({ navigate: mockNavigate, addListener: jest.fn(() => jest.fn()) }),
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

const mockQuestionario = JSON.stringify({ objetivo: 'hipertrofia' });

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

jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => false),
  callClaudeApi: jest.fn(async () => 'nunca chamado neste teste'),
}));

jest.mock('../src/services/api/trainingPlanService', () => ({
  requestTrainingPlanGeneration: jest.fn(async () => ({ success: true })),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { testClaudeApiConnection } from '../src/services/api/claudeService';

describe('PostQuestionnaireChat — backend indisponível na inicialização', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('mostra o fallback amigável sem contribuir com console.warn/console.error', async () => {
    const { findByText } = render(<PostQuestionnaireChat />);

    await findByText('Assistente IA indisponível. Você pode gerar o treino sem ajustes.');

    expect(testClaudeApiConnection).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
