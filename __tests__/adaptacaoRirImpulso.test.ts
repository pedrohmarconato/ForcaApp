// __tests__/adaptacaoRirImpulso.test.ts
// Calibração do motor pelo dono (22/07/2026), após o achado real: reps acima
// do alvo + fôlego sobrando e o app em silêncio total.
//
// 1. IMPULSO DO FÔLEGO: com RIR >= rirBoostMinRir (2), cada ponto acima de 1
//    soma 1 rep ao desvio do SUPERÁVIT (1 rep acima + "aguentaria 3" = desvio
//    efetivo 3 → ~9%). Déficit NÃO ganha boost. RIR 0 continua vetando.
// 2. TRANSPARÊNCIA: quando o motor decide "manter" sozinho (fora do alvo mas
//    abaixo do piso), o store expõe a decisão (lastAutoDecision) e o player
//    mostra o porquê — nunca mais silêncio.

jest.mock('../src/services/sessionExecutionRepository', () => ({
  startSessionLog: jest.fn(),
  saveSetLog: jest.fn(),
  finishSessionLog: jest.fn(),
  getOpenSessionLog: jest.fn(),
  getLastLoadByExercise: jest.fn(),
  updateSetLogAdaptation: jest.fn(async () => undefined),
  SessionExecutionRequestError: class extends Error {},
  isTransportSessionExecutionError: () => false,
}));
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
// Fase 5: o store passou a importar agendaRepository e planEditRepository;
// mocka para não carregar o cliente Supabase real (mesmo padrão dos demais services).
jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(async () => ({ agenda: [], origem: 'ausente' })),
}));
jest.mock('../src/services/planEditRepository', () => {
  class PlanEditError extends Error {
    code: string | null;
    constructor(message: string, code: string | null = null) {
      super(message);
      this.name = 'PlanEditError';
      this.code = code;
    }
  }
  return {
    PlanEditError,
    isPlanoDesatualizado: jest.fn(() => false),
    reagendarSessoesDaSemana: jest.fn(async () => ({ week: 1, moved: 0 })),
  };
});
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(async () => undefined),
  loadDraft: jest.fn(async () => null),
  clearDraft: jest.fn(async () => undefined),
}));

import { recommendByRules, evaluateSet } from '../src/engine/intraSessionAdaptation';
import { ADAPT_CONFIG } from '../src/engine/config';

const CTX = { isBodyweight: false, injury: false };

const superavit1 = evaluateSet({ actualReps: 11, targetRepsMin: 8, targetRepsMax: 10 });

