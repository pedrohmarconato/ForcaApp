---
phase: 09-fechamento-de-gaps-do-runtime-web
reviewed: 2026-08-14T00:00:00Z
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
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-08-14
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Phase 09 replaces `Alert.alert` with a web-safe `alertShim`/`AlertHost`/`alertStore` triad, wires a status-driven Wake Lock lifecycle into `ActiveSessionScreen`, adds a permanent regression guard against raw `Alert.alert`, and fixes decimal/comma input on the km/kg fields (`QuestionnaireScreen`, `SessionPlayer`). `tsc --noEmit` is clean and all 8 relevant Jest suites pass (67 tests). No BLOCKER-level defects were found — no crash, data-loss, or security issue traced through the diff. However, several real correctness/robustness gaps were found: an unguarded empty-`buttons`-array trap in the alert plumbing, a regression guard that only scans 3 of the app's 13 `src/` subdirectories (defeating its own stated purpose), a behavioral divergence between the web modal and native `Alert.alert` around backdrop-dismiss bypassing button callbacks, wake-lock churn during the check-in→active transition, and a comma/parseFloat validation inconsistency for weight input. These are all WARNING-level: none currently misfire given the code's actual call sites, but each is a real logic defect waiting for the next caller that doesn't match today's narrow usage pattern.

## Warnings

### WR-01: `AlertHost` silently renders zero buttons if a caller passes an empty `buttons` array

**File:** `src/store/alertStore.ts:33` and `src/components/AlertHost.tsx:17,25`
**Issue:** `alertShim.ts` stores `buttons: buttons ?? null` (nullish-coalescing, not a length check). `AlertHost` then does `const buttons = current.buttons ?? DEFAULT_BUTTONS;`. `??` only falls back on `null`/`undefined` — an explicitly-passed `buttons: []` is truthy and is *not* nullish, so `current.buttons` stays `[]` and `AlertHost` renders a modal with **no buttons at all**. The only way out is a backdrop press; there is no button for a screen reader user or keyboard-only user relying on `accessibilityRole="button"` targets to dismiss. No current call site in this diff passes `[]`, so this is latent, but it's a real logic bug in shipped code (the guard should be `buttons && buttons.length > 0 ? buttons : DEFAULT_BUTTONS`), not a hypothetical — any future call site (e.g. a "no dismiss" informational toast wired via `showAlert(title, msg, [])`) will silently produce an unusable dialog.
**Fix:**
```ts
// src/components/AlertHost.tsx
const buttons = current.buttons && current.buttons.length > 0 ? current.buttons : DEFAULT_BUTTONS;
```

### WR-02: Regression guard against raw `Alert.alert` only scans 3 of 13 `src/` subdirectories

**File:** `__tests__/alertNoAlertRemanescente.test.ts:15-19`
**Issue:** `DIRS` is hardcoded to `src/screens`, `src/components`, `src/store`. The repo also has `src/hooks` (3 files), `src/services` (29 files), `src/engine` (23 files), plus `src/navigation`, `src/contexts`, `src/config`, `src/constants`, `src/types` — 55+ files entirely outside the guard's reach. The test's own docstring states its purpose is to "protege as Fases 10-13 (ex.: opt-in de push) de reintroduzir o bug WEB-01" — but a future hook (e.g. a new `useXyz.ts` in `src/hooks`) or service that calls `Alert.alert` directly would pass this guard with a green checkmark while silently reintroducing the exact WEB-01 no-op-alert bug the guard exists to prevent. The `arquivosVarridos > 20` sanity check only proves the 3 scanned dirs aren't empty — it does not catch the fact that entire dirs are missing from `DIRS`.
**Fix:**
```ts
const DIRS = [
  join(__dirname, '..', 'src', 'screens'),
  join(__dirname, '..', 'src', 'components'),
  join(__dirname, '..', 'src', 'store'),
  join(__dirname, '..', 'src', 'hooks'),
  join(__dirname, '..', 'src', 'services'),
  join(__dirname, '..', 'src', 'engine'),
  join(__dirname, '..', 'src', 'navigation'),
  join(__dirname, '..', 'src', 'contexts'),
];
```
Or, more robustly, scan `src/` recursively and only exclude the two permitted files, so newly-created top-level dirs are covered automatically without another manual `DIRS` edit.

### WR-03: Backdrop-dismiss on the web alert bypasses button `onPress` side effects that native `Alert.alert` guarantees

**File:** `src/components/AlertHost.tsx:29-35` (backdrop `onPress={dismiss}`) vs. `src/screens/SignUpScreen.tsx:48-52`
**Issue:** Native `Alert.alert` is a blocking, un-dismissable-without-a-button dialog on iOS/Android for a single-button alert — the user cannot get past it without their tap firing the button's `onPress`. `AlertHost`'s backdrop `Pressable` calls `dismiss()` directly, with no `onPress` invocation, so on web a user can tap outside the "Cadastro realizado!" dialog in `SignUpScreen.tsx` and the app silently returns to the (now-submitted) sign-up form without navigating to `Login` — the `onPress: () => navigation.navigate('Login')` callback never fires. Same issue in `ActiveSessionScreen.tsx:303-311` ("Concluir treino?" with `Continuar treino`/`Concluir`): dismissing via backdrop neither continues nor concludes, leaving state ambiguous relative to what a native single-button/two-button Alert would guarantee.
**Fix:** Either (a) treat backdrop press as invoking the button whose `style === 'cancel'` (falling back to a no-op) to mirror Android's native back-dismiss semantics, or (b) suppress backdrop dismissal entirely when there is only one button (mirroring iOS's blocking single-button alert) and document the deliberate choice if backdrop dismiss should differ from native for multi-button alerts.

