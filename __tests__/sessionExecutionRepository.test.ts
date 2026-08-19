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
  getLastLoadByExercise,
  getLastRepsByExercise,
  getCompletedSessions,
  getSetLogsResumo,
  getSessionLogDetail,
  isTransportSessionExecutionError,
  SessionExecutionRequestError,
} from '../src/services/sessionExecutionRepository';
import {
  formatCardioSetResult,
  doneLine,
  type DraftExercise,
  type DraftSet,
} from '../src/engine/sessionModel';

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
  builder.neq = jest.fn(chain);
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

// Paridade com a doneLine REAL (src/engine/sessionModel.ts, usada pela fila
// da sessão ativa) — importada, não copiada: se a doneLine mudar sem o
// formatCardioSetResult acompanhar (ou vice-versa), este teste fica vermelho
// (Pitfall 5). A doneLine mora no motor desde o WR-01 — importá-la do
// componente puxaria a cadeia React/AsyncStorage do store, quebrando o Jest.
// O fixture mínimo basta porque doneLine só lê metric do exercício e
// actual* da série.
const exCardio = { metric: 'tempo_distancia' } as DraftExercise;
const setCardio = (caso: {
  durationSeconds: number | null;
  distanceM: number | null;
  perceivedEffort: 'leve' | 'moderado' | 'forte' | null;
}): DraftSet =>
  ({
    actualDurationSeconds: caso.durationSeconds,
    actualDistanceM: caso.distanceM,
    perceivedEffort: caso.perceivedEffort,
  }) as DraftSet;

describe('formatCardioSetResult (Fase 3, D-08 histórico — paridade com SessionQueue.doneLine)', () => {
  it('duração + distância + pace + esforço', () => {
    expect(
      formatCardioSetResult({ durationSeconds: 1200, distanceM: 5000, perceivedEffort: 'moderado' }),
    ).toBe('20:00 · 5 km · 4:00 /km · moderado');
  });

  it('só duração — sem distância, sem pace, sem esforço inventado', () => {
    expect(
      formatCardioSetResult({ durationSeconds: 300, distanceM: null, perceivedEffort: null }),
    ).toBe('5:00');
  });

  it('paridade byte a byte com a doneLine REAL em 8 combinações (anti-drift, Pitfall 5)', () => {
    const casos: Array<{
      durationSeconds: number | null;
      distanceM: number | null;
      perceivedEffort: 'leve' | 'moderado' | 'forte' | null;
    }> = [
      { durationSeconds: 1200, distanceM: 5000, perceivedEffort: 'moderado' },
      { durationSeconds: 300, distanceM: null, perceivedEffort: null },
      { durationSeconds: 1800, distanceM: 3200, perceivedEffort: 'forte' },
      { durationSeconds: 600, distanceM: null, perceivedEffort: 'leve' },
      // Bordas: duração longa, distância zero, decimal com vírgula, hora exata.
      { durationSeconds: 7200, distanceM: 21000, perceivedEffort: null },
      { durationSeconds: 450, distanceM: 0, perceivedEffort: null },
      { durationSeconds: 450, distanceM: 1250, perceivedEffort: 'moderado' },
      { durationSeconds: 3600, distanceM: 5000, perceivedEffort: 'leve' },
    ];
    for (const caso of casos) {
      expect(formatCardioSetResult(caso)).toBe(doneLine(exCardio, setCardio(caso)));
    }
  });
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
        completed_at: '2026-07-15T22:00:00.000Z',
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
      actualDurationSeconds: null,
      actualDistanceM: null,
      paceSecondsPerKm: null,
      perceivedEffort: null,
      completedAt: '2026-07-15T22:00:00.000Z',
    });
    expect(rpcMock).toHaveBeenCalledWith('save_set_log', {
      p_session_log_id: 'sl-1',
      p_planned_set_id: 'st-1',
      p_actual_reps: 8,
      p_actual_load_kg: 40,
      p_actual_rir: 2,
      p_outcome: 'on_target',
      p_started_at: null,
      p_actual_duration_seconds: null,
      p_actual_distance_m: null,
      p_perceived_effort: null,
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
          completed_at: '2026-07-15T22:05:00.000Z',
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
      actualDurationSeconds: null,
      actualDistanceM: null,
      paceSecondsPerKm: null,
      perceivedEffort: null,
      completedAt: '2026-07-15T22:05:00.000Z',
    });
  });

  it('série sem completed_at NÃO vira carimbo fabricado (quebra de contrato propaga)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        id: 'set-4',
        actual_reps: 8,
        actual_load_kg: '40',
        actual_rir: 2,
        outcome: 'on_target',
      },
      error: null,
      status: 200,
    });

    await expect(
      saveSetLog({
        sessionLogId: 'sl-1',
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 40,
        actualRir: 2,
        outcome: 'on_target',
      }),
    ).rejects.toThrow(/sem completed_at/i);
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
        completed_at: '2026-07-15T22:10:00.000Z',
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

