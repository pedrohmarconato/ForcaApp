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
