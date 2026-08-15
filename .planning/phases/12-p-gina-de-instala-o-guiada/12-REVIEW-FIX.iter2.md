---
phase: 12-p-gina-de-instala-o-guiada
fixed_at: 2026-08-15T13:54:17Z
review_path: .planning/phases/12-p-gina-de-instala-o-guiada/12-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-08-15T13:54:17Z
**Source review:** .planning/phases/12-p-gina-de-instala-o-guiada/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (fix_scope: critical_warning — WR-01, WR-02, WR-03; no CR/BL findings existed; IN-01/IN-02 out of scope)
- Fixed: 3
- Skipped: 0

**Verification environment:** All fixes were applied, tested, and typechecked inside the isolated worktree at `/tmp/sv-12-reviewfix-8g4QUW` (branch `gsd-reviewfix/12-18901`, forked from `main`), with `node_modules` symlinked from the main checkout (`/Users/phmarconato/ForcaApp/node_modules`) for `tsc`/`jest`. The worktree was fast-forward merged into `main` and torn down after this report was written — the commits below are reachable from `main` and reproducible there.

## Fixed Issues

### WR-01: `useNavigation()` called after a conditional early return (Rules of Hooks violation, comment claims wrong parity)

**Files modified:** `src/screens/InstallScreen.tsx`
**Commit:** `66bdd2e`
**Applied fix:** Moved `useNavigation<any>()` to the top of the `InstallScreen` component body, before the `if (Platform.OS !== 'web') return null;` early return, so the hook is called unconditionally on every render path. Corrected the file's header comment (previously claiming parity with `UpdateBanner.tsx`'s hook-before-guard order while itself doing the opposite) to describe the actual, now-correct order. Verified: all 7 `InstallScreen.test.tsx` cases pass unchanged, including the case asserting `installDetection` helpers are never called when `Platform.OS !== 'web'` (only the mocked `useNavigation()` moved earlier — no detection call moved).

### WR-02: `isSafariBrowser` misclassifies iOS in-app/embedded browsers that retain the "Safari" token (e.g. Google app / GSA) as real Safari

**Files modified:** `src/utils/installDetection.ts`, `__tests__/installDetection.test.ts`
**Commit:** `9ef56d5`
**Applied fix:** Test-first per convention — added a `UA_IPHONE_GSA` fixture (real GSA UA ending `Version/17.0 GSA/259.0.629865990 Mobile/15E148 Safari/604.1`) and a test asserting `isSafariBrowser(UA_IPHONE_GSA)` is `false`; confirmed RED (`isSafariBrowser` returned `true` against the pre-fix code — reproduced the misrouting to the Safari share-sheet instructions, Estado 1). Then added `GSA\/` to the exclusion regex alongside the existing `CriOS|FxiOS|EdgiOS|OPiOS|OPT\/` tokens, confirmed GREEN. Full `installDetection.test.ts` suite: 23/23 passing.

### WR-03: `'instalar'` route path duplicated as an untied magic literal across two files, one copy untested

**Files modified:** `src/navigation/linkingConfig.ts`, `src/navigation/linking.ts`, `__tests__/navigationLinking.test.ts`
**Commit:** `268dc5c`
**Applied fix:** Extracted `CAMINHO_INSTALAR = 'instalar'` as the single source of truth in `linkingConfig.ts` (mirroring how `CAMINHO_CONVITE` is sourced), and imported/used it in both `LINKING_CONFIG.screens.Instalar` (Main tree) and `linkingInterceptor.config.screens.Instalar` (Auth/Onboarding trees) in `linking.ts`, replacing the two independent literals. Added two tests to `navigationLinking.test.ts`: one exercising the previously-untested `linkingInterceptor.config` copy via `getStateFromPath('/instalar', ...)`, and one tying both copies' values directly to `CAMINHO_INSTALAR` so any future drift between them fails the suite. Full `navigationLinking.test.ts` suite: 10/10 passing.

## Skipped Issues

None — all in-scope findings (WR-01, WR-02, WR-03) were fixed.

## Full Suite Verification

- `npx tsc --noEmit -p tsconfig.json`: **0 errors** (exit 0), no pre-existing or new errors reference any of the 4 modified source/test files.
- `npx jest`: **155/155 test suites passed, 1774/1774 tests passed** (full project suite, run after all 3 fix commits).

## Out of Scope (fix_scope: critical_warning)

- **IN-01** (redundant boolean recheck in `InstallScreen`'s state ternary) and **IN-02** (dead defensive branch in `InstallScreenFallback`) were not addressed — both are Info-severity and excluded by the configured `fix_scope`.

---

_Fixed: 2026-08-15T13:54:17Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
