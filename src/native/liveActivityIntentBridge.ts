import {
  ackQueuedLiveActivityIntent,
  subscribeLiveActivityIntentAction,
  type LiveActivityIntentActionEvent,
} from '../../modules/live-activity';
import { findActiveSet, findNextPendingSet } from '../engine/sessionModel';
import { useActiveSessionStore } from '../store/activeSessionStore';
import {
  markHotIntentDelivered,
  wasHotIntentDelivered,
} from './intentDeliveryRegistry';

/**
 * Guarda contra o campo de delta ausente/inválido no evento quente
 * `onIntentAction` — o bug confirmado em `AdjustRepsIntent.swift:45`,
 * `AdjustLoadIntent.swift:44` e `AdjustRestIntent.swift:42` (evento quente
 * omitia o campo; só o enqueue da fila durável o carregava). `Number
 * .isFinite` recusa `undefined`, `null`, `NaN` e qualquer não-número sem
 * coagir — nenhum palpite (jamais `-1` por padrão) é aplicado quando o
 * campo não é um número finito de verdade.
 */
const isFiniteDelta = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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

  // WR-04 (review 2026-08-19): dedupe defensivo — este id já foi entregue e
  // aplicado por este mesmo bridge neste processo; uma reentrega (mesmo
  // toque, listener duplicado) não pode aplicar de novo.
  if (wasHotIntentDelivered(event.id)) return;

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
          if (ok) {
            markHotIntentDelivered(event.id);
            void ackQueuedLiveActivityIntent(event.id);
          }
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
        markHotIntentDelivered(event.id);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
    case 'adjustRest': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
      // Mesma guarda de adjustLoad/adjustReps abaixo: sem um deltaSeconds
      // numérico finito, não há nada seguro para aplicar aqui. A entrada
      // correspondente na fila durável (enqueue já grava deltaSeconds
      // certo) NÃO é acked — fica disponível para a reconciliação de
      // cold-launch (`activeSessionStore.reconcileLiveActivityIntents`,
      // case 'adjustRest') aplicar depois com o valor real.
      if (!isFiniteDelta(event.deltaSeconds)) {
        // B (revisão 2026-08-22): console.warn, não logger.warn — logger.ts é
        // dev-gated e suprime em produção; esta guarda precisa deixar rastro
        // em campo quando um toque é ignorado. Mensagem + kind + id só, sem o
        // payload completo do evento (pode carregar ids sensíveis).
        console.warn(
          `[liveActivity] adjustRest do intent ${event.id} ignorado: deltaSeconds ausente/inválido no evento quente — mantido na fila durável`,
        );
        return;
      }
      useActiveSessionStore.getState().adjustRest(event.deltaSeconds);
      markHotIntentDelivered(event.id);
      void ackQueuedLiveActivityIntent(event.id);
      return;
    }
    case 'adjustLoad': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
      // Bug confirmado (AdjustLoadIntent.swift:44, evento quente sem o
      // campo): `event.deltaLoadKg > 0 ? 1 : -1` com `undefined` avalia
      // `undefined > 0` como `false` e SEMPRE decrementava a carga, mesmo em
      // toques de "+". Sem um número finito não aplicamos palpite nenhum —
      // a entrada correspondente na fila durável (enqueue grava o valor
      // certo) não é acked aqui, ficando disponível para a reconciliação de
      // cold-launch aplicar com o deltaValue real.
      if (!isFiniteDelta(event.deltaLoadKg)) {
        // B (revisão 2026-08-22): console.warn — ver comentário em adjustRest.
        console.warn(
          `[liveActivity] adjustLoad do intent ${event.id} ignorado: deltaLoadKg ausente/inválido no evento quente — mantido na fila durável`,
        );
        return;
      }
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        // O widget sempre envia ±loadIncrementKg como delta, mas stepLoad()
        // já reaplica o incremento REAL do exercício — só o SINAL do delta
        // recebido importa aqui, evitando drift se os dois discordarem.
        useActiveSessionStore
          .getState()
          .stepLoad(alvo.exercise.exerciseId, alvo.set.setOrder, event.deltaLoadKg > 0 ? 1 : -1);
        markHotIntentDelivered(event.id);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
    case 'adjustReps': {
      if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;
      // Mesmo bug e mesma guarda de adjustLoad acima (AdjustRepsIntent
      // .swift:45): sem deltaReps numérico finito, nenhum palpite (-1 por
      // padrão) é aplicado — a entrada correspondente na fila durável fica
      // intacta para a reconciliação de cold-launch.
      if (!isFiniteDelta(event.deltaReps)) {
        // B (revisão 2026-08-22): console.warn — ver comentário em adjustRest.
        console.warn(
          `[liveActivity] adjustReps do intent ${event.id} ignorado: deltaReps ausente/inválido no evento quente — mantido na fila durável`,
        );
        return;
      }
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        // Mesmo padrão de adjustLoad: só o SINAL do delta importa, stepReps()
        // aplica o passo fixo de 1 (reps não têm incremento configurável).
        useActiveSessionStore
          .getState()
          .stepReps(alvo.exercise.exerciseId, alvo.set.setOrder, event.deltaReps > 0 ? 1 : -1);
        markHotIntentDelivered(event.id);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
  }
};

/** Registra o listener único de intents da tela bloqueada. Devolve o unsubscribe. */
export const registerLiveActivityIntentListener = (): (() => void) =>
  subscribeLiveActivityIntentAction(handleIntentAction);
