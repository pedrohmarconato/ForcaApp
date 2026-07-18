// src/services/weeklyReplanRepository.ts
// Fase 6 — I/O do replanejamento semanal. Mesmo padrão das Fases 3/4: cliente
// único (config/supabaseClient), JWT do usuário e RLS "own"; erro do banco
// SEMPRE propaga (nunca vira sucesso silencioso).
//
// Decisão do dono: preservar o original SEM migration nova. A aplicação de um
// replanejamento CONFIRMADO é só ADITIVA:
//   1. INSERE séries novas em planned_sets (sessões futuras/atual);
//   2. GRAVA o evento (snapshot) em session_logs.adherence_snapshot — coluna
//      reservada à Fase 6 na migration 0001 — com os IDs inseridos, os status
//      originais e as perdas aceitas;
//   3. marca as sessões perdidas como 'skipped'.
// A ordem 2-antes-de-3 é deliberada: se o passo 3 falhar, o snapshot já registra
// as séries adicionadas, então uma nova proposta NÃO empilha volume (o teto conta
// os adds anteriores). Se o passo 2 falhar, as séries do passo 1 são removidas
// (rollback best-effort) e o erro propaga — nada fica aplicado sem registro.

import { supabase } from '../config/supabaseClient';
import { toNum } from '../engine/sessionModel';
import {
  addedSetIdsFromSnapshots,
  parseReplanSnapshot,
  type AddedSetRow,
  type Priority,
  type ReplanEvent,
  type ReplanSession,
  type ReplanSessionStatus,
  type ReplanSnapshot,
  type WeeklyReplanProposal,
} from '../engine/weeklyReplanner';

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
  planned_exercises: RawExercise[];
};

