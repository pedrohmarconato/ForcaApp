# Phase 12: Página de instalação guiada - Research

**Researched:** 2026-08-15
**Domain:** React Navigation multi-tree linking (web), iOS PWA install detection, React Native/Expo web
**Confidence:** HIGH (architecture — read every relevant file in the repo, including `node_modules` source for library behavior); MEDIUM (UA-sniffing/PWA-detection best practices — web-sourced, cross-checked across multiple independent sources)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Acesso e navegação**
- `/instalar` é PÚBLICA — funciona deslogado (aluno recebe o link antes de ter
  conta) e logado.
- Path `instalar` registrado no linkingConfig; a tela é acessível em qualquer
  estado de auth (mecanismo exato — tela nos dois stacks, gate acima do auth,
  etc. — a critério do planner, respeitando a arquitetura existente do
  RootNavigator/linkingConfig).
- Porta de entrada: só a rota direta (o dono compartilha o link). Sem botão novo
  no app.

**Conteúdo do passo a passo**
- 4 estados detectados e cobertos:
  1. iOS + Safari → passo a passo de instalação (caminho feliz).
  2. iOS + outro navegador (Chrome/Firefox iOS) → "abra este link no Safari" com
     instrução de como.
  3. Desktop/Android → "abra este link no iPhone".
  4. Standalone (já instalado) → mensagem adaptada de sucesso, SEM repetir o
     passo a passo (critério de sucesso 2).
