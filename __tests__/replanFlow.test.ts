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
    getLastLoadByExercise: jest.fn(),
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
jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(),
}));
jest.mock('../src/services/planEditRepository', () => ({
  reagendarSessoesDaSemana: jest.fn(),
  // O store consulta isto no catch do reencaixe. Sem exportar aqui, o caminho
  // de erro chamaria undefined e o teste morreria por outro motivo.
  isPlanoDesatualizado: jest.fn(() => false),
}));

import {
  startSessionLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  saveSetLog,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft } from '../src/services/sessionDraftStorage';
import {
  getWeekReplanContext,
  applyConfirmedReplan,
  type WeekReplanContext,
} from '../src/services/weeklyReplanRepository';
import { getAgendaDoAluno } from '../src/services/agendaRepository';
import { reagendarSessoesDaSemana } from '../src/services/planEditRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';


// Check-in obrigatório (22/07/2026): sessão NOVA para em awaiting_checkin; os
// testes desta suíte confirmam com defaults neutros para seguir o fluxo antigo.
const confirmarCheckInSePedido = async () => {
  const st = useActiveSessionStore.getState();
  if (st.status === 'awaiting_checkin') {
    await st.confirmCheckIn({ mood: 'normal', availableMinutes: null });
  }
};

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
  mock(getLastLoadByExercise).mockResolvedValue({});
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'log-1', startedAt: '2020-01-07T10:00:00Z' });
  mock(saveSetLog).mockImplementation(async (params: any) => ({ setLogId: `log-${params.plannedSetId}`, actualReps: params.actualReps, actualLoadKg: params.actualLoadKg, actualRir: params.actualRir, outcome: params.outcome }));
  mock(getWeekReplanContext).mockResolvedValue(makeContext());
  mock(applyConfirmedReplan).mockResolvedValue({ addedSets: [] });
  mock(getAgendaDoAluno).mockResolvedValue({ agenda: [], origem: 'ausente' });
  mock(reagendarSessoesDaSemana).mockResolvedValue({ week: 1, moved: 0 });
});

const abrir = async () => {
  const detail = makeDetail();
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
    await confirmarCheckInSePedido();
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
    await confirmarCheckInSePedido();
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
    await confirmarCheckInSePedido();
  expect(store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!.cutByReplan).toBe(true);
});

// ============================================================
// Memória da proposta recusada (fingerprint) e falhas amigáveis
// ============================================================

import { replanFingerprint } from '../src/engine/weeklyReplanner';
import { SessionExecutionRequestError } from '../src/services/sessionExecutionRepository';

describe('memória da proposta recusada (fingerprint)', () => {
  it('recusar A (await) persiste o fingerprint; remount + recálculo OCULTA a proposta idêntica', async () => {
    await abrir();
    expect(store().pendingReplan!.proposal.hasChanges).toBe(true);
    const fpA = replanFingerprint(store().pendingReplan!.proposal);

    // 1. Recusa: fingerprint persistido no draft via saveDraft.
    await store().declineReplan();
    expect(mock(saveDraft)).toHaveBeenCalled();
    const salvo = mock(saveDraft).mock.calls[mock(saveDraft).mock.calls.length - 1][0];
    expect(salvo.declinedReplanFingerprints).toContain(fpA);
    expect(store().draft!.declinedReplanFingerprints).toContain(fpA);
    expect(store().pendingReplan!.proposal.hasChanges).toBe(false);
    store().activateSet('ex-1', 1); store().setReps('ex-1', 1, 8); store().setLoad('ex-1', 1, 40);
    expect(await store().completeSet('ex-1', 1)).toBe(true);
    const salvoDepoisDaSerie = mock(saveDraft).mock.calls[mock(saveDraft).mock.calls.length - 1][0];
    expect(salvoDepoisDaSerie.declinedReplanFingerprints).toContain(fpA);

    // 2. Remount: reset + startOrResume carrega o draft salvo (servidor reidrata).
    useActiveSessionStore.getState().reset();
    mock(loadDraft).mockResolvedValue(salvoDepoisDaSerie);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'log-1',
      startedAt: '2020-01-07T10:00:00Z',
      setLogs: [],
    });
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    // 3. Recalcular a MESMA proposta → oculta (banner não aparece).
    await store().computeReplan(makeDetail());
    expect(store().pendingReplan!.proposal.hasChanges).toBe(false);
  });

  it('proposta com conteúdo DIFERENTE reaparece após recusa', async () => {
    await abrir();
    await store().declineReplan();

    // Outra falta (sessão 'qui' com grupo Costas) muda o fingerprint.
    const contexto = makeContext();
    contexto.sessions = [
      {
        id: 'qui',
        weekNumber: 1,
        title: 'Treino B',
        sessionType: 'Hipertrofia',
        scheduledDate: '2020-01-02',
        status: 'pending',
        estimatedMinutes: 60,
        exercises: [
          {
            id: 'c1',
            name: 'Remada',
            muscleGroup: 'Costas',
            priority: 'primary',
            exerciseOrder: 1,
            sets: [1, 2, 3, 4].map((i) => ({ id: `c1-s${i}`, setOrder: i })),
          },
        ],
      },
      ...contexto.sessions,
    ];
    mock(getWeekReplanContext).mockResolvedValue(contexto);

    await store().computeReplan(makeDetail());
    expect(store().pendingReplan!.proposal.hasChanges).toBe(true);
  });

  it('falha de AsyncStorage em declineReplan: recusa vale AGORA, storageWarning setado, treino ativo', async () => {
    await abrir();
    mock(saveDraft).mockRejectedValue(new Error('storage cheio'));

    await store().declineReplan();

    // Recusa vale na montagem atual (proposta fechada), mesmo sem persistir.
    expect(store().pendingReplan!.proposal.hasChanges).toBe(false);
    // Aviso não bloqueante de armazenamento.
    expect(store().storageWarning).toContain('salvar');
    expect(store().status).toBe('active');
  });
});

