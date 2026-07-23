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
  // `auto: true` = decisão automática de segurança registrada pelo sistema (lesão/piso/
  // RIR/incremento grosso), NÃO uma escolha do aluno. Ausente/false = escolha do aluno.
  | { kind: 'keep'; label: string; reason: string; auto?: boolean }
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
  reason?: string,
): Adjustment => ({
  kind: 'load',
  direction,
  fromKg: round2(fromKg),
  toKg: round2(toKg),
  deltaKg: round2(toKg - fromKg),
  // pct = mudança REAL (após arredondar o kg ao incremento). NÃO arredondar aqui: o campo
  // não é exibido (o rótulo usa o kg) e arredondá-lo reintroduziria a mentira que o review
  // pegou (gravar um pct que não corresponde à mudança de fato).
  pct,
  label: `${direction === 'increase' ? 'Aumentar' : 'Reduzir'} para ${round2(toKg)} kg`,
  reason:
    reason ??
    (direction === 'increase'
      ? 'Você superou a faixa-alvo: subir a carga mantém o estímulo.'
      : 'Você ficou abaixo da faixa-alvo: reduzir a carga recupera a execução na faixa.'),
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
 * Cargas alinhadas ao incremento, na direção dada, cuja mudança REAL (após arredondar)
 * cai dentro de [minLoadPct, maxLoadPct]. É a fonte única das opções de carga: garante que
 * NENHUMA opção estoure o teto nem fique abaixo do piso — o bug era validar o percentual
 * teórico e deixar o arredondamento violar o limite (ex.: 100kg + incremento 20 → +20%).
 */
const loadCandidates = (
  current: number,
  direction: 'increase' | 'decrease',
  increment: number,
  cfg: AdaptConfig,
): { toKg: number; pct: number }[] => {
  const step = Number.isFinite(increment) && increment > 0 ? increment : 2.5;
  const sign = direction === 'increase' ? 1 : -1;
  const out: { toKg: number; pct: number }[] = [];
  // k limitado só como salvaguarda; o teto encerra o laço bem antes na prática.
  for (let k = 1; k <= 1000; k++) {
    const toKg = round2(current + sign * k * step);
    if (toKg < 0) break;
    const pct = Math.abs(toKg - current) / current;
    if (pct > cfg.maxLoadPct + 1e-9) break; // passou do teto → não há mais candidatas
    if (pct + 1e-9 >= cfg.minLoadPct) out.push({ toKg, pct });
    if (sign < 0 && toKg === 0) break;
  }
  return out;
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

  // 5/6. Fora do alvo com carga conhecida → ajustar a carga. Superávit sobe, déficit baixa.
  // RIR baixo num superávit (foi à/perto da falha) → não sobe (guardrail antes de calcular).
  const rir = params.actualRir;
  if (outcome === 'over' && rir != null && rir < cfg.minRirForIncrease) {
    return build(
      keep(`Você passou do alvo, mas com RIR ${rir} (perto da falha): mantenha a carga desta vez.`),
    );
  }
  // IMPULSO DO FÔLEGO (calibrado pelo dono, 22/07/2026): num SUPERÁVIT com
  // RIR >= rirBoostMinRir, cada ponto acima de (rirBoostMinRir - 1) soma 1 rep
  // ao desvio — 1 rep acima + "aguentaria 3" pesa como desvio 3. Déficit nunca
  // ganha boost, e o teto maxLoadPct continua segurando o passo.
  const rirBoost =
    outcome === 'over' && rir != null && rir >= cfg.rirBoostMinRir
      ? rir - (cfg.rirBoostMinRir - 1)
      : 0;
  const effectiveDeviation = deviationReps + rirBoost;
  const desiredPct = Math.min(cfg.loadPctPerRep * effectiveDeviation, cfg.maxLoadPct);
  // Desvio pequeno demais para valer um ajuste (alvo abaixo do piso) → manter.
  if (desiredPct < cfg.minLoadPct) {
    return build(keep('O desvio é pequeno demais para mexer na carga — mantenha.'));
  }
  const direction: 'increase' | 'decrease' = outcome === 'over' ? 'increase' : 'decrease';
  const cands = loadCandidates(currentLoadKg, direction, incrementKg, cfg);
  // Nenhum passo do incremento cai dentro de [piso, teto] (incremento grosso demais) → manter.
  if (cands.length === 0) {
    return build(keep('Nenhum ajuste alinhado ao incremento cabe dentro dos limites — mantenha.'));
  }
  // Recomendada: a candidata cuja mudança REAL fica mais perto do alvo desejado.
  const pick = cands.reduce((best, c) =>
    Math.abs(c.pct - desiredPct) < Math.abs(best.pct - desiredPct) ? c : best,
  );
  // Alternativa: a candidata válida MENOS agressiva que a recomendada (nunca mais agressiva).
  const gentler = cands.filter((c) => c.pct < pick.pct).sort((a, b) => b.pct - a.pct)[0];
  const rec = loadAdjustment(
    direction,
    currentLoadKg,
    pick.toKg,
    pick.pct,
    rirBoost > 0
      ? `Você passou do alvo com fôlego sobrando (RIR ${rir}): dá para subir a carga.`
      : undefined,
  );
  const alt = gentler
    ? [loadAdjustment(direction, currentLoadKg, gentler.toKg, gentler.pct)]
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
    // A "próxima série" é a de menor setOrder acima da atual QUE AINDA NÃO FOI CONCLUÍDA
    // (a UI permite executar fora de ordem; ajustar o alvo de uma série já 'done' seria
    // reescrever uma execução passada). Robusto a ordens não contíguas.
    const nextOrder = ex.sets
      .filter((s) => s.setOrder > setOrder && s.status !== 'done')
      .map((s) => s.setOrder)
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

/**
 * Reaplica ao rascunho os EFEITOS de todas as adaptações já registradas nas séries
 * (usado na RETOMADA: sem isso, restaurar `set.adaptation` do servidor não recolocaria
 * o `targetLoadKg`/reps da próxima série). Idempotente: `applyAdjustmentToNextSet` pula
 * séries já concluídas, então só as pendentes recebem o alvo ajustado.
 */
export const replayAdaptations = (draft: SessionDraft): SessionDraft => {
  let out = draft;
  for (const ex of draft.exercises) {
    for (const s of ex.sets) {
      if (s.adaptation) {
        out = applyAdjustmentToNextSet(out, ex.exerciseId, s.setOrder, s.adaptation);
      }
    }
  }
  return out;
};
