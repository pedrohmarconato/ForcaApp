// __tests__/sessionProbe.test.ts
// Política do probe de sessão do questionário: só um NÃO-AUTORIZADO explícito
// do servidor pode derrubar a sessão. Falha de transporte, config ausente,
// erro 5xx e clock skew (PGRST303) são inconclusivos — deslogar aí é punir o
// usuário por falta de rede (mesma política do AuthContext / PR #15).

import { probeSessionValidity } from '../src/services/auth/sessionProbe';

const OPTS_BASE = {
  baseUrl: 'https://exemplo.supabase.co/rest/v1',
  anonKey: 'anon-key',
  authToken: 'jwt-token',
};

const jsonResponse = (status: number, body: unknown = null) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('probeSessionValidity', () => {
  it('resposta ok → sessão válida', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, []));
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('valid');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://exemplo.supabase.co/rest/v1/profiles?select=id&limit=1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
      }),
    );
  });

  it('401 sem código de skew → sessão inválida (desloga)', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(401, { code: 'PGRST301', message: 'JWT expired' }));
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('invalid');
  });

  it('403 → sessão inválida (desloga)', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(403));
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('invalid');
  });

  it('401 com PGRST303 (clock skew) → inconclusivo, NUNCA desloga', async () => {
    // Regressão do PR #15: o skew GoTrue×PostgREST chega como 401 "JWT issued
    // at future"; tratá-lo como sessão inválida reintroduziria o logout fantasma.
    const fetchImpl = jest.fn(async () => jsonResponse(401, { code: 'PGRST303', message: 'JWT issued at future' }));
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('indeterminate');
  });

  it('401 com corpo não-JSON → inválida (o parse falho não mascara o 401)', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError('not json');
      },
    }) as unknown as Response);
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('invalid');
  });

  it('5xx do servidor → inconclusivo, não desloga', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(503));
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('indeterminate');
  });

  it('falha de transporte (fetch rejeita) → inconclusivo, não desloga', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(probeSessionValidity({ ...OPTS_BASE, fetchImpl })).resolves.toBe('indeterminate');
  });

  it('config incompleta (sem baseUrl/anonKey/token) → inconclusivo, sem fetch', async () => {
    const fetchImpl = jest.fn();
    await expect(probeSessionValidity({ anonKey: 'x', authToken: 'y', fetchImpl })).resolves.toBe('indeterminate');
    await expect(probeSessionValidity({ ...OPTS_BASE, anonKey: undefined, fetchImpl })).resolves.toBe('indeterminate');
    await expect(probeSessionValidity({ ...OPTS_BASE, authToken: undefined, fetchImpl })).resolves.toBe('indeterminate');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
