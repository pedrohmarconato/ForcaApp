---
phase: 12-p-gina-de-instala-o-guiada
reviewed: 2026-08-15T14:30:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/utils/installDetection.ts
  - src/screens/InstallScreen.tsx
  - src/navigation/linking.ts
  - src/navigation/linkingConfig.ts
  - src/navigation/AuthNavigator.tsx
  - src/navigation/OnboardingNavigator.tsx
  - src/navigation/MainNavigator.tsx
  - __tests__/installDetection.test.ts
  - __tests__/InstallScreen.test.tsx
  - __tests__/navigationLinking.test.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 12: Code Review Report (iteration 2)

**Reviewed:** 2026-08-15T14:30:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** clean

## Summary

Re-review of the `/instalar` public route feature (INST-02) after the
iteration-1 fix pass (commits `66bdd2e`, `9ef56d5`, `268dc5c`). All three
Warning findings from iteration 1 are verified fixed against the live code,
not just the fix report's claims:

- **WR-01** (Rules of Hooks violation): `src/screens/InstallScreen.tsx:69-71`
  — `useNavigation<any>()` is now called at line 69, unconditionally, before
  the `if (Platform.OS !== 'web') return null;` early return at line 71. The
  header comment (lines 13-16) now correctly describes this order instead of
  claiming a parity with `UpdateBanner.tsx` that the prior code inverted.
- **WR-02** (GSA misclassified as Safari): `src/utils/installDetection.ts:31`
  — the exclusion regex now includes `GSA\/` alongside
  `CriOS|FxiOS|EdgiOS|OPiOS|OPT\/`. Confirmed against the added
  `UA_IPHONE_GSA` fixture and its assertion in
  `__tests__/installDetection.test.ts:34-35,96-98`
  (`isSafariBrowser(UA_IPHONE_GSA)` → `false`).
- **WR-03** (duplicated `'instalar'` literal): `CAMINHO_INSTALAR` is now the
  single source of truth, defined in `src/navigation/linkingConfig.ts:24` and
  consumed both by `LINKING_CONFIG.screens.Instalar`
  (`src/navigation/linkingConfig.ts:119`, Main tree) and by
  `linkingInterceptor.config.screens.Instalar`
  (`src/navigation/linking.ts:117`, Auth/Onboarding trees) via an explicit
  import. `__tests__/navigationLinking.test.ts:106-122` now exercises both
  copies and pins them to the shared constant, closing the previously
  untested gap.

Verification performed independently of the fix report's claims:
`npx jest __tests__/installDetection.test.ts __tests__/InstallScreen.test.tsx
__tests__/navigationLinking.test.ts` → 3 suites / 40 tests passing;
`npx tsc --noEmit -p tsconfig.json` → no errors touching any of the 10
reviewed files; `git log`/`git status` on the reviewed files show the three
fix commits present on `main` with a clean working tree (no drift between
the committed fix and what was reviewed).

No new bugs, security issues, or regressions were introduced by the fixes.
The two Info-level items from iteration 1 (IN-01, IN-02) were correctly left
unfixed — both are cosmetic/dead-code observations, explicitly out of the
`critical_warning` fix scope per `12-REVIEW-FIX.md`, and remain accurately
described below with updated line numbers (the file grew by ~11 lines from
the WR-01 fix's comment correction, shifting downstream line numbers).

Status is `clean`: zero Critical, zero Warning findings remain.

## Info

### IN-01: Redundant boolean recheck in `InstallScreen`'s state ternary

**File:** `src/screens/InstallScreen.tsx:85-93`
**Issue:** The chain `standalone ? … : ios && safari ? … : ios && !safari ? … : …` reaches the third branch (`ios && !safari`) only when the second branch (`ios && safari`) has already failed. If `ios` is `true` there, `safari` must already be `false` (else branch two would have matched), so `!safari` is always `true` at that point — the `ios &&` alone would suffice for the same result. Unchanged from iteration 1; still Info-level, still out of the fix scope that was applied.
**Fix:** Simplify to `ios ? <InstallScreenIOSOtherBrowser /> : <InstallScreenFallback />` for the third branch, or leave as-is with a short comment noting the redundancy is intentional for readability/symmetry with the four documented states.

### IN-02: Dead defensive branch in `InstallScreenFallback`

**File:** `src/screens/InstallScreen.tsx:158`
**Issue:** `const currentUrl = typeof window !== 'undefined' ? window.location.href : '';` guards against `window` being undefined, but `InstallScreenFallback` only ever renders as a child of `InstallScreen`, which already returned `null` unless `Platform.OS === 'web'` (line 71) — at that point `window` is guaranteed to exist. The ternary's `''` branch is unreachable in practice. Unchanged from iteration 1; still Info-level, still out of the fix scope that was applied.
**Fix:** Either drop the guard (`const currentUrl = window.location.href;`) since the invariant is already enforced by the parent, or leave it as intentional defense-in-depth with a one-line comment explaining why it's kept despite being unreachable through the current call path.

---

_Reviewed: 2026-08-15T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2_
