// src/services/sessionDraftStorage.ts
// Fase 4 — Rascunho da sessão ATIVA persistido no aparelho, por usuário e sessão, para
// RETOMAR uma sessão interrompida (fechar o app no meio e reabrir sem perder as
// séries já registradas). Não é uma segunda fonte de verdade do servidor: é só
// um cache local do que está em andamento. Reps/cargas não são segredo, então
// AsyncStorage (sem os limites de tamanho do SecureStore) é suficiente.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { coerceDraftNumerics, type SessionDraft } from '../engine/sessionModel';

const legacyKeyFor = (userId: string): string =>
  `@active_session_draft_${userId}`;
const keyFor = (userId: string, plannedSessionId: string): string =>
  `@active_session_draft_${userId}_${plannedSessionId}`;

// Serializa operações da mesma sessão no processo. Uma persistência antiga que
// começou antes de uma troca nunca termina depois e sobrescreve a mais nova.
const keyQueues = new Map<string, Promise<void>>();
const withKeyQueue = async <T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> => {
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

const parseDraft = (raw: string | null): SessionDraft | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Só aceita o formato conhecido; rascunho de versão antiga/corrompida é ignorado.
    // Mesmo dentro do formato v1, COAGE todo numérico (F8): um rascunho gravado antes
    // da coerção pode ter "40" em vez de 40 e contaminar o stepper ("402.5"/NaN).
    if (
      parsed &&
      parsed.version === 1 &&
      typeof parsed.plannedSessionId === 'string'
    ) {
      return coerceDraftNumerics(parsed as SessionDraft);
    }
    return null;
  } catch {
    return null;
  }
};

export const saveDraft = async (draft: SessionDraft): Promise<void> => {
  const key = keyFor(draft.userId, draft.plannedSessionId);
  await withKeyQueue(key, () =>
    AsyncStorage.setItem(key, JSON.stringify(draft)),
  );
};

export const loadDraft = async (
  userId: string,
  plannedSessionId: string,
): Promise<SessionDraft | null> => {
  const scopedKey = keyFor(userId, plannedSessionId);
  return withKeyQueue(scopedKey, async () => {
    const scoped = parseDraft(await AsyncStorage.getItem(scopedKey));
    if (scoped?.plannedSessionId === plannedSessionId) return scoped;

    // Migração transparente do formato antigo (uma chave por usuário). Só move a
    // entrada se ela for exatamente desta sessão; abrir B nunca consome/apaga A.
    const legacyKey = legacyKeyFor(userId);
    const legacy = parseDraft(await AsyncStorage.getItem(legacyKey));
    if (legacy?.plannedSessionId !== plannedSessionId) return null;
    await AsyncStorage.setItem(scopedKey, JSON.stringify(legacy));
    try {
      await AsyncStorage.removeItem(legacyKey);
    } catch {
      // A cópia session-scoped já foi confirmada. Uma sobra legada é inofensiva.
    }
    return legacy;
  });
};

export const clearDraft = async (
  userId: string,
  plannedSessionId: string,
  expectedSessionLogId?: string | null,
): Promise<void> => {
  const scopedKey = keyFor(userId, plannedSessionId);
  await withKeyQueue(scopedKey, async () => {
    const scoped = parseDraft(await AsyncStorage.getItem(scopedKey));
    const matchesExpected =
      expectedSessionLogId === undefined ||
      scoped?.sessionLogId === expectedSessionLogId;
    if (matchesExpected) await AsyncStorage.removeItem(scopedKey);

    // Compatibilidade durante a migração: nunca apaga o legado de outra sessão ou
    // de uma nova execução ABA da mesma sessão planejada.
    const legacyKey = legacyKeyFor(userId);
    const legacy = parseDraft(await AsyncStorage.getItem(legacyKey));
    if (
      legacy?.plannedSessionId === plannedSessionId &&
      (expectedSessionLogId === undefined ||
        legacy.sessionLogId === expectedSessionLogId)
    ) {
      await AsyncStorage.removeItem(legacyKey);
    }
  });
};
