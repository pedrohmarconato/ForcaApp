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
// - sem vencidas → 0 sem tocar em nada (idempotente)
// - erro do banco propaga (nunca vira sucesso silencioso)
// - trava de lote: mais de 12 pendentes vencidas → NÃO escreve, avisa e devolve 0

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { fecharSessoesDeSemanasVencidas } from '../src/services/trainingRepository';

const fromMock = supabase.from as jest.Mock;

// Builder único com as duas fases: leitura (select/eq/lt) e escrita
// (update/eq/in). O supabase-js resolve a leitura como thenable e a escrita
// como thenable também.
const builder = (resultado: { data: unknown; error: unknown }) => {
  const b: any = {
    select: jest.fn(() => b),
    eq: jest.fn(() => b),
    lt: jest.fn(() => b),
    in: jest.fn(() => b),
    update: jest.fn(() => b),
    then: (resolve: any, reject: any) => Promise.resolve(resultado).then(resolve, reject),
  };
  return b;
};

beforeEach(() => {
  fromMock.mockReset();
});

describe('fecharSessoesDeSemanasVencidas', () => {
  it('marca como skipped as pendentes de semanas vencidas e devolve o total fechado', async () => {
    const leitura = builder({ data: [{ id: 's-velha-1' }, { id: 's-velha-2' }], error: null });
    const escrita = builder({ data: [{ id: 's-velha-1' }, { id: 's-velha-2' }], error: null });
    fromMock.mockReturnValueOnce(leitura).mockReturnValueOnce(escrita);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 2 });
    expect(fromMock).toHaveBeenCalledWith('planned_sessions');
    expect(leitura.select).toHaveBeenCalledWith('id');
    expect(leitura.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(leitura.eq).toHaveBeenCalledWith('status', 'pending');
    expect(leitura.lt).toHaveBeenCalledWith('scheduled_date', '2026-08-03');
    expect(escrita.update).toHaveBeenCalledWith({
      status: 'skipped',
      skip_source: 'replan',
      skipped_at: expect.any(String),
    });
    expect(escrita.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(escrita.in).toHaveBeenCalledWith('id', ['s-velha-1', 's-velha-2']);
  });

  it('fronteira: usa a SEGUNDA da semana, não o dia de hoje — atraso dentro da semana corrente não fecha', async () => {
    const leitura = builder({ data: [{ id: 's-velha' }], error: null });
    const escrita = builder({ data: [{ id: 's-velha' }], error: null });
    fromMock.mockReturnValueOnce(leitura).mockReturnValueOnce(escrita);

    // Quarta-feira: sessões pendentes de segunda/terça da MESMA semana
    // continuam pendentes — só o que é anterior à segunda fecha.
    await fecharSessoesDeSemanasVencidas('user-1', '2026-08-05');

    expect(leitura.lt).toHaveBeenCalledWith('scheduled_date', '2026-08-03');
  });

  it('sem pendentes vencidas devolve 0 e não toca em nada (idempotente)', async () => {
    const leitura = builder({ data: [], error: null });
    fromMock.mockReturnValueOnce(leitura);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 0 });
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(leitura.update).not.toHaveBeenCalled();
  });

  it('data inválida devolve 0 sem consultar o banco', async () => {
    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-13-40');

    expect(resultado).toEqual({ fechadas: 0 });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('erro do banco propaga — nunca vira sucesso silencioso', async () => {
    fromMock.mockReturnValueOnce(builder({ data: null, error: new Error('RLS negou') }));

    await expect(fecharSessoesDeSemanasVencidas('user-1', '2026-08-03')).rejects.toThrow(
      'RLS negou'
    );
  });

  it('trava de lote: mais de 12 pendentes vencidas não escreve nada, avisa e devolve 0', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ids = Array.from({ length: 13 }, (_, i) => `s-${i}`);
    const leitura = builder({ data: ids.map((id) => ({ id })), error: null });
    fromMock.mockReturnValueOnce(leitura);

    const resultado = await fecharSessoesDeSemanasVencidas('user-1', '2026-08-03');

    expect(resultado).toEqual({ fechadas: 0 });
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(leitura.update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
