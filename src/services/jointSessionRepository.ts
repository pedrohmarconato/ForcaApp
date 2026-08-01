// src/services/jointSessionRepository.ts
// Treino Conjunto 2.0 — Sprint 01. Fronteira com as RPCs da migration 0026.
//
// Mesmo contrato de erro do sessionExecutionRepository: erro do banco SEMPRE
// propaga (throw), nunca é engolido como sucesso. A confirmação de uma série que
// "passou o turno" sem ter passado é o modo de falha mais caro desta feature —
// a dupla fica olhando para telas que discordam.

import { supabase } from '../config/supabaseClient';
import type {
  JointMode,
  JointPauseReason,
  JointRole,
  JointSessionState,
  JointStatus,
  JointParticipantState,
  JointEvent,
  JointEventKind,
} from '../engine/jointSessionModel';
import { isJointMode, isJointPauseReason, isJointStatus } from '../engine/jointSessionModel';

type RequestErrorKind = 'transport' | 'server';

/**
 * Erro de domínio do treino conjunto, derivado do errcode que a 0026 levanta.
 * A tela decide o que dizer a partir de `motivo`, não parseando mensagem.
 */
export type JointErrorMotivo =
  | 'nao_autorizado'      // 42501
  | 'argumento_invalido'  // 22023
  | 'estado_invalido'     // 55000
  | 'turno_desatualizado' // FC001 (ver nota abaixo)
  | 'limite_de_tentativas'// 54000
  | 'fila_pendente'       // P0001
  | 'nao_encontrado'      // P0002
  | 'convite_invalido'    // retorno nulo de join_joint_session
  | 'desconhecido';

const MOTIVO_POR_ERRCODE: Record<string, JointErrorMotivo> = {
  '42501': 'nao_autorizado',
  '22023': 'argumento_invalido',
  '55000': 'estado_invalido',
  // FC001, não 40001: `40001` é serialization_failure e o PostgREST RETENTA
  // essa classe sozinho — a chamada fica presa até o gateway desistir (medido em
  // 125s contra 219ms do caminho normal). O conflito de versão do turno precisa
  // de um SQLSTATE que o transporte não trate como transitório.
  FC001: 'turno_desatualizado',
  '54000': 'limite_de_tentativas',
  P0001: 'fila_pendente',
  P0002: 'nao_encontrado',
};

export class JointSessionRequestError extends Error {
  readonly kind: RequestErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly motivo: JointErrorMotivo;
  readonly details: string | null;

  constructor(
    error: unknown,
    options: { status?: number | null; kind?: RequestErrorKind; motivo?: JointErrorMotivo } = {},
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
    this.name = 'JointSessionRequestError';
    this.status = options.status ?? null;
    this.kind = options.kind ?? (options.status === 0 ? 'transport' : 'server');
    this.code =
      typeof record?.code === 'string' && record.code.length > 0 ? record.code : null;
    this.details = typeof record?.details === 'string' ? record.details : null;
    this.motivo =
      options.motivo ??
      (this.code != null ? (MOTIVO_POR_ERRCODE[this.code] ?? 'desconhecido') : 'desconhecido');
  }
}

export const isTransportJointError = (
  error: unknown,
): error is JointSessionRequestError =>
  error instanceof JointSessionRequestError && error.kind === 'transport';

const erroDeTransporte = (error: unknown): JointSessionRequestError => {
  const name =
    typeof error === 'object' && error !== null && typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : '';
  // fetch em React Native rejeita com TypeError; AbortController usa AbortError.
  const transport = error instanceof TypeError || name === 'AbortError';
  return new JointSessionRequestError(error, { kind: transport ? 'transport' : 'server' });
};

const chamar = async (fn: string, params: Record<string, unknown>): Promise<unknown> => {
  let response: any;
  try {
    response = await supabase.rpc(fn, params);
  } catch (error) {
    throw erroDeTransporte(error);
  }
  const { data, error, status } = response;
  if (error) {
    throw new JointSessionRequestError(error, { status: status ?? null });
  }
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
};

// ============================================================
// Mapeamento linha → domínio
// ============================================================

const texto = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const paraSessao = (row: any, participants: JointParticipantState[] = []): JointSessionState => {
  const status = row?.status;
  if (!isJointStatus(status)) {
    throw new JointSessionRequestError(
      new Error(`status desconhecido de sessão conjunta: ${String(status)}`),
    );
  }
  return {
    id: String(row.id),
    hostUserId: String(row.host_user_id),
    guestUserId: texto(row.guest_user_id),
    mode: isJointMode(row.mode) ? (row.mode as JointMode) : null,
    muscleGroup: texto(row.muscle_group),
    status,
    pauseReason: isJointPauseReason(row.pause_reason)
      ? (row.pause_reason as JointPauseReason)
      : null,
    currentTurnUserId: texto(row.current_turn_user_id),
    turnSeq: numero(row.turn_seq),
    participants,
  };
};

