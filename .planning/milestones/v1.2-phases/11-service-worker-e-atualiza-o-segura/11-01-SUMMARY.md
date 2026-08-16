---
phase: 11-service-worker-e-atualiza-o-segura
plan: 01
subsystem: infra
tags: [workbox, service-worker, pwa, vercel, jest, cache-control, csp]

# Dependency graph
requires:
  - phase: 10-identidade-do-app-instal-vel
    provides: manifest.json/ícones/splash e o padrão de guarda vercel.json (__tests__/splashAssets.test.ts, criarRegexAncorada) que este plano estende
provides:
  - workbox-config.cjs gerando dist/sw.js com precache do app shell (zero runtimeCaching)
  - public/register-sw.js registrando o SW e fazendo a ponte de eventos de atualização (sw-update-available/sw-apply-update) para a UI do Plano 11-02
  - vercel.json com buildCommand encadeado (expo export -> workbox generateSW -> verify-web-bundle.mjs), rewrite/headers excluindo sw.js/register-sw.js, e Cache-Control no-cache/must-revalidate em sw.js/register-sw.js/manifest.json
  - __tests__/serviceWorkerConfig.test.ts como guarda jest permanente de OFF-01/OFF-02
affects: [11-02-plano-banner-atualizacao, 11-03-plano-verificacao-producao]

# Actuals (#2632)
actuals:
  tokens: 4242
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: [workbox-cli@7.4.1]
  patterns:
    - "Guarda jest de config estática moldada em splashAssets.test.ts: require() de .cjs / JSON.parse de vercel.json + criarRegexAncorada para reproduzir a ancoragem real do roteamento da Vercel"
    - "register-sw.js como script solto (sem bundler, passthrough do Expo) comunicando com a store React só via window CustomEvent, nunca import direto"

key-files:
  created:
    - workbox-config.cjs
    - public/register-sw.js
    - __tests__/serviceWorkerConfig.test.ts
  modified:
    - public/index.html
    - vercel.json
    - package.json
    - package-lock.json

key-decisions:
  - "globIgnores: [] explícito (nunca o default do Workbox) — evita descarte silencioso das fontes de ícone vendorizadas sob dist/assets/node_modules/..."
  - "maximumFileSizeToCacheInBytes elevado para 5MB — o bundle web medido em produção (3.325.222 bytes) já excede o limite padrão de 2MB do Workbox"
  - "Três rotas (sw.js, register-sw.js, manifest.json) recebem Cache-Control: no-cache, must-revalidate explícito e são carve-out tanto do rewrite de SPA quanto do header catch-all — mesma técnica que a Fase 10 já validou para /splash/*.png"
  - "skipWaiting: false + fluxo manual via postMessage(SKIP_WAITING)/controllerchange — nenhuma troca de versão automática em segundo plano, decisão travada em 11-CONTEXT.md"

patterns-established:
  - "Pattern: script externo (nunca inline) para qualquer comportamento que precise sobreviver à CSP script-src 'self' sem 'unsafe-inline' — register-sw.js segue o mesmo desenho de AlertHost.tsx/alertStore.ts (ponte via evento global, não import direto)."

requirements-completed: [OFF-01, OFF-02]

coverage:
  - id: D1
    description: "dist/sw.js gerado pelo pipeline de build precacheia o app shell inteiro sem nenhuma rota runtimeCaching — nenhuma chamada Supabase/PostgREST/API é interceptada"
    requirement: "OFF-01"
    verification:
      - kind: unit
        ref: "__tests__/serviceWorkerConfig.test.ts#guarda: workbox-config.cjs nunca intercepta chamada de dado (runtimeCaching)"
        status: pass
      - kind: integration
        ref: "npm run build:web (EXPO_PUBLIC_API_BASE_URL=https://forca-api.cadastrai.com) — dist/sw.js contém precacheAndRoute/NavigationRoute, sem 'supabase'/'forca-api'"
        status: pass
    human_judgment: false
  - id: D2
    description: "register-sw.js registra /sw.js via script externo, distingue primeira instalação de atualização real, e só recarrega a página uma vez após SKIP_WAITING explícito do usuário"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "__tests__/serviceWorkerConfig.test.ts#guarda: public/register-sw.js — controlador, SKIP_WAITING e reload único (OFF-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "vercel.json serve sw.js/register-sw.js/manifest.json com Cache-Control: no-cache, must-revalidate, exclui as três rotas do rewrite de SPA e do header catch-all, e mantém a CSP script-src 'self' sem 'unsafe-inline'"
    requirement: "OFF-02"
    verification:
      - kind: unit
        ref: "__tests__/serviceWorkerConfig.test.ts#guarda: vercel.json — Cache-Control no-cache/must-revalidate para sw.js/register-sw.js/manifest.json (OFF-02)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Instalação atômica do service worker (worker novo entra em waiting e nunca assume controle sem SKIP_WAITING explícito) — garantia da própria plataforma do navegador, não reproduzível em jsdom"
    verification: []
    human_judgment: true
    rationale: "Marcado como backstop em must_haves.truths do plano — é comportamento nativo do browser (spec Service Worker), não simulável no ambiente jsdom deste repo. Confirmação real fica para o UAT de produção do Plano 11-03 (curl -I + instalação real no iPhone)."

