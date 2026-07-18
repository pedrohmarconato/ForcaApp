// __tests__/activeSessionStore.test.ts
// Fase 4 — store da sessão ativa. Modos de falha cobertos (os casos de borda do brief):
// - RETOMAR: rascunho local com série feita sobrevive a fechar/reabrir
// - RETOMAR pelo servidor quando o rascunho local se perdeu (não duplica session_log)
// - PRIMEIRA CARGA sem histórico: não conclui até o aluno informar a carga
// - BODYWEIGHT: conclui só com reps, grava carga nula
// - ERRO do banco ao salvar a série NÃO marca como feita (não engole o erro)
// - outcome correto (under/on_target/over) calculado ao concluir

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(
      error: any,
      options: { kind?: 'transport' | 'server'; status?: number } = {},
    ) {
      super(error?.message ?? String(error));
      this.kind =
        options.kind ?? (options.status === 0 ? 'transport' : 'server');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    startSessionLog: jest.fn(),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(),
    getOpenSessionLog: jest.fn(),
    getLastLoadByExerciseName: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (error: unknown) =>
      error instanceof SessionExecutionRequestError &&
      error.kind === 'transport',
  };
});
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

import {
  startSessionLog,
  saveSetLog,
  finishSessionLog,
  getOpenSessionLog,
  getLastLoadByExerciseName,
  SessionExecutionRequestError,
} from '../src/services/sessionExecutionRepository';
import {
  saveDraft,
  loadDraft,
  clearDraft,
} from '../src/services/sessionDraftStorage';
import {
  useActiveSessionStore,
  suggestionFor,
} from '../src/store/activeSessionStore';
import { buildDraftFromDetail } from '../src/engine/sessionModel';
import type { SessionDetail } from '../src/services/trainingRepository';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

/** Promessa controlável: permite trocar de sessão ENQUANTO uma gravação/finish está no await. */
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const makeDetail = (): SessionDetail => ({
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2026-07-20',
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
      planned_sets: [
        {
          id: 'st-1',
          exercise_id: 'ex-1',
          set_order: 1,
          target_reps_min: 8,
          target_reps_max: 10,
          target_load_kg: null,
          target_rir: 2,
        },
        {
          id: 'st-2',
          exercise_id: 'ex-1',
          set_order: 2,
          target_reps_min: 8,
          target_reps_max: 10,
          target_load_kg: null,
          target_rir: 2,
        },
      ],
    },
    {
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Flexão',
      muscle_group: 'Peito',
      priority: 'accessory',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: 'AMRAP',
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-3',
          exercise_id: 'ex-2',
          set_order: 1,
          target_reps_min: 10,
          target_reps_max: 20,
          target_load_kg: null,
          target_rir: 0,
        },
      ],
    },
  ],
});

const store = () => useActiveSessionStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.setState({
    draft: null,
    status: 'idle',
    saveError: null,
  });
  mock(getLastLoadByExerciseName).mockResolvedValue({});
  mock(loadDraft).mockResolvedValue(null);
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({
    sessionLogId: 'sl-1',
    startedAt: 'T0',
  });
  mock(saveSetLog).mockImplementation(async (params: any) => ({
    setLogId: 'set-x',
    actualReps: params.actualReps,
    actualLoadKg: params.actualLoadKg,
    actualRir: params.actualRir,
    outcome: params.outcome,
  }));
  mock(saveDraft).mockResolvedValue(undefined);
  mock(clearDraft).mockResolvedValue(undefined);
  mock(finishSessionLog).mockResolvedValue(undefined);
});

describe('início da sessão', () => {
  it('começa fresco: cria session_log e persiste o rascunho', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().status).toBe('active');
    expect(store().draft?.sessionLogId).toBe('sl-1');
    expect(startSessionLog).toHaveBeenCalledWith('sess-1');
    expect(saveDraft).toHaveBeenCalled();
    // todas as séries começam pendentes
    const todas = store().draft!.exercises.flatMap((e) => e.sets);
    expect(todas.every((s) => s.status === 'pending')).toBe(true);
  });

  it('início resiliente: falha ao semear histórico não derruba o start', async () => {
    mock(getLastLoadByExerciseName).mockRejectedValue(new Error('rede'));
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    expect(store().status).toBe('active');
  });

  it('erro ao criar o session_log deixa a tela em estado de erro (não finge início)', async () => {
    mock(startSessionLog).mockRejectedValue(new Error('sem rede'));
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    expect(store().status).toBe('error');
    expect(store().saveError).toMatch(/sem rede/);
  });
});

