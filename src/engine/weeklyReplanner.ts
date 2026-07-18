// src/engine/weeklyReplanner.ts
// Fase 6 — Replanejamento SEMANAL por regras. Puro (sem I/O).
//
// Dado o estado da semana (sessões planejadas × executadas), calcula:
//  - aderência (sessões e volume), sem inventar taxa quando não há base;
//  - escada de tempo para HOJE (~100%/66%/45%): corta acessórios antes de
//    secundários antes de primários — usa a prioridade da Fase 3;
//  - redistribuição pós-falta nas sessões RESTANTES, com teto (+25% por grupo
//    muscular na receptora), respeitando recuperação (não empilhar o mesmo grupo
//    em dias consecutivos). O que não couber é PERDA registrada, nunca maquiada.
// Princípios herdados das Fases 4/5:
//  - NUNCA aplica sozinho: devolve uma PROPOSTA; o aluno confirma na tela
//    (recusa mantém o plano original — a proposta é só overlay até lá);
//  - deload reduz e NÃO compensa: nunca recebe redistribuição e a falta de um
//    deload não é compensada;
//  - faltas múltiplas NÃO empilham: o teto vale para o TOTAL redistribuído
//    (replans anteriores contam), não por falta.

import { normalizeName } from './sessionModel';
import { REPLAN_CONFIG, type ReplanConfig } from './config';

export type Priority = 'primary' | 'secondary' | 'accessory';
export type ReplanSessionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type ReplanSetRef = {
  id: string;
  setOrder: number;
  /** Série inserida por um replanejamento anterior (registrada no snapshot). */
  addedByReplan?: boolean;
};

export type ReplanExercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  priority: Priority;
  exerciseOrder: number;
  sets: ReplanSetRef[];
};

export type ReplanSession = {
  id: string;
  weekNumber: number;
  title: string;
  sessionType: string | null;
  scheduledDate: string | null;
  status: ReplanSessionStatus;
  estimatedMinutes: number | null;
  exercises: ReplanExercise[];
};

const PRIORITY_RANK: Record<Priority, number> = { primary: 0, secondary: 1, accessory: 2 };

