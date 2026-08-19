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
 *
 * CR-01 (review 2026-08-19): guarda de CAS por sessionLogId no caminho
 * quente, espelhando a guarda `pertenceAoDraft` do loop de reconciliação —
 * o evento carrega o id da sessão da Activity de onde veio o toque
 * (`Activity.activities.first?.attributes.sessionLogId`, enviado pelos
 * cinco intents em `perform()`); quando presente e DIVERGENTE do draft
 * atual, o evento é recusado sem aplicar e sem ack, e a entrada dura
 * continua na fila para o CAS da reconciliação decidir (descartar, se
 * provar pertencer a outra sessão). Ausência do campo (build antigo ou
 * atributo irresolvível, enviado como "") mantém o comportamento anterior:
 * sem prova de divergência, o toque não é bloqueado.
 */
const handleIntentAction = async (event: LiveActivityIntentActionEvent): Promise<void> => {
  const draft = useActiveSessionStore.getState().draft;
  if (!draft) return;

  switch (event.kind) {
    case 'completeSet': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        // WR-01 (review 2026-08-19): o ack é CONDICIONAL ao resultado —
        // uma entrada reprovada por canCompleteSet() (reps/carga ausentes)
        // ou pela trava de reentrância inFlight NUNCA é acked aqui, ficando
        // na fila durável para a próxima reconciliação (mesma invariante
        // D1 do cold path — activeSessionStore.ts só confirma entradas
        // aplicadas). Antes, o ack incondicional destruía o toque. Rejeição
        // (I/O local) tem o mesmo tratamento: sem ack, entrada preservada,
        // e sem unhandled rejection no listener nativo.
        try {
          const ok = await useActiveSessionStore
            .getState()
            .completeSet(alvo.exercise.exerciseId, alvo.set.setOrder);
          if (ok) void ackQueuedLiveActivityIntent(event.id);
        } catch (error) {
          console.warn(
            `[liveActivity] completeSet do intent ${event.id} falhou (mantido na fila):`,
            error,
          );
        }
      }
      return;
    }
    case 'skipRest': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
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
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
      useActiveSessionStore.getState().adjustRest(event.deltaSeconds);
      void ackQueuedLiveActivityIntent(event.id);
      return;
    }
    case 'adjustLoad': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
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
    case 'adjustReps': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        // Mesmo padrão de adjustLoad: só o SINAL do delta importa, stepReps()
        // aplica o passo fixo de 1 (reps não têm incremento configurável).
        useActiveSessionStore
          .getState()
          .stepReps(alvo.exercise.exerciseId, alvo.set.setOrder, event.deltaReps > 0 ? 1 : -1);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
  }
};

/** Registra o listener único de intents da tela bloqueada. Devolve o unsubscribe. */
export const registerLiveActivityIntentListener = (): (() => void) =>
  subscribeLiveActivityIntentAction(handleIntentAction);
