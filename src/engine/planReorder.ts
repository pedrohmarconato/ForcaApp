// src/engine/planReorder.ts
// Lógica pura da reordenação (sem RN, sem rede) — testável isolada.
//
// Reordenar TREINOS é permutar as datas entre as sessões PENDENTES da semana:
// o conjunto de datas (slots) é preservado por construção; sessões fixas
// (completed/skipped/in_progress) nunca são tocadas. Este módulo espelha a
// semântica da RPC reorder_week_sessions (migration 0017) para o preview local.

import type { PlannedSession } from '../services/trainingRepository';

/** Cópia do array com o item movido de `from` para `to`; índices fora do
 *  alcance devolvem o array original intacto (nunca lança). */
export const moveItem = <T>(arr: T[], from: number, to: number): T[] => {
  if (from === to) return arr;
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const copia = arr.slice();
  const [item] = copia.splice(from, 1);
  copia.splice(to, 0, item);
  return copia;
};

/** Mesmo critério do ORDER BY da RPC: data, order_in_week, id — determinístico
 *  mesmo com datas duplicadas (que o pipeline de criação admite). */
const comparaFilaReal = (a: PlannedSession, b: PlannedSession): number => {
  const da = a.scheduled_date ?? '9999-12-31';
  const db = b.scheduled_date ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  if (a.order_in_week !== b.order_in_week) return a.order_in_week - b.order_in_week;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Sessões pendentes da semana na ordem da fila real (ordem dos slots). */
export const pendentesOrdenadas = (semana: PlannedSession[]): PlannedSession[] =>
  semana
    .filter((s) => s.status === 'pending')
    .slice()
    .sort(comparaFilaReal);

/** Datas (slots) das pendentes, em ordem. A permuta só reatribui estas datas. */
export const slotsPendentes = (semana: PlannedSession[]): string[] =>
  pendentesOrdenadas(semana)
    .map((s) => s.scheduled_date)
    .filter((d): d is string => !!d);

/** Reordenável: 2+ pendentes, todas com data (sem data não há slot). */
export const podeReordenarSemana = (semana: PlannedSession[]): boolean => {
  const pendentes = semana.filter((s) => s.status === 'pending');
  return pendentes.length >= 2 && pendentes.every((s) => !!s.scheduled_date);
};

/**
 * Preview da semana com a nova ordem: a pendente na posição i de
 * `orderedPendingIds` recebe o slot i; fixas ficam intactas. Retorna a semana
 * inteira ordenada pela fila prevista — é o que a tela exibe no modo edição
 * (o chip do dia passa a mostrar o dia do slot, consequência real da permuta).
 */
export const previewSemana = (
  semana: PlannedSession[],
  orderedPendingIds: string[],
): PlannedSession[] => {
  const slots = slotsPendentes(semana);
  const porId = new Map(semana.map((s) => [s.id, s]));
  const previstas: PlannedSession[] = [];
  orderedPendingIds.forEach((id, i) => {
    const sessao = porId.get(id);
    if (!sessao) return;
    previstas.push({ ...sessao, scheduled_date: slots[i] ?? sessao.scheduled_date });
  });
  const fixas = semana.filter((s) => s.status !== 'pending');
  return [...previstas, ...fixas].sort(comparaFilaReal);
};
