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
  suggestReps,
  stepLoad as stepLoadPuro,
  stepReps as stepRepsPuro,
  resolveInheritedSet,
  isFirstSetOfExerciseInSession,
  canCompleteSet,
  reconcileInjuryFlags,
  applyExerciseSkipToDraft,
  removeExerciseSkipFromDraft,
  applyCardioSwapToDraft,
  findActiveSet,
  findNextPendingSet,
  type SessionDraft,
  type DraftExercise,
  type DraftSet,
  type PerceivedEffort,
  type SkipReason,
} from '../engine/sessionModel';
import type { CardioModalidade } from '../constants/cardioModalidades';
import {
  startSessionLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  getLastRepsByExercise,
  skipPlannedSession,
  isTransportSessionExecutionError,
  type OpenSessionLog,
} from '../services/sessionExecutionRepository';
import {
  enqueueAndDrain,
  type SaveSetLogPayload,
  type UpdateSetLogAdaptationPayload,
  type SkipSessionExercisePayload,
  type UnskipSessionExercisePayload,
  type SwapSessionExercisePayload,
} from '../services/sessionOutboxDrain';
import { loadOutbox } from '../services/sessionOutboxStorage';
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
  parseReplanSnapshot,
  lastTimeCutForSession,
  replanFingerprint,
  type WeeklyReplanProposal,
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
import apiClient, { ENDPOINTS } from '../services/api/apiClient';
import { logger } from '../utils/logger';
import { ajustarRestEndsAt } from '../engine/sessionSummary';
import {
  peekQueuedLiveActivityIntents,
  ackQueuedLiveActivityIntent,
  type QueuedLiveActivityIntent,
} from '../../modules/live-activity';

type Status = 'idle' | 'loading' | 'awaiting_checkin' | 'active' | 'finished' | 'error';

// Adaptação pendente de decisão do aluno após concluir uma série fora do alvo (Fase 5).
// A UI observa este campo para abrir o bottom sheet; nada é aplicado sem confirmação.
export type PendingAdaptation = {
  exerciseId: string;
  setOrder: number;
  // Fase 4 (REQ-07/D-05/Pitfall 1): sempre null a partir do commit otimista —
  // mantido só por compatibilidade de shape. plannedSetId é a chave usada para
  // persistir a decisão via fila (resolução tardia de setLogId no drenador).
  setLogId: string | null;
  plannedSetId: string;
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
  /** Fase 4 (REQ-07): itens da fila offline-first ainda não confirmados pelo servidor. */
  pendingCount: number;
  /** Fase 4 (REQ-07): itens recusados em definitivo e retidos localmente (D-07) — sem UI própria (D-06). */
  quarantineCount: number;

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
  declineReagendamento: () => void;
  clearStorageWarning: () => void;
  clearReplanWarning: () => void;
  activateSet: (exerciseId: string, setOrder: number) => void;
  adjustRest: (deltaSeconds: number) => void;
  setReps: (exerciseId: string, setOrder: number, reps: number | null) => void;
  setLoad: (exerciseId: string, setOrder: number, load: number | null) => void;
  stepLoad: (exerciseId: string, setOrder: number, direction: 1 | -1) => void;
  /** Fase 17 (REG-01): espelha stepLoad, mas para reps — passo fixo de 1. */
  stepReps: (exerciseId: string, setOrder: number, direction: 1 | -1) => void;
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
   * Fase 4 (REQ-07/Pitfall 3): a fila descobriu P0001 (sessão já finalizada no
   * servidor) durante a drenagem de UM item — reconcilia o rascunho local
   * inteiro, não só o item que falhou. Só age se `sessionLogId` ainda for a
   * sessão ativa (guarda de CAS, mesma cautela do resto do arquivo).
   */
  reconcileRemoteSessionClosed: (sessionLogId: string) => void;
  /**
   * Fase 16 (CMD, Plano 16-02): drena a fila durável de intents da tela
   * bloqueada (App Group, gravada mesmo com o app force-quit — Plano
   * 16-01) e aplica cada entrada pendente contra a MESMA
   * completeSet()/activateSet()/adjustRest() já existentes, com guarda de
   * CAS por sessionLogId — nunca aplica contra uma sessão que não é mais
   * a ativa. Chamado no boot do app (App.tsx), antes de
   * reconcileOrphanActivities().
   */
  reconcileLiveActivityIntents: () => Promise<void>;
  /** Fase 4 (REQ-07): atualiza o resumo observável da fila (selo de pendência, D-05). */
  setOutboxSummary: (pendingCount: number, quarantineCount: number) => void;
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
  /**
   * Troca a modalidade de um exercício de cardio (Fase 3, D-01). Servidor
   * PRIMEIRO, mesma razão de `skipExercise`: aplicar na tela antes de gravar
   * deixaria a troca sumir na retomada (o rascunho local não é autoritativo).
   */
  swapExercise: (exerciseId: string, toModality: CardioModalidade) => Promise<boolean>;
  /** "Não vou treinar hoje": recusa a sessão inteira e encerra a tela. */
  skipWholeSession: (reason: SkipReason, note?: string | null) => Promise<boolean>;
  finishSession: () => Promise<boolean>;
  clearError: () => void;
  /**
   * Achado 5 (painel adversarial 05-02): `userId`, quando fornecido,
   * resincroniza pendingCount/quarantineCount contra a fila REAL do usuário
   * (D-10: a fila é do usuário, não da tela) em vez de zerar às cegas —
   * itens pendentes de um treino anterior continuam visíveis no novo.
   */
  reset: (userId?: string | null) => void;
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

// Fase 4 (REQ-07): RPC_TIMEOUT_MS/withTimeout mudaram para
// src/services/sessionOutboxDrain.ts — a fila é agora o único ponto que chama
// RPC de escrita de execução sob timeout (D-15).

/**
 * Plano 16-12: uma intent órfã (`sessionLogId` nulo) só é adotada pelo draft
 * ativo quando dá para PROVAR que foi enfileirada depois do início desta
 * sessão. A origem do nulo é `CompleteSetIntent.swift:12`, que lê o id via
 * `Activity<...>.activities.first?.attributes.sessionLogId` — encadeamento
 * opcional que pode resolver `nil` num cold-launch disparado pelo próprio
 * Intent (app morto no momento do toque na Lock Screen).
 *
 * Sem prova (draft sem `startedAt`, ou data ilegível) NÃO adota: perder uma
 * conclusão de série é ruim, mas aplicá-la na sessão errada corromperia o
 * histórico de treino em silêncio — que é pior e irreversível.
 *
 * WR-03 (review 2026-08-19): `queuedAt` nasce no relógio do APARELHO e
 * `startedAt` no relógio do SERVIDOR — domínios de clock diferentes. A
 * tolerância `SKEW_MS` absorve (a) o relógio do aparelho atrás do servidor
 * (comum: skew de ~1 minuto anulava o fix da 16-12) e (b) a fronteira de
 * precisão de segundos (o lado Swift agora emite fração, mas um toque
 * dentro da mesma janela ainda compara contra milissegundos do servidor).
 * Decisão registrada: o custo é admitir um órfão enfileirado até 60s ANTES
 * do início da sessão — aplicá-lo é arriscado, mas descartá-lo é
 * irreversível (a própria 16-12 nasceu de um toque descartado em silêncio).
 */
const SKEW_MS = 60_000;

const nasceuNestaSessao = (
  queuedAt: string,
  startedAt: string | null,
): boolean => {
  if (!startedAt) return false;
  const enfileiradoEm = Date.parse(queuedAt);
  const iniciadaEm = Date.parse(startedAt);
  if (Number.isNaN(enfileiradoEm) || Number.isNaN(iniciadaEm)) return false;
  return enfileiradoEm >= iniciadaEm - SKEW_MS;
};

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

/**
 * D3 (16-08-PLAN.md/16-VERIFICATION.md gap 1): garante no máximo uma série
 * 'active' por vez em todo o draft. Qualquer série 'active' remanescente (ex.:
 * travada por um completeSet() reprovado) volta a 'pending' com
 * activatedAt: null — mesmo padrão de applyExerciseSkipToDraft
 * (sessionModel.ts:595-615): "a série que estava ATIVA volta a pendente...
 * mas nada que o aluno digitou é apagado" (reps/carga preservados via spread).
 * Sem esta invariante, findActiveSet() (sessionModel.ts:290-297) devolve a
 * PRIMEIRA série 'active' por ordem de array — potencialmente a travada, não
 * a que acabou de ser ativada (regressão física observada em 16-06-SUMMARY.md,
 * regressao_geral=FAIL).
 */
const deactivateOtherActiveSets = (
  draft: SessionDraft,
  exceptExerciseId: string,
  exceptSetOrder: number,
): SessionDraft => ({
  ...draft,
  exercises: draft.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) =>
      s.status === 'active' &&
      !(ex.exerciseId === exceptExerciseId && s.setOrder === exceptSetOrder)
        ? { ...s, status: 'pending' as const, activatedAt: null }
        : s,
    ),
  })),
});

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

