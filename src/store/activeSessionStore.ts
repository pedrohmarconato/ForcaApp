// src/store/activeSessionStore.ts
// Fase 4 — Estado da sessão ATIVA (Zustand). Fino de propósito: guarda o rascunho,
// persiste no aparelho para retomada e delega I/O ao sessionExecutionRepository e
// o cálculo puro ao sessionModel. Regras que este store honra:
//  - erro do banco ao gravar uma série NÃO marca a série como feita (saveError);
//  - retomar (local ou pelo servidor) preserva as séries já registradas;
//  - a carga nunca é inventada (sugestão vem do plano/histórico ou null → pede).

import { create } from 'zustand';
import type { SessionDetail } from '../services/trainingRepository';
import {
  buildDraftFromDetail,
  computeOutcome,
  computeCardioOutcome,
  exerciseIdentity,
  isTimeBased,
  metricOf,
  suggestLoad,
  canCompleteSet,
  reconcileInjuryFlags,
  applyExerciseSkipToDraft,
  removeExerciseSkipFromDraft,
  nomesBloqueadosPorRecusa,
  type SessionDraft,
  type DraftExercise,
  type DraftSet,
  type PerceivedEffort,
  type SkipReason,
} from '../engine/sessionModel';
import {
  startSessionLog,
  saveSetLog,
  finishSessionLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  updateSetLogAdaptation,
  skipSessionExercise,
  unskipSessionExercise,
  skipPlannedSession,
  isTransportSessionExecutionError,
  SessionExecutionRequestError,
  type OpenSessionLog,
} from '../services/sessionExecutionRepository';
import {
  evaluateSet,
  recommendByRules,
  applyAdjustmentToNextSet,
  replayAdaptations,
  buildAdaptationDecision,
  type Recommendation,
  type Adjustment,
} from '../engine/intraSessionAdaptation';
import { effectiveMinutesForMood, type SessionMood } from '../engine/moodAdjustment';
import { localTodayISO, segundaDaSemanaDe } from '../engine/agendaDias';
import {
  replanByRules,
  applyTimeCutToDraft,
  appendAddedSetsToDraft,
  parseReplanSnapshot,
  lastTimeCutForSession,
  replanFingerprint,
  type WeeklyReplanProposal,
  type AddedSetRow,
} from '../engine/weeklyReplanner';
import { reancorarSemana, type SessaoParaReancorar } from '../engine/scheduleShift';
import { getAgendaDoAluno } from '../services/agendaRepository';
import { reagendarSessoesDaSemana, isPlanoDesatualizado } from '../services/planEditRepository';
import {
  getWeekReplanContext,
  applyConfirmedReplan,
  type WeekReplanContext,
} from '../services/weeklyReplanRepository';
import {
  saveDraft,
  loadDraft,
  clearDraft,
} from '../services/sessionDraftStorage';

type Status = 'idle' | 'loading' | 'awaiting_checkin' | 'active' | 'finished' | 'error';

// Adaptação pendente de decisão do aluno após concluir uma série fora do alvo (Fase 5).
// A UI observa este campo para abrir o bottom sheet; nada é aplicado sem confirmação.
export type PendingAdaptation = {
  exerciseId: string;
  setOrder: number;
  setLogId: string | null;
  // Sessão a que esta decisão pertence — resolveAdaptation só aplica ao rascunho se ainda
  // for esta sessão (defesa contra troca de sessão durante a decisão).
  sessionLogId: string | null;
  recommendation: Recommendation;
};

/** Plano de reencaixe de sessões pendentes. Armazenado para reaplicação sem I/O
 *  ao recalcular a proposta. */
export type Reagendamento = {
  movidas: { id: string; de: string | null; para: string }[];
  semEncaixe: string[];
};

// Replanejamento semanal pendente de decisão (Fase 6). A UI observa este campo
// para exibir o banner; a proposta é SÓ overlay em memória até o aluno confirmar
// — recusa mantém o plano original (nada é escrito).
export type PendingReplan = {
  // Sessão a que a proposta pertence (mesma defesa de troca de sessão da Fase 5).
  sessionLogId: string | null;
  /** Minutos informados no "menos tempo hoje" (null = tempo cheio). */
  requestedMinutes: number | null;
  /** Redistribuição recusada nesta visita — não voltar a propô-la ao recalcular. */
  redistributionDismissed: boolean;
  /** Plano de reencaixe (se houver sessões atrasadas). Reaplicado ao recalcular. */
  reagendamento: Reagendamento | null;
  context: WeekReplanContext;
  proposal: WeeklyReplanProposal;
};

interface ActiveSessionState {
  draft: SessionDraft | null;
  status: Status;
  saveError: string | null;
  /** Aviso não bloqueante de falha de armazenamento local (saveDraft rejeitou). */
  storageWarning: string | null;
  /** Aviso não bloqueante de falha de transporte no replanejamento. */
  replanWarning: string | null;
  pendingAdaptation: PendingAdaptation | null;
  pendingReplan: PendingReplan | null;
  replanBusy: boolean;
  /** Check-in pré-treino desta sessão (herdado do servidor na retomada). */
  sessionMood: SessionMood | null;
  /** Minutos informados no check-in (null = tempo cheio). */
  checkInMinutes: number | null;
  /** Sessão nova aguardando o check-in obrigatório (draft ainda sem session_log). */
  pendingCheckIn: { sessionId: string; draft: SessionDraft } | null;
  /** Última decisão AUTOMÁTICA de "manter" do motor (série fora do alvo, sem
   *  ajuste proposto). O player mostra o porquê — o motor nunca age em silêncio. */
  lastAutoDecision: { sessionLogId: string; exerciseName: string; reason: string } | null;

  startOrResume: (args: {
    sessionId: string;
    userId: string;
    detail: SessionDetail;
  }) => Promise<void>;
  confirmCheckIn: (answers: {
    mood: SessionMood;
    availableMinutes: number | null;
  }) => Promise<void>;
  computeReplan: (detail: SessionDetail) => Promise<void>;
  requestTimeCut: (minutes: number | null) => void;
  confirmReplan: () => Promise<boolean>;
  confirmReagendamento: () => Promise<boolean>;
  declineReplan: () => Promise<void>;
  clearStorageWarning: () => void;
  clearReplanWarning: () => void;
  activateSet: (exerciseId: string, setOrder: number) => void;
  setReps: (exerciseId: string, setOrder: number, reps: number | null) => void;
  setLoad: (exerciseId: string, setOrder: number, load: number | null) => void;
  stepLoad: (exerciseId: string, setOrder: number, direction: 1 | -1) => void;
  setRir: (exerciseId: string, setOrder: number, rir: number | null) => void;
  /** Cardio/isometria (0014): duração em segundos. */
  setDuration: (exerciseId: string, setOrder: number, seconds: number | null) => void;
  /** Cardio: distância em METROS (a UI coleta em km e converte). */
  setDistance: (exerciseId: string, setOrder: number, meters: number | null) => void;
  setEffort: (
    exerciseId: string,
    setOrder: number,
    effort: PerceivedEffort | null,
  ) => void;
  completeSet: (exerciseId: string, setOrder: number) => Promise<boolean>;
  resolveAdaptation: (adjustment: Adjustment) => Promise<void>;
  /**
   * Recusa declarada de um exercício (0020). Grava PRIMEIRO no servidor: uma
   * recusa que só existe na tela volta a ser exigida na próxima retomada.
   */
  skipExercise: (
    exerciseId: string,
    reason: SkipReason,
    note?: string | null,
  ) => Promise<boolean>;
  unskipExercise: (exerciseId: string) => Promise<boolean>;
  /** "Não vou treinar hoje": recusa a sessão inteira e encerra a tela. */
  skipWholeSession: (reason: SkipReason, note?: string | null) => Promise<boolean>;
  finishSession: () => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { message?: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return 'Erro inesperado ao falar com o servidor.';
};

// Trava de reentrância por série (duplo-toque/corrida). Fora do estado do Zustand
// para não disparar re-render: uma gravação por (log, planned_set) por vez (F2/F9).
// A chave inclui o sessionLogId para não colidir entre sessões distintas.
const inFlight = new Set<string>();

// Token monotônico de geração. sessionLogId sozinho não protege uma troca A -> B
// -> A (ABA), nem dois startOrResume concorrentes antes de qualquer log existir.
let operationEpoch = 0;

// Tempo máximo da RPC de gravação (F9): se a rede TRAVAR, a promessa precisa settle
// mesmo assim, senão o `finally` nunca roda e a trava prende a série para sempre.
// Exportado para o teste exercitar o limite sem esperar de verdade.
export const RPC_TIMEOUT_MS = 15000;

/**
 * Corre uma promessa contra um timeout. Se o limite vence, REJEITA (a série volta a
 * poder ser tentada) e SEMPRE limpa o timer no fim (sem handles pendurados). Garante
 * que o await de gravação settle para o `finally` liberar a trava de reentrância (F9).
 */
const withTimeout = <T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> => {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(
        new Error(
          'Tempo esgotado ao gravar a série. Verifique a conexão e tente de novo.',
        ),
      );
    }, ms);

    let pending: Promise<T>;
    try {
      pending = run(controller.signal);
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
      return;
    }

    pending.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
};

