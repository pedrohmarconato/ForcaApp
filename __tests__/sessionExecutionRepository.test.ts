// __tests__/sessionExecutionRepository.test.ts
// Fase 4 (+ 4.1) — escrita/leitura da execução. Modos de falha cobertos:
// - start/finish agora via RPC ATÔMICA (start_session/finish_session); erro propaga
// - saveSetLog é UPSERT idempotente (onConflict session_log_id,planned_set_id)
// - getOpenSessionLog ORDENA os set_logs e COAGE numeric (string "50" -> 50) [F4/F8]
// - erro do banco sempre PROPAGA (nunca vira sucesso silencioso)

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import {
  startSessionLog,
  saveSetLog,
  getOpenSessionLog,
  finishSessionLog,
  getLastLoadByExerciseName,
  getCompletedSessions,
  getSessionLogDetail,
  isTransportSessionExecutionError,
  SessionExecutionRequestError,
} from '../src/services/sessionExecutionRepository';

const fromMock = supabase.from as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;

const makeBuilder = (result: { data?: unknown; error: unknown }) => {
  const builder: any = {};
  const chain = () => builder;
  builder.insert = jest.fn(chain);
  builder.upsert = jest.fn(chain);
  builder.update = jest.fn(chain);
  builder.select = jest.fn(chain);
  builder.eq = jest.fn(chain);
  builder.is = jest.fn(chain);
  builder.not = jest.fn(chain);
  builder.order = jest.fn(chain);
  builder.limit = jest.fn(chain);
  builder.range = jest.fn(chain);
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe('startSessionLog (RPC atômica start_session)', () => {
  it('devolve id + started_at da linha retornada', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { id: 'sl-1', started_at: '2026-07-17T10:00:00Z' },
      error: null,
    });
    const res = await startSessionLog('ps-1');
    expect(res).toEqual({
      sessionLogId: 'sl-1',
      startedAt: '2026-07-17T10:00:00Z',
    });
    expect(rpcMock).toHaveBeenCalledWith('start_session', {
      p_planned_session_id: 'ps-1',
      p_mood: null,
      p_available_minutes: null,
    });
  });

  it('aceita retorno em formato array', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ id: 'sl-2', started_at: 'T1' }],
      error: null,
    });
    expect(await startSessionLog('ps-1')).toEqual({
      sessionLogId: 'sl-2',
      startedAt: 'T1',
    });
  });

  it('erro da RPC propaga (não engole)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('rpc negou'),
    });
    await expect(startSessionLog('ps-1')).rejects.toThrow('rpc negou');
  });
});

