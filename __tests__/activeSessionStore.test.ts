// __tests__/activeSessionStore.test.ts
// Fase 4 — store da sessão ativa. Modos de falha cobertos (os casos de borda do brief):
// - RETOMAR: rascunho local com série feita sobrevive a fechar/reabrir
// - RETOMAR pelo servidor quando o rascunho local se perdeu (não duplica session_log)
// - PRIMEIRA CARGA sem histórico: não conclui até o aluno informar a carga
// - BODYWEIGHT: conclui só com reps, grava carga nula
// - outcome correto (under/on_target/over) calculado ao concluir
//
// Fase 4 (REQ-07, D-05): erro do banco ao salvar a série NÃO IMPEDE MAIS a
// conclusão local — a escrita vira item de fila (sessionOutboxDrain) que
// retenta/quarentena em segundo plano; completeSet nunca mais aguarda a rede
// nem propaga saveError por soluço de transporte. Ver
// __tests__/sessionOutboxDrain.test.ts para os 5 modos de classificação de
// erro da fila (sucesso/transporte/definitivo/P0001/desconhecido).

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
    getLastLoadByExercise: jest.fn(),
    getLastRepsByExercise: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (error: unknown) =>
      error instanceof SessionExecutionRequestError &&
      error.kind === 'transport',
  };
});
// Fase 6: o store passou a importar o repositório de replanejamento; mocka para
// não carregar o cliente Supabase real no jest (mesmo padrão dos demais services).
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));
jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(),
}));
// Fase 4 (REQ-07): activeSessionStore agora importa sessionOutboxDrain ->
// sessionOutboxStorage -> AsyncStorage real. sessionExecutionRepository e
// sessionOutboxDrain/sessionOutboxStorage NÃO são mockados de propósito: os
// testes desta suíte exercitam o comportamento REAL da fila junto do store
// (enfileira, drena, reclassifica erro) — só o transporte de rede
// (sessionExecutionRepository) é mock. O mock oficial do pacote provê uma
// implementação em memória (doc: react-native-async-storage/jest).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/services/planEditRepository', () => ({
  reagendarSessoesDaSemana: jest.fn(),
}));
// PUSH-03: confirmReplan() agora chama apiClient.post best-effort. Mocka o
// módulo inteiro (não só supabaseClient) para não carregar o cliente
// Supabase real no jest — mesmo padrão de manualPlanStore.test.ts.
jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve()) },
  ENDPOINTS: {
    PUSH: { NOTIFY_REPLAN: '/push/notify-replan-applied' },
  },
}));

