// src/services/trainingRepository.ts
// Fase 3 — Acesso de leitura ao plano persistido (tabelas novas).
// Todas as consultas passam pelo cliente único (config/supabaseClient) e
// respeitam o RLS: o usuário só enxerga as próprias linhas.

import { supabase } from '../config/supabaseClient';
import { segundaDaSemanaDe } from '../engine/agendaDias';

export type PlannedSet = {
  id: string;
  exercise_id: string;
  set_order: number;
  // Nulos em cardio/isometria (migration 0014): lá o alvo é duração/distância.
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_load_kg: number | null;
  target_rir: number | null;
  target_duration_seconds?: number | null;
  target_distance_m?: number | null;
};

export type PlannedExercise = {
  id: string;
  session_id: string;
  exercise_order: number;
  name: string;
  // Chave canônica do catálogo (migration 0013). Null em planos anteriores a ela
  // e em nomes que a IA inventou fora do catálogo.
  exercise_key?: string | null;
  name_original?: string | null;
  // Como o exercício é medido (migration 0014). Ausente = plano anterior a ela.
  metric?: 'carga_reps' | 'tempo' | 'tempo_distancia' | null;
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
  // Recusa declarada (0020). Opcionais porque um banco sem a migration
  // simplesmente não devolve as colunas — a tela cai no caso "sem motivo
  // registrado" em vez de quebrar.
  skip_reason?: string | null;
  skip_note?: string | null;
  skipped_at?: string | null;
  skip_source?: 'user' | 'replan' | null;
};

export type SessionDetail = PlannedSession & { planned_exercises: PlannedExercise[] };

export type TrainingPlanMetadata = {
  id: string;
  name: string;
  duration_weeks: number;
  // Null nos planos afetados pela regressão corrigida na migration 0015.
  progression_rules: unknown[] | null;
};

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
 * Sessão "de hoje": a primeira REALMENTE PENDENTE do plano ativo, por data e
 * ordem na semana. Sessões em andamento (in_progress), concluídas ou recusadas
 * NÃO são selecionadas automaticamente — a retomada de uma sessão abandonada é
 * explícita (via Plano ou URL tipada), nunca um redirecionamento global.
 * Retorna null quando não há plano/sessões pendentes.
 */
export const getTodaySession = async (userId: string): Promise<PlannedSession | null> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return null;

  const pendente = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
    // Fila real = (data, order_in_week): sem o desempate, datas empatadas
    // (clamp da semana 1) fariam a Home divergir da aba Plano.
    .order('scheduled_date', { ascending: true })
    .order('order_in_week', { ascending: true })
    .limit(1);
  if (pendente.error) throw pendente.error;
  return pendente.data?.[0] ?? null;
};

/**
 * TODAS as sessões do plano ativo (qualquer status), ordenadas por semana e
 * ordem na semana — visão de ciclo da aba Plano (Direção 03). Planos são
 * pequenos (semanas × treinos), uma página basta.
 */
export const getPlanSessions = async (userId: string): Promise<PlannedSession[]> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return [];

  const { data, error } = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .order('week_number', { ascending: true })
    .order('order_in_week', { ascending: true });
  if (error) throw error;
  return data ?? [];
};

/**
 * Há sessão do plano ativo em andamento (status 'in_progress')?
 *
 * Guard client-side da regeneração iniciada no Perfil: arquivar o plano ativo
 * com um treino aberto orfanizaria a sessão em curso (o plano novo não tem
 * aquela planned_session). False também quando não há plano ativo — o fluxo de
 * regeneração não depende de plano prévio.
 */
