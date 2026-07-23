// __tests__/adaptationDecision.test.ts
// Telemetria da decisão de adaptação (lacuna 1 dos registros p/ modelagem,
// 23/07/2026): além de gravar a escolha em set_logs.adaptation, gravamos em
// adaptation_decision o ENVELOPE completo — recomendado, opções, escolhido e a
// RESPOSTA do aluno (accepted/diverged/declined/auto). Sem isso não dá para
// modelar "o usuário segue as sugestões do motor?".

import {
  buildAdaptationDecision,
  recommendByRules,
  evaluateSet,
  type Adjustment,
} from '../src/engine/intraSessionAdaptation';

const CTX = { isBodyweight: false, injury: false };

// Superávit com fôlego → recomenda subir a carga, com "manter" disponível.
const rec = recommendByRules({
  evaluated: evaluateSet({ actualReps: 13, targetRepsMin: 6, targetRepsMax: 10 }),
  currentLoadKg: 15,
  incrementKg: 2.5,
  ctx: CTX,
  actualRir: 3,
});

describe('buildAdaptationDecision', () => {
  it('aceitar a recomendada → response "accepted", com recomendado e escolhido', () => {
    const dec = buildAdaptationDecision(rec, rec.recommended, false);
    expect(dec.response).toBe('accepted');
    expect(dec.recommended).toEqual(rec.recommended);
    expect(dec.chosen).toEqual(rec.recommended);
    expect(dec.outcome).toBe('over');
    expect(dec.deviationReps).toBe(rec.deviationReps);
    expect(Array.isArray(dec.options)).toBe(true);
  });

  it('recusar (escolher manter) quando havia ajuste → response "declined"', () => {
    const keep = rec.options.find((o) => o.kind === 'keep') as Adjustment;
    const dec = buildAdaptationDecision(rec, keep, false);
    expect(dec.response).toBe('declined');
    expect(dec.chosen.kind).toBe('keep');
    // O recomendado (o que ele NÃO seguiu) fica registrado para comparação.
    expect(dec.recommended.kind).toBe('load');
  });

  it('escolher uma opção != recomendada e != manter → response "diverged"', () => {
    // Fabrica uma alternativa de carga distinta da recomendada.
    const alt: Adjustment = {
      kind: 'load',
      direction: 'increase',
      fromKg: 15,
      toKg: 20,
      deltaKg: 5,
      pct: 0.3333,
      label: 'Aumentar para 20 kg',
      reason: 'escolha manual',
    };
    const dec = buildAdaptationDecision(rec, alt, false);
    expect(dec.response).toBe('diverged');
    expect(dec.chosen.kind).toBe('load');
  });

  it('decisão automática (guardrail/piso, sem sheet) → response "auto"', () => {
    const dec = buildAdaptationDecision(rec, rec.recommended, true);
    expect(dec.response).toBe('auto');
  });

  it('serializa para JSON limpo (sem undefined) — pronto para o JSONB', () => {
    const dec = buildAdaptationDecision(rec, rec.recommended, false);
    const round = JSON.parse(JSON.stringify(dec));
    expect(round.response).toBe('accepted');
    expect(round.recommended.toKg).toBe(rec.recommended.kind === 'load' ? rec.recommended.toKg : undefined);
  });
});
