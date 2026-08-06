// src/services/jointSessionRealtime.ts
// Treino Conjunto 2.0 — Sprint 01. Canal de sincronização entre os dois
// aparelhos: assinatura de Realtime, heartbeat de presença, watchdog de parceiro
// parado e reconexão com snapshot autoritativo.
//
// Três regras que este arquivo existe para cumprir:
//
//  1. RECONEXÃO É RECONEXÃO, não refetch. Em CHANNEL_ERROR/TIMED_OUT o canal é
//     REMOVIDO e recriado com backoff — só depois se busca o snapshot. Refazer
//     o fetch com um canal morto devolve dado certo e depois silêncio.
//  2. BURACO DE SEQ NÃO SE REMENDA. Receber o evento 5 esperando o 4 não
//     autoriza aplicar o 5: o estado local deixou de ser confiável e a única
//     saída honesta é o snapshot.
//  3. O QUE PAUSA É O SERVIDOR. O watchdog só CHAMA a RPC; quem decide se houve
//     perda de presença é o banco, comparando last_seen_at sob lock.

import { supabase } from '../config/supabaseClient';
import type { JointEvent, JointSessionState } from '../engine/jointSessionModel';
import { PRESENCA_TTL_MS, aplicarEvento, parceiroSumiu, vistosVazios } from '../engine/jointSessionModel';
import {
  getJointSessionSnapshot,
  pauseJointSession,
  touchJointPresence,
} from './jointSessionRepository';

const HEARTBEAT_MS = 20_000;
const BACKOFF_INICIAL_MS = 1_000;
const BACKOFF_TETO_MS = 30_000;

/**
 * ACHADO F1: `payload.next_turn_user_id` (jsonb da linha de evento) é a
 * verdade do servidor sobre para quem vai o turno — necessário desde a 0030,
 * que passou a emitir 'turn_advanced' em dois pontos com regra própria (ver
 * jointSessionModel.ts, caso 'turn_advanced'). Validação defensiva de TIPO
 * (mesmo padrão de `actorUserId: String(r.actor_user_id)` logo abaixo, sem
 * regex de formato): só string não vazia vira valor; qualquer outra coisa
 * (ausente, número, objeto) devolve undefined e o redutor cai no fallback
 * histórico em vez de propagar lixo como se fosse um user_id.
 */
const extrairNextTurnUserId = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') return undefined;
  const v = (payload as Record<string, unknown>).next_turn_user_id;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
};

export type JointRealtimeHandlers = {
  onState: (state: JointSessionState) => void;
  /** Falha não fatal (heartbeat, watchdog). A sessão continua; a tela avisa. */
  onError?: (error: unknown) => void;
  onConnectionChange?: (conectado: boolean) => void;
};

export type JointRealtimeDeps = {
  agora?: () => number;
  setTimeout?: (fn: () => void, ms: number) => any;
  clearTimeout?: (handle: any) => void;
  setInterval?: (fn: () => void, ms: number) => any;
  clearInterval?: (handle: any) => void;
  ttlMs?: number;
};

export type JointRealtimeSubscription = {
  /** Busca o estado autoritativo agora (usado pela tela ao voltar do fundo). */
  refresh: () => Promise<void>;
  unsubscribe: () => void;
};

/**
 * Assina a sessão conjunta. Filtra por `joint_session_id` na inscrição: o canal
 * traz só o que é desta dupla, e a RLS de SELECT é o que o Realtime avalia por
 * assinante — um intruso inscrito não recebe nada.
 */
