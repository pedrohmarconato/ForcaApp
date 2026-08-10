// src/services/sessionExecutionRepository.ts
// Fase 4 — Escrita/leitura da EXECUÇÃO da sessão (session_logs / set_logs).
// Mesmo padrão da leitura da Fase 3: cliente único (config/supabaseClient),
// JWT do usuário e RLS por usuário. Erro do banco SEMPRE propaga (throw) —
// nunca é engolido como sucesso (achado recorrente: série "salva" que não salvou).
//
// A coluna set_logs.adaptation fica NULA nesta fase: registrar desempenho e
// calcular o outcome é Fase 4; decidir o ajuste é Fase 5.

import { supabase } from '../config/supabaseClient';
import type { Outcome, SkipReason, PerceivedEffort, ExerciseMetric } from '../engine/sessionModel';
import { exerciseIdentity, isSkipReason, toNum } from '../engine/sessionModel';
import type { SetLogResumo } from '../engine/progressStats';
import type { CardioModalidade } from '../constants/cardioModalidades';
import { isCardioModalidade } from '../constants/cardioModalidades';

export type ServerSetLog = {
  id: string;
  planned_set_id: string | null;
  // Nulo em cardio/isometria (0014): lá a medição é duração/distância.
  actual_reps: number | null;
  actual_load_kg: number | null;
  actual_rir: number | null;
  actual_duration_seconds?: number | null;
  actual_distance_m?: number | null;
  perceived_effort?: 'leve' | 'moderado' | 'forte' | null;
  outcome: Outcome | null;
  // Decisão de adaptação persistida (Fase 5). Restaurada e reaplicada na retomada.
  adaptation: import('../engine/intraSessionAdaptation').Adjustment | null;
  completed_at: string;
};

export type OpenSessionLog = {
  sessionLogId: string;
  startedAt: string;
  setLogs: ServerSetLog[];
  // Fase 6 — replanejamento confirmado fica registrado no log; a retomada reaplica
  // o corte de tempo a partir daqui (o rascunho local não é autoritativo).
  availableMinutes: number | null;
  adherenceSnapshot: unknown;
  /** Check-in pré-treino gravado no start_session (null em sessões pré-0011). */
  mood: 'cansado' | 'normal' | 'com_energia' | null;
  /**
   * Recusas declaradas nesta execução (0020). Vem do SERVIDOR porque o rascunho
   * local não é autoritativo: recusar e fechar o app antes de o rascunho gravar
   * traria de volta, na retomada, um exercício que o aluno dispensou.
   */
  exerciseSkips: ServerExerciseSkip[];
  /**
   * Trocas de modalidade de cardio registradas nesta execução (Fase 3, D-08).
   * Vem do SERVIDOR pela mesma razão de `exerciseSkips`: o rascunho local não
   * é autoritativo — trocar e fechar o app antes de o rascunho gravar não
   * pode perder a troca na retomada.
   */
  exerciseSwaps: ServerCardioSwap[];
};

export type ServerExerciseSkip = {
  plannedExerciseId: string;
  reason: SkipReason;
  note: string | null;
};

export type ServerCardioSwap = {
  plannedExerciseId: string;
  toModality: CardioModalidade;
  note: string | null;
};

type RequestErrorKind = 'transport' | 'server';

/**
 * Erro normalizado na fronteira do Supabase. A classificação usa o status HTTP
 * que o postgrest-js entrega junto da resposta: status 0 é fetch/abort; qualquer
 * resposta HTTP (inclusive 401/403 sem `.code`) é falha do servidor e não pode ser
 * mascarada como retomada offline.
 */
export class SessionExecutionRequestError extends Error {
  readonly kind: RequestErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(
    error: unknown,
    options: { status?: number | null; kind?: RequestErrorKind } = {},
  ) {
    const record =
      typeof error === 'object' && error !== null
        ? (error as Record<string, unknown>)
        : null;
    const message =
      error instanceof Error
        ? error.message
        : typeof record?.message === 'string'
          ? record.message
          : 'Erro inesperado ao falar com o servidor.';
    super(message);
    this.name = 'SessionExecutionRequestError';
    this.status = options.status ?? null;
    this.kind = options.kind ?? (options.status === 0 ? 'transport' : 'server');
    this.code =
      typeof record?.code === 'string' && record.code.length > 0
        ? record.code
        : null;
    this.details = typeof record?.details === 'string' ? record.details : null;
    this.hint = typeof record?.hint === 'string' ? record.hint : null;
  }
}

export const isTransportSessionExecutionError = (
  error: unknown,
): error is SessionExecutionRequestError =>
  error instanceof SessionExecutionRequestError && error.kind === 'transport';

const thrownRequestError = (error: unknown): SessionExecutionRequestError => {
  const name =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : '';
  // fetch em React Native rejeita com TypeError; AbortController usa AbortError.
  const transport = error instanceof TypeError || name === 'AbortError';
  return new SessionExecutionRequestError(error, {
    kind: transport ? 'transport' : 'server',
  });
};

