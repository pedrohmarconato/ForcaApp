---
phase: 11-service-worker-e-atualiza-o-segura
reviewed: 2026-08-15T11:51:42Z
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
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-08-15T11:51:42Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the service worker registration/update pipeline (Workbox `generateSW` config, `register-sw.js`, `updateStore.ts`, `UpdateBanner.tsx`) plus the supporting Vercel headers/rewrite and the two permanent test guards. The zero-`runtimeCaching` invariant (OFF-01) is correctly enforced and covered by a real regression test; the `sw.js`/`register-sw.js`/`manifest.json` no-cache/must-revalidate headers and the SPA rewrite exclusion are also correct and tested. The single-reload guard (`refreshing` flag) in `register-sw.js` is sound.

The one CRITICAL finding is a real functional regression the phase context explicitly asked to be attacked: once a user dismisses the banner with "Depois", `updateStore`'s `dismissed` flag is never cleared, so **any subsequent `sw-update-available` event for the rest of the SPA session is silently swallowed** — the banner will never reappear again, even for a brand-new deploy, until the user does a full page reload. This is untested: `__tests__/UpdateBanner.test.tsx` resets `dismissed: false` in `beforeEach`, so the dismiss → new-update path never runs.

Two WARNING-level robustness gaps in `register-sw.js`: the `register()` promise has no `.catch()` (unhandled rejection risk), and the already-documented `CustomEvent` race (event fired before React mounts the listener) has no fallback replay mechanism, so a lost event means an already-waiting update never surfaces until a genuinely new version installs.

## Critical Issues

### CR-01: Update banner permanently stops reappearing after first "Depois"

**File:** `src/store/updateStore.ts:26-27` (also affects `src/components/UpdateBanner.tsx:49`)
**Issue:** `dismiss()` sets `{ waiting: false, dismissed: true }` and nothing in the store ever resets `dismissed` back to `false`. `setWaiting(value)` only ever touches `waiting`:

```ts
setWaiting: (value) => set({ waiting: value }),
dismiss: () => set({ waiting: false, dismissed: true }),
```

`UpdateBanner` gates rendering on `if (!waiting || dismissed) return null;`. Sequence that reproduces the bug within a single SPA session (no full page reload):
1. `sw-update-available` fires → `setWaiting(true)` → banner shows.
2. User taps "Depois" → `dismiss()` → `waiting=false, dismissed=true` → banner hides (correct, intended for *that* update).
3. Later, an entirely different/newer version finishes installing → `register-sw.js` dispatches `sw-update-available` again → `setWaiting(true)` → store is now `{waiting: true, dismissed: true}`.
4. `UpdateBanner`'s guard still evaluates `dismissed === true` → returns `null`. The banner never reappears again for the remainder of the session, even though a real, different update is sitting in `registration.waiting` ready to be applied.

This directly breaks OFF-02: after one dismissal, the update-notification mechanism is permanently dead until the user manually reloads/reopens the tab. It is also untested — `__tests__/UpdateBanner.test.tsx` `beforeEach` always resets `dismissed: false`, so this exact regression path (dismiss, then a *second* `sw-update-available`) is never exercised by the suite.

**Fix:** Clear `dismissed` whenever a new waiting worker is announced, not only on explicit user action:

```ts
setWaiting: (value) => set({ waiting: value, dismissed: value ? false : undefined ?? false }),
```

Simpler and clearer:

```ts
setWaiting: (value) => set((state) => ({
  waiting: value,
  dismissed: value ? false : state.dismissed,
})),
```

Add a regression test to `__tests__/UpdateBanner.test.tsx`: dispatch `sw-update-available`, press "Depois", dispatch `sw-update-available` again, and assert the banner text is visible again.

## Warnings

### WR-01: `navigator.serviceWorker.register()` has no error handling

**File:** `public/register-sw.js:30`
**Issue:**

```js
navigator.serviceWorker.register('/sw.js').then(function (reg) {
  registration = reg;
  ...
});
```

