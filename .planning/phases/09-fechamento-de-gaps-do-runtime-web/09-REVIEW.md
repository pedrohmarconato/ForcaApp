---
phase: 09-fechamento-de-gaps-do-runtime-web
reviewed: 2026-08-14T23:59:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - __tests__/activeSessionScreen.test.tsx
  - __tests__/alertHostWeb.test.tsx
  - __tests__/alertNoAlertRemanescente.test.ts
  - __tests__/alertShim.test.ts
  - __tests__/jointLobbyScreen.test.tsx
  - __tests__/questionnaireScreen.test.tsx
  - App.tsx
  - src/components/AlertHost.tsx
  - src/components/session/SessionPlayer.tsx
  - src/screens/ActiveSessionScreen.tsx
  - src/screens/JointLobbyScreen.tsx
  - src/screens/PostQuestionnaireChat.tsx
  - src/screens/QuestionnaireScreen.tsx
  - src/screens/SignUpScreen.tsx
  - src/store/alertStore.ts
  - src/utils/alertShim.ts
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 09: Code Review Report (iteration 3, final)

**Reviewed:** 2026-08-14
**Depth:** standard
**Files Reviewed:** 16
**Status:** clean

## Summary

Re-review of the 2 WARNING-level findings from iteration 2 (`iter2-WR-01`,
`iter2-WR-02`), fixed in `ead5aa1` (visibilitychange predicate) and `aeca918`
(Modal `onRequestClose` button semantics). `tsc --noEmit` is clean; the 6
relevant Jest suites pass (79 tests, up from 76 in iteration 2 — 3 new
regression tests: 1 for WR-01, 2 for WR-02).

- **`iter2-WR-01`** (Wake Lock lifecycle effect and `visibilitychange`
  re-acquire effect used different, inconsistent status predicates —
  `sessaoEmAndamento` vs. raw `status !== 'active' && status !==
  'awaiting_checkin'` — reopening a Wake-Lock-not-held bug for the
  `'loading'` tick of `confirmCheckIn`): **correctly and completely fixed.**
  `ead5aa1` changes the `visibilitychange` effect's guard from the stale
  2-status check to the same `sessaoEmAndamento` boolean already used by the
  lifecycle effect above it (`src/screens/ActiveSessionScreen.tsx:123`), and
  changes its dependency array from `[status]` to `[sessaoEmAndamento]`
  (line 133) — both effects now cleanup/re-run in lockstep on every status
  transition, closing the gap. Traced the fix against the failure sequence
  described in iteration 2's finding (`awaiting_checkin` → `loading` →
  `active`, tab backgrounded mid-`loading`): with `sessaoEmAndamento` as the
  shared predicate, the effect no longer tears down on the `'loading'` tick,
  so the listener stays registered and a `visibilitychange` event fired
  during that window reacquires the lock. New regression test
  (`__tests__/activeSessionScreen.test.tsx:836-854`, "WR-01: visibilitychange
  durante status 'loading'...") sets `status: 'loading'`, dispatches
  `visibilitychange` with `visibilityState: 'visible'`, and asserts
  `activateKeepAwakeAsync` is called — verified by hand that this assertion
  would fail against the pre-fix predicate (loading fails both
  `!== 'active'` and `!== 'awaiting_checkin'`, so the old guard would return
  early without registering a listener). Diff is minimal and scoped
  exclusively to the two lines needed (guard condition + dependency array);
  no unrelated code touched.
- **`iter2-WR-02`** (`Modal`'s `onRequestClose={dismiss}` bypassed button
  semantics — `Escape` key on web could dismiss a single-button alert
  without invoking its `onPress`, the same class of bug `iter1-WR-03`
  fixed for the backdrop `Pressable` only): **correctly and completely
  fixed.** `aeca918` extracts the backdrop's inline handler into a shared
  `handleDismissAttempt` closure (`src/components/AlertHost.tsx:39-44`) and
  wires it to both `Modal`'s `onRequestClose` (line 47) and the backdrop
  `Pressable`'s `onPress` (line 50) — a pure refactor-and-share, no logic
  change to the single-button-blocks / multi-button-invokes-cancel
  semantics itself. Two new regression tests
  (`__tests__/alertHostWeb.test.tsx:139-185`) invoke
  `screen.UNSAFE_getByType(Modal).props.onRequestClose()` directly (the
  correct way to simulate react-native-web's `Escape`→`onRequestClose` wiring
  under Jest, per the tests' own comment) and assert: single-button alert
  stays open with `onPress` not called; multi-button alert with a `cancel`
  button closes and invokes only the cancel button's `onPress`. Both mirror
  the existing backdrop tests exactly, closing the coverage gap iteration 2
  identified.

No new issues were introduced by either fix: `git show` on both commits
confirms each diff is scoped to the minimum lines needed (predicate +
dependency array for WR-01; handler extraction + two call-site rewires for
WR-02), both touched files were re-read in full, and the shared
`sessaoEmAndamento` / `handleDismissAttempt` values are recomputed on every
render from current props/state — no stale-closure risk. `tsc --noEmit` and
the full relevant Jest suite (6 files, 79 tests) both pass clean.

`iter1-WR-05`, `iter1-WR-02`, `iter1-WR-01`, `iter1-WR-03` (backdrop half)
remain correctly fixed and unaffected by this iteration's changes — none of
their files were touched by `ead5aa1`/`aeca918`.

## Info

### IN-01: `alertStore`'s single-slot design silently drops a pending alert if `show()` is called again before the current one is dismissed

**File:** `src/store/alertStore.ts:33` (`show: (alert) => set({ current: alert })`)
**Issue:** Unchanged since iteration 1. This is a documented, deliberate
design choice (comment at the top of the file) and mirrors the OS guarantee
that only one alert is on screen at a time. Unlike native `Alert.alert`,
which queues successive calls, this implementation *replaces* the current
alert outright — any `onPress`/`onSim` callback attached to the alert being
replaced is discarded and never runs. No current call site triggers
back-to-back `showAlert` calls, so this remains latent, not misfiring. Known
and explicitly out of scope for this phase's `fix_scope: critical_warning`.
**Fix:** No action required for this phase; still worth a short code comment
noting the non-FIFO behavior differs from native `Alert.alert`, so a future
author doesn't assume queueing semantics.

---

_Reviewed: 2026-08-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
