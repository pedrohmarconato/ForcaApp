// src/engine/sessionOutboxPolicy.ts
// Fase 4 (REQ-07) — política PURA da fila offline-first de escritas de execução
// de sessão (D-15): sem I/O, sem rede, sem AsyncStorage. Testável offline. As 4
// invariantes que este módulo garante:
//  - ordem FIFO ESTRITA por sessionLogId (D-04) — preserva a causalidade que as
//    guardas 0005/0036 do servidor esperam; uma sessão em cooldown NUNCA
//    bloqueia outra (Pitfall 4);
//  - identidade por chave natural (kind, id) — reenfileirar o MESMO alvo é
//    no-op (D-13); kinds diferentes com a MESMA chave (skip/unskip) coexistem;
//  - desistência por IDADE, nunca por número de tentativas (D-11);
//  - allowlist ESTRITA de código definitivo (D-14) — código desconhecido NUNCA
//    vira quarentena por default (Pitfall 2: perda silenciosa de dado).

import { OUTBOX_CONFIG } from './config';

export type OutboxItemKind =
  | 'save_set_log'
  | 'update_set_log_adaptation'
  | 'skip_session_exercise'
  | 'unskip_session_exercise'
  | 'swap_session_exercise'
  | 'finish_session';

export type OutboxItem = {
  /** Chave natural serializada — ver `buildItemId`/D-13. */
  id: string;
  sessionLogId: string;
  kind: OutboxItemKind;
  /** Shape específico do `kind` — nunca `any`; narrow no dispatcher de I/O. */
  payload: unknown;
  /** ISO — base da expiração por idade (D-11). */
  enqueuedAt: string;
  /** ISO — cooldown de backoff; igual a `enqueuedAt` no primeiro enfileiramento. */
  nextAttemptAt: string;
  /** Só telemetria/log — NUNCA critério de desistência (D-11 é por idade). */
  attempts: number;
};

export type QuarantineItem = {
  id: string;
  sessionLogId: string;
  kind: OutboxItemKind;
  payload: unknown;
  /** Motivo em texto (ex.: "código definitivo", "expirado", "sem setLogId resolvido"). */
  reason: string;
  /** Código do servidor que causou a quarentena, quando houver (D-14). */
  code: string | null;
  quarantinedAt: string;
  /** ISO — expira sozinho, sem crescer sem teto (D-07). */
  expiresAt: string;
};

export type OutboxDocument = {
  version: 1;
  items: OutboxItem[];
  quarantine: QuarantineItem[];
};

type BuildItemIdArgs =
  | { kind: 'save_set_log'; sessionLogId: string; plannedSetId: string }
  | { kind: 'update_set_log_adaptation'; sessionLogId: string; plannedSetId: string }
  | {
      kind: 'skip_session_exercise' | 'unskip_session_exercise' | 'swap_session_exercise';
      sessionLogId: string;
      plannedExerciseId: string;
    }
  | { kind: 'finish_session'; sessionLogId: string };

/** Chave natural exata por kind (D-13, tabela completa do Pattern 2 do RESEARCH.md). */
export const buildItemId = (args: BuildItemIdArgs): string => {
  switch (args.kind) {
    case 'save_set_log':
      return `${args.sessionLogId}:set:${args.plannedSetId}`;
    case 'update_set_log_adaptation':
      return `${args.sessionLogId}:set:${args.plannedSetId}:adapt`;
    case 'skip_session_exercise':
    case 'unskip_session_exercise':
    case 'swap_session_exercise':
      return `${args.sessionLogId}:exercise:${args.plannedExerciseId}`;
    case 'finish_session':
      return `${args.sessionLogId}:finish`;
    default: {
      const exhaustive: never = args;
      throw new Error(`buildItemId: kind não reconhecido: ${JSON.stringify(exhaustive)}`);
    }
  }
};

/**
 * Insere `newItem` na lista, ou — se já existir um item com o MESMO par
 * (kind, id) — substitui só o `payload`/`nextAttemptAt` do existente, no MESMO
 * lugar da fila (preserva a posição = ordem de inserção = FIFO). Isso é o
 * no-op de duplicação do D-13: enfileirar de novo o mesmo alvo nunca duplica.
 * `skip_session_exercise` e `unskip_session_exercise` do MESMO exercício têm a
 * MESMA `id` mas `kind`s diferentes — coexistem como itens distintos.
 */
