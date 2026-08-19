/**
 * WR-04 (review 2026-08-19): registro de ids de intents JÁ aplicados pelo
 * caminho quente (`liveActivityIntentBridge.ts`), compartilhado com o loop
 * de reconciliação de cold-launch (`activeSessionStore.reconcileLiveActivityIntents`).
 *
 * O toque na Lock Screen gera UMA entrada durável (mesmo `id` UUID) e o
 * evento in-process `onIntentAction` com o MESMO id. No boot os dois
 * caminhos processam em janelas sobrepostas: o bridge (listener já
 * registrado em App.tsx) aplica o toque e faz o ack, enquanto o loop usa um
 * snapshot da fila lido ANTES do ack — sem deduplicação, o loop reaplicaria
 * a mesma entrada sobre o draft já atualizado (um toque de "Pular
 * descanso", dois descansos pulados: o bridge ativa N+1 e o loop resolve
 * N+2 no snapshot fresco). O bridge marca o id logo após aplicar; o loop
 * salta entradas marcadas (o ack já foi feito pelo bridge).
 *
 * Sem dependências de propósito — módulo puro para não criar ciclo de
 * import entre bridge (importa a store) e store (importaria o bridge). O
 * Set é por-processo: ids são UUIDs gerados uma vez por toque, nunca
 * reutilizados; um processo novo (reabrir o app) começa vazio e a fila
 * durável já não contém entradas ackadas.
 */
const deliveredHotIds = new Set<string>();

/** Marca um id como já entregue e aplicado pelo caminho quente. */
export const markHotIntentDelivered = (id: string): void => {
  deliveredHotIds.add(id);
};

/** O caminho quente já aplicou este id neste processo? */
export const wasHotIntentDelivered = (id: string): boolean =>
  deliveredHotIds.has(id);

/** Apenas para testes — limpa o registro entre casos. */
export const resetHotIntentDelivered = (): void => {
  deliveredHotIds.clear();
};
