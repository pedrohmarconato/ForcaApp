// __tests__/redistribuicaoRemovida.test.ts
// Trava do COMMIT B da escada de reencaixe: a redistribuição de volume
// pós-falta (planMissedRedistribution e consumidores) foi REMOVIDA da
// proposta semanal. Este teste falha ANTES da remoção (vermelho) e passa
// DEPOIS (verde):
//  - replanByRules não devolve mais o campo `redistribution` e `hasChanges`
//    passa a refletir só o corte de tempo;
//  - applyConfirmedReplan nunca mais escreve séries em planned_sets nem
//    marca sessões como 'skipped';
//  - o corte de tempo (escada ~100/66/45%) e o snapshot do log CONTINUAM:
//    available_minutes segue sendo gravado junto do adherence_snapshot.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import {
  applyConfirmedReplan,
  type WeekReplanContext,
} from '../src/services/weeklyReplanRepository';
import {
  replanByRules,
  type ReplanExercise,
  type ReplanSession,
  type ReplanSetRef,
  type WeeklyReplanProposal,
} from '../src/engine/weeklyReplanner';

const fromMock = supabase.from as jest.Mock;

// Builder genérico: registra as chamadas e resolve com o resultado dado.
const builder = (result: { data: unknown; error: unknown }) => {
  const b: any = { calls: [] as { method: string; args: unknown[] }[] };
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit', 'insert', 'update', 'delete']) {
    b[m] = jest.fn((...args: unknown[]) => {
      b.calls.push({ method: m, args });
      return b;
    });
  }
  b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
  return b;
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// Fixtures compactas
// ---------------------------------------------------------------

