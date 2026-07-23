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
  getLastLoadByExerciseName: jest.fn(),
  updateSetLogAdaptation: jest.fn(async () => undefined),
  SessionExecutionRequestError: class extends Error {},
  isTransportSessionExecutionError: () => false,
}));
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
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
