import { NativeModule, requireNativeModule } from 'expo';

import type { LiveActivityContentState } from '../../src/engine/liveActivityContentState';

export type { LiveActivityContentState } from '../../src/engine/liveActivityContentState';

export type LiveActivityIntentActionEvent =
  | { id: string; kind: 'completeSet' }
  | { id: string; kind: 'skipRest' }
  | { id: string; kind: 'adjustRest'; deltaSeconds: number };

/**
 * Entrada drenada da fila durável do App Group (Fase 16 Plano 16-02) —
 * espelho JS de `QueuedIntentActionRecord` (Swift). `kind` é união de
 * string literal (nunca `any`); `deltaSeconds`/`sessionLogId` só têm valor
 * quando o Intent original os gravou. `id` (Fase 16 Plano 16-05) é o mesmo
 * identificador usado no evento `onIntentAction` in-process — permite
 * remoção seletiva via `ackIntentAction`.
 */
export type QueuedLiveActivityIntent = {
  kind: 'completeSet' | 'skipRest' | 'adjustRest';
  deltaSeconds: number | null;
  sessionLogId: string | null;
  queuedAt: string;
  id: string;
};

type LiveActivityModuleEvents = {
  onIntentAction: (event: LiveActivityIntentActionEvent) => void;
};

declare class LiveActivityModuleType extends NativeModule<LiveActivityModuleEvents> {
  startActivity(state: LiveActivityContentState, sessionLogId: string): Promise<boolean>;
  updateActivity(state: LiveActivityContentState): Promise<boolean>;
  endActivity(
    dismissalPolicy: 'immediate' | 'afterDate',
    afterSeconds?: number,
  ): Promise<boolean>;
  isActivityRunning(): Promise<boolean>;
  reconcileOrphans(stillActiveSessionLogId: string | null): Promise<boolean>;
  drainIntentQueue(): Promise<QueuedLiveActivityIntent[]>;
  ackIntentAction(id: string): Promise<void>;
}

const LiveActivityModule = requireNativeModule<LiveActivityModuleType>('LiveActivityModule');

export const startLiveActivity = (
  state: LiveActivityContentState,
  sessionLogId: string,
): Promise<boolean> => LiveActivityModule.startActivity(state, sessionLogId);

export const updateLiveActivity = (
  state: LiveActivityContentState,
): Promise<boolean> => LiveActivityModule.updateActivity(state);

export const endLiveActivity = (
  dismissalPolicy: 'immediate' | 'afterDate',
  afterSeconds?: number,
): Promise<boolean> => LiveActivityModule.endActivity(dismissalPolicy, afterSeconds);

export const isLiveActivityRunning = (): Promise<boolean> =>
  LiveActivityModule.isActivityRunning();

export const reconcileLiveActivityOrphans = (
  stillActiveSessionLogId: string | null,
): Promise<boolean> => LiveActivityModule.reconcileOrphans(stillActiveSessionLogId);

export const drainQueuedLiveActivityIntents = (): Promise<QueuedLiveActivityIntent[]> =>
  LiveActivityModule.drainIntentQueue();

/**
 * Confirma que uma entrega in-process foi aplicada com sucesso, removendo
 * SELETIVAMENTE essa entrada da fila durável do App Group (Fase 16 Plano
 * 16-05) — nunca a fila inteira. Chamado por `liveActivityIntentBridge.ts`
 * logo após despachar a ação contra um alvo resolvido.
 */
export const ackQueuedLiveActivityIntent = (id: string): Promise<void> =>
  LiveActivityModule.ackIntentAction(id);

export const subscribeLiveActivityIntentAction = (
  listener: (event: LiveActivityIntentActionEvent) => void,
): (() => void) => {
  const subscription = LiveActivityModule.addListener('onIntentAction', listener);
  return () => subscription.remove();
};