describe('getLastLoadByExercise', () => {
  it('lista vazia não consulta o banco', async () => {
    expect(await getLastLoadByExercise([])).toEqual({});
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
      await getLastLoadByExercise(['supino reto', 'agachamento']),
    ).toEqual({ 'supino reto': 42.5 });
  });

  // Modo de falha que motivou o catálogo: a semana de deload rotulava o mesmo
  // exercício como "Supino com Halteres (Deload)". Casando por NOME, o histórico
  // da semana anterior não era encontrado e o aluno perdia a sugestão de carga.
  it('casa pelo exercise_key mesmo quando o nome exibido difere', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_load_kg: '30',
            completed_at: '2026-07-17T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Supino com Halteres (Deload)',
                exercise_key: 'supino_reto_halteres',
              },
            },
          },
        ],
        error: null,
      }),
    );
    expect(await getLastLoadByExercise(['k:supino_reto_halteres'])).toEqual({
      'k:supino_reto_halteres': 30,
    });
  });

  it('plano legado sem exercise_key continua casando pelo nome normalizado', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_load_kg: '25',
            completed_at: '2026-07-17T10:00:00Z',
            planned_sets: {
              planned_exercises: { name: 'Rosca Direta', exercise_key: null },
            },
          },
        ],
        error: null,
      }),
    );
    expect(await getLastLoadByExercise(['rosca direta'])).toEqual({
      'rosca direta': 25,
    });
  });

  // A2 (achado): a cópia joint preserva exercise_key (migration 0026), então
  // sem filtrar por purpose o histórico do treino CONJUNTO contamina a
  // sugestão do treino SOLO. Aqui a carga conjunta (40kg) é mais recente que
  // a solo (60kg) — sem o fix, "primeiro visto" (ordenado por completed_at
  // desc) vence e a sugestão solo sai errada.
  it('ignora set_logs de plano purpose=joint na sugestão do treino solo', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_load_kg: '40',
            completed_at: '2026-08-04T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Supino Reto',
                exercise_key: 'supino_reto_barra',
                planned_sessions: { training_plans: { purpose: 'joint' } },
              },
            },
          },
          {
            actual_load_kg: '60',
            completed_at: '2026-07-20T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Supino Reto',
                exercise_key: 'supino_reto_barra',
                planned_sessions: { training_plans: { purpose: 'solo' } },
              },
            },
          },
        ],
        error: null,
      }),
    );
    expect(
      await getLastLoadByExercise(['k:supino_reto_barra']),
    ).toEqual({ 'k:supino_reto_barra': 60 });
  });

  // P4 (achado): .limit(300) cortava ANTES do filtro de purpose='joint', que
  // rodava só depois, em JS. Um usuário com 300 set_logs joint mais recentes
  // do que o único set_log solo perdia a sugestão: o registro solo antigo
  // nunca entrava na janela dos 300 antes de o filtro de purpose ter chance
  // de agir. O builder abaixo não reimplementa o filtro em JS de teste: ele
  // aplica de volta, sobre um dataset de 301 linhas, EXATAMENTE os predicados
  // (not/eq/neq) que a query de produção encadeou — e só corta pelo limit
  // depois, como o Postgres faz (WHERE sempre antes de LIMIT, não importa a
  // ordem de encadeamento no builder). Isso prova que o filtro de purpose
  // está DENTRO da query, e não apenas em JS depois que o corte já aconteceu.
  it('não perde a sugestão solo quando 300 set_logs joint recentes precedem o único solo antigo', async () => {
    const getPath = (obj: any, path: string): any =>
      path.split('.').reduce((acc: any, key: string) => (acc == null ? acc : acc[key]), obj);

    const makeQueryEngineBuilder = (rows: any[]) => {
      const predicates: Array<(row: any) => boolean> = [];
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitN: number | null = null;
      const builder: any = {};
      builder.select = jest.fn(() => builder);
      builder.not = jest.fn((col: string, op: string, val: unknown) => {
        if (op === 'is' && val === null) predicates.push((row) => getPath(row, col) != null);
        return builder;
      });
      builder.eq = jest.fn((col: string, val: unknown) => {
        predicates.push((row) => getPath(row, col) === val);
        return builder;
      });
      builder.neq = jest.fn((col: string, val: unknown) => {
        predicates.push((row) => getPath(row, col) !== val);
        return builder;
      });
      builder.order = jest.fn((col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return builder;
      });
      builder.limit = jest.fn((n: number) => {
        limitN = n;
        return builder;
      });
      builder.then = (resolve: any, reject: any) => {
        let resultado = rows.filter((row) => predicates.every((p) => p(row)));
        if (orderCol) {
          const col = orderCol;
          resultado = [...resultado].sort((a, b) => {
            const av = getPath(a, col);
            const bv = getPath(b, col);
            if (av < bv) return orderAsc ? -1 : 1;
            if (av > bv) return orderAsc ? 1 : -1;
            return 0;
          });
        }
        if (limitN != null) resultado = resultado.slice(0, limitN);
        return Promise.resolve({ data: resultado, error: null }).then(resolve, reject);
      };
      return builder;
    };

    const linhaJoint = (indice: number) => ({
      actual_load_kg: '40',
      completed_at: new Date(2026, 7, 5, 12, 0, indice).toISOString(),
      planned_sets: {
        planned_exercises: {
          name: 'Supino Reto',
          exercise_key: 'supino_reto_barra',
          planned_sessions: { training_plans: { purpose: 'joint' } },
        },
      },
    });
    const linhaSolo = {
      actual_load_kg: '60',
      completed_at: '2020-01-01T00:00:00Z',
      planned_sets: {
        planned_exercises: {
          name: 'Supino Reto',
          exercise_key: 'supino_reto_barra',
          planned_sessions: { training_plans: { purpose: 'solo' } },
        },
      },
    };
    const linhas = [...Array.from({ length: 300 }, (_, i) => linhaJoint(i)), linhaSolo];

    fromMock.mockReturnValueOnce(makeQueryEngineBuilder(linhas));

    expect(await getLastLoadByExercise(['k:supino_reto_barra'])).toEqual({
      'k:supino_reto_barra': 60,
    });
  });
});

