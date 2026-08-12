// src/services/sessionOutboxDrain.ts
// Fase 4 (REQ-07) — orquestrador da fila offline-first: único ponto que chama
// RPC sob timeout. Compõe sessionOutboxPolicy.ts (política pura, D-15) +
// sessionOutboxStorage.ts (persistência, D-09) + sessionExecutionRepository.ts
// (RPCs intocadas, D-02). Nunca reimplementa classificação de erro
// (isTransportSessionExecutionError) nem timeout (withTimeout) — reusa o que
// já existe e já está testado em produção.
//
// P0001 (sessão já finalizada) NÃO é quarentena comum: descarta a SUB-FILA
// INTEIRA daquela sessionLogId e reconcilia o estado local via callback
// (Pitfall 3) — nunca silencioso, diferente da quarentena comum do D-06.

import type { Outcome } from '../engine/sessionModel';
import {
  buildItemId,
  upsertItem,
  nextDrainable,
  isDefinitiveRejection,
  isSessionClosedCode,
  computeBackoff,
  isExpired,
  buildQuarantineItem,
  pruneExpiredQuarantine,
  type OutboxItem,
  type OutboxItemKind,
} from '../engine/sessionOutboxPolicy';
import type { OutboxDocument } from '../engine/sessionOutboxPolicy';
import { loadOutbox, saveOutbox } from './sessionOutboxStorage';
import {
  saveSetLog,
  updateSetLogAdaptation,
  getOpenSessionLog,
  isTransportSessionExecutionError,
  SessionExecutionRequestError,
} from './sessionExecutionRepository';

export type SaveSetLogPayload = {
  sessionLogId: string;
  plannedSetId: string;
  actualReps: number | null;
  actualLoadKg: number | null;
  actualRir: number | null;
  outcome: Outcome;
  startedAt?: string | null;
  actualDurationSeconds?: number | null;
  actualDistanceM?: number | null;
  perceivedEffort?: 'leve' | 'moderado' | 'forte' | null;
};

/**
 * `plannedSetId` (não `setLogId`) — o setLogId só existe DEPOIS que o
 * save_set_log correspondente drena (Pitfall 1). `userId`/`plannedSessionId`
 * são necessários para `getOpenSessionLog` resolver o setLogId tardiamente.
 */
export type UpdateSetLogAdaptationPayload = {
  userId: string;
  plannedSessionId: string;
  plannedSetId: string;
  adaptation: unknown;
  decision?: unknown;
};

export type DrainCallbacks = {
  /** P0001 — sessão fechada no servidor durante a drenagem (Pitfall 3). */
  onSessionClosed?: (sessionLogId: string) => void;
  /** Contagem síncrona pós-drenagem, para o selo de pendência (D-05). */
  onSummaryChanged?: (pendingCount: number, quarantineCount: number) => void;
};

// Tempo máximo de UMA chamada de RPC da fila (mesmo valor/mesma semântica de
// activeSessionStore.ts antes desta fase — "exportado para o teste exercitar
// o limite sem esperar de verdade").
export const RPC_TIMEOUT_MS = 15000;

/**
 * Corre uma promessa contra um timeout. Se o limite vence, REJEITA e SEMPRE
 * limpa o timer (sem handles pendurados) — mesma implementação de
 * activeSessionStore.ts, movida verbatim para cá (D-15).
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
        new Error('Tempo esgotado ao gravar na fila. Verifique a conexão e tente de novo.'),
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

/** Item de adaptação sem setLogId resolvido ainda — nem transporte, nem erro classificado do servidor. */
class UnresolvedSetLogIdError extends Error {
  constructor() {
    super('sem setLogId resolvido');
    this.name = 'UnresolvedSetLogIdError';
  }
}

const codeOf = (error: unknown): string | null =>
  error instanceof SessionExecutionRequestError ? error.code : null;

/** Chave natural (D-13) derivada do payload — mesma tabela de buildItemId. */
const idFor = (sessionLogId: string, kind: OutboxItemKind, payload: unknown): string => {
  switch (kind) {
    case 'save_set_log':
      return buildItemId({
        kind,
        sessionLogId,
        plannedSetId: (payload as SaveSetLogPayload).plannedSetId,
      });
    case 'update_set_log_adaptation':
      return buildItemId({
        kind,
        sessionLogId,
        plannedSetId: (payload as UpdateSetLogAdaptationPayload).plannedSetId,
      });
    case 'skip_session_exercise':
    case 'unskip_session_exercise':
    case 'swap_session_exercise':
      return buildItemId({
        kind,
        sessionLogId,
        plannedExerciseId: (payload as { plannedExerciseId: string }).plannedExerciseId,
      });
    case 'finish_session':
      return buildItemId({ kind, sessionLogId });
    default: {
      const exhaustive: never = kind;
      throw new Error(`sessionOutboxDrain: kind não reconhecido: ${JSON.stringify(exhaustive)}`);
    }
  }
};

