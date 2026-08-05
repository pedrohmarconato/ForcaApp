// __tests__/fechamentoDeSemana.test.ts
// Fase 1 do COMMIT A — fechador de sessões pendentes de semanas vencidas.
//
// A Home e a tela de treino de hoje não podem apresentar como "próximo treino"
// uma sessão de uma semana que já passou inteira. Este fechador marca como
// skipped (skip_source: 'replan', sem skip_reason) o que está pendente há mais
// de uma semana, de forma idempotente e com trava de lote.
//
// Modos de falha cobertos:
// - fronteira: usa a SEGUNDA da semana corrente (nunca < hoje) — atraso dentro
//   da semana corrente NÃO fecha
// - data inválida → 0 sem consultar o banco
// - sem plano ativo → 0 sem consultar sessões (achado #1: nada de plano morto)
// - ESCOPO pelo plano ativo: leitura e escrita filtram por plan_id — sessões
//   de plano arquivado jamais são fechadas (escrita irreversível, achado #1)
// - sem vencidas → 0 sem tocar em nada (idempotente)
// - erro do banco propaga (nunca vira sucesso silencioso)
// - trava de lote: mais de 12 pendentes vencidas → fecha EM FATIAS, não desiste
// - contagem real: vem do .select() do update — concorrência não conta a
//   mesma linha duas vezes (achado #9)

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { fecharSessoesDeSemanasVencidas } from '../src/services/trainingRepository';

const fromMock = supabase.from as jest.Mock;

// Builder único com as duas fases: leitura (select/eq/lt) e escrita
// (update/eq/in/select). O supabase-js resolve leitura e escrita como thenable.
const builder = (resultado: { data: unknown; error: unknown }) => {
  const b: any = {
    select: jest.fn(() => b),
    eq: jest.fn(() => b),
    lt: jest.fn(() => b),
    in: jest.fn(() => b),
    order: jest.fn(() => b),
    limit: jest.fn(() => b),
    update: jest.fn(() => b),
    then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
  };
  return b;
};

const PLANO_ATIVO = { data: [{ id: 'plan-ativo' }], error: null };

beforeEach(() => {
  fromMock.mockReset();
});

describe('fecharSessoesDeSemanasVencidas', () => {
  it('marca como skipped as pendentes vencidas DO PLANO ATIVO e devolve o total fechado', async () => {
    const leitura = builder({ data: [{ id: 's-velha-1' }, { id: 's-velha-2' }], error: null });
    const escrita = builder({ data: [{ id: 's-velha-1' }, { id: 's-velha-2' }], error: null });
    fromMock
      .mockReturnValueOnce(builder(PLANO_ATIVO))
      .mockReturnValueOnce(leitura)
      .mockReturnValueOnce(escrita);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 2 });
    expect(fromMock).toHaveBeenCalledWith('training_plans');
    expect(fromMock).toHaveBeenCalledWith('planned_sessions');
    // ACHADO #1: leitura escopada pelo plano ativo.
    expect(leitura.select).toHaveBeenCalledWith('id');
    expect(leitura.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(leitura.eq).toHaveBeenCalledWith('plan_id', 'plan-ativo');
    expect(leitura.eq).toHaveBeenCalledWith('status', 'pending');
    expect(leitura.lt).toHaveBeenCalledWith('scheduled_date', '2026-08-03');
    expect(escrita.update).toHaveBeenCalledWith({
      status: 'skipped',
      skip_source: 'replan',
      skipped_at: expect.any(String),
    });
    // Escrita também escopada + contagem real via select (achado #9).
    expect(escrita.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(escrita.eq).toHaveBeenCalledWith('plan_id', 'plan-ativo');
    expect(escrita.in).toHaveBeenCalledWith('id', ['s-velha-1', 's-velha-2']);
    expect(escrita.select).toHaveBeenCalledWith('id');
  });

  it('fronteira: usa a SEGUNDA da semana, não o dia de hoje — atraso dentro da semana corrente não fecha', async () => {
    const leitura = builder({ data: [{ id: 's-velha' }], error: null });
    const escrita = builder({ data: [{ id: 's-velha' }], error: null });
    fromMock
      .mockReturnValueOnce(builder(PLANO_ATIVO))
      .mockReturnValueOnce(leitura)
      .mockReturnValueOnce(escrita);

    // Quarta-feira: sessões pendentes de segunda/terça da MESMA semana
    // continuam pendentes — só o que é anterior à segunda fecha.
    await fecharSessoesDeSemanasVencidas('user-1', '2026-08-05');

    expect(leitura.lt).toHaveBeenCalledWith('scheduled_date', '2026-08-03');
  });

  it('sem plano ativo devolve 0 SEM consultar sessões (achado #1: nada de plano morto)', async () => {
    fromMock.mockReturnValueOnce(builder({ data: [], error: null }));

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 0 });
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('training_plans');
  });

  it('sem pendentes vencidas devolve 0 e não toca em nada (idempotente)', async () => {
    const leitura = builder({ data: [], error: null });
    fromMock.mockReturnValueOnce(builder(PLANO_ATIVO)).mockReturnValueOnce(leitura);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 0 });
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(leitura.update).not.toHaveBeenCalled();
  });

  it('data inválida devolve 0 sem consultar o banco', async () => {
    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-13-40');

    expect(resultado).toEqual({ fechadas: 0 });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('erro do banco propaga — nunca vira sucesso silencioso', async () => {
    fromMock.mockReturnValueOnce(
      builder({ data: null, error: new Error('RLS negou') })
    );

    await expect(fecharSessoesDeSemanasVencidas('user-1', '2026-08-03')).rejects.toThrow(
      'RLS negou'
    );
  });

  it('erro na leitura das vencidas propaga (após plano ativo ok)', async () => {
    fromMock
      .mockReturnValueOnce(builder(PLANO_ATIVO))
      .mockReturnValueOnce(builder({ data: null, error: new Error('RLS negou sessões') }));

    await expect(fecharSessoesDeSemanasVencidas('user-1', '2026-08-03')).rejects.toThrow(
      'RLS negou sessões'
    );
  });

  it('trava de lote: mais de 12 pendentes vencidas fecha EM FATIAS, não desiste (achado #8)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ids = Array.from({ length: 13 }, (_, i) => `s-${i}`);
    const leitura = builder({ data: ids.map((id) => ({ id })), error: null });
    const fatia1 = builder({ data: ids.slice(0, 12).map((id) => ({ id })), error: null });
    const fatia2 = builder({ data: [{ id: 's-12' }], error: null });
    fromMock
      .mockReturnValueOnce(builder(PLANO_ATIVO))
      .mockReturnValueOnce(leitura)
      .mockReturnValueOnce(fatia1)
      .mockReturnValueOnce(fatia2);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 13 });
    expect(fatia1.in).toHaveBeenCalledWith('id', ids.slice(0, 12));
    expect(fatia2.in).toHaveBeenCalledWith('id', ['s-12']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('contagem vem do que o banco REALMENTE afetou — concorrência não conta a mesma linha duas vezes (achado #9)', async () => {
    const leitura = builder({ data: [{ id: 's-1' }, { id: 's-2' }], error: null });
    // Outro aparelho fechou s-2 no meio do caminho: o update afeta só 1 linha.
    const escrita = builder({ data: [{ id: 's-1' }], error: null });
    fromMock
      .mockReturnValueOnce(builder(PLANO_ATIVO))
      .mockReturnValueOnce(leitura)
      .mockReturnValueOnce(escrita);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 1 });
  });
});
