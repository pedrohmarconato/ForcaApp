// src/engine/config.ts
// Fase 5 — Números do motor de adaptação intra-sessão, centralizados e tunáveis.
//
// ⚠️ TODOS os percentuais/tetos abaixo são PADRÕES A VALIDAR por um profissional de
// educação física. A tabela exata (§4.2) da especificação do dono ainda não está no
// repositório; estes valores implementam a ESSÊNCIA acordada no plano de fases
// (~3%/rep de desvio, teto 5–12%, arredondar ao incremento da carga, tiers de déficit).
// Mudar aqui NÃO exige mexer na lógica de `intraSessionAdaptation.ts`.

export type AdaptConfig = {
  /** Fração de mudança de carga por rep de desvio fora da faixa. */
  loadPctPerRep: number;
  /** Teto da mudança de carga por série (fração). Nunca muda mais que isso de uma vez. */
  maxLoadPct: number;
  /** Piso: se a mudança (após arredondar ao incremento) ficar abaixo disso, vira "manter". */
  minLoadPct: number;
  /** Reps abaixo do mínimo que caracterizam cada severidade de déficit/superávit. */
  deficitTiers: { moderado: number; grande: number };
  /** RIR mínimo para recomendar AUMENTO num superávit (RIR baixo = foi à falha → não sobe). */
  minRirForIncrease: number;
  /** Passo de reps sugerido quando o exercício é de peso corporal (não tem carga). */
  bodyweightRepStep: number;
  /** Máximo de opções apresentadas ao aluno (bottom sheet). */
  maxOptions: number;
};

export const ADAPT_CONFIG: AdaptConfig = {
  loadPctPerRep: 0.03, // ~3% por rep de desvio — PADRÃO A VALIDAR
  maxLoadPct: 0.12, // nunca muda mais que 12% de uma vez — PADRÃO A VALIDAR
  minLoadPct: 0.05, // < 5% após arredondar → não vale mexer — PADRÃO A VALIDAR
  deficitTiers: { moderado: 2, grande: 4 }, // 1 rep = leve; 2–3 = moderado; ≥4 = grande
  minRirForIncrease: 1, // superávit com RIR 0 (à falha) → não sobe carga
  bodyweightRepStep: 2, // peso corporal: sugere ±2 reps no alvo
  maxOptions: 3,
};
