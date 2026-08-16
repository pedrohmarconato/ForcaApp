---
phase: 11-service-worker-e-atualiza-o-segura
reviewed: 2026-08-15T14:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - workbox-config.cjs
  - public/register-sw.js
  - public/index.html
  - vercel.json
  - package.json
  - src/store/updateStore.ts
  - src/components/UpdateBanner.tsx
  - __tests__/serviceWorkerConfig.test.ts
  - __tests__/UpdateBanner.test.tsx
  - App.tsx
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 11: Code Review Report (iteration 2)

**Reviewed:** 2026-08-15T14:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Re-review of the review→fix loop for CR-01 (dismissed never reset), WR-01 (register() unhandled rejection), and WR-02 (CustomEvent lost before mount), applied in `d500627`, `4794dbf`, `f29fdfe`.

All three fixes verified correct and tested (19/19 tests pass, `npx jest __tests__/UpdateBanner.test.tsx __tests__/serviceWorkerConfig.test.ts`):

- **CR-01**: `setWaiting` now resets `dismissed` to `false` whenever `value` is `true`, and only then. Traced every call site (`grep` confirms `setWaiting`/`dismiss` are called from exactly the two places documented in the file headers): dismissing then receiving a genuinely new `sw-update-available` correctly re-shows the banner (test at `__tests__/UpdateBanner.test.tsx:134-148`); dismissing and *not* receiving a new event correctly keeps the banner hidden (no code path re-invokes `setWaiting(true)` without either a live `'sw-update-available'` dispatch or the mount-time flag replay). No loop-on-the-same-update is reachable: `setWaiting(true)` is invoked at most once per live browser event, and the mount-time flag check runs exactly once (effect deps `[setWaiting]`, and zustand action references are stable), so it cannot re-trigger for a component that stays mounted.
- **WR-01**: `.catch()` added to the `register()` promise chain; `registration` staying `undefined` on failure is intentional and doesn't throw. Confirmed via the guard test and direct read.
- **WR-02**: `window.__swUpdateAvailable` is written immediately before *both* `dispatchEvent('sw-update-available')` call sites in `register-sw.js` (verified by direct read + the guard test at `__tests__/serviceWorkerConfig.test.ts:192-204`, which scans for the flag write preceding every dispatch occurrence in the file), and `UpdateBanner`'s mount effect reads it synchronously before registering the live listener. This does not interfere with the `refreshing` reload guard (separate variable, never touched by the flag) and does not cause any observed double-fire of `setWaiting` for a single event, since `CustomEvent` dispatch and the flag check both execute synchronously with no yield point between them.

One new WARNING surfaced while specifically probing "can the sync flag leak between updates / cause a dismissed banner to come back for the same update": the flag itself is never cleared after being consumed. See WR-01 below — this is a latent design gap, not a currently-reachable production bug, but the codebase's own convention (see `JointInviteScreen.tsx`/`jointInvitePending.ts`, hardened against exactly this class of remount-reappearance bug) treats this exact risk as real and worth defending against explicitly, so it is flagged rather than waved through.

IN-01 (build command duplicated between `package.json` and `vercel.json`) and IN-02 (`applyUpdate()` has no platform guard) remain unfixed and unchanged from iteration 1 — both are still accurate, kept as INFO since they were explicitly out of scope for this fix pass.

## Warnings

### WR-01: `window.__swUpdateAvailable` is write-only — never consumed or cleared, a latent remount-reappearance landmine

**File:** `public/register-sw.js:43,57`, `src/components/UpdateBanner.tsx:48-50`
**Issue:** The WR-02 fix introduces a module-global flag, `window.__swUpdateAvailable`, set to `true` at both dispatch sites in `register-sw.js`. `UpdateBanner`'s mount effect reads it once to replay a possibly-missed event, but nothing in the codebase ever sets it back to `false`/`undefined` after it has been consumed:

