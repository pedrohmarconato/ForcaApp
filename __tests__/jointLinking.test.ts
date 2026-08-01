// __tests__/jointLinking.test.ts
// Treino Conjunto 2.0 — Sprint 02. Deep link do convite.
//
// A armadilha que estes testes existem para evitar: escrever um parser paralelo,
// testá-lo, e o `NavigationContainer` usar outro caminho. Por isso as asserções
// batem na função REGISTRADA em `linkingMain.getStateFromPath` e na config real.
//
// E a outra: `getStateFromPath` recebe PATH, não URI. Validar scheme ali seria
// testar a API errada — a validação de URI completa é `parseInviteUrl`.

jest.mock('@react-native-async-storage/async-storage', () => {
  let loja: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => loja[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => { loja[k] = v; }),
      removeItem: jest.fn(async (k: string) => { delete loja[k]; }),
      __limpar: () => { loja = {}; },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStateFromPath } from '@react-navigation/native';
import {
  CAMINHO_CONVITE,
  PREFIXOS,
  SCHEME,
  __setLinkingBridge,
  buildInviteLink,
  isCodigoDeConvite,
  linkingInterceptor,
  linkingMain,
  parseInviteUrl,
} from '../src/navigation/linking';
import { __resetPendente, lerConvitePendente } from '../src/services/jointInvitePending';

beforeEach(() => {
  (AsyncStorage as any).__limpar();
  __resetPendente();
});

// ============================================================
// K2a — parseInviteUrl valida a URI COMPLETA
// ============================================================
describe('K2a — parseInviteUrl (URI completa)', () => {
  it.each([
    ['forcaapp://treino-conjunto/ABC234', 'ABC234'],
    ['forcaapp://treino-conjunto/abc234', 'ABC234'],
  ])('%s → %s', (url, esperado) => {
    expect(parseInviteUrl(url)).toBe(esperado);
  });

  it.each([
    ['forcaapp://treino-conjunto/ABC23', '5 caracteres'],
    ['forcaapp://treino-conjunto/ABC2345', '7 caracteres'],
    ['forcaapp://treino-conjunto/ABC2I0', 'fora do alfabeto'],
    ['forcaapp://outra-rota/ABC234', 'outro caminho'],
    ['forcaapp://treino-conjunto/ABC234?x=1', 'query'],
    ['forcaapp://treino-conjunto/ABC234#y', 'fragment'],
    ['https://exemplo.com/treino-conjunto/ABC234', 'scheme alheio'],
    ['javascript:alert(1)', 'javascript'],
    ['forcaapp://treino-conjunto', 'sem código'],
    ['forcaapp://treino-conjunto/ABC234/extra', 'segmento a mais'],
    ['', 'vazio'],
  ])('%s → null (%s)', (url) => {
    expect(parseInviteUrl(url)).toBeNull();
  });

  it('javascript: nunca produz código, então nunca chega a navegador interno', () => {
    expect(parseInviteUrl('javascript:alert(1)')).toBeNull();
    expect(parseInviteUrl('forcaapp://treino-conjunto/javascript')).toBeNull();
  });
});

// ============================================================
// K3 — round-trip e alfabeto
// ============================================================
describe('K3 — link canônico', () => {
  it('round-trip para todo código do alfabeto', () => {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i + 6 <= alfabeto.length; i += 6) {
      const codigo = alfabeto.slice(i, i + 6);
      expect(parseInviteUrl(buildInviteLink(codigo))).toBe(codigo);
    }
  });

  it('o alfabeto recusa os ambíguos', () => {
    for (const ambiguo of ['O', '0', 'I', '1']) {
      expect(isCodigoDeConvite(`ABC2${ambiguo}4`)).toBe(false);
    }
  });
});