/**
 * Único ponto que decide "chamar a RPC agora". Nesta fase (04-01), só
 * `save_set_log` e `update_set_log_adaptation` têm dispatcher — os outros 4
 * kinds do D-01 ainda não são gerados por lugar nenhum do store (04-02 os
 * adiciona).
 */
const dispatchItem = async (item: OutboxItem, signal: AbortSignal): Promise<void> => {
  switch (item.kind) {
    case 'save_set_log': {
      const p = item.payload as SaveSetLogPayload;
      await saveSetLog(
        {
          sessionLogId: p.sessionLogId,
          plannedSetId: p.plannedSetId,
          actualReps: p.actualReps,
          actualLoadKg: p.actualLoadKg,
          actualRir: p.actualRir,
          outcome: p.outcome,
          startedAt: p.startedAt,
          actualDurationSeconds: p.actualDurationSeconds,
          actualDistanceM: p.actualDistanceM,
          perceivedEffort: p.perceivedEffort,
        },
        signal,
      );
      return;
    }
    case 'update_set_log_adaptation': {
      const p = item.payload as UpdateSetLogAdaptationPayload;
      const aberta = await getOpenSessionLog(p.userId, p.plannedSessionId);
      const setLogId = aberta?.setLogs.find((sl) => sl.planned_set_id === p.plannedSetId)?.id;
      if (!setLogId) {
        // Sessão fechada ou o save_set_log correspondente nunca confirmou —
        // não há setLogId a carimbar ainda (Pitfall 1). Não é transporte nem
        // código de servidor: tratamento próprio no classificador de drainAll.
        throw new UnresolvedSetLogIdError();
      }
      await updateSetLogAdaptation(setLogId, p.adaptation, p.decision);
      return;
    }
    default:
      // 04-02-PLAN.md adiciona os dispatchers de skip/unskip/swap/finish.
      throw new Error(
        `sessionOutboxDrain: kind '${item.kind}' ainda não tem dispatcher (04-02-PLAN.md).`,
      );
  }
};

const removeItem = (doc: OutboxDocument, item: OutboxItem): OutboxDocument => ({
  ...doc,
  items: doc.items.filter((it) => !(it.kind === item.kind && it.id === item.id)),
});

const quarantineItem = (
  doc: OutboxDocument,
  item: OutboxItem,
  reason: string,
  code: string | null,
  nowISO: string,
): OutboxDocument => ({
  ...removeItem(doc, item),
  quarantine: [...doc.quarantine, buildQuarantineItem(item, reason, code, nowISO)],
});

const rescheduleItem = (doc: OutboxDocument, item: OutboxItem, nowISO: string): OutboxDocument => ({
  ...doc,
  items: doc.items.map((it) =>
    it.kind === item.kind && it.id === item.id
      ? { ...it, attempts: it.attempts + 1, nextAttemptAt: computeBackoff(it.attempts + 1, nowISO) }
      : it,
  ),
});

const discardSessionSubQueue = (doc: OutboxDocument, sessionLogId: string): OutboxDocument => ({
  ...doc,
  items: doc.items.filter((it) => it.sessionLogId !== sessionLogId),
});

/**
 * Classifica UM erro de drenagem e devolve o documento atualizado. Ordem de
 * checagem importa: P0001 primeiro (Pitfall 3, não é recusa de item), depois
 * transporte, depois allowlist definitiva (D-14), depois o caso especial de
 * setLogId não resolvido (Pitfall 1), por fim qualquer erro não classificado
 * (Pitfall 2 — retentável até expirar, NUNCA quarentena por default).
 */
const classifyAndApply = (
  doc: OutboxDocument,
  item: OutboxItem,
  error: unknown,
  nowISO: string,
  callbacks: DrainCallbacks | undefined,
): OutboxDocument => {
  if (isSessionClosedCode(codeOf(error))) {
    callbacks?.onSessionClosed?.(item.sessionLogId);
    return discardSessionSubQueue(doc, item.sessionLogId);
  }

  const expired = isExpired(item.enqueuedAt, nowISO);

  if (isTransportSessionExecutionError(error)) {
    return expired
      ? quarantineItem(doc, item, 'expirado após tentativas de transporte', null, nowISO)
      : rescheduleItem(doc, item, nowISO);
  }

  const code = codeOf(error);
  if (isDefinitiveRejection(code)) {
    return quarantineItem(doc, item, 'código definitivo', code, nowISO);
  }

  if (error instanceof UnresolvedSetLogIdError) {
    return expired
      ? quarantineItem(doc, item, 'sem setLogId resolvido', null, nowISO)
      : rescheduleItem(doc, item, nowISO);
  }

  // Erro de servidor sem código reconhecido, ou sem `.code` nenhum (Pitfall 2):
  // NUNCA quarentena por classificação incerta — só o backstop de idade (D-11).
  return expired
    ? quarantineItem(doc, item, 'expirado sem classificação definitiva', code, nowISO)
    : rescheduleItem(doc, item, nowISO);
};