export const subscribeToJointSession = (
  jointSessionId: string,
  userId: string,
  handlers: JointRealtimeHandlers,
  deps: JointRealtimeDeps = {},
): JointRealtimeSubscription => {
  const agora = deps.agora ?? (() => Date.now());
  const _setTimeout = deps.setTimeout ?? setTimeout;
  const _clearTimeout = deps.clearTimeout ?? clearTimeout;
  const _setInterval = deps.setInterval ?? setInterval;
  const _clearInterval = deps.clearInterval ?? clearInterval;
  const ttlMs = deps.ttlMs ?? PRESENCA_TTL_MS;

  let canal: any = null;
  let heartbeat: any = null;
  let watchdog: any = null;
  let reconexao: any = null;
  let backoff = BACKOFF_INICIAL_MS;
  let vistos = vistosVazios();
  let estado: JointSessionState | null = null;
  let vivo = true;
  // Uma pausa por episódio de ausência: sem isto, cada tique do watchdog
  // dispararia uma chamada nova enquanto o parceiro estiver fora.
  let pausaPedida = false;

  const publicar = (proximo: JointSessionState) => {
    estado = proximo;
    if (proximo.status === 'active') pausaPedida = false;
    handlers.onState(proximo);
  };

  const snapshot = async () => {
    const s = await getJointSessionSnapshot(jointSessionId);
    if (!vivo || !s) return;
    vistos = vistosVazios();
    publicar(s);
  };

  const aoReceberEvento = (evento: JointEvent) => {
    if (!estado) return;
    const r = aplicarEvento(estado, evento, vistos);
    vistos = r.vistos;
    if (r.precisaSnapshot) {
      void snapshot().catch((e) => handlers.onError?.(e));
      return;
    }
    if (r.aplicado) publicar(r.state);
  };

  const agendarReconexao = () => {
    if (!vivo || reconexao != null) return;
    handlers.onConnectionChange?.(false);
    const espera = backoff;
    backoff = Math.min(backoff * 2, BACKOFF_TETO_MS);
    reconexao = _setTimeout(() => {
      reconexao = null;
      if (!vivo) return;
      // Canal morto não volta sozinho: remove e recria.
      if (canal) {
        try {
          supabase.removeChannel(canal);
        } catch {
          /* canal já descartado */
        }
        canal = null;
      }
      abrirCanal();
    }, espera);
  };

  const abrirCanal = () => {
    canal = supabase
      .channel(`joint:${jointSessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'joint_sessions', filter: `id=eq.${jointSessionId}` },
        () => {
          void snapshot().catch((e) => handlers.onError?.(e));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'joint_session_participants',
          filter: `joint_session_id=eq.${jointSessionId}`,
        },
        () => {
          void snapshot().catch((e) => handlers.onError?.(e));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'joint_session_events',
          filter: `joint_session_id=eq.${jointSessionId}`,
        },
        (payload: any) => {
          const r = payload?.new;
          if (!r) return;
          aoReceberEvento({
            seq: Number(r.seq),
            actorUserId: String(r.actor_user_id),
            kind: r.kind,
            clientEventId: r.client_event_id ?? null,
            turnSeqAfter: r.turn_seq_after == null ? null : Number(r.turn_seq_after),
            nextTurnUserId: extrairNextTurnUserId(r.payload),
          });
        },
      )
      .subscribe((status: string) => {
        if (!vivo) return;
        if (status === 'SUBSCRIBED') {
          backoff = BACKOFF_INICIAL_MS;
          handlers.onConnectionChange?.(true);
          // Enquanto o canal esteve fora, o mundo andou. O snapshot é o que
          // reconcilia — nunca o que ficou em memória.
          void snapshot().catch((e) => handlers.onError?.(e));
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          agendarReconexao();
        }
      });
  };

  abrirCanal();

  heartbeat = _setInterval(() => {
    void touchJointPresence(jointSessionId).catch((e) => handlers.onError?.(e));
  }, HEARTBEAT_MS);

  watchdog = _setInterval(() => {
    if (!estado || pausaPedida) return;
    if (!parceiroSumiu(estado, userId, agora(), ttlMs)) return;
    pausaPedida = true;
    void pauseJointSession({ jointSessionId, reason: 'presence_lost' }).catch((e) => {
      // O servidor pode recusar porque o parceiro apareceu entre o nosso
      // cálculo e o lock dele. Não é erro do usuário: rearma e segue.
      pausaPedida = false;
      handlers.onError?.(e);
    });
  }, Math.max(1_000, Math.floor(ttlMs / 4)));

  return {
    refresh: () => snapshot(),
    unsubscribe: () => {
      vivo = false;
      if (heartbeat != null) _clearInterval(heartbeat);
      if (watchdog != null) _clearInterval(watchdog);
      if (reconexao != null) _clearTimeout(reconexao);
      heartbeat = null;
      watchdog = null;
      reconexao = null;
      if (canal) {
        try {
          supabase.removeChannel(canal);
        } catch {
          /* canal já descartado */
        }
        canal = null;
      }
    },
  };
};
