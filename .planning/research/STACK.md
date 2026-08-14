# Stack Research

**Domain:** PWA de primeira classe no iOS — instalação, offline, push (Expo SDK 54 web export + Vercel + Flask)
**Researched:** 2026-08-14
**Confidence:** MEDIUM-HIGH (versões verificadas direto no npm/PyPI; padrões de integração verificados no guia oficial Expo e no `vercel.json`/`public/index.html` já existentes no repo)

## Estado atual do repo (não é gap — já existe)

Antes de recomendar qualquer coisa nova, o que já está feito precisa ficar registrado para o
roadmap não redigitar:

- `public/manifest.json` já existe: nome, `display: standalone`, `theme_color`/`background_color`
  `#0A0A0A`, ícones 192/512 (`any` + `maskable`).
- `public/index.html` já tem `<link rel="manifest">`, `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title` e
  `<link rel="apple-touch-icon">`.
- `public/icons/apple-touch-icon.png`, `icon-192.png`, `icon-512.png` já existem.
- `vercel.json` já tem CSP restritiva (`script-src 'self'` **sem** `unsafe-inline`,
  `worker-src 'self' blob:`, `manifest-src 'self'`) e já tem `Cache-Control: no-cache` para
  `/manifest.json`.

**O que falta de verdade para o v1.2:** service worker (não existe nenhum arquivo `sw.js` nem
registro), splash screens iOS (`apple-touch-startup-image` — só o ícone existe, não a
startup image), infraestrutura de push (VAPID + envio + tabela de subscription), página de
instalação guiada, e o header de `Cache-Control` do próprio service worker no `vercel.json`
(hoje só cobre `manifest.json`).

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **workbox-cli** | 7.4.1 (verificado no npm, `dist-tags.latest`) | Gera o service worker (`generateSW`) a partir do export estático do Metro | O suporte a PWA do `expo-cli`/webpack morreu com a migração para Metro em SDK 50+. O **guia oficial atual do Expo** (`docs.expo.dev/guides/progressive-web-apps`) recomenda explicitamente seguir o guia do Workbox CLI, trocando o "build script" deles por `npx expo export -p web`. Não existe suporte nativo Expo/Metro para isso — é tooling externo, igual a um projeto HTML puro. |
| **pwa-asset-generator** | 8.1.5 (verificado no npm) | Gera `apple-touch-startup-image` (splash iOS) a partir de uma imagem-fonte, incluindo variantes dark-mode e as media queries de `<link>` | iOS **não lê o Web App Manifest** para ícone/splash — exige tags `<link rel="apple-touch-icon">` (já existe) e `<link rel="apple-touch-startup-image">` (não existe) para cada combinação de resolução/orientação de dispositivo. Gerar isso à mão é ~30+ combinações; `pwa-asset-generator` é o gerador padrão da comunidade (baseado em Puppeteer, atualizado 2 meses atrás, 94 versões publicadas). |
| **pywebpush** | 2.4.0 (verificado no PyPI) | Envia push via Web Push Protocol assinado com VAPID, do backend Flask existente | O backend já é Flask/Python (`backend/Dockerfile`, `python:3.11-slim`). `pywebpush` é a lib de referência do ecossistema Python para Web Push + VAPID (traz `py-vapid` como dependência transitiva para gerar/assinar as chaves). Não há motivo para introduzir Node/Deno só para push quando o servidor de push já existe. |
| **Web Push API nativa do navegador** (`ServiceWorkerRegistration.pushManager`, `Notification`) | Padrão da plataforma, sem pacote npm | Cliente pede permissão, cria a subscription (`pushManager.subscribe({applicationServerKey})`) e mostra a notificação (`self.registration.showNotification` dentro do SW) | iOS 16.4+ implementa o padrão Web Push nativamente — **não precisa** de SDK de push (Firebase Cloud Messaging, OneSignal etc.). Adicionar um SDK de terceiros aqui é complexidade e dependência de vendor que o app de ~20 usuários não precisa. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **workbox-build** | 7.4.1 | Variante programática do `workbox-cli generateSW` (mesma engine, chamável de um script Node) | Só se o build script do `vercel.json` precisar de lógica condicional (ex.: `runtimeCaching` diferente por ambiente). Para este projeto, o CLI (`npx workbox-cli generateSW workbox-config.js`) já resolve — não trocar sem necessidade concreta. |
| **py-vapid** | 1.9.4 (latest no PyPI; `pywebpush` já fixa `>=1.7.0`) | Gera o par de chaves VAPID (pública/privada) uma única vez, via `vapid --applicationServerKey` | Rodar uma vez para gerar as chaves e guardá-las como env vars no backend (`VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`) — não é dependência de runtime além do que `pywebpush` já traz. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `workbox-cli wizard` | Gera `workbox-config.js` interativamente (aponta `globDirectory: 'dist'`, `swDest: 'dist/sw.js'`) | Rodar uma vez, versionar o `workbox-config.js` resultante; não precisa rodar o wizard de novo depois. |
| `pwa-asset-generator` (CLI) | Gera os PNGs de splash + as tags `<link rel="apple-touch-startup-image">` prontas para colar em `public/index.html` | Usa `puppeteer-core` por baixo — exige um Chrome/Chromium instalado na máquina que roda o gerador (a máquina de dev tem Chrome; não depende de Xcode/toolchain nativa, roda 100% em Node). É passo de geração de asset, não fica no bundle de produção. |

