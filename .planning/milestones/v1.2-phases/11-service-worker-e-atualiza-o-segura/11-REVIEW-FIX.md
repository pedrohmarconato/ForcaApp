---
phase: 11-service-worker-e-atualiza-o-segura
fixed_at: 2026-08-15T12:20:00Z
review_path: .planning/phases/11-service-worker-e-atualiza-o-segura/11-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-08-15T12:20:00Z
**Source review:** .planning/phases/11-service-worker-e-atualiza-o-segura/11-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope: 1 (WR-01; fix_scope=critical_warning, so IN-01/IN-02 excluded)
- Fixed: 1
- Skipped: 0

## Fixed Issues

### WR-01: Flag-clearing fix only covers the pre-mount race, not the (more common) live-listener path

**Files modified:** `src/components/UpdateBanner.tsx`, `__tests__/UpdateBanner.test.tsx`
**Commit:** `cf22e41`
**Applied fix:**
- `src/components/UpdateBanner.tsx`: `handleUpdateAvailable` (the live `sw-update-available` listener registered after mount) now also sets `w.__swUpdateAvailable = false` after calling `setWaiting(true)`, mirroring the pre-mount-race branch above it. Both code paths that can turn the signal into `setWaiting(true)` now consistently consume the flag.
- `__tests__/UpdateBanner.test.tsx`: `dispatchSwUpdateAvailable` test helper now writes `window.__swUpdateAvailable = true` immediately before dispatching the `CustomEvent`, mirroring `register-sw.js`'s real contract (it always writes the flag before either of its two `dispatchEvent` call sites). Added a new regression test — dispatch live post-mount, dismiss, unmount, remount without a new flag write, assert the banner stays hidden — for the live-listener path specifically (distinct from the existing WR-01 test, which only covers the pre-mount-race/mount-check branch).

**TDD verification (test-before-fix, as requested):**
1. Applied only the test file changes (corrected helper + new regression test) against the pre-fix source. Ran the suite: new test **failed** (`toBeNull()` received a rendered `Text` fiber) — reproducing exactly the described bug: after a live-listener-consumed update, `window.__swUpdateAvailable` stays `true`, so a remount without a new dispatch replays the stale flag and silently reopens the dismissed banner.
2. Applied the source fix. Re-ran the suite: all 10 tests in `UpdateBanner.test.tsx` **passed**, including the new one.

**Full verification after fix (main checkout, post fast-forward):**
- `npx tsc --noEmit`: 0 errors.
- `npx jest`: 153 test suites passed, 1739 tests passed, 0 failed.

**Note on verification environment:** per-fix editing and the RED/GREEN TDD demonstration ran inside an isolated git worktree (`workflow.use_worktrees=true`), which has no `node_modules` by design. `jest` was run there via `NODE_PATH` pointed at the main checkout's `node_modules` (safe — no symlink, no `node_modules` teardown). `tsc`'s `extends` resolution (`expo/tsconfig.base`) does not honor `NODE_PATH`, so `tsc --noEmit` could not run inside the worktree; it was deferred to the main checkout after the fast-forward merge, where it ran clean. The full `tsc` + `jest` numbers above are reproducible by re-running the same commands in `/Users/phmarconato/ForcaApp` (the main checkout) at commit `cf22e41`.

## Skipped Issues

None — the single in-scope finding was fixed.

---

_Fixed: 2026-08-15T12:20:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
