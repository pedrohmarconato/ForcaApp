// src/engine/jointSessionModel.ts
// Treino Conjunto 2.0 — Sprint 01. Modelo PURO da sessão conjunta: sem I/O, sem
// import de supabase, testável offline. Só transforma estado e decide turno;
// QUEM fala com o banco é jointSessionRepository, QUEM escuta é
// jointSessionRealtime.
//
// O vocabulário aqui é o mesmo da migration 0026 — um valor que só existe deste
// lado vira erro no meio da gravação. `jointSessionMigration.test.ts` lê o SQL e
// compara, para que a divergência apareça no CI e não no aparelho do aluno.

/** Como a dupla escolheu treinar (joint_sessions.mode). */
export type JointMode = 'host_plan' | 'guest_plan' | 'each_own';

export const JOINT_MODES: readonly JointMode[] = [
  'host_plan',
  'guest_plan',
  'each_own',
] as const;

export const JOINT_MODE_LABELS: Record<JointMode, string> = {
  host_plan: 'Treino de quem convidou',
  guest_plan: 'Treino de quem entrou',
  each_own: 'Cada um faz o seu',
};

/** Estado da sessão conjunta (joint_sessions.status). */
export type JointStatus =
  | 'inviting'
  | 'lobby'
  | 'active'
  | 'paused'
  | 'completed'
  | 'canceled'
  | 'abandoned';

export const JOINT_STATUSES: readonly JointStatus[] = [
  'inviting',
  'lobby',
  'active',
  'paused',
  'completed',
  'canceled',
  'abandoned',
] as const;

export const JOINT_TERMINAL_STATUSES: readonly JointStatus[] = [
  'completed',
  'canceled',
  'abandoned',
] as const;

/** Por que o avanço sincronizado parou (joint_sessions.pause_reason). */
export type JointPauseReason = 'presence_lost' | 'participant_request';

export const JOINT_PAUSE_REASONS: readonly JointPauseReason[] = [
  'presence_lost',
  'participant_request',
] as const;

export type JointRole = 'host' | 'guest';

export type JointEventKind =
  | 'created'
  | 'joined'
  | 'mode_set'
  | 'session_confirmed'
  | 'copy_materialized'
  | 'ready'
  | 'unready'
  | 'started'
  | 'turn_advanced'
  | 'queue_finished'
  | 'paused'
  | 'resumed'
  | 'participant_completed'
  | 'completed'
  | 'canceled'
  | 'abandoned';

export const isJointMode = (v: unknown): v is JointMode =>
  typeof v === 'string' && (JOINT_MODES as readonly string[]).includes(v);

export const isJointStatus = (v: unknown): v is JointStatus =>
  typeof v === 'string' && (JOINT_STATUSES as readonly string[]).includes(v);

export const isJointPauseReason = (v: unknown): v is JointPauseReason =>
  typeof v === 'string' && (JOINT_PAUSE_REASONS as readonly string[]).includes(v);

export const isTerminalJointStatus = (s: JointStatus): boolean =>
  (JOINT_TERMINAL_STATUSES as readonly string[]).includes(s);

/**
 * TTL de presença. Espelha `public._forca_joint_presenca_ttl()` da 0026 — a
 * migration é a fonte, este número é a cópia, e o teste falha se divergirem.
 */
export const PRESENCA_TTL_MS = 60_000;

// ============================================================
// Estado
// ============================================================

export type JointParticipantState = {
  userId: string;
  role: JointRole;
  plannedSessionId: string | null;
  sessionLogId: string | null;
  ready: boolean;
  queueFinishedAt: string | null;
  completedAt: string | null;
  lastSeenAt: string;
};

export type JointSessionState = {
  id: string;
  hostUserId: string;
  guestUserId: string | null;
  mode: JointMode | null;
  muscleGroup: string | null;
  status: JointStatus;
  pauseReason: JointPauseReason | null;
  currentTurnUserId: string | null;
  turnSeq: number;
  participants: JointParticipantState[];
};

export type JointEvent = {
  seq: number;
  actorUserId: string;
  kind: JointEventKind;
  clientEventId: string | null;
  turnSeqAfter: number | null;
  /**
   * `payload.next_turn_user_id` do evento, quando o emissor o populou (achado
   * F1). É a verdade do servidor sobre para quem vai o turno — os dois
   * handoffs novos da 0030 (mark_joint_queue_finished, complete_joint_participant)
   * divergem da heurística `proximoTurno` num cenário real, e só este campo
   * resolve a divergência. Ausente (undefined) em eventos antigos/sem o campo:
   * nesse caso o redutor cai no fallback histórico.
   */
  nextTurnUserId?: string;
};

// ============================================================
// Transições
// ============================================================

/**
 * As transições que o banco aceita (0026). Existe deste lado para a UI poder
 * desabilitar o que vai falhar, não para decidir: a fronteira autoritativa é a
 * RPC. Estado terminal não sai de terminal — nem aqui, nem lá.
 */
