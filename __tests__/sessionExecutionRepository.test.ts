// __tests__/sessionExecutionRepository.test.ts
// Fase 4 — escrita/leitura da execução. Modos de falha cobertos:
// - saveSetLog: payload correto, adaptation NÃO enviada, e erro do banco PROPAGA
//   (nunca vira sucesso silencioso)
// - startSessionLog cria log e marca a sessão in_progress; erro propaga
// - getOpenSessionLog devolve as séries já feitas (base da retomada via servidor)
// - getLastLoadByExerciseName pega a carga mais recente por nome (sugestão)
// - finishSessionLog fecha log e sessão

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
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
} from '../src/services/sessionExecutionRepository';

const fromMock = supabase.from as jest.Mock;

// Builder fluente que resolve com `result`. `single()` e o await direto (thenable)
// devolvem o mesmo resultado. insert/update/eq/... são jest.fn para inspeção.
const makeBuilder = (result: { data?: unknown; error: unknown }) => {
  const builder: any = {};
  const chain = () => builder;
  builder.insert = jest.fn(chain);
  builder.update = jest.fn(chain);
  builder.select = jest.fn(chain);
  builder.eq = jest.fn(chain);
  builder.is = jest.fn(chain);
  builder.not = jest.fn(chain);
  builder.order = jest.fn(chain);
  builder.limit = jest.fn(chain);
  builder.single = jest.fn(() => Promise.resolve(result));
  builder.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return builder;
};

beforeEach(() => {
  fromMock.mockReset();
});

describe('startSessionLog', () => {
  it('cria session_log e marca a sessão como in_progress', async () => {
    const insertBuilder = makeBuilder({ data: { id: 'sl-1', started_at: '2026-07-17T10:00:00Z' }, error: null });
    const updateBuilder = makeBuilder({ error: null });
    fromMock.mockReturnValueOnce(insertBuilder).mockReturnValueOnce(updateBuilder);

    const res = await startSessionLog('user-1', 'ps-1');

    expect(res).toEqual({ sessionLogId: 'sl-1', startedAt: '2026-07-17T10:00:00Z' });
    expect(fromMock).toHaveBeenNthCalledWith(1, 'session_logs');
    expect(insertBuilder.insert).toHaveBeenCalledWith({ planned_session_id: 'ps-1', user_id: 'user-1' });
    expect(fromMock).toHaveBeenNthCalledWith(2, 'planned_sessions');
    expect(updateBuilder.update).toHaveBeenCalledWith({ status: 'in_progress' });
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'ps-1');
  });

  it('erro ao criar o log propaga (não engole)', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ data: null, error: new Error('insert negado') }));
    await expect(startSessionLog('user-1', 'ps-1')).rejects.toThrow('insert negado');
  });
});

describe('saveSetLog', () => {
  it('grava a série com o payload certo e SEM adaptation (Fase 5)', async () => {
    const b = makeBuilder({ data: { id: 'set-1' }, error: null });
    fromMock.mockReturnValueOnce(b);

    const res = await saveSetLog({
      sessionLogId: 'sl-1',
      plannedSetId: 'st-1',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: 2,
      outcome: 'on_target',
    });

    expect(res).toEqual({ setLogId: 'set-1' });
    expect(fromMock).toHaveBeenCalledWith('set_logs');
    const payload = b.insert.mock.calls[0][0];
    expect(payload).toEqual({
      session_log_id: 'sl-1',
      planned_set_id: 'st-1',
      actual_reps: 8,
      actual_load_kg: 40,
      actual_rir: 2,
      outcome: 'on_target',
    });
    expect('adaptation' in payload).toBe(false);
  });

  it('bodyweight grava carga nula', async () => {
    const b = makeBuilder({ data: { id: 'set-2' }, error: null });
    fromMock.mockReturnValueOnce(b);

    await saveSetLog({
      sessionLogId: 'sl-1',
      plannedSetId: 'st-3',
      actualReps: 15,
      actualLoadKg: null,
      actualRir: null,
      outcome: 'over',
    });

    expect(b.insert.mock.calls[0][0].actual_load_kg).toBeNull();
  });

  it('erro do banco PROPAGA — série não pode ser dada como salva', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ data: null, error: new Error('RLS negou insert') }));
    await expect(
      saveSetLog({
        sessionLogId: 'sl-1',
        plannedSetId: 'st-1',
        actualReps: 8,
        actualLoadKg: 40,
        actualRir: null,
        outcome: 'on_target',
      }),
    ).rejects.toThrow('RLS negou insert');
  });
});

