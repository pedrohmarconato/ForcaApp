// src/services/weeklyReplanRepository.ts
// Fase 6 — I/O do replanejamento semanal. Mesmo padrão das Fases 3/4: cliente
// único (config/supabaseClient), JWT do usuário e RLS "own"; erro do banco
// SEMPRE propaga (nunca vira sucesso silencioso).
//
// COMMIT B da escada de reencaixe (jul/2026): a redistribuição de volume saiu.
// A aplicação de um replanejamento CONFIRMADO passou a ser SÓ o registro do
// evento em session_logs.adherence_snapshot (coluna reservada à Fase 6 na
// migration 0001), com available_minutes quando há corte de tempo. Não há mais
// insert em planned_sets nem marcação de skipped — logo não existe estado
// parcial: falha no snapshot propaga, o erro aparece e a proposta fica de pé
// para tentar de novo (o store NÃO recalcula com availableMinutes: null —
// isso mataria o corte pedido e o retry devolveria sucesso sem escrever).

import { supabase } from '../config/supabaseClient';
import { toNum, type ExerciseMetric } from '../engine/sessionModel';
import {
  parseReplanSnapshot,
  type Priority,
  type ReplanEvent,
  type ReplanSession,
  type ReplanSessionStatus,
  type ReplanSnapshot,
  type WeeklyReplanProposal,
} from '../engine/weeklyReplanner';

/**
 * Falha no registro do snapshot de um replanejamento confirmado. A aplicação
 * não tem estágios parciais desde o COMMIT B: ou o snapshot foi gravado, ou
 * nada aconteceu.
 */
export class ReplanApplyError extends Error {
  readonly stage: 'snapshot';
  readonly cause?: unknown;

  constructor(cause: unknown, options: { fallbackMessage?: string }) {
    const message =
      (typeof cause === 'object' && cause !== null &&
        typeof (cause as { message?: unknown }).message === 'string' &&
        (cause as { message: string }).message) ||
      options.fallbackMessage ||
      'Não foi possível aplicar o replanejamento.';
    super(message);
    this.name = 'ReplanApplyError';
    this.stage = 'snapshot';
    this.cause = cause;
  }
}

type RawPlannedSet = {
  id: string;
  set_order: number;
  target_reps_min: number;
  target_reps_max: number;
  target_load_kg: number | string | null;
  target_rir: number | null;
};

type RawExercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  priority: Priority;
  exercise_order: number;
  metric: ExerciseMetric | null;
  planned_sets: RawPlannedSet[];
};

type RawSession = {
  id: string;
  week_number: number;
  title: string;
  session_type: string | null;
  scheduled_date: string | null;
  status: ReplanSessionStatus;
  estimated_minutes: number | null;
  // Quem marcou como skipped (0020): 'user' = recusa declarada do aluno.
  skip_source?: 'user' | 'replan' | null;
  // Vem do `select('*')` e é a ordem REAL da semana. Sem ela declarada aqui,
  // quem precisa desempatar a fila cai no índice do array — que este select
  // não ordena, e portanto não garante.
  order_in_week: number;
  planned_exercises: RawExercise[];
};

export type WeekReplanContext = {
  planId: string;
  weekNumber: number;
  userId: string;
  /** Entrada do motor. */
  sessions: ReplanSession[];
  completedSetsBySession: Record<string, number>;
  /** Rótulo exibível por sessão (banner): "Treino B · 2026-07-18". */
  sessionLabelById: Record<string, string>;
  /** Linhas cruas (ordem REAL da semana via order_in_week). */
  raw: RawSession[];
  /** Snapshot já existente por session_log (para MERGE de eventos, nunca sobrescrever). */
  snapshotBySessionLogId: Record<string, ReplanSnapshot>;
};

/**
 * Estado da semana para o replanejador: sessões planejadas (com exercícios e
 * séries), séries executadas por sessão e os replans anteriores (via snapshots
 * dos session_logs da semana) — insumo do teto "faltas múltiplas não empilham".
 */