describe('getLastRepsByExercise (Fase 17, D-02 — espelha getLastLoadByExercise em actual_reps)', () => {
  it('lista vazia não consulta o banco', async () => {
    expect(await getLastRepsByExercise([])).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('pega as reps MAIS RECENTES por exercício e coage numeric', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_reps: '10',
            completed_at: '2026-07-17T10:00:00Z',
            planned_sets: { planned_exercises: { name: 'Supino Reto' } },
          },
          {
            actual_reps: '8',
            completed_at: '2026-07-10T10:00:00Z',
            planned_sets: { planned_exercises: { name: 'Supino Reto' } },
          },
        ],
        error: null,
      }),
    );
    expect(await getLastRepsByExercise(['supino reto'])).toEqual({
      'supino reto': 10,
    });
  });

  it('casa pelo exercise_key mesmo quando o nome exibido difere', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_reps: '12',
            completed_at: '2026-07-17T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Flexão (variação)',
                exercise_key: 'flexao_bracos',
              },
            },
          },
        ],
        error: null,
      }),
    );
    expect(await getLastRepsByExercise(['k:flexao_bracos'])).toEqual({
      'k:flexao_bracos': 12,
    });
  });

  // D-02: bodyweight (sem actual_load_kg) precisa continuar contando reps —
  // por isso a query filtra em actual_reps, nunca em actual_load_kg.
  it('inclui exercício bodyweight sem carga, filtrando só por reps preenchidas', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_reps: '15',
            completed_at: '2026-07-17T10:00:00Z',
            planned_sets: {
              planned_exercises: { name: 'Flexão de Braço', exercise_key: null },
            },
          },
        ],
        error: null,
      }),
    );
    expect(await getLastRepsByExercise(['flexao de braco'])).toEqual({
      'flexao de braco': 15,
    });
  });

  it('ignora set_logs de plano purpose=joint na sugestão do treino solo', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_reps: '6',
            completed_at: '2026-08-04T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Supino Reto',
                exercise_key: 'supino_reto_barra',
                planned_sessions: { training_plans: { purpose: 'joint' } },
              },
            },
          },
          {
            actual_reps: '9',
            completed_at: '2026-07-20T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Supino Reto',
                exercise_key: 'supino_reto_barra',
                planned_sessions: { training_plans: { purpose: 'solo' } },
              },
            },
          },
        ],
        error: null,
      }),
    );
    expect(
      await getLastRepsByExercise(['k:supino_reto_barra']),
    ).toEqual({ 'k:supino_reto_barra': 9 });
  });
});