import {
  startSessionLog,
  saveSetLog,
  finishSessionLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  getLastRepsByExercise,
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
// Fase 4 (REQ-07): a gravação de série virou item de fila — vários testes
// desta suíte agora precisam drenar EXPLICITAMENTE (drainAll) para observar o
// resultado da RPC, já que completeSet nunca mais aguarda a rede (D-05).
import { drainAll, enqueueItem } from '../src/services/sessionOutboxDrain';
import { loadOutbox } from '../src/services/sessionOutboxStorage';
// Fase 16 Plano 16-04: prova que startOrResume() de fato chama
// reconcileLiveActivityIntents() ao resolver para um draft ativo — não
// mockado explicitamente neste arquivo, resolve para o mock global inerte
// via moduleNameMapper (package.json), o mesmo usado por outras 13 suítes.
import { peekQueuedLiveActivityIntents, ackQueuedLiveActivityIntent } from '../modules/live-activity';


// Check-in obrigatório (22/07/2026): sessão NOVA para em awaiting_checkin; os
// testes desta suíte confirmam com defaults neutros para seguir o fluxo antigo.
const confirmarCheckInSePedido = async () => {
  const st = useActiveSessionStore.getState();
  if (st.status === 'awaiting_checkin') {
    await st.confirmCheckIn({ mood: 'normal', availableMinutes: null });
  }
};

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

// CR-01/16-10-PLAN.md (Task 2): fixture local com um exercício isTimeBased
// (metric: 'tempo'), molde byte-a-byte do ex-prancha de
// cardioTempoDistancia.test.ts:130-160 — exerciseId/exercise_key próprios
// deste arquivo para não colidir com ex-1/ex-2 de makeDetail().
const makeDetailComExercicioDeTempo = (): SessionDetail => ({
  id: 'sess-tempo',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Core',
  session_type: 'Cardio',
  scheduled_date: '2026-07-24',
  estimated_minutes: 20,
  status: 'pending',
  muscle_groups: ['Abdômen'],
  planned_exercises: [
    {
      id: 'ex-tempo',
      session_id: 'sess-tempo',
      exercise_order: 1,
      name: 'Prancha',
      exercise_key: 'prancha',
      metric: 'tempo',
      muscle_group: 'Abdômen',
      priority: 'primary',
      equipment: 'Peso corporal',
      load_increment_kg: 2.5,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '45s',
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-tempo-1',
          exercise_id: 'ex-tempo',
          set_order: 1,
          target_reps_min: null,
          target_reps_max: null,
          target_load_kg: null,
          target_rir: null,
          target_duration_seconds: 45,
          target_distance_m: null,
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
  mock(getLastLoadByExercise).mockResolvedValue({});
  mock(getLastRepsByExercise).mockResolvedValue({});
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
    await confirmarCheckInSePedido();

    expect(store().status).toBe('active');
    expect(store().draft?.sessionLogId).toBe('sl-1');
    expect(startSessionLog).toHaveBeenCalledWith('sess-1', {
      mood: 'normal',
      availableMinutes: null,
    });
    expect(saveDraft).toHaveBeenCalled();
    // todas as séries começam pendentes
    const todas = store().draft!.exercises.flatMap((e) => e.sets);
    expect(todas.every((s) => s.status === 'pending')).toBe(true);
  });

  it('início resiliente: falha ao semear histórico não derruba o start', async () => {
    mock(getLastLoadByExercise).mockRejectedValue(new Error('rede'));
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    expect(store().status).toBe('active');
  });

  it('erro ao criar o session_log deixa a tela em estado de erro (não finge início)', async () => {
    mock(startSessionLog).mockRejectedValue(new Error('sem rede'));
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    expect(store().status).toBe('error');
    expect(store().saveError).toMatch(/sem rede/);
  });
});

describe('concluir série', () => {
  const start = async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
  };

  it('grava a série e calcula outcome on_target; próxima série passa a sugerir a carga usada', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(true);
    // Fase 4 (D-05): o status 'done' e a sugestão são commit LOCAL imediato —
    // não dependem da RPC. A conclusão local não espera a fila.
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).toBe('done');
    expect(s1.outcome).toBe('on_target');
    // a série 2 do mesmo exercício agora sugere 40 (última usada)
    const ex = store().draft!.exercises[0];
    expect(suggestionFor(store().draft!, ex, ex.sets[1])).toBe(40);

    // A gravação em si acontece na fila, em segundo plano — drena para confirmar.
    await drainAll('user-1');
    expect(saveSetLog).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 40,
        outcome: 'on_target',
      }),
      expect.anything(),
    );
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
    await drainAll('user-1');
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

  it('ERRO do banco ao salvar: sob D-05 a série conclui local mesmo assim e o item fica pendente na fila (nunca saveError)', async () => {
    mock(saveSetLog).mockRejectedValue(new Error('RLS negou'));
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);

    // Fase 4 (REQ-07/D-05): erro de servidor NUNCA impede o commit local nem
    // seta saveError — vira item retentável na fila (Pitfall 2: código sem
    // classificação reconhecida NUNCA vai para quarentena por default).
    expect(ok).toBe(true);
    expect(store().saveError).toBeNull();
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).toBe('done');
    expect(s1.setLogId).toBeNull();

    await drainAll('user-1');
    const doc = await loadOutbox('user-1');
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].kind).toBe('save_set_log');
    expect(doc.quarantine).toHaveLength(0);
  });

  it('log finalizado remotamente (P0001) durante a drenagem encerra a sessão e limpa só o draft capturado', async () => {
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

    // Fase 4 (D-05): completeSet retorna true de IMEDIATO (commit otimista) — o
    // fechamento da sessão só acontece DEPOIS que a drenagem em segundo plano
    // descobre o P0001 (Pitfall 3, não é quarentena comum).
    expect(await store().completeSet('ex-1', 1)).toBe(true);

    await drainAll('user-1', {
      onSessionClosed: (id) => useActiveSessionStore.getState().reconcileRemoteSessionClosed(id),
    });

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
    expect([r1, r2]).toContain(true);
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');

    // Só a 1ª chamada enfileira (a 2ª bate no lock `inFlight` e retorna `false`
    // sem enfileirar nada, F2/F9) — deixa a drenagem fire-and-forget ÚNICA
    // resultante assentar (D-05) sem competir com uma 2ª chamada explícita a
    // drainAll, que dispararia um dispatch concorrente do MESMO item.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(saveSetLog).toHaveBeenCalledTimes(1);
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

  it('reconecta e drena sem duplicar: 1 falha de transporte + 1 retry bem-sucedido, nunca mais que isso', async () => {
    jest.useFakeTimers();
    try {
      mock(saveSetLog).mockRejectedValueOnce(
        new SessionExecutionRequestError(new Error('sem rede'), { status: 0 }),
      );
      await start();
      store().activateSet('ex-1', 1);
      store().setReps('ex-1', 1, 8);
      store().setLoad('ex-1', 1, 40);
      const ok = await store().completeSet('ex-1', 1);
      expect(ok).toBe(true);

      // Deixa a drenagem fire-and-forget da 1ª tentativa (D-05) assentar: falha
      // de transporte, item mantido pendente com backoff agendado (D-11).
      await jest.advanceTimersByTimeAsync(0);

      // Reconecta: avança além do teto do backoff e drena de novo — desta vez
      // com sucesso (default mock do beforeEach ecoa os parâmetros recebidos).
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      await drainAll('user-1');

      // Exatamente 2 chamadas: 1 falha + 1 retry bem-sucedido, nenhuma a mais
      // (aproxima o critério de sucesso #2 do 04-CONTEXT.md em nível de mock).
      expect(saveSetLog).toHaveBeenCalledTimes(2);
      const doc = await loadOutbox('user-1');
      expect(doc.items).toHaveLength(0);
      expect(doc.quarantine).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Fase 17 (REG-01): reps herdadas — stepReps e materialização em completeSet (D-17)', () => {
  const start = async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
  };

  it('stepReps na PRIMEIRA série do exercício usa o histórico como base (D-17 ramo 1) e persiste via saveDraft', async () => {
    // ex-1/st-1: targetRepsMin=8. Histórico (6) vence do alvo na 1ª série (D-01).
    mock(getLastRepsByExercise).mockResolvedValue({ 'supino reto': 6 });
    await start();
    store().activateSet('ex-1', 1);
    mock(saveDraft).mockClear();

    store().stepReps('ex-1', 1, 1);

    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.actualReps).toBe(7); // base = 6 (histórico) + 1
    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualReps).toBe(7);
  });

  it('completeSet na PRIMEIRA série materializa reps do HISTÓRICO sem nenhum toque manual (D-17 ramo 1)', async () => {
    mock(getLastRepsByExercise).mockResolvedValue({ 'supino reto': 6 });
    mock(getLastLoadByExercise).mockResolvedValue({ 'supino reto': 40 });
    await start();
    store().activateSet('ex-1', 1);
    // nenhum toque manual em reps nem carga

    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(true);
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.actualReps).toBe(6); // histórico (6) vence do alvo (targetRepsMin=8) — D-01
    expect(s1.actualLoadKg).toBe(40); // carga: sem alvo, cai no histórico — D-08 intacta

    await drainAll('user-1');
    expect(saveSetLog).toHaveBeenCalledWith(
      expect.objectContaining({ plannedSetId: 'st-1', actualReps: 6, actualLoadKg: 40 }),
      expect.anything(),
    );
  });

  it('completeSet numa série SEGUINTE do mesmo exercício usa o ALVO (D-17 ramo 2), não o histórico', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-1';
    draft.lastRepsByExercise = { 'supino reto': 6 };
    draft.lastLoadByExercise = { 'supino reto': 40 };
    // st-1 já concluída nesta sessão → st-2 deixa de ser a "primeira série".
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      status: 'done',
      actualReps: 9,
      actualLoadKg: 40,
      outcome: 'on_target',
      setLogId: 'set-old',
      completedAt: '2026-08-18T10:00:00Z',
    };
    // targetRepsMin já reescrito pela adaptação intra-sessão (simulado aqui).
    draft.exercises[0].sets[1] = {
      ...draft.exercises[0].sets[1],
      targetRepsMin: 10,
    };
    useActiveSessionStore.setState({ draft, status: 'active' });

    const ok = await store().completeSet('ex-1', 2);

    expect(ok).toBe(true);
    const s2 = store().draft!.exercises[0].sets[1];
    expect(s2.actualReps).toBe(10); // alvo (D-08 ramo 2) vence do histórico (6)
    expect(s2.actualLoadKg).toBe(40); // carga: sem alvo próprio, cai no histórico (D-08 intacta p/ carga)
  });

  it('completeSet grava a carga do ALVO quando não há toque manual, qualquer ramo de reps', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-1';
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      targetLoadKg: 50,
    };
    useActiveSessionStore.setState({ draft, status: 'active' });
    store().setReps('ex-1', 1, 8); // toque manual só em reps; carga fica intocada

    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(true);
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(50);
  });

  it('completeSet sem histórico e sem alvo de carga continua reprovando com a mesma mensagem (D-17 nunca inventa)', async () => {
    await start(); // getLastLoadByExercise/getLastRepsByExercise = {} (default do beforeEach)
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8); // reps informadas, carga NÃO
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(false);
    expect(store().saveError).toMatch(/carga/i);
    expect(store().draft!.exercises[0].sets[0].status).not.toBe('done');
  });

  it('lastRepsByExercise é atualizado em completeSet() com o valor MATERIALIZADO, mesmo em bodyweight (D-02)', async () => {
    mock(getLastRepsByExercise).mockResolvedValue({ flexao: 12 });
    await start();
    store().activateSet('ex-2', 1); // bodyweight, sem toque manual

    const ok = await store().completeSet('ex-2', 1);

    expect(ok).toBe(true);
    const s = store().draft!.exercises[1].sets[0];
    expect(s.actualReps).toBe(12); // herdado do histórico (1ª série do exercício, D-01)
    expect(store().draft!.lastRepsByExercise.flexao).toBe(12);
  });
});

