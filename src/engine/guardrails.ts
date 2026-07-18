// src/engine/guardrails.ts
// Fase 5 — Invariantes de segurança que se SOBREPÕEM a qualquer recomendação de regra.
// Puros, sem I/O. Testados diretamente e aplicados dentro de `recommendByRules`.
//
// Regra de ouro do motor: o aluno decide, mas o motor nunca RECOMENDA algo inseguro.
// Estes guardrails garantem que, aconteça o que acontecer na tabela de regras, duas
// coisas jamais sejam sugeridas:
//   1. subir carga num exercício com lesão declarada;
//   2. mexer na carga de um exercício de peso corporal (ajusta-se reps, não carga).

export type GuardrailContext = {
  /** Exercício sem carga externa (peso do corpo). */
  isBodyweight: boolean;
  /** Lesão/dor declarada neste exercício. */
  injury: boolean;
};

/** Lesão declarada: NUNCA aumentar a carga (pode manter ou reduzir). */
export const forbidsLoadIncrease = (ctx: GuardrailContext): boolean => ctx.injury;

/** Peso corporal: não há carga externa para ajustar — o alvo mexido é reps. */
export const adjustsRepsNotLoad = (ctx: GuardrailContext): boolean => ctx.isBodyweight;
