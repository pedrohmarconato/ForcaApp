// __tests__/liveActivityPlatformImport.test.ts
//
// Fase 15 Plano 15-09 (CR-03, 15-VERIFICATION.md gap 4): prova, SEM mock de
// `modules/live-activity`, que o bootstrap Android/web não lança ao importar
// o bridge — bug CONFIRMADO em produção em 2026-08-19 (`npx expo start
// --web` crashou no mount com "Cannot find native module
// 'LiveActivityModule'", `<div id="root">` vazio, tela preta). Causa exata:
// `modules/live-activity/index.ts` chamava `requireNativeModule` no topo do
// módulo, incondicionalmente, sem guarda de `Platform.OS` em `index.ts`,
// `src/native/liveActivitySync.ts` nem `src/native/liveActivityIntentBridge.ts`.
//
// Importa o bridge real via caminho explícito `/index` para escapar do
// `moduleNameMapper` de `package.json` (`"modules/live-activity$"` →
// `__mocks__/modules-live-activity.ts`) — esse mapeamento existe para
// blindar OUTROS testes (Fase 16) contra o `requireNativeModule` obrigatório
// e mascararia exatamente o crash que este teste precisa reproduzir antes
// do fix (RED) e provar corrigido depois (GREEN). `App.tsx`/
// `liveActivitySync.ts` continuam usando o especificador curto
// `'../../modules/live-activity'`, então o describe de efeito root (abaixo)
// não depende do bridge real — testa apenas o guard de `Platform.OS` que
// este plano acrescenta ao `useEffect`.
import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';

