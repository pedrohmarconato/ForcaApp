// src/engine/intraSessionAdaptation.ts
// Fase 5 — Motor de adaptação intra-sessão POR REGRAS. Puro (sem I/O).
//
// Dado o resultado de uma série concluída, RECOMENDA um ajuste — o aluno decide.
// Princípios (herdados da Fase 4):
//  - NUNCA aplica sozinho: devolve opções (recomendada em 1º) para a tela confirmar;
//    a recusa é sempre uma opção ("manter") e será registrada em set_logs.adaptation.
//  - NUNCA inventa: sem carga conhecida num exercício COM carga, recomenda "manter".
//  - Guardrails vencem a tabela: lesão não sobe carga; peso corporal mexe reps, não carga.

import type { Outcome, SessionDraft } from './sessionModel';
import { computeOutcome } from './sessionModel';
import { ADAPT_CONFIG, type AdaptConfig } from './config';
import { adjustsRepsNotLoad, forbidsLoadIncrease, type GuardrailContext } from './guardrails';

export type DeviationTier = 'none' | 'leve' | 'moderado' | 'grande';

export type Adjustment =
  | { kind: 'keep'; label: string; reason: string }
  | {
      kind: 'load';
      direction: 'increase' | 'decrease';
      fromKg: number;
      toKg: number;
      deltaKg: number;
      pct: number;
      label: string;
      reason: string;
    }
  | {
      kind: 'reps';
      direction: 'increase' | 'decrease';
      deltaReps: number;
      label: string;
      reason: string;
    };

export type Recommendation = {
  outcome: Outcome;
  /** Magnitude do desvio fora da faixa, em reps (>= 0). */
  deviationReps: number;
  tier: DeviationTier;
  /** Ação recomendada (também é o 1º item de `options`). */
  recommended: Adjustment;
  /** Opções para o aluno; recomendada em 1º; no máx. `config.maxOptions`. */
  options: Adjustment[];
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Arredonda um valor ao múltiplo do incremento mais próximo (nunca negativo). */
export const roundToIncrement = (value: number, increment: number): number => {
  if (!Number.isFinite(increment) || increment <= 0) return round2(Math.max(0, value));
  return round2(Math.max(0, Math.round(value / increment) * increment));
};

export type EvaluatedSet = {
  outcome: Outcome;
  actualReps: number;
  targetRepsMin: number;
  targetRepsMax: number;
  /** 0 se on_target; senão a distância (em reps) para fora da faixa. */
  deviationReps: number;
};

/** Avalia uma série concluída contra a faixa-alvo de repetições. */
export const evaluateSet = (params: {
  actualReps: number;
  targetRepsMin: number;
  targetRepsMax: number;
}): EvaluatedSet => {
  const { actualReps, targetRepsMin, targetRepsMax } = params;
  const outcome = computeOutcome(actualReps, targetRepsMin, targetRepsMax);
  let deviationReps = 0;
  if (outcome === 'under') deviationReps = targetRepsMin - actualReps;
  else if (outcome === 'over') deviationReps = actualReps - targetRepsMax;
  return { outcome, actualReps, targetRepsMin, targetRepsMax, deviationReps };
};

const tierFor = (deviationReps: number, cfg: AdaptConfig): DeviationTier => {
  if (deviationReps <= 0) return 'none';
  if (deviationReps >= cfg.deficitTiers.grande) return 'grande';
  if (deviationReps >= cfg.deficitTiers.moderado) return 'moderado';
  return 'leve';
};

const keep = (reason: string): Adjustment => ({
  kind: 'keep',
  label: 'Manter a carga',
  reason,
});

const loadAdjustment = (
  direction: 'increase' | 'decrease',
  fromKg: number,
  toKg: number,
  pct: number,
): Adjustment => ({
  kind: 'load',
  direction,
  fromKg: round2(fromKg),
  toKg: round2(toKg),
  deltaKg: round2(toKg - fromKg),
  pct: round2(pct),
  label: `${direction === 'increase' ? 'Aumentar' : 'Reduzir'} para ${round2(toKg)} kg`,
  reason:
    direction === 'increase'
      ? 'Você superou a faixa-alvo: subir a carga mantém o estímulo.'
      : 'Você ficou abaixo da faixa-alvo: reduzir a carga recupera a execução na faixa.',
});

const sameAdjustment = (a: Adjustment, b: Adjustment): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'load' && b.kind === 'load') {
    return a.direction === b.direction && a.toKg === b.toKg;
  }
  if (a.kind === 'reps' && b.kind === 'reps') return a.deltaReps === b.deltaReps;
  return true; // dois 'keep'
};

/**
 * Recomenda um ajuste para a PRÓXIMA série (ou anotação p/ a próxima sessão, se for a
 * última). Sempre devolve `options` com a recomendada em 1º e "manter" disponível para
 * a recusa. Nunca aplica nada — a tela confirma e grava a escolha em set_logs.adaptation.
 */
