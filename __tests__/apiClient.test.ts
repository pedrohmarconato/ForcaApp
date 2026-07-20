// __tests__/apiClient.test.ts
// Reproduz o achado do review: em 401, o interceptor deve tentar UM
// refreshSession() e repetir a chamada; se falhar, limpar a sessão (signOut).
// Acrescenta classificação: network/timeout não disparam refresh/signOut.

import { classifyApiError, handleResponseError } from '../src/services/api/apiClient';
import { supabase } from '../src/config/supabaseClient';

jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'token-antigo' } } })),
      refreshSession: jest.fn(),
      signOut: jest.fn(async () => ({})),
    },
  },
}));

const mockedRefresh = supabase.auth.refreshSession as jest.Mock;
const mockedSignOut = supabase.auth.signOut as jest.Mock;

const make401 = () => ({
  response: { status: 401 },
  config: { url: '/chat', headers: {} as Record<string, string> },
  message: 'Request failed with status code 401',
});

describe('apiClient — recuperação de 401', () => {
  beforeEach(() => jest.clearAllMocks());

  it('em 401, faz UM refresh e repete a requisição com o novo token', async () => {
    mockedRefresh.mockResolvedValueOnce({ data: { session: { access_token: 'token-novo' } } });
    const instance = jest.fn(async (config: any) => ({ data: { ok: true }, config }));

    const error = make401();
    const result = await handleResponseError(instance as any, error as any);

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(instance).toHaveBeenCalledTimes(1);
    expect((instance.mock.calls[0][0] as any).headers.Authorization).toBe('Bearer token-novo');
    expect(result).toEqual({ data: { ok: true }, config: expect.anything() });
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('se o refresh falhar, limpa a sessão (signOut) e rejeita', async () => {
    mockedRefresh.mockResolvedValueOnce({ data: { session: null } });
    const instance = jest.fn();

    await expect(handleResponseError(instance as any, make401() as any)).rejects.toBeTruthy();
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    expect(instance).not.toHaveBeenCalled();
  });

  it('não entra em loop: requisição já retentada (_retry) vai direto para signOut', async () => {
    const error = { ...make401(), config: { url: '/chat', headers: {}, _retry: true } };
    const instance = jest.fn();

    await expect(handleResponseError(instance as any, error as any)).rejects.toBeTruthy();
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });

  it('erros que não são 401 apenas rejeitam (sem refresh/signOut)', async () => {
    const error = { response: { status: 500 }, config: { headers: {} } };
    const instance = jest.fn();

    await expect(handleResponseError(instance as any, error as any)).rejects.toBeTruthy();
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('segundo 401 após refresh bem-sucedido encerra sessão sem loop', async () => {
    // Simula fluxo real: 1º 401 → refresh → retry → 2º 401 → signOut
    mockedRefresh.mockResolvedValueOnce({ data: { session: { access_token: 'token-novo' } } });
    const instance = jest.fn(async (config: any) => {
      // primeira repetição retorna 401 novamente (empacotado como Promise.reject no axios real)
      const err = { ...make401(), config: { ...config, _retry: true } };
      throw err;
    });

    await expect(handleResponseError(instance as any, make401() as any)).rejects.toBeTruthy();
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('classifyApiError — categorização estável', () => {
  it('Network Error sem response → network', () => {
    const err = { message: 'Network Error', code: 'ERR_NETWORK', config: { url: '/ready' } };
    expect(classifyApiError(err).kind).toBe('network');
  });

  it('timeout (ECONNABORTED) sem response → timeout', () => {
    const err = { message: 'timeout of 30000ms exceeded', code: 'ECONNABORTED', config: {} };
    expect(classifyApiError(err).kind).toBe('timeout');
  });

  it('HTTP 401 → unauthorized', () => {
    const err = { response: { status: 401 }, config: {} };
    expect(classifyApiError(err).kind).toBe('unauthorized');
  });

  it('HTTP 503 → http_error', () => {
    const err = { response: { status: 503 }, config: {} };
    const c = classifyApiError(err);
    expect(c.kind).toBe('http_error');
    if (c.kind === 'http_error') expect(c.status).toBe(503);
  });

  it('objeto não-Axios → unexpected', () => {
    expect(classifyApiError('qualquer coisa').kind).toBe('unexpected');
    expect(classifyApiError(null).kind).toBe('unexpected');
  });
});

describe('apiClient — erros de rede/timeout NÃO disparam refresh nem signOut', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Network Error sem response não aciona refreshSession/signOut', async () => {
    const err = {
      message: 'Network Error',
      code: 'ERR_NETWORK',
      config: { url: '/ready', headers: {} },
    };
    const instance = jest.fn();
    await expect(handleResponseError(instance as any, err as any)).rejects.toBeTruthy();
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedSignOut).not.toHaveBeenCalled();
    expect(instance).not.toHaveBeenCalled();
  });

  it('timeout (ECONNABORTED) sem response não aciona refreshSession/signOut', async () => {
    const err = {
      message: 'timeout of 30000ms exceeded',
      code: 'ECONNABORTED',
      config: { url: '/chat', headers: {} },
    };
    const instance = jest.fn();
    await expect(handleResponseError(instance as any, err as any)).rejects.toBeTruthy();
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('HTTP 503 (readiness não-pronto) não aciona refreshSession/signOut', async () => {
    const err = { response: { status: 503 }, config: { url: '/ready', headers: {} } };
    const instance = jest.fn();
    await expect(handleResponseError(instance as any, err as any)).rejects.toBeTruthy();
    expect(mockedRefresh).not.toHaveBeenCalled();
    expect(mockedSignOut).not.toHaveBeenCalled();
  });
});
