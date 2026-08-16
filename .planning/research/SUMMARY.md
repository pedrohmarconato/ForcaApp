# Project Research Summary

**Project:** ForcaApp v1.3 — "Treino de tela bloqueada" (app nativo pessoal)
**Domain:** Native iOS Live Activity / App Intents / background-audio extension on top of an existing Expo SDK 54 / RN 0.81 (New Architecture) session-tracking app, distributed by free personal-team sideload
**Researched:** 2026-08-15
**Confidence:** MEDIUM — versions and Apple-documented API mechanics are well-sourced; two load-bearing points about the free personal team are contested across the four research files and are resolved below as explicit assumptions to verify empirically, not as settled facts.

## Executive Summary

This milestone extends the existing `activeSessionStore` session engine to a genuinely new surface: the iOS Lock Screen and Dynamic Island, via ActivityKit Live Activities with interactive App Intents buttons, local notifications, and optional background-audio voice cues — all built and signed with a **free Apple personal team** (no paid Developer Program, no APNs, no App Store review). The stack researchers converge on the same core recipe: `@bacons/apple-targets` to scaffold the widget-extension Xcode target declaratively (survives `expo prebuild --clean`), a small hand-written Expo Module (Swift) as the JS↔ActivityKit bridge, `expo-notifications` for the local rest-end alert, and `expo-audio`/`expo-speech` for the hands-free voice-cue mode. No third-party ActivityKit wrapper is mature enough to trust for the interactive-button + free-team combination — every credible path here is thin, hand-rolled Swift.

The single biggest technical risk is NOT feature complexity — it's two unresolved facts about what a free personal team can and cannot do, and they interact: (1) whether the **App Groups** entitlement is obtainable on a free personal team at all, and (2) which **process** actually executes a `LiveActivityIntent`'s `perform()` when a lock-screen button is tapped. The four research files disagree with each other on both points (see Reconciled Contradictions below). The working architecture must therefore have a primary path that does **not** structurally depend on App Groups being available, with App Groups relegated to an optional durability layer for the cold-launch edge case — proven or disproven by a 30-minute on-device spike at the very start of the native-skeleton phase, before any feature Swift is written.

The recommended build order is dependency-locked and front-loads uncertainty: sideload build exists → walking-skeleton non-interactive Live Activity (proves the prebuild/target/module round-trip in isolation) → native rest timer using `Text(timerInterval:)` (proves the absolute-timestamp store refactor) → local-notification fallback (lowest risk, can land any time in parallel) → interactive App Intents buttons (highest risk, built last among Live Activity work, benefits from steps 2-3 being stable) → background audio + hands-free mode (highest runtime uncertainty, most on-device soak testing needed). Two pieces of shared groundwork block multiple later phases and should be treated as their own deliverable: lifting rest-timer state out of `SessionPlayer.tsx`'s local `setInterval` into `activeSessionStore` as an absolute `restEndsAt` timestamp, and getting `.duckOthers` right in the audio-session config so spoken cues coexist with the owner's Spotify instead of interrupting it.

## Key Findings

### Recommended Stack

Core additions on top of the existing Expo SDK 54 / RN 0.81 app: `@bacons/apple-targets@^5.0.0` to scaffold the ActivityKit widget-extension target outside `/ios` so it survives Continuous Native Generation; a hand-written local Expo Module (`modules/live-activity/`, Swift, ~150-250 lines) as the sole JS↔ActivityKit bridge, since no OSS wrapper (`@kingstinct/react-native-activity-kit`, `expo-widgets`, the now-archived `expo-live-activity`) documents the interactive-button wiring this milestone needs and `expo-widgets` requires SDK 55+ (out of scope) plus mandatory App Groups (disqualifying if the spike below fails); `expo-notifications@~0.32.17` for the zero-entitlement local rest-end alert; `expo-speech@~14.0.8` + `expo-audio@~1.1.1` (not the legacy `expo-av`) for background voice cues; `expo-build-properties@~1.0.10` to pin the widget-extension target's iOS 16.1+/17.0+ deployment floor independently of the main app.

**Core technologies:**
- `@bacons/apple-targets` — scaffolds the widget-extension Xcode target declaratively — the only mechanism that survives `expo prebuild --clean`, which the weekly re-sign routine runs constantly
- Hand-written Expo Module (Swift) — JS↔ActivityKit bridge (`request`/`update`/`end`, hosts the App Intents) — no third-party library documents App-Group-free / free-team-safe wiring
- `expo-notifications` (local scheduling only) — rest-end alert with zero entitlement risk on any account tier — the one piece of this milestone with no free-team risk at all
- `expo-audio` (not `expo-av`) + `expo-speech` — background audio session + TTS for hands-free cues, gated behind `UIBackgroundModes: ["audio"]`