export const TRANSICOES: Record<JointStatus, readonly JointStatus[]> = {
  inviting: ['lobby', 'canceled'],
  lobby: ['active', 'canceled'],
  active: ['paused', 'completed', 'abandoned'],
  paused: ['active', 'abandoned'],
  completed: [],
  canceled: [],
  abandoned: [],
};

export const podeTransitar = (de: JointStatus, para: JointStatus): boolean =>
  (TRANSICOES[de] as readonly string[]).includes(para);

// ============================================================
// Papéis e parceiro
// ============================================================

export const participanteDe = (
  state: JointSessionState,
  userId: string,
): JointParticipantState | null =>
  state.participants.find((p) => p.userId === userId) ?? null;

export const parceiroDe = (
  state: JointSessionState,
  userId: string,
): JointParticipantState | null =>
  state.participants.find((p) => p.userId !== userId) ?? null;

export const meuPapel = (
  state: JointSessionState,
  userId: string,
): JointRole | null => participanteDe(state, userId)?.role ?? null;

export const ehMinhaVez = (state: JointSessionState, userId: string): boolean =>
  state.status === 'active' && state.currentTurnUserId === userId;

// ============================================================
// Turno
// ============================================================

/**
 * Para quem vai o turno quando `atorId` confirma uma série. Reproduz a regra da
 * RPC `advance_joint_turn`: normalmente alterna, mas se o parceiro já encerrou
 * a fila o turno FICA com quem ainda tem o que fazer — é o que impede a dupla
 * de travar quando um termina primeiro.
 */
export const proximoTurno = (
  state: JointSessionState,
  atorId: string,
): string | null => {
  const parceiro = parceiroDe(state, atorId);
  if (!parceiro) return null;
  return parceiro.queueFinishedAt != null ? atorId : parceiro.userId;
};

// ============================================================
// Presença
// ============================================================

export const presencaPerdida = (
  lastSeenAt: string | null | undefined,
  agoraMs: number,
  ttlMs: number = PRESENCA_TTL_MS,
): boolean => {
  if (!lastSeenAt) return true;
  const visto = Date.parse(lastSeenAt);
  if (Number.isNaN(visto)) return true;
  return agoraMs - visto > ttlMs;
};

/**
 * O parceiro sumiu a ponto de justificar pausa? Só faz sentido com o treino em
 * execução — pausar o que já está pausado, encerrado ou no lobby não é uma
 * decisão, é ruído.
 */
export const parceiroSumiu = (
  state: JointSessionState,
  userId: string,
  agoraMs: number,
  ttlMs: number = PRESENCA_TTL_MS,
): boolean => {
  if (state.status !== 'active') return false;
  const parceiro = parceiroDe(state, userId);
  if (!parceiro) return false;
  return presencaPerdida(parceiro.lastSeenAt, agoraMs, ttlMs);
};

// ============================================================
// Estado dominante da tela
// ============================================================

/**
 * O único estado que a tela deve gritar. A rubrica exige que em qualquer momento
 * seja óbvio "minha vez" versus "descanso" — e isso só é possível se existir UMA
 * resposta, não uma combinação de flags para a tela interpretar.
 */
export type EstadoDominante =
  | 'minha_vez'
  | 'descanso'
  | 'pausado'
  | 'aguardando_parceiro'
  | 'concluido'
  | 'encerrado';

export const estadoDominante = (
  state: JointSessionState,
  userId: string,
): EstadoDominante => {
  if (state.status === 'completed') return 'concluido';
  if (state.status === 'canceled' || state.status === 'abandoned') return 'encerrado';
  if (state.status === 'paused') return 'pausado';
  if (state.status === 'inviting' || state.status === 'lobby') {
    return 'aguardando_parceiro';
  }
  // active
  const eu = participanteDe(state, userId);
  if (eu?.completedAt != null) return 'aguardando_parceiro';
  return state.currentTurnUserId === userId ? 'minha_vez' : 'descanso';
};

// ============================================================
// Elegibilidade (modo each_own)
// ============================================================

const normalizarGrupo = (g: string): string =>
  g
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/**
 * A sessão serve ao grupo muscular combinado? Comparação normalizada porque o
 * grupo vem da IA em grafias diferentes ("Peito", "peito", "Peitoral" não —
 * variação de acento e caixa sim; sinônimo é outro problema).
 */
export const sessaoElegivelParaGrupo = (
  muscleGroups: readonly string[] | null | undefined,
  grupo: string | null | undefined,
): boolean => {
  if (!grupo || !muscleGroups) return false;
  const alvo = normalizarGrupo(grupo);
  if (alvo.length === 0) return false;
  return muscleGroups.some((g) => normalizarGrupo(String(g)) === alvo);
};

// ============================================================
// Redutor de eventos
// ============================================================

