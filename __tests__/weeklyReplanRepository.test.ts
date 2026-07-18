// __tests__/weeklyReplanRepository.test.ts
// Fase 6 — I/O do replanejamento. Modos de falha cobertos:
// - contexto marca as séries de replans ANTERIORES (insumo do "não empilhar")
//   e conta as séries executadas por sessão;
// - aplicação: INSERT copia o alvo da última série ORIGINAL (nada inventado),
//   snapshot é MERGE (nunca apaga eventos) e vem ANTES do skip (se o skip
//   falhar, o teto ainda enxerga os adds); skip só atinge sessão ainda pendente;
// - snapshot falhou → séries recém-inseridas são removidas e o erro PROPAGA
//   (nada fica aplicado sem registro).

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import {
  getWeekReplanContext,
  applyConfirmedReplan,
  type WeekReplanContext,
} from '../src/services/weeklyReplanRepository';
import type { WeeklyReplanProposal } from '../src/engine/weeklyReplanner';

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
// getWeekReplanContext
// ---------------------------------------------------------------

it('contexto: ordena, marca séries de replans anteriores e conta o executado', async () => {
  const sessoes = builder({
    data: [
      {
        id: 'qua',
        week_number: 1,
        title: 'Treino B',
        session_type: 'Hipertrofia',
        scheduled_date: '2026-07-15',
        status: 'pending',
        estimated_minutes: '60', // numeric pode vir string
        planned_exercises: [
          {
            id: 'e2',
            name: 'Crucifixo',
            muscle_group: 'Peito',
            priority: 'accessory',
            exercise_order: 2,
            planned_sets: [{ id: 's3', set_order: 1, target_reps_min: 10, target_reps_max: 12, target_load_kg: null, target_rir: null }],
          },
          {
            id: 'e1',
            name: 'Supino',
            muscle_group: 'Peito',
            priority: 'primary',
            exercise_order: 1,
            planned_sets: [
              { id: 's2', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: '40', target_rir: 2 },
              { id: 's1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: '40', target_rir: 2 },
            ],
          },
        ],
      },
    ],
    error: null,
  });
  const logs = builder({
    data: [
      {
        id: 'log-a',
        planned_session_id: 'qua',
        adherence_snapshot: {
          version: 1,
          events: [
            {
              redistribution: {
                missedSessions: [],
                addedSets: [{ id: 's3', sessionId: 'qua', exerciseId: 'e2', setOrder: 1 }],
                losses: [],
              },
              timeCut: null,
            },
          ],
        },
        set_logs: [{ id: 'sl1' }, { id: 'sl2' }],
      },
      { id: 'log-b', planned_session_id: 'qua', adherence_snapshot: null, set_logs: [{ id: 'sl3' }] },
    ],
    error: null,
  });
  fromMock.mockReturnValueOnce(sessoes).mockReturnValueOnce(logs);

  const ctx = await getWeekReplanContext('user-1', 'plan-1', 1);

  // exercícios/séries ordenados no cliente
  expect(ctx.sessions[0].exercises.map((e) => e.id)).toEqual(['e1', 'e2']);
  expect(ctx.sessions[0].exercises[0].sets.map((s) => s.setOrder)).toEqual([1, 2]);
  // série inserida por replan anterior vem marcada (insumo do teto)
  expect(ctx.sessions[0].exercises[1].sets[0].addedByReplan).toBe(true);
  expect(ctx.sessions[0].exercises[0].sets[0].addedByReplan).toBe(false);
  // executado soma TODOS os logs da sessão
  expect(ctx.completedSetsBySession).toEqual({ qua: 3 });
  // numeric coagido e rótulo exibível
  expect(ctx.sessions[0].estimatedMinutes).toBe(60);
  expect(ctx.sessionLabelById.qua).toBe('Treino B · 2026-07-15');
  expect(ctx.snapshotBySessionLogId['log-a']).toBeDefined();
});

// ---------------------------------------------------------------
// applyConfirmedReplan
// ---------------------------------------------------------------

const contextoBase = (): WeekReplanContext => ({
  planId: 'plan-1',
  weekNumber: 1,
  userId: 'user-1',
  sessions: [
    {
      id: 'seg',
      weekNumber: 1,
      title: 'Treino A',
      sessionType: 'Hipertrofia',
      scheduledDate: '2026-07-13',
      status: 'pending',
      estimatedMinutes: 60,
      exercises: [],
    },
    {
      id: 'sex',
      weekNumber: 1,
      title: 'Treino C',
      sessionType: 'Hipertrofia',
      scheduledDate: '2026-07-17',
      status: 'pending',
      estimatedMinutes: 60,
      exercises: [],
    },
  ],
  completedSetsBySession: {},
  sessionLabelById: {},
  raw: [
    {
      id: 'sex',
      week_number: 1,
      title: 'Treino C',
      session_type: 'Hipertrofia',
      scheduled_date: '2026-07-17',
      status: 'pending',
      estimated_minutes: 60,
      planned_exercises: [
        {
          id: 'f1',
          name: 'Supino',
          muscle_group: 'Peito',
          priority: 'primary',
          exercise_order: 1,
          planned_sets: [
            { id: 'ps1', set_order: 1, target_reps_min: 8, target_reps_max: 12, target_load_kg: '40', target_rir: 2 },
            { id: 'ps2', set_order: 2, target_reps_min: 8, target_reps_max: 12, target_load_kg: '42.5', target_rir: 2 },
          ],
        },
      ],
    },
  ] as any,
  snapshotBySessionLogId: {
    'log-1': {
      version: 1,
      events: [
        {
          confirmedAtISO: '2026-07-10T09:00:00Z',
          planId: 'plan-1',
          weekNumber: 1,
          adherence: { sessionsDue: 0, sessionsCompleted: 0, sessionRate: null, setsDue: 0, setsCompleted: 0, volumeRate: null },
          redistribution: null,
          timeCut: null,
        },
      ],
    },
  },
});

const propostaBase = (): WeeklyReplanProposal => ({
  adherence: { sessionsDue: 2, sessionsCompleted: 0, sessionRate: 0, setsDue: 4, setsCompleted: 0, volumeRate: 0 },
  timeCut: {
    kind: 'time_cut',
    sessionId: 'hoje',
    availableMinutes: 40,
    estimatedMinutes: 60,
    ratio: 40 / 60,
    keptPriorities: ['primary', 'secondary'],
    cutExercises: [{ exerciseId: 'ex-2', name: 'Tríceps', priority: 'accessory', muscleGroup: 'Tríceps', setsCut: 3 }],
  },
  redistribution: {
    kind: 'missed_redistribution',
    missedSessionIds: ['seg'],
    additions: [{ targetSessionId: 'sex', exerciseId: 'f1', exerciseName: 'Supino', muscleGroup: 'Peito', addSets: 2 }],
    losses: [{ missedSessionId: 'seg', muscleGroup: 'Peito', sets: 2, reason: 'nao_coube' }],
  },
  hasChanges: true,
});

it('aplica confirmado: insere copiando o alvo, snapshot MERGE antes do skip, skip só pendente', async () => {
  const ordem: string[] = [];
  const insertB = builder({
    data: [
      { id: 'novo-1', exercise_id: 'f1', set_order: 3, target_reps_min: 8, target_reps_max: 12, target_load_kg: '42.5', target_rir: 2 },
      { id: 'novo-2', exercise_id: 'f1', set_order: 4, target_reps_min: 8, target_reps_max: 12, target_load_kg: '42.5', target_rir: 2 },
    ],
    error: null,
  });
  const snapB = builder({ data: [{ id: 'log-1' }], error: null });
  const skipB = builder({ data: null, error: null });
  fromMock.mockImplementation((table: string) => {
    ordem.push(table);
    if (table === 'planned_sets') return insertB;
    if (table === 'session_logs') return snapB;
    return skipB;
  });

  const { addedSets } = await applyConfirmedReplan({
    context: contextoBase(),
    proposal: propostaBase(),
    sessionLogId: 'log-1',
    confirmedAtISO: '2026-07-17T12:00:00Z',
  });

  // INSERT: 2 linhas copiando a ÚLTIMA série original (42.5) e ordem sequencial
  const linhas = insertB.insert.mock.calls[0][0];
  expect(linhas).toEqual([
    expect.objectContaining({ exercise_id: 'f1', set_order: 3, target_load_kg: '42.5', target_reps_min: 8, target_reps_max: 12, target_rir: 2 }),
    expect.objectContaining({ exercise_id: 'f1', set_order: 4 }),
  ]);
  // retorno coagido (numeric string → number) e com a sessão dona
  expect(addedSets).toEqual([
    expect.objectContaining({ id: 'novo-1', sessionId: 'sex', setOrder: 3, targetLoadKg: 42.5 }),
    expect.objectContaining({ id: 'novo-2', sessionId: 'sex', setOrder: 4 }),
  ]);

  // snapshot: MERGE (evento antigo preservado + novo com os IDs inseridos)
  const payload = snapB.update.mock.calls[0][0];
  expect(payload.available_minutes).toBe(40);
  expect(payload.adherence_snapshot.events).toHaveLength(2);
  expect(payload.adherence_snapshot.events[1].redistribution.addedSets.map((r: any) => r.id)).toEqual(['novo-1', 'novo-2']);
  expect(payload.adherence_snapshot.events[1].redistribution.missedSessions).toEqual([
    { id: 'seg', originalStatus: 'pending' },
  ]);

  // ordem: inserir → snapshot → skip (snapshot ANTES do skip)
  expect(ordem).toEqual(['planned_sets', 'session_logs', 'planned_sessions']);
  // skip: restrito ao dono e a quem AINDA está pendente
  expect(skipB.update.mock.calls[0][0]).toEqual({ status: 'skipped' });
  expect(skipB.in).toHaveBeenCalledWith('id', ['seg']);
  expect(skipB.eq).toHaveBeenCalledWith('status', 'pending');
  expect(skipB.eq).toHaveBeenCalledWith('user_id', 'user-1');
});

it('snapshot falhou → remove as séries recém-inseridas, NÃO pula sessão e propaga', async () => {
  const insertB = builder({
    data: [{ id: 'novo-1', exercise_id: 'f1', set_order: 3, target_reps_min: 8, target_reps_max: 12, target_load_kg: null, target_rir: null }],
    error: null,
  });
  const snapB = builder({ data: null, error: { message: 'permission denied' } });
  const rollbackB = builder({ data: null, error: null });
  const tabelas: string[] = [];
  fromMock.mockImplementation((table: string) => {
    tabelas.push(table);
    if (table === 'session_logs') return snapB;
    if (tabelas.filter((t) => t === 'planned_sets').length === 1 && table === 'planned_sets') return insertB;
    return rollbackB;
  });

  await expect(
    applyConfirmedReplan({
      context: contextoBase(),
      proposal: propostaBase(),
      sessionLogId: 'log-1',
      confirmedAtISO: '2026-07-17T12:00:00Z',
    }),
  ).rejects.toMatchObject({ message: 'permission denied' });

  // rollback das inseridas; nenhuma sessão marcada como pulada
  expect(rollbackB.delete).toHaveBeenCalled();
  expect(rollbackB.in).toHaveBeenCalledWith('id', ['novo-1']);
  expect(tabelas).not.toContain('planned_sessions');
});

it('snapshot com 0 linhas atualizadas = falha (log alheio/inexistente não passa em silêncio)', async () => {
  const insertB = builder({ data: [], error: null });
  const snapB = builder({ data: [], error: null }); // RLS filtrou → nada atualizado
  fromMock.mockImplementation((table: string) => (table === 'session_logs' ? snapB : insertB));

  const proposta = { ...propostaBase(), redistribution: null };
  await expect(
    applyConfirmedReplan({
      context: contextoBase(),
      proposal: proposta,
      sessionLogId: 'log-1',
      confirmedAtISO: '2026-07-17T12:00:00Z',
    }),
  ).rejects.toThrow('Não foi possível registrar o replanejamento.');
});

it('só corte de tempo: nada inserido, nada pulado; grava available_minutes + evento', async () => {
  const snapB = builder({ data: [{ id: 'log-1' }], error: null });
  const tabelas: string[] = [];
  fromMock.mockImplementation((table: string) => {
    tabelas.push(table);
    return snapB;
  });

  const proposta = { ...propostaBase(), redistribution: null };
  const { addedSets } = await applyConfirmedReplan({
    context: contextoBase(),
    proposal: proposta,
    sessionLogId: 'log-1',
    confirmedAtISO: '2026-07-17T12:00:00Z',
  });

  expect(addedSets).toEqual([]);
  expect(tabelas).toEqual(['session_logs']);
  const payload = snapB.update.mock.calls[0][0];
  expect(payload.available_minutes).toBe(40);
  expect(payload.adherence_snapshot.events[1].timeCut.cutExercises).toEqual([
    { exerciseId: 'ex-2', name: 'Tríceps', setsCut: 3 },
  ]);
});
