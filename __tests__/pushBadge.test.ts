/**
 * @jest-environment jsdom
 */
// __tests__/pushBadge.test.ts
// Guarda permanente (Fase 13 Plano 03, Task 1): src/utils/pushBadge.ts
// atualiza o badge do ícone do app (Badging API, navigator.setAppBadge/
// clearAppBadge), mas SOMENTE quando a API existe E a permissão de
// notificação já foi concedida (PUSH-04) — nunca antes, nunca sozinho via
// push silencioso (13-RESEARCH.md, Pitfall 4).
//
// jsdom não expõe `navigator.setAppBadge`/`Notification` por padrão —
// Object.defineProperty é usado para injetar mocks por teste, mesma técnica
// de __tests__/pushHandlers.test.ts (global.self não gravável por atribuição
// simples).

import { updateTrainingBadge } from '../src/utils/pushBadge';

/** Define/limpa `navigator.setAppBadge`/`clearAppBadge` e `Notification`
 * globais para cada cenário do teste, sem vazar estado entre casos. */
function configurarNavigator(opts: {
  comSuporte: boolean;
  permissao?: 'granted' | 'denied' | 'default';
  setAppBadgeImpl?: jest.Mock;
  clearAppBadgeImpl?: jest.Mock;
  comClearAppBadge?: boolean;
}) {
  const {
    comSuporte,
    permissao,
    setAppBadgeImpl,
    clearAppBadgeImpl,
    comClearAppBadge = true,
  } = opts;

  const navigatorMock: Record<string, unknown> = { ...window.navigator };
  if (comSuporte) {
    navigatorMock.setAppBadge = setAppBadgeImpl ?? jest.fn().mockResolvedValue(undefined);
    if (comClearAppBadge) {
      navigatorMock.clearAppBadge = clearAppBadgeImpl ?? jest.fn().mockResolvedValue(undefined);
    } else {
      delete navigatorMock.clearAppBadge;
    }
  } else {
    delete navigatorMock.setAppBadge;
    delete navigatorMock.clearAppBadge;
  }

  Object.defineProperty(window, 'navigator', {
    value: navigatorMock,
    writable: true,
    configurable: true,
  });

  if (permissao !== undefined) {
    Object.defineProperty(global, 'Notification', {
      value: { permission: permissao },
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(global, 'Notification', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  }

  return navigatorMock;
}

describe('updateTrainingBadge (PUSH-04)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('com API presente e permissão granted, pendente=true chama setAppBadge(1)', () => {
    const setAppBadge = jest.fn().mockResolvedValue(undefined);
    configurarNavigator({ comSuporte: true, permissao: 'granted', setAppBadgeImpl: setAppBadge });

    updateTrainingBadge(true);

    expect(setAppBadge).toHaveBeenCalledWith(1);
  });

  test('com API presente e permissão granted, pendente=false chama clearAppBadge', () => {
    const clearAppBadge = jest.fn().mockResolvedValue(undefined);
    const setAppBadge = jest.fn().mockResolvedValue(undefined);
    configurarNavigator({
      comSuporte: true,
      permissao: 'granted',
      setAppBadgeImpl: setAppBadge,
      clearAppBadgeImpl: clearAppBadge,
    });

    updateTrainingBadge(false);

    expect(clearAppBadge).toHaveBeenCalled();
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  test('sem clearAppBadge disponível, pendente=false cai para setAppBadge(0)', () => {
    const setAppBadge = jest.fn().mockResolvedValue(undefined);
    configurarNavigator({
      comSuporte: true,
      permissao: 'granted',
      setAppBadgeImpl: setAppBadge,
      comClearAppBadge: false,
    });

    updateTrainingBadge(false);

    expect(setAppBadge).toHaveBeenCalledWith(0);
  });

  test('sem "setAppBadge" in navigator (iOS < 16.4), não lança e não chama nada', () => {
    configurarNavigator({ comSuporte: false, permissao: 'granted' });

    expect(() => updateTrainingBadge(true)).not.toThrow();
  });

  test('com permissão "default" (nunca pedida), não chama setAppBadge mesmo com API presente', () => {
    const setAppBadge = jest.fn().mockResolvedValue(undefined);
    configurarNavigator({ comSuporte: true, permissao: 'default', setAppBadgeImpl: setAppBadge });

    updateTrainingBadge(true);

    expect(setAppBadge).not.toHaveBeenCalled();
  });

  test('com permissão "denied", não chama setAppBadge mesmo com API presente', () => {
    const setAppBadge = jest.fn().mockResolvedValue(undefined);
    configurarNavigator({ comSuporte: true, permissao: 'denied', setAppBadgeImpl: setAppBadge });

    updateTrainingBadge(true);

    expect(setAppBadge).not.toHaveBeenCalled();
  });

  test('Promise rejeitada de setAppBadge é engolida silenciosamente (sem throw, sem unhandled rejection)', async () => {
    const setAppBadge = jest.fn().mockRejectedValue(new Error('badging indisponível'));
    configurarNavigator({ comSuporte: true, permissao: 'granted', setAppBadgeImpl: setAppBadge });

    expect(() => updateTrainingBadge(true)).not.toThrow();
    // Dá tempo ao microtask do .catch() silencioso resolver antes do teste
    // terminar, para garantir que nenhuma unhandledRejection escape.
    // setImmediate não existe no ambiente jsdom deste projeto — um
    // Promise.resolve() encadeado basta para esvaziar a fila de microtasks.
    await Promise.resolve();
    await Promise.resolve();
  });
});
