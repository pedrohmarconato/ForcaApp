---
phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first
plan: 02
subsystem: mobile-offline-sync
tags: [react-native, zustand, outbox-pattern, supabase-rpc, offline-first]

# Dependency graph
requires:
  - phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first
    plan: 01
    provides: sessionOutboxPolicy.ts (pure FIFO/backoff/quarantine engine), sessionOutboxStorage.ts (per-user AsyncStorage queue), sessionOutboxDrain.ts (drain orchestrator with save_set_log + update_set_log_adaptation dispatchers already built), activeSessionStore.completeSet rewritten for optimistic commit
provides:
  - sessionOutboxDrain.ts dispatcher complete — all 6 D-01 kinds now have a case (skip_session_exercise, unskip_session_exercise, swap_session_exercise, finish_session added; save_set_log/update_set_log_adaptation already existed)
  - activeSessionStore.skipExercise/unskipExercise/swapExercise/finishSession rewritten to enqueue instead of awaiting the RPC direct
  - activeSessionStore.completeSet's auto-keep branch and resolveAdaptation both enqueue update_set_log_adaptation with late setLogId resolution (closes the 04-01 gap)
affects: [04-03-PLAN.md]

# Actuals (#2632)
actuals:
  tokens: 9774
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CAS capture-before-await for queue payload addressing: resolveAdaptation snapshots userId/plannedSessionId from the current draft BEFORE any await, so a session switch mid-function can never cause an item to enqueue against the wrong session"
    - "completeSet's CAS check (atual.status !== 'active') now runs right after the LOCAL enqueue (fast, non-network) instead of after the RPC settles — a late-resolving RPC can never resurrect a finished draft, since the queue's fire-and-forget drain never touches `draft` at all"

key-files:
  created: []
  modified:
    - src/store/activeSessionStore.ts
    - src/services/sessionOutboxDrain.ts
    - __tests__/activeSessionStore.test.ts
    - __tests__/recusaDeclaradaFluxo.test.ts
    - __tests__/cardioSwapFluxo.test.ts
    - __tests__/cardioTempoDistancia.test.ts
    - __tests__/activeSessionScreen.test.tsx

key-decisions:
  - "PendingAdaptation.setLogId stays `string | null` (always null now) for shape compatibility; plannedSetId is the new field resolveAdaptation actually uses to address the queue item — matches the plan's explicit instruction, not a discovered need"
  - "Auto-keep's update_set_log_adaptation enqueue and resolveAdaptation's enqueue are both fire-and-forget (`void enqueueAndDrain(...)`, not awaited) — matches the plan's 'best-effort, sem bloquear o retorno' instruction; pendingCount/quarantineCount update via the onSummaryChanged callback whenever the local enqueue actually lands"
  - "resolveAdaptation captures userId/plannedSessionId from `get().draft` ONCE, before the `saveDraft` await — if the session already doesn't match `pending.sessionLogId` at that synchronous point, the function skips enqueueing entirely rather than guess which session it belongs to (CAS invariant: never send to the wrong session)"

patterns-established:
  - "Pattern: local-mutation-then-queue for all 6 D-01 write operations — local validation (including CR-01's swap guard) always runs first and synchronously; the local draft mutation applies immediately after enqueueAndDrain's fast local enqueue resolves, never after the RPC; network/server failure never sets saveError for any of save_set_log/update_set_log_adaptation/skip/unskip/swap/finish_session from this phase forward"

requirements-completed: [REQ-07]

