// __tests__/trainingRepository.test.ts
// Fase 3 — camada de leitura do plano persistido.
// Modos de falha cobertos (inclui achados #3 e #4 do review do PR #4):
// - TODA leitura de sessões é escopada pelo plano ATIVO (dois planos no banco
//   não podem misturar sessões na Home)
// - sem plano ativo → null/[] sem sequer consultar sessões
// - "treino de hoje" prioriza sessão em andamento e cai para a próxima pendente
// - erro do banco propaga (nunca vira sucesso silencioso)
// - exercícios e séries chegam ORDENADOS mesmo se o banco devolver fora de ordem
// - prescrição não numérica (AMRAP) é exibida como veio, sem faixa inventada

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import {
  getActivePlanId,
  getTodaySession,
  getUpcomingSessions,
  getSessionDetail,
  formatExerciseTarget,
} from '../src/services/trainingRepository';

const fromMock = supabase.from as jest.Mock;

// Builder que resolve com o resultado dado (lista via thenable, detalhe via single)
const builderComResultado = (resultado: { data: unknown; error: unknown }) => {
  const builder: any = {
    select: () => builder,
    eq: jest.fn(() => builder),
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve(resultado),
    then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
  };
  return builder;
};

const PLANO_ATIVO = { data: [{ id: 'plan-ativo' }], error: null };

beforeEach(() => {
  fromMock.mockReset();
});

describe('getActivePlanId', () => {
  it('devolve o id do plano ativo', async () => {
    fromMock.mockReturnValueOnce(builderComResultado(PLANO_ATIVO));
    expect(await getActivePlanId('user-1')).toBe('plan-ativo');
    expect(fromMock).toHaveBeenCalledWith('training_plans');
  });

  it('sem plano ativo devolve null', async () => {
    fromMock.mockReturnValueOnce(builderComResultado({ data: [], error: null }));
    expect(await getActivePlanId('user-1')).toBeNull();
  });
});

describe('getTodaySession (escopada pelo plano ativo — achado #3)', () => {
  it('sem plano ativo devolve null SEM consultar sessões', async () => {
    fromMock.mockReturnValueOnce(builderComResultado({ data: [], error: null }));

    expect(await getTodaySession('user-1')).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('training_plans');
  });

  it('filtra as sessões pelo plan_id do plano ativo', async () => {
    const emAndamento = { id: 's-1', status: 'in_progress', title: 'Push A' };
    const builderSessoes = builderComResultado({ data: [emAndamento], error: null });
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
      .mockReturnValueOnce(builderSessoes);

    const resultado = await getTodaySession('user-1');

    expect(resultado).toEqual(emAndamento);
    expect(builderSessoes.eq).toHaveBeenCalledWith('plan_id', 'plan-ativo');
  });

  it('sem sessão em andamento, cai para a próxima pendente por data', async () => {
    const pendente = { id: 's-2', status: 'pending', title: 'Pull A' };
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
      .mockReturnValueOnce(builderComResultado({ data: [], error: null }))
      .mockReturnValueOnce(builderComResultado({ data: [pendente], error: null }));

    expect(await getTodaySession('user-1')).toEqual(pendente);
  });

  it('erro do banco propaga', async () => {
    fromMock.mockReturnValueOnce(
      builderComResultado({ data: null, error: new Error('RLS negou') })
    );
    await expect(getTodaySession('user-1')).rejects.toThrow('RLS negou');
  });
});

describe('getUpcomingSessions', () => {
  it('sem plano ativo devolve lista vazia sem consultar sessões', async () => {
    fromMock.mockReturnValueOnce(builderComResultado({ data: [], error: null }));

    expect(await getUpcomingSessions('user-1')).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('filtra pelo plano ativo', async () => {
    const sessoes = [{ id: 's-1' }, { id: 's-2' }];
    const builderSessoes = builderComResultado({ data: sessoes, error: null });
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
      .mockReturnValueOnce(builderSessoes);

    expect(await getUpcomingSessions('user-1')).toEqual(sessoes);
    expect(builderSessoes.eq).toHaveBeenCalledWith('plan_id', 'plan-ativo');
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

  it('AMRAP aparece como veio da IA — a faixa interna NÃO vaza para a tela (achado #4)', () => {
    const amrap: any = {
      sets_planned: 2,
      reps_raw: 'AMRAP',
      planned_sets: [{ set_order: 1, target_reps_min: 8, target_reps_max: 12 }],
    };
    expect(formatExerciseTarget(amrap)).toBe('2 séries × AMRAP');
  });
});
