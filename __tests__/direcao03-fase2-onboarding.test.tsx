// __tests__/direcao03-fase2-onboarding.test.tsx
// Fase 2 da Direção 03 — construção transparente e revelação do plano.
// Modos de falha cobertos:
//  1. onboarding fechado ANTES de o aluno ver o plano (a revelação é o portão:
//     updateProfile só pode rodar no toque em "Começar");
//  2. falha do updateProfile na revelação virava beco sem saída — precisa de
//     erro visível + retry com o plano preservado;
//  3. construção regredindo a spinner mudo — as 4 etapas reais têm que estar lá;
//  4. sugestões prontas enviando o texto ERRADO (evento de press como texto).

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

const mockUpdateProfile = jest.fn(async (_patch: unknown) => ({}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-123',
      onboarding_completed: false,
      user_metadata: { full_name: 'Pedro' },
    },
    updateProfile: (patch: unknown) => mockUpdateProfile(patch),
  }),
}));

const mockQuestionario = JSON.stringify({
  objetivo: 'muscle_gain',
  nome: 'Pedro',
  dias_treino: ['mon', 'wed', 'fri', 'sat'],
  tempo_medio_treino_min: 60,
});

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

const mockCallClaudeApi = jest.fn(async (..._args: unknown[]) => 'Anotado! Vou considerar isso no plano.');
jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => true),
  callClaudeApi: (...args: unknown[]) => mockCallClaudeApi(...args),
}));

jest.mock('../src/services/trainingRepository', () => ({
  getActivePlanId: jest.fn(async () => null),
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { waitForPlanJob } from '../src/services/api/trainingPlanService';

const mockWaitForPlanJob = waitForPlanJob as jest.Mock;

describe('Fase 2 — construção transparente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('durante a geração, mostra as 4 etapas reais em vez de spinner mudo', async () => {
    mockRouteParams.skipChat = true;
    let resolver!: (v: unknown) => void;
    mockWaitForPlanJob.mockImplementationOnce(
      (_job: string, onProgress: (p: unknown) => void) =>
        new Promise((resolve) => {
          resolver = resolve;
          onProgress({ status: 'expandindo', progress: { step: 'expandindo', detail: 'Escolhendo do catálogo…' } });
        }),
    );

    const utils = render(<PostQuestionnaireChat />);

    await utils.findByTestId('tela-construcao');
    expect(utils.getByText('Construindo seu plano.')).toBeTruthy();
    expect(utils.getByText('Analisando suas respostas')).toBeTruthy();
    expect(utils.getByText('Estruturando as semanas')).toBeTruthy();
    expect(utils.getByText('Escolhendo exercícios do catálogo')).toBeTruthy();
    expect(utils.getByText('Calibrando e salvando')).toBeTruthy();
    // Detalhe REAL do job visível (nada de texto inventado)
    expect(utils.getByText('Escolhendo do catálogo…')).toBeTruthy();

    resolver({ status: 'salvo', plan_id: 'plan-1', progress: { step: 'salvo', detail: 'Plano salvo.' } });
    await utils.findByTestId('tela-revelacao');
  });
});

describe('Fase 2 — revelação é o portão do onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  it('job salvo NÃO fecha o onboarding sozinho; "Começar" fecha com o plan_id certo', async () => {
    mockRouteParams.skipChat = true;

    const utils = render(<PostQuestionnaireChat />);

    await utils.findByTestId('tela-revelacao');
    // O plano está pronto, mas o aluno ainda não entrou: perfil intocado.
    expect(mockUpdateProfile).not.toHaveBeenCalled();

    // Resumo vem dos dados REAIS do questionário salvo
    expect(utils.getByText('Seu plano de ganho de massa muscular.')).toBeTruthy();
    expect(utils.getByText('4 treinos por semana · ~60 min por sessão')).toBeTruthy();

    fireEvent.press(utils.getByLabelText('Começar'));

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      onboarding_completed: true,
      current_plan_id: 'plan-1',
    });
  });

  it('falha ao entrar mantém a revelação com erro e retry — plano preservado', async () => {
    mockRouteParams.skipChat = true;
    mockUpdateProfile.mockRejectedValueOnce(new Error('rede fora'));

    const utils = render(<PostQuestionnaireChat />);

    await utils.findByTestId('tela-revelacao');
    fireEvent.press(utils.getByLabelText('Começar'));

    await utils.findByText('Não foi possível entrar agora. Seu plano está salvo — tente de novo.');
    expect(utils.getByTestId('tela-revelacao')).toBeTruthy();

    // Retry com o MESMO plano
    fireEvent.press(utils.getByLabelText('Começar'));
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(2));
    expect(mockUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ current_plan_id: 'plan-1' }),
    );
  });
});

describe('Fase 2 — sugestões prontas no chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  });

  const abrirChat = async () => {
    const utils = render(<PostQuestionnaireChat />);
    // Escolha inicial → "Quero ajustar" abre a conversa
    fireEvent.press(await utils.findByLabelText('Quero ajustar'));
    return utils;
  };

  it('as 3 sugestões aparecem antes da 1ª interação e enviam o TEXTO da sugestão', async () => {
    const utils = await abrirChat();

    const chip = await utils.findByLabelText('Sugerir: Tenho uma limitação no ombro');
    fireEvent.press(chip);

    await waitFor(() => expect(mockCallClaudeApi).toHaveBeenCalledTimes(1));
    // 1º argumento: histórico para a API — a última mensagem do usuário tem que
    // ser exatamente o texto da sugestão (não um objeto de evento).
    const historico = mockCallClaudeApi.mock.calls[0][0] as Array<{ role: string; parts: { text: string }[] }>;
    const doUsuario = historico.filter((m) => m.role === 'user');
    expect(doUsuario[doUsuario.length - 1].parts[0].text).toBe('Tenho uma limitação no ombro');
  });

  it('depois da 1ª interação as sugestões saem de cena', async () => {
    const utils = await abrirChat();

    fireEvent.press(await utils.findByLabelText('Sugerir: Quero priorizar costas'));
    await waitFor(() => expect(mockCallClaudeApi).toHaveBeenCalledTimes(1));

    await waitFor(() =>
      expect(utils.queryByLabelText('Sugerir: Quero priorizar costas')).toBeNull(),
    );
  });
});
