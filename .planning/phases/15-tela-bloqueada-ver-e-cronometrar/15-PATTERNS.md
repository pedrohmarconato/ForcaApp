# Phase 15: Tela bloqueada — ver e cronometrar - Pattern Map

**Mapped:** 2026-08-16
**Files analyzed:** 10
**Analogs found:** 9 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `app.json` (ios.infoPlist.NSSupportsLiveActivities) | config | config-write | `app.json` (existing `ios.entitlements`/plugins block) | exact |
| `modules/live-activity/expo-module.config.json` | config | config-write | `modules/native-info/expo-module.config.json` | exact |
| `modules/live-activity/package.json` | config | config-write | `modules/native-info/package.json` | exact |
| `modules/live-activity/LiveActivityModule.podspec` | config | config-write | `modules/native-info/NativeInfoModule.podspec` | exact |
| `modules/live-activity/index.ts` | service (native bridge) | request-response | `modules/native-info/index.ts` | exact |
| `modules/live-activity/ios/LiveActivityModule.swift` | service (native bridge) | request-response | `modules/native-info/ios/NativeInfoModule.swift` | exact |
| `modules/live-activity/ios/SessionActivityAttributes.swift` | model (Swift struct) | transform | — (new pattern; `targets/session-widget/WidgetLiveActivity.swift`'s `WidgetAttributes`/`ContentState` structs are the closest shape) | role-match |
| `targets/session-widget/WidgetLiveActivity.swift` | component (SwiftUI widget) | streaming (system-rendered timer) | `targets/session-widget/WidgetLiveActivity.swift` (itself — scaffold to rewrite) | exact |
| `targets/session-widget/SessionActivityAttributes.swift` (mirror copy) | model (Swift struct) | transform | same as module-side copy above | role-match |
| `src/native/liveActivitySync.ts` | service (sole store writer) | event-driven (Zustand `subscribe()`) | no existing `.subscribe()` writer in repo; closest architectural precedent is `ProvisioningBanner.tsx`'s mount-time native-module call pattern + `activeSessionStore.ts`'s CAS-guarded async actions | no analog (new pattern) |
| `src/store/activeSessionStore.ts` (+ `restEndsAt`, reconciliation) | store | CRUD + event-driven | itself (existing CAS-guarded async actions, e.g. `completeSet`, `finishSession`) | exact (modification of existing file) |
| `src/components/session/SessionPlayer.tsx` (rest-timer removal) | component | request-response (reads from store) | itself (existing `useEffect`/`setInterval` block, lines 161-306, to be deleted/rewired) | exact (modification of existing file) |
| `src/components/LiveActivityUnavailableBanner.tsx` (D-12) | component | request-response | `src/components/ProvisioningBanner.tsx` | exact |
| `App.tsx` (mount reconciliation host + banner) | provider/host wiring | event-driven (boot-time side effect) | `App.tsx` (existing `<ProvisioningBanner />`/`<PushInviteHost />` mounts) | exact |
| `src/engine/sessionSummary.ts` (`ajustarDescanso` → timestamp variant) | utility (pure function) | transform | itself, `ajustarDescanso` (lines 65-72) | exact (adapt in place or add sibling function) |
| `src/engine/sessionFlow.ts` (new "posição no bloco de métrica" fn, Open Question 2) | utility (pure function) | transform | `posicaoDoExercicio` (lines 24-32) in the same file | role-match |
| `scripts/verify-native-skeleton.sh` (register new module) | config/script | batch (CI-adjacent gate) | itself, line 111 loop `for modulo_local in NativeInfoModule; do` | exact (modification of existing file) |
| `__tests__/liveActivitySync.test.ts` (new) | test | unit | `__tests__/activeSessionStore.test.ts` (mock style, CAS-aware assertions) | role-match |
| `__tests__/activeSessionStore.test.ts` (extend) | test | unit | itself | exact (modification of existing file) |
| `__tests__/ProvisioningBanner.test.tsx` → analog for `LiveActivityUnavailableBanner.test.tsx` | test | unit | `__tests__/ProvisioningBanner.test.tsx` | exact |

## Pattern Assignments

### `modules/live-activity/` (new Expo local module — index.ts, ios/*.swift, config files)

**Analog:** `modules/native-info/` (copy line-by-line — this is the repo's only precedent for a local Expo Swift module, and it already survives `expo prebuild --clean`, tracked by `scripts/verify-native-skeleton.sh`)

**`expo-module.config.json`** (copy verbatim, swap names):
```json
{
  "platforms": ["apple"],
  "apple": {
    "podspecPath": "LiveActivityModule.podspec",
    "modules": ["LiveActivityModule"]
  }
}
```

**`package.json`** (copy shape from `modules/native-info/package.json`):
```json
{
  "name": "live-activity",
  "version": "1.0.0",
  "description": "Fase 15: Live Activity somente leitura (LOCK-01/02/03)",
  "main": "index.ts",
  "types": "index.ts",
  "license": "UNLICENSED",
  "author": "Pedro Marconato",
  "homepage": "https://github.com/pmarconato/forca-app",
  "peerDependencies": { "expo": "*" }
}
```

**`LiveActivityModule.podspec`** (copy `modules/native-info/NativeInfoModule.podspec` verbatim, rename `s.name`/`s.source_files` unchanged, `s.dependency 'ExpoModulesCore'` unchanged, `s.platforms = { :ios => '15.1' }` — check against target's `deploymentTarget: "17.0"`, ActivityKit APIs used here require iOS 16.1+ so this podspec's floor is fine, don't lower it).

**`index.ts` imports + bridge pattern** (`modules/native-info/index.ts`, full file, 17 lines):
```typescript
import { NativeModule, requireNativeModule } from 'expo';

declare class NativeInfoModuleType extends NativeModule<NativeInfoModuleEvents> {
  getProvisioningProfileExpiry(): Promise<string | null>;
}

const NativeInfoModule = requireNativeModule<NativeInfoModuleType>('NativeInfoModule');

export async function getProvisioningProfileExpiry(): Promise<string | null> {
  return NativeInfoModule.getProvisioningProfileExpiry();
}
```
Apply the same shape: `requireNativeModule<LiveActivityModuleType>('LiveActivityModule')`, thin exported async wrapper functions per RESEARCH.md's proposed `startActivity`/`updateActivity`/`endActivity`/`isActivityRunning`/`reconcileOrphans`.

**`ios/*.swift` module skeleton** (`modules/native-info/ios/NativeInfoModule.swift`, class boilerplate):
```swift
import ExpoModulesCore

public class NativeInfoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NativeInfoModule")
    AsyncFunction("getProvisioningProfileExpiry") { () -> String? in
      guard let expirationDate = readProvisioningProfileExpiry() else { return nil }
      return ISO8601DateFormatter().string(from: expirationDate)
    }
  }
}
```
Copy `Module { Name(...); AsyncFunction(...) { ... } }` structure exactly for `LiveActivityModule.swift`; each of `startActivity`/`updateActivity`/`endActivity`/`isActivityRunning`/`reconcileOrphans` becomes its own `AsyncFunction("...")` block. Import `ActivityKit` alongside `ExpoModulesCore`.

**Error handling pattern:** `modules/native-info` never throws — it returns `nil` on any failure path (file missing, decode failure) via `guard`/`try?`. For `LiveActivityModule`, mirror this for D-12 (no Live Activity support/refused): wrap `Activity.request(...)` in `do/catch`, return `false`/`nil` rather than throwing across the bridge, and let the JS side (`liveActivitySync.ts`) interpret a falsy/failed result as the D-12 signal — do not let a native throw crash the JS caller.

---

### `targets/session-widget/WidgetLiveActivity.swift` (rewrite of scaffold)

**Analog:** itself — the file already has the exact structural pieces required (verified in this session, lines 1-64): `ActivityAttributes`/`ContentState` struct, `ActivityConfiguration(for:)` body closure, `dynamicIsland` closure with all 4 required sub-closures (`compactLeading`/`compactTrailing`/`minimal`) and 3 `DynamicIslandExpandedRegion`s (`.leading`/`.trailing`/`.bottom`).

**Scaffold placeholders to replace** (exact current lines, verified):
```swift
struct WidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var emoji: String
    }
    var name: String
}
...
.activityBackgroundTint(Color.cyan)
.activitySystemActionForegroundColor(Color.black)
...
.widgetURL(URL(string: "https://www.expo.dev"))
.keylineTint(Color.red)
```
Replace `WidgetAttributes`/`emoji` with `SessionActivityAttributes`/the real `ContentState` (phase, exerciseName, setIndex/setTotal, targetRepsMin/Max, targetLoadKg, isBodyweight, restEndsAt, blockLabel/blockIndex/blockTotal — per RESEARCH.md's `LiveActivityContentState` type and UI-SPEC's color/typography tables). Replace colors per UI-SPEC §"Live Activity chrome (scaffold placeholders to replace)": `.activityBackgroundTint(Color(red: 0.039, green: 0.039, blue: 0.039))`, `.activitySystemActionForegroundColor(Color.white)`, `.keylineTint(Color(red: 0.922, green: 1.0, blue: 0.0))`. Remove `.widgetURL(...)` placeholder (out of scope this phase per UI-SPEC).

**Core switch-by-phase pattern** — no existing repo analog (first ActivityKit UI in codebase); use RESEARCH.md Pattern 1's pseudo-code as the structural template (already reconciled against the real scaffold + UI-SPEC typography/color tokens):
```swift
ActivityConfiguration(for: SessionActivityAttributes.self) { context in
    switch context.state.phase {
    case .resting:
        Text(timerInterval: Date.now...context.state.restEndsAt!, countsDown: true)
            .font(.title2).fontWeight(.bold).monospacedDigit()
    case .measuring:
        Text("\(context.state.targetRepsMin ?? 0)–\(context.state.targetRepsMax ?? 0) reps")
            .font(.title2).fontWeight(.bold).minimumScaleFactor(0.8).lineLimit(1)
    case .readyOvertime:
        Text(timerInterval: context.state.restEndsAt!...Date.distantFuture, countsDown: false)
    case .blockOnly:
        Text("\(context.state.blockLabel ?? "") \(context.state.blockIndex ?? 0)/\(context.state.blockTotal ?? 0)")
            .font(.caption2).lineLimit(1)
    }
}
```

**Truncation/overflow rules (mandatory, per UI-SPEC "Presentation size budgets"):** every free-text `Text` gets `.lineLimit(1)`; exercise/block name uses `.truncationMode(.tail)`; the prescription Display element uses `.minimumScaleFactor(0.8)` instead of truncation (a clipped digit conveys nothing — UI-SPEC E5·overflow); every countdown/count-up `Text(timerInterval:)` and the overtime tag get `.monospacedDigit()` (correctness requirement, not style — prevents per-tick reflow).

---

### `src/store/activeSessionStore.ts` (+ `restEndsAt`, reconciliation)

**Analog:** itself — every existing session-active mutation already follows a CAS-guard pattern (verified: `completeSet` ~line 1206, `finishSession` ~line 1743, `skipWholeSession` ~line 1698).

**CAS-guard pattern to reuse** (`finishSession`, verified structure around lines 1743-1780):
```typescript
finishSession: async () => {
  const atual = get().draft;
  if (!atual) return false;
  // CAS: fixa a sessão desta conclusão ANTES do await (F7).
  const sessionLogIdNaChamada = atual.sessionLogId;
  ...
  const stateDepoisDoAwait = get().draft;
  if (!stateDepoisDoAwait || stateDepoisDoAwait.sessionLogId !== sessionLogIdNaChamada) {
    // outra sessão assumiu enquanto isto estava em voo — não pisa nela
    return false;
  }
  set({ draft: { ...atual, status: 'finished' }, status: 'finished' });
  return true;
},
```
Apply the identical "capture id before await, re-check after await, bail if changed" shape to any new store action that sets `restEndsAt` or performs orphan reconciliation after an `await` (e.g. awaiting the native module's `reconcileOrphans`/`isActivityRunning` call).

**`restEndsAt` field placement:** add alongside existing `status: Status` field (line 124) in the draft/session shape — same flat-field convention already used for `status`, not a nested sub-object.

**Reconciliation note:** RESEARCH.md/CONTEXT.md establish there is currently NO `.subscribe()` usage anywhere in `src/` (grep confirmed) and NO boot-time reconciliation entry point outside `ActiveSessionScreen.tsx`'s `startOrResume` (grep confirmed, only caller). Treat `liveActivitySync.ts`'s `store.subscribe(...)` and the `App.tsx`-mounted reconciliation host as new patterns to introduce, not patterns to copy from elsewhere in this repo — but keep the CAS discipline above when writing any resulting store mutation.

---

### `src/components/session/SessionPlayer.tsx` (rest-timer removal, LOCK-02)

**Analog:** itself — the exact block to delete/rewire is fully identified:

**Current implementation** (verified, lines 161-306):
```typescript
const [rest, setRest] = useState<RestState>(null);
const [restRemaining, setRestRemaining] = useState(0);
const [restTotal, setRestTotal] = useState(0);
const restTick = useRef<ReturnType<typeof setInterval> | null>(null);
...
useEffect(() => {
  if (!rest) return undefined;
  setRestRemaining(rest.seconds);
  setRestTotal(rest.seconds);
  ringAnim.setValue(1);
  restTick.current = setInterval(() => {
    setRestRemaining((r) => (r <= 1 ? 0 : r - 1));
  }, 1000);
  return () => { if (restTick.current) clearInterval(restTick.current); };
}, [rest, ringAnim]);

const ajustarRest = (delta: number) => {
  const { remaining, total } = ajustarDescanso(restRemaining, restTotal, delta);
  setRestRemaining(remaining);
  setRestTotal(total);
};

const endRest = (autoStart: boolean) => {
  if (restTick.current) clearInterval(restTick.current);
  const alvo = rest?.next ?? null;
  setRest(null);
  if (autoStart && alvo && alvo.set.status !== 'done') {
    activateSet(alvo.exercise.exerciseId, alvo.set.setOrder);
  }
};

// LINE 298 — THE LINE D-09/D-10 REVERSE:
useEffect(() => {
  if (rest && restRemaining === 0) endRest(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [restRemaining]);
```
**What must change:** delete the `setInterval`-driven `restRemaining`/`restTotal` state entirely (source of truth moves to `restEndsAt` in the store, per Pattern 2 of RESEARCH.md). Delete/replace the `useEffect` at line ~296-299 that calls `endRest(true)` on zero — per D-09, hitting zero must NEVER auto-advance, regardless of app foreground/background state (D-10). The visual ring (`ringAnim`, lines 167-179) can keep animating but must derive its fraction from `restEndsAt - Date.now()` recomputed per frame/tick, not from the deleted `restRemaining` state. `ajustarRest`/`ajustarDescanso` call site adapts to operate on the timestamp (see `sessionSummary.ts` pattern below) instead of `remaining`/`total` integers.

---

### `src/engine/sessionSummary.ts` — `ajustarDescanso` timestamp adaptation

**Analog:** itself (verified, lines 65-72, pure function, already isolated):
```typescript
export const ajustarDescanso = (
  remaining: number,
  total: number,
  deltaSeconds: number,
): { remaining: number; total: number } => {
  const novoRestante = Math.max(1, remaining + deltaSeconds);
  return { remaining: novoRestante, total: Math.max(total, novoRestante) };
};
```
**Pattern to copy:** keep it pure, no I/O, same file/module (matches the rest of `sessionSummary.ts`'s style). The `remaining`-based `Math.max(1, ...)` floor becomes an equivalent floor on the new `restEndsAt` timestamp (never let a `-30s` adjustment push `restEndsAt` into the past relative to `now`). Prefer adding a sibling function (e.g. `ajustarRestEndsAt(restEndsAt: string, deltaSeconds: number, now: Date): string`) rather than changing `ajustarDescanso`'s signature — RESEARCH.md Pattern 2 explicitly frames this as "tradução direta... não reescrita da lógica."

---

### `src/engine/sessionFlow.ts` — new "position within same-metric block" function (Open Question 2 / D-03)

**Analog:** `posicaoDoExercicio` in the same file (verified, lines 24-32) — counts position among `exerciciosEmJogo` (ALL exercises in play). New function needs the identical shape but filtered to `isTimeBased(metricOf(exercise))`-matching exercises only, to produce "Alongamento 2/6" per-block numerators. Follow the file's existing pure-function/no-I/O convention; add a corresponding unit test alongside existing `sessionFlow` tests (same pattern as `posicaoDoExercicio`'s own coverage). **Flagged as unresolved in UI-SPEC (`E7 · partial`)** — planner must treat the exact denominator semantics as an assumption to confirm, not a locked contract.

---

### `src/components/LiveActivityUnavailableBanner.tsx` (D-12)

**Analog:** `src/components/ProvisioningBanner.tsx` (full file read, 76 lines) — UI-SPEC explicitly names this as the pattern to follow, "matching `ProvisioningBanner.tsx`'s exact shape (message style only, no title/button slots)."

**Full structural pattern to copy:**
```typescript
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import theme from '../theme/theme';
// import { <check availability fn> } from '../../modules/live-activity';

const LiveActivityUnavailableBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    let cancelled = false;
    // read ActivityAuthorizationInfo / native module once on mount
    // .then((available) => { if (!cancelled && !available) setVisible(true); });
    return () => { cancelled = true; };
  }, []);

  if (Platform.OS !== 'ios') return null;
  if (!visible) return null;

  return (
    <View style={styles.container} testID="live-activity-unavailable-banner">
      <Text style={styles.message}>
        Ative as Live Activities em Ajustes para ver o treino na tela bloqueada
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: theme.zIndex.toast,
    backgroundColor: theme.colors.surface.card,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...theme.elevation.floating,
  },
  message: {
    color: theme.colors.text.primary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.medium,
  },
});

export default LiveActivityUnavailableBanner;
```
**Deviation from `ProvisioningBanner` per UI-SPEC:** no `numberOfLines` cap — message wraps freely to two lines (UI-SPEC E11·overflow, dono-decided), unlike `ProvisioningBanner`'s single-line message (which happens to fit on one line already, so no explicit cap was ever needed there either — behavior is compatible, no code change required to `Text`, just don't add `numberOfLines={1}`).

**Error handling/D-12 "once only" pattern:** `ProvisioningBanner` reads once on mount via `useEffect` with a `cancelled` flag guard against unmount races — reuse this exact guard. For "shown once, never repeated" (D-12), do not re-check on every render/focus; a single mount-time check matches the existing precedent and naturally satisfies "no repeated warning."

---

### `App.tsx` — mount reconciliation host + banner

**Analog:** itself, existing root mounts (verified via grep):
```typescript
import ProvisioningBanner from './src/components/ProvisioningBanner';
import PushInviteHost from './src/components/PushInviteHost';
...
<ProvisioningBanner />
...
<PushInviteHost />
```
**Pattern to copy:** add `<LiveActivityUnavailableBanner />` next to `<ProvisioningBanner />` (same "informational overlay mounted at root" family). Add the new reconciliation-host component (e.g. `<LiveActivityReconciliationHost />` or fold logic into `liveActivitySync.ts`'s own top-level effect component) in the same root tree, following `PushInviteHost`'s precedent of "a component with no visual output, mounted at root, that runs a side effect on mount independent of navigation" — this is the concrete mechanism that satisfies D-11 (reconciliation must not depend on the user visiting `ActiveSessionScreen.tsx`).

---

### `scripts/verify-native-skeleton.sh` — register new module

**Analog:** itself (verified, line 111):
```bash
for modulo_local in NativeInfoModule; do
```
**Pattern to copy:** change to `for modulo_local in NativeInfoModule LiveActivityModule; do` (or the exact class name chosen for the Swift module) — this is the checagem (e) loop that proves real Podfile.lock compilation, not just autolinking discovery (documented bug this script already caught once in Phase 14).

---

### Tests

**Analog for `liveActivitySync.test.ts`:** `__tests__/activeSessionStore.test.ts` — mock-native-module style. Follow its `jest.mock('../src/services/...')` convention for mocking `modules/live-activity` (the native bridge), e.g.:
```typescript
jest.mock('../modules/live-activity', () => ({
  startLiveActivity: jest.fn(),
  updateLiveActivity: jest.fn(),
  endLiveActivity: jest.fn(),
  isActivityRunning: jest.fn(),
}));
```
Assert CAS-safe behavior the same way existing store tests assert it: state before/after an awaited mock resolution, with a stale-session guard check.

**Analog for `LiveActivityUnavailableBanner.test.tsx`:** `__tests__/ProvisioningBanner.test.tsx` (10/10 passing per Phase 14 verification) — same `Platform.OS` mocking + native-module mock + mount/unmount timing assertions.

**`__tests__/activeSessionStore.test.ts` extension:** add cases for `restEndsAt` computation, D-09 "does not auto-advance," D-08 inactivity timeout — inserted alongside existing cases in the same file (per Wave 0 Gaps in RESEARCH.md's Validation Architecture section), following the file's existing `describe`/`it` structure and `jest.mock(...)` setup already in place at the top of the file.

## Shared Patterns

### Native Expo local module scaffolding
**Source:** `modules/native-info/` (all files)
**Apply to:** `modules/live-activity/expo-module.config.json`, `package.json`, `LiveActivityModule.podspec`, `index.ts`, `ios/LiveActivityModule.swift`
Copy the four-file skeleton verbatim, renaming module/class identifiers only. This is the repo's only proven-to-survive-`prebuild --clean` local-module pattern.

### CAS guard on async store mutations
**Source:** `src/store/activeSessionStore.ts` (`finishSession`, `completeSet`, `skipWholeSession`)
**Apply to:** any new `activeSessionStore.ts` action touching `restEndsAt` or orphan-reconciliation state that crosses an `await`
Capture the session/draft identifier before the `await`, re-check it hasn't changed after, bail without mutating if it has.

### Discreet, mount-once, non-blocking native-status banner
**Source:** `src/components/ProvisioningBanner.tsx`
**Apply to:** `src/components/LiveActivityUnavailableBanner.tsx`
`Platform.OS !== 'ios'` early-return, single `useEffect` read on mount with a `cancelled` guard, `theme.zIndex.toast` positioned absolute-bottom banner, no title/button slots, styled via `theme.colors.surface.card`/`theme.colors.text.primary`.

### Root-mounted, navigation-independent side-effect host
**Source:** `App.tsx` (`<ProvisioningBanner />`, `<PushInviteHost />`)
**Apply to:** the new Live Activity reconciliation trigger and `<LiveActivityUnavailableBanner />`
Mount at the root of `App.tsx`, not inside any screen — guarantees the effect runs regardless of which tab/screen the user lands on after boot (this is the concrete fix for Pitfall 2 in RESEARCH.md).

### Pure, testable engine functions with no I/O
**Source:** `src/engine/sessionSummary.ts` (`ajustarDescanso`), `src/engine/sessionModel.ts` (`isTimeBased`, `metricOf`), `src/engine/sessionFlow.ts` (`posicaoDoExercicio`)
**Apply to:** the `restEndsAt` timestamp-adjustment function, the `ContentState`-building function (phase/metric-derived), and the new "position within same-metric block" function
Keep these as standalone exported pure functions in the existing `src/engine/*.ts` files (not inline in the store or component), matching the file's established one-function-per-concern convention and its existing test coverage pattern.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/native/liveActivitySync.ts` | service (sole store writer via `.subscribe()`) | event-driven | RESEARCH.md confirms (via `grep -rn "\.subscribe("`) that Zustand `.subscribe()` is not used anywhere else in `src/` — this is a new pattern for the codebase, not a copy of an existing one. Build it using the CAS-guard conventions from `activeSessionStore.ts` plus the "root-mounted host" convention from `App.tsx`, but there is no direct analog file to lift structure from. |
| `modules/live-activity/ios/SessionActivityAttributes.swift` (and its target-side mirror) | model | transform | No existing dual-copy Swift struct pattern in the repo (first ActivityKit feature). RESEARCH.md Pitfall 4 flags this explicitly — treat as new, and decide (per CONTEXT.md's Claude's Discretion) whether a diff-check script like `scripts/sync-activity-attrs.sh` is added this phase, following `scripts/verify-native-skeleton.sh`'s general "cheap regression gate" style but with no direct script analog to copy line-for-line. |

## Metadata

**Analog search scope:** `modules/native-info/`, `targets/session-widget/`, `src/components/ProvisioningBanner.tsx`, `App.tsx`, `src/store/activeSessionStore.ts`, `src/components/session/SessionPlayer.tsx`, `src/engine/sessionSummary.ts`, `src/engine/sessionModel.ts`, `src/engine/sessionFlow.ts`, `scripts/verify-native-skeleton.sh`, `__tests__/activeSessionStore.test.ts`, `__tests__/ProvisioningBanner.test.tsx`
**Files scanned:** 14 read directly (full or targeted sections) + graphify graph query for orientation
**Pattern extraction date:** 2026-08-16
