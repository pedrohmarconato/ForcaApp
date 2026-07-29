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
import {
  PlanEditError,
  reordenarExercicios,
  reordenarSessoesDaSemana,
} from '../src/services/planEditRepository';

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

describe('reordenarSessoesDaSemana', () => {
  it("escopo 'semana' chama a RPC com p_apply_future=false e tipa o retorno", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { applied_weeks: [2], skipped_weeks: [] },
      error: null,
    });

    const resultado = await reordenarSessoesDaSemana({
      planId: 'plan-1',
      weekNumber: 2,
      orderedSessionIds: ['s4', 's3', 's1'],
      escopo: 'semana',
    });

    expect(rpcMock).toHaveBeenCalledWith('reorder_week_sessions', {
      p_plan_id: 'plan-1',
      p_week_number: 2,
      p_session_ids: ['s4', 's3', 's1'],
      p_apply_future: false,
    });
    expect(resultado).toEqual({ appliedWeeks: [2], skippedWeeks: [] });
  });

  it("escopo 'futuras' envia p_apply_future=true e traduz as semanas puladas", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        applied_weeks: [2, 3, 4],
        skipped_weeks: [{ week: 5, reason: 'contagem_diferente' }],
      },
      error: null,
    });

    const resultado = await reordenarSessoesDaSemana({
      planId: 'plan-1',
      weekNumber: 2,
      orderedSessionIds: ['s4', 's3'],
      escopo: 'futuras',
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'reorder_week_sessions',
      expect.objectContaining({ p_apply_future: true }),
    );
    expect(resultado).toEqual({
      appliedWeeks: [2, 3, 4],
      skippedWeeks: [{ weekNumber: 5, reason: 'contagem_diferente' }],
    });
  });

  it('erro do servidor propaga com errcode; lista inválida falha sem rede', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'lista divergente do estado atual — recarregue', code: '40001' },
    });
    await expect(
      reordenarSessoesDaSemana({
        planId: 'plan-1',
        weekNumber: 2,
        orderedSessionIds: ['s1', 's2'],
        escopo: 'semana',
      }),
    ).rejects.toMatchObject({ name: 'PlanEditError', code: '40001' });

    rpcMock.mockClear();
    await expect(
      reordenarSessoesDaSemana({
        planId: 'plan-1',
        weekNumber: 2,
        orderedSessionIds: ['s1'],
        escopo: 'semana',
      }),
    ).rejects.toBeInstanceOf(PlanEditError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('retorno malformado do servidor vira resultado vazio tipado, não crash', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });

    const resultado = await reordenarSessoesDaSemana({
      planId: 'plan-1',
      weekNumber: 2,
      orderedSessionIds: ['s1', 's2'],
      escopo: 'semana',
    });

    expect(resultado).toEqual({ appliedWeeks: [], skippedWeeks: [] });
  });
});
