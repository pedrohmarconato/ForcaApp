// src/services/sessionExecutionRepository.ts
// Fase 4 — Escrita/leitura da EXECUÇÃO da sessão (session_logs / set_logs).
// Mesmo padrão da leitura da Fase 3: cliente único (config/supabaseClient),
// JWT do usuário e RLS por usuário. Erro do banco SEMPRE propaga (throw) —
// nunca é engolido como sucesso (achado recorrente: série "salva" que não salvou).
//
// A coluna set_logs.adaptation fica NULA nesta fase: registrar desempenho e
// calcular o outcome é Fase 4; decidir o ajuste é Fase 5.

import { supabase } from '../config/supabaseClient';
import type { Outcome } from '../engine/sessionModel';
import { normalizeName } from '../engine/sessionModel';

export type ServerSetLog = {
  id: string;
  planned_set_id: string | null;
  actual_reps: number;
  actual_load_kg: number | null;
  actual_rir: number | null;
  outcome: Outcome | null;
};

export type OpenSessionLog = {
  sessionLogId: string;
  startedAt: string;
  setLogs: ServerSetLog[];
};

/**
 * Abre a execução: cria um session_log e marca a sessão planejada como
 * 'in_progress'. Retorna o id e o started_at do servidor.
 * Chame getOpenSessionLog ANTES para não duplicar a execução em retry.
 */
export const startSessionLog = async (
  userId: string,
  plannedSessionId: string,
): Promise<{ sessionLogId: string; startedAt: string }> => {
  const inserido = await supabase
    .from('session_logs')
    .insert({ planned_session_id: plannedSessionId, user_id: userId })
    .select('id, started_at')
    .single();
  if (inserido.error) throw inserido.error;
  const sessionLogId = inserido.data?.id as string;
  const startedAt = inserido.data?.started_at as string;

  const status = await supabase
    .from('planned_sessions')
    .update({ status: 'in_progress' })
    .eq('id', plannedSessionId);
  if (status.error) throw status.error;

  return { sessionLogId, startedAt };
};

/**
 * Execução em aberto (finished_at nulo) da sessão planejada, se houver — com as
 * séries já gravadas. Serve para RETOMAR sem criar um segundo session_log e para
 * reconstruir o rascunho caso o do aparelho tenha se perdido.
 */
export const getOpenSessionLog = async (
  userId: string,
  plannedSessionId: string,
): Promise<OpenSessionLog | null> => {
  const log = await supabase
    .from('session_logs')
    .select('id, started_at')
    .eq('user_id', userId)
    .eq('planned_session_id', plannedSessionId)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1);
  if (log.error) throw log.error;
  const row = log.data?.[0];
  if (!row) return null;

  const sets = await supabase
    .from('set_logs')
    .select('id, planned_set_id, actual_reps, actual_load_kg, actual_rir, outcome')
    .eq('session_log_id', row.id);
  if (sets.error) throw sets.error;

  return {
    sessionLogId: row.id as string,
    startedAt: row.started_at as string,
    setLogs: (sets.data ?? []) as ServerSetLog[],
  };
};

/**
 * Grava a execução de UMA série. Erro propaga (a série NÃO pode ser marcada
 * como feita se o banco recusou). Devolve o id do set_log para guardar contra
 * gravação dupla ao retomar.
 */
export const saveSetLog = async (params: {
  sessionLogId: string;
  plannedSetId: string;
  actualReps: number;
  actualLoadKg: number | null;
  actualRir: number | null;
  outcome: Outcome;
}): Promise<{ setLogId: string }> => {
  const { data, error } = await supabase
    .from('set_logs')
    .insert({
      session_log_id: params.sessionLogId,
      planned_set_id: params.plannedSetId,
      actual_reps: params.actualReps,
      actual_load_kg: params.actualLoadKg,
      actual_rir: params.actualRir,
      outcome: params.outcome,
      // adaptation: intencionalmente nulo nesta fase (Fase 5).
    })
    .select('id')
    .single();
  if (error) throw error;
  return { setLogId: data?.id as string };
};

/**
 * Fecha a execução: finished_at agora e sessão planejada 'completed'.
 */
export const finishSessionLog = async (
  sessionLogId: string,
  plannedSessionId: string,
  finishedAtISO: string,
): Promise<void> => {
  const fim = await supabase
    .from('session_logs')
    .update({ finished_at: finishedAtISO })
    .eq('id', sessionLogId);
  if (fim.error) throw fim.error;

  const status = await supabase
    .from('planned_sessions')
    .update({ status: 'completed' })
    .eq('id', plannedSessionId);
  if (status.error) throw status.error;
};

/**
 * Última carga registrada por exercício (nome normalizado → kg), a partir do
 * histórico de set_logs do usuário (RLS já restringe às execuções dele).
 * Usada para SUGERIR a carga na próxima vez — decisão nº 4 do plano.
 * Só considera exercícios cujos nomes foram pedidos.
 */
