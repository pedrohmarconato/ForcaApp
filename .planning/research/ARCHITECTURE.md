# Architecture Research

**Domain:** Interactive iOS Live Activity + App Intents + background audio, bridged to an existing Expo/RN 0.81 (SDK 54) session-engine app
**Researched:** 2026-08-15
**Confidence:** MEDIUM (core mechanics cross-verified across independent sources; exact file layout / package choice is LOW — single-source blog patterns, no first-party "recipe" exists yet for this specific combination)

## Standard Architecture

### System Overview

```
┌──────────────────────────── LOCK SCREEN / DYNAMIC ISLAND ─────────────────────────┐
│  Widget Extension target (SwiftUI, no RN, no JS engine)                            │
│  ┌───────────────────────────┐   ┌──────────────────────────────────────────┐     │
│  │ SessionActivityView        │   │ CompleteSetIntent / SkipRestIntent /     │     │
│  │  - Text(timerInterval:)    │   │ AdjustRestIntent  (LiveActivityIntent)   │     │
│  │    native countdown        │   │  - STUB copy only; real perform() lives  │     │
│  │  - Button(_:intent:)       │   │    in the APP target (Apple routes it    │     │
│  └───────────────────────────┘   │    there automatically), not here        │     │
└───────────────────────────────────┴──────────────────────────────────────────┘─────┘
                 ▲ Activity<T>.update(ContentState)          │ system runs perform()
                 │ (native ActivityKit call)                 │ IN THE APP PROCESS
┌────────────────┴─────────────────────────────────────────  ▼ ─────────────────────┐
│                          MAIN APP TARGET (RN 0.81 process)                         │
│  ┌────────────────────────┐   ┌───────────────────────────────────────────────┐   │
│  │ modules/live-activity/  │   │ CompleteSetIntent.perform() (REAL copy)       │   │
│  │  Swift Expo Module      │◄──┤  1. Activity<T>.update(...) immediately       │   │
│  │  start/update/end +     │   │  2. writes action to App Group UserDefaults   │   │
│  │  onIntentAction emitter │───►    queue (durable, cold-launch-safe)          │   │
│  └───────────┬─────────────┘   └───────────────────────────────────────────────┘   │
│              │ NativeEventEmitter (in-process; only fires if JS bridge is warm)     │
│              ▼                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │ src/native/liveActivitySync.ts  (NEW — sole writer to native surfaces)      │    │
│  │  subscribes to activeSessionStore; on relevant change → update()/end()      │    │
│  │  the Activity, (re)schedule/cancel local notification, drain intent queue   │    │
│  └───────────────────────────┬────────────────────────────────────────────────┘    │
│                               ▼                                                     │
│  ┌────────────────────────────────────────────────────────────────────────────┐    │
│  │ src/store/activeSessionStore.ts  (MODIFIED — Zustand, existing session      │    │
│  │  engine). Rest-timer state LIFTED here from SessionPlayer.tsx (currently    │    │
│  │  UI-local). New: restEndsAt, reconcileLiveActivityIntents()                 │    │
│  └────────────────────────────────────────────────────────────────────────────┘    │
│                               ▼                                                     │
│  expo-audio (background session, keeps process/JS alive) + expo-speech cues        │
│  expo-notifications (local, non-audio-mode fallback)                               │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Widget Extension target | Renders lock-screen/Dynamic-Island UI; owns the *stub* App Intent copies; **no JS/RN runs here, ever** | SwiftUI `ActivityConfiguration`, generated via `@bacons/apple-targets` |
| `modules/live-activity/` (new local Expo Module) | Swift↔JS bridge: `startActivity`, `updateActivity`, `endActivity`, `isActivityRunning`, event emitter for intent actions | Expo Modules API (Swift), autolinked via `expo-module.config.json` |
| App Intents (`CompleteSetIntent`, `SkipRestIntent`, `AdjustRestIntent`) | `LiveActivityIntent`s bound to lock-screen buttons; `perform()` executes **in the app's process**, not the extension | Swift, included in *both* targets (only the app-target copy runs) |
| App Group shared storage (`group.<bundle-id>`) | Durable, cross-process, cold-launch-safe queue of intent actions; NOT used for the live countdown value (that's push-only via `ContentState`) | `UserDefaults(suiteName:)` |
| `src/native/liveActivitySync.ts` (new) | **Single writer** to ActivityKit + local notifications; subscribes to the store, translates state diffs into native calls | Zustand `subscribe()` side-effect module, no React tree dependency |
| `src/store/activeSessionStore.ts` (existing, modified) | Session engine, source of truth for rest-timer state (after lift), reconciliation of intent-queue actions on resume | Zustand — same shape/philosophy as existing offline-outbox reconciliation |
| `expo-audio` background session | Keeps the iOS process (and therefore the Hermes/JS context) resident while the screen is locked, enabling `expo-speech` cues and JS-driven auto-advance | `AVAudioSession` category `.playback`, `UIBackgroundModes: ["audio"]` |
| `expo-notifications` | Fallback rest-end alert when NOT in background-audio mode; scheduled/cancelled from the same sync layer | `scheduleNotificationAsync` / `cancelScheduledNotificationAsync` |

## Recommended Project Structure

```
app.config.ts                    # NEW — replaces static app.json (plugins need JS logic)
targets/
└── session-widget/              # NEW — generated target via @bacons/apple-targets
    ├── expo-target.config.js    #   declares frameworks: SwiftUI, ActivityKit; type: "widget"
    ├── SessionWidgetBundle.swift
    ├── SessionActivityView.swift        # Text(timerInterval:), Button(_:intent:)
    ├── SessionActivityAttributes.swift  # SOURCE OF TRUTH copy — see anti-pattern below
    ├── Intents/
    │   ├── CompleteSetIntent.swift      # STUB perform() (app target has the real one)
    │   ├── SkipRestIntent.swift
    │   └── AdjustRestIntent.swift
    └── Assets.xcassets/