describe('concluir série', () => {
  const start = async () =>
    store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

  it('grava a série e calcula outcome on_target; próxima série passa a sugerir a carga usada', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(true);
    expect(saveSetLog).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 40,
        outcome: 'on_target',
      }),
      expect.anything(),
    );
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).toBe('done');
    expect(s1.outcome).toBe('on_target');
    // a série 2 do mesmo exercício agora sugere 40 (última usada)
    const ex = store().draft!.exercises[0];
    expect(suggestionFor(store().draft!, ex, ex.sets[1])).toBe(40);
  });

  it('outcome under quando reps abaixo do mínimo', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 5);
    store().setLoad('ex-1', 1, 40);
    await store().completeSet('ex-1', 1);
    expect(store().draft!.exercises[0].sets[0].outcome).toBe('under');
  });

  it('PRIMEIRA CARGA: sem histórico e sem kg informado, não conclui e avisa', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    // aluno NÃO informou a carga
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(false);
    expect(saveSetLog).not.toHaveBeenCalled();
    expect(store().draft!.exercises[0].sets[0].status).not.toBe('done');
    expect(store().saveError).toMatch(/carga/i);
  });

  it('BODYWEIGHT: conclui só com reps e grava carga nula', async () => {
    await start();
    store().activateSet('ex-2', 1);
    store().setReps('ex-2', 1, 15);
    const ok = await store().completeSet('ex-2', 1);

    expect(ok).toBe(true);
    expect(saveSetLog).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedSetId: 'st-3',
        actualReps: 15,
        actualLoadKg: null,
        outcome: 'on_target',
      }),
      expect.anything(),
    );
  });

  it('ERRO do banco ao salvar: série NÃO vira "feita" e o erro aparece', async () => {
    mock(saveSetLog).mockRejectedValue(new Error('RLS negou'));
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(false);
    expect(store().saveError).toMatch(/RLS negou/);
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).not.toBe('done');
    expect(s1.setLogId).toBeNull();
  });

  it('log finalizado remotamente durante save encerra a sessão e limpa só o draft capturado', async () => {
    const closed = Object.assign(new Error('session_log já finalizado'), {
      code: 'P0001',
    });
    mock(saveSetLog).mockRejectedValue(
      new SessionExecutionRequestError(closed, { status: 400 }),
    );
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    expect(await store().completeSet('ex-1', 1)).toBe(false);
    expect(store().status).toBe('finished');
    expect(store().saveError).toBeNull();
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
  });

  it('F2: duas conclusões CONCORRENTES da mesma série gravam UMA vez só', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const [r1, r2] = await Promise.all([
      store().completeSet('ex-1', 1),
      store().completeSet('ex-1', 1),
    ]);
    expect(saveSetLog).toHaveBeenCalledTimes(1);
    expect([r1, r2]).toContain(true);
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
  });

  it('idempotente: concluir uma série JÁ feita não regrava', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    await store().completeSet('ex-1', 1);
    mock(saveSetLog).mockClear();
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true);
    expect(saveSetLog).not.toHaveBeenCalled();
  });

  it('F3: insert confirmado + falha ao PERSISTIR o rascunho → série FICA feita (não re-tenta)', async () => {
    await start();
    // a falha de persistência é SÓ na gravação da série (não no start)
    mock(saveDraft).mockRejectedValueOnce(new Error('disco cheio'));
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true); // sucesso do servidor não é revertido por falha local
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(store().saveError).toBeNull();
  });
});

describe('setRir', () => {
  it('F12: clampa 0–10 no núcleo do store', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    store().activateSet('ex-1', 1);
    store().setRir('ex-1', 1, 11);
    expect(store().draft!.exercises[0].sets[0].actualRir).toBe(10);
    store().setRir('ex-1', 1, -3);
    expect(store().draft!.exercises[0].sets[0].actualRir).toBe(0);
  });
});