const isClosedSessionError = (error: unknown): boolean =>
  error instanceof SessionExecutionRequestError && error.code === 'P0001';

/** Substitui uma série (imutável) aplicando `fn(set, exercise)`. */
const withSet = (
  draft: SessionDraft,
  exerciseId: string,
  setOrder: number,
  fn: (set: DraftSet, exercise: DraftExercise) => DraftSet,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) =>
    ex.exerciseId !== exerciseId
      ? ex
      : {
          ...ex,
          sets: ex.sets.map((s) => (s.setOrder !== setOrder ? s : fn(s, ex))),
        },
  ),
});

const findSet = (
  draft: SessionDraft,
  exerciseId: string,
  setOrder: number,
): { exercise: DraftExercise; set: DraftSet } | null => {
  const exercise = draft.exercises.find((e) => e.exerciseId === exerciseId);
  const set = exercise?.sets.find((s) => s.setOrder === setOrder);
  if (!exercise || !set) return null;
  return { exercise, set };
};

/** Carga sugerida para uma série, dado o estado atual do rascunho. */
export const suggestionFor = (
  draft: SessionDraft,
  exercise: DraftExercise,
  set: DraftSet,
): number | null => {
  if (exercise.isBodyweight) return null;
  return suggestLoad({
    actualLoadKg: set.actualLoadKg,
    targetLoadKg: set.targetLoadKg,
    lastLoad: draft.lastLoadByExercise[exerciseIdentity(exercise)],
  });
};

/** Semente de última carga por exercício (best-effort; falha não derruba o início). */
const seedLastLoads = async (
  detail: SessionDetail,
): Promise<Record<string, number>> => {
  try {
    const identidades = (detail.planned_exercises ?? []).map((e) =>
      exerciseIdentity({ exerciseKey: e.exercise_key ?? null, name: e.name }),
    );
    return await getLastLoadByExercise(identidades);
  } catch (e) {
    console.warn(
      '[activeSession] não foi possível semear cargas do histórico:',
      e,
    );
    return {};
  }
};

/**
 * Aposenta o cache local de uma execução que o servidor já encerrou.
 *
 * O tombstone vem ANTES da remoção: se `removeItem` falhar, uma retomada offline
 * encontra `status='finished'`, não o último rascunho ativo. As duas operações
 * continuam best-effort — uma falha total do armazenamento não pode desfazer a
 * decisão já confirmada pelo servidor.
 */
const retireLocalDraft = async (draft: SessionDraft): Promise<void> => {
  try {
    await saveDraft({ ...draft, status: 'finished' });
  } catch (e) {
    console.warn('[activeSession] tombstone do rascunho não persistido (não-fatal):', e);
  }
  try {
    await clearDraft(draft.userId, draft.plannedSessionId, draft.sessionLogId);
  } catch (e) {
    console.warn('[activeSession] rascunho não removido (não-fatal):', e);
  }
};

/** Reaplica no rascunho as séries já gravadas no servidor (retomada). */
const applyServerSetLogs = (
  draft: SessionDraft,
  aberta: OpenSessionLog,
  local?: SessionDraft | null,
): SessionDraft => {
  const porPlannedSet = new Map(
    aberta.setLogs.map((sl) => [sl.planned_set_id, sl]),
  );
  // Adaptações do rascunho local por planned_set: preenchem a lacuna quando a gravação
  // best-effort no servidor ainda não chegou (evita perder a decisão já aplicada localmente).
  const localAdapt = new Map<string, DraftSet['adaptation']>();
  for (const ex of local?.exercises ?? []) {
    for (const s of ex.sets) {
      if (s.adaptation) localAdapt.set(s.plannedSetId, s.adaptation);
    }
  }
  const lastLoad = { ...draft.lastLoadByExercise };
  const latestFromOpenLog = new Map<
    string,
    { load: number; completedAt: string }
  >();
  const exercises = draft.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => {
      const sl = porPlannedSet.get(s.plannedSetId);
      if (!sl) return s;
      if (sl.actual_load_kg != null && !ex.isBodyweight) {
        const key = exerciseIdentity(ex);
        const previous = latestFromOpenLog.get(key);
        if (
          !previous ||
          String(sl.completed_at).localeCompare(previous.completedAt) > 0
        ) {
          latestFromOpenLog.set(key, {
            load: sl.actual_load_kg,
            completedAt: String(sl.completed_at),
          });
        }
      }
      return {
        ...s,
        status: 'done' as const,
        setLogId: sl.id,
        actualReps: sl.actual_reps,
        actualLoadKg: sl.actual_load_kg,
        actualRir: sl.actual_rir,
        // Cardio/isometria (0014): sem restaurar isto, retomar a sessão apagava
        // a medição — a série voltava "feita" mas sem tempo, distância nem pace.
        actualDurationSeconds: sl.actual_duration_seconds ?? null,
        actualDistanceM: sl.actual_distance_m ?? null,
        perceivedEffort: sl.perceived_effort ?? null,
        outcome: sl.outcome,
        // Restaura a decisão de adaptação: servidor é autoritativo; se ele ainda não a tem
        // (gravação best-effort pendente), usa a do rascunho local.
        adaptation: sl.adaptation ?? localAdapt.get(s.plannedSetId) ?? null,
      };
    }),
  }));
  // O seed global já vem em completed_at DESC e pode conter uma sessão mais nova.
  // O log aberto só completa lacunas; nunca o sobrescreve pela ordem do plano.
  for (const [key, value] of latestFromOpenLog) {
    if (!(key in lastLoad)) lastLoad[key] = value.load;
  }
  // Reaplica os efeitos das adaptações restauradas às próximas séries pendentes (retomada).
  const reaplicado = replayAdaptations({
    ...draft,
    sessionLogId: aberta.sessionLogId,
    startedAt: aberta.startedAt,
    exercises,
    lastLoadByExercise: lastLoad,
  });
  // Fase 6: um corte de tempo CONFIRMADO fica no snapshot do log — a retomada
  // (local ou reconstruída) reaplica o corte; sem evento, nada muda.
  const corte = lastTimeCutForSession(
    parseReplanSnapshot(aberta.adherenceSnapshot),
    draft.plannedSessionId,
  );
  const comCorte = corte
    ? applyTimeCutToDraft(reaplicado, corte.cutExercises.map((c) => c.exerciseId))
    : reaplicado;

  // Recusas declaradas (0020) vêm do SERVIDOR e são reaplicadas aqui — o único
  // ponto por onde as duas retomadas passam. Aplicá-las em cada chamador
  // deixaria um dos caminhos para trás, e o exercício recusado voltaria a ser
  // exigido só em um deles (a diferença mais difícil de notar em teste manual).
  // `?? []` não é decoração: o campo é novo, e um OpenSessionLog vindo de
  // versão anterior do repositório (ou de um mock) faria a retomada INTEIRA
  // estourar num reduce de undefined — o treino não abriria.
  const comRecusas = (aberta.exerciseSkips ?? []).reduce(
    (acc, skip) =>
      applyExerciseSkipToDraft(acc, skip.plannedExerciseId, skip.reason, skip.note),
    comCorte,
  );
  // Fingerprints de propostas recusadas são memória LOCAL do aparelho (nunca do
  // servidor): na reconstrução a partir do servidor, eles vêm do rascunho local.
  return {
    ...comRecusas,
    declinedReplanFingerprints:
      local?.declinedReplanFingerprints ?? draft.declinedReplanFingerprints ?? [],
  };
};

