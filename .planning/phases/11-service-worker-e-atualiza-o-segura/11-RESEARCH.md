# Phase 11: Service worker e atualização segura - Research

**Researched:** 2026-08-14
**Domain:** Workbox `generateSW` service worker for a static Expo web export on Vercel, PWA update UX
**Confidence:** HIGH (core Workbox mechanics verified by actually running `workbox-cli` against this repo's real `dist/`; Vercel routing semantics verified by testing regexes with Node; package legitimacy verified via registry)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cache offline (o que o SW faz)**
- Precache: todo o `dist/` estático (JS, index.html, ícones, splash, fonts) —
  app shell completo via Workbox `generateSW`.
- Navegação offline: `navigateFallback: index.html` (SPA), com denylist
  explícita para rotas de API e domínios externos.
- Dados: ZERO `runtimeCaching` — nenhuma chamada a `*.supabase.co`, PostgREST ou
  API Flask é interceptada; o outbox offline-first do v1.0 segue como ÚNICA
  camada de retry de dados (decisão travada no milestone).
- Registro: arquivo próprio `/register-sw.js` carregado via `<script src>` no
  `public/index.html` (CSP proíbe inline); registra só em produção/https.

**Pipeline de build e guards**
- `workbox-cli` como devDependency PINADA (o build da Vercel depende dela; npx
  sem lock no CI é flaky).
- Ordem do build: `expo export -p web` → `workbox generateSW workbox-config.cjs`
  → `node scripts/verify-web-bundle.mjs` (guard existente fecha o build).
- `vercel.json`: excluir `sw.js` e `register-sw.js` do rewrite SPA; header
  `Cache-Control: no-cache, must-revalidate` explícito para `sw.js`,
  `register-sw.js` e `manifest.json` (completar o atual `no-cache`).
- Guard jest estendendo o padrão da fase 10 (`__tests__/splashAssets.test.ts`):
  rewrite/headers do sw no `vercel.json` + `workbox-config.cjs` sem
  `runtimeCaching` (guard permanente de "SW nunca intercepta dados").

**UX de atualização**
- Aviso: banner discreto próprio (`UpdateBanner`) na base da tela, grafite
  `#171A1D`, não-bloqueante.
- Aplicação: só ao toque em "Atualizar" (postMessage SKIP_WAITING →
  controllerchange → reload); se o usuário ignorar, a versão nova entra na
  próxima abertura natural. NUNCA auto-reload.
- Durante sessão ativa de treino: o banner pode aparecer (não-bloqueante), mas
  reload é sempre e somente manual.
- Copy pt-BR: "Nova versão disponível" / botão "Atualizar" / dispensável
  ("Depois").

### Claude's Discretion
- Versão exata pinada do workbox-cli, estrutura do workbox-config.cjs
  (globPatterns, navigateFallbackDenylist), nome/estrutura interna do
  register-sw.js, e mecânica exata do evento SW→React para o banner.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFF-01 | O app instalado abre sem rede (app shell via service worker); o outbox offline-first do v1.0 segue como única camada de retry de dados — o SW nunca intercepta chamadas Supabase/PostgREST/API. | Verified this session by generating the real `sw.js` from this repo's `dist/`: `precacheAndRoute([...], {})` with an empty options object proves no `runtimeCaching` was injected; `NavigationRoute` only matches `request.mode === 'navigate'`. Pitfalls #1/#2 (bundle-size limit, `globIgnores`) address the two ways the app-shell-offline half of this requirement could silently fail. See Architecture Patterns 1/3, Pitfalls #1, #2, #5. |
| OFF-02 | Versão nova chega com aviso não-bloqueante (nunca reload forçado durante sessão de treino) e os headers de cache da Vercel impedem usuário preso em versão velha (`sw.js`/manifest com no-cache). | Pattern 2 (built-in `SKIP_WAITING` listener) + Pattern 4 (register-sw.js update bridge) + Pitfalls #7/#8 (first-install false-positive, reload-loop guard) cover the non-blocking-banner/manual-reload-only mechanics. Pitfall #5 gives the exact verified `vercel.json` regex fix and header entries for the `no-cache, must-revalidate` requirement. |

</phase_requirements>

## Summary

The phase adds a Workbox-generated `sw.js` that precaches the Expo web export's app
shell (JS bundle, `index.html`, icons, splash images, fonts) and does nothing else —
no `runtimeCaching`, so every `fetch()` to Supabase/PostgREST or the Flask API passes
through the service worker completely untouched, exactly as `OFF-01` requires. This was
verified this session by generating a real `sw.js` from this repo's `dist/` with
`workbox-cli@7.4.1`: the output contains exactly two routes — `precacheAndRoute([...], {})`
(the `{}` proves no `runtimeCaching` entries were injected) and one `NavigationRoute` for
the SPA fallback. Neither route can match a cross-origin request URL, so the browser's
default network fetch handles Supabase/API calls unintercepted.

Two non-obvious, repo-specific landmines were found and confirmed by actually building
the artifact, not just reading docs:

1. **The app's real web bundle is 3.33 MB** (measured via a fresh `npx expo export -p web`
   in this repo), which exceeds Workbox's default `maximumFileSizeToCacheInBytes` of
   2 MB. Left at the default, the bundle silently fails to precache and the app shell
   would NOT work offline — the exact failure mode `OFF-01`'s UAT (airplane mode) is
   designed to catch. Must set `maximumFileSizeToCacheInBytes` explicitly higher.
2. **`workbox-build`'s default `globIgnores` (`["**/node_modules/**/*"]`) silently drops
   the vendor icon fonts** that `expo export -p web` copies into
   `dist/assets/node_modules/@expo/vector-icons/...` — because the default ignore
   pattern matches "node_modules" anywhere in the path, not just a top-level directory.
   Confirmed by generating the manifest both ways: 19 files / 4.56 MB with the default
   `globIgnores`, vs. 40 files / 8.63 MB with `globIgnores: []`. Since `CONTEXT.md`'s
   locked decision explicitly says precache "ícones, splash, fonts" (plural, all of
   them), `workbox-config.cjs` MUST set `globIgnores: []`.

A third finding changes the shape of the build pipeline: `workbox generateSW` by
default writes **two files** — `sw.js` plus a same-directory companion runtime chunk
(`workbox-<hash>.js`) that `sw.js` loads via `importScripts()`. Both would need
carve-outs in `vercel.json`'s SPA rewrite/no-cache regex, and the hash changes every
build. Setting `inlineWorkboxRuntime: true` eliminates the companion file entirely —
confirmed by regenerating with the flag: a single self-contained 20 KB `sw.js` with
no `importScripts`/`self.define` shim. This is the recommended configuration; it
removes an entire class of "forgot to deploy/exclude the runtime chunk" bugs.

