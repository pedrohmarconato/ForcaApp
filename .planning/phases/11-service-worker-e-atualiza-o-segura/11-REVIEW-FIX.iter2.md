---
phase: 11-service-worker-e-atualiza-o-segura
fixed_at: 2026-08-15T11:58:01Z
review_path: .planning/phases/11-service-worker-e-atualiza-o-segura/11-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-08-15T11:58:01Z
**Source review:** .planning/phases/11-service-worker-e-atualiza-o-segura/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (fix_scope: critical_warning — CR-01, WR-01, WR-02; IN-01/IN-02 out of scope)
- Fixed: 3
- Skipped: 0

**Verification environment:** all fixes were applied, tested (`npx jest`), and type-checked
(`npx tsc --noEmit`) inside an isolated git worktree (`/tmp/sv-11-reviewfix-*`), symlinked to the
main checkout's `node_modules` for tooling access. Commits were fast-forwarded onto `main` from the
temp branch after work completed; the worktree itself was removed after fast-forward. Reproducing
the same `npx jest __tests__/UpdateBanner.test.tsx __tests__/serviceWorkerConfig.test.ts` /
`npx tsc --noEmit` commands from the main checkout should reproduce these results since the worktree
was a checkout of the same repository history.

## Fixed Issues

### CR-01: Update banner permanently stops reappearing after first "Depois"

**Files modified:** `src/store/updateStore.ts`, `__tests__/UpdateBanner.test.tsx`
**Commit:** `d500627`
**Applied fix:** `setWaiting(value)` now clears `dismissed` whenever a *new* waiting worker is
announced (`value === true`), using the functional `set((state) => ...)` form suggested as the
"simpler and clearer" variant in REVIEW.md, rather than the messier `?? false` inline version.
`dismiss()` is unchanged — an explicit "Depois" still hides the banner for the *current* update.

**Test-first verification:** added a regression test to `__tests__/UpdateBanner.test.tsx`
(dispatch `sw-update-available` → press "Depois" → banner hides → dispatch
`sw-update-available` again → banner must reappear). Confirmed the test **fails** against the
pre-fix store (`Unable to find an element with text: Nova versão disponível`), then confirmed it
**passes** after the fix. Full `UpdateBanner.test.tsx` suite (7 tests) green; `npx tsc --noEmit`
clean for both files.

**Note — logic-sensitive fix:** this changes the store's dismiss-state transition logic. Both
tiers of automated verification (syntax + the specific regression test) passed, but per the
"requires human verification" flag for logic-classified findings: recommend a manual UAT pass —
dismiss the banner, trigger a second (different) update, confirm the banner reappears in a real
browser session, not just jsdom — before shipping.

### WR-01: `navigator.serviceWorker.register()` has no error handling

**Files modified:** `public/register-sw.js`, `__tests__/serviceWorkerConfig.test.ts`
**Commit:** `4794dbf`
**Applied fix:** added `.catch(function (err) { ... console.warn ... })` to the `register()`
promise chain, matching REVIEW.md's suggested fix exactly (ES5-safe, no arrow functions, no
template literals — required since `register-sw.js` is not processed by any bundler and must run
unmodified on Safari iOS). Added a permanent guard assertion to the existing
`serviceWorkerConfig.test.ts` file (which already locks other `register-sw.js` invariants) so a
future edit cannot silently drop the `.catch()` again. Confirmed `node -c public/register-sw.js`
passes and the full guard suite (10 tests, including the 8 pre-existing OFF-01/OFF-02 assertions)
stays green.

### WR-02: `sw-update-available` CustomEvent can be lost before React mounts its listener

**Files modified:** `public/register-sw.js`, `src/components/UpdateBanner.tsx`,
`__tests__/UpdateBanner.test.tsx`, `__tests__/serviceWorkerConfig.test.ts`, `.planning/WINDOWS.md`
**Commit:** `f29fdfe`
**Applied fix:** implemented the exact mechanism named in the task brief and in REVIEW.md's Fix
section — `register-sw.js` now sets `window.__swUpdateAvailable = true` synchronously immediately
before *each* of its two `dispatchEvent(new CustomEvent('sw-update-available'))` call sites (the
post-`register()` synchronous check, and the `updatefound`/`statechange` handler), and
`UpdateBanner.tsx`'s mount effect now checks `window.__swUpdateAvailable` synchronously on mount
and calls `setWaiting(true)` if it was already set before the listener was attached — closing the
race the task brief flagged as the previously-undocumented missing "sync flag" from plan 11-02.

**Test-first verification:** added a regression test to `__tests__/UpdateBanner.test.tsx` that sets
`window.__swUpdateAvailable = true` *before* rendering `<UpdateBanner />` and asserts the banner is
visible on first render with no additional event dispatch. Confirmed the test **fails** against the
pre-fix `UpdateBanner.tsx` (temporarily reverted via `git checkout --` inside the disposable
worktree, with the diff preserved beforehand and reapplied immediately after — the revert never
touched the main checkout), then confirmed it **passes** after re-applying the fix. Also added a
permanent guard test to `serviceWorkerConfig.test.ts` asserting `window.__swUpdateAvailable = true;`
immediately precedes *every* `dispatchEvent(...'sw-update-available'...)` call in the raw
`register-sw.js` source, so a future edit that adds a new dispatch site without the flag write
fails the guard immediately. Full combined suite (19 tests across both files) green;
`npx tsc --noEmit` clean for `UpdateBanner.tsx`; `node -c public/register-sw.js` clean.

**Deviation ledger closed:** `.planning/WINDOWS.md` entry #1 (the `public/register-sw.js`
deviation describing this exact residual risk, recorded 2026-08-15T03:38:11Z) marked `fixed` via
`gsd-tools windows fixed 1` — `open_count` in the ledger is now `0`.

## Skipped Issues

None — all in-scope findings (CR-01, WR-01, WR-02) were fixed. IN-01 and IN-02 were out of scope
for this run (`fix_scope: critical_warning`).

---

_Fixed: 2026-08-15T11:58:01Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