describe('restEndsAt', () => {
  const start = async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
  };

  it('marca o fim do descanso em ISO UTC quando existe próxima série pendente', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    const before = Date.now() + 89_000;
    expect(await store().completeSet('ex-1', 1)).toBe(true);

    const restEndsAt = store().draft?.restEndsAt;
    expect(restEndsAt).toMatch(/Z$/);
    expect(new Date(restEndsAt!).getTime()).toBeGreaterThan(before);
    expect(store().draft?.exercises[0].sets[1].status).toBe('pending');
  });

  it('não cria descanso quando a série concluída não tem próxima série ou descanso', async () => {
    await start();
    const draft = store().draft!;
    useActiveSessionStore.setState({
      draft: {
        ...draft,
        exercises: draft.exercises.map((exercise) =>
          exercise.exerciseId === 'ex-1'
            ? { ...exercise, restSeconds: null, sets: exercise.sets.slice(0, 1) }
            : { ...exercise, sets: exercise.sets.map((set) => ({ ...set, status: 'done' as const })) },
        ),
      },
    });

    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    expect(await store().completeSet('ex-1', 1)).toBe(true);
    expect(store().draft?.restEndsAt).toBeNull();
  });

  it('zera restEndsAt ao ativar explicitamente a próxima série', async () => {
    await start();
    const draft = store().draft!;
    useActiveSessionStore.setState({
      draft: {
        ...draft,
        restEndsAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    store().activateSet('ex-1', 1);
    expect(store().draft?.restEndsAt).toBeNull();
  });

  it('ajusta restEndsAt sem deixar o descanso no passado', async () => {
    await start();
    const draft = store().draft!;
    useActiveSessionStore.setState({
      draft: {
        ...draft,
        restEndsAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const before = new Date(store().draft!.restEndsAt!).getTime();

    store().adjustRest(30);
    const afterPlus = new Date(store().draft!.restEndsAt!).getTime();
    expect(afterPlus).toBeGreaterThan(before + 20_000);

    store().adjustRest(-30);
    expect(new Date(store().draft!.restEndsAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('não auto-avança quando restEndsAt já expirou', async () => {
    await start();
    const draft = store().draft!;
    useActiveSessionStore.setState({
      draft: {
        ...draft,
        restEndsAt: new Date(Date.now() - 1_000).toISOString(),
      },
    });

    await Promise.resolve();
    expect(store().draft?.exercises[0].sets[0].status).toBe('pending');
    expect(store().draft?.exercises[0].sets[1].status).toBe('pending');
  });
});

describe('setRir', () => {
  it('F12: clampa 0–10 no núcleo do store', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-1', 1);
    store().setRir('ex-1', 1, 11);
    expect(store().draft!.exercises[0].sets[0].actualRir).toBe(10);
    store().setRir('ex-1', 1, -3);
    expect(store().draft!.exercises[0].sets[0].actualRir).toBe(0);
  });
});

describe('D2: setReps/setLoad persistem via saveDraft (16-08-PLAN.md/16-VERIFICATION.md gap 1)', () => {
  const start = async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
  };

  it('setReps chama saveDraft com o draft cujo actualReps foi atualizado', async () => {
    await start();
    store().activateSet('ex-1', 1);
    mock(saveDraft).mockClear();

    store().setReps('ex-1', 1, 8);

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualReps).toBe(8);
  });

  it('setLoad chama saveDraft com o draft cujo actualLoadKg foi atualizado', async () => {
    await start();
    store().activateSet('ex-1', 1);
    mock(saveDraft).mockClear();

    store().setLoad('ex-1', 1, 40);

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualLoadKg).toBe(40);
  });

  it('stepLoad chama saveDraft com o draft cujo actualLoadKg foi incrementado (CR-01/16-10-PLAN.md)', async () => {
    await start();
    store().activateSet('ex-1', 1);
    mock(saveDraft).mockClear();

    // ex-1 tem load_increment_kg: 2.5; sem actualLoadKg/lastLoad prévios, o
    // fallback de suggestLoad é null, então base = 0 e o incremento é
    // exatamente 1 * 2.5.
    store().stepLoad('ex-1', 1, 1);

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualLoadKg).toBe(2.5);
  });

  it('setDuration chama saveDraft com o draft cujo actualDurationSeconds foi atualizado (CR-01/16-10-PLAN.md)', async () => {
    await store().startOrResume({
      sessionId: 'sess-tempo',
      userId: 'user-1',
      detail: makeDetailComExercicioDeTempo(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-tempo', 1);
    mock(saveDraft).mockClear();

    store().setDuration('ex-tempo', 1, 45);

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualDurationSeconds).toBe(45);
  });

  it('setDistance chama saveDraft com o draft cujo actualDistanceM foi atualizado (CR-01/16-10-PLAN.md)', async () => {
    await store().startOrResume({
      sessionId: 'sess-tempo',
      userId: 'user-1',
      detail: makeDetailComExercicioDeTempo(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-tempo', 1);
    mock(saveDraft).mockClear();

    store().setDistance('ex-tempo', 1, 3000);

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualDistanceM).toBe(3000);
  });

  it('setRir chama saveDraft com o draft cujo actualRir foi atualizado (CR-01/16-10-PLAN.md)', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-1', 1);
    mock(saveDraft).mockClear();

    store().setRir('ex-1', 1, 3);

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].actualRir).toBe(3);
  });

  it('setEffort chama saveDraft com o draft cujo perceivedEffort foi atualizado (CR-01/16-10-PLAN.md)', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-1', 1);
    mock(saveDraft).mockClear();

    store().setEffort('ex-1', 1, 'moderado');

    expect(saveDraft).toHaveBeenCalled();
    const chamadas = mock(saveDraft).mock.calls;
    const ultimoDraft = chamadas[chamadas.length - 1][0];
    expect(ultimoDraft.exercises[0].sets[0].perceivedEffort).toBe('moderado');
  });
});

describe('D2/D2b: retomada preserva reps/carga digitados antes de um force-quit', () => {
  const start = async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
  };

  /** Simula o force-quit: captura o ÚLTIMO draft persistido por saveDraft (setReps/setLoad
   * fire-and-forget) e o devolve como se fosse o rascunho lido do disco na reabertura. */
  const capturaDraftPersistido = () => {
    const chamadas = mock(saveDraft).mock.calls;
    return chamadas[chamadas.length - 1][0];
  };

  it('ramo OFFLINE (erro de transporte na reconciliação): completeSet() não reprova mais após force-quit', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    const draftPersistido = capturaDraftPersistido();
    expect(draftPersistido.exercises[0].sets[0].actualReps).toBe(8);
    expect(draftPersistido.exercises[0].sets[0].actualLoadKg).toBe(40);

    // Reabertura: loadDraft devolve o rascunho persistido; a reconciliação com o
    // servidor falha por transporte → adota o local por inteiro (ramo offline).
    mock(loadDraft).mockResolvedValue(draftPersistido);
    mock(getOpenSessionLog).mockRejectedValue(
      new SessionExecutionRequestError(new Error('sem rede'), { kind: 'transport' }),
    );

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();

    expect(store().draft!.exercises[0].sets[0].actualReps).toBe(8);
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(40);
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true);
  });

  it('ramo RECONCILIADO COM O SERVIDOR (sem setLog para a série ainda ativa): completeSet() não reprova mais após force-quit', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    const draftPersistido = capturaDraftPersistido();

    // Reabertura: loadDraft devolve o rascunho persistido; o servidor RESPONDE mas
    // ainda não tem confirmação (setLogs) para a série ex-1/1 — ramo reconciliado.
    mock(loadDraft).mockResolvedValue(draftPersistido);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: draftPersistido.sessionLogId,
      startedAt: draftPersistido.startedAt,
      setLogs: [],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();

    // O overlay de D2b preserva reps/carga E o status 'active' da série em andamento.
    expect(store().draft!.exercises[0].sets[0].status).toBe('active');
    expect(store().draft!.exercises[0].sets[0].actualReps).toBe(8);
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(40);
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true);
  });

  it('uma série já "done" localmente mas sem confirmação do servidor NÃO é afetada pelo overlay (fora de escopo)', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    await store().completeSet('ex-1', 1); // marca 'done' localmente, mas setSaveLog não confirma no servidor
    await drainAll('user-1');

    const draftPersistido = capturaDraftPersistido();
    mock(loadDraft).mockResolvedValue(draftPersistido);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: draftPersistido.sessionLogId,
      startedAt: draftPersistido.startedAt,
      setLogs: [], // servidor não confirmou nada
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();

    // Comportamento inalterado: status volta a 'pending' (fresco), fora do escopo de D2/D2b.
    expect(store().draft!.exercises[0].sets[0].status).toBe('pending');
  });

  it('CR-01/16-10-PLAN.md: force-quit logo depois de usar SÓ o stepper de carga (nunca setLoad) não impede completeSet()', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    // NUNCA chama setLoad neste teste — só o stepper, para provar
    // especificamente que o caminho do stepper persiste sozinho.
    store().stepLoad('ex-1', 1, 1);

    const draftPersistido = capturaDraftPersistido();
    expect(draftPersistido.exercises[0].sets[0].actualReps).toBe(8);
    expect(draftPersistido.exercises[0].sets[0].actualLoadKg).toBe(2.5);

    // Reabertura: loadDraft devolve o rascunho persistido; a reconciliação com o
    // servidor falha por transporte -> adota o local por inteiro (ramo offline).
    mock(loadDraft).mockResolvedValue(draftPersistido);
    mock(getOpenSessionLog).mockRejectedValue(
      new SessionExecutionRequestError(new Error('sem rede'), { kind: 'transport' }),
    );

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();

    expect(store().draft!.exercises[0].sets[0].actualReps).toBe(8);
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(2.5);
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true);
  });

  it('CR-01/16-10-PLAN.md: force-quit logo depois de informar a duração de um exercício isTimeBased não impede completeSet(), mesmo sem reps/carga', async () => {
    await store().startOrResume({
      sessionId: 'sess-tempo',
      userId: 'user-1',
      detail: makeDetailComExercicioDeTempo(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-tempo', 1);
    // NUNCA chama setReps/setLoad neste teste — canCompleteSet() para
    // isTimeBased ignora reps/carga por completo (sessionModel.ts:272-274).
    store().setDuration('ex-tempo', 1, 45);

    const draftPersistido = capturaDraftPersistido();
    expect(draftPersistido.exercises[0].sets[0].actualDurationSeconds).toBe(45);

    // Reabertura: loadDraft devolve o rascunho persistido; a reconciliação com o
    // servidor falha por transporte -> adota o local por inteiro (ramo offline).
    mock(loadDraft).mockResolvedValue(draftPersistido);
    mock(getOpenSessionLog).mockRejectedValue(
      new SessionExecutionRequestError(new Error('sem rede'), { kind: 'transport' }),
    );

    await store().startOrResume({
      sessionId: 'sess-tempo',
      userId: 'user-1',
      detail: makeDetailComExercicioDeTempo(),
    });
    await confirmarCheckInSePedido();

    expect(store().draft!.exercises[0].sets[0].actualDurationSeconds).toBe(45);
    const ok = await store().completeSet('ex-tempo', 1);
    expect(ok).toBe(true);
  });
});

describe('D3: activateSet garante no máximo uma série "active" por vez (16-08-PLAN.md/16-VERIFICATION.md gap 1)', () => {
  const start = async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
  };

  it('ativar uma série quando NENHUMA outra está active: comportamento idêntico ao atual (sem regressão)', async () => {
    await start();
    store().activateSet('ex-1', 1);
    expect(store().draft!.exercises[0].sets[0].status).toBe('active');
    const ativas = store().draft!.exercises
      .flatMap((e) => e.sets)
      .filter((s) => s.status === 'active');
    expect(ativas).toHaveLength(1);
  });

  it('D3: completeSet reprovado deixa uma série "active"; activateSet no próximo exercício desativa a travada', async () => {
    await start();
    // (a) ativa ex-1/1, chama completeSet SEM setReps/setLoad (reprova de propósito)
    store().activateSet('ex-1', 1);
    const reprovado = await store().completeSet('ex-1', 1);
    expect(reprovado).toBe(false);
    expect(store().draft!.exercises[0].sets[0].status).toBe('active');

    // (b) ativa a série do PRÓXIMO exercício (simula "Pular" avançando)
    store().activateSet('ex-2', 1);

    // (c) a travada volta a pending; a nova fica active
    expect(store().draft!.exercises[0].sets[0].status).toBe('pending');
    expect(store().draft!.exercises[0].sets[0].activatedAt).toBeNull();
    expect(store().draft!.exercises[1].sets[0].status).toBe('active');

    // (d) exatamente UMA série active em todo o draft, nunca duas
    const ativas = store()
      .draft!.exercises.flatMap((e) => e.sets)
      .filter((s) => s.status === 'active');
    expect(ativas).toHaveLength(1);
  });

  it('desativar a série travada preserva reps/carga já digitados (mesmo contrato de applyExerciseSkipToDraft)', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 5); // reps informadas, mas SEM carga → completeSet reprova
    await store().completeSet('ex-1', 1);
    expect(store().draft!.exercises[0].sets[0].status).toBe('active');

    store().activateSet('ex-2', 1);

    const desativada = store().draft!.exercises[0].sets[0];
    expect(desativada.status).toBe('pending');
    expect(desativada.actualReps).toBe(5);
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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();

    expect(store().draft?.lastLoadByExercise['supino reto']).toBe(55);
  });

  it('startOrResume() chama reconcileLiveActivityIntents() ao resolver para um draft ativo (16-VERIFICATION.md gap 1 / 16-REVIEW.md CR-01)', async () => {
    const draftLocal = buildDraftFromDetail(makeDetail(), 'user-1');
    draftLocal.sessionLogId = 'sl-existente';
    mock(loadDraft).mockResolvedValue(draftLocal);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-existente',
      startedAt: 'T0',
      setLogs: [],
    });
    mock(peekQueuedLiveActivityIntents).mockResolvedValue([]);

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();

    expect(store().status).toBe('active');
    expect(peekQueuedLiveActivityIntents).toHaveBeenCalled();
  });
});

