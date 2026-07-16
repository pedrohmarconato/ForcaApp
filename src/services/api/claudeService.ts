// src/services/api/claudeService.ts
// Cliente do chat com IA. A chamada ao Claude acontece EXCLUSIVAMENTE no
// backend (POST /api/chat), onde a chave da Anthropic fica protegida.
// Nenhuma chave de API de IA é embutida no aplicativo.

import apiClient, { ENDPOINTS } from './apiClient';
import { logger } from '../../utils/logger';

// Formato de mensagem usado pelos componentes de chat
export type ChatContent = { role: 'user' | 'model' | 'system'; parts: { text: string }[] };

// Formato de mensagem aceito pelo backend (/api/chat)
type ApiMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Converte o histórico interno do chat para o formato da API.
 * - Mensagens de 'system' são descartadas (o contexto vai no campo system do backend).
 * - Mensagens iniciais do assistente (ex.: saudação de boas-vindas) são removidas,
 *   pois a API exige que a conversa comece com uma mensagem do usuário.
 */
const toApiMessages = (history: ChatContent[]): ApiMessage[] => {
  const mapped = history
    .filter((msg) => msg.role !== 'system')
    .map((msg): ApiMessage => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts[0]?.text ?? '',
    }))
    .filter((msg) => msg.content.trim().length > 0);

  const firstUserIndex = mapped.findIndex((msg) => msg.role === 'user');
  return firstUserIndex >= 0 ? mapped.slice(firstUserIndex) : [];
};

/**
 * Envia a conversa ao backend, que adiciona o contexto do questionário e
 * chama a API Claude com a chave protegida no servidor.
 *
 * @param history Histórico da conversa no formato interno ({ role, parts }).
 * @param questionnaireData Respostas do questionário (contexto do sistema).
 * @param adjustments Ajustes/perguntas anteriores do usuário no chat.
 * @returns O texto da resposta da IA.
 * @throws Error se o backend falhar ou retornar resposta inválida.
 */
export const callClaudeApi = async (
  history: ChatContent[],
  questionnaireData: unknown = null,
  adjustments: string[] = [],
): Promise<string> => {
  const messages = toApiMessages(history);

  if (messages.length === 0) {
    throw new Error('Nenhuma mensagem para enviar ao assistente.');
  }

  logger.log(`[ClaudeService] Enviando ${messages.length} mensagens para ${ENDPOINTS.CHAT}...`);

  try {
    const response = await apiClient.post(ENDPOINTS.CHAT, {
      messages,
      questionnaireData,
      adjustments,
    });

    const reply = response.data?.reply;
    if (typeof reply !== 'string' || reply.trim().length === 0) {
      logger.warn('[ClaudeService] Backend respondeu sem campo "reply" válido.');
      return '(Nenhuma resposta de texto recebida)';
    }

    return reply.trim();
  } catch (error: any) {
    logger.error('[ClaudeService] Erro ao chamar o backend de chat:', error?.message || error);
    const apiMessage = error?.response?.data?.error;
    throw new Error(apiMessage || 'Falha na comunicação com o assistente.');
  }
};

/**
 * Verifica se o backend (que hospeda o proxy do Claude) está acessível.
 * @returns true se o health check respondeu com sucesso.
 */
export const testClaudeApiConnection = async (): Promise<boolean> => {
  logger.log('[ClaudeService] Testando conexão com o backend...');
  try {
    await apiClient.get(ENDPOINTS.HEALTH);
    logger.log('[ClaudeService] Backend acessível.');
    return true;
  } catch (error: any) {
    logger.error('[ClaudeService] Falha ao alcançar o backend:', error?.message || error);
    return false;
  }
};
