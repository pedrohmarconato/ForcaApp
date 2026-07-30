// src/services/cardioGoalRepository.ts
// Leitura/escrita das metas de cardio (migration 0022) e das séries de cardio
// que as alimentam.
//
// Mesma disciplina do resto: erro do banco SEMPRE propaga (a tela decide o que
// mostrar), o cliente nunca calcula o que o banco já derivou (o pace é coluna
// gerada) e nada é inventado quando a consulta volta vazia.

import { supabase } from '../config/supabaseClient';
import { toNum, exerciseIdentity } from '../engine/sessionModel';
import type { CardioLog } from '../engine/cardioGoals';

export type CardioGoalKind = 'desempenho' | 'consistencia';
export type CardioGoalStatus = 'active' | 'achieved' | 'archived';

export type CardioGoal = {
  id: string;
  kind: CardioGoalKind;
  modality: string | null;
  targetDistanceM: number | null;
  targetDurationSeconds: number | null;
  targetWeek: number | null;
  weeklyMinutes: number | null;
  weeklySessions: number | null;
  status: CardioGoalStatus;
  achievedAt: string | null;
  createdAt: string;
};

const PAGINA = 1000;

const linhaParaMeta = (linha: any): CardioGoal => ({
  id: linha.id,
  kind: linha.kind,
  modality: linha.modality ?? null,
  targetDistanceM: toNum(linha.target_distance_m),
  targetDurationSeconds: toNum(linha.target_duration_seconds),
  targetWeek: toNum(linha.target_week),
  weeklyMinutes: toNum(linha.weekly_minutes),
  weeklySessions: toNum(linha.weekly_sessions),
  status: linha.status,
  achievedAt: linha.achieved_at ?? null,
  createdAt: linha.created_at,
});

/** Metas ATIVAS do usuário (no máximo uma por tipo — índice único parcial). */
export const getMetasAtivas = async (userId: string): Promise<CardioGoal[]> => {
  const { data, error } = await supabase
    .from('cardio_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(linhaParaMeta);
};

/**
 * Séries de CARDIO de sessões concluídas, no formato que o motor de metas
 * consome.
 *
 * Cardio é identificado pelo `muscle_group = 'Cardio'` canônico gravado pelo
 * mapper. Métrica sozinha NÃO basta: `tempo` também mede prancha, aquecimento e
 * mobilidade, que não podem inflar minutos nem dias de cardio.
 */
export const getCardioLogs = async (userId: string): Promise<CardioLog[]> => {
  const linhas: any[] = [];

  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from('set_logs')
      .select(
        'actual_duration_seconds, actual_distance_m, completed_at, session_logs!inner(user_id, finished_at), planned_sets!inner(planned_exercises!inner(name, exercise_key, metric, muscle_group))',
      )
      .eq('session_logs.user_id', userId)
      .not('session_logs.finished_at', 'is', null)
      .in('planned_sets.planned_exercises.metric', ['tempo', 'tempo_distancia'])
      .eq('planned_sets.planned_exercises.muscle_group', 'Cardio')
      .not('actual_duration_seconds', 'is', null)
      .order('completed_at', { ascending: false })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;

    const pagina = (data ?? []) as any[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

  const logs: CardioLog[] = [];
  for (const linha of linhas) {
    const exercicio = linha?.planned_sets?.planned_exercises;
    const nome: string | undefined = exercicio?.name;
    // Defesa local além do filtro PostgREST: um mock, cache ou resposta
    // deformada não transforma prancha/mobilidade em cardio.
    if (!nome || exercicio?.muscle_group !== 'Cardio' || !linha?.completed_at) continue;
    logs.push({
      identity: exerciseIdentity({ exerciseKey: exercicio?.exercise_key ?? null, name: nome }),
      name: nome,
      // numeric do PostgREST chega como string: sem coagir, a soma de minutos
      // viraria concatenação de texto.
      durationSeconds: toNum(linha.actual_duration_seconds),
      distanceM: toNum(linha.actual_distance_m),
      completedAt: linha.completed_at,
    });
  }
  return logs;
};

/**
 * Define a meta ativa de um tipo. A RPC arquiva a anterior e insere a nova na
 * mesma transação — duas telas do mesmo usuário não conseguem deixar duas metas
 * ativas do mesmo tipo (índice único parcial + advisory lock).
 */
export const definirMeta = async (params: {
  kind: CardioGoalKind;
  modality?: string | null;
  targetDistanceM?: number | null;
  targetDurationSeconds?: number | null;
  targetWeek?: number | null;
  weeklyMinutes?: number | null;
  weeklySessions?: number | null;
}): Promise<CardioGoal> => {
  const { data, error } = await supabase.rpc('upsert_cardio_goal', {
    p_kind: params.kind,
    p_modality: params.modality ?? null,
    p_target_distance_m: params.targetDistanceM ?? null,
    p_target_duration_seconds: params.targetDurationSeconds ?? null,
    p_target_week: params.targetWeek ?? null,
    p_weekly_minutes: params.weeklyMinutes ?? null,
    p_weekly_sessions: params.weeklySessions ?? null,
  });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.id) throw new Error('upsert_cardio_goal não retornou a meta.');
  return linhaParaMeta(linha);
};

/** Arquiva a meta (desistência ou troca de objetivo). */
export const arquivarMeta = async (id: string): Promise<CardioGoal> => {
  const { data, error } = await supabase.rpc('archive_cardio_goal', { p_id: id });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.id) throw new Error('archive_cardio_goal não retornou a meta.');
  return linhaParaMeta(linha);
};

/**
 * Registra a meta como batida. Ação do ALUNO: o cartão mostra que o dado já
 * alcança o alvo, mas quem carimba é ele — o app não conclui metas sozinho.
 */
export const registrarMetaBatida = async (id: string): Promise<CardioGoal> => {
  const { data, error } = await supabase.rpc('achieve_cardio_goal', { p_id: id });
  if (error) throw error;
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.id) throw new Error('achieve_cardio_goal não retornou a meta.');
  return linhaParaMeta(linha);
};