describe('saveSetLog (RPC save_set_log — F1: índice PARCIAL exige predicado explícito)', () => {
  // O .upsert(onConflict) do PostgREST gera ON CONFLICT SEM predicado → NÃO infere o
  // índice único PARCIAL (WHERE planned_set_id IS NOT NULL) → 42P10 em runtime. Por
  // isso a gravação passa a ser via RPC save_set_log (ON CONFLICT ... WHERE explícito).
  it('chama a RPC save_set_log com os p_ params e devolve o id da linha retornada', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        id: 'set-1',
        actual_reps: 8,
        actual_load_kg: '40',
        actual_rir: 2,
        outcome: 'on_target',
      },
      error: null,
      status: 200,
    });

    const res = await saveSetLog({
      sessionLogId: 'sl-1',
      plannedSetId: 'st-1',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: 2,
      outcome: 'on_target',
    });

    expect(res).toEqual({
      setLogId: 'set-1',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: 2,
      outcome: 'on_target',
    });
    expect(rpcMock).toHaveBeenCalledWith('save_set_log', {
      p_session_log_id: 'sl-1',
      p_planned_set_id: 'st-1',
      p_actual_reps: 8,
      p_actual_load_kg: 40,
      p_actual_rir: 2,
      p_outcome: 'on_target',
      p_started_at: null,
    });
    // NÃO usa mais .from(...).upsert(...): o upsert do PostgREST é justamente o bug.
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('aceita retorno em formato array (alguns setups devolvem a linha em array)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          id: 'set-2',
          actual_reps: 15,
          actual_load_kg: null,
          actual_rir: null,
          outcome: 'over',
        },
      ],
      error: null,
    });
    const res = await saveSetLog({
      sessionLogId: 'sl-1',
      plannedSetId: 'st-3',
      actualReps: 15,
      actualLoadKg: null,
      actualRir: null,
      outcome: 'over',
    });
    expect(res).toEqual({
      setLogId: 'set-2',
      actualReps: 15,
      actualLoadKg: null,
      actualRir: null,
      outcome: 'over',
    });
  });

  it('erro do banco PROPAGA (ex.: a função recusa log finalizado/alheio)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: new Error('já finalizado'),
    });
    await expect(
      saveSetLog({
        sessionLogId: 'sl-1',
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 40,
        actualRir: null,
        outcome: 'on_target',
      }),
    ).rejects.toThrow('já finalizado');
  });

  it('resposta sem id NÃO vira sucesso silencioso (propaga erro)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      saveSetLog({
        sessionLogId: 'sl-1',
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 40,
        actualRir: null,
        outcome: 'on_target',
      }),
    ).rejects.toThrow(/não retornou/i);
  });

  it('encaminha AbortSignal ao postgrest-js', async () => {
    const abortSignal = jest.fn().mockResolvedValue({
      data: {
        id: 'set-3',
        actual_reps: 8,
        actual_load_kg: '42.5',
        actual_rir: 1,
        outcome: 'on_target',
      },
      error: null,
      status: 200,
    });
    rpcMock.mockReturnValueOnce({ abortSignal });
    const controller = new AbortController();

    await saveSetLog(
      {
        sessionLogId: 'sl-1',
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 42.5,
        actualRir: 1,
        outcome: 'on_target',
      },
      controller.signal,
    );

    expect(abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});

describe('getOpenSessionLog', () => {
  it('sem execução em aberto devolve null', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ data: [], error: null }));
    expect(await getOpenSessionLog('user-1', 'ps-1')).toBeNull();
  });

  it('ORDENA os set_logs e COAGE numeric string para número (F4/F8)', async () => {
    const logBuilder = makeBuilder({
      data: [
        {
          id: 'sl-9',
          started_at: 'T0',
          set_logs: [
            {
              id: 'set-2',
              planned_set_id: 'st-2',
              actual_reps: '9',
              actual_load_kg: '52.5',
              actual_rir: '1',
              outcome: 'on_target',
              completed_at: '2026-07-17T11:00:00Z',
            },
            // actual_load_kg como STRING, do jeito que o PostgREST devolve numeric
            {
              id: 'set-1',
              planned_set_id: 'st-1',
              actual_reps: 8,
              actual_load_kg: '50',
              actual_rir: 2,
              outcome: 'on_target',
              completed_at: '2026-07-17T10:00:00Z',
            },
          ],
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(logBuilder);

    const res = await getOpenSessionLog('user-1', 'ps-1');

    expect(res?.sessionLogId).toBe('sl-9');
    expect(res?.setLogs[0].actual_load_kg).toBe(50); // number, não "50"
    expect(typeof res?.setLogs[0].actual_load_kg).toBe('number');
    expect(res?.setLogs[1].actual_reps).toBe(9);
    expect(logBuilder.is).toHaveBeenCalledWith('finished_at', null);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 403 sem code continua sendo erro de servidor, não offline', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: null,
        error: { message: 'Forbidden' },
        status: 403,
      } as any),
    );
    const error = await getOpenSessionLog('user-1', 'ps-1').catch((e) => e);
    expect(error).toBeInstanceOf(SessionExecutionRequestError);
    expect(error.kind).toBe('server');
    expect(error.code).toBeNull();
    expect(isTransportSessionExecutionError(error)).toBe(false);
  });

  it('status 0 é transporte mesmo quando o payload possui code', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: null,
        error: { message: 'socket closed', code: 'ECONNRESET' },
        status: 0,
      } as any),
    );
    const error = await getOpenSessionLog('user-1', 'ps-1').catch((e) => e);
    expect(error.kind).toBe('transport');
    expect(error.code).toBe('ECONNRESET');
    expect(isTransportSessionExecutionError(error)).toBe(true);
  });
});

describe('finishSessionLog (RPC atômica finish_session)', () => {
  it('chama a RPC com o id do log', async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    await finishSessionLog('sl-1');
    expect(rpcMock).toHaveBeenCalledWith('finish_session', {
      p_session_log_id: 'sl-1',
    });
  });

  it('erro (ex.: 0 linhas → exceção da função) PROPAGA', async () => {
    rpcMock.mockResolvedValueOnce({
      error: new Error('inexistente, alheio ou já finalizado'),
    });
    await expect(finishSessionLog('sl-1')).rejects.toThrow('já finalizado');
  });
});

