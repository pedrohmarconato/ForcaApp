// __tests__/replanFlow.test.ts
// Fase 6 — fluxo no store: abrir a sessão levanta a PROPOSTA de replanejamento
// (overlay em memória, NADA escrito); recusa mantém o plano original; confirmar
// aplica via repositório e reflete no rascunho (corte + séries adicionadas na
// sessão atual). Store/motor REAIS; só a fronteira de rede é mockada.

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(error: any, options: { kind?: 'transport' | 'server'; status?: number } = {}) {
      super(error?.message ?? String(error));
      this.kind = options.kind ?? (options.status === 0 ? 'transport' : 'server');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    startSessionLog: jest.fn(),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(),
    getOpenSessionLog: jest.fn(),
    getLastLoadByExerciseName: jest.fn(),
    updateSetLogAdaptation: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (e: unknown) =>
      e instanceof SessionExecutionRequestError && e.kind === 'transport',
  };
});
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));

import {
  startSessionLog,
  getOpenSessionLog,
  getLastLoadByExerciseName,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft } from '../src/services/sessionDraftStorage';
import {
  getWeekReplanContext,
  applyConfirmedReplan,
  type WeekReplanContext,
} from '../src/services/weeklyReplanRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;
const store = () => useActiveSessionStore.getState();

const makeDetail = (): SessionDetail => ({
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 2,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2020-01-07',
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito'],
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 'sess-1',
      exercise_order: 1,
      name: 'Supino Reto',
      muscle_group: 'Peito',
      priority: 'primary',
      equipment: 'Barra',
      load_increment_kg: 2.5,
      rest_seconds: 90,
      target_rm_percent: 75,
      sets_planned: 2,
      reps_raw: '8-10',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
    {
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Tríceps Corda',
      muscle_group: 'Tríceps',
      priority: 'accessory',
      equipment: 'Polia',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '10-12',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-3', exercise_id: 'ex-2', set_order: 1, target_reps_min: 10, target_reps_max: 12, target_load_kg: null, target_rir: null },
      ],
    },
  ],
});

// Semana: segunda PERDIDA (peito, 4 séries) + a sessão de hoje (em andamento).
// Teto da receptora: floor(0.25 × 4) = 1 série no ex-1.
const makeContext = (): WeekReplanContext => ({
  planId: 'plan-1',
  weekNumber: 1,
  userId: 'user-1',
  sessions: [
    {
      id: 'seg',
      weekNumber: 1,
      title: 'Treino A',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-05',
      status: 'pending',
      estimatedMinutes: 60,
      exercises: [
        {
          id: 'm1',
          name: 'Supino Inclinado',
          muscleGroup: 'Peito',
          priority: 'primary',
          exerciseOrder: 1,
          sets: [1, 2, 3, 4].map((i) => ({ id: `m1-s${i}`, setOrder: i })),
        },
      ],
    },
    {
      id: 'sess-1',
      weekNumber: 1,
      title: 'Push A',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-07',
      status: 'in_progress',
      estimatedMinutes: 60,
      exercises: [
        {
          id: 'ex-1',
          name: 'Supino Reto',
          muscleGroup: 'Peito',
          priority: 'primary',
          exerciseOrder: 1,
          sets: [1, 2, 3, 4].map((i) => ({ id: `ex1-s${i}`, setOrder: i })),
        },
        {
          id: 'ex-2',
          name: 'Tríceps Corda',
          muscleGroup: 'Tríceps',
          priority: 'accessory',
          exerciseOrder: 2,
          sets: [{ id: 'ex2-s1', setOrder: 1 }],
        },
      ],
    },
  ],
  completedSetsBySession: {},
  sessionLabelById: { seg: 'Treino A · 2020-01-05', 'sess-1': 'Push A · 2020-01-07' },
  raw: [] as any,
  snapshotBySessionLogId: {},
});

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(loadDraft).mockResolvedValue(null);
  mock(saveDraft).mockResolvedValue(undefined);
  mock(getLastLoadByExerciseName).mockResolvedValue({});
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'log-1', startedAt: '2020-01-07T10:00:00Z' });
  mock(getWeekReplanContext).mockResolvedValue(makeContext());
  mock(applyConfirmedReplan).mockResolvedValue({ addedSets: [] });
});

