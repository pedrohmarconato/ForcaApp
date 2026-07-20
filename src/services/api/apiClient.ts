// src/services/api/apiClient.ts
import axios, { AxiosError, AxiosInstance } from 'axios';
import { supabase } from '../../config/supabaseClient';
import { logger } from '../../utils/logger';

// URL base da API a partir das variáveis de ambiente (ex: .env).
// Em desenvolvimento local, aponta para o servidor Flask na porta 5001.
const apiBaseUrlFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const effectiveApiBaseUrl = apiBaseUrlFromEnv || 'http://localhost:5001/api';

const apiClient = axios.create({
  baseURL: effectiveApiBaseUrl,
  timeout: 30000, // padrão; chamadas longas (geração de plano) sobrescrevem por requisição
});

logger.log(`[ApiClient] Configurado para usar a URL base: ${effectiveApiBaseUrl}`);

// Endpoints alinhados com as rotas do backend Flask (backend/app.py)
export const ENDPOINTS = {
  TRAINING: {
    GENERATE_PLAN: '/generate-plan', // POST /api/generate-plan
  },
  CHAT: '/chat', // POST /api/chat — proxy seguro para o Claude
  HEALTH: '/health', // GET /api/health (o Flask expõe /health e /api/health)
  READY: '/ready', // GET /api/ready — readiness (config + deps locais)
};

type RetryableRequestConfig = AxiosError['config'] & { _retry?: boolean };

/**
 * Classifica um AxiosError em uma categoria estável para decisão de logging
 * e recuperação. Cobre:
 * - network: falha de transporte SEM response (backend offline/inacessível)
 * - timeout: ECONNABORTED ou código equivalente
 * - unauthorized: HTTP 401 (único caminho que dispara refresh)
 * - http_error: outros 4xx/5xx com response
 * - unexpected: qualquer erro não-Axios
 *
 * Não captura tokens, payloads ou dados pessoais — apenas códigos/status.
 */
export type ClassifiedApiError =
  | { kind: 'network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'unauthorized'; status: 401 }
  | { kind: 'http_error'; status: number }
  | { kind: 'canceled' }
  | { kind: 'unexpected'; message: string };

export const classifyApiError = (error: unknown): ClassifiedApiError => {
  // Só um AxiosError real pode ser transporte/HTTP. Um new Error local (bug
  // de programação) NÃO é falha de rede e não pode ser silenciado como tal.
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const status = error.response.status;
      if (status === 401) return { kind: 'unauthorized', status: 401 };
      return { kind: 'http_error', status };
    }
    const code = error.code;
    const message = error.message || '';
    if (code === 'ERR_CANCELED') {
      return { kind: 'canceled' };
    }
    // Sem response HTTP → transporte ou timeout. ETIMEDOUT e "timed out"
    // são timeouts do SO/adapter que não contêm a palavra "timeout".
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout|timed out/i.test(message)) {
      return { kind: 'timeout', message: 'timeout' };
    }
    return { kind: 'network', message: message || 'network error' };
  }
  if (error instanceof Error) {
    return { kind: 'unexpected', message: error.message };
  }
  return { kind: 'unexpected', message: String(error) };
};

/**
 * Tratamento central de erros de resposta.
 * Em 401: tenta UM refreshSession() e repete a requisição original com o novo
 * token (a IA ainda não foi chamada, então repetir não duplica cobrança).
 * Se o refresh falhar ou o 401 persistir, limpa a sessão (signOut) para
 * forçar novo login em vez de ficar em loop de 401.
 *
 * Erros de rede/timeout/outros HTTP NÃO disparam refresh nem signOut: a UI
 * já trata a falha (fallback de indisponibilidade) e o usuário mantém sessão.
 */
