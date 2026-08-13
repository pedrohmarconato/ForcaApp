---
phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first
reviewed: 2026-08-12T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - __mocks__/@react-native-async-storage/async-storage.js
  - __tests__/activeSessionScreen.test.tsx
  - __tests__/activeSessionStore.test.ts
  - __tests__/adaptationFlow.test.ts
  - __tests__/cardioSwapFluxo.test.ts
  - __tests__/cardioTempoDistancia.test.ts
  - __tests__/completeSetAdaptacaoNaoDerruba.test.ts
  - __tests__/integration/sessionOutboxDrain.postgrest.test.ts
  - __tests__/recusaDeclaradaFluxo.test.ts
  - __tests__/rootNavigatorInviteTransition.test.tsx
  - __tests__/saveWriteIntegration.test.ts
  - __tests__/sessionOutboxDrain.test.ts
  - __tests__/sessionOutboxPolicy.test.ts
  - __tests__/sessionOutboxStorage.test.ts
  - src/engine/config.ts
  - src/engine/sessionOutboxPolicy.ts
  - src/hooks/useSessionOutboxDrain.ts
  - src/navigation/RootNavigator.js
  - src/screens/ActiveSessionScreen.tsx
  - src/services/sessionOutboxDrain.ts
  - src/services/sessionOutboxStorage.ts
  - src/store/activeSessionStore.ts
  - supabase/migrations/0037_swap_guard_codigo_oficial.sql
findings:
  critical: 3
  warning: 3
  info: 1
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-08-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

The pure policy module (`sessionOutboxPolicy.ts`) is well-tested and correctly implements FIFO-per-session, natural-key dedupe, age-based expiry, and the strict definitive-code allowlist. `sessionExecutionRepository`'s `SessionExecutionRequestError`/`isTransportSessionExecutionError` are reused rather than reimplemented, and migration 0037 correctly documents/fixes the P0005→23505 masking issue.