/**
 * Enfileira UM item (D-13: chave natural, no-op de duplicação). Se a
 * persistência falhar (D-12), NÃO relança — o item ainda é considerado
 * "pendente" no documento devolvido (contagem síncrona correta), e a
 * drenagem tenta do mesmo jeito a partir da versão em memória.
 */
export const enqueueItem = async (
  userId: string,
  params: { sessionLogId: string; kind: OutboxItemKind; payload: unknown },
): Promise<OutboxDocument> => {
  const nowISO = new Date().toISOString();
  const newItem: OutboxItem = {
    id: idFor(params.sessionLogId, params.kind, params.payload),
    sessionLogId: params.sessionLogId,
    kind: params.kind,
    payload: params.payload,
    enqueuedAt: nowISO,
    nextAttemptAt: nowISO,
    attempts: 0,
  };

  let doc: OutboxDocument;
  try {
    doc = await loadOutbox(userId);
  } catch (e) {
    console.warn('[sessionOutboxDrain] falha ao carregar a fila local (não-fatal):', e);
    doc = { version: 1, items: [], quarantine: [] };
  }
  const updatedDoc: OutboxDocument = { ...doc, items: upsertItem(doc.items, newItem) };

  try {
    await saveOutbox(userId, updatedDoc);
  } catch (e) {
    // D-12: falha de AsyncStorage ao enfileirar NÃO bloqueia — o item segue
    // "pendente" em memória (contagem síncrona já reflete `updatedDoc`) e uma
    // tentativa de drenagem acontece do mesmo jeito. Chamador (store) reusa
    // storageWarning/STORAGE_WARNING_MSG existente.
    console.warn('[sessionOutboxDrain] item não persistido localmente (não-fatal, D-12):', e);
  }

  return updatedDoc;
};

const MAX_DRAIN_ROUNDS = 50;

/**
 * Drena a fila do usuário: `pruneExpiredQuarantine` primeiro, depois um laço
 * limitado processando `nextDrainable` a cada rodada (uma tentativa por
 * sub-fila/sessionLogId por rodada, preservando FIFO). Persiste ao fim de
 * CADA rodada; chama `onSummaryChanged` só ao final.
 */
export const drainAll = async (
  userId: string,
  callbacks?: DrainCallbacks,
): Promise<{ pendingCount: number; quarantineCount: number }> => {
  let doc: OutboxDocument;
  try {
    doc = await loadOutbox(userId);
  } catch (e) {
    console.warn('[sessionOutboxDrain] falha ao carregar a fila local para drenar (não-fatal):', e);
    return { pendingCount: 0, quarantineCount: 0 };
  }

  try {
    const bootNow = new Date().toISOString();
    doc = { ...doc, quarantine: pruneExpiredQuarantine(doc.quarantine, bootNow) };

    for (let round = 0; round < MAX_DRAIN_ROUNDS; round++) {
      const now = new Date().toISOString();
      const heads = nextDrainable(doc.items, now);
      if (heads.length === 0) break;

      for (const item of heads) {
        try {
          await withTimeout((signal) => dispatchItem(item, signal), RPC_TIMEOUT_MS);
          doc = removeItem(doc, item);
        } catch (error) {
          doc = classifyAndApply(doc, item, error, new Date().toISOString(), callbacks);
        }
      }

      try {
        await saveOutbox(userId, doc);
      } catch (e) {
        console.warn('[sessionOutboxDrain] fila drenada não persistida (não-fatal, D-12):', e);
      }
    }
  } catch (e) {
    // Defesa em profundidade: um bug de plumbing na fila nunca pode travar a
    // experiência do treino (a fila é fire-and-forget a partir do store).
    console.warn('[sessionOutboxDrain] drenagem interrompida por erro inesperado (não-fatal):', e);
  }

  const pendingCount = doc.items.length;
  const quarantineCount = doc.quarantine.length;
  callbacks?.onSummaryChanged?.(pendingCount, quarantineCount);
  return { pendingCount, quarantineCount };
};

/**
 * Enfileira e dispara a drenagem SEM aguardá-la (D-05/D-03): a UI nunca
 * espera a rede. Devolve os contadores síncronos calculados a partir do
 * documento que acabou de ser enfileirado.
 */
export const enqueueAndDrain = async (
  userId: string,
  params: { sessionLogId: string; kind: OutboxItemKind; payload: unknown },
  callbacks?: DrainCallbacks,
): Promise<{ pendingCount: number; quarantineCount: number }> => {
  const doc = await enqueueItem(userId, params);
  void drainAll(userId, callbacks);
  return { pendingCount: doc.items.length, quarantineCount: doc.quarantine.length };
};