const paraParticipante = (row: any): JointParticipantState => ({
  userId: String(row.user_id),
  role: (row.role === 'host' ? 'host' : 'guest') as JointRole,
  plannedSessionId: texto(row.planned_session_id),
  sessionLogId: texto(row.session_log_id),
  ready: row.ready === true,
  queueFinishedAt: texto(row.queue_finished_at),
  completedAt: texto(row.completed_at),
  lastSeenAt: String(row.last_seen_at ?? ''),
});

// ============================================================
// Convite
// ============================================================

export type JointInvite = {
  session: JointSessionState;
  inviteCode: string;
  inviteExpiresAt: string;
};

export const createJointSession = async (): Promise<JointInvite> => {
  const row: any = await chamar('create_joint_session', {});
  if (!row?.id) {
    throw new JointSessionRequestError(new Error('create_joint_session não retornou a sessão.'));
  }
  return {
    session: paraSessao(row),
    inviteCode: String(row.invite_code),
    inviteExpiresAt: String(row.invite_expires_at),
  };
};

/**
 * Aceita o convite. Devolve `null` quando o código é inválido, expirado, já
 * consumido OU quando o limite de tentativas foi atingido — os casos são
 * deliberadamente indistinguíveis para não virarem oráculo de enumeração.
 *
 * Por que `null` e não erro do banco: o contador de tentativas precisa
 * SOBREVIVER à recusa, e no PostgreSQL uma exceção aborta a transação e leva o
 * incremento junto. Um limitador que só conta acerto nunca dispara. A recusa
 * volta como valor e vira erro aqui.
 */
export const joinJointSession = async (inviteCode: string): Promise<JointSessionState> => {
  const row: any = await chamar('join_joint_session', {
    p_invite_code: inviteCode,
  });
  if (!row?.id) {
    throw new JointSessionRequestError(new Error('Convite inválido ou expirado.'), {
      motivo: 'convite_invalido',
    });
  }
  return paraSessao(row);
};

// ============================================================
// Lobby
// ============================================================

export const setJointSessionMode = async (params: {
  jointSessionId: string;
  mode: JointMode;
  muscleGroup?: string | null;
}): Promise<JointSessionState> => {
  const row: any = await chamar('set_joint_session_mode', {
    p_joint_session_id: params.jointSessionId,
    p_mode: params.mode,
    p_muscle_group: params.muscleGroup ?? null,
  });
  return paraSessao(row);
};

export const confirmJointParticipantSession = async (params: {
  jointSessionId: string;
  plannedSessionId: string;
}): Promise<JointParticipantState> => {
  const row: any = await chamar('confirm_joint_participant_session', {
    p_joint_session_id: params.jointSessionId,
    p_planned_session_id: params.plannedSessionId,
  });
  if (!row?.user_id) {
    throw new JointSessionRequestError(
      new Error('confirm_joint_participant_session não retornou o participante.'),
    );
  }
  return paraParticipante(row);
};

/**
 * Materializa a cópia da estrutura que o PARCEIRO confirmou. Não recebe id de
 * origem de propósito: a fonte é lida do que o dono confirmou para este treino
 * conjunto, e por isso não existe caminho para copiar outra sessão dele.
 */
export const materializeJointSessionCopy = async (
  jointSessionId: string,
): Promise<{ plannedSessionId: string; title: string }> => {
  const row: any = await chamar('materialize_joint_session_copy', {
    p_joint_session_id: jointSessionId,
  });
  if (!row?.id) {
    throw new JointSessionRequestError(
      new Error('materialize_joint_session_copy não retornou a sessão copiada.'),
    );
  }
  return { plannedSessionId: String(row.id), title: String(row.title ?? 'Treino') };
};

export const setJointParticipantReady = async (params: {
  jointSessionId: string;
  ready: boolean;
}): Promise<JointSessionState> => {
  const row: any = await chamar('set_joint_participant_ready', {
    p_joint_session_id: params.jointSessionId,
    p_ready: params.ready,
  });
  return paraSessao(row);
};

// ============================================================
// Execução
// ============================================================

/**
 * Passa o turno ao parceiro depois de uma série confirmada.
 *
 * `clientEventId` é a chave de idempotência: repetir a MESMA confirmação (retry
 * de rede) devolve o estado sem avançar de novo. `expectedTurnSeq` é a trava de
 * ordem: se o servidor já avançou, volta `turno_desatualizado` e o cliente
 * refaz o snapshot em vez de escrever por cima.
 */