export const hasSessionInProgress = async (userId: string): Promise<boolean> => {
  const planId = await getActivePlanId(userId);
  if (!planId) return false;

  const { data, error } = await supabase
    .from('planned_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'in_progress')
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
};
/** Metadados necessários para reconstruir progressão e duração no editor. */
export const getTrainingPlanMetadata = async (
  planId: string,
): Promise<TrainingPlanMetadata | null> => {
  const { data, error } = await supabase
    .from('training_plans')
    .select('id, name, duration_weeks, progression_rules')
    .eq('id', planId)
    .single();
  if (error) throw error;
  return data ?? null;
};
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
    .order('order_in_week', { ascending: true })
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
  const primeiraSerie = exercicio.planned_sets?.[0];

  // Cardio e isometria (0014) não se medem em repetição. Sem este ramo a tela
  // imprimia "1 séries × null reps" assim que as reps viraram nulas.
  if (exercicio.metric === 'tempo' || exercicio.metric === 'tempo_distancia') {
    const segundos = primeiraSerie?.target_duration_seconds ?? null;
    const metros = primeiraSerie?.target_distance_m ?? null;
    const partes: string[] = [];
    if (segundos != null) {
      partes.push(
        segundos >= 60
          ? `${Math.round(segundos / 60)} min`
          : `${Math.round(segundos)}s`,
      );
    }
    if (metros != null) {
      partes.push(`${(metros / 1000).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')} km`);
    }
    const alvo = partes.length > 0 ? partes.join(' · ') : (exercicio.reps_raw?.trim() ?? '—');
    return exercicio.sets_planned > 1
      ? `${exercicio.sets_planned} séries × ${alvo}`
      : alvo;
  }

  const prescricaoOriginal = exercicio.reps_raw?.trim();
  if (prescricaoOriginal && !/\d/.test(prescricaoOriginal)) {
    return `${exercicio.sets_planned} séries × ${prescricaoOriginal}`;
  }
  const faixa =
    primeiraSerie && primeiraSerie.target_reps_min != null
      ? primeiraSerie.target_reps_min === primeiraSerie.target_reps_max
        ? `${primeiraSerie.target_reps_min}`
        : `${primeiraSerie.target_reps_min}-${primeiraSerie.target_reps_max}`
      : prescricaoOriginal ?? '—';
  return `${exercicio.sets_planned} séries × ${faixa} reps`;
};

/**
 * Fechador de semanas vencidas (Fase 1 da escada de reencaixe).
 *
 * Sessão pendente de uma semana que já passou inteira não pode continuar na
 * fila de "próximo treino" — a Home a ofereceria para sempre como se fosse
 * hoje. Marca como skipped (skip_source 'replan', SEM skip_reason) o que está
 * estritamente ANTES da segunda-feira da semana corrente. Atraso DENTRO da
 * semana corrente continua pendente: o reencaixe é quem decide o destino.
 *
 * Idempotente (pendentes já fechadas não voltam à seleção). Só fecha
 * sessões do plano ATIVO: sessões de plano arquivado são dado morto — a
 * escrita nela seria irreversível (o unskip recusa skip_source 'replan').
 *
 * Trava de lote: mais de 12 pendentes vencidas sugere plano abandonado —
 * avisa e fecha em fatias (idempotente), em vez de desistir do lote inteiro.
 *
 * O update repete o filtro `status = 'pending'`: entre o select e a escrita a
 * sessão pode ter sido aberta (in_progress) — não se fecha o que começou. A
 * contagem vem do .select() do update: o que o banco REALMENTE afetou (dois
 * aparelhos concorrentes não contam duas vezes a mesma linha).
 */
const LOTE_FECHAMENTO = 12;

export const fecharSessoesDeSemanasVencidas = async (
  userId: string,
  hojeISO: string,
): Promise<{ fechadas: number }> => {
  const segundaDaSemana = segundaDaSemanaDe(hojeISO);
  if (!segundaDaSemana) return { fechadas: 0 };

  const planId = await getActivePlanId(userId);
  if (!planId) return { fechadas: 0 };

  const vencidas = await supabase
    .from('planned_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'pending')
    .lt('scheduled_date', segundaDaSemana)
    .then(({ data, error }: { data: { id: string }[] | null; error: unknown }) => {
      if (error) throw error;
      return data ?? [];
    });

  if (vencidas.length === 0) return { fechadas: 0 };

  const ids = vencidas.map((s) => s.id);
  if (ids.length > LOTE_FECHAMENTO) {
    console.warn(
      `[fechamento] ${ids.length} pendentes vencidas no plano ativo — fechando em fatias de ${LOTE_FECHAMENTO}`,
    );
  }

  let fechadas = 0;
  for (let i = 0; i < ids.length; i += LOTE_FECHAMENTO) {
    const fatia = ids.slice(i, i + LOTE_FECHAMENTO);
    const resultado = await supabase
      .from('planned_sessions')
      .update({
        status: 'skipped',
        skip_source: 'replan',
        skipped_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('plan_id', planId)
      .eq('status', 'pending')
      .in('id', fatia)
      .select('id')
      .then(({ data, error }: { data: { id: string }[] | null; error: unknown }) => {
        if (error) throw error;
        return data ?? [];
      });
    fechadas += resultado.length;
  }

  return { fechadas };
};