const throwResponseError = (error: unknown, status?: number): never => {
  throw new SessionExecutionRequestError(error, { status: status ?? null });
};

/**
 * Abre a execução de forma ATÔMICA via RPC `start_session` (migrations 0004/0005):
 * numa transação, reaproveita o session_log aberto ou cria um novo e marca a
 * sessão planejada 'in_progress'. Idempotente (reusa log aberto) — não duplica
 * session_log em retry/corrida. Retorna id + started_at do servidor.
 */
export const startSessionLog = async (
  plannedSessionId: string,
  checkIn?: {
    mood: 'cansado' | 'normal' | 'com_energia';
    availableMinutes: number | null;
  },
): Promise<{ sessionLogId: string; startedAt: string }> => {
  let response: any;
  try {
    response = await supabase.rpc('start_session', {
      p_planned_session_id: plannedSessionId,
      p_mood: checkIn?.mood ?? null,
      p_available_minutes: checkIn?.availableMinutes ?? null,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  const { data, error, status } = response;
  if (error) throwResponseError(error, status);
  // A função retorna a linha de session_logs (objeto; alguns setups devolvem array).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('start_session não retornou a sessão de log.');
  return {
    sessionLogId: row.id as string,
    startedAt: row.started_at as string,
  };
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
  let response: any;
  try {
    // Uma única instrução SQL/PostgREST produz um snapshot coerente: não há janela
    // para finish_session acontecer entre a leitura do log e a leitura das séries.
    response = await supabase
      .from('session_logs')
      .select(
        'id, started_at, available_minutes, mood, adherence_snapshot, set_logs(id, planned_set_id, actual_reps, actual_load_kg, actual_rir, outcome, adaptation, completed_at, actual_duration_seconds, actual_distance_m, perceived_effort), exercise_skips(planned_exercise_id, reason, note), cardio_exercise_swaps(planned_exercise_id, to_modality, note)',
      )
      .eq('user_id', userId)
      .eq('planned_session_id', plannedSessionId)
      .is('finished_at', null)
      .order('started_at', { ascending: false })
      .limit(1);
  } catch (error) {
    throw thrownRequestError(error);
  }
  if (response.error) throwResponseError(response.error, response.status);
  const row = response.data?.[0];
  if (!row) return null;

  const setLogs = ((row.set_logs ?? []) as any[])
    .map((s) => ({
      id: s.id,
      planned_set_id: s.planned_set_id,
      actual_reps: toNum(s.actual_reps),
      actual_load_kg: toNum(s.actual_load_kg),
      actual_rir: toNum(s.actual_rir),
      actual_duration_seconds: toNum(s.actual_duration_seconds),
      actual_distance_m: toNum(s.actual_distance_m),
      perceived_effort: s.perceived_effort ?? null,
      outcome: s.outcome,
      adaptation: s.adaptation ?? null,
      completed_at: s.completed_at,
    }))
    // Série de cardio não tem repetição: exigir actual_reps aqui apagaria toda
    // a execução de cardio na retomada. Vale ter reps OU duração.
    .filter(
      (s) =>
        typeof s.id === 'string' &&
        (s.actual_reps != null || s.actual_duration_seconds != null),
    )
    .sort((a, b) =>
      String(a.completed_at).localeCompare(String(b.completed_at)),
    ) as ServerSetLog[];

  // Motivo desconhecido (linha gravada por versão mais nova do app) é
  // DESCARTADO, não coagido para 'outro': inventar o motivo estragaria a
  // agregação por motivo, que é a razão de o vocabulário ser fechado.
  const exerciseSkips = ((row.exercise_skips ?? []) as any[]).flatMap((s) =>
    typeof s?.planned_exercise_id === 'string' && isSkipReason(s?.reason)
      ? [
          {
            plannedExerciseId: s.planned_exercise_id,
            reason: s.reason,
            note: typeof s.note === 'string' && s.note.length > 0 ? s.note : null,
          } as ServerExerciseSkip,
        ]
      : [],
  );

  // Modalidade desconhecida (linha gravada por versão mais nova do app, ou
  // drift entre banco e catálogo do cliente) é DESCARTADA, não coagida: um
  // valor não reconhecido nunca deve propagar para o draft/UI.
  const exerciseSwaps = ((row.cardio_exercise_swaps ?? []) as any[]).flatMap((sw) =>
    typeof sw?.planned_exercise_id === 'string' && isCardioModalidade(sw?.to_modality)
      ? [
          {
            plannedExerciseId: sw.planned_exercise_id,
            toModality: sw.to_modality,
            note: typeof sw.note === 'string' && sw.note.length > 0 ? sw.note : null,
          } as ServerCardioSwap,
        ]
      : [],
  );

  return {
    sessionLogId: row.id as string,
    startedAt: row.started_at as string,
    setLogs,
    availableMinutes: toNum(row.available_minutes),
    adherenceSnapshot: row.adherence_snapshot ?? null,
    mood:
      row.mood === 'cansado' || row.mood === 'normal' || row.mood === 'com_energia'
        ? row.mood
        : null,
    exerciseSkips,
    exerciseSwaps,
  };
};

/**
 * Recusa um exercício da execução em aberto via RPC `skip_session_exercise`
 * (0020). Erro propaga: a recusa não pode aparecer aplicada na tela se o banco
 * a rejeitou — o exercício voltaria a ser exigido na próxima retomada.
 *
 * Idempotente por (session_log, exercício): repetir troca o motivo, não empilha.
 */
export const skipSessionExercise = async (params: {
  sessionLogId: string;
  plannedExerciseId: string;
  reason: SkipReason;
  note?: string | null;
}): Promise<ServerExerciseSkip> => {
  let response: any;
  try {
    response = await supabase.rpc('skip_session_exercise', {
      p_session_log_id: params.sessionLogId,
      p_planned_exercise_id: params.plannedExerciseId,
      p_reason: params.reason,
      p_note: params.note ?? null,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  const { data, error, status } = response;
  if (error) throwResponseError(error, status);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.planned_exercise_id) {
    throw new Error('skip_session_exercise não retornou a recusa.');
  }
  return {
    plannedExerciseId: row.planned_exercise_id as string,
    reason: (isSkipReason(row.reason) ? row.reason : params.reason) as SkipReason,
    note: typeof row.note === 'string' && row.note.length > 0 ? row.note : null,
  };
};

/**
 * Troca a modalidade de um exercício de cardio via RPC `swap_session_exercise`
 * (migration 0034, Plano 03-01). Erro propaga: a troca não pode aparecer
 * aplicada na tela se o banco a rejeitou (mesma razão de `skipSessionExercise`
 * — o exercício voltaria a exigir a modalidade original na próxima retomada).
 *
 * Idempotente por (session_log, exercício): repetir a troca corrige a
 * escolha, não empilha.
 */
export const swapSessionExercise = async (params: {
  sessionLogId: string;
  plannedExerciseId: string;
  toModality: CardioModalidade;
  note?: string | null;
}): Promise<ServerCardioSwap> => {
  let response: any;
  try {
    response = await supabase.rpc('swap_session_exercise', {
      p_session_log_id: params.sessionLogId,
      p_planned_exercise_id: params.plannedExerciseId,
      p_to_modality: params.toModality,
      p_note: params.note ?? null,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  const { data, error, status } = response;
  if (error) throwResponseError(error, status);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.planned_exercise_id) {
    throw new Error('swap_session_exercise não retornou a troca.');
  }
  return {
    plannedExerciseId: row.planned_exercise_id as string,
    toModality: (isCardioModalidade(row.to_modality)
      ? row.to_modality
      : params.toModality) as CardioModalidade,
    note: typeof row.note === 'string' && row.note.length > 0 ? row.note : null,
  };
};

/** Desfaz a recusa de um exercício. Sem recusa registrada, devolve false. */
export const unskipSessionExercise = async (params: {
  sessionLogId: string;
  plannedExerciseId: string;
}): Promise<boolean> => {
  let response: any;
  try {
    response = await supabase.rpc('unskip_session_exercise', {
      p_session_log_id: params.sessionLogId,
      p_planned_exercise_id: params.plannedExerciseId,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  const { data, error, status } = response;
  if (error) throwResponseError(error, status);
  return data === true;
};

/**
 * Recusa a sessão inteira ("não vou treinar hoje") via `skip_planned_session`.
 * A RPC fecha a execução em aberto, se houver, e registra motivo + autoria.
 */
export const skipPlannedSession = async (params: {
  plannedSessionId: string;
  reason: SkipReason;
  note?: string | null;
}): Promise<void> => {
  let response: any;
  try {
    response = await supabase.rpc('skip_planned_session', {
      p_planned_session_id: params.plannedSessionId,
      p_reason: params.reason,
      p_note: params.note ?? null,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  if (response.error) throwResponseError(response.error, response.status);
};

/**
 * Desfaz a recusa da sessão. Só o que o ALUNO recusou volta (55000 quando a
 * marcação é do replanejador — reagendar uma data vencida é outro problema).
 */
export const unskipPlannedSession = async (
  plannedSessionId: string,
): Promise<void> => {
  let response: any;
  try {
    response = await supabase.rpc('unskip_planned_session', {
      p_planned_session_id: plannedSessionId,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  if (response.error) throwResponseError(response.error, response.status);
};

/**
 * Grava a execução de UMA série via RPC ATÔMICA `save_set_log` (migrations 0004/0005).
 * Erro propaga (a série NÃO pode ser marcada como feita se o banco recusou).
 * Devolve o id do set_log para guardar contra gravação dupla ao retomar.
 *
 * Por que RPC e não `.upsert(...,{onConflict})` (F1 — BLOCKER): o supabase-js gera
 * `ON CONFLICT (cols)` SEM predicado, e o índice único é PARCIAL
 * (`WHERE planned_set_id IS NOT NULL`) — o Postgres NÃO consegue inferir um índice
 * parcial sem o predicado explícito e devolve 42P10. A função usa
 * `ON CONFLICT (...) WHERE planned_set_id IS NOT NULL`, que casa o índice parcial
 * (F1). A 0005 mantém a primeira linha em retries concorrentes e a devolve como
 * resultado autoritativo. A função ainda recusa log finalizado/alheio e planned_set
 * de outra sessão (F2/F6/F9). adaptation continua nulo (Fase 5).
 */
export const saveSetLog = async (
  params: {
    sessionLogId: string;
    plannedSetId: string;
    actualReps: number | null;
    actualLoadKg: number | null;
    actualRir: number | null;
    outcome: Outcome;
    /** Momento da ATIVAÇÃO da série (lacuna 2: tempo real por série). */
    startedAt?: string | null;
    /** Cardio/isometria (0014): medição por tempo, distância e esforço. */
    actualDurationSeconds?: number | null;
    actualDistanceM?: number | null;
    perceivedEffort?: 'leve' | 'moderado' | 'forte' | null;
  },
  signal?: AbortSignal,
): Promise<{
  setLogId: string;
  actualReps: number | null;
  actualLoadKg: number | null;
  actualRir: number | null;
  outcome: Outcome;
  actualDurationSeconds: number | null;
  actualDistanceM: number | null;
  paceSecondsPerKm: number | null;
  perceivedEffort: 'leve' | 'moderado' | 'forte' | null;
  /** Carimbo do servidor da conclusão (set_logs.completed_at) — alimenta a linha do tempo do tempo efetivo. */
  completedAt: string;
}> => {
  const request = supabase.rpc('save_set_log', {
    p_session_log_id: params.sessionLogId,
    p_planned_set_id: params.plannedSetId,
    p_actual_reps: params.actualReps,
    p_actual_load_kg: params.actualLoadKg,
    p_actual_rir: params.actualRir,
    p_outcome: params.outcome,
    p_started_at: params.startedAt ?? null,
    p_actual_duration_seconds: params.actualDurationSeconds ?? null,
    p_actual_distance_m: params.actualDistanceM ?? null,
    p_perceived_effort: params.perceivedEffort ?? null,
  });
  let response: any;
  try {
    response = signal ? await request.abortSignal(signal) : await request;
  } catch (error) {
    throw thrownRequestError(error);
  }
  const { data, error, status } = response;
  if (error) throwResponseError(error, status);
  // A função retorna a linha de set_logs (objeto; alguns setups devolvem array).
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error('save_set_log não retornou a série gravada.');
  const actualReps = toNum(row.actual_reps);
  const actualDurationSeconds = toNum(row.actual_duration_seconds);
  // Uma série válida tem repetições (musculação) OU duração (cardio/isometria).
  if (
    (actualReps == null && actualDurationSeconds == null) ||
    !['on_target', 'under', 'over'].includes(row.outcome)
  ) {
    throw new Error('save_set_log retornou uma série inválida.');
  }
  // completed_at é not null default now() no banco — ausente aqui é quebra de
  // contrato, não caso de uso. Não fabricamos carimbo local: a linha do tempo
  // do tempo efetivo precisa do relógio do SERVIDOR.
  if (typeof row.completed_at !== 'string' || row.completed_at.length === 0) {
    throw new Error('save_set_log retornou série sem completed_at.');
  }
  return {
    setLogId: row.id as string,
    actualReps,
    actualLoadKg: toNum(row.actual_load_kg),
    actualRir: toNum(row.actual_rir),
    outcome: row.outcome as Outcome,
    actualDurationSeconds,
    actualDistanceM: toNum(row.actual_distance_m),
    // Coluna GERADA no banco: o pace vem calculado de lá, nunca do cliente.
    paceSecondsPerKm: toNum(row.pace_seconds_per_km),
    perceivedEffort: row.perceived_effort ?? null,
    completedAt: row.completed_at,
  };
};

/**
 * Grava a DECISÃO de adaptação (Fase 5) numa série JÁ registrada, via UPDATE direto.
 * A RLS "own set logs" é `for all` — o dono pode atualizar a própria linha. É secundário
 * à experiência (o chamador trata a falha como não-fatal), mas o erro PROPAGA aqui, nunca
 * é engolido. Não colide com o first-write-wins do save_set_log (aquele guarda o INSERT;
 * este só carimba a coluna `adaptation`, que o save_set_log nunca toca).
 */
export const updateSetLogAdaptation = async (
  setLogId: string,
  adaptation: unknown,
  decision?: unknown,
): Promise<void> => {
  // `adaptation` = Adjustment escolhido (usado no replay da retomada).
  // `decision` = envelope de telemetria (lacuna 1: proposta ↔ escolha).
  const patch: Record<string, unknown> = { adaptation };
  if (decision !== undefined) patch.adaptation_decision = decision;
  let response: any;
  try {
    response = await supabase
      .from('set_logs')
      .update(patch)
      .eq('id', setLogId);
  } catch (error) {
    throw thrownRequestError(error);
  }
  if (response.error) throwResponseError(response.error, response.status);
};

/**
 * Fecha a execução de forma ATÔMICA via RPC `finish_session` (migration 0004):
 * numa transação, seta finished_at e a sessão 'completed'. Repetir no mesmo log do
 * usuário é sucesso; log inexistente/alheio continua sendo erro (F4/F6).
 */
export const finishSessionLog = async (sessionLogId: string): Promise<void> => {
  let response: any;
  try {
    response = await supabase.rpc('finish_session', {
      p_session_log_id: sessionLogId,
    });
  } catch (error) {
    throw thrownRequestError(error);
  }
  if (response.error) throwResponseError(response.error, response.status);
};

/**
 * Última carga registrada por exercício (identidade → kg), a partir do histórico
 * de set_logs do usuário (RLS já restringe às execuções dele).
 * Usada para SUGERIR a carga na próxima vez — decisão nº 4 do plano.
 * Só considera exercícios cujas identidades foram pedidas.
 *
 * A identidade é a chave do catálogo quando existe. Casar por NOME fazia o
 * histórico morrer em qualquer variação do rótulo: "Supino com Halteres" e
 * "Supino com Halteres (Deload)" eram exercícios diferentes para a sugestão.
 *
 * Exclui set_logs de planos purpose='joint' (achado A2): a cópia materializada
 * do treino conjunto preserva o exercise_key do exercício de origem (migration
 * 0026), então sem esse filtro uma carga registrada no treino EM DUPLA
 * contamina a sugestão do treino SOLO. O join até training_plans usa a mesma
 * relação já embutida (planned_sets→planned_exercises→planned_sessions→
 * training_plans); nada de coluna denormalizada.
 *
 * O filtro de purpose vai DENTRO da query, antes do `.limit(300)` (achado P4):
 * um usuário com 300 set_logs joint mais recentes que o set_log solo perdia a
 * sugestão porque o corte de 300 linhas acontecia no banco ANTES de o filtro
 * (que só rodava depois, em JS) ter chance de excluir as linhas joint — o
 * registro solo mais antigo nunca entrava na janela. `!inner` em cada nível do
 * embed (padrão já usado em cardioGoalRepository.getCardioLogs) faz o filtro
 * de purpose excluir a linha de set_logs inteira, não só o embed.
 *
 * Janela de deploy (migration 0026): enquanto a coluna training_plans.purpose
 * não existe no banco, QUALQUER SELECT que a embuta devolve 42703 — e as três
 * leituras deste arquivo cairiam em estado de erro (Home/Progresso/Perfil/
 * Histórico) ou perderiam a sugestão de carga em silêncio (seedLastLoads
 * engole). Por isso cada consulta tem um segundo pente SEM o embed/filtro de
 * purpose, acionado só no 42703 (mesmo padrão do fallback de
 * agendaRepository.ts:43-46). O filtro anti-joint volta a valer sozinho quando
 * a 0026 chegar ao banco — gate de flag NÃO resolve, porque estas funções
 * rodam também para usuário solo.
 */
const erroDeColunaAusente = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === '42703';

/**
 * A MESSAGE de um 42703 cita a coluna que faltou (ex.: "column
 * session_logs.active_seconds does not exist") — serve de dica de qual
 * degrau tentar em seguida (achado N7). Dica errada só custa um degrau
 * extra, nunca quebra: o último recurso da escada não depende dela.
 */
const erroCitaColuna = (error: unknown, coluna: string): boolean =>
  typeof (error as { message?: string } | null)?.message === 'string' &&
  (error as { message: string }).message.includes(coluna);

export const getLastLoadByExercise = async (
  identities: string[],
): Promise<Record<string, number>> => {
  if (identities.length === 0) return {};
  const alvo = new Set(identities);

  const consultaCargas = (comPurpose: boolean) => {
    const query = supabase
      .from('set_logs')
      .select(
        comPurpose
          ? 'actual_load_kg, completed_at, planned_sets!inner(planned_exercises!inner(name, exercise_key, planned_sessions!inner(training_plans!inner(purpose))))'
          : 'actual_load_kg, completed_at, planned_sets!inner(planned_exercises!inner(name, exercise_key))',
      )
      .not('actual_load_kg', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(300);
    return comPurpose
      ? query.neq(
          'planned_sets.planned_exercises.planned_sessions.training_plans.purpose',
          'joint',
        )
      : query;
  };

  let { data, error } = await consultaCargas(true);
  if (erroDeColunaAusente(error)) {
    // 0026 ausente no banco: refaz sem o embed/filtro de purpose e segue.
    ({ data, error } = await consultaCargas(false));
  }
  if (error) throw error;

  const mapa: Record<string, number> = {};
  for (const linha of (data ?? []) as any[]) {
    const exercicio = linha?.planned_sets?.planned_exercises;
    const nome: string | undefined = exercicio?.name;
    const carga = linha?.actual_load_kg;
    if (!nome || carga == null) continue;
    const purpose = exercicio?.planned_sessions?.training_plans?.purpose;
    if (purpose === 'joint') continue;
    const chave = exerciseIdentity({
      exerciseKey: exercicio?.exercise_key ?? null,
      name: nome,
    });
    if (!alvo.has(chave)) continue;
    // Ordenado por completed_at desc → o PRIMEIRO visto é o mais recente.
    const numeric = toNum(carga);
    if (!(chave in mapa) && numeric != null) mapa[chave] = numeric;
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
  // Tempo efetivo em segundos (migration 0028). Null enquanto a coluna não
  // existe no banco (janela de deploy) ou a sessão não foi fechada pela nova
  // finish_session — a tela mostra "—", nunca o relógio de parede bruto.
  activeSeconds: number | null;
  /**
   * true quando a sessão veio de um plano purpose='joint' (achado A4: sem
   * isso, uma sessão de treino EM DUPLA aparecia como se fosse solo no
   * Histórico). training_plans é alcançado pela mesma relação já embutida
   * (session_logs→planned_sessions→training_plans); nada de coluna
   * denormalizada.
   */
  origemJoint: boolean;
};

// O PostgREST corta qualquer resposta em `max_rows` (1000 no config deste
// projeto) mesmo sem `.limit()` — sem paginação, "Sessões" e "Tempo total"
// virariam números parciais plausíveis a partir do registro 1001.
const PAGINA_HISTORICO = 1000;

/**
 * TODAS as sessões concluídas do usuário (finished_at preenchido), ordenadas
 * pela CONCLUSÃO mais recente — é a conclusão que define "última sessão", não
 * o início. Pagina até a última linha para os agregados serem totais de fato.
 */
export const getCompletedSessions = async (
  userId: string,
): Promise<CompletedSessionSummary[]> => {
  // As duas colunas (purpose da migration 0026, active_seconds da 0028) são
  // INDEPENDENTES uma da outra — por isso o select é montado combinando os
  // dois flags separadamente (achado N7), em vez de 3 strings fixas onde
  // comPurpose=true sempre arrastava active_seconds junto. Isso habilita o
  // degrau (comPurpose=true, comActiveSeconds=false): só a 0028 ausente.
  const consulta = (comPurpose: boolean, comActiveSeconds: boolean, inicio: number) =>
    supabase
      .from('session_logs')
      .select(
        `id, planned_session_id, started_at, finished_at${comActiveSeconds ? ', active_seconds' : ''}, planned_sessions(title, week_number, muscle_groups${comPurpose ? ', training_plans(purpose)' : ''})`,
      )
      .eq('user_id', userId)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .range(inicio, inicio + PAGINA_HISTORICO - 1);

  const paginar = async (comPurpose: boolean, comActiveSeconds: boolean): Promise<any[]> => {
    const linhas: any[] = [];
    for (let inicio = 0; ; inicio += PAGINA_HISTORICO) {
      const { data, error } = await consulta(comPurpose, comActiveSeconds, inicio);
      if (error) throw error;
      const pagina = (data ?? []) as any[];
      linhas.push(...pagina);
      if (pagina.length < PAGINA_HISTORICO) break;
    }
    return linhas;
  };

  // R1 (review PR #73): degradação em DEGRAUS. Um só fallback sem purpose
  // ainda selecionava active_seconds (migration 0028) — com a 0028 também
  // ausente (prod ainda na 0022), o segundo 42703 relançava sem catch e o
  // Histórico caía em erro. Cada degrau remove mais uma coluna das
  // migrations 0026-0030: 1º com tudo, 2º remove só a coluna que a MESSAGE
  // do 42703 aponta, 3º sem purpose E sem active_seconds (último recurso,
  // ambos viram null/false no resultado). Erro não-42703 em qualquer degrau
  // segue propagando.
  //
  // N7: sem essa leitura de message, o 2º degrau sempre assumia "falta
  // purpose" (janela mais comum) e mantinha active_seconds no select. No
  // estado intermediário inverso — 0026 já aplicada, 0028 ainda não — esse
  // degrau erraria de novo pelo MESMO motivo, e o 3º descartaria purpose à
  // toa: sessão joint perdia o chip 'Dupla' sem crashar. Uma dica errada
  // (message não citar 'active_seconds' quando na verdade é isso que falta,
  // ou vice-versa) só custa um degrau extra — o último recurso (false,
  // false) sempre resolve.
  let linhas: any[];
  try {
    linhas = await paginar(true, true);
  } catch (erro) {
    if (!erroDeColunaAusente(erro)) throw erro;
    const faltaSoActiveSeconds = erroCitaColuna(erro, 'active_seconds');
    try {
      linhas = await paginar(faltaSoActiveSeconds, !faltaSoActiveSeconds);
    } catch (erroDegrau) {
      if (!erroDeColunaAusente(erroDegrau)) throw erroDegrau;
      linhas = await paginar(false, false);
    }
  }

  return linhas.map((linha) => ({
    sessionLogId: linha.id,
    plannedSessionId: linha.planned_session_id,
    title: linha.planned_sessions?.title ?? 'Treino',
    weekNumber: linha.planned_sessions?.week_number ?? null,
    muscleGroups: linha.planned_sessions?.muscle_groups ?? [],
    startedAt: linha.started_at,
    finishedAt: linha.finished_at,
    activeSeconds: toNum(linha.active_seconds),
    origemJoint: linha.planned_sessions?.training_plans?.purpose === 'joint',
  }));
};

// Mesmo teto de max_rows do PostgREST do getCompletedSessions: sem paginação,
// os agregados do Progresso virariam parciais plausíveis a partir da linha 1001.
const PAGINA_SET_LOGS = 1000;

/**
 * TODAS as séries registradas do usuário em sessões CONCLUÍDAS, no formato
 * mínimo que o motor de progresso consome (identidade + carga + reps + quando).
 * Alimenta recordes e volume por semana — sempre dados reais, paginados até o fim.
 */
export const getSetLogsResumo = async (userId: string): Promise<SetLogResumo[]> => {
  const consulta = (comPurpose: boolean, inicio: number) =>
    supabase
      .from('set_logs')
      .select(
        comPurpose
          ? 'actual_reps, actual_load_kg, completed_at, session_logs!inner(user_id, finished_at), planned_sets(planned_exercises(name, exercise_key, planned_sessions(training_plans(purpose))))'
          : 'actual_reps, actual_load_kg, completed_at, session_logs!inner(user_id, finished_at), planned_sets(planned_exercises(name, exercise_key))',
      )
      .eq('session_logs.user_id', userId)
      .not('session_logs.finished_at', 'is', null)
      .order('completed_at', { ascending: false })
      .range(inicio, inicio + PAGINA_SET_LOGS - 1);

  const paginar = async (comPurpose: boolean): Promise<any[]> => {
    const linhas: any[] = [];
    for (let inicio = 0; ; inicio += PAGINA_SET_LOGS) {
      const { data, error } = await consulta(comPurpose, inicio);
      if (error) throw error;
      const pagina = (data ?? []) as any[];
      linhas.push(...pagina);
      if (pagina.length < PAGINA_SET_LOGS) break;
    }
    return linhas;
  };

  let linhas: any[];
  try {
    linhas = await paginar(true);
  } catch (erro) {
    if (!erroDeColunaAusente(erro)) throw erro;
    // 0026 ausente no banco: pente inteiro refeito sem o embed de purpose.
    linhas = await paginar(false);
  }

  const resumo: SetLogResumo[] = [];
  for (const linha of linhas) {
    const exercicio = linha?.planned_sets?.planned_exercises;
    const nome: string | undefined = exercicio?.name;
    if (!nome || !linha?.completed_at) continue;
    resumo.push({
      identity: exerciseIdentity({ exerciseKey: exercicio?.exercise_key ?? null, name: nome }),
      name: nome,
      loadKg: toNum(linha.actual_load_kg),
      reps: linha.actual_reps ?? null,
      completedAt: linha.completed_at,
      origemJoint: exercicio?.planned_sessions?.training_plans?.purpose === 'joint',
    });
  }
  return resumo;
};

export type HistorySetLog = {
  setOrder: number | null;
  actualReps: number | null;
  actualLoadKg: number | null;
  actualRir: number | null;
  // Cardio (Fase 3, Pitfall 2 fechado): duração/distância/esforço realizados,
  // lidos junto do resto — antes, cardio no histórico mostrava "null reps ×
  // peso corporal" porque a query nunca trazia essas colunas.
  actualDurationSeconds?: number | null;
  actualDistanceM?: number | null;
  perceivedEffort?: PerceivedEffort | null;
  outcome: Outcome | null;
};

export type HistoryExercise = {
  name: string;
  order: number;
  // Ausente/null = plano anterior à 0014 ou linha sem `planned_sets` embutido
  // (não deve ocorrer em uso normal) → tratado como carga_reps pela tela.
  metric?: ExerciseMetric | null;
  // Troca de modalidade de cardio (Fase 3, D-08 histórico): nome ORIGINAL do
  // exercício, presente só quando houve troca registrada em
  // `cardio_exercise_swaps`. Null/ausente = nunca foi trocado.
  swappedFrom?: string | null;
  sets: HistorySetLog[];
};

export type SessionLogDetail = {
  sessionLogId: string;
  title: string;
  weekNumber: number | null;
  startedAt: string;
  finishedAt: string | null;
  activeSeconds: number | null;
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
  // cardio_exercise_swaps embutido na MESMA query do cabeçalho (mesma técnica
  // de exercise_skips em getOpenSessionLog) — preserva a contagem de queries
  // e a compatibilidade dos testes existentes, que não têm este campo no mock.
  const consultaCabecalho = (comActiveSeconds: boolean) =>
    supabase
      .from('session_logs')
      .select(
        comActiveSeconds
          ? 'id, started_at, finished_at, active_seconds, planned_sessions(title, week_number), cardio_exercise_swaps(planned_exercise_id, to_modality)'
          : 'id, started_at, finished_at, planned_sessions(title, week_number), cardio_exercise_swaps(planned_exercise_id, to_modality)',
      )
      .eq('id', sessionLogId)
      .single();

  // N1 (achado família R1): produção está na 0022 — active_seconds só existe
  // a partir da 0028. Sem este degrau, o 42703 propagava cru e quebrava o
  // Histórico ao abrir QUALQUER sessão (caminho solo, sem gate de flag).
  let cabecalho = await consultaCabecalho(true);
  if (erroDeColunaAusente(cabecalho.error)) {
    cabecalho = await consultaCabecalho(false);
  }
  if (cabecalho.error) throw cabecalho.error;
  if (!cabecalho.data) return null;

  // Sem degrau erroDeColunaAusente aqui (diferente do cabeçalho acima): as
  // colunas novas desta query (actual_duration_seconds/actual_distance_m/
  // perceived_effort/metric) nasceram na migration 0014, muito antes de
  // exercise_skips (0020) / cardio_exercise_swaps (0034) — que este MESMO
  // select já embute nas outras duas queries desta função — logo nenhum
  // ambiente real pode ter 0034 sem já ter 0014; a topologia de migrations
  // torna esse gap impossível, diferente do caso genuíno de active_seconds
  // (produção na 0022, coluna só a partir da 0028).
  const linhas = await supabase
    .from('set_logs')
    .select(
      'actual_reps, actual_load_kg, actual_rir, actual_duration_seconds, actual_distance_m, perceived_effort, outcome, completed_at, planned_sets(set_order, exercise_id, planned_exercises(name, exercise_order, metric))',
    )
    .eq('session_log_id', sessionLogId);
  if (linhas.error) throw linhas.error;

  // Modalidade desconhecida (drift entre banco e catálogo do cliente, ou
  // linha malformada) é DESCARTADA, não coagida — mesmo raciocínio de
  // `isSkipReason` em `exerciseSkips` (getOpenSessionLog).
  const c = cabecalho.data as any;
  const mapaTrocas = new Map<string, string>();
  for (const sw of (c.cardio_exercise_swaps ?? []) as any[]) {
    if (typeof sw?.planned_exercise_id === 'string' && isCardioModalidade(sw?.to_modality)) {
      mapaTrocas.set(sw.planned_exercise_id, sw.to_modality);
    }
  }

  // Agrupa por exercício (id do planned_exercise quando disponível, senão
  // ordem + nome — retrocompatível com dado/mock sem o id), preservando a
  // ordem das séries.
  const porExercicio = new Map<string, HistoryExercise>();
  for (const l of (linhas.data ?? []) as any[]) {
    const nome: string =
      l?.planned_sets?.planned_exercises?.name ?? 'Exercício';
    const ordemEx: number =
      l?.planned_sets?.planned_exercises?.exercise_order ?? 0;
    const plannedExerciseId: string | null = l?.planned_sets?.exercise_id ?? null;
    const metric = l?.planned_sets?.planned_exercises?.metric ?? null;
    const toModality = plannedExerciseId ? mapaTrocas.get(plannedExerciseId) : undefined;
    const chave = plannedExerciseId ?? `${ordemEx}::${nome}`;
    if (!porExercicio.has(chave)) {
      porExercicio.set(chave, {
        name: toModality ?? nome,
        order: ordemEx,
        metric,
        swappedFrom: toModality ? nome : null,
        sets: [],
      });
    }
    porExercicio.get(chave)!.sets.push({
      setOrder: l?.planned_sets?.set_order ?? null,
      // null é o valor correto e honesto para uma série de cardio — nunca
      // inventar 0 reps (Pitfall 2 fechado).
      actualReps: l.actual_reps,
      actualLoadKg: toNum(l.actual_load_kg), // numeric pode vir como string (F4)
      actualRir: l.actual_rir,
      actualDurationSeconds: toNum(l.actual_duration_seconds),
      actualDistanceM: toNum(l.actual_distance_m),
      perceivedEffort: l.perceived_effort ?? null,
      outcome: l.outcome,
    });
  }

  const exercises = [...porExercicio.values()]
    .sort((a, b) => a.order - b.order)
    .map((ex) => ({
      ...ex,
      sets: [...ex.sets].sort((a, b) => (a.setOrder ?? 0) - (b.setOrder ?? 0)),
    }));

  return {
    sessionLogId: c.id,
    title: c.planned_sessions?.title ?? 'Treino',
    weekNumber: c.planned_sessions?.week_number ?? null,
    startedAt: c.started_at,
    finishedAt: c.finished_at,
    activeSeconds: toNum(c.active_seconds),
    exercises,
  };
};
