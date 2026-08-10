// __tests__/cardioModalidadesAceitas.test.ts
// Fase 3 (REQ-06, D-02) — leitura de "modalidades aceitas" pelo aluno.
// Capability NOVA: hoje não existe nenhum caminho de leitura cliente↔banco
// para `cardio_modalidades` fora do onboarding.
//
// Modos de falha cobertos, escritos antes da implementação:
//  1. usuário sem `cardio_modalidades` preenchido (null) recebendo o
//     catálogo inteiro em vez de lista vazia — violaria a leitura estrita de
//     D-02 (decisão desta plan, distinta do fallback do GERADOR de plano);
//  2. nome fora do catálogo persistido no banco (drift) vazando para a UI
//     sem filtro;
//  3. erro do Supabase sendo engolido como lista vazia — mascararia falha de
//     rede como "nenhuma modalidade aceita".

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { getModalidadesAceitas } from '../src/services/cardioModalidadesAceitasRepository';

const fromMock = supabase.from as jest.Mock;

const query = (resultado: { data: unknown; error: unknown }) => {
  const q: Record<string, jest.Mock> = {};
  q.select = jest.fn(() => q);
  q.eq = jest.fn(() => q);
  q.maybeSingle = jest.fn(async () => resultado);
  return q;
};

beforeEach(() => jest.clearAllMocks());

it('devolve as modalidades aceitas, na mesma ordem gravada', async () => {
  fromMock.mockReturnValue(
    query({
      data: { cardio_modalidades: ['Corrida', 'Remo Ergômetro', 'Pular Corda'] },
      error: null,
    }),
  );

  const modalidades = await getModalidadesAceitas('user-1');

  expect(modalidades).toEqual(['Corrida', 'Remo Ergômetro', 'Pular Corda']);
});

it('D-02 estrito: cardio_modalidades null devolve [], nunca o catálogo inteiro', async () => {
  fromMock.mockReturnValue(
    query({ data: { cardio_modalidades: null }, error: null }),
  );

  expect(await getModalidadesAceitas('user-1')).toEqual([]);
});

it('D-02 estrito: usuário sem linha em questionario_usuario devolve []', async () => {
  fromMock.mockReturnValue(query({ data: null, error: null }));

  expect(await getModalidadesAceitas('user-1')).toEqual([]);
});

it('cardio_modalidades vazia explícita devolve []', async () => {
  fromMock.mockReturnValue(
    query({ data: { cardio_modalidades: [] }, error: null }),
  );

  expect(await getModalidadesAceitas('user-1')).toEqual([]);
});

it('filtra nome fora do catálogo (drift) sem propagá-lo', async () => {
  fromMock.mockReturnValue(
    query({
      data: { cardio_modalidades: ['Corrida', 'Patins (descontinuado)'] },
      error: null,
    }),
  );

  expect(await getModalidadesAceitas('user-1')).toEqual(['Corrida']);
});

it('erro do Supabase relança — nunca vira lista vazia em silêncio', async () => {
  fromMock.mockReturnValue(
    query({ data: null, error: { message: 'falha de rede', code: 'PGRST000' } }),
  );

  await expect(getModalidadesAceitas('user-1')).rejects.toMatchObject({
    message: 'falha de rede',
  });
});
