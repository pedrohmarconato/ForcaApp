---
phase: 11-service-worker-e-atualiza-o-segura
fixed_at: 2026-08-15T14:30:00Z
review_path: .planning/phases/11-service-worker-e-atualiza-o-segura/11-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-08-15T14:30:00Z
**Source review:** .planning/phases/11-service-worker-e-atualiza-o-segura/11-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 1 (fix_scope=critical_warning; IN-01/IN-02 excluded as Info)
- Fixed: 1
- Skipped: 0

**Verification environment:** isolated git worktree (`git worktree add -b gsd-reviewfix/11-72383`), branched from `main` at commit `f29fdfe`. `node_modules` was symlinked (not copied) from the main checkout for `jest`/`tsc` — gitignored, never staged. All gate commands (`npx jest`, `npx tsc --noEmit`) ran inside the worktree; results are reproducible from the same working tree state after the fast-forward merge below, since no worktree-specific config was involved.

## Fixed Issues

### WR-01: `window.__swUpdateAvailable` is write-only — never consumed or cleared, a latent remount-reappearance landmine

**Files modified:** `src/components/UpdateBanner.tsx`, `__tests__/UpdateBanner.test.tsx`
**Commit:** `dd9e899`
**Applied fix:** Reproduced the failure first — added a regression test (mount with `window.__swUpdateAvailable = true`, dismiss via "Depois", unmount, remount without a new dispatch/flag write) and confirmed it failed red against the pre-fix code (banner reappeared on the second mount). Then applied the reviewer's suggested fix in `UpdateBanner.tsx`'s mount effect: after `setWaiting(true)` consumes the replayed flag, set `window.__swUpdateAvailable = false` in the same synchronous block (read-then-clear, mirroring the `jointInvitePending.ts` convention cited in the review). Re-ran the new test — passed. Ran the full existing suite (`npx jest __tests__/UpdateBanner.test.tsx __tests__/serviceWorkerConfig.test.ts`) — all 20 tests pass (19 pre-existing + 1 new), no regressions in CR-01/WR-01(register)/WR-02 coverage. Ran `npx tsc --noEmit -p .` — no errors. Ran the full project suite (`npx jest`) — 153 suites / 1738 tests pass, confirming no collateral breakage elsewhere.

## Skipped Issues

None — the single in-scope finding (WR-01) was fixed. IN-01 and IN-02 were out of scope for this fix pass (`fix_scope: critical_warning` excludes Info-severity findings) and remain open in `11-REVIEW.md` for a future pass if promoted.

---

_Fixed: 2026-08-15T14:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
