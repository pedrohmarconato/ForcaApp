# Phase 4: Escrita de execução de treino em lote e offline-first - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 8 new/modified (per RESEARCH.md "Recommended Project Structure" + Wave 0 test gaps)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/engine/sessionOutboxPolicy.ts` | utility (pure engine) | transform | `src/engine/intraSessionAdaptation.ts` / `src/engine/config.ts` pattern of pure functions + config | role-match |
| `src/engine/config.ts` (edited — add `OUTBOX_CONFIG`) | config | transform | itself (`ADAPT_CONFIG`/`ReplanConfig` blocks already in file) | exact |
| `src/services/sessionOutboxStorage.ts` | service (I/O) | file-I/O | `src/services/sessionDraftStorage.ts` | exact |
| `src/services/sessionOutboxDrain.ts` | service (orchestrator) | event-driven / request-response | `src/store/activeSessionStore.ts` (`completeSet` RPC-calling section) + `sessionExecutionRepository.ts` (error classification) | role-match |
| `src/hooks/useSessionOutboxDrain.ts` | hook | event-driven | `src/hooks/useDiaLocal.ts` | exact |
| `src/store/activeSessionStore.ts` (edited — `completeSet`, `updateSetLogAdaptation`, `skipSessionExercise`, `unskipSessionExercise`, `swapSessionExercise`, `finishSessionLog`) | store | CRUD / request-response | itself (existing `completeSet` at `:1178-1380`) | exact |
| `__tests__/sessionOutboxPolicy.test.ts` | test | transform | `__tests__/completeSetAdaptacaoNaoDerruba.test.ts` (mock shape of `sessionExecutionRepository`) + any existing `src/engine/*.test.ts` for pure-function test style | role-match |
| `__tests__/sessionOutboxStorage.test.ts` | test | file-I/O | existing draft-storage tests (search `__tests__/*sessionDraftStorage*` or `activeSessionStore.test.ts` AsyncStorage mocks) | role-match |
| `__tests__/integration/sessionOutboxDrain.postgrest.test.ts` | test | event-driven | `.planning/phases/03-.../03-07-PLAN.md` harness (Postgres local, `jest.integration.config.js`) | exact |

## Pattern Assignments

### `src/services/sessionOutboxStorage.ts` (service, file-I/O)

**Analog:** `src/services/sessionDraftStorage.ts` (full file, 115 lines — read in full)

**Imports pattern** (lines 1-9):
```typescript
// src/services/sessionDraftStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { coerceDraftNumerics, type SessionDraft } from '../engine/sessionModel';
```
Copy directly: `import AsyncStorage from '@react-native-async-storage/async-storage';` plus whatever type import is needed from `src/engine/sessionOutboxPolicy.ts` for `OutboxDocument`/`OutboxItem`.

**Key derivation pattern** (lines 11-14):
```typescript
const legacyKeyFor = (userId: string): string => `@active_session_draft_${userId}`;
const keyFor = (userId: string, plannedSessionId: string): string =>
  `@active_session_draft_${userId}_${plannedSessionId}`;
```
For the outbox, RESEARCH.md's recommendation (Pattern 1, A1) is a single per-user key with no legacy migration needed: `const keyFor = (userId: string): string => \`@session_outbox_${userId}\`;` — simpler than the draft's dual-key migration because there is no prior format to migrate from.

**`withKeyQueue` concurrency pattern — copy verbatim** (lines 16-36):
```typescript
const keyQueues = new Map<string, Promise<void>>();
const withKeyQueue = async <T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> => {
  const previous = keyQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  keyQueues.set(key, turn);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (keyQueues.get(key) === turn) keyQueues.delete(key);
  }
};
```
This is the exact serialization primitive D-09 mandates reusing — "Don't Hand-Roll" table in RESEARCH.md explicitly forbids reimplementing this.

