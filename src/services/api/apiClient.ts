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

type RetryableRequestConfig = AxiosError['config'] & { _retry?: boolean };

/**
 * Tratamento central de erros de resposta.
 * Em 401: tenta UM refreshSession() e repete a requisição original com o novo
 * token (a IA ainda não foi chamada, então repetir não duplica cobrança).
 * Se o refresh falhar ou o 401 persistir, limpa a sessão (signOut) para
 * forçar novo login em vez de ficar em loop de 401.
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

// Interceptor de Resposta: log centralizado + recuperação de 401.
apiClient.interceptors.response.use((response) => response, (error: AxiosError) => {
  if (error.response?.status !== 401) {
    logger.error('[ApiClient] Erro na resposta:', error.response?.status, error.config?.url);
    if (error.message === 'Network Error' && !error.response) {
      logger.error('[ApiClient] Erro de rede detectado. O servidor backend pode estar offline ou inacessível.');
    }
  }
  return handleResponseError(apiClient, error);
});

// Endpoints alinhados com as rotas do backend Flask (backend/app.py)
export const ENDPOINTS = {
  TRAINING: {
    GENERATE_PLAN: '/generate-plan', // POST /api/generate-plan
  },
  CHAT: '/chat', // POST /api/chat — proxy seguro para o Claude
  HEALTH: '/health', // GET /api/health (o Flask expõe /health e /api/health)
};

// Exporta tanto default quanto nomeado (consumidores legados usam { apiClient })
export { apiClient };
export default apiClient;
