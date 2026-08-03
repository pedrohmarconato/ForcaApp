// src/services/agendaRepository.ts
// Leitura da agenda do aluno com fallback:
// 1. training_plans.training_days (novo campo, preenchido só em planos pós-entrega)
// 2. questionario_usuario.dias_treino (questão legada)
// 3. ausente (nenhuma fonte disponível)
//
// Erro do banco SEMPRE propaga — agenda vazia faria o motor virar no-op,
// então engolir um erro aqui apagaria a feature silenciosamente.

import { supabase } from '../config/supabaseClient';
import { offsetsDeRotulosPt, offsetsDeCodigosEn } from '../engine/agendaDias';
import type { OffsetDaSemana } from '../engine/scheduleShift';

/** Resultado da leitura da agenda com origem identificada. */
export type ResultadoAgenda = {
  agenda: OffsetDaSemana[];
  origem: 'plano' | 'questionario' | 'ausente';
};

/**
 * Lê a agenda do aluno a partir de duas fontes, em prioridade:
 * 1. training_plans.training_days (novo campo, preenchido após esta entrega)
 * 2. questionario_usuario.dias_treino (questão legada do onboarding)
 * 3. Ausente (nenhuma fonte preenchida)
 *
 * Erro do banco propaga (exceto "linha não encontrada", que é ausência legítima).
 */
export const getAgendaDoAluno = async (params: {
  userId: string;
  planId: string;
}): Promise<ResultadoAgenda> => {
  const { userId, planId } = params;

  // Tenta ler training_days do plano
  const { data: planoData, error: planoError } = await supabase
    .from('training_plans')
    .select('training_days')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  // Erro real do banco (não "linha não encontrada", nem "coluna ausente").
  // PGRST116: linha não existe (ainda). 42703: coluna não existe (migration pendente).
  // Ambos indicam "fonte indisponível, tente a próxima", não erro estrutural.
  if (planoError && planoError.code !== 'PGRST116' && planoError.code !== '42703') {
    throw planoError;
  }

  // Se o plano foi encontrado e training_days tem dados
  if (planoData && Array.isArray(planoData.training_days) && planoData.training_days.length > 0) {
    const agenda = offsetsDeRotulosPt(planoData.training_days);
    if (agenda.length > 0) {
      return { agenda, origem: 'plano' };
    }
  }

  // Fallback: tenta ler dias_treino do questionário
  const { data: questionarioData, error: questionarioError } = await supabase
    .from('questionario_usuario')
    .select('dias_treino')
    .eq('usuario_id', userId)
    .single();

  // Erro real do banco (não "linha não encontrada", nem "coluna ausente").
  // Mesmos códigos que no select de plano: PGRST116 e 42703 são "fonte indisponível".
  if (questionarioError && questionarioError.code !== 'PGRST116' && questionarioError.code !== '42703') {
    throw questionarioError;
  }

  // Se o questionário foi encontrado e dias_treino tem dados
  if (
    questionarioData &&
    Array.isArray(questionarioData.dias_treino) &&
    questionarioData.dias_treino.length > 0
  ) {
    const agenda = offsetsDeCodigosEn(questionarioData.dias_treino);
    if (agenda.length > 0) {
      return { agenda, origem: 'questionario' };
    }
  }

  // Nenhuma fonte disponível
  return { agenda: [], origem: 'ausente' };
};
