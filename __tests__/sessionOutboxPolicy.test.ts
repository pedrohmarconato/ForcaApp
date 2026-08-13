// __tests__/sessionOutboxPolicy.test.ts
// Fase 4 (REQ-07) — política PURA da fila offline-first (D-15): ordem FIFO por
// sessão (D-04/Pitfall 4), dedupe por (kind, id) natural (D-13), backoff por
// idade nunca por tentativa (D-11), allowlist ESTRITA de código definitivo
// (D-14/Pitfall 2 — código desconhecido NUNCA quarentena por default).

import {
  buildItemId,
  upsertItem,
  nextDrainable,
  isDefinitiveRejection,
  isSessionClosedCode,
  computeBackoff,
  isExpired,
  buildQuarantineItem,
  pruneExpiredQuarantine,
  type OutboxItem,
} from '../src/engine/sessionOutboxPolicy';
import { OUTBOX_CONFIG } from '../src/engine/config';

const makeItem = (overrides: Partial<OutboxItem> = {}): OutboxItem => ({
  id: 'sess-1:set:st-1',
  sessionLogId: 'sess-1',
  kind: 'save_set_log',
  payload: { foo: 'bar' },
  enqueuedAt: '2026-08-12T10:00:00.000Z',
  nextAttemptAt: '2026-08-12T10:00:00.000Z',
  attempts: 0,
  ...overrides,
});

describe('buildItemId', () => {
  it('save_set_log: (sessionLogId, plannedSetId)', () => {
    expect(
      buildItemId({ kind: 'save_set_log', sessionLogId: 'sess-1', plannedSetId: 'st-1' }),
    ).toBe('sess-1:set:st-1');
  });

  it('update_set_log_adaptation: mesma chave de save_set_log + sufixo :adapt', () => {
    expect(
      buildItemId({
        kind: 'update_set_log_adaptation',
        sessionLogId: 'sess-1',
        plannedSetId: 'st-1',
      }),
    ).toBe('sess-1:set:st-1:adapt');
  });

  it('skip/unskip/swap: (sessionLogId, plannedExerciseId) — mesma chave para os 3 kinds', () => {
    const base = { sessionLogId: 'sess-1', plannedExerciseId: 'ex-1' } as const;
    expect(buildItemId({ kind: 'skip_session_exercise', ...base })).toBe('sess-1:exercise:ex-1');
    expect(buildItemId({ kind: 'unskip_session_exercise', ...base })).toBe('sess-1:exercise:ex-1');
    expect(buildItemId({ kind: 'swap_session_exercise', ...base })).toBe('sess-1:exercise:ex-1');
  });

  it('finish_session: (sessionLogId)', () => {
    expect(buildItemId({ kind: 'finish_session', sessionLogId: 'sess-1' })).toBe('sess-1:finish');
  });
});

