// src/services/sessionOutboxStorage.ts
// Fase 4 (REQ-07) — Fila DURÁVEL de mutações de execução pendentes de envio.
// Diferente de sessionDraftStorage.ts (cache de retomada): aqui, perder o dado
// é perder um registro de treino que o servidor nunca viu. Storage PRÓPRIO —
// nunca compartilha chave com o draft, porque clearDraft() apaga o rascunho
// ao finalizar (activeSessionStore.ts) e destruiria itens não enviados.
//
// UMA chave por usuário (D-09/Recomendação A1 do RESEARCH.md, não por
// sessão): a fila precisa ser descoberta depois de finish_session, quando o
// draft (chaveado por plannedSessionId) já foi limpo — só `userId` é sempre
// resolvível nesse momento.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OutboxDocument } from '../engine/sessionOutboxPolicy';

const EMPTY_DOCUMENT: OutboxDocument = { version: 1, items: [], quarantine: [] };

const keyFor = (userId: string): string => `@session_outbox_${userId}`;

// Serializa operações da mesma chave (molde verbatim de sessionDraftStorage.ts:16-36) —
// uma persistência antiga nunca sobrescreve uma mais nova da mesma fila.
const keyQueues = new Map<string, Promise<void>>();
const withKeyQueue = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = keyQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  keyQueues.set(key, turn);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (keyQueues.get(key) === turn) keyQueues.delete(key);
  }
};

/** Nunca lança: formato desconhecido/corrompido/version !== 1 → documento vazio. */
const parseDocument = (raw: string | null): OutboxDocument => {
  if (!raw) return EMPTY_DOCUMENT;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.items) &&
      Array.isArray(parsed.quarantine)
    ) {
      return parsed as OutboxDocument;
    }
    return EMPTY_DOCUMENT;
  } catch {
    return EMPTY_DOCUMENT;
  }
};

export const loadOutbox = async (userId: string): Promise<OutboxDocument> => {
  const key = keyFor(userId);
  return withKeyQueue(key, async () => parseDocument(await AsyncStorage.getItem(key)));
};

export const saveOutbox = async (userId: string, doc: OutboxDocument): Promise<void> => {
  const key = keyFor(userId);
  await withKeyQueue(key, () => AsyncStorage.setItem(key, JSON.stringify(doc)));
};

/**
 * CR-01 (code review 04): executa TODO o ciclo leitura→mutação→escrita sob o
 * MESMO turno de `withKeyQueue` do usuário — nenhuma segunda chamada de
 * `enqueueItem`/`drainAll` para o MESMO userId pode ler o documento enquanto
 * esta transação ainda não escreveu o resultado. Sem isso, duas transações
 * concorrentes podiam se basear no mesmo snapshot (lido antes de a outra
 * salvar) e a última a persistir apagava o que a outra tinha acabado de
 * gravar — exatamente o loss silencioso que D-07 proíbe.
 *
 * Usa `AsyncStorage` DIRETO (não `loadOutbox`/`saveOutbox`) para não aninhar
 * dois turnos da MESMA chave dentro de um só: a segunda chamada a
 * `withKeyQueue(key, ...)` esperaria a primeira liberar o turno, e a
 * primeira só libera depois que a chamada de dentro dela retornar —
 * deadlock.
 *
 * `fn` recebe o documento carregado e uma flag `loadFailed` — quando a
 * LEITURA falhou de forma transitória (native module hiccup; formato
 * corrompido/versão desconhecida NUNCA cai aqui, `parseDocument` já degrada
 * sem lançar), `doc` vem como documento vazio só para o chamador ter algo a
 * inspecionar, mas o chamador deve decidir se é seguro persistir por cima —
 * normalmente NÃO é (CR-02): sobrescrever o disco com um documento vazio
 * apagaria itens reais que a leitura simplesmente não conseguiu ver desta
 * vez. `fn` pode pedir `skipSave: true` para pular a escrita inteiramente.
 */
export const withOutboxTransaction = async <T>(
  userId: string,
  fn: (
    doc: OutboxDocument,
    loadFailed: boolean,
  ) => Promise<{ doc: OutboxDocument; result: T; skipSave?: boolean }>,
): Promise<T> => {
  const key = keyFor(userId);
  return withKeyQueue(key, async () => {
    let doc: OutboxDocument;
    let loadFailed = false;
    try {
      doc = parseDocument(await AsyncStorage.getItem(key));
    } catch {
      loadFailed = true;
      doc = EMPTY_DOCUMENT;
    }
    const { doc: nextDoc, result, skipSave } = await fn(doc, loadFailed);
    if (!skipSave) {
      // Falha de ESCRITA propaga (D-12: cada chamador decide como logar/
      // reagir — enqueueItem e drainAll têm mensagens próprias).
      await AsyncStorage.setItem(key, JSON.stringify(nextDoc));
    }
    return result;
  });
};