describe('getCompletedSessions', () => {
  it('mapeia sessões concluídas com título, semana e tempo efetivo', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            id: 'sl-1',
            planned_session_id: 'ps-1',
            started_at: '2026-07-17T09:00:00Z',
            finished_at: '2026-07-17T10:00:00Z',
            active_seconds: 3540,
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
      activeSeconds: 3540,
      origemJoint: false,
    });
  });

  // A4 (achado): sem trazer training_plans.purpose junto com planned_sessions,
  // uma sessão de treino EM DUPLA chegava ao cliente indistinguível de uma
  // sessão solo — o Histórico marcava as duas do mesmo jeito.
  it('marca origemJoint=true quando o plano da sessão é purpose=joint', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            id: 'sl-joint',
            planned_session_id: 'ps-joint',
            started_at: '2026-08-01T09:00:00Z',
            finished_at: '2026-08-01T10:00:00Z',
            active_seconds: 3000,
            planned_sessions: {
              title: 'Treino em Dupla',
              week_number: 1,
              muscle_groups: ['Peito'],
              training_plans: { purpose: 'joint' },
            },
          },
        ],
        error: null,
      }),
    );
    const res = await getCompletedSessions('user-1');
    expect(res[0].origemJoint).toBe(true);
  });

  // Achado A7 (review PR #73): o teste antigo "coluna purpose ausente ...
  // nunca quebra" mockava linha parcial com error:null — cenário que o banco
  // NÃO produz. Com a 0026 ausente, o SELECT que embute training_plans(purpose)
  // devolve erro 42703 (error populado, data null). O controle negativo real
  // vive no describe "0026 ausente no banco — 42703" (no fim deste arquivo).
  it('active_seconds nula devolve null (sessão fechada por app antigo)', async () => {
    // Cenário real: a coluna existe (0028 aplicada), mas a sessão foi fechada
    // por um app antigo — veio nula. A tela mostra "—"; NUNCA o relógio de
    // parede bruto.
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            id: 'sl-1',
            planned_session_id: 'ps-1',
            started_at: '2026-07-17T09:00:00Z',
            finished_at: '2026-07-17T10:00:00Z',
            active_seconds: null,
            planned_sessions: { title: 'Push A', week_number: 2, muscle_groups: [] },
          },
        ],
        error: null,
      }),
    );
    const res = await getCompletedSessions('user-1');
    expect(res[0].activeSeconds).toBeNull();
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
      active_seconds: 3600,
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

