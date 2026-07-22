// Probe de validade de sessão contra o PostgREST.
//
// Política (a mesma do AuthContext): só o PostgREST dizendo explicitamente
// "não autorizado" derruba a sessão. Falha de transporte, config ausente,
// erro do servidor e 401/403 sem corpo PostgREST (middlebox: proxy
// corporativo, portal cativo, WAF respondendo HTML) são inconclusivos —
// deslogar nesses casos seria punir o usuário por falta de rede.
//
// Clock skew: PGRST303 cobre falhas de validação de claims do JWT — inclui o
// skew "issued at future" logo após TOKEN_REFRESHED (que o AuthContext já
// resolve com retry, PR #15) e, em PostgREST ≥12, também expiração real.
// Tratamos como inconclusivo de propósito: a direção é segura (não desloga),
// e a expiração real já desloga pelo fluxo de save (TOKEN_EXPIRED no
// questionnaireService), não por este probe.

import { isClockSkewError } from './authErrors';

export type SessionProbeResult = 'valid' | 'invalid' | 'indeterminate';

type ProbeOptions = {
  baseUrl?: string;
  anonKey?: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10000;

export async function probeSessionValidity({
  baseUrl,
  anonKey,
  authToken,
  fetchImpl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ProbeOptions): Promise<SessionProbeResult> {
  if (!baseUrl || !anonKey || !authToken) {
    return 'indeterminate';
  }
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) {
    return 'indeterminate';
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await doFetch(`${baseUrl}/profiles?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${authToken}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (response.ok) {
      return 'valid';
    }
    if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => null);
      const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : null;
      // Sem corpo JSON com code PGRST* não é o PostgREST falando — é
      // middlebox no caminho. Inconclusivo, nunca logout.
      if (typeof code !== 'string' || !code.startsWith('PGRST')) {
        return 'indeterminate';
      }
      if (isClockSkewError(body)) {
        return 'indeterminate';
      }
      return 'invalid';
    }
    return 'indeterminate';
  } catch {
    return 'indeterminate';
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
