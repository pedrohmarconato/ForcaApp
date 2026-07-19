// __tests__/questionnaireService.test.ts
// Gravação do questionário via cliente supabase compartilhado: UPSERT na PK
// usuario_id (re-submissão ATUALIZA a linha — o modo antigo engolia o 409 e
// descartava silenciosamente as respostas novas no banco). As sentinelas
// (TOKEN_EXPIRED / QUESTIONNAIRE_ALREADY_EXISTS) são o contrato com a tela.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import {
  saveQuestionnaireDataAPI,
  type QuestionnairePayload,
} from '../src/services/api/questionnaireService';

const fromMock = supabase.from as jest.Mock;
const upsertMock = jest.fn();

const payload: QuestionnairePayload = {
  usuario_id: 'user-1',
  data_nascimento: '1990-05-10',
  genero: 'male',
  peso_kg: 82.5,
  altura_cm: 180,
  experiencia_treino: 'intermediate',
  objetivo: 'muscle_gain',
  tem_lesoes: true,
  lesoes_detalhes: 'joelho (leve)',
  dias_treino: ['mon', 'wed', 'fri'],
  inclui_cardio: true,
  inclui_alongamento: false,
  tempo_medio_treino_min: 60,
};

beforeEach(() => {
  jest.clearAllMocks();
  fromMock.mockReturnValue({ upsert: upsertMock });
  upsertMock.mockResolvedValue({ error: null });
});

it('grava como UPSERT na tabela certa, com o payload ÍNTEGRO e conflito na PK', async () => {
  const res = await saveQuestionnaireDataAPI(payload);
  expect(res).toEqual({ success: true });

  expect(fromMock).toHaveBeenCalledWith('questionario_usuario');
  expect(upsertMock).toHaveBeenCalledTimes(1);
  const [linha, opts] = upsertMock.mock.calls[0];
  // payload segue inteiro (13 campos da 0008), sem campo inventado nem perdido
  expect(linha).toEqual(payload);
  // resolução pela PK: re-submissão vira UPDATE, não 409
  expect(opts).toEqual({ onConflict: 'usuario_id' });
});

it('JWT expirado (PGRST301) vira TOKEN_EXPIRED (a tela desloga)', async () => {
  upsertMock.mockResolvedValue({ error: { code: 'PGRST301', message: 'JWT expired' } });
  await expect(saveQuestionnaireDataAPI(payload)).rejects.toThrow('TOKEN_EXPIRED');
});

it('23505 residual vira QUESTIONNAIRE_ALREADY_EXISTS (compatibilidade)', async () => {
  upsertMock.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });
  await expect(saveQuestionnaireDataAPI(payload)).rejects.toThrow(
    'QUESTIONNAIRE_ALREADY_EXISTS',
  );
});

it('42501 explica RLS; erro genérico propaga a mensagem; nunca sucesso otimista', async () => {
  upsertMock.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } });
  await expect(saveQuestionnaireDataAPI(payload)).rejects.toThrow(/RLS/);

  upsertMock.mockResolvedValue({ error: { code: '22P02', message: 'invalid input syntax' } });
  await expect(saveQuestionnaireDataAPI(payload)).rejects.toThrow(
    'Falha ao salvar o questionário. invalid input syntax',
  );
});

it('falha de rede (fetch lança) vira mensagem de conexão, não sucesso', async () => {
  upsertMock.mockRejectedValue(new TypeError('Network request failed'));
  await expect(saveQuestionnaireDataAPI(payload)).rejects.toThrow(
    'Erro de conexão ao tentar salvar o questionário.',
  );
});
