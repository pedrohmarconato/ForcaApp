# Pitfalls Research

**Domain:** Adding native iOS (free-sideload + interactive Live Activity + background audio) to an existing Expo SDK 54 / RN 0.81 (New Architecture) app
**Researched:** 2026-08-15
**Confidence:** MEDIUM (cross-checked across multiple independent web sources — Apple Developer Forums, Expo/community docs, blog post-mortems; no Context7/official-doc-server access in this session, no direct Apple sample-code verification. Treat exact numeric limits — 3 apps, 10 App IDs/7 days, 4KB payload — as "verify against Apple's current membership page at implementation time," not as frozen facts.)

## Critical Pitfalls

### Pitfall 1: `expo prebuild --clean` deletes the widget/Live Activity Xcode target

**What goes wrong:**
Adding the widget extension target by hand in Xcode (File → New → Target → Widget Extension) works the first time. The next `expo prebuild --clean` — which CNG runs routinely, and which will run again every week when you re-sign the free 7-day build — regenerates `ios/` from scratch and silently wipes the manually-added target, its entitlements, its App Group membership, and any Info.plist/Swift files that live outside the tracked config. The app builds "successfully" with no widget, no Live Activity, no error.

**Why it happens:**
CNG treats `ios/` and `android/` as fully disposable, generated output. Anything not expressed through `app.json`/`app.config.js` + config plugins is definitionally not part of the source of truth and gets erased on the next clean generation — this is by design, not a bug, and it is easy to forget when you're used to `expo prebuild` (no `--clean`) merging changes gently.

**How to avoid:**
Use `@bacons/apple-targets` (a.k.a. `expo-apple-targets`) — the config plugin built specifically to define Xcode targets (widget/Live Activity, App Clip, share extension, etc.) declaratively. Put the widget's Swift/SwiftUI source and `expo-target.config.js` inside a `targets/widget/` folder at the project root (outside `ios/`), reference it from `app.json` via the plugin, and let every `prebuild --clean` regenerate the target from that folder. Requires Expo SDK 53+, Xcode 16+, CocoaPods ≥1.16.2 — confirm these floors are met (SDK 54 / RN 0.81 already satisfies this). Never hand-edit the generated `ios/*.xcodeproj` for anything that must survive a clean prebuild.

**Warning signs:**
Widget/Live Activity works right after you added it in Xcode, then mysteriously "disappears" after an unrelated `npx expo prebuild --clean` or a fresh `eas build`/local build. Git diff of `ios/` shows the target's `.pbxproj` entries vanished.

**Phase to address:**
Fase de esqueleto nativo (build + assinatura) — must be the very first decision, before any widget/Live Activity code is written, because retrofitting apple-targets onto a manually-created target later means redoing the target from scratch.

---

### Pitfall 2: Interactive button's App Intent runs in the widget-extension process, not the RN app process — no JS bridge there

**What goes wrong:**
iOS 17+ Live Activity buttons must use `Button(_:intent:)` / `Toggle(_:isOn:intent:)` bound to a type conforming to `LiveActivityIntent`. When the user taps "concluir série" on the lock screen, iOS runs that intent's `perform()` **inside the WidgetKit extension process**, completely separate from the React Native app process — even if the app is fully suspended or not running. There is no React Native JS engine, no Metro bridge, and no access to the app's in-memory state inside that process. Any attempt to "just call into the RN business logic" from the intent fails silently or doesn't compile — the extension target cannot host the RN runtime.

**Why it happens:**
This is the same sandboxing that makes today's-app-store widgets safe and cheap: extensions are lightweight, short-lived processes iOS can spin up and kill freely. Developers coming from an all-JS RN mental model assume "the app" is one runtime; iOS treats app and each extension as separate binaries that only share a filesystem/UserDefaults surface via App Groups — never live memory or a JS thread.

**How to avoid:**
- Design the intent's `perform()` to do the **minimum native Swift work**: mutate a small shared state blob (current set index, reps/carga just confirmed, rest-end timestamp) written to `UserDefaults(suiteName: <App Group ID>)` or a JSON file in the shared container, then call `Activity<Attributes>.update(...)` (or `.end`) directly from the extension to refresh the Live Activity's own UI immediately.
- The RN app reads that same shared state on next foreground (or via a native module using `NSFileCoordinator`/Darwin notifications for near-real-time sync) and reconciles it into Redux/whatever state store on resume — it does not need to "receive" the tap live, only to reconcile eventually.
- The intent type itself must be visible to **both** the main app target and the widget extension target (shared Swift file or a small local Swift package) — if it's only in one target, the other silently no-ops or the button does nothing.
- Any rest-timer math, "which exercise is next," or history-based reps/carga pre-fill logic used by the button must be duplicated in plain Swift (no RN, no JS) inside the extension, reading from the same shared App Group data the RN app already wrote before the phone was locked.

