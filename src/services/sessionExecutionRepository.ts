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
import { normalizeName, toNum } from '../engine/sessionModel';

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
 * Abre a execução de forma ATÔMICA via RPC `start_session` (migration 0003):
 * numa transação, reaproveita o session_log aberto ou cria um novo e marca a
 * sessão planejada 'in_progress'. Idempotente (reusa log aberto) — não duplica
 * session_log em retry/corrida. Retorna id + started_at do servidor.
 */
export const startSessionLog = async (
  plannedSessionId: string,
): Promise<{ sessionLogId: string; startedAt: string }> => {
  const { data, error } = await supabase.rpc('start_session', {
    p_planned_session_id: plannedSessionId,
  });
  if (error) throw error;
  // A função retorna a linha de session_logs (objeto; alguns setups devolvem array).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('start_session não retornou a sessão de log.');
  return { sessionLogId: row.id as string, startedAt: row.started_at as string };
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
    .eq('session_log_id', row.id)
    // Ordem determinística: a semente de "última carga" pega a série MAIS RECENTE (F8).
    .order('completed_at', { ascending: true });
  if (sets.error) throw sets.error;

  return {
    sessionLogId: row.id as string,
    startedAt: row.started_at as string,
    // numeric (actual_load_kg) pode vir como string do PostgREST → coage (F4).
    setLogs: ((sets.data ?? []) as any[]).map((s) => ({
      id: s.id,
      planned_set_id: s.planned_set_id,
      actual_reps: s.actual_reps,
      actual_load_kg: toNum(s.actual_load_kg),
      actual_rir: s.actual_rir,
      outcome: s.outcome,
    })) as ServerSetLog[],
  };
};

/**
 * Grava a execução de UMA série via RPC ATÔMICA `save_set_log` (migration 0004).
 * Erro propaga (a série NÃO pode ser marcada como feita se o banco recusou).
 * Devolve o id do set_log para guardar contra gravação dupla ao retomar.
 *
 * Por que RPC e não `.upsert(...,{onConflict})` (F1 — BLOCKER): o supabase-js gera
 * `ON CONFLICT (cols)` SEM predicado, e o índice único é PARCIAL
 * (`WHERE planned_set_id IS NOT NULL`) — o Postgres NÃO consegue inferir um índice
 * parcial sem o predicado explícito e devolve 42P10. A função usa
 * `ON CONFLICT (...) WHERE planned_set_id IS NOT NULL DO UPDATE ... completed_at=now()`,
 * que casa o índice parcial (F1) e mantém a linha coerente (F5). Ela ainda RECUSA
 * gravar em log finalizado ou alheio (F2/F6). adaptation continua nulo (Fase 5).
 */
export const saveSetLog = async (params: {
  sessionLogId: string;
  plannedSetId: string;
  actualReps: number;
  actualLoadKg: number | null;
  actualRir: number | null;
  outcome: Outcome;
}): Promise<{ setLogId: string }> => {
  const { data, error } = await supabase.rpc('save_set_log', {
    p_session_log_id: params.sessionLogId,
    p_planned_set_id: params.plannedSetId,
    p_actual_reps: params.actualReps,
    p_actual_load_kg: params.actualLoadKg,
    p_actual_rir: params.actualRir,
    p_outcome: params.outcome,
  });
  if (error) throw error;
  // A função retorna a linha de set_logs (objeto; alguns setups devolvem array).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('save_set_log não retornou a série gravada.');
  return { setLogId: row.id as string };
};

/**
 * Fecha a execução de forma ATÔMICA via RPC `finish_session` (migration 0003):
 * numa transação, seta finished_at e a sessão 'completed'. A RPC LEVANTA exceção
 * se 0 linhas forem afetadas (log inexistente, alheio ou já finalizado) — então
 * um update que não pega nada NÃO vira sucesso falso (F5/F6).
 */
export const finishSessionLog = async (sessionLogId: string): Promise<void> => {
  const { error } = await supabase.rpc('finish_session', {
    p_session_log_id: sessionLogId,
  });
  if (error) throw error;
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
      actualLoadKg: toNum(l.actual_load_kg), // numeric pode vir como string (F4)
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