const abrir = async () => {
  const detail = makeDetail();
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
  await store().computeReplan(detail);
};

it('abrir a sessão LEVANTA a proposta (falta detectada); nada é aplicado sem confirmação', async () => {
  await abrir();
  const pr = store().pendingReplan;
  expect(pr).not.toBeNull();
  expect(pr!.proposal.hasChanges).toBe(true);
  expect(pr!.proposal.redistribution!.missedSessionIds).toEqual(['seg']);
  expect(pr!.proposal.redistribution!.additions).toEqual([
    expect.objectContaining({ targetSessionId: 'sess-1', exerciseId: 'ex-1', addSets: 1 }),
  ]);
  // proposta é SÓ overlay: nenhuma escrita aconteceu
  expect(mock(applyConfirmedReplan)).not.toHaveBeenCalled();
  // e o rascunho segue com as séries originais
  expect(store().draft!.exercises[0].sets).toHaveLength(2);
});

it('RECUSA mantém tudo: nada escrito, e o recálculo de tempo não ressuscita a redistribuição', async () => {
  await abrir();
  store().declineReplan();
  expect(store().pendingReplan!.proposal.hasChanges).toBe(false);
  expect(mock(applyConfirmedReplan)).not.toHaveBeenCalled();

  // "menos tempo hoje" depois da recusa: só o corte entra na proposta
  store().requestTimeCut(40);
  const pr = store().pendingReplan!;
  expect(pr.proposal.timeCut).not.toBeNull();
  expect(pr.proposal.redistribution).toBeNull();
  expect(mock(applyConfirmedReplan)).not.toHaveBeenCalled();
});

it('CONFIRMAR aplica via repositório e reflete no rascunho (corte + série adicionada hoje)', async () => {
  mock(applyConfirmedReplan).mockResolvedValue({
    addedSets: [
      {
        id: 'novo-1',
        sessionId: 'sess-1',
        exerciseId: 'ex-1',
        setOrder: 3,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetLoadKg: null,
        targetRir: 2,
      },
    ],
  });
  await abrir();
  store().requestTimeCut(40); // corta o acessório ex-2

  const ok = await store().confirmReplan();
  expect(ok).toBe(true);
  expect(mock(applyConfirmedReplan)).toHaveBeenCalledTimes(1);
  expect(mock(applyConfirmedReplan).mock.calls[0][0]).toMatchObject({ sessionLogId: 'log-1' });

  const draft = store().draft!;
  // corte refletido no rascunho
  expect(draft.exercises.find((e) => e.exerciseId === 'ex-2')!.cutByReplan).toBe(true);
  // série inserida na sessão ATUAL anexada ao rascunho
  const setsEx1 = draft.exercises.find((e) => e.exerciseId === 'ex-1')!.sets;
  expect(setsEx1.map((s) => s.plannedSetId)).toEqual(['st-1', 'st-2', 'novo-1']);
  // banner some
  expect(store().pendingReplan).toBeNull();
});

it('falha na aplicação: a proposta FICA de pé e o erro aparece (nunca sucesso otimista)', async () => {
  mock(applyConfirmedReplan).mockRejectedValue(new Error('rede caiu'));
  await abrir();

  const ok = await store().confirmReplan();
  expect(ok).toBe(false);
  expect(store().saveError).toBe('rede caiu');
  expect(store().pendingReplan!.proposal.hasChanges).toBe(true);
  // rascunho intacto
  expect(store().draft!.exercises[0].sets).toHaveLength(2);
});

