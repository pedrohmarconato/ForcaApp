---
phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first
plan: 01
subsystem: mobile-offline-sync
tags: [react-native, zustand, async-storage, outbox-pattern, supabase-rpc, offline-first]

# Dependency graph
requires:
  - phase: 03-interc-mbio-de-modalidade-de-cardio
    provides: sessionExecutionRepository RPCs (saveSetLog, getOpenSessionLog), activeSessionStore completeSet baseline
provides:
  - Offline-first outbox engine (sessionOutboxPolicy.ts) — FIFO-per-session queue, natural-key dedupe, age-based backoff/quarantine
  - Durable per-user AsyncStorage queue (sessionOutboxStorage.ts)
  - Drain orchestrator (sessionOutboxDrain.ts) with 5-way error classification (success/transport/definitive/P0001/unknown) and RPC_TIMEOUT_MS/withTimeout ownership
  - useSessionOutboxDrain hook mounted at RootNavigator (AppState-driven drain trigger)
  - activeSessionStore.completeSet rewritten for optimistic local commit (D-05) via save_set_log queue item
affects: [04-02-PLAN.md, 04-03-PLAN.md]

# Actuals (#2632)
actuals:
  tokens: 26334
  tasks: 2
  commits: 10

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outbox pattern: engine (pure, src/engine/) + storage (I/O, src/services/) + drain orchestrator (src/services/) + AppState hook (src/hooks/) — no new dependency, reuses AsyncStorage/AppState already in the project"
    - "Manual Jest mock at <rootDir>/__mocks__/<package>/ for project-wide auto-mocking of a node_modules package (no per-file jest.mock() needed)"

key-files:
  created:
    - src/engine/sessionOutboxPolicy.ts
    - src/services/sessionOutboxStorage.ts
    - src/services/sessionOutboxDrain.ts
    - src/hooks/useSessionOutboxDrain.ts
    - __mocks__/@react-native-async-storage/async-storage.js
    - __tests__/sessionOutboxPolicy.test.ts
    - __tests__/sessionOutboxStorage.test.ts
    - __tests__/sessionOutboxDrain.test.ts
  modified:
    - src/store/activeSessionStore.ts
    - src/engine/config.ts
    - src/screens/ActiveSessionScreen.tsx
    - src/navigation/RootNavigator.js
    - __tests__/activeSessionStore.test.ts
    - __tests__/completeSetAdaptacaoNaoDerruba.test.ts
    - __tests__/adaptationFlow.test.ts
    - __tests__/saveWriteIntegration.test.ts
    - __tests__/cardioTempoDistancia.test.ts
    - __tests__/rootNavigatorInviteTransition.test.tsx

key-decisions:
  - "OutboxDocument is a single per-user AsyncStorage key (@session_outbox_<userId>), not per-session — matches RESEARCH.md Recommendation A1: the queue must be discoverable by userId alone after finish_session clears the plannedSessionId-keyed draft"
  - "update_set_log_adaptation dispatcher (resolveSetLogId via getOpenSessionLog + updateSetLogAdaptation) is implemented and unit-tested in sessionOutboxDrain.ts this plan, but NOT yet called from activeSessionStore — completeSet's auto-keep/resolveAdaptation branches leave the adaptation decision local-only until 04-02-PLAN.md wires the enqueue call (Pitfall 1: setLogId does not exist at optimistic-commit time)"
  - "jest.mock() manual mocks placed at <rootDir>/__mocks__/@react-native-async-storage/async-storage.js instead of per-file jest.mock() calls, since sessionOutboxStorage.ts's real AsyncStorage import is now pulled in transitively by nearly every test that imports activeSessionStore.ts"

patterns-established:
  - "Pattern: fire-and-forget drain — enqueueAndDrain awaits only the local AsyncStorage write, then dispatches `void drainAll(...)` without awaiting it, so the UI-facing action's promise never depends on network latency (D-05)"
  - "Pattern: FIFO-per-session queue processing — nextDrainable groups by sessionLogId and returns only the head of each sub-queue per round, so one session's backoff cooldown never blocks another session's items (D-04/Pitfall 4)"

