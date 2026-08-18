// __mocks__/modules-live-activity.ts
// Fase 16 Plano 16-02: `src/store/activeSessionStore.ts` passou a importar
// `modules/live-activity` diretamente (drainQueuedLiveActivityIntents), o
// que faria QUALQUER teste que importa a store transitivamente disparar
// `requireNativeModule('LiveActivityModule')` do jest-expo — inexistente em
// ambiente de teste. Mapeado via `moduleNameMapper` (package.json) para
// todo teste que NÃO mocka `modules/live-activity` explicitamente
// (`liveActivitySync.test.ts`/`liveActivityIntentBridge.test.ts`/
// `liveActivityIntentQueue.test.ts` continuam com seu próprio
// `jest.mock(..., { virtual: true })`, que tem precedência sobre este
// mapeamento). Resolve por padrão a valores neutros: fila sempre vazia,
// nenhuma Live Activity "rodando" — nenhum destes testes exercita o
// comportamento real do módulo nativo.
export const startLiveActivity = jest.fn().mockResolvedValue(false);
export const updateLiveActivity = jest.fn().mockResolvedValue(false);
export const endLiveActivity = jest.fn().mockResolvedValue(false);
export const isLiveActivityRunning = jest.fn().mockResolvedValue(false);
export const reconcileLiveActivityOrphans = jest.fn().mockResolvedValue(false);
export const drainQueuedLiveActivityIntents = jest.fn().mockResolvedValue([]);
export const ackQueuedLiveActivityIntent = jest.fn().mockResolvedValue(undefined);
export const subscribeLiveActivityIntentAction = jest.fn(() => () => {});