export const getLastLoadByExerciseName = async (
  exerciseNames: string[],
): Promise<Record<string, number>> => {
  if (exerciseNames.length === 0) return {};
  const alvo = new Set(exerciseNames.map(normalizeName));

  const { data, error } = await supabase
    .from('set_logs')
    .select('actual_load_kg, completed_at, planned_sets(planned_exercises(name))')
    .not('actual_load_kg', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  const mapa: Record<string, number> = {};
  for (const linha of (data ?? []) as any[]) {
    const nome: string | undefined = linha?.planned_sets?.planned_exercises?.name;
    const carga = linha?.actual_load_kg;
    if (!nome || carga == null) continue;
    const chave = normalizeName(nome);
    if (!alvo.has(chave)) continue;
    // Ordenado por completed_at desc → o PRIMEIRO visto é o mais recente.
    if (!(chave in mapa)) mapa[chave] = Number(carga);
  }
  return mapa;
};

// ============================================================
// Histórico (Perfil)
// ============================================================

export type CompletedSessionSummary = {
  sessionLogId: string;
  plannedSessionId: string;
  title: string;
  weekNumber: number | null;
  muscleGroups: string[];
  startedAt: string;
  finishedAt: string | null;
};

/** Sessões concluídas do usuário (finished_at preenchido), mais recentes antes. */
export const getCompletedSessions = async (
  userId: string,
): Promise<CompletedSessionSummary[]> => {
  const { data, error } = await supabase
    .from('session_logs')
    .select(
      'id, planned_session_id, started_at, finished_at, planned_sessions(title, week_number, muscle_groups)',
    )
    .eq('user_id', userId)
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as any[]).map((linha) => ({
    sessionLogId: linha.id,
    plannedSessionId: linha.planned_session_id,
    title: linha.planned_sessions?.title ?? 'Treino',
    weekNumber: linha.planned_sessions?.week_number ?? null,
    muscleGroups: linha.planned_sessions?.muscle_groups ?? [],
    startedAt: linha.started_at,
    finishedAt: linha.finished_at,
  }));
};

export type HistorySetLog = {
  setOrder: number | null;
  actualReps: number;
  actualLoadKg: number | null;
  actualRir: number | null;
  outcome: Outcome | null;
};

export type HistoryExercise = {
  name: string;
  order: number;
  sets: HistorySetLog[];
};

export type SessionLogDetail = {
  sessionLogId: string;
  title: string;
  weekNumber: number | null;
  startedAt: string;
  finishedAt: string | null;
  exercises: HistoryExercise[];
};

/**
 * Detalhe de uma sessão concluída: o que foi feito (reps/carga/outcome reais)
 * agrupado por exercício e ordenado no cliente (ordenação aninhada do PostgREST
 * é frágil — mesmo motivo do getSessionDetail da Fase 3).
 */
export const getSessionLogDetail = async (
  sessionLogId: string,
): Promise<SessionLogDetail | null> => {
  const cabecalho = await supabase
    .from('session_logs')
    .select('id, started_at, finished_at, planned_sessions(title, week_number)')
    .eq('id', sessionLogId)
    .single();
  if (cabecalho.error) throw cabecalho.error;
  if (!cabecalho.data) return null;

  const linhas = await supabase
    .from('set_logs')
    .select(
      'actual_reps, actual_load_kg, actual_rir, outcome, completed_at, planned_sets(set_order, planned_exercises(name, exercise_order))',
    )
    .eq('session_log_id', sessionLogId);
  if (linhas.error) throw linhas.error;

  // Agrupa por exercício (ordem + nome), preservando a ordem das séries.
  const porExercicio = new Map<string, HistoryExercise>();
  for (const l of (linhas.data ?? []) as any[]) {
    const nome: string = l?.planned_sets?.planned_exercises?.name ?? 'Exercício';
    const ordemEx: number = l?.planned_sets?.planned_exercises?.exercise_order ?? 0;
    const chave = `${ordemEx}::${nome}`;
    if (!porExercicio.has(chave)) {
      porExercicio.set(chave, { name: nome, order: ordemEx, sets: [] });
    }
    porExercicio.get(chave)!.sets.push({
      setOrder: l?.planned_sets?.set_order ?? null,
      actualReps: l.actual_reps,
      actualLoadKg: l.actual_load_kg,
      actualRir: l.actual_rir,
      outcome: l.outcome,
    });
  }

  const exercises = [...porExercicio.values()]
    .sort((a, b) => a.order - b.order)
    .map((ex) => ({
      ...ex,
      sets: [...ex.sets].sort((a, b) => (a.setOrder ?? 0) - (b.setOrder ?? 0)),
    }));

  const c = cabecalho.data as any;
  return {
    sessionLogId: c.id,
    title: c.planned_sessions?.title ?? 'Treino',
    weekNumber: c.planned_sessions?.week_number ?? null,
    startedAt: c.started_at,
    finishedAt: c.finished_at,
    exercises,
  };
};
