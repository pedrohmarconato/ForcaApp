// __tests__/jointInvitePending.test.ts
// Treino Conjunto 2.0 — Sprint 02. O convite que chega antes da hora.
//
// Modos de falha cobertos, todos nascidos de `get + remove` não ser atômico:
//  1. StrictMode/reentrada consumindo o mesmo código duas vezes e navegando duas;
//  2. um consumo lento APAGANDO um link novo que chegou no meio — o usuário
//     recebe um convite atualizado e entra no antigo;
//  3. navigation ref indisponível engolindo o pendente;
//  4. limite local tratado como se fosse a validade do convite.

jest.mock('@react-native-async-storage/async-storage', () => {
  let loja: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => loja[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        loja[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete loja[k];
      }),
      __limpar: () => {
        loja = {};
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LIMITE_LOCAL_MS,
  __resetPendente,
  __setRelogioPendente,
  consumirConvitePendente,
  descartarConvitePendente,
  guardarConvitePendente,
  lerConvitePendente,
} from '../src/services/jointInvitePending';

const T0 = 1_700_000_000_000;
let agora = T0;

beforeEach(() => {
  (AsyncStorage as any).__limpar();
  __resetPendente();
  agora = T0;
  __setRelogioPendente(() => agora);
});

describe('guardar e ler', () => {
  it('guarda o código com o momento do recebimento', async () => {
    await guardarConvitePendente('ABC234');
    expect((await lerConvitePendente())?.codigo).toBe('ABC234');
  });

  it('o último link válido vence', async () => {
    await guardarConvitePendente('AAA222');
    await guardarConvitePendente('BBB333');
    expect((await lerConvitePendente())?.codigo).toBe('BBB333');
  });

  it('limite local é contado do RECEBIMENTO e some ao vencer', async () => {
    await guardarConvitePendente('ABC234');
    agora = T0 + LIMITE_LOCAL_MS + 1;
    expect(await lerConvitePendente()).toBeNull();
    expect(await AsyncStorage.getItem('@forca:joint:convitePendente')).toBeNull();
  });
});

describe('consumo', () => {
  it('consome uma vez e remove depois do dispatch ACEITO', async () => {
    await guardarConvitePendente('ABC234');
    const dispatch = jest.fn(() => true);
    expect(await consumirConvitePendente(dispatch)).toBe('ABC234');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await lerConvitePendente()).toBeNull();
  });

  it('StrictMode: dois consumos em paralelo navegam UMA vez', async () => {
    await guardarConvitePendente('ABC234');
    const dispatch = jest.fn(() => true);
    const [a, b] = await Promise.all([
      consumirConvitePendente(dispatch),
      consumirConvitePendente(dispatch),
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect([a, b].filter(Boolean)).toEqual(['ABC234']);
  });

  it('dispatch RECUSADO preserva o pendente para a próxima tentativa', async () => {
    await guardarConvitePendente('ABC234');
    expect(await consumirConvitePendente(() => false)).toBeNull();
    expect((await lerConvitePendente())?.codigo).toBe('ABC234');
  });

  it('dispatch que LANÇA preserva o pendente', async () => {
    await guardarConvitePendente('ABC234');
    expect(
      await consumirConvitePendente(() => {
        throw new Error('navigation ref indisponível');
      }),
    ).toBeNull();
    expect((await lerConvitePendente())?.codigo).toBe('ABC234');
  });

  it('CORRIDA: link novo durante o dispatch NÃO é apagado pelo consumo antigo', async () => {
    await guardarConvitePendente('AAA222');

    let liberar: () => void = () => {};
    const bloqueio = new Promise<void>((r) => {
      liberar = r;
    });

    const consumo = consumirConvitePendente(async () => {
      // O dispatch está em curso; o link novo chega agora.
      await bloqueio;
      return true;
    });

    // Grava fora da fila do consumo em curso, como um evento de URL faria.
    const novo = (async () => {
      await Promise.resolve();
      await guardarConvitePendente('BBB333');
    })();

    liberar();
    await consumo;
    await novo;

    // O novo sobreviveu.
    expect((await lerConvitePendente())?.codigo).toBe('BBB333');
  });

  it('vencido no momento do consumo não navega', async () => {
    await guardarConvitePendente('ABC234');
    agora = T0 + LIMITE_LOCAL_MS + 1;
    const dispatch = jest.fn(() => true);
    expect(await consumirConvitePendente(dispatch)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('descartar remove explicitamente', async () => {
    await guardarConvitePendente('ABC234');
    await descartarConvitePendente();
    expect(await lerConvitePendente()).toBeNull();
  });
});