/** Dia do calendário como inteiro (dias desde a época), só com a parte YYYY-MM-DD. */
const dayIndex = (isoDate: string | null): number | null => {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

// ---------------------------------------------------------------
// Aderência da semana
// ---------------------------------------------------------------

export type WeekAdherence = {
  /** Sessões que já deviam ter acontecido (data <= hoje, ou já resolvidas). */
  sessionsDue: number;
  sessionsCompleted: number;
  /** null quando não há sessão devida — sem base, sem taxa inventada. */
  sessionRate: number | null;
  /** Séries planejadas das sessões devidas. */
  setsDue: number;
  /** Séries de fato executadas (set_logs) nas sessões devidas. */
  setsCompleted: number;
  volumeRate: number | null;
};

export const computeAdherence = (params: {
  sessions: ReplanSession[];
  /** Séries executadas por sessão planejada (contagem de set_logs). */
  completedSetsBySession: Record<string, number>;
  todayISO: string;
}): WeekAdherence => {
  const today = dayIndex(params.todayISO);
  let sessionsDue = 0;
  let sessionsCompleted = 0;
  let setsDue = 0;
  let setsCompleted = 0;
  for (const s of params.sessions) {
    const d = dayIndex(s.scheduledDate);
    const resolved = s.status === 'completed' || s.status === 'skipped';
    const due = resolved || (d != null && today != null && d <= today);
    if (!due) continue;
    sessionsDue += 1;
    if (s.status === 'completed') sessionsCompleted += 1;
    for (const ex of s.exercises) setsDue += ex.sets.length;
    setsCompleted += params.completedSetsBySession[s.id] ?? 0;
  }
  return {
    sessionsDue,
    sessionsCompleted,
    sessionRate: sessionsDue > 0 ? sessionsCompleted / sessionsDue : null,
    setsDue,
    setsCompleted,
    volumeRate: setsDue > 0 ? setsCompleted / setsDue : null,
  };
};

// ---------------------------------------------------------------
// Deload — reduz e não compensa
// ---------------------------------------------------------------

/**
 * Sessão de deload? Detecção por TEXTO (session_type/título): o enum de volume
 * semanal que a IA declara ("Deload") não é persistido no modelo — limitação
 * registrada; sem sinal no texto, a sessão é tratada como normal.
 */
export const isDeloadSession = (
  session: Pick<ReplanSession, 'sessionType' | 'title'>,
  config: ReplanConfig = REPLAN_CONFIG,
): boolean => {
  const texto = normalizeName(`${session.sessionType ?? ''} ${session.title ?? ''}`);
  return config.deloadTokens.some((token) => texto.includes(token));
};

// ---------------------------------------------------------------
// Escada de tempo (hoje)
// ---------------------------------------------------------------

export type TimeCutPlan = {
  kind: 'time_cut';
  sessionId: string;
  availableMinutes: number;
  estimatedMinutes: number;
  ratio: number;
  keptPriorities: Priority[];
  cutExercises: {
    exerciseId: string;
    name: string;
    priority: Priority;
    muscleGroup: string | null;
    setsCut: number;
  }[];
};

/**
 * Escada de tempo para a sessão de HOJE. Corta por prioridade (acessórios antes
 * de secundários antes de primários); nunca corta primários. Devolve null quando
 * não há o que propor: tempo suficiente, sessão sem exercícios cortáveis no degrau,
 * ou sem estimated_minutes (sem base, nada é inventado).
 */
export const planTimeCut = (params: {
  session: ReplanSession;
  availableMinutes: number;
  config?: ReplanConfig;
}): TimeCutPlan | null => {
  const cfg = params.config ?? REPLAN_CONFIG;
  const { session, availableMinutes } = params;
  const estimated = session.estimatedMinutes;
  if (estimated == null || estimated <= 0) return null;
  const ratio = Math.max(0, availableMinutes) / estimated;
  if (ratio >= cfg.timeLadder.fullMinRatio) return null;
  const keptPriorities: Priority[] =
    ratio >= cfg.timeLadder.secondaryMinRatio ? ['primary', 'secondary'] : ['primary'];
  const cutExercises = session.exercises
    .filter((ex) => !keptPriorities.includes(ex.priority))
    .sort((a, b) => a.exerciseOrder - b.exerciseOrder)
    .map((ex) => ({
      exerciseId: ex.id,
      name: ex.name,
      priority: ex.priority,
      muscleGroup: ex.muscleGroup,
      setsCut: ex.sets.length,
    }));
  if (cutExercises.length === 0) return null;
  return {
    kind: 'time_cut',
    sessionId: session.id,
    availableMinutes,
    estimatedMinutes: estimated,
    ratio,
    keptPriorities,
    cutExercises,
  };
};

// ---------------------------------------------------------------
// Redistribuição pós-falta
// ---------------------------------------------------------------

export type ProposedAddition = {
  targetSessionId: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  addSets: number;
};

export type ReplanLossReason =
  | 'nao_coube'
  | 'deload_nao_compensa'
  | 'sem_grupo_muscular'
  | 'replan_anterior_perdido';

export type ReplanLoss = {
  missedSessionId: string;
  muscleGroup: string;
  sets: number;
  reason: ReplanLossReason;
};

export type MissedRedistributionPlan = {
  kind: 'missed_redistribution';
  /** Sessões perdidas (pendentes com data passada) — serão marcadas 'skipped' na aplicação. */
  missedSessionIds: string[];
  additions: ProposedAddition[];
  losses: ReplanLoss[];
};

type GroupVolume = {
  key: string; // grupo normalizado
  label: string; // como veio do plano
  originalSets: number; // séries que NÃO vieram de replan anterior
  priorReplanSets: number; // séries inseridas por replans anteriores
};

/** Volume por grupo muscular de uma sessão, na ordem de aparição dos exercícios. */
const groupVolumes = (session: ReplanSession): GroupVolume[] => {
  const byKey = new Map<string, GroupVolume>();
  const ordered = [...session.exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  for (const ex of ordered) {
    const key = ex.muscleGroup == null ? null : normalizeName(ex.muscleGroup);
    const mapKey = key ?? '__sem_grupo__';
    let vol = byKey.get(mapKey);
    if (!vol) {
      vol = {
        key: mapKey,
        label: ex.muscleGroup ?? 'desconhecido',
        originalSets: 0,
        priorReplanSets: 0,
      };
      byKey.set(mapKey, vol);
    }
    for (const s of ex.sets) {
      if (s.addedByReplan) vol.priorReplanSets += 1;
      else vol.originalSets += 1;
    }
  }
  return [...byKey.values()];
};

const trainsGroup = (session: ReplanSession, groupKey: string): boolean =>
  session.exercises.some(
    (ex) => ex.muscleGroup != null && normalizeName(ex.muscleGroup) === groupKey,
  );

/**
 * Redistribui o volume das sessões PERDIDAS (pendentes com data anterior a hoje)
 * nas sessões restantes da semana. Devolve null quando não há falta. As perdas
 * (o que não coube, deload, sem grupo) são sempre registradas — nunca maquiadas.
 */
export const planMissedRedistribution = (params: {
  sessions: ReplanSession[];
  todayISO: string;
  /** Sessão sendo aberta agora: é "restante" mesmo com data de hoje. */
  currentSessionId?: string;
  config?: ReplanConfig;
}): MissedRedistributionPlan | null => {
  const cfg = params.config ?? REPLAN_CONFIG;
  const today = dayIndex(params.todayISO);
  if (today == null) return null;

  const day = (s: ReplanSession) => dayIndex(s.scheduledDate);
  const missed = params.sessions
    .filter((s) => {
      const d = day(s);
      return s.status === 'pending' && d != null && d < today;
    })
    .sort((a, b) => (day(a)! - day(b)!) || a.id.localeCompare(b.id));
  if (missed.length === 0) return null;
  const missedIds = new Set(missed.map((s) => s.id));

  // Receptoras: restantes da semana (pendente/em andamento, com data, hoje em diante
  // ou a sessão sendo aberta), nunca deload, nunca uma das perdidas.
  const targets = params.sessions
    .filter((s) => {
      if (missedIds.has(s.id)) return false;
      if (s.status !== 'pending' && s.status !== 'in_progress') return false;
      if (isDeloadSession(s, cfg)) return false;
      const d = day(s);
      if (d == null) return false;
      return d >= today || s.id === params.currentSessionId;
    })
    .sort((a, b) => (day(a)! - day(b)!) || a.id.localeCompare(b.id));

  // Recuperação: a receptora não pode receber um grupo já treinado em dia adjacente
  // por OUTRA sessão não-descartada (as perdidas serão 'skipped', não contam).
  const recoveryConflict = (target: ReplanSession, groupKey: string): boolean =>
    params.sessions.some((other) => {
      if (other.id === target.id || missedIds.has(other.id)) return false;
      if (other.status === 'skipped') return false;
      const dOther = day(other);
      const dTarget = day(target);
      if (dOther == null || dTarget == null) return false;
      const gap = Math.abs(dOther - dTarget);
      return gap > 0 && gap <= cfg.minRestDaysSameGroup && trainsGroup(other, groupKey);
    });

  // Capacidade restante por (receptora, grupo): teto sobre as séries ORIGINAIS,
  // já descontando o que replans anteriores inseriram (faltas múltiplas não empilham).
  const capacity = new Map<string, number>();
  const capKey = (sessionId: string, groupKey: string) => `${sessionId}::${groupKey}`;
  for (const t of targets) {
    for (const vol of groupVolumes(t)) {
      if (vol.key === '__sem_grupo__') continue;
      const cap = Math.floor(cfg.redistributionCapPct * vol.originalSets) - vol.priorReplanSets;
      capacity.set(capKey(t.id, vol.key), Math.max(0, cap));
    }
  }

  // Exercício receptor por (receptora, grupo): o de maior prioridade, depois ordem.
  const receiverExercise = (target: ReplanSession, groupKey: string): ReplanExercise | null => {
    const candidates = target.exercises
      .filter((ex) => ex.muscleGroup != null && normalizeName(ex.muscleGroup) === groupKey)
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          a.exerciseOrder - b.exerciseOrder ||
          a.id.localeCompare(b.id),
      );
    return candidates[0] ?? null;
  };

  const additions = new Map<string, ProposedAddition & { targetDay: number; exerciseOrder: number }>();
  const losses = new Map<string, ReplanLoss>();
  const registerLoss = (
    missedSessionId: string,
    muscleGroup: string,
    setsCount: number,
    reason: ReplanLossReason,
  ) => {
    if (setsCount <= 0) return;
    const key = `${missedSessionId}::${muscleGroup}::${reason}`;
    const existing = losses.get(key);
    if (existing) existing.sets += setsCount;
    else losses.set(key, { missedSessionId, muscleGroup, sets: setsCount, reason });
  };

  const rrIndexByGroup = new Map<string, number>();

  for (const lost of missed) {
    const deload = isDeloadSession(lost, cfg);
    for (const vol of groupVolumes(lost)) {
      if (vol.key === '__sem_grupo__') {
        registerLoss(lost.id, vol.label, vol.originalSets + vol.priorReplanSets, 'sem_grupo_muscular');
        continue;
      }
      // Volume que veio de replan anterior não é re-redistribuído (empilharia em cadeia).
      registerLoss(lost.id, vol.label, vol.priorReplanSets, 'replan_anterior_perdido');
      if (deload) {
        // Deload reduz e não compensa: a perda é aceita e registrada.
        registerLoss(lost.id, vol.label, vol.originalSets, 'deload_nao_compensa');
        continue;
      }
      const eligible = targets.filter(
        (t) =>
          (capacity.get(capKey(t.id, vol.key)) ?? 0) > 0 &&
          receiverExercise(t, vol.key) != null &&
          !recoveryConflict(t, vol.key),
      );
      let remaining = vol.originalSets;
      let rr = rrIndexByGroup.get(vol.key) ?? 0;
      // Uma série por vez, alternando entre as receptoras aptas, até esgotar o teto.
      while (remaining > 0 && eligible.length > 0) {
        let placed = false;
        for (let i = 0; i < eligible.length && remaining > 0; i++) {
          const t = eligible[(rr + i) % eligible.length];
          const key = capKey(t.id, vol.key);
          const cap = capacity.get(key) ?? 0;
          if (cap <= 0) continue;
          const receiver = receiverExercise(t, vol.key)!;
          const addKey = `${t.id}::${receiver.id}`;
          const existing = additions.get(addKey);
          if (existing) existing.addSets += 1;
          else
            additions.set(addKey, {
              targetSessionId: t.id,
              exerciseId: receiver.id,
              exerciseName: receiver.name,
              muscleGroup: vol.label,
              addSets: 1,
              targetDay: day(t)!,
              exerciseOrder: receiver.exerciseOrder,
            });
          capacity.set(key, cap - 1);
          remaining -= 1;
          rr = (rr + i + 1) % eligible.length;
          placed = true;
        }
        if (!placed) break; // nenhuma receptora com teto disponível
      }
      rrIndexByGroup.set(vol.key, rr);
      registerLoss(lost.id, vol.label, remaining, 'nao_coube');
    }
  }

  return {
    kind: 'missed_redistribution',
    missedSessionIds: missed.map((s) => s.id),
    additions: [...additions.values()]
      .sort((a, b) => a.targetDay - b.targetDay || a.exerciseOrder - b.exerciseOrder)
      .map(({ targetDay: _d, exerciseOrder: _o, ...a }) => a),
    losses: [...losses.values()],
  };
};

// ---------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------

export type WeeklyReplanProposal = {
  adherence: WeekAdherence;
  timeCut: TimeCutPlan | null;
  redistribution: MissedRedistributionPlan | null;
  /** Há algo a propor ao aluno? (falta a resolver e/ou corte de tempo) */
  hasChanges: boolean;
};

/**
 * Replanejamento da semana por regras. PROPOSTA pura: nada aqui toca banco ou
 * estado — quem aplica é a camada de aplicação, e SÓ depois da confirmação do
 * aluno (recusa mantém o plano original).
 */
export const replanByRules = (params: {
  sessions: ReplanSession[];
  todayISO: string;
  currentSessionId: string;
  availableMinutes?: number | null;
  completedSetsBySession?: Record<string, number>;
  config?: ReplanConfig;
}): WeeklyReplanProposal => {
  const cfg = params.config ?? REPLAN_CONFIG;
  const adherence = computeAdherence({
    sessions: params.sessions,
    completedSetsBySession: params.completedSetsBySession ?? {},
    todayISO: params.todayISO,
  });
  const current = params.sessions.find((s) => s.id === params.currentSessionId) ?? null;
  const timeCut =
    current && params.availableMinutes != null
      ? planTimeCut({ session: current, availableMinutes: params.availableMinutes, config: cfg })
      : null;
  const redistribution = planMissedRedistribution({
    sessions: params.sessions,
    todayISO: params.todayISO,
    currentSessionId: params.currentSessionId,
    config: cfg,
  });
  return {
    adherence,
    timeCut,
    redistribution,
    hasChanges: timeCut != null || redistribution != null,
  };
};