**Parse-with-version-guard pattern** (lines 38-56):
```typescript
const parseDraft = (raw: string | null): SessionDraft | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && typeof parsed.plannedSessionId === 'string') {
      return coerceDraftNumerics(parsed as SessionDraft);
    }
    return null;
  } catch {
    return null;
  }
};
```
Adapt to: parse never throws, unknown/corrupted/old-version document returns an empty `OutboxDocument` (`{ version: 1, items: [], quarantine: [] }`), never `null` that crashes a caller expecting an array.

**Read/write functions** (lines 58-87) — `saveDraft`/`loadDraft` show the public API shape: async function per key, wrapped in `withKeyQueue`, single `AsyncStorage.setItem`/`getItem` call. `sessionOutboxStorage.ts` needs `loadOutbox(userId)` / `saveOutbox(userId, doc)` in the same shape — RESEARCH.md's Code Examples section already sketches this exact signature.

**D-12 addition not in the analog:** `sessionDraftStorage.ts` lets `AsyncStorage` errors propagate. The outbox must NOT — D-12 requires that an `AsyncStorage` write failure never blocks enqueueing; the caller (`sessionOutboxDrain.ts`) must catch and keep the item in memory, reusing `storageWarning`/`STORAGE_WARNING_MSG` (search `activeSessionStore.ts` for the existing constant/usage to copy the exact warning contract).

---

### `src/hooks/useSessionOutboxDrain.ts` (hook, event-driven)

**Analog:** `src/hooks/useDiaLocal.ts` (full file, 52 lines — read in full)

**AppState listener pattern — copy verbatim** (lines 40-47):
```typescript
const assinatura = AppState.addEventListener('change', (estado) => {
  if (estado === 'active') atualizar();
});

return () => {
  clearTimeout(timer);
  assinatura.remove();
};
```

**Full hook shape to mirror** (lines 20-51): `useState` seeded via lazy initializer, `useEffect` with cleanup returning `assinatura.remove()`. `useSessionOutboxDrain` drops the midnight-timer half (not applicable) and keeps only the `AppState` half plus a mount-time call, exactly as RESEARCH.md's own sketch (`Code Examples` → "Gatilho de AppState") already shows:
```typescript
export const useSessionOutboxDrain = (userId: string | null): void => {
  useEffect(() => {
    if (!userId) return;
    void drainAll(userId);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drainAll(userId);
    });
    return () => sub.remove();
  }, [userId]);
};
```
Mount point: near the root (`App.tsx`/`RootNavigator`), per D-10 — not inside `ActiveSessionScreen.tsx` (Anti-Pattern explicitly called out in RESEARCH.md).

---

### `src/engine/sessionOutboxPolicy.ts` (utility, pure/transform)

**Analog:** `src/engine/config.ts` for the config-object convention; no single existing pure-policy file matches 1:1, but `src/engine/` already enforces "no I/O" as an architectural rule (ARCHITECTURE.md) — mirror the shape of `intraSessionAdaptation.ts`'s exported pure functions (search that file for the exported-function-per-decision pattern already used for `ADAPT_CONFIG`-driven logic) rather than any I/O module.

**Config addition pattern — copy structure from `ADAPT_CONFIG`** (`src/engine/config.ts` lines 8-38):
```typescript
export type AdaptConfig = { /* ...documented fields, one per tunable... */ };
export const ADAPT_CONFIG: AdaptConfig = {
  loadPctPerRep: 0.03, // ~3% por rep de desvio — PADRÃO A VALIDAR
  // ...
};
```
Add a new exported `OutboxConfig` type + `OUTBOX_CONFIG` const in the same file, same style: named fields with inline comments explaining the tunable, e.g. `maxAgeDays`, `backoffBaseMs`, `backoffMaxMs`, `quarantineRetentionDays` — no bare literals scattered in `sessionOutboxPolicy.ts` (per "Established Patterns" in CONTEXT.md: "Número tunável em config.ts, nunca literal espalhado").