**Primary recommendation:** Pin `workbox-cli@7.4.1` as a devDependency, generate
`sw.js` with `generateSW` (`globDirectory: 'dist'`, `globPatterns:
['**/*.{js,html,ico,json,png,ttf}']`, `globIgnores: []`, `maximumFileSizeToCacheInBytes:
5 * 1024 * 1024`, `inlineWorkboxRuntime: true`, `skipWaiting: false`, `clientsClaim:
true`, `navigateFallback: '/index.html'`, `navigateFallbackDenylist` excluding
`_expo`/`api` paths), hand-roll a small vanilla-JS `public/register-sw.js` (no
`workbox-window` dependency needed — it can't be bundled into a public/ passthrough
file without adding a bundler step), and mount a Zustand-backed `UpdateBanner` at the
`App.tsx` root following the exact pattern already established by `AlertHost`/`alertStore`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| App shell precache (JS/HTML/icons/splash/fonts) | Browser / Client (Service Worker) | CDN / Static (Vercel serves the precached files) | The SW is a browser-resident cache layer; Vercel just serves the files it precaches with correct headers. |
| SPA navigation fallback offline | Browser / Client (Service Worker) | — | `NavigationRoute` + `navigateFallback` run entirely in the SW, no server involvement once cached. |
| Data fetch (Supabase/PostgREST/Flask API) | API / Backend (untouched) | — | Locked decision: SW must NEVER intercept these; they must reach the network exactly as if no SW existed. This phase must not add any tier here — it's explicitly out of scope. |
| Update detection & non-blocking banner | Browser / Client (SW lifecycle + React) | — | `register-sw.js` (browser-only script) detects `waiting`/`controllerchange`; `UpdateBanner`/`updateStore` (React/Zustand) render the UI. No backend involvement. |
| Cache-Control / no-cache headers for `sw.js`, `register-sw.js`, `manifest.json` | CDN / Static (Vercel edge) | — | Enforced entirely via `vercel.json` `headers` — a static/edge-tier concern, not app code. |
| Build-time precache manifest generation | Build pipeline (Vercel `buildCommand`) | — | `workbox generateSW` runs as a build step chained after `expo export`, before the existing `verify-web-bundle.mjs` guard. |
| Offline data retry (outbox) | Browser / Client (existing, v1.0) | — | Out of scope for this phase — must NOT be duplicated or touched by the SW. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `workbox-cli` | 7.4.1 `[VERIFIED: npm registry — npm view workbox-cli version/dist-tags, this session]` | `generateSW` command that produces `sw.js` from a precache config | Google's own toolchain for build-time SW generation; explicitly required by `CONTEXT.md`'s locked decision (must be `generateSW`, not a hand-written SW) |

