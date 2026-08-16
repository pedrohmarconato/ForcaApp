# Stack Research

**Domain:** iOS native app extras on top of an Expo SDK 54 / RN 0.81 app — interactive Live Activity (ActivityKit + App Intents), local notifications, background audio + TTS — built and signed with a **free Apple personal team** (sideload only, no APNs, no App Groups entitlement).
**Researched:** 2026-08-15
**Confidence:** MEDIUM — versions and official-doc claims are HIGH confidence (npm registry, Expo `bundledNativeModules.json`, Apple docs via search); the free-personal-team + App-Groups-free ActivityKit architecture is a **synthesized recommendation cross-checked across multiple sources**, not something anyone has published as a turnkey recipe. Treat the "no App Groups" path as the top implementation risk to smoke-test before building on it (see the Stack Patterns section).

## The one finding that shapes everything else

**A free/personal Apple team cannot get the App Groups entitlement.** Multiple independent sources (Apple docs mirrors, community troubleshooting threads, forum posts) agree: App Groups is a capability-based entitlement gated to Apple Developer Program members ($99/year); Xcode's "Personal Team" cannot request it, and there is no manual workaround. This kills the *tutorial-default* Live Activity architecture, which almost universally uses an App Group to share `UserDefaults`/a container between the app target and the widget-extension target.

The way out, also confirmed from Apple's own App Intents design: an App Intent that conforms to **`LiveActivityIntent`** (not the generic `AppIntent`) has its `perform()` executed **in the host app's process**, not the widget extension's process — this is Apple's documented mechanism for exactly this scenario (interactive Lock Screen/Dynamic Island buttons that need to talk to app state) and it needs **no shared storage**. Combined with the fact that **local-only Live Activities (no push token requested) need only `NSSupportsLiveActivities = YES` in Info.plist — no entitlement at all**, the whole feature is buildable on a free personal team as long as you deliberately avoid App Groups everywhere:

- Widget extension target: scaffolded, but its `expo-target.config.js` must **not** declare `com.apple.security.application-groups`.
- Interactive buttons: implemented as `LiveActivityIntent`s, whose `perform()` runs in-process in the main app and can call straight into your Expo Module / JS bridge.
- Activity lifecycle (`request` / `update` / `end`): called from a custom Expo Module in the **main app target**, using `pushType: .none` (local-only, no APNs, no `usernotifications` entitlement).

