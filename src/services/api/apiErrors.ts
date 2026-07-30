// src/services/api/apiErrors.ts
// Classificação de erros de API isolada do apiClient: telas podem importá-la
// sem arrastar o cliente Supabase (que exige env) para dentro de testes.
import axios from 'axios';

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