describe('Fase 16 — reconcileLiveActivityIntents: adoção de órfãs com skew de relógio (WR-03)', () => {
  const iniciarDraftAtivo = async (): Promise<void> => {
    const draftLocal = buildDraftFromDetail(makeDetail(), 'user-1');
    draftLocal.sessionLogId = 'sl-1';
    draftLocal.startedAt = '2026-08-16T11:00:00.000Z';
    mock(loadDraft).mockResolvedValue(draftLocal);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-1',
      startedAt: '2026-08-16T11:00:00.000Z',
      setLogs: [],
    });
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    // Garante o contrato temporal da heurística independente do ramo de
    // hidratação usado pelo startOrResume (a fonte do startedAt varia).
    useActiveSessionStore.setState({
      draft: {
        ...store().draft!,
        sessionLogId: 'sl-1',
        startedAt: '2026-08-16T11:00:00.000Z',
      },
    });
  };

  const entradaOrfa = (id: string, queuedAt: string) => ({
    kind: 'skipRest' as const,
    deltaSeconds: null,
    deltaValue: null,
    sessionLogId: null,
    queuedAt,
    id,
  });

  it('WR-03: órfã enfileirada DENTRO da janela de skew (30s antes de startedAt, relógio do aparelho atrás) é adotada e aplicada', async () => {
    await iniciarDraftAtivo();
    mock(peekQueuedLiveActivityIntents).mockResolvedValue([
      entradaOrfa('orphan-dentro', '2026-08-16T10:59:30.000Z'),
    ]);

    await store().reconcileLiveActivityIntents();

    // skipRest aplicado → a primeira série pendente (ex-1/1, todas pendentes
    // no draft hidratado) virou ativa
    expect(store().draft?.exercises[0]!.sets[0]!.status).toBe('active');
    expect(mock(ackQueuedLiveActivityIntent)).toHaveBeenCalledWith('orphan-dentro');
  });

  it('WR-03: órfã enfileirada FORA da janela de skew (90s antes de startedAt) é descartada por CAS, sem aplicar', async () => {
    await iniciarDraftAtivo();
    mock(peekQueuedLiveActivityIntents).mockResolvedValue([
      entradaOrfa('orphan-fora', '2026-08-16T10:58:30.000Z'),
    ]);

    await store().reconcileLiveActivityIntents();

    expect(store().draft?.exercises[1]!.sets[0]!.status).not.toBe('active');
    // descarte definitivo por CAS: confirmada para não acumular na fila
    expect(mock(ackQueuedLiveActivityIntent)).toHaveBeenCalledWith('orphan-fora');
  });

  it('WR-03: fronteira de precisão — órfã sem fração de segundo no MESMO segundo do início (startedAt .300) é adotada', async () => {
    await iniciarDraftAtivo();
    // startedAt do servidor com milissegundos; queuedAt de um build antigo
    // (sem fração) no mesmo segundo — antes do fix, 11:00:00.000 < 11:00:00.300
    // descartava o toque legítimo.
    useActiveSessionStore.setState({
      draft: { ...store().draft!, startedAt: '2026-08-16T11:00:00.300Z' },
    });
    mock(peekQueuedLiveActivityIntents).mockResolvedValue([
      entradaOrfa('orphan-segundo', '2026-08-16T11:00:00Z'),
    ]);

    await store().reconcileLiveActivityIntents();

    expect(store().draft?.exercises[0]!.sets[0]!.status).toBe('active');
    expect(mock(ackQueuedLiveActivityIntent)).toHaveBeenCalledWith('orphan-segundo');
  });
});

