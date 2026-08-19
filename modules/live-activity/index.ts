import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { LiveActivityContentState } from '../../src/engine/liveActivityContentState';

export type { LiveActivityContentState } from '../../src/engine/liveActivityContentState';

export type LiveActivityIntentActionEvent =
  | { id: string; kind: 'completeSet'; sessionLogId?: string }
  | { id: string; kind: 'skipRest'; sessionLogId?: string }
  | { id: string; kind: 'adjustRest'; deltaSeconds: number; sessionLogId?: string }
  | { id: string; kind: 'adjustLoad'; deltaLoadKg: number; sessionLogId?: string }
  | { id: string; kind: 'adjustReps'; deltaReps: number; sessionLogId?: string };

/**
 * Entrada drenada da fila durável do App Group (Fase 16 Plano 16-02) —
 * espelho JS de `QueuedIntentActionRecord` (Swift). `kind` é união de
 * string literal (nunca `any`); `deltaSeconds`/`sessionLogId` só têm valor
 * quando o Intent original os gravou. `id` (Fase 16 Plano 16-05) é o mesmo
 * identificador usado no evento `onIntentAction` in-process — permite
 * remoção seletiva via `ackIntentAction`.
 */
export type QueuedLiveActivityIntent = {
  kind: 'completeSet' | 'skipRest' | 'adjustRest' | 'adjustLoad' | 'adjustReps';
  deltaSeconds: number | null;
  /** Mirror do Swift `deltaValue: Double?` — serve `.adjustLoad` e `.adjustReps`. */
  deltaValue: number | null;
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
  peekIntentQueue(): Promise<QueuedLiveActivityIntent[]>;
  ackIntentAction(id: string): Promise<void>;
}

/**
 * Live Activities é uma API exclusiva da Apple (ActivityKit) —
 * `expo-module.config.json` já limita a plataforma a `apple`. Fora do ramo
 * iOS, `LiveActivityModule` permanece `null` e o bootstrap NUNCA lança:
 * `requireOptionalNativeModule` só é avaliado quando `Platform.OS ===
 * 'ios'`, então Android/web nunca tocam sequer o `requireNativeModule`
 * obrigatório que lançava aqui antes (15-VERIFICATION.md gap 4 / CR-03 — bug
 * confirmado em produção: `npx expo start --web` crashava no mount com
 * "Cannot find native module 'LiveActivityModule'"). No iOS, se o módulo
 * não estiver instalado (build errado, Simulator sem entitlement), o mesmo
 * `null` alimenta o retorno `false` de cada wrapper — exatamente o sinal
 * que `liveActivitySync.ts` já trata como falha não bloqueante (banner
 * D-12). Quando presente, cada wrapper delega ao módulo real sem qualquer
 * mudança de comportamento observável no iOS.
 */
const LiveActivityModule: LiveActivityModuleType | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<LiveActivityModuleType>('LiveActivityModule')
    : null;

export const startLiveActivity = (
  state: LiveActivityContentState,
  sessionLogId: string,
): Promise<boolean> =>
  LiveActivityModule
    ? LiveActivityModule.startActivity(state, sessionLogId)
    : Promise.resolve(false);

export const updateLiveActivity = (
  state: LiveActivityContentState,
): Promise<boolean> =>
  LiveActivityModule ? LiveActivityModule.updateActivity(state) : Promise.resolve(false);

export const endLiveActivity = (
  dismissalPolicy: 'immediate' | 'afterDate',
  afterSeconds?: number,
): Promise<boolean> =>
  LiveActivityModule
    ? LiveActivityModule.endActivity(dismissalPolicy, afterSeconds)
    : Promise.resolve(false);

export const isLiveActivityRunning = (): Promise<boolean> =>
  LiveActivityModule ? LiveActivityModule.isActivityRunning() : Promise.resolve(false);

export const reconcileLiveActivityOrphans = (
  stillActiveSessionLogId: string | null,
): Promise<boolean> =>
  LiveActivityModule
    ? LiveActivityModule.reconcileOrphans(stillActiveSessionLogId)
    : Promise.resolve(false);

/**
 * Lê a fila durável do App Group SEM removê-la (Fase 16 Plano 16-07 / D1) —
 * cada entrada só é confirmada/removida individualmente via
 * `ackQueuedLiveActivityIntent` DEPOIS de saber o resultado real da
 * aplicação (aplicada com sucesso, ou definitivamente descartada por CAS).
 * O antigo primitivo de leitura-e-remoção-na-mesma-chamada foi removido por
 * destruir entradas reprovadas por validação antes dela sequer rodar. Fora
 * do iOS (ou iOS sem módulo instalado), resolve fila vazia — nada a drenar.
 */
export const peekQueuedLiveActivityIntents = (): Promise<QueuedLiveActivityIntent[]> =>
  LiveActivityModule ? LiveActivityModule.peekIntentQueue() : Promise.resolve([]);

/**
 * Confirma que uma entrega in-process foi aplicada com sucesso, removendo
 * SELETIVAMENTE essa entrada da fila durável do App Group (Fase 16 Plano
 * 16-05) — nunca a fila inteira. Chamado por `liveActivityIntentBridge.ts`
 * logo após despachar a ação contra um alvo resolvido.
 */
export const ackQueuedLiveActivityIntent = (id: string): Promise<void> =>
  LiveActivityModule ? LiveActivityModule.ackIntentAction(id) : Promise.resolve(undefined);

export const subscribeLiveActivityIntentAction = (
  listener: (event: LiveActivityIntentActionEvent) => void,
): (() => void) => {
  if (!LiveActivityModule) return () => {};
  const subscription = LiveActivityModule.addListener('onIntentAction', listener);
  return () => subscription.remove();
};