# Metrics
duration: 5min (commits) — inclui pausa de checkpoint humano para aprovação do tracer da Task 1
completed: 2026-08-15
status: complete
---

# Phase 11 Plan 01: Pipeline Workbox + headers de cache seguros Summary

**Service worker gerado por `workbox generateSW` precacheando o app shell inteiro sem interceptar nenhuma chamada de dado, registrado via script externo com ponte de atualização manual, e `vercel.json` servindo `sw.js`/`register-sw.js`/`manifest.json` com `Cache-Control: no-cache, must-revalidate` — tudo travado por uma suíte jest permanente de 9 testes.**

## Performance

- **Duração:** Task 1 (tracer) executada e commitada, checkpoint humano aprovado, Task 2 executada em sequência — ~5min de trabalho de commit a commit, com a pausa de aprovação do checkpoint no meio.
- **Tasks:** 2/2
- **Arquivos modificados:** 7 (workbox-config.cjs, public/register-sw.js, public/index.html, vercel.json, package.json, package-lock.json, __tests__/serviceWorkerConfig.test.ts)

## Accomplishments
- `workbox-config.cjs` gera `dist/sw.js` com exatamente uma rota `precacheAndRoute` (opções vazias, sem `runtimeCaching`) e uma `NavigationRoute` — confirmado gerando o `dist/` real e inspecionando o `sw.js` (41 URLs, 8.64MB precacheados).
- `public/register-sw.js` registra o SW como arquivo externo (CSP `script-src 'self'` sem `'unsafe-inline'` preservada), distingue primeira instalação de atualização real via checagem de `navigator.serviceWorker.controller`, e recarrega a página exatamente uma vez após `SKIP_WAITING` explícito.
- `vercel.json` encadeia `expo export -> workbox generateSW -> verify-web-bundle.mjs` no `buildCommand`, exclui `sw.js`/`register-sw.js` do rewrite de SPA e do header catch-all, e serve as três rotas sensíveis (`sw.js`, `register-sw.js`, `manifest.json`) com `Cache-Control: no-cache, must-revalidate`.
- `__tests__/serviceWorkerConfig.test.ts` — guarda jest permanente com 9 testes cobrindo os quatro ângulos exigidos: ausência de `runtimeCaching`, `navigateFallbackDenylist`, headers/regex ancorada de `vercel.json`, e o contrato de eventos de `register-sw.js`.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Pipeline Workbox de ponta a ponta (tracer)** — `ecfe580` (feat) — checkpoint de verificação técnica aprovado pelo orquestrador (ver Deviations).
2. **Task 2: Headers no-cache/must-revalidate + guarda jest permanente** — `ef3c627` (feat)

**Plan metadata:** commit deste SUMMARY (a seguir, docs: complete plan)

## Files Created/Modified
- `workbox-config.cjs` — config do `workbox generateSW`: `globIgnores: []`, `maximumFileSizeToCacheInBytes: 5MB`, `navigateFallbackDenylist` para `_expo`/`api`, `skipWaiting: false`.
- `public/register-sw.js` — registro do SW + ponte de eventos `sw-update-available`/`sw-apply-update` + guarda de reload único.
- `public/index.html` — `<script src="/register-sw.js" defer>` em `<head>`.
- `vercel.json` — `buildCommand` encadeado; rewrite e headers excluindo `sw.js`/`register-sw.js`; `Cache-Control: no-cache, must-revalidate` em `sw.js`/`register-sw.js`/`manifest.json`.
- `package.json` / `package-lock.json` — devDependency `workbox-cli@7.4.1` pinada, script `build:web`, `engines.node` `>=20`.
- `__tests__/serviceWorkerConfig.test.ts` — guarda permanente (novo).