**Warning signs:**
Button taps on the lock screen appear to do nothing, or update the Live Activity's own text but the in-app session state is wrong/stale next time you open the app. Xcode console for the widget extension (not the app!) shows the intent actually firing — easy to miss because you're watching the wrong process's logs.

**Phase to address:**
Fase de Live Activity interativa — this is the architectural decision that must be made before writing the "registro sem teclado" screens, because it determines the shared-state contract (App Group schema) both the RN screens and the native intent read/write.

---

### Pitfall 3: App Groups on a free personal team — verify early, don't assume from old blog posts

**What goes wrong:**
Historically (roughly Xcode 11–13 era), Apple restricted the App Groups capability to paid Apple Developer Program accounts, and a lot of still-indexed blog posts and Stack Overflow answers from that period say "App Groups requires a paid account." Current community reports (2024-2025) and the Apple Developer Help pages describe App Groups as available to a free "Personal Team," but this has genuinely shifted over the years, some capabilities remain paid-only (push/`aps-environment`, iCloud, Sign in with Apple, some HealthKit background modes), and Xcode occasionally hides capabilities from the menu for personal teams inconsistently across versions (reported for Family Controls, for example). Trusting stale documentation here either wastes a day chasing a phantom limitation or — worse — you build the whole shared-state architecture (Pitfall 2) around App Groups and discover late that Xcode 26 + your specific personal team configuration rejects the entitlement.

**Why it happens:**
Apple doesn't publish a versioned changelog of "which entitlements personal teams get"; the information only exists scattered across forum threads and blog posts with no dates that survive search-engine snippet extraction, so both AI research and casual googling surface contradictory, undated claims.

**How to avoid:**
Do a 30-minute spike in the skeleton phase, before any real feature code: create the widget target via apple-targets, add the App Groups capability + a shared group ID to both targets, build and run on the physical device with the personal team selected, and read/write a trivial value through the shared `UserDefaults(suiteName:)` from both the app and the widget. If it works, proceed. If Xcode complains ("cannot create App Group container" or the capability doesn't appear for a personal team), decide immediately whether to pay for Apple Developer Program (US$99/yr — already declined twice per PROJECT.md) or fall back to a degraded architecture (e.g., app-only Live Activity updates with no button-triggered state sync, relying only on `Activity.update` from the foreground app before locking).

**Warning signs:**
"Failed to create provisioning profile" or "App Groups entitlement is not supported for this membership" errors during signing; App Group container reads returning nil in the widget extension despite writing successfully from the app (or vice versa) — this pattern also matches an entitlement/App Group ID mismatch, not just a permissions denial, so double-check the ID string matches exactly (including the `group.` prefix convention) before concluding it's an account-tier block.

**Phase to address:**
Fase de esqueleto nativo (build + assinatura) — spike this on day one; it's the single fact that determines whether the whole interactive-Live-Activity architecture (Pitfall 2) is even viable under the free account.

---

### Pitfall 4: No `aps-environment` on a personal team — architecture must be 100% local, not "push with a local fallback"

**What goes wrong:**
Push notifications (APNs) require the `aps-environment` entitlement, which Apple does not grant to free/personal-team provisioning profiles. This is already correctly decided in PROJECT.md ("push nativo vetado no regime gratuito"), but the risk is in *implementation*, not in the decision: if any dependency (an RN push library, a Live-Activity helper package, or a tutorial you're following) silently declares `Push Notifications` capability or references `aps-environment` in the generated entitlements file, the build will fail to sign at all — not "push just won't work," but the whole app becomes unsignable, because a free personal-team provisioning profile cannot include an entitlement it isn't allowed to have.

**Why it happens:**
Most Live Activity tutorials online assume a paid account and default to push-driven updates (ActivityKit push updates via APNs) because that's the "proper" production pattern; copy-pasting that architecture (or a library that assumes it) drags `aps-environment` into the entitlements file even when you never intend to send a push.

**How to avoid:**
Explicitly confirm the generated `ios/*/*.entitlements` files (app target and widget target) contain no `aps-environment` key. All Live Activity content updates must be **local**: triggered by the foreground/backgrounded-but-alive RN app calling into a native module that calls `Activity.update(...)`, or triggered by the widget extension's own intent handler (Pitfall 2). Do not add any RN push library (`expo-notifications`'s push-token flow, Firebase Messaging, etc.) to the same build target set — local notifications (already used for "fim de descanso audível") are unaffected since they use `UNUserNotificationCenter`, not APNs, and require no special entitlement.

**Warning signs:**
Code-signing fails with an entitlements-mismatch error naming `aps-environment` or "Push Notifications" even though you never intended to add it — check `Signing & Capabilities` for both the app and widget target for an accidentally-enabled Push Notifications capability (Xcode sometimes suggests adding it "for you" when adding related capabilities).

**Phase to address:**
Fase de esqueleto nativo (build + assinatura) — verify absence of the entitlement as part of the first successful signed build; re-check whenever a new library is added in later phases.

---

### Pitfall 5: 7-day expiry + 10 App-IDs/week quota interact badly with iterative development

**What goes wrong:**
A free provisioning profile expires after 7 days; the app simply stops launching until re-signed/re-run from Xcode. Separately (and this is the trap), Apple's free membership caps you at roughly 10 new App ID registrations per rolling 7-day window and ~3 apps installed at once on a device. Every distinct bundle identifier — the main app AND the widget extension each need their own App ID, so a Live Activity feature alone consumes 2 of the 10 weekly slots the first time you register it. If, during active development, you rename the bundle identifier, the app slug, or the widget's target name (common when iterating on `expo-target.config.js` or troubleshooting Pitfall 1/3), each rename registers a *new* App ID and burns quota. Combined with the weekly re-signing ritual this project already plans for, a bad week of experimentation can hit the 10-ID cap and lock you out of registering the actual final IDs until the window rolls over.

**Why it happens:**
The 10-App-ID/week and 3-apps-on-device limits exist to stop free accounts from being used as an informal app-distribution channel; they weren't designed with "single developer iterating on their own widget target name" in mind, and nothing in Xcode warns you're approaching the cap until the registration call fails.

**How to avoid:**
Lock the bundle identifier and the widget target's bundle identifier (`<main>.widget` convention) and the App Group ID early (end of Pitfall 3's spike) and treat renaming any of them as a deliberate, logged decision, not a casual retry. Prefer fixing config-plugin bugs over renaming targets to "start fresh." Track how many App IDs you've registered this week if doing heavy signing/target experimentation. The recurring weekly re-sign (needed regardless, for the 7-day expiry) does **not** by itself consume a new App ID if the bundle identifiers are unchanged — only genuinely new/renamed identifiers do.