// --- App.tsx: mocks hoistados dos dependentes pesados/alheios ao guard ----
// `App` é importado ESTATICAMENTE mais abaixo (molde
// `alertShim.test.ts`/`direcao03-fase1-fundacoes.test.tsx`: Platform.OS
// mutado direto, "sem jogos de module registry"). A guarda que este plano
// acrescenta ao `useEffect` de `App.tsx` lê `Platform.OS` em TEMPO DE
// EXECUÇÃO do efeito (a cada mount), não em tempo de import — então mutar
// `Platform.OS` antes de cada `render()` é suficiente, sem `jest.resetModules()`
// (que criaria uma segunda instância de `react`/`react-native` desacoplada
// do `react-test-renderer` já carregado e quebraria os hooks). Mocka apenas
// `liveActivitySync`/`liveActivityIntentBridge` — NUNCA `modules/live-activity`.
jest.mock('react-native-gesture-handler', () => ({}), { virtual: true });
jest.mock('expo-font', () => ({ useFonts: () => [true, undefined] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/navigation/RootNavigator', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/AlertHost', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/UpdateBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/ProvisioningBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/LiveActivityUnavailableBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/PushInviteHost', () => ({ __esModule: true, default: () => null }));

// Fábrica NÃO referencia variável externa (evita a armadilha de hoisting: um
// `import` compilado vira `require()` posicionado ANTES de qualquer `const`
// textualmente anterior no arquivo-fonte — se a fábrica capturasse
// `mockReconcileOrphanActivities` de fora, ela veria `undefined` no momento
// em que `import App from '../App'` dispara o require transitivo). Em vez
// disso, a fábrica cria seus próprios `jest.fn()` e o teste lê os mocks de
// volta importando o módulo (já mockado) — molde idêntico ao usado em
// `__tests__/LiveActivityUnavailableBanner.test.tsx`.
jest.mock('../src/native/liveActivitySync', () => ({
  reconcileOrphanActivities: jest.fn(),
  initLiveActivitySync: jest.fn(() => jest.fn()),
}));
jest.mock('../src/native/liveActivityIntentBridge', () => ({
  registerLiveActivityIntentListener: jest.fn(() => jest.fn()),
}));

import App from '../App';
import {
  reconcileOrphanActivities,
  initLiveActivitySync,
} from '../src/native/liveActivitySync';
import { registerLiveActivityIntentListener } from '../src/native/liveActivityIntentBridge';

const mockReconcileOrphanActivities = reconcileOrphanActivities as jest.Mock;
const mockInitLiveActivitySync = initLiveActivitySync as jest.Mock;
const mockRegisterLiveActivityIntentListener = registerLiveActivityIntentListener as jest.Mock;

const REAL_BRIDGE_PATH = '../modules/live-activity/index';

type BridgeModule = typeof import('../modules/live-activity/index');

const withPlatform = <T>(os: string, run: () => T): T => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
  }
};

/** `jest.resetModules()` + require dinâmico: o guard do bridge roda uma vez
 * no escopo do módulo (não a cada chamada), então cada cenário de
 * plataforma exige uma reavaliação isolada do módulo. */
const requireRealBridge = (): BridgeModule => {
  jest.resetModules();
  return require(REAL_BRIDGE_PATH) as BridgeModule;
};

describe('modules/live-activity — bootstrap seguro fora do iOS (CR-03)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo');
  });

  it('android: importar o bridge não lança, mesmo sem LiveActivityModule registrado', () => {
    let bridge: BridgeModule | undefined;
    withPlatform('android', () => {
      expect(() => {
        bridge = requireRealBridge();
      }).not.toThrow();
    });
    expect(bridge).toBeDefined();
  });

  it('android: todos os wrappers resolvem valores neutros sem tocar módulo nativo', async () => {
    const bridge = withPlatform('android', requireRealBridge);

    await expect(bridge.startLiveActivity({} as never, 'log-1')).resolves.toBe(false);
    await expect(bridge.updateLiveActivity({} as never)).resolves.toBe(false);
    await expect(bridge.endLiveActivity('immediate')).resolves.toBe(false);
    await expect(bridge.isLiveActivityRunning()).resolves.toBe(false);
    await expect(bridge.reconcileLiveActivityOrphans(null)).resolves.toBe(false);
    await expect(bridge.peekQueuedLiveActivityIntents()).resolves.toEqual([]);
    await expect(bridge.ackQueuedLiveActivityIntent('id-1')).resolves.toBeUndefined();

    const unsubscribe = bridge.subscribeLiveActivityIntentAction(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it('web: importar o bridge não lança, mesmo sem LiveActivityModule registrado', () => {
    let bridge: BridgeModule | undefined;
    withPlatform('web', () => {
      expect(() => {
        bridge = requireRealBridge();
      }).not.toThrow();
    });
    expect(bridge).toBeDefined();
  });

  it('web: todos os wrappers resolvem valores neutros sem tocar módulo nativo', async () => {
    const bridge = withPlatform('web', requireRealBridge);

    await expect(bridge.startLiveActivity({} as never, 'log-1')).resolves.toBe(false);
    await expect(bridge.isLiveActivityRunning()).resolves.toBe(false);
  });
});

describe('modules/live-activity — preservação do ramo iOS real (D-12)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo');
  });

  it('iOS sem módulo instalado: wrappers resolvem false sem lançar', async () => {
    const bridge = withPlatform('ios', () => {
      jest.resetModules();
      jest.doMock('expo', () => ({
        ...jest.requireActual('expo'),
        requireOptionalNativeModule: jest.fn(() => null),
      }));
      return require(REAL_BRIDGE_PATH) as BridgeModule;
    });

    await expect(bridge.startLiveActivity({} as never, 'log-1')).resolves.toBe(false);
    await expect(bridge.isLiveActivityRunning()).resolves.toBe(false);
    const unsubscribe = bridge.subscribeLiveActivityIntentAction(jest.fn());
    expect(() => unsubscribe()).not.toThrow();
  });

  it('iOS com módulo instalado: delega start/update/end/reconcile/peek/ack/listener ao módulo real', async () => {
    const fakeModule = {
      startActivity: jest.fn().mockResolvedValue(true),
      updateActivity: jest.fn().mockResolvedValue(true),
      endActivity: jest.fn().mockResolvedValue(true),
      isActivityRunning: jest.fn().mockResolvedValue(true),
      reconcileOrphans: jest.fn().mockResolvedValue(true),
      peekIntentQueue: jest.fn().mockResolvedValue([]),
      ackIntentAction: jest.fn().mockResolvedValue(undefined),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
    };

    const bridge = withPlatform('ios', () => {
      jest.resetModules();
      jest.doMock('expo', () => ({
        ...jest.requireActual('expo'),
        requireOptionalNativeModule: jest.fn(() => fakeModule),
      }));
      return require(REAL_BRIDGE_PATH) as BridgeModule;
    });

    const state = {} as never;

    await bridge.startLiveActivity(state, 'log-1');
    expect(fakeModule.startActivity).toHaveBeenCalledWith(state, 'log-1');

    await bridge.updateLiveActivity(state);
    expect(fakeModule.updateActivity).toHaveBeenCalledWith(state);

    await bridge.endLiveActivity('afterDate', 180);
    expect(fakeModule.endActivity).toHaveBeenCalledWith('afterDate', 180);

    await bridge.isLiveActivityRunning();
    expect(fakeModule.isActivityRunning).toHaveBeenCalledTimes(1);

    await bridge.reconcileLiveActivityOrphans('log-1');
    expect(fakeModule.reconcileOrphans).toHaveBeenCalledWith('log-1');

    await bridge.peekQueuedLiveActivityIntents();
    expect(fakeModule.peekIntentQueue).toHaveBeenCalledTimes(1);

    await bridge.ackQueuedLiveActivityIntent('id-1');
    expect(fakeModule.ackIntentAction).toHaveBeenCalledWith('id-1');

    const listener = jest.fn();
    const unsubscribe = bridge.subscribeLiveActivityIntentAction(listener);
    expect(fakeModule.addListener).toHaveBeenCalledWith('onIntentAction', listener);
    unsubscribe();
    expect(fakeModule.addListener.mock.results[0].value.remove).toHaveBeenCalled();
  });
});