describe('concluir a sessão', () => {
  it('fecha o log e limpa o rascunho local', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    const ok = await store().finishSession();

    expect(ok).toBe(true);
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
    expect(store().status).toBe('finished');

    // Fase 4 (REQ-07/D-08): finishSession enfileira em vez de aguardar a RPC —
    // finishSessionLog só é chamado quando a drenagem fire-and-forget assenta.
    await drainAll('user-1');
    expect(finishSessionLog).toHaveBeenCalled();
  });

  it('D-08: falha ao fechar NÃO bloqueia — a sessão finaliza local (sem saveError) e o item fica pendente na fila mesmo com o draft já limpo', async () => {
    mock(finishSessionLog).mockRejectedValue(
      new SessionExecutionRequestError(new Error('timeout'), { status: 0 }),
    );
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    const ok = await store().finishSession();

    // Sob D-08, finalizar nunca aguarda a confirmação do servidor: a tela de
    // fim aparece IMEDIATAMENTE, sem erro, mesmo que a RPC subjacente falhe.
    expect(ok).toBe(true);
    expect(store().status).toBe('finished');
    expect(store().saveError).toBeNull();
    expect(store().draft?.status).toBe('finished');
    // retireLocalDraft já rodou — o rascunho local (AsyncStorage) foi limpo.
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');

    // A fila drena em segundo plano, inclusive DEPOIS de o rascunho local já
    // ter sido limpo — prova de nível-mock do critério de sucesso #3 do
    // 04-CONTEXT.md ("drena o que faltou, inclusive quando a sessão já foi
    // finalizada").
    await drainAll('user-1');
    expect(finishSessionLog).toHaveBeenCalled();
    const doc = await loadOutbox('user-1');
    // Erro de transporte nunca quarentena (Pitfall 2) — o item continua
    // pendente, com backoff agendado, para retentar depois.
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].kind).toBe('finish_session');
    expect(doc.quarantine).toHaveLength(0);
  });

  it('F4: finish idempotente — 2ª chamada (RPC já finalizou, resolve) NÃO trava o cliente em erro', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();

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
    await confirmarCheckInSePedido();
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
    });
    await confirmarCheckInSePedido(); // A = sl-1
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
    });
    await confirmarCheckInSePedido(); // A = sl-1

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
    await confirmarCheckInSePedido();
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

  it('completeSet chamado depois do finish não recria rascunho finalizado', async () => {
    // Fase 4 (REQ-07/D-05+D-08): completeSet e finishSession decidem se
    // commitam localmente com base SÓ no estado local (draft.status), ANTES
    // de qualquer chamada de rede — a mutação do draft nunca mais espera a
    // resolução da RPC (que agora corre em segundo plano via drainAll e não
    // toca `draft`). Por isso o cenário que este teste prova é mais forte que
    // antes: mesmo que a RPC subjacente de um completeSet atrasado NUNCA
    // resolva, a guarda de CAS (`atual.status !== 'active'`) já bloqueia o
    // commit local antes de qualquer rede ser envolvida — "gravação atrasada"
    // deixou de ser um cenário de rede (estruturalmente impossível agora) e
    // passou a ser cenário de CHAMADA atrasada (completeSet invocado depois
    // do finish já ter resolvido localmente).
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    expect(await store().finishSession()).toBe(true);
    mock(saveDraft).mockClear();

    // completeSet chamado DEPOIS que a sessão já finalizou localmente —
    // bloqueado pela guarda de CAS, sem gravar nada.
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true); // bail-out de CAS: nada a fazer, não é erro

    expect(store().status).toBe('finished');
    // A conclusão grava apenas o tombstone `finished` (via retireLocalDraft,
    // já chamado antes do mockClear); o completeSet tardio não recria nada.
    expect(saveDraft).not.toHaveBeenCalled();
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
  });
});