**Warning signs:**
"Maximum number of App IDs reached" or similar quota errors from Xcode/App Store Connect during automatic signing; each occurrence should immediately raise the question "did I rename something today."

**Phase to address:**
Fase de esqueleto nativo (build + assinatura) — decide and freeze identifiers in this phase before Live Activity/audio work begins; document the weekly re-sign runbook (already an "O que existe agora" item per PROJECT.md) to explicitly say "do not rename bundle IDs during re-sign."

---

### Pitfall 6: Live Activity outlives a force-quit or a crashed session — stale "Set 2/4" forever

**What goes wrong:**
Force-quitting the RN app (swipe-up in the app switcher) does **not** end the Live Activity. The activity keeps rendering its last-known state on the Lock Screen/Dynamic Island indefinitely, governed only by the system's own staleness rules, until something explicitly calls `.end()` or the OS decides it's stale enough to auto-dismiss. For a workout session tracker this means: user finishes set 2 of 4, force-quits the app (or the app crashes, or the phone reboots mid-workout), and the Live Activity keeps showing "Série 2/4" — potentially for hours — with tappable buttons that reference a session that, from the RN app's point of view, no longer exists or was abandoned.

**Why it happens:**
Live Activities are explicitly designed to survive app termination (that's the point — think Uber's ride tracker outliving a backgrounded app); the "state machine, not a badge" mental model isn't the default assumption for developers used to RN app lifecycle where killing the app means killing all UI.

**How to avoid:**
- Always set a `staleDate` on `ActivityContent` reflecting a sane bound for the current phase (e.g., current set's expected max duration + generous buffer, or rest-timer end + a few minutes); when content goes stale, present a clearly "paused/stopped" visual state rather than frozen numbers, and treat further button taps defensively (if the intent can't find valid shared session state, it should end the activity rather than silently no-op).
- On app relaunch, always reconcile: if a Live Activity exists but the RN app's own persisted session state says the session already ended or was abandoned, explicitly call `.end(dismissalPolicy:)` for any orphaned activities before starting a new one.
- Decide and hardcode a maximum session Live Activity lifetime (e.g., end automatically after N hours) as a backstop independent of staleness.