describe('impulso do fôlego no superávit', () => {
  it('1 rep acima + RIR 3 → sobe carga (desvio efetivo 3 ≈ 9%)', () => {
    const rec = recommendByRules({
      evaluated: superavit1,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 3,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      // alvo ~9% de 40 = 3.6kg → candidato alinhado ao incremento: 42.5 (6.25%)
      expect(rec.recommended.toKg).toBe(42.5);
      // O porquê precisa citar o fôlego — é o que explica subir com só 1 rep acima.
      expect(rec.recommended.reason.toLowerCase()).toContain('fôlego');
    }
  });

  it('1 rep acima SEM RIR → manter (abaixo do piso, sem impulso)', () => {
    const rec = recommendByRules({
      evaluated: superavit1,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: null,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('1 rep acima + RIR 1 → manter (fôlego abaixo do gatilho de impulso)', () => {
    const rec = recommendByRules({
      evaluated: superavit1,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 1,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('RIR 0 continua vetando subida mesmo com reps bem acima', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 14, targetRepsMin: 8, targetRepsMax: 10 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 0,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('impulso respeita o teto de 12% por série', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 14, targetRepsMin: 8, targetRepsMax: 10 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 4, // desvio 4 + boost 3 = 7 → desejaria 21%, teto segura em 12%
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.pct).toBeLessThanOrEqual(ADAPT_CONFIG.maxLoadPct + 1e-9);
    }
  });

  it('déficit NÃO ganha impulso do fôlego (1 rep abaixo + RIR 3 segue manter)', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 7, targetRepsMin: 8, targetRepsMax: 10 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 3,
    });
    expect(rec.recommended.kind).toBe('keep');
  });
});

describe('transparência do "manter" automático (store)', () => {

  it('over leve sem impulso → lastAutoDecision preenchida; reset limpa', async () => {
    const { saveSetLog } = require('../src/services/sessionExecutionRepository');
    (saveSetLog as jest.Mock).mockResolvedValue({
      setLogId: 'set-1',
      actualReps: 11,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'over',
    });
    const { useActiveSessionStore } = require('../src/store/activeSessionStore');
    useActiveSessionStore.setState({
      status: 'active',
      draft: {
        userId: 'u1',
        plannedSessionId: 'sess-1',
        sessionLogId: 'sl-1',
        status: 'active',
        startedAt: 'T0',
        title: 'Push A',
        weekNumber: 1,
        exercises: [
          {
            exerciseId: 'ex-1',
            name: 'Supino',
            exerciseOrder: 1,
            isBodyweight: false,
            hasInjury: false,
            loadIncrementKg: 2.5,
            restSeconds: 90,
            sets: [
              {
                plannedSetId: 'st-1',
                setOrder: 1,
                status: 'active',
                targetRepsMin: 8,
                targetRepsMax: 10,
                targetLoadKg: null,
                targetRir: 2,
                actualReps: 11,
                actualLoadKg: 40,
                actualRir: null,
                outcome: null,
                adaptation: null,
              },
              {
                plannedSetId: 'st-2',
                setOrder: 2,
                status: 'pending',
                targetRepsMin: 8,
                targetRepsMax: 10,
                targetLoadKg: null,
                targetRir: 2,
                actualReps: null,
                actualLoadKg: null,
                actualRir: null,
                outcome: null,
                adaptation: null,
              },
            ],
          },
        ],
      },
    });

    const ok = await useActiveSessionStore.getState().completeSet('ex-1', 1);
    expect(ok).toBe(true);

    const auto = useActiveSessionStore.getState().lastAutoDecision;
    expect(auto).not.toBeNull();
    expect(auto.sessionLogId).toBe('sl-1');
    expect(auto.reason).toMatch(/pequeno demais/i);

    useActiveSessionStore.getState().reset();
    expect(useActiveSessionStore.getState().lastAutoDecision).toBeNull();
  });
});

describe('degrau mínimo em carga leve (incremento grosso vs teto)', () => {
  // Cenário REAL do dono no HML: 15 kg, incremento 2.5 → 1 passo = 16.7% > teto
  // 12%. Sem o degrau mínimo, a progressão travava e a carga nunca subia.
  it('superávit com fôlego: oferece 1 incremento mesmo estourando o teto', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 13, targetRepsMin: 6, targetRepsMax: 10 }),
      currentLoadKg: 15,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 3,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      expect(rec.recommended.toKg).toBe(17.5); // 15 + 1 incremento
      expect(rec.recommended.reason.toLowerCase()).toContain('menor ajuste');
    }
  });

  it('déficit em carga leve: oferece reduzir 1 incremento', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 3, targetRepsMin: 6, targetRepsMax: 10 }),
      currentLoadKg: 15,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: null,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('decrease');
      expect(rec.recommended.toKg).toBe(12.5);
    }
  });

  it('não sugere passo que zeraria/negativaria a carga', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 2, targetRepsMin: 6, targetRepsMax: 10 }),
      currentLoadKg: 2.5,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: null,
    });
    expect(rec.recommended.kind).toBe('keep');
  });
});

