---
phase: 18-neon-configuravel
reviewed: 2026-08-20T17:58:47Z
depth: standard
files_reviewed: 68
files_reviewed_list:
  - App.tsx
  - __tests__/adaptationSheet.test.tsx
  - __tests__/alertHostWeb.test.tsx
  - __tests__/cardioTempoDistancia.test.ts
  - __tests__/checkInSheet.test.tsx
  - __tests__/direcao03-fase3-sessao.test.tsx
  - __tests__/liveActivityContentState.test.ts
  - __tests__/liveActivityPlatformImport.test.ts
  - __tests__/liveActivitySwiftContract.test.ts
  - __tests__/liveActivitySync.test.ts
  - __tests__/neonTheme.test.tsx
  - __tests__/profileScreen.test.tsx
  - __tests__/replanBanner.test.tsx
  - __tests__/replanScreenFlow.test.tsx
  - __tests__/sessionPlayerCleanup.test.tsx
  - __tests__/sessionPlayerTransitions.test.tsx
  - __tests__/settingsScreen.test.tsx
  - __tests__/themeComponents.test.tsx
  - __tests__/themeFallbackWithoutProvider.test.tsx
  - __tests__/themeModuleGraphSentinel.test.ts
  - __tests__/themeProgressChart.test.tsx
  - __tests__/themeProviderSupabaseEnvRegression.test.ts
  - __tests__/themeRuntimeCoverage.test.ts
  - __tests__/themeScreens.test.tsx
  - __tests__/uiKit.test.tsx
  - __tests__/UpdateBanner.test.tsx
  - backend/tests/test_migration_neon_color.py
  - modules/live-activity/ios/LiveActivityModule.swift
  - modules/live-activity/ios/SessionActivityAttributes.swift
  - scripts/neon-rls-smoke.mjs
  - scripts/neon-rls-smoke.test.mjs
  - scripts/neon-uat-accounts.mjs
  - scripts/neon-uat-accounts.test.mjs
  - scripts/resign.sh
  - scripts/resign.test.mjs
  - src/components/AlertHost.tsx
  - src/components/progress/CardioEvolucaoChart.tsx
  - src/components/session/AdaptationSheet.tsx
  - src/components/session/CheckInSheet.tsx
  - src/components/session/ReplanBanner.tsx
  - src/components/session/SessionPlayer.tsx
  - src/components/session/SessionQueue.tsx
  - src/components/session/SessionSummary.tsx
  - src/components/ui/Button.tsx
  - src/components/ui/Controls.tsx
  - src/components/ui/Feedback.tsx
  - src/components/ui/FModules.tsx
  - src/components/ui/Logo.tsx
  - src/components/ui/Surface.tsx
  - src/components/ui/TextField.tsx
  - src/components/UpdateBanner.tsx
  - src/engine/liveActivityContentState.ts
  - src/native/liveActivitySync.ts
  - src/navigation/linkingConfig.ts
  - src/navigation/MainNavigator.tsx
  - src/navigation/RootNavigator.js
  - src/screens/ActiveSessionScreen.tsx
  - src/screens/ExercisePickerScreen.tsx
  - src/screens/HomeScreen.tsx
  - src/screens/InstallScreen.tsx
  - src/screens/ManualPlanEditorScreen.tsx
  - src/screens/PostQuestionnaireChat.tsx
  - src/screens/ProfileScreen.tsx
  - src/screens/ProgressScreen.tsx
  - src/screens/QuestionnaireScreen.tsx
  - src/screens/SessionHistoryDetailScreen.tsx
  - src/screens/SessionHistoryScreen.tsx
  - src/screens/SettingsScreen.tsx
  - src/screens/WorkoutDetailScreen.tsx
  - src/services/neonPreferenceRepository.ts
  - src/theme/theme.ts
  - src/theme/ThemeProvider.tsx
  - supabase/migrations/0040_profiles_neon_color.sql
  - targets/session-widget/SessionActivityAttributes.swift
  - targets/session-widget/WidgetLiveActivity.swift
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-08-20T17:58:47Z
**Depth:** standard
**Files Reviewed:** 68
**Status:** issues_found

## Summary