export const handleResponseError = async (
  instance: AxiosInstance,
  error: AxiosError,
): Promise<unknown> => {
  const originalRequest = error.config as RetryableRequestConfig;

  if (error.response?.status !== 401 || !originalRequest) {
    return Promise.reject(error);
  }

  if (originalRequest._retry) {
    logger.warn('[ApiClient] 401 persistente após retry. Encerrando sessão.');
    await supabase.auth.signOut();
    return Promise.reject(error);
  }

  logger.warn('[ApiClient] 401 recebido. Tentando um único refresh de sessão...');
  originalRequest._retry = true;

  // O try/catch cobre APENAS o refresh. A repetição da requisição fica FORA:
  // uma queda de rede/timeout/5xx no retry não é falha de refresh e não pode
  // derrubar a sessão; um novo 401 no retry é tratado pelo interceptor da
  // própria instância (branch _retry acima), que já faz o único signOut.
  let newToken: string | undefined;
  try {
    const { data } = await supabase.auth.refreshSession();
    newToken = data.session?.access_token;
  } catch (refreshError) {
    logger.warn('[ApiClient] Falha no refresh de sessão. Encerrando sessão.');
    await supabase.auth.signOut();
    return Promise.reject(refreshError);
  }

  if (!newToken) {
    logger.warn('[ApiClient] Refresh não retornou token. Encerrando sessão.');
    await supabase.auth.signOut();
    return Promise.reject(error);
  }

  if (originalRequest.headers) {
    originalRequest.headers.Authorization = `Bearer ${newToken}`;
  }
  return instance(originalRequest);
};

/**
 * Indica se uma falha é esperada para probes/operacoes de disponibilidade.
 * Nesses caminhos, a UI trata o resultado (ex.: fallback de IA indisponível)
 * e não queremos abrir o LogBox vermelho duplicando o que o interceptor já
 * registrou. Logs continuam em logger.warn (não usamos console.error).
 */
const isExpectedProbeFailure = (url: string | undefined): boolean => {
  if (!url) return false;
  return url === ENDPOINTS.HEALTH || url === ENDPOINTS.READY;
};

// Interceptor de Requisição: anexa o access_token da sessão Supabase
// (gerenciada com auto-refresh pelo cliente oficial) em todas as chamadas.
apiClient.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    logger.warn('[ApiClient] Não foi possível obter a sessão para a requisição.');
  }
  return config;
}, (error) => {
  logger.error('[ApiClient] Erro ao preparar requisição:', error);
  return Promise.reject(error);
});

// Interceptor de Resposta: log classificado + recuperação de 401.
// Este interceptor é o ÚNICO responsável por logar indisponibilidade —
// serviços e telas tratam o erro na UI sem somar warns/errors próprios.
// Falhas operacionais recuperáveis (rede, timeout, 4xx/5xx que a UI trata)
// são logger.warn; logger.error fica reservado a erro inesperado (bug local).
apiClient.interceptors.response.use((response) => response, (error: AxiosError) => {
  const rawUrl = (error.config as { url?: string } | undefined)?.url;
  // Nunca logar a query string: uma URL como /reset?token=... vazaria o token.
  const url = rawUrl?.split('?')[0];
  const classified = classifyApiError(error);

  if (classified.kind !== 'unauthorized' && classified.kind !== 'canceled') {
    if (isExpectedProbeFailure(url)) {
      // Probe esperado: indisponibilidade já tratada pela UI. Log único em warn.
      if (classified.kind === 'network' || classified.kind === 'timeout') {
        logger.warn('[ApiClient] Probe de disponibilidade falhou (backend offline ou inacessível).');
      } else if (classified.kind === 'http_error' && classified.status === 503) {
        logger.warn('[ApiClient] Probe de disponibilidade retornou 503 (não pronto).');
      } else if (classified.kind === 'http_error') {
        logger.warn(`[ApiClient] Probe de disponibilidade retornou HTTP ${classified.status}.`);
      } else {
        logger.warn('[ApiClient] Probe de disponibilidade falhou (erro inesperado).');
      }
    } else if (classified.kind === 'network') {
      logger.warn('[ApiClient] Falha de rede: o backend pode estar offline ou inacessível.');
    } else if (classified.kind === 'timeout') {
      logger.warn('[ApiClient] Tempo limite da requisição excedido.');
    } else if (classified.kind === 'http_error') {
      logger.warn(`[ApiClient] Erro HTTP ${classified.status} em ${url ?? 'URL desconhecida'}.`);
    } else {
      logger.error('[ApiClient] Erro inesperado:', classified.message);
    }
  }
  return handleResponseError(apiClient, error);
});

// Exporta tanto default quanto nomeado (consumidores legados usam { apiClient })
export { apiClient };
export default apiClient;
