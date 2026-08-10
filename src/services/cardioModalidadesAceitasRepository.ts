// src/services/cardioModalidadesAceitasRepository.ts
// Fase 3 (REQ-06) — leitura das modalidades de cardio que o aluno ACEITA
// (questionario_usuario.cardio_modalidades, migrations 0021/0033).
//
// Capability NOVA: 03-RESEARCH.md confirma que hoje só existe caminho de
// ESCRITA para `cardio_modalidades` (o formulário de onboarding grava, mas
// nenhum consumidor cliente↔banco lê fora dele). Este repositório é o
// primeiro caminho de LEITURA.
//
// DECISÃO desta plan sobre o fallback vazio (03-RESEARCH.md Assumption A1,
// resolvida no plan-phase de 03-02): leitura ESTRITA de D-02 ("a lista de
// troca oferece SÓ as modalidades aceitas"). `cardio_modalidades` null,
// ausente (usuário sem linha em questionario_usuario) ou `[]` devolve SEMPRE
// array vazio — NUNCA as 9 modalidades do catálogo inteiro. O comentário da
// migration 0021 ("vazio = qualquer modalidade") descreve o comportamento do
// GERADOR de plano (prompt da IA), um contexto DIFERENTE do desta tela — a
// TROCA em sessão. Nenhum fallback "mostrar todas" é aceitável aqui, mesmo
// para lista vazia: sem dado inventado é a mesma régua do resto do app.
//
// Molde de estilo: src/services/cardioGoalRepository.ts (cliente único
// config/supabaseClient, erro do banco SEMPRE propaga, nada inventado
// quando a consulta volta vazia). RLS "questionario select own"
// (auth.uid() = usuario_id, supabase/migrations/0008_questionario_usuario.sql:29-31)
// já restringe a leitura ao próprio usuário — o parâmetro `userId` só serve
// para o filtro `.eq()`.

import { supabase } from '../config/supabaseClient';
import { isCardioModalidade, type CardioModalidade } from '../constants/cardioModalidades';

/**
 * Modalidades de cardio que o aluno ACEITA (declaradas no questionário).
 * Nunca inventa aceitação: ausência de declaração (null/ausente/vazio) devolve
 * `[]`, nunca o catálogo inteiro. Nome fora de `CARDIO_MODALIDADES` (dado
 * deformado/desatualizado) é filtrado, não propagado.
 */
export const getModalidadesAceitas = async (
  userId: string,
): Promise<readonly CardioModalidade[]> => {
  const { data, error } = await supabase
    .from('questionario_usuario')
    .select('cardio_modalidades')
    .eq('usuario_id', userId)
    .maybeSingle();
  if (error) throw error;

  const lista = data?.cardio_modalidades;
  if (!Array.isArray(lista)) return [];
  return lista.filter(isCardioModalidade);
};
