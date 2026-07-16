// __tests__/claudeService.test.ts
// Garante que o serviço de chat: (1) chama o BACKEND (/chat) e não a API
// da Anthropic diretamente, (2) transforma o histórico corretamente,
// (3) não depende de nenhuma chave de API no app.

import { callClaudeApi, testClaudeApiConnection } from '../src/services/api/claudeService';
import apiClient, { ENDPOINTS } from '../src/services/api/apiClient';

// Mock do apiClient (o módulo real faria chamadas HTTP e importaria supabase)
jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
  ENDPOINTS: {
    TRAINING: { GENERATE_PLAN: '/generate-plan' },
    CHAT: '/chat',
    HEALTH: '/health',
  },
}));

const mockedPost = apiClient.post as jest.Mock;
const mockedGet = apiClient.get as jest.Mock;

describe('claudeService (proxy via backend)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envia a conversa para o endpoint /chat do backend, não para a Anthropic', async () => {
    mockedPost.mockResolvedValueOnce({ data: { reply: 'Resposta da IA' } });

    const history = [
      { role: 'system' as const, parts: [{ text: 'contexto ignorado' }] },
      { role: 'user' as const, parts: [{ text: 'Quero mais peito' }] },
      { role: 'model' as const, parts: [{ text: 'Entendido!' }] },
    ];

    const result = await callClaudeApi(history, { idade: 30 }, ['foco em peito']);

    // Chamou o backend
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = mockedPost.mock.calls[0];
    expect(endpoint).toBe('/chat');

    // Mensagens transformadas: sem 'system', 'model' vira 'assistant'
    expect(payload.messages).toEqual([
      { role: 'user', content: 'Quero mais peito' },
      { role: 'assistant', content: 'Entendido!' },
    ]);
    expect(payload.questionnaireData).toEqual({ idade: 30 });
    expect(payload.adjustments).toEqual(['foco em peito']);
    // Nenhuma chave de API vai no payload
    expect(JSON.stringify(payload)).not.toMatch(/sk-ant|api[_-]?key/i);

    expect(result).toBe('Resposta da IA');
  });

  it('descarta saudação inicial do assistente (API exige começar com user)', async () => {
    mockedPost.mockResolvedValueOnce({ data: { reply: 'Ok!' } });

    // Caso real: a tela semeia o chat com uma mensagem de boas-vindas do modelo
    const history = [
      { role: 'model' as const, parts: [{ text: 'Bem-vindo! Como posso ajudar?' }] },
      { role: 'user' as const, parts: [{ text: 'Quero mais peito' }] },
    ];

    await callClaudeApi(history, null, []);

    const [, payload] = mockedPost.mock.calls[0];
    expect(payload.messages).toEqual([{ role: 'user', content: 'Quero mais peito' }]);
  });

  it('lança erro amigável quando o backend falha', async () => {
    mockedPost.mockRejectedValueOnce({ message: 'Network Error' });

    await expect(
      callClaudeApi([{ role: 'user' as const, parts: [{ text: 'Oi' }] }], null, []),
    ).rejects.toThrow('Falha na comunicação com o assistente.');
  });

  it('rejeita histórico vazio sem chamar o backend', async () => {
    await expect(callClaudeApi([], null, [])).rejects.toThrow('Nenhuma mensagem');
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('testClaudeApiConnection consulta o /health do backend', async () => {
    mockedGet.mockResolvedValueOnce({ data: { status: 'ok' } });
    await expect(testClaudeApiConnection()).resolves.toBe(true);
    expect(mockedGet).toHaveBeenCalledWith(ENDPOINTS.HEALTH);

    mockedGet.mockRejectedValueOnce(new Error('offline'));
    await expect(testClaudeApiConnection()).resolves.toBe(false);
  });
});
