import {
  ackQueuedLiveActivityIntent,
  subscribeLiveActivityIntentAction,
  type LiveActivityIntentActionEvent,
} from '../../modules/live-activity';
import { findActiveSet, findNextPendingSet } from '../engine/sessionModel';
import { useActiveSessionStore } from '../store/activeSessionStore';

/**
 * Único despacho evento→ação da store para os toques da tela bloqueada
 * (Fase 16, CMD-01/CMD-02). Nenhuma lógica de domínio nova: cada `case`
 * apenas resolve a série alvo (`findActiveSet`/`findNextPendingSet`, os
 * mesmos helpers do resto do app) e chama a ação já existente em
 * `activeSessionStore.ts` — o MESMO caminho `completeSet()`/`activateSet()`/
 * `adjustRest()` que o app já usa. A Live Activity permanece espelho, nunca
 * fonte de verdade.
 */
const handleIntentAction = (event: LiveActivityIntentActionEvent): void => {
  const draft = useActiveSessionStore.getState().draft;
  if (!draft) return;

  switch (event.kind) {
    case 'completeSet': {
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        void useActiveSessionStore
          .getState()
          .completeSet(alvo.exercise.exerciseId, alvo.set.setOrder);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
    case 'skipRest': {
      const proxima = findNextPendingSet(draft);
      if (proxima) {
        useActiveSessionStore
          .getState()
          .activateSet(proxima.exercise.exerciseId, proxima.set.setOrder);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
    case 'adjustRest': {
      useActiveSessionStore.getState().adjustRest(event.deltaSeconds);
      void ackQueuedLiveActivityIntent(event.id);
      return;
    }
    case 'adjustLoad': {
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        // O widget sempre envia ±loadIncrementKg como delta, mas stepLoad()
        // já reaplica o incremento REAL do exercício — só o SINAL do delta
        // recebido importa aqui, evitando drift se os dois discordarem.
        useActiveSessionStore
          .getState()
          .stepLoad(alvo.exercise.exerciseId, alvo.set.setOrder, event.deltaLoadKg > 0 ? 1 : -1);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
  }
};

/** Registra o listener único de intents da tela bloqueada. Devolve o unsubscribe. */
export const registerLiveActivityIntentListener = (): (() => void) =>
  subscribeLiveActivityIntentAction(handleIntentAction);