describe('nextDrainable — FIFO por sessão (D-04)', () => {
  it('devolve só a CABEÇA (primeira ocorrência) de cada sub-fila por sessionLogId', () => {
    const items: OutboxItem[] = [
      makeItem({ id: 'a', sessionLogId: 'sess-1' }),
      makeItem({ id: 'b', sessionLogId: 'sess-1' }),
      makeItem({ id: 'c', sessionLogId: 'sess-2' }),
    ];
    const result = nextDrainable(items, '2026-08-12T10:00:00.000Z');
    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('Pitfall 4: sessão em cooldown de backoff NÃO bloqueia outra sessão livre', () => {
    const items: OutboxItem[] = [
      makeItem({ id: 'stuck', sessionLogId: 'sess-1', nextAttemptAt: '2026-08-12T10:05:00.000Z' }),
      makeItem({ id: 'free', sessionLogId: 'sess-2', nextAttemptAt: '2026-08-12T09:00:00.000Z' }),
    ];
    const result = nextDrainable(items, '2026-08-12T10:00:00.000Z');
    expect(result.map((i) => i.id)).toEqual(['free']);
  });

  it('sessão inteira em cooldown: nextDrainable não devolve nada dela', () => {
    const items: OutboxItem[] = [
      makeItem({ id: 'stuck', sessionLogId: 'sess-1', nextAttemptAt: '2026-08-12T10:05:00.000Z' }),
    ];
    expect(nextDrainable(items, '2026-08-12T10:00:00.000Z')).toEqual([]);
  });
});

describe('upsertItem — dedupe por (kind, id) natural (D-13)', () => {
  it('mesmo kind+id: substitui payload/nextAttemptAt do item existente (no-op de duplicação)', () => {
    const existing = [makeItem({ id: 'x', payload: { old: true } })];
    const updated = upsertItem(
      existing,
      makeItem({ id: 'x', payload: { new: true }, nextAttemptAt: '2026-08-12T11:00:00.000Z' }),
    );
    expect(updated).toHaveLength(1);
    expect(updated[0].payload).toEqual({ new: true });
    expect(updated[0].nextAttemptAt).toBe('2026-08-12T11:00:00.000Z');
  });

  it('ausente: adiciona ao FIM (preserva ordem de inserção)', () => {
    const existing = [makeItem({ id: 'x' })];
    const updated = upsertItem(existing, makeItem({ id: 'y' }));
    expect(updated.map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('skip e unskip do MESMO exercício têm a MESMA id mas kinds diferentes — coexistem', () => {
    const skipItem = makeItem({ id: 'sess-1:exercise:ex-1', kind: 'skip_session_exercise' });
    const unskipItem = makeItem({ id: 'sess-1:exercise:ex-1', kind: 'unskip_session_exercise' });
    const result = upsertItem([skipItem], unskipItem);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.kind)).toEqual(['skip_session_exercise', 'unskip_session_exercise']);
  });
});

describe('isDefinitiveRejection — allowlist EXATA (D-14/Pitfall 2)', () => {
  it('códigos confirmados nas migrations vão para quarentena', () => {
    for (const code of ['23505', '42501', '22023', '22004', 'P0002']) {
      expect(isDefinitiveRejection(code)).toBe(true);
    }
  });

  it('P0005 NÃO está mais na allowlist (migration 0037 substituiu por 23505 — PostgREST mascara P0005)', () => {
    expect(isDefinitiveRejection('P0005')).toBe(false);
  });

  it('P0001 NUNCA está na allowlist — tratamento à parte (Pitfall 3)', () => {
    expect(isDefinitiveRejection('P0001')).toBe(false);
  });

  it('código desconhecido/ausente NUNCA é definitivo (Pitfall 2 — perda silenciosa)', () => {
    expect(isDefinitiveRejection('99999')).toBe(false);
    expect(isDefinitiveRejection(null)).toBe(false);
  });
});

describe('isSessionClosedCode', () => {
  it('P0001 é código de sessão fechada', () => {
    expect(isSessionClosedCode('P0001')).toBe(true);
  });
  it('qualquer outro código não é', () => {
    expect(isSessionClosedCode('23505')).toBe(false);
    expect(isSessionClosedCode(null)).toBe(false);
  });
});

describe('computeBackoff — exponencial com teto e jitter, nunca por tentativa (D-11)', () => {
  it('cresce com o número de tentativas e respeita o teto configurado', () => {
    const now = '2026-08-12T10:00:00.000Z';
    const nowMs = new Date(now).getTime();
    const t0 = new Date(computeBackoff(0, now)).getTime();
    const t3 = new Date(computeBackoff(3, now)).getTime();
    expect(t0).toBeGreaterThan(nowMs);
    expect(t3).toBeGreaterThan(t0);

    const tBig = new Date(computeBackoff(30, now)).getTime();
    expect(tBig - nowMs).toBeLessThanOrEqual(OUTBOX_CONFIG.backoffMaxMs + 1000);
  });
});

describe('isExpired — desistência por IDADE, nunca por tentativa (D-11)', () => {
  it('idade além de maxAgeDays expira', () => {
    const enqueued = '2026-08-01T00:00:00.000Z';
    const now = '2026-08-12T00:00:00.000Z'; // 11 dias > maxAgeDays (7)
    expect(isExpired(enqueued, now)).toBe(true);
  });

  it('dentro do prazo não expira', () => {
    const enqueued = '2026-08-11T00:00:00.000Z';
    const now = '2026-08-12T00:00:00.000Z';
    expect(isExpired(enqueued, now)).toBe(false);
  });
});

describe('buildQuarantineItem / pruneExpiredQuarantine (D-07)', () => {
  it('constrói item de quarentena com reason/code/expiresAt no futuro', () => {
    const item = makeItem();
    const q = buildQuarantineItem(item, 'código definitivo', '23505', '2026-08-12T10:00:00.000Z');
    expect(q.reason).toBe('código definitivo');
    expect(q.code).toBe('23505');
    expect(new Date(q.expiresAt).getTime()).toBeGreaterThan(
      new Date('2026-08-12T10:00:00.000Z').getTime(),
    );
  });

  it('pruneExpiredQuarantine remove entradas vencidas e mantém as vivas — expira sozinho, sem crescer sem teto', () => {
    const expired = {
      ...buildQuarantineItem(makeItem({ id: 'a' }), 'x', null, '2026-01-01T00:00:00.000Z'),
      expiresAt: '2026-01-02T00:00:00.000Z',
    };
    const alive = buildQuarantineItem(makeItem({ id: 'b' }), 'y', null, '2026-08-12T00:00:00.000Z');
    const result = pruneExpiredQuarantine([expired, alive], '2026-08-12T00:00:00.000Z');
    expect(result.map((q) => q.id)).toEqual(['b']);
  });
});