/**
 * Validação estrutural do contexto de replanejamento antes do consumo.
 * Payload malformado NÃO é tratado como offline — é diagnosticado separadamente
 * para nunca mascarar um bug estrutural como "sem conexão" nem vazar bruto à UI.
 */
class ReplanContextStructureError extends Error {
  constructor(reason: string) {
    super(`[replan] contexto estrutural inválido: ${reason}`);
    this.name = 'ReplanContextStructureError';
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const requireString = (value: unknown, path: string, nullable = false): void => {
  if ((nullable && value === null) || typeof value === 'string') return;
  throw new ReplanContextStructureError(`${path} deve ser ${nullable ? 'string|null' : 'string'}`);
};
const requireFiniteNumber = (value: unknown, path: string, nullable = false): void => {
  if ((nullable && value === null) || (typeof value === 'number' && Number.isFinite(value))) return;
  throw new ReplanContextStructureError(`${path} deve ser ${nullable ? 'número|null' : 'número'}`);
};
const assertValidReplanContext: (ctx: unknown) => asserts ctx is WeekReplanContext = (ctx) => {
  if (!isRecord(ctx)) throw new ReplanContextStructureError('contexto não é objeto');
  if (!Array.isArray(ctx.sessions)) throw new ReplanContextStructureError('sessions não é array');
  if (!isRecord(ctx.completedSetsBySession)) throw new ReplanContextStructureError('completedSetsBySession não é objeto');
  requireString(ctx.userId, 'userId'); requireString(ctx.planId, 'planId'); requireFiniteNumber(ctx.weekNumber, 'weekNumber');
  for (const [sessionId, completed] of Object.entries(ctx.completedSetsBySession)) requireFiniteNumber(completed, `completedSetsBySession.${sessionId}`);
  for (const [sessionIndex, session] of ctx.sessions.entries()) {
    const sessionPath = `sessions[${sessionIndex}]`;
    if (!isRecord(session)) throw new ReplanContextStructureError(`${sessionPath} não é objeto`);
    requireString(session.id, `${sessionPath}.id`); requireFiniteNumber(session.weekNumber, `${sessionPath}.weekNumber`); requireString(session.title, `${sessionPath}.title`);
    requireString(session.sessionType, `${sessionPath}.sessionType`, true); requireString(session.scheduledDate, `${sessionPath}.scheduledDate`, true);
    if (!['pending', 'in_progress', 'completed', 'skipped'].includes(String(session.status))) throw new ReplanContextStructureError(`${sessionPath}.status é inválido`);
    requireFiniteNumber(session.estimatedMinutes, `${sessionPath}.estimatedMinutes`, true);
    if (!Array.isArray(session.exercises)) throw new ReplanContextStructureError(`${sessionPath}.exercises não é array`);
    for (const [exerciseIndex, exercise] of session.exercises.entries()) {
      const exercisePath = `${sessionPath}.exercises[${exerciseIndex}]`;
      if (!isRecord(exercise)) throw new ReplanContextStructureError(`${exercisePath} não é objeto`);
      requireString(exercise.id, `${exercisePath}.id`); requireString(exercise.name, `${exercisePath}.name`); requireString(exercise.muscleGroup, `${exercisePath}.muscleGroup`, true);
      if (!['primary', 'secondary', 'accessory'].includes(String(exercise.priority))) throw new ReplanContextStructureError(`${exercisePath}.priority é inválida`);
      requireFiniteNumber(exercise.exerciseOrder, `${exercisePath}.exerciseOrder`);
      if (!Array.isArray(exercise.sets)) throw new ReplanContextStructureError(`${exercisePath}.sets não é array`);
      for (const [setIndex, plannedSet] of exercise.sets.entries()) {
        const setPath = `${exercisePath}.sets[${setIndex}]`;
        if (!isRecord(plannedSet)) throw new ReplanContextStructureError(`${setPath} não é objeto`);
        requireString(plannedSet.id, `${setPath}.id`); requireFiniteNumber(plannedSet.setOrder, `${setPath}.setOrder`);
        if (plannedSet.addedByReplan !== undefined && typeof plannedSet.addedByReplan !== 'boolean') throw new ReplanContextStructureError(`${setPath}.addedByReplan deve ser boolean`);
      }
    }
  }
};

/** Mensagem amigável para falha de transporte no replanejamento. */
const REPLAN_TRANSPORT_MSG =
  'Não foi possível verificar o replanejamento da semana. Verifique a conexão.';
const REPLAN_STRUCTURE_MSG =
  'Os dados do replanejamento vieram em um formato inválido. O treino segue normalmente.';
const isReplanTransportError = (error: unknown): boolean => {
  if (isTransportSessionExecutionError(error)) return true;
  if (!isRecord(error) && !(error instanceof Error)) return false;
  const name = typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : '';
  if (name === 'AbortError') return true;
  const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
  if ((error instanceof TypeError || name === 'TypeError' || name === 'ReplanApplyError') && /(?:^TypeError:\s*)?(?:failed to fetch|network request failed|network error|load failed)/i.test(message)) return true;
  const cause = (error as { cause?: unknown }).cause;
  return cause !== undefined && cause !== error && isReplanTransportError(cause);
};

/** Mensagem amigável (não bloqueante) de falha ao persistir o rascunho local. */
const STORAGE_WARNING_MSG =
  'Não foi possível salvar localmente. Seu treino continua, mas pode não retomar se o app fechar.';

export const useActiveSessionStore = create<ActiveSessionState>((set, get) => ({
  draft: null,
  status: 'idle',
  saveError: null,
  storageWarning: null,
  replanWarning: null,
  pendingAdaptation: null,
  pendingReplan: null,
  replanBusy: false,
  sessionMood: null,
  checkInMinutes: null,
  pendingCheckIn: null,
  lastAutoDecision: null,

  startOrResume: async ({ sessionId, userId, detail }) => {
    const epoch = ++operationEpoch;
    const isCurrent = () => operationEpoch === epoch;
    set({ status: 'loading', saveError: null });
    try {
      // 1. Rascunho local do MESMO treino ainda ativo → RECONCILIA com o servidor
      // antes de adotar (F3/F6): o SERVIDOR é autoritativo. Não gravamos série em log
      // finalizado, e não adotamos o rascunho local CRU (pode ter série "feita" que
      // nunca persistiu, ou carga obsoleta).
      const local0 = await loadDraft(userId, sessionId);
      if (!isCurrent()) return;
      // Reconcilia o flag de lesão contra o SessionDetail autoritativo antes de qualquer
      // uso: um rascunho anterior à Fase 5 não tem `hasInjury` e adotá-lo cru desligaria
      // silenciosamente o guardrail de lesão (HIGH do review).
      const local = local0 ? reconcileInjuryFlags(local0, detail) : null;
      // Uma rota antiga/deep link não pode reabrir implicitamente uma sessão que
      // o servidor já marcou como concluída ou recusada. Desfazer recusa é uma RPC
      // explícita; `start_session` não é atalho para essa transição.
      if (detail.status === 'completed' || detail.status === 'skipped') {
        set({
          draft: null,
          status: 'finished',
          pendingCheckIn: null,
          pendingReplan: null,
          pendingAdaptation: null,
        });
        if (local) await retireLocalDraft(local);
        return;
      }
      if (
        local &&
        local.plannedSessionId === sessionId &&
        local.status === 'active'
      ) {
        // O try/catch envolve SÓ a chamada remota — para classificar o erro dela e não
        // engolir uma falha estruturada como se fosse "offline".
        let aberta: OpenSessionLog | null;
        try {
          aberta = await getOpenSessionLog(userId, sessionId);
        } catch (e) {
          if (!isCurrent()) return;
          if (!isTransportSessionExecutionError(e)) throw e;
          // Somente falha de transporte NORMALIZADA na fronteira do Supabase autoriza
          // retomada offline. 401/403/5xx sem `.code` continuam sendo erro.
          console.warn(
            '[activeSession] sem rede para reconciliar; retomando local:',
            e,
          );
          set({ draft: local, status: 'active' });
          return;
        }
        if (!isCurrent()) return;

        if (!aberta) {
          // Servidor PROVOU que a sessão foi finalizada. A decisão de estado vem ANTES
          // de limpar: clearDraft é best-effort e NÃO pode ressuscitar um draft já
          // provado finalizado (senão gravaríamos em log fechado — F6).
          set({ draft: null, status: 'finished' });
          await retireLocalDraft(local);
          return;
        }

        // Há log aberto (mesmo id ou não) → reconstrói do SERVIDOR (autoritativo),
        // nunca adota o local cru.
        const seed = await seedLastLoads(detail);
        if (!isCurrent()) return;
        const draftServidor = applyServerSetLogs(
          buildDraftFromDetail(detail, userId, seed),
          aberta,
          local, // preserva adaptações locais ainda não confirmadas no servidor
        );
        set({
          draft: draftServidor,
          status: 'active',
          sessionMood: aberta.mood,
          checkInMinutes: aberta.availableMinutes,
        });
        try {
          await saveDraft(draftServidor);
        } catch (e) {
          console.warn(
            '[activeSession] rascunho não persistido (não-fatal):',
            e,
          );
          set({ storageWarning: STORAGE_WARNING_MSG });
        }
        return;
      }

      // 2. Sem rascunho local (ou de outra sessão): reconstroi do servidor.
      const seed = await seedLastLoads(detail);
      if (!isCurrent()) return;
      let draft = buildDraftFromDetail(detail, userId, seed);

      // Já existe execução em aberto desta sessão? Retoma-a (não duplica session_log).
      const aberta = await getOpenSessionLog(userId, sessionId);
      if (!isCurrent()) return;
      if (!aberta) {
        // Sessão NOVA: o check-in (humor + tempo) é obrigatório ANTES de criar
        // o session_log — as respostas viajam no próprio start_session.
        set({ status: 'awaiting_checkin', pendingCheckIn: { sessionId, draft } });
        return;
      }

      draft = applyServerSetLogs(draft, aberta);
      set({
        draft,
        status: 'active',
        sessionMood: aberta.mood,
        checkInMinutes: aberta.availableMinutes,
      });
      // Sessão já criada/retomada no servidor (verdade). Persistência local é secundária:
      // falhar aqui NÃO derruba o início para 'error' (mesma filosofia do completeSet).
      try {
        await saveDraft(draft);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        set({ storageWarning: STORAGE_WARNING_MSG });
      }
    } catch (e) {
      if (isCurrent()) set({ status: 'error', saveError: errMsg(e) });
    }
  },

  confirmCheckIn: async ({ mood, availableMinutes }) => {
    const pending = get().pendingCheckIn;
    if (!pending || get().status !== 'awaiting_checkin') return;
    const epoch = operationEpoch;
    set({ status: 'loading' });
    try {
      const { sessionLogId, startedAt } = await startSessionLog(pending.sessionId, {
        mood,
        availableMinutes,
      });
      if (operationEpoch !== epoch) return;
      const draft = { ...pending.draft, sessionLogId, startedAt };
      set({
        draft,
        status: 'active',
        sessionMood: mood,
        checkInMinutes: availableMinutes,
        pendingCheckIn: null,
      });
      // Mesma filosofia do startOrResume: persistência local é secundária.
      try {
        await saveDraft(draft);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        set({ storageWarning: STORAGE_WARNING_MSG });
      }
    } catch (e) {
      if (operationEpoch === epoch) set({ status: 'error', saveError: errMsg(e) });
    }
  },

  // -------------------------------------------------------------
  // Fase 6 — replanejamento semanal (proposta → confirmação → aplicação)
  // -------------------------------------------------------------

  computeReplan: async (detail) => {
    // Best-effort: falhar aqui NUNCA derruba a sessão (o treino segue sem banner).
    const draft = get().draft;
    if (!draft || get().status !== 'active') return;
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    try {
      const context = await getWeekReplanContext(
        draft.userId,
        detail.plan_id,
        detail.week_number,
      );
      if (operationEpoch !== epoch) return;

      // Validação estrutural ANTES do consumo: payload malformado é bug, não offline.
      assertValidReplanContext(context);

      const atual = get().draft;
      if (!atual || atual.sessionLogId !== sid) return;
      const sessaoDeHoje =
        context.sessions.find((sess) => sess.id === atual.plannedSessionId) ?? null;
      const minutosEfetivos = effectiveMinutesForMood({
        mood: get().sessionMood,
        availableMinutes: get().checkInMinutes,
        estimatedMinutes: sessaoDeHoje?.estimatedMinutes ?? null,
      });
      let proposal = replanByRules({
        sessions: context.sessions,
        todayISO: localTodayISO(),
        currentSessionId: atual.plannedSessionId,
        availableMinutes: minutosEfetivos,
        completedSetsBySession: context.completedSetsBySession,
        blockedExerciseNames: nomesBloqueadosPorRecusa(atual),
      });

      // Calcula o reencaixe (best-effort: falha não derruba a proposta).
      // Se houver reencaixe possível, suprime o pulo da proposta.
      let reagendamento: Reagendamento | null = null;
      try {
        const agenda = await getAgendaDoAluno({
          userId: draft.userId,
          planId: detail.plan_id,
        });

        if (agenda.agenda.length > 0) {
          const hojeISO = localTodayISO();
          // Calcula a segunda-feira da semana com base na sessão da proposta.
          // Busca a data mais antiga das sessões do contexto para âncora.
          const menorData = context.sessions.reduce((acc, sess) => {
            if (sess.scheduledDate && (!acc || sess.scheduledDate < acc)) {
              return sess.scheduledDate;
            }
            return acc;
          }, null as string | null);

          const segundaISO = menorData ? segundaDaSemanaDe(menorData) : null;
          if (segundaISO) {
            // Monta mapa id → order_in_week a partir das linhas cruas do banco.
            // Não usamos indexOf(sess) porque a ordem do array pode ser arbitrária
            // (getWeekReplanContext não ordena o select); order_in_week é a verdade.
            const orderInWeekMap = new Map<string, number>();
            for (const rawSess of context.raw) {
              const orderInWeek = rawSess.order_in_week;
              if (typeof orderInWeek === 'number') {
                orderInWeekMap.set(rawSess.id, orderInWeek);
              }
            }

            // Monta o array de sessões para reancoragem
            const sessoesPendentes: SessaoParaReancorar[] = context.sessions.map((sess) => ({
              id: sess.id,
              status: sess.status as 'pending' | 'in_progress' | 'completed' | 'skipped',
              scheduledDate: sess.scheduledDate,
              orderInWeek: orderInWeekMap.get(sess.id) ?? 0,
            }));

            const plano = reancorarSemana({
              sessoes: sessoesPendentes,
              hojeISO,
              agenda: agenda.agenda,
              segundaDaSemanaISO: segundaISO,
            });

            // Se houver movidas, armazena o plano para exibição.
            // A supressão da redistribuição é INDEPENDENTE: só suprime se existe
            // redistribution originalmente (há pulo a ser oferecido).
            if (plano.movidas.length > 0) {
              reagendamento = {
                movidas: plano.movidas,
                semEncaixe: plano.semEncaixe,
              };
            }

            // Suprime o pulo quando há reencaixe: confirmReplan não aplicará
            // redistribution, logo nenhuma sessão será marcada como skipped.
            // Se houvesse skipped sem redistribution, o servidor rejeitaria.
            if (plano.movidas.length > 0 && proposal.redistribution) {
              proposal = {
                ...proposal,
                redistribution: null,
                hasChanges: proposal.timeCut != null,
              };
            }
          }
        }
      } catch (reanchorError) {
        // Reencaixe falhou (I/O): proposta segue como estava (com pulo, se houve).
        // O treino nunca é travado por falha de reencaixe; a feature é degradável.
        console.warn('[replan] reencaixe falhou (não-fatal):', reanchorError);
      }

      // Oculta proposta cujo fingerprint foi recusado nesta sessão.
      const declined = atual.declinedReplanFingerprints ?? [];
      if (proposal.hasChanges && declined.includes(replanFingerprint(proposal))) {
        proposal = { ...proposal, hasChanges: false };
      }

      set({
        pendingReplan: {
          sessionLogId: sid,
          requestedMinutes: get().checkInMinutes,
          redistributionDismissed: false,
          reagendamento,
          context,
          proposal,
        },
      });
    } catch (e) {
      if (operationEpoch !== epoch) return;
      if (e instanceof ReplanContextStructureError) {
        console.warn(e.message);
        set({ replanWarning: REPLAN_STRUCTURE_MSG });
      } else if (isReplanTransportError(e)) {
        // Transporte: aviso amigável não bloqueante, sem stack.
        set({ replanWarning: REPLAN_TRANSPORT_MSG });
      } else {
        // Erro estrutural/inesperado: diagnosticado no console, aviso genérico à UI.
        console.warn('[replan] erro não classificado como transporte:', e);
        set({ replanWarning: REPLAN_STRUCTURE_MSG });
      }
    }
  },

  requestTimeCut: (minutes) => {
    const pr = get().pendingReplan;
    const draft = get().draft;
    if (!pr || !draft) return;
    const sessaoDeHoje =
      pr.context.sessions.find((sess) => sess.id === draft.plannedSessionId) ?? null;
    const minutosEfetivos = effectiveMinutesForMood({
      mood: get().sessionMood,
      availableMinutes: minutes,
      estimatedMinutes: sessaoDeHoje?.estimatedMinutes ?? null,
    });
    let proposal = replanByRules({
      sessions: pr.context.sessions,
      todayISO: localTodayISO(),
      currentSessionId: draft.plannedSessionId,
      availableMinutes: minutosEfetivos,
      completedSetsBySession: pr.context.completedSetsBySession,
      blockedExerciseNames: nomesBloqueadosPorRecusa(draft),
    });
    // Redistribuição já recusada nesta visita não volta pela porta do recálculo.
    if (pr.redistributionDismissed) {
      proposal = { ...proposal, redistribution: null, hasChanges: proposal.timeCut != null };
    }
    // Reencaixe já calculado: reaplicar a supressão sem novo I/O. Se o aluno pedir
    // menos tempo DEPOIS do reencaixe, a redistribution continua suprimida.
    if (pr.reagendamento && pr.reagendamento.movidas.length > 0) {
      proposal = { ...proposal, redistribution: null, hasChanges: proposal.timeCut != null };
    }
    // Oculta proposta cujo fingerprint foi recusado nesta sessão.
    const declined = draft.declinedReplanFingerprints ?? [];
    if (proposal.hasChanges && declined.includes(replanFingerprint(proposal))) {
      proposal = { ...proposal, hasChanges: false };
    }
    set({ pendingReplan: { ...pr, requestedMinutes: minutes, proposal } });
  },

  confirmReplan: async () => {
    // Reentrância (duplo-toque/corrida): uma aplicação por vez. A checagem e o
    // set são síncronos no mesmo tick — a 2ª chamada é recusada, nunca duplica
    // o INSERT no servidor (achado nº 2 do review).
    if (get().replanBusy) return false;
    const pr = get().pendingReplan;
    if (!pr || !pr.proposal.hasChanges) return true;
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente. Reabra o treino.' });
      return false;
    }
    // Proposta calculada para OUTRA sessão (troca sem passar pela tela) não é
    // aplicável — descarta em vez de escrever no lugar errado.
    if (pr.sessionLogId !== draft.sessionLogId) {
      set({ pendingReplan: null });
      return false;
    }
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    set({ replanBusy: true });
    try {
      const { addedSets } = await applyConfirmedReplan({
        context: pr.context,
        proposal: pr.proposal,
        sessionLogId: sid,
        confirmedAtISO: new Date().toISOString(),
      });
      // CAS (mesma defesa do completeSet): aplicado no servidor; se o usuário
      // trocou de sessão durante o await, não mexemos no rascunho da outra.
      const atual = get().draft;
      if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid) return true;
      let novo = atual;
      if (pr.proposal.timeCut) {
        novo = applyTimeCutToDraft(
          novo,
          pr.proposal.timeCut.cutExercises.map((c) => c.exerciseId),
        );
      }
      const daSessaoAtual = addedSets.filter((r) => r.sessionId === atual.plannedSessionId);
      if (daSessaoAtual.length > 0) novo = appendAddedSetsToDraft(novo, daSessaoAtual);
      set({ draft: novo, pendingReplan: null, saveError: null });
      try {
        await saveDraft(novo);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        set({ storageWarning: STORAGE_WARNING_MSG });
      }
      return true;
    } catch (e) {
      if (operationEpoch !== epoch || get().draft?.sessionLogId !== sid) return false;
      // Duck-type (o repositório é mockado nos testes): replanApplied=true significa
      // que séries+snapshot JÁ persistiram e só o skip falhou.
      const failure = e as {
        replanApplied?: boolean;
        addedSets?: AddedSetRow[];
        stage?: string;
        cause?: { code?: string };
      };
      // Conflito de unicidade no INSERT = OUTRO aparelho aplicou este replan
      // primeiro (backstop do índice único da migration 0007). Nada desta
      // tentativa persistiu, mas a proposta está obsoleta — reaplicá-la
      // falharia para sempre; o caminho certo é recalcular do servidor.
      const insertConflict = failure?.stage === 'insert' && failure?.cause?.code === '23505';
      if (failure?.replanApplied !== true && !insertConflict) {
        // Nada foi aplicado (insert/snapshot falharam com rollback): a proposta
        // fica de pé para tentar de novo; o erro aparece, nunca é engolido.
        const msg = isReplanTransportError(e)
          ? 'Sem conexão para confirmar o replanejamento. Toque para tentar de novo.'
          : errMsg(e);
        set({ saveError: msg });
        return false;
      }
      if (insertConflict) {
        // Rascunho intacto (nem corte nem séries persistiram por aqui); só
        // descarta a proposta obsoleta — o recálculo abaixo traz o estado do
        // servidor, que já contém o replan do outro aparelho.
        set({
          pendingReplan: null,
          saveError: 'Replanejamento já aplicado em outro aparelho. Proposta atualizada.',
        });
      } else {
        // Aplicado em parte (só o skip falhou). Reaplicar a MESMA proposta
        // re-inseriria as séries (achado nº 2): reflete o que persistiu no
        // rascunho, DESCARTA a proposta obsoleta e recalcula do servidor — o
        // snapshot já registra os adds, então a nova proposta respeita o teto e
        // só re-propõe o skip pendente.
        const atual = get().draft;
        if (atual && atual.sessionLogId === sid) {
          let novo = atual;
          if (pr.proposal.timeCut) {
            novo = applyTimeCutToDraft(
              novo,
              pr.proposal.timeCut.cutExercises.map((c) => c.exerciseId),
            );
          }
          const daSessaoAtual = (failure.addedSets ?? []).filter(
            (r) => r.sessionId === atual.plannedSessionId,
          );
          if (daSessaoAtual.length > 0) novo = appendAddedSetsToDraft(novo, daSessaoAtual);
          set({ draft: novo, pendingReplan: null, saveError: isReplanTransportError(e) ? 'Sem conexão para confirmar o replanejamento. Toque para tentar de novo.' : errMsg(e) });
          try {
            await saveDraft(novo);
          } catch (storageError) {
            console.warn('[activeSession] rascunho não persistido (não-fatal):', storageError);
            set({ storageWarning: STORAGE_WARNING_MSG });
          }
        } else {
          set({ pendingReplan: null, saveError: isReplanTransportError(e) ? 'Sem conexão para confirmar o replanejamento. Toque para tentar de novo.' : errMsg(e) });
        }
      }
      // Recálculo do servidor (comum ao conflito e ao skip falho): a nova
      // proposta parte do estado autoritativo — adds anteriores contam no teto,
      // sessão já pulada não é re-proposta.
      try {
        const refreshed = await getWeekReplanContext(
          pr.context.userId,
          pr.context.planId,
          pr.context.weekNumber,
        );
        const depois = get().draft;
        if (operationEpoch === epoch && depois && depois.sessionLogId === sid) {
          const proposal = replanByRules({
            sessions: refreshed.sessions,
            todayISO: localTodayISO(),
            currentSessionId: depois.plannedSessionId,
            availableMinutes: null,
            completedSetsBySession: refreshed.completedSetsBySession,
          });
          set({
            pendingReplan: {
              sessionLogId: sid,
              requestedMinutes: null,
              redistributionDismissed: false,
              reagendamento: null,
              context: refreshed,
              proposal,
            },
          });
        }
      } catch (refreshError) {
        // Sem recálculo o banner some; a próxima abertura da sessão recalcula.
        console.warn('[activeSession] replanejamento não recalculado (não-fatal):', refreshError);
      }
      return false;
    } finally {
      set({ replanBusy: false });
    }
  },

  declineReplan: async () => {
    const pr = get().pendingReplan;
    if (!pr) return;
    // Fingerprint canônico da proposta recusada: oculta somente a idêntica.
    const fp = replanFingerprint(pr.proposal);
    // Recusa = NADA é escrito no servidor; o plano original segue valendo.
    const draft = get().draft;
    const declinedFps = draft ? [...(draft.declinedReplanFingerprints ?? []), fp] : [fp];
    const draftComFp = draft ? { ...draft, declinedReplanFingerprints: declinedFps } : null;
    set({
      ...(draftComFp ? { draft: draftComFp } : {}),
      pendingReplan: {
        ...pr,
        requestedMinutes: null,
        redistributionDismissed:
          pr.redistributionDismissed || pr.proposal.redistribution != null,
        proposal: {
          ...pr.proposal,
          timeCut: null,
          redistribution: null,
          hasChanges: false,
        },
      },
    });
    // Persiste o fingerprint no draft para que a proposta idêntica fique oculta
    // após remount. Falha de armazenamento: a recusa vale na montagem atual, mas
    // não é garantida após remount — aviso não bloqueante.
    if (draftComFp) {
      try {
        await saveDraft(draftComFp);
      } catch (e) {
        console.warn('[activeSession] fingerprint de recusa não persistido (não-fatal):', e);
        set({
          storageWarning:
            'Não foi possível salvar sua recusa localmente. Ela vale agora, mas pode reaparecer se o app fechar.',
        });
      }
    }
  },

  confirmReagendamento: async () => {
    // Reentrância (duplo-toque/corrida): guarda de mesma forma que confirmReplan.
    if (get().replanBusy) return false;
    const pr = get().pendingReplan;
    if (!pr || !pr.reagendamento || pr.reagendamento.movidas.length === 0) return true;
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente. Reabra o treino.' });
      return false;
    }
    // Proposta calculada para OUTRA sessão (troca sem passar pela tela) não é
    // aplicável — descarta em vez de escrever no lugar errado.
    if (pr.sessionLogId !== draft.sessionLogId) {
      set({ pendingReplan: null });
      return false;
    }
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    set({ replanBusy: true });
    try {
      await reagendarSessoesDaSemana({
        planId: pr.context.planId,
        weekNumber: pr.context.weekNumber,
        atribuicoes: pr.reagendamento.movidas.map((m) => ({
          sessionId: m.id,
          scheduledDate: m.para,
        })),
      });
      // CAS: aplicado no servidor; se o usuário trocou de sessão durante o await,
      // não mexemos no rascunho da outra.
      const atual = get().draft;
      if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid) return true;
      // Sessão está in_progress — o motor nunca move sessão não pendente.
      // Logo não há nada a reconciliar no rascunho. Limpa o banner.
      set({ pendingReplan: null, saveError: null });
      return true;
    } catch (e) {
      if (operationEpoch !== epoch || get().draft?.sessionLogId !== sid) return false;
      // 40001/55000/42501: o plano mudou fora desta tela (outro aparelho, outra
      // aba). A proposta em mãos está obsoleta — descarta em vez de deixar o
      // aluno tocar de novo num reencaixe que o servidor vai recusar igual.
      if (isPlanoDesatualizado(e)) {
        set({
          pendingReplan: null,
          saveError: 'Seu plano mudou em outro lugar. Reabra o treino para ver a agenda atualizada.',
        });
        return false;
      }
      // Erro de chamada (lista vazia, IDs inválidos, etc.) ou de transporte.
      const msg = e instanceof Error ? e.message : 'Erro ao reagendar as sessões.';
      const amigável =
        msg.includes('lista vazia') || msg.includes('vazio') ? msg :
        isReplanTransportError(e)
          ? 'Sem conexão para confirmar o reagendamento. Toque para tentar de novo.'
          : msg;
      set({ saveError: amigável });
      return false;
    } finally {
      set({ replanBusy: false });
    }
  },