requirements-completed: [REQ-07]

coverage:
  - id: D1
    description: "completeSet never blocks on network; a transport/server failure in save_set_log commits the set as 'done' locally on the same tick and never sets saveError"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#ERRO do banco ao salvar: sob D-05 a série conclui local mesmo assim e o item fica pendente na fila (nunca saveError)"
        status: pass
      - kind: unit
        ref: "__tests__/completeSetAdaptacaoNaoDerruba.test.ts#completeSet: falha de rede NUNCA impede o registro local (D-05, pós-fase)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Outbox persists, classifies errors, and drains: success removes item; transport error retries with exponential backoff; server code in the definitive allowlist (P0005/42501/22023/22004/P0002) quarantines with reason/code/expiresAt; unclassified server error stays retentable until age expiry (never quarantines by default)"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/sessionOutboxDrain.test.ts#drainAll — classificação de erro (D-14/Pattern 3)"
        status: pass
      - kind: unit
        ref: "__tests__/sessionOutboxPolicy.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "P0001 (session already finished server-side) discovered during drain discards the ENTIRE pending sub-queue of that sessionLogId (not just the failing item), calls onSessionClosed, and does not quarantine — reconciles local draft state via reconcileRemoteSessionClosed"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/sessionOutboxDrain.test.ts#P0001 descarta TODOS os itens pendentes da sessionLogId (não só o que falhou) e chama onSessionClosed — sem quarentena (Pitfall 3)"
        status: pass
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#log finalizado remotamente (P0001) durante a drenagem encerra a sessão e limpa só o draft capturado"
        status: pass
    human_judgment: false
  - id: D4
    description: "nextDrainable never lets one sessionLogId's backoff cooldown block another sessionLogId's head item from draining (FIFO strictly per-session, not per-queue)"
    verification:
      - kind: unit
        ref: "__tests__/sessionOutboxPolicy.test.ts#Pitfall 4: sessão em cooldown de backoff NÃO bloqueia outra sessão livre"
        status: pass
    human_judgment: false
  - id: D5
    description: "Reconnect-and-drain does not duplicate: one transport failure followed by one successful retry results in exactly 2 saveSetLog calls and an empty queue — client-level rehearsal of the exactly-once guarantee that migration 0005's first-write-wins guard provides server-side (full proof against real Postgres deferred to 04-03-PLAN.md)"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#reconecta e drena sem duplicar: 1 falha de transporte + 1 retry bem-sucedido, nunca mais que isso"
        status: pass
    human_judgment: false
  - id: D6
    description: "Pendency badge (Chip, neutral tone) appears on ActiveSessionScreen only when pendingCount > 0, never shows '0 pendentes' (no invented data convention)"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual placement/copy of the badge is a UI judgment call not covered by an automated screenshot test in this plan; the underlying pendingCount wiring is type-checked and store-level tested, but the on-screen rendering itself needs a human glance."

duration: 29min
completed: 2026-08-12
status: complete
---

# Phase 4 Plan 1: Offline-first outbox for save_set_log + update_set_log_adaptation Summary

**End-to-end offline-first queue (engine + AsyncStorage + drain orchestrator) between `activeSessionStore` and `sessionExecutionRepository`, so a network hiccup during `completeSet` no longer blocks the workout or shows an error — the set completes locally on the same tick and the queue retries/quarantines in the background.**

## Performance

- **Duration:** 29 min
- **Tasks:** 2
- **Files modified:** 18 (8 created, 10 modified)
- **Commits:** 10

## Accomplishments