// ============================================================
// K2b/K2c — a função REGISTRADA e o estado ANINHADO
// ============================================================
describe('K2b/K2c — config da árvore Main', () => {
  const registrada = linkingMain.getStateFromPath!;

  it('K2c: o estado é ANINHADO — Home → JointJoin {code}', () => {
    const estado: any = registrada(`${CAMINHO_CONVITE}/ABC234`, (linkingMain as any).config);
    expect(estado.routes[0].name).toBe('Home');
    const interna = estado.routes[0].state.routes[0];
    expect(interna.name).toBe('JointJoin');
    expect(interna.params).toEqual({ code: 'ABC234' });
  });

  it('K2c: path com barra inicial dá o mesmo resultado', () => {
    const estado: any = registrada(`/${CAMINHO_CONVITE}/ABC234`, (linkingMain as any).config);
    expect(estado.routes[0].state.routes[0].params).toEqual({ code: 'ABC234' });
  });

  it('K2b: a função registrada RECUSA código inválido — não navega com param quebrado', () => {
    for (const ruim of ['ABC23', 'ABC2345', 'ABC2I0']) {
      expect(registrada(`${CAMINHO_CONVITE}/${ruim}`, (linkingMain as any).config)).toBeUndefined();
    }
  });

  it('K2b: caminho não conjunto continua indo para o comportamento padrão', () => {
    const padrao = getStateFromPath('', (linkingMain as any).config);
    expect(registrada('', (linkingMain as any).config)).toEqual(padrao);
  });

  it('a config declara os prefixos do scheme', () => {
    expect(PREFIXOS).toContain(`${SCHEME}://`);
    expect(linkingMain.prefixes).toEqual(PREFIXOS);
  });
});

// ============================================================
// K3/K3b/K3c — a árvore sem Home nunca hidrata
// ============================================================
describe('K3 — config interceptora (Auth e Onboarding)', () => {
  it('não declara a rota conjunta', () => {
    expect(JSON.stringify((linkingInterceptor as any).config)).not.toContain('JointJoin');
  });

  it('getInitialURL guarda o código e devolve null — nada a hidratar aqui', async () => {
    __setLinkingBridge({
      getInitialURL: async () => 'forcaapp://treino-conjunto/ABC234',
      addEventListener: () => ({ remove: () => {} }),
    });
    const resultado = await linkingInterceptor.getInitialURL!();
    expect(resultado).toBeNull();
    expect((await lerConvitePendente())?.codigo).toBe('ABC234');
  });

  it('getInitialURL com URL não conjunta devolve a URL, sem guardar nada', async () => {
    __setLinkingBridge({
      getInitialURL: async () => 'forcaapp://outra/coisa',
      addEventListener: () => ({ remove: () => {} }),
    });
    expect(await linkingInterceptor.getInitialURL!()).toBe('forcaapp://outra/coisa');
    expect(await lerConvitePendente()).toBeNull();
  });

  it('K3c: subscribe guarda o convite e NÃO chama o listener do React Navigation', async () => {
    let emitir: (e: { url: string }) => void = () => {};
    const remove = jest.fn();
    __setLinkingBridge({
      addEventListener: (ouvinte) => {
        emitir = ouvinte;
        return { remove };
      },
    });

    const listener = jest.fn();
    linkingInterceptor.subscribe!(listener);

    emitir({ url: 'forcaapp://treino-conjunto/ABC234' });
    await new Promise((r) => setTimeout(r, 0));

    expect(listener).not.toHaveBeenCalled();
    expect((await lerConvitePendente())?.codigo).toBe('ABC234');
  });

  it('K3c: URL não conjunta segue para o listener', async () => {
    let emitir: (e: { url: string }) => void = () => {};
    __setLinkingBridge({ addEventListener: (o) => { emitir = o; return { remove: () => {} }; } });
    const listener = jest.fn();
    linkingInterceptor.subscribe!(listener);
    emitir({ url: 'forcaapp://outra/coisa' });
    expect(listener).toHaveBeenCalledWith('forcaapp://outra/coisa');
  });

  it('K3c: subscribe devolve cleanup, e ele roda EXATAMENTE uma vez', () => {
    const remove = jest.fn();
    __setLinkingBridge({ addEventListener: () => ({ remove }) });
    const cleanup = linkingInterceptor.subscribe!(jest.fn());
    expect(typeof cleanup).toBe('function');
    (cleanup as () => void)();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
