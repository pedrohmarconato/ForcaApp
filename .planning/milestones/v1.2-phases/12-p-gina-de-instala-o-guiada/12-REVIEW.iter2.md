---
phase: 12-p-gina-de-instala-o-guiada
reviewed: 2026-08-15T00:00:00Z
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
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-08-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the `/instalar` public route feature (INST-02): the pure detection
utility, the 4-state screen, the three navigator registrations (Auth/
Onboarding/Main), the two linking configs, and their tests. The core
invariants hold up under adversarial reading:

- The route never renders authenticated user data (no `AuthContext`/session
  hook is imported or read by `InstallScreen.tsx`), confirmed by an explicit
  test asserting it renders without any auth provider/mock.
- `RootNavigator.js` (not in this phase's file list, read only for
  cross-file context) mounts `linkingInterceptor` only for the
  unauthenticated/onboarding trees and `linkingMain` only for the Main tree
  — `/instalar` never lets a deslogado session jump into `MainNavigator`;
  it resolves inside whichever tree is already mounted. No auth-gate bypass
  found.
- Detection genuinely degrades to the generic fallback (Estado 3) for any
  unrecognized UA, never to a blank screen — `Platform.OS !== 'web'` returns
  `null` before any detection call, and every detection helper returns a
  concrete boolean, never `undefined`/throws.
- No path/name collision across the three trees: `Instalar` is registered as
  a distinct top-level route in all three (`AuthNavigator`, untyped;
  `OnboardingNavigator`/`MainNavigator`, typed via their respective
  `ParamList`s), and the structural regression test in
  `navigationLinking.test.ts` pins `tabBarButton: () => null` within 200
  chars of `name="Instalar"` in `MainNavigator.tsx`, guarding the v6-only
  hidden-tab trick against silent regression.
- `isIOSDevice`'s `Macintosh` + `maxTouchPoints > 1` branch correctly
  unmasks iPadOS 13+ desktop-mode UA, and both directions are covered by
  `installDetection.test.ts`.

Three warnings remain: a Rules-of-Hooks violation whose own comment
misidentifies its source pattern, an incomplete Safari/in-app-browser UA
check that will misroute a known common browser (Google app on iOS), and a
duplicated route-path literal with no shared constant and no test coverage
on one of its two copies.

## Warnings

### WR-01: `useNavigation()` called after a conditional early return (Rules of Hooks violation, comment claims wrong parity)

**File:** `src/screens/InstallScreen.tsx:58-71`
**Issue:** `InstallScreen` returns `null` at line 58 (`if (Platform.OS !== 'web') return null;`) *before* calling the `useNavigation()` hook at line 71. This calls a React hook conditionally, which violates the Rules of Hooks (`react-hooks/rules-of-hooks`) — hooks must be called unconditionally on every render path. It happens to be harmless at runtime only because `Platform.OS` never changes across renders of a single mounted instance, but that's incidental, not guaranteed by the code shape, and any lint config with `eslint-plugin-react-hooks` enabled (the project's own coding-style rules mandate explicit error handling and clean patterns) will flag this.

The file's own header comment (line 6) claims this "mesmo padrão de UpdateBanner.tsx:80" — but `UpdateBanner.tsx` does the *opposite* and correct thing: it calls all five of its hooks (`useUpdateStore` x4, `useEffect`) first, and only checks `Platform.OS !== 'web'` afterward, at its own line 80. `InstallScreen.tsx` inverts that order for its one hook, so the comment misdescribes the pattern it's supposedly copying — a future maintainer copying "the same pattern" from this file would propagate the inverted (broken) version.

**Fix:**
```tsx
const InstallScreen = ({ homeRoute }: InstallScreenProps) => {
  // Hook first — Rules of Hooks — same actual order as UpdateBanner.tsx:24-80.
  const navigation = useNavigation<any>();

  if (Platform.OS !== 'web') return null;

  const standalone = isStandalone();
  const ios = isIOS();
  const safari = isSafari();

  return ( /* ... */ );
};
```
Also correct the comment at line 6 to stop claiming parity with a pattern it inverts, or fix the order so the claim becomes true.

### WR-02: `isSafariBrowser` misclassifies iOS in-app/embedded browsers that retain the "Safari" token (e.g. Google app / GSA) as real Safari

**File:** `src/utils/installDetection.ts:24-27`
**Issue:** `isSafariBrowser` treats any UA containing `Safari` and none of `CriOS|FxiOS|EdgiOS|OPiOS|OPT/` as real Safari. This correctly excludes Chrome/Firefox/Edge/Opera on iOS, but iOS in-app browsers that are neither one of those nor real Safari — most notably Google's own iOS app (GSA), whose UA is documented to end in `.../Version/17.0 GSA/<ver> Mobile/15E148 Safari/604.1` — keep the `Safari` token and add no excluded token. A user who taps a shared `/instalar` link from Google Search's iOS app (a very plausible entry path for a PWA install page) gets routed to Estado 1 ("Toque em Compartilhar" / iOS Safari share-sheet instructions), which does not correspond to what's actually available in that in-app browser chrome — the wrong instructions for a real, common browser, not a degrade-to-generic case.

