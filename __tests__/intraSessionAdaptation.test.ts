// __tests__/intraSessionAdaptation.test.ts
// Fase 5 — cobre a tabela de regras (déficit/superávit/on-target), os guardrails
// (lesão, peso corporal) e as bordas do §9 (1ª sessão sem histórico, RIR baixo,
// teto de mudança, arredondamento ao incremento, piso mínimo).

import {
  evaluateSet,
  recommendByRules,
  roundToIncrement,
  applyAdjustmentToNextSet,
  type Adjustment,
} from '../src/engine/intraSessionAdaptation';
import { ADAPT_CONFIG } from '../src/engine/config';
import type { SessionDraft } from '../src/engine/sessionModel';

const NORMAL = { isBodyweight: false, injury: false };

// helpers de asserção sobre o union Adjustment
const asLoad = (a: Adjustment) => {
  if (a.kind !== 'load') throw new Error(`esperava load, veio ${a.kind}`);
  return a;
};
const asReps = (a: Adjustment) => {
  if (a.kind !== 'reps') throw new Error(`esperava reps, veio ${a.kind}`);
  return a;
};

describe('evaluateSet', () => {
  it('dentro da faixa = on_target, desvio 0', () => {
    expect(evaluateSet({ actualReps: 7, targetRepsMin: 6, targetRepsMax: 8 })).toMatchObject({
      outcome: 'on_target',
      deviationReps: 0,
    });
  });
  it('abaixo do mínimo = under, desvio = quanto faltou', () => {
    expect(evaluateSet({ actualReps: 4, targetRepsMin: 6, targetRepsMax: 8 })).toMatchObject({
      outcome: 'under',
      deviationReps: 2,
    });
  });
  it('acima do máximo = over, desvio = quanto passou', () => {
    expect(evaluateSet({ actualReps: 10, targetRepsMin: 6, targetRepsMax: 8 })).toMatchObject({
      outcome: 'over',
      deviationReps: 2,
    });
  });
});

describe('roundToIncrement', () => {
  it('arredonda ao múltiplo do incremento mais próximo', () => {
    expect(roundToIncrement(47, 2.5)).toBe(47.5);
    expect(roundToIncrement(53, 2.5)).toBe(52.5);
    expect(roundToIncrement(88, 2.5)).toBe(87.5);
  });
  it('nunca negativo; incremento inválido apenas normaliza', () => {
    expect(roundToIncrement(-5, 2.5)).toBe(0);
    expect(roundToIncrement(10, 0)).toBe(10);
  });
});

describe('recommendByRules — on_target', () => {
  it('mantém a carga e oferece só isso', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 7, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 50,
      incrementKg: 2.5,
      ctx: NORMAL,
    });
    expect(r.recommended.kind).toBe('keep');
    expect(r.tier).toBe('none');
    expect(r.options).toHaveLength(1);
    expect(r.options[0]).toBe(r.recommended);
  });
});

describe('recommendByRules — déficit (under) reduz a carga', () => {
  it('déficit moderado (2 reps) → -6% arredondado ao incremento', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 4, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 50,
      incrementKg: 2.5,
      ctx: NORMAL,
    });
    expect(r.tier).toBe('moderado');
    const load = asLoad(r.recommended);
    expect(load.direction).toBe('decrease');
    expect(load.toKg).toBe(47.5);
    expect(load.deltaKg).toBe(-2.5);
    expect(load.pct).toBe(0.06);
    // "manter" é sempre uma saída registrável
    expect(r.options.some((o) => o.kind === 'keep')).toBe(true);
    expect(r.options[0]).toBe(r.recommended);
  });

  it('déficit grande (5 reps) satura no teto de 12% e oferece alternativa mais suave', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 1, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 50,
      incrementKg: 2.5,
      ctx: NORMAL,
    });
    expect(r.tier).toBe('grande');
    const load = asLoad(r.recommended);
    expect(load.toKg).toBe(45); // 50*0.88=44 → arredonda p/ 45
    expect(load.pct).toBe(ADAPT_CONFIG.maxLoadPct); // saturou em 0.12
    // recomendada + alternativa de 1 incremento + manter
    expect(r.options).toHaveLength(3);
    expect(r.options.map((o) => o.kind)).toContain('keep');
  });

  it('déficit leve com carga alta cai abaixo do piso mínimo → mantém', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 5, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 100, // 1 rep de déficit → -3% = -3kg, arredonda p/ -2.5kg = 2.5% < piso 5%
      incrementKg: 2.5,
      ctx: NORMAL,
    });
    expect(r.tier).toBe('leve');
    expect(r.recommended.kind).toBe('keep');
  });
});