### Expected Features

North Star: the whole set-by-set workout ("ver, comandar, registrar") operable from the locked screen. Table stakes replicate what Hevy/Strong/SmartGym already do (Lock Screen card, running rest timer, complete-set/skip-rest buttons, Dynamic Island compact/minimal states, auto-end on session finish, haptic feedback). The genuine differentiator — something no competitor researched offers — is registering reps/carga (no keyboard, stepper +/- with history prefill) **directly from the Live Activity**, not just timer/skip controls; this is possible specifically because ActivityKit has no `TextField` primitive, so a stepper is the only platform-legal input surface, and no App Store review pressure exists to avoid the sideload-only techniques (persistent background audio session) that make voice cues viable.

**Must have (table stakes):**
- Lock Screen card: current exercise + set X/Y, visible without unlocking
- Running rest-timer countdown on the Live Activity (native `Text(timerInterval:)`, not per-second pushes)
- "Concluir série" / "pular descanso" buttons via App Intents, no app-open required
- Dynamic Island compact + minimal presentations (mandatory `ActivityConfiguration` surfaces)
- Auto-end of the Live Activity when the session finishes or is cancelled

**Should have (competitive differentiator):**
- No-keyboard stepper for reps/carga with history prefill, shared component between in-app UI and the Live Activity — the milestone's North Star and genuinely absent from Hevy/Strong/SmartGym
- Hands-free spoken cues via background audio session, coexisting with Spotify via `.duckOthers`
- Local-notification fallback for rest-end, reliable even if the app process was evicted

**Defer (v2+):**
- Home-screen WidgetKit widget — explicitly out of scope by owner decision
- Push-based Live Activity updates / APNs — structurally unavailable on a free personal team; only revisit if the owner pays for the $99/yr Developer Program
- Automated weekly re-signing — manual routine acceptable for a single-user app

### Architecture Approach