## Installation

```bash
# Core (devDependencies — tooling de build, não entra no bundle RN)
npm install -D workbox-cli pwa-asset-generator

# Backend (Flask) — adicionar ao requirements.txt, depois regenerar o lock
# (o Dockerfile já documenta o comando; repetir o mesmo processo):
#   echo "pywebpush>=2.4,<3.0" >> requirements.txt
#   uv pip compile requirements.txt --generate-hashes --python-version 3.11 \
#     --output-file requirements.lock.txt
pip install pywebpush
```

Build script (`package.json`) precisa encadear a geração do service worker **depois** do
export do Metro, no mesmo padrão que já existe para `verify-web-bundle.mjs`:

```json
{
  "scripts": {
    "build:web": "expo export -p web && npx workbox-cli generateSW workbox-config.js && node scripts/verify-web-bundle.mjs"
  }
}
```

E o `buildCommand` do `vercel.json` precisa do mesmo encadeamento (hoje só tem
`expo export -p web && node scripts/verify-web-bundle.mjs`).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| `workbox-cli generateSW` | `vite-plugin-pwa` | **Não se aplica a este projeto.** `vite-plugin-pwa` é plugin de bundler Vite; o Expo 54 usa Metro para o export web. Citar aqui só para descartar explicitamente — é o erro mais comum quando alguém busca "PWA Expo" e cai em tutoriais Vite/CRA. |
| `workbox-cli generateSW` | `workbox-cli injectManifest` (SW próprio + `self.__WB_MANIFEST`) | Só se precisar de lógica de cache manual complexa (ex.: estratégias diferentes por rota dentro do próprio SW). Para cobrir só o app shell estático + fallback offline, `generateSW` é suficiente e é o que o guia oficial do Expo demonstra. |
| `pywebpush` (Flask) | Supabase Edge Function (Deno) + `web-push` (npm) | Só faria sentido se o envio de push precisasse rodar fora do backend Flask (ex.: trigger direto de `pg_net`/webhook do Postgres). Como o Flask já existe e já orquestra a lógica de negócio, introduzir Edge Functions só para push é infraestrutura nova sem necessidade — mais um lugar para manter chave/segredo. |
| Shim caseiro para `Alert.alert` no web (≈20-30 linhas: hook + Modal/`<dialog>` cross-platform) | `@blazejkustra/react-native-alert` (pacote npm, publicado há 11 meses, versão `1.0.0`, zero dependências) | O pacote é jovem (poucas versões, baixa adoção) mas tem API idêntica ao `Alert` nativo e já resolve web via `<dialog>` — vale considerar **se** o app precisar de `Alert.prompt` (input de texto) ou de mais de 2-3 chamadas de alerta espalhadas pelo código. Para o caso concreto conhecido (botão "Concluir treino" com `Alert.alert` de confirmação), um shim próprio é menos risco de dependência para o ganho. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Suporte PWA embutido do `expo-cli` / webpack (`expo build:web`, `web.pwa` no `app.json` antigo) | Removido/morto desde a migração do Expo para Metro (SDK 50+). Qualquer tutorial que mencione `expo build:web` ou `app.json > expo.web.pwa` é de uma versão do Expo que não existe mais no SDK 54. | `workbox-cli` pós-build, como documentado no guia oficial atual do Expo. |
| `react-native-alert` (pacote npm **sem escopo**, de `leecade`) | Publicado há mais de 1 ano, com `peerDependency`/`dependency` em `react-native@^0.3.11` — incompatível com RN 0.81.5 do projeto. É um nome parecido que aparece em buscas e não é o mesmo pacote do `@blazejkustra/react-native-alert`. | `@blazejkustra/react-native-alert` (se optar por lib) ou shim caseiro (recomendado acima). |
| SDK de push de terceiro (OneSignal, Pushly, MagicBell, PushEngage) | iOS 16.4+ já expõe Web Push padrão nativamente; essas SDKs existem para abstrair diferenças entre navegadores/plataformas que este projeto não tem (é só iOS Safari PWA + eventualmente Chrome/Android). Custo, vendor lock-in e mais uma conta externa para um app de ~20 usuários. | `pywebpush` + `py-vapid` no Flask existente + Web Push API nativa no cliente. |
| `workbox-window` no cliente | Camada de conveniência para registrar/observar o SW com eventos (`waiting`, `controlling`). Adiciona um pacote runtime para algo que é ~10 linhas de `navigator.serviceWorker.register()` + listener de `updatefound`. | Registro manual direto (ver nota de CSP abaixo) — mais simples e sem dependência nova no bundle web. |

