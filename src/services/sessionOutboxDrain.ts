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

import type { Outcome, SkipReason } from '../engine/sessionModel';
import type { CardioModalidade } from '../constants/cardioModalidades';
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
import { loadOutbox, withOutboxTransaction } from './sessionOutboxStorage';
import {
  saveSetLog,
  updateSetLogAdaptation,
  getOpenSessionLog,
  getSessionLogFinishedStatus,
  skipSessionExercise,
  unskipSessionExercise,
  swapSessionExercise,
  finishSessionLog,
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

export type SkipSessionExercisePayload = {
  sessionLogId: string;
  plannedExerciseId: string;
  reason: SkipReason;
  note: string | null;
};

export type UnskipSessionExercisePayload = {
  sessionLogId: string;
  plannedExerciseId: string;
};

export type SwapSessionExercisePayload = {
  sessionLogId: string;
  plannedExerciseId: string;
  toModality: CardioModalidade;
  note: string | null;
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

/**
 * CR-03 (code review 04): sessão da adaptação CONFIRMADAMENTE fechada no
 * servidor — distinto de `UnresolvedSetLogIdError` (que ainda pode resolver
 * numa próxima passada, Pitfall 1). `classifyAndApply` trata este erro
 * IGUAL ao P0001 de qualquer outro item: descarta a sub-fila inteira da
 * sessão e reconcilia via `onSessionClosed` (Pitfall 3) — nunca quarentena
 * comum, nunca silencioso.
 */
class SessionClosedForAdaptationError extends Error {
  constructor() {
    super('sessão fechada — adaptação sem set_log para carimbar');
    this.name = 'SessionClosedForAdaptationError';
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
 * WR-02 (code review 04): payloads persistem como JSON em AsyncStorage e
 * podem ser lidos de volta por uma versão FUTURA do app (usuário fecha o
 * app com item pendente, depois atualiza) — uma mudança de shape entre
 * versões (campo renomeado/removido) faria o `as SaveSetLogPayload` etc. de
 * `dispatchItem` produzir uma chamada de RPC malformada em vez de um erro
 * diagnosticável, porque o cast bypassa a garantia do TypeScript. Guarda
 * mínima por kind, na fronteira da persistência — mesmo espírito do
 * version-guard de `parseDocument` (sessionOutboxStorage.ts): nunca lança,
 * só reporta se o formato bate com o esperado.
 */
const hasValidPayloadShape = (kind: OutboxItemKind, payload: unknown): boolean => {
  if (kind === 'finish_session') return true; // payload ignorado, ver dispatchItem
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  switch (kind) {
    case 'save_set_log':
      return (
        typeof p.sessionLogId === 'string' &&
        typeof p.plannedSetId === 'string' &&
        (p.actualReps === null || typeof p.actualReps === 'number') &&
        (p.actualLoadKg === null || typeof p.actualLoadKg === 'number') &&
        (p.actualRir === null || typeof p.actualRir === 'number') &&
        typeof p.outcome === 'string'
      );
    case 'update_set_log_adaptation':
      return (
        typeof p.userId === 'string' &&
        typeof p.plannedSessionId === 'string' &&
        typeof p.plannedSetId === 'string'
      );
    case 'skip_session_exercise':
      return (
        typeof p.sessionLogId === 'string' &&
        typeof p.plannedExerciseId === 'string' &&
        typeof p.reason === 'string'
      );
    case 'unskip_session_exercise':
      return typeof p.sessionLogId === 'string' && typeof p.plannedExerciseId === 'string';
    case 'swap_session_exercise':
      return (
        typeof p.sessionLogId === 'string' &&
        typeof p.plannedExerciseId === 'string' &&
        typeof p.toModality === 'string'
      );
    default: {
      const exhaustive: never = kind;
      return false;
    }
  }
};

/** WR-02: payload não bate com o shape esperado do kind — nunca chega à RPC. */
class InvalidPayloadShapeError extends Error {
  constructor(kind: OutboxItemKind) {
    super(`payload malformado para ${kind} (versão incompatível)`);
    this.name = 'InvalidPayloadShapeError';
  }
}

/**
 * Único ponto que decide "chamar a RPC agora". As 6 operações do D-01 têm
 * dispatcher aqui (fechado no 04-02): `save_set_log`/`update_set_log_adaptation`
 * (04-01) e `skip_session_exercise`/`unskip_session_exercise`/
 * `swap_session_exercise`/`finish_session` (04-02) — todos sob o MESMO
 * `withTimeout` e a MESMA classificação de erro em `classifyAndApply`.
 */
const dispatchItem = async (item: OutboxItem, signal: AbortSignal): Promise<void> => {
  // WR-02: valida o shape ANTES de qualquer cast/RPC — ver hasValidPayloadShape.
  if (!hasValidPayloadShape(item.kind, item.payload)) {
    throw new InvalidPayloadShapeError(item.kind);
  }
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
        // CR-03 (fechado): getOpenSessionLog só enxerga sessão ABERTA — não
        // encontrar aqui é ambíguo entre "sessão fechada" (precisa da
        // reconciliação P0001/Pitfall 3) e "o save_set_log correspondente
        // ainda não confirmou" (Pitfall 1, retry normal). Checagem extra e
        // barata (SELECT simples, mesma RLS, sem RPC nova) resolve a
        // ambiguidade antes de decidir qual erro lançar.
        const status = await getSessionLogFinishedStatus(p.userId, item.sessionLogId);
        if (status?.finished) {
          throw new SessionClosedForAdaptationError();
        }
        // Sessão ainda aberta (ou log não encontrado/RLS) — não há setLogId
        // a carimbar ainda (Pitfall 1). Não é transporte nem código de
        // servidor: tratamento próprio no classificador de drainAll.
        throw new UnresolvedSetLogIdError();
      }
      await updateSetLogAdaptation(setLogId, p.adaptation, p.decision);
      return;
    }
    case 'skip_session_exercise': {
      const p = item.payload as SkipSessionExercisePayload;
      await skipSessionExercise({
        sessionLogId: p.sessionLogId,
        plannedExerciseId: p.plannedExerciseId,
        reason: p.reason,
        note: p.note,
      });
      return;
    }
    case 'unskip_session_exercise': {
      const p = item.payload as UnskipSessionExercisePayload;
      await unskipSessionExercise({
        sessionLogId: p.sessionLogId,
        plannedExerciseId: p.plannedExerciseId,
      });
      return;
    }
    case 'swap_session_exercise': {
      const p = item.payload as SwapSessionExercisePayload;
      await swapSessionExercise({
        sessionLogId: p.sessionLogId,
        plannedExerciseId: p.plannedExerciseId,
        toModality: p.toModality,
        note: p.note,
      });
      return;
    }
    case 'finish_session': {
      await finishSessionLog(item.sessionLogId);
      return;
    }
    default: {
      const exhaustive: never = item.kind;
      throw new Error(`sessionOutboxDrain: kind não reconhecido: ${JSON.stringify(exhaustive)}`);
    }
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
 * payload malformado (WR-02 — nunca chegou a tentar a RPC, retentar não
 * ajuda), depois transporte, depois allowlist definitiva (D-14), depois o
 * caso especial de setLogId não resolvido (Pitfall 1), por fim qualquer erro
 * não classificado (Pitfall 2 — retentável até expirar, NUNCA quarentena por
 * default).
 */
const classifyAndApply = (
  doc: OutboxDocument,
  item: OutboxItem,
  error: unknown,
  nowISO: string,
  callbacks: DrainCallbacks | undefined,
): OutboxDocument => {
  if (isSessionClosedCode(codeOf(error)) || error instanceof SessionClosedForAdaptationError) {
    callbacks?.onSessionClosed?.(item.sessionLogId);
    return discardSessionSubQueue(doc, item.sessionLogId);
  }

  if (error instanceof InvalidPayloadShapeError) {
    // WR-02: shape errado nunca vai se resolver sozinho com backoff — vai
    // direto para quarentena, com reason clara para diagnóstico, em vez de
    // retentar (Pitfall 2 é para erro DESCONHECIDO do servidor, não para
    // este caso — aqui a causa já está identificada no cliente).
    return quarantineItem(doc, item, 'payload malformado (versão incompatível)', null, nowISO);
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
 * Enfileira UM item (D-13: chave natural, no-op de duplicação). Todo o ciclo
 * leitura→mutação→escrita roda dentro de `withOutboxTransaction` (CR-01):
 * nenhuma segunda chamada de `enqueueItem`/`drainAll` para o MESMO userId
 * pode intercalar sua própria leitura/escrita no meio deste ciclo.
 *
 * CR-02: se a LEITURA falhar de forma transitória, `loadFailed=true` — NÃO
 * persiste (evita sobrescrever a fila real em disco com um documento vazio +
 * o item novo, perdendo qualquer item que já estivesse lá). O item novo
 * ainda é devolvido "pendente" só em memória, para a contagem síncrona do
 * chamador e para a tentativa de drenagem imediata funcionarem mesmo assim.
 *
 * Se a ESCRITA falhar (D-12), NÃO relança — o item ainda é considerado
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

  let lastKnownDoc: OutboxDocument | null = null;
  try {
    return await withOutboxTransaction(userId, async (doc, loadFailed) => {
      if (loadFailed) {
        console.warn(
          '[sessionOutboxDrain] falha ao carregar a fila local (não-fatal) — pulando persistência para não sobrescrever a fila real em disco (CR-02)',
        );
        const inMemoryOnly: OutboxDocument = { version: 1, items: [newItem], quarantine: [] };
        return { doc: inMemoryOnly, result: inMemoryOnly, skipSave: true };
      }
      const updatedDoc: OutboxDocument = { ...doc, items: upsertItem(doc.items, newItem) };
      lastKnownDoc = updatedDoc;
      return { doc: updatedDoc, result: updatedDoc };
    });
  } catch (e) {
    // D-12: falha de AsyncStorage ao ESCREVER não bloqueia — o item segue
    // "pendente" em memória (contagem síncrona reflete o último merge
    // conhecido, calculado com o doc real lido acima) e uma tentativa de
    // drenagem acontece do mesmo jeito. Chamador (store) reusa
    // storageWarning/STORAGE_WARNING_MSG existente.
    console.warn('[sessionOutboxDrain] item não persistido localmente (não-fatal, D-12):', e);
    return lastKnownDoc ?? { version: 1, items: [newItem], quarantine: [] };
  }
};

const MAX_DRAIN_ROUNDS = 50;

/**
 * Drena a fila do usuário: `pruneExpiredQuarantine` primeiro, depois um laço
 * limitado processando `nextDrainable` a cada rodada (uma tentativa por
 * sub-fila/sessionLogId por rodada, preservando FIFO).
 *
 * CR-01 (code review 04): cada rodada lê o documento DO ZERO logo antes de
 * persistir (nunca reusa uma cópia em memória capturada rodadas atrás) e
 * aplica a classificação de cada item só se ele AINDA estiver presente no
 * documento fresco — outro escritor (um `enqueueItem`/`drainAll` concorrente
 * para o MESMO userId) pode ter enfileirado ou resolvido algo nesse meio
 * tempo, e sobrescrever esse trabalho por cima seria exatamente a perda
 * silenciosa que D-07 proíbe. A leitura+mutação+escrita de CADA rodada roda
 * dentro de `withOutboxTransaction` (mutex por usuário) — mas a chamada de
 * REDE (RPC, até `RPC_TIMEOUT_MS` por item) fica FORA da transação, para uma
 * `enqueueItem` concorrente nunca ficar presa atrás de uma rodada de
 * drenagem em voo (isso reintroduziria espera de rede em `completeSet`,
 * violando D-05 — o motivo desta fase existir).
 */
export const drainAll = async (
  userId: string,
  callbacks?: DrainCallbacks,
): Promise<{ pendingCount: number; quarantineCount: number }> => {
  // Leitura inicial só para decidir se a fila está genuinamente acessível e
  // podar quarentena expirada — cada rodada abaixo relê por conta própria
  // (não é a fonte de verdade usada para persistir os itens). Falha aqui
  // aborta a drenagem inteira sem persistir nada e sem chamar
  // onSummaryChanged, mesmo comportamento de antes desta correção.
  let initialLoadFailed = false;
  try {
    await withOutboxTransaction(userId, async (doc, loadFailed) => {
      initialLoadFailed = loadFailed;
      if (loadFailed) return { doc, result: undefined, skipSave: true };
      const bootNow = new Date().toISOString();
      const pruned: OutboxDocument = { ...doc, quarantine: pruneExpiredQuarantine(doc.quarantine, bootNow) };
      return { doc: pruned, result: undefined };
    });
  } catch (e) {
    console.warn('[sessionOutboxDrain] falha ao preparar a drenagem (não-fatal):', e);
    return { pendingCount: 0, quarantineCount: 0 };
  }
  if (initialLoadFailed) {
    console.warn('[sessionOutboxDrain] falha ao carregar a fila local para drenar (não-fatal)');
    return { pendingCount: 0, quarantineCount: 0 };
  }

  try {
    for (let round = 0; round < MAX_DRAIN_ROUNDS; round++) {
      const now = new Date().toISOString();
      let currentDoc: OutboxDocument;
      try {
        currentDoc = await loadOutbox(userId);
      } catch (e) {
        console.warn('[sessionOutboxDrain] falha ao reler a fila para decidir a próxima rodada (não-fatal):', e);
        break;
      }
      const heads = nextDrainable(currentDoc.items, now);
      if (heads.length === 0) break;

      // Rede FORA do mutex (ver comentário acima) — cada item aguarda no
      // máximo RPC_TIMEOUT_MS, sequencial por rodada (mesma ordem de antes).
      const outcomes: Array<{ item: OutboxItem; error: unknown | null }> = [];
      for (const item of heads) {
        try {
          await withTimeout((signal) => dispatchItem(item, signal), RPC_TIMEOUT_MS);
          outcomes.push({ item, error: null });
        } catch (error) {
          outcomes.push({ item, error });
        }
      }

      try {
        await withOutboxTransaction(userId, async (doc, loadFailed) => {
          if (loadFailed) {
            // CR-02 aplicado aqui também: não sobrescreve o disco com um
            // documento vazio só porque a releitura desta rodada falhou —
            // a próxima rodada/chamada de drainAll tenta de novo.
            console.warn(
              '[sessionOutboxDrain] falha ao reler a fila antes de persistir a rodada (não-fatal) — pulando persistência para não sobrescrever a fila real em disco',
            );
            return { doc, result: doc, skipSave: true };
          }
          let next = doc;
          const nowClassify = new Date().toISOString();
          for (const { item, error } of outcomes) {
            // Idempotência (CR-01): o item pode já ter sido removido/
            // resolvido por outro escritor concorrente (ex.: uma segunda
            // drenagem que já processou a mesma sub-fila) — só aplica se
            // AINDA estiver presente no documento fresco.
            const stillPresent = next.items.some((it) => it.kind === item.kind && it.id === item.id);
            if (!stillPresent) continue;
            next = error === null ? removeItem(next, item) : classifyAndApply(next, item, error, nowClassify, callbacks);
          }
          return { doc: next, result: next };
        });
      } catch (e) {
        console.warn('[sessionOutboxDrain] fila drenada não persistida (não-fatal, D-12):', e);
      }
    }
  } catch (e) {
    // Defesa em profundidade: um bug de plumbing na fila nunca pode travar a
    // experiência do treino (a fila é fire-and-forget a partir do store).
    console.warn('[sessionOutboxDrain] drenagem interrompida por erro inesperado (não-fatal):', e);
  }

  const finalDoc = await loadOutbox(userId).catch(() => ({ version: 1 as const, items: [], quarantine: [] }));
  const pendingCount = finalDoc.items.length;
  const quarantineCount = finalDoc.quarantine.length;
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
