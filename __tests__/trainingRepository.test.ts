// __tests__/trainingRepository.test.ts
// Fase 3 — camada de leitura do plano persistido.
// Modos de falha cobertos (inclui achados #3 e #4 do review do PR #4):
// - TODA leitura de sessões é escopada pelo plano ATIVO (dois planos no banco
//   não podem misturar sessões na Home)
// - sem plano ativo → null/[] sem sequer consultar sessões
// - "treino de hoje" escolhe a PRIMEIRA sessão realmente pendente (por data e
//   ordem na semana); in_progress/completed/skipped NÃO entram na seleção
//   automática — a retomada de sessão abandonada é explícita (Plano/URL)
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
  getTrainingPlanMetadata,
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

describe('getTrainingPlanMetadata', () => {
  it('lê progression_rules sem inferir regra ausente', async () => {
    const metadata = {
      id: 'plan-ativo',
      name: 'Plano A',
      duration_weeks: 12,
      progression_rules: null,
    };
    const builder = builderComResultado({ data: metadata, error: null });
    fromMock.mockReturnValueOnce(builder);

    await expect(getTrainingPlanMetadata('plan-ativo')).resolves.toEqual(metadata);
    expect(builder.eq).toHaveBeenCalledWith('id', 'plan-ativo');
  });
});

describe('getTodaySession (escopada pelo plano ativo — achado #3)', () => {
  it('sem plano ativo devolve null SEM consultar sessões', async () => {
    fromMock.mockReturnValueOnce(builderComResultado({ data: [], error: null }));

    expect(await getTodaySession('user-1')).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('training_plans');
  });

  it('consulta apenas sessões PENDENTES, escopadas pelo plan_id do plano ativo', async () => {
    const builderRastreado = (resultado: { data: unknown; error: unknown }) => {
      const builder: any = {
        select: () => builder,
        eq: jest.fn(() => builder),
        order: jest.fn(() => builder),
        limit: () => builder,
        single: () => Promise.resolve(resultado),
        then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
      };
      return builder;
    };
    const pendente = { id: 's-2', status: 'pending', title: 'Pull A' };
    const builderSessoes = builderRastreado({ data: [pendente], error: null });
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
      .mockReturnValueOnce(builderSessoes);

    const resultado = await getTodaySession('user-1');

    expect(resultado).toEqual(pendente);
    expect(builderSessoes.eq).toHaveBeenCalledWith('plan_id', 'plan-ativo');
    // in_progress/completed/skipped ficam FORA da seleção automática da Home.
    expect(builderSessoes.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('sem sessão pendente, cai para null (não inventa treino)', async () => {
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
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

// Fix M2 do review do PR #54: a fila real é (scheduled_date, order_in_week).
// Sem o desempate, semanas com datas EMPATADAS (clamp da semana 1 no
// plan_mapper) fazem a Home divergir da aba Plano.
describe('fila real — desempate por order_in_week', () => {
  const builderRastreado = (resultado: { data: unknown; error: unknown }) => {
    const builder: any = {
      select: () => builder,
      eq: jest.fn(() => builder),
      order: jest.fn(() => builder),
      limit: () => builder,
      single: () => Promise.resolve(resultado),
      then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
    };
    return builder;
  };

  it('getTodaySession ordena a pendente por scheduled_date E order_in_week', async () => {
    const pendente = builderRastreado({ data: [{ id: 's1' }], error: null });
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
      .mockReturnValueOnce(pendente);

    await getTodaySession('user-1');

    expect(pendente.order).toHaveBeenCalledWith('scheduled_date', { ascending: true });
    expect(pendente.order).toHaveBeenCalledWith('order_in_week', { ascending: true });
  });

  it('getUpcomingSessions ordena por scheduled_date E order_in_week', async () => {
    const lista = builderRastreado({ data: [], error: null });
    fromMock
      .mockReturnValueOnce(builderComResultado(PLANO_ATIVO))
      .mockReturnValueOnce(lista);

    await getUpcomingSessions('user-1', 3);

    expect(lista.order).toHaveBeenCalledWith('scheduled_date', { ascending: true });
    expect(lista.order).toHaveBeenCalledWith('order_in_week', { ascending: true });
  });
});
