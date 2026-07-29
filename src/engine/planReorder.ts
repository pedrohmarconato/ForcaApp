// src/engine/planReorder.ts
// Lógica pura da reordenação (sem RN, sem rede) — testável isolada.

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
