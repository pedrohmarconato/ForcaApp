---
phase: 09-fechamento-de-gaps-do-runtime-web
reviewed: 2026-08-14T23:59:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - __tests__/activeSessionScreen.test.tsx
  - __tests__/alertHostWeb.test.tsx
  - __tests__/alertNoAlertRemanescente.test.ts
  - __tests__/alertShim.test.ts
  - __tests__/jointLobbyScreen.test.tsx
  - __tests__/questionnaireScreen.test.tsx
  - App.tsx
  - src/components/AlertHost.tsx
  - src/components/session/SessionPlayer.tsx
  - src/screens/ActiveSessionScreen.tsx
  - src/screens/JointLobbyScreen.tsx
  - src/screens/PostQuestionnaireChat.tsx
  - src/screens/QuestionnaireScreen.tsx
  - src/screens/SignUpScreen.tsx
  - src/store/alertStore.ts
  - src/utils/alertShim.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 09: Code Review Report (iteration 2)

**Reviewed:** 2026-08-14
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Re-review of the 5 WARNING-level findings from iteration 1 (labeled below as
`iter1-WR-01` .. `iter1-WR-05`), fixed in commits `fb6808f`, `56bc3e4`,
`035f88a`, `b9f5451`, `a6a55e4`. `tsc --noEmit` is clean and all 6 relevant
Jest suites pass (76 tests, up from 67 in iteration 1).

- **`iter1-WR-01`** (empty `buttons` array → zero-button modal): **correctly
  fixed.** `AlertHost` now falls back to `DEFAULT_BUTTONS` on
  `length === 0`, not just `null`/`undefined`. Regression test confirms.
- **`iter1-WR-02`** (regression guard only scanned 3/13 `src/` subdirs):
  **correctly and more robustly fixed.** The guard now scans `src/`
  recursively from a single root instead of a hardcoded `DIRS` list, so any
  current or future top-level subdirectory is covered automatically.
  Regression test asserts the scan reaches
  `hooks`/`services`/`engine`/`navigation`/`contexts`.
