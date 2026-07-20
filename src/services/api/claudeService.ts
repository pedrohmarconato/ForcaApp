// src/services/api/claudeService.ts
// Cliente do chat com IA. A chamada ao Claude acontece EXCLUSIVAMENTE no
// backend (POST /api/chat), onde a chave da Anthropic fica protegida.
// Nenhuma chave de API de IA é embutida no aplicativo.

import apiClient, { classifyApiError, ENDPOINTS } from './apiClient';
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
      // Resposta malformada NUNCA vira fala da IA no chat
      throw new Error('Resposta inválida do servidor.');
    }

    return reply.trim();
  } catch (error: any) {
    // Transporte/HTTP recuperável já foi logado UMA vez pelo interceptor do
    // apiClient. Aqui só registramos erro INESPERADO (bug local ou resposta
    // malformada do backend) — falha operacional não abre LogBox vermelho.
    if (classifyApiError(error).kind === 'unexpected') {
      logger.error('[ClaudeService] Erro inesperado no chat:', error?.message || error);
    }
    const apiMessage = error?.response?.data?.error;
    throw new Error(apiMessage || 'Falha na comunicação com o assistente.');
  }
};

/**
 * Verifica se o backend está PRONTO para servir o chat/IA.
 * Usa o endpoint de readiness (/api/ready), que confirma configuração LOCAL
 * mínima (chave Anthropic presente + URL/chave do Supabase utilizáveis) —
 * não apenas liveness do processo Flask.
 *
 * Um 200 aqui significa "configuração local carregada". Ele NÃO valida a
 * credencial junto à Anthropic (o probe não faz chamada externa nem gera
 * custo); uma chave presente porém inválida só aparece na primeira chamada
 * real de chat, que a UI já trata com fallback.
 *
 * A falha aqui é um resultado ESPERADO e tratado pela UI (fallback amigável).
 * O ÚNICO log de indisponibilidade é o warn do interceptor do apiClient —
 * este serviço não soma warn/error próprio (política de log único).
 *
 * @returns true se o backend respondeu pronto; false caso contrário.
 */
export const testClaudeApiConnection = async (): Promise<boolean> => {
  logger.log('[ClaudeService] Testando prontidão do backend...');
  try {
    await apiClient.get(ENDPOINTS.READY);
    logger.log('[ClaudeService] Backend pronto.');
    return true;
  } catch (error: any) {
    // Detalhe em nível log (não warn): o interceptor já emitiu o único warn.
    const status = error?.response?.status;
    if (status === 503) {
      logger.log('[ClaudeService] Backend vivo, mas não configurado (readiness 503).');
    } else if (status) {
      logger.log(`[ClaudeService] Backend respondeu HTTP ${status}.`);
    } else {
      logger.log('[ClaudeService] Backend inacessível (rede/timeout).');
    }
    return false;
  }
};
