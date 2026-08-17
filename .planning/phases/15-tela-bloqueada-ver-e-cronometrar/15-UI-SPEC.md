---
phase: 15
slug: tela-bloqueada-ver-e-cronometrar
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-16
---

# Phase 15 — UI Design Contract

> Visual and interaction contract for the Live Activity (Lock Screen + Dynamic Island)
> introduced by LOCK-01/LOCK-02/LOCK-03. **Not a web surface.** No React/DOM component
> renders this UI — `targets/session-widget/WidgetLiveActivity.swift` (SwiftUI, ActivityKit)
> is the only renderer. The one React Native UI element this phase adds is
> `LiveActivityUnavailableBanner.tsx` (D-12), which is covered separately below and DOES
> follow the app's existing web/RN-style token system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — native iOS project (Expo + Swift/SwiftUI), no `components.json`, shadcn N/A |
| Preset | not applicable |
| Component library | SwiftUI native views (`Text`, `VStack`/`HStack`, `DynamicIslandExpandedRegion`) for the Live Activity; existing RN `StyleSheet` components (`ProvisioningBanner.tsx` pattern) for `LiveActivityUnavailableBanner.tsx` |
| Icon library | SF Symbols (`Image(systemName:)`) for the widget target — no vector icon package is linked into `targets/session-widget/`; `@expo/vector-icons` (`Feather`, already used app-wide, e.g. `SessionPlayer.tsx:348`) for the RN banner only |
| Font | **App target (RN):** `Inter` (ui) / `BarlowSemiCondensed-ExtraBold` (display) — `src/theme/theme.ts`. **Widget target (Live Activity):** system font via SwiftUI Dynamic Type text styles — see Typography below. Custom fonts are **not** currently bundled into `targets/session-widget/` (no font files declared in `expo-target.config.js`, no `Info.plist` `UIAppFonts` entry for the widget target) — see Open Decisions |

Source of truth for all RN-side tokens below: `src/theme/theme.ts` (already the single source for the whole app — "Nenhuma tela deve declarar cor, fonte, raio ou espaçamento fora daqui"). This UI-SPEC does not introduce new RN tokens; it maps existing ones onto the widget target, which has no token file of its own.

---

## Spacing Scale

**RN banner (`LiveActivityUnavailableBanner.tsx`):** reuse `theme.spacing` as-is (multiples of 4, already declared in the codebase) — no new values needed.

| Token | Value | Usage |
|-------|-------|-------|
| xs (`theme.spacing.xxs`) | 4px | Icon-to-text gap, inline padding |
| sm (`theme.spacing.sm`) | 8px | Compact element spacing |
| md (`theme.spacing.md`/`lg`) | 12–16px | Banner internal padding (`ProvisioningBanner` uses `lg` horizontal / `md` vertical) |
| lg (`theme.spacing.xxl`) | 24px | Section-level spacing, unused by this single-line banner |

**Widget target (SwiftUI):** ActivityKit/WidgetKit does not consume the app's `theme.spacing` file (separate Swift target, no shared token module). Use SwiftUI's system spacing defaults (`.padding()` with no explicit value, or `.padding(8)`/`.padding(4)` for tight regions) rather than inventing a parallel numeric scale — the platform's own layout guides (Lock Screen banner margins, Dynamic Island region insets) are enforced by the OS and are not developer-controlled. Where an explicit value is unavoidable (e.g. gap between the countdown digits and the secondary exercise line), use 4pt/8pt to stay consistent with the app's 8-point rhythm.

Exceptions: none.

---

## Typography

### Widget target (Live Activity — Lock Screen + Dynamic Island)

Per the domain constraint: use **SwiftUI Dynamic Type text styles**, not fixed px, so the card honors the user's accessibility text-size setting on the Lock Screen (Apple HIG requirement for Live Activities). Declare exactly 4 semantic roles (mapped from the existing `theme.typography` scale's *intent*, not its literal px, since the widget target has no font file loaded):