There is no `.catch()`. If registration fails (network error fetching `/sw.js`, byte-mismatch/invalid script, storage/quota errors, or a misconfigured CSP blocking `worker-src`), this produces an unhandled promise rejection with no diagnostic signal, and `registration` stays `undefined` forever — silently disabling the entire update path with no logged reason.

**Fix:**

```js
navigator.serviceWorker.register('/sw.js').then(function (reg) {
  registration = reg;
  // ... existing logic
}).catch(function (err) {
  // Registration failed — app still works, just without offline/update support.
  // Surface for diagnostics without crashing.
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[sw] registration failed', err);
  }
});
```

### WR-02: `sw-update-available` CustomEvent can be lost before React mounts its listener

**File:** `public/register-sw.js:36-39`
**Issue:** The synchronous check `if (reg.waiting && navigator.serviceWorker.controller) { window.dispatchEvent(new CustomEvent('sw-update-available')); }` fires as soon as `register()` resolves — which can happen before `UpdateBanner`'s `useEffect` has registered its `window.addEventListener('sw-update-available', ...)` (React hasn't mounted yet, or is still hydrating). `CustomEvent` dispatch is fire-and-forget: a listener added after the dispatch never sees it. In that case the user has an update sitting in `registration.waiting` that will now **never** be surfaced by the banner — the only escape hatch is a completely new `updatefound` firing for a *different* worker version later. This is called out in the file's own comments as a "residual risk," but no mitigation exists.

**Fix:** Persist last-known state on `window` so a late-mounting listener can synchronously check it on mount (mirrors the CustomEvent host pattern already used for `alertStore`/`AlertHost`):

```js
// register-sw.js
if (reg.waiting && navigator.serviceWorker.controller) {
  window.__swUpdateAvailable = true;
  window.dispatchEvent(new CustomEvent('sw-update-available'));
}
```

```tsx
// UpdateBanner.tsx
useEffect(() => {
  if (Platform.OS !== 'web') return undefined;
  if ((window as any).__swUpdateAvailable) setWaiting(true);
  const handleUpdateAvailable = () => setWaiting(true);
  window.addEventListener('sw-update-available', handleUpdateAvailable);
  return () => window.removeEventListener('sw-update-available', handleUpdateAvailable);
}, [setWaiting]);
```

## Info

### IN-01: Build command duplicated between `package.json` and `vercel.json`

**File:** `package.json:31`, `vercel.json:6`
**Issue:** `"build:web": "npx expo export -p web && npx workbox generateSW workbox-config.cjs && node scripts/verify-web-bundle.mjs"` is copy-pasted verbatim into `vercel.json`'s `buildCommand`. Any future change to one (e.g., adding a step) has to be remembered and applied to the other, or CI and local builds silently diverge.
**Fix:** Have `vercel.json` invoke the npm script instead of repeating it: `"buildCommand": "npm run build:web"`.

### IN-02: `updateStore.applyUpdate()` calls `window.dispatchEvent` with no platform guard

**File:** `src/store/updateStore.ts:28-30`
**Issue:** `applyUpdate` unconditionally references `window.dispatchEvent(new CustomEvent(...))`. Today this is only reachable through `UpdateBanner`'s "Atualizar" button, and `UpdateBanner` itself returns `null` before mount on non-web platforms, so it's not currently exploitable — but the store is a public export (`useUpdateStore`) with no platform guard of its own, unlike the rest of the file's stated design intent of mirroring `alertStore`'s host pattern. Any future caller (e.g., a settings screen "check for updates" button) that invokes `applyUpdate()` outside a `Platform.OS === 'web'` branch would throw on native, since RN's global `window` shim (where present) does not implement `dispatchEvent`/`CustomEvent`.
**Fix:** Guard defensively inside the store itself:

```ts
applyUpdate: () => {
  if (typeof window === 'undefined' || Platform.OS !== 'web') return;
  window.dispatchEvent(new CustomEvent('sw-apply-update'));
},
```

---

_Reviewed: 2026-08-15T11:51:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