describe('getOpenSessionLog', () => {
  it('sem execução em aberto devolve null', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ data: [], error: null }));
    expect(await getOpenSessionLog('user-1', 'ps-1')).toBeNull();
  });

  it('devolve o log em aberto com as séries já gravadas (base da retomada)', async () => {
    const logBuilder = makeBuilder({ data: [{ id: 'sl-9', started_at: '2026-07-17T09:00:00Z' }], error: null });
    const setsBuilder = makeBuilder({
      data: [
        { id: 'set-1', planned_set_id: 'st-1', actual_reps: 8, actual_load_kg: 40, actual_rir: 2, outcome: 'on_target' },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(logBuilder).mockReturnValueOnce(setsBuilder);

    const res = await getOpenSessionLog('user-1', 'ps-1');

    expect(res?.sessionLogId).toBe('sl-9');
    expect(res?.setLogs).toHaveLength(1);
    expect(res?.setLogs[0].planned_set_id).toBe('st-1');
    expect(logBuilder.is).toHaveBeenCalledWith('finished_at', null);
  });

  it('erro propaga', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ data: null, error: new Error('falha log') }));
    await expect(getOpenSessionLog('user-1', 'ps-1')).rejects.toThrow('falha log');
  });
});

describe('finishSessionLog', () => {
  it('fecha o log e marca a sessão como completed', async () => {
    const logBuilder = makeBuilder({ error: null });
    const sessBuilder = makeBuilder({ error: null });
    fromMock.mockReturnValueOnce(logBuilder).mockReturnValueOnce(sessBuilder);

    await finishSessionLog('sl-1', 'ps-1', '2026-07-17T11:00:00Z');

    expect(logBuilder.update).toHaveBeenCalledWith({ finished_at: '2026-07-17T11:00:00Z' });
    expect(logBuilder.eq).toHaveBeenCalledWith('id', 'sl-1');
    expect(sessBuilder.update).toHaveBeenCalledWith({ status: 'completed' });
    expect(sessBuilder.eq).toHaveBeenCalledWith('id', 'ps-1');
  });

  it('erro ao fechar propaga', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ error: new Error('falha finish') }));
    await expect(finishSessionLog('sl-1', 'ps-1', 'x')).rejects.toThrow('falha finish');
  });
});

describe('getLastLoadByExerciseName', () => {
  it('nomes vazios não consultam o banco', async () => {
    expect(await getLastLoadByExerciseName([])).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('pega a carga MAIS RECENTE por exercício (ordenado desc) e filtra pelos nomes pedidos', async () => {
    fromMock.mockReturnValueOnce(
      makeBuilder({
        data: [
          { actual_load_kg: 42.5, completed_at: '2026-07-17T10:00:00Z', planned_sets: { planned_exercises: { name: 'Supino Reto' } } },
          { actual_load_kg: 40, completed_at: '2026-07-10T10:00:00Z', planned_sets: { planned_exercises: { name: 'Supino Reto' } } },
          { actual_load_kg: 100, completed_at: '2026-07-16T10:00:00Z', planned_sets: { planned_exercises: { name: 'Agachamento' } } },
        ],
        error: null,
      }),
    );

    const mapa = await getLastLoadByExerciseName(['Supino Reto']);
    // Só "supino reto" foi pedido; pega a carga mais recente (42.5), ignora Agachamento.
    expect(mapa).toEqual({ 'supino reto': 42.5 });
  });

  it('erro propaga', async () => {
    fromMock.mockReturnValueOnce(makeBuilder({ data: null, error: new Error('falha histórico') }));
    await expect(getLastLoadByExerciseName(['X'])).rejects.toThrow('falha histórico');
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
            planned_sessions: { title: 'Push A', week_number: 2, muscle_groups: ['Peito'] },
          },
        ],
        error: null,
      }),
    );

    const res = await getCompletedSessions('user-1');
    expect(res).toHaveLength(1);
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
});

describe('getSessionLogDetail', () => {
  it('agrupa por exercício e ordena séries', async () => {
    const cabecalho = makeBuilder({
      data: { id: 'sl-1', started_at: '2026-07-17T09:00:00Z', finished_at: '2026-07-17T10:00:00Z', planned_sessions: { title: 'Push A', week_number: 2 } },
      error: null,
    });
    const linhas = makeBuilder({
      data: [
        { actual_reps: 10, actual_load_kg: 40, actual_rir: 2, outcome: 'on_target', completed_at: 'z', planned_sets: { set_order: 2, planned_exercises: { name: 'Supino', exercise_order: 1 } } },
        { actual_reps: 8, actual_load_kg: 40, actual_rir: 2, outcome: 'on_target', completed_at: 'z', planned_sets: { set_order: 1, planned_exercises: { name: 'Supino', exercise_order: 1 } } },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(cabecalho).mockReturnValueOnce(linhas);

    const res = await getSessionLogDetail('sl-1');
    expect(res?.title).toBe('Push A');
    expect(res?.exercises).toHaveLength(1);
    expect(res?.exercises[0].name).toBe('Supino');
    expect(res?.exercises[0].sets.map((s) => s.setOrder)).toEqual([1, 2]);
  });
});