export const advanceJointTurn = async (params: {
  jointSessionId: string;
  clientEventId: string;
  expectedTurnSeq: number;
  setLogId: string;
}): Promise<JointSessionState> => {
  const row: any = await chamar('advance_joint_turn', {
    p_joint_session_id: params.jointSessionId,
    p_client_event_id: params.clientEventId,
    p_expected_turn_seq: params.expectedTurnSeq,
    p_set_log_id: params.setLogId,
  });
  return paraSessao(row);
};

export const markJointQueueFinished = async (
  jointSessionId: string,
): Promise<JointSessionState> => {
  const row: any = await chamar('mark_joint_queue_finished', {
    p_joint_session_id: jointSessionId,
  });
  return paraSessao(row);
};

export const pauseJointSession = async (params: {
  jointSessionId: string;
  reason: JointPauseReason;
}): Promise<JointSessionState> => {
  const row: any = await chamar('pause_joint_session', {
    p_joint_session_id: params.jointSessionId,
    p_reason: params.reason,
  });
  return paraSessao(row);
};

export const resumeJointSession = async (
  jointSessionId: string,
): Promise<JointSessionState> => {
  const row: any = await chamar('resume_joint_session', {
    p_joint_session_id: jointSessionId,
  });
  return paraSessao(row);
};

/** Heartbeat de presença. Só a própria linha — não há parâmetro de usuário. */
export const touchJointPresence = async (jointSessionId: string): Promise<string> => {
  const at = await chamar('touch_joint_presence', {
    p_joint_session_id: jointSessionId,
  });
  return String(at);
};

export const completeJointParticipant = async (
  jointSessionId: string,
): Promise<JointSessionState> => {
  const row: any = await chamar('complete_joint_participant', {
    p_joint_session_id: jointSessionId,
  });
  return paraSessao(row);
};

export const abandonJointSession = async (
  jointSessionId: string,
): Promise<JointSessionState> => {
  const row: any = await chamar('abandon_joint_session', {
    p_joint_session_id: jointSessionId,
  });
  return paraSessao(row);
};

export type JointPartnerProfile = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

/**
 * Projeção MÍNIMA do parceiro. A RLS de `profiles` só entrega a própria linha;
 * esta é a única superfície por onde o nome do parceiro passa, e ela devolve
 * três campos — nunca o perfil inteiro.
 */
export const getJointPartnerProfile = async (
  jointSessionId: string,
): Promise<JointPartnerProfile | null> => {
  const row: any = await chamar('joint_session_partner_profile', {
    p_joint_session_id: jointSessionId,
  });
  if (!row?.user_id) return null;
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name ?? 'Parceiro'),
    avatarUrl: texto(row.avatar_url),
  };
};

// ============================================================
// Snapshot autoritativo
// ============================================================

/**
 * Estado completo e AUTORITATIVO da sessão conjunta, numa consulta só. É o que
 * a reconexão busca: depois de uma queda, o que ficou na memória do aparelho
 * não vale nada — quem manda é o banco.
 */
export const getJointSessionSnapshot = async (
  jointSessionId: string,
): Promise<JointSessionState | null> => {
  let response: any;
  try {
    response = await supabase
      .from('joint_sessions')
      .select(
        'id, host_user_id, guest_user_id, mode, muscle_group, status, pause_reason, ' +
          'current_turn_user_id, turn_seq, joint_session_participants(user_id, role, ' +
          'planned_session_id, session_log_id, ready, queue_finished_at, completed_at, last_seen_at)',
      )
      .eq('id', jointSessionId)
      .limit(1);
  } catch (error) {
    throw erroDeTransporte(error);
  }
  if (response.error) {
    throw new JointSessionRequestError(response.error, { status: response.status ?? null });
  }
  const row = response.data?.[0];
  if (!row) return null;
  const participantes = ((row.joint_session_participants ?? []) as any[]).map(paraParticipante);
  return paraSessao(row, participantes);
};

/** Eventos a partir de um seq — usado para fechar buraco pequeno sem snapshot. */
export const getJointSessionEvents = async (
  jointSessionId: string,
  desdeSeq: number,
): Promise<JointEvent[]> => {
  let response: any;
  try {
    response = await supabase
      .from('joint_session_events')
      .select('seq, actor_user_id, kind, client_event_id, turn_seq_after')
      .eq('joint_session_id', jointSessionId)
      .gt('seq', desdeSeq)
      .order('seq', { ascending: true });
  } catch (error) {
    throw erroDeTransporte(error);
  }
  if (response.error) {
    throw new JointSessionRequestError(response.error, { status: response.status ?? null });
  }
  return ((response.data ?? []) as any[]).map((e) => ({
    seq: numero(e.seq),
    actorUserId: String(e.actor_user_id),
    kind: e.kind as JointEventKind,
    clientEventId: texto(e.client_event_id),
    turnSeqAfter: e.turn_seq_after == null ? null : numero(e.turn_seq_after),
  }));
};

export type { JointStatus };