**Warning signs:**
QA scenario "force-quit mid-set, wait an hour, look at lock screen" still shows old data with live-looking buttons; opening the app afterward doesn't clean up the still-visible activity.

**Phase to address:**
Fase de Live Activity interativa — the reconciliation-on-launch and staleDate logic should ship with the very first version of the interactive activity, not be added after the fact.

---

### Pitfall 7: Manual per-second `Activity.update()` calls for the rest timer instead of `Text(timerInterval:)`

**What goes wrong:**
The natural instinct for a countdown "rest timer" is to fire an update every second (or every 0.2–0.5s for smooth animation) from a `Timer` in the app or extension, calling `Activity.update(...)` each tick. This hammers the extension/app process, burns battery, and the system will start silently dropping/throttling updates for performance reasons — the countdown visibly stutters or lags on the lock screen, exactly the opposite of the "operate the whole session from the lock screen" goal.

**Why it happens:**
This is the obvious naive implementation, and it's what most non-Live-Activity countdown UI code in RN already looks like (a `setInterval` ticking React state), so it's an easy pattern to carry over without realizing ActivityKit has a purpose-built primitive for this.

**How to avoid:**
Use `Text(timerInterval: start...end, countsDown: true)` (or the progress-view equivalent) inside the widget's SwiftUI view. This delegates the actual per-second ticking to the system/SwiftUI rendering layer — you push exactly one update when the rest period starts (with the interval's start/end dates) and one when it's skipped/ends early; no per-second calls at all. If truly continuous, sub-second precision is needed for something else, be aware Apple's own guidance is "every ~15 seconds" even with `NSSupportsLiveActivitiesFrequentUpdates` enabled — do not attempt tighter loops.

**Warning signs:**
Battery drain complaints during workouts; visible stutter/rubber-banding of the rest countdown; Console.app logs showing update requests being coalesced or dropped.

**Phase to address:**
Fase de Live Activity interativa.

---

### Pitfall 8: Background audio session fights the user's Spotify instead of coexisting with it

**What goes wrong:**
The owner explicitly listens to Spotify while training. If the workout app's background audio session uses `AVAudioSessionCategoryPlayback` with no mix option (the "just make audio survive backgrounding/lock" default most tutorials show), activating that session on each spoken cue will **fully interrupt and stop Spotify** — the user has to manually resume Spotify after every rep-count cue, making the "hands-free" feature actively hostile. Conversely, using `.mixWithOthers` naively plays the spoken cue *simultaneously* at full volume on top of the music with no ducking, so the cue is inaudible/garbled under the music — also useless.

**Why it happens:**
"Background audio" tutorials optimize for apps that *are* the primary audio source (podcast/music players); a fitness-cue app is a secondary, intermittent audio source layered on top of whatever the user is already playing, which is a less commonly documented pattern.

**How to avoid:**
Configure `AVAudioSession` with category `.playback`, mode `.spokenAudio` (or `.voicePrompt`-appropriate mode), and option `.duckOthers` (do **not** use `.mixWithOthers` alone for the spoken cues). `.duckOthers` automatically lowers Spotify's volume while the cue plays and restores it afterward — this is the standard "voice prompt over music" pattern (same one navigation apps use for turn-by-turn directions over music) and matches the coexistence requirement exactly. Keep the session active/backgrounded only long enough to survive the workout (activate once at session start, deactivate at session end) rather than toggling the category per-cue, since repeated activate/deactivate cycles are what cause audible "blips" in the other app's audio.

**Warning signs:**
Spotify pauses/stops entirely when a rep-count cue plays (wrong category/no duck) instead of just dipping in volume; or the cue is present but drowned out by music at normal training volume (using `.mixWithOthers` without ducking).

**Phase to address:**
Fase de áudio em background — this is the single most important line of code in that phase; get the category/mode/options combination right before building any cue-scheduling logic on top of it.

---

### Pitfall 9: iOS still suspends the app during long silent gaps between cues

**What goes wrong:**
Declaring `UIBackgroundModes: audio` and keeping an `AVAudioSession` active is necessary but not always sufficient. Apple's guideline (2.5.4, and the underlying system behavior) expects apps with the audio background mode to be *actually playing audible content*; genuinely silent multi-minute gaps (a long rest period with no spoken cue and no active audio track) can lead the system to treat the session as inactive and suspend the process anyway, which would kill the ability to fire the next scheduled cue or keep the Live Activity's own app-side updates flowing. Since this app is sideloaded (no App Store review), the App Store guideline itself is moot, but the *underlying OS behavior* it's meant to police is not moot — the system-level suspension risk is real regardless of review policy.

