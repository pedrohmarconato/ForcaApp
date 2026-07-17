// __tests__/trainingRepository.test.ts
// Fase 3 — camada de leitura do plano persistido.
// Modos de falha cobertos:
// - "treino de hoje" prioriza sessão em andamento e cai para a próxima pendente
// - erro do banco propaga (nunca vira sucesso silencioso)
// - exercícios e séries chegam ORDENADOS mesmo se o banco devolver fora de ordem

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import {
  getTodaySession,
  getSessionDetail,
  formatExerciseTarget,
} from '../src/services/trainingRepository';

const fromMock = supabase.from as jest.Mock;

// Builder que resolve com o resultado dado (lista via thenable, detalhe via single)
const builderComResultado = (resultado: { data: unknown; error: unknown }) => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve(resultado),
    then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
  };
  return builder;
};

beforeEach(() => {
  fromMock.mockReset();
});

describe('getTodaySession', () => {
  it('devolve a sessão em andamento quando existe (uma única consulta)', async () => {
    const emAndamento = { id: 's-1', status: 'in_progress', title: 'Push A' };
    fromMock.mockReturnValueOnce(builderComResultado({ data: [emAndamento], error: null }));

    const resultado = await getTodaySession('user-1');

    expect(resultado).toEqual(emAndamento);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('planned_sessions');
  });

  it('sem sessão em andamento, cai para a próxima pendente por data', async () => {
    const pendente = { id: 's-2', status: 'pending', title: 'Pull A' };
    fromMock
      .mockReturnValueOnce(builderComResultado({ data: [], error: null }))
      .mockReturnValueOnce(builderComResultado({ data: [pendente], error: null }));

    const resultado = await getTodaySession('user-1');

    expect(resultado).toEqual(pendente);
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it('sem nenhuma sessão, devolve null (não inventa dado)', async () => {
    fromMock
      .mockReturnValueOnce(builderComResultado({ data: [], error: null }))
      .mockReturnValueOnce(builderComResultado({ data: [], error: null }));

    expect(await getTodaySession('user-1')).toBeNull();
  });

  it('erro do banco propaga', async () => {
    fromMock.mockReturnValueOnce(
      builderComResultado({ data: null, error: new Error('RLS negou') })
    );

    await expect(getTodaySession('user-1')).rejects.toThrow('RLS negou');
  });
});

describe('getSessionDetail', () => {
  it('ordena exercícios e séries no cliente, mesmo fora de ordem no banco', async () => {
    const detalheDesordenado = {
      id: 's-1',
      title: 'Push A',
      planned_exercises: [
        {
          id: 'e-2',
          exercise_order: 2,
          name: 'Crucifixo',
          sets_planned: 3,
          planned_sets: [
            { id: 'x', set_order: 2, target_reps_min: 10, target_reps_max: 12 },
            { id: 'y', set_order: 1, target_reps_min: 10, target_reps_max: 12 },
          ],
        },
        {
          id: 'e-1',
          exercise_order: 1,
          name: 'Supino',
          sets_planned: 4,
          planned_sets: [{ id: 'z', set_order: 1, target_reps_min: 8, target_reps_max: 12 }],
        },
      ],
    };
    fromMock.mockReturnValueOnce(builderComResultado({ data: detalheDesordenado, error: null }));

    const resultado = await getSessionDetail('s-1');

    expect(resultado?.planned_exercises.map((e) => e.name)).toEqual(['Supino', 'Crucifixo']);
    expect(resultado?.planned_exercises[1].planned_sets.map((s) => s.set_order)).toEqual([1, 2]);
  });
});

describe('formatExerciseTarget', () => {
  it('mostra faixa quando min ≠ max e valor único quando iguais', () => {
    const comFaixa: any = {
      sets_planned: 4,
      reps_raw: '8-12',
      planned_sets: [{ set_order: 1, target_reps_min: 8, target_reps_max: 12 }],
    };
    const fixo: any = {
      sets_planned: 3,
      reps_raw: '10',
      planned_sets: [{ set_order: 1, target_reps_min: 10, target_reps_max: 10 }],
    };
    expect(formatExerciseTarget(comFaixa)).toBe('4 séries × 8-12 reps');
    expect(formatExerciseTarget(fixo)).toBe('3 séries × 10 reps');
  });
});