Phase 18 ("neon-configuravel") adds a per-account configurable neon accent
(4 closed colors) with `ThemeProvider`/`useTheme()`, Supabase persistence
(`profiles.neon_color` + RLS-preserving migration), reactive re-theming of
every screen/UI-kit component, and propagation to the iOS Live Activity
(ActivityKit) and its Lock Screen widget. This is a large, carefully built
diff (74 files, +11.6k/-1.9k) with unusually strong self-defense: a static
module-graph sentinel proving `src/theme/` never reaches
`AuthContext`/`supabaseClient`, a byte-identical-parity test between the two
duplicated `SessionActivityAttributes.swift` files, and 945 lines of
`ThemeProvider` concurrency tests covering account switches, suspended
renders, and interleaved saves.

No BLOCKER-class defect (security, data loss, crash) was found in the
reviewed diff. `ThemeProvider`'s save/coalescing state machine, the Supabase
migration, and the new `neon-rls-smoke.mjs` / `neon-uat-accounts.mjs`
scripts (child-process invocation with `shell: false`, argv validation,
0600/uid-owned file checks, git-ignore enforcement) are well hardened. The
findings below are narrower: a real (if narrow) race in how the Live
Activity applies a theme change independent of the normal draft-driven
update path, a project-convention (immutability) deviation contained to a
local queue primitive, a minor accessibility completeness gap, and two
pre-existing quality nits that this diff's refactor touched but did not
introduce.

## Warnings

### WR-01: Theme-triggered Live Activity update can push a stale draft snapshot

**File:** `src/native/liveActivitySync.ts:164-178` (`setLiveActivityNeonColor`), compare with `src/native/liveActivitySync.ts:307-347` (`initLiveActivitySync` subscriber)

**Issue:** There are two independent, uncoordinated write paths into the
same `updateLiveActivity()` call:

1. `initLiveActivitySync`'s store subscriber fires `void publishUpdate(state.draft)` directly (fire-and-forget, no queue) whenever the draft changes.
2. `setLiveActivityNeonColor(value)` reads `useActiveSessionStore.getState().draft` **once, synchronously**, closes over it, and schedules `publishUpdate(draft, nextNeonColor)` on a separate promise chain (`themeUpdateQueue`).

Because path 2 captures `draft` at call time rather than re-reading the
store when the queued callback actually executes, if a draft mutation (e.g.
`completeSet()`'s async round-trip) resolves in the window between the
theme-color request and the queued microtask running, the theme update can
publish a **stale** exercise/set/reps/load snapshot to the Lock Screen,
potentially overwriting a fresher update that the subscriber already (or is
about to) publish. The window is narrow (microtask-level, or as wide as
whatever async operation is interleaved) and self-heals on the next draft
change, but during an active workout a theme change from Settings while a
set is being completed could momentarily show reverted reps/load on the
Lock Screen. None of the existing tests in `__tests__/liveActivitySync.test.ts`
exercise this interleaving — all of them mutate the store, `await
flushPromises()`, and only then trigger the color change (or vice versa),
so the two paths are never raced against each other in the suite.

**Fix:**
```ts
export const setLiveActivityNeonColor = (value: unknown): Promise<void> => {
  const nextNeonColor = parseNeonColor(value);
  if (nextNeonColor === currentNeonColor) return themeUpdateQueue;

  currentNeonColor = nextNeonColor;
  const state = useActiveSessionStore.getState();
  if (state.status !== 'active' || !state.draft) return themeUpdateQueue;

  themeUpdateQueue = themeUpdateQueue.then(() => {
    // Re-read the store instead of closing over the draft captured above —
    // avoids publishing a snapshot that's gone stale by the time this runs.
    const latest = useActiveSessionStore.getState();
    if (latest.status !== 'active' || !latest.draft) return;
    return publishUpdate(latest.draft, nextNeonColor);
  });
  return themeUpdateQueue;
};
```

### WR-02: `ThemeProvider.runSaveToken` mutates the shared `SaveToken` in place

**File:** `src/theme/ThemeProvider.tsx:236-305`

**Issue:** `token.queued = null; token.requested = queued; token.rollback = confirmed;`
mutate the same `SaveToken` object across loop iterations instead of
producing new immutable tokens. This is a direct deviation from the
project's global coding-style rule ("ALWAYS create new objects, NEVER
mutate existing ones" — marked CRITICAL in
`~/.claude/rules/ecc/common/coding-style.md`). It is contained (the token
never escapes `ThemeProvider`, and `inFlightByOwnerRef`/`committedStateRef`
are the only holders of a reference to it) so it is not causing an observed
bug today, but it is exactly the kind of pattern that becomes a bug once
someone reuses `SaveToken` elsewhere or reads `token.requested` from two
places that assume it's stable across an await.