- `src/engine/sessionOutboxPolicy.ts` (pure, no I/O): natural-key item identity (D-13), FIFO-per-session head selection (D-04/Pitfall 4), exponential backoff with jitter, age-based expiry (D-11), and a strict definitive-rejection allowlist (D-14) that never quarantines an unclassified server error by default (Pitfall 2).
- `src/services/sessionOutboxStorage.ts`: single `@session_outbox_<userId>` AsyncStorage key with `withKeyQueue` serialization copied verbatim from `sessionDraftStorage.ts`; never throws on unknown/corrupted/wrong-version documents.
- `src/services/sessionOutboxDrain.ts`: the orchestrator — owns `RPC_TIMEOUT_MS`/`withTimeout` (moved from `activeSessionStore.ts`), dispatches `save_set_log` and `update_set_log_adaptation` (with late `setLogId` resolution via `getOpenSessionLog`, Pitfall 1), classifies every drain error into one of 5 outcomes, and gives P0001 its own sub-queue-discard path instead of treating it as ordinary quarantine (Pitfall 3).
- `activeSessionStore.completeSet` rewritten: enqueues instead of awaiting the RPC directly, commits the set as `'done'` optimistically with locally computed values, and always returns `true` after local validation passes (the pre-fase network-failure catch branch is gone — Pitfall 5).
- `useSessionOutboxDrain` mounted in `RootNavigator.js` above `ActiveSessionScreen`, so the queue drains on app open and on every return to foreground regardless of which screen is active (D-10).
- Pre-existing test suite updated for the new optimistic contract across 6 files (2 explicitly scoped by the plan, 4 discovered as collateral breakage — see Deviations).

## Task Commits