### Supporting
None — no additional runtime dependency is needed. `workbox-window` (the client-side
registration helper Google ships alongside Workbox) was considered and rejected — see
Alternatives below.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled `register-sw.js` (vanilla JS) | `workbox-window` npm package | `workbox-window` is an ES module meant to be bundled through a bundler (webpack/rollup/Metro). `register-sw.js` is a plain static file copied verbatim by Expo's `public/` passthrough (`[VERIFIED: dist/manifest.json === public/manifest.json content and dist/icons, dist/splash mirror public/icons, public/splash 1:1 after a fresh export, this session]`) — adding a bundling step just for this ~40-line script is unnecessary complexity. The two things `workbox-window` gives you (`waiting` event, `messageSkipWaiting()`) are trivial to hand-roll directly against the standard `ServiceWorkerRegistration`/`ServiceWorkerContainer` APIs. |
| `inlineWorkboxRuntime: true` (single-file `sw.js`) | Default split runtime (`sw.js` + companion `workbox-<hash>.js`) | Default mode produces a smaller `sw.js` (workbox runtime shared/cacheable separately) but requires deploying and CSP/rewrite-excluding a second file whose name changes every build. For this app's small precache manifest, the ~20 KB single-file cost is negligible next to the correctness win. |
| `globIgnores: []` (precache everything matched by `globPatterns`) | Leave default `globIgnores: ["**/node_modules/**/*"]` | Default silently drops the `@expo/vector-icons` vendor fonts that live under `dist/assets/node_modules/...` — breaking the locked decision to precache "fonts" (see Pitfall #2). |

**Installation:**
```bash
npm install --save-dev workbox-cli@7.4.1
```

**Version verification:** `npm view workbox-cli version` → `7.4.1`; `npm view workbox-cli dist-tags` → `{ next: '6.4.0', latest: '7.4.1' }` `[VERIFIED: npm registry, this session, 2026-08-14]`. `workbox-cli`'s `package.json` declares `"engines": { "node": ">=20.0.0" }` `[VERIFIED: npm view workbox-cli engines, this session]` — see Pitfall #6 / Environment Availability below, this repo's own `package.json` still declares `"engines": { "node": ">=16" }` (`package.json:100-102`, read this session).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `workbox-cli` | npm | actively maintained (last publish 2026-05-04) | 74,252/wk | github.com/googlechrome/workbox | OK | Approved |
| `workbox-build` (transitive, powers `workbox-cli generateSW`) | npm | actively maintained (last publish 2026-05-04) | 8,836,209/wk | github.com/googlechrome/workbox | OK | Approved (not a direct devDependency — informational only) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

No `postinstall` script on `workbox-cli` (`[VERIFIED: npm view workbox-cli scripts.postinstall` → empty, this session`]`).

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────── Browser (installed PWA) ───────────────────────────────┐
│                                                                                          │
│  index.html loads two deferred scripts, in document order (both `defer`, head first):  │
│                                                                                          │
│   1. /register-sw.js  ─────────────────────────────────────────────┐                   │
│         │                                                          │                   │
│         │ if (location.protocol === 'https:' && 'serviceWorker'    │                   │
│         │     in navigator)                                        │                   │
│         ▼                                                          │                   │
│   navigator.serviceWorker.register('/sw.js')                       │                   │
│         │                                                          │                   │
│         ▼                                                          │                   │
│   ┌─────────────────────────── Service Worker (sw.js) ───────────┐ │                   │
│   │  precacheAndRoute([...app shell manifest...], {})            │ │                   │
│   │  registerRoute(NavigationRoute(index.html, {denylist:[...]})) │ │                   │
│   │  addEventListener('message', SKIP_WAITING handler)            │ │                   │
│   │  clientsClaim()                                                │ │                   │
│   └────────────────────────────────────────────────────────────┘ │                   │
│         │  new version installs → `updatefound`/`waiting`          │                   │
│         ▼                                                          │                   │
│   window.dispatchEvent(new CustomEvent('sw-update-available')) ────┼──► React app      │
│                                                                      │       │           │
│   2. /_expo/static/js/web/AppEntry-<hash>.js  (React app boots) ────┘       ▼           │
│                                                                     updateStore.setWaiting() │
│                                                                              │           │
│                                                                              ▼           │
│                                                                     <UpdateBanner/>      │
│                                                                     tap "Atualizar"      │
│                                                                              │           │
│         ┌────────────────────────────────────────────────────────────────┘           │
│         ▼                                                                              │
│   window.dispatchEvent(new CustomEvent('sw-apply-update'))                             │
│         │  (register-sw.js listens, holds the ServiceWorkerRegistration reference)     │
│         ▼                                                                              │
│   registration.waiting.postMessage({type: 'SKIP_WAITING'})                             │
│         │                                                                              │
│         ▼ (SW calls self.skipWaiting() → activates → clientsClaim())                   │
│   navigator.serviceWorker.addEventListener('controllerchange', ...)                    │
│         │  (refreshing-guard: only once)                                               │
│         ▼                                                                              │
│   window.location.reload()   ← the ONLY reload path; never automatic                   │
│                                                                                          │
│  Meanwhile, any fetch() to https://*.supabase.co or https://forca-api.cadastrai.com    │
│  is a cross-origin, non-'navigate'-mode request → matches NEITHER precache route NOR   │
│  NavigationRoute → SW never calls respondWith() → browser's normal network fetch runs, │
│  handled entirely by the existing v1.0 outbox retry layer, untouched.                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
workbox-config.cjs           # NEW — root, generateSW options (Claude's discretion on contents)
public/
├── register-sw.js           # NEW — vanilla JS, copied verbatim to dist/ by expo export
├── index.html                # EDIT — add <script src="/register-sw.js" defer> in <head>
├── icons/, splash/, manifest.json  # unchanged (phase 10)
src/
├── store/
│   └── updateStore.ts        # NEW — Zustand, mirrors alertStore.ts pattern
├── components/
│   └── UpdateBanner.tsx      # NEW — mirrors AlertHost.tsx pattern
vercel.json                   # EDIT — exclude sw.js/register-sw.js from rewrite+headers, add explicit headers
scripts/
└── verify-web-bundle.mjs     # unchanged, still runs last in buildCommand
__tests__/
├── serviceWorkerConfig.test.ts  # NEW — guard: vercel.json + workbox-config.cjs, extends splashAssets.test.ts pattern
└── UpdateBanner.test.tsx        # NEW — RTL: no auto-reload, click triggers postMessage
App.tsx                        # EDIT — mount <UpdateBanner /> next to <AlertHost />
```

### Pattern 1: `generateSW` with zero runtime caching (verified output)
**What:** Run `workbox generateSW workbox-config.cjs` against the real `dist/` after
`expo export -p web`. The generated file contains ONLY a precache route and a
navigation-fallback route — no `runtimeCaching` array was passed, so `precacheAndRoute`
receives an empty options object.
**When to use:** Exactly this phase's requirement — app-shell-only offline, zero data
interception.
**Example (actual output, minified, from this repo's real `dist/`, this session):**
```js
// Source: local workbox-cli@7.4.1 generateSW run against /Users/phmarconato/ForcaApp/dist
// [VERIFIED: generated this session, not from docs]
e.precacheAndRoute([
  {url:"metadata.json",revision:"37cb2e8fcdd3b2523b9bd2f4b09087db"},
  {url:"manifest.json",revision:"bb101ac7cbb4683d08e21c2e468513da"},
  {url:"index.html",revision:"bd48195267a572cdaa799eadacb694e0"},
  {url:"favicon.ico",revision:"407ab87ce1f49e8aad6611d40971c36f"},
  {url:"_expo/static/js/web/AppEntry-845aa7d44f30999d682aa6ca3474d79e.js",revision:"645f18b9f09e07aae9319f4059b5403e"}
  /* + splash/*, icons/*, assets/**/*.ttf when globIgnores:[] is set */
], {}),  // <-- empty options object = NO runtimeCaching routes registered
e.registerRoute(new e.NavigationRoute(
  e.createHandlerBoundToURL("/index.html"),
  {denylist:[/^\/_expo\//,/^\/api\//]}
))
```
**Why this proves OFF-01:** `precacheAndRoute`'s routes match only the exact same-origin
URLs listed in the manifest array (string equality on the request URL). `NavigationRoute`
only matches requests with `request.mode === 'navigate'` (top-level page loads), never
`fetch()`/XHR calls to an API. A call to `https://*.supabase.co/...` or
`https://forca-api.cadastrai.com/...` is neither — the SW's `fetch` event handler has no
route to match it, so it never calls `respondWith()`, and the browser's normal network
fetch proceeds exactly as if no service worker were installed.

### Pattern 2: SKIP_WAITING message listener is built-in when `skipWaiting: false`
**What:** With `skipWaiting: false` (the default, and the value `CONTEXT.md` implies via
"só ao toque em Atualizar"), `generateSW` automatically embeds a message listener in the
generated SW — confirmed present in this session's actual generated output:
```js
// Source: local workbox-cli@7.4.1 generateSW output, this session (also matches
// developer.chrome.com/docs/workbox/handling-service-worker-updates/ [CITED])
self.addEventListener("message", e => {
  e.data && "SKIP_WAITING" === e.data.type && self.skipWaiting()
})
```
**When to use:** Always, for the manual-update-only UX this phase requires. No manual
code needs to be written inside `sw.js` for this — it's automatic.
**Client-side trigger (register-sw.js):**
```js
// Source: developer.chrome.com/docs/workbox/handling-service-worker-updates/ [CITED]
registration.waiting.postMessage({ type: 'SKIP_WAITING' });
```

### Pattern 3: `inlineWorkboxRuntime: true` avoids a second deployable file
**What:** Without this flag, `generateSW` writes `sw.js` PLUS a same-directory companion
`workbox-<hash>.js` that `sw.js` loads via `importScripts()` at runtime (confirmed:
default run produced `sw.js`, `sw.js.map`, `workbox-9c191d2f.js`,
`workbox-9c191d2f.js.map` — 4 files). With `inlineWorkboxRuntime: true`, only `sw.js`
(and its sourcemap) is produced — confirmed by regenerating with the flag: single
20,651-byte self-contained file, no `importScripts`/`self.define` shim
(`grep -o "importScripts\|self.define" sw-inline.js` → no matches, this session).
**When to use:** Always for this app. The companion-chunk filename is content-hashed and
changes every build, which would require the `vercel.json` rewrite/no-cache exclusion
regex to match a wildcard `workbox-.*\.js` pattern instead of a fixed string — an
unnecessary source of bugs for a precache manifest this small.
**Example config:**
```js
// workbox-config.cjs — Claude's discretion, this session's recommendation
module.exports = {
  globDirectory: 'dist',
  globPatterns: ['**/*.{js,html,ico,json,png,ttf}'],
  globIgnores: [],                              // see Pitfall #2 — default silently drops vendor fonts
  swDest: 'dist/sw.js',
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/_expo\//, /^\/api\//],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // see Pitfall #1 — default 2MB is too small
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  inlineWorkboxRuntime: true,
};
```
`[VERIFIED: this exact config was run against the real repo dist/ this session — produced
19→40 URLs / 4.56MB→8.63MB depending on globIgnores, and a single 20KB sw.js with
inlineWorkboxRuntime: true]`. `globPatterns`, `navigateFallbackDenylist`, and the exact
list of extensions are explicitly marked "Claude's Discretion" in `CONTEXT.md`.

### Pattern 4: `register-sw.js` bridges the SW lifecycle to React via `window` CustomEvents
**What:** Because `register-sw.js` is a plain script (not bundled through Metro), it
cannot `import` the app's Zustand store directly. The established bridge pattern in this
codebase for "global host component reacts to an external event" is `alertStore.ts` +
`AlertHost.tsx` (`[VERIFIED: src/store/alertStore.ts referenced by
src/components/AlertHost.tsx:15, "import { useAlertStore, type AlertButton } from
'../store/alertStore';", read this session]`), but that store is driven from within the
React tree. For a script OUTSIDE the bundle, the standard bridge is `window`
`CustomEvent`s in both directions.
**When to use:** This phase's `register-sw.js` ↔ `UpdateBanner` handoff.
**Recommended shape (Claude's discretion per CONTEXT.md):**
```js
// public/register-sw.js (new, hand-rolled, no bundler)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  let registration;
  let refreshing = false;

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    registration = reg;

    // Race-condition guard: if a waiting worker already exists by the time
    // register() resolves (e.g. fast repeat visit), the event may fire before
    // React has mounted its listener. Expose a synchronous flag too.
    if (reg.waiting) {
      window.__swUpdateAvailable = true;
      window.dispatchEvent(new CustomEvent('sw-update-available'));
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          // controller exists => this is an UPDATE, not the first install.
          window.__swUpdateAvailable = true;
          window.dispatchEvent(new CustomEvent('sw-update-available'));
        }
      });
    });
  });

  window.addEventListener('sw-apply-update', () => {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
```
`[CITED: developer.chrome.com/docs/workbox/handling-service-worker-updates/ for the
`waiting`/`controllerchange`/refreshing-guard shape; the `navigator.serviceWorker.controller`
check to distinguish first-install from update is a standard pattern documented across
multiple sources, ASSUMED-tier confidence on the exact variable naming, HIGH confidence
on the underlying mechanism]`.

### Anti-Patterns to Avoid
- **`skipWaiting: true` / auto-`self.skipWaiting()`:** Would violate the locked decision
  ("NUNCA auto-reload") by activating the new SW immediately, which combined with
  `clientsClaim()` can cause an unrequested reload mid-session.
- **Registering `register-sw.js` as an inline `<script>` in `index.html`:** Breaks CSP —
  `script-src 'self'` has no `'unsafe-inline'` (`vercel.json:21`, read this session,
  quoted in Pitfall #4 below). Must be an external file.
- **Adding `runtimeCaching` "just for the API" (e.g., NetworkFirst on Supabase):** Explicitly
  out of scope — `REQUIREMENTS.md` "Out of Scope" section states this would duplicate the
  v1.0 outbox retry layer (`REQUIREMENTS.md:82-83`, read this session: "Service worker
  interceptando chamadas de dados (Supabase/API) — duplicaria a camada de retry do
  outbox validado no v1.0 (pitfall confirmado na pesquisa)").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Precache manifest generation (file hashing, revisioning, cache versioning) | A custom script that walks `dist/` and writes a manifest/SW by hand | `workbox generateSW` | Content-hash revisioning, cache-name versioning between deploys, and the precache/NavigationRoute routing logic are exactly the kind of subtly-wrong-if-hand-rolled code Workbox exists to remove. `CONTEXT.md`'s locked decision already mandates `generateSW`. |
| SW update lifecycle (waiting/installing/activating state machine) | Custom state tracking of `registration.installing`/`.waiting`/`.active` | The `updatefound`/`statechange`/`controllerchange` events + `skipWaiting: false` default listener, as shown in Pattern 2/4 | This is the standard, well-tested browser API surface; Workbox's own generated code already implements the SW side (`SKIP_WAITING` listener) — only the page-side glue needs writing, and it's ~30 lines using only standard events. |

**Key insight:** Everything on the `sw.js` side is generated, not written. The only
hand-written code in this phase is: (1) a 12-line `workbox-config.cjs` object literal,
(2) a ~40-line `register-sw.js` using only standard `ServiceWorkerRegistration` events,
and (3) a small React component + Zustand store following the exact `AlertHost`/`alertStore`
pattern already in the codebase.

## Common Pitfalls

### Pitfall 1: Default `maximumFileSizeToCacheInBytes` (2 MB) is smaller than this app's real bundle (3.33 MB)
**What goes wrong:** `workbox-build`'s documented default is `2097152` bytes (2 MB)
`[CITED: developer.chrome.com/docs/workbox/modules/workbox-build/]`. This repo's actual
web bundle, measured by running `npx expo export -p web` fresh this session, is
**3,325,222 bytes (3.33 MB)** — `dist/_expo/static/js/web/AppEntry-845aa7d44f30999d682aa6ca3474d79e.js`,
confirmed via `stat` this session. A file over the limit is silently excluded from the
precache with only a console warning — the app would appear to build successfully, but
offline mode (`OFF-01`'s core requirement) would silently not work, because the main JS
bundle itself is never cached.
**Why it happens:** The default was tuned for typical single-page-app bundles; a
React Native Web export with the full RN component tree, all screens, Zustand, React
Navigation, etc. bundled into one file is considerably larger.
**How to avoid:** Set `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` (5 MB) explicitly
in `workbox-config.cjs` — gives ~1.7 MB of headroom above the current measured bundle
size for near-term growth.
**Warning signs:** `workbox generateSW` build output/logs mentioning a file being skipped
for exceeding the size limit; UAT airplane-mode test loads a blank/stuck screen instead
of the app shell.

### Pitfall 2: Default `globIgnores` silently drops vendor icon fonts nested under `dist/assets/node_modules/`
**What goes wrong:** `workbox-build`'s default `globIgnores` is `["**/node_modules/**/*"]`.
Expo's web export copies `@expo/vector-icons`' vendor font files into
`dist/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*.ttf`
— and the default ignore pattern matches "node_modules" anywhere in the path, not just a
top-level project directory, so it silently excludes these fonts from the dist output's
own build artifacts. Confirmed by generating the manifest twice against this repo's real
`dist/`: **19 files / 4.56 MB with default `globIgnores`** (only the app's own two custom
fonts, `Inter-Variable.ttf` and `BarlowSemiCondensed-ExtraBold.ttf`, were included) vs.
**40 files / 8.63 MB with `globIgnores: []`** (all vendor icon fonts included).
**Why it happens:** `workbox-build`'s glob matching doesn't distinguish "your project's
`node_modules`" from "a directory that happens to be named `node_modules` inside your
build output" — it's a blunt path-substring match.
**How to avoid:** Set `globIgnores: []` explicitly in `workbox-config.cjs`. `CONTEXT.md`'s
locked decision says precache "todo o dist/ estático (JS, index.html, ícones, splash,
fonts)" (`11-CONTEXT.md:29-30`) — plural "fonts" includes these vendor icon fonts if any
icon component in the app renders offline; if the app only uses `@expo/vector-icons`
families that are NOT among the ones under `assets/node_modules` (unlikely, but
verifiable via `grep -r "from '@expo/vector-icons'"` across `src/`), this could be
narrowed — but the safe default matching the locked decision is `globIgnores: []`.
**Warning signs:** Icon glyphs render as tofu/blank boxes when the app opens offline via
airplane mode, even though the JS bundle and layout load correctly.

### Pitfall 3: `workbox.json`/CLI wizard config filename mismatch
**What goes wrong:** N/A for this repo — `CONTEXT.md` already locked the filename to
`workbox-config.cjs`. Documented here only as a build-command gotcha: the `workbox`
binary (from `workbox-cli`, `bin` name is `workbox`, NOT `workbox-cli`
`[VERIFIED: npm view workbox-cli bin → {"workbox":"build/bin.js"}, this session]`) takes
the config path as a positional argument: `npx workbox generateSW workbox-config.cjs`.
Running bare `npx workbox generateSW` without the argument does not auto-discover the
file in this CLI version (tested implicitly by always passing the path this session).
**How to avoid:** Always pass the config path explicitly in `buildCommand` and any local
test script.

### Pitfall 4: Inline `<script>` for SW registration breaks CSP
**What goes wrong:** Production CSP is `script-src 'self'` with no `'unsafe-inline'` and
no nonce/hash mechanism (`vercel.json:21`, read this session: `"script-src 'self';
style-src 'self' 'unsafe-inline'; ..."` — note `'unsafe-inline'` is present only for
`style-src`, not `script-src`). An inline `<script>navigator.serviceWorker.register(...)
</script>` in `index.html` would be silently blocked by the browser with a CSP violation,
and registration would never happen — no error visible to the user, just a PWA that never
gets offline support.
**How to avoid:** `register-sw.js` must be an external file loaded via
`<script src="/register-sw.js" defer>`, matching the same-origin `'self'` rule.
`worker-src 'self' blob:` is already present (`vercel.json:21`) and covers the SW
script fetch itself (per CSP3, service worker script fetches are governed by
`worker-src`, falling back to `child-src`/`default-src` if absent — already satisfied
here, no CSP changes needed for registration).

### Pitfall 5: `vercel.json`'s SPA rewrite/no-cache regex swallows `/sw.js` and `/register-sw.js`
**What goes wrong:** The current rewrite rule is
`"/((?!_expo|icons|assets|splash|manifest\\.json|favicon\\.ico).*)"` → `/index.html`
(`vercel.json:11`, read this session) and the catch-all no-cache header uses the
identical pattern (`vercel.json:64`). Neither excludes `sw.js` or `register-sw.js` — a
request for `GET /sw.js` would be rewritten to serve `index.html`'s content (same trap
phase 10 hit and fixed for `/splash/*.png`, documented in `10-RESEARCH.md` Pitfall #1 and
guarded by `__tests__/splashAssets.test.ts`). The service worker registration would fail
silently (`navigator.serviceWorker.register('/sw.js')` succeeds at the network level but
the "script" it receives is HTML, which throws a `SecurityError`/parse failure and the
registration promise rejects).
**How to avoid:** Add `sw\.js` and `register-sw\.js` to BOTH the rewrite negative
lookahead and the catch-all header negative lookahead. Verified this session with Node,
reproducing the exact anchoring semantics `splashAssets.test.ts` already established for
this repo's Vercel routing (`^...$` anchored regex, matching `@vercel/routing-utils`'
`path-to-regexp` behavior):
```js
// [VERIFIED: this session, Node regex test reproducing splashAssets.test.ts's
// criarRegexAncorada() anchoring semantics]
const source = "/((?!_expo|icons|assets|splash|manifest\\.json|favicon\\.ico|sw\\.js|register-sw\\.js).*)";
const regex = new RegExp("^" + source + "$");
regex.test("/sw.js");            // false — correctly excluded
regex.test("/register-sw.js");   // false — correctly excluded
regex.test("/manifest.json");    // false — correctly excluded (unchanged)
regex.test("/some-route");       // true  — still rewritten to index.html (unchanged)
regex.test("/icons/foo.png");    // false — unchanged
regex.test("/splash/apple-splash-1170-2532.png"); // false — unchanged
```
Then add two new explicit header entries (mirroring the existing `/manifest.json`
block at `vercel.json:54-62`) with `Cache-Control: no-cache, must-revalidate` for
`/sw.js` and `/register-sw.js`, and upgrade the existing `/manifest.json` entry's value
from `"no-cache"` (`vercel.json:59`) to `"no-cache, must-revalidate"` per `OFF-02`'s
success criterion. Carve these three paths out of the catch-all no-cache pattern too
(same technique as `manifest.json` already uses) rather than relying on Vercel's
multi-rule header merge order, which the official docs do not unambiguously document for
the same-key-multiple-matches case `[CITED: vercel.com/docs/project-configuration/vercel-json,
fetched this session — no explicit precedence rule found for same-header-key across
multiple matching header rules]`.
**Warning signs:** `curl -I https://<domain>/sw.js` returns `content-type: text/html`
instead of `application/javascript`, or the SW registration promise rejects in the
browser console.

### Pitfall 6: `workbox-cli` requires Node ≥20; this repo's `package.json` and (unverified) Vercel project setting may not
**What goes wrong:** `workbox-cli@7.4.1`'s `package.json` declares `"engines": {"node":
">=20.0.0"}` (`[VERIFIED: npm view workbox-cli engines, this session]`), while this
repo's own `package.json` still declares `"engines": {"node": ">=16"}`
(`package.json:100-102`, read this session). Local dev Node is v24.17.0 (fine), but the
Vercel project's configured "Node.js Version" build setting was not verified this
session (no safe read-only way to inspect it without additional Vercel API calls beyond
this research's scope) — if it's pinned below 20 in the Vercel dashboard, `npx workbox
generateSW` would fail at build time with an engine-mismatch error (npm's default
behavior for `engines` is a warning, not a hard failure, but some Node<20 builds may lack
syntax `workbox-build` 7.x depends on).
**How to avoid:** Before the first production build using this pipeline, confirm Vercel
Project Settings → General → Node.js Version is ≥ 20 (the plan should add this as an
explicit `checkpoint:human-verify` task, since it cannot be checked from this repo
clone). Consider bumping `package.json`'s `"engines": {"node": ">=20"}` to make the
requirement self-documenting, though this also affects any Vercel serverless function
runtime selection — flag as a decision point for the plan, not a blanket recommendation.
**Warning signs:** Vercel build log shows `npm warn EBADENGINE` or an outright syntax/
runtime error inside `workbox-build`'s bundled dependencies.

### Pitfall 7: Update banner shown on first install (no previous SW), not just on updates
**What goes wrong:** A common bug in hand-rolled SW update UIs: showing the "new version
available" banner on the very first visit, when there was no previous version to update
from. The `installing`/`statechange`→`'installed'` transition fires on BOTH a first
install and a real update — the only reliable signal to distinguish them is whether
`navigator.serviceWorker.controller` already exists (non-null means a previous SW was
already controlling the page, i.e., this IS an update; null means first install).
**Why it happens:** Copy-pasted SW update snippets from tutorials often omit this check
because their demo apps don't care about a spurious banner on first load.
**How to avoid:** Gate the `sw-update-available` dispatch on
`navigator.serviceWorker.controller` being truthy, as shown in Pattern 4 above.
**Warning signs:** Every fresh install of the PWA shows "Nova versão disponível" the
moment it opens, even though the user just installed it for the first time.

### Pitfall 8: `controllerchange` firing more than once causes a reload loop
**What goes wrong:** Multiple `controllerchange` events (e.g. multiple tabs open, or a
second `SKIP_WAITING` message in flight) can each trigger `window.location.reload()`,
producing a visible reload loop.
**Why it happens:** `controllerchange` is a `ServiceWorkerContainer` event, not scoped
to "only fire once per page" — nothing in the spec prevents multiple firings.
**How to avoid:** The `refreshing` boolean guard shown in Pattern 4
`[CITED: multiple sources including dev.to/thepassle "On PWA Update Patterns" and the
Workbox community pattern referenced in developer.chrome.com's own guidance]`.
**Warning signs:** Rapid, repeated page flashes/reloads after tapping "Atualizar",
especially with multiple tabs of the app open.

## Code Examples

### `workbox-config.cjs` (recommended, Claude's discretion per CONTEXT.md)
```js
// Source: this session's verified local generateSW runs against dist/
module.exports = {
  globDirectory: 'dist',
  globPatterns: ['**/*.{js,html,ico,json,png,ttf}'],
  globIgnores: [],
  swDest: 'dist/sw.js',
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/_expo\//, /^\/api\//],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  inlineWorkboxRuntime: true,
};
```

### `vercel.json` buildCommand (updated order per CONTEXT.md)
```json
{
  "buildCommand": "npx expo export -p web && npx workbox generateSW workbox-config.cjs && node scripts/verify-web-bundle.mjs"
}
```
`[VERIFIED: verify-web-bundle.mjs's listarJs() recurses the whole dist/ tree collecting
every *.js file (scripts/verify-web-bundle.mjs:41-52, read this session) and only fails
the build if it finds MORE THAN ONE file under _expo/static/js (:71-79) or if NO file
contains the expected API host / a LAN IP leaks (:81-102) — sw.js at dist/sw.js (root,
not under _expo/static/js) does not trip either check, confirmed by reading the full
script this session]`.

### package.json local test script (recommended)
```json
{
  "scripts": {
    "build:web": "npx expo export -p web && npx workbox generateSW workbox-config.cjs && node scripts/verify-web-bundle.mjs"
  },
  "devDependencies": {
    "workbox-cli": "7.4.1"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Hand-written `sw.js` with manual `cache.addAll()`/`fetch` event listener | Build-tool-generated SW (Workbox `generateSW`/`injectManifest`) | Workbox has been the standard since ~2017; still current in 2026 (`workbox-cli@7.4.1` actively published) | Automatic cache-busting via content-hash revisioning; hand-written SWs are the #1 source of "stuck on old version" PWA bugs this phase exists to avoid. |
| `sw-precache` (Google's older tool, deprecated) | `workbox-build`/`workbox-cli` | Deprecated years ago, superseded by Workbox v3+ | Not relevant here — `workbox-cli@7.4.1` is already the current major version. |

**Deprecated/outdated:** None found relevant to this phase — Workbox 7.x is current.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact `window` CustomEvent names (`sw-update-available`, `sw-apply-update`) and the `register-sw.js` internal structure shown in Pattern 4 | Architecture Patterns / Code Examples | Low — explicitly marked "Claude's Discretion" in `CONTEXT.md`; any equivalent bridge mechanism satisfies the requirement, this is one reasonable implementation, not a locked contract. |
| A2 | Vendor icon font files under `dist/assets/node_modules/@expo/vector-icons/...` are actually rendered by some screen in this app (justifying `globIgnores: []`) | Pitfall #2 / Standard Stack | Low-medium — even if unused, precaching them is wasted bandwidth/storage (a few MB) but not a correctness bug; if verification shows they're truly unused, the plan could narrow `globPatterns` instead, but this wasn't verified by grepping every icon usage this session. |
| A3 | Vercel's "multiple header rules matching the same path, same key" merge order is not officially documented as last-wins or first-wins | Pitfall #5 | Low — mitigated by recommending the deterministic carve-out approach (non-overlapping source patterns) rather than relying on any merge order at all. |
| A4 | The recommended `refreshing`-guard `controllerchange`→reload pattern (Pattern 4 / Pitfall 8) | Architecture Patterns | Low — this is a widely-documented community/Google pattern (CITED, not a single authoritative spec citation), but functionally uncontroversial and easy to unit-test. |

## Open Questions

1. **Is the Vercel project's Node.js Version build setting ≥ 20?**
   - What we know: `workbox-cli@7.4.1` requires Node ≥20 per its own `package.json`
     engines field (verified via `npm view`); this repo's local dev Node is v24.17.0.
   - What's unclear: The actual Node version configured in the linked Vercel project
     (`prj_7js6VqyFfgMZqeUIoAcXf9CraHtI`, per `.vercel/project.json`) was not checked —
     doing so safely requires either dashboard access or additional `vercel` CLI calls
     out of scope for this research pass.
   - Recommendation: Plan should add a `checkpoint:human-verify` task, before the first
     `vercel deploy --prod` of this phase, to confirm the setting in the Vercel dashboard.

2. **Should the SW register on Vercel Preview deployments, or only on the production domain?**
   - What we know: `CONTEXT.md` says "registra só em produção/https" (`11-CONTEXT.md:38`).
     `location.protocol === 'https:'` is true for BOTH production and Preview deployments
     (Vercel serves both over HTTPS) — only local `expo start --web` (http://localhost)
     is excluded by a protocol check alone.
   - What's unclear: Whether "produção" is meant literally (exclude Preview too, e.g. via
     a `VERCEL_ENV`-style check baked into the build) or is shorthand for "not local dev"
     (i.e., "produção" = "https" as the CONTEXT phrasing itself suggests, "produção/https"
     read as one condition).
   - Recommendation: Default to registering whenever `location.protocol === 'https:'`
     (covers prod + preview identically, simplest, matches the literal reading of
     "produção/https" as a single condition) unless discuss-phase/planning surfaces a
     reason to gate Preview specifically (e.g., wanting to test-without-SW-caching on
     preview URLs first).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥20 (workbox-cli requirement) | `npx workbox generateSW` in buildCommand | ✓ locally | v24.17.0 `[VERIFIED: node --version, this session]` | Vercel project setting unverified — see Open Question 1 |
| `workbox-cli` | precache manifest generation | ✓ on npm registry | 7.4.1 latest | — |
| Vercel CLI | manual deploy (`vercel deploy --prod`, per locked `git.deploymentEnabled: false`) | ✓ installed, project linked | 54.14.5, project `forca-app` (`prj_7js6VqyFfgMZqeUIoAcXf9CraHtI`) `[VERIFIED: vercel --version + .vercel/project.json, this session]` | — |
| jest / jest-expo | Guard tests for `vercel.json`/`workbox-config.cjs` | ✓ | jest ^29.7.0, jest-expo ~54.0.17 (`package.json:90,51`) — confirmed passing (`npx jest __tests__/splashAssets.test.ts` → 3/3 pass, this session) | — |

**Missing dependencies with no fallback:** none — everything required is either already
installed or a single `npm install --save-dev workbox-cli@7.4.1` away.

**Missing dependencies with fallback:** Vercel project Node.js Version — unverified, see
Open Question 1; fallback is a `checkpoint:human-verify` task in the plan, not a code
change.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + `jest-expo` 54.0.17 preset, `@testing-library/react-native` 13.3.3 for component tests |
| Config file | `package.json` `"jest"` field (`package.json:109-127`, read this session) — no separate `jest.config.js` |
| Quick run command | `npx jest __tests__/<file>.test.ts` (confirmed working this session — `splashAssets.test.ts` passes 3/3 in 0.17s) |
| Full suite command | `npm test` (→ `jest`, `package.json:16`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFF-01 | `workbox-config.cjs` has no `runtimeCaching` key; `vercel.json` excludes `sw.js`/`register-sw.js` from SPA rewrite | unit/guard | `npx jest __tests__/serviceWorkerConfig.test.ts -t "runtimeCaching"` | ❌ Wave 0 |
| OFF-01 | `navigateFallbackDenylist` in `workbox-config.cjs` covers `_expo`/`api` paths | unit/guard | `npx jest __tests__/serviceWorkerConfig.test.ts -t "denylist"` | ❌ Wave 0 |
| OFF-02 | `vercel.json` headers for `/sw.js`, `/register-sw.js`, `/manifest.json` are `no-cache, must-revalidate` | unit/guard | `npx jest __tests__/serviceWorkerConfig.test.ts -t "Cache-Control"` | ❌ Wave 0 |
| OFF-02 | `UpdateBanner` never calls `window.location.reload()` on mount / without a user tap | component (RTL) | `npx jest __tests__/UpdateBanner.test.tsx -t "no auto-reload"` | ❌ Wave 0 |
| OFF-02 | Tapping "Atualizar" dispatches the apply-update event / triggers `postMessage` | component (RTL) | `npx jest __tests__/UpdateBanner.test.tsx -t "Atualizar"` | ❌ Wave 0 |
| OFF-01 (UAT) | Airplane mode + open from icon → app shell appears | manual-only | — (requires real iPhone install; this dev machine has no native toolchain per project memory) | manual-only, justified |
| OFF-02 (UAT) | `curl -I` on deployed `sw.js`/`manifest.json` shows correct headers | smoke (manual, post-deploy) | `curl -I https://<prod-domain>/sw.js` | manual-only, justified (requires a live deploy) |

### Sampling Rate
- **Per task commit:** `npx jest __tests__/serviceWorkerConfig.test.ts __tests__/UpdateBanner.test.tsx`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus the two manual UAT items above (airplane mode install test, `curl -I` header check on production) — neither is automatable from this dev machine (no native iOS toolchain; no live prod deploy exists until `vercel deploy --prod` runs).

### Wave 0 Gaps
- [ ] `__tests__/serviceWorkerConfig.test.ts` — extends the `splashAssets.test.ts` pattern (read+`JSON.parse` `vercel.json`, `require()` `workbox-config.cjs`) to guard: no `runtimeCaching` key, `globIgnores: []` present, `maximumFileSizeToCacheInBytes` ≥ current measured bundle size, rewrite/header regexes exclude `sw.js`/`register-sw.js`, `/manifest.json` header includes `must-revalidate`.
- [ ] `__tests__/UpdateBanner.test.tsx` — RTL test asserting the component never calls `reload()` without user interaction, and that tapping "Atualizar" fires the expected side effect (event dispatch/postMessage stand-in).
- [ ] `src/store/updateStore.ts` unit test (small — mirrors any existing `alertStore.ts` test if one exists; not found this session, may not need one either given `alertStore` didn't get a dedicated unit test file based on repo conventions observed).
- No framework install needed — Jest/jest-expo/RTL already present and confirmed working.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Phase touches no auth code |
| V3 Session Management | No | Phase touches no session code |
| V4 Access Control | No | No new authorization surface |
| V5 Input Validation | Yes (narrow) | `register-sw.js`'s `message` listener already type-checks `event.data.type === 'SKIP_WAITING'` before acting (Workbox-generated, built-in) — no other untrusted input is processed by this phase's code |
| V6 Cryptography | No | No crypto operations added |
| V14 Configuration | Yes | `Cache-Control`/CSP header correctness is the core of `OFF-02` — already governed by existing `vercel.json` headers, this phase only adds/adjusts entries, doesn't weaken any existing directive |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious `postMessage` spoofing a `SKIP_WAITING` command from another origin | Tampering | Not applicable here — messages TO a service worker via `registration.waiting.postMessage()` originate from the page that registered it; the browser enforces that only same-origin, same-registration-scope code can post to a given `ServiceWorkerRegistration`'s `waiting`/`active` worker. No additional origin check is needed beyond what the platform already guarantees. |
| Stale service worker serving an old app shell indefinitely ("stuck on old version") | — (availability/correctness, not a STRIDE category, but the entire point of `OFF-02`) | `Cache-Control: no-cache, must-revalidate` on `sw.js` forces the browser to always re-validate the SW script itself (never serve a stale `sw.js` from HTTP cache), which is what allows Workbox's own byte-diffing update-check mechanism to ever discover a new version exists. |
| SW accidentally caching/serving stale or cross-tenant API responses | Tampering / Information Disclosure | Mitigated structurally by this phase's core design choice (zero `runtimeCaching`, verified via actual generated output) — there is no cache to go stale because API responses are never cached by the SW at all. |

## Sources

### Primary (HIGH confidence — verified this session by execution/direct file read)
- Local `workbox-cli@7.4.1` `generateSW` runs against this repo's real `dist/` (4 separate configurations tested: default `globIgnores`, `globIgnores: []`, `inlineWorkboxRuntime: true`) — precache manifests, file counts, byte totals, and generated `sw.js` source all directly observed.
- `npx expo export -p web` run fresh against this repo — measured real bundle size (3,325,222 bytes) and confirmed `public/` → `dist/` passthrough behavior (manifest.json, icons/, splash/ identical; index.html gets exactly two injected additions: a `<link rel="icon">` and the bundle `<script>` tag).
- `npm view workbox-cli version/dist-tags/engines/bin/scripts.postinstall` — package legitimacy, version, Node requirement, bin name.
- Direct `Read` of `vercel.json`, `scripts/verify-web-bundle.mjs`, `public/index.html`, `package.json`, `App.tsx`, `src/components/AlertHost.tsx`, `__tests__/splashAssets.test.ts`, `.planning/phases/11-.../11-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — all quoted verbatim with line numbers where load-bearing.
- Node regex test reproducing `splashAssets.test.ts`'s anchored-regex Vercel routing semantics against the proposed updated rewrite pattern.
- `npx jest __tests__/splashAssets.test.ts` — confirmed existing test infra passes (3/3).

### Secondary (MEDIUM confidence — WebFetch/WebSearch against official docs)
- developer.chrome.com/docs/workbox/handling-service-worker-updates/ — `waiting`/`messageSkipWaiting`/`controllerchange` pattern.
- developer.chrome.com/docs/workbox/modules/workbox-build/ — `generateSW` option defaults table (`globPatterns` default, `maximumFileSizeToCacheInBytes` default, `skipWaiting`/`clientsClaim` defaults).
- vercel.com/docs/project-configuration/vercel-json — headers/rewrites reference (no explicit same-key multi-match precedence found, informing the "carve out explicitly" recommendation).

### Tertiary (LOW confidence — WebSearch summaries, cross-checked against primary where possible)
- iOS Safari PWA cache eviction / storage quota figures (~50MB Cache Storage, 7-day script-writable storage cap) — general web search results, not verified against a single authoritative WebKit source this session; included for context only, not load-bearing for any plan decision in this phase.
- `controllerchange` refreshing-guard pattern — widely repeated community pattern (dev.to, Medium), not traced to one canonical spec source, but functionally uncontroversial and independently verifiable by unit test.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `workbox-cli` version/legitimacy directly verified via npm registry this session.
- Architecture (precache-only, no runtimeCaching): HIGH — proven by reading the actual generated `sw.js` this session, not inferred from docs.
- Pitfalls #1, #2, #3, #5: HIGH — each reproduced and measured directly against this repo's real `dist/`/`vercel.json` this session.
- Pitfall #6 (Node version on Vercel): MEDIUM — the Node≥20 requirement is verified, but the actual Vercel project setting is an open question requiring human verification.
- Pitfalls #4, #7, #8: MEDIUM-HIGH — CSP behavior verified against the actual `vercel.json` CSP string; update-lifecycle pitfalls are CITED from official Google docs plus community corroboration, not independently reproduced in a live browser this session (no toolchain for that on this machine).
- Security Domain: MEDIUM — narrow scope for this phase, reasoned from first principles + the already-verified CSP/precache findings above.

**Research date:** 2026-08-14
**Valid until:** 30 days (stable Workbox major version; re-verify bundle size measurement if significant app code is added before this phase executes, since `maximumFileSizeToCacheInBytes` headroom depends on it)