## Decisions Made
- `globIgnores: []` explícito — nunca o default do Workbox (descartaria fontes de ícone vendorizadas em silêncio).
- `maximumFileSizeToCacheInBytes: 5 * 1024 * 1024` — o bundle web medido em produção (3.325.222 bytes) excede o limite padrão de 2MB.
- `inlineWorkboxRuntime: true` — evita um segundo arquivo com hash de conteúdo que exigiria seu próprio carve-out em `vercel.json`.
- `skipWaiting: false` + fluxo manual via `postMessage(SKIP_WAITING)`/`controllerchange` — nenhuma troca de versão automática; decisão travada em `11-CONTEXT.md`.
- Três rotas (`sw.js`, `register-sw.js`, `manifest.json`) com `Cache-Control: no-cache, must-revalidate` explícito, carve-out do rewrite de SPA e do header catch-all — mesma técnica já validada na Fase 10 para `/splash/*.png`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verificação de Task 1 ajustada para checagens minification-safe (aceito pelo orquestrador antes desta continuação)**
- **Encontrado durante:** Task 1 (verificação do tracer)
- **Problema:** O `<verify>` literal da Task 1 previa `grep` por identificadores exatos que o minifier do build de produção renomeia, tornando a checagem frágil contra o bundle minificado real.
- **Correção:** A verificação técnica do orquestrador substituiu os greps de identificador por checagens equivalentes minification-safe: presença de `precacheAndRoute`/`NavigationRoute` (nomes de função do runtime do Workbox, não minificados por serem exportados), ausência de `supabase`/`forca-api` no `sw.js`, tamanho e contagem de URLs do precache manifest, e comparação byte-a-byte de `dist/register-sw.js` com `public/register-sw.js`.
- **Arquivos:** nenhum arquivo de produção alterado — mudança foi na metodologia de verificação, não no código.
- **Verificação:** `EXPO_PUBLIC_API_BASE_URL=https://forca-api.cadastrai.com npm run build:web` — exit 0, `verify-web-bundle: OK`; `dist/sw.js` = 20704 bytes, precache 41 URLs/8.64MB; grep `supabase`=0, `forca-api`=0; marcador `workbox:precaching` presente; `dist/register-sw.js` byte-idêntico ao `public/`.
- **Status:** ACEITO pelo dono no checkpoint — Task 2 (esta continuação) codificou as checagens equivalentes como testes jest permanentes (`__tests__/serviceWorkerConfig.test.ts`), não os greps literais originais.
- **Commitado em:** `ecfe580` (Task 1)

---

**Total de desvios:** 1 aceito (ajuste de metodologia de verificação, sem impacto em código de produção).
**Impacto no plano:** Nenhum — o desvio só trocou a técnica de prova pela técnica correta contra artefato minificado; o resultado verificado é estritamente mais forte (comparação byte-a-byte + contagem de precache, além dos greps originais).

## Issues Encountered
- Os dois primeiros asserts de `location.reload()`/`refreshing` no guard jest da Task 2 falharam na primeira rodada porque a regex de varredura casava com o texto explicativo do comentário de cabeçalho de `register-sw.js` (que cita `window.location.reload()` em prosa), não só com o código real. Corrigido filtrando linhas de comentário (`//`) antes de contar ocorrências — mesma classe de guarda-contra-falso-positivo que `alertNoAlertRemanescente.test.ts` já usa. Resolvido inline durante a Task 2, sem precisar de commit adicional (parte do commit `ef3c627`).

## User Setup Required
None - nenhuma configuração de serviço externo necessária. O plano 11-03 fará a checagem de produção real (`curl -I`) contra o que este plano já travou em `vercel.json`.

## Next Phase Readiness
- OFF-01 fechado por completo (pipeline + guarda). Metade de infraestrutura de OFF-02 (headers corretos em config) fechada; a confirmação em produção (headers reais servidos pela Vercel) fica para o Plano 11-03.
- `register-sw.js` já expõe o contrato de eventos (`sw-update-available`/`sw-apply-update`) que o Plano 11-02 (banner de atualização) vai consumir via `window.addEventListener`.
- Antes do primeiro deploy de produção usando este pipeline: confirmar em Vercel Project Settings → General → Node.js Version ≥ 20 (workbox-cli exige Node ≥20; não verificável a partir deste clone — 11-RESEARCH.md Pitfall #6). Nenhum bloqueio para esta sessão; sinalizado para o Plano 11-03/deploy.

---
*Phase: 11-service-worker-e-atualiza-o-segura*
*Completed: 2026-08-15*

## Self-Check: PASSED

Todos os arquivos declarados (`workbox-config.cjs`, `public/register-sw.js`, `public/index.html`, `vercel.json`, `package.json`, `__tests__/serviceWorkerConfig.test.ts`, este SUMMARY.md) e os dois commits de task (`ecfe580`, `ef3c627`) foram confirmados existentes no disco e no `git log` antes de prosseguir.