describe('App — efeito root da Live Activity limitado a iOS (CR-03/D-12)', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    (Platform as { OS: string }).OS = originalOS;
    mockReconcileOrphanActivities.mockClear();
    mockInitLiveActivitySync.mockClear();
    mockRegisterLiveActivityIntentListener.mockClear();
  });

  it('fora do iOS (android): não chama reconcileOrphanActivities/initLiveActivitySync/registerLiveActivityIntentListener', () => {
    (Platform as { OS: string }).OS = 'android';

    expect(() => render(React.createElement(App))).not.toThrow();

    expect(mockReconcileOrphanActivities).not.toHaveBeenCalled();
    expect(mockInitLiveActivitySync).not.toHaveBeenCalled();
    expect(mockRegisterLiveActivityIntentListener).not.toHaveBeenCalled();
  });

  it('fora do iOS (web): não chama reconcileOrphanActivities/initLiveActivitySync/registerLiveActivityIntentListener', () => {
    (Platform as { OS: string }).OS = 'web';

    expect(() => render(React.createElement(App))).not.toThrow();

    expect(mockReconcileOrphanActivities).not.toHaveBeenCalled();
    expect(mockInitLiveActivitySync).not.toHaveBeenCalled();
    expect(mockRegisterLiveActivityIntentListener).not.toHaveBeenCalled();
  });

  it('no iOS: inicia reconciliação, sync e listener de intents, e limpa no unmount', () => {
    (Platform as { OS: string }).OS = 'ios';

    const { unmount } = render(React.createElement(App));

    expect(mockReconcileOrphanActivities).toHaveBeenCalledTimes(1);
    expect(mockInitLiveActivitySync).toHaveBeenCalledTimes(1);
    expect(mockRegisterLiveActivityIntentListener).toHaveBeenCalledTimes(1);

    const unsubscribeSync = mockInitLiveActivitySync.mock.results[0].value as jest.Mock;
    const unsubscribeIntents = mockRegisterLiveActivityIntentListener.mock.results[0]
      .value as jest.Mock;

    unmount();
    expect(unsubscribeSync).toHaveBeenCalledTimes(1);
    expect(unsubscribeIntents).toHaveBeenCalledTimes(1);
  });
});