describe('getSetLogsResumo', () => {
  // A4 (achado): sem trazer training_plans.purpose junto com a série, uma
  // carga registrada num treino EM DUPLA virava recorde indistinguível de
  // um recorde solo — recordesPorExercicio (progressStats) não tinha como
  // marcar a origem.
  it('marca origemJoint=true quando o plano do exercício é purpose=joint', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_reps: 8,
            actual_load_kg: '50',
            completed_at: '2026-08-01T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Supino Reto',
                exercise_key: 'supino_reto_barra',
                planned_sessions: { training_plans: { purpose: 'joint' } },
              },
            },
          },
        ],
        error: null,
      }),
    );
    const res = await getSetLogsResumo('user-1');
    expect(res[0].origemJoint).toBe(true);
  });

  it('purpose=solo (ou ausente) devolve origemJoint=false', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          {
            actual_reps: 5,
            actual_load_kg: '80',
            completed_at: '2026-08-01T10:00:00Z',
            planned_sets: {
              planned_exercises: {
                name: 'Agachamento',
                exercise_key: 'agachamento_livre',
                planned_sessions: { training_plans: { purpose: 'solo' } },
              },
            },
          },
          {
            actual_reps: 10,
            actual_load_kg: '20',
            completed_at: '2026-08-02T10:00:00Z',
            planned_sets: {
              planned_exercises: { name: 'Rosca Direta', exercise_key: 'rosca_direta' },
            },
          },
        ],
        error: null,
      }),
    );
    const res = await getSetLogsResumo('user-1');
    expect(res[0].origemJoint).toBe(false);
    expect(res[1].origemJoint).toBe(false);
  });
});