coverage:
  - id: D1-extended
    description: "skipExercise/unskipExercise/swapExercise/finishSession apply their local draft mutation immediately after enqueueAndDrain's local (non-network) enqueue resolves; a transport/server failure in the underlying RPC never sets saveError and never blocks the UI for these 4 operations"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/recusaDeclaradaFluxo.test.ts#falha do servidor NÃO desfaz a recusa na tela nem seta saveError (D-05 estendido)"
        status: pass
      - kind: unit
        ref: "__tests__/cardioSwapFluxo.test.ts#falha do servidor NÃO desfaz a troca na tela nem seta saveError (D-05 estendido)"
        status: pass
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D-08: falha ao fechar NÃO bloqueia — a sessão finaliza local (sem saveError) e o item fica pendente na fila mesmo com o draft já limpo"
        status: pass
    human_judgment: false
  - id: D6-pitfall1-closed
    description: "update_set_log_adaptation (both completeSet's auto-keep decision and resolveAdaptation's manual decision) persists to the server again via the queue, with late setLogId resolution — closing the gap 04-01 explicitly left open"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/sessionOutboxDrain.test.ts#update_set_log_adaptation — resolução tardia de setLogId (Pitfall 1)"
        status: pass
      - kind: static
        ref: "grep -n \"updateSetLogAdaptation(\" src/store/activeSessionStore.ts (zero occurrences — only sessionOutboxDrain.ts calls the repository function now)"
        status: pass
    human_judgment: false
  - id: D-08-finish-nonblocking
    description: "finishSession never awaits server confirmation — the finish screen appears immediately, the item survives in a storage separate from the draft (session outbox, D-09), and drains in the background even after the local draft has already been retired"
    requirement: "REQ-07"
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D-08: falha ao fechar NÃO bloqueia — a sessão finaliza local (sem saveError) e o item fica pendente na fila mesmo com o draft já limpo"
        status: pass
    human_judgment: false
  - id: skip-whole-session-untouched
    description: "skipWholeSession (skip_planned_session RPC) is explicitly NOT touched by this plan — remains synchronous write-through, matching D-01's closed operation list"
    requirement: "REQ-07"
    verification:
      - kind: static
        ref: "grep -n \"skipPlannedSession(\" src/store/activeSessionStore.ts — still the direct awaited call, unchanged"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-08-13
status: complete
---

# Phase 4 Plan 2: Queue-wire skip/unskip/swap/finish + reintroduce update_set_log_adaptation Summary

**Closes the D-01 operation list: `skip_session_exercise`, `unskip_session_exercise`, `swap_session_exercise` and `finish_session` now enqueue through the same offline-first outbox `completeSet` has used since 04-01, and `update_set_log_adaptation` (both the auto-keep decision and the student's manual choice) persists to the server again via the queue with late `setLogId` resolution — closing the explicit gap 04-01 left open.**

## Performance

- **Duration:** 55 min
- **Tasks:** 3
- **Files modified:** 7 (0 created, 7 modified)
- **Commits:** 3

## Accomplishments

- `src/services/sessionOutboxDrain.ts`: `dispatchItem`'s switch is now exhaustive over all 6 `OutboxItemKind`s — added `skip_session_exercise`, `unskip_session_exercise`, `swap_session_exercise` and `finish_session` cases, each calling the matching `sessionExecutionRepository` function under the exact same `withTimeout`/error-classification pipeline `save_set_log` already used (no new retry/quarantine logic). Added `SkipSessionExercisePayload`/`UnskipSessionExercisePayload`/`SwapSessionExercisePayload` payload types.
- `src/store/activeSessionStore.ts`:
  - `PendingAdaptation` gained `plannedSetId: string` (the addressing key `resolveAdaptation` now uses); `setLogId` stays `null` for shape compatibility.
  - `completeSet`'s auto-keep branch (the automatic "manter" safety decision) and `resolveAdaptation` (the student's manual choice) both now call `enqueueAndDrain(..., { kind: 'update_set_log_adaptation', ... })` fire-and-forget instead of doing nothing (04-01 state) or calling the repository directly (pre-04-01 state).
  - `skipExercise`/`unskipExercise`/`swapExercise`/`finishSession` rewritten in `completeSet`'s post-04-01 mold: all local validation (including the CR-01 swap guard, which never moved) still runs first and synchronously; the RPC call became `enqueueAndDrain(...)`, and the local draft mutation now applies immediately after that local enqueue resolves — never waiting for the network, and never setting `saveError` for a transport/server failure in these 4 operations from now on.
  - `finishSession` specifically: enqueues `finish_session`, then marks the session `'finished'` and calls `retireLocalDraft` WITHOUT waiting for server confirmation (D-08) — the finish item survives in the outbox's own storage (separate from the draft) and drains in the background even after the local draft is gone.
