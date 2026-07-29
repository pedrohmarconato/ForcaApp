// __tests__/planEditRepository.test.ts
// Escrita de EDIÇÃO do plano (reordenação) — Fase 1: exercícios.
//
// Modos de falha cobertos: erro do servidor nunca vira sucesso silencioso,
// lista inválida é rejeitada SEM tocar a rede, e o errcode do Postgres
// (40001 = estado divergente) chega identificável à UI.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { rpc: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { PlanEditError, reordenarExercicios } from '../src/services/planEditRepository';

const rpcMock = supabase.rpc as jest.Mock;

beforeEach(() => {
  rpcMock.mockReset();
});

describe('reordenarExercicios', () => {
  it('chama a RPC reorder_planned_exercises com a sessão e os IDs na nova ordem', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    await reordenarExercicios('sess-1', ['ex-2', 'ex-1', 'ex-3']);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('reorder_planned_exercises', {
      p_session_id: 'sess-1',
      p_exercise_ids: ['ex-2', 'ex-1', 'ex-3'],
    });
  });

  it('propaga erro do servidor com o errcode preservado (nunca sucesso silencioso)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'lista divergente do estado atual — recarregue', code: '40001' },
    });

    const promessa = reordenarExercicios('sess-1', ['ex-1', 'ex-2']);

    await expect(promessa).rejects.toBeInstanceOf(PlanEditError);
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'lista divergente do estado atual — recarregue', code: '40001' },
    });
    await expect(reordenarExercicios('sess-1', ['ex-1', 'ex-2'])).rejects.toMatchObject({
      code: '40001',
    });
  });

  it('propaga falha de transporte (rpc rejeitou) como PlanEditError sem código', async () => {
    rpcMock.mockRejectedValueOnce(new Error('network request failed'));

    await expect(reordenarExercicios('sess-1', ['ex-1', 'ex-2'])).rejects.toMatchObject({
      name: 'PlanEditError',
      code: null,
    });
  });

  it('rejeita lista com menos de 2 itens SEM chamar a rede', async () => {
    await expect(reordenarExercicios('sess-1', ['ex-1'])).rejects.toBeInstanceOf(PlanEditError);
    await expect(reordenarExercicios('sess-1', [])).rejects.toBeInstanceOf(PlanEditError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejeita lista com IDs duplicados ou vazios SEM chamar a rede', async () => {
    await expect(
      reordenarExercicios('sess-1', ['ex-1', 'ex-1', 'ex-2']),
    ).rejects.toBeInstanceOf(PlanEditError);
    await expect(reordenarExercicios('sess-1', ['ex-1', ''])).rejects.toBeInstanceOf(
      PlanEditError,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
