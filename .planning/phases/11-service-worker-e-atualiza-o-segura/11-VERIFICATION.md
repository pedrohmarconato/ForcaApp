---
phase: 11-service-worker-e-atualiza-o-segura
verified: 2026-08-15T12:25:00Z
status: human_needed
score: 13/16 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Modo avião no iPhone real: com o PWA instalado e aberto ao menos uma vez com rede, ativar modo avião, fechar e reabrir pelo ícone da Tela de Início."
    expected: "A casca do app aparece (splash, layout, navegação) mesmo sem rede — não precisa funcionar por completo, só a casca estática."
    why_human: "Requer dispositivo iOS físico e o gerenciador de rede do Safari/WebKit; não reproduzível em jsdom/CI. Critério de sucesso 4 do ROADMAP. Diferido pelo dono em 11-UAT.md (decisão registrada: 'Deploy agora + adiar UAT', 2026-08-15)."
  - test: "No PRÓXIMO deploy de produção, com o app aberto (ou ao reabrir), confirmar que aparece o banner 'Nova versão disponível' com 'Atualizar'/'Depois'; tocar 'Atualizar' recarrega UMA vez; 'Depois' dispensa e a versão nova entra na abertura seguinte; nunca reload sozinho."
    expected: "Banner aparece só depois do SW real instalar uma versão nova (updatefound/statechange via rede real) e o fluxo completo (Atualizar/Depois/reload único) funciona em navegador real, não só em jsdom."
    why_human: "A lógica de UpdateBanner/updateStore está coberta por 10 testes RTL sob jsdom real (incluindo os 3 achados do loop review→fix: CR-01, WR-01, WR-02), mas o timing real do ciclo de vida do Service Worker (updatefound disparando minutos/horas depois, sobre rede real) só é observável em produção com um segundo deploy. Critério de sucesso 3 do ROADMAP — a invariante 'nunca reload sozinho' já tem evidência automatizada; falta a confirmação visual end-to-end. Mirrors 11-UAT.md item 2."
  - test: "Treino executado offline (outbox) continua sincronizando quando a rede volta, com o SW em produção — spot-check de comportamento igual ao v1.0."
    expected: "Nenhuma regressão no fluxo de retry do outbox offline-first; o SW não intercepta nem atrasa as chamadas de sincronização de dados."
    why_human: "Regressão de comportamento de dado real (Supabase/API) sob rede intermitente, não reproduzível de forma confiável em CI. Mirrors 11-UAT.md item 3."
  - test: "Verificar em produção (DevTools > Application > Service Workers, ou abrir o app em duas abas) que registrar o SW mais de uma vez (reload, múltiplas abas) resolve sempre para o MESMO ServiceWorkerRegistration, sem duplicar nem invalidar entradas do precache."
    expected: "navigator.serviceWorker.register('/sw.js') é idempotente por garantia de plataforma (mesma scriptURL/escopo retorna o registro existente) e o precache é revisionado por hash de conteúdo pelo próprio Workbox."
    why_human: "must_haves.truths do Plano 11-01 (truth 6) declara esse comportamento, mas nenhum teste automatizado do repositório o exercita — é uma garantia do navegador, não simulável em jsdom/Node. Nenhuma regressão foi observada, mas também não há evidência direta capturada nesta verificação além da leitura de código (register('/sw.js') chamado com a mesma URL fixa em todo carregamento de página)."
  - test: "Confirmar em produção que, com uma instalação de SW em andamento interrompida (ex.: fechar a aba durante o download do novo sw.js), o worker antigo continua servindo o app shell sem corrupção, e o novo entra em 'waiting' só quando totalmente instalado."
    expected: "Nenhuma versão parcial do app shell é servida; o app shell em vigor nunca é substituído por um SW parcialmente instalado."
    why_human: "Marcado explicitamente como must_haves.truths verification: backstop no Plano 11-01 (truth 7) — garantia da própria especificação Service Worker do navegador, não reproduzível no ambiente jsdom deste repo. human_judgment: true na coverage do 11-01-SUMMARY.md (item D4)."
  - test: "Revisar (e, se aceito, endurecer) a proibição 'workbox-config.cjs nunca ativa troca automática de versão do SW em segundo plano' (skipWaiting nunca true)."
    expected: "skipWaiting: false hoje em workbox-config.cjs (correto), mas __tests__/serviceWorkerConfig.test.ts não contém nenhum expect(config.skipWaiting).toBe(false) — só usa 'skipWaiting: boolean' na interface de tipos, sem asserção real. Uma edição futura que mude skipWaiting para true passaria pela suíte sem ser pega."
    why_human: "must_haves.prohibitions do Plano 11-01 declara verification: test para este item, mas não há enforcement automatizado wired na suíte permanente — flagged não-silenciosamente-passado, conforme política de fail-closed para proibições tier=test sem teste real. O valor atual está correto; isto é uma lacuna de regressão, não uma violação ativa."