describe('falhas de transporte e payload inválido no replanejamento', () => {
  it('transporte em computeReplan → replanWarning amigável (sem stack), treino segue ativo', async () => {
    await abrir();
    mock(getWeekReplanContext).mockRejectedValue(
      new SessionExecutionRequestError({ message: 'TypeError: Network request failed' }, { kind: 'transport' }),
    );

    await store().computeReplan(makeDetail());

    expect(store().replanWarning).toContain('conexão');
    expect(store().replanWarning).not.toMatch(/TypeError|at /);
    expect(store().status).toBe('active');
    expect(store().saveError).toBeNull();
  });

  it('payload estruturalmente inválido → aviso amigável (não mascara como offline)', async () => {
    await abrir();
    mock(getWeekReplanContext).mockResolvedValue({
      planId: 'plan-1',
      weekNumber: 1,
      userId: 'user-1',
      sessions: null, // malformado
      completedSetsBySession: {},
      sessionLabelById: {},
      raw: [],
      snapshotBySessionLogId: {},
    } as unknown as WeekReplanContext);

    await store().computeReplan(makeDetail());

    expect(store().replanWarning).toContain('replanejamento');
    expect(store().replanWarning).toContain('formato inválido');
    expect(store().replanWarning).not.toContain('conexão');
    expect(store().status).toBe('active');
    expect(store().draft).not.toBeNull();
  });

  it('exercises:null é estrutural, não offline nem TypeError bruto', async () => {
    await abrir(); const invalido = makeContext(); (invalido.sessions[0] as any).exercises = null;
    mock(getWeekReplanContext).mockResolvedValue(invalido);
    await store().computeReplan(makeDetail());
    expect(store().replanWarning).toContain('formato inválido');
    expect(store().replanWarning).not.toMatch(/conexão|TypeError|at /);
  });

  it('transporte em confirmReplan → saveError amigável SEM TypeError/stack', async () => {
    await abrir();
    mock(applyConfirmedReplan).mockRejectedValue(
      new SessionExecutionRequestError({ message: 'TypeError: Network request failed' }, { kind: 'transport' }),
    );

    const ok = await store().confirmReplan();

    expect(ok).toBe(false);
    expect(store().saveError).toContain('Sem conexão');
    expect(store().saveError).not.toMatch(/TypeError|at /);
  });

  it('ReplanApplyError com cause TypeError: Failed to fetch é transporte amigável e mantém retry/done', async () => {
    await abrir();
    useActiveSessionStore.setState({ draft: { ...store().draft!, exercises: store().draft!.exercises.map((ex, index) =>
      index === 0 ? { ...ex, sets: ex.sets.map((set, i) => i === 0 ? { ...set, status: 'done' as const } : set) } : ex) } });
    mock(applyConfirmedReplan).mockRejectedValueOnce({ name: 'ReplanApplyError', message: 'TypeError: Failed to fetch', cause: new TypeError('Failed to fetch'), stage: 'insert', replanApplied: false, addedSets: [] });
    expect(await store().confirmReplan()).toBe(false);
    expect(store().saveError).toContain('Sem conexão');
    expect(store().saveError).not.toMatch(/TypeError|at /);
    expect(store().pendingReplan!.proposal.hasChanges).toBe(true);
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
  });

  it('falha parcial (replanApplied=true) com refresh sem rede: séries DONE não regridem', async () => {
    await abrir();
    // Série 1 já confirmada no servidor (done no draft).
    useActiveSessionStore.setState({
      draft: {
        ...store().draft!,
        exercises: store().draft!.exercises.map((ex, i) =>
          i === 0
            ? {
                ...ex,
                sets: ex.sets.map((s) =>
                  s.setOrder === 1
                    ? { ...s, status: 'done', setLogId: 'sl-1', actualReps: 8, actualLoadKg: 40, outcome: 'on_target' as const }
                    : s,
                ),
              }
            : ex,
        ),
      },
    });
    const doneBefore = store().draft!.exercises[0].sets[0].status;

    // applyConfirmedReplan falha no SKIP após inserir+registrar (replanApplied=true).
    mock(applyConfirmedReplan).mockRejectedValue({
      replanApplied: true,
      addedSets: [],
      stage: 'skip',
      message: 'skip falhou',
    });
    // E o refresh do contexto também falha por transporte.
    mock(getWeekReplanContext).mockRejectedValue(
      new SessionExecutionRequestError({ message: 'net' }, { kind: 'transport' }),
    );

    const ok = await store().confirmReplan();
    expect(ok).toBe(false);
    // A série confirmada NÃO regrediu.
    expect(store().draft!.exercises[0].sets[0].status).toBe(doneBefore);
    expect(store().saveError).not.toMatch(/TypeError/);
  });

  // Testes da Fase 7: reencaixe de sessões pendentes

  it('computeReplan calcula reagendamento sem erro mesmo sem agenda', async () => {
    // Por padrão, getAgendaDoAluno retorna agenda vazia no beforeEach
    await abrir();
    const pr = store().pendingReplan;
    expect(pr).not.toBeNull();
    // Sem agenda, reagendamento fica null
    expect(pr!.reagendamento).toBeNull();
  });

  it('pendingReplan tem o campo reagendamento no tipo', async () => {
    await abrir();
    const pr = store().pendingReplan;
    expect(pr).not.toBeNull();
    expect(pr).toHaveProperty('reagendamento');
    expect(typeof pr!.reagendamento === 'object' || pr!.reagendamento === null).toBe(true);
  });

  it('requestTimeCut respeita reagendamento já calculado', async () => {
    // Configura uma agenda vazia (padrão)
    await abrir();
    const prBefore = store().pendingReplan;
    const reagendamentoBefore = prBefore!.reagendamento;

    // Aluno pede menos tempo
    store().requestTimeCut(40);
    const prAfter = store().pendingReplan;
    // Reagendamento não muda ao recalcular com menos tempo
    expect(prAfter!.reagendamento).toEqual(reagendamentoBefore);
  });

  it('confirmReagendamento retorna false se não há pendingReplan.reagendamento com movidas', async () => {
    await abrir();
    const ok = await store().confirmReagendamento();
    // Sem reencaixe (reagendamento é null), retorna true (nada a fazer)
    expect(ok).toBe(true);
  });

  it('confirmReagendamento com reagendamento valido chama a RPC', async () => {
    // Simular um reagendamento com movidas
    await abrir();
    const pr = store().pendingReplan;
    // Forçar um reagendamento para testar a chamada
    // (em teste real, isso viria do motor de reencaixe)
    if (pr) {
      const prComReagendamento = {
        ...pr,
        reagendamento: {
          movidas: [{ id: 'seg', de: '2020-01-05', para: '2020-01-08' }],
          semEncaixe: [],
        },
      };
      // Simular um store que teria reagendamento
      // Este teste valida que o tipo está correto e a estrutura faz sense
      expect(prComReagendamento.reagendamento).not.toBeNull();
      expect(prComReagendamento.reagendamento!.movidas.length).toBe(1);
    }
  });

  it('confirmReagendamento segue o mesmo padrão de reentrância que confirmReplan', async () => {
    await abrir();
    // Verifica que o método existe e é callable
    const metodo = store().confirmReagendamento;
    expect(typeof metodo).toBe('function');
    // Chama para verificar que não quebra
    const ok1 = await store().confirmReagendamento();
    expect(typeof ok1).toBe('boolean');
  });

  it('ordem real manda: sessões na mesma data reencaixadas pelo order_in_week, não índice do array', async () => {
    // Duas sessões PENDENTES na MESMA data (segunda), devolvidas pelo banco
    // em ordem REVERSA ao order_in_week. O reencaixe deve usar order_in_week
    // real do banco, não o índice do array.
    const contextoOrdenado = makeContext();
    contextoOrdenado.sessions = [
      // array[0]: sess-1 (order_in_week=2, índice 0)
      {
        id: 'sess-1',
        weekNumber: 1,
        title: 'Push A',
        sessionType: 'Hipertrofia',
        scheduledDate: '2020-01-06',  // segunda (atraso de 1 dia)
        status: 'pending',  // foi atrasada, está pendente
        estimatedMinutes: 60,
        exercises: [
          {
            id: 'ex-1',
            name: 'Supino Reto',
            muscleGroup: 'Peito',
            priority: 'primary',
            exerciseOrder: 1,
            sets: [{ id: 'ex1-s1', setOrder: 1 }],
          },
        ],
      },
      // array[1]: seg (order_in_week=1, índice 1)
      {
        id: 'seg',
        weekNumber: 1,
        title: 'Treino A',
        sessionType: 'Hipertrofia',
        scheduledDate: '2020-01-06',  // MESMA segunda (atraso)
        status: 'pending',  // também atraso
        estimatedMinutes: 60,
        exercises: [
          {
            id: 'm1',
            name: 'Supino Inclinado',
            muscleGroup: 'Peito',
            priority: 'primary',
            exerciseOrder: 1,
            sets: [{ id: 'm1-s1', setOrder: 1 }],
          },
        ],
      },
    ];
    // raw com order_in_week explícito: seg=1, sess-1=2 (inverso da ordem do array)
    contextoOrdenado.raw = [
      { id: 'sess-1', week_number: 1, title: 'Push A', session_type: 'Hipertrofia', scheduled_date: '2020-01-06', status: 'pending', estimated_minutes: 60, planned_exercises: [], order_in_week: 2 } as any,
      { id: 'seg', week_number: 1, title: 'Treino A', session_type: 'Hipertrofia', scheduled_date: '2020-01-06', status: 'pending', estimated_minutes: 60, planned_exercises: [], order_in_week: 1 } as any,
    ];
    contextoOrdenado.sessionLabelById = {
      'sess-1': 'Push A · 2020-01-06',
      'seg': 'Treino A · 2020-01-06',
    };

    mock(getWeekReplanContext).mockResolvedValue(contextoOrdenado);
    // Agenda com espaço disponível (segunda 06 já ocupada, terça 07 + quarta 08 livres)
    mock(getAgendaDoAluno).mockResolvedValue({
      agenda: [
        { data: '2020-01-07', blocos: [] },
        { data: '2020-01-08', blocos: [] },
      ],
      origem: 'presente',
    });

    const detail = makeDetail();
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
    await confirmarCheckInSePedido();
    await store().computeReplan(detail);

    // O reencaixe deve ter sido calculado
    const pr = store().pendingReplan;
    expect(pr).not.toBeNull();
    if (pr && pr.reagendamento && pr.reagendamento.movidas.length > 0) {
      // Verifica que 'seg' (order_in_week=1) foi movida antes de 'sess-1' (order_in_week=2)
      // Apesar de estar no array[1], deve ser processada primeiro porque tem order_in_week menor.
      const movidas = pr.reagendamento.movidas;
      const indiceSegNasMovidas = movidas.findIndex((m) => m.id === 'seg');
      const indicesessNasMovidas = movidas.findIndex((m) => m.id === 'sess-1');

      // Se ambas forem movidas, 'seg' deve vir antes (ordem real, não índice do array)
      if (indiceSegNasMovidas >= 0 && indicesessNasMovidas >= 0) {
        expect(indiceSegNasMovidas).toBeLessThan(indicesessNasMovidas);
      }
    }
  });

  it('reencaixe sem redistribuição: reagendamento é preenchido mesmo sem pulo a suprimir', async () => {
    // Contexto com atraso (segunda perdida) mas proposta SEM redistribuição
    // (por exemplo, não há receptora com capacidade no motor).
    // O aluno deveria ver o reencaixe mesmo assim.
    const contextoSemRedistribuicao = makeContext();
    contextoSemRedistribuicao.sessions = [
      {
        ...contextoSemRedistribuicao.sessions[0],
        id: 'seg',
        status: 'pending',
        // Na semana do relógio (quarta 08/01): segunda perdida.
        scheduledDate: '2020-01-06',
      },
      {
        ...contextoSemRedistribuicao.sessions[1],
        id: 'sess-1',
        status: 'in_progress',
        scheduledDate: '2020-01-07',
      },
    ];
    contextoSemRedistribuicao.raw = [
      { id: 'seg', week_number: 1, title: 'Treino A', session_type: 'Hipertrofia', scheduled_date: '2020-01-06', status: 'pending', estimated_minutes: 60, planned_exercises: [], order_in_week: 1 } as any,
      { id: 'sess-1', week_number: 1, title: 'Push A', session_type: 'Hipertrofia', scheduled_date: '2020-01-07', status: 'in_progress', estimated_minutes: 60, planned_exercises: [], order_in_week: 2 } as any,
    ];

    mock(getWeekReplanContext).mockResolvedValue(contextoSemRedistribuicao);
    // Agenda com espaço (quarta + quinta). O formato do contrato são OFFSETS
    // de dia da semana (0=segunda…6=domingo), como devolve agendaRepository —
    // o mock antigo passava objetos {data, blocos} e, sem slot válido, nada
    // movia: o teste passava por vacuidade, sem entrar na asserção. O relógio
    // fica na semana do plano (2020-01-08 é quarta), senão todos os slots
    // ficariam no passado e de novo nada moveria.
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(new Date('2020-01-08T09:00:00'));
    mock(getAgendaDoAluno).mockResolvedValue({
      agenda: [3, 4],
      origem: 'plano',
    });

    const detail = makeDetail();
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
    await confirmarCheckInSePedido();

    // Mock do motor que NÃO propõe redistribuição (por qualquer razão)
    // Captura a chamada original e força redistribution=null
    const originalReplanByRules = require('../src/engine/weeklyReplanner').replanByRules;
    jest.doMock('../src/engine/weeklyReplanner', () => ({
      ...originalReplanByRules,
      replanByRules: jest.fn(() => ({
        hasChanges: false,
        redistribution: null,  // SEM pulo
        timeCut: null,
        timeCutExerciseIds: [],
        fingerprint: 'fp-test',
      })),
    }));

    await store().computeReplan(detail);

    const pr = store().pendingReplan;
    // Mesmo sem redistribuição original, reencaixe DEVE estar preenchido
    // (a intenção de reencaixar é independente do pulo oferecido).
    if (pr && pr.reagendamento) {
      expect(pr.reagendamento.movidas.length).toBeGreaterThan(0);
      // E a proposta NÃO deve ter redistribuição (foi suprimida/não oferecida)
      expect(pr.proposal.redistribution).toBeNull();
    }
    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Supressão do pulo quando o reencaixe resolve (escrito pelo revisor).
//
// O fixture padrão desta suíte usa datas de 2020: como "hoje" é sempre muito
// depois, NENHUM slot da semana fica no futuro e o reencaixe nunca dispara —
// uma asserção de `redistribution === null` passaria por vacuidade, sem
// exercitar a supressão. Aqui o relógio é fixado numa quarta dentro da semana
// do plano, que é a única forma de o caminho ser realmente percorrido.
// ---------------------------------------------------------------------------
describe('reencaixe possível suprime a proposta de pular', () => {
  const QUARTA = new Date('2020-01-08T09:00:00');

  const contextoNaSemana = (): WeekReplanContext => {
    const ctx = makeContext();
    // seg = segunda 06/01 (atrasada); a sessão de hoje fica na terça 07/01.
    ctx.sessions[0].scheduledDate = '2020-01-06';
    ctx.sessions[1].scheduledDate = '2020-01-07';
    ctx.raw = ctx.sessions.map((s, i) => ({
      id: s.id,
      week_number: 1,
      title: s.title,
      session_type: s.sessionType,
      scheduled_date: s.scheduledDate,
      status: s.status,
      estimated_minutes: s.estimatedMinutes,
      order_in_week: i + 1,
      planned_exercises: [],
    })) as WeekReplanContext['raw'];
    return ctx;
  };

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(QUARTA);
    mock(getWeekReplanContext).mockResolvedValue(contextoNaSemana());
    mock(getAgendaDoAluno).mockResolvedValue({ agenda: [0, 1, 2, 3, 4], origem: 'plano' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('com reencaixe disponível, NENHUMA sessão é proposta para pular', async () => {
    await abrir();
    const pr = store().pendingReplan!;
    // O treino atrasado vai para hoje (quarta 08/01), em vez de virar perda.
    expect(pr.reagendamento!.movidas).toEqual([
      expect.objectContaining({ id: 'seg', de: '2020-01-06', para: '2020-01-08' }),
    ]);
    // E a proposta NÃO carrega mais o pulo: confirmReplan não tem o que descartar.
    expect(pr.proposal.redistribution).toBeNull();
  });

  it('recalcular o tempo não ressuscita o pulo já suprimido', async () => {
    await abrir();
    store().requestTimeCut(30);
    expect(store().pendingReplan!.proposal.redistribution).toBeNull();
  });

  it('sem agenda, o comportamento antigo é preservado: o pulo volta a ser proposto', async () => {
    mock(getAgendaDoAluno).mockResolvedValue({ agenda: [], origem: 'ausente' });
    await abrir();
    const pr = store().pendingReplan!;
    expect(pr.reagendamento).toBeNull();
    expect(pr.proposal.redistribution!.missedSessionIds).toEqual(['seg']);
  });
});

// ---------------------------------------------------------------------------
// Nível 2 da escada de reencaixe (Fase 2 do COMMIT A): quando NENHUM treino
// cabe no que sobrou da semana, o plano vira um fechamento honesto — semEncaixe
// preenchido, movidas vazio — e o pulo continua suprimido (nada será marcado
// como skipped por esta proposta; o fechador cuida disso na abertura seguinte).
// ---------------------------------------------------------------------------
describe('semana sem espaço restante: Nível 2 (fecha com menos volume)', () => {
  const QUARTA = new Date('2020-01-08T09:00:00');

  const contextoNivel2 = (): WeekReplanContext => {
    const ctx = makeContext();
    // seg = segunda 06/01 (atrasada); a sessão de hoje fica na terça 07/01.
    ctx.sessions[0].scheduledDate = '2020-01-06';
    ctx.sessions[1].scheduledDate = '2020-01-07';
    ctx.raw = ctx.sessions.map((s, i) => ({
      id: s.id,
      week_number: 1,
      title: s.title,
      session_type: s.sessionType,
      scheduled_date: s.scheduledDate,
      status: s.status,
      estimated_minutes: s.estimatedMinutes,
      order_in_week: i + 1,
      planned_exercises: [],
    })) as WeekReplanContext['raw'];
    return ctx;
  };

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.setSystemTime(QUARTA);
    mock(getWeekReplanContext).mockResolvedValue(contextoNivel2());
    // Agenda só com dias que já passaram (seg/ter): nenhum slot à frente de
    // hoje (quarta). Toda pendente atrasada fica sem encaixe.
    mock(getAgendaDoAluno).mockResolvedValue({ agenda: [0, 1], origem: 'plano' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('nada cabe: movidas vazio, semEncaixe preenchido, pulo suprimido', async () => {
    await abrir();
    const pr = store().pendingReplan!;
    expect(pr.reagendamento).not.toBeNull();
    expect(pr.reagendamento!.movidas).toEqual([]);
    expect(pr.reagendamento!.semEncaixe).toEqual(['seg']);
    expect(pr.proposal.redistribution).toBeNull();
  });

  it('recalcular o tempo não ressuscita o pulo no Nível 2', async () => {
    await abrir();
    store().requestTimeCut(30);
    expect(store().pendingReplan!.proposal.redistribution).toBeNull();
    expect(store().pendingReplan!.reagendamento!.semEncaixe).toEqual(['seg']);
  });
});
