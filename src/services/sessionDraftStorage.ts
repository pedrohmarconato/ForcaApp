// src/services/sessionDraftStorage.ts
// Fase 4 — Rascunho da sessão ATIVA persistido no aparelho, por usuário, para
// RETOMAR uma sessão interrompida (fechar o app no meio e reabrir sem perder as
// séries já registradas). Não é uma segunda fonte de verdade do servidor: é só
// um cache local do que está em andamento. Reps/cargas não são segredo, então
// AsyncStorage (sem os limites de tamanho do SecureStore) é suficiente.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { coerceDraftNumerics, type SessionDraft } from '../engine/sessionModel';

const keyFor = (userId: string): string => `@active_session_draft_${userId}`;

export const saveDraft = async (draft: SessionDraft): Promise<void> => {
  await AsyncStorage.setItem(keyFor(draft.userId), JSON.stringify(draft));
};

export const loadDraft = async (userId: string): Promise<SessionDraft | null> => {
  const raw = await AsyncStorage.getItem(keyFor(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Só aceita o formato conhecido; rascunho de versão antiga/corrompida é ignorado.
    // Mesmo dentro do formato v1, COAGE todo numérico (F8): um rascunho gravado antes
    // da coerção pode ter "40" em vez de 40 e contaminar o stepper ("402.5"/NaN).
    if (parsed && parsed.version === 1 && typeof parsed.plannedSessionId === 'string') {
      return coerceDraftNumerics(parsed as SessionDraft);
    }
    return null;
  } catch {
    return null;
  }
};

export const clearDraft = async (userId: string): Promise<void> => {
  await AsyncStorage.removeItem(keyFor(userId));
};