**Fix:** Replace the token with an immutable snapshot per iteration, e.g.
have `runSaveToken` recurse with a new token object (`{ ...token, requested: queued, rollback: confirmed, queued: null }`)
instead of writing back onto `token`, or move the "queued while saving"
bookkeeping into `setState` alone and drop the mutable token fields.

### WR-03: `SettingsScreen` roving-focus start index doesn't resync after async theme hydration

**File:** `src/screens/SettingsScreen.tsx:86-91`

**Issue:**
```ts
const [focusedIndex, setFocusedIndex] = useState(() =>
  Math.max(0, NEON_OPTIONS.findIndex((option) => option.key === neonColor)),
);
```
This only runs once, at mount, via the `useState` lazy initializer. If the
confirmed `neonColor` from `ThemeProvider` resolves to something other than
the mount-time value after the profile finishes loading (e.g. web user tabs
into the radiogroup before hydration completes, or `neonColor` is still
`'yellow'` at first paint while the real confirmed color is `'blue'`), the
web roving `tabIndex`/keyboard focus start position keeps pointing at the
mount-time swatch even though the visually "selected" swatch (`selected =
neonColor === option.key`, recomputed every render in `renderOption`) is
correct. Low impact — cosmetic/keyboard-only, self-corrects on first
Tab/Arrow interaction — but it is a real gap in the reactive-theming
guarantee this phase is building.

**Fix:** Add an effect that resyncs `focusedIndex` when `neonColor` changes
and the field hasn't been touched yet (e.g. track a `touchedRef` set on
first `focusOption`/`chooseOption` call, and only auto-resync while it's
false).

## Info

### IN-01: Two independently-maintained duplicate Swift structs (mitigated by test, still a maintenance risk)

**File:** `modules/live-activity/ios/SessionActivityAttributes.swift`, `targets/session-widget/SessionActivityAttributes.swift`

**Issue:** These two files must stay byte-identical because the app target
and the widget extension are separate Swift compilation units with no
shared framework target. This phase correctly extended both copies with the
new `neonColor: String?` field and added
`__tests__/liveActivitySwiftContract.test.ts`, which asserts `attrsApp ===
attrsWidget` verbatim — so drift is now caught in CI rather than only at
Xcode build/decode time. Flagging only because the underlying duplication
(pre-existing, not introduced by this phase) remains a structural
maintenance hazard for anyone who edits one file directly without
re-running the JS test suite locally (e.g. hand-editing in Xcode).

**Fix:** No action required for this phase; consider a source-of-truth
generation step (shared file via build phase / symlink) in a future phase
if the pair needs to change again.

### IN-02: Pre-existing `console.log` debug statements in three files reviewed for this phase

**File:** `src/navigation/RootNavigator.js`, `src/screens/PostQuestionnaireChat.tsx`, `src/screens/QuestionnaireScreen.tsx`

**Issue:** These files are in this phase's file list only because of the
`theme`→`useTheme()`/`useThemeStyles()` migration; a large number of
`console.log('[RootNavigator] ...')` / `console.log('[Chat ${userId}] ...')`
/ `console.log('[QuestionnaireScreen] ...')` debug statements predate this
diff and were not touched by it (confirmed via `git diff` — none of the
`console.log` lines appear as additions). Noting for completeness per the
project's "no console.log in production code" rule, but this is out of
scope for this phase's changes and should not block it.

**Fix:** Track separately (e.g. a follow-up cleanup phase); not actionable
within phase 18's diff.

---

_Reviewed: 2026-08-20T17:58:47Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