export type WeekReplanContext = {
  planId: string;
  weekNumber: number;
  userId: string;
  /** Entrada do motor (com as séries de replans anteriores marcadas). */
  sessions: ReplanSession[];
  completedSetsBySession: Record<string, number>;
  /** Rótulo exibível por sessão (banner): "Treino B · 2026-07-18". */
  sessionLabelById: Record<string, string>;
  /** Linhas cruas para montar os INSERTs na aplicação. */
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
  const snapshots: (ReplanSnapshot | null)[] = [];
  for (const log of logs) {
    const count = (log.set_logs ?? []).length;
    completedSetsBySession[log.planned_session_id] =
      (completedSetsBySession[log.planned_session_id] ?? 0) + count;
    const snap = parseReplanSnapshot(log.adherence_snapshot);
    snapshots.push(snap);
    if (snap) snapshotBySessionLogId[log.id] = snap;
  }
  const addedIds = addedSetIdsFromSnapshots(snapshots);

  const sessions: ReplanSession[] = raw.map((s) => ({
    id: s.id,
    weekNumber: toNum(s.week_number) ?? weekNumber,
    title: s.title,
    sessionType: s.session_type,
    scheduledDate: s.scheduled_date,
    status: s.status,
    estimatedMinutes: s.estimated_minutes == null ? null : toNum(s.estimated_minutes),
    exercises: (s.planned_exercises ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      muscleGroup: e.muscle_group,
      priority: e.priority,
      exerciseOrder: toNum(e.exercise_order) ?? 0,
      sets: (e.planned_sets ?? []).map((ps) => ({
        id: ps.id,
        setOrder: toNum(ps.set_order) ?? 0,
        addedByReplan: addedIds.has(ps.id),
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
 * Aplica um replanejamento CONFIRMADO pelo aluno. Nunca é chamado sem a
 * confirmação (a proposta é overlay em memória até lá). Devolve as séries
 * inseridas para o store anexar as da sessão ativa ao rascunho.
 */
export const applyConfirmedReplan = async (params: {
  context: WeekReplanContext;
  proposal: WeeklyReplanProposal;
  /** session_log da sessão aberta agora — recebe o snapshot e available_minutes. */
  sessionLogId: string;
  confirmedAtISO: string;
}): Promise<{ addedSets: AddedSetRow[] }> => {
  const { context, proposal, sessionLogId } = params;
  const { redistribution, timeCut } = proposal;

  // 1. INSERE as séries da redistribuição, copiando o alvo da última série
  // ORIGINAL do exercício receptor (nada de alvo inventado).
  const exerciseById = new Map<string, { session: RawSession; exercise: RawExercise }>();
  for (const s of context.raw) {
    for (const e of s.planned_exercises) exerciseById.set(e.id, { session: s, exercise: e });
  }
  const priorAddedIds = addedSetIdsFromSnapshots(Object.values(context.snapshotBySessionLogId));

  const rowsToInsert: any[] = [];
  for (const addition of redistribution?.additions ?? []) {
    const alvo = exerciseById.get(addition.exerciseId);
    if (!alvo) throw new Error('Replanejamento desatualizado: exercício receptor não encontrado.');
    const originais = alvo.exercise.planned_sets.filter((ps) => !priorAddedIds.has(ps.id));
    const template = originais[originais.length - 1] ?? alvo.exercise.planned_sets[alvo.exercise.planned_sets.length - 1];
    if (!template) throw new Error('Replanejamento desatualizado: exercício receptor sem séries.');
    const maxOrder = Math.max(...alvo.exercise.planned_sets.map((ps) => toNum(ps.set_order) ?? 0));
    for (let i = 1; i <= addition.addSets; i++) {
      rowsToInsert.push({
        exercise_id: addition.exerciseId,
        set_order: maxOrder + i,
        target_reps_min: template.target_reps_min,
        target_reps_max: template.target_reps_max,
        target_load_kg: template.target_load_kg,
        target_rir: template.target_rir,
      });
    }
  }

  let addedSets: AddedSetRow[] = [];
  if (rowsToInsert.length > 0) {
    const insertRes = await supabase
      .from('planned_sets')
      .insert(rowsToInsert)
      .select('id, exercise_id, set_order, target_reps_min, target_reps_max, target_load_kg, target_rir');
    if (insertRes.error) throw insertRes.error;
    addedSets = ((insertRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      sessionId: exerciseById.get(r.exercise_id)?.session.id ?? '',
      exerciseId: r.exercise_id,
      setOrder: toNum(r.set_order) ?? 0,
      targetRepsMin: toNum(r.target_reps_min) ?? 0,
      targetRepsMax: toNum(r.target_reps_max) ?? 0,
      targetLoadKg: r.target_load_kg == null ? null : toNum(r.target_load_kg),
      targetRir: r.target_rir == null ? null : toNum(r.target_rir),
    }));
  }

  // 2. GRAVA o evento no snapshot do log atual (merge — nunca apaga eventos).
  const missedById = new Map(context.sessions.map((s) => [s.id, s]));
  const event: ReplanEvent = {
    confirmedAtISO: params.confirmedAtISO,
    planId: context.planId,
    weekNumber: context.weekNumber,
    adherence: proposal.adherence,
    redistribution: redistribution
      ? {
          missedSessions: redistribution.missedSessionIds.map((id) => ({
            id,
            originalStatus: missedById.get(id)?.status ?? 'pending',
          })),
          addedSets: addedSets.map((r) => ({
            id: r.id,
            sessionId: r.sessionId,
            exerciseId: r.exerciseId,
            setOrder: r.setOrder,
          })),
          losses: redistribution.losses,
        }
      : null,
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
    // Sem registro não fica nada aplicado: remove as séries recém-inseridas
    // (best-effort) e propaga o erro. Falha do rollback não mascara a original.
    if (addedSets.length > 0) {
      try {
        await supabase.from('planned_sets').delete().in('id', addedSets.map((r) => r.id));
      } catch (rollbackError) {
        console.warn('[weeklyReplan] rollback das séries inseridas falhou:', rollbackError);
      }
    }
    throw snapRes.error ?? new Error('Não foi possível registrar o replanejamento.');
  }

  // 3. Marca as sessões perdidas como 'skipped' (só as ainda pendentes — não
  // atropela uma mudança concorrente). Falha aqui propaga, mas o snapshot do
  // passo 2 já garante que uma nova proposta não empilha volume.
  const missedIds = redistribution?.missedSessionIds ?? [];
  if (missedIds.length > 0) {
    const skipRes = await supabase
      .from('planned_sessions')
      .update({ status: 'skipped' })
      .in('id', missedIds)
      .eq('user_id', context.userId)
      .eq('status', 'pending');
    if (skipRes.error) throw skipRes.error;
  }

  return { addedSets };
};