**Why it happens:**
The background-audio exemption is meant for continuous playback (music, podcasts); an app that's silent for 90% of the time and only speaks for 2 seconds every few minutes looks, from the system's perspective, closer to "an app abusing the audio background mode as a generic keep-alive," and iOS's power-management heuristics are not fully documented/predictable here.

**How to avoid:**
Rely primarily on the Live Activity itself (which the system keeps alive independent of app process state, per Pitfall 6) for the visual/state side of "hands-free," and treat the spoken-audio background mode as best-effort rather than guaranteed: schedule cues as local notifications with sound (already planned per PROJECT.md's "fim de descanso audível") as the reliable fallback delivery mechanism, with the live spoken-audio session as an enhancement layered on top when the process does stay alive. If genuine continuous "keep-alive" is required, consider a very low-volume ambient loop during active sets (not during rest, to avoid unnecessary Spotify ducking) rather than pure silence — but treat this as a mitigation to test empirically on the actual device/iOS version, not a guaranteed fix.

**Warning signs:**
Spoken cues fire reliably in short tests (rest < 1 min) but become unreliable or stop firing entirely for longer rest periods (2-3+ min) during real workouts, especially with the screen off.

**Phase to address:**
Fase de áudio em background — build the local-notification fallback first (cheap, reliable), then layer live spoken audio as enhancement; verify empirically with real multi-minute rest periods, not just short dev-loop tests.

---

### Pitfall 10: Expo-Modules Swift code assumes the New Architecture is opt-in when it's now closer to mandatory

**What goes wrong:**
SDK 54 (RN 0.81) is Expo's last release supporting the Legacy Architecture as an option; RN 0.82 removes the ability to opt out entirely. Any native module written for this milestone (a Swift Expo Module wrapping ActivityKit calls, or wrapping AVAudioSession control) should be written and tested against the New Architecture from the start — writing it against Legacy Architecture assumptions (e.g., relying on the old bridge's synchronous method calls, or Objective-C-style bridging patterns for exposing events) creates rework risk when the app inevitably needs to track RN/Expo upgrades, and some community RN libraries for Live Activities are not yet confirmed compatible with New Architecture + RN 0.81 — check GitHub issues/compat notes for any third-party Live Activity library before adopting it rather than assuming it "just works" because it worked under Legacy Architecture elsewhere.

**Why it happens:**
A lot of existing tutorial code and community packages for "React Native Live Activities" predate the New-Architecture-by-default transition and were written/tested under the old bridge.

**How to avoid:**
Write the native bridging code as a proper Expo Module (Swift, using the Expo Modules API — `ExpoModulesCore`), which is explicitly designed to be New-Architecture-native and JSI-based, rather than reaching for an older-style native module pattern. If evaluating a third-party RN Live Activity package instead of hand-rolling, verify recent commits/issues reference RN 0.81/New Architecture explicitly before depending on it; prefer hand-rolling a small Expo Module over adopting an unmaintained wrapper given how thin the actual Swift surface area needed here is (start/update/end an Activity, read/write the shared App Group blob).

**Warning signs:**
Native module builds but methods silently fail or return undefined on the JS side; crashes specifically tied to bridging generic Swift types (like `Activity<Attributes>`, which itself can't cross an Objective-C bridge directly and needs an Expo Module / Swift-native wrapper rather than a classic `RCT_EXPORT_METHOD` approach).

**Phase to address:**
Fase de Live Activity interativa (module authored here) — but the decision (Expo Modules API, not legacy bridge) should be locked in Fase de esqueleto nativo when the project's native-module conventions are set.

---

### Pitfall 11: Xcode 26 first-build friction is mistaken for a project bug

**What goes wrong:**
Several one-time setup steps trip up a first native build on a machine that just installed Xcode 26, and each produces a confusing error that looks project-specific:
- **License not accepted:** builds/signing fail with opaque errors (sometimes manifesting as provisioning-profile errors, not an explicit "accept license" message) until `sudo xcodebuild -license accept` (or opening Xcode once and clicking through the GUI prompt) is run.
- **Simulator runtimes not bundled:** Xcode 26 doesn't ship all simulator runtimes pre-installed; "no simulators available" on first run requires downloading a runtime via Xcode's Platforms settings before `expo run:ios` can target a simulator (device-only testing sidesteps this).
- **Signing certificate/personal team setup:** each target (app AND widget extension) needs "Automatically manage signing" checked with the personal team explicitly selected — Expo's own iOS build tooling may not auto-select this for a manually-added or config-plugin-added target the same way it does for the main app target; missing this on the widget target specifically produces a build failure that looks like a widget/Live Activity bug but is really a signing omission.
- **Developer Mode on device:** a freshly-signed dev build installed on a physical iPhone won't launch until Developer Mode is enabled (Settings → Privacy & Security → Developer Mode → toggle → restart) — first install attempt typically fails/hangs with no obvious message pointing at this setting.

**Why it happens:**
These are one-time, easy-to-forget setup steps that don't recur once done, so they're underdocumented relative to how often they trip up a *first* build on a *new* machine/Xcode version — and this project's context notes Xcode was only just installed with the license still pending (per PROJECT.md's "Contexto de contorno").

