// src/services/adherenceHistoryRepository.ts
// Leitura do histórico de semanas fechadas para o Nível 4 da escada de
// reencaixe (adherenceHistory.ts). Um único select em planned_sessions, com
// janela .in('week_number', [...]) ANTES de `ateSemana` (exclusivo): a semana
// em curso e as futuras nunca entram no diagnóstico.
//
// Erro do banco SEMPRE propaga — devolver histórico vazio faria o motor
// diagnosticar "insuficiente_historico" e esconderia a feature em silêncio
// (mesmo contrato de agendaRepository.ts).

import { supabase } from '../config/supabaseClient';
import type { PlannedSession } from './trainingRepository';

/** Linhas das semanas fechadas do plano, em ordem crescente de semana. */
export const getHistoricoDeSemanas = async (params: {
  userId: string;
  planId: string;
  /** Número da semana em curso — limite superior EXCLUSIVO da janela. */
  ateSemana: number;
  /** Quantas semanas fechadas entram na janela. */
  quantidade?: number;
}): Promise<PlannedSession[]> => {
  const { userId, planId, ateSemana, quantidade = 3 } = params;
  const primeiraSemana = Math.max(1, ateSemana - quantidade);

  const semanas: number[] = [];
  for (let s = primeiraSemana; s < ateSemana; s += 1) semanas.push(s);

  const { data, error } = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .in('week_number', semanas)
    .order('week_number', { ascending: true });

  if (error) throw error;

  return (data ?? []) as PlannedSession[];
};