```js
// register-sw.js — written, never cleared
window.__swUpdateAvailable = true;
window.dispatchEvent(new CustomEvent('sw-update-available'));
```

```tsx
// UpdateBanner.tsx — read, never consumed/reset
if ((window as unknown as { __swUpdateAvailable?: boolean }).__swUpdateAvailable) {
  setWaiting(true);
}
```

In the current wiring this is **not reachable in production**: `UpdateBanner` is rendered unconditionally as a direct sibling of `RootNavigator` in `App.tsx`, `App()` has no branch that re-renders a different tree after fonts load, and there is no `React.StrictMode` wrapper anywhere in the render tree (`registerRootComponent` from Expo does not add one either) — so the mount effect genuinely only runs once per full page load, and a full page load always resets the global (fresh JS context). The `dismiss()` → new-update reappearance path itself was independently verified correct (see Summary) and does not depend on this flag at all in the continuously-mounted case.

However, this is a real design gap relative to the file's own stated intent ("mesmo padrão de host global de alertStore/AlertHost") and relative to this project's established convention of explicitly guarding against effect remounts (see `src/screens/JointInviteScreen.tsx` and `src/services/jointInvitePending.ts`, which harden against "remontar por foco/StrictMode" as a real failure mode, not a hypothetical one). If `UpdateBanner` is ever wrapped in `React.StrictMode`, given a `key` that can change, moved behind conditional rendering, or recovered by an error boundary — none of which the current code prevents — the mount effect would run again, find the stale flag still `true` from an update the user already dismissed (or already applied), and call `setWaiting(true)`, silently overriding the user's "Depois" choice and reopening exactly the class of bug CR-01 fixed, via a different trigger.

**Fix:** Consume the flag on read, mirroring the "read once, then clear" contract implied by the design comment:

```tsx
// UpdateBanner.tsx
useEffect(() => {
  if (Platform.OS !== 'web') return undefined;

  const w = window as unknown as { __swUpdateAvailable?: boolean };
  if (w.__swUpdateAvailable) {
    setWaiting(true);
    w.__swUpdateAvailable = false;
  }

  const handleUpdateAvailable = () => setWaiting(true);
  window.addEventListener('sw-update-available', handleUpdateAvailable);
  return () => window.removeEventListener('sw-update-available', handleUpdateAvailable);
}, [setWaiting]);
```

Add a regression test: set `window.__swUpdateAvailable = true`, mount, unmount, remount without re-setting the flag, and assert the banner does **not** reappear on the second mount (it should only reappear via a fresh live `sw-update-available` dispatch or a fresh flag write from `register-sw.js`).

## Info

### IN-01: Build command duplicated between `package.json` and `vercel.json`

**File:** `package.json:31`, `vercel.json:6`
**Issue:** `"build:web": "npx expo export -p web && npx workbox generateSW workbox-config.cjs && node scripts/verify-web-bundle.mjs"` is still copy-pasted verbatim into `vercel.json`'s `buildCommand`, unchanged since iteration 1. Any future change to one has to be remembered and applied to the other, or CI and local builds silently diverge.
**Fix:** Have `vercel.json` invoke the npm script instead of repeating it: `"buildCommand": "npm run build:web"`.

### IN-02: `updateStore.applyUpdate()` calls `window.dispatchEvent` with no platform guard

**File:** `src/store/updateStore.ts:35-37`
**Issue:** `applyUpdate` still unconditionally references `window.dispatchEvent(new CustomEvent(...))`, unchanged since iteration 1. Only reachable today through `UpdateBanner`'s "Atualizar" button (itself gated to web), but the store is a public export with no platform guard of its own — a future caller invoking `applyUpdate()` outside a `Platform.OS === 'web'` branch would throw on native.
**Fix:**

```ts
applyUpdate: () => {
  if (typeof window === 'undefined' || Platform.OS !== 'web') return;
  window.dispatchEvent(new CustomEvent('sw-apply-update'));
},
```

---

_Reviewed: 2026-08-15T14:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