- Formato: 3 passos numerados com ícone (Compartilhar → "Adicionar à Tela de
  Início" → Confirmar), sem screenshots pesados.
- Copy: tom leigo e literal, pt-BR (ex.: "Toque no botão Compartilhar — o
  quadrado com a seta para cima, na barra de baixo do Safari").
- QR code para desktop: NÃO — deferido.

**Detecção técnica e guards**
- "Já instalado": `window.matchMedia('(display-mode: standalone)')` +
  `navigator.standalone === true` (iOS legado).
- iOS/Safari: utilitário puro e testável (trata Chrome iOS = CriOS, Firefox iOS
  = FxiOS; ciente do user-agent desktop do iPadOS).
- Página web-only (`Platform.OS === 'web'`); zero efeito no app nativo.
- Testes: RTL da página cobrindo os 4 estados (mockando o utilitário) + testes
  unitários do utilitário de detecção.

### Claude's Discretion
- Nome/estrutura do componente e do utilitário, mecanismo exato de registro da
  rota pública, layout interno da página (dentro do UI-SPEC e da identidade).

### Deferred Ideas (OUT OF SCOPE)
- QR code na visão desktop apontando para /instalar (deferido pelo dono nesta
  discussão).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INST-02 | Usuário leigo instala sozinho pela página `/instalar` do app: passo a passo com detecção de iOS/Safari e de "já instalado" | Pattern 1 (route reachable in every auth state — the mechanism that makes `/instalar` work for a deslogado aluno), Pattern 2 (`tabBarButton: () => null` for the Main-tree registration), Don't Hand-Roll (detection utility shape), Code Examples (`installDetection.ts`, test patterns), Pitfall 4 (safe fallback on unrecognized UA) |

</phase_requirements>

## Summary

This phase adds a single public, web-only screen (`/instalar`) that must render identically well from THREE structurally distinct `NavigationContainer` trees that `RootNavigator.js` mounts depending on auth state (Auth, Onboarding, Main), plus survive a brief pre-auth loading window that has **no** `NavigationContainer` at all. The repo's own architecture is the hard constraint here, more than any external library research: `RootNavigator.js` never mounts more than one of these trees at a time, and two of them (Auth, Onboarding) already share one `linking` object (`linkingInterceptor`) whose `config.screens` is currently **empty** (`{}`) — meaning no path-based route resolves in those trees today. `Instalar` is the first screen this project registers that must be reachable regardless of session state, and doing that requires touching `linking.ts`, `linkingConfig.ts`, and all three navigator files with the same route name (`Instalar`) and the same literal path (`instalar`), not a nested one.

Detection itself (iOS/Safari/standalone) is a small, well-understood problem with no library to reach for — CONTEXT.md's decision to hand-roll a pure `installDetection.ts` utility matches how every production guide handles it (token-bundle UA sniffing, `navigator.standalone` for legacy iOS + `matchMedia('(display-mode: standalone)')` for the modern/cross-platform path, `navigator.maxTouchPoints` to unmask iPadOS's desktop-spoofed UA). The one library-adjacent finding worth calling out: hiding the fifth tab (`Instalar`) from `MainNavigator`'s bottom bar via `tabBarButton: () => null` is confirmed, by reading the installed `@react-navigation/bottom-tabs@6.6.1` source directly, to render nothing at all for that route (zero space reserved) — this is version-specific to v6 and does **not** hold in react-navigation v7, so citing "the docs" without the version pin would have been actively wrong here.

**Primary recommendation:** Register `Instalar` as a real screen (same literal path `instalar`, no nesting) in `linkingInterceptor` (shared by Auth+Onboarding) and in `LINKING_CONFIG` (Main), add a `<Stack.Screen name="Instalar">` to `AuthNavigator.tsx` and `OnboardingNavigator.tsx`, and a `<BottomTab.Screen name="Instalar" options={{ tabBarButton: () => null }}>` to `MainNavigator.tsx` — three narrow, additive edits, no restructuring of any existing navigator's shape.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route registration (`/instalar` reachable in any auth state) | Frontend Server (SSR-equivalent: React Navigation linking, web) | — | React Navigation's `linking` config is the sole router on web (Vercel SPA rewrite sends everything to `index.html`); no server-side routing exists |
| iOS/Safari/standalone detection | Browser / Client | — | Synchronous `navigator`/`matchMedia` reads at mount; no network, no backend involvement |
| Copy rendering (4 states) | Browser / Client | — | Pure presentational component, driven entirely by the detection utility's return value |
| Web-only guard (`Platform.OS === 'web'`) | Browser / Client | — | Established pattern (`UpdateBanner.tsx`); this screen must be inert on native builds |
| Static asset delivery of the page itself | CDN / Static (Vercel) | — | `vercel.json` rewrite already forwards `/instalar` to `index.html`; no new infra needed |

## Standard Stack

No new dependency is introduced by this phase. Everything needed is already installed.

### Core (already installed — reused, not added)
| Library | Installed Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-navigation/native` | ^6.1.18 [VERIFIED: package.json] | `NavigationContainer`, `useNavigation`, linking | Already the app's only router |
| `@react-navigation/stack` | ^6.4.1 [VERIFIED: package.json] | `AuthNavigator`/`OnboardingNavigator` stacks | Existing pattern |
| `@react-navigation/bottom-tabs` | ^6.6.1 [VERIFIED: package.json, node_modules/@react-navigation/bottom-tabs/package.json `"version": "6.6.1"`] | `MainNavigator` tabs | Existing pattern; version pin matters for the `tabBarButton` behavior below |
| `@expo/vector-icons` | ^15.0.3 [VERIFIED: package.json] | Feather icons for `StepRow` | Already used app-wide (`Button.tsx`, `Feedback.tsx`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `installDetection.ts` | A detection npm package (e.g. `pwa-install-handler`, `detect-browser`) | Rejected — CONTEXT.md already locked "utilitário puro e testável"; the detection surface here (4 UA tokens + 2 standalone checks) is small enough that a dependency adds supply-chain risk for near-zero code savings. No package research needed; this is explicitly Don't-Hand-Roll's inverse case (hand-rolling is correct). |
| `tabBarButton: () => null` to hide the 5th tab | Wrapping `MainNavigator`'s `BottomTab.Navigator` in an outer `Stack.Navigator` with `Instalar` as a sibling screen | Rejected as the primary path — much larger surgery (changes `MainNavigator`'s export shape, every `navigate('Home', {...})` call site downstream would need re-verification). `tabBarButton: () => null` is additive and confirmed safe in the installed v6.6.1. |

**Installation:** None — no new `npm install` for this phase.

## Package Legitimacy Audit

**Not applicable.** This phase installs no new packages. All libraries used (`@react-navigation/*`, `@expo/vector-icons`) are already present in `package.json`/`node_modules` and were verified in place (see Standard Stack table above, `[VERIFIED: package.json]` / `[VERIFIED: node_modules/...package.json]`).

## Architecture Patterns

### System Architecture Diagram

```
Aluno abre link compartilhado
  https://forca-app-six.vercel.app/instalar
              │
              ▼
   Vercel rewrite (vercel.json, regex NÃO exclui "instalar")
              │  → sempre serve /index.html (SPA shell)
              ▼
        App.tsx monta
              │
              ▼
      RootNavigator.js decide a árvore
              │
   ┌──────────┼──────────────────┬───────────────────────┐
   │ loadingSession /             │                        │
   │ isLoadingPreference /        │                        │
   │ loadingProfile === true      │                        │
   ▼                              │                        │
 View "Carregando..."             │                        │
 (SEM NavigationContainer —       │                        │
  /instalar NÃO renderiza aqui;   │                        │
  ver Pitfall 1)                  │                        │
                                  ▼                        ▼
                          !session (deslogado)      session existe
                                  │                        │
                                  ▼                ┌───────┴────────┐
                    NavigationContainer          !ehMain          ehMain
                    linking=linkingInterceptor   (onboarding)    (perfil OK)
                          │                          │                │
                          ▼                          ▼                ▼
                    AuthNavigator            OnboardingNavigator  MainNavigator
                    Stack.Screen              Stack.Screen         BottomTab.Screen
                    name="Instalar"           name="Instalar"      name="Instalar"
                    path: instalar            path: instalar       (tabBarButton:null)
                    (via linkingInterceptor   (via linkingInterceptor  path: instalar
                     .config.screens,          .config.screens,        (via LINKING_CONFIG,
                     SHARED object)             SHARED object)          Main-only)
                          │                          │                │
                          └──────────────┬───────────┴────────────────┘
                                         ▼
                              InstallScreen.tsx monta
                                         │
                                         ▼
                          Platform.OS !== 'web' ? return null
                                         │ (web)
                                         ▼
                       installDetection.ts (síncrono, sem rede)
                       isIOS() / isSafari() / isStandalone()
                                         │
              ┌──────────────┬──────────┴───────┬──────────────────┐
              ▼              ▼                  ▼                  ▼
        Estado 4          Estado 1          Estado 2            Estado 3
        standalone        iOS+Safari        iOS+outro nav       desktop/Android
        (checkmark +      (3 StepRow)       (Notice "abra       (fallback também
         CTA)                                no Safari")         p/ UA não reconhecida)
```

### Recommended Project Structure
```
src/
├── screens/
│   └── InstallScreen.tsx        # orquestra as 4 renderizações (novo)
├── utils/
│   └── installDetection.ts      # isIOS / isSafari / isStandalone, puro (novo)
├── navigation/
│   ├── linking.ts                # editar: linkingInterceptor.config.screens
│   ├── linkingConfig.ts          # editar: LINKING_CONFIG.screens (top-level)
│   ├── AuthNavigator.tsx         # editar: + <Stack.Screen name="Instalar">
│   ├── OnboardingNavigator.tsx   # editar: + <Stack.Screen name="Instalar">
│   └── MainNavigator.tsx         # editar: + <BottomTab.Screen name="Instalar">
```

### Pattern 1: Registering a route reachable in every auth state (THE core mechanism for this phase)

**What:** `RootNavigator.js` [VERIFIED: src/navigation/RootNavigator.js:112-116, 165-177] mounts exactly one of three `NavigationContainer` trees at a time — never more than one, never zero when a route needs to resolve (except the loading branch, see Pitfall 1). Two of those trees share ONE `linking` object:

```js
// src/navigation/RootNavigator.js:112-116 (session === null)
return (
  <NavigationContainer linking={linkingInterceptor}>
    <AuthNavigator />
  </NavigationContainer>
);
// src/navigation/RootNavigator.js:165-177 (session exists)
return (
  <NavigationContainer
    ref={ehMain ? mainNavigationRef : undefined}
    linking={ehMain ? linkingMain : linkingInterceptor}   // <- Onboarding uses linkingInterceptor too
    onReady={...}
  >
    {NavigatorComponent /* MainNavigator or OnboardingNavigator */}
  </NavigationContainer>
);
```

`linkingInterceptor` [VERIFIED: src/navigation/linking.ts:111-113] currently has an **empty** route config:

```ts
export const linkingInterceptor: LinkingOptions<any> = {
  prefixes: LINKING_PREFIXES,
  config: { screens: {} },   // <- no path resolves to any screen today
  ...
};
```

With `config.screens: {}`, React Navigation's default `getStateFromPath` cannot match `/instalar` to anything, so the container falls back to each navigator's own default initial route (`Login` for Auth, `Questionnaire` for Onboarding) — a deep link to `/instalar` while logged out currently lands on Login, silently. Verified by reading the object literal directly (not inferred from behavior).

**When to use:** Any future public/auth-agnostic route in this app follows the same recipe — this is the FIRST screen the project needs at this level, so there's no existing precedent screen to copy verbatim; the `treino-conjunto/:code` pattern (CONTEXT.md's suggested "closest analog") is intentionally **not** analogous — it deliberately does NOT hydrate a route while logged out (it stores the code and shows `null`, per the comments in `linking.ts:104-140`). `/instalar` is the opposite case: it must hydrate and render immediately, logged in or out.

**Example (the three edits, each additive):**
```ts
// src/navigation/linking.ts — one edit, covers BOTH Auth and Onboarding trees
// because both containers pass this same object as `linking`.
export const linkingInterceptor: LinkingOptions<any> = {
  prefixes: LINKING_PREFIXES,
  config: { screens: { Instalar: 'instalar' } },
  // ...getInitialURL/subscribe unchanged
};
```
```ts
// src/navigation/linkingConfig.ts — LINKING_CONFIG.screens, TOP-LEVEL sibling
// of Home/Training/Progress/Profile (src/navigation/linkingConfig.ts:53-105).
// Top-level, NOT nested under `Home`, or the URL becomes /home/instalar.
export const LINKING_CONFIG = {
  screens: {
    Home: { /* unchanged */ },
    Training: { /* unchanged */ },
    Progress: { /* unchanged */ },
    Profile: { /* unchanged */ },
    Instalar: 'instalar',
  },
};
```
```tsx
// src/navigation/AuthNavigator.tsx — add alongside Login/SignUp/ForgotPassword
<Stack.Screen name="Instalar" component={InstallScreen} />
```
```tsx
// src/navigation/OnboardingNavigator.tsx — add the type entry too, this
// navigator IS typed (createStackNavigator<OnboardingStackParamList>()):
export type OnboardingStackParamList = {
  Questionnaire: undefined;
  // ...existing keys...
  Instalar: undefined;   // <- add
};
// then:
<Stack.Screen name="Instalar" component={InstallScreen} options={{ headerShown: false }} />
```
```tsx
// src/navigation/MainNavigator.tsx — MainTabParamList is also typed
// (src/navigation/MainNavigator.tsx:84-89):
export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Training: NavigatorScreenParams<TrainingStackParamList>;
  Progress: NavigatorScreenParams<ProgressStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  Instalar: undefined;   // <- add
};
// then, inside <BottomTab.Navigator>, alongside the 4 existing <BottomTab.Screen>:
<BottomTab.Screen
  name="Instalar"
  component={InstallScreen}
  options={{ tabBarButton: () => null }}   // hides the 5th tab entirely, v6 only — see Pitfall 2
