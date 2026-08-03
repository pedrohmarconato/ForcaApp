// __tests__/planoOrfaoNaTela.test.tsx
// Incidente de 27/07/2026: o polling morreu 11 s antes do backend salvar o
// plano. A tela mostrou "Erro ao gerar plano" e ofereceu "Tentar novamente" —
// que dispara OUTRA geração no Opus — enquanto o plano já estava gravado.
//
// Perder o acompanhamento não é o mesmo que a geração ter falhado: antes de
// reportar erro, a tela precisa procurar o plano no banco.

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
      user_metadata: { full_name: 'Tonetto' },
    },
    updateProfile: jest.fn(async () => ({})),
  }),
}));

const mockQuestionario = JSON.stringify({ objetivo: 'hipertrofia', nome: 'Tonetto' });
let mockChatSalvo: string | null = null;
let mockChatStateFlag: string | null = null;

jest.mock('../src/services/auth/secureStorage', () => ({
  supabaseSecureStorage: {
    getItem: jest.fn(async (key: string) => {
      if (key.startsWith('@questionnaire_data_')) return mockQuestionario;
      if (key.startsWith('@chat_state_')) return mockChatStateFlag;
      if (key.startsWith('@chat_messages_')) return mockChatSalvo;
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
  requestTrainingPlanGeneration: jest.fn(),
  consolidateChat: jest.fn(async () => ({
    preferencias: [],
    restricoes: [],
    excecoes_estruturais: [],
  })),
  startPlanJob: jest.fn(async () => 'job-e1b47e05'),
  waitForPlanJob: jest.fn(async () => ({
    status: 'salvo',
    plan_id: 'plan-80aff988',
    progress: { step: 'salvo', detail: 'Plano salvo.' },
  })),
}));

jest.mock('../src/services/api/claudeService', () => ({
  testClaudeApiConnection: jest.fn(async () => true),
  callClaudeApi: jest.fn(async () => 'nunca chamado'),
}));

jest.mock('../src/services/trainingRepository', () => ({
  getActivePlanId: jest.fn(async () => null),
}));

jest.mock('../src/services/planRecovery', () => ({
  recuperarPlanoSalvo: jest.fn(async () => null),
  RECUPERACAO_TENTATIVAS: 6,
  RECUPERACAO_INTERVALO_MS: 10000,
}));

import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import { consolidateChat, startPlanJob, waitForPlanJob } from '../src/services/api/trainingPlanService';
import { AcompanhamentoPerdidoError } from '../src/services/api/planJobErrors';
import { recuperarPlanoSalvo } from '../src/services/planRecovery';

const mockStartPlanJob = startPlanJob as jest.Mock;
const mockWaitForPlanJob = waitForPlanJob as jest.Mock;
const mockConsolidateChat = consolidateChat as jest.Mock;
const mockRecuperarPlanoSalvo = recuperarPlanoSalvo as jest.Mock;

const resetTudo = () => {
  jest.clearAllMocks();
  Object.keys(mockRouteParams).forEach((k) => delete (mockRouteParams as any)[k]);
  mockChatSalvo = null;
  mockChatStateFlag = null;
  mockStartPlanJob.mockResolvedValue('job-e1b47e05');
  mockConsolidateChat.mockResolvedValue({ preferencias: [], restricoes: [], excecoes_estruturais: [] });
  mockRecuperarPlanoSalvo.mockResolvedValue(null);
};

describe('PostQuestionnaireChat — plano salvo que o app não acompanhou', () => {
  beforeEach(resetTudo);

  it('REPRODUÇÃO: polling perdido com plano já salvo mostra o plano, não erro', async () => {
    mockRouteParams.skipChat = true;
    mockWaitForPlanJob.mockRejectedValueOnce(
      new AcompanhamentoPerdidoError('Conexão instável: não consegui acompanhar a geração do plano.'),
    );
    mockRecuperarPlanoSalvo.mockResolvedValueOnce('plan-80aff988');

    const { findByTestId, queryByText } = render(<PostQuestionnaireChat />);

    await findByTestId('tela-revelacao');
    expect(queryByText(/Erro ao gerar plano/)).toBeNull();
  });

  it('procura o plano no banco antes de oferecer nova geração', async () => {
    mockRouteParams.skipChat = true;
    mockWaitForPlanJob.mockRejectedValueOnce(new AcompanhamentoPerdidoError('Conexão instável.'));
    mockRecuperarPlanoSalvo.mockResolvedValueOnce('plan-80aff988');

    render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockRecuperarPlanoSalvo).toHaveBeenCalledTimes(1));
    expect(mockRecuperarPlanoSalvo.mock.calls[0][0]).toBe('user-123');
    // Job criado: vale insistir enquanto a geração pode estar terminando.
    expect(mockRecuperarPlanoSalvo.mock.calls[0][1]).toBeGreaterThan(1);
    expect(mockStartPlanJob).toHaveBeenCalledTimes(1);
  });

  it('falha real (nenhum plano no banco) continua virando erro com retry', async () => {
    mockRouteParams.skipChat = true;
    mockWaitForPlanJob.mockRejectedValueOnce(new AcompanhamentoPerdidoError('Conexão instável.'));
    mockRecuperarPlanoSalvo.mockResolvedValueOnce(null);

    const { findByText } = render(<PostQuestionnaireChat />);

    await findByText(/Erro ao gerar plano/);
  });

  it('falha determinística não segura a tela pela janela inteira: uma consulta basta', async () => {
    mockRouteParams.skipChat = true;
    // Erro que não é perda de acompanhamento (bug local, resposta inválida...):
    // a geração não está viva, então não há o que esperar.
    mockWaitForPlanJob.mockRejectedValueOnce(new Error('boom'));
    mockRecuperarPlanoSalvo.mockResolvedValueOnce(null);

    const { findByText } = render(<PostQuestionnaireChat />);

    await findByText(/Erro ao gerar plano/);
    expect(mockRecuperarPlanoSalvo.mock.calls[0][1]).toBe(1);
  });

  it('job que o servidor terminou em erro também procura plano antes de reportar', async () => {
    mockRouteParams.skipChat = true;
    mockWaitForPlanJob.mockResolvedValueOnce({
      status: 'erro',
      plan_id: null,
      progress: { step: 'perdido', detail: 'Sessão de geração expirada.' },
      error: { code: 'job_lost', message: 'O servidor foi reiniciado.' },
    });
    mockRecuperarPlanoSalvo.mockResolvedValueOnce('plan-80aff988');

    const { findByTestId } = render(<PostQuestionnaireChat />);

    await findByTestId('tela-revelacao');
  });
});

describe('PostQuestionnaireChat — consolidação do chat', () => {
  beforeEach(resetTudo);

  it('quem gera direto não chama a consolidação (o backend rejeita esse payload com 400)', async () => {
    mockRouteParams.skipChat = true;

    render(<PostQuestionnaireChat />);

    await waitFor(() => expect(mockStartPlanJob).toHaveBeenCalledTimes(1));
    expect(mockConsolidateChat).not.toHaveBeenCalled();
  });

  // Conversa de verdade: o aluno escreveu e finalizou pelo ✓ → "Confirmar e
  // gerar". É o único caminho em que o histórico está no estado da tela.
  const conversaComFalaDoAluno = () =>
    JSON.stringify({
      messages: [
        { role: 'model', parts: [{ text: 'Olá! Quer ajustar algo?' }] },
        { role: 'user', parts: [{ text: 'Quero focar mais em peito' }] },
        { role: 'model', parts: [{ text: 'Anotado.' }] },
      ],
      interactionsCount: 1,
      isChatEnded: false,
      adjustments: ['Quero focar mais em peito'],
    });

  const finalizarChatEGerar = async (utils: ReturnType<typeof render>) => {
    fireEvent.press(await utils.findByLabelText('Finalizar ajustes'));
    fireEvent.press(await utils.findByText('Confirmar e gerar'));
  };

  it('consolidação falhando COM conversa real BLOQUEIA a geração', async () => {
    mockChatSalvo = conversaComFalaDoAluno();
    mockConsolidateChat.mockRejectedValueOnce(new Error('Erro ao comunicar com o serviço de IA.'));

    const utils = render(<PostQuestionnaireChat />);
    await finalizarChatEGerar(utils);

    // Sem as diretrizes do chat não pode haver plano: o pedido do aluno (ex.:
    // "sem perna nas primeiras semanas") morreria num 400 do consolidate e o
    // plano sairia ignorando a conversa (incidente 30/07/2026). Gerar é
    // bloqueado e o erro aparece com opção de tentar de novo.
    expect(mockStartPlanJob).not.toHaveBeenCalled();
    await utils.findByText(/não foi possível processar sua conversa/i);
  });

  it('conversa consolidada com sucesso não mostra aviso nenhum', async () => {
    mockChatSalvo = conversaComFalaDoAluno();

    const utils = render(<PostQuestionnaireChat />);
    await finalizarChatEGerar(utils);

    await utils.findByTestId('tela-revelacao');
    expect(mockConsolidateChat).toHaveBeenCalledTimes(1);
    expect(utils.queryByText(/ajustes da conversa não entraram/i)).toBeNull();
  });
});
