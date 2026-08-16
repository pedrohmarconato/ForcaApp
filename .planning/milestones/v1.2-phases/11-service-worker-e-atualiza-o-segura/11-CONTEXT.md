# Phase 11: Service worker e atualização segura - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning
**Mode:** Smart discuss (autônomo) — 3 áreas propostas, todas aceitas integralmente pelo dono

<domain>
## Phase Boundary

O app instalado abre sem rede (app shell offline via service worker) e nunca
prende o usuário numa versão antiga — sem duplicar a camada de retry do outbox
offline-first do v1.0. Requisitos: OFF-01, OFF-02.

Achados do scout (2026-08-14) que o plano PRECISA tratar:
- O rewrite SPA do `vercel.json` não exclui `sw.js` — sem ajuste, `GET /sw.js`
  devolve `index.html` (mesma armadilha da splash na fase 10, já corrigida lá).
- A CSP de produção tem `script-src 'self'` SEM inline — o registro do SW não
  pode ser `<script>` inline no index.html; precisa de arquivo próprio.
- `buildCommand` atual: `npx expo export -p web && node scripts/verify-web-bundle.mjs`
  (o guard `verify-web-bundle.mjs` já existe e deve continuar fechando o build).
- `git.deploymentEnabled=false` — deploy é manual via `vercel deploy --prod`.

</domain>

<decisions>
## Implementation Decisions

### Cache offline (o que o SW faz)
- Precache: todo o `dist/` estático (JS, index.html, ícones, splash, fonts) —
  app shell completo via Workbox `generateSW`.
- Navegação offline: `navigateFallback: index.html` (SPA), com denylist
  explícita para rotas de API e domínios externos.
- Dados: ZERO `runtimeCaching` — nenhuma chamada a `*.supabase.co`, PostgREST ou
  API Flask é interceptada; o outbox offline-first do v1.0 segue como ÚNICA
  camada de retry de dados (decisão travada no milestone).
- Registro: arquivo próprio `/register-sw.js` carregado via `<script src>` no
  `public/index.html` (CSP proíbe inline); registra só em produção/https.

### Pipeline de build e guards
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

### UX de atualização
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `vercel.json` (rewrite/headers — padrão de exclusão já estabelecido na fase 10
  com `splash`), `scripts/verify-web-bundle.mjs` (guard de build existente).
- `__tests__/splashAssets.test.ts` (padrão de guard jest sobre vercel.json/
  index.html da fase 10 — estender/replicar).
- `src/store/activeSessionStore.ts` (estado da sessão ativa, se o banner
  precisar saber de sessão em andamento).
- Paleta: `#0A0A0A` base, `#171A1D` superfícies, neon `#EBFF00` só destaque.

### Established Patterns
- Guard permanente via teste jest (fases 9 e 10).
- CSP estrita em produção (script-src 'self') — qualquer JS novo precisa ser
  arquivo servido de 'self'.
- Deploy: `vercel deploy --prod` manual (deploymentEnabled=false).

### Integration Points
- `public/index.html` — `<script src="/register-sw.js" defer>`.
- `public/register-sw.js` — novo, copiado ao dist pelo expo export.
- `workbox-config.cjs` — novo, na raiz; consumido no buildCommand.
- `vercel.json` — buildCommand + rewrite + headers.
- `App.tsx` ou componente raiz — montar `UpdateBanner`.
- `package.json` — devDependency workbox-cli + script de build local de teste.

</code_context>

<specifics>
## Specific Ideas

- Critério de sucesso 1 exige Workbox `generateSW` (não SW manual).
- Critério 2 é verificável via `curl -I` em produção (sw.js e manifest.json com
  no-cache, must-revalidate).
- Critério 4 (UAT): modo avião + abrir pelo ícone → casca do app aparece.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