/>
```

### Pattern 2: `tabBarButton: () => null` fully hides a tab AND its space, in the installed v6.6.1

**What:** `BottomTabBar.tsx` renders each route's `<BottomTabItem>` as a **direct** child of the flex row, with no per-item wrapper `View`:
```tsx
// node_modules/@react-navigation/bottom-tabs/src/views/BottomTabBar.tsx:294-295, 335-356 (installed v6.6.1)
<View accessibilityRole="tablist" style={styles.content}>
  {routes.map((route, index) => {
    // ...
    return (
      <NavigationContext.Provider key={route.key} value={descriptors[route.key].navigation}>
        <NavigationRouteContext.Provider value={route}>
          <BottomTabItem
            // ...
            button={options.tabBarButton}
            // ...
          />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );
  })}
</View>
```
And `BottomTabItem.tsx` renders the render-prop's return value directly as its own root: `return button({...})` [VERIFIED: node_modules/@react-navigation/bottom-tabs/src/views/BottomTabItem.tsx:279]. If `button` (i.e. `options.tabBarButton`) is `() => null`, `BottomTabItem` returns `null`, and since there is no wrapper `View` around it in the parent's `.map()`, React renders **nothing** for that flex slot — zero width, zero reserved space.

**When to use:** Exactly this case — a screen that must be a top-level sibling of the visible tabs (to get the un-nested `/instalar` path) but must never appear as a 5th tab button.

**Version caveat (why this had to be checked in the installed source, not just "the docs"):** [CITED: reactnavigation.org/docs/bottom-tab-navigator, cross-checked against a GitHub issue] — in react-navigation **v7**, `tabBarButton: () => null` only hides the button visually while the tab still reserves layout space; this regression does **not** apply to the installed **v6.6.1**, confirmed above by reading `BottomTabBar.tsx`/`BottomTabItem.tsx` directly. Do not upgrade `@react-navigation/bottom-tabs` mid-phase without re-verifying this.

### Pattern 3: Web-only guard (reuse `UpdateBanner.tsx`'s exact shape)

**What:** [VERIFIED: src/components/UpdateBanner.tsx:40-41, 80]
```tsx
useEffect(() => {
  if (Platform.OS !== 'web') return undefined;
  // ...window listeners only registered here...
}, [...]);