- **`iter1-WR-03`** (backdrop-dismiss bypasses button `onPress`): **fixed
  for the backdrop `Pressable` only — the fix is incomplete.** Tracing the
  same defect through `AlertHost.tsx`'s `Modal onRequestClose={dismiss}`
  prop shows it still calls the raw store `dismiss()` directly.
  `react-native-web`'s `Modal` wires `onRequestClose` to an `Escape` keyup
  handler, so a keyboard user pressing `Escape` on a single-button alert
  (e.g. SignUpScreen's "Cadastro realizado!") still dismisses the dialog
  without ever invoking the button's `onPress` — the exact bug
  `iter1-WR-03` set out to fix, reachable through a different, untested
  input path. Filed below as **WR-02**.
- **`iter1-WR-04`** (Wake Lock churn on `awaiting_checkin`→`active`
  handoff): the churn itself is correctly fixed via the derived
  `sessaoEmAndamento` boolean used as the Wake Lock lifecycle effect's
  dependency. However, the fix only updated *one* of the two effects that
  read session status for Wake-Lock purposes, leaving the second
  (`visibilitychange`, D-07) on the old, now-inconsistent 2-status
  predicate — reopening a variant of the same underlying problem for a
  different trigger (tab backgrounded during the `loading` handoff). Filed
  below as **WR-01**.
- **`iter1-WR-05`** (`parseFloat` truncating comma-decimals in the weight
  positivity guard): **correctly fixed**, reusing `numericTextToNumber` and
  matching the already-correct submit-time code path
  (`QuestionnaireScreen.tsx:450`). Regression test covers `"0,5"`.

Both iteration-1 INFO items were left untouched (correctly out of scope for
`fix_scope: critical_warning`). The first one (duplicated Wake-Lock-effect
predicate) is superseded by WR-01 below: the `iter1-WR-04` fix changed the
predicates to no longer be duplicates — they are now *different and
inconsistent*, a stronger, actionable claim than the original style
observation. The second (single-slot alert queue) remains valid and
unchanged; kept below as **IN-01**.

## Warnings

### WR-01: Wake Lock lifecycle effect and `visibilitychange` re-acquire effect now use different, inconsistent status predicates — reopens a Wake-Lock-not-held bug for a new trigger

**File:** `src/screens/ActiveSessionScreen.tsx:100-110` (Wake Lock lifecycle effect, keyed on `sessaoEmAndamento`) vs. `src/screens/ActiveSessionScreen.tsx:116-128` (`visibilitychange` re-acquire effect, still keyed on raw `status !== 'active' && status !== 'awaiting_checkin'`)
**Issue:** Before the `iter1-WR-04` fix, both Wake-Lock-related effects used the *identical* two-status condition (`status === 'active' || status === 'awaiting_checkin'`), so they were always in lockstep — this was iteration 1's first INFO item ("duplicated predicate," informational only, no misfire at the time). The `iter1-WR-04` fix broadened only the lifecycle effect's condition to `sessaoEmAndamento = status !== 'idle' && status !== 'finished' && status !== 'error'` (which now also includes `'loading'`), but left the `visibilitychange` effect on the original, narrower two-status check. The two effects are no longer in sync, and the gap is exactly the `'loading'` status that `confirmCheckIn` passes through:
1. User is on the check-in sheet, `status === 'awaiting_checkin'`: Wake Lock held, `visibilitychange` listener registered (both effects agree the session is "in progress").
2. User confirms check-in → `confirmCheckIn` sets `status: 'loading'` and awaits `startSessionLog` (`src/store/activeSessionStore.ts:686-696`, a real network round trip).
3. The lifecycle effect does **not** re-run (`sessaoEmAndamento` stayed `true`) — correct, no churn, this is the `iter1-WR-04` fix working as intended.
4. The `visibilitychange` effect **does** re-run, because its dependency is raw `status` (`'awaiting_checkin'` → `'loading'`): its cleanup removes the `visibilitychange` listener, and the new run's guard clause (`status !== 'active' && status !== 'awaiting_checkin'`) is now true for `'loading'`, so it returns immediately without re-registering a listener.
5. If the tab is backgrounded during this `'loading'` window, the browser auto-releases the underlying Screen Wake Lock. When the tab returns to the foreground, there is no `visibilitychange` listener present to reacquire it (it was torn down in step 4).
6. Once `status` settles to `'active'`, the `visibilitychange` effect re-runs and registers a fresh listener — but the visibility event that fired while the tab was hidden→visible during the loading window has already been missed; listeners only see future events.
7. Net effect: the Wake Lock silently stays released for the rest of the session. Per D-06 (`.catch(() => {})` on every Wake Lock call), there is no user-visible error — the screen goes dark during the workout again, the exact class of bug this phase exists to close, now reachable via "background the tab during check-in confirmation" instead of the original "status ping-pongs through `loading`" trigger `iter1-WR-04` fixed.

This is untested: `__tests__/activeSessionScreen.test.tsx`'s Wake Lock suite has no test that exercises `visibilitychange` during `status === 'loading'`, and its two existing `visibilitychange` tests never touch the check-in→active handoff.
**Fix:** Use the same `sessaoEmAndamento` boolean (or an equivalent shared predicate) as the guard for both effects, e.g.:
```ts
const sessaoEmAndamento = status !== 'idle' && status !== 'finished' && status !== 'error';

useEffect(() => {
  if (typeof document === 'undefined') return undefined;
  if (!sessaoEmAndamento) return undefined;
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void activateKeepAwakeAsync(WAKE_LOCK_TAG).catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => document.removeEventListener('visibilitychange', onVisibilityChange);
}, [sessaoEmAndamento]);
```
Add a regression test that sets `status: 'loading'` (simulating the mid-`confirmCheckIn` window), dispatches a `visibilitychange` event with `visibilityState: 'visible'`, and asserts `activateKeepAwakeAsync` is still called.

### WR-02: `iter1-WR-03`'s backdrop-dismiss fix does not cover `Modal`'s `onRequestClose` (Escape key on web) — the underlying defect is only partially fixed

**File:** `src/components/AlertHost.tsx:28` (`<Modal ... onRequestClose={dismiss}>`)
**Issue:** The `iter1-WR-03` fix (commit `035f88a`) correctly rewired the backdrop `Pressable`'s `onPress` to route through button semantics (block dismiss entirely for single-button alerts, invoke the `style === 'cancel'` button for multi-button alerts). It left `onRequestClose={dismiss}` on the `Modal` itself unchanged, still calling the raw `dismiss()` with no button-semantics check. `react-native-web`'s `Modal` implementation wires `onRequestClose` directly to an `Escape` keyup listener (`node_modules/react-native-web/src/exports/Modal/ModalContent.js:34-43`: `if (active && e.key === 'Escape') { ...; if (onRequestClose) onRequestClose(); }`). Concretely: a keyboard user on `SignUpScreen`'s "Cadastro realizado!" single-button alert who presses `Escape` instead of clicking "OK" dismisses the dialog immediately, and `onPress: () => navigation.navigate('Login')` never fires — this is the identical failure mode `iter1-WR-03`'s own description used as its motivating example, just reached through a different, currently-untested input path (`Escape` key vs. backdrop tap). The 3 regression tests added in `035f88a` (`__tests__/alertHostWeb.test.tsx`) only exercise `fireEvent.press(screen.getByTestId('alert-host-backdrop'))`; none dispatch a `keyup`/`Escape` event or invoke `onRequestClose` directly, so this path is unverified in either direction.
**Fix:** Route `onRequestClose` through the same handler used for the backdrop, or share one function:
```tsx
const handleDismissAttempt = () => {
  if (buttons.length <= 1) return;
  const botaoCancelar = buttons.find((b) => b.style === 'cancel');
  dismiss();
  botaoCancelar?.onPress?.();
};

<Modal visible transparent animationType="fade" onRequestClose={handleDismissAttempt}>
  <Pressable style={styles.backdrop} onPress={handleDismissAttempt} ...>
```
Add a regression test that renders a single-button alert, dispatches a `document`-level `keyup` event with `key: 'Escape'` (or directly invokes the rendered `Modal`'s `onRequestClose` prop), and asserts the alert stays open and `onPress` was not called — mirroring the existing backdrop tests.

## Info

### IN-01: `alertStore`'s single-slot design silently drops a pending alert if `show()` is called again before the current one is dismissed

**File:** `src/store/alertStore.ts:33` (`show: (alert) => set({ current: alert })`)
**Issue:** Unchanged from iteration 1 (previously the second INFO item). This is a documented, deliberate design choice (comment at the top of the file) and mirrors the OS guarantee that only one alert is on screen at a time. Unlike native `Alert.alert`, which queues successive calls, this implementation *replaces* the current alert outright — any `onPress`/`onSim` callback attached to the alert being replaced is discarded and never runs. No current call site triggers back-to-back `showAlert` calls, so this remains latent, not misfiring.
**Fix:** No action required for this phase; still worth a short code comment noting the non-FIFO behavior differs from native `Alert.alert`, so a future author doesn't assume queueing semantics.

---

_Reviewed: 2026-08-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
