---
phase: 11-service-worker-e-atualiza-o-segura
reviewed: 2026-08-15T16:00:00Z
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

# Phase 11: Code Review Report (iteration 3, final)

**Reviewed:** 2026-08-15T16:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Re-review of the single remaining WARNING from iteration 2 (`window.__swUpdateAvailable` never cleared after consumption), fixed in `dd9e899` by adding `w.__swUpdateAvailable = false;` inside the synchronous mount-check block of `UpdateBanner.tsx`'s effect, plus a regression test (`__tests__/UpdateBanner.test.tsx:150-168`) covering "flag set before mount → consumed → dismissed → remount without a new flag write → banner stays hidden." Confirmed only `UpdateBanner.tsx` and its test file changed in `dd9e899` (`git show --stat`); no other file in scope moved since iteration 2.

The targeted scenario (flag set before mount, consumed by the mount-check branch) is verified correct: the flag is read and cleared in the same synchronous block, no yield point exists between the two statements, and the new test proves a subsequent remount does not resurrect a dismissed banner. CR-01 (`dismissed` reset on `setWaiting(true)`) and WR-01/WR-02 from earlier iterations remain correct and untouched.

However, the fix only clears the flag on **one of the two paths** that can set `waiting=true` from this signal. `register-sw.js` writes `window.__swUpdateAvailable = true` immediately before **every** `dispatchEvent('sw-update-available')` call — including the common case where the event fires *after* `UpdateBanner` has already mounted and its live listener (`handleUpdateAvailable`) is active. That listener calls `setWaiting(true)` but never touches the flag, so after any live-dispatched update the flag is left permanently `true` on `window`. This is the same class of bug the fix was written to close (stale `true` flag surviving a remount and silently reopening a dismissed/applied banner), reachable through the live-listener path instead of the pre-mount-race path the fix actually patches. It is one WARNING, detailed below; the fix is correct but incomplete for the stated "read once, then clear" contract. IN-01/IN-02 remain unchanged and out of scope per the task.

## Warnings

### WR-01: Flag-clearing fix only covers the pre-mount race, not the (more common) live-listener path — `window.__swUpdateAvailable` still goes stale after any post-mount update

**File:** `src/components/UpdateBanner.tsx:57-66`, `public/register-sw.js:43,57`
**Issue:** The mount effect now clears the flag correctly in the branch that replays a pre-mount-race event:

```tsx
const w = window as unknown as { __swUpdateAvailable?: boolean };
if (w.__swUpdateAvailable) {
  setWaiting(true);
  w.__swUpdateAvailable = false;      // only this branch clears it
}

const handleUpdateAvailable = () => setWaiting(true);   // never touches w.__swUpdateAvailable
window.addEventListener('sw-update-available', handleUpdateAvailable);
```

But `register-sw.js` sets the flag to `true` immediately before *both* of its `dispatchEvent('sw-update-available')` call sites (lines 43 and 57), unconditionally — not only in the pre-mount race. `UpdateBanner` is mounted once, near the top of `App.tsx`, essentially at app start; a real `updatefound`/`statechange` event (the far more common real-world trigger, since it requires a network round-trip and worker install to complete) will almost always fire well *after* the component has already mounted and its live listener is already registered. In that path:

1. Component mounts, flag is unset, nothing happens; live listener registered.
2. Minutes/hours later, a real update installs. `register-sw.js` sets `window.__swUpdateAvailable = true`, dispatches the event. The live listener catches it and calls `setWaiting(true)` — correct, banner shows. **The flag is never cleared.**
3. User taps "Depois" → `dismissed=true`. Flag is still `true` on `window`.
4. If `UpdateBanner` is ever remounted without a fresh dispatch (any of the triggers the fix's own commit message names: `React.StrictMode`, a `key` change, an error boundary recovering, or the component moving behind conditional rendering) the mount effect re-reads the stale `true` flag and calls `setWaiting(true)` again, silently reopening the banner and resetting `dismissed` — exactly the bug this fix was written to prevent, via the untouched code path.

This mirrors the reachability caveat already accepted for the prior iteration's WR-01/WR-02 findings in this phase (not reachable today because `App.tsx` renders `UpdateBanner` unconditionally and nothing wraps the tree in `StrictMode` or an error boundary), so it is not an active production bug — but it means the "read once, then clear" contract the code comments claim (lines 49-56, explicitly invoking the `jointInvitePending.ts` pattern) is only half-enforced, and it is untested: the test suite's dispatch helper does not replicate this gap because it doesn't mirror `register-sw.js`'s real contract.

```ts
// __tests__/UpdateBanner.test.tsx:30-32 — this helper only fires the CustomEvent,
// it never sets window.__swUpdateAvailable = true the way register-sw.js always does
// before a real dispatch, so no existing test can observe the flag staying stale
// after a live-listener-consumed event.
const dispatchSwUpdateAvailable = () => {
  window.dispatchEvent(new CustomEvent('sw-update-available'));
};
```

**Fix:** Clear the flag in the live listener too, so both paths that can turn this signal into `setWaiting(true)` leave the flag consistently consumed:

```tsx
useEffect(() => {
  if (Platform.OS !== 'web') return undefined;

  const w = window as unknown as { __swUpdateAvailable?: boolean };
  if (w.__swUpdateAvailable) {
    setWaiting(true);
    w.__swUpdateAvailable = false;
  }

  const handleUpdateAvailable = () => {
    setWaiting(true);
    w.__swUpdateAvailable = false;
  };
  window.addEventListener('sw-update-available', handleUpdateAvailable);
  return () => window.removeEventListener('sw-update-available', handleUpdateAvailable);
}, [setWaiting]);
```

Add a regression test that mirrors `register-sw.js`'s real contract (set the flag immediately before dispatch, as production code does), dispatches live post-mount, dismisses, unmounts, and remounts without a new flag write — asserting the banner stays hidden on the second mount. The current `dispatchSwUpdateAvailable` test helper should also set `window.__swUpdateAvailable = true` before dispatching (or a second helper should be added) so the test double actually matches production behavior.

## Info

### IN-01: Build command duplicated between `package.json` and `vercel.json`

**File:** `package.json:31`, `vercel.json:6`
**Issue:** Unchanged since iteration 1 — out of scope for this iteration per task instructions.
**Fix:** `"buildCommand": "npm run build:web"` in `vercel.json`.

### IN-02: `updateStore.applyUpdate()` calls `window.dispatchEvent` with no platform guard

**File:** `src/store/updateStore.ts:35-37`
**Issue:** Unchanged since iteration 1 — out of scope for this iteration per task instructions.
**Fix:**

```ts
applyUpdate: () => {
  if (typeof window === 'undefined' || Platform.OS !== 'web') return;
  window.dispatchEvent(new CustomEvent('sw-apply-update'));
},
```

---

_Reviewed: 2026-08-15T16:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