**How to avoid:**
Treat first-build setup as an explicit checklist item at the start of the skeleton phase, not something to debug reactively: accept the license, open Xcode once and let it finish "installing components," download at least one simulator runtime, do a plain `expo run:ios --device` (skip simulator) as the very first smoke test since it's often more reliable than fighting simulator setup, enable Developer Mode on the physical device proactively before the first install attempt, and explicitly verify "Automatically manage signing" + team selection on both the app target and the widget extension target (the second one is the one people forget).

**Warning signs:**
Errors that don't mention the actual root cause by name (provisioning-profile errors caused by an unaccepted license; "app not installed" with no further detail caused by Developer Mode being off).

**Phase to address:**
Fase de esqueleto nativo (build + assinatura) — this is the very first phase's first task, before any feature code.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Hand-editing `ios/` Xcode project instead of apple-targets config plugin | Faster to prototype a widget target once | Silently wiped on next `prebuild --clean`; rework compounds every re-sign cycle | Never past a throwaway spike (Pitfall 3's 30-minute test) |
| Skipping `staleDate`/reconciliation logic for Live Activity (Pitfall 6) | Ships interactive buttons sooner | Stale/orphaned activities confuse the user and erode trust in the "operate from lock screen" feature | Never for this milestone — reconciliation is core to the value prop, not a nice-to-have |
| Per-second manual `Activity.update()` instead of `Text(timerInterval:)` | Simpler mental model, looks correct in a 10-second dev test | Throttled/dropped updates + battery complaints only show up in real ~60-90s rest periods | Never — use `timerInterval` from the first implementation |
| Full silence during rest instead of a `.duckOthers`-aware ambient tone | Simpler audio session logic | Risk of iOS suspending background audio process during multi-minute gaps (Pitfall 9) | Acceptable to ship without it initially IF local-notification fallback for the "fim de descanso" sound is solid; revisit only if real-device testing shows unreliable cue delivery |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|--------------------|
| Expo CNG / apple-targets | Editing generated `ios/` directly for the widget target | Author target in `targets/<name>/expo-target.config.js`, let `prebuild --clean` regenerate it every time |
| App Group shared state | Assuming the app process can be "called into" from the widget extension | Treat App Group `UserDefaults`/file container as the only channel; reconcile on next app foreground, don't expect live IPC |
| AVAudioSession + Spotify | Using default `.playback` category with no mix option, or bare `.mixWithOthers` | `.playback` + `.spokenAudio` mode + `.duckOthers` option specifically |
| Live Activity + APNs libraries/tutorials | Copying a push-driven update architecture from a paid-account tutorial | Confirm no `aps-environment` entitlement leaks in; keep all updates local (foreground app or extension-triggered) |
| RN Live Activity community packages | Assuming an existing wrapper is New-Architecture/RN-0.81-safe because it's popular | Check the package's recent issues/commits for explicit New Architecture support before adopting; prefer a small hand-rolled Expo Module given the thin native surface actually needed |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Manual per-second Live Activity updates | Stutter/lag in lock-screen countdown, battery drain | `Text(timerInterval:)` for any countdown | Immediately in any real (not 10s-demo) rest period |
| Re-activating/deactivating `AVAudioSession` around every single cue | Audible "blips"/stutters in Spotify playback each time a cue fires | Activate once per session, deactivate once at session end; rely on `.duckOthers` for per-cue ducking instead of session churn | Any session with more than a handful of cues |
| Renaming bundle IDs/target names during iterative debugging | Burns weekly App-ID quota, eventually blocks signing entirely | Freeze identifiers early (Pitfall 5); treat renames as deliberate | Within a single week of heavy experimentation |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing more than the minimal session state in the shared App Group container (e.g., auth tokens, full plan JSON) | Widget extension process is a smaller, less-controlled surface; unnecessary exposure of sensitive data to it | Keep the App Group payload to the minimal fields the intent/widget UI actually needs (current set index, reps/carga, timestamps) — not a full data dump |
| Leaving `aps-environment`/Push Notifications capability toggled on "just in case" | Breaks signing under the free personal team (Pitfall 4); also needless capability surface | Explicitly verify entitlements files contain no push-related keys |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Live Activity shows stale data after a force-quit or crash (Pitfall 6) | User glances at lock screen mid-shower/mid-drive, sees wrong set number, loses trust in the feature | Staleness bound + reconcile-on-launch cleanup of orphaned activities |
| Spoken cue fully interrupts Spotify (Pitfall 8) | User has to manually resume music constantly — the opposite of "hands-free" | `.duckOthers`, not plain `.playback` or `.mixWithOthers` |
| Rest-timer countdown lags/stutters (Pitfall 7) | Feels broken/janky exactly at the moment the phone is supposed to be untouched | `Text(timerInterval:)` |
| No feedback when a lock-screen button tap "does nothing" because the shared-state contract wasn't wired (Pitfall 2) | User taps "concluir série" repeatedly, nothing visibly happens, gives up and unlocks phone anyway — defeats the milestone's whole goal | Always give the Live Activity itself immediate visual feedback from within the extension's own `Activity.update` call, independent of whether the main app ever wakes up |