describe('retomar sessão (fechar no meio e reabrir)', () => {
  it('rascunho local + servidor CONFIRMA a série → retomada como feita, sem novo session_log', async () => {
    // Rascunho local com a 1ª série concluída…
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-existente';
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      status: 'done',
      outcome: 'on_target',
      actualReps: 8,
      actualLoadKg: 40,
      setLogId: 'set-1',
    };
    mock(loadDraft).mockResolvedValue(draft);
    // …e o SERVIDOR (autoritativo) confirma a mesma série gravada.
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-existente',
      startedAt: 'T0',
      setLogs: [
        {
          id: 'set-1',
          planned_set_id: 'st-1',
          actual_reps: 8,
          actual_load_kg: 40,
          actual_rir: 2,
          outcome: 'on_target',
          completed_at: '2026-07-17T10:00:00Z',
        },
      ],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().status).toBe('active');
    expect(store().draft?.sessionLogId).toBe('sl-existente');
    // a série feita sobreviveu (reconstruída do servidor)
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(40);
    // NÃO criou um novo log; reconciliou com o servidor antes de adotar
    expect(startSessionLog).not.toHaveBeenCalled();
    expect(getOpenSessionLog).toHaveBeenCalled();
  });

  it('F3/F6: o SERVIDOR vence o local obsoleto (carga 40 no local, 50 no servidor → 50)', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-existente';
    // local acha que gravou 40 nesta série…
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      status: 'done',
      outcome: 'on_target',
      actualReps: 8,
      actualLoadKg: 40,
      setLogId: 'set-antigo',
    };
    mock(loadDraft).mockResolvedValue(draft);
    // …mas o SERVIDOR tem 50 (o que de fato persistiu). O servidor é autoritativo.
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-existente',
      startedAt: 'T0',
      setLogs: [
        {
          id: 'set-real',
          planned_set_id: 'st-1',
          actual_reps: 9,
          actual_load_kg: 50,
          actual_rir: 1,
          outcome: 'on_target',
          completed_at: '2026-07-17T10:00:00Z',
        },
      ],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.actualLoadKg).toBe(50); // não 40
    expect(s1.actualReps).toBe(9);
    expect(s1.setLogId).toBe('set-real');
  });

  it('F3/F6: série "feita" no local SEM lastro no servidor volta a PENDENTE (não é fantasma)', async () => {
    // Cenário do BLOCKER: o upsert falhava (42P10), então o "done" local pode nunca ter
    // persistido. Ao retomar, o servidor (sem a série) manda: a série volta a pendente.
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-existente';
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      status: 'done',
      outcome: 'on_target',
      actualReps: 8,
      actualLoadKg: 40,
      setLogId: 'fantasma',
    };
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-existente',
      startedAt: 'T0',
      setLogs: [],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).toBe('pending');
    expect(s1.setLogId).toBeNull();
    expect(store().status).toBe('active');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('F1: rascunho local ativo mas sessão JÁ FINALIZADA no servidor → não retoma (não grava em log fechado)', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-antigo';
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockResolvedValue(null); // finalizada em outro aparelho

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().status).toBe('finished');
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-antigo');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('F6: status 0 normalizado na fronteira → retomada OFFLINE com o local', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-offline';
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      status: 'done',
      actualReps: 8,
      actualLoadKg: 40,
    };
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockRejectedValue(
      new SessionExecutionRequestError(new Error('Network request failed'), {
        kind: 'transport',
      }),
    );

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().status).toBe('active');
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
  });

  it('F6: erro HTTP de permissão SEM .code → status "error", NÃO "offline"', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-erro';
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockRejectedValue(
      new SessionExecutionRequestError(
        { message: 'Forbidden' },
        { status: 403 },
      ),
    );

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    // NÃO pode fingir offline: erro estruturado tem de propagar como erro.
    expect(store().status).toBe('error');
    expect(store().saveError).toMatch(/Forbidden/i);
  });

  it('F6: falha de clearDraft NÃO reativa um rascunho que o servidor PROVOU finalizado', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-antigo';
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockResolvedValue(null); // servidor: sessão finalizada
    mock(clearDraft).mockRejectedValue(new Error('AsyncStorage falhou')); // limpeza falha

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    // A decisão "finalizada" é tomada ANTES de limpar; clearDraft falhar é não-fatal
    // e não pode ressuscitar o draft (status 'active') — senão gravaríamos em log fechado.
    expect(store().status).toBe('finished');
    expect(store().draft).toBeNull();
  });

  it('sem rascunho local, reconstrói do servidor sem duplicar o session_log', async () => {
    mock(loadDraft).mockResolvedValue(null);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-servidor',
      startedAt: 'T0',
      setLogs: [
        {
          id: 'set-1',
          planned_set_id: 'st-1',
          actual_reps: 8,
          actual_load_kg: 40,
          actual_rir: 2,
          outcome: 'on_target',
          completed_at: '2026-07-17T10:00:00Z',
        },
      ],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().draft?.sessionLogId).toBe('sl-servidor');
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('última carga do log aberto usa completed_at, não a ordem das séries planejadas', async () => {
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-servidor',
      startedAt: 'T0',
      setLogs: [
        {
          id: 'set-1',
          planned_set_id: 'st-1',
          actual_reps: 8,
          actual_load_kg: 55,
          actual_rir: 2,
          outcome: 'on_target',
          completed_at: '2026-07-17T11:00:00Z',
        },
        {
          id: 'set-2',
          planned_set_id: 'st-2',
          actual_reps: 8,
          actual_load_kg: 50,
          actual_rir: 2,
          outcome: 'on_target',
          completed_at: '2026-07-17T10:00:00Z',
        },
      ],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().draft?.lastLoadByExercise['supino reto']).toBe(55);
  });
});