describe('getLastLoadByExerciseName', () => {
  it('nomes vazios não consultam o banco', async () => {
    expect(await getLastLoadByExerciseName([])).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('pega a carga MAIS RECENTE por exercício e coage numeric', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_load_kg: '42.5',
            completed_at: '2026-07-17T10:00:00Z',
            planned_sets: { planned_exercises: { name: 'Supino Reto' } },
          },
          {
            actual_load_kg: '40',
            completed_at: '2026-07-10T10:00:00Z',
            planned_sets: { planned_exercises: { name: 'Supino Reto' } },
          },
          {
            actual_load_kg: 'abc',
            completed_at: '2026-07-17T11:00:00Z',
            planned_sets: { planned_exercises: { name: 'Agachamento' } },
          },
        ],
        error: null,
      }),
    );
    expect(
      await getLastLoadByExerciseName(['Supino Reto', 'Agachamento']),
    ).toEqual({ 'supino reto': 42.5 });
  });
});

describe('getCompletedSessions', () => {
  it('mapeia sessões concluídas com título e semana', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            id: 'sl-1',
            planned_session_id: 'ps-1',
            started_at: '2026-07-17T09:00:00Z',
            finished_at: '2026-07-17T10:00:00Z',
            planned_sessions: {
              title: 'Push A',
              week_number: 2,
              muscle_groups: ['Peito'],
            },
          },
        ],
        error: null,
      }),
    );
    const res = await getCompletedSessions('user-1');
    expect(res[0]).toEqual({
      sessionLogId: 'sl-1',
      plannedSessionId: 'ps-1',
      title: 'Push A',
      weekNumber: 2,
      muscleGroups: ['Peito'],
      startedAt: '2026-07-17T09:00:00Z',
      finishedAt: '2026-07-17T10:00:00Z',
    });
  });

  it('ordena pela CONCLUSÃO, não pelo início (achado #10)', async () => {
    const builder = makeBuilder({ data: [], error: null });
    fromMock.mockReturnValueOnce(builder);

    await getCompletedSessions('user-1');

    expect(builder.order).toHaveBeenCalledWith('finished_at', { ascending: false });
  });

  it('pagina além do teto de 1000 linhas do PostgREST (achado #2)', async () => {
    const linha = (i: number) => ({
      id: `sl-${i}`,
      planned_session_id: `ps-${i}`,
      started_at: '2026-07-17T09:00:00Z',
      finished_at: '2026-07-17T10:00:00Z',
      planned_sessions: { title: 'Treino', week_number: 1, muscle_groups: [] },
    });
    const paginaCheia = Array.from({ length: 1000 }, (_, i) => linha(i));
    const paginaResto = Array.from({ length: 40 }, (_, i) => linha(1000 + i));

    const builder1 = makeBuilder({ data: paginaCheia, error: null });
    const builder2 = makeBuilder({ data: paginaResto, error: null });
    fromMock.mockReturnValueOnce(builder1).mockReturnValueOnce(builder2);

    const res = await getCompletedSessions('user-1');

    expect(res).toHaveLength(1040);
    expect(builder1.range).toHaveBeenCalledWith(0, 999);
    expect(builder2.range).toHaveBeenCalledWith(1000, 1999);
  });

  it('página incompleta encerra a paginação com uma única consulta', async () => {
    const builder = makeBuilder({
      data: [
        {
          id: 'sl-1',
          planned_session_id: 'ps-1',
          started_at: '2026-07-17T09:00:00Z',
          finished_at: '2026-07-17T10:00:00Z',
          planned_sessions: { title: 'Treino', week_number: 1, muscle_groups: [] },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(builder);

    const res = await getCompletedSessions('user-1');

    expect(res).toHaveLength(1);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

describe('getSessionLogDetail', () => {
  it('agrupa por exercício, ordena séries e coage numeric', async () => {
    const cabecalho = makeBuilder({
      data: {
        id: 'sl-1',
        started_at: 'T0',
        finished_at: 'T1',
        planned_sessions: { title: 'Push A', week_number: 2 },
      },
      error: null,
    });
    const linhas = makeBuilder({
      data: [
        {
          actual_reps: 10,
          actual_load_kg: '40',
          actual_rir: 2,
          outcome: 'on_target',
          completed_at: 'z',
          planned_sets: {
            set_order: 2,
            planned_exercises: { name: 'Supino', exercise_order: 1 },
          },
        },
        {
          actual_reps: 8,
          actual_load_kg: '40',
          actual_rir: 2,
          outcome: 'on_target',
          completed_at: 'z',
          planned_sets: {
            set_order: 1,
            planned_exercises: { name: 'Supino', exercise_order: 1 },
          },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(cabecalho).mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-1');
    expect(res?.exercises[0].sets.map((s) => s.setOrder)).toEqual([1, 2]);
    expect(res?.exercises[0].sets[0].actualLoadKg).toBe(40); // number
  });
});
