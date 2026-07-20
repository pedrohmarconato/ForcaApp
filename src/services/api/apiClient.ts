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
  | { kind: 'unexpected'; message: string };

export const classifyApiError = (error: unknown): ClassifiedApiError => {
  if (!(error && typeof error === 'object')) {
    return { kind: 'unexpected', message: String(error) };
  }
  const axiosError = error as AxiosError;
  const code = (axiosError as { code?: string }).code;
  const message = axiosError.message || '';

  if (axiosError.response) {
    const status = axiosError.response.status;
    if (status === 401) return { kind: 'unauthorized', status: 401 };
    return { kind: 'http_error', status };
  }
  // Sem response HTTP → erro de transporte ou timeout.
  if (code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return { kind: 'timeout', message: 'timeout' };
  }
  return { kind: 'network', message: message || 'network error' };
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

  try {
    const { data } = await supabase.auth.refreshSession();
    const newToken = data.session?.access_token;

    if (!newToken) {
      logger.warn('[ApiClient] Refresh não retornou token. Encerrando sessão.');
      await supabase.auth.signOut();
      return Promise.reject(error);
    }

    if (originalRequest.headers) {
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
    }
    return await instance(originalRequest);
  } catch (refreshError) {
    logger.warn('[ApiClient] Falha no refresh de sessão. Encerrando sessão.');
    await supabase.auth.signOut();
    return Promise.reject(refreshError);
  }
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
// Erros de rede/timeout são logger.warn (não abrem LogBox vermelho); apenas
// HTTP 5xx inesperados (com response) seguem como error, pois indicam falha
// real do servidor. Falhas de probe esperadas (health/ready) nunca são error.
apiClient.interceptors.response.use((response) => response, (error: AxiosError) => {
  const url = (error.config as { url?: string } | undefined)?.url;
  const classified = classifyApiError(error);

  if (classified.kind !== 'unauthorized') {
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
      logger.error(`[ApiClient] Erro HTTP ${classified.status} em ${url ?? 'URL desconhecida'}.`);
    } else {
      logger.error('[ApiClient] Erro inesperado:', classified.message);
    }
  }
  return handleResponseError(apiClient, error);
});

// Exporta tanto default quanto nomeado (consumidores legados usam { apiClient })
export { apiClient };
export default apiClient;