This constraint is the reason the recommendation below favors a **thin, hand-written Expo Module** over any of the current third-party ActivityKit wrapper libraries — none of them document that they use `LiveActivityIntent`/App-Group-free wiring, and getting this wrong is the difference between "works on free team" and "silently needs a paid account."

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@bacons/apple-targets` | `^5.0.0` (peer `expo>=52`, so SDK 54-safe) | Config plugin that scaffolds the WidgetKit/ActivityKit extension target (`/targets` dir) and re-adds it on every `expo prebuild --clean` | The de facto standard for adding native Apple targets to an Expo prebuild app (formerly a Evan Bacon side project, now documented as "Expo Apple Targets"); files live outside `/ios` and survive CNG regeneration — the only property that matters given this repo has no committed `ios/` dir. Requires Xcode 16+ and CocoaPods 1.16.2+ (both satisfied: Xcode 26 installed). **Do not** put `com.apple.security.application-groups` in its `expo-target.config.js` or in `app.json`'s `ios.entitlements` — that's the App Groups trap on free team. |
| Hand-written Expo Module (Swift), e.g. `modules/live-activity/` | N/A — built in-repo via `npx create-expo-module --local` | Bridges JS ↔ `ActivityKit`: `Activity<SessionAttributes>.request(attributes:content:pushType:.none)`, `.update(...)`, `.end(...)`, and hosts the `LiveActivityIntent` implementations for "concluir série" / "pular descanso" | No current OSS library (checked below) documents interactive-button + App-Group-free wiring. The Expo Modules API (Swift, New Architecture-native) is the sanctioned way to add native code to a prebuild app without hand-editing `/ios`, and gives full control over `pushType: .none` and `LiveActivityIntent` placement — the two details that make this work without a paid account. Building it in-repo also means only ~150-250 lines of Swift, well inside "many small files" territory. |
| `expo-notifications` | `~0.32.17` (exact SDK 54-pinned version per Expo's `bundledNativeModules.json`) | Local (non-push) scheduled notification for "fim do descanso" | Local notifications need zero entitlements on any account tier — this is the one piece of the milestone with no free-team risk at all. Already the standard Expo notification API; this milestone only needs the local-scheduling half (`scheduleNotificationAsync`), not push. |
| `expo-speech` | `~14.0.8` (SDK 54-pinned) | Text-to-speech for the hands-free spoken cues ("próxima série", "descanso terminado") | First-party, zero native ceremony, works in background once the audio session is configured for background playback (see `expo-audio` row). No credible third-party alternative is more current or better maintained for on-device TTS in Expo. |
| `expo-audio` | `~1.1.1` (SDK 54-pinned) | Background audio session (`AVAudioSession` category `.playback`) that keeps the process alive during a hands-free session and lets `expo-speech` cues play with the screen locked | Successor to `expo-av` (which is legacy/frozen); SDK 54 already ships `expo-av ~16.0.8` for back-compat but **do not start new work on it** — `expo-audio` is the maintained path. Needs `ios.infoPlist.UIBackgroundModes: ["audio"]` in `app.json` (config-plugin-managed, survives prebuild) plus `setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' })` at runtime. |
| `expo-build-properties` | `~1.0.10` (SDK 54-pinned) | Sets the widget-extension target's iOS deployment target / Swift settings during prebuild | Needed because the ActivityKit extension target requires iOS 16.1+ (Dynamic Island needs 16.1, interactive buttons need 17.0) while the main app may target an older floor; this plugin is the standard way to pin per-target build settings without touching generated Xcode project files by hand. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-native-nitro-modules` | `^0.36.5` (only if you adopt a Nitro-based ActivityKit wrapper) | Native module runtime required by `@kingstinct/react-native-activity-kit` | Only pull this in if you decide to prototype against `@kingstinct/react-native-activity-kit` instead of the hand-written module (see Alternatives below) — otherwise skip it entirely, it's an unnecessary dependency for the hand-rolled path. |
| `expo-task-manager` | `~14.0.9` (SDK 54-pinned) | Only if a later iteration needs background task registration beyond audio-session-keeps-alive | Not required for this milestone's scope (rest alert is a scheduled local notification, not a background task) — list here only so it isn't reached for by habit; background audio mode is sufficient to keep the session "alive" for the hands-free flow. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Xcode 26 (already installed 2026-08-15) | Compiles the widget-extension target and signs with the Personal Team | Run `sudo xcodebuild -license accept` first (flagged as pending in `PROJECT.md`) — an unaccepted license silently breaks `expo prebuild` / `pod install` on first run. |
| `npx create-target widget` (from `@bacons/apple-targets`) | Scaffolds the first ActivityKit target interactively | Run once per target; re-running `expo prebuild -p ios --clean` afterward regenerates `/ios` with the target wired in. |
| `xed ios` | Opens the generated Xcode workspace for manual signing checks | Free personal team requires eyeballing "Signing & Capabilities" for both the app target and the widget-extension target — Xcode will visibly show "no accounts with App Groups capability" if the trap above is hit, which is the fastest way to confirm the architecture holds before writing Swift. |

## Installation

```bash
# Core — config plugin + Expo-maintained modules (SDK 54-pinned versions)
npx expo install expo-notifications@~0.32.17 expo-speech@~14.0.8 expo-audio@~1.1.1 expo-build-properties@~1.0.10
npm install @bacons/apple-targets@^5.0.0

# Scaffold the ActivityKit widget-extension target (interactive, run once)
npx create-target widget

# Regenerate the iOS project with the target wired in
npx expo prebuild -p ios --clean

# Hand-written native bridge module (Swift, in-repo)
npx create-expo-module --local live-activity
```