modules/
└── live-activity/               # NEW — local Expo Module (autolinked, survives prebuild)
    ├── expo-module.config.json
    ├── index.ts                 # startActivity/updateActivity/endActivity/drainIntentQueue
    ├── ios/
    │   ├── LiveActivityModule.swift
    │   └── SessionActivityAttributes.swift  # DUPLICATE — synced by scripts/sync-activity-attrs.sh
    └── src/types.ts              # ContentState / Attributes TS mirror, hand-kept in sync
src/
├── native/
│   └── liveActivitySync.ts      # NEW — sole caller of modules/live-activity + expo-notifications
├── store/
│   └── activeSessionStore.ts    # MODIFIED — rest-timer state + reconcileLiveActivityIntents()
├── components/session/
│   └── SessionPlayer.tsx        # MODIFIED — reads restEndsAt from store, drops local timer state
└── services/
    └── liveActivityQueueRepository.ts  # NEW — thin read/drain wrapper over the App Group queue
```

### Structure Rationale

- **`targets/` at repo root (not under `ios/`):** `ios/` is not committed (CNG/prebuild) — anything meant to survive `expo prebuild --clean` must live outside it. `@bacons/apple-targets` reads `targets/*/expo-target.config.js` at prebuild time and regenerates the Xcode target every run — this is the *only* mechanism in this stack that satisfies the milestone's "prebuild regenerates everything" requirement.
- **`modules/live-activity/` as a local Expo Module, not a third-party package:** the interactive bridge here is tightly coupled to `activeSessionStore`'s exact shape (exercise id, set order, rest end timestamp) and to a one-user personal app. `expo-widgets` (Expo's own upcoming widgets library) is alpha, dated for SDK 55 (this project is on SDK 54), and its App Intents wiring is undocumented — too immature to depend on for a feature this central. `expo-live-activity` (Software Mansion Labs) is explicitly deprecated. A ~150-line hand-written Swift module gives full control over the exact ContentState shape and the intent-queue draining, and is the pattern every working interactive-Live-Activity + RN blog post converges on.
- **`liveActivitySync.ts` as a separate module, not inlined in `SessionPlayer.tsx`:** every native-surface write (Activity update, notification schedule/cancel) must happen from exactly one place, or the widget, the notification, and the JS UI drift out of sync — the same reason this codebase already centralizes offline writes behind `sessionOutboxDrain.ts` rather than scattering them across components.

## Architectural Patterns

### Pattern 1: App Intent perform() runs in-process; App Group queue is the *durable* channel, not the *only* channel

**What:** iOS documents that when a `LiveActivityIntent` button is tapped, `perform()` executes in the **main app's process** (confirmed independently across Apple Developer Forum threads and a dedicated blog post). If the app process is already resident (e.g. kept alive by the background-audio session), `perform()` runs in the *same* process as the live RN/Hermes JS context, so an in-process `NotificationCenter` post → `NativeEventEmitter` → JS listener round-trip is instant. If the app process was *not* resident, iOS may briefly launch it to run `perform()`, but there is no guarantee the RN bridge finishes bootstrapping before the process is suspended again — Headless JS (the Android mechanism for "run JS with no UI") does not exist on iOS.

**When to use:** Any button that must eventually reach the JS session engine (`completeSet`) needs BOTH paths: (1) an immediate native `Activity<T>.update()` call inside `perform()` for lock-screen feedback that never depends on JS being alive, and (2) a durable write to an App Group `UserDefaults` queue that JS drains on the next `startOrResume`/foreground — exactly mirroring the reconciliation this codebase already does for offline writes (`applyServerSetLogs` treats the server as authoritative and replays it into the draft on resume; here the *App Group queue* plays that role for intent actions between activation and JS reconciliation).

**Trade-offs:** Simpler alternatives (cross-process Darwin notifications via `CFNotificationCenter`) are unnecessary complexity here — they exist to reach a *different* process (the extension), but `perform()` never runs there for `LiveActivityIntent`. Relying only on the in-process emitter without the App Group queue is the trap: it works perfectly on-device during testing (app usually resident) and silently drops actions the one time the process was evicted — a classic "works until it doesn't" bug.

**Example:**
```swift
// targets/session-widget/Intents/CompleteSetIntent.swift (app-target copy is the real one)
struct CompleteSetIntent: LiveActivityIntent {
    func perform() async throws -> some IntentResult {
        if let activity = Activity<SessionActivityAttributes>.activities.first {
            var state = activity.content.state
            state = state.advancingToNextPendingSet() // pure, native-side projection
            await activity.update(ActivityContent(state: state, staleDate: nil))
        }
        IntentActionQueue.shared.append(.completeSet(exerciseId: exerciseId, setOrder: setOrder))
        return .result()
    }
}
```

### Pattern 2: Absolute end-timestamp, not remaining-seconds, is the wire format for the rest timer

**What:** `Text(timerInterval:pauseTime:countsDown:showsHours:)` renders a live countdown *entirely on the system's rendering side* — once pushed, it needs zero further app/JS activity to keep ticking down, which is the whole point of putting it on the lock screen. It takes a `ClosedRange<Date>`, not a mutable "seconds remaining" integer. It also has no native pause/resume: every adjustment (±30s, skip, early set completion) must compute a *new* end `Date` and push a fresh `ContentState`.

**When to use:** Any time-based Live Activity element (rest timer here). This directly conflicts with the current implementation: `SessionPlayer.tsx` today tracks `restRemaining`/`restTotal` as **local component state** advanced by a JS `setInterval` (see `restTick` ref, `ajustarRest`, `endRest`) — nothing about it is expressible as a fixed Date range, and it lives outside the store entirely. This state must be **lifted into `activeSessionStore`** as a `restEndsAt: string | null` (ISO timestamp) computed once when rest starts, so both the JS UI and `liveActivitySync.ts` read the same absolute value.

**Trade-offs:** Losing the "sub-second ring animation" the current `setInterval` drives is a UI-only concern — the in-app ring can still animate locally off `restEndsAt` (derive remaining = `restEndsAt - now()` each tick), it's only the *storage* of truth that needs to move, not the visual polish. `staleDate` has a hard **minimum of 2 minutes** from now — a stale marker set sooner than that silently won't fire; don't use it to signal "rest is over," use the timer's own zero-crossing plus a real `update()`/`end()` call instead.

### Pattern 3: The Live Activity is a mirror, never a source of truth

**What:** Every existing write path in this codebase treats the server (`set_logs`, `session_logs`) as authoritative, with local drafts, outboxes, and reconciliation existing only to survive flaky connectivity (`comment in activeSessionStore.ts`: "erro do banco ao gravar uma série NÃO marca a série como feita"). The Live Activity/App Intent layer must slot into the *same* hierarchy: App Group queue actions are provisional, optimistic native-side projections until JS drains them through the existing `completeSet`/offline-outbox path, which is what actually persists to Supabase.

**When to use:** Always, for this milestone. Concretely: `CompleteSetIntent.perform()` never talks to Supabase directly and never marks a set "done" in any durable store other than the App Group queue + the Live Activity's own visual state — persistence still flows exclusively through `activeSessionStore.completeSet()` → `enqueueAndDrain()` → `sessionOutboxDrain.ts`, unchanged.

**Trade-offs:** This means a tap on the lock screen can visually show "set completed" a few seconds (or, worst case, until the user next opens the app) before it is actually durable — acceptable for a personal, single-user app; unacceptable to skip flagging, since it's the one place this milestone's design deliberately trades strict consistency for lock-screen responsiveness.

## Data Flow

### Interactive tap → visible feedback → durable state (two speeds, one queue)

```
[Lock screen button tap]
    ↓ system routes to APP TARGET's LiveActivityIntent copy
[CompleteSetIntent.perform()]  ← runs in main app PROCESS (not extension)
    ↓ (native, synchronous, no JS needed)          ↓ (durable, cold-launch-safe)
[Activity<T>.update(newState)]           [App Group UserDefaults queue += action]
    ↓                                                ↓
[Lock screen re-renders instantly]      [drained next startOrResume() / foreground,
                                          OR instantly via NativeEventEmitter if the
                                          JS bridge happens to already be warm]
                                                     ↓
                                     [activeSessionStore.completeSet() — existing path,
                                      same offline-outbox, same Supabase write]
```

### Store → native surfaces (one-way, single writer)

```
[activeSessionStore state changes: set completed / rest starts / rest adjusted / session ends]
    ↓ (Zustand subscribe(), NOT component effects — survives screen unmounts)
[src/native/liveActivitySync.ts]
    ├──► modules/live-activity: updateActivity(ContentState{ restEndsAt, exerciseName, setLabel })
    ├──► expo-notifications: cancel previous rest-end notification, schedule a new one
    │      (only when NOT in background-audio hands-free mode)
    └──► expo-audio / expo-speech: no direct call here — the JS setInterval loop that
           drives spoken cues reads restEndsAt from the SAME store field, so both native
           surfaces and the audio loop are always derived from one number, never two
```

### Key Data Flows

1. **JS-initiated updates (app foreground, normal use):** `completeSet`/rest-adjust actions flow through the store as today; `liveActivitySync.ts` observes the resulting state change and pushes it outward. No new inbound path — this is the low-risk, build-first direction.
2. **Native-initiated updates (lock screen, app backgrounded or evicted):** `perform()` writes the App Group queue; `activeSessionStore.reconcileLiveActivityIntents()` (new, called at the top of `startOrResume`, same place `applyServerSetLogs` already reconciles server truth) drains and replays it into the SAME `completeSet`/timer actions used by the JS-initiated path — one action implementation, two entry points.

## Scaling Considerations

Not a multi-user/traffic concern (personal, single-device app) — the axis that matters here is **process residency and battery**, not load:

| Scenario | Approach |
|----------|----------|
| Screen locked, no background audio (buttons only, no auto-advance) | Process is *not* guaranteed resident; rely entirely on the App Group queue + `Text(timerInterval:)` native rendering. No JS assumption allowed. |
| Screen locked, hands-free/background-audio mode active | Process stays resident (audio background mode); JS timers, `expo-speech`, and the in-process `NativeEventEmitter` path all work reliably — this is the ONLY mode where "JS reacts instantly to a lock-screen tap" can be assumed. |
| Phone call / audio interruption mid-session | `AVAudioSession` interruption fires; audio session (and the "keeps process alive" guarantee) can lapse. Must resume via the existing `startOrResume` reconciliation on next foreground — do not build a bespoke recovery path. |
| Multiple days without opening the app (Personal Team profile expiry) | Out of scope for this file (build/signing concern, not runtime architecture) — but note the Live Activity itself has its own OS-enforced lifetime (auto-ends after ~8h of inactivity/staleness) independent of the 7-day signing expiry. |

### Scaling Priorities

1. **First bottleneck: process eviction while NOT in audio mode.** This is the default/common case (dono not always running hands-free mode) — the App Group queue is not optional infrastructure, it is the primary contract, not a fallback.
2. **Second bottleneck: `SessionActivityAttributes.swift` drift.** Because `@bacons/apple-targets`-style setups duplicate the shared struct file between the widget target and the app-target module rather than truly sharing it (confirmed pattern in the one detailed walkthrough found), any field added to the session's ContentState later must be changed in both copies or the widget silently fails to decode. Mitigate with a `scripts/sync-activity-attrs.sh` diff-check in CI/pre-commit, not documentation alone.

## Anti-Patterns

### Anti-Pattern 1: Treating remaining-seconds as the wire value for the rest timer

**What people do:** Keep the existing `restRemaining`/`restTotal` + `setInterval` pattern (from `SessionPlayer.tsx`) and try to "push updates every second" to the Live Activity to keep it in sync.
**Why it's wrong:** `Text(timerInterval:)` is specifically designed so the system renders the countdown without any app activity; pushing per-second updates burns the (limited, rate-limited) Live Activity update budget for nothing and still can't outrun the process being suspended — the moment JS stops ticking (locked screen, no audio mode), a seconds-based push falls behind or freezes while the *native* timer field would have kept counting correctly on its own.
**Instead:** Push `restEndsAt` (an absolute `Date`) exactly once per rest period plus once per adjustment. Zero updates in between.

### Anti-Pattern 2: Using Darwin notifications (`CFNotificationCenter`) to reach the App Intent

**What people do:** Reach for `CFNotificationCenter`/Darwin notifications by default for "extension talks to app" because that's the classic iOS widget/extension IPC pattern (and is exactly what the general research surfaced for widget↔app communication).
**Why it's wrong:** For `LiveActivityIntent` specifically, Apple already routes `perform()` into the app's own process — there is no cross-process boundary to cross for the *intent handling itself*. Building a Darwin-notification relay here is solving a problem that doesn't exist for this intent type, and adds a failure mode (Darwin notifications aren't delivered to a fully terminated process either, so it buys nothing over the App Group queue approach that already has to exist for the cold-launch case).
**Instead:** Use the in-process `NotificationCenter`/`NativeEventEmitter` path for the "JS already alive" fast case, and the App Group `UserDefaults` queue for the durable/cold-launch case. No Darwin notifications needed anywhere in this feature.

### Anti-Pattern 3: Letting the widget extension's App Intent copy contain real logic

**What people do:** Implement `perform()` fully in the file that lives under `targets/session-widget/Intents/`, assuming "it's the intent's file, it should have the intent's logic."
**Why it's wrong:** If the SAME intent type is also compiled into the app target (required, since that's the copy that actually executes), duplicate real logic in both copies risks the extension's copy accidentally running instead (has happened per Apple Forums reports when the intent isn't correctly included in the app bundle) with no access to the App Group write succeeding silently differently, or double-writes if both somehow fire.
**Instead:** Widget-extension copy is an intentional stub (or shares only the `IntentPerformable`-conforming struct declaration); the app-target copy — living under `modules/live-activity/ios/` or a dedicated `App/Intents/` folder in the app target — is the one with real `perform()` logic.

## Integration Points

### External Services / Frameworks

| Service/Framework | Integration Pattern | Notes |
|--------------------|---------------------|-------|
| ActivityKit (`Activity<SessionActivityAttributes>`) | Native Swift, called from `modules/live-activity/ios/LiveActivityModule.swift` and from `CompleteSetIntent.perform()` | No push infra needed — this milestone is local-only (no APNs), so only `Activity.request`/`.update`/`.end` are used, never push-token subscriptions |
| App Intents framework | `LiveActivityIntent` conformance on 3 intents (`CompleteSetIntent`, `SkipRestIntent`, `AdjustRestIntent`) | Must be included in BOTH targets per Apple's requirement; only app-target copy's `perform()` runs |
| `@bacons/apple-targets` (config plugin) | `app.config.ts` plugins array; `targets/session-widget/expo-target.config.js` declares the target | This is the mechanism that satisfies "prebuild regenerates everything" — verify it is still actively maintained before locking in (check npm activity at plan time; this is a small ecosystem) |
| `expo-audio` | `UIBackgroundModes: ["audio"]` in `app.config.ts` `ios.infoPlist`; continuous low-level playback (not a "silent trick" workaround since there is no App Store review for a personal sideload) holds `AVAudioSession.Category.playback` active | Confirmed via Expo's own docs: `shouldPlayInBackground`/background modes config is first-party supported |
| `expo-speech` | Called from a JS interval inside `liveActivitySync.ts` or a sibling hands-free-mode module, reading `restEndsAt` from the store — never called from native Swift | Only works because the audio background mode keeps the JS context alive; do not build this before the audio-mode work lands |
| `expo-notifications` | `scheduleNotificationAsync`/`cancelScheduledNotificationAsync`, driven from the same `liveActivitySync.ts` subscribe callback that drives the Activity update | Independent of ActivityKit — can be built and verified before any Live Activity work exists, as an early low-risk milestone slice |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `activeSessionStore.ts` ↔ `liveActivitySync.ts` | Zustand `subscribe()` (one-way, store → sync layer) | New file; must NOT be imported by any React component — it is a background side-effect module wired up once (e.g. in the app's root layout / a `useEffect(() => activateLiveActivitySync(), [])`) |
| `liveActivitySync.ts` ↔ `modules/live-activity` | Direct function calls (`startActivity`/`updateActivity`/`endActivity`) + one `addListener('onIntentAction', ...)` | The event listener is the "fast path" only; correctness must never depend on it firing |
| `modules/live-activity` (native) ↔ App Group queue | `UserDefaults(suiteName: "group.<bundle-id>")`, JSON-encoded array, drained (read + clear) atomically | Same suite name string must match across app target, widget extension target, AND the module's entitlements — verify by diffing the three `.entitlements` files, a documented cross-target failure mode |
| `activeSessionStore.startOrResume` ↔ App Group queue | New `reconcileLiveActivityIntents()` step, called before/alongside existing `local`/`server` reconciliation | Mirrors `applyServerSetLogs`: replay provisional native actions the same way server-confirmed set logs are already replayed on resume |
| `SessionPlayer.tsx` ↔ `activeSessionStore.ts` | MODIFIED: rest timer reads (`restEndsAt`) instead of owning `rest`/`restRemaining`/`restTotal`/`restTick` locally | The in-app countdown ring can still recompute remaining-time locally each animation frame from `restEndsAt`, but must not be the value pushed anywhere else |

## Recommended Build Order (walking skeleton first)

Ordered by hard dependency, not by feature priority — each step needs the previous step's plumbing proven on a real device (Live Activity/App Intent behavior cannot be trusted from the simulator alone for lock-screen/interactive testing):

1. **Sideload build exists** *(prerequisite from a different phase, not this research — flagged because everything below is unverifiable without it)*: `expo prebuild` + free Apple ID signing producing a launchable on-device dev-client build.
2. **Walking skeleton — non-interactive Activity:** `modules/live-activity` + `targets/session-widget` scaffolded via `@bacons/apple-targets`; JS calls `startActivity`/`updateActivity`/`endActivity` with static text (exercise name, "set 2/4"); no timer, no buttons, no App Group. Proves the prebuild + target + Swift module round-trip works at all — the highest-uncertainty plumbing (config plugin behavior, entitlements, Expo Module autolinking) isolated from any session-logic risk.
3. **Native rest timer:** lift rest-timer state from `SessionPlayer.tsx` into `activeSessionStore` (`restEndsAt`), render `Text(timerInterval:)` in the widget. Still no interactive buttons. Proves the "absolute timestamp, push-once" pattern and validates the store refactor in isolation.
4. **Local notification fallback (can build in parallel with step 3, no ActivityKit dependency):** `expo-notifications` scheduled/rescheduled from `liveActivitySync.ts`. Lowest-risk, most standard piece of the whole milestone — good candidate to land early for a quick win even though it's logically the "audio mode off" counterpart to later steps.
5. **App Intents (interactive buttons):** `CompleteSetIntent`/`SkipRestIntent`/`AdjustRestIntent`, App Group UserDefaults queue, `reconcileLiveActivityIntents()` in the store. Built LAST among the Activity-specific work — highest risk (entitlement wiring under free/personal-team signing, `perform()`-in-app-process edge cases, dual-target intent duplication) and most benefits from steps 2–3 already being stable so failures are attributable.
6. **Background audio + hands-free mode:** `expo-audio` background session + `expo-speech` cues, reading `restEndsAt` from the store via a JS interval kept alive by the audio session. Built LAST overall — depends on step 3's store refactor (a stable, store-level `restEndsAt` to read) and is the highest-uncertainty runtime behavior (process residency across phone calls, screen lock, extended idle) requiring the most on-device soak testing.

## Sources

- [expo-live-activity (Software Mansion Labs) — GitHub](https://github.com/software-mansion-labs/expo-live-activity) — MEDIUM (deprecated status noted; corroborates the "config plugin creates a target" pattern)
- [Expo Widgets documentation](https://docs.expo.dev/versions/latest/sdk/widgets/) — LOW (alpha `expo-widgets` package; API surface described but interactive App Intents wiring not documented)
- [Home screen widgets and Live Activities in Expo — Expo blog](https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo) — LOW (dated for SDK 55, ahead of this project's SDK 54; informative but not yet applicable)
- [How to build a live activity with Expo, SwiftUI and React Native — christopher.engineering](https://christopher.engineering/en/blog/live-activity-with-react-native/) — LOW (single detailed source for the local-Expo-Module + `@bacons/apple-targets` pattern; file-duplication gotcha confirmed here)
- [Interactivity with Live Activities and App Intents — Ben Frearson](https://bfrearson.github.io/blog/ios-live-activties/) — MEDIUM (cross-verified with Apple Developer Forums on the "perform() runs in app process" claim)
- [Forcing an AppIntent to run in the main app process — Zach Waugh](https://zachwaugh.com/posts/forcing-appintent-to-run-in-main-app-process) — MEDIUM (independent corroboration of the same in-process claim)
- [Apple Developer Forums — Widgets & Live Activities topic](https://developer.apple.com/forums/topics/app-and-system-services/app-and-system-services-widgets-and-live-activities) — MEDIUM (source of the `Text(timerInterval:)`, `staleDate` minimum-2-minutes, and Personal Team App Groups findings, cross-checked across multiple threads)
- [Signing With a Free Personal Team — zudo-tauri-wisdom](https://takazudomodular.com/pj/zudo-tauri/docs/mobile/ios-signing-free-team/) — MEDIUM (confirms App Groups entitlement available on free personal team, 7-day profile expiry independent concern)
- [Expo Audio (expo-audio) documentation](https://docs.expo.dev/versions/latest/sdk/audio/) — MEDIUM (official docs; `UIBackgroundModes: ["audio"]` config confirmed)
- [Headless JS — React Native docs](https://reactnative.dev/docs/headless-js-android) — HIGH (official docs; explicitly Android-only, ruling out that mechanism for the iOS cold-launch case)

---
*Architecture research for: Interactive Live Activity / App Intents integration into an existing Expo SDK 54 session-engine app (ForcaApp v1.3)*
*Researched: 2026-08-15*