Each task was committed atomically (TDD RED→GREEN pairs for Task 1's new modules):

1. **Task 1 (sessionOutboxPolicy, RED)** - `ad7dad9` (test)
2. **Task 1 (sessionOutboxPolicy, GREEN)** - `5112775` (feat)
3. **Task 1 (sessionOutboxStorage, RED)** - `ef81fda` (test)
4. **Task 1 (sessionOutboxStorage, GREEN)** - `1e770ff` (feat)
5. **Task 1 (sessionOutboxDrain, RED)** - `ab0f529` (test)
6. **Task 1 (sessionOutboxDrain, GREEN)** - `ec2f1ac` (feat)
7. **Task 1 (store wiring + hook + screen + navigator)** - `3b4d981` (feat)
8. **Task 1 (blocking-issue infra fix, Rule 3)** - `875a294` (test)
9. **Task 2 (rewrite scoped pre-existing suite)** - `48a56d2` (test)
10. **Task 2 (fix collateral suite breakage, Rule 1)** - `3470169` (test)

**Plan metadata:** committed separately by the wave orchestrator after merge (worktree mode — SUMMARY.md and REQUIREMENTS.md only per `<parallel_execution>`).

## Files Created/Modified

- `src/engine/sessionOutboxPolicy.ts` - pure outbox policy (identity, FIFO, backoff, expiry, allowlist)
- `src/engine/config.ts` - `OutboxConfig`/`OUTBOX_CONFIG` (maxAgeDays: 7, backoffBaseMs: 2000, backoffMaxMs: 300000, quarantineRetentionDays: 30)
- `src/services/sessionOutboxStorage.ts` - durable per-user AsyncStorage queue
- `src/services/sessionOutboxDrain.ts` - drain orchestrator, RPC dispatch, error classification
- `src/hooks/useSessionOutboxDrain.ts` - AppState-driven drain trigger (molded on `useDiaLocal.ts`)
- `src/store/activeSessionStore.ts` - `completeSet` rewritten for optimistic commit; `pendingCount`/`quarantineCount` state; `reconcileRemoteSessionClosed`/`setOutboxSummary` actions; `RPC_TIMEOUT_MS`/`withTimeout`/`isClosedSessionError` removed (moved/replaced)
- `src/screens/ActiveSessionScreen.tsx` - neutral-tone pendency `Chip`, hidden at `pendingCount === 0`
- `src/navigation/RootNavigator.js` - mounts `useSessionOutboxDrain(session?.user?.id ?? null)`
- `__mocks__/@react-native-async-storage/async-storage.js` - project-wide manual Jest mock (see Deviations)
- `__tests__/sessionOutboxPolicy.test.ts`, `__tests__/sessionOutboxStorage.test.ts`, `__tests__/sessionOutboxDrain.test.ts` - new unit suites (36 tests)
- `__tests__/activeSessionStore.test.ts`, `__tests__/completeSetAdaptacaoNaoDerruba.test.ts` - rewritten for D-05 (plan-scoped, Task 2)
- `__tests__/adaptationFlow.test.ts`, `__tests__/saveWriteIntegration.test.ts`, `__tests__/cardioTempoDistancia.test.ts`, `__tests__/rootNavigatorInviteTransition.test.tsx` - fixed collateral breakage (not plan-scoped, see Deviations)

## Decisions Made

- Single AsyncStorage document per user (not per session) for the outbox — RESEARCH.md's Recommendation A1, adopted as-is: avoids the two open questions the research flagged (storage-key granularity, `update_set_log_adaptation` identity) by construction, since there is only one key to discover regardless of which `plannedSessionId`/`sessionLogId` is active.
- `update_set_log_adaptation`'s dispatcher (late `setLogId` resolution via `getOpenSessionLog`, Pitfall 1 option 1 from RESEARCH.md) is built and unit-tested this plan but deliberately NOT wired into `completeSet`'s auto-keep branch or `resolveAdaptation` — both already guard on `pending.setLogId`/`saved.setLogId` being truthy, which is now always `null` at optimistic-commit time. 04-02-PLAN.md adds the enqueue call. This is explicit plan scope (see 04-01-PLAN.md `<action>`: "a chamada `updateSetLogAdaptation(...)` deve ser REMOVIDA nesta task — plano 04-02 a reintroduz via fila"), not a gap discovered mid-execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Project has no AsyncStorage Jest automock; the plan's read_first assumption was wrong**

- **Found during:** Task 2, first run of `activeSessionStore.test.ts`/`completeSetAdaptacaoNaoDerruba.test.ts` against the rewritten store
- **Issue:** 04-01-PLAN.md's Task 2 `<read_first>` states tests should "deixar rodar contra o AsyncStorage automocado do preset jest-expo" — but `jest-expo`'s preset only wraps `react-native/jest-preset` (core RN native modules); `@react-native-async-storage/async-storage` is a separate community package with its own native module and no automatic mock. `sessionOutboxStorage.ts` (new this plan) imports it for real, and since `activeSessionStore.ts` now pulls that in transitively via `sessionOutboxDrain.ts`, every test file that imports the store without an explicit AsyncStorage mock broke with `[@RNC/AsyncStorage]: NativeModule: AsyncStorage is null` — 14 test suites in total, not just the 2 the plan scoped.
- **Fix:** Added `__mocks__/@react-native-async-storage/async-storage.js` at the project root, re-exporting the package's own official in-memory Jest mock (`@react-native-async-storage/async-storage/jest/async-storage-mock`). This is Jest's documented convention for automatic per-package node_modules mocks — no per-file `jest.mock()` needed. Also added explicit `jest.mock()` calls (functionally redundant with the global mock, kept for local documentation) in the two plan-scoped test files.
- **Files modified:** `__mocks__/@react-native-async-storage/async-storage.js` (new), `__tests__/activeSessionStore.test.ts`, `__tests__/completeSetAdaptacaoNaoDerruba.test.ts`
- **Verification:** `npx jest` — 14 → 0 broken suites from this cause.
- **Committed in:** `875a294`

**2. [Rule 1 - Bug] `completeSet`'s fire-and-forget drain races an explicit test-level `drainAll` call, double-dispatching the same item**

- **Found during:** Task 2, writing the F2 concurrency test and the "reconecta e drena" test
- **Issue:** `enqueueAndDrain` fires `void drainAll(...)` without awaiting it (D-05, intentional). A test that calls `await store().completeSet(...)` and then separately `await drainAll(userId)` right after can race the internal fire-and-forget drain — both read the queue before either writes back, both dispatch the same head item, and `saveSetLog` gets called twice for one item. This is harmless in production (the server's first-write-wins guard absorbs it, D-02) but breaks `toHaveBeenCalledTimes(N)`-style assertions.
- **Fix:** For assertions sensitive to exact call count, tests now flush the single expected fire-and-forget drain deterministically (`await new Promise((resolve) => setTimeout(resolve, 0))`) instead of invoking `drainAll` a second time. For tests that need to observe a *specific* classification outcome (P0001, transport retry, item presence) where an incidental duplicate dispatch doesn't change the assertion's truth value, the explicit `drainAll` call was kept.
- **Files modified:** `__tests__/activeSessionStore.test.ts`, `__tests__/completeSetAdaptacaoNaoDerruba.test.ts`
- **Verification:** All affected tests pass deterministically across repeated runs.
- **Committed in:** `48a56d2`

**3. [Rule 1 - Bug] Four additional pre-existing suites broke from the same D-05 contract change, outside the plan's `files_modified`**

- **Found during:** Running the phase's own `<verification>` gate (`npx jest -q sem falha nova`) after Task 2's scoped fixes
- **Issue:** `adaptationFlow.test.ts` asserted `pendingAdaptation.setLogId === 'sl-1'` and that `updateSetLogAdaptation` was called directly from `completeSet`'s auto-keep branch and from `resolveAdaptation` — both now `null`/skipped at optimistic-commit time (D-05/Pitfall 1, see Decisions above). `saveWriteIntegration.test.ts` and `cardioTempoDistancia.test.ts` read `saveSetLog`'s captured call args synchronously right after `completeSet`, before the background drain had run. `rootNavigatorInviteTransition.test.tsx` broke because `RootNavigator.js` now mounts `useSessionOutboxDrain`, which pulls in the real Supabase client transitively (throws without `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`).
- **Fix:** Updated `setLogId`/`completedAt` assertions to `null` with explanatory comments pointing at 04-02-PLAN.md; changed `updateSetLogAdaptation` assertions to `not.toHaveBeenCalled()`; added `await drainAll(userId)` before assertions on `saveSetLog`'s captured payload; mocked `useSessionOutboxDrain` as a no-op in the navigator test (same pattern already used there for `AuthContext`/navigators).
- **Files modified:** `__tests__/adaptationFlow.test.ts`, `__tests__/saveWriteIntegration.test.ts`, `__tests__/cardioTempoDistancia.test.ts`, `__tests__/rootNavigatorInviteTransition.test.tsx`
- **Verification:** `npx jest` — 145/145 suites, 1660/1660 tests green.
- **Committed in:** `3470169`

---

**Total deviations:** 3 auto-fixed (1 blocking infra fix, 2 bug fixes in the affected pre-existing suite — one plan-scoped, one collateral)
**Impact on plan:** All three were necessary to satisfy the plan's own `<verification>` gate (`npx jest -q` with no new failures, `npx tsc --noEmit` clean). No scope creep into 04-02/04-03 territory — `finishSession`/`skipExercise`/`unskipExercise`/`swapExercise` remain untouched, synchronous RPC calls, exactly as D-01/Task 1's `<behavior>` specifies.

## Issues Encountered

- `finishSession()`'s existing test `'erro ao fechar não engole: mantém erro e não conclui'` still asserts `ok === false` on RPC failure — this is CORRECT and unchanged: `finish_session` is not part of this task's scope (it enters the queue in 04-02-PLAN.md per D-01's operation list), so it still awaits the RPC directly and still reports network failure as `saveError`. Confirmed via the plan's own regression grep (`grep -n "toBe(false)" __tests__/activeSessionStore.test.ts`) — the one remaining non-local-validation occurrence corresponds to this untouched operation, not a D-05 regression.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-02-PLAN.md can reuse the classification/quarantine/backoff machinery built here (`sessionOutboxPolicy.ts`/`sessionOutboxDrain.ts`) unchanged — it adds dispatchers for `skip_session_exercise`, `unskip_session_exercise`, `swap_session_exercise`, `finish_session` to the existing `switch` in `dispatchItem`, and wires `update_set_log_adaptation`'s enqueue call (dispatcher already built and tested this plan) into `completeSet`'s auto-keep branch and `resolveAdaptation`.
- 04-03-PLAN.md's Postgres-real proof (D-16 level 2) has real RPCs to exercise against — the client-side contract (natural-key identity, FIFO-per-session, first-write-wins reliance) is locked and tested at level 1.
- No blockers. `npx jest` (145/145 suites) and `npx tsc --noEmit` both clean at HEAD of this plan's commits.

---
*Phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first*
*Completed: 2026-08-12*