**Type/function sketch — from RESEARCH.md Pattern 1/2/3 (already vetted against the codebase):**
```typescript
export type OutboxItemKind =
  | 'save_set_log' | 'update_set_log_adaptation' | 'skip_session_exercise'
  | 'unskip_session_exercise' | 'swap_session_exercise' | 'finish_session';

export type OutboxItem = {
  id: string;
  sessionLogId: string;
  kind: OutboxItemKind;
  payload: unknown;
  enqueuedAt: string;
  nextAttemptAt: string;
  attempts: number;
};

export const nextDrainable = (items: readonly OutboxItem[], nowISO: string): OutboxItem[] => {
  const heads = new Map<string, OutboxItem>();
  for (const item of items) {
    if (!heads.has(item.sessionLogId)) heads.set(item.sessionLogId, item);
  }
  return [...heads.values()].filter((item) => item.nextAttemptAt <= nowISO);
};

const DEFINITIVE_CODES = new Set(['P0005', '42501', '22023', '22004', 'P0002']);
export const isDefinitiveRejection = (code: string | null): boolean =>
  code !== null && DEFINITIVE_CODES.has(code);
```
Note `unknown` for `payload`, narrowed by `kind` at the call site — matches project's `typescript/coding-style.md` rule to avoid `any`.

---

### `src/services/sessionOutboxDrain.ts` (service, orchestrator)

**Analog (error classification to reuse verbatim):** `src/services/sessionExecutionRepository.ts` lines 78-137

**Error type — copy the class and helper, don't reimplement:**
```typescript
export class SessionExecutionRequestError extends Error {
  readonly kind: RequestErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  // ...
}

export const isTransportSessionExecutionError = (
  error: unknown,
): error is SessionExecutionRequestError =>
  error instanceof SessionExecutionRequestError && error.kind === 'transport';
```
`sessionOutboxDrain.ts` must import `isTransportSessionExecutionError` and `SessionExecutionRequestError` from `sessionExecutionRepository.ts` — never write a parallel `error.message.includes(...)` heuristic (explicit "Don't Hand-Roll" entry in RESEARCH.md).

**Analog (orchestration shape — RPC call + error handling):** `src/store/activeSessionStore.ts` `completeSet` lines 1178-1260 (excerpt read above)

```typescript
inFlight.add(lockKey);
try {
  const saved = await withTimeout(
    (signal) => saveSetLog({ /* params */ }, signal),
    RPC_TIMEOUT_MS,
  );
  // ...CAS check on operationEpoch before committing...
} finally {
  inFlight.delete(lockKey);
}
```
The `withTimeout`/`RPC_TIMEOUT_MS` pair (`activeSessionStore.ts:215-265`) must be reused as-is per RESEARCH.md's "Don't Hand-Roll" table — its `finally` always releases the lock even on timeout; do not build a new `AbortController` wrapper.

**P0001 special case — copy the existing special-case check, do not treat as generic quarantine** (search `isClosedSessionError`, `activeSessionStore.ts:267-268` and its use at `:1380-1386`): when `error.code === 'P0001'`, `sessionOutboxDrain.ts` must discard all pending items for that `sessionLogId` and trigger the same local reconciliation (`retireLocalDraft`, mark session `'finished'`) — this is NOT the silent D-06 quarantine path.

---

### `src/store/activeSessionStore.ts` (edited — store, CRUD/request-response)

**Analog:** itself — the six call sites already read/verified in RESEARCH.md (`:1238` `saveSetLog`, `:1351`/`:1429` `updateSetLogAdaptation`, `:1453` skip, `:1497` unskip, `:1544` swap, `:1636` finish).

**Current pattern to replace at each site** (`completeSet`, lines 1178-1260 read above): direct `await withTimeout((signal) => rpcCall(...), RPC_TIMEOUT_MS)` inside `try { inFlight.add(...) } finally { inFlight.delete(...) }`, followed by a CAS re-check (`operationEpoch !== epoch`) before committing to `set({ draft: novo })`.

