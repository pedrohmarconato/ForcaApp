// __tests__/agendaRepository.test.ts

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { getAgendaDoAluno } from '../src/services/agendaRepository';

const fromMock = supabase.from as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getAgendaDoAluno', () => {
  it('retorna agenda do plano quando training_days está preenchida', async () => {
    const query: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      query[metodo] = jest.fn(() => query);
    }
    query.single.mockResolvedValueOnce({
      error: null,
      data: {
        training_days: ['segunda', 'quarta', 'sexta'],
      },
    });
    fromMock.mockReturnValue(query);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [0, 2, 4],
      origem: 'plano',
    });
    expect(query.eq).toHaveBeenCalledWith('id', 'plan-1');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('retorna agenda do questionário quando training_days é NULL', async () => {
    const planoQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      planoQuery[metodo] = jest.fn(() => planoQuery);
    }
    // Simula "linha não encontrada" (PGRST116)
    planoQuery.single.mockResolvedValueOnce({
      error: { code: 'PGRST116', message: 'não encontrada' },
      data: null,
    });

    const questionarioQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      questionarioQuery[metodo] = jest.fn(() => questionarioQuery);
    }
    questionarioQuery.single.mockResolvedValueOnce({
      error: null,
      data: {
        dias_treino: ['mon', 'wed', 'fri'],
      },
    });

    fromMock.mockReturnValueOnce(planoQuery);
    fromMock.mockReturnValueOnce(questionarioQuery);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [0, 2, 4],
      origem: 'questionario',
    });
    expect(fromMock).toHaveBeenNthCalledWith(1, 'training_plans');
    expect(fromMock).toHaveBeenNthCalledWith(2, 'questionario_usuario');
  });

  it('retorna ausente quando nenhuma fonte está preenchida', async () => {
    const planoQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      planoQuery[metodo] = jest.fn(() => planoQuery);
    }
    planoQuery.single.mockResolvedValueOnce({
      error: { code: 'PGRST116', message: 'não encontrada' },
      data: null,
    });

    const questionarioQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      questionarioQuery[metodo] = jest.fn(() => questionarioQuery);
    }
    questionarioQuery.single.mockResolvedValueOnce({
      error: { code: 'PGRST116', message: 'não encontrada' },
      data: null,
    });

    fromMock.mockReturnValueOnce(planoQuery);
    fromMock.mockReturnValueOnce(questionarioQuery);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [],
      origem: 'ausente',
    });
  });

  it('propaga erro real do banco quando ocorre', async () => {
    const query: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      query[metodo] = jest.fn(() => query);
    }
    const realError = new Error('Erro de conexão');
    realError['code'] = '42P01'; // código de erro real, não "não encontrada"
    query.single.mockResolvedValueOnce({
      error: realError,
      data: null,
    });
    fromMock.mockReturnValue(query);

    await expect(
      getAgendaDoAluno({
        userId: 'user-1',
        planId: 'plan-1',
      }),
    ).rejects.toThrow();
  });

  it('trata training_days vazia como ausente e tenta questionário', async () => {
    const planoQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      planoQuery[metodo] = jest.fn(() => planoQuery);
    }
    planoQuery.single.mockResolvedValueOnce({
      error: null,
      data: {
        training_days: [], // vazia
      },
    });

    const questionarioQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      questionarioQuery[metodo] = jest.fn(() => questionarioQuery);
    }
    questionarioQuery.single.mockResolvedValueOnce({
      error: null,
      data: {
        dias_treino: ['mon', 'tue'],
      },
    });

    fromMock.mockReturnValueOnce(planoQuery);
    fromMock.mockReturnValueOnce(questionarioQuery);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [0, 1],
      origem: 'questionario',
    });
  });

  it('trata training_days com valores inválidos como ausente', async () => {
    const planoQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      planoQuery[metodo] = jest.fn(() => planoQuery);
    }
    planoQuery.single.mockResolvedValueOnce({
      error: null,
      data: {
        training_days: ['bagunça', 'lixo'], // valores desconhecidos
      },
    });

    const questionarioQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      questionarioQuery[metodo] = jest.fn(() => questionarioQuery);
    }
    questionarioQuery.single.mockResolvedValueOnce({
      error: null,
      data: {
        dias_treino: ['mon', 'fri'],
      },
    });

    fromMock.mockReturnValueOnce(planoQuery);
    fromMock.mockReturnValueOnce(questionarioQuery);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [0, 4],
      origem: 'questionario',
    });
  });

  it('trata erro 42703 (coluna ausente) como fonte indisponível e cai para questionário', async () => {
    const planoQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      planoQuery[metodo] = jest.fn(() => planoQuery);
    }
    // Simula erro 42703 (coluna training_days não existe, migration pendente)
    planoQuery.single.mockResolvedValueOnce({
      error: { code: '42703', message: 'column "training_days" does not exist' },
      data: null,
    });

    const questionarioQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      questionarioQuery[metodo] = jest.fn(() => questionarioQuery);
    }
    questionarioQuery.single.mockResolvedValueOnce({
      error: null,
      data: {
        dias_treino: ['mon', 'wed', 'fri'],
      },
    });

    fromMock.mockReturnValueOnce(planoQuery);
    fromMock.mockReturnValueOnce(questionarioQuery);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [0, 2, 4],
      origem: 'questionario',
    });
  });

  it('trata erro 42703 no plano E questionário ausente como ausente, sem lançar', async () => {
    const planoQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      planoQuery[metodo] = jest.fn(() => planoQuery);
    }
    // Erro 42703 no plano (coluna ausente)
    planoQuery.single.mockResolvedValueOnce({
      error: { code: '42703', message: 'column "training_days" does not exist' },
      data: null,
    });

    const questionarioQuery: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      questionarioQuery[metodo] = jest.fn(() => questionarioQuery);
    }
    // Questionário não encontrado (PGRST116)
    questionarioQuery.single.mockResolvedValueOnce({
      error: { code: 'PGRST116', message: 'não encontrada' },
      data: null,
    });

    fromMock.mockReturnValueOnce(planoQuery);
    fromMock.mockReturnValueOnce(questionarioQuery);

    const resultado = await getAgendaDoAluno({
      userId: 'user-1',
      planId: 'plan-1',
    });

    expect(resultado).toEqual({
      agenda: [],
      origem: 'ausente',
    });
  });

  it('propaga erro diferente de PGRST116 e 42703 quando ocorre', async () => {
    const query: Record<string, jest.Mock> = {};
    for (const metodo of ['select', 'eq', 'single']) {
      query[metodo] = jest.fn(() => query);
    }
    // Erro 42501 (permission denied, ou outro erro real que não é "fonte indisponível")
    const realError = new Error('permission denied');
    realError['code'] = '42501';
    query.single.mockResolvedValueOnce({
      error: realError,
      data: null,
    });
    fromMock.mockReturnValue(query);

    await expect(
      getAgendaDoAluno({
        userId: 'user-1',
        planId: 'plan-1',
      }),
    ).rejects.toThrow('permission denied');
  });
});
