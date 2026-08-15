---
phase: 09-fechamento-de-gaps-do-runtime-web
fixed_at: 2026-08-14T23:59:00Z
review_path: .planning/phases/09-fechamento-de-gaps-do-runtime-web/09-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-08-14
**Source review:** .planning/phases/09-fechamento-de-gaps-do-runtime-web/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical + warning): 5
- Fixed: 5
- Skipped: 0

All work happened in an isolated git worktree (`workflow.use_worktrees` not
set to `false`, so the default isolation path ran) on a temp branch
(`gsd-reviewfix/09-*`), then fast-forwarded onto `main`. Verification (jest,
`tsc --noEmit`) ran inside that worktree, using a symlinked `node_modules`
pointing at the main checkout's real `node_modules` (never copied, never
`rm -rf`'d — `git worktree remove` only unlinks the symlink).

Every fix followed test-before-fix: a regression test reproducing the exact
failure mode was written and confirmed RED against the pre-fix code, then the
source fix was applied and confirmed GREEN, before committing.

## Fixed Issues

### WR-01: `AlertHost` silently renders zero buttons if a caller passes an empty `buttons` array

**Files modified:** `src/components/AlertHost.tsx`, `__tests__/alertHostWeb.test.tsx`
**Commit:** `fb6808f`
**Applied fix:** Replaced the nullish-coalescing fallback (`current.buttons ?? DEFAULT_BUTTONS`, which does not catch an explicit `[]`) with a length check (`current.buttons && current.buttons.length > 0 ? current.buttons : DEFAULT_BUTTONS`). Added a regression test that calls `showAlert('Aviso', 'Mensagem informativa', [])` and asserts the default "OK" button renders. Confirmed RED (no button rendered) before the fix, GREEN after.

### WR-02: Regression guard against raw `Alert.alert` only scans 3 of 13 `src/` subdirectories

**Files modified:** `__tests__/alertNoAlertRemanescente.test.ts`
**Commit:** `56bc3e4`
**Applied fix:** Took the review's "more robust" option — replaced the hardcoded `DIRS` list (`screens`, `components`, `store`) with a single `ROOT_DIR = src/` scanned recursively, so any current or future top-level `src/` directory (`hooks`, `services`, `engine`, `navigation`, `contexts`, etc.) is covered automatically without another manual edit. Added a new test asserting the scan reaches `hooks`/`services`/`engine`/`navigation`/`contexts`; verified it fails against the old hardcoded-3-dir logic (reconstructed and run standalone) and passes against the fix. Confirmed no `Alert.` usages currently exist in the newly-covered directories, so extending coverage introduces no new failures.

### WR-03: Backdrop-dismiss on the web alert bypasses button `onPress` side effects that native `Alert.alert` guarantees

**Files modified:** `src/components/AlertHost.tsx`, `__tests__/alertHostWeb.test.tsx`
**Commit:** `035f88a`
**Applied fix:** Combined both fix options the review offered, since neither alone covers both real call sites: (b) for single-button alerts (e.g. SignUpScreen's "Cadastro realizado!"), backdrop press is now a no-op — mirrors iOS's blocking single-button `Alert.alert`, forcing the real button tap (and its `onPress`) to close it; (a) for multi-button alerts (e.g. ActiveSessionScreen's "Concluir treino?"), backdrop press now dismisses AND invokes the `style === 'cancel'` button's `onPress` (falling back to a no-op dismiss if no cancel button exists) — mirrors Android's back-dismiss semantics. Added 3 regression tests (single-button blocks backdrop; multi-button routes through the cancel button; multi-button with no cancel button stays a neutral dismiss). All confirmed RED pre-fix, GREEN post-fix.

### WR-04: Wake Lock is released and re-acquired during the `awaiting_checkin` → `active` transition because of the intermediate `'loading'` status

**Files modified:** `src/screens/ActiveSessionScreen.tsx`, `__tests__/activeSessionScreen.test.tsx`
**Commit:** `b9f5451`
**Applied fix:** Broadening the raw `status` condition alone (as the review's first suggestion proposed) was not sufficient — React re-runs a `useEffect`'s cleanup+setup pair on every dependency change regardless of whether the old and new values satisfy the same branch, so keying the effect on `status` directly still churned `deactivateKeepAwake`/`activateKeepAwakeAsync` on every `awaiting_checkin → loading → active` sub-transition. Verified this with a first regression test that stayed RED even after the naive fix. Fixed properly by deriving a `sessaoEmAndamento` boolean (`status !== 'idle' && status !== 'finished' && status !== 'error'`) outside the effect and using *that* as the effect's dependency — so the lock is acquired once on entering a session and released once on leaving, with no churn across internal status ticks. Also updated one pre-existing test that had (unintentionally) been asserting the old churny behavior, and added two new regression tests covering the `loading` handoff and a direct `awaiting_checkin → active` transition.

### WR-05: Weight validation regex accepts comma-decimals but the positivity check (`parseFloat`) truncates at the comma, rejecting valid sub-1kg values

**Files modified:** `src/screens/QuestionnaireScreen.tsx`, `__tests__/questionnaireScreen.test.tsx`
**Commit:** `a6a55e4`
**Applied fix:** Applied exactly as suggested — replaced `parseFloat(peso) > 0` with `(numericTextToNumber(peso) ?? 0) > 0`, reusing the same comma-aware parser already used at submit time (line ~444), removing the divergence between the two code paths. Added a regression test entering `"0,5"` as weight and asserting "Continuar" is enabled; confirmed RED (button stayed disabled) before the fix, GREEN after.

## Verification

- `npx jest __tests__/activeSessionScreen.test.tsx __tests__/alertHostWeb.test.tsx __tests__/alertNoAlertRemanescente.test.ts __tests__/alertShim.test.ts __tests__/jointLobbyScreen.test.tsx __tests__/questionnaireScreen.test.tsx` — 6 suites, 76 tests, all passing (ran inside the isolated worktree, `/tmp/sv-09-reviewfix-*`, with a symlinked `node_modules`).
- `npx tsc --noEmit` — clean, no errors, run in the same worktree.
- No native build was attempted (this machine has no iOS/Android toolchain); verification is web/jest/tsc only, consistent with prior phase notes.

## Skipped Issues

None — all 5 in-scope findings (WR-01 through WR-05) were fixed. IN-01 and IN-02 were out of scope for `fix_scope: critical_warning` and were left untouched (both are explicitly informational/no-action-required per the review itself).

---

_Fixed: 2026-08-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