describe('recommendByRules — superávit (over) sobe a carga', () => {
  it('superávit com RIR de sobra → +6% arredondado', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 10, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 50,
      incrementKg: 2.5,
      ctx: NORMAL,
      actualRir: 2,
    });
    const load = asLoad(r.recommended);
    expect(load.direction).toBe('increase');
    expect(load.toKg).toBe(52.5); // 50*1.06=53 → arredonda p/ 52.5
    expect(load.deltaKg).toBe(2.5);
  });

  it('§9 superávit com RIR baixo (à falha) NÃO sobe a carga', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 10, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 50,
      incrementKg: 2.5,
      ctx: NORMAL,
      actualRir: 0,
    });
    expect(r.recommended.kind).toBe('keep');
  });
});

describe('recommendByRules — guardrails', () => {
  it('§9 lesão declarada: superávit NUNCA aumenta a carga', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 10, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: 50,
      incrementKg: 2.5,
      ctx: { isBodyweight: false, injury: true },
      actualRir: 3,
    });
    expect(r.recommended.kind).toBe('keep');
    // nenhuma opção sugere subir carga
    expect(r.options.every((o) => o.kind !== 'load' || o.direction !== 'increase')).toBe(true);
  });

  it('§9 peso corporal: superávit ajusta REPS, não carga', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 15, targetRepsMin: 10, targetRepsMax: 12 }),
      currentLoadKg: null,
      incrementKg: 0,
      ctx: { isBodyweight: true, injury: false },
    });
    const reps = asReps(r.recommended);
    expect(reps.direction).toBe('increase');
    expect(reps.deltaReps).toBe(ADAPT_CONFIG.bodyweightRepStep);
    // nunca mexe em carga num exercício de peso corporal
    expect(r.options.every((o) => o.kind !== 'load')).toBe(true);
  });

  it('peso corporal: déficit reduz a meta de reps', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 6, targetRepsMin: 10, targetRepsMax: 12 }),
      currentLoadKg: null,
      incrementKg: 0,
      ctx: { isBodyweight: true, injury: false },
    });
    const reps = asReps(r.recommended);
    expect(reps.direction).toBe('decrease');
    expect(reps.deltaReps).toBe(-ADAPT_CONFIG.bodyweightRepStep);
  });
});

describe('recommendByRules — §9 primeira sessão sem histórico', () => {
  it('exercício com carga mas sem carga conhecida → mantém, não inventa', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 4, targetRepsMin: 6, targetRepsMax: 8 }),
      currentLoadKg: null,
      incrementKg: 2.5,
      ctx: NORMAL,
    });
    expect(r.recommended.kind).toBe('keep');
  });
});

describe('recommendByRules — teto de mudança', () => {
  it('desvio enorme satura em maxLoadPct', () => {
    const r = recommendByRules({
      evaluated: evaluateSet({ actualReps: 2, targetRepsMin: 12, targetRepsMax: 15 }),
      currentLoadKg: 100,
      incrementKg: 2.5,
      ctx: NORMAL,
    });
    const load = asLoad(r.recommended);
    expect(load.pct).toBe(ADAPT_CONFIG.maxLoadPct); // 10 reps * 3% = 30% → capado em 12%
    expect(load.direction).toBe('decrease');
  });
});

// ---- aplicação da decisão ao rascunho (o "aplicada à próxima série" do plano) ----