export const recommendByRules = (params: {
  evaluated: EvaluatedSet;
  currentLoadKg: number | null;
  incrementKg: number;
  ctx: GuardrailContext;
  actualRir?: number | null;
  config?: AdaptConfig;
}): Recommendation => {
  const cfg = params.config ?? ADAPT_CONFIG;
  const { evaluated, currentLoadKg, incrementKg, ctx } = params;
  const { outcome, deviationReps } = evaluated;
  const tier = tierFor(deviationReps, cfg);

  const build = (recommended: Adjustment, extra: Adjustment[] = []): Recommendation => {
    const options: Adjustment[] = [recommended];
    for (const a of extra) {
      if (options.length >= cfg.maxOptions) break;
      if (!options.some((o) => sameAdjustment(o, a))) options.push(a);
    }
    // "Manter" é sempre uma saída (recusa registrada), se ainda couber.
    if (
      recommended.kind !== 'keep' &&
      options.length < cfg.maxOptions &&
      !options.some((o) => o.kind === 'keep')
    ) {
      options.push(keep('Recusar o ajuste e manter a carga atual.'));
    }
    return { outcome, deviationReps, tier, recommended, options };
  };

  // 1. Dentro da faixa → manter.
  if (outcome === 'on_target') {
    return build(keep('Você ficou dentro da faixa-alvo. Mantenha a carga.'));
  }

  // 2. Guardrail: lesão nunca escala. Num superávit, não sobe nada.
  if (outcome === 'over' && forbidsLoadIncrease(ctx)) {
    return build(keep('Lesão declarada neste exercício: não aumentamos a intensidade.'));
  }

  // 3. Guardrail: peso corporal ajusta REPS, não carga.
  if (adjustsRepsNotLoad(ctx)) {
    const direction = outcome === 'over' ? 'increase' : 'decrease';
    const deltaReps = direction === 'increase' ? cfg.bodyweightRepStep : -cfg.bodyweightRepStep;
    return build({
      kind: 'reps',
      direction,
      deltaReps,
      label:
        direction === 'increase'
          ? `Aumentar a meta em ${cfg.bodyweightRepStep} reps`
          : `Reduzir a meta em ${cfg.bodyweightRepStep} reps`,
      reason: 'Exercício de peso corporal: ajusta-se a meta de repetições, não a carga.',
    });
  }

  // 4. Sem carga conhecida num exercício COM carga → não dá para calcular. Manter.
  if (currentLoadKg == null || currentLoadKg <= 0) {
    return build(
      keep('Sem carga registrada ainda — informe a carga; nada é sugerido no escuro.'),
    );
  }

  const pct = Math.min(cfg.loadPctPerRep * deviationReps, cfg.maxLoadPct);

  // 5. Superávit → subir carga (a menos que RIR baixo indique que foi à falha).
  if (outcome === 'over') {
    const rir = params.actualRir;
    if (rir != null && rir < cfg.minRirForIncrease) {
      return build(
        keep(`Você passou do alvo, mas com RIR ${rir} (perto da falha): mantenha a carga desta vez.`),
      );
    }
    const toKg = roundToIncrement(currentLoadKg * (1 + pct), incrementKg);
    if (toKg <= currentLoadKg || toKg - currentLoadKg < currentLoadKg * cfg.minLoadPct) {
      return build(keep('O ajuste ficaria abaixo do incremento mínimo — mantenha a carga.'));
    }
    const rec = loadAdjustment('increase', currentLoadKg, toKg, pct);
    const oneStep = roundToIncrement(currentLoadKg + incrementKg, incrementKg);
    const alt =
      oneStep > currentLoadKg && oneStep !== toKg
        ? [loadAdjustment('increase', currentLoadKg, oneStep, (oneStep - currentLoadKg) / currentLoadKg)]
        : [];
    return build(rec, alt);
  }

  // 6. Déficit → baixar carga.
  const toKg = roundToIncrement(currentLoadKg * (1 - pct), incrementKg);
  if (toKg >= currentLoadKg || currentLoadKg - toKg < currentLoadKg * cfg.minLoadPct) {
    return build(keep('O ajuste ficaria abaixo do incremento mínimo — mantenha a carga.'));
  }
  const rec = loadAdjustment('decrease', currentLoadKg, toKg, pct);
  const oneStep = roundToIncrement(currentLoadKg - incrementKg, incrementKg);
  const alt =
    oneStep < currentLoadKg && oneStep >= 0 && oneStep !== toKg
      ? [loadAdjustment('decrease', currentLoadKg, oneStep, (currentLoadKg - oneStep) / currentLoadKg)]
      : [];
  return build(rec, alt);
};

/**
 * Aplica a decisão do aluno ao rascunho (PURO, sem I/O):
 *  - registra a escolha na série concluída (`set.adaptation`);
 *  - aplica o efeito à PRÓXIMA série do mesmo exercício:
 *      • load  → define o `targetLoadKg` da próxima série (a sugestão passa a refletir o novo peso);
 *      • reps  → desloca a faixa-alvo (min/max) da próxima série, com piso de 1 rep;
 *      • keep  → nada muda no alvo (só registra a recusa).
 *  - última série (sem próxima) → só registra a escolha (a "anotação p/ a próxima sessão"
 *    é o próprio registro em set_logs.adaptation; redistribuir entre sessões é a Fase 6).
 * Nunca aplica sozinho: só é chamado após a confirmação do aluno.
 */
export const applyAdjustmentToNextSet = (
  draft: SessionDraft,
  exerciseId: string,
  setOrder: number,
  adjustment: Adjustment,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) => {
    if (ex.exerciseId !== exerciseId) return ex;
    // A "próxima série" é a de menor setOrder acima da atual (robusto a ordens não contíguas).
    const nextOrder = ex.sets
      .map((s) => s.setOrder)
      .filter((o) => o > setOrder)
      .sort((a, b) => a - b)[0];
    return {
      ...ex,
      sets: ex.sets.map((s) => {
        if (s.setOrder === setOrder) return { ...s, adaptation: adjustment };
        if (nextOrder != null && s.setOrder === nextOrder) {
          if (adjustment.kind === 'load') {
            return { ...s, targetLoadKg: adjustment.toKg };
          }
          if (adjustment.kind === 'reps') {
            const min = Math.max(1, s.targetRepsMin + adjustment.deltaReps);
            const max = Math.max(min, s.targetRepsMax + adjustment.deltaReps);
            return { ...s, targetRepsMin: min, targetRepsMax: max };
          }
        }
        return s;
      }),
    };
  }),
});