## Stack Patterns by Variant

**Sobre o que o service worker deve (e não deve) cachear:**
- Escopo do SW = **app shell estático** (precache dos assets do `dist/` gerados pelo Metro +
  `navigateFallback` para `/index.html`, coerente com o rewrite já existente no `vercel.json`
  que manda toda rota não-asset para `/index.html`).
- **Não** adicionar `runtimeCaching` para as chamadas de API (Flask `forca-api.cadastrai.com`
  nem Supabase) no `workbox-config.js`. O app já tem um outbox offline-first no cliente via
  `AsyncStorage` (v1.0/REQ-07) — deixar o SW interceptar e cachear respostas de API cria uma
  segunda camada de "verdade offline" competindo com o outbox, com risco real de dado velho
  sobrevivendo a um retry (o mesmo modo de falha que REQ-07 já existe para evitar). Deixar a
  chamada de API falhar naturalmente offline e o outbox já existente cuidar da fila.

**Sobre registrar o service worker sob a CSP atual do projeto:**
- O guia oficial do Expo mostra registrar o SW com um `<script>` **inline** dentro de
  `public/index.html`. O `vercel.json` deste projeto já define
  `Content-Security-Policy: script-src 'self'` (sem `'unsafe-inline'`, sem nonce) — um
  `<script>` inline **quebra silenciosamente sob essa CSP** (o navegador bloqueia, sem erro
  visível fora do console).
- Registrar o SW a partir do próprio bundle JS da aplicação (ex.: um `useEffect` no ponto de
  entrada, chamando `navigator.serviceWorker.register('/sw.js')`) em vez do `<script>` inline
  do guia — isso roda como parte do bundle já servido de `'self'`, respeitando a CSP existente
  sem precisar afrouxá-la.