## "Looks Done But Isn't" Checklist

- [ ] **Widget/Live Activity target survives a clean rebuild:** run `npx expo prebuild --clean` after the target is set up and confirm the widget still builds and runs — don't just test right after manually adding it in Xcode.
- [ ] **App Group actually round-trips data:** write from the app, read from the widget extension, AND write from the widget extension, read from the app — test both directions, not just one.
- [ ] **Entitlements are push-free:** open both the app's and widget's generated `.entitlements` file and confirm no `aps-environment` key, even if the build "succeeds."
- [ ] **Live Activity survives force-quit correctly:** force-quit mid-session, wait past the staleness window, verify the activity either shows an honest "paused" state or is dismissed — not frozen mid-session data.
- [ ] **Spotify coexistence tested on a real device with Spotify actually playing:** a cue firing in a silent Simulator environment proves nothing about ducking behavior — verify on the physical iPhone with Spotify audibly playing.
- [ ] **Rest timer tested for a real rest duration (60-180s), not a 10-second dev loop:** throttling/staleness issues only surface at realistic durations.
- [ ] **Signing verified on the widget target specifically, not just the main app target:** "Automatically manage signing" + personal team must be confirmed per-target in Xcode's Signing & Capabilities pane.
- [ ] **Weekly re-sign runbook tested at least once for real:** don't assume the documented rotation works until it's been exercised past a real 7-day expiry.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| Widget target wiped by `prebuild --clean` (Pitfall 1) | LOW (if apple-targets was used correctly elsewhere) / HIGH (if hand-edited) | If using apple-targets: re-run prebuild, target regenerates automatically. If hand-edited: migrate the Swift/config to `targets/` folder and apple-targets config plugin, then re-add |
| App Group unavailable on personal team (Pitfall 3) | HIGH | Fall back to app-only Live Activity updates (no interactive-button state sync); revisit paid Apple Developer Program decision with the owner |
| Hit the 10-App-ID/week cap (Pitfall 5) | MEDIUM | Wait out the rolling 7-day window; in the meantime, continue development against the existing registered IDs without renaming anything |
| Orphaned stale Live Activities in production use (Pitfall 6) | LOW | Add reconcile-on-launch logic (end any activity not matching current persisted session state) — retrofit is straightforward, just delayed |
| Audio session interrupting Spotify in already-shipped build (Pitfall 8) | LOW | Single-line category/option fix (`.duckOthers`), redeploy on next weekly re-sign cycle |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|----------------|
| `prebuild --clean` wipes manual targets | Fase de esqueleto nativo | Widget still present/functional after a deliberate `--clean` rebuild |
| App Groups on personal team | Fase de esqueleto nativo | 30-min round-trip spike passes on physical device before feature work starts |
| No `aps-environment` on free team | Fase de esqueleto nativo | Entitlements files inspected, contain no push keys |
| 7-day expiry / 10-App-ID quota | Fase de esqueleto nativo | Bundle IDs frozen and documented; weekly re-sign runbook written |
| Xcode 26 first-build friction | Fase de esqueleto nativo | Checklist (license, simulator runtime, per-target signing, Developer Mode) completed once, documented for reproducibility |
| App Intent runs in extension process, not app | Fase de Live Activity interativa | Shared App Group contract designed and documented before UI work begins; button tap verified to update Live Activity even with app force-quit |
| Live Activity survives force-quit / goes stale | Fase de Live Activity interativa | Force-quit test scenario passes (honest paused state or clean dismissal) |
| Manual per-second updates instead of `timerInterval` | Fase de Live Activity interativa | Rest timer uses `Text(timerInterval:)`; no `Timer`-driven per-second `Activity.update` calls in the codebase |
| Expo-Modules New Architecture bridging | Fase de Live Activity interativa (module built here); convention set in Fase de esqueleto nativo | Native module authored via Expo Modules API (Swift, JSI); any third-party lib's New Architecture support verified before adoption |
| Audio session fights Spotify | Fase de áudio em background | Manual test with Spotify audibly playing on the physical device: cue ducks, doesn't stop, music |
| iOS suspends app during silent gaps | Fase de áudio em background | Multi-minute rest period tested on real device with screen off; local-notification fallback verified independently reliable |

