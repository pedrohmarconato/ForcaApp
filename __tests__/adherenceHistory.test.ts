// __tests__/adherenceHistory.test.ts
// Testes do Nível 4 da escada de reencaixe — "falta crônica vira
// replanejamento da agenda" (mínimo: detectar e avisar com número real).
//
// Motor puro (adherenceHistory.ts):
//  - aderenciaPorSemana: agrupa por semana, mantém as últimas N semanas
//    FECHADAS (ateSemana exclusivo — a semana em curso nunca conta contra o
//    aluno, mesmo princípio de semanasConstantes em progressStats.ts);
//  - vereditoDeFrequencia: insuficiente_historico → abandono →
//    agenda_desalinhada → falta_cronica → ok. NUNCA média: falta_cronica
//    exige TODAS as semanas com taxa < taxaMaxima;
//  - frequenciaReal: MEDIANA das concluídas (4,5,5→5; 2,4,5→4).
//
// Repositório (adherenceHistoryRepository.ts): seleciona planned_sessions com
// .in('week_number', [...]), janela = semanas fechadas; erro do banco propaga.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { getHistoricoDeSemanas } from '../src/services/adherenceHistoryRepository';
import {
  aderenciaPorSemana,
  vereditoDeFrequencia,
  frequenciaReal,
  diasPlanejados,
  type SessaoHistorica,
  type SemanaHistorica,
} from '../src/engine/adherenceHistory';

const fromMock = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

// Gera as linhas brutas de uma semana: concluidas primeiras com 'completed'.
const linhas = (
  semana: number,
  total: number,
  concluidas: number,
  dias?: (string | null)[],
): SessaoHistorica[] => {
  const sessoes: SessaoHistorica[] = [];
  for (let i = 0; i < total; i++) {
    const concluida = i < concluidas;
    sessoes.push({
      week_number: semana,
      status: concluida ? 'completed' : 'pending',
      scheduled_date: concluida ? (dias ? dias[i] ?? null : null) : null,
    });
  }
  return sessoes;
};

// História de 3 semanas fechadas: semana N tem concluidas/total.
const historia = (linhasPorSemana: SessaoHistorica[][]) => ({
  sessoes: linhasPorSemana.flat(),
  quantidade: 3,
  ateSemana: 4,
});

describe('aderenciaPorSemana (agrupamento)', () => {
  it('agrupa por semana e conta apenas status completed', () => {
    const { sessoes } = historia([linhas(1, 5, 3), linhas(2, 5, 2), linhas(3, 5, 3)]);
    const resultado = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(resultado).toEqual([
      { semana: 1, total: 5, concluidas: 3, diasConcluidos: [null, null, null] },
      { semana: 2, total: 5, concluidas: 2, diasConcluidos: [null, null] },
      { semana: 3, total: 5, concluidas: 3, diasConcluidos: [null, null, null] },
    ]);
  });

  it('mantém só as últimas N semanas fechadas, em ordem crescente', () => {
    const { sessoes } = historia([
      linhas(1, 5, 5),
      linhas(2, 5, 4),
      linhas(3, 5, 5),
      linhas(4, 5, 5),
    ]);
    const resultado = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(resultado.map((s) => s.semana)).toEqual([1, 2, 3]);
  });

  it('sessões sem week_number são ignoradas', () => {
    const sessoes = [
      linhas(1, 5, 3)[0],
      { week_number: null, status: 'completed', scheduled_date: null },
    ];
    const resultado = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(resultado[0].semana).toBe(1);
    expect(resultado[0].total).toBe(1);
  });
});

