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
  /** RIR a partir do qual o fôlego vira IMPULSO no superávit: cada ponto acima
   *  de (rirBoostMinRir - 1) soma 1 rep ao desvio. Só sobe, nunca desce. */
  rirBoostMinRir: number;
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
  rirBoostMinRir: 2, // fôlego >= 2 impulsiona o superávit (calibrado pelo dono 22/07) — PADRÃO A VALIDAR
  bodyweightRepStep: 2, // peso corporal: sugere ±2 reps no alvo
  maxOptions: 3,
};

// ============================================================
// Fase 6 — Replanejamento semanal por regras (weeklyReplanner.ts)
// ⚠️ TODOS os números abaixo são PADRÕES A VALIDAR por um profissional de
// educação física. As escadas implementam os degraus ~100% / 66% / 45% do plano:
// os limiares são as FRONTEIRAS entre os degraus (0.66 cai no degrau "sem
// acessórios"; 0.45 cai no degrau "só primários").
// ============================================================

export type ReplanConfig = {
  /** Escadas de tempo (razão minutos disponíveis / estimados da sessão). */
  timeLadder: {
    /** Razão a partir da qual a sessão fica INTEIRA (degrau ~100%). */
    fullMinRatio: number;
    /** Razão a partir da qual mantém primários+secundários (degrau ~66%); abaixo, só primários (degrau ~45%). */
    secondaryMinRatio: number;
  };
  /** Tokens (sem acento, minúsculos) que identificam sessão de deload em session_type/título. */
  deloadTokens: string[];
};

export const REPLAN_CONFIG: ReplanConfig = {
  timeLadder: {
    fullMinRatio: 0.85, // ≥85% do tempo → sessão inteira — PADRÃO A VALIDAR
    secondaryMinRatio: 0.55, // 55–85% → corta acessórios; <55% → só primários — PADRÃO A VALIDAR
  },
  deloadTokens: ['deload', 'descarga'], // detecção por texto: o volume semanal da IA não é persistido
};

// ---------------------------------------------------------------
// Check-in pré-treino (humor × tempo) — decisão do dono em 22/07/2026
// ---------------------------------------------------------------

export type MoodConfig = {
  /** Fração da base de minutos que um aluno CANSADO consegue aproveitar.
   *  Alimenta a escada de corte por tempo da Fase 6 (nunca corta primários). */
  tiredCapacityFactor: number;
};

export const MOOD_CONFIG: MoodConfig = {
  tiredCapacityFactor: 0.7, // PADRÃO A VALIDAR — cansado ≈ 70% da capacidade
};

// ---------------------------------------------------------------
// Escada de reencaixe — Nível 4 (adherenceHistory.ts): detecção de falta
// crônica / abandono / agenda desalinhada. ⚠️ PADRÕES A VALIDAR por um
// profissional de educação física, como todos os demais números deste arquivo.
// ---------------------------------------------------------------

export type FrequencyConfig = {
  /** Semanas fechadas mínimas para diagnosticar (abaixo: insuficiente_historico). */
  semanasFechadasMinimas: number;
  /** Teto de taxa por semana: TODAS abaixo disso caracteriza falta crônica. NUNCA média. */
  taxaMaxima: number;
  /** Dado de dia mínimo para concluir desalinhamento de agenda (0 = sem base). */
  deltaMinimoDeDias: number;
  /** Frequência mínima que o plano gerado deve respeitar (proposta futura). */
  frequenciaMinima: number;
  /** Semanas entre propostas de replanejamento (proposta futura, sem persistência ainda). */
  semanasEntrePropostas: number;
};

export const FREQUENCY_CONFIG: FrequencyConfig = {
  semanasFechadasMinimas: 3, // PADRÃO A VALIDAR
  taxaMaxima: 0.7, // PADRÃO A VALIDAR — abaixo de 70% da semana é falta crônica
  deltaMinimoDeDias: 1, // PADRÃO A VALIDAR
  frequenciaMinima: 2, // PADRÃO A VALIDAR — reservado para a tela de proposta
  semanasEntrePropostas: 4, // PADRÃO A VALIDAR — reservado para a tela de proposta
};