  activateSet: (exerciseId, setOrder) => {
    const draft = get().draft;
    if (!draft) return;
    // Só revela os inputs. NÃO pré-preenche a carga: a sugestão vira valor informado
    // apenas quando o aluno digita ou toca "usar sugestão" (F10: sugestão ≠ medição).
    const agora = new Date().toISOString();
    const novo = withSet(draft, exerciseId, setOrder, (s) =>
      s.status !== 'pending'
        ? s
        : { ...s, status: 'active', activatedAt: s.activatedAt ?? agora },
    );
    set({ draft: novo });
  },

  setReps: (exerciseId, setOrder, reps) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualReps: reps,
      })),
    });
  },

  setLoad: (exerciseId, setOrder, load) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualLoadKg: load,
      })),
    });
  },

  stepLoad: (exerciseId, setOrder, direction) => {
    const draft = get().draft;
    if (!draft) return;
    const novo = withSet(draft, exerciseId, setOrder, (s, ex) => {
      if (ex.isBodyweight) return s;
      const fallback = suggestLoad({
        actualLoadKg: null,
        targetLoadKg: s.targetLoadKg,
        lastLoad: draft.lastLoadByExercise[exerciseIdentity(ex)],
      });
      const base = s.actualLoadKg ?? fallback ?? 0;
      const next =
        Math.round(Math.max(0, base + direction * ex.loadIncrementKg) * 100) /
        100;
      return { ...s, actualLoadKg: next };
    });
    set({ draft: novo });
  },

  setRir: (exerciseId, setOrder, rir) => {
    const draft = get().draft;
    if (!draft) return;
    // Defesa em profundidade: RIR válido é 0–10 (CHECK do banco). A UI já clampa,
    // o núcleo garante (F12).
    const clamped =
      rir == null ? null : Math.min(10, Math.max(0, Math.trunc(rir)));
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualRir: clamped,
      })),
    });
  },

  setDuration: (exerciseId, setOrder, seconds) => {
    const draft = get().draft;
    if (!draft) return;
    // CHECK do banco: duração é positiva ou ausente. Zero/negativo vira null.
    const limpo =
      seconds == null || !Number.isFinite(seconds) || seconds <= 0
        ? null
        : Math.round(seconds);
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualDurationSeconds: limpo,
      })),
    });
  },

  setDistance: (exerciseId, setOrder, meters) => {
    const draft = get().draft;
    if (!draft) return;
    const limpo =
      meters == null || !Number.isFinite(meters) || meters <= 0
        ? null
        : Math.round(meters);
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        actualDistanceM: limpo,
      })),
    });
  },

  setEffort: (exerciseId, setOrder, effort) => {
    const draft = get().draft;
    if (!draft) return;
    set({
      draft: withSet(draft, exerciseId, setOrder, (s) => ({
        ...s,
        perceivedEffort: effort,
      })),
    });
  },

  completeSet: async (exerciseId, setOrder) => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente. Reabra o treino.' });
      return false;
    }
    const alvo = findSet(draft, exerciseId, setOrder);
    if (!alvo) return false;
    const { exercise, set: serie } = alvo;

    // Já concluída → idempotente, não regrava (F2).
    if (serie.status === 'done') return true;

    // CAS: fixa a sessão desta gravação ANTES do await (F7). A trava de reentrância é
    // por (log, série) (F9) — não colide entre sessões distintas.
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    const lockKey = `${sid}:${serie.plannedSetId}`;
    // Reentrância (duplo-toque / duas instâncias): uma gravação por série por vez (F2).
    if (inFlight.has(lockKey)) return false;

    const metrica = metricOf(exercise);
    const cardio = isTimeBased(metrica);

    if (!canCompleteSet(serie, exercise.isBodyweight, metrica)) {
      set({
        saveError: cardio
          ? 'Informe o tempo da atividade antes de concluir.'
          : exercise.isBodyweight
            ? 'Informe as repetições realizadas.'
            : 'Informe repetições e carga antes de concluir a série.',
      });
      return false;
    }

    // Cardio/isometria: a medição é tempo (e distância). Reps e carga ficam
    // NULAS — gravar 0 reps diria "falhei a série", que é outra coisa.
    const actualReps = cardio ? null : (serie.actualReps as number);
    const actualLoadKg =
      cardio || exercise.isBodyweight ? null : (serie.actualLoadKg as number);
    const actualDurationSeconds = cardio
      ? (serie.actualDurationSeconds as number)
      : null;
    const actualDistanceM =
      cardio && metrica === 'tempo_distancia' ? (serie.actualDistanceM ?? null) : null;
    const perceivedEffort = cardio ? (serie.perceivedEffort ?? null) : null;
    const outcome = cardio
      ? computeCardioOutcome(actualDurationSeconds as number, serie.targetDurationSeconds)
      : computeOutcome(
          actualReps as number,
          serie.targetRepsMin,
          serie.targetRepsMax,
        );

    inFlight.add(lockKey);
    try {
      // O timeout aborta a requisição no cliente. A 0005 preserva a primeira gravação
      // no banco caso o cancelamento chegue tarde e uma tentativa antiga sobreviva.
      const saved = await withTimeout(
        (signal) =>
          saveSetLog(
            {
              sessionLogId: sid,
              plannedSetId: serie.plannedSetId,
              actualReps,
              actualLoadKg,
              actualRir: cardio ? null : serie.actualRir,
              outcome,
              startedAt: serie.activatedAt,
              actualDurationSeconds,
              actualDistanceM,
              perceivedEffort,
            },
            signal,
          ),
        RPC_TIMEOUT_MS,
      );

      // CAS (F7): se a sessão ativa MUDOU durante o await (usuário trocou de treino), a
      // gravação foi confirmada no servidor, mas NÃO escrevemos no draft de outra sessão.
      const atual = get().draft;
      if (
        operationEpoch !== epoch ||
        !atual ||
        atual.sessionLogId !== sid ||
        atual.status !== 'active'
      )
        return true;

      // Servidor CONFIRMOU → marca "feita" já. A persistência local é secundária:
      // falha ao salvar o rascunho NÃO reverte um insert confirmado nem faz o
      // chamador retry (F3 — insert confirmado nunca é reapresentado como falha).
      const lastLoad = { ...atual.lastLoadByExercise };
      if (saved.actualLoadKg != null && !exercise.isBodyweight) {
        lastLoad[exerciseIdentity(exercise)] = saved.actualLoadKg;
      }
      const novo: SessionDraft = {
        ...withSet(atual, exerciseId, setOrder, (s) => ({
          ...s,
          status: 'done',
          actualReps: saved.actualReps,
          actualLoadKg: saved.actualLoadKg,
          actualRir: saved.actualRir,
          outcome: saved.outcome,
          setLogId: saved.setLogId,
          actualDurationSeconds: saved.actualDurationSeconds,
          actualDistanceM: saved.actualDistanceM,
          perceivedEffort: saved.perceivedEffort,
        })),
        lastLoadByExercise: lastLoad,
      };
      // Fase 5: série fora do alvo → recomenda um ajuste. Dentro do alvo, só com
      // fôlego declarado (RIR >= rirBoostMinRir) o motor propõe aumento — qualquer
      // ponto da faixa, por regra rirBoostOnTargetAnywhere. O motor mexe em CARGA:
      // não tem o que propor para uma caminhada. Cardio conclui a série e segue.
      // GUARD DE ÚLTIMA SÉRIE: sem próxima série pendente do MESMO exercício, não
      // há proposta nem decisão automática — a adaptação é intra-exercício.
      const updatedEx = novo.exercises.find((e) => e.exerciseId === exerciseId);
      const hasNextPendingOfSameExercise =
        updatedEx?.sets.some((s) => s.setOrder > setOrder && s.status !== 'done') ?? false;
      let finalDraft = novo;
      let pending: PendingAdaptation | null = null;
      if (hasNextPendingOfSameExercise && !cardio) {
        const evaluated = evaluateSet({
          actualReps: saved.actualReps as number,
          targetRepsMin: serie.targetRepsMin,
          targetRepsMax: serie.targetRepsMax,
        });
        const recommendation = recommendByRules({
          evaluated,
          currentLoadKg: saved.actualLoadKg,
          incrementKg: exercise.loadIncrementKg,
          ctx: { isBodyweight: exercise.isBodyweight, injury: exercise.hasInjury },
          actualRir: saved.actualRir,
        });
        if (recommendation.recommended.kind !== 'keep') {
          // Há um ajuste CONCRETO (topo da faixa, fora do alvo) → o aluno decide.
          pending = {
            exerciseId,
            setOrder,
            setLogId: saved.setLogId,
            sessionLogId: sid,
            recommendation,
          };
        } else if (evaluated.outcome !== 'on_target') {
          // Guardrail (lesão) / piso / RIR / incremento grosso resultaram em "manter":
          // decisão AUTOMÁTICA de segurança. Não abre sheet, mas registra.
          const autoKeep: Adjustment = {
            kind: 'keep',
            auto: true,
            label: recommendation.recommended.label,
            reason: recommendation.recommended.reason,
          };
          set({
            lastAutoDecision: {
              sessionLogId: sid,
              exerciseName: exercise.name,
              reason: recommendation.recommended.reason,
            },
          });
          finalDraft = applyAdjustmentToNextSet(finalDraft, exerciseId, setOrder, autoKeep);
          if (saved.setLogId) {
            const decision = buildAdaptationDecision(recommendation, autoKeep, true);
            updateSetLogAdaptation(saved.setLogId, autoKeep, decision).catch((e) =>
              console.warn('[activeSession] adaptação automática não persistida (não-fatal):', e),
            );
          }
        }
        // on_target + keep (sem progressão possível): nada — a série conclui e segue.
      }
      set({ draft: finalDraft, saveError: null, pendingAdaptation: pending });

      try {
        await saveDraft(finalDraft);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        set({ storageWarning: STORAGE_WARNING_MSG });
      }
      return true;
    } catch (e) {
      // Só erro do BANCO deixa a série NÃO concluída. E só mostra o erro se AINDA
      // estamos na mesma sessão (não polui a UI de uma sessão que o usuário já trocou).
      const atual = get().draft;
      if (operationEpoch === epoch && atual?.sessionLogId === sid) {
        if (isClosedSessionError(e)) {
          set({
            draft: { ...atual, status: 'finished' },
            status: 'finished',
            saveError: null,
          });
          await retireLocalDraft(atual);
        } else {
          set({ saveError: errMsg(e) });
        }
      }
      return false;
    } finally {
      inFlight.delete(lockKey);
    }
  },

  resolveAdaptation: async (adjustment) => {
    const pending = get().pendingAdaptation;
    if (!pending) return;
    // Fecha o sheet e aplica ao rascunho da MESMA sessão (applyAdjustmentToNextSet é puro):
    // registra a escolha na série concluída e ajusta o alvo da próxima. Nunca sem confirmar.
    const atual = get().draft;
    if (
      atual &&
      atual.sessionLogId === pending.sessionLogId &&
      atual.exercises.some((e) => e.exerciseId === pending.exerciseId)
    ) {
      const novo = applyAdjustmentToNextSet(
        atual,
        pending.exerciseId,
        pending.setOrder,
        adjustment,
      );
      set({ draft: novo, pendingAdaptation: null });
      try {
        await saveDraft(novo);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        set({ storageWarning: STORAGE_WARNING_MSG });
      }
    } else {
      set({ pendingAdaptation: null });
    }
    // Registra a decisão no servidor (best-effort): a experiência não trava se falhar, mas
    // a escolha — inclusive a recusa ("manter") — fica gravada em set_logs.adaptation.
    if (pending.setLogId) {
      try {
        const decision = buildAdaptationDecision(pending.recommendation, adjustment, false);
        await updateSetLogAdaptation(pending.setLogId, adjustment, decision);
      } catch (e) {
        console.warn('[activeSession] adaptação não persistida (não-fatal):', e);
      }
    }
  },

  skipExercise: async (exerciseId, reason, note) => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente.' });
      return false;
    }
    const alvo = draft.exercises.find((ex) => ex.exerciseId === exerciseId);
    if (!alvo) return false;
    // Já recusado: nada a fazer (guarda de toque duplo no sheet).
    if (alvo.skippedByUser === true && alvo.skipReason === reason) return true;

    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    try {
      // Servidor PRIMEIRO: aplicar na tela antes de gravar deixaria a recusa
      // sumir na retomada (o rascunho local não é autoritativo) — o aluno
      // reencontraria o exercício que dispensou sem entender por quê.
      await skipSessionExercise({
        sessionLogId: sid,
        plannedExerciseId: exerciseId,
        reason,
        note: note ?? null,
      });
    } catch (e) {
      if (operationEpoch === epoch && get().draft?.sessionLogId === sid) {
        set({ saveError: errMsg(e) });
      }
      return false;
    }

    const atual = get().draft;
    if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid) return true;
    const novo = applyExerciseSkipToDraft(atual, exerciseId, reason, note ?? null);
    set({
      draft: novo,
      saveError: null,
      // Uma adaptação pendente do exercício recusado não faz mais sentido: o
      // sheet pediria decisão de carga para o que acabou de ser dispensado.
      pendingAdaptation:
        get().pendingAdaptation?.exerciseId === exerciseId
          ? null
          : get().pendingAdaptation,
    });
    try {
      await saveDraft(novo);
    } catch (e) {
      console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
      set({ storageWarning: STORAGE_WARNING_MSG });
    }
    return true;
  },

  unskipExercise: async (exerciseId) => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente.' });
      return false;
    }
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    try {
      await unskipSessionExercise({ sessionLogId: sid, plannedExerciseId: exerciseId });
    } catch (e) {
      if (operationEpoch === epoch && get().draft?.sessionLogId === sid) {
        set({ saveError: errMsg(e) });
      }
      return false;
    }

    const atual = get().draft;
    if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid) return true;
    const novo = removeExerciseSkipFromDraft(atual, exerciseId);
    set({ draft: novo, saveError: null });
    try {
      await saveDraft(novo);
    } catch (e) {
      console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
      set({ storageWarning: STORAGE_WARNING_MSG });
    }
    return true;
  },

  skipWholeSession: async (reason, note) => {
    const draft = get().draft;
    const pendente = get().pendingCheckIn;
    // Vale antes de começar (recusar no check-in) e durante a execução: nos dois
    // casos existe uma sessão PLANEJADA a recusar, com ou sem session_log.
    const plannedSessionId = draft?.plannedSessionId ?? pendente?.sessionId ?? null;
    const uid = draft?.userId ?? pendente?.draft.userId ?? null;
    if (!plannedSessionId || !uid) {
      set({ saveError: 'Sessão não identificada.' });
      return false;
    }
    const epoch = operationEpoch;
    try {
      // A RPC fecha o session_log em aberto: sem isso a sessão ficaria recusada
      // com log aberto e o próximo start_session reaproveitaria aquele log,
      // devolvendo o aluno para dentro do treino que ele acabou de recusar.
      await skipPlannedSession({ plannedSessionId, reason, note: note ?? null });
    } catch (e) {
      if (operationEpoch === epoch) set({ saveError: errMsg(e) });
      return false;
    }
    if (operationEpoch !== epoch) return true;

    set({
      draft: null,
      status: 'finished',
      pendingCheckIn: null,
      pendingReplan: null,
      pendingAdaptation: null,
      saveError: null,
    });
    // O rascunho local precisa MORRER. O tombstone impede ressurreição offline
    // mesmo se a remoção do AsyncStorage falhar depois da recusa no servidor.
    if (draft) {
      await retireLocalDraft(draft);
    } else {
      try {
        await clearDraft(uid, plannedSessionId, null);
      } catch (e) {
        console.warn('[activeSession] rascunho não removido (não-fatal):', e);
      }
    }
    return true;
  },

  finishSession: async () => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente.' });
      return false;
    }
    // CAS: fixa a sessão desta conclusão ANTES do await (F7).
    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    try {
      // RPC atômica e IDEMPOTENTE (0004): finaliza, ou é sucesso se já estava finalizada
      // (dela); só inexistente/alheia levanta erro — sem "concluído" falso (F4/F6).
      await finishSessionLog(sid);
    } catch (e) {
      // Só reporta o erro se AINDA estamos nesta sessão (não polui uma sessão trocada).
      if (operationEpoch === epoch && get().draft?.sessionLogId === sid) {
        set({ saveError: errMsg(e) });
      }
      return false;
    }

    // CAS (F7): se o usuário trocou de sessão durante o await, o servidor finalizou a
    // certa, mas NÃO mexemos no estado nem limpamos o rascunho da OUTRA sessão.
    const atual = get().draft;
    if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid)
      return true;

    set({
      draft: { ...atual, status: 'finished' },
      status: 'finished',
      saveError: null,
    });
    // Só limpa o rascunho DEPOIS de finalizar de verdade, e só porque o draft atual
    // AINDA é esta sessão (não por userId cego — evita apagar a sessão trocada).
    await retireLocalDraft(atual);
    return true;
  },

  clearError: () => set({ saveError: null }),
  clearStorageWarning: () => set({ storageWarning: null }),
  clearReplanWarning: () => set({ replanWarning: null }),

  reset: () => {
    operationEpoch += 1;
    set({
      draft: null,
      status: 'idle',
      saveError: null,
      storageWarning: null,
      replanWarning: null,
      pendingAdaptation: null,
      pendingReplan: null,
      replanBusy: false,
      sessionMood: null,
      checkInMinutes: null,
      pendingCheckIn: null,
      lastAutoDecision: null,
    });
  },
}));