## Sources

- [EvanBacon/expo-apple-targets — GitHub](https://github.com/EvanBacon/expo-apple-targets)
- [Home screen widgets and Live Activities in Expo — Expo blog](https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo)
- [Apple Home Screen Widgets with Expo — Evan Bacon](https://evanbacon.dev/blog/apple-home-screen-widgets)
- [Continuous Native Generation (CNG) — Expo Documentation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [Interactivity with Live Activities and App Intents — Ben Frearson](https://bfrearson.github.io/blog/ios-live-activties/)
- [Live Activities iOS 26: Complete Guide — Swift Crafted](https://swiftcrafted.dev/article/live-activities-dynamic-island-ios-26-swiftui-activitykit-guide)
- [The iOS 26 Widget Surface: One App Intent, Many Places — Blake Crosley](https://blakecrosley.com/blog/ios-26-widget-and-control-surface)
- [Live Activities Are a State Machine, Not a Badge — Blake Crosley](https://blakecrosley.com/blog/live-activities-state-machine)
- [Live Activity Persistence After App Force Quit — Apple Developer Forums](https://developer.apple.com/forums/thread/729651)
- [Dismiss Live Activities on App Termination — Apple Developer Forums](https://developer.apple.com/forums/thread/732418)
- [Update Live Activities with push notifications — WWDCNotes (WWDC23-10185)](https://wwdcnotes.com/documentation/wwdc23-10185-update-live-activities-with-push-notifications/)
- [Live Activities Part 3/4 — Development/Debugging — TIL with Mohammad](https://mfaani.com/posts/liveactivities/3-development/)
- [Configuring an Audio Session — Apple Developer Documentation (archive)](https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioSessionBasics/AudioSessionBasics.html)
- [AVAudioSession 'mixWithOthers' option — Apple Developer Forums](https://developer.apple.com/forums/thread/713066)
- [Apple App Store rejected app because of "audio" key in UIBackgroundModes — GitHub issue, ryanheise/audio_service](https://github.com/ryanheise/audio_service/issues/975)
- [Expo SDK 54 — Expo changelog](https://expo.dev/changelog/sdk-54)
- [Expo Modules API: Overview — Expo Documentation](https://docs.expo.dev/modules/overview/)
- [Turbo vs Nitro Modules: RN Guide 2026 — React Native Relay](https://reactnativerelay.com/article/building-native-modules-2026-turbo-expo-nitro-compared)
- [Every Free Way to Sideload iPhone Apps in 2026, Ranked by Ease — builds.io](https://builds.io/blog/technologies/ios-technologies/free-sideloading-tools-iphone-ranked/)
- [How to Stop Refreshing Sideloaded Apps Every 7 Days — builds.io](https://builds.io/blog/technologies/ios-technologies/stop-refreshing-sideloaded-apps-7-days/)
- [Limits on App IDs - 10 every 7 days — Apple Developer Forums](https://developer.apple.com/forums/thread/675347)
- [HN discussion on free Apple Developer sideload limits](https://news.ycombinator.com/item?id=36023322)
- [Solving Xcode Provisioning Profile and Capability Errors — Gordon Beeming](https://gordonbeeming.com/blog/2025-10-15/solving-xcode-provisioning-profile-and-capability-errors)
- [Signing With a Free Personal Team — zudo-tauri-wisdom](https://takazudomodular.com/pj/zudo-tauri/docs/mobile/ios-signing-free-team/)
- [xcode@apple-dev.groups.io — Adding App Groups without Team Account?](https://apple-dev.groups.io/g/xcode/topic/adding_app_groups_without/68831015)

---
*Pitfalls research for: Adding native iOS free-sideload + interactive Live Activity + background audio to an existing Expo/CNG app*
*Researched: 2026-08-15*