if (Platform.OS !== 'web') return null;
```
**When to use:** `InstallScreen.tsx` and `installDetection.ts` follow the identical shape — `installDetection.ts`'s functions should short-circuit to safe defaults (see Pitfall 4) rather than touching `window`/`navigator` when they don't exist, and `InstallScreen` returns `null` immediately off-web. This guarantees zero effect on the native target, matching CONTEXT.md's decision verbatim.

### Pattern 4: Document title — no code needed, verify the default is acceptable

**What:** [VERIFIED: node_modules/@react-navigation/native/src/useDocumentTitle.tsx:12-17] `NavigationContainer` always runs `useDocumentTitle` when mounted; since `RootNavigator.js` never passes a `documentTitle` prop, the default formatter applies:
```ts
formatter = (options, route) => options?.title ?? route?.name
```
With no `options.title` set on the `Instalar` screen, `document.title` becomes the literal route name `"Instalar"`. This is the SAME mechanism `OnboardingNavigator.tsx:67` already relies on (`options={{ title: 'Ajustes finais' }}` on `PostQuestionnaireChat`) — if a nicer tab title is wanted (e.g. "Instalar — ForçaApp"), add `options={{ title: 'Instalar — ForçaApp' }}` to each of the three `Instalar` screen registrations; otherwise no action is required and this is not a blocker.

### Anti-Patterns to Avoid
- **Nesting `Instalar` under an existing stack's path (e.g. inside `Home`'s `screens` block):** produces `/home/instalar`, not `/instalar` — breaks the UI-SPEC's explicit requirement that the URL stays literal (see State 3's "URL display" copy, which shows the current page URL back to the user — it must read `/instalar`).
- **Restructuring `MainNavigator.tsx`'s export from a bare `BottomTab.Navigator` into a wrapping `Stack.Navigator`:** technically also solves the top-level-route problem, but is much larger surgery than `tabBarButton: () => null` and risks regressing every existing `navigation.navigate('Home', {screen: ...})` call site across the app (e.g. `RootNavigator.js:25`, `HomeScreen.tsx:334-335`). Not needed for this phase.
- **Only registering `Instalar` in `MainNavigator` and assuming a redirect will handle logged-out visitors:** the target audience is explicitly "aluno leigo... possivelmente antes de ter conta" (CONTEXT.md) — the majority of first-time hits to this URL are logged-out. Skipping Auth/Onboarding registration defeats the phase's entire purpose.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting "already installed" | A custom heuristic beyond documented APIs | `navigator.standalone === true` (legacy iOS Safari) **plus** `window.matchMedia('(display-mode: standalone)').matches` (modern cross-platform) — both checked, CONTEXT.md decision | [CITED: multiple cross-checked sources — MDN/web.dev-adjacent results converge] `matchMedia('display-mode: standalone')` needs iOS 15.4+; `navigator.standalone` covers older iOS. Checking only one under-detects on some iOS versions. |
| Distinguishing Safari-proper from Chrome/Firefox/Edge on iOS | Parsing `navigator.vendor` or feature-sniffing | Token-bundle UA string check: iOS Chrome always includes `CriOS`, Firefox `FxiOS`, Edge `EdgiOS`, Opera `OPiOS`/`OPT` — exclude ALL of these, THEN accept `Safari` | [CITED: cross-checked search results, consistent with well-known UA convention] Every iOS browser is a WebKit wrapper and includes `Safari` in its UA string; the distinguishing signal is which "-iOS" token is present, checked in that order. |
| Unmasking iPadOS's desktop-spoofed UA | Trusting `navigator.platform` | `navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1` as the iPad tell | [CITED: cross-checked search results] iPadOS 13+ reports `navigator.platform` as `"MacIntel"`, identical to real macOS; `maxTouchPoints` is the standard discriminator (touchscreen Macs don't exist). CONTEXT.md already flags this exact edge case as something the utility must handle. |

**Key insight:** Nothing in this phase's detection logic needs a library — the entire domain is ~4 small, pure, synchronous checks with well-known signatures. The complexity that DOES need care is 100% internal to this repo's navigator architecture (three trees, one shared linking object with an empty route table), which is why most of this research is code-read, not library research.

## Common Pitfalls

### Pitfall 1: The pre-auth loading branch has NO `NavigationContainer` — `/instalar` cannot render during it
**What goes wrong:** [VERIFIED: src/navigation/RootNavigator.js:92-100, src/contexts/AuthContext.js:33, 384-416] `RootNavigator` returns a bare `<View>` with only an `ActivityIndicator` + "Carregando..." text while `loadingSession || isLoadingPreference` is true — no `NavigationContainer`, no `linking`, no route resolution of any kind. `loadingSession` starts as `true` (`useState(true)`, `AuthContext.js:33`) and only flips to `false` after `supabase.auth.getSession()` resolves inside an async effect.
**Why it happens:** This is existing, unrelated app boot logic — not something this phase introduces, but every cold visit to `/instalar` (the exact scenario CONTEXT.md describes: "aluno abre no Safari do iPhone deslogado, possivelmente antes de ter conta") passes through this branch first.
**How to avoid:** No code change is required by CONTEXT.md's decisions, and `supabase-js`'s `getSession()` reads from local storage first (no guaranteed network round-trip), so the flash is typically sub-second. Flag this explicitly during UAT — if a real aluno on a slow connection reports a noticeable stall before `/instalar` appears, that is this branch, not a bug in the new screen.
**Warning signs:** UAT reports "a página demorou pra aparecer" / a visible spinner before the install steps show up.

### Pitfall 2: `tabBarButton: () => null` is a v6-only guarantee — do not assume it survives a `@react-navigation` upgrade
**What goes wrong:** Upgrading `@react-navigation/bottom-tabs` past v6 (to v7) silently starts reserving tab-bar space for the hidden `Instalar` tab again, per the CITED find above.
**Why it happens:** react-navigation changed `tabBarButton: () => null` semantics between major versions without an obvious breaking-change flag on this specific API.
**How to avoid:** Don't bundle a react-navigation major bump into this phase; if a future phase upgrades to v7, re-verify this specific behavior by reading `BottomTabBar`/`BottomTabItem` source again (same technique used here) before relying on it.
**Warning signs:** A visible empty gap in the bottom tab bar after any `@react-navigation/*` dependency bump.

### Pitfall 3: Typed navigators (`OnboardingNavigator`, `MainNavigator`) need their `ParamList` types updated too
**What goes wrong:** `OnboardingNavigator.tsx` uses `createStackNavigator<OnboardingStackParamList>()` [VERIFIED: src/navigation/OnboardingNavigator.tsx:30] and `MainNavigator.tsx` uses `createBottomTabNavigator<MainTabParamList>()` [VERIFIED: src/navigation/MainNavigator.tsx:91]. Adding a bare `<Stack.Screen name="Instalar" .../>` / `<BottomTab.Screen name="Instalar" .../>` without adding `Instalar: undefined;` to the corresponding exported type fails `tsc` (this repo's user-level tooling runs a TypeScript check as a PostToolUse hook).
**Why it happens:** `AuthNavigator.tsx` is the one exception — its `Stack = createStackNavigator();` has no generic [VERIFIED: src/navigation/AuthNavigator.tsx:9] — so copying that file's pattern verbatim into the other two navigators produces a type error, not a runtime error, so it can slip past a quick manual test in the browser and only surface at `tsc`/CI time.
**How to avoid:** Add `Instalar: undefined;` to both `OnboardingStackParamList` and `MainTabParamList` in the same edit that adds the `Screen`.
**Warning signs:** `tsc` error "Type '"Instalar"' is not assignable to type ...".

### Pitfall 4: Detection utility must default to the SAFE state on any unrecognized input, never throw or blank
**What goes wrong:** A UA string that doesn't clearly match iOS (e.g. an unusual in-app browser webview, a bot, or a future iOS release with a different token) could make `isIOS()`/`isSafari()` return `undefined`/throw if written as strict regex matches without a default branch.
**Why it happens:** UA sniffing is inherently a moving target; CONTEXT.md and UI-SPEC both explicitly require State 3 (desktop/Android generic fallback) as the landing zone for "detecção inconclusiva" — never a blank/error screen.
**How to avoid:** Structure `installDetection.ts` so the "iOS + Safari" and "iOS + other browser" branches are the ones requiring positive matches, and everything else (including parse failures) falls through to the desktop/Android copy by construction, not by an explicit `try/catch`.
**Warning signs:** A blank white screen reported by any user on any device — CONTEXT.md/UI-SPEC both call this out as an explicit non-goal ("nunca tela vazia ou branca").

### Pitfall 5: CSP is `script-src 'self'` — no inline `<script>` for detection, but this doesn't constrain React code
**What goes wrong:** None expected — flagging only because `vercel.json`'s CSP [VERIFIED: vercel.json — `"script-src 'self'"`, no `'unsafe-inline'` for scripts] would block any inline `<script>` tag approach to detection (e.g. a raw HTML snippet with `document.write` for install instructions). This phase's plan (React component, bundled JS) is already CSP-compliant by construction — same pattern as every other screen in the app.
**Why it happens:** Not a real risk given the planned approach; documented only because the additional_context explicitly asked to confirm CSP doesn't block this route.
**How to avoid:** N/A — just don't introduce an inline `<script>` for this page.
**Warning signs:** Browser console CSP violation reports mentioning `script-src`.

## Code Examples

### `installDetection.ts` — shape consistent with CONTEXT.md's locked decisions
```ts
// src/utils/installDetection.ts (new)
// Puro, síncrono, sem rede — chamado só no mount de InstallScreen (web-only).

const isIOSDevice = (ua: string, maxTouchPoints: number): boolean => {
  // iPhone/iPod sempre se identificam. iPad moderno finge ser Mac
  // (navigator.platform === 'MacIntel') — maxTouchPoints > 1 desmascara.
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
};

const isSafariBrowser = (ua: string): boolean => {
  // Todo navegador em iOS é WebKit e inclui "Safari" na UA — o sinal real é
  // a AUSÊNCIA de qualquer um dos tokens "-iOS" dos outros navegadores.
  const outroNavegadorIOS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua);
  return /Safari/.test(ua) && !outroNavegadorIOS;
};

export const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0);
};

export const isSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return isSafariBrowser(navigator.userAgent);
};

export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const legacyIOSFlag = (navigator as unknown as { standalone?: boolean }).standalone === true;
  const matchMediaFlag =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return legacyIOSFlag || matchMediaFlag;
};
```

### Test mock pattern for `useNavigation()` — copy from `profileScreen.test.tsx`
```tsx
// [VERIFIED: __tests__/profileScreen.test.tsx:18-19] — exact existing pattern,
// reusable verbatim for any InstallScreen test that needs the State 4 CTA.
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
```

### Test pattern for the linking-config edit — copy from `navigationLinking.test.ts`
```ts
// [VERIFIED: __tests__/navigationLinking.test.ts:7-11, 20-28] — this repo already
// tests LINKING_CONFIG directly via getStateFromPath, no navigator mount needed.
// Same technique applies to the new Instalar entry:
import { getStateFromPath } from '@react-navigation/native';
import { LINKING_CONFIG } from '../src/navigation/linkingConfig';

it('URL /instalar resolve para a tela Instalar', () => {
  const state = getStateFromPath('/instalar', LINKING_CONFIG);
  expect(state).not.toBeNull();
  expect(state!.routes[0].name).toBe('Instalar');
});
```

## State of the Art

Not applicable in the classic sense (no library version churn here) — the one relevant "changed over time" fact:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `navigator.standalone` as the only "installed" signal | `navigator.standalone` (iOS legacy) **+** `matchMedia('(display-mode: standalone)')` (iOS 15.4+, and the only signal on Android/desktop Chrome) | iOS 15.4 (2022) added `display-mode` media query support in Safari | Checking only `navigator.standalone` under-detects nothing new on iOS today, but checking only `matchMedia` under-detects on iOS versions before 15.4 still in the wild among the ~20-user target audience — CONTEXT.md's decision to check both is correct and should not be simplified to one check. |
| `tabBarButton: () => null` hides tab + space | Same API, different effect in v7 (space still reserved) | react-navigation v7 (2024/2025) | Only matters if a future phase bumps `@react-navigation/bottom-tabs` past v6 — re-verify then. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UA token-bundle detection (`CriOS`/`FxiOS`/`EdgiOS`/`OPiOS`) is exhaustive enough for "iOS + outro navegador" state 2 | Don't Hand-Roll, Code Examples | A niche iOS browser not covered (e.g. a rare in-app webview) could be misclassified as Safari and shown the wrong (State 1) instructions. Low real-world impact given the ~20-user target audience; cross-checked across multiple sources, tag reflects MEDIUM (`--verified`), not raw web search. |
| A2 | Supabase `getSession()` resolves fast enough on a cold, unauthenticated visit that Pitfall 1's loading flash is imperceptible in practice | Common Pitfalls, Pitfall 1 | If wrong, first-time users could see a multi-second "Carregando..." spinner before the install page appears — directly undermines the "aluno leigo instala sozinho" UAT goal. Not verified with a real network trace in this session; flagged for UAT observation rather than blocking the plan. |

**If this table is empty:** N/A — 2 assumptions logged above; both are MEDIUM-confidence external/runtime-timing claims, not architecture claims (all architecture claims in this document are `[VERIFIED]` against code read this session).

## Open Questions (RESOLVED)

1. **Which route does the State-4 CTA ("Abrir o ForçaApp") navigate to, given `InstallScreen` is mounted in 3 different trees?** — RESOLVED: o Plano 12-01 implementa a recomendação (prop homeRoute na InstallScreen, CTA navega corretamente em cada árvore de mounting).
   - What we know: UI-SPEC explicitly defers the exact mechanism to planner/executor discretion ("Navigates into the app (Home if authenticated, Login if not — exact target/mechanism is planner/executor discretion... do not build a new gate for this one button)"). Each of the 3 registration sites (`AuthNavigator`, `OnboardingNavigator`, `MainNavigator`) statically knows its own correct "home" screen name (`Login`, `Questionnaire`, `Home` respectively) at registration time.
   - What's unclear: whether the plan should pass this as a prop at each registration site (`children={() => <InstallScreen homeRoute="Login" />}`) or have `InstallScreen` call `useNavigation()` and rely on `navigation.navigate` resolving within whichever stack it's currently mounted in (simpler code, but only correct if the target route name always exists in the CURRENT tree — which it does, since each tree's own home route is being targeted from within that same tree).
   - Recommendation: prefer the prop-based approach — it's directly testable via `render(<InstallScreen homeRoute="Login" onOpenApp={mockNavigate} />)` without any `useNavigation()` mock plumbing beyond what `profileScreen.test.tsx` already demonstrates, and it makes the per-tree intent explicit and reviewable at each of the 3 registration call sites rather than implicit.

## Environment Availability

Not applicable — this phase has no external service/CLI/runtime dependency beyond what's already installed and verified in Standard Stack (all `node_modules` present, no new install, no network dependency for the feature itself).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `jest-expo` preset [VERIFIED: package.json `"jest": { "preset": "jest-expo", ... }`], Jest ^29.7.0, `@testing-library/react-native` ^13.3.3 |
| Config file | `package.json` (`"jest": {...}` block) — no separate `jest.config.js` for the unit suite (a `jest.integration.config.js` exists but is out of scope, used only by `npm run test:integration:pg`) |
| Quick run command | `npx jest __tests__/InstallScreen.test.tsx __tests__/installDetection.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-02 | 4 detected states render correct copy (iOS+Safari / iOS+outro navegador / desktop-Android / standalone) | unit (RTL) | `npx jest __tests__/InstallScreen.test.tsx -x` | ❌ Wave 0 |
| INST-02 | `installDetection.ts` unit coverage: `isIOS`/`isSafari`/`isStandalone`, including CriOS/FxiOS exclusion and iPadOS desktop-UA unmasking | unit | `npx jest __tests__/installDetection.test.ts -x` | ❌ Wave 0 |
| INST-02 | `/instalar` resolves to the `Instalar` route in `LINKING_CONFIG` (Main tree) without mounting a full navigator | unit | `npx jest __tests__/navigationLinking.test.ts -x` (extend existing file) | pattern exists, new assertion needed |
| INST-02 | Page is inert (`null`) off-web (`Platform.OS !== 'web'`) | unit (RTL) | included in `InstallScreen.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest __tests__/InstallScreen.test.tsx __tests__/installDetection.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the UAT criterion (real iPhone Safari install, unassisted) — this project has no CI, so both checks are always local (per STATE.md's documented constraint: "Repo sem CI de testes local — verificação sempre local").

### Wave 0 Gaps
- [ ] `__tests__/InstallScreen.test.tsx` — covers INST-02 (4-state RTL rendering, mocking `installDetection.ts`, plus web-only guard)
- [ ] `__tests__/installDetection.test.ts` — covers INST-02 (pure-function unit tests: UA token bundles, `maxTouchPoints` iPad unmasking, `matchMedia`/`navigator.standalone` combinations, unrecognized-UA fallback)
- [ ] Extend `__tests__/navigationLinking.test.ts` with the `/instalar` → `Instalar` assertion (pattern already exists in the file, see Code Examples)
- [ ] No new test framework install needed — `jest-expo`/RTL already cover this repo's needs

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no | Page is intentionally public/auth-agnostic by design (CONTEXT.md decision) |
| V3 Session Management | no | No session read/write on this screen; reuses whatever `RootNavigator` already resolved |
| V4 Access Control | no | No privileged action, no data access — informational content only |
| V5 Input Validation | n/a | No user input on this page (no forms, no query-string parsing beyond the fixed literal path) |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| UA/`matchMedia` spoofing to force a misleading install flow | Tampering (client-side only, low severity) | Not a security boundary — worst case is a user sees the wrong copy (e.g. desktop fallback instead of iOS steps), never a data or auth exposure. No mitigation needed beyond the existing "always fall back safely" design (Pitfall 4). |
| Inline script injection via a install-instructions page | Tampering/XSS | Already covered by the project-wide CSP (`script-src 'self'`, verified in `vercel.json`) — this phase introduces no new HTML/script surface, only React components rendered through the existing bundle. |

## Sources

### Primary (HIGH confidence — code read this session)
- `src/navigation/RootNavigator.js` — full read, all 3 render branches
- `src/navigation/linking.ts` — full read, `linkingInterceptor`/`linkingMain`
- `src/navigation/linkingConfig.ts` — full read, `LINKING_CONFIG`
- `src/navigation/AuthNavigator.tsx`, `OnboardingNavigator.tsx`, `MainNavigator.tsx` — full read
- `src/contexts/AuthContext.js` — `loadingSession` initialization and resolution path
- `src/components/UpdateBanner.tsx` + `__tests__/UpdateBanner.test.tsx` — web-only guard + jsdom test pattern
- `src/components/ui/AuthLayout.tsx`, `Feedback.tsx`, `Button.tsx`, `Logo.tsx`, `index.ts` — reusable UI primitives
- `src/theme/theme.ts` — every token cited in UI-SPEC cross-checked against source
- `node_modules/@react-navigation/native/src/useDocumentTitle.tsx` — document title default behavior
- `node_modules/@react-navigation/bottom-tabs/src/views/BottomTabBar.tsx`, `BottomTabItem.tsx` — `tabBarButton: () => null` behavior, installed v6.6.1
- `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json` — confirmed `share`, `plus-square`, `check-circle` all exist
- `vercel.json` — rewrite regex and CSP headers
- `__tests__/profileScreen.test.tsx`, `__tests__/navigationLinking.test.ts` — existing test patterns reused
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`, `12-CONTEXT.md`, `12-UI-SPEC.md`

### Secondary (MEDIUM confidence — web-sourced, cross-checked across ≥2 independent results)
- iOS browser UA token bundles (CriOS/FxiOS/EdgiOS/OPiOS exclusion order)
- iPadOS 13+ `navigator.platform === 'MacIntel'` + `maxTouchPoints` unmasking technique
- `navigator.standalone` vs `matchMedia('(display-mode: standalone)')` — iOS version support boundary (15.4+)
- `tabBarButton: () => null` v6-vs-v7 behavior difference (cross-checked against the installed source, so the v6 half of this claim is actually HIGH/`[VERIFIED]`; only the v7-caveat half remains MEDIUM/`[CITED]`)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all versions read directly from `package.json`/`node_modules`
- Architecture (navigator/linking mechanism): HIGH — every claim backed by a direct file read with line numbers, including `node_modules` source for the one library-behavior claim that mattered
- Detection utility (UA sniffing, standalone checks): MEDIUM — correct and cross-checked against multiple independent web sources, but inherently a moving target (browser UA strings change over time); no official single source of truth exists for this domain
- Pitfalls: HIGH for Pitfalls 1, 3, 5 (code-verified); MEDIUM for Pitfalls 2, 4 (library-version caveat and detection edge case)

**Research date:** 2026-08-15
**Valid until:** 30 days for the navigator/linking architecture (stable, internal, changes only if this repo's own code changes); 90 days for the UA-detection technique unless Apple ships a new iOS major version in the interim (iOS major releases have historically been the trigger for UA-string changes)