describe('getSessionLogDetail', () => {
  it('agrupa por exercício, ordena séries e coage numeric', async () => {
    const cabecalho = makeBuilder({
      data: {
        id: 'sl-1',
        started_at: 'T0',
        finished_at: 'T1',
        active_seconds: 2880,
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
    expect(res?.activeSeconds).toBe(2880);
  });

  it('tempo efetivo ausente ou nulo no detalhe devolve null (janela de deploy)', async () => {
    const cabecalho = makeBuilder({
      data: {
        id: 'sl-2',
        started_at: 'T0',
        finished_at: 'T1',
        active_seconds: null,
        planned_sessions: { title: 'Push B', week_number: 2 },
      },
      error: null,
    });
    const linhas = makeBuilder({ data: [], error: null });
    fromMock.mockReturnValueOnce(cabecalho).mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-2');
    expect(res?.activeSeconds).toBeNull();
    expect(res?.title).toBe('Push B');
  });

  // N1 (achado família R1, review PR #73): produção está na 0022 —
  // active_seconds só existe a partir da 0028. O cabeçalho de
  // getSessionLogDetail selecionava active_seconds sem escada de
  // degradação: `if (cabecalho.error) throw cabecalho.error` propagava o
  // 42703 cru, e abrir o detalhe de QUALQUER sessão no Histórico
  // (SessionHistoryDetailScreen.tsx:42, caminho solo sem gate de flag)
  // quebrava. Mesma mecânica dos degraus do R1: tenta com active_seconds,
  // em 42703 repete sem a coluna e devolve activeSeconds: null.
  it('N1: 42703 por active_seconds no detalhe degrada sem a coluna (prod 0022)', async () => {
    const cabecalhoComErro = makeBuilder({
      data: null,
      error: { code: '42703', message: 'column session_logs.active_seconds does not exist' },
    });
    const cabecalhoSemColuna = makeBuilder({
      data: {
        id: 'sl-3',
        started_at: 'T0',
        finished_at: 'T1',
        planned_sessions: { title: 'Push C', week_number: 3 },
      },
      error: null,
    });
    const linhas = makeBuilder({ data: [], error: null });
    fromMock
      .mockReturnValueOnce(cabecalhoComErro)
      .mockReturnValueOnce(cabecalhoSemColuna)
      .mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-3');
    expect(res?.activeSeconds).toBeNull();
    expect(res?.title).toBe('Push C');
    expect(res?.weekNumber).toBe(3);
    expect(res?.sessionLogId).toBe('sl-3');
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  it('N1 (gêmeo): erro não-42703 no cabeçalho do detalhe propaga sem retry', async () => {
    const cabecalhoComErro = makeBuilder({
      data: null,
      error: { code: '42P01', message: 'relation "session_logs" does not exist' },
    });
    fromMock.mockReturnValueOnce(cabecalhoComErro);

    await expect(getSessionLogDetail('sl-4')).rejects.toMatchObject({ code: '42P01' });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  // Fase 3 (Pitfall 2 fechado): getSessionLogDetail nunca lia
  // actual_duration_seconds/actual_distance_m/perceived_effort — cardio no
  // histórico mostrava "null reps × peso corporal". Testes 4-6 fecham o gap
  // e cobrem D-08 (rótulo "trocado de X") sem editar os 4 testes acima.
  it('Pitfall 2 fechado: série de cardio traz duração/distância/esforço, actualReps null (não 0)', async () => {
    const cabecalho = makeBuilder({
      data: {
        id: 'sl-5',
        started_at: 'T0',
        finished_at: 'T1',
        active_seconds: 1200,
        planned_sessions: { title: 'Cardio A', week_number: 1 },
      },
      error: null,
    });
    const linhas = makeBuilder({
      data: [
        {
          actual_reps: null,
          actual_load_kg: null,
          actual_rir: null,
          actual_duration_seconds: 1200,
          actual_distance_m: 5000,
          perceived_effort: 'moderado',
          outcome: 'on_target',
          completed_at: 'z',
          planned_sets: {
            set_order: 1,
            exercise_id: 'pe-1',
            planned_exercises: { name: 'Corrida', exercise_order: 1, metric: 'tempo_distancia' },
          },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(cabecalho).mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-5');
    expect(res?.exercises[0].sets[0].actualDurationSeconds).toBe(1200);
    expect(res?.exercises[0].sets[0].actualDistanceM).toBe(5000);
    expect(res?.exercises[0].sets[0].perceivedEffort).toBe('moderado');
    expect(res?.exercises[0].sets[0].actualReps).toBeNull();
  });

  it('D-08 histórico: exercício trocado mostra a modalidade nova e swappedFrom com a original', async () => {
    const cabecalho = makeBuilder({
      data: {
        id: 'sl-6',
        started_at: 'T0',
        finished_at: 'T1',
        active_seconds: 1200,
        planned_sessions: { title: 'Cardio B', week_number: 1 },
        cardio_exercise_swaps: [{ planned_exercise_id: 'pe-9', to_modality: 'Remo Ergômetro' }],
      },
      error: null,
    });
    const linhas = makeBuilder({
      data: [
        {
          actual_reps: null,
          actual_load_kg: null,
          actual_rir: null,
          actual_duration_seconds: 1200,
          actual_distance_m: 5000,
          perceived_effort: null,
          outcome: 'on_target',
          completed_at: 'z',
          planned_sets: {
            set_order: 1,
            exercise_id: 'pe-9',
            planned_exercises: { name: 'Corrida', exercise_order: 1, metric: 'tempo_distancia' },
          },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(cabecalho).mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-6');
    expect(res?.exercises[0].name).toBe('Remo Ergômetro');
    expect(res?.exercises[0].swappedFrom).toBe('Corrida');
  });

  it('sem troca: swappedFrom é null/undefined e name continua o nome do plano (retrocompatível)', async () => {
    const cabecalho = makeBuilder({
      data: {
        id: 'sl-7',
        started_at: 'T0',
        finished_at: 'T1',
        active_seconds: 1200,
        planned_sessions: { title: 'Cardio C', week_number: 1 },
        // Campo ausente — como os mocks pré-existentes (testes 1-4 acima).
      },
      error: null,
    });
    const linhas = makeBuilder({
      data: [
        {
          actual_reps: null,
          actual_load_kg: null,
          actual_rir: null,
          actual_duration_seconds: 900,
          actual_distance_m: null,
          perceived_effort: null,
          outcome: 'on_target',
          completed_at: 'z',
          planned_sets: {
            set_order: 1,
            exercise_id: 'pe-2',
            planned_exercises: { name: 'Bicicleta Ergométrica', exercise_order: 1, metric: 'tempo' },
          },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(cabecalho).mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-7');
    expect(res?.exercises[0].name).toBe('Bicicleta Ergométrica');
    expect(res?.exercises[0].swappedFrom).toBeFalsy();
  });
});

describe('0026 ausente no banco — 42703 degrada sem quebrar (achado A1/A7)', () => {
  // Modo de falha: com a migration 0026 não aplicada em produção, a coluna
  // training_plans.purpose não existe e QUALQUER SELECT que a embuta devolve
  // erro PostgREST 42703 com data null — nunca linha parcial com error:null
  // (LEFT JOIN vazio é cenário que o banco não produz). Antes do fix, as três
  // funções davam throw: Home/Progresso/Perfil/Histórico caíam em estado de
  // erro e a sugestão de carga sumia em silêncio (activeSessionStore.
  // seedLastLoads engole). O fallback refaz a query SEM o embed/filtro de
  // purpose e segue — o filtro anti-joint volta a valer sozinho quando a 0026
  // chegar ao banco.
  it('getLastLoadByExercise refaz sem purpose e devolve a carga', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            {
              actual_load_kg: '60',
              completed_at: '2026-07-20T10:00:00Z',
              planned_sets: {
                planned_exercises: { name: 'Supino Reto', exercise_key: 'supino_reto_barra' },
              },
            },
          ],
          error: null,
        }),
      );
    expect(await getLastLoadByExercise(['k:supino_reto_barra'])).toEqual({
      'k:supino_reto_barra': 60,
    });
  });

  it('getLastRepsByExercise refaz sem purpose e devolve as reps', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            {
              actual_reps: '9',
              completed_at: '2026-07-20T10:00:00Z',
              planned_sets: {
                planned_exercises: { name: 'Supino Reto', exercise_key: 'supino_reto_barra' },
              },
            },
          ],
          error: null,
        }),
      );
    expect(await getLastRepsByExercise(['k:supino_reto_barra'])).toEqual({
      'k:supino_reto_barra': 9,
    });
  });

  it('getCompletedSessions refaz sem purpose e devolve origemJoint=false', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            {
              id: 'sl-1',
              planned_session_id: 'ps-1',
              started_at: '2026-08-01T09:00:00Z',
              finished_at: '2026-08-01T10:00:00Z',
              active_seconds: 3000,
              planned_sessions: { title: 'Treino', week_number: 1, muscle_groups: [] },
            },
          ],
          error: null,
        }),
      );
    const res = await getCompletedSessions('user-1');
    expect(res).toHaveLength(1);
    expect(res[0].origemJoint).toBe(false);
  });

  it('getSetLogsResumo refaz sem purpose e devolve origemJoint=false', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            {
              actual_reps: 8,
              actual_load_kg: '50',
              completed_at: '2026-08-01T10:00:00Z',
              planned_sets: {
                planned_exercises: { name: 'Supino Reto', exercise_key: 'supino_reto_barra' },
              },
            },
          ],
          error: null,
        }),
      );
    const res = await getSetLogsResumo('user-1');
    expect(res).toHaveLength(1);
    expect(res[0].origemJoint).toBe(false);
  });

  it('erro que NÃO é coluna ausente continua propagando (não engole)', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: null,
        error: { code: '42P01', message: 'relation "set_logs" does not exist' },
      }),
    );
    await expect(getLastLoadByExercise(['k:supino_reto_barra'])).rejects.toMatchObject({
      code: '42P01',
    });
  });

  // R1 (review PR #73): produção está na 0022 — BOTH 0026 (purpose) e 0028
  // (active_seconds) ausentes. O fallback antigo refazia sem purpose mas
  // MANTINHA active_seconds no SELECT, então o segundo 42703 relançava sem
  // catch: Histórico caía em erro em prod. A degradação agora é em degraus:
  // 1º com tudo, 2º sem purpose (janela 0026 ausente/0028 presente), 3º sem
  // purpose E sem active_seconds (active_seconds vira null no resultado).
  it('R1: 42703 nos DOIS degraus (0026 e 0028 ausentes) devolve dados com active_seconds null', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column session_logs.active_seconds does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            {
              id: 'sl-1',
              planned_session_id: 'ps-1',
              started_at: '2026-08-01T09:00:00Z',
              finished_at: '2026-08-01T10:00:00Z',
              planned_sessions: { title: 'Treino', week_number: 1, muscle_groups: [] },
            },
          ],
          error: null,
        }),
      );
    const res = await getCompletedSessions('user-1');
    expect(res).toHaveLength(1);
    expect(res[0].activeSeconds).toBeNull();
    expect(res[0].origemJoint).toBe(false);
    expect(fromMock).toHaveBeenCalledTimes(3);
  });

  // Janela real de deploy: 0028 já aplicada, 0026 ainda não. O degrau do meio
  // deve PRESERVAR active_seconds — regredir o tempo efetivo a null nesse
  // caso seria perder dado que o banco tem.
  it('R1: só a 0026 ausente — degrau do meio preserva active_seconds', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: [
            {
              id: 'sl-1',
              planned_session_id: 'ps-1',
              started_at: '2026-08-01T09:00:00Z',
              finished_at: '2026-08-01T10:00:00Z',
              active_seconds: 3000,
              planned_sessions: { title: 'Treino', week_number: 1, muscle_groups: [] },
            },
          ],
          error: null,
        }),
      );
    const res = await getCompletedSessions('user-1');
    expect(res).toHaveLength(1);
    expect(res[0].activeSeconds).toBe(3000);
  });

  it('R1: erro não-42703 no degrau intermediário continua propagando (não engole)', async () => {
    fromMock
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42703', message: 'column training_plans.purpose does not exist' },
        }),
      )
      .mockReturnValueOnce(
        makeBuilder({
          data: null,
          error: { code: '42P01', message: 'relation "session_logs" does not exist' },
        }),
      );
    await expect(getCompletedSessions('user-1')).rejects.toMatchObject({ code: '42P01' });
  });

  // N7 (achado, mesma família do R1): estado intermediário natural do
  // deploy — migrations aplicadas em ordem numérica, 0026 (purpose) já
  // presente, 0028 (active_seconds) ainda ausente. A escada antiga sempre
  // roteava o 2º degrau para (comPurpose=false, comActiveSeconds=true) —
  // que AINDA referencia active_seconds e erraria de novo pelo mesmo motivo
  // —, o 3º degrau então descartava purpose à toa, e a sessão joint perdia o
  // chip 'Dupla' no Histórico sem crashar. O fix lê a MESSAGE do 1º erro: se
  // citar active_seconds, o 2º degrau mantém purpose e derruba só
  // active_seconds. Como o mock devolve o payload configurado independente
  // do select pedido, a prova da ROTA é o próprio texto do select engatado
  // no 2º degrau — não o payload.
  it('N7: só a 0028 ausente — degrau roteia por purpose, não por active_seconds', async () => {
    const builder1 = makeBuilder({
      data: null,
      error: { code: '42703', message: 'column session_logs.active_seconds does not exist' },
    });
    const builder2 = makeBuilder({
      data: [
        {
          id: 'sl-1',
          planned_session_id: 'ps-1',
          started_at: '2026-08-01T09:00:00Z',
          finished_at: '2026-08-01T10:00:00Z',
          planned_sessions: {
            title: 'Treino',
            week_number: 1,
            muscle_groups: [],
            training_plans: { purpose: 'joint' },
          },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(builder1).mockReturnValueOnce(builder2);

    const res = await getCompletedSessions('user-1');

    const selectDoSegundoDegrau = builder2.select.mock.calls[0][0];
    expect(selectDoSegundoDegrau).toContain('training_plans(purpose)');
    expect(selectDoSegundoDegrau).not.toContain('active_seconds');

    expect(res).toHaveLength(1);
    expect(res[0].activeSeconds).toBeNull();
    expect(res[0].origemJoint).toBe(true);
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});