The widget-extension target renders Live Activity UI only (SwiftUI, `Text(timerInterval:)`, stub App Intent copies) and never runs JS; the main app target hosts the real App Intent `perform()` implementations, a `liveActivitySync.ts` module that is the **sole writer** to native surfaces (subscribes to `activeSessionStore` via Zustand `subscribe()`, never a component effect), and the modified `activeSessionStore` itself, which gains a `restEndsAt` absolute timestamp (lifted out of `SessionPlayer.tsx`'s local state) and a `reconcileLiveActivityIntents()` step mirroring the existing offline-outbox reconciliation pattern. The Live Activity is architected as a mirror, never a source of truth — button taps never write to Supabase directly; they flow through the same `completeSet()` → outbox → server path that already exists, just with an extra optimistic native-side projection layer in between.

**Major components:**
1. Widget-extension target (`targets/session-widget/`) — SwiftUI Live Activity UI + stub App Intents, scaffolded by `@bacons/apple-targets`, regenerated every prebuild
2. `modules/live-activity/` (new local Expo Module) — Swift↔JS bridge: start/update/end Activity, hosts the real App Intent `perform()` logic, event emitter for the fast in-process path
3. `src/native/liveActivitySync.ts` (new) — single writer translating `activeSessionStore` state diffs into native calls (Activity updates, notification schedule/cancel)
4. `activeSessionStore.ts` (modified) — gains `restEndsAt` (absolute ISO timestamp, replacing the `setInterval`-driven local rest state) and reconciliation of any queued native-originated intent actions on resume

### Reconciled Contradictions (carry forward, do not average)

The four research files disagree on two load-bearing facts. Resolution below is the working assumption for planning; both must be verified empirically at the start of the native-skeleton phase.

**1. Is the App Groups entitlement available on a free personal team?**
STACK.md says unavailable (3+ independent sources: Apple docs mirrors, community threads, forum posts, treated as HIGH where they agreed). ARCHITECTURE.md says available (1 signing-focused source, "Signing With a Free Personal Team"). PITFALLS.md explicitly flags the sources as contradictory across Xcode versions and demands a spike rather than trusting either claim. **Resolution: treat as UNKNOWN.** Run the 30-minute on-device spike described in PITFALLS.md Pitfall 3 (create the widget target, add App Groups capability to both targets, build/run on-device with the personal team selected, round-trip a value through shared `UserDefaults` from both directions) as the literal first task of the native-skeleton phase, before any feature Swift is written. The architecture must not assume the answer either way going in.

**2. Which process runs `LiveActivityIntent.perform()`?**
FEATURES.md and PITFALLS.md assumed the widget-extension process (the classic "extensions are sandboxed, no JS bridge there" model, and PITFALLS.md's Pitfall 2 is built entirely on this assumption). STACK.md and ARCHITECTURE.md — both better-sourced on this specific point, citing Apple's own App Intents design plus two independent corroborating blog posts on "forcing/observing an AppIntent running in the main app process" — say `perform()` executes in the **main app's process**, not the extension's. **Resolution: carry the app-process model as the working assumption** for the primary architecture (this is what makes the App-Groups-free path viable at all — `perform()` can call straight into the JS bridge if the app process is resident). The real, still-open risk is the **cold-launch case**: if the app process was not already resident when the button is tapped, iOS may briefly launch it to run `perform()`, but nothing guarantees the RN/Hermes bridge finishes bootstrapping before the process is suspended again (there is no iOS equivalent of Android's Headless JS). This is why the architecture keeps a durable App-Group-backed action queue as a secondary channel for that one case, gated on the outcome of contradiction #1's spike — if App Groups prove unavailable, the cold-launch fallback degrades to "the app reconciles native `Activity.update()` state when next foregrounded," accepting a wider window of staleness for taps that happen while the app is fully evicted.

Net effect on architecture: the primary interactive-button path is in-process (`perform()` in the main app, calling directly into `liveActivitySync.ts`/`activeSessionStore` via an event emitter) with immediate `Activity.update()` for lock-screen visual feedback regardless of JS availability; the App Group durable queue is additive insurance for the cold-launch edge case, not the backbone of the design, and its existence is conditional on the spike's outcome.

### Shared Groundwork Blocking Multiple Phases

- **Rest-timer state refactor:** `SessionPlayer.tsx` currently tracks `restRemaining`/`restTotal` as UI-local state advanced by a JS `setInterval`. This must move into `activeSessionStore` as an absolute `restEndsAt` (ISO timestamp), because `Text(timerInterval:)` — the only correct way to render a Live Activity countdown — takes a `ClosedRange<Date>`, not a mutable seconds-remaining integer, and needs zero further app activity once pushed. Both the native-timer phase and the hands-free-audio phase (which reads `restEndsAt` to time spoken cues) depend on this refactor landing first; it should be its own deliverable, not incidental to either.
- **`.duckOthers` audio-session config for Spotify coexistence:** the owner listens to Spotify while training. Category `.playback` with mode `.spokenAudio`/`.voicePrompt` and option `.duckOthers` (not `.mixWithOthers`, not bare `.playback`) is the single line of configuration that determines whether spoken cues duck the music briefly (correct) or fully stop it / play inaudibly under it (both wrong, both observed as common tutorial mistakes). This is flagged as "the single most important line of code" in the background-audio phase and must be verified on a physical device with Spotify actually playing — a silent-simulator test proves nothing.
- **No-keyboard stepper as differentiator:** genuinely unmatched among researched competitors (Hevy, Strong, SmartGym all limit Live Activity interactivity to timer/skip, never full set-logging) and not a workaround — ActivityKit has no `TextField` primitive at all, so the stepper *is* the platform-correct design, not a fallback from a "real" text input.

### Critical Pitfalls

1. **`expo prebuild --clean` silently deletes any hand-added widget/Live Activity Xcode target** — the app builds successfully with the feature just gone, no error. Avoid entirely by using `@bacons/apple-targets` from day one; never hand-edit generated `ios/*.xcodeproj` for anything meant to survive a clean prebuild.
2. **App Groups availability on the free personal team is genuinely contested** (see Reconciled Contradictions #1) — spike it in the first 30 minutes of the skeleton phase, on a physical device, before designing the shared-state contract around an assumption.
3. **Per-second manual `Activity.update()` calls for the rest timer** throttle/drop under real (60-180s) durations and drain battery — use `Text(timerInterval:)`, push exactly once per rest period plus once per adjustment, never a `Timer`-driven loop.
4. **Live Activity outlives a force-quit or crash** — the activity keeps showing stale "Set 2/4" with live-looking buttons indefinitely unless a `staleDate` is set and reconcile-on-launch logic explicitly ends orphaned activities that don't match current persisted session state.
5. **Background audio session interrupting Spotify instead of ducking it** — the default `.playback`-with-no-mix-option tutorial pattern fully stops the owner's music on every cue; `.duckOthers` is mandatory, and must be verified on-device with Spotify actually playing, not assumed from docs.

## Implications for Roadmap

Based on research, the dependency-locked build order below (matching ARCHITECTURE.md's "walking skeleton first" recommendation, cross-confirmed by PITFALLS.md's phase mapping) is the suggested phase structure. Live Activity/App Intent behavior cannot be trusted from the simulator alone — every phase from the skeleton onward requires on-device verification with the free personal team's signing.

### Phase 1: Native Skeleton (build, signing, and the App-Groups spike)
**Rationale:** Everything downstream is unverifiable without a launchable signed on-device build, and the App-Groups/process-model contradictions (see Reconciled Contradictions) must be resolved empirically before any feature architecture is locked in — retrofitting later is expensive.
**Delivers:** `expo prebuild` + free Apple ID signing producing a launchable dev-client build on the owner's physical iPhone; frozen bundle identifiers (main app + widget extension) and App Group ID (if the spike proves it viable); documented weekly re-sign runbook; first-build checklist completed (Xcode license, simulator runtime, per-target signing, Developer Mode).
**Addresses:** Infrastructure prerequisite for every table-stakes and differentiator feature in FEATURES.md.
**Avoids:** Pitfall 1 (`prebuild --clean` wipes manual targets), Pitfall 3 (App Groups uncertainty), Pitfall 4 (`aps-environment` leaking into entitlements and breaking signing entirely), Pitfall 5 (10-App-ID/week quota exhaustion from careless renaming), Pitfall 11 (Xcode 26 first-build friction).

### Phase 2: Walking-Skeleton Live Activity (non-interactive)
**Rationale:** Isolates the highest-uncertainty plumbing (config plugin behavior, entitlements, Expo Module autolinking) from any session-logic risk, per ARCHITECTURE.md's explicit recommendation.
**Delivers:** `modules/live-activity` + `targets/session-widget` scaffolded via `@bacons/apple-targets`; JS calls `startActivity`/`updateActivity`/`endActivity` with static text (exercise name, "set 2/4"); no timer, no buttons, no App Group dependency yet.
**Uses:** `@bacons/apple-targets`, hand-written Expo Module (Swift), `expo-build-properties`.
**Implements:** Widget-extension target + JS↔ActivityKit bridge components from the architecture.

### Phase 3: Native Rest Timer + Store Refactor
**Rationale:** Proves the "absolute timestamp, push-once" pattern and validates the `restEndsAt` store refactor in isolation, before any button/App-Intent complexity is layered on top — this refactor also blocks the later hands-free-audio phase, so landing it early de-risks two future phases at once.
**Delivers:** Rest-timer state lifted from `SessionPlayer.tsx` local state into `activeSessionStore` as `restEndsAt`; widget renders `Text(timerInterval:)`. Still no interactive buttons.
**Addresses:** "Timer de descanso visível e correndo" table-stakes feature.
**Avoids:** Pitfall 7 (manual per-second update anti-pattern).

### Phase 4: Local Notification Fallback (can build in parallel with Phase 3)
**Rationale:** Lowest-risk, most standard piece of the whole milestone, with no ActivityKit dependency — a good candidate to land early for a quick, independently-shippable win, and doubles as the reliable fallback the hands-free-audio phase leans on later.
**Delivers:** `expo-notifications` local scheduled/rescheduled rest-end alert, driven from `liveActivitySync.ts`, cancelled/rescheduled on skip or adjustment.
**Addresses:** "Fim de descanso audível mesmo com app fechado" differentiator/safety-net feature.
**Avoids:** Pitfall 9 (iOS suspending the app during silent gaps) by giving the system a reliable delivery path independent of process residency.

### Phase 5: Interactive App Intents (concluir série, pular descanso, stepper)
**Rationale:** Highest risk (entitlement wiring under free-team signing, the perform()-process contradiction, dual-target intent duplication) — built last among Live Activity work specifically so failures are attributable to this phase alone, with Phases 2-3's plumbing already proven stable.
**Delivers:** `CompleteSetIntent`/`SkipRestIntent`/`AdjustRestIntent` (`LiveActivityIntent` conformance), the no-keyboard stepper component shared between in-app UI and the Live Activity, `reconcileLiveActivityIntents()` in the store, and (conditionally, per the Phase 1 spike outcome) the App Group durable action queue for the cold-launch case.
**Implements:** The full interactive data-flow pattern (tap → in-process `perform()` → immediate `Activity.update()` + optional durable queue write → JS reconciliation on next resume).
**Avoids:** Pitfall 2 (assuming the wrong process model — resolved per Reconciled Contradictions #2), Pitfall 6 (orphaned stale activities after force-quit — ship staleDate + reconcile-on-launch with the very first interactive version, not retrofitted).

### Phase 6: Background Audio / Hands-Free Mode
**Rationale:** Highest-uncertainty runtime behavior (process residency across phone calls, screen lock, extended idle) requiring the most on-device soak testing; depends on Phase 3's `restEndsAt` being stable to read from; explicitly deferrable to v1.3.x without breaking the North Star, since Live Activity + local notification already deliver "ver, comandar, registrar."
**Delivers:** `expo-audio` background session (`UIBackgroundModes: ["audio"]`, category `.playback`/mode `.spokenAudio`/option `.duckOthers`) + `expo-speech` spoken cues reading `restEndsAt` from the store via a JS interval kept alive by the audio session.
**Addresses:** "Modo mãos-livres com cues falados" differentiator (P2 priority per FEATURES.md).
**Avoids:** Pitfall 8 (audio session fighting Spotify instead of ducking it — the single most important line of code in this phase), Pitfall 9 (iOS suspending the app during long silent rest gaps — mitigate by treating the local-notification fallback from Phase 4 as the reliable baseline, spoken audio as best-effort enhancement).

### Phase Ordering Rationale

- Every phase after Phase 1 requires a real signed on-device build; nothing here is testable in Expo Go/PWA or the simulator alone for lock-screen/interactive behavior.
- The two contested facts (App Groups availability, `perform()` process) are resolved by spike in Phase 1, not assumed — this ordering exists specifically so the architecture for Phase 5 isn't designed against a guess.
- The rest-timer/store refactor (Phase 3) is deliberately sequenced before both the interactive buttons (Phase 5, which also touches rest adjustment) and background audio (Phase 6, which reads `restEndsAt`), since both consume the same store field and duplicating the refactor across phases would be wasted, error-prone work.
- Local notifications (Phase 4) are pulled forward relative to their "logical" position as the audio-mode counterpart, because they're low-risk, independent of ActivityKit entirely, and de-risk Phase 6 by existing as a proven fallback before hands-free mode is attempted.
- Interactive App Intents (Phase 5) are deliberately last among Live Activity work, not first, despite being the North Star feature — PITFALLS.md and ARCHITECTURE.md agree this is the highest-risk piece and should only be attempted once the plumbing under it (target scaffolding, bridge, timer pattern) is already proven.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (Native Skeleton):** the App-Groups spike outcome and current free-personal-team capability set are contested across sources as of this research and may have shifted further by planning time — re-verify against Apple's current membership documentation, not just this research, at plan time.
- **Phase 5 (Interactive App Intents):** the cold-launch `perform()` behavior (process launched but JS bridge not yet warm) is the one architectural detail with no single authoritative source in this research — flagged by ARCHITECTURE.md itself as needing on-device verification, not just documentation reading.
- **Phase 6 (Background Audio):** silent-gap suspension behavior during multi-minute rest periods is explicitly flagged by PITFALLS.md as needing empirical, real-device, real-duration testing — short dev-loop tests will not surface this.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Walking-Skeleton Live Activity):** `@bacons/apple-targets` + Expo Modules API is a converged, well-documented pattern across all four files.
- **Phase 3 (Native Rest Timer):** `Text(timerInterval:)` usage is directly Apple-documented with no contested claims.
- **Phase 4 (Local Notifications):** `expo-notifications` local scheduling is standard, already used elsewhere in this project (v1.2 web push), zero entitlement risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Package versions/peer-deps are HIGH (npm registry, Expo's `bundledNativeModules.json` — primary sources); the App-Groups-free architecture recommendation is a synthesized cross-check, not a published turnkey recipe |
| Features | MEDIUM | Competitor feature claims (Hevy/Strong/SmartGym) are cross-checked against official product pages but no single authoritative source; ActivityKit platform constraints (no TextField) are Apple-documented and HIGH |
| Architecture | MEDIUM | Core mechanics (in-process `perform()`, `Text(timerInterval:)`, mirror-not-source-of-truth pattern) are cross-verified across independent sources; exact file layout / package choice is LOW — single-source blog patterns, no first-party recipe exists for this exact combination |
| Pitfalls | MEDIUM | Cross-checked across multiple independent web sources (forums, community docs, post-mortems); explicitly flagged by the researcher itself to treat exact numeric limits (App-ID quotas, payload sizes) as needing re-verification at implementation time, not as frozen facts |

**Overall confidence:** MEDIUM — reconciled and actionable, but two facts central to the architecture (App Groups availability, cold-launch `perform()` behavior) remain genuinely unverified until the Phase 1 on-device spike runs.

### Gaps to Address

- **App Groups availability on this specific free personal team + Xcode 26 combination**: unresolved by research alone (3-way source disagreement); resolve via the 30-minute on-device spike as literally the first task of Phase 1, before any feature Swift is written or any shared-state architecture is designed around an assumption.
- **Cold-launch `perform()` reliability** (app not resident when a lock-screen button is tapped): no single authoritative source describes whether/how reliably iOS launches the app process in this case and whether the RN bridge finishes bootstrapping in time; validate empirically in Phase 5 with a deliberate "force-quit, then tap the lock-screen button" test scenario, and design the durable-queue fallback to degrade gracefully either way.
- **Silent-gap background-audio suspension** during multi-minute rest periods: PITFALLS.md flags this as unpredictable/undocumented iOS power-management behavior; validate empirically in Phase 6 with real (not 10-second-demo) rest durations, screen genuinely locked, on the physical device.
- **`@bacons/apple-targets` maintenance status**: flagged by ARCHITECTURE.md as worth re-checking npm activity at plan time — it's a small ecosystem with no first-party Expo backing yet.

## Sources

### Primary (HIGH confidence)
- npm registry (`registry.npmjs.org`) — direct version/peerDependency queries for all evaluated packages
- Expo `bundledNativeModules.json` (`sdk-54` branch) — authoritative source for `npx expo install` resolution on SDK 54
- [Update Live Activities with push notifications — WWDC23, Apple Developer](https://developer.apple.com/videos/play/wwdc2023/10185/) — official session on push budget/mechanics
- [Headless JS — React Native docs](https://reactnative.dev/docs/headless-js-android) — confirms Android-only, ruling out that mechanism for iOS cold-launch
- Repository code (`src/store/activeSessionStore.ts`, `app.json`, `package.json`) — confirms current stack pins and existing session-engine shape

### Secondary (MEDIUM confidence)
- [EvanBacon/expo-apple-targets — GitHub](https://github.com/EvanBacon/expo-apple-targets) and [Expo Apple Targets docs (Mintlify mirror)](https://evanbacon-expo-apple-targets.mintlify.app/introduction)
- [Interactivity with Live Activities and App Intents — Ben Frearson](https://bfrearson.github.io/blog/ios-live-activties/)
- [Forcing an AppIntent to run in the main app process — Zach Waugh](https://zachwaugh.com/posts/forcing-appintent-to-run-in-main-app-process)
- [How to build a live activity with Expo, SwiftUI and React Native — christopher.engineering](https://christopher.engineering/en/blog/live-activity-with-react-native/)
- [Live Activities Are a State Machine, Not a Badge — Blake Crosley](https://blakecrosley.com/blog/live-activities-state-machine)
- Apple Developer Forums threads on Personal Team limitations, `LiveActivityIntent` process execution, and staleDate behavior — treated as HIGH only where 3+ independent threads agreed
- [How to Use Hevy's Live Activity — Hevy Help Center](https://help.hevyapp.com/hc/en-us/articles/35649846517399), [SmartGym Features](https://smartgymapp.com/features.html) — competitor feature confirmation

### Tertiary (LOW confidence, flagged for re-verification)
- [Signing With a Free Personal Team — zudo-tauri-wisdom](https://takazudomodular.com/pj/zudo-tauri/docs/mobile/ios-signing-free-team/) — sole source claiming App Groups is available on personal teams, contradicted elsewhere; do not trust without the Phase 1 spike
- [Home screen widgets and Live Activities in Expo — Expo blog](https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo) — dated for SDK 55, ahead of this project's SDK 54
- [Expo Widgets documentation](https://docs.expo.dev/versions/latest/sdk/widgets/) — alpha package, interactive App Intents wiring undocumented
- [AVSpeechSynthesizer in background — Apple Developer Forums](https://developer.apple.com/forums/thread/27097) — single-thread report of inconsistent background TTS behavior, used as a caution flag only

---
*Research completed: 2026-08-15*
*Ready for roadmap: yes*
