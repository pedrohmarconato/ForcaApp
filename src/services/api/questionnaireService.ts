// src/services/api/questionnaireService.ts
// Gravação do questionário de onboarding (tabela questionario_usuario, 0008).
// Extraído de QuestionnaireScreen e migrado do fetch cru para o cliente
// supabase compartilhado (mesmo padrão dos repositórios): URL/anon key/JWT da
// sessão já resolvidos, e `.upsert()` envia Prefer: resolution=merge-duplicates
// — re-fazer o questionário ATUALIZA a linha (ON CONFLICT na PK usuario_id);
// antes, o 409 era engolido e as respostas novas eram descartadas no banco.

import { supabase } from '../../config/supabaseClient';

export type QuestionnairePayload = {
  usuario_id: string;
  data_nascimento: string;
  genero: string | null;
  peso_kg: number | null;
  altura_cm: number | null;
  experiencia_treino: string | null;
  objetivo: string | null;
  tem_lesoes: boolean;
  lesoes_detalhes: string | null;
  dias_treino: string[];
  inclui_cardio: boolean;
  inclui_alongamento: boolean;
  tempo_medio_treino_min: number | null;
};

/**
 * Grava (upsert) o questionário do usuário autenticado. Erros são mapeados em
 * mensagens-sentinela que o handleSubmit da tela já trata:
 *  - 'TOKEN_EXPIRED' → sessão expirada (a tela desloga);
 *  - 'QUESTIONNAIRE_ALREADY_EXISTS' → defesa residual do caminho 23505 (com o
 *    upsert não deve mais ocorrer; mantido para compatibilidade).
 * Erro NUNCA vira sucesso silencioso.
 */
export const saveQuestionnaireDataAPI = async (
  formDataWithUserId: QuestionnairePayload,
): Promise<{ success: true }> => {
  let error: { code?: string | null; message?: string | null } | null;
  try {
    const res = await supabase
      .from('questionario_usuario')
      .upsert(formDataWithUserId, { onConflict: 'usuario_id' });
    error = res.error;
  } catch (networkError) {
    console.error('[API] Erro de rede/inesperado ao salvar questionário:', networkError);
    throw new Error('Erro de conexão ao tentar salvar o questionário.');
  }

  if (error) {
    const message = error.message || 'Erro desconhecido do servidor.';
    console.error(`[API] Erro ao salvar questionário: ${error.code ?? '?'} - ${message}`);
    if (error.code === 'PGRST301' || message.includes('JWT expired')) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (error.code === '23505') {
      throw new Error('QUESTIONNAIRE_ALREADY_EXISTS');
    }
    if (error.code === '42501') {
      throw new Error('Sem permissão para salvar os dados. Verifique as políticas RLS. (42501)');
    }
    throw new Error(`Falha ao salvar o questionário. ${message}`);
  }
  return { success: true };
};