export const getWeekReplanContext = async (
  userId: string,
  planId: string,
  weekNumber: number,
): Promise<WeekReplanContext> => {
  const sessoesRes = await supabase
    .from('planned_sessions')
    .select('*, planned_exercises(*, planned_sets(*))')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('week_number', weekNumber);
  if (sessoesRes.error) throw sessoesRes.error;

  const raw: RawSession[] = ((sessoesRes.data ?? []) as any[]).map((s) => ({
    ...s,
    planned_exercises: [...(s.planned_exercises ?? [])]
      .sort((a: RawExercise, b: RawExercise) => a.exercise_order - b.exercise_order)
      .map((e: RawExercise) => ({
        ...e,
        planned_sets: [...(e.planned_sets ?? [])].sort(
          (a: RawPlannedSet, b: RawPlannedSet) => a.set_order - b.set_order,
        ),
      })),
  }));

  const ids = raw.map((s) => s.id);
  let logs: any[] = [];
  if (ids.length > 0) {
    const logsRes = await supabase
      .from('session_logs')
      .select('id, planned_session_id, adherence_snapshot, set_logs(id)')
      .in('planned_session_id', ids);
    if (logsRes.error) throw logsRes.error;
    logs = (logsRes.data ?? []) as any[];
  }

  const completedSetsBySession: Record<string, number> = {};
  const snapshotBySessionLogId: Record<string, ReplanSnapshot> = {};
  for (const log of logs) {
    const count = (log.set_logs ?? []).length;
    completedSetsBySession[log.planned_session_id] =
      (completedSetsBySession[log.planned_session_id] ?? 0) + count;
    const snap = parseReplanSnapshot(log.adherence_snapshot);
    if (snap) snapshotBySessionLogId[log.id] = snap;
  }

  const sessions: ReplanSession[] = raw.map((s) => ({
    id: s.id,
    weekNumber: toNum(s.week_number) ?? weekNumber,
    title: s.title,
    sessionType: s.session_type,
    scheduledDate: s.scheduled_date,
    status: s.status,
    skipSource: s.skip_source ?? null,
    estimatedMinutes: s.estimated_minutes == null ? null : toNum(s.estimated_minutes),
    exercises: (s.planned_exercises ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscle_group,
      priority: e.priority,
      exerciseOrder: toNum(e.exercise_order) ?? 0,
      metric: e.metric ?? null,
      sets: (e.planned_sets ?? []).map((ps) => ({
        id: ps.id,
        setOrder: toNum(ps.set_order) ?? 0,
      })),
    })),
  }));

  const sessionLabelById: Record<string, string> = {};
  for (const s of raw) {
    sessionLabelById[s.id] = s.scheduled_date ? `${s.title} · ${s.scheduled_date}` : s.title;
  }

  return {
    planId,
    weekNumber,
    userId,
    sessions,
    completedSetsBySession,
    sessionLabelById,
    raw,
    snapshotBySessionLogId,
  };
};

/**
 * Registra um replanejamento CONFIRMADO pelo aluno. Nunca é chamado sem a
 * confirmação (a proposta é overlay em memória até lá). COMMIT B: grava só o
 * evento no snapshot do session_log da sessão ativa — nada é inserido em
 * planned_sets nem marcado como skipped.
 */
export const applyConfirmedReplan = async (params: {
  context: WeekReplanContext;
  proposal: WeeklyReplanProposal;
  /** session_log da sessão aberta agora — recebe o snapshot e available_minutes. */
  sessionLogId: string;
  confirmedAtISO: string;
}): Promise<void> => {
  const { context, proposal, sessionLogId } = params;
  const { timeCut } = proposal;

  // GRAVA o evento no snapshot do log atual (merge — nunca apaga eventos).
  const event: ReplanEvent = {
    confirmedAtISO: params.confirmedAtISO,
    planId: context.planId,
    weekNumber: context.weekNumber,
    adherence: proposal.adherence,
    timeCut: timeCut
      ? {
          sessionId: timeCut.sessionId,
          availableMinutes: timeCut.availableMinutes,
          estimatedMinutes: timeCut.estimatedMinutes,
          keptPriorities: timeCut.keptPriorities,
          cutExercises: timeCut.cutExercises.map((c) => ({
            exerciseId: c.exerciseId,
            name: c.name,
            setsCut: c.setsCut,
          })),
        }
      : null,
  };
  const existing = context.snapshotBySessionLogId[sessionLogId];
  const merged: ReplanSnapshot = { version: 1, events: [...(existing?.events ?? []), event] };
  const updatePayload: Record<string, unknown> = { adherence_snapshot: merged };
  if (timeCut) updatePayload.available_minutes = timeCut.availableMinutes;

  const snapRes = await supabase
    .from('session_logs')
    .update(updatePayload)
    .eq('id', sessionLogId)
    .select('id');
  const snapshotFailed =
    snapRes.error != null || !((snapRes.data ?? []) as any[]).some((r) => r?.id === sessionLogId);
  if (snapshotFailed) {
    throw new ReplanApplyError(snapRes.error, {
      fallbackMessage: 'Não foi possível registrar o replanejamento.',
    });
  }
};