- `worker-src 'self' blob:'` já presente na CSP é suficiente para o SW rodar; não precisa mexer
  nessa diretiva.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `workbox-cli@7.4.1` | Node **>= 20.0.0** (`engines.node` do pacote) | `package.json` do projeto hoje declara `"engines": { "node": ">=16" }` — **atualizar para `>=20`** antes de encadear `workbox-cli` no `buildCommand` da Vercel, senão o build da Vercel pode resolver um Node antigo e o passo de `generateSW` falha. Confirmar também a versão de Node configurada no projeto Vercel (Settings → Node.js Version). |
| `pwa-asset-generator@8.1.5` | Node **>= 18** | Compatível com o Node 24 já usado na máquina de dev; sem conflito. |
| `pywebpush@2.4.0` | Python **>= 3.10** (`requires_python` do PyPI) | O container de produção (`backend/Dockerfile`) já roda `python:3.11-slim` — compatível. A **máquina de desenvolvimento local tem Python 3.9.6** (`python3 --version`) — não dá para rodar/testar `pywebpush` direto nesse interpretador; testar via Docker (`backend/Dockerfile`) ou criar um venv local com Python ≥3.10. |
| `pywebpush@2.4.0` | `cryptography>=47.0.0`, `py-vapid>=1.7.0` (deps transitivas) | Nenhum conflito com o `requirements.txt` atual (Flask, anthropic, jsonschema, requests, gunicorn não fixam `cryptography`). Regenerar `requirements.lock.txt` com `uv pip compile` como o `Dockerfile` já documenta. |
| Web Push API (cliente) | Safari iOS **16.4+**, exige o PWA **instalado na Tela de Início** | Não funciona dentro da aba do Safari (só depois de "Adicionar à Tela de Início" + reabrir pelo ícone). A permissão de notificação só pode ser solicitada a partir de um gesto explícito do usuário (tap em botão) — não pode disparar o prompt automaticamente no load. |

## Sources

- `docs.expo.dev/guides/progressive-web-apps` (guia oficial Expo, verificado via fetch direto em 2026-08-14) — confirma que o suporte PWA do Metro é manual/externo (Workbox CLI) e não nativo; confiança HIGH (fonte oficial primária, verificada por fetch direto).
- `npmjs.com` / registry npm (`npm view <pkg>`, consulta direta em 2026-08-14) — versões `workbox-cli@7.4.1`, `workbox-build@7.4.1`, `pwa-asset-generator@8.1.5`, `react-native-alert@1.0.3` (leecade, obsoleto), `@blazejkustra/react-native-alert@1.0.0`, `web-push@3.6.7`: confiança HIGH (fonte primária — registro oficial do pacote, não busca web).
- `pypi.org/pypi/pywebpush/json` e `pypi.org/pypi/py-vapid/json` (consulta direta em 2026-08-14) — `pywebpush@2.4.0`, `requires_python>=3.10`, `py-vapid@1.9.4`: confiança HIGH (fonte primária).
- Busca web (WebSearch, sem MCP Exa/Context7 disponível nesta sessão) sobre requisitos de instalação PWA no iOS Safari, Web Push iOS 16.4+, `pwa-asset-generator` (README do GitHub `elegantapp/pwa-asset-generator`), configuração de `Cache-Control` no Vercel: confiança MEDIUM — resultados agregados de múltiplas fontes (MDN, web.dev, blogs de push-vendors, docs Vercel), sem fetch direto de cada página; usado só para confirmar padrões amplamente documentados, não números/versões.
- `vercel.json`, `public/index.html`, `public/manifest.json`, `backend/Dockerfile`, `package.json`, `requirements.txt` do próprio repo (lidos diretamente em 2026-08-14) — confiança HIGH (estado real do código, não inferido).

---
*Stack research for: PWA de primeira classe no iOS (v1.2)*
*Researched: 2026-08-14*
