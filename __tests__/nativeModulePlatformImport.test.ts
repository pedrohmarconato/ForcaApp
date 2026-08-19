// __tests__/nativeModulePlatformImport.test.ts
//
// Fase 15 Plano 15-09b (irmão do CR-03 / 15-09): `modules/native-info` tinha
// o MESMO padrão que causou o crash de `modules/live-activity` (15-09) —
// `requireNativeModule` chamado no topo do módulo, incondicionalmente. Bug
// CONFIRMADO em produção em 2026-08-19: `npx expo start --web` mantinha
// `#root` vazio e lançava "Cannot find native module 'NativeInfoModule'" no
// console — MESMO DEPOIS do fix do 15-09, com os 168 suites / 1996 testes já
// verdes. Causa da lacuna: `liveActivityPlatformImport.test.ts` mocka
// `../src/components/ProvisioningBanner` inteiro no describe "App — efeito
// root" (linhas 48-51 daquele arquivo), então NUNCA exercita o import real
// de `modules/native-info` que `ProvisioningBanner.tsx` faz na linha 20. Um
// teste que passa enquanto o app crasha não estava medindo o que dizia medir.
//
// Este arquivo fecha DUAS lacunas:
//
// 1. Prova, SEM mock de `modules/native-info`, que o módulo em si é seguro
//    de importar/usar fora do iOS — mesma cobertura que
//    `liveActivityPlatformImport.test.ts` já dá a `modules/live-activity`.
//
// 2. Prova o GRAFO DE IMPORT REAL a partir de `App.tsx`: importa (`require`)
//    o `App` real com `ProvisioningBanner` REAL (não mockado) em
//    web/android. Isso é exatamente o que faltava — qualquer novo
//    `requireNativeModule` desguardado em QUALQUER módulo alcançável a
//    partir de `App.tsx` volta a quebrar este teste no futuro, porque o
//    teste 2 sobe o grafo de import de verdade, não um substituto mockado.
//
// Decisão de arquivo (vs. estender liveActivityPlatformImport.test.ts):
// arquivo novo, escopo próprio. O teste do 15-09 é sobre um módulo
// específico (`live-activity`) e sua guarda de EFEITO em `App.tsx` (guard
// avaliado em tempo de execução do useEffect, não em tempo de import — por
// isso aquele arquivo pode reusar uma única instância de `App` importada
// estaticamente e só mutar `Platform.OS` entre renders). O bug aqui é
// diferente: `requireNativeModule` roda em tempo de IMPORT do módulo, então
// provar a correção exige resetar o registro de módulos e reimportar
// `App`/`modules/native-info` a cada cenário de plataforma (molde
// `requireRealBridge` do arquivo irmão, aplicado a um caminho de import
// diferente). Misturar os dois describes "App — efeito root" no mesmo
// arquivo, com dois mecanismos de mutação de plataforma diferentes (um
// reusa `App`, o outro reimporta do zero), tornaria ambíguo o que cada
// describe cobre. Arquivo novo mantém cada mecanismo — e sua intenção —
// isolado.

import React from 'react';
import { Platform } from 'react-native';

// --- mocks dos dependentes pesados/alheios ao módulo sob teste -----------
// Mesma lista de `liveActivityPlatformImport.test.ts`, MENOS
// `ProvisioningBanner` (propositalmente NÃO mockado — é o componente que
// consome `modules/native-info` e cujo import precisa sobreviver fora do
// iOS) e MENOS `modules/native-info` (propositalmente NÃO mockado — é o
// módulo sob teste). `modules/live-activity` continua coberto pelo
// `moduleNameMapper` global (`package.json`), então os mocks de
// `liveActivitySync`/`liveActivityIntentBridge` abaixo só existem para
// isolar o comportamento de efeito daquele módulo — irrelevante aqui.
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
jest.mock('../src/components/LiveActivityUnavailableBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/components/PushInviteHost', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/native/liveActivitySync', () => ({
  reconcileOrphanActivities: jest.fn(),
  initLiveActivitySync: jest.fn(() => jest.fn()),
}));
jest.mock('../src/native/liveActivityIntentBridge', () => ({
  registerLiveActivityIntentListener: jest.fn(() => jest.fn()),
}));

const REAL_NATIVE_INFO_PATH = '../modules/native-info/index';
const APP_PATH = '../App';

type NativeInfoModule = typeof import('../modules/native-info/index');

const withPlatform = <T>(os: string, run: () => T): T => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(Platform, 'OS', descriptor);
  }
};

/** O guard roda uma vez no escopo do módulo (não a cada chamada), então cada
 * cenário de plataforma exige uma reavaliação isolada — molde idêntico a
 * `requireRealBridge` em `liveActivityPlatformImport.test.ts`. */