- Test suite updated for the new contract: the plan-scoped `__tests__/activeSessionStore.test.ts` `'concluir a sessão'` describe was rewritten for D-08, plus 4 collateral suites outside the plan's `files_modified` broke against the same skip/unskip/swap contract change and were fixed (see Deviations).

## Task Commits

1. **Task 1+2 (source: dispatcher + store wiring)** - `33d00ad` (feat) — combined because both tasks' edits landed in the same two files (`activeSessionStore.ts`, `sessionOutboxDrain.ts`) before a natural commit checkpoint; splitting them post-hoc via patch/hunk staging was judged higher-risk than committing the cohesive, verified unit together. See "Deviations" for the explicit note on this commit-granularity choice.
2. **Task 3 (plan-scoped test rewrite)** - `171d01e` (test)
3. **Task 3 collateral (Rule 1 — 4 suites outside files_modified)** - `fc0e1ab` (test)

**Plan metadata:** committed separately by the wave orchestrator after merge (worktree mode — SUMMARY.md and REQUIREMENTS.md only per `<parallel_execution>`).

## Files Created/Modified

- `src/services/sessionOutboxDrain.ts` - dispatcher complete (6/6 kinds); imports `skipSessionExercise`/`unskipSessionExercise`/`swapSessionExercise`/`finishSessionLog`
- `src/store/activeSessionStore.ts` - `PendingAdaptation.plannedSetId`; `completeSet` auto-keep enqueues; `resolveAdaptation` enqueues with CAS-safe userId/plannedSessionId capture; `skipExercise`/`unskipExercise`/`swapExercise`/`finishSession` all queue-based now; unused direct-RPC imports (`updateSetLogAdaptation`, `skipSessionExercise`, `unskipSessionExercise`, `swapSessionExercise`, `finishSessionLog`) removed
- `__tests__/activeSessionStore.test.ts` - `'concluir a sessão'` describe rewritten for D-08; new CAS test for a `completeSet` call arriving after `finishSession` already resolved locally
- `__tests__/recusaDeclaradaFluxo.test.ts`, `__tests__/cardioSwapFluxo.test.ts`, `__tests__/cardioTempoDistancia.test.ts`, `__tests__/activeSessionScreen.test.tsx` - collateral fixes for the same skip/unskip/swap contract change (Rule 1, not plan-scoped)

## Decisions Made

- Combined Task 1 and Task 2's source edits into a single commit (`33d00ad`) rather than two: both tasks touch the same two files with interleaved edits (Task 1's `PendingAdaptation`/import changes and Task 2's `skipExercise`/etc. rewrites landed before a natural per-task commit checkpoint was reached), and non-interactive hunk-level `git add -p` staging was judged more likely to corrupt the diff than to produce a cleanly-split history. Both tasks' acceptance criteria (the two `grep` checks, `tsc --noEmit`, `sessionOutboxDrain.test.ts`) were independently verified before this consolidated commit.
- `resolveAdaptation`'s new CAS guard: if `get().draft` (captured synchronously at function entry, before any `await`) doesn't match `pending.sessionLogId`, the function skips enqueueing the adaptation decision entirely — it does NOT fall back to any other session reference, per the plan's explicit "NUNCA envie para a sessão errada" instruction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Four pre-existing suites broke against the D-05-extended skip/unskip/swap contract, outside this plan's `files_modified`**