| Role | SwiftUI style | Weight | Where used |
|------|--------------|--------|------------|
| Display (large value) | `.title2` (≈22pt @ default Dynamic Type) with `.monospacedDigit()` | `.bold` (700) | The ONE large element per D-01: rest countdown (`resting`) or reps×carga (`measuring`), on the Lock Screen banner and the Dynamic Island **expanded** region |
| Label (secondary line) | `.subheadline` (≈15pt) | `.regular` (400) | Exercise name, "Série X/Y" when it is the secondary element (D-01) |
| Compact (Dynamic Island compact) | `.caption` (≈12pt) with `.monospacedDigit()` | `.bold` (700) | `compactLeading`/`compactTrailing` text (mm:ss or "3/4") — see D-02 and Open Decision on `minimal` below |
| Micro (block-only / overtime tag) | `.caption2` (≈11pt) | `.regular` (400) | "Alongamento 2/6" reduced card (D-03), the small "+2:30" overtime tag next to "Pronto" (D-04) |

Weights used: **`.bold` (700) and `.regular` (400) — exactly 2, the contract's cap.** The Compact role reuses `.bold` rather than introducing a third weight: `.bold` at `.caption` size with `.monospacedDigit()` is this app's existing tool for "big number gets weight" (the same rule `SessionPlayer.tsx`'s rest clock already follows), and it is expected to read clearly enough at ~12pt in the ~44pt-wide compact pill. This has not been confirmed on a physical device — see the on-device legibility check folded into D-13/Sessão 1 below (UI Considerations, `compactLeading`/`compactTrailing` row). Do not introduce a third weight.

`monospacedDigit()` is mandatory on every countdown/count-up element (`restEndsAt` timer, overtime `+m:ss`, compact mm:ss) — without it, `Text(timerInterval:)` and the overtime counter reflow their own width every second as digits change (`1:09` → `1:10`), causing visible layout jitter on Lock Screen every tick. This is a correctness requirement, not a style preference.

**"Pronto" state (D-04):** render "Pronto" itself at the **Display** role (it replaces the countdown as the large element, same visual slot) in accent color (see Color below); "Série 3/4" at **Label**; the overtime `+2:30` at **Micro**, directly beside or below "Pronto" — never competing with it for the large slot.

### RN banner (`LiveActivityUnavailableBanner.tsx`)

Reuse `theme.typography` exactly as `ProvisioningBanner.tsx` does — no new size or weight introduced:

| Role | Size (`theme.typography.fontSizes`) | Weight | Line Height |
|------|------|--------|-------------|
| Body (banner message) | `base` (12px) | `medium` (500) | `normal` (1.5) — matches `ProvisioningBanner.styles.message` exactly |

---

## Color

### Widget target (Live Activity)

The app has **no light theme** — `theme.ts` defines a single dark identity ("Força sem ruído": `PRETO` canvas, `NEON` accent used sparingly). The Live Activity should use the **same fixed dark palette**, not `Color(.label)`/system-adaptive colors, for two reasons: (1) product consistency — the Lock Screen card is the same brand as the rest of the app, and (2) the app doesn't have a light-mode palette to fall back to even if it wanted adaptive colors. This is a deliberate deviation from the generic "support both color schemes" default — flagged explicitly per the domain note, with the reasoning above, rather than silently applied.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0A0A0A` (`palette.preto`) | `.activityBackgroundTint(Color(...))` on the `ActivityConfiguration` body — replaces the scaffold's placeholder `Color.cyan` |
| Secondary (30%) | `#171A1D` (`palette.grafite`) / `#8B9098` (`palette.cinza`) | Grafite: not directly usable as a Live Activity region background (Lock Screen card itself is a single tint, no nested "card-on-card" surface); reserved as a conceptual secondary if the expanded Dynamic Island needs a subtly-differentiated row background. Cinza: secondary/auxiliary text (exercise name row, block label) |
| Accent (10%) | `#EBFF00` (`palette.neon`) | Reserved for: the rest countdown digits while actively counting down (the *one* "alive" element on the card, mirroring `SessionPlayer.tsx`'s neon-draining ring), the "Pronto" label text/tint at D-04, and `keylineTint` on the Dynamic Island (replaces the scaffold's placeholder `Color.red`). **Never** used for the exercise name, block label, or static prescription numbers — those stay `BRANCO`/`CINZA` per the app's existing "acento com propósito" principle (`theme.ts:9`: "o neon aparece só em foco, ação principal e progresso concluído") |
| Destructive | not applicable this phase | The card has no button, no destructive action (LOCK-01/02/03 is read-only); `AZUL_FUNCIONAL` (`#0A66FF`) is the app's reserved "functional, not neon" color and is not needed here either — no functional/system-state color appears in this phase's card |

`activitySystemActionForegroundColor`: `#FFFFFF` (`palette.branco`) — replaces the scaffold's placeholder `Color.black`, matching `theme.colors.text.primary`.

Text colors on the card: primary numbers/labels `#FFFFFF` (`text.primary`), secondary line `#8B9098` (`text.secondary`), micro/quiet labels `#61666D` (`text.quiet`) — identical mapping to what `theme.colors.text` already declares for the RN app.

Accent reserved for: **rest countdown while running, "Pronto" state label, Dynamic Island `keylineTint`.** Nothing else on the card uses neon.

### RN banner (`LiveActivityUnavailableBanner.tsx`)

Identical palette to `ProvisioningBanner.tsx` (same component family):

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `theme.colors.surface.canvas` (`#0A0A0A`) | Screen background behind the banner (not the banner itself) |
| Secondary (30%) | `theme.colors.surface.card` (`#171A1D`) | Banner container background |
| Accent (10%) | not used | This banner carries no CTA and no accent element — it is informational only, consistent with `ProvisioningBanner`'s precedent (message text only, `text.primary`, no neon) |
| Destructive | not applicable | No destructive action in this banner |

---

## Copywriting Contract

All copy is pt-BR, matching the rest of the product.

| Element | Copy |
|---------|------|
| Primary CTA | **N/A this phase.** LOCK-01/02/03 build a read-only mirror — no button exists on the card or in any new app screen. The first interactive element on the Live Activity is CMD-01/CMD-02 in Phase 16. |
| Card — resting (D-01, large element) | `Text(timerInterval: Date.now...restEndsAt, countsDown: true)` → renders as `mm:ss`, no label needed (the large size + position already read as "the timer"; matches `SessionPlayer.tsx`'s bare `formatarTempo` clock, no "Descanso:" prefix) |
| Card — resting (D-01, secondary line) | `{Nome do exercício}` (e.g. "Supino reto") |
| Card — measuring (D-01, large element) | `{repsMin}–{repsMax} reps × {cargaKg} kg` (bodyweight: reuse the existing `"Peso corporal"` tag pattern from `SessionPlayer.tsx:672` instead of a kg number) |
| Card — measuring (D-01, secondary line) | `Série {setIndex}/{setTotal}` |
| Card — ready/overtime (D-04, large element) | `Pronto` |
| Card — ready/overtime (D-04, secondary line) | `Série {setIndex}/{setTotal}` |
| Card — ready/overtime (D-04, micro tag) | `+{mm}:{ss}` (e.g. `+2:30`) — no "atraso"/"excedido" word, the `+` prefix alone communicates "past zero," matching the terse numeric style already used throughout the app's session UI |
| Card — block-only, cardio/alongamento (D-03) | `{Nome do bloco} {posição}/{total}` (e.g. "Alongamento 2/6", "Cardio 1/3") — the exact denominator semantics (position within same-metric block vs. whole session) is a planner-level decision (RESEARCH.md Open Question 2), not a copy question; this row fixes the *display format* only |
| Compact/minimal fallback outside rest (D-02) | `{setIndex}/{setTotal}` (e.g. "3/4") — no "Série" word, no room for it in a 44pt-wide compact region |
| `LiveActivityUnavailableBanner.tsx` (D-12) | `Ative as Live Activities em Ajustes para ver o treino na tela bloqueada` — single line, no title, no CTA button, matching `ProvisioningBanner.tsx`'s exact shape (`message` style only, no `title`/`button` slots exist in that pattern) |
| Empty state | **N/A.** The card only exists while a session is active with at least one drafted exercise (a live session always has exercises by construction — `activeSessionStore` never produces a session with zero exercises); there is no reachable "session with nothing to show" state for this card to render |
| Error state | The card itself has no error rendering — if `Activity.request()` fails, no card appears at all (nothing to design); the user-facing signal for that failure IS the `LiveActivityUnavailableBanner.tsx` copy above, which doubles as this phase's "error state" |
| Destructive confirmation | **None introduced by this phase.** The card has no destructive control. In-app, "cancelar sessão" has no existing UI trigger today (RESEARCH.md Pitfall 3 / Open Question 1) — building that control is out of this phase's scope; this UI-SPEC does not invent copy for a button that doesn't exist yet. If the planner decides D-06's "ao cancelar" observes the existing `reset()` path with no new UI, no copy is needed here either way |

---

## UI Considerations

> Populated by the ui-phase UI-consideration probe (`ui-consideration-probe.cjs`, 2026-08-16) and
> then resolved item-by-item against this contract with the dono. This card is a native
> constrained-canvas surface (Lock Screen banner + 4 Dynamic Island presentations), so "state
> coverage" here means content-fit and lifecycle coverage rather than classic web list/empty-state
> coverage. Empty- and error-state **copy** lives in `## Copywriting Contract` — the rows below
> reference it rather than restating it.

Elements probed: **12**. Applicable considerations: **66** — 50 covered, 11 backstop, 4 dismissed, 1 unresolved.

Two elements (E5 prescription line, E8 Dynamic Island expanded) classified to zero cues on the
heuristic pass and were re-run with an authored kind override confirmed by the dono. That override
raised **12 considerations the prose classifier had silently missed** — recall was fixed at
kind-confirmation, before resolution ran.

| Element | Category | Status | Resolution / Reason |
|---|---|---|---|
| E1 Lock Screen card body | empty | ⛔ dismissed | Unreachable by construction: the activity is requested only for an active session, and `activeSessionStore` never yields a session with zero exercises |
| E1 Lock Screen card body | loading | 🧪 backstop | `Activity.request()` is called with the full initial `ContentState` (no server round-trip), so the first frame carries real content. Backstop: cover any path where the card can render before `ContentState` is populated (race on session boot) |
| E1 Lock Screen card body | error | ✅ covered | No error rendering by contract — a failed `Activity.request()` produces no card at all; the signal is `LiveActivityUnavailableBanner` (see Copywriting Contract → Error state) |
| E1 Lock Screen card body | populated | ✅ covered | All four phases (`measuring`/`resting`/`readyOvertime`/`blockOnly`) carry a fully specified large-element, secondary-line and color mapping (D-01/D-03/D-04) |
| E1 Lock Screen card body | partial | ✅ covered | Bodyweight exercises render the existing "Peso corporal" tag rather than an empty or dash load |
| E1 Lock Screen card body | overflow | ✅ covered | `.lineLimit(1)` + `.truncationMode(.tail)` on every free-text `Text`; card height is system-controlled and grows with content |
| E1 Lock Screen card body | zero-one-many | ✅ covered | `Série X/Y` is always ≥1/≥1 by construction — a set always belongs to a series containing at least itself; no "0 de 0" state exists |
| E1 Lock Screen card body | long-text | ✅ covered | Same single-line tail-truncation rule — no free text on the card may wrap or push the layout |
| E2 Rest countdown | overflow | ✅ covered | Numeric-only `mm:ss` via `Text(timerInterval:)` with `.monospacedDigit()`, bounded by the prescribed rest duration; fixed-width digits prevent per-second reflow |
| E2 Rest countdown | long-text | ✅ covered | No free text enters this element — a system-computed timer interval only |
| E3 Overtime tag | overflow | ✅ covered | **Clamped at `+59:59`**: past one hour the tag stops growing rather than widening into `h:mm:ss`, so the Micro tag's width stays bounded and the card cannot reflow. *Decided by the dono, 2026-08-16* |
| E3 Overtime tag | long-text | ✅ covered | Numeric-only with a fixed `+` prefix; no free text |
| E4 Exercise name line | empty | 🧪 backstop | A blank exercise name is not known to be reachable. Backstop: assert what the secondary line renders when the name is empty, and confirm against `activeSessionStore`'s real shape whether that state exists at all. *Decided by the dono, 2026-08-16* |
| E4 Exercise name line | loading | 🧪 backstop | Name ships inside the initial `ContentState`; no placeholder designed. Backstop: same session-boot race path as E1 |
| E4 Exercise name line | error | ✅ covered | No error rendering — failure surfaces through the RN banner (Copywriting Contract → Error state) |
| E4 Exercise name line | partial | ✅ covered | A truncated name ending in `…` is an accepted partial rendering; the full name is always visible in-app |
| E4 Exercise name line | overflow | ✅ covered | `.lineLimit(1)` + `.truncationMode(.tail)` in every presentation that shows the name (Lock Screen secondary line, expanded `.leading`/`.trailing`) |
| E4 Exercise name line | long-text | ✅ covered | Same rule — unbounded name length can never wrap or grow the card |
| E5 Prescription line | empty | 🧪 backstop | A time/duration-prescribed exercise has no "reps × carga" for the Display slot. Backstop: cover it, and confirm whether phase 15's scope reaches such an exercise before assuming it away. *Decided by the dono, 2026-08-16* |
| E5 Prescription line | loading | 🧪 backstop | Prescription ships inside the initial `ContentState`. Backstop: same session-boot race path as E1 |
| E5 Prescription line | error | ✅ covered | No error rendering — never a broken prescription line; failure surfaces through the RN banner |
| E5 Prescription line | partial | ✅ covered | Bodyweight carries no `cargaKg` and reuses the "Peso corporal" tag rather than `× — kg` or a silently dropped load |
| E5 Prescription line | overflow | ✅ covered | **`.lineLimit(1)` + `.minimumScaleFactor(0.8)`** on the Display element — the number shrinks to 80% before any clipping and is never truncated with an ellipsis, because a cut prescription digit conveys nothing. *Decided by the dono, 2026-08-16* |
| E5 Prescription line | long-text | ✅ covered | Same `.minimumScaleFactor(0.8)` rule: a three-digit decimal load scales down rather than clipping or wrapping |
| E6 Set counter line | empty | ✅ covered | `setIndex` and `setTotal` are always ≥1 by construction; no empty counter state exists |
| E6 Set counter line | loading | 🧪 backstop | Counter ships inside the initial `ContentState`. Backstop: same session-boot race path as E1 |
| E6 Set counter line | error | ✅ covered | No error rendering; failure surfaces through the RN banner |
| E6 Set counter line | populated | ✅ covered | `Série X/Y` is the specified secondary Label line in both `measuring` and `readyOvertime` (D-01, D-04) |
| E6 Set counter line | partial | ✅ covered | Both numerator and denominator are always known when a series is active — no half-known counter state |
| E6 Set counter line | overflow | ✅ covered | `Série 12/15` at the Label role is short fixed-shape content; the card-wide `.lineLimit(1)` applies and is never reached in practice |
| E6 Set counter line | zero-one-many | ✅ covered | No "0 de 0" case; the counter reads identically at one set and at many, so no singular/plural branch is needed |
| E6 Set counter line | long-text | ✅ covered | One controlled word plus two integers — length is structurally bounded |
| E7 Block label | empty | ✅ covered | Rendered only in the `blockOnly` phase, which by definition has a block — no empty-label state |
| E7 Block label | loading | 🧪 backstop | Label ships inside the initial `ContentState`. Backstop: same session-boot race path as E1 |
| E7 Block label | error | ✅ covered | No error rendering; failure surfaces through the RN banner |
| E7 Block label | populated | ✅ covered | `blockOnly` is one of the four fully specified phases; the reduced card shows block name and position at the Micro role (D-03) |
| E7 Block label | partial | ⚠ **unresolved** | **Planner must treat as assumption.** The denominator semantics of "Alongamento 2/6" (position within the same-metric block vs. within the whole session) is an open planner-level decision — RESEARCH.md Open Question 2. This contract fixes the *display format* only |
| E7 Block label | overflow | ✅ covered | `.lineLimit(1)`, and block/modality names come from the controlled vocabulary in `src/constants/cardioModalidades.ts`, so real-world truncation risk is low — the rule is declared for defense-in-depth |
| E7 Block label | zero-one-many | ✅ covered | Position and total are always ≥1; the label reads identically at one block and at many |
| E7 Block label | long-text | ✅ covered | Same `.lineLimit(1)` over a controlled vocabulary — length is bounded by the modality constant list |
| E8 DI expanded | empty | ⛔ dismissed | Unreachable by construction: the expanded presentation exists only while an activity is live, and the activity is requested only for an active session with at least one exercise |
| E8 DI expanded | loading | 🧪 backstop | SwiftUI's default implicit animation on `Activity.update()` content swap is assumed sufficient for the `resting`→`measuring` transition; no custom transition specified. Backstop: if the swap reads as jarring or flashes on-device during Sessão 1 (D-13), that is a UAT finding to resolve then |
| E8 DI expanded | error | ✅ covered | No error rendering — a failed `Activity.request()` produces no activity and therefore no expanded presentation at all |
| E8 DI expanded | populated | ✅ covered | Region assignment fixed: large value (Display) in `.trailing`, secondary line in `.leading`, micro tag / block-only content in `.bottom` (Open Decision 3's default — cosmetic-only) |
| E8 DI expanded | partial | 🧪 backstop | `.bottom` is empty when there is neither a micro tag nor block content. SwiftUI is expected to collapse the empty region rather than reserve a gap, but this is unconfirmed on device. Backstop: verify during Sessão 1 (D-13) that no empty band appears under the pill |
| E8 DI expanded | overflow | ✅ covered | Per-region `.lineLimit(1)` with tail truncation; each region carries a modest fixed budget the system allocates around the pill |
| E8 DI expanded | zero-one-many | ✅ covered | Exactly three regions, always the same three — no variable-count region list whose layout could shift with item count |
| E8 DI expanded | long-text | ✅ covered | Same per-region single-line tail-truncation rule; no region may wrap |
| E9 DI compact | overflow | ✅ covered | Structurally prevented rather than truncated: D-02 fixes the compact regions to numeric-only content (`mm:ss` or `N/N`), so no free text ever enters the ~44pt slots |
| E9 DI compact | long-text | ✅ covered | No free text can enter these regions by contract — enforced at the content level, not by truncation |
| E10 DI minimal | empty | ⛔ dismissed | The minimal presentation exists only while an activity is live and another app also holds one; there is no empty state for the slot to render |
| E10 DI minimal | loading | 🧪 backstop | Glyph derives from `ContentState`, fully populated at request time. Backstop: same session-boot race path as E1 |
| E10 DI minimal | error | ✅ covered | No error rendering — a failed `Activity.request()` produces no activity and therefore no minimal presentation |
| E10 DI minimal | populated | ✅ covered | **SF Symbol, not literal digits**: `"timer"` tinted `palette.neon` while resting, a state-appropriate icon tinted `text.secondary` otherwise; `compact` keeps the literal `mm:ss`. *Confirmed by the dono, 2026-08-16 — resolves Open Decision 1, satisfying D-02's intent without violating the ~28×28pt platform constraint* |
| E10 DI minimal | overflow | ✅ covered | A single SF Symbol glyph in a ~28×28pt slot cannot overflow — the literal-digits risk is removed at the source by the glyph decision above |
| E10 DI minimal | long-text | ✅ covered | No text of any length enters this slot |
| E11 Unavailable banner (RN) | empty | ✅ covered | Mounted only when `ActivityAuthorizationInfo` reports Live Activities disabled; otherwise it does not render at all, so there is no empty variant |
| E11 Unavailable banner (RN) | loading | 🧪 backstop | Authorization state is read from `ActivityAuthorizationInfo`; whether a frame renders before that state is known is unconfirmed. Backstop: assert the banner does not flash on mount for a user who has Live Activities enabled |
| E11 Unavailable banner (RN) | error | ✅ covered | This banner **is** the phase's error surface — what the user sees when the Live Activity cannot be created, since the card itself has no error rendering |
| E11 Unavailable banner (RN) | populated | ✅ covered | Exact copy fixed at the Copywriting Contract D-12 row — single line, no title, no CTA button, matching `ProvisioningBanner`'s shape |
| E11 Unavailable banner (RN) | partial | ✅ covered | A single fixed string with no interpolated data — no partial state can exist |
| E11 Unavailable banner (RN) | overflow | ✅ covered | **No `numberOfLines` cap** — the message wraps freely to two lines on a narrow iPhone, identical to `ProvisioningBanner`. The instruction arrives whole and vertical space is available in-app. *Decided by the dono, 2026-08-16* |
| E11 Unavailable banner (RN) | zero-one-many | ⛔ dismissed | Not a collection: one fixed message, no repeated items, so there is no zero/one/many layout axis |
| E11 Unavailable banner (RN) | long-text | ✅ covered | Same free-wrap rule — a fixed 66-character string, wrapping rather than truncating is the declared behavior |
| E12 "Pronto" label | overflow | ✅ covered | A fixed six-character word at the Display role — structurally cannot overflow the large slot |
| E12 "Pronto" label | long-text | ✅ covered | Fixed literal string, not user or catalog data — no length variance exists |

### Backstops (11) — each becomes a UI-state test

`E1·loading`, `E4·empty`, `E4·loading`, `E5·empty`, `E5·loading`, `E6·loading`, `E7·loading`,
`E8·loading`, `E8·partial`, `E10·loading`, `E11·loading`.

At verify time, a backstop with no wired evidence routes to `insufficient_spec → human_needed` —
never a silent pass. The six `loading` backstops share one root cause (the session-boot race where a
card could render before `ContentState` is populated) and can be discharged by a single test that
covers that path; the remaining five are independent.

### Unresolved (1)

⚠ `E7 · partial` — **the planner must treat this as an assumption, not a settled contract.**
The denominator semantics of the block label is RESEARCH.md Open Question 2 and is not resolved here.

---

## Native Platform Contract

> This section exists because this phase's UI is not a web page — it fills the role the
> generic template covers with "Registry Safety" and screen-based state coverage, adapted
> to ActivityKit/Dynamic Island's fixed canvases per the domain note.

### Presentation size budgets & truncation rules

| Presentation | Apple-imposed constraint | This card's content | Truncation rule |
|---|---|---|---|
| Lock Screen banner | Full-width card, system-controlled height (grows with content, no hard cap but "as compact as reasonably possible" per HIG) | Large element (Display) + secondary line (Label) + optional micro tag | Exercise/block name: `.lineLimit(1)`, `.truncationMode(.tail)` |
| Dynamic Island — expanded | ~3 regions (`.leading`, `.trailing`, `.bottom`), each with modest fixed width/height budget the system allocates around the pill | Mirrors Lock Screen: leading = secondary line, trailing = large value (or vice versa — see Open Decision), bottom = micro tag / block-only content | Same `.lineLimit(1)` rule per region |
| Dynamic Island — compact | Two ~44pt-wide regions (`compactLeading`, `compactTrailing`) either side of the sensor pill | Numeric-only per D-02: `mm:ss` (rest) or `N/N` (otherwise) | Structural — see coverage table above, no free text ever placed here |
| Dynamic Island — minimal | Single ~28×28pt glyph slot | **Open Decision** — see below | N/A until resolved |

### Countdown rendering contract (LOCK-02)

- **Never** push per-second updates. The only legitimate source for the running countdown is `Text(timerInterval: Date.now...restEndsAt, countsDown: true)`, driven by the `restEndsAt` absolute timestamp already mandated by RESEARCH.md Pattern 2. `Activity.update()` is called only on *state transitions* (rest starts, rest is adjusted, phase changes, session advances) — never on a per-second timer from the JS side.
- The overtime count-up (D-04, `+m:ss`) uses the same primitive with `countsDown: false` and an open-ended range (`context.state.restEndsAt!...Date.distantFuture`), per RESEARCH.md's own example.
- `.monospacedDigit()` is mandatory on every one of these `Text` views (see Typography above) — this is the mechanism that keeps the countdown from visibly reflowing every second.

### Color scheme / appearance

- Single fixed dark palette (see Color above) — no `@Environment(\.colorScheme)` branching, because the app itself has no light theme to branch to. This is an explicit, reasoned deviation from "support both color schemes," not an oversight.
- No special handling is added for Always-On Display (AOD) dimming — iOS applies its own system-level dimming/desaturation to Live Activity content on AOD automatically; the only design obligation on this phase's side is to keep contrast high enough pre-dimming (white/neon on near-black already exceeds WCAG AA against `#0A0A0A`).

### Live Activity chrome (scaffold placeholders to replace)

The current `targets/session-widget/WidgetLiveActivity.swift` scaffold has three placeholder values from `@bacons/apple-targets`' template that this phase must replace with the values declared above, not leave as-is:

| Scaffold placeholder | Location | Replace with |
|---|---|---|
| `.activityBackgroundTint(Color.cyan)` | `ActivityConfiguration` body | `Color(red: 0.039, green: 0.039, blue: 0.039)` (`#0A0A0A`) or an `Assets.xcassets` color named to match `palette.preto` |
| `.activitySystemActionForegroundColor(Color.black)` | `ActivityConfiguration` body | `Color.white` (`#FFFFFF`) |
| `.keylineTint(Color.red)` | `dynamicIsland` closure | `Color(red: 0.922, green: 1.0, blue: 0.0)` (`#EBFF00`, `palette.neon`) |
| `.widgetURL(URL(string: "https://www.expo.dev"))` | `dynamicIsland` closure | Out of scope for this phase (tapping the Live Activity to deep-link into the app is not a LOCK-01/02/03 requirement); leave pointed at a real in-app deep link only if a plan task already wires one, otherwise remove rather than ship a placeholder Expo URL to the dono's Lock Screen |

---

## Open Decisions

> Recorded during authoring as genuinely unresolved by CONTEXT.md/RESEARCH.md/VALIDATION.md or the
> codebase, each with a recommended default rather than a silently locked choice.
>
> **Status after the ui-phase probe (2026-08-16): decisions 1 and 2 were surfaced to the dono and
> confirmed; decision 3 stands on its recommended default (cosmetic-only, no confirmation required).
> No open decision remains for the planner to settle.**

1. ✅ **RESOLVED (dono, 2026-08-16) — `minimal` renders an SF Symbol, not literal `mm:ss`.**
   The dono confirmed the recommended default below verbatim: `minimal` shows `"timer"` tinted
   `palette.neon` while resting and a state-appropriate icon tinted `text.secondary` otherwise;
   `compact` keeps the literal `mm:ss`. The planner may lock the `minimal` closure on this. See
   `## UI Considerations` → `E10 · populated`. Original analysis retained below for the record.

   **`minimal` Dynamic Island presentation cannot literally show `mm:ss` (D-02).**
   D-02 says compact *and* minimal prioritize "o tempo: mm:ss do descanso correndo." The `minimal` slot is a single ~28×28pt glyph region (one view, no leading/trailing split) — Apple's own system apps (Music, Timers) never render multi-character countdown text there; they show an icon or a single glyph with tint conveying state.
   **Recommended default:** `minimal` shows an SF Symbol (`"timer"` while resting, tinted `palette.neon`; a static icon appropriate to `measuring`/`blockOnly`/`readyOvertime` otherwise, tinted `text.secondary`) instead of literal digits. `compact` keeps the literal `mm:ss` text as originally specified — it has the room. This reading satisfies D-02's *intent* ("time is the priority signal during rest") without violating the platform's minimal-slot constraint. Needs dono confirmation before the plan locks the `minimal` closure's content, since it is a literal-reading deviation from D-02's text.

2. ✅ **RESOLVED (dono, 2026-08-16) — ship the system font for v1.3.**
   The dono confirmed the recommended default below: SF Pro via Dynamic Type on the Live Activity,
   with branding fidelity in the widget deferred to a v1.3.x polish item to be reconsidered only if
   the visual gap bothers them on-device in Sessão 1 (D-13). Original analysis retained below.

   **Custom app fonts (`Inter`, `BarlowSemiCondensed-ExtraBold`) are not bundled into the widget target.**
   Embedding them would require adding the `.ttf` files to `targets/session-widget/` and declaring `UIAppFonts` in that target's `Info.plist` — nontrivial, unexplored by RESEARCH.md, and every hour spent here is an hour not spent on the `restEndsAt`/reconciliation work RESEARCH.md flags as the real risk in this phase.
   **Recommended default:** ship with system font (SF Pro via Dynamic Type, per Typography above) for v1.3. This is also the platform-idiomatic choice — Live Activities are widely built with system fonts precisely because Dynamic Type compliance is expected on Lock Screen. Revisit branding fidelity (custom font in the widget) as a v1.3.x polish item if the dono minds the visual gap between the RN app (`BarlowSemiCondensed`) and the Lock Screen card (system font) once seen on-device in Sessão 1 (D-13).

3. ✅ **STANDS ON ITS DEFAULT — cosmetic-only, no dono confirmation required.**
   Locked as recommended: Display in `.trailing`, secondary line in `.leading`, micro/block content
   in `.bottom`. See `## UI Considerations` → `E8 · populated`. Original analysis below.

   **Dynamic Island expanded region assignment (`.leading` vs `.trailing` for large value vs secondary line).**
   D-01 fixes *which element is large*, not which side of the expanded pill it sits on. No existing pattern in the repo settles left/right placement (this is the first Dynamic Island UI in the codebase).
   **Recommended default:** large value (Display role) in `.trailing` (right side reads as "the number," consistent with how a stopwatch/timer app conventionally places the running value on the right, and consistent with `SessionPlayer.tsx`'s own layout — the neon ring/clock sits as the dominant right-of-center focal element), secondary line in `.leading`, micro/block content in `.bottom`. Low-risk, cosmetic-only — does not need dono confirmation, but recorded here since RESEARCH.md's own pseudo-code left both regions as unfilled comments.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none — not applicable, native iOS/RN project | not required |
| third-party | none | not required |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS — after revision 1/2 (widget target consolidated to 2 weights)
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** APPROVED by `gsd-ui-checker`, 2026-08-16 — 6/6 dimensions, no blocking issues.
One revision iteration was required (Dimension 4: the widget target declared 3 font weights against
a cap of 2; the Compact role now reuses `.bold` instead of `.semibold`).

**UI-consideration probe:** 12 elements, 66 applicable considerations — 50 covered, 11 backstop,
4 dismissed, 1 unresolved (`E7 · partial`, which the planner must treat as an assumption). See
`## UI Considerations`.