const makeDraft = (
  sets: Array<{
    setOrder: number;
    targetRepsMin: number;
    targetRepsMax: number;
    targetLoadKg: number | null;
  }>,
): SessionDraft => ({
  version: 1,
  plannedSessionId: 'sess-1',
  sessionLogId: 'log-1',
  userId: 'u-1',
  title: 'Push A',
  weekNumber: 1,
  startedAt: null,
  status: 'active',
  lastLoadByExercise: {},
  exercises: [
    {
      exerciseId: 'ex-1',
      name: 'Supino',
      order: 1,
      equipment: 'Barra',
      isBodyweight: false,
      hasInjury: false,
      loadIncrementKg: 2.5,
      restSeconds: 90,
      priority: 'primary',
      targetRmPercent: 75,
      repsRaw: '8-10',
      sets: sets.map((s) => ({
        plannedSetId: `st-${s.setOrder}`,
        setOrder: s.setOrder,
        targetRepsMin: s.targetRepsMin,
        targetRepsMax: s.targetRepsMax,
        targetLoadKg: s.targetLoadKg,
        targetRir: 2,
        actualReps: null,
        actualLoadKg: null,
        actualRir: null,
        status: 'pending',
        outcome: null,
        setLogId: null,
        adaptation: null,
      })),
    },
  ],
});

const LOAD_DEC: Adjustment = {
  kind: 'load',
  direction: 'decrease',
  fromKg: 50,
  toKg: 45,
  deltaKg: -5,
  pct: 0.12,
  label: 'Reduzir para 45 kg',
  reason: '...',
};

describe('applyAdjustmentToNextSet', () => {
  it('load: registra a escolha na série feita e ajusta o alvo da PRÓXIMA', () => {
    const draft = makeDraft([
      { setOrder: 1, targetRepsMin: 8, targetRepsMax: 10, targetLoadKg: 50 },
      { setOrder: 2, targetRepsMin: 8, targetRepsMax: 10, targetLoadKg: 50 },
    ]);
    const out = applyAdjustmentToNextSet(draft, 'ex-1', 1, LOAD_DEC);
    const sets = out.exercises[0].sets;
    expect(sets[0].adaptation).toEqual(LOAD_DEC); // registrada na série concluída
    expect(sets[1].targetLoadKg).toBe(45); // aplicada à próxima
  });

  it('reps: desloca a faixa-alvo da próxima série (piso 1)', () => {
    const draft = makeDraft([
      { setOrder: 1, targetRepsMin: 10, targetRepsMax: 12, targetLoadKg: null },
      { setOrder: 2, targetRepsMin: 10, targetRepsMax: 12, targetLoadKg: null },
    ]);
    const repsAdj: Adjustment = {
      kind: 'reps',
      direction: 'increase',
      deltaReps: 2,
      label: '+2 reps',
      reason: '...',
    };
    const out = applyAdjustmentToNextSet(draft, 'ex-1', 1, repsAdj);
    expect(out.exercises[0].sets[1].targetRepsMin).toBe(12);
    expect(out.exercises[0].sets[1].targetRepsMax).toBe(14);
  });

  it('última série (sem próxima) → só registra a escolha, nada mais muda', () => {
    const draft = makeDraft([
      { setOrder: 1, targetRepsMin: 8, targetRepsMax: 10, targetLoadKg: 50 },
      { setOrder: 2, targetRepsMin: 8, targetRepsMax: 10, targetLoadKg: 50 },
    ]);
    const out = applyAdjustmentToNextSet(draft, 'ex-1', 2, LOAD_DEC);
    expect(out.exercises[0].sets[1].adaptation).toEqual(LOAD_DEC);
    expect(out.exercises[0].sets[0].targetLoadKg).toBe(50); // intocada
  });

  it('keep: registra a recusa e NÃO mexe no alvo da próxima', () => {
    const draft = makeDraft([
      { setOrder: 1, targetRepsMin: 8, targetRepsMax: 10, targetLoadKg: 50 },
      { setOrder: 2, targetRepsMin: 8, targetRepsMax: 10, targetLoadKg: 50 },
    ]);
    const keepAdj: Adjustment = {
      kind: 'keep',
      label: 'Manter a carga',
      reason: 'Recusado.',
    };
    const out = applyAdjustmentToNextSet(draft, 'ex-1', 1, keepAdj);
    expect(out.exercises[0].sets[0].adaptation).toEqual(keepAdj);
    expect(out.exercises[0].sets[1].targetLoadKg).toBe(50); // inalterada
  });
});
