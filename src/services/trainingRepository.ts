// src/services/trainingRepository.ts
// Fase 3 — Acesso de leitura ao plano persistido (tabelas novas).
// Todas as consultas passam pelo cliente único (config/supabaseClient) e
// respeitam o RLS: o usuário só enxerga as próprias linhas.

import { supabase } from '../config/supabaseClient';

export type PlannedSet = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps_min: number;
  target_reps_max: number;
  target_load_kg: number | null;
  target_rir: number | null;
};

export type PlannedExercise = {
  id: string;
  session_id: string;
  exercise_order: number;
  name: string;
  muscle_group: string | null;
  priority: 'primary' | 'secondary' | 'accessory';
  equipment: string | null;
  load_increment_kg: number;
  rest_seconds: number | null;
  target_rm_percent: number | null;
  sets_planned: number;
  reps_raw: string | null;
  method: string | null;
  notes: string | null;
  // Flags de lesão do exercício (coluna injury_flags text[] da 0001). O select usa '*',
  // então já vem do banco; guardrail da Fase 5 usa "há alguma flag" p/ nunca subir carga.
  injury_flags?: string[] | null;
  planned_sets: PlannedSet[];
};

export type PlannedSession = {
  id: string;
  plan_id: string;
  user_id: string;
  week_number: number;
  day_of_week: string | null;
  order_in_week: number;
  title: string;
  session_type: string | null;
  scheduled_date: string | null;
  estimated_minutes: number | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  muscle_groups: string[];
};

export type SessionDetail = PlannedSession & { planned_exercises: PlannedExercise[] };

/**
 * Plano ATIVO do usuário. Todas as leituras de sessões são escopadas por ele:
 * sem isso, sessões de planos antigos/duplicados se misturariam na Home
 * (achado #3 do review). Retorna null se não houver plano ativo.
 */
export const getActivePlanId = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
};

/**
 * Sessão "de hoje": prioriza uma sessão em andamento; sem isso, a próxima
 * pendente por data — sempre DENTRO do plano ativo.
 * Retorna null quando não há plano/sessões.
 */
export const getTodaySession = async (userId: string): Promise<PlannedSession | null> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return null;

  const emAndamento = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'in_progress')
    .limit(1);
  if (emAndamento.error) throw emAndamento.error;
  if (emAndamento.data && emAndamento.data.length > 0) return emAndamento.data[0];

  const pendente = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .limit(1);
  if (pendente.error) throw pendente.error;
  return pendente.data?.[0] ?? null;
};

/** Próximas sessões pendentes do plano ativo, em ordem de data (lista da Home). */
export const getUpcomingSessions = async (
  userId: string,
  limit: number = 5,
): Promise<PlannedSession[]> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return [];

  const { data, error } = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
    .order('scheduled_date', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
};

/**
 * Sessão completa (exercícios + séries-alvo), ordenada no cliente:
 * a ordenação aninhada do PostgREST é frágil, ordenar aqui é determinístico.
 */
export const getSessionDetail = async (sessionId: string): Promise<SessionDetail | null> => {
  const { data, error } = await supabase
    .from('planned_sessions')
    .select('*, planned_exercises(*, planned_sets(*))')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  if (!data) return null;

  const exercicios = [...(data.planned_exercises ?? [])]
    .sort((a: PlannedExercise, b: PlannedExercise) => a.exercise_order - b.exercise_order)
    .map((exercicio: PlannedExercise) => ({
      ...exercicio,
      planned_sets: [...(exercicio.planned_sets ?? [])].sort(
        (a: PlannedSet, b: PlannedSet) => a.set_order - b.set_order,
      ),
    }));

  return { ...data, planned_exercises: exercicios };
};

/**
 * Resumo de alvo exibível: "4 séries × 8-12 reps".
 * Prescrição NÃO numérica (ex.: "AMRAP") é exibida como veio da IA — a faixa
 * padrão gravada nas séries é alvo interno do motor, nunca vai para a tela
 * (achado #4 do review: nada de dado inventado para o aluno).
 */
export const formatExerciseTarget = (exercicio: PlannedExercise): string => {
  const prescricaoOriginal = exercicio.reps_raw?.trim();
  if (prescricaoOriginal && !/\d/.test(prescricaoOriginal)) {
    return `${exercicio.sets_planned} séries × ${prescricaoOriginal}`;
  }
  const primeiraSerie = exercicio.planned_sets?.[0];
  const faixa = primeiraSerie
    ? primeiraSerie.target_reps_min === primeiraSerie.target_reps_max
      ? `${primeiraSerie.target_reps_min}`
      : `${primeiraSerie.target_reps_min}-${primeiraSerie.target_reps_max}`
    : prescricaoOriginal ?? '—';
  return `${exercicio.sets_planned} séries × ${faixa} reps`;
};
