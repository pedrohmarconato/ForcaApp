// src/services/jointInvitePending.ts
// Treino Conjunto 2.0 — Sprint 02. O convite que chega antes da hora.
//
// Um link pode chegar sem sessão, ou com onboarding incompleto. A árvore que
// está montada nesse momento não tem `JointJoin`, então o código é guardado e
// consumido depois, pela árvore Main.
//
// TRÊS COISAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR:
//
//  1. `AsyncStorage.getItem` + `removeItem` **não é atômico**. Sem serialização,
//     dois consumidores (StrictMode, reentrada, foco) leem o mesmo código e
//     navegam duas vezes — e, pior, um consumo lento apaga um link NOVO que
//     chegou no meio. Por isso toda operação passa por uma fila single-flight e
//     carrega uma VERSÃO.
//  2. A remoção acontece **depois** de o dispatch de navegação ser aceito, e
//     **só se a versão ainda for a mesma**. Falhou a navegação, o pendente fica
//     para a próxima tentativa.
//  3. O limite de 15 minutos é LOCAL, contado do recebimento — não da criação do
//     convite. Quem decide se o convite ainda vale é o servidor; isto aqui só
//     evita carregar para sempre um código que provavelmente já morreu.

import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAVE = '@forca:joint:convitePendente';

/** Limite LOCAL. O servidor é a autoridade sobre a validade real do convite. */
export const LIMITE_LOCAL_MS = 15 * 60 * 1000;

export type ConvitePendente = {
  codigo: string;
  /** Quando ESTE aparelho recebeu o link. */
  receivedAt: number;
  /** Muda a cada gravação. É o que impede um consumo antigo de apagar o novo. */
  versao: number;
};

// ------------------------------------------------------------------
// Fila single-flight: uma operação de cada vez, na ordem em que chegou.
// ------------------------------------------------------------------
let fila: Promise<unknown> = Promise.resolve();

const naFila = <T,>(operacao: () => Promise<T>): Promise<T> => {
  const proxima = fila.then(operacao, operacao);
  // A fila não pode morrer por causa de uma falha de uma operação.
  fila = proxima.then(
    () => undefined,
    () => undefined,
  );
  return proxima;
};

let relogio: () => number = () => Date.now();
/** Só para teste: relógio injetável, sem `sleep`. */
export const __setRelogioPendente = (fn: () => number) => {
  relogio = fn;
};

let contadorDeVersao = 0;

const ler = async (): Promise<ConvitePendente | null> => {
  const cru = await AsyncStorage.getItem(CHAVE);
  if (!cru) return null;
  try {
    const v = JSON.parse(cru) as ConvitePendente;
    if (typeof v?.codigo !== 'string' || typeof v?.receivedAt !== 'number') return null;
    return v;
  } catch {
    return null;
  }
};

/**
 * Guarda o código recebido. O **último link válido vence** — quem acabou de
 * receber um convite novo quer o novo, não o de dez minutos atrás.
 */
export const guardarConvitePendente = (codigo: string): Promise<ConvitePendente> =>
  naFila(async () => {
    contadorDeVersao += 1;
    const pendente: ConvitePendente = {
      codigo,
      receivedAt: relogio(),
      versao: contadorDeVersao,
    };
    await AsyncStorage.setItem(CHAVE, JSON.stringify(pendente));
    return pendente;
  });

/** Espia sem consumir. Devolve null se venceu o limite local (e o remove). */
export const lerConvitePendente = (): Promise<ConvitePendente | null> =>
  naFila(async () => {
    const pendente = await ler();
    if (!pendente) return null;
    if (relogio() - pendente.receivedAt > LIMITE_LOCAL_MS) {
      await AsyncStorage.removeItem(CHAVE);
      return null;
    }
    return pendente;
  });

/**
 * Consome o pendente **através** do dispatch de navegação.
 *
 * A ordem importa e é o coração deste módulo:
 *   1. lê (na fila, ninguém mais mexe);
 *   2. chama `dispatch(codigo)`;
 *   3. **só se o dispatch aceitou** e a versão continua a mesma, remove.
 *
 * Se o dispatch recusar (navigation ref ainda não pronto) ou lançar, o pendente
 * PERMANECE. E se um link novo chegou enquanto o dispatch corria, a versão mudou
 * e a remoção não acontece — o novo sobrevive.
 */
export const consumirConvitePendente = (
  dispatch: (codigo: string) => boolean | Promise<boolean>,
): Promise<string | null> =>
  naFila(async () => {
    const pendente = await ler();
    if (!pendente) return null;

    if (relogio() - pendente.receivedAt > LIMITE_LOCAL_MS) {
      await AsyncStorage.removeItem(CHAVE);
      return null;
    }

    let aceito = false;
    try {
      aceito = await dispatch(pendente.codigo);
    } catch {
      aceito = false;
    }
    if (!aceito) return null; // preserva para a próxima tentativa

    const agora = await ler();
    if (agora && agora.versao !== pendente.versao) {
      // Chegou link mais novo durante o dispatch: NÃO apaga o novo.
      return pendente.codigo;
    }
    await AsyncStorage.removeItem(CHAVE);
    return pendente.codigo;
  });

/** Descarta explicitamente (usado quando o usuário recusa o convite). */
export const descartarConvitePendente = (): Promise<void> =>
  naFila(async () => {
    await AsyncStorage.removeItem(CHAVE);
  });

/** Só para teste: zera a fila e o contador entre casos. */
export const __resetPendente = () => {
  fila = Promise.resolve();
  contadorDeVersao = 0;
  relogio = () => Date.now();
};
