/**
 * @jest-environment jsdom
 */
// __tests__/pushHandlers.test.ts
// Guarda permanente (Fase 13 Plano 01, Task 2): public/push-handlers.js é um
// script solto sem bundler (mesmo padrão de register-sw.js) — este harness
// popula global.self/global.clients com mocks, faz require() do arquivo real
// (captura os callbacks registrados via addEventListener), e invoca cada
// callback manualmente com eventos fake para exercitar o bloco <behavior> do
// plano: showNotification sempre chamado (Pitfall 4 — nunca silent push),
// fallback de payload não-JSON, e notificationclick com/sem janela existente.

import { readFileSync } from 'fs';
import { join } from 'path';

const PUSH_HANDLERS_PATH = join(__dirname, '..', 'public', 'push-handlers.js');

/** Registra self/clients mockados e faz require() do script solto, capturando
 * os callbacks passados a self.addEventListener. */
function carregarPushHandlers() {
  const addEventListenerMock = jest.fn();
  (global as any).self = {
    addEventListener: addEventListenerMock,
    registration: { showNotification: jest.fn() },
  };
  (global as any).clients = {
    matchAll: jest.fn(),
    openWindow: jest.fn(),
  };

  jest.isolateModules(() => {
    require(PUSH_HANDLERS_PATH);
  });

  const pushCall = addEventListenerMock.mock.calls.find(([tipo]) => tipo === 'push');
  const notificationClickCall = addEventListenerMock.mock.calls.find(
    ([tipo]) => tipo === 'notificationclick',
  );

  return {
    pushCallback: pushCall?.[1] as (event: any) => void,
    notificationClickCallback: notificationClickCall?.[1] as (event: any) => void,
    self: (global as any).self,
    clients: (global as any).clients,
  };
}

describe('public/push-handlers.js — listener "push"', () => {
  it('Teste 1: chama showNotification exatamente uma vez com title/body/url do payload', () => {
    const { pushCallback, self } = carregarPushHandlers();

    const event: any = {
      data: { json: () => ({ title: 'Hora do treino!', body: 'Seu treino de hoje te espera.', url: '/home/active-session/abc' }) },
      waitUntil: jest.fn((p: Promise<unknown>) => p),
    };

    pushCallback(event);

    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    expect(self.registration.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = self.registration.showNotification.mock.calls[0];
    expect(title).toBe('Hora do treino!');
    expect(options.body).toBe('Seu treino de hoje te espera.');
    expect(options.data).toEqual({ url: '/home/active-session/abc' });
  });

  it('Teste 2: payload não-JSON cai no fallback {title: ForçaApp, body: event.data.text()} sem lançar', () => {
    const { pushCallback, self } = carregarPushHandlers();

    const event: any = {
      data: {
        json: () => {
          throw new Error('payload não é JSON');
        },
        text: () => 'texto puro do push',
      },
      waitUntil: jest.fn((p: Promise<unknown>) => p),
    };

    expect(() => pushCallback(event)).not.toThrow();
    expect(self.registration.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = self.registration.showNotification.mock.calls[0];
    expect(title).toBe('ForçaApp');
    expect(options.body).toBe('texto puro do push');
  });

  it('sem event.data nenhum, ainda chama showNotification com título default (nunca silencioso)', () => {
    const { pushCallback, self } = carregarPushHandlers();

    const event: any = {
      data: null,
      waitUntil: jest.fn((p: Promise<unknown>) => p),
    };

    pushCallback(event);

    expect(self.registration.showNotification).toHaveBeenCalledTimes(1);
    const [title] = self.registration.showNotification.mock.calls[0];
    expect(title).toBe('ForçaApp');
  });
});

describe('public/push-handlers.js — listener "notificationclick"', () => {
  it('Teste 3: com janela cliente existente (navigate), chama client.navigate(url), close() e waitUntil', async () => {
    const { notificationClickCallback, clients } = carregarPushHandlers();

    const client = { navigate: jest.fn(), focus: jest.fn() };
    (clients.matchAll as jest.Mock).mockResolvedValue([client]);

    const event: any = {
      notification: { close: jest.fn(), data: { url: '/home/active-session/xyz' } },
      waitUntil: jest.fn((p: Promise<unknown>) => p),
    };

    notificationClickCallback(event);

    expect(event.notification.close).toHaveBeenCalledTimes(1);
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    await event.waitUntil.mock.calls[0][0];

    expect(client.navigate).toHaveBeenCalledWith('/home/active-session/xyz');
  });

  it('Teste 4: sem nenhum windowClients, cai no fallback clients.openWindow(url)', async () => {
    const { notificationClickCallback, clients } = carregarPushHandlers();

    (clients.matchAll as jest.Mock).mockResolvedValue([]);

    const event: any = {
      notification: { close: jest.fn(), data: { url: '/home/active-session/xyz' } },
      waitUntil: jest.fn((p: Promise<unknown>) => p),
    };

    notificationClickCallback(event);
    await event.waitUntil.mock.calls[0][0];

    expect(clients.openWindow).toHaveBeenCalledWith('/home/active-session/xyz');
  });

  it('sem url no payload, usa "/" como fallback', async () => {
    const { notificationClickCallback, clients } = carregarPushHandlers();

    (clients.matchAll as jest.Mock).mockResolvedValue([]);

    const event: any = {
      notification: { close: jest.fn(), data: null },
      waitUntil: jest.fn((p: Promise<unknown>) => p),
    };

    notificationClickCallback(event);
    await event.waitUntil.mock.calls[0][0];

    expect(clients.openWindow).toHaveBeenCalledWith('/');
  });
});

describe('guarda: public/push-handlers.js nunca faz rede própria nem deixa push sem showNotification', () => {
  const source = readFileSync(PUSH_HANDLERS_PATH, 'utf8');

  it('showNotification aparece exatamente uma vez (fora de comentários)', () => {
    const semComentarios = source
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('//'))
      .join('\n');
    const ocorrencias = semComentarios.match(/showNotification/g) ?? [];
    expect(ocorrencias.length).toBe(1);
  });

  it('nunca chama fetch( dentro do arquivo (sem chamada de rede própria)', () => {
    expect(source).not.toMatch(/fetch\(/);
  });
});