describe('trava de reentrância (F9)', () => {
  // Fase 4 (REQ-07/D-05): antes desta fase, `completeSet` aguardava a RPC
  // direta sob RPC_TIMEOUT_MS — uma gravação travada fazia a PROMESSA de
  // completeSet só resolver (com `false`) depois do timeout. Isso não existe
  // mais: a gravação vira item de fila e completeSet nunca aguarda a rede.
  // A trava `inFlight` agora protege só a janela CURTA do enfileiramento
  // local (F9 continua válido nesse sentido restrito) — timeout/backoff da
  // RPC em si são responsabilidade de sessionOutboxDrain.ts, já cobertos em
  // __tests__/sessionOutboxDrain.test.ts.
  it('D-05: completeSet conclui a série IMEDIATAMENTE mesmo com a RPC travada; nova tentativa é idempotente e o item original permanece ÚNICO na fila (sem duplicar)', async () => {
    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);

    // A RPC nunca resolve nesta rodada — a prova de que completeSet NÃO depende
    // dela (D-05): se dependesse, este `await` abaixo travaria o teste.
    const late = deferred<{
      setLogId: string;
      actualReps: number;
      actualLoadKg: number | null;
      actualRir: number | null;
      outcome: 'on_target';
      actualDurationSeconds: number | null;
      actualDistanceM: number | null;
      paceSecondsPerKm: number | null;
      perceivedEffort: null;
      completedAt: string;
    }>();
    mock(saveSetLog).mockReturnValueOnce(late.promise);

    const r1 = await store().completeSet('ex-1', 1);

    expect(r1).toBe(true);
    expect(store().saveError).toBeNull();
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');

    // A TRAVA foi liberada assim que o enfileiramento local terminou: nova
    // chamada da MESMA série é idempotente (short-circuit por status 'done'),
    // sem nova RPC e sem item duplicado na fila (D-13).
    mock(saveSetLog).mockClear();
    const r2 = await store().completeSet('ex-1', 1);
    expect(r2).toBe(true);
    expect(saveSetLog).not.toHaveBeenCalled();

    // O item ORIGINAL (a RPC travada) continua ÚNICO na fila local — não foi
    // perdido nem duplicado enquanto a rede não respondia.
    const doc = await loadOutbox('user-1');
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].kind).toBe('save_set_log');

    // Libera a RPC travada para não vazar handle entre testes; a resolução
    // tardia da chamada não pode alterar o draft já concluído localmente.
    late.resolve({
      setLogId: 'set-late',
      actualReps: 99,
      actualLoadKg: 99,
      actualRir: 9,
      outcome: 'on_target',
      actualDurationSeconds: null,
      actualDistanceM: null,
      paceSecondsPerKm: null,
      perceivedEffort: null,
      completedAt: '2026-07-20T10:10:00Z',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(40);
  });
});

