// Probe de validade de sessão contra o PostgREST.
//
// Política (a mesma do AuthContext): só um NÃO-AUTORIZADO explícito do servidor
// derruba a sessão. Falha de transporte, config ausente e erro do servidor são
// inconclusivos — deslogar aí seria punir o usuário por falta de rede.
// O 401 de clock skew (PGRST303, "JWT issued at future") também é inconclusivo:
// o AuthContext já lida com skew via retry (PR #15) e um logout aqui
// reintroduziria o logout fantasma por outra porta.

export type SessionProbeResult = 'valid' | 'invalid' | 'indeterminate';

type ProbeOptions = {
  baseUrl?: string;
  anonKey?: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
};

export async function probeSessionValidity({
  baseUrl,
  anonKey,
  authToken,
  fetchImpl,
}: ProbeOptions): Promise<SessionProbeResult> {
  if (!baseUrl || !anonKey || !authToken) {
    return 'indeterminate';
  }
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!doFetch) {
    return 'indeterminate';
  }

  try {
    const response = await doFetch(`${baseUrl}/profiles?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${authToken}` },
    });
    if (response.ok) {
      return 'valid';
    }
    if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => null);
      const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : null;
      if (code === 'PGRST303') {
        return 'indeterminate';
      }
      return 'invalid';
    }
    return 'indeterminate';
  } catch {
    return 'indeterminate';
  }
}