/**
 * Reps sugeridas para uma série, dado o estado atual do rascunho — Fase 17
 * (REG-01), export nomeado usado como prop wiring em SessionPlayer.tsx (Plano
 * 17-04). Bifurca pelo ramo D-17 correto para aquela série específica via
 * isFirstSetOfExerciseInSession.
 */
export const suggestedRepsFor = (
  draft: SessionDraft,
  exercise: DraftExercise,
  set: DraftSet,
): number | null =>
  suggestReps({
    actualReps: set.actualReps,
    targetRepsMin: set.targetRepsMin > 0 ? set.targetRepsMin : null,
    lastReps: draft.lastRepsByExercise[exerciseIdentity(exercise)],
    isFirstSetOfExerciseInSession: isFirstSetOfExerciseInSession(exercise, set),
  });

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
 * Semente de últimas reps por exercício (Fase 17, D-01/D-02) — mesmo padrão
 * best-effort de seedLastLoads: falha não derruba o início da sessão.
 */
const seedLastReps = async (
  detail: SessionDetail,
): Promise<Record<string, number>> => {
  try {
    const identidades = (detail.planned_exercises ?? []).map((e) =>
      exerciseIdentity({ exerciseKey: e.exercise_key ?? null, name: e.name }),
    );
    return await getLastRepsByExercise(identidades);
  } catch (e) {
    console.warn(
      '[activeSession] não foi possível semear reps do histórico:',
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
  // D2b (16-08-PLAN.md/16-VERIFICATION.md gap 1): sem este overlay, a persistência
  // de reps/carga da Parte A (setReps/setLoad -> saveDraft) não sobrevive ao ramo
  // MAIS COMUM de retomada (rede disponível) — este trecho reconstrói o draft do
  // ZERO via buildDraftFromDetail e só usa `local` para adaptação/restEndsAt/
  // fingerprints, nunca para reps/carga de uma série sem confirmação do servidor.
  // Só sets locais AINDA NÃO confirmados (status 'active'/'pending') entram no
  // overlay — um set 'done' localmente mas ainda sem `sl` do servidor mantém o
  // comportamento ATUAL (fora do escopo de D2/D2b).
  const localSetByPlannedSet = new Map<string, DraftSet>();
  for (const ex of local?.exercises ?? []) {
    for (const s of ex.sets) {
      if (s.status !== 'done') localSetByPlannedSet.set(s.plannedSetId, s);
    }
  }
  const lastLoad = { ...draft.lastLoadByExercise };
  const lastReps = { ...draft.lastRepsByExercise };
  const latestFromOpenLog = new Map<
    string,
    { load: number; completedAt: string }
  >();
  // Fase 17 (D-02): reconciliação espelhada de lastReps — SEM a checagem
  // !ex.isBodyweight que lastLoad tem, porque reps sempre contam (bodyweight
  // não tem carga, mas tem reps).
  const latestRepsFromOpenLog = new Map<
    string,
    { reps: number; completedAt: string }
  >();
  const exercises = draft.exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((s) => {
      const sl = porPlannedSet.get(s.plannedSetId);
      if (!sl) {
        // D2b: overlay do rascunho LOCAL sobre a série FRESCA reconstruída do
        // servidor — só campos digitados pelo aluno e status/activatedAt são
        // sobrepostos; plannedSetId/setOrder/alvos continuam vindo de `s` (spread
        // `...s` primeiro). Nunca sobrepõe uma série que o servidor já confirmou
        // (esse ramo é o `if (sl...)` abaixo, mutuamente exclusivo deste).
        const emAndamentoLocal = localSetByPlannedSet.get(s.plannedSetId);
        if (!emAndamentoLocal) return s;
        return {
          ...s,
          status: emAndamentoLocal.status === 'active' ? ('active' as const) : s.status,
          actualReps: emAndamentoLocal.actualReps,
          actualLoadKg: emAndamentoLocal.actualLoadKg,
          actualRir: emAndamentoLocal.actualRir,
          actualDurationSeconds: emAndamentoLocal.actualDurationSeconds,
          actualDistanceM: emAndamentoLocal.actualDistanceM,
          perceivedEffort: emAndamentoLocal.perceivedEffort,
          activatedAt: emAndamentoLocal.activatedAt ?? s.activatedAt,
        };
      }
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
      if (sl.actual_reps != null) {
        const key = exerciseIdentity(ex);
        const previousReps = latestRepsFromOpenLog.get(key);
        if (
          !previousReps ||
          String(sl.completed_at).localeCompare(previousReps.completedAt) > 0
        ) {
          latestRepsFromOpenLog.set(key, {
            reps: sl.actual_reps,
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
        // Carimbo do servidor (0028): sem restaurar, o resumo ao vivo da sessão
        // retomada perderia a linha do tempo e mostraria só o vão até "agora".
        completedAt: sl.completed_at,
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
  for (const [key, value] of latestRepsFromOpenLog) {
    if (!(key in lastReps)) lastReps[key] = value.reps;
  }
  // Reaplica os efeitos das adaptações restauradas às próximas séries pendentes (retomada).
  const reaplicado = replayAdaptations({
    ...draft,
    sessionLogId: aberta.sessionLogId,
    startedAt: aberta.startedAt,
    exercises,
    lastLoadByExercise: lastLoad,
    lastRepsByExercise: lastReps,
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
  // Trocas de modalidade de cardio (Fase 3) vêm do SERVIDOR pela mesma razão
  // de comRecusas acima — este é o único ponto de reconciliação por onde as
  // duas retomadas (local e reconstruída) passam. `?? []` protege um
  // OpenSessionLog de versão anterior a esta fase (ou de um mock) de estourar
  // num reduce de undefined.
  const comTrocas = (aberta.exerciseSwaps ?? []).reduce(
    (acc, swap) => applyCardioSwapToDraft(acc, swap.plannedExerciseId, swap.toModality),
    comRecusas,
  );
  // Fingerprints de propostas recusadas são memória LOCAL do aparelho (nunca do
  // servidor): na reconstrução a partir do servidor, eles vêm do rascunho local.
  return {
    ...comTrocas,
    restEndsAt: local?.restEndsAt ?? draft.restEndsAt ?? null,
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

/**
 * WR-01 (code review 04): todo call site que usa `enqueueAndDrain` faz
 * `const {p,q} = await enqueueAndDrain(...)` e aplica esse snapshot DO
 * MOMENTO DO ENFILEIRAMENTO via `set()` — mas a MESMA chamada passa um
 * `onSummaryChanged` que a drenagem em segundo plano (fire-and-forget,
 * disparada dentro do próprio `enqueueAndDrain`) pode invocar com uma
 * contagem mais FRESCA antes mesmo do `await` externo resolver (ordem
 * cronológica real: a drenagem sempre lê um estado pelo menos tão novo
 * quanto o que o enfileiramento acabou de persistir). Aplicar o snapshot
 * antigo por cima reverteria silenciosamente o valor fresco.
 *
 * `makeOutboxSummaryGuard` amarra as duas escritas à MESMA flag: assim que
 * `onSummaryChanged` desta chamada dispara, o snapshot do enfileiramento
 * (`applyEnqueueSnapshot`) deixa de ser aplicado — nunca escreve fora de
 * ordem. Cada call site cria seu PRÓPRIO guard (uma chamada = um `freshened`
 * independente); não é compartilhado entre chamadas concorrentes.
 */
const makeOutboxSummaryGuard = (
  set: (partial: Partial<ActiveSessionState>) => void,
) => {
  let freshened = false;
  return {
    onSummaryChanged: (pendingCount: number, quarantineCount: number) => {
      freshened = true;
      set({ pendingCount, quarantineCount });
    },
    applyEnqueueSnapshot: (pendingCount: number, quarantineCount: number) => {
      if (freshened) return;
      set({ pendingCount, quarantineCount });
    },
  };
};

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
  pendingCount: 0,
  quarantineCount: 0,

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
          // Fase 16 (CMD, gap 1 — 16-VERIFICATION.md/16-REVIEW.md CR-01): a
          // reconciliação da fila de intents da tela bloqueada só pode
          // rodar DEPOIS que draft está hidratado; este é o ramo "retomada
          // offline sem rede".
          if (isCurrent()) await get().reconcileLiveActivityIntents();
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
        const repsSeed = await seedLastReps(detail);
        if (!isCurrent()) return;
        const draftServidor = applyServerSetLogs(
          buildDraftFromDetail(detail, userId, seed, repsSeed),
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
        // Fase 16 (CMD, gap 1 — 16-VERIFICATION.md/16-REVIEW.md CR-01): ramo
        // "reconciliado com o servidor" — draft já está hidratado acima.
        if (isCurrent()) await get().reconcileLiveActivityIntents();
        return;
      }

      // 2. Sem rascunho local (ou de outra sessão): reconstroi do servidor.
      const seed = await seedLastLoads(detail);
      const repsSeed = await seedLastReps(detail);
      if (!isCurrent()) return;
      let draft = buildDraftFromDetail(detail, userId, seed, repsSeed);

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
      // Fase 16 (CMD, gap 1 — 16-VERIFICATION.md/16-REVIEW.md CR-01): ramo
      // "sem rascunho local, log aberto encontrado" — draft já hidratado acima.
      if (isCurrent()) await get().reconcileLiveActivityIntents();
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
      });

      // Calcula o reencaixe (best-effort: falha não derruba a proposta).
      let reagendamento: Reagendamento | null = null;
      try {
        const agenda = await getAgendaDoAluno({
          userId: draft.userId,
          planId: detail.plan_id,
        });

        // Aluno sem agenda: comportamento pré-existente é no-op — sem reencaixe
        // e sem banner (decisão de produto, não um bug a corrigir aqui).
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

            // Se houver movidas OU sessões sem encaixe, armazena o plano para
            // exibição. O caso "sem movidas, só semEncaixe" é o Nível 2 da
            // escada: a semana fecha com menos volume e o banner diz isso.
            if (plano.movidas.length > 0 || plano.semEncaixe.length > 0) {
              reagendamento = {
                movidas: plano.movidas,
                semEncaixe: plano.semEncaixe,
              };
            }
          }
        }
      } catch (reanchorError) {
        // Reencaixe falhou (I/O): proposta segue como estava.
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
    });
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
      await applyConfirmedReplan({
        context: pr.context,
        proposal: pr.proposal,
        sessionLogId: sid,
        confirmedAtISO: new Date().toISOString(),
      });
      // PUSH-03: aviso de replanejamento aplicado, best-effort. NUNCA
      // await'ado — a UX de "replanejamento confirmado" nunca deve esperar
      // nem falhar por causa do envio da notificação (fire-and-forget
      // deliberado, decisão explícita assumida pelo plano).
      apiClient.post(ENDPOINTS.PUSH.NOTIFY_REPLAN, {}).catch((e) => {
        logger.warn('[activeSession] notificação de replanejamento não enviada (não-fatal):', e);
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
      // COMMIT B: a aplicação grava SÓ o snapshot — não há estágio parcial nem
      // conflito a reconciliar. Falha = nada foi escrito; a proposta FICA DE PÉ
      // para tentar de novo (recálculo do servidor com availableMinutes: null
      // mataria o corte pedido — retry voltaria com sucesso sem escrever nada).
      // O erro aparece; a sessão nunca trava.
      set({
        saveError: isReplanTransportError(e)
          ? 'Sem conexão para confirmar o replanejamento. Toque para tentar de novo.'
          : errMsg(e),
      });
      return false;
    } finally {
      set({ replanBusy: false });
    }
  },

  /**
   * Recusa do REENCAIXE — só ele. Nada é escrito no servidor e NENHUM
   * fingerprint é gravado: o cartão de reagendamento tem precedência sobre o
   * corte de tempo, então tratar as duas recusas como a mesma ação enterrava
   * uma proposta que o aluno nunca viu (o corte sumia e não voltava nem
   * pedindo os mesmos minutos de novo).
   *
   * Ao limpar `reagendamento`, o banner cai para o próximo ramo — o cartão do
   * corte, se houver: as duas decisões aparecem em sequência, cada uma com o
   * seu botão.
   */
  declineReagendamento: () => {
    const pr = get().pendingReplan;
    if (!pr || !pr.reagendamento) return;
    set({ pendingReplan: { ...pr, reagendamento: null } });
  },

  declineReplan: async () => {
    const pr = get().pendingReplan;
    if (!pr) return;
    // Nível 2 da escada (semana sem espaço, sem corte pedido): "Entendi" é só
    // reconhecimento do fechamento — não há proposta a recusar nem fingerprint
    // a gravar. Zeras hasChanges não bastaria: o reagendamento (movidas vazias,
    // semEncaixe cheio) manteria a condição do ramo de pé e o cartão
    // re-renderizaria idêntico — botão no-op. Dispensa o overlay inteiro; o
    // fechamento é recalculado na próxima abertura.
    // MANTER EM SINCRONIA com ReplanBanner.tsx (ramo do botão "Entendi"):
    // a condição abaixo é a condição de render daquele ramo, espelhada.
    if (
      pr.reagendamento &&
      pr.reagendamento.movidas.length === 0 &&
      pr.reagendamento.semEncaixe.length > 0 &&
      !pr.proposal.hasChanges
    ) {
      set({ pendingReplan: null });
      return;
    }
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
        proposal: {
          ...pr.proposal,
          timeCut: null,
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
    let ativou = false;
    const novo = withSet(draft, exerciseId, setOrder, (s) => {
      if (s.status !== 'pending') return s;
      ativou = true;
      return { ...s, status: 'active', activatedAt: s.activatedAt ?? agora };
    });
    if (!ativou) return;
    // D3: garante a invariante de série ativa única ANTES do commit final.
    const semOutrasAtivas = deactivateOtherActiveSets(novo, exerciseId, setOrder);
    set({ draft: { ...semOutrasAtivas, restEndsAt: null } });
  },

  adjustRest: (deltaSeconds) => {
    const draft = get().draft;
    if (!draft?.restEndsAt || !Number.isFinite(deltaSeconds)) return;
    set({
      draft: {
        ...draft,
        restEndsAt: ajustarRestEndsAt(draft.restEndsAt, deltaSeconds),
      },
    });
  },

  setReps: (exerciseId, setOrder, reps) => {
    const draft = get().draft;
    if (!draft) return;
    const novo = withSet(draft, exerciseId, setOrder, (s) => ({
      ...s,
      actualReps: reps,
    }));
    set({ draft: novo });
    // D2 (16-08-PLAN.md/16-VERIFICATION.md gap 1): persiste fire-and-forget a
    // cada toque do stepper — sessionDraftStorage.ts já serializa escritas da
    // mesma chave via withKeyQueue, então chamadas rápidas em sequência não
    // corrompem nem sobrescrevem fora de ordem. Sem isto, um force-quit
    // descarta reps/carga só em memória e canCompleteSet() reprova na retomada.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] reps não persistidos (não-fatal):', e);
    });
  },

  setLoad: (exerciseId, setOrder, load) => {
    const draft = get().draft;
    if (!draft) return;
    const novo = withSet(draft, exerciseId, setOrder, (s) => ({
      ...s,
      actualLoadKg: load,
    }));
    set({ draft: novo });
    // D2 (16-08-PLAN.md/16-VERIFICATION.md gap 1): mesmo mecanismo de setReps acima.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] carga não persistida (não-fatal):', e);
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
      // WR-01 (review 2026-08-19): delega à função pura de sessionModel —
      // a aritmética inline duplicada era uma segunda cópia do mesmo
      // cálculo (round2 + piso 0). Uma única fonte de agora em diante.
      return {
        ...s,
        actualLoadKg: stepLoadPuro(s.actualLoadKg, ex.loadIncrementKg, direction, fallback),
      };
    });
    set({ draft: novo });
    // CR-01/D2 (16-10-PLAN.md): stepper de carga (+/-) é a interação PRIMÁRIA
    // de ajuste de carga (SessionPlayer.tsx:681,708) — mesmo mecanismo de
    // setReps/setLoad acima, sem o qual um force-quit logo após usar só o
    // stepper descarta a carga e reprova canCompleteSet() na retomada.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] carga (stepper) não persistida (não-fatal):', e);
    });
  },

  stepReps: (exerciseId, setOrder, direction) => {
    const draft = get().draft;
    if (!draft) return;
    const novo = withSet(draft, exerciseId, setOrder, (s, ex) => {
      const fallback = suggestReps({
        actualReps: null,
        targetRepsMin: s.targetRepsMin > 0 ? s.targetRepsMin : null,
        lastReps: draft.lastRepsByExercise[exerciseIdentity(ex)],
        isFirstSetOfExerciseInSession: isFirstSetOfExerciseInSession(ex, s),
      });
      // WR-01: mesma consolidação de stepLoad — a aritmética vive só em
      // sessionModel.stepReps, não duplicada aqui.
      return { ...s, actualReps: stepRepsPuro(s.actualReps, direction, fallback) };
    });
    set({ draft: novo });
    // Mesmo mecanismo de persistência fire-and-forget de stepLoad/setReps/setLoad
    // acima — sem isto, um force-quit logo após usar o stepper de reps descarta
    // o valor e reprova canCompleteSet() na retomada.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] reps (stepper) não persistidas (não-fatal):', e);
    });
  },

  setRir: (exerciseId, setOrder, rir) => {
    const draft = get().draft;
    if (!draft) return;
    // Defesa em profundidade: RIR válido é 0–10 (CHECK do banco). A UI já clampa,
    // o núcleo garante (F12).
    const clamped =
      rir == null ? null : Math.min(10, Math.max(0, Math.trunc(rir)));
    const novo = withSet(draft, exerciseId, setOrder, (s) => ({
      ...s,
      actualRir: clamped,
    }));
    set({ draft: novo });
    // CR-01/D2 (16-10-PLAN.md): consistência com as demais ações de escrita —
    // nenhuma das sete ações que mutam draft.exercises[].sets[] permanece só
    // em memória.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] RIR não persistido (não-fatal):', e);
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
    const novo = withSet(draft, exerciseId, setOrder, (s) => ({
      ...s,
      actualDurationSeconds: limpo,
    }));
    set({ draft: novo });
    // CR-01/D2 (16-10-PLAN.md): actualDurationSeconds é o ÚNICO campo que
    // canCompleteSet() exige para exercícios isTimeBased (cardio/isometria,
    // sessionModel.ts:272-274) — sem persistir aqui, um force-quit derruba a
    // conclusão de séries de cardio mesmo sem depender de reps/carga.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] duração não persistida (não-fatal):', e);
    });
  },

  setDistance: (exerciseId, setOrder, meters) => {
    const draft = get().draft;
    if (!draft) return;
    const limpo =
      meters == null || !Number.isFinite(meters) || meters <= 0
        ? null
        : Math.round(meters);
    const novo = withSet(draft, exerciseId, setOrder, (s) => ({
      ...s,
      actualDistanceM: limpo,
    }));
    set({ draft: novo });
    // CR-01/D2 (16-10-PLAN.md): consistência com as demais ações de escrita.
    saveDraft(novo).catch((e) => {
      console.warn('[activeSession] distância não persistida (não-fatal):', e);
    });
  },

  setEffort: (exerciseId, setOrder, effort) => {
    const draft = get().draft;
    if (!draft) return;
    const novo = withSet(draft, exerciseId, setOrder, (s) => ({
      ...s,
      perceivedEffort: effort,
    }));
    set({ draft: novo });
    // CR-01/D2 (16-10-PLAN.md): consistência com as demais ações de escrita —
    // fecha a última das sete ações de escrita de série sem persistência.
    saveDraft(novo).catch((e) => {
      console.warn(
        '[activeSession] esforço percebido não persistido (não-fatal):',
        e,
      );
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

    // Fase 17 (D-17): materializa o valor herdado ANTES de validar — "1 toque"
    // sem nenhum ajuste manual grava o valor herdado (histórico/alvo), nunca
    // exige que outro call site pré-preencha o draft. Cardio (isTimeBased) e
    // bodyweight continuam sem alteração de comportamento (o ramo cardio
    // abaixo zera actualReps/actualLoadKg de qualquer forma; resolveInheritedSet
    // já devolve actualLoadKg: null para bodyweight).
    const resolvido = resolveInheritedSet(
      serie,
      exercise,
      draft.lastRepsByExercise[exerciseIdentity(exercise)],
      draft.lastLoadByExercise[exerciseIdentity(exercise)],
    );
    const serieResolvida: DraftSet = {
      ...serie,
      actualReps: resolvido.actualReps,
      actualLoadKg: resolvido.actualLoadKg,
    };

    if (!canCompleteSet(serieResolvida, exercise.isBodyweight, metrica)) {
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
    const actualReps = cardio ? null : (serieResolvida.actualReps as number);
    const actualLoadKg =
      cardio || exercise.isBodyweight ? null : (serieResolvida.actualLoadKg as number);
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

    const actualRir = cardio ? null : serie.actualRir;

    inFlight.add(lockKey);
    try {
      // Fase 4 (REQ-07/D-05): a gravação vira item de FILA em vez de RPC direta
      // aguardada. enqueueAndDrain persiste o item (durável primeiro, D-12) e
      // dispara a drenagem SEM aguardá-la (fire-and-forget) — soluço de rede na
      // academia nunca aparece como erro nem trava o treino. `await` aqui é só
      // do enfileiramento local (rápido, I/O de disco), não da rede.
      const summaryGuard = makeOutboxSummaryGuard(set);
      const { pendingCount, quarantineCount } = await enqueueAndDrain(
        draft.userId,
        {
          sessionLogId: sid,
          kind: 'save_set_log',
          payload: {
            sessionLogId: sid,
            plannedSetId: serie.plannedSetId,
            actualReps,
            actualLoadKg,
            actualRir,
            outcome,
            startedAt: serie.activatedAt,
            actualDurationSeconds,
            actualDistanceM,
            perceivedEffort,
          } satisfies SaveSetLogPayload,
        },
        {
          onSessionClosed: (closedSessionLogId) =>
            get().reconcileRemoteSessionClosed(closedSessionLogId),
          onSummaryChanged: summaryGuard.onSummaryChanged,
        },
      );
      // WR-01 (code review 04): só aplica o snapshot do enfileiramento se
      // NENHUM onSummaryChanged desta MESMA chamada já tiver escrito um
      // valor mais fresco enquanto aguardávamos (ver makeOutboxSummaryGuard).
      // O `set()` final desta função (mais abaixo) NÃO inclui
      // `pendingCount`/`quarantineCount` de propósito, para um onSummaryChanged
      // tardio nunca ser revertido por ele.
      summaryGuard.applyEnqueueSnapshot(pendingCount, quarantineCount);

      // CAS (F7): se a sessão ativa MUDOU durante o enfileiramento (usuário trocou
      // de treino), o item já está na fila do USUÁRIO certo (D-10: a fila é do
      // usuário, não da tela) — mas não escrevemos no draft de outra sessão.
      const atual = get().draft;
      if (
        operationEpoch !== epoch ||
        !atual ||
        atual.sessionLogId !== sid ||
        atual.status !== 'active'
      )
        return true;

      // Commit OTIMISTA (D-05): a série conclui AGORA com os valores LOCAIS já
      // calculados — nunca aguarda a confirmação do servidor. `setLogId` e
      // `completedAt` do servidor ainda não existem; ficam `null` até a fila
      // confirmar e a próxima retomada reconciliar via `applyServerSetLogs`.
      const lastLoad = { ...atual.lastLoadByExercise };
      if (actualLoadKg != null && !exercise.isBodyweight) {
        lastLoad[exerciseIdentity(exercise)] = actualLoadKg;
      }
      // Fase 17 (D-02): espelha lastLoad acima, SEM a checagem isBodyweight —
      // reps sempre contam, mesmo em peso corporal.
      const lastReps = { ...atual.lastRepsByExercise };
      if (actualReps != null) {
        lastReps[exerciseIdentity(exercise)] = actualReps;
      }
      const novo: SessionDraft = {
        ...withSet(atual, exerciseId, setOrder, (s) => ({
          ...s,
          status: 'done',
          actualReps,
          actualLoadKg,
          actualRir,
          outcome,
          setLogId: null,
          actualDurationSeconds,
          actualDistanceM,
          perceivedEffort,
          completedAt: null,
        })),
        lastLoadByExercise: lastLoad,
        lastRepsByExercise: lastReps,
      };
      const proxima = findNextPendingSet(novo);
      const restEndsAt =
        proxima && exercise.restSeconds != null && exercise.restSeconds > 0
          ? new Date(Date.now() + exercise.restSeconds * 1000).toISOString()
          : null;
      const draftDepoisDoDescanso: SessionDraft = { ...novo, restEndsAt };
      let finalDraft = draftDepoisDoDescanso;
      let pending: PendingAdaptation | null = null;
      // A adaptação roda DEPOIS do commit otimista e é inteiramente local — quebrar
      // aqui custa a SUGESTÃO, nunca o REGISTRO (a série já concluiu acima).
      try {
        // Fase 5: série fora do alvo → recomenda um ajuste. Dentro do alvo, só com
        // fôlego declarado (RIR >= rirBoostMinRir) o motor propõe aumento — qualquer
        // ponto da faixa, por regra rirBoostOnTargetAnywhere. O motor mexe em CARGA:
        // não tem o que propor para uma caminhada. Cardio conclui a série e segue.
        // GUARD DE ÚLTIMA SÉRIE: sem próxima série pendente do MESMO exercício, não
        // há proposta nem decisão automática — a adaptação é intra-exercício.
        const updatedEx = novo.exercises.find((e) => e.exerciseId === exerciseId);
        const hasNextPendingOfSameExercise =
          updatedEx?.sets.some((s) => s.setOrder > setOrder && s.status !== 'done') ?? false;
        if (hasNextPendingOfSameExercise && !cardio) {
          const evaluated = evaluateSet({
            actualReps: actualReps as number,
            targetRepsMin: serie.targetRepsMin,
            targetRepsMax: serie.targetRepsMax,
          });
          const recommendation = recommendByRules({
            evaluated,
            currentLoadKg: actualLoadKg,
            incrementKg: exercise.loadIncrementKg,
            ctx: { isBodyweight: exercise.isBodyweight, injury: exercise.hasInjury },
            actualRir,
          });
          if (recommendation.recommended.kind !== 'keep') {
            // Há um ajuste CONCRETO (topo da faixa, fora do alvo) → o aluno decide.
            pending = {
              exerciseId,
              setOrder,
              // setLogId ainda não existe (commit otimista, D-05) — fica null até a
              // fila confirmar. plannedSetId é a chave usada por resolveAdaptation
              // para enfileirar update_set_log_adaptation com resolução tardia de
              // setLogId (Pitfall 1, fechado nesta fase).
              setLogId: null,
              plannedSetId: serie.plannedSetId,
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
            // Fase 4 (REQ-07/Pitfall 1, fechado): a persistência desta decisão
            // AUTOMÁTICA via updateSetLogAdaptation volta a acontecer, agora via
            // fila — setLogId ainda não existe no commit otimista (D-05), então o
            // drenador resolve tardiamente via getOpenSessionLog. Best-effort,
            // fire-and-forget: NUNCA bloqueia o retorno de completeSet (já está
            // depois do commit otimista acima).
            void enqueueAndDrain(
              draft.userId,
              {
                sessionLogId: sid,
                kind: 'update_set_log_adaptation',
                payload: {
                  userId: draft.userId,
                  plannedSessionId: draft.plannedSessionId,
                  plannedSetId: serie.plannedSetId,
                  adaptation: autoKeep,
                  decision: buildAdaptationDecision(recommendation, autoKeep, true),
                } satisfies UpdateSetLogAdaptationPayload,
              },
              {
                onSessionClosed: (closedSessionLogId) =>
                  get().reconcileRemoteSessionClosed(closedSessionLogId),
                onSummaryChanged: (p, q) => set({ pendingCount: p, quarantineCount: q }),
              },
            );
          }
          // on_target + keep (sem progressão possível): nada — a série conclui e segue.
        }
      } catch (e) {
        // Descarta o resultado PARCIAL da adaptação e conclui a série com o estado
        // já commitado localmente. Sem aviso na tela: o registro está correto, e o
        // aluno não tem o que fazer com uma falha do motor de recomendação.
        finalDraft = draftDepoisDoDescanso;
        pending = null;
        console.warn('[activeSession] adaptação intra-sessão falhou (não-fatal, série registrada):', e);
      }
      // WR-01 (code review 04): pendingCount/quarantineCount NÃO entram
      // neste set() — já foram aplicados imediatamente acima, e um
      // onSummaryChanged mais fresco pode ter escrito por cima nesse meio
      // tempo; incluí-los aqui de novo com o snapshot antigo reverteria
      // esse valor mais fresco (Zustand só sobrescreve as chaves passadas).
      set({
        draft: finalDraft,
        saveError: null,
        pendingAdaptation: pending,
      });

      try {
        await saveDraft(finalDraft);
      } catch (e) {
        console.warn('[activeSession] rascunho não persistido (não-fatal):', e);
        set({ storageWarning: STORAGE_WARNING_MSG });
      }
      return true;
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
    // Captura userId/plannedSessionId ANTES de qualquer await (mesma cautela de
    // CAS do resto do arquivo): se a sessão ativa já não for mais a de `pending`
    // agora, não há como saber com segurança para qual sessão enfileirar — a
    // fila NUNCA recebe um item endereçado à sessão errada.
    const sessionMatches = !!atual && atual.sessionLogId === pending.sessionLogId;
    const userId = sessionMatches ? atual!.userId : null;
    const plannedSessionId = sessionMatches ? atual!.plannedSessionId : null;

    if (sessionMatches && atual!.exercises.some((e) => e.exerciseId === pending.exerciseId)) {
      const novo = applyAdjustmentToNextSet(
        atual!,
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
    // Fase 4 (REQ-07/Pitfall 1, fechado): a persistência da decisão — inclusive a
    // recusa ("manter") — volta a acontecer via fila, com resolução tardia de
    // setLogId (o drenador resolve via getOpenSessionLog). Best-effort:
    // fire-and-forget, nunca bloqueia a experiência do aluno.
    if (pending.sessionLogId && userId && plannedSessionId) {
      const decision = buildAdaptationDecision(pending.recommendation, adjustment, false);
      void enqueueAndDrain(
        userId,
        {
          sessionLogId: pending.sessionLogId,
          kind: 'update_set_log_adaptation',
          payload: {
            userId,
            plannedSessionId,
            plannedSetId: pending.plannedSetId,
            adaptation: adjustment,
            decision,
          } satisfies UpdateSetLogAdaptationPayload,
        },
        {
          onSessionClosed: (closedSessionLogId) =>
            get().reconcileRemoteSessionClosed(closedSessionLogId),
          onSummaryChanged: (p, q) => set({ pendingCount: p, quarantineCount: q }),
        },
      );
    }
  },

  // Fase 4 (REQ-07/Pitfall 3): P0001 descoberto pela fila durante a drenagem de
  // QUALQUER item de uma sessionLogId — a sub-fila inteira já foi descartada em
  // sessionOutboxDrain.ts; aqui só resta reconciliar o rascunho local. Replica
  // exatamente o bloco `isClosedSessionError` de antes desta fase: fecha a
  // sessão e aposenta o rascunho (mesmo caminho de `retireLocalDraft`).
  reconcileRemoteSessionClosed: (sessionLogId) => {
    const atual = get().draft;
    // Guarda de CAS: só age se ainda for a MESMA sessão — o aluno pode ter
    // trocado de treino entre o enfileiramento e a drenagem descobrir o P0001.
    if (!atual || atual.sessionLogId !== sessionLogId) return;
    set({
      draft: { ...atual, status: 'finished' },
      status: 'finished',
      saveError: null,
    });
    void retireLocalDraft(atual);
  },

  // Fase 16 (CMD, Plano 16-07 / D1): lê a fila durável do App Group de forma
  // NÃO-destrutiva e aplica cada entrada contra o MESMO completeSet()/
  // activateSet()/adjustRest() já existentes — nenhum caminho de gravação
  // paralelo. Guarda de CAS: relê get().draft A CADA iteração (não uma cópia
  // capturada antes do loop), porque completeSet() dentro do loop pode ele
  // mesmo mudar o draft antes da próxima iteração processar. Cada entrada só
  // é confirmada (ackQueuedLiveActivityIntent) DEPOIS de saber o resultado
  // real: aplicada com sucesso, ou definitivamente descartada por CAS
  // (sessionLogId ausente/divergente do draft atual). Uma entrada reprovada
  // por canCompleteSet() (dentro de completeSet()) NUNCA é acked — sobrevive
  // na fila para a próxima reconciliação (fecha 16-VERIFICATION.md gap 1).
  reconcileLiveActivityIntents: async () => {
    // Guarda de hidratação (16-VERIFICATION.md gap 1 / 16-REVIEW.md CR-01):
    // sem draft ativo candidato, a fila do App Group nunca é sequer lida —
    // mesmo sendo peekQueuedLiveActivityIntents() não-destrutiva agora, não
    // há draft para aplicar a entrada ainda.
    const draftAtual = get().draft;
    if (!draftAtual || draftAtual.status !== 'active') return;
    let entries: QueuedLiveActivityIntent[] = [];
    try {
      entries = await peekQueuedLiveActivityIntents();
    } catch (error) {
      console.warn(
        '[liveActivity] não foi possível ler a fila de intents:',
        error,
      );
      return;
    }
    for (const entry of entries) {
      const draft = get().draft;
      if (!draft || draft.status !== 'active') {
        // Descarte definitivo: não há sessão ativa para receber a entrada.
        void ackQueuedLiveActivityIntent(entry.id);
        continue;
      }
      // Plano 16-12: `sessionLogId` DIVERGENTE e `sessionLogId` NULO não são a
      // mesma coisa e não podem compartilhar destino. Divergente PROVA que a
      // entrada pertence a outra sessão — descartar está correto (guarda de
      // CAS original). Nulo prova apenas que a origem é desconhecida; tratá-lo
      // como divergente destruía, sem erro visível, um toque legítimo na Lock
      // Screen (sintoma reportado na sessão física de 2026-08-18: a série
      // "ficou como estava", sem qualquer mensagem).
      const pertenceAoDraft = entry.sessionLogId
        ? entry.sessionLogId === draft.sessionLogId
        : nasceuNestaSessao(entry.queuedAt, draft.startedAt);
      if (!pertenceAoDraft) {
        // Descarte definitivo por CAS: esta entrada nunca vai se tornar
        // aplicável tentando de novo (sessionLogId diverge, ou é órfã sem
        // prova de ter nascido nesta sessão) — confirma para não acumular
        // indefinidamente na fila.
        void ackQueuedLiveActivityIntent(entry.id);
        continue;
      }
      switch (entry.kind) {
        case 'completeSet': {
          const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
          let aplicado = true;
          if (alvo) {
            aplicado = await get().completeSet(alvo.exercise.exerciseId, alvo.set.setOrder);
          }
          // Só confirma quando completeSet() retornou true OU quando não
          // havia nenhum alvo (nada a completar, situação terminal — não é
          // reprovação de validação). Reprovado por canCompleteSet() NUNCA
          // é acked aqui.
          if (aplicado) void ackQueuedLiveActivityIntent(entry.id);
          break;
        }
        case 'skipRest': {
          const proxima = findNextPendingSet(draft);
          if (proxima) get().activateSet(proxima.exercise.exerciseId, proxima.set.setOrder);
          void ackQueuedLiveActivityIntent(entry.id);
          break;
        }
        case 'adjustRest': {
          if (entry.deltaSeconds != null) get().adjustRest(entry.deltaSeconds);
          void ackQueuedLiveActivityIntent(entry.id);
          break;
        }
        case 'adjustReps': {
          const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
          // CR-01 (decisão do dono, 2026-08-19): deltaValue ausente numa
          // entrada adjustReps/adjustLoad é estado inválido — pós-fix o
          // Record nativo sempre preenche; ausência = entrada de formato
          // antigo/corrompida. NÃO ackar preserva o ajuste para a próxima
          // reconciliação; ackar aqui destruiria, sem erro nem log, um toque
          // legítimo da Lock Screen (o próprio bug CR-01 fazia isso).
          if (entry.deltaValue == null) {
            console.warn(
              `[activeSession] intent ${entry.id} (${entry.kind}) ignorado: deltaValue ausente — mantido na fila`,
            );
            break;
          }
          if (alvo) {
            get().stepReps(alvo.exercise.exerciseId, alvo.set.setOrder, entry.deltaValue > 0 ? 1 : -1);
          }
          // Ack incondicional (mesmo padrão de adjustRest, diferente de
          // completeSet): ajustar reps/carga não tem uma "reprovação" de
          // canCompleteSet a respeitar — é sempre aplicável quando há alvo.
          void ackQueuedLiveActivityIntent(entry.id);
          break;
        }
        case 'adjustLoad': {
          const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
          if (entry.deltaValue == null) {
            console.warn(
              `[activeSession] intent ${entry.id} (${entry.kind}) ignorado: deltaValue ausente — mantido na fila`,
            );
            break;
          }
          if (alvo) {
            get().stepLoad(alvo.exercise.exerciseId, alvo.set.setOrder, entry.deltaValue > 0 ? 1 : -1);
          }
          void ackQueuedLiveActivityIntent(entry.id);
          break;
        }
      }
    }
  },

  setOutboxSummary: (pendingCount, quarantineCount) => {
    set({ pendingCount, quarantineCount });
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
    // Fase 4 (REQ-07/D-05 estendido às 4 operações do D-01 que faltavam):
    // enfileira em vez de aguardar a RPC. A mudança local aplica IMEDIATAMENTE
    // após o enfileiramento resolver (só I/O local, rápido) — falha de rede ou
    // de servidor NUNCA seta saveError a partir de agora (só falha de
    // validação local, que já rodou acima).
    const summaryGuard = makeOutboxSummaryGuard(set);
    const { pendingCount, quarantineCount } = await enqueueAndDrain(
      draft.userId,
      {
        sessionLogId: sid,
        kind: 'skip_session_exercise',
        payload: {
          sessionLogId: sid,
          plannedExerciseId: exerciseId,
          reason,
          note: note ?? null,
        } satisfies SkipSessionExercisePayload,
      },
      {
        onSessionClosed: (closedSessionLogId) =>
          get().reconcileRemoteSessionClosed(closedSessionLogId),
        onSummaryChanged: summaryGuard.onSummaryChanged,
      },
    );
    // WR-01 (code review 04): ver makeOutboxSummaryGuard. O set() final
    // abaixo NÃO inclui mais pendingCount/quarantineCount de propósito.
    summaryGuard.applyEnqueueSnapshot(pendingCount, quarantineCount);

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
    // Fase 4 (REQ-07): mesmo molde de skipExercise — enfileira, aplica local
    // imediatamente, nunca seta saveError por falha de rede.
    const summaryGuard = makeOutboxSummaryGuard(set);
    const { pendingCount, quarantineCount } = await enqueueAndDrain(
      draft.userId,
      {
        sessionLogId: sid,
        kind: 'unskip_session_exercise',
        payload: {
          sessionLogId: sid,
          plannedExerciseId: exerciseId,
        } satisfies UnskipSessionExercisePayload,
      },
      {
        onSessionClosed: (closedSessionLogId) =>
          get().reconcileRemoteSessionClosed(closedSessionLogId),
        onSummaryChanged: summaryGuard.onSummaryChanged,
      },
    );
    // WR-01 (code review 04): ver makeOutboxSummaryGuard.
    summaryGuard.applyEnqueueSnapshot(pendingCount, quarantineCount);

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

  swapExercise: async (exerciseId, toModality) => {
    const draft = get().draft;
    if (!draft || !draft.sessionLogId) {
      set({ saveError: 'Sessão não iniciada corretamente.' });
      return false;
    }
    const alvo = draft.exercises.find((ex) => ex.exerciseId === exerciseId);
    if (!alvo) return false;
    // Já trocado para a mesma modalidade: nada a fazer (guarda de toque duplo).
    if (alvo.name === toModality) return true;
    // CR-01 (decisão do dono, semântica a): com série já concluída, trocar
    // reescreveria o histórico — a série feita seria exibida sob uma modalidade
    // em que nunca foi executada. A recusa mora AQUI, antes do servidor (a RPC
    // aceitaria: a guarda dela é mais frouxa e a migration 0034 não será
    // editada); o banner de erro é o mesmo canal do skipExercise.
    if (alvo.sets.some((s) => s.status === 'done')) {
      set({ saveError: 'Não é possível trocar a modalidade depois de uma série concluída.' });
      return false;
    }

    const epoch = operationEpoch;
    const sid = draft.sessionLogId;
    // Fase 4 (REQ-07): mesmo molde de skipExercise/unskipExercise — enfileira,
    // aplica local imediatamente, nunca seta saveError por falha de rede. A
    // guarda CR-01 acima já rodou ANTES de qualquer chamada de fila.
    const summaryGuard = makeOutboxSummaryGuard(set);
    const { pendingCount, quarantineCount } = await enqueueAndDrain(
      draft.userId,
      {
        sessionLogId: sid,
        kind: 'swap_session_exercise',
        payload: {
          sessionLogId: sid,
          plannedExerciseId: exerciseId,
          toModality,
          note: null,
        } satisfies SwapSessionExercisePayload,
      },
      {
        onSessionClosed: (closedSessionLogId) =>
          get().reconcileRemoteSessionClosed(closedSessionLogId),
        onSummaryChanged: summaryGuard.onSummaryChanged,
      },
    );
    // WR-01 (code review 04): ver makeOutboxSummaryGuard.
    summaryGuard.applyEnqueueSnapshot(pendingCount, quarantineCount);

    const atual = get().draft;
    if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid) return true;
    const novo = applyCardioSwapToDraft(atual, exerciseId, toModality);
    set({
      draft: novo,
      saveError: null,
      // Uma adaptação pendente do exercício trocado não faz mais sentido: o
      // sheet pediria decisão de carga para uma modalidade que não é mais esta.
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
    // Fase 4 (REQ-07/D-08): finalizar NÃO bloqueia — enfileira `finish_session`
    // (RPC idempotente, migration 0004) em vez de aguardar a confirmação do
    // servidor. A tela de fim aparece como hoje; o item fica pendente na fila
    // (storage próprio, D-09) e drena em segundo plano mesmo depois de
    // `retireLocalDraft` limpar o rascunho abaixo.
    const summaryGuard = makeOutboxSummaryGuard(set);
    const { pendingCount, quarantineCount } = await enqueueAndDrain(
      draft.userId,
      { sessionLogId: sid, kind: 'finish_session', payload: {} },
      {
        onSessionClosed: (closedSessionLogId) =>
          get().reconcileRemoteSessionClosed(closedSessionLogId),
        onSummaryChanged: summaryGuard.onSummaryChanged,
      },
    );
    // WR-01 (code review 04): ver makeOutboxSummaryGuard.
    summaryGuard.applyEnqueueSnapshot(pendingCount, quarantineCount);

    // CAS (F7): se o usuário trocou de sessão durante o enfileiramento, o item
    // já está na fila do USUÁRIO certo (D-10), mas NÃO mexemos no estado nem
    // limpamos o rascunho da OUTRA sessão.
    const atual = get().draft;
    if (operationEpoch !== epoch || !atual || atual.sessionLogId !== sid)
      return true;

    set({
      draft: { ...atual, status: 'finished' },
      status: 'finished',
      saveError: null,
    });
    // Só limpa o rascunho DEPOIS de finalizar localmente, e só porque o draft atual
    // AINDA é esta sessão (não por userId cego — evita apagar a sessão trocada).
    await retireLocalDraft(atual);
    return true;
  },

  clearError: () => set({ saveError: null }),
  clearStorageWarning: () => set({ storageWarning: null }),
  clearReplanWarning: () => set({ replanWarning: null }),

  reset: (userId) => {
    operationEpoch += 1;
    const resyncEpoch = operationEpoch;
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
      // Achado 5 (painel 05-02): SEM userId (fallback defensivo — nenhum
      // chamador real do produto omite hoje), não há como resincronizar
      // contra a fila real, então mantém o comportamento anterior (zera).
      // COM userId, os contadores atuais ficam como estão (a fila é do
      // usuário, D-10 — não zeram) até o resync abaixo confirmar o valor
      // real; zerar aqui só para o resync sobrescrever um instante depois
      // seria o mesmo "some e volta" que o achado 5 reportou.
      ...(userId ? {} : { pendingCount: 0, quarantineCount: 0 }),
    });
    if (!userId) return;
    void loadOutbox(userId)
      .then((doc) => {
        // Outro reset()/troca de sessão aconteceu enquanto o resync estava
        // em voo — o valor mais fresco já venceu, não sobrescreve (mesma
        // cautela de CAS do resto do arquivo).
        if (operationEpoch !== resyncEpoch) return;
        set({ pendingCount: doc.items.length, quarantineCount: doc.quarantine.length });
      })
      .catch((e) => {
        console.warn(
          '[activeSession] falha ao resincronizar selo de pendência no reset (não-fatal, achado 5):',
          e,
        );
      });
  },
}));
