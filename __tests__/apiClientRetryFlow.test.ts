// __tests__/apiClientRetryFlow.test.ts
// Fluxo REAL do axios (instância + interceptores registrados), com adapter
// substituído por uma fila de comportamentos. Reproduz os achados do review:
//  1. 401 → refresh OK → retry cai em rede/timeout/5xx: NÃO pode haver signOut
//     (o try/catch antigo englobava o retry e tratava qualquer falha como
//     falha de refresh).
//  2. 401 → refresh OK → retry 401: exatamente UM refresh e UM signOut
//     (o catch externo antigo duplicava o signOut do branch _retry).
//  3. Falha de readiness gera no máximo UM warning no console (interceptor),
//     e nunca console.error.
//  4. URL com query string nunca aparece nos logs (?token=... vazaria).

import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

let mockCurrentToken = 'token-antigo';

jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: mockCurrentToken } } })),
      refreshSession: jest.fn(async () => {
        mockCurrentToken = 'token-novo';
        return { data: { session: { access_token: mockCurrentToken } } };
      }),
      signOut: jest.fn(async () => ({})),
    },
  },
}));

import apiClient from '../src/services/api/apiClient';
import { callClaudeApi, testClaudeApiConnection } from '../src/services/api/claudeService';
import { supabase } from '../src/config/supabaseClient';

const mockedRefresh = supabase.auth.refreshSession as jest.Mock;
const mockedSignOut = supabase.auth.signOut as jest.Mock;

type Behavior =
  | { kind: 'ok'; data?: unknown }
  | { kind: 'http'; status: number; data?: unknown }
  | { kind: 'code'; code: string; message: string };

const queue: Behavior[] = [];
const adapterCalls: AxiosRequestConfig[] = [];

const buildResponse = (config: AxiosRequestConfig, status: number, data: unknown): AxiosResponse =>
  ({ data, status, statusText: String(status), headers: {}, config } as AxiosResponse);

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiClient.defaults.adapter = async (config: any) => {
    adapterCalls.push(config as AxiosRequestConfig);
    const behavior = queue.shift();
    if (!behavior) throw new Error('fila de respostas do adapter vazia');
    if (behavior.kind === 'ok') return buildResponse(config, 200, behavior.data ?? {});
    if (behavior.kind === 'http') {
      const response = buildResponse(config, behavior.status, behavior.data ?? {});
      throw new AxiosError(
        `Request failed with status code ${behavior.status}`,
        AxiosError.ERR_BAD_REQUEST,
        config as never,
        null,
        response,
      );
    }
    throw new AxiosError(behavior.message, behavior.code, config as never, null);
  };
});

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  queue.length = 0;
  adapterCalls.length = 0;
  mockCurrentToken = 'token-antigo';
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('fluxo real: 401 → refresh → retry que falha NÃO encerra a sessão', () => {
  it.each([
    ['rede (ERR_NETWORK)', { kind: 'code', code: 'ERR_NETWORK', message: 'Network Error' } as Behavior],
    ['timeout (ECONNABORTED)', { kind: 'code', code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' } as Behavior],
    ['HTTP 503', { kind: 'http', status: 503 } as Behavior],
    ['HTTP 500', { kind: 'http', status: 500 } as Behavior],
  ])('retry cai em %s → sem signOut', async (_label, retryBehavior) => {
    queue.push({ kind: 'http', status: 401 }, retryBehavior);

    await expect(apiClient.post('/chat', {})).rejects.toBeTruthy();

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).not.toHaveBeenCalled();
  });

  it('retry devolve 401 de novo → exatamente UM refresh e UM signOut', async () => {
    queue.push({ kind: 'http', status: 401 }, { kind: 'http', status: 401 });

    await expect(apiClient.post('/chat', {})).rejects.toBeTruthy();

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).toHaveBeenCalledTimes(1);
  });

  it('retry com sucesso usa o token novo e não encerra a sessão', async () => {
    queue.push({ kind: 'http', status: 401 }, { kind: 'ok', data: { ok: true } });

    const response = await apiClient.post('/chat', {});

    expect(response.data).toEqual({ ok: true });
    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedSignOut).not.toHaveBeenCalled();
    expect(adapterCalls[1]?.headers?.Authorization).toBe('Bearer token-novo');
  });
});

describe('integração apiClient + claudeService: log único, sem console.error', () => {
  it('readiness com backend offline → false, ZERO console.error e no máximo UM console.warn', async () => {
    queue.push({ kind: 'code', code: 'ERR_NETWORK', message: 'Network Error' });

    await expect(testClaudeApiConnection()).resolves.toBe(false);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('readiness 503 (não configurado) → false, ZERO console.error e no máximo UM console.warn', async () => {
    queue.push({ kind: 'http', status: 503, data: { status: 'not_ready' } });

    await expect(testClaudeApiConnection()).resolves.toBe(false);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('chat com 429 (recuperável, UI trata) → erro amigável, ZERO console.error, no máximo UM warn', async () => {
    queue.push({ kind: 'http', status: 429, data: { error: 'Muitas requisições. Tente novamente em instantes.' } });

    await expect(
      callClaudeApi([{ role: 'user', parts: [{ text: 'oi' }] }]),
    ).rejects.toThrow('Muitas requisições. Tente novamente em instantes.');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('resposta malformada do backend (sem reply) É erro inesperado → um console.error', async () => {
    queue.push({ kind: 'ok', data: { naoTemReply: true } });

    await expect(
      callClaudeApi([{ role: 'user', parts: [{ text: 'oi' }] }]),
    ).rejects.toThrow('Falha na comunicação com o assistente.');

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('logs nunca contêm query string (ex.: ?token=...)', () => {
  it('erro HTTP em URL com query não vaza a query em nenhum log', async () => {
    queue.push({ kind: 'http', status: 500 });

    await expect(apiClient.get('/reset?token=segredo-supersecreto')).rejects.toBeTruthy();

    const todasAsLinhas = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => String(arg))
      .join('\n');
    expect(todasAsLinhas).not.toContain('segredo-supersecreto');
    expect(todasAsLinhas).not.toContain('token=');
  });
});
