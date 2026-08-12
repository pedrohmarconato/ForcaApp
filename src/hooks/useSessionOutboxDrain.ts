// src/hooks/useSessionOutboxDrain.ts
// Fase 4 (REQ-07) — gatilho de drenagem da fila de execução no retorno ao
// primeiro plano (D-03) e na montagem do app (D-10: a fila é do usuário, não
// da tela — drena mesmo com o aluno fora de ActiveSessionScreen). Molde de
// useDiaLocal.ts: mesmo padrão de AppState, sem dependência nativa nova
// (nenhum @react-native-community/netinfo nem expo-network).

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { drainAll } from '../services/sessionOutboxDrain';
import { useActiveSessionStore } from '../store/activeSessionStore';

export const useSessionOutboxDrain = (userId: string | null): void => {
  useEffect(() => {
    if (!userId) return;

    const callbacks = {
      onSessionClosed: (sessionLogId: string) =>
        useActiveSessionStore.getState().reconcileRemoteSessionClosed(sessionLogId),
      onSummaryChanged: (pendingCount: number, quarantineCount: number) =>
        useActiveSessionStore.getState().setOutboxSummary(pendingCount, quarantineCount),
    };

    // Drena ao montar (cobre reabertura do app com fila pendente, D-10/critério #3).
    void drainAll(userId, callbacks);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainAll(userId, callbacks);
    });

    return () => sub.remove();
  }, [userId]);
};