const sets = (exerciseId: string, n: number): ReplanSetRef[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${exerciseId}-s${i + 1}`,
    setOrder: i + 1,
  }));

const ex = (
  id: string,
  muscleGroup: string | null,
  priority: ReplanExercise['priority'],
  nSets: number,
): ReplanExercise => ({
  id,
  name: `Exercício ${id}`,
  muscleGroup,
  priority,
  exerciseOrder: 1,
  sets: sets(id, nSets),
});

const sess = (
  id: string,
  scheduledDate: string | null,
  exercises: ReplanExercise[],
  over: Partial<ReplanSession> = {},
): ReplanSession => ({
  id,
  weekNumber: 1,
  title: `Treino ${id}`,
  sessionType: 'Hipertrofia',
  scheduledDate,
  status: 'pending',
  estimatedMinutes: 60,
  exercises,
  ...over,
});

// ---------------------------------------------------------------
// replanByRules — sem redistribuição
// ---------------------------------------------------------------

describe('replanByRules (COMMIT B)', () => {
  it('só com falta atrasada: proposta SEM redistribution e SEM hasChanges', () => {
    const sessions = [
      sess('perdida', '2026-07-27', [ex('p1', 'peito', 'primary', 3)]),
      sess('hoje', '2026-07-29', [ex('h1', 'peito', 'primary', 4)]),
    ];
    const proposal = replanByRules({
      sessions,
      todayISO: '2026-07-29',
      currentSessionId: 'hoje',
    });
    expect('redistribution' in proposal).toBe(false);
    expect(proposal.timeCut).toBeNull();
    expect(proposal.hasChanges).toBe(false);
  });

  it('corte de tempo CONTINUA na proposta e sustenta hasChanges sozinho', () => {
    const sessions = [
      sess('perdida', '2026-07-27', [ex('p1', 'peito', 'primary', 3)]),
      sess('hoje', '2026-07-29', [
        ex('h1', 'peito', 'primary', 4),
        ex('h2', 'ombros', 'accessory', 2),
      ]),
    ];
    const proposal = replanByRules({
      sessions,
      todayISO: '2026-07-29',
      currentSessionId: 'hoje',
      availableMinutes: 30, // 30/60 → degrau "só primários"
    });
    expect('redistribution' in proposal).toBe(false);
    expect(proposal.timeCut).not.toBeNull();
    expect(proposal.timeCut?.cutExercises.map((c) => c.exerciseId)).toContain('h2');
    expect(proposal.hasChanges).toBe(true);
  });
});

// ---------------------------------------------------------------
// applyConfirmedReplan — snapshot only, nunca insere nem pula
// ---------------------------------------------------------------

describe('applyConfirmedReplan (COMMIT B)', () => {
  it('nunca escreve planned_sets nem marca skipped; só grava o snapshot', async () => {
    const sessions = [
      sess('perdida', '2026-07-27', [ex('p1', 'peito', 'primary', 3)]),
      sess('hoje', '2026-07-29', [
        ex('h1', 'peito', 'primary', 4),
        ex('h2', 'ombros', 'accessory', 2),
      ]),
    ];
    const context: WeekReplanContext = {
      planId: 'plan-1',
      weekNumber: 1,
      userId: 'user-1',
      sessions,
      completedSetsBySession: {},
      sessionLabelById: {},
      raw: sessions.map((s) => ({
        id: s.id,
        week_number: s.weekNumber,
        title: s.title,
        session_type: s.sessionType,
        scheduled_date: s.scheduledDate,
        status: s.status,
        estimated_minutes: s.estimatedMinutes,
        order_in_week: 1,
        planned_exercises: s.exercises.map((e) => ({
          id: e.id,
          name: e.name,
          muscle_group: e.muscleGroup,
          priority: e.priority,
          exercise_order: e.exerciseOrder,
          planned_sets: e.sets.map((s2) => ({
            id: s2.id,
            set_order: s2.setOrder,
            target_reps_min: 8,
            target_reps_max: 10,
            target_load_kg: '40',
            target_rir: 2,
          })),
        })),
      })) as WeekReplanContext['raw'],
      snapshotBySessionLogId: {},
    };

    // Proposta que ANTES da remoção levaria a INSERT em planned_sets
    // (adição na sessão de hoje) e a 'skipped' na sessão perdida.
    const proposal = {
      adherence: {
        sessionsDue: 1,
        sessionsCompleted: 0,
        sessionRate: 0,
        setsDue: 3,
        setsCompleted: 0,
        volumeRate: 0,
      },
      timeCut: {
        kind: 'time_cut',
        sessionId: 'hoje',
        availableMinutes: 30,
        estimatedMinutes: 60,
        ratio: 0.5,
        keptPriorities: ['primary'],
        cutExercises: [{ exerciseId: 'h2', name: 'Exercício h2', priority: 'accessory', muscleGroup: 'ombros', setsCut: 2 }],
      },
      redistribution: {
        kind: 'missed_redistribution',
        missedSessionIds: ['perdida'],
        additions: [{ targetSessionId: 'hoje', exerciseId: 'h1', exerciseName: 'Exercício h1', muscleGroup: 'peito', addSets: 1 }],
        losses: [],
      },
      hasChanges: true,
    } as WeeklyReplanProposal;

    const b = builder({ data: [{ id: 'log-1' }], error: null });
    fromMock.mockReturnValue(b);

    await applyConfirmedReplan({
      context,
      proposal,
      sessionLogId: 'log-1',
      confirmedAtISO: '2026-07-29T10:00:00.000Z',
    });

    const tabelas = fromMock.mock.calls.map((c) => c[0]);
    expect(tabelas).not.toContain('planned_sets');

    const updates = b.calls.filter((c) => c.method === 'update');
    expect(
      updates.some((u) => (u.args[0] as { status?: string })?.status === 'skipped'),
    ).toBe(false);

    const snap = updates.find((u) => (u.args[0] as { adherence_snapshot?: unknown })?.adherence_snapshot);
    expect(snap).toBeDefined();
    expect((snap.args[0] as { available_minutes?: number }).available_minutes).toBe(30);
  });
});