describe('concluir a sessão', () => {
  it('fecha o log e limpa o rascunho local', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    const ok = await store().finishSession();

    expect(ok).toBe(true);
    expect(finishSessionLog).toHaveBeenCalled();
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
    expect(store().status).toBe('finished');
  });

  it('erro ao fechar não engole: mantém erro e não conclui', async () => {
    mock(finishSessionLog).mockRejectedValue(new Error('timeout'));
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    const ok = await store().finishSession();

    expect(ok).toBe(false);
    expect(store().saveError).toMatch(/timeout/);
    expect(store().status).not.toBe('finished');
  });

  it('F4: finish idempotente — 2ª chamada (RPC já finalizou, resolve) NÃO trava o cliente em erro', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(await store().finishSession()).toBe(true);
    expect(store().status).toBe('finished');
    expect(store().saveError).toBeNull();

    // A RPC idempotente da 0004 responde SUCESSO quando o log já é dele e está finalizado.
    // O cliente não pode ficar preso num erro por concluir duas vezes.
    const ok2 = await store().finishSession();
    expect(ok2).toBe(true);
    expect(store().saveError).toBeNull();
    expect(store().status).toBe('finished');
  });
});

describe('compare-and-set: troca de sessão durante o await (F7)', () => {
  it('startOrResume lento de A não sobrescreve B que terminou primeiro', async () => {
    const loadA = deferred<null>();
    mock(loadDraft)
      .mockReturnValueOnce(loadA.promise)
      .mockResolvedValueOnce(null);
    mock(startSessionLog).mockImplementation(async (sessionId: string) => ({
      sessionLogId: sessionId === 'sess-2' ? 'sl-B' : 'sl-A',
      startedAt: 'T0',
    }));
    const detailB = {
      ...makeDetail(),
      id: 'sess-2',
      title: 'Pull B',
      planned_exercises: [],
    };

    const pA = store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await store().startOrResume({
      sessionId: 'sess-2',
      userId: 'user-1',
      detail: detailB,
    });
    loadA.resolve(null);
    await pA;

    expect(store().draft?.plannedSessionId).toBe('sess-2');
    expect(store().draft?.sessionLogId).toBe('sl-B');
    expect(store().draft?.title).toBe('Pull B');
  });

  it('completeSet não escreve na sessão TROCADA durante o await da gravação', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    }); // A = sl-1
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    const d = deferred<{
      setLogId: string;
      actualReps: number;
      actualLoadKg: number | null;
      actualRir: number | null;
      outcome: 'on_target';
    }>();
    mock(saveSetLog).mockReturnValueOnce(d.promise); // gravação fica pendente

    const p = store().completeSet('ex-1', 1);

    // usuário troca para OUTRA sessão (B) enquanto a série de A ainda grava
    const draftB = buildDraftFromDetail(makeDetail(), 'user-1');
    draftB.sessionLogId = 'sl-B';
    useActiveSessionStore.setState({ draft: draftB, status: 'active' });

    d.resolve({
      setLogId: 'set-x',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'on_target',
    });
    const ok = await p;

    expect(ok).toBe(true); // o servidor confirmou a gravação de A
    // …mas a sessão B ficou intacta (nada de série de A vazando para B)
    expect(store().draft!.sessionLogId).toBe('sl-B');
    expect(store().draft!.exercises[0].sets[0].status).toBe('pending');
    expect(store().draft!.exercises[0].sets[0].setLogId).toBeNull();
  });

  it('finishSession não finaliza/limpa a sessão TROCADA durante o await', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    }); // A = sl-1

    const d = deferred<void>();
    mock(finishSessionLog).mockReturnValueOnce(d.promise);

    const p = store().finishSession();

    const draftB = buildDraftFromDetail(makeDetail(), 'user-1');
    draftB.sessionLogId = 'sl-B';
    useActiveSessionStore.setState({ draft: draftB, status: 'active' });

    d.resolve();
    const ok = await p;

    expect(ok).toBe(true);
    // sessão B intacta: NÃO virou finished e o rascunho dela NÃO foi limpo (clearDraft cego)
    expect(store().draft!.sessionLogId).toBe('sl-B');
    expect(store().status).toBe('active');
    expect(clearDraft).not.toHaveBeenCalled();
  });

  it('token de geração fecha ABA: A antiga não escreve numa nova A com o mesmo sessionLogId', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const saveA = deferred<{
      setLogId: string;
      actualReps: number;
      actualLoadKg: number | null;
      actualRir: number | null;
      outcome: 'on_target';
    }>();
    mock(saveSetLog).mockReturnValueOnce(saveA.promise);
    const pending = store().completeSet('ex-1', 1);

    const replacement = buildDraftFromDetail(makeDetail(), 'user-1');
    replacement.sessionLogId = 'sl-1'; // mesmo id: CAS só por sid falharia
    store().reset();
    useActiveSessionStore.setState({ draft: replacement, status: 'active' });

    saveA.resolve({
      setLogId: 'set-old',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'on_target',
    });
    await pending;

    expect(store().draft?.sessionLogId).toBe('sl-1');
    expect(store().draft?.exercises[0].sets[0].status).toBe('pending');
    expect(saveDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: expect.arrayContaining([
          expect.objectContaining({
            sets: expect.arrayContaining([
              expect.objectContaining({ setLogId: 'set-old' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('save que resolve depois do finish não recria rascunho finalizado', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const pendingSave = deferred<{
      setLogId: string;
      actualReps: number;
      actualLoadKg: number | null;
      actualRir: number | null;
      outcome: 'on_target';
    }>();
    mock(saveSetLog).mockReturnValueOnce(pendingSave.promise);
    mock(saveDraft).mockClear();

    const completing = store().completeSet('ex-1', 1);
    expect(await store().finishSession()).toBe(true);
    pendingSave.resolve({
      setLogId: 'set-after-finish',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'on_target',
    });
    expect(await completing).toBe(true);

    expect(store().status).toBe('finished');
    expect(saveDraft).not.toHaveBeenCalled();
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
  });
});

describe('trava de reentrância (F9)', () => {
  it('RPC de gravação travada libera a série após timeout (não trava para sempre)', async () => {
    jest.useFakeTimers();
    try {
      await store().startOrResume({
        sessionId: 'sess-1',
        userId: 'user-1',
        detail: makeDetail(),
      });
      store().activateSet('ex-1', 1);
      store().setReps('ex-1', 1, 8);
      store().setLoad('ex-1', 1, 40);

      // 1ª tentativa só termina tarde, depois do timeout e do retry.
      const late = deferred<{
        setLogId: string;
        actualReps: number;
        actualLoadKg: number | null;
        actualRir: number | null;
        outcome: 'on_target';
      }>();
      mock(saveSetLog).mockReturnValueOnce(late.promise);
      const p1 = store().completeSet('ex-1', 1);

      // dispara o timeout interno da gravação
      jest.advanceTimersByTime(60000);
      const r1 = await p1;

      expect(r1).toBe(false);
      expect(store().saveError).toMatch(/tempo|esgot/i);
      expect(store().draft!.exercises[0].sets[0].status).not.toBe('done');
      const firstSignal = mock(saveSetLog).mock.calls[0][1] as AbortSignal;
      expect(firstSignal.aborted).toBe(true);

      // a TRAVA foi liberada: nova tentativa consegue disparar a RPC de novo
      mock(saveSetLog).mockResolvedValueOnce({
        setLogId: 'set-x',
        actualReps: 8,
        actualLoadKg: 40,
        actualRir: null,
        outcome: 'on_target',
      });
      const r2 = await store().completeSet('ex-1', 1);
      expect(r2).toBe(true);
      expect(store().draft!.exercises[0].sets[0].status).toBe('done');

      // A resolução tardia da chamada cancelada é consumida e não altera o retry.
      late.resolve({
        setLogId: 'set-late',
        actualReps: 99,
        actualLoadKg: 99,
        actualRir: 9,
        outcome: 'on_target',
      });
      await Promise.resolve();
      expect(store().draft!.exercises[0].sets[0].setLogId).toBe('set-x');
      expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(40);
    } finally {
      jest.useRealTimers();
    }
  });
});