**Fix:** Extend the exclusion list with known non-Safari iOS UA tokens that keep `Safari`, at minimum GSA:
```ts
export const isSafariBrowser = (ua: string): boolean => {
  const outroNavegadorIOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(ua);
  return /Safari/.test(ua) && !outroNavegadorIOS;
};
```
Consider also covering other common iOS in-app-browser signatures (`FBAN|FBAV` Facebook, `Instagram`, `Line`, `MicroMessenger`, `TikTok`) if product wants full coverage; add a UA fixture + test case for each token added, following the existing `UA_IPHONE_CHROME`/`UA_IPHONE_FIREFOX` pattern in `installDetection.test.ts`.

### WR-03: `'instalar'` route path duplicated as an untied magic literal across two files, one copy untested

**File:** `src/navigation/linkingConfig.ts:109`, `src/navigation/linking.ts:113-117`
**Issue:** The install route path `'instalar'` is hardcoded twice with no shared constant:
- `linkingConfig.ts:109`: `Instalar: 'instalar',` (used by `linkingMain`, the Main tree).
- `linking.ts:117`: `config: { screens: { Instalar: 'instalar' } },` (used by `linkingInterceptor`, the Auth/Onboarding trees).

This is the same class of coupling the file's own header comment (linking.ts:5-34) explicitly warns about for the convite path (`CAMINHO_CONVITE`, imported from a single source and reused everywhere) — but the new `Instalar` path was added as two independent literals instead. If the path is ever renamed (e.g. `instalar` → `instalacao`), it is easy to update one occurrence and miss the other, silently breaking `/instalar` for either the Main tree or the Auth/Onboarding trees depending on which copy was missed.

This gap is compounded by test coverage: `navigationLinking.test.ts` only asserts `getStateFromPath('/instalar', LINKING_CONFIG)` (the `linkingMain`/Main-tree copy, `linkingConfig.ts:109`). No test exercises `linkingInterceptor.config` (the `linking.ts:117` copy) resolving `/instalar` for the Auth/Onboarding trees, so a drift between the two literals would not be caught by the existing suite.

**Fix:** Extract a single constant (mirroring how `CAMINHO_CONVITE` is sourced from `inviteLink.ts` and reused) and import it in both places:
```ts
// linkingConfig.ts
export const CAMINHO_INSTALAR = 'instalar';
// ...
Instalar: CAMINHO_INSTALAR,
```
```ts
// linking.ts
import { LINKING_CONFIG, LINKING_PREFIXES, CAMINHO_INSTALAR } from './linkingConfig';
// ...
config: { screens: { Instalar: CAMINHO_INSTALAR } },
```
Add a test in `navigationLinking.test.ts` asserting `getStateFromPath('/instalar', linkingInterceptor.config).routes[0].name === 'Instalar'` (import `linkingInterceptor` from `../src/navigation/linking`) so both copies stay covered.

## Info

### IN-01: Redundant boolean recheck in `InstallScreen`'s state ternary

**File:** `src/screens/InstallScreen.tsx:81-86`
**Issue:** The chain `standalone ? … : ios && safari ? … : ios && !safari ? … : …` reaches the third branch (`ios && !safari`) only when the second branch (`ios && safari`) has already failed. If `ios` is `true` there, `safari` must already be `false` (else branch two would have matched), so `!safari` is always `true` at that point — the `ios &&` alone would suffice for the same result.
**Fix:** Simplify to `ios ? <InstallScreenIOSOtherBrowser /> : <InstallScreenFallback />` for the third branch, or leave as-is with a short comment noting the redundancy is intentional for readability/symmetry with the four documented states.

### IN-02: Dead defensive branch in `InstallScreenFallback`

**File:** `src/screens/InstallScreen.tsx:152`
**Issue:** `const currentUrl = typeof window !== 'undefined' ? window.location.href : '';` guards against `window` being undefined, but `InstallScreenFallback` only ever renders as a child of `InstallScreen`, which already returned `null` unless `Platform.OS === 'web'` (line 58) — at that point `window` is guaranteed to exist. The ternary's `''` branch is unreachable in practice.
**Fix:** Either drop the guard (`const currentUrl = window.location.href;`) since the invariant is already enforced by the parent, or leave it as intentional defense-in-depth with a one-line comment explaining why it's kept despite being unreachable through the current call path — the latter matches this codebase's habit of over-documenting invariants elsewhere in these same files.

---

_Reviewed: 2026-08-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
