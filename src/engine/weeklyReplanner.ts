// src/engine/weeklyReplanner.ts
// Fase 6 — Replanejamento SEMANAL por regras. Puro (sem I/O).
//
// Dado o estado da semana (sessões planejadas × executadas), calcula:
//  - aderência (sessões e volume), sem inventar taxa quando não há base;
//  - escada de tempo para HOJE (~100%/66%/45%): corta acessórios antes de
//    secundários antes de primários — usa a prioridade da Fase 3.
//
// COMMIT B da escada de reencaixe (jul/2026): a redistribuição pós-falta saiu —
// a falta deixa de ser compensada e a semana fecha com menos volume (banner de
// Nível 2). O que resta é a PROPOSTA pura: quem aplica é a camada de aplicação,
// e SÓ depois da confirmação do aluno (recusa mantém o plano original).

import { normalizeName, type ExerciseMetric, type SessionDraft } from './sessionModel';
import { REPLAN_CONFIG, type ReplanConfig } from './config';

export type Priority = 'primary' | 'secondary' | 'accessory';
export type ReplanSessionStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type ReplanSetRef = {
  id: string;
  setOrder: number;
};

export type ReplanExercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  priority: Priority;
  exerciseOrder: number;
  sets: ReplanSetRef[];
  /** Como o exercício é medido (migration 0014). Plano anterior → ausente. */
  metric?: ExerciseMetric | null;
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
// Acesso a volume por grupo muscular (preservado para o COMMIT C)
// ---------------------------------------------------------------

type GroupVolume = {
  key: string; // grupo normalizado
  label: string; // como veio do plano
  totalSets: number; // séries do plano
};

/** Volume por grupo muscular de um conjunto de exercícios, na ordem de aparição. */
export const groupVolumes = (exercises: ReplanExercise[]): GroupVolume[] => {
  const byKey = new Map<string, GroupVolume>();
  const ordered = [...exercises].sort((a, b) => a.exerciseOrder - b.exerciseOrder);
  for (const ex of ordered) {
    const key = ex.muscleGroup == null ? null : normalizeName(ex.muscleGroup);
    const mapKey = key ?? '__sem_grupo__';
    let vol = byKey.get(mapKey);
    if (!vol) {
      vol = {
        key: mapKey,
        label: ex.muscleGroup ?? 'desconhecido',
        totalSets: 0,
      };
      byKey.set(mapKey, vol);
    }
    vol.totalSets += ex.sets.length;
  }
  return [...byKey.values()];
};

export const trainsGroup = (session: ReplanSession, groupKey: string): boolean =>
  session.exercises.some(
    (ex) => ex.muscleGroup != null && normalizeName(ex.muscleGroup) === groupKey,
  );

// ---------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------

export type WeeklyReplanProposal = {
  adherence: WeekAdherence;
  timeCut: TimeCutPlan | null;
  /** Há algo a propor ao aluno? (hoje: corte de tempo) */
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
  return {
    adherence,
    timeCut,
    hasChanges: timeCut != null,
  };
};

// ---------------------------------------------------------------
// Fingerprint canônico da proposta (ocultação de recusa idêntica)
// ---------------------------------------------------------------

/**
 * Hash determinístico do conteúdo VISÍVEL E APLICÁVEL da proposta.
 *
 * Hoje o conteúdo é o corte de tempo (quando há): sessão, minutos,
 * prioridades mantidas e exercícios cortados. Coleções são ordenadas
 * (canônicas) sem apagar multiplicidade. `requestedMinutes` fica fora quando
 * não há `timeCut`: sem corte, minutos não mudam o conteúdo visível.
 *
 * NÃO inclui: `adherence` (telemetria), `hasChanges` (derivado), `ratio`
 * (derivado de available/estimated), `requestedMinutes` (sem timeCut).
 */
export const replanFingerprint = (proposal: WeeklyReplanProposal): string => {
  const parts: string[] = [];

  if (proposal.timeCut) {
    const tc = proposal.timeCut;
    parts.push('tc');
    parts.push(tc.sessionId);
    parts.push(String(tc.availableMinutes));
    parts.push(String(tc.estimatedMinutes));
    parts.push([...tc.keptPriorities].sort().join(','));
    const cuts = [...tc.cutExercises]
      .sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))
      .map(
        (c) =>
          `${c.exerciseId}|${c.name}|${c.priority}|${c.muscleGroup ?? ''}|${c.setsCut}`,
      )
      .join(';');
    parts.push(cuts);
  }

  if (parts.length === 0) return 'no-changes';
  return parts.join('||');
};

// ---------------------------------------------------------------
// Aplicação ao RASCUNHO da sessão ativa (pura — chamada só após confirmação)
// ---------------------------------------------------------------

/**
 * Marca no rascunho os exercícios cortados pela escada de tempo. As séries já
 * concluídas ficam intactas (histórico não se reescreve); as pendentes desses
 * exercícios saem do caminho de conclusão (sessionProgress as ignora).
 */
export const applyTimeCutToDraft = (
  draft: SessionDraft,
  cutExerciseIds: string[],
): SessionDraft => {
  const cut = new Set(cutExerciseIds);
  return {
    ...draft,
    exercises: draft.exercises.map((ex) =>
      cut.has(ex.exerciseId) ? { ...ex, cutByReplan: true } : ex,
    ),
  };
};

// ---------------------------------------------------------------
// Snapshot do replanejamento (gravado em session_logs.adherence_snapshot)
// ---------------------------------------------------------------
// Decisão do dono (Fase 6): preservar o original SEM migration nova — a coluna
// jsonb adherence_snapshot foi reservada para a Fase 6 na 0001. A aplicação é
// ADITIVA (só grava o evento; nada é inserido nem revertido), então o evento
// abaixo basta para auditar o que foi confirmado. Eventos antigos com
// `redistribution` (COMMIT A) continuam parseando: o campo é histórico.

export type ReplanEvent = {
  confirmedAtISO: string;
  planId: string;
  weekNumber: number;
  adherence: WeekAdherence;
  timeCut: {
    sessionId: string;
    availableMinutes: number;
    estimatedMinutes: number;
    keptPriorities: Priority[];
    cutExercises: { exerciseId: string; name: string; setsCut: number }[];
  } | null;
};

export type ReplanSnapshot = { version: 1; events: ReplanEvent[] };

/** Leitura defensiva do jsonb: forma inesperada → null (nunca inventa eventos). */
export const parseReplanSnapshot = (value: unknown): ReplanSnapshot | null => {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as { version?: unknown; events?: unknown };
  if (v.version !== 1 || !Array.isArray(v.events)) return null;
  return {
    version: 1,
    events: v.events.filter(
      (e): e is ReplanEvent => typeof e === 'object' && e !== null,
    ),
  };
};

/** Último corte de tempo confirmado para uma sessão (para reaplicar na retomada). */
export const lastTimeCutForSession = (
  snapshot: ReplanSnapshot | null,
  plannedSessionId: string,
): ReplanEvent['timeCut'] | null => {
  const events = snapshot?.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const cut = events[i]?.timeCut;
    if (cut && cut.sessionId === plannedSessionId) return cut;
  }
  return null;
};