it('confirmações CONCORRENTES: o repositório é chamado UMA única vez (achado nº 2)', async () => {
  let liberar!: (v: { addedSets: never[] }) => void;
  mock(applyConfirmedReplan).mockImplementation(
    () => new Promise((res) => { liberar = res; }),
  );
  await abrir();

  // duplo-toque: a 2ª confirmação entra enquanto a 1ª ainda está no ar
  const p1 = store().confirmReplan();
  const p2 = store().confirmReplan();
  liberar({ addedSets: [] });
  const [r1, r2] = await Promise.all([p1, p2]);

  expect(mock(applyConfirmedReplan)).toHaveBeenCalledTimes(1);
  expect([r1, r2].sort()).toEqual([false, true]); // uma aplica, a outra é recusada
});

it('falha no SKIP após inserir+registrar: proposta obsoleta é descartada e o retry NÃO re-insere', async () => {
  // O repositório sinaliza que séries+snapshot JÁ persistiram (replanApplied) —
  // reusar a proposta antiga re-inseriria as mesmas séries (achado nº 2).
  const novaSerie = {
    id: 'novo-1',
    sessionId: 'sess-1',
    exerciseId: 'ex-1',
    setOrder: 5,
    targetRepsMin: 8,
    targetRepsMax: 10,
    targetLoadKg: null,
    targetRir: 2,
  };
  mock(applyConfirmedReplan).mockRejectedValueOnce({
    name: 'ReplanApplyError',
    message: 'não foi possível marcar a sessão perdida como pulada',
    stage: 'skip',
    replanApplied: true,
    addedSets: [novaSerie],
  });
  // Recálculo pós-falha vem do SERVIDOR: a série inserida já aparece marcada
  // (teto consumido) → a nova proposta não tem mais adições, só o skip pendente.
  const contextoAtualizado = makeContext();
  contextoAtualizado.sessions[1].exercises[0].sets = [
    ...[1, 2, 3, 4].map((i) => ({ id: `ex1-s${i}`, setOrder: i })),
    { id: 'novo-1', setOrder: 5, addedByReplan: true },
  ];
  mock(getWeekReplanContext)
    .mockResolvedValueOnce(makeContext()) // abrir
    .mockResolvedValueOnce(contextoAtualizado); // refresh pós-falha

  await abrir();
  const ok = await store().confirmReplan();
  expect(ok).toBe(false);

  // o que FOI aplicado reflete no rascunho (série nova anexada) e o erro aparece
  const setsEx1 = store().draft!.exercises.find((e) => e.exerciseId === 'ex-1')!.sets;
  expect(setsEx1.map((s) => s.plannedSetId)).toContain('novo-1');
  expect(store().saveError).toMatch(/pulada/);

  // a proposta foi RECALCULADA do servidor: skip ainda pendente, SEM novas adições
  const pr = store().pendingReplan!;
  expect(pr.proposal.redistribution!.missedSessionIds).toEqual(['seg']);
  expect(pr.proposal.redistribution!.additions).toEqual([]);

  // retry: aplica de novo SÓ com o skip (nenhuma série para inserir)
  mock(applyConfirmedReplan).mockResolvedValueOnce({ addedSets: [] });
  const ok2 = await store().confirmReplan();
  expect(ok2).toBe(true);
  const segundaChamada = mock(applyConfirmedReplan).mock.calls[1][0];
  expect(segundaChamada.proposal.redistribution.additions).toEqual([]);
  // e o rascunho não ganhou série duplicada
  const setsDepois = store().draft!.exercises.find((e) => e.exerciseId === 'ex-1')!.sets;
  expect(setsDepois.filter((s) => s.plannedSetId === 'novo-1')).toHaveLength(1);
});