const requireRealNativeInfo = (): NativeInfoModule => {
  jest.resetModules();
  return require(REAL_NATIVE_INFO_PATH) as NativeInfoModule;
};

describe('modules/native-info — bootstrap seguro fora do iOS (irmão do CR-03)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo');
  });

  it('android: importar o módulo não lança, mesmo sem NativeInfoModule registrado', () => {
    let mod: NativeInfoModule | undefined;
    withPlatform('android', () => {
      expect(() => {
        mod = requireRealNativeInfo();
      }).not.toThrow();
    });
    expect(mod).toBeDefined();
  });

  it('web: importar o módulo não lança, mesmo sem NativeInfoModule registrado', () => {
    let mod: NativeInfoModule | undefined;
    withPlatform('web', () => {
      expect(() => {
        mod = requireRealNativeInfo();
      }).not.toThrow();
    });
    expect(mod).toBeDefined();
  });

  it('android: getProvisioningProfileExpiry resolve null sem tocar módulo nativo', async () => {
    const mod = withPlatform('android', requireRealNativeInfo);
    await expect(mod.getProvisioningProfileExpiry()).resolves.toBeNull();
  });

  it('web: getProvisioningProfileExpiry resolve null sem tocar módulo nativo', async () => {
    const mod = withPlatform('web', requireRealNativeInfo);
    await expect(mod.getProvisioningProfileExpiry()).resolves.toBeNull();
  });
});

describe('modules/native-info — preservação do ramo iOS real (D-03)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo');
  });

  it('iOS sem módulo instalado: getProvisioningProfileExpiry resolve null sem lançar', async () => {
    const mod = withPlatform('ios', () => {
      jest.resetModules();
      jest.doMock('expo', () => ({
        ...jest.requireActual('expo'),
        requireOptionalNativeModule: jest.fn(() => null),
      }));
      return require(REAL_NATIVE_INFO_PATH) as NativeInfoModule;
    });

    await expect(mod.getProvisioningProfileExpiry()).resolves.toBeNull();
  });

  it('iOS com módulo instalado: delega getProvisioningProfileExpiry ao módulo real sem mudança de comportamento', async () => {
    const fakeModule = {
      getProvisioningProfileExpiry: jest.fn().mockResolvedValue('2026-08-25T00:00:00.000Z'),
    };

    const mod = withPlatform('ios', () => {
      jest.resetModules();
      jest.doMock('expo', () => ({
        ...jest.requireActual('expo'),
        requireOptionalNativeModule: jest.fn(() => fakeModule),
      }));
      return require(REAL_NATIVE_INFO_PATH) as NativeInfoModule;
    });

    await expect(mod.getProvisioningProfileExpiry()).resolves.toBe('2026-08-25T00:00:00.000Z');
    expect(fakeModule.getProvisioningProfileExpiry).toHaveBeenCalledTimes(1);
  });
});

describe('App — grafo de import real sobrevive fora do iOS (irmão do CR-03)', () => {
  // Só `require()`, NUNCA `render()`, neste describe: o bug reproduzido aqui
  // é de TEMPO DE IMPORT (o `requireNativeModule` desguardado roda ao
  // carregar `modules/native-info/index.ts`, alcançado transitivamente por
  // `App.tsx` → `ProvisioningBanner.tsx`), então `require()` sozinho já
  // reproduz e prova o fix — sem precisar montar a árvore. Chamar
  // `jest.resetModules()` e então `render()` com `react-test-renderer`
  // criaria uma SEGUNDA instância de `react` desacoplada da que
  // `react-test-renderer` já carregou (armadilha documentada no cabeçalho de
  // `liveActivityPlatformImport.test.ts`), quebrando os hooks com "Cannot
  // read properties of null (reading 'useEffect')" — sintoma de identidade
  // de módulo, não do bug sob teste. `render()` do grafo completo já é
  // coberto, para a guarda de EFEITO do live-activity, pelo describe "App —
  // efeito root" do arquivo irmão (que usa `import` estático, sem
  // `resetModules`, por essa mesma razão).
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo');
  });

  it('android: importar App (com ProvisioningBanner REAL, sem mock de native-info) não lança', () => {
    withPlatform('android', () => {
      jest.resetModules();
      let AppModule: { default: React.ComponentType } | undefined;
      expect(() => {
        AppModule = require(APP_PATH) as { default: React.ComponentType };
      }).not.toThrow();
      expect(typeof AppModule?.default).toBe('function');
    });
  });

  it('web: importar App (com ProvisioningBanner REAL, sem mock de native-info) não lança', () => {
    withPlatform('web', () => {
      jest.resetModules();
      let AppModule: { default: React.ComponentType } | undefined;
      expect(() => {
        AppModule = require(APP_PATH) as { default: React.ComponentType };
      }).not.toThrow();
      expect(typeof AppModule?.default).toBe('function');
    });
  });
});