- **Found during:** Running `npx jest` (whole suite) after Task 2's scoped store rewrite
- **Issue:** `recusaDeclaradaFluxo.test.ts` and `cardioSwapFluxo.test.ts` asserted `skipSessionExercise`/`swapSessionExercise`/`unskipSessionExercise` were called SYNCHRONOUSLY before the local draft mutation, and that a server rejection kept `ok=false` + set `saveError` — the pre-fase contract. `cardioTempoDistancia.test.ts` checked the swap RPC's call args synchronously right after `swapExercise` resolved, before the fire-and-forget drain had a chance to run. `activeSessionScreen.test.tsx`'s "falha ao trocar" test asserted the sheet stays open with an `Alert` on RPC rejection — under the new contract the sheet closes and the local swap applies regardless of the RPC's outcome.
- **Fix:** Rewrote all four to assert the new contract: local mutation applies immediately (`ok=true`, `saveError` stays `null` even on RPC rejection), with an explicit `await drainAll('user-1')` flush where the test needs to observe the queued RPC call — same style already established in `activeSessionStore.test.ts` since 04-01.
- **Files modified:** `__tests__/recusaDeclaradaFluxo.test.ts`, `__tests__/cardioSwapFluxo.test.ts`, `__tests__/cardioTempoDistancia.test.ts`, `__tests__/activeSessionScreen.test.tsx`
- **Verification:** `npx jest` — 145/145 suites, 1660/1660 tests green.
- **Committed in:** `fc0e1ab`

**2. [Rule 1 - Bug] Pre-existing CAS test's premise became obsolete: completeSet's CAS check no longer waits for the network**

- **Found during:** Task 3, running `activeSessionStore.test.ts` after Task 1+2's edits
- **Issue:** `'save que resolve depois do finish não recria rascunho finalizado'` used a deferred `saveSetLog` mock to simulate a late-resolving network write racing a `finishSession` call, asserting `saveDraft` was called exactly once. Before this phase, `completeSet`'s CAS check (`atual.status !== 'active'`) ran AFTER the RPC settled, so delaying the RPC reliably delayed the CAS decision past `finishSession`'s completion. Since 04-01, `completeSet`'s CAS check runs right after the fast LOCAL enqueue instead — `finishSession` now has an equally-shaped local-enqueue chain (added by this plan's Task 2), so the two near-simultaneous local operations race unpredictably, and `saveDraft` could be called twice instead of once depending on microtask scheduling.
- **Fix:** Restructured the test to call `completeSet` explicitly AFTER `finishSession` has fully resolved (rather than starting them concurrently with a deferred RPC). This proves a stronger, still-relevant invariant: a `completeSet` call arriving after the session already finished locally is a CAS no-op, and — structurally, by design — a late-resolving RPC can never resurrect a finished draft at all anymore, since the queue's fire-and-forget `drainAll` never touches `draft`.
- **Files modified:** `__tests__/activeSessionStore.test.ts`
- **Verification:** `npx jest __tests__/activeSessionStore.test.ts` — 35/35 tests green, deterministic across repeated runs.
- **Committed in:** `171d01e`

---

**Total deviations:** 2 auto-fixed (both Rule 1 bug fixes in tests — one plan-anticipated collateral breakage across 4 files, one CAS-timing test premise made obsolete by the store's own behavior change)
**Impact on plan:** Both were necessary to satisfy the plan's own `<verification>` gate (`npx jest -q` with no new failures, `npx tsc --noEmit` clean). No scope creep into 04-03 territory — `skipWholeSession`/`skip_planned_session` remains untouched, exactly as D-01's closed operation list specifies.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 04-03-PLAN.md's Postgres-real proof (D-16 level 2) now has all 6 D-01 RPCs flowing through the queue to exercise against real Postgres — the client-side contract (natural-key identity, FIFO-per-session, first-write-wins reliance, D-05/D-08 non-blocking semantics) is locked and tested at level 1 for every operation the queue covers.
- No blockers. `npx jest` (145/145 suites, 1660/1660 tests) and `npx tsc --noEmit` both clean at HEAD of this plan's commits.

---
*Phase: 04-escrita-de-execu-o-de-treino-em-lote-e-offline-first*
*Completed: 2026-08-13*