However, the persistence/orchestration layer (`sessionOutboxDrain.ts` + `sessionOutboxStorage.ts`) has an unguarded **read-modify-write race** on the single per-user outbox document. `drainAll()` reads the whole document once, mutates an in-memory copy across up to 50 rounds of network-bound work, and unconditionally overwrites storage at the end of each round — while nothing prevents a second, concurrent `drainAll()`/`enqueueItem()` call for the same user from doing the same thing at the same time. The codebase itself *guarantees* this overlap on a routine code path: `completeSet` fires one `enqueueAndDrain` for `save_set_log` and, synchronously afterward (before that drain's network round-trip resolves), a second `enqueueAndDrain` for the auto-"keep" `update_set_log_adaptation` decision. This directly violates the phase's own D-07 invariant ("the queue must never silently discard a pending item") and is not covered by any test — every existing test calls `drainAll` sequentially and awaits each call before the next.

A second, independent path to the same class of data loss exists in `enqueueItem`: a transient `loadOutbox` failure is treated as "queue is empty" and then **persisted**, wiping out any real pending items that were on disk. Finally, the P0001 ("session closed") reconciliation path is not reachable for `update_set_log_adaptation` items, because that item's own dispatcher never calls an RPC that could return a P0001 error — it silently degrades to the generic "unresolved setLogId" retry path instead, so `onSessionClosed`/local-draft reconciliation never fires for this item kind.

## Critical Issues

### CR-01: Concurrent `drainAll`/`enqueueItem` calls silently lose pending outbox items (violates D-07)

**File:** `src/services/sessionOutboxDrain.ts:396-442` (`drainAll`), `src/services/sessionOutboxDrain.ts:351-386` (`enqueueItem`), `src/services/sessionOutboxStorage.ts:22-37` (`withKeyQueue`)

**Issue:** `withKeyQueue` (sessionOutboxStorage.ts:22-37) only serializes *individual* `AsyncStorage.getItem`/`setItem` calls — it does not wrap an entire read-modify-write cycle atomically. `drainAll` loads the whole document **once** (`sessionOutboxDrain.ts:401-406`), then loops for up to `MAX_DRAIN_ROUNDS` (50) rounds, each round dispatching real network RPCs (up to `RPC_TIMEOUT_MS` = 15000 ms each) and mutating a purely in-memory `doc` variable, before persisting that stale-relative-to-disk snapshot with `saveOutbox(userId, doc)` at `sessionOutboxDrain.ts:427`. Nothing prevents a second concurrent `drainAll()` (or `enqueueItem()`) call for the same `userId` from reading, mutating, and saving in the same window — the later `saveOutbox` unconditionally overwrites whatever the other caller already wrote, discarding any item the other caller added or resolved that this caller's in-memory snapshot never knew about.

This is not a theoretical race — the codebase guarantees it on a common path. In `completeSet` (`src/store/activeSessionStore.ts:1207`), `enqueueAndDrain` is awaited for the `save_set_log` item, but the drain it triggers is fire-and-forget (`void drainAll(...)` inside `enqueueAndDrain`, `sessionOutboxDrain.ts:455`) and keeps running in the background during the real network round-trip. `completeSet` continues synchronously and, when the intra-session adaptation engine produces an automatic "keep" decision, fires a **second**, independent `enqueueAndDrain` for `update_set_log_adaptation` at `src/store/activeSessionStore.ts:1332` — before the first drain's network call has resolved. Trace:

1. `enqueueAndDrain(save_set_log X)` persists `{items:[X]}`; its background `drainAll` (Drain-X) loads `doc = {items:[X]}` and starts dispatching X over the network (in flight for however long the RPC takes).
2. Still inside the same `completeSet` call, `enqueueAndDrain(update_set_log_adaptation Y)` runs: it loads the *current* storage (`{items:[X]}`, since Drain-X hasn't saved yet), upserts Y, and persists `{items:[X, Y]}`. Its own background drain (Drain-Y) starts.
3. Drain-X's network call for X eventually succeeds. Drain-X computes `doc = removeItem(doc, X)` from its **own stale local snapshot** (`{items:[X]}`, captured *before* Y existed) → `{items: []}`, then calls `saveOutbox(userId, {items: []})`.
4. This unconditionally overwrites storage, silently deleting Y — the adaptation-decision item — even though Drain-X never touched it and Drain-Y may still be mid-flight on it.

The same class of loss applies to any two `enqueueAndDrain`/`drainAll` calls that overlap in time for the same user — e.g. the `useSessionOutboxDrain` hook's mount-time and `AppState`-`'active'` drains (`src/hooks/useSessionOutboxDrain.ts:25,28`) racing against any store action's own drain, or two rapid `completeSet`/`skipExercise`/`finishSession` calls in a row. No lock/single-flight mechanism exists anywhere (`drainInFlight`, promise cache, etc. — none found), and no test exercises overlapping `drainAll`/`enqueueItem` calls; every test in `__tests__/sessionOutboxDrain.test.ts` and `__tests__/completeSetAdaptacaoNaoDerruba.test.ts` awaits each drain sequentially.

**Fix:** Make the read-modify-write atomic per user. Two viable approaches:
- Wrap the *entire* `drainAll` read-mutate-save cycle (and `enqueueItem`'s load-upsert-save cycle) in the existing `withKeyQueue` primitive so only one full transaction runs per user at a time (extend `sessionOutboxStorage.ts` to expose a `withOutboxTransaction(userId, fn)` helper that holds the queue slot for the whole operation), e.g.:
```typescript
// sessionOutboxStorage.ts
export const withOutboxTransaction = async <T>(
  userId: string,
  fn: (doc: OutboxDocument) => Promise<{ doc: OutboxDocument; result: T }>,
): Promise<T> => {
  const key = keyFor(userId);
  return withKeyQueue(key, async () => {
    const doc = parseDocument(await AsyncStorage.getItem(key));
    const { doc: nextDoc, result } = await fn(doc);
    await AsyncStorage.setItem(key, JSON.stringify(nextDoc));
    return result;
  });
};
```
- Or add a per-user single-flight guard in `sessionOutboxDrain.ts` (`const drainInFlight = new Map<string, Promise<...>>()`) so a second `drainAll(userId)` call while one is already running awaits/chains onto the first instead of starting an independent read.

Either fix must also cover `enqueueItem`'s separate `loadOutbox`/`saveOutbox` calls (`sessionOutboxDrain.ts:368,376`), which have the identical gap.

---

### CR-02: `enqueueItem` persists an empty document over a transient read failure, wiping the durable queue

**File:** `src/services/sessionOutboxDrain.ts:366-383`

**Issue:**
```typescript
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
  console.warn('[sessionOutboxDrain] item não persistido localmente (não-fatal, D-12):', e);
}
```
`loadOutbox` only rejects when the underlying `AsyncStorage.getItem` call itself throws (its own `parseDocument` never throws — corrupted/unknown-version JSON already degrades to an empty document *without* rejecting, per `sessionOutboxStorage.ts:40-56`). So this `catch` branch is reached specifically on a genuine, likely-transient storage read error (native module hiccup, disk contention, etc.) — not on corrupted data. Treating that as "the queue is empty" and then **immediately persisting** `updatedDoc` (`= emptyDoc + newItem`) via `saveOutbox` unconditionally overwrites whatever was actually still on disk, permanently destroying any previously-queued, not-yet-confirmed items. This directly violates D-07 ("the queue must never silently discard a pending item") — a transient read hiccup becomes irrecoverable data loss, not a "non-fatal" event as the comment claims. Contrast with `drainAll`'s own load-failure handling (`sessionOutboxDrain.ts:401-406`), which correctly returns early **without** touching storage — `enqueueItem` should do the same.

**Fix:** On load failure, do not persist. Keep the new item pending only in the in-memory return value (as the comment already claims is the contract), and skip the `saveOutbox` call entirely so the next successful load/save cycle recovers the real document:
```typescript
let doc: OutboxDocument;
let loadFailed = false;
try {
  doc = await loadOutbox(userId);
} catch (e) {
  console.warn('[sessionOutboxDrain] falha ao carregar a fila local (não-fatal):', e);
  loadFailed = true;
  doc = { version: 1, items: [], quarantine: [] };
}
const updatedDoc: OutboxDocument = { ...doc, items: upsertItem(doc.items, newItem) };

if (!loadFailed) {
  try {
    await saveOutbox(userId, updatedDoc);
  } catch (e) {
    console.warn('[sessionOutboxDrain] item não persistido localmente (não-fatal, D-12):', e);
  }
} else {
  console.warn('[sessionOutboxDrain] pulando saveOutbox após falha de leitura — evita sobrescrever a fila real no disco');
}
return updatedDoc;
```

---

### CR-03: P0001 (session closed) is never detected for `update_set_log_adaptation` — sub-queue is never discarded, local state never reconciled

**File:** `src/services/sessionOutboxDrain.ts:218-230` (dispatcher), `src/services/sessionOutboxDrain.ts:307-343` (`classifyAndApply`)

**Issue:** For every other item kind, the server RPC itself raises `errcode = 'P0001'` when the session log is already finished, which `SessionExecutionRequestError.code` surfaces and `isSessionClosedCode`/`classifyAndApply` correctly detect (discarding the whole sub-queue and invoking `onSessionClosed`). `update_set_log_adaptation` is different: its dispatcher never calls an RPC that can return P0001 for this condition. It resolves `setLogId` locally via `getOpenSessionLog`, which simply filters `.is('finished_at', null)` and returns `null` when no open log matches (`sessionExecutionRepository.ts:174-197`) — indistinguishable from "the corresponding `save_set_log` hasn't been confirmed yet" (the case the code's own comment explicitly names as the *other* possibility):
```typescript
case 'update_set_log_adaptation': {
  const p = item.payload as UpdateSetLogAdaptationPayload;
  const aberta = await getOpenSessionLog(p.userId, p.plannedSessionId);
  const setLogId = aberta?.setLogs.find((sl) => sl.planned_set_id === p.plannedSetId)?.id;
  if (!setLogId) {
    // Sessão fechada ou o save_set_log correspondente nunca confirmou —
    throw new UnresolvedSetLogIdError();
  }
  ...
}
```
`classifyAndApply` treats `UnresolvedSetLogIdError` as an ordinary retryable condition (`sessionOutboxDrain.ts:332-336`), never as session-closed. Concretely: if the session is finished on another device (or a previous app instance already ran `finish_session` to completion) while this device's outbox still holds only an `update_set_log_adaptation` item for that session (a state the code's own Pitfall-1 comments say is expected — the adaptation write can legitimately lag behind its `save_set_log`), that item will retry with backoff for up to `maxAgeDays` (7 days) and then quarantine with reason `"sem setLogId resolvido"` — **`onSessionClosed`/`reconcileRemoteSessionClosed` is never invoked**, so the local draft is never told the session closed. The phase's own stated invariant ("a P0001 drains must discard the whole session's sub-queue and reconcile local state") is not honored for this item kind.

**Fix:** Distinguish "session closed" from "not yet confirmed" before throwing. `getOpenSessionLog`'s current query can't tell the two apart, so either (a) have the dispatcher do a lightweight existence check for the session log ignoring the `finished_at` filter (e.g. a small RPC/select that returns `finished_at`) and throw a dedicated `SessionClosedForAdaptationError` that `classifyAndApply` maps through the same `isSessionClosedCode`/`discardSessionSubQueue` path, or (b) have the server-side `update_set_log_adaptation` RPC itself be the one attempted (with its existing P0001 guard) instead of resolving `setLogId` purely client-side, so the real error code propagates. Either way, `classifyAndApply` needs a branch that treats "adaptation item's session turns out to be closed" identically to the P0001 branch already at `sessionOutboxDrain.ts:314-317`.

## Warnings

### WR-01: `pendingCount`/`quarantineCount` in the store can be clobbered with a stale value by the caller's own `set()` after a faster background drain already updated it

**File:** `src/store/activeSessionStore.ts:1207-1230` (and identically at 1481-1498, 1534-1549, 1589-1606, 1691-1699)

**Issue:** Every call site does:
```typescript
const { pendingCount, quarantineCount } = await enqueueAndDrain(
  draft.userId, { ... },
  { onSessionClosed: ..., onSummaryChanged: (p, q) => set({ pendingCount: p, quarantineCount: q }) },
);
...
set({ draft: novo, ..., pendingCount, quarantineCount }); // uses the ENQUEUE-TIME snapshot
```
`pendingCount`/`quarantineCount` returned by `enqueueAndDrain` are computed *before* the fire-and-forget `drainAll` runs (by design, per D-05). If that background drain finishes fast enough to call `onSummaryChanged` (which does its own `set({ pendingCount, quarantineCount })`) *before* the outer call site's own later `set({ ..., pendingCount, quarantineCount })` executes, the later call overwrites the fresh, post-drain counts with the stale, pre-drain snapshot — the "N registros a caminho" chip (`ActiveSessionScreen.tsx:401-407`) can show an incorrect, larger-than-actual count until the next drain cycle corrects it. Not a data-loss bug, but a UI-correctness gap in exactly the invariant (D-05's "selo de pendência") this phase introduces. Untested: no test in `activeSessionStore.test.ts` asserts on `pendingCount`/`quarantineCount` at all.

**Fix:** Don't pass the enqueue-time snapshot into the later `set()` calls — let `onSummaryChanged` be the single writer for these two fields, or read `get().pendingCount`/`get().quarantineCount` fresh instead of closing over the destructured values from `enqueueAndDrain`'s return.

### WR-02: `dispatchItem` casts `payload: unknown` without runtime validation

**File:** `src/services/sessionOutboxDrain.ts:197-268`

**Issue:** Every branch does `const p = item.payload as SaveSetLogPayload` (etc.) with no runtime shape check. Since payloads are persisted as JSON to `AsyncStorage` and can be read back by a *future* app version (a user closes the app with pending items, then updates), a payload shape change between versions (renamed/removed field) would silently produce a malformed RPC call rather than a diagnosable error, because the cast bypasses TypeScript's own guarantees at the persistence boundary.

**Fix:** Add a minimal per-kind runtime shape guard (or a schema version stamped on `OutboxItem`) before dispatch, and quarantine items that fail validation with a clear reason rather than sending a malformed payload to the RPC.

### WR-03: `RootNavigator.js` still carries `console.log`/`console.error` debug statements alongside the new hook wiring

**File:** `src/navigation/RootNavigator.js:55,61,65,89,93,97,104,106,121,124,128,134,138,148,152,156`

**Issue:** Not introduced by this phase's diff (only the `useSessionOutboxDrain` import/call at lines 14/46 are new), but the file is in scope for this review and is riddled with `console.log` calls left over from prior debugging (including one literally commented `// Removido console.log duplicado daqui` right next to a still-present `console.log`). Per this project's own TS/JS coding-style rule ("No `console.log` statements in production code"), this is a pre-existing quality issue worth flagging now that the file is being touched again.

**Fix:** Strip the debug `console.log`/`console.error` calls (or route them through a gated logger) in a follow-up cleanup pass; not blocking for this phase's own change.

## Info

### IN-01: `finishSession`'s `enqueueAndDrain` payload `{}` has no static type against `OutboxItemKind`'s discriminated payload shapes

**File:** `src/store/activeSessionStore.ts:1691-1693`

**Issue:** `{ sessionLogId: sid, kind: 'finish_session', payload: {} }` is passed as `params: { sessionLogId: string; kind: OutboxItemKind; payload: unknown }` — `payload` is untyped `unknown` at the call boundary regardless of `kind`, so nothing statically enforces that `finish_session`'s payload stays `{}` if a future change requires fields. Minor; the `dispatchItem` switch already ignores the payload for `finish_session`, so this is purely a maintainability note, not a live bug.

**Fix:** Consider a discriminated-union type for `enqueueAndDrain`'s `params` (`{ kind: 'finish_session'; payload: Record<string, never> } | { kind: 'save_set_log'; payload: SaveSetLogPayload } | ...`) so payload shape is checked per `kind` at the call site rather than only inside `dispatchItem`.

---

_Reviewed: 2026-08-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