describe('sessão concluída/recusada não reabre (deep link/refresh)', () => {
  const abrirComStatus = async (status: 'completed' | 'skipped') => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-antigo';
    mock(loadDraft).mockResolvedValue(draft);

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: { ...makeDetail(), status },
    });
    await confirmarCheckInSePedido();
  };

  it('status completed → finished, draft null, draft local aposentado (tombstone)', async () => {
    await abrirComStatus('completed');

    expect(store().status).toBe('finished');
    expect(store().draft).toBeNull();
    // Tombstone: saveDraft com status finished antes de clearDraft.
    expect(mock(saveDraft)).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'finished' }),
    );
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-antigo');
    // start_session não é chamado — não reabre.
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('status skipped → finished, draft null, draft local aposentado', async () => {
    await abrirComStatus('skipped');

    expect(store().status).toBe('finished');
    expect(store().draft).toBeNull();
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-antigo');
    expect(startSessionLog).not.toHaveBeenCalled();
  });
});

describe('falha de persistência local → storageWarning não bloqueante', () => {
  it('concluir série com saveDraft falhando → série FICA feita e aviso aparece', async () => {
    mock(getOpenSessionLog).mockResolvedValue(null);
    mock(startSessionLog).mockResolvedValue({ sessionLogId: 'sl-1', startedAt: '2026-07-20T10:00:00Z' });
    mock(saveSetLog).mockResolvedValue({
      setLogId: 'set-st-1',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'on_target',
    });
    // A RPC confirmou, mas o AsyncStorage falha.
    mock(saveDraft).mockRejectedValue(new Error('storage cheio'));

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });
    await confirmarCheckInSePedido();
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    await store().completeSet('ex-1', 1);

    // Série permanece feita (insert confirmado não regride) e o aviso aparece.
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(store().storageWarning).toContain('salvar localmente');
    expect(store().status).toBe('active');
  });
});