it('conflito de unicidade no INSERT (23505 = outro aparelho aplicou antes): descarta a proposta obsoleta e recalcula do servidor', async () => {
  // Backstop da migration 0007 (índice único em planned_sets(exercise_id,
  // set_order)): dois aparelhos com o mesmo contexto geram os MESMOS set_order —
  // o segundo INSERT falha com 23505. Nada desta tentativa persistiu, mas a
  // proposta está obsoleta: reaplicá-la falharia para sempre.
  mock(applyConfirmedReplan).mockRejectedValueOnce({
    name: 'ReplanApplyError',
    message: 'duplicate key value violates unique constraint "planned_sets_exercise_set_order_key"',
    stage: 'insert',
    replanApplied: false,
    addedSets: [],
    cause: { code: '23505' },
  });
  // Refresh do servidor: o OUTRO aparelho já aplicou tudo — série inserida
  // (marcada como de replan) e a sessão perdida já 'skipped'.
  const contextoAtualizado = makeContext();
  contextoAtualizado.sessions[0].status = 'skipped';
  contextoAtualizado.sessions[1].exercises[0].sets = [
    ...[1, 2, 3, 4].map((i) => ({ id: `ex1-s${i}`, setOrder: i })),
    { id: 'outro-1', setOrder: 5, addedByReplan: true },
  ];
  mock(getWeekReplanContext)
    .mockResolvedValueOnce(makeContext()) // abrir
    .mockResolvedValueOnce(contextoAtualizado); // refresh pós-conflito

  await abrir();
  store().requestTimeCut(40); // corte + adição na mesma proposta
  const ok = await store().confirmReplan();
  expect(ok).toBe(false);

  // NADA desta tentativa persistiu → rascunho intacto: sem corte e sem série nova
  const draft = store().draft!;
  expect(draft.exercises.find((e) => e.exerciseId === 'ex-2')!.cutByReplan).not.toBe(true);
  expect(draft.exercises.find((e) => e.exerciseId === 'ex-1')!.sets).toHaveLength(2);

  // o erro explica o conflito, sem sucesso otimista
  expect(store().saveError).toMatch(/outro aparelho/i);

  // a proposta obsoleta foi DESCARTADA e recalculada do servidor: a falta já foi
  // resolvida pelo outro aparelho → nada a propor (retry nunca re-insere)
  expect(mock(getWeekReplanContext)).toHaveBeenCalledTimes(2);
  const pr = store().pendingReplan;
  expect(pr === null || pr.proposal.hasChanges === false).toBe(true);
  expect(mock(applyConfirmedReplan)).toHaveBeenCalledTimes(1);
});

it('proposta de OUTRA sessão não é aplicável (troca de sessão descarta, nada escreve)', async () => {
  await abrir();
  // troca de sessão sem passar pela tela: novo log, proposta antiga fica órfã
  useActiveSessionStore.setState({
    draft: { ...store().draft!, sessionLogId: 'log-outro' },
  });
  const ok = await store().confirmReplan();
  expect(ok).toBe(false);
  expect(store().pendingReplan).toBeNull();
  expect(mock(applyConfirmedReplan)).not.toHaveBeenCalled();
});

it('replanejamento indisponível (offline) NÃO derruba a sessão', async () => {
  mock(getWeekReplanContext).mockRejectedValue(new Error('sem rede'));
  const detail = makeDetail();
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
  await store().computeReplan(detail);
  expect(store().status).toBe('active');
  expect(store().pendingReplan).toBeNull();
  expect(store().saveError).toBeNull();
});

it('retomada reaplica um corte de tempo já CONFIRMADO (registro do servidor)', async () => {
  mock(getOpenSessionLog).mockResolvedValue({
    sessionLogId: 'log-1',
    startedAt: '2020-01-07T10:00:00Z',
    setLogs: [],
    availableMinutes: 40,
    adherenceSnapshot: {
      version: 1,
      events: [
        {
          confirmedAtISO: '2020-01-07T10:05:00Z',
          planId: 'plan-1',
          weekNumber: 1,
          adherence: { sessionsDue: 0, sessionsCompleted: 0, sessionRate: null, setsDue: 0, setsCompleted: 0, volumeRate: null },
          redistribution: null,
          timeCut: {
            sessionId: 'sess-1',
            availableMinutes: 40,
            estimatedMinutes: 60,
            keptPriorities: ['primary', 'secondary'],
            cutExercises: [{ exerciseId: 'ex-2', name: 'Tríceps Corda', setsCut: 1 }],
          },
        },
      ],
    },
  });

  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
  expect(store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!.cutByReplan).toBe(true);
});