describe('vereditoDeFrequencia', () => {
  it('3/5, 2/5, 3/5 → falta_cronica com frequência real 3', () => {
    const { sessoes } = historia([linhas(1, 5, 3), linhas(2, 5, 2), linhas(3, 5, 3)]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('falta_cronica');
    expect(frequenciaReal(semanas)).toBe(3);
  });

  it('5/5, 2/5, 5/5 → ok (NUNCA média: nem todas têm taxa < 0.7)', () => {
    const { sessoes } = historia([linhas(1, 5, 5), linhas(2, 5, 2), linhas(3, 5, 5)]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('ok');
  });

  it('menos de 3 semanas fechadas → insuficiente_historico', () => {
    const { sessoes } = historia([linhas(1, 5, 0), linhas(2, 5, 0)]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('insuficiente_historico');
  });

  it('3 semanas com 0 concluídas → abandono (nunca "reduza para 0")', () => {
    const { sessoes } = historia([linhas(1, 5, 0), linhas(2, 5, 0), linhas(3, 5, 0)]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('abandono');
  });

  it('4/4 nas 3 semanas, todas fora de training_days → agenda_desalinhada (não falta_cronica)', () => {
    // Concluídas em terça(1), quinta(3) e sábado(5) — nenhuma cai em seg/qua/sex.
    const { sessoes } = historia([
      linhas(1, 4, 4, ['2026-07-14', '2026-07-16', '2026-07-18', '2026-07-14']),
      linhas(2, 4, 4, ['2026-07-21', '2026-07-23', '2026-07-25', '2026-07-21']),
      linhas(3, 4, 4, ['2026-07-28', '2026-07-30', '2026-08-01', '2026-07-28']),
    ]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('agenda_desalinhada');
  });

  it('4/4 nas 3 semanas dentro de training_days → ok', () => {
    // Concluídas em segunda(0), quarta(2) e sexta(4) — todas no dia planejado.
    const { sessoes } = historia([
      linhas(1, 4, 4, ['2026-07-13', '2026-07-15', '2026-07-17', null]),
      linhas(2, 4, 4, ['2026-07-20', '2026-07-22', '2026-07-24', null]),
      linhas(3, 4, 4, ['2026-07-27', '2026-07-29', '2026-07-31', null]),
    ]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('ok');
  });

  it('semana em curso com 0 concluídas não muda o veredito das fechadas', () => {
    // Semanas 1-3 fechadas com 2/5 (falta_cronica); semana 4 (em curso) com 0.
    const sessoes = [
      ...linhas(1, 5, 2),
      ...linhas(2, 5, 2),
      ...linhas(3, 5, 2),
      ...linhas(4, 5, 0),
    ];
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(semanas.map((s) => s.semana)).toEqual([1, 2, 3]);
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('falta_cronica');
  });

  it('concluídas sem scheduled_date não permitem concluir desalinhamento', () => {
    // Taxa 1.0 em todas, mas sem dado de dia: sem base, sem desalinhamento.
    const { sessoes } = historia([linhas(1, 4, 4), linhas(2, 4, 4), linhas(3, 4, 4)]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [0, 2, 4])).toBe('ok');
  });

  it('agenda vazia não vira agenda_desalinhada (sem base de comparação)', () => {
    const { sessoes } = historia([
      linhas(1, 4, 4, ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16']),
      linhas(2, 4, 4, ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23']),
      linhas(3, 4, 4, ['2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30']),
    ]);
    const semanas = aderenciaPorSemana({ sessoes, quantidade: 3, ateSemana: 4 });
    expect(vereditoDeFrequencia(semanas, [])).toBe('ok');
  });
});

describe('frequenciaReal (mediana) e diasPlanejados', () => {
  const semanas = (concluidas: number[], totais: number[]): SemanaHistorica[] =>
    concluidas.map((c, i) => ({
      semana: i + 1,
      total: totais[i],
      concluidas: c,
      diasConcluidos: [],
    }));

  it('mediana de 4, 5, 5 → 5', () => {
    expect(frequenciaReal(semanas([4, 5, 5], [5, 5, 5]))).toBe(5);
  });

  it('mediana de 2, 4, 5 → 4', () => {
    expect(frequenciaReal(semanas([2, 4, 5], [5, 5, 5]))).toBe(4);
  });

  it('diasPlanejados usa o maior total da janela', () => {
    expect(diasPlanejados(semanas([2, 4, 3], [5, 4, 4]))).toBe(5);
  });
});

describe('getHistoricoDeSemanas (repositório)', () => {
  const montarQuery = (resposta: { data: unknown; error: unknown }) => {
    const query: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'in']) {
      query[metodo] = jest.fn(() => query);
    }
    query.order = jest.fn().mockResolvedValueOnce(resposta);
    return query;
  };

  it('seleciona planned_sessions das 3 semanas fechadas antes de ateSemana', async () => {
    const query = montarQuery({ data: [], error: null });
    fromMock.mockReturnValue(query);

    const resultado = await getHistoricoDeSemanas({
      userId: 'user-1',
      planId: 'plan-1',
      ateSemana: 4,
    });

    expect(resultado).toEqual([]);
    expect(fromMock).toHaveBeenCalledWith('planned_sessions');
    expect(query.select).toHaveBeenCalledWith('*');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('plan_id', 'plan-1');
    expect(query.in).toHaveBeenCalledWith('week_number', [1, 2, 3]);
  });

  it('semana em curso fica fora da janela mesmo com quantidade maior que o histórico', async () => {
    const query = montarQuery({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await getHistoricoDeSemanas({ userId: 'u', planId: 'p', ateSemana: 2 });

    expect(query.in).toHaveBeenCalledWith('week_number', [1]);
  });

  it('erro do banco PROPAGA (nunca devolve histórico vazio)', async () => {
    const erroBanco = { message: 'connection refused' };
    const query = montarQuery({ data: null, error: erroBanco });
    fromMock.mockReturnValue(query);

    await expect(
      getHistoricoDeSemanas({ userId: 'u', planId: 'p', ateSemana: 4 }),
    ).rejects.toEqual(erroBanco);
  });
});