export const upsertItem = (
  items: readonly OutboxItem[],
  newItem: OutboxItem,
): OutboxItem[] => {
  const idx = items.findIndex((it) => it.kind === newItem.kind && it.id === newItem.id);
  if (idx === -1) return [...items, newItem];
  const next = [...items];
  next[idx] = { ...items[idx], payload: newItem.payload, nextAttemptAt: newItem.nextAttemptAt };
  return next;
};

/**
 * Cabeça de CADA sub-fila (agrupada por `sessionLogId`) que não está em
 * cooldown de backoff agora. Agrupar ANTES de filtrar por `nextAttemptAt` é a
 * diferença entre D-04 (correto: uma sessão em cooldown nunca atrasa outra) e
 * uma violação de D-10 (Pitfall 4).
 */
export const nextDrainable = (
  items: readonly OutboxItem[],
  nowISO: string,
): OutboxItem[] => {
  const heads = new Map<string, OutboxItem>();
  for (const item of items) {
    // Primeira ocorrência por sessionLogId = mais antiga (array preserva a
    // ordem de inserção → FIFO natural).
    if (!heads.has(item.sessionLogId)) heads.set(item.sessionLogId, item);
  }
  return [...heads.values()].filter((item) => item.nextAttemptAt <= nowISO);
};

// Códigos confirmados por leitura das migrations (0005/0037) — allowlist
// ESTRITA (D-14/Pattern 3 do RESEARCH.md). P0001 NUNCA está aqui: é
// reconciliação de estado de sessão inteira, não recusa de item (Pitfall 3).
// '23505' substitui o 'P0005' inventado por 0036: P0005 não é um SQLSTATE
// oficial e o PostgREST mascara qualquer código que não reconhece,
// devolvendo um 500 genérico sem `.code` — achado do harness de integração
// real (04-03-PLAN.md Task 1, D-16 nível 2). A migration 0037 troca o errcode
// da guarda para '23505' (unique_violation, código oficial, propaga
// normalmente pelo PostgREST).
const DEFINITIVE_CODES = new Set(['23505', '42501', '22023', '22004', 'P0002']);

/** Código do servidor que é recusa DEFINITIVA (→ quarentena imediata). */
export const isDefinitiveRejection = (code: string | null): boolean =>
  code !== null && DEFINITIVE_CODES.has(code);

/** P0001 — sessão já finalizada no servidor (tratamento à parte, Pitfall 3). */
export const isSessionClosedCode = (code: string | null): boolean => code === 'P0001';

/**
 * Backoff exponencial com jitter, limitado ao teto configurado. `attempts`
 * alimenta SÓ o espaçamento entre tentativas — nunca a decisão de desistir
 * (D-11 é por idade).
 */
export const computeBackoff = (attempts: number, nowISO: string): string => {
  const exponential = OUTBOX_CONFIG.backoffBaseMs * Math.pow(2, Math.max(0, attempts));
  const delayMs = Math.min(OUTBOX_CONFIG.backoffMaxMs, exponential);
  const jitterMs = Math.random() * 1000;
  return new Date(new Date(nowISO).getTime() + delayMs + jitterMs).toISOString();
};

/** Idade (em dias) do item além do prazo configurado (D-11). */
export const isExpired = (enqueuedAtISO: string, nowISO: string): boolean => {
  const ageMs = new Date(nowISO).getTime() - new Date(enqueuedAtISO).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > OUTBOX_CONFIG.maxAgeDays;
};

/** Constrói o registro de quarentena (D-07): motivo + carimbo + expiração. */
export const buildQuarantineItem = (
  item: OutboxItem,
  reason: string,
  code: string | null,
  nowISO: string,
): QuarantineItem => ({
  id: item.id,
  sessionLogId: item.sessionLogId,
  kind: item.kind,
  payload: item.payload,
  reason,
  code,
  quarantinedAt: nowISO,
  expiresAt: new Date(
    new Date(nowISO).getTime() + OUTBOX_CONFIG.quarantineRetentionDays * 24 * 60 * 60 * 1000,
  ).toISOString(),
});

/** Remove entradas de quarentena vencidas — expira sozinho, sem teto (D-07). */
export const pruneExpiredQuarantine = (
  quarantine: readonly QuarantineItem[],
  nowISO: string,
): QuarantineItem[] => quarantine.filter((q) => q.expiresAt >= nowISO);