### WR-04: Wake Lock is released and re-acquired during the `awaiting_checkin` → `active` transition because of the intermediate `'loading'` status

**File:** `src/screens/ActiveSessionScreen.tsx:94-103`, `src/store/activeSessionStore.ts:686-696` (`confirmCheckIn` sets `status: 'loading'` before `status: 'active'`)
**Issue:** The wake-lock effect only holds the lock while `status === 'active' || status === 'awaiting_checkin'`. `confirmCheckIn` in the store transitions `awaiting_checkin` → `loading` → `active`. During the `'loading'` tick, the effect's cleanup fires `deactivateKeepAwake`, and the new render (still `'loading'`) hits the `else` branch and calls `deactivateKeepAwake` again; once the store settles to `'active'`, the effect re-runs and calls `activateKeepAwakeAsync` again. The `Screen Wake Lock` browser API requires a valid document/user-activation context to re-`request()` — this churn works today (the reacquire happens synchronously off the same click-driven state update, so activation is very likely still valid), but it is a fragile pattern: any future `await` inserted into `confirmCheckIn` before the `status: 'active'` set would push the reacquire attempt outside the activation window in stricter browser implementations, causing the tab to silently stop staying awake for the entire session with no user-visible signal (per D-06, failures are swallowed).
**Fix:** Treat `'loading'` as still "session in progress" for wake-lock purposes when the previous status was `'active'`/`'awaiting_checkin'`, e.g. broaden the condition to `status !== 'idle' && status !== 'finished' && status !== 'error'`, or hold the lock across the whole `awaiting_checkin`→`active` handoff explicitly.

### WR-05: Weight validation regex accepts comma-decimals but the positivity check (`parseFloat`) truncates at the comma, rejecting valid sub-1kg values

**File:** `src/screens/QuestionnaireScreen.tsx:349` (`/^\d+([.,]\d+)?$/.test(peso) && parseFloat(peso) > 0`) vs. `src/screens/QuestionnaireScreen.tsx:441` (`numericTextToNumber(peso)`)
**Issue:** The regex now accepts both `.` and `,` as the decimal separator (the phase's intended fix), but the positivity guard still uses raw `parseFloat`, which stops parsing at the first non-numeric character. For an input like `"0,5"`, the regex passes (`\d+` = `"0"`, `[.,]\d+` = `",5"`), but `parseFloat("0,5")` evaluates to `0`, and `0 > 0` is `false` — the field is treated as invalid even though `numericTextToNumber("0,5")` (used at submit time, line 441) would correctly resolve it to `0.5`. This is inconsistent with the fix's own stated goal ("aceitar E preservar o decimal") for values below 1 in the integer part. Low real-world impact for adult body weight (`kg` values are normally ≥ 1), but it is a genuine latent inconsistency between the two comma-handling code paths in the same function.
**Fix:**
```ts
!!peso && /^\d+([.,]\d+)?$/.test(peso) && (numericTextToNumber(peso) ?? 0) > 0 &&
```

## Info

### IN-01: Two Wake Lock `useEffect`s duplicate the `status === 'active' || status === 'awaiting_checkin'` predicate

**File:** `src/screens/ActiveSessionScreen.tsx:94-121`
**Issue:** The lifecycle effect and the `visibilitychange` effect both inline the same two-status condition. Any future change to which statuses should hold the wake lock (see WR-04) needs to be applied in two places, and it's easy to update one and miss the other.
**Fix:** Extract a small `sessaoEmAndamento(status)` helper (or a `useMemo`'d boolean) and reference it from both effects.

### IN-02: `alertStore`'s single-slot design silently drops a pending alert if `show()` is called again before the current one is dismissed

**File:** `src/store/alertStore.ts:33` (`show: (alert) => set({ current: alert })`)
**Issue:** This is a documented, deliberate design choice (comment at the top of the file), and it mirrors the OS-level guarantee that "only one alert is on screen." However, unlike native `Alert.alert`, which queues successive calls and shows them one after another, this implementation *replaces* the current alert outright — any `onPress`/`onSim` callback attached to the alert being replaced is discarded and will never run. Nothing in this diff's call sites currently triggers back-to-back `showAlert` calls, so this doesn't misfire today, but it is a real behavior difference from native `Alert.alert` that a future feature (e.g., two async operations that can each fail and each call `showAlert`) could hit silently.
**Fix:** No action required for this phase; worth a short code comment noting the queueing difference from native `Alert.alert` so a future author doesn't assume FIFO semantics.

---

_Reviewed: 2026-08-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