export type ReducerResult = {
  state: JointSessionState;
  /**
   * O cliente perdeu evento ou recebeu fora de ordem e NÃO pode continuar
   * remendando: precisa buscar o estado autoritativo. Aplicar o evento 5 quando
   * se esperava o 4 é como o progresso de uma dupla se desalinha em silêncio.
   */
  precisaSnapshot: boolean;
  aplicado: boolean;
};

const chaveDeEvento = (e: JointEvent): string | null =>
  e.clientEventId ? `${e.actorUserId}::${e.clientEventId}` : null;

/**
 * Aplica um evento ao estado local, com três defesas:
 *   1. evento repetido pelo par (ator, clientEventId) é DESCARTADO;
 *   2. evento com seq já visto é DESCARTADO;
 *   3. buraco no seq (recebeu 5 esperando 4) NÃO é aplicado — devolve
 *      `precisaSnapshot`, porque o estado local deixou de ser confiável.
 */
export const aplicarEvento = (
  state: JointSessionState,
  evento: JointEvent,
  vistos: { ultimoSeq: number; chaves: ReadonlySet<string> },
): ReducerResult & { vistos: { ultimoSeq: number; chaves: Set<string> } } => {
  const chaves = new Set(vistos.chaves);
  const chave = chaveDeEvento(evento);

  if (chave != null && chaves.has(chave)) {
    return {
      state,
      precisaSnapshot: false,
      aplicado: false,
      vistos: { ultimoSeq: vistos.ultimoSeq, chaves },
    };
  }
  if (evento.seq <= vistos.ultimoSeq) {
    return {
      state,
      precisaSnapshot: false,
      aplicado: false,
      vistos: { ultimoSeq: vistos.ultimoSeq, chaves },
    };
  }
  if (evento.seq > vistos.ultimoSeq + 1) {
    return {
      state,
      precisaSnapshot: true,
      aplicado: false,
      vistos: { ultimoSeq: vistos.ultimoSeq, chaves },
    };
  }

  if (chave != null) chaves.add(chave);
  const proximo = reduzir(state, evento);
  return {
    state: proximo,
    precisaSnapshot: false,
    aplicado: true,
    vistos: { ultimoSeq: evento.seq, chaves },
  };
};

const reduzir = (state: JointSessionState, evento: JointEvent): JointSessionState => {
  switch (evento.kind) {
    case 'started':
      return {
        ...state,
        status: 'active',
        currentTurnUserId: state.hostUserId,
        turnSeq: evento.turnSeqAfter ?? 1,
      };
    case 'turn_advanced': {
      // ACHADO F1: a 0030 passou a emitir 'turn_advanced' também em
      // mark_joint_queue_finished e complete_joint_participant — dois pontos
      // em que o servidor decide o próximo turno por regra PRÓPRIA, não pela
      // regra de advance_joint_turn que proximoTurno() reproduz. Quando o
      // evento traz nextTurnUserId, ele É a verdade do servidor e vence.
      // proximoTurno() fica só como fallback para evento sem o campo
      // (histórico/defensivo) — nenhum outro comportamento muda.
      const destino = evento.nextTurnUserId ?? proximoTurno(state, evento.actorUserId);
      return {
        ...state,
        currentTurnUserId: destino,
        turnSeq: evento.turnSeqAfter ?? state.turnSeq + 1,
      };
    }
    case 'queue_finished': {
      const participants = state.participants.map((p) =>
        p.userId === evento.actorUserId && p.queueFinishedAt == null
          ? { ...p, queueFinishedAt: 'server' }
          : p,
      );
      const parceiro = participants.find((p) => p.userId !== evento.actorUserId);
      return {
        ...state,
        participants,
        currentTurnUserId:
          parceiro && parceiro.queueFinishedAt == null
            ? parceiro.userId
            : state.currentTurnUserId,
        turnSeq: evento.turnSeqAfter ?? state.turnSeq,
      };
    }
    case 'paused':
      return { ...state, status: 'paused' };
    case 'resumed':
      return { ...state, status: 'active', pauseReason: null };
    case 'participant_completed':
      return {
        ...state,
        participants: state.participants.map((p) =>
          p.userId === evento.actorUserId ? { ...p, completedAt: 'server' } : p,
        ),
      };
    case 'completed':
      return { ...state, status: 'completed', currentTurnUserId: null };
    case 'canceled':
      return { ...state, status: 'canceled', currentTurnUserId: null };
    case 'abandoned':
      return { ...state, status: 'abandoned', currentTurnUserId: null };
    default:
      // created/joined/mode_set/session_confirmed/copy_materialized/ready/unready
      // mexem em campos que a tela relê do snapshot; não movem turno.
      return state;
  }
};

export const vistosVazios = (): { ultimoSeq: number; chaves: Set<string> } => ({
  ultimoSeq: 0,
  chaves: new Set<string>(),
});
