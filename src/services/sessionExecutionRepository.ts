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
import { exerciseIdentity, toNum } from '../engine/sessionModel';

export type ServerSetLog = {
  id: string;
  planned_set_id: string | null;
  actual_reps: number;
  actual_load_kg: number | null;
  actual_rir: number | null;
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
        'id, started_at, available_minutes, mood, adherence_snapshot, set_logs(id, planned_set_id, actual_reps, actual_load_kg, actual_rir, outcome, adaptation, completed_at)',
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
      outcome: s.outcome,
      adaptation: s.adaptation ?? null,
      completed_at: s.completed_at,
    }))
    .filter((s) => typeof s.id === 'string' && s.actual_reps != null)
    .sort((a, b) =>
      String(a.completed_at).localeCompare(String(b.completed_at)),
    ) as ServerSetLog[];

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
  };
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
    actualReps: number;
    actualLoadKg: number | null;
    actualRir: number | null;
    outcome: Outcome;
    /** Momento da ATIVAÇÃO da série (lacuna 2: tempo real por série). */
    startedAt?: string | null;
  },
  signal?: AbortSignal,
): Promise<{
  setLogId: string;
  actualReps: number;
  actualLoadKg: number | null;
  actualRir: number | null;
  outcome: Outcome;
}> => {
  const request = supabase.rpc('save_set_log', {
    p_session_log_id: params.sessionLogId,
    p_planned_set_id: params.plannedSetId,
    p_actual_reps: params.actualReps,
    p_actual_load_kg: params.actualLoadKg,
    p_actual_rir: params.actualRir,
    p_outcome: params.outcome,
    p_started_at: params.startedAt ?? null,
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
  const actualRir = toNum(row.actual_rir);
  if (
    actualReps == null ||
    !['on_target', 'under', 'over'].includes(row.outcome)
  ) {
    throw new Error('save_set_log retornou uma série inválida.');
  }
  return {
    setLogId: row.id as string,
    actualReps,
    actualLoadKg: toNum(row.actual_load_kg),
    actualRir,
    outcome: row.outcome as Outcome,
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
 */
export const getLastLoadByExercise = async (
  identities: string[],
): Promise<Record<string, number>> => {
  if (identities.length === 0) return {};
  const alvo = new Set(identities);

  const { data, error } = await supabase
    .from('set_logs')
    .select(
      'actual_load_kg, completed_at, planned_sets(planned_exercises(name, exercise_key))',
    )
    .not('actual_load_kg', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(300);
  if (error) throw error;

  const mapa: Record<string, number> = {};
  for (const linha of (data ?? []) as any[]) {
    const exercicio = linha?.planned_sets?.planned_exercises;
    const nome: string | undefined = exercicio?.name;
    const carga = linha?.actual_load_kg;
    if (!nome || carga == null) continue;
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
  const linhas: any[] = [];

  for (let inicio = 0; ; inicio += PAGINA_HISTORICO) {
    const { data, error } = await supabase
      .from('session_logs')
      .select(
        'id, planned_session_id, started_at, finished_at, planned_sessions(title, week_number, muscle_groups)',
      )
      .eq('user_id', userId)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false })
      .range(inicio, inicio + PAGINA_HISTORICO - 1);
    if (error) throw error;

    const pagina = (data ?? []) as any[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA_HISTORICO) break;
  }

  return linhas.map((linha) => ({
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
    const nome: string =
      l?.planned_sets?.planned_exercises?.name ?? 'Exercício';
    const ordemEx: number =
      l?.planned_sets?.planned_exercises?.exercise_order ?? 0;
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
