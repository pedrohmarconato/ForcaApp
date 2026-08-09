// __tests__/cardioPrescritoRepository.test.ts
// REQ-02 (D-02/CONTEXT.md) — T-02-01 (Information Disclosure, high, mitigate):
// a query filtra `user_id`/`plan_id` explicitamente no client, ALÉM da RLS já
// ativa. Modos de falha cobertos:
// - sem plano ativo → não consulta planned_sessions, devolve prescrição vazia
// - a query filtra por muscle_group='Cardio' (defesa contra vazar outro grupo)
// - a query filtra por user_id/plan_id (defesa em profundidade contra RLS falha)
// - duas sessões com prescrição em datas distintas somam corretamente e a
//   contagem de sessões é por SESSÃO (scheduled_date), não por série
// - erro do banco propaga (nunca vira sucesso silencioso)

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { getPrescricaoSemanaCorrente } from '../src/services/cardioPrescritoRepository';

const fromMock = supabase.from as jest.Mock;

// Builder encadeável: cada método do supabase é jest.fn() que devolve o
// próprio builder; o builder é thenable e resolve com `resultado` quando
// awaited — mesmo padrão de __tests__/trainingRepository.test.ts.
const builder = (resultado: { data: unknown; error: unknown }) => {
  const b: any = {
    select: jest.fn(() => b),
    eq: jest.fn(() => b),
    gte: jest.fn(() => b),
    lt: jest.fn(() => b),
    order: jest.fn(() => b),
    limit: jest.fn(() => b),
    then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
  };
  return b;
};

const REFERENCIA = new Date('2026-08-12T12:00:00'); // quarta da semana de 10/08 (seg) a 16/08

beforeEach(() => jest.clearAllMocks());

it('sem plano ativo: não consulta planned_sessions e devolve prescrição vazia', async () => {
  const semPlano = builder({ data: [], error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === 'training_plans') return semPlano;
    throw new Error(`não deveria consultar ${table} sem plano ativo`);
  });

  const p = await getPrescricaoSemanaCorrente('user-1', REFERENCIA);

  expect(p).toEqual({ distanciaM: null, duracaoSegundos: null, sessoes: 0 });
  expect(fromMock).not.toHaveBeenCalledWith('planned_sessions');
});

it('filtra a query por muscle_group=Cardio e por user_id/plan_id (T-02-01)', async () => {
  const planoAtivo = builder({ data: [{ id: 'plan-1' }], error: null });
  const sessoes = builder({ data: [], error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === 'training_plans') return planoAtivo;
    if (table === 'planned_sessions') return sessoes;
    throw new Error(`tabela inesperada: ${table}`);
  });

  await getPrescricaoSemanaCorrente('user-1', REFERENCIA);

  expect(sessoes.eq).toHaveBeenCalledWith('user_id', 'user-1');
  expect(sessoes.eq).toHaveBeenCalledWith('plan_id', 'plan-1');
  expect(sessoes.eq).toHaveBeenCalledWith('planned_exercises.muscle_group', 'Cardio');
});

it('duas sessões com prescrição em datas distintas somam e contam 2 sessões (não séries)', async () => {
  const planoAtivo = builder({ data: [{ id: 'plan-1' }], error: null });
  const sessoes = builder({
    data: [
      {
        id: 'sess-1',
        scheduled_date: '2026-08-10',
        planned_exercises: [
          {
            muscle_group: 'Cardio',
            planned_sets: [{ target_distance_m: '5000', target_duration_seconds: '1800' }],
          },
        ],
      },
      {
        id: 'sess-2',
        scheduled_date: '2026-08-12',
        planned_exercises: [
          {
            muscle_group: 'Cardio',
            planned_sets: [
              { target_distance_m: '2000', target_duration_seconds: '600' },
              { target_distance_m: '1000', target_duration_seconds: '600' },
            ],
          },
        ],
      },
    ],
    error: null,
  });
  fromMock.mockImplementation((table: string) => {
    if (table === 'training_plans') return planoAtivo;
    if (table === 'planned_sessions') return sessoes;
    throw new Error(`tabela inesperada: ${table}`);
  });

  const p = await getPrescricaoSemanaCorrente('user-1', REFERENCIA);

  // 5000 + 2000 + 1000 = 8000; 1800 + 600 + 600 = 3000; 2 sessões (não 3 sets).
  expect(p).toEqual({ distanciaM: 8000, duracaoSegundos: 3000, sessoes: 2 });
});

it('propaga erro do banco (nunca engole silenciosamente)', async () => {
  const planoAtivo = builder({ data: [{ id: 'plan-1' }], error: null });
  const erro = new Error('falha de rede');
  const sessoesComErro = builder({ data: null, error: erro });
  fromMock.mockImplementation((table: string) => {
    if (table === 'training_plans') return planoAtivo;
    if (table === 'planned_sessions') return sessoesComErro;
    throw new Error(`tabela inesperada: ${table}`);
  });

  await expect(getPrescricaoSemanaCorrente('user-1', REFERENCIA)).rejects.toThrow('falha de rede');
});