No Nitro/third-party ActivityKit package is installed by default — see rationale above and Alternatives below.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Hand-written Expo Module for the ActivityKit bridge | `@kingstinct/react-native-activity-kit@0.0.10` (Nitro Modules, peer `react-native>=0.81`, `react>=19.1.0` — both satisfied by SDK 54) | If you want a faster start and are willing to prototype interactive buttons yourself on top of it — it exposes `Activity` lifecycle calls but its README does **not** document `LiveActivityIntent`/App-Group-free interactivity, so you'd still be writing that part by hand. At version `0.0.10` it is pre-1.0 and a small team; fine for a personal app, riskier if this ever needs to be relied on unattended. |
| `@bacons/apple-targets` | `@kingstinct/expo-apple-targets` (community fork) or `@niondigital/widgets-expo-config-plugin` (adds SPM-package support to the widget target) | Reach for the `niondigital` plugin only if the widget extension needs a Swift Package Manager dependency (e.g. a charting library) that `@bacons/apple-targets` doesn't handle — not needed for this milestone's scope. |
| Local-only `Activity.request(..., pushType: .none)` | Push-to-start / ActivityKit push updates via APNs | Never on the free personal team — push-based Live Activity updates require `com.apple.developer.usernotifications.time-sensitive`/push entitlements that are Developer-Program-gated. Already vetoed in `PROJECT.md`. |
| `expo-audio` for background audio | `react-native-track-player` | Only if the hands-free mode grows into a full "audio player with lock-screen transport controls" (play/pause/skip on the Lock Screen media widget, not the workout's own Live Activity) — out of scope here since the Live Activity itself *is* the lock-screen surface. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `expo-widgets` (official, `expo/expo` monorepo, currently alpha) | Two disqualifying facts, both verified: (1) its first `dist-tag` is `sdk-55` — it does not exist for SDK 54, the app's current SDK, so adopting it means an SDK bump that's explicitly out of scope for this milestone; (2) its own docs say App Groups are "required for widgets to work properly" and it auto-provisions them — exactly the entitlement the free personal team cannot get. Revisit this package once the project is on SDK 55+ **and** either pays for a Developer account or Apple relaxes the App Groups restriction for personal teams (neither is true today). | `@bacons/apple-targets` + hand-written Expo Module, as recommended above. |
| `expo-live-activity` (Software Mansion) | Archived/deprecated by its own maintainers as of 2026-06-01; the repository is explicitly read-only and its README redirects to `expo-widgets` — which is itself disqualified above. | `@bacons/apple-targets` + hand-written Expo Module. |
| Any App Group / shared `UserDefaults(suiteName:)` / shared container between app and widget-extension target | Not provisionable on a free personal team; this is the #1 way this milestone silently turns into "needs $99/year." | `LiveActivityIntent` (perform() runs in-process in the main app) for button actions; direct `Activity.update()` calls from the main app for content refresh — neither needs shared storage. |
| Push-based Live Activity updates / push-to-start / any APNs entitlement | Explicitly vetoed in `PROJECT.md` for the free-team constraint; also gated behind Developer Program entitlements the personal team cannot request. | Local-only `Activity.request(pushType: .none)`, updated directly from the app while it's foregrounded/backgrounded-with-audio-session-alive. |
| `expo-av` for new background-audio work | Expo's own docs mark it legacy/frozen in favor of `expo-audio`; it will not receive the newer background-session APIs. | `expo-audio` (`~1.1.1`, SDK 54-pinned). |
| Disabling the New Architecture to "simplify" things | SDK 54 is the *last* SDK where New Arch can even be turned off, and it's already the default; the New-Arch-only packages evaluated above (Nitro-based `@kingstinct/react-native-activity-kit`) would stop being an option, and SDK 55+ removes the toggle entirely, so any config drift here is a dead end. | Leave `newArchEnabled` unset / default (confirmed default-on for SDK 54 in this repo — `app.json` has no override). |

## Stack Patterns by Variant

**Before writing any Swift for the interactive Live Activity:**
- Build the smallest possible skeleton first — a static (non-interactive) Live Activity target scaffolded by `@bacons/apple-targets`, with no App Groups entitlement declared anywhere, signed to the device with the personal team.
- If Xcode's "Signing & Capabilities" pane shows the widget-extension target signs cleanly with **zero** capabilities beyond the default, the no-App-Groups architecture is confirmed viable end to end before a line of ActivityKit/App Intents code is written.
- Only after that smoke test succeeds, add `ActivityKit`/`SwiftUI` frameworks, the `NSSupportsLiveActivities` Info.plist key, and then the `LiveActivityIntent`-based buttons.

**If the 7-day personal-team provisioning expiry makes daily re-signing painful:**
- Automate `expo prebuild` + `xcodebuild -allowProvisioningUpdates` + install-to-device as a single documented script (already flagged as a needed "rotina de reassinatura semanal" in `PROJECT.md`) — this is a workflow/tooling concern, not a stack choice, but it directly affects how often the Live Activity target needs re-signing since extension targets re-sign along with the app.

**If interactive buttons in the Dynamic Island / Lock Screen turn out to need data the app hasn't loaded yet (cold start):**
- Keep the `ContentState` (`ActivityAttributes.ContentState`) self-sufficient — encode everything the widget needs to render (current exercise name, set index, rest seconds remaining) directly in the pushed content rather than expecting the widget to reach back into app state, since there is no App Group to reach through anyway.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `expo@^54.0.36` | `react-native@0.81.x`, `react@19.1.x` | Confirmed via Expo's SDK 54 changelog: "React Native 0.81 + React 19.1." Matches this repo's existing pin. |
| `@bacons/apple-targets@^5.0.0` | `expo>=52` (peer dep) | No SDK-54-specific dist-tag exists for this package — it's not part of the Expo-maintained `bundledNativeModules` set — but the peer range and multiple 2026 tutorials confirm SDK 54/55 usage. Requires CocoaPods 1.16.2+, Xcode 16+ (Xcode 26 exceeds this). |
| `expo-notifications@~0.32.17`, `expo-speech@~14.0.8`, `expo-audio@~1.1.1`, `expo-build-properties@~1.0.10` | `expo@54.0.36` | These exact versions are the ones Expo's own `bundledNativeModules.json` (`sdk-54` branch) pins — installing via `npx expo install <pkg>` inside this repo will resolve to these automatically; hand-pinning avoids a silent SDK-55 drift from `npm install <pkg>@latest`. |
| `@kingstinct/react-native-activity-kit@0.0.10` (if adopted instead of the hand-written module) | `react-native>=0.81`, `react>=19.1.0`, `react-native-nitro-modules>=0.29.4` | Requires the New Architecture (Nitro Modules only run on Fabric/TurboModules) — satisfied by SDK 54's default-on New Arch in this repo, but would be a **hard blocker** if this project ever disables New Arch. |
| Widget-extension target (any variant) | iOS 16.1+ floor (Dynamic Island), iOS 17.0+ floor (interactive buttons via App Intents) | Device is confirmed on iOS 26.x in `PROJECT.md`, well above both floors — no runtime gating needed, but the extension target's own deployment-target build setting (via `expo-build-properties`) must not be left at the app's older default if one exists. |

## Sources

- npm registry (`registry.npmjs.org`) — direct version/peerDependency queries for `@bacons/apple-targets`, `expo`, `expo-notifications`, `expo-speech`, `expo-audio`, `react-native-widget-extension`, `@kingstinct/react-native-activity-kit`, `react-native-activitykit`, `react-native-live-activities`, `react-native-nitro-modules`, `expo-widgets`, `expo-build-properties` — HIGH confidence (primary registry).
- Expo `bundledNativeModules.json` for the `sdk-54` branch (`raw.githubusercontent.com/expo/expo/sdk-54/...`) — HIGH confidence (authoritative source for what `npx expo install` resolves to on SDK 54).
- [Expo Apple Targets docs (Mintlify mirror)](https://evanbacon-expo-apple-targets.mintlify.app/introduction) and [EvanBacon/expo-apple-targets GitHub](https://github.com/EvanBacon/expo-apple-targets) — MEDIUM-HIGH confidence (project docs, cross-checked with README).
- [software-mansion-labs/expo-live-activity](https://github.com/software-mansion-labs/expo-live-activity) — confirms archived/deprecated status.
- [expo-widgets on npm](https://www.npmjs.com/package/expo-widgets) and [Expo Widgets docs](https://docs.expo.dev/versions/latest/sdk/widgets/) — confirms alpha status, SDK-55+ floor, mandatory App Groups.
- Multiple Apple Developer Forums threads and community write-ups on Personal Team limitations (App Groups restriction, 7-day/10-App-ID/3-device limits) and on `LiveActivityIntent` running `perform()` in the app's process — MEDIUM confidence individually, treated as HIGH where 3+ independent threads agreed (App Groups restriction; local-only Live Activity needing no entitlement; `LiveActivityIntent` in-app-process execution).
- Expo SDK 54 changelog (`expo.dev/changelog/sdk-54`) and related community write-ups — confirms React Native 0.81, React 19.1, New Architecture default-on.
- This repo's `package.json` / `app.json` — confirms current `expo@^54.0.36` pin and absence of a `newArchEnabled` override (default-on).

---
*Stack research for: iOS native Live Activity / interactive lock-screen workout companion (v1.3 milestone), on top of an existing Expo SDK 54 / RN 0.81 PWA app*
*Researched: 2026-08-15*