**Target pattern (from RESEARCH.md "Code Examples" — already vetted, not invented here):**
```typescript
completeSet: async (exerciseId, setOrder) => {
  // ...same local validation, reentrancy, CAS as today...
  const item = buildSaveSetLogItem({ sessionLogId: sid, plannedSetId: serie.plannedSetId, ...params });
  await enqueueAndDrain(draft.userId, item); // durable first (D-12), drains after
  const novo = withSet(atual, exerciseId, setOrder, (s) => ({ ...s, status: 'done' }));
  set({ draft: novo, saveError: null }); // never saveError here — D-05
  return true;
},
```
Keep the existing reentrancy lock (`inFlight`, keyed `${sessionLogId}:${plannedSetId}`) and the `status === 'done'` short-circuit (`:1189`) unchanged — D-13 explicitly says these already deliver the dedupe semantics the outbox wants.

**Contract change to propagate (Pitfall 5):** `completeSet` (and the other 5 actions) return `Promise<boolean>` — after this phase, they return `true` on successful local/optimistic commit almost always, `false` only for local validation failures (`canCompleteSet` false, no draft). Every caller and test that currently asserts `false` on RPC failure must be updated.

---

## Shared Patterns

### `withKeyQueue` serialization
**Source:** `src/services/sessionDraftStorage.ts:16-36`
**Apply to:** `sessionOutboxStorage.ts` (all read/write functions) — copy the function verbatim, do not reimplement.

### Error classification (transport vs. server, allowlist for definitive codes)
**Source:** `src/services/sessionExecutionRepository.ts:78-137` (class + `isTransportSessionExecutionError`)
**Apply to:** `sessionOutboxDrain.ts` and `sessionOutboxPolicy.ts` (`isDefinitiveRejection` allowlist). Never build a denylist or a new string-matching heuristic.

### `AppState` return-to-foreground trigger
**Source:** `src/hooks/useDiaLocal.ts:40-47`
**Apply to:** `useSessionOutboxDrain.ts`. No new native dependency (`netinfo`/`expo-network` explicitly out per D-03).

### `withTimeout`/`RPC_TIMEOUT_MS`
**Source:** `src/store/activeSessionStore.ts:215-265`
**Apply to:** `sessionOutboxDrain.ts` when calling any of the six RPCs — its `finally` guarantees lock release even on abort; do not rewrap with a new `AbortController`.

### Config-object-with-inline-comments convention
**Source:** `src/engine/config.ts:8-38` (`AdaptConfig`/`ADAPT_CONFIG`)
**Apply to:** new `OUTBOX_CONFIG` block in the same file — named type, one field per tunable, inline comment per field, no bare literals in `sessionOutboxPolicy.ts`.

### No-invented-data UI convention ("—" never "0")
**Source:** CONTEXT.md "Established Patterns"; enforce in the pendency badge (D-05) added to `ActiveSessionScreen.tsx`.

## No Analog Found

None — every file in the phase's structure has a close analog already read and excerpted above. The one partial gap is `sessionOutboxPolicy.ts` itself (a genuinely new pure-policy module), but its shape is fully specified by RESEARCH.md's own vetted sketches (Pattern 1/2/3) rather than needing invention, so it is not listed as "no analog."

## Metadata

**Analog search scope:** `src/services/`, `src/hooks/`, `src/store/`, `src/engine/`, `__tests__/`, `.planning/phases/03-.../03-07-PLAN.md`
**Files scanned:** `sessionDraftStorage.ts`, `sessionExecutionRepository.ts`, `useDiaLocal.ts`, `activeSessionStore.ts`, `engine/config.ts`, `completeSetAdaptacaoNaoDerruba.test.ts`
**Pattern extraction date:** 2026-08-12
