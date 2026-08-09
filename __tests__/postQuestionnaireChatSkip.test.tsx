// __tests__/postQuestionnaireChatSkip.test.tsx
// Feature A — honrar route.params.skipChat na inicialização do chat.
//
// Quando o usuário vem do botão "Gerar treino direto" (QuestionnaireScreen),
// a tela não deve mostrar a escolha inicial nem criar boas-vindas; deve
// disparar o mesmo fluxo de handleUserDeclinesChat (salvar estado → marcar
// estado 'generating' → gerar plano), uma única vez.

import React from 'react';
import { render, waitFor, act, fireEvent } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockPopToTop = jest.fn();
const mockRouteParams: { formData?: any; skipChat?: boolean } = {};

const mockAuth: {
  user: { id: string; onboarding_completed: boolean; user_metadata: { full_name: string } };
  updateProfile: jest.Mock;
} = {
  user: { id: 'user-123', onboarding_completed: false, user_metadata: { full_name: 'Pedro' } },
  updateProfile: jest.fn(async () => ({})),
};

jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: mockRouteParams }),
  useNavigation: () => ({
    navigate: mockNavigate,
    addListener: jest.fn(() => jest.fn()),
    goBack: mockGoBack,
    popToTop: mockPopToTop,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
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

let mockHasSessionInProgress = jest.fn();

jest.mock('../src/services/trainingRepository', () => ({
  getActivePlanId: jest.fn(async () => null),
  hasSessionInProgress: (...args: unknown[]) => mockHasSessionInProgress(...args),
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
    mockAuth.user.onboarding_completed = false;
    mockHasSessionInProgress.mockResolvedValue(false);
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

  it('regeneração da aba Plano (skipChat com onboarding já completo): init NÃO retorna cedo — gera de novo (achado nº 7 do review 67)', async () => {
    mockRouteParams.skipChat = true;
    mockAuth.user.onboarding_completed = true;

    render(<PostQuestionnaireChat />);

    // Antes do fix, o init saía no early-return de onboarding_completed e o
    // botão "Gerar novo plano" morria sem geração.
    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));
  });

  it('regeneração SEM skipChat com onboarding completo continua saindo cedo (fluxo antigo intacto)', async () => {
    mockRouteParams.skipChat = false;
    mockAuth.user.onboarding_completed = true;

    render(<PostQuestionnaireChat />);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockStartPlanJob).not.toHaveBeenCalled();
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
    mockHasSessionInProgress.mockResolvedValue(false);
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

describe('PostQuestionnaireChat — "Começar" e o retorno ao stack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
    mockAuth.user.onboarding_completed = false;
    mockHasSessionInProgress.mockResolvedValue(false);
    (secureStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key.startsWith('@questionnaire_data_') ? mockQuestionario : null,
    );
  });

  it('REGENERAÇÃO (onboarding já completo): volta ao topo do stack de treino', async () => {
    mockRouteParams.skipChat = true;
    mockAuth.user.onboarding_completed = true;

    const { findByText } = render(<PostQuestionnaireChat />);
    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));
    const botao = await findByText('Começar');
    await act(async () => { fireEvent.press(botao); });

    expect(mockPopToTop).toHaveBeenCalledTimes(1);
  });

  it('ONBOARDING original (completed=false): NÃO chama popToTop — quem troca é o RootNavigator', async () => {
    // skipChat também é o caminho normal do onboarding ("Gerar treino direto"):
    // guardar o popToTop por ele fazia o stack de onboarding voltar ao
    // questionário no exato instante da troca de navigator.
    mockRouteParams.skipChat = true;
    mockAuth.user.onboarding_completed = false;

    const { findByText } = render(<PostQuestionnaireChat />);
    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));
    const botao = await findByText('Começar');
    await act(async () => { fireEvent.press(botao); });

    expect(mockAuth.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ onboarding_completed: true }),
    );
    expect(mockPopToTop).not.toHaveBeenCalled();
  });
});

describe('PostQuestionnaireChat — guard de sessão em andamento na geração', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
    mockAuth.user.onboarding_completed = false;
    mockHasSessionInProgress.mockResolvedValue(false);
  });

  it('com sessão em andamento no momento da geração, NÃO gera e oferece voltar ao plano', async () => {
    mockRouteParams.skipChat = true;
    mockHasSessionInProgress.mockResolvedValue(true);

    const { findByText, getByLabelText } = render(<PostQuestionnaireChat />);

    await findByText(
      'Você tem um treino em andamento. Termine ou saia dele antes de gerar um novo plano.',
    );
    expect(mockStartPlanJob).not.toHaveBeenCalled();
    // CTA de saída: retry é fútil enquanto a sessão segue em andamento — o
    // usuário vai ao plano, onde a sessão é retomada ou abandonada.
    fireEvent.press(getByLabelText('Voltar ao plano'));
    expect(mockPopToTop).toHaveBeenCalledTimes(1);
  });

  it('bloqueio no skipChat encerra o chat (não reabre a conversa ao dispensar)', async () => {
    mockRouteParams.skipChat = true;
    mockHasSessionInProgress.mockResolvedValue(true);

    const { findByText } = render(<PostQuestionnaireChat />);

    // isChatEnded segue o contrato do handleConfirmEndChat: sem isto, após
    // dispensar o aviso o chat reabriria inteiro sem indício do que houve.
    await findByText('Chat encerrado. Toque em ✓ para gerar o treino.');
    expect(mockStartPlanJob).not.toHaveBeenCalled();
  });

  it('com falha na checagem, NÃO gera e pede para tentar de novo', async () => {
    mockRouteParams.skipChat = true;
    mockHasSessionInProgress.mockRejectedValue(new Error('rede caiu'));

    const { findByText } = render(<PostQuestionnaireChat />);

    // Mensagem neutra: no primeiro onboarding nunca houve treino para estar
    // em andamento.
    await findByText('Erro ao gerar plano: não foi possível verificar sua situação atual. Tente de novo.');
    expect(mockStartPlanJob).not.toHaveBeenCalled();
  });
});

describe('PostQuestionnaireChat — limpeza de cópia legada no saveChatState', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
    mockAuth.user.onboarding_completed = false;
    mockHasSessionInProgress.mockResolvedValue(false);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // Regressão: o mock manual de secureStorage precisa expor
  // removeLegacyPlaintextCopy tal como o módulo real (src/services/auth/
  // secureStorage.ts) exporta — do contrário saveChatState (linha 167) chama
  // undefined como função, o catch engole o TypeError e loga console.error a
  // cada save, mascarando que a limpeza da cópia legada nunca roda no teste.
  it('saveChatState não loga erro ao acionar removeLegacyPlaintextCopy', async () => {
    mockRouteParams.skipChat = true;

    render(<PostQuestionnaireChat />);

    // handleUserDeclinesChat chama saveChatState (setItem + removeLegacyPlaintextCopy)
    // antes de disparar a geração do plano.
    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));

    const logouErroDeSalvarEstado = errorSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('Erro ao salvar estado do chat'),
    );
    expect(logouErroDeSalvarEstado).toBe(false);
  });
});