---

# Phase 11: Service Worker e Atualização Segura — Verification Report

**Phase Goal:** O app instalado abre sem rede (app shell offline) e nunca prende o usuário numa versão antiga, sem duplicar a camada de retry do outbox offline-first do v1.0.
**Verified:** 2026-08-15T12:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Fonte: ROADMAP.md (critérios de sucesso 1-4, autoritativos) + `must_haves.truths` dos três planos (11-01, 11-02, 11-03).

| # | Truth | Source | Status | Evidence |
|---|-------|--------|--------|----------|
| 1 | sw.js via Workbox generateSW cacheia SÓ o app shell — nenhuma chamada `*.supabase.co`/API Flask interceptada | ROADMAP SC1 | ✓ VERIFIED | Rebuild local (`EXPO_PUBLIC_API_BASE_URL=... npm run build:web`, exit 0): `dist/sw.js` (20704 bytes) tem exatamente uma rota de precache (`r(new O(...))`) e uma NavigationRoute-like (`r(new class extends n{...denylist...})`), zero `runtimeCaching`, `grep supabase`=0, `grep forca-api`=0. **Confirmado também em produção**: `curl -sS https://forca-app-six.vercel.app/sw.js` (0 ocorrências de `supabase`/`forca-api`, `workbox:core:7.4.0` real). `register-sw.js` de produção é byte-idêntico ao `public/register-sw.js` do HEAD atual. |
| 2 | sw.js e manifest.json servidos em produção com `Cache-Control: no-cache, must-revalidate` (curl -I) | ROADMAP SC2 | ✓ VERIFIED | `curl -sS -I` desta sessão contra `https://forca-app-six.vercel.app/sw.js`, `/register-sw.js` e `/manifest.json`: as três respondem `cache-control: no-cache, must-revalidate`, HTTP 200. Confere com `vercel.json` (regras dedicadas `/sw.js`, `/register-sw.js`, `/manifest.json`) e a suíte `__tests__/serviceWorkerConfig.test.ts` (3 asserções, PASS). |
| 3 | Nova versão → aviso não-bloqueante; nunca reload forçado durante sessão de treino | ROADMAP SC3 | ✓ VERIFIED | `__tests__/UpdateBanner.test.tsx` — 10 testes RTL sob `@jest-environment jsdom` real (não mock de EventTarget), incluindo 3 testes de regressão dos achados do loop review→fix (CR-01: dismissed não gruda; WR-01: flag write-only consumida nos dois caminhos, pré-mount e listener-ao-vivo; WR-02: replay de evento perdido). Teste dedicado prova `reloadSpy` nunca chamado em múltiplas montagens/desmontagens/disparos. `npx jest __tests__/UpdateBanner.test.tsx __tests__/serviceWorkerConfig.test.ts` rodado nesta sessão: 21/21 PASS. Confirmação visual end-to-end em produção fica para o próximo deploy (ver Human Verification #2). |
| 4 | UAT do dono no iPhone real: modo avião + abrir pelo ícone → casca do app aparece | ROADMAP SC4 | ? PENDENTE | `11-UAT.md` (status: testing) registra a Task 3 do Plano 11-03 como diferida pelo dono ("Deploy agora + adiar UAT", 2026-08-15). Ver Human Verification #1. |
| 5 | `dist/sw.js` contém exatamente 1 rota de precache + 1 NavigationRoute, sem outras rotas de rede | Plano 11-01 | ✓ VERIFIED | Mesma evidência da linha 1 (inspeção do bundle minificado — greps de identificador literal não se aplicam a build minificado, conforme desvio já documentado e aceito em 11-01-SUMMARY.md; verificação substituta feita nesta sessão por leitura direta do `dist/sw.js` gerado). |
| 6 | `workbox-config.cjs`: `globIgnores: []` e `maximumFileSizeToCacheInBytes >= 3325222` | Plano 11-01 | ✓ VERIFIED | `workbox-config.cjs` linhas 23/27; `__tests__/serviceWorkerConfig.test.ts` primeira suíte, PASS. |
| 7 | `sw.js`/`register-sw.js` nunca engolidos pelo rewrite de SPA nem pelo header catch-all | Plano 11-01 | ✓ VERIFIED | `vercel.json` rewrite/headers com exclusão explícita; `__tests__/serviceWorkerConfig.test.ts` suíte "Cache-Control", PASS (regex ancorada `criarRegexAncorada` reproduz o roteamento real da Vercel). |
| 8 | `index.html` referencia `/register-sw.js` via `<script>` externo com `defer`, nunca inline (CSP `script-src 'self'` sem `unsafe-inline`) | Plano 11-01 | ✓ VERIFIED | `dist/index.html`: `<script src="/register-sw.js" defer>`; CSP em `vercel.json` sem `'unsafe-inline'` em `script-src`; teste dedicado PASS. |
| 9 | `index.html` não recebe `Cache-Control` com `max-age` longo/`immutable` do catch-all | Plano 11-01 | ✓ VERIFIED | Regra catch-all de `vercel.json` serve `no-cache` (sem `must-revalidate`, sem `max-age`) para tudo que não é `_expo`/`icons`/`assets`/`splash`/`manifest.json`/`favicon.ico`/`sw.js`/`register-sw.js` — inclui `index.html`. |
| 10 | Registro do SW é idempotente (múltiplas abas/reloads resolvem para o mesmo `ServiceWorkerRegistration`) | Plano 11-01 (truth 6) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `register-sw.js` chama `navigator.serviceWorker.register('/sw.js')` com a mesma URL fixa a cada carregamento — comportamento correto por leitura de código e garantia de plataforma, mas **nenhum teste automatizado exercita idempotência entre registros** (não reproduzível em jsdom). Ver Human Verification #4. |
| 11 | Instalação de versão nova é atômica — worker novo fica em `waiting`, nunca assume controle sem `SKIP_WAITING` explícito | Plano 11-01 (truth 7, `verification: backstop`) | ? BACKSTOP | Marcado explicitamente como não-inferível pelo próprio plano (`human_judgment: true` em 11-01-SUMMARY.md coverage D4) — garantia da spec do navegador. Ver Human Verification #5. |
| 12 | Tocar em "Atualizar" despacha `sw-apply-update` exatamente 1x; componente nunca chama reload diretamente | Plano 11-02 | ✓ VERIFIED | `__tests__/UpdateBanner.test.tsx` teste dedicado, PASS (`applyUpdateSpy` chamado 1x, `reloadSpy` nunca chamado). |
| 13 | Tocar em "Depois" esconde o banner sem despachar `sw-apply-update` | Plano 11-02 | ✓ VERIFIED | Teste dedicado PASS. |
| 14 | Banner só aparece após `sw-update-available`, nunca no primeiro carregamento | Plano 11-02 | ✓ VERIFIED | 2 testes dedicados PASS (sem evento = null; com evento = banner visível). |
| 15 | Disparos duplos (duplo toque, `controllerchange` repetido) resultam em no máximo 1 reload | Plano 11-02 | ✓ VERIFIED | `register-sw.js` guarda `refreshing`, testada por `__tests__/serviceWorkerConfig.test.ts` (ordem flag-antes-de-reload + reload aparece exatamente 1x no código); `UpdateBanner.test.tsx` prova reload nunca chamado pelo componente mesmo com múltiplos dispatches/montagens. |
| 16 | Atualização chegando durante sessão de treino ativa nunca dispara reload automático | Plano 11-02 | ✓ VERIFIED | Nenhum caminho de `UpdateBanner`/`updateStore` chama `window.location.reload()` — responsabilidade exclusiva de `register-sw.js`, guardado por `refreshing`. Testes PASS. |

**Score:** 13/16 truths verified (1 present-behavior-unverified, 2 pendentes de confirmação humana: UAT de dispositivo real e garantia de plataforma não-testável).

### Prohibitions (Plano 11-01 e 11-02)

| # | Prohibition | Enforcement declarado | Enforcement real (wired) | Status |
|---|-------------|------------------------|---------------------------|--------|
| 1 | sw.js nunca intercepta/cacheia respostas de dado (Supabase/PostgREST/API) | test | `serviceWorkerConfig.test.ts` (ausência de `runtimeCaching` na config — a única fonte que o `generateSW` usa para gerar rotas) + confirmação direta do artefato construído (local e produção) nesta sessão | ✓ Wired e verificado |
| 2 | workbox-config.cjs nunca ativa troca automática de versão em segundo plano (`skipWaiting` nunca `true`) | test | **Nenhuma** — `skipWaiting: boolean` só aparece na interface TypeScript do arquivo de teste (tipagem do `require()`), sem nenhum `expect(config.skipWaiting).toBe(false)` real | ⚠️ Valor atual correto, mas SEM guarda de regressão — flagged, ver Human Verification #6 |
| 3 | Mudanças em vercel.json nunca afrouxam a CSP de produção (register-sw.js sempre externo `'self'`) | test | `serviceWorkerConfig.test.ts` suíte "CSP global permanece..." (2 asserções: contém `'self'`, não contém `'unsafe-inline'` na diretiva `script-src`) | ✓ Wired e verificado |
| 4 | UpdateBanner/fluxo de atualização nunca disparam reload sem gesto explícito do usuário | test | `UpdateBanner.test.tsx` — 4+ asserções `expect(reloadSpy).not.toHaveBeenCalled()` cobrindo Atualizar, Depois, montagens múltiplas e disparos repetidos | ✓ Wired e verificado |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `workbox-config.cjs` | Config do Workbox generateSW sem runtimeCaching | ✓ VERIFIED | Presente, `globIgnores:[]`, `maximumFileSizeToCacheInBytes: 5MB`, `skipWaiting:false`. |
| `public/register-sw.js` | Registro do SW + ponte de eventos | ✓ VERIFIED | Presente, wired em `index.html`, byte-idêntico em produção. |
| `vercel.json` | buildCommand encadeado, rewrite/headers corrigidos | ✓ VERIFIED | Presente e correto, confirmado por build local + curl produção. |
| `__tests__/serviceWorkerConfig.test.ts` | Guarda jest permanente OFF-01/OFF-02 | ✓ VERIFIED | 10 testes, todos PASS; cobertura incompleta em 1 ponto (skipWaiting, ver Prohibitions #2). |
| `src/store/updateStore.ts` | Estado Zustand do banner | ✓ VERIFIED | Presente, `setWaiting`/`dismiss`/`applyUpdate` conforme comportamento testado. |
| `src/components/UpdateBanner.tsx` | Banner web-only não-bloqueante | ✓ VERIFIED | Presente, montado em `App.tsx`, todos os fixes do loop review→fix aplicados (confirmado por leitura direta do arquivo). |
| `__tests__/UpdateBanner.test.tsx` | Guarda RTL permanente | ✓ VERIFIED | 10 testes, todos PASS. |
| `App.tsx` | `<UpdateBanner />` montado antes de `<AlertHost />` | ✓ VERIFIED | `grep -n "UpdateBanner|AlertHost" App.tsx` confirma ordem. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `public/index.html` `<script src=/register-sw.js>` | `public/register-sw.js` | `navigator.serviceWorker.register('/sw.js')` | ✓ WIRED | Confirmado no HTML gerado e em produção. |
| `register-sw.js` `dispatchEvent('sw-update-available')` | `UpdateBanner` `useEffect` | `window.addEventListener` | ✓ WIRED | Contrato de eventos idêntico nos dois arquivos; testado via jsdom real. |
| `UpdateBanner` botão Atualizar | `register-sw.js` listener `sw-apply-update` | `window.dispatchEvent`/`postMessage(SKIP_WAITING)` | ✓ WIRED | Testado (spy no evento). |
| `App.tsx` | `UpdateBanner` | montagem JSX | ✓ WIRED | Confirmado por grep + `npx tsc --noEmit` limpo. |
| `package.json` `build:web` | `vercel.json` `buildCommand` | mesma sequência de comandos | ⚠️ PARTIAL (duplicado, não referenciado) | Os dois scripts têm o MESMO texto hoje (verificado por leitura), mas `vercel.json` não invoca `npm run build:web` — repete a string. Risco de divergência futura (achado IN-01 do review, aceito como Info, fora de escopo do fix). Não bloqueia a fase; é dívida de manutenção documentada. |

### Behavioral Spot-Checks (executados nesta sessão, não apenas relatados)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build de produção completo | `EXPO_PUBLIC_API_BASE_URL=... npm run build:web` | exit 0, `verify-web-bundle: OK`, `dist/sw.js` 20704 bytes / 41 URLs / 8.64MB precache | ✓ PASS |
| sw.js sem dados de rede | `grep -c supabase\|forca-api dist/sw.js` | 0 / 0 | ✓ PASS |
| Testes da fase | `npx jest __tests__/UpdateBanner.test.tsx __tests__/serviceWorkerConfig.test.ts --silent` | 21/21 PASS | ✓ PASS |
| Suíte completa (1 execução, sem filtro repetido) | `npx jest --silent` | 153 suítes / 1739 testes PASS | ✓ PASS |
| Type-check | `npx tsc --noEmit -p .` | 0 erros | ✓ PASS |
| Headers de produção | `curl -sS -I https://forca-app-six.vercel.app/{sw.js,register-sw.js,manifest.json}` | `cache-control: no-cache, must-revalidate` nos 3 | ✓ PASS |
| Conteúdo de produção vs HEAD | `diff` register-sw.js produção vs `public/register-sw.js` local | idêntico byte-a-byte | ✓ PASS |
| sw.js de produção sem dados de rede | `grep -c supabase\|forca-api` no sw.js baixado de produção | 0 / 0 | ✓ PASS |
| Node.js da Vercel | `npx vercel project inspect forca-app` | `Node.js Version 24.x` | ✓ PASS (≥20 exigido pelo workbox-cli) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| OFF-01 | 11-01, 11-03 | App instalado abre sem rede; outbox segue única camada de retry | ⚠️ NEEDS HUMAN | Infra completa e verificada (sw.js correto, sem interceptar dado); a confirmação literal "abre sem rede" no dispositivo físico está pendente (ver Human Verification #1). REQUIREMENTS.md marca "Complete" na traceability — este veredito discorda parcialmente: a evidência de código é forte, mas o teste-fim-a-fim no aparelho real (o próprio texto do requisito) não ocorreu ainda. |
| OFF-02 | 11-01, 11-02, 11-03 | Aviso não-bloqueante; headers no-cache impedem versão presa | ✓ SATISFIED | Headers confirmados em produção via curl (evidência direta, não apenas relatada); lógica do banner coberta por 10 testes incluindo as 3 regressões do loop review→fix. Observação end-to-end do banner num deploy real ainda pendente (Human Verification #2), mas não invalida o SATISFIED — a invariante testável (nunca reload sozinho) está provada. |

### Anti-Patterns Found

Nenhum `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` nos 9 arquivos modificados/criados pela fase (grep executado nesta sessão, 0 ocorrências).

### Human Verification Required

Ver `human_verification` no frontmatter para os 6 itens completos (3 herdados de `11-UAT.md`, 3 identificados nesta verificação). Resumo:

1. **Modo avião no iPhone real** (ROADMAP SC4) — diferido pelo dono, decisão registrada em `11-UAT.md`.
2. **Banner de atualização observado num deploy real subsequente** (ROADMAP SC3, confirmação end-to-end) — `11-UAT.md` item 2.
3. **Sem regressão do outbox offline** — `11-UAT.md` item 3.
4. **Idempotência do registro do SW** — nenhum teste automatizado a exercita (Plano 11-01 truth 6).
5. **Atomicidade da instalação de versão nova** — marcado `backstop` no próprio plano (Plano 11-01 truth 7).
6. **Guarda de regressão ausente para `skipWaiting` nunca automático** — prohibition declarada `verification: test` sem asserção real na suíte; valor atual correto, mas sem proteção contra regressão futura.

### Gaps Summary

Nenhum gap bloqueante (`gaps_found`) identificado — todos os artefatos existem, estão substantivos e wired; todas as truths automatizáveis passam; nenhuma prohibition está sendo violada hoje; nenhum anti-padrão de dívida foi encontrado. O veredito é `human_needed` porque:

- O critério de sucesso 4 do ROADMAP (UAT em iPhone real, modo avião) depende de um passo que só o dono pode executar, e foi explicitamente diferido — não uma omissão, mas uma decisão registrada.
- Dois itens de comportamento de plataforma (idempotência de registro, atomicidade de instalação) foram autorados desde o início como não-testáveis neste ambiente (um deles `backstop` explícito).
- Uma proibição declarada `verification: test` (skipWaiting nunca automático) não tem, de fato, nenhuma asserção jest — o valor está correto agora, mas a fase reivindica uma garantia de regressão que a suíte não entrega. Isto é sinalizado, não escondido, e não invalida o trabalho: é uma lacuna de cobertura pontual, corrigível com uma linha de teste adicional.
- A confirmação visual do banner de atualização num deploy real subsequente (distinta da cobertura lógica já provada por 10 testes jsdom) ainda não ocorreu, porque só um segundo deploy pode gerá-la.

Nada aqui bloqueia a fase de avançar — o dono decide se resolve os itens de Human Verification agora ou os carrega para o próximo checkpoint natural (próximo deploy + UAT combinados).

---

_Verified: 2026-08-15T12:25:00Z_
_Verifier: Claude (gsd-verifier)_
