---
phase: 09-fechamento-de-gaps-do-runtime-web
fixed_at: 2026-08-15T00:16:21Z
review_path: .planning/phases/09-fechamento-de-gaps-do-runtime-web/09-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-08-15T00:16:21Z
**Source review:** .planning/phases/09-fechamento-de-gaps-do-runtime-web/09-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 2 (WR-01, WR-02 — `fix_scope: critical_warning`, IN-01 excluded)
- Fixed: 2
- Skipped: 0

**Verification environment:** all edits, `tsc --noEmit`, and Jest runs happened
in an isolated git worktree (`workflow.use_worktrees` was unset, default
`true`), not the main checkout. `node_modules` was symlinked in from the main
checkout (read-only use — no writes/deletes performed against it). The
worktree's commits were fast-forwarded onto `main` and the worktree removed as
part of this run's cleanup tail, so these results are reproducible by checking
out `main` at the commits listed below.

## Fixed Issues

### WR-01: Wake Lock lifecycle effect and `visibilitychange` re-acquire effect now use different, inconsistent status predicates

**Files modified:** `src/screens/ActiveSessionScreen.tsx`, `__tests__/activeSessionScreen.test.tsx`
**Commit:** `ead5aa1`
**Applied fix:** Changed the `visibilitychange` re-acquire effect's guard
condition and dependency array from the raw two-status check
(`status !== 'active' && status !== 'awaiting_checkin'`) to the same
`sessaoEmAndamento` boolean already used by the Wake Lock lifecycle effect
directly above it. This keeps both effects in lockstep across all
"in-session" statuses, including the `'loading'` tick that `confirmCheckIn`
passes through, closing the gap where the `visibilitychange` listener was
torn down (and not reinstated in time) during that window.

Added a regression test (`WR-01: visibilitychange durante status "loading"
...`) that sets `status: 'loading'`, dispatches a `visibilitychange` event
with `visibilityState: 'visible'`, and asserts `activateKeepAwakeAsync` is
still called. Verified RED (failed against pre-fix code, 0 calls) before
applying the fix, then GREEN after.

**Verification:**
- `npx tsc --noEmit`: no errors in `src/screens/ActiveSessionScreen.tsx` or `__tests__/activeSessionScreen.test.tsx`.
- `npx jest __tests__/activeSessionScreen.test.tsx`: 20/20 passed (7/7 in the "Wake Lock lifecycle (SESS-01)" describe block, including the new regression test).

### WR-02: `iter1-WR-03`'s backdrop-dismiss fix does not cover `Modal`'s `onRequestClose` (Escape key on web)

**Files modified:** `src/components/AlertHost.tsx`, `__tests__/alertHostWeb.test.tsx`
**Commit:** `aeca918`
**Applied fix:** Extracted the backdrop `Pressable`'s inline `onPress` handler
into a shared `handleDismissAttempt` function (blocks dismiss entirely for
single-button alerts; for multi-button alerts, dismisses and invokes the
`style === 'cancel'` button's `onPress` if present) and wired both the
backdrop `Pressable`'s `onPress` and the `Modal`'s `onRequestClose` to it,
replacing the raw `dismiss` reference on `onRequestClose`.

Added two regression tests using `screen.UNSAFE_getByType(Modal)` to invoke
the rendered `Modal`'s `onRequestClose` prop directly (react-native-web's
`Escape`-keyup wiring only exists in the real web renderer, not the RN preset
Jest runs under, so the prop is invoked directly rather than simulated via a
DOM `keyup` event, per the review's stated fallback option):
- Single-button alert: `onRequestClose()` must not call `onPress` and must leave `current` non-null.
- Multi-button alert with a `style: 'cancel'` button: `onRequestClose()` must call the cancel button's `onPress` once and clear `current`.

Both verified RED (failed against pre-fix code — the single-button case did
close, the multi-button case did not call the cancel button) before applying
the fix, then GREEN after.

**Verification:**
- `npx tsc --noEmit`: no errors in `src/components/AlertHost.tsx` or `__tests__/alertHostWeb.test.tsx`.
- `npx jest __tests__/alertHostWeb.test.tsx`: 9/9 passed (7 pre-existing + 2 new).
- `npx jest __tests__/activeSessionScreen.test.tsx __tests__/alertHostWeb.test.tsx __tests__/alertNoAlertRemanescente.test.ts __tests__/alertShim.test.ts __tests__/jointLobbyScreen.test.tsx __tests__/questionnaireScreen.test.tsx` (all 6 REVIEW.md-listed test suites): 79/79 passed, no regressions.

## Skipped Issues

None — both in-scope findings were fixed. (IN-01 was out of scope for `fix_scope: critical_warning` and left untouched, matching REVIEW.md's own note that it requires no action for this phase.)

---

_Fixed: 2026-08-15T00:16:21Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
