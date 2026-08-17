import {
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
      }
      return;
    }
    case 'skipRest': {
      const proxima = findNextPendingSet(draft);
      if (proxima) {
        useActiveSessionStore
          .getState()
          .activateSet(proxima.exercise.exerciseId, proxima.set.setOrder);
      }
      return;
    }
    case 'adjustRest': {
      useActiveSessionStore.getState().adjustRest(event.deltaSeconds);
      return;
    }
  }
};

/** Registra o listener único de intents da tela bloqueada. Devolve o unsubscribe. */
export const registerLiveActivityIntentListener = (): (() => void) =>
  subscribeLiveActivityIntentAction(handleIntentAction);