describe('Achado 5 (painel 05-02): reset() resincroniza pendingCount/quarantineCount da fila REAL, não zera às cegas', () => {
  it('reset(userId) com item real pendente na fila do usuário: contagem NÃO fica travada em zero', async () => {
    // Wifi ruim no fim do treino A: item real fica na fila do USUÁRIO (D-10),
    // não da tela.
    await enqueueItem('user-1', {
      sessionLogId: 'log-A',
      kind: 'save_set_log',
      payload: {
        sessionLogId: 'log-A',
        plannedSetId: 'st-A',
        actualReps: 8,
        actualLoadKg: 40,
        actualRir: 2,
        outcome: 'on_target',
      },
    });

    // Aluno entra no treino B do MESMO usuário — iniciar() chama reset(userId).
    store().reset('user-1');

    // Antes do fix: reset() zerava pendingCount/quarantineCount
    // incondicionalmente e nada resincronizava contra a fila real — o selo
    // "N registros a caminho" ficava invisível até a próxima mutação ou
    // AppState. Espera o resync assíncrono (loadOutbox) terminar.
    for (let i = 0; i < 20 && store().pendingCount === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(store().pendingCount).toBe(1);
    expect(store().quarantineCount).toBe(0);
  });

  it('reset() sem userId (fallback defensivo) continua zerando síncrono, como antes', () => {
    useActiveSessionStore.setState({ pendingCount: 3, quarantineCount: 1 });
    store().reset();
    expect(store().pendingCount).toBe(0);
    expect(store().quarantineCount).toBe(0);
  });
});