describe('topo da faixa com fôlego (gatilho interno explícito)', () => {
  const topo = evaluateSet({ actualReps: 10, targetRepsMin: 8, targetRepsMax: 10 });

  it('no MÁXIMO da faixa + RIR >= 2 + carga válida → sugere AUMENTO com trigger machine-readable', () => {
    const rec = recommendByRules({
      evaluated: topo,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      // 40 + 2.5 = 42.5 → 6.25% dentro de [5%, 12%] → passo seguro.
      expect(rec.recommended.toKg).toBe(42.5);
    }
    expect(rec.trigger).toBe('topo_da_faixa_com_folego');
    expect(rec.recommended.reason.toLowerCase()).toContain('fôlego');
  });

  // Regra nova (flag rirBoostOnTargetAnywhere ON): fôlego em QUALQUER ponto da
  // faixa puxa progressão — o meio da faixa deixou de ser "manter" silencioso.
  it('meio da faixa (9 de 8–10) + RIR 2 → AGORA propõe aumento', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 9, targetRepsMin: 8, targetRepsMax: 10 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
    }
  });

  it('RIR 1 no topo → manter (fôlego abaixo do gatilho)', () => {
    const rec = recommendByRules({
      evaluated: topo,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 1,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('lesão declarada no topo → manter (guardrail vence)', () => {
    const rec = recommendByRules({
      evaluated: topo,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: { isBodyweight: false, injury: true },
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('carga ausente no topo → manter (nunca sugere no escuro)', () => {
    const rec = recommendByRules({
      evaluated: topo,
      currentLoadKg: null,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('A2: sem incremento seguro (15kg + 2.5 = 16.7% > teto) + flag ON → degrau mínimo 17.5, nunca silêncio', () => {
    const rec = recommendByRules({
      evaluated: topo,
      currentLoadKg: 15,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    // flag ON (default): o fôlego NÃO é descartado — oferece o menor passo possível.
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      expect(rec.recommended.toKg).toBe(17.5);
      expect(rec.recommended.reason.toLowerCase()).toContain('menor ajuste');
    }
    expect(rec.trigger).toBe('topo_da_faixa_com_folego');
  });

  it('peso corporal no topo → mexe em REPS, não carga (trigger não dispara)', () => {
    const rec = recommendByRules({
      evaluated: topo,
      currentLoadKg: null,
      incrementKg: 0,
      ctx: { isBodyweight: true, injury: false },
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('reps');
  });
});

// ============================================================
// Regra nova (combinada com o dono): cumprir a prescrição e declarar folga
// puxa progressão em QUALQUER ponto da faixa, não só no teto. Atrás da flag
// `rirBoostOnTargetAnywhere` (default ON) para permitir rollback por config.
// ============================================================
describe('fôlego em qualquer ponto da faixa (rirBoostOnTargetAnywhere)', () => {
  const faixa8a12_10 = evaluateSet({ actualReps: 10, targetRepsMin: 8, targetRepsMax: 12 });

  it('meio da faixa (10 de 8–12) + RIR 2 → propõe aumento com magnitude da escala', () => {
    const rec = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      // RIR 2 ≈ 2 reps de folga → deseja ~6% de 40 = 42.4 → candidata ao incremento: 42.5.
      expect(rec.recommended.toKg).toBe(42.5);
      expect(rec.recommended.pct).toBeGreaterThanOrEqual(ADAPT_CONFIG.minLoadPct - 1e-9);
      expect(rec.recommended.pct).toBeLessThanOrEqual(ADAPT_CONFIG.maxLoadPct + 1e-9);
      expect(rec.recommended.reason.toLowerCase()).toContain('fôlego');
    }
    expect(rec.trigger).toBe('topo_da_faixa_com_folego');
  });

  it('meio da faixa + RIR 0 ou 1 → manter (sem folga suficiente)', () => {
    for (const rir of [0, 1]) {
      const rec = recommendByRules({
        evaluated: faixa8a12_10,
        currentLoadKg: 40,
        incrementKg: 2.5,
        ctx: CTX,
        actualRir: rir,
      });
      expect(rec.recommended.kind).toBe('keep');
      expect(rec.trigger ?? null).toBeNull();
    }
  });

  it('teto da faixa (12 de 8–12) + RIR 2 → proposta de aumento (regressão do ramo antigo)', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 12, targetRepsMin: 8, targetRepsMax: 12 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      expect(rec.recommended.toKg).toBe(42.5);
    }
  });

  it('lesão declarada: meio da faixa + RIR 2 → NUNCA propõe aumento', () => {
    const rec = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: { isBodyweight: false, injury: true },
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('keep');
    expect(rec.options.every((o) => o.kind !== 'load' || o.direction !== 'increase')).toBe(true);
  });

  it('peso corporal: meio da faixa + RIR 2 → proposta em REPS, não em carga', () => {
    const rec = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: null,
      incrementKg: 0,
      ctx: { isBodyweight: true, injury: false },
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('reps');
    if (rec.recommended.kind === 'reps') {
      expect(rec.recommended.direction).toBe('increase');
      expect(rec.recommended.deltaReps).toBe(ADAPT_CONFIG.bodyweightRepStep);
    }
    expect(rec.options.every((o) => o.kind !== 'load')).toBe(true);
  });

  it('alvo fixo 10 (min=max) + fez 10 + RIR 2 → proposta de aumento (degenerado coberto)', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 10, targetRepsMin: 10, targetRepsMax: 10 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      expect(rec.recommended.toKg).toBe(42.5);
    }
  });

  it('RIR ausente no meio da faixa → manter', () => {
    const rec = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: null,
    });
    expect(rec.recommended.kind).toBe('keep');
  });

  it('flag rirBoostOnTargetAnywhere OFF → comportamento idêntico ao atual', () => {
    const configAntiga = { ...ADAPT_CONFIG, rirBoostOnTargetAnywhere: false };
    // meio da faixa + RIR 2 → manter (antes, só o topo disparava).
    const meio = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
      config: configAntiga,
    });
    expect(meio.recommended.kind).toBe('keep');
    // topo da faixa + RIR 2 → segue propondo aumento.
    const topo = recommendByRules({
      evaluated: evaluateSet({ actualReps: 12, targetRepsMin: 8, targetRepsMax: 12 }),
      currentLoadKg: 40,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
      config: configAntiga,
    });
    expect(topo.recommended.kind).toBe('load');
    if (topo.recommended.kind === 'load') {
      expect(topo.recommended.direction).toBe('increase');
      expect(topo.recommended.toKg).toBe(42.5);
    }
    // Magnitude também volta à antiga (fórmula rir - (min - 1)): RIR 3 no topo
    // com 80kg desejava 6% → 85; a regra nova desejaria 9% → 87.5.
    const topoRir3 = recommendByRules({
      evaluated: evaluateSet({ actualReps: 12, targetRepsMin: 8, targetRepsMax: 12 }),
      currentLoadKg: 80,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 3,
      config: configAntiga,
    });
    expect(topoRir3.recommended.kind).toBe('load');
    if (topoRir3.recommended.kind === 'load') {
      expect(topoRir3.recommended.toKg).toBe(85);
    }
  });

  // ============================================================
  // Fechamento dos achados do review do PR: A1 (guardrail de lesão no ramo
  // de reps), A2 (degrau mínimo no on_target atrás da flag), classe 3
  // (rollback flag OFF no sub-caminho sem incremento seguro) e A4 (incremento
  // inválido degrada com passo seguro).
  // ============================================================

  it('A1: lesão + peso corporal + fôlego → KEEP nas duas flags (sem "aumentar meta")', () => {
    const ctxLesao = { isBodyweight: true, injury: true };
    // flag ON: meio da faixa dispara progressão → o guardrail de lesão precisa vetar.
    const on = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: null,
      incrementKg: 0,
      ctx: ctxLesao,
      actualRir: 2,
    });
    expect(on.recommended.kind).toBe('keep');
    expect(on.options.every((o) => o.kind !== 'reps' || o.direction !== 'increase')).toBe(true);
    expect(on.options.every((o) => o.kind !== 'load' || o.direction !== 'increase')).toBe(true);
    // flag OFF: o TETO continua disparando progressão → o guardrail vale também aqui.
    const off = recommendByRules({
      evaluated: evaluateSet({ actualReps: 12, targetRepsMin: 8, targetRepsMax: 12 }),
      currentLoadKg: null,
      incrementKg: 0,
      ctx: ctxLesao,
      actualRir: 2,
      config: { ...ADAPT_CONFIG, rirBoostOnTargetAnywhere: false },
    });
    expect(off.recommended.kind).toBe('keep');
    expect(off.options.every((o) => o.kind !== 'reps' || o.direction !== 'increase')).toBe(true);
  });

  it('A2: carga leve (15kg) no MEIO da faixa + fôlego + flag ON → degrau mínimo 17.5', () => {
    const rec = recommendByRules({
      evaluated: faixa8a12_10,
      currentLoadKg: 15,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
    });
    // O cenário-motivador do PR (meio da faixa com fôlego) NÃO volta ao silêncio
    // em carga leve: o menor passo é oferecido como sugestão.
    expect(rec.recommended.kind).toBe('load');
    if (rec.recommended.kind === 'load') {
      expect(rec.recommended.direction).toBe('increase');
      expect(rec.recommended.toKg).toBe(17.5);
    }
    expect(rec.trigger).toBe('topo_da_faixa_com_folego');
  });

  it('A2 + classe 3 (rollback): 15kg + fôlego + flag OFF → keep "incremento seguro" com trigger', () => {
    const rec = recommendByRules({
      evaluated: evaluateSet({ actualReps: 12, targetRepsMin: 8, targetRepsMax: 12 }),
      currentLoadKg: 15,
      incrementKg: 2.5,
      ctx: CTX,
      actualRir: 2,
      config: { ...ADAPT_CONFIG, rirBoostOnTargetAnywhere: false },
    });
    // flag OFF preserva o comportamento antigo no sub-caminho sem incremento seguro:
    // keep com razão explícita. O trigger sinaliza que a progressão foi considerada.
    expect(rec.recommended.kind).toBe('keep');
    expect(rec.recommended.reason.toLowerCase()).toContain('incremento seguro');
    expect(rec.trigger).toBe('topo_da_faixa_com_folego');
  });

  it('A4: incremento inválido (negativo/0/NaN) nunca produz "aumentar" que reduz a carga', () => {
    for (const incremento of [-2.5, 0, NaN]) {
      const rec = recommendByRules({
        evaluated: evaluateSet({ actualReps: 12, targetRepsMin: 8, targetRepsMax: 12 }),
        currentLoadKg: 40,
        incrementKg: incremento,
        ctx: CTX,
        actualRir: 2,
      });
      // O degrau defensivo de loadCandidates (passo seguro 2.5) segura o sinal:
      // "aumentar" sempre sobe, nunca reduz.
      expect(rec.recommended.kind).toBe('load');
      if (rec.recommended.kind === 'load') {
        expect(rec.recommended.direction).toBe('increase');
        expect(rec.recommended.toKg).toBe(42.5);
      }
    }
  });
});
