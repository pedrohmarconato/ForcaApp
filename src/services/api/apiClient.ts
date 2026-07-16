// src/services/api/apiClient.ts
import axios from 'axios';
import { supabase } from '../../config/supabaseClient';
import { logger } from '../../utils/logger';

// URL base da API a partir das variáveis de ambiente (ex: .env).
// Em desenvolvimento local, aponta para o servidor Flask na porta 5001.
const apiBaseUrlFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const effectiveApiBaseUrl = apiBaseUrlFromEnv || 'http://localhost:5001/api';

const apiClient = axios.create({
  baseURL: effectiveApiBaseUrl,
  timeout: 30000, // 30s — chamadas ao Claude via backend podem demorar
});

logger.log(`[ApiClient] Configurado para usar a URL base: ${effectiveApiBaseUrl}`);

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

// Interceptor de Resposta: log centralizado de erros (somente em dev).
apiClient.interceptors.response.use((response) => response, (error) => {
  logger.error('[ApiClient] Erro na resposta:', error.response?.status, error.config?.url);
  if (error.message === 'Network Error' && !error.response) {
    logger.error('[ApiClient] Erro de rede detectado. O servidor backend pode estar offline ou inacessível.');
  }
  return Promise.reject(error);
});

// Endpoints alinhados com as rotas do backend Flask (backend/app.py)
export const ENDPOINTS = {
  TRAINING: {
    GENERATE_PLAN: '/generate-plan', // POST /api/generate-plan
  },
  CHAT: '/chat', // POST /api/chat — proxy seguro para o Claude
  HEALTH: '/health',
};

// Exporta tanto default quanto nomeado (consumidores legados usam { apiClient })
export { apiClient };
export default apiClient;
