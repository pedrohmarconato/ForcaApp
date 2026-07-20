// __tests__/apiClient.test.ts
// Reproduz o achado do review: em 401, o interceptor deve tentar UM
// refreshSession() e repetir a chamada; se falhar, limpar a sessão (signOut).
// Acrescenta classificação: network/timeout não disparam refresh/signOut.

import { AxiosError } from 'axios';
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
    // Simula o fluxo real: o "instance" reinjeta o 2º 401 no próprio
    // handleResponseError, como faz o interceptor de resposta do axios.
    // O signOut deve acontecer exatamente UMA vez (no branch _retry) — o
    // chamador externo apenas propaga a rejeição.
    mockedRefresh.mockResolvedValueOnce({ data: { session: { access_token: 'token-novo' } } });
    const instance: any = jest.fn(async (config: any) => {
      const err = { ...make401(), config: { ...config, _retry: config._retry } };
      return handleResponseError(instance, err as any);
    });

    await expect(handleResponseError(instance as any, make401() as any)).rejects.toBeTruthy();
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });

  it('falha de REDE no retry pós-refresh NÃO encerra a sessão', async () => {
    // Achado do review: o try/catch antigo englobava o retry; uma queda de
    // rede depois de um refresh bem-sucedido era tratada como falha de
    // refresh e derrubava a sessão do usuário.
    mockedRefresh.mockResolvedValueOnce({ data: { session: { access_token: 'token-novo' } } });
    const instance = jest.fn(async () => {
      throw { message: 'Network Error', code: 'ERR_NETWORK', config: { headers: {} } };
    });

    await expect(handleResponseError(instance as any, make401() as any)).rejects.toBeTruthy();
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).not.toHaveBeenCalled();
  });
});

describe('classifyApiError — categorização estável (erros REAIS do axios)', () => {
  // Constrói AxiosError como o adapter do React Native produz (isAxiosError=true).
  const axiosErr = (message: string, code?: string, status?: number) => {
    const response = status
      ? ({ data: {}, status, statusText: String(status), headers: {}, config: {} } as never)
      : undefined;
    return new AxiosError(message, code, {} as never, null, response);
  };

  it('Network Error (ERR_NETWORK, formato RN) sem response → network', () => {
    expect(classifyApiError(axiosErr('Network Error', 'ERR_NETWORK')).kind).toBe('network');
  });

  it('ENETUNREACH e EHOSTUNREACH permanecem network', () => {
    expect(classifyApiError(axiosErr('connect ENETUNREACH 10.0.0.1:5001', 'ENETUNREACH')).kind).toBe('network');
    expect(classifyApiError(axiosErr('connect EHOSTUNREACH 10.0.0.1:5001', 'EHOSTUNREACH')).kind).toBe('network');
  });

  it('timeout (ECONNABORTED, formato RN) → timeout', () => {
    expect(classifyApiError(axiosErr('timeout of 30000ms exceeded', 'ECONNABORTED')).kind).toBe('timeout');
  });

  it('ETIMEDOUT ("connect ETIMEDOUT ...") → timeout', () => {
    // Achado do review: caía em network porque a mensagem não contém "timeout".
    expect(classifyApiError(axiosErr('connect ETIMEDOUT 192.168.15.77:5001', 'ETIMEDOUT')).kind).toBe('timeout');
  });

  it('mensagem "timed out" sem código → timeout', () => {
    expect(classifyApiError(axiosErr('The request timed out')).kind).toBe('timeout');
  });

  it('ERR_CANCELED (requisição abortada de propósito) → canceled', () => {
    expect(classifyApiError(axiosErr('canceled', 'ERR_CANCELED')).kind).toBe('canceled');
  });

  it('HTTP 401 → unauthorized', () => {
    expect(classifyApiError(axiosErr('Request failed with status code 401', 'ERR_BAD_REQUEST', 401)).kind).toBe('unauthorized');
  });

  it('HTTP 503 → http_error', () => {
    const c = classifyApiError(axiosErr('Request failed with status code 503', 'ERR_BAD_RESPONSE', 503));
    expect(c.kind).toBe('http_error');
    if (c.kind === 'http_error') expect(c.status).toBe(503);
  });

  it('new Error("bug local") NÃO é falha de rede → unexpected', () => {
    // Achado do review: um bug local (TypeError etc.) era classificado como
    // network e silenciado como "backend offline".
    expect(classifyApiError(new Error('bug local')).kind).toBe('unexpected');
  });

  it('valores não-Error → unexpected', () => {
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
