# Architecture Research

**Domain:** PWA de primeira classe no iOS — integração com app Expo/RN-web existente
**Researched:** 2026-08-14
**Confidence:** MEDIUM (padrões de mercado bem estabelecidos — Workbox, VAPID, iOS Safari 16.4+ — cruzados com múltiplas fontes; a parte de baixa confiança é o detalhe fino de `pywebpush`, que tem documentação escassa e deve ser validado em spike antes da fase de push)

## Contexto: o que já existe (não re-arquitetar)

Este projeto NÃO começa do zero. O pipeline de build/deploy, o outbox offline-first,
o manifest e os ícones iOS já existem e funcionam em produção. O trabalho de v1.2 é
de **integração**, não de fundação.

| Peça | Estado atual | Arquivo |
|------|--------------|---------|
| Build/export | `expo export -p web` → `dist/` → trava `verify-web-bundle.mjs` → deploy Vercel `--prod` | `vercel.json`, `scripts/verify-web-bundle.mjs` |
| Manifest PWA | Completo — nome, ícones 192/512, standalone, `apple-touch-icon.png` | `public/manifest.json`, `public/index.html` |
| Meta tags iOS | Já presentes — `apple-mobile-web-app-capable`, `status-bar-style`, `viewport-fit=cover` | `public/index.html` |
| CSP | Já permite service worker (`worker-src 'self' blob:`) e chamadas Supabase (`connect-src ... https://*.supabase.co wss://*.supabase.co`) | `vercel.json` |
| Outbox offline-first | AsyncStorage→localStorage, fila por usuário, backoff exponencial, quarentena, dedupe por chave natural | `src/services/sessionOutboxDrain.ts`, `sessionOutboxStorage.ts`, `src/engine/sessionOutboxPolicy.ts` |
| Platform shim precedente | `Platform.OS === 'web'` guard já usado em 2 lugares (`haptics.ts`, `secureStorage.ts`) | `src/utils/haptics.ts` |
| Alert.alert | 12 chamadas em 6 arquivos, todas via `import { Alert } from 'react-native'` direto — sem indireção hoje | grep em `src/` |

**Splash screens iOS dedicadas** (`apple-touch-startup-image`) e **service worker**
(nenhum arquivo `sw.js`/Workbox no repo) são as únicas peças de manifest/instalação
que faltam de fato — o resto do "manifest completo" já está feito.

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  BUILD TIME (Vercel buildCommand)                                    │
│  expo export -p web → dist/  →  [NOVO] gerar sw.js (Workbox CLI      │
│  generateSW ou injectManifest) → verify-web-bundle.mjs → dist/       │
├──────────────────────────────────────────────────────────────────────┤
│  RUNTIME NO IPHONE (PWA instalada, standalone)                       │
│                                                                        │
│  ┌────────────┐   ┌───────────────────┐   ┌─────────────────────┐   │
│  │ App React  │   │ Service Worker     │   │ Push (Notification  │   │
│  │ Native-Web │◄─►│ (novo, este ciclo) │◄─►│ API do navegador)   │   │
│  └─────┬──────┘   └─────────┬─────────┘   └──────────┬───────────┘   │
│        │                    │                          │              │
│        │ escrita de série   │ cache do app shell        │ subscription │
│        ▼                    │ (HTML/JS/CSS/ícones)      ▼              │
│  ┌────────────┐             │                    ┌──────────────┐    │
│  │ Outbox      │             │ NUNCA intercepta   │ push_        │    │
│  │ (existente, │             │ POST/PATCH ao      │ subscriptions│    │
│  │ intocado)   │             │ PostgREST/Supabase │ (Supabase,   │    │
│  └─────┬──────┘             └──────────────────────┤ nova tabela) │    │
│        │                                            └──────┬───────┘   │
├────────┼───────────────────────────────────────────────────┼──────────┤
│        ▼                                                    │          │
│  Supabase (Postgres + PostgREST + RLS) — projetos staging/prod        │
│                                                               │          │
├──────────────────────────────────────────────────────────────┼──────────┤
│  BACKEND FLASK (cadastrai.com)                                │          │
│  [NOVO] job/endpoint que lê push_subscriptions elegíveis  ────┘          │
│  e envia via pywebpush (VAPID) quando o evento de domínio dispara       │
└──────────────────────────────────────────────────────────────────────┘
```

## (a) Onde o service worker entra no pipeline de build

**Decisão recomendada: pós-processamento do `dist/` gerado pelo `expo export`,
não injeção no bundle Metro.**

O `expo export -p web` produz um bundle React Native-Web comum — não tem
integração nativa com Workbox (o pacote `expo-service-worker`/PWA plugin da
Expo foi descontinuado nas versões recentes do SDK; SDK 54 não o inclui). O
padrão de mercado é: gerar o `dist/` primeiro, depois rodar `workbox generateSW`
(ou `injectManifest` se quiser controle fino da lógica de runtime caching) como
um passo adicional no `buildCommand` do `vercel.json`, encadeado da mesma forma
que `verify-web-bundle.mjs` já é hoje.

```
"buildCommand": "npx expo export -p web && npx workbox-cli generateSW workbox-config.js && node scripts/verify-web-bundle.mjs"
```

`generateSW` varre `dist/**/*.{js,css,html,png,...}` e monta o precache manifest
sozinho — sem precisar de acesso ao grafo interno do Metro. Preferir
`generateSW` a `injectManifest` neste projeto: o app não tem lógica de runtime
caching complexa o bastante para justificar escrever o service worker à mão
(YAGNI); `generateSW` cobre o caso de uso (app shell cache-first + runtime
caching por regra declarativa) com uma linha de config.

**O que PRECACHEAR (cache-first, revisionado pelo hash do build):**
- HTML de entrada (`index.html`)
- Bundle JS principal em `_expo/static/js/` (hoje é 1 arquivo só — `verify-web-bundle.mjs`
  já trava se virar mais de um, então o precache manifest também fica simples)
- CSS/fontes/ícones estáticos em `assets/`, `icons/`
- `manifest.json`

**O que NUNCA cachear (runtime, `NetworkOnly` ou nem registrado como rota do SW):**
- Qualquer chamada para `*.supabase.co` (REST/PostgREST, Auth, Realtime/`wss://`)
  — o outbox já resolve offline-first para escrita; deixar o SW interceptar essas
  chamadas duplicaria a camada de retry (ver seção "e" abaixo) e arriscaria
  servir dado stale de leitura sem o app saber.
- Chamadas para `forca-api.cadastrai.com` / `forca-api-hml.cadastrai.com`
  (geração de plano por IA, chat) — respostas são caras, específicas do
  usuário e não idempotentes o bastante para cache seguro.
- Qualquer rota `/api/*` do backend Flask.

Isso é **runtime caching por exclusão**, não por allowlist: o service worker só
tem rota registrada para os assets estáticos do app shell; tudo que bate em
`connect-src` do CSP (Supabase + as duas APIs) passa direto pela rede, sem o
SW no meio. Isso também respeita a CSP existente sem precisar tocar nela — o
`worker-src 'self' blob:` já cobre o registro do SW.

**Ícones/splash:** o `generateSW` precacheia os arquivos de `public/icons/` e as
splash screens iOS novas (`apple-touch-startup-image`) automaticamente, desde
que estejam em `dist/` no momento do `generateSW` rodar — ou seja, DEPOIS do
`expo export`, que é exatamente a ordem proposta.

## (b) Push notification

### Onde guardar as subscriptions

Nova tabela `push_subscriptions` no Supabase, RLS por usuário — mesmo padrão
já usado em todo o schema do projeto (RLS por `auth.uid()`, ver migrations
0021-0037). Estrutura mínima:

```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, endpoint)
);
-- RLS: usuário só lê/escreve a própria subscription (policy padrão do projeto).
-- Backend Flask usa service_role (bypassa RLS) para LER todas as subscriptions
-- elegíveis na hora de disparar — mesmo padrão que o backend já usa para outras
-- operações privilegiadas (grep GRANT DML nas dívidas conhecidas do STATE.md
-- é o precedente disso já ter mordido o projeto — não repetir).
```

`unique (user_id, endpoint)` é o dedupe natural: reinstalar o PWA ou trocar de
iPhone gera um novo `endpoint`, então múltiplas linhas por usuário são
esperadas (multi-dispositivo), não um bug.

### Quem envia

**Flask + `pywebpush`, não Supabase Edge Function.** Três razões específicas a
este projeto:

1. O backend Flask já é o único lugar que fala com serviços externos por
   design (Claude/Anthropic para geração de plano) — introduzir Edge Functions
   (Deno, runtime diferente, deploy separado) para push seria um SEGUNDO
   lugar para lógica de servidor, sem necessidade.
2. O disparo de push nesta feature é acoplado a lógica de domínio que já mora
   no Flask ou é natural adicionar lá: replanejamento semanal roda como job
   assíncrono (`services/job_manager.py` já existe para o job de geração de
   plano — mesmo padrão serve para o job de replanejamento) e lembrete de
   treino é um cron/scheduler simples de acionar do mesmo processo.
3. Zero infra nova: `pywebpush` é `pip install pywebpush` no `requirements.txt`
   existente; Edge Function exigiria Deno + secrets duplicados (VAPID key
   precisaria estar tanto no Supabase quanto potencialmente no Flask de
   qualquer forma, para os outros disparos).

**Confiança MEDIUM-BAIXA nesta escolha:** a documentação do `pywebpush` em si é
escassa (poucas fontes, nenhuma "oficial" robusta) — o padrão de uso
(`webpush(subscription_info, data, vapid_private_key, vapid_claims={'sub':
'mailto:...'})`) está bem documentado, mas vale um spike de 1-2h confirmando
o comportamento de expiração de subscription (HTTP 410 → remover da tabela)
antes de comprometer a fase inteira a essa lib.

### O que dispara notificação

Dois gatilhos de domínio, mapeados no `PROJECT.md` (target features de v1.2)
e no fluxo já existente do app:

| Gatilho | Fonte do evento | Quando dispara |
|---------|------------------|----------------|
| Lembrete de treino | Agenda do plano (já existe: `src/engine` tem lógica de "hoje é dia de treino") | Cron horário no backend consulta quem tem treino hoje e ainda não abriu a sessão |
| Replanejamento semanal pronto | `weeklyReplanner`/`weeklyReplanRepository` (já existe, roda no fechamento de semana) | Ao final do job de replanejamento, mesmo processo que já grava o resultado dispara o push |

Não inventar um terceiro gatilho nesta fase (anti-escopo) — o `PROJECT.md` só
lista esses dois como target feature; qualquer notificação adicional
(ex.: "série puxando atenção durante o treino") é fora do escopo do v1.2.

## (c) Shim de Alert.alert para web

**Achado importante:** a pesquisa de mercado mostra que `react-native-web`
tipicamente mapeia `Alert.alert()` para `window.alert`/`window.confirm`
nativos do browser (degradado, mas funcional — 1-2 botões). A dívida conhecida
deste projeto (`STATE.md`, MEMORY.md) registra que aqui `Alert.alert` é
**no-op puro** (botão "Concluir treino" parece morto) — comportamento mais
grave que a degradação usual, possivelmente por causa da versão/configuração
específica do `react-native-web@0.21` em uso, ou de uma chamada com `buttons`
array que RNW não sabe resolver e descarta silenciosamente. Vale um teste
isolado (`Alert.alert('teste')` puro no Expo web local) para confirmar se É
mesmo no-op total ou se é `window.confirm` disparando fora do foco visível
antes de decidir a estratégia — mas a correção proposta abaixo resolve os dois
casos igualmente.

**Padrão recomendado: wrapper próprio com a MESMA assinatura de `Alert.alert`,
não `Platform.select` espalhado pelas 6 telas.**

Razão: há 12 chamadas em 6 arquivos hoje — `Platform.select` em cada call site
duplicaria lógica 12 vezes (viola DRY) e cada nova tela futura reintroduziria o
bug se esquecer o guard. O precedente do próprio projeto (`haptics.ts`,
`secureStorage.ts`) já estabelece o padrão certo: **um módulo central que
decide por `Platform.OS`, chamado com a interface que os call sites já usam.**

```typescript
// src/utils/alertShim.ts (novo)
// Alert.alert vira no-op/degradado no PWA (react-native-web) — este wrapper
// resolve para um Modal próprio no web e repassa para Alert.alert nativo no
// resto. MESMA assinatura de Alert.alert — call sites não mudam a chamada,
// só o import.
import { Alert, Platform } from 'react-native';

type AlertButton = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };

export const showAlert = (title: string, message?: string, buttons?: AlertButton[]): void => {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  // web: dispara um Modal customizado via store global (Zustand, já é
  // dependência do projeto) — nunca window.alert/window.confirm, porque
  // ambos ficam feios/inconsistentes com o tema dark da marca.
  useAlertStore.getState().show({ title, message, buttons });
};
```

Implementação do lado de renderização: um `<AlertHost />` montado uma vez em
`App.tsx` (raiz da árvore), lendo o mesmo `useAlertStore` (Zustand, já é
dependência — não introduzir `react-native-modal` nem
`react-native-web-dialog` como dependência nova quando o `Modal` do RN já
funciona em todas as plataformas via `react-native-web`). Isso resolve
simultaneamente a dívida do `Alert.alert` no-op E os botões
"destructive"/"cancel" com estilo próprio (hoje limitados a `window.confirm`
no melhor caso).

**Migração dos 12 call sites:** trocar `import { Alert } from 'react-native'`
por `import { showAlert } from '../utils/alertShim'` e `Alert.alert(...)` por
`showAlert(...)` — mudança mecânica, sem risco de regressão de lógica porque a
assinatura é idêntica.

## (d) Página de instalação guiada

**Decisão recomendada: rota dentro do app (React Navigation), não página
estática separada no site.**

Razões específicas a este projeto:

1. **Site e app são o mesmo deploy.** Não existe hoje um "site" separado do
   PWA — `forca-app-six.vercel.app` É o app. Uma página estática separada
   exigiria um segundo projeto Vercel ou uma rota fora do `rewrites` do
   `vercel.json` (que hoje redireciona TUDO para `index.html` exceto
   `_expo`/`icons`/`assets`/`manifest.json`/`favicon.ico` — uma página HTML
   estática nova quebraria esse catch-all ou exigiria uma exceção nova).
2. **Uma rota dentro do app aproveita o design system e os componentes de UI
   já existentes** (tema dark, tipografia da marca) em vez de recriar HTML/CSS
   solto — consistente com o app já ter uma tela de onboarding guiado
   (`QuestionnaireScreen`, `PostQuestionnaireChat`) no mesmo padrão de
   passo-a-passo que "instale em 3 passos" pede.
3. **Detecção de plataforma:** a rota pode usar `Platform.OS === 'web'` +
   `navigator.userAgent` (checar iOS Safari não-standalone) para decidir se
   mostra o guia ou redireciona quem já está instalado — lógica que só faz
   sentido rodando dentro do próprio React Native-Web, não numa página HTML
   solta sem acesso ao `Platform` do RN.

Rota nova: `/instalar` (ou `/install`), acessível sem autenticação (fora do
`AuthContext` gate), com 3 passos ilustrados (compartilhar → adicionar à tela
de início → abrir pelo ícone). Link para essa rota fica no rodapé/tela de
login para quem chega pelo navegador comum ainda não instalado.

## (e) Interação do service worker com o outbox offline-first

**Regra central: o service worker NUNCA intercepta, cacheia ou reenvia
chamadas ao Supabase/PostgREST.** Isso não é uma escolha de performance — é
para não duplicar a camada de retry que já existe e já está testada em
produção (outbox: backoff exponencial, quarentena, dedupe por chave natural,
mutex por usuário via `withOutboxTransaction`).

Se o service worker registrasse uma rota de runtime caching (ou pior, Background
Sync) para as chamadas de `saveSetLog`/`finishSessionLog` etc., o app teria
DUAS filas de retry independentes e sem coordenação — o outbox no `AsyncStorage`
(camada de aplicação, com política de negócio: P0001 sessão fechada, payload
shape guard, expiração) e uma fila do Background Sync do navegador (camada de
rede, sem noção nenhuma dessas regras). Um reenvio duplicado por duas camadas
diferentes é exatamente o tipo de bug (mutação duplicada de estado) que as
regras globais deste projeto pedem para prevenir com teste antes de
implementar.

**Divisão de responsabilidade, sem sobreposição:**

| Camada | Responsabilidade | Não faz |
|--------|-------------------|---------|
| Outbox (existente) | Retry/backoff/quarentena de MUTAÇÕES de execução de treino (RPCs Supabase) | Não lida com cache de assets estáticos |
| Service Worker (novo) | Cache do app shell (HTML/JS/CSS/ícones) para abrir offline | Não intercepta `connect-src` (Supabase/APIs) — nenhuma rota registrada para esses hosts |

**O que "abrir sem rede" significa concretamente nesta arquitetura:** o SW
serve o app shell do cache (React Native-Web monta normalmente); a partir daí,
o outbox já sabe lidar com "sem rede" para as mutações (é o comportamento que
a Fase 4 do v1.0 já validou com UAT em modo avião). O service worker não
precisa reimplementar nada disso — só precisa garantir que o JS do outbox
CARREGUE mesmo sem rede. Isso é puramente precache do bundle, já coberto pela
seção (a).

**Único ponto de atenção genuíno:** o `Content-Security-Policy` do
`vercel.json` já declara `no-cache` para `manifest.json` e para o HTML de
entrada (regra catch-all) — o service worker precisa de uma estratégia de
update (`skipWaiting`/`clientsClaim` do Workbox, com prompt de "nova versão
disponível" ou update silencioso no próximo load) para não travar o usuário
numa versão antiga do bundle enquanto a Vercel já serve uma nova — mesma
preocupação que o time já tem hoje com cache agressivo (headers
`Cache-Control: public, max-age=31536000, immutable` em `_expo/static/`, que
JÁ dependem do hash do arquivo mudar a cada build; o SW deve confiar nesse
mesmo mecanismo, não inventar um segundo).

## Anti-Patterns a evitar neste projeto

### Anti-Pattern 1: Service Worker com Background Sync para as escritas do outbox

**O que seria tentador fazer:** usar a Background Sync API do navegador para
"garantir" que os POSTs cheguem mesmo com o app fechado.
**Por que é errado aqui:** o outbox já resolve isso na camada de aplicação com
regras de negócio específicas (P0001, quarentena, expiração) que o Background
Sync do navegador não conhece. Duas filas = risco de duplo envio ou de
reconciliação inconsistente.
**Fazer em vez disso:** deixar o outbox como está; o SW só cuida do app shell.

### Anti-Pattern 2: `injectManifest` com lógica de runtime caching escrita à mão para tudo

**O que seria tentador fazer:** escrever um `sw.js` totalmente manual para ter
controle fino.
**Por que é errado aqui:** o app não tem necessidade de estratégia de cache
complexa (é um app shell único, sem múltiplas rotas HTML) — `generateSW` do
Workbox resolve com configuração declarativa, e reduz superfície de bug num
sistema (service worker) notoriamente difícil de debugar/atualizar em
produção.
**Fazer em vez disso:** `generateSW`, revisitar `injectManifest` só se uma
necessidade real de runtime caching custom aparecer.

### Anti-Pattern 3: Edge Function do Supabase para o envio de push

**O que seria tentador fazer:** já que as subscriptions moram no Supabase,
enviar o push de lá também (Postgres trigger → Edge Function).
**Por que é errado aqui:** fragmenta a lógica de servidor em dois runtimes
(Flask/Python e Deno/TS) para uma feature que é naturalmente acoplada ao job
de replanejamento e ao scheduler que já vivem no Flask.
**Fazer em vez disso:** Flask + `pywebpush`, lendo a tabela via service_role.

## Build Order Recomendada

A ordem respeita dependências reais (não é só prioridade de produto):

```
1. Fechar Alert.alert (independente de tudo)
   └─ Sem dependência de infra nova. Desbloqueia UAT confiável das telas
      afetadas ANTES de mexer em service worker (que também muda o
      comportamento de load/refresh dessas mesmas telas — melhor isolar).

2. Splash screens iOS (independente, paralelo ao item 1)
   └─ Só assets + meta tags em index.html. Zero código de lógica.

3. Service worker (app shell only, sem push ainda)
   └─ Depende do pipeline de build (buildCommand do vercel.json) —
      trava com verify-web-bundle.mjs já dá o precedente de "passo
      adicional encadeado". Testável isoladamente (offline real) antes
      de push, que depende de SW registrado para expor
      PushManager.subscribe().

4. Página de instalação guiada
   └─ Pode rodar em paralelo ao item 3 (rota nova, não toca no SW) —
      mas fica mais completa reference-ando o resultado do item 3
      ("funciona offline") como parte do pitch de instalação.

5. Push notification (subscription no cliente + tabela + endpoint Flask)
   └─ DEPENDE do item 3 (service worker precisa estar registrado para
      PushManager.subscribe() funcionar) e do item 1 (a UI de "permitir
      notificações" provavelmente usa o alertShim/dialog para o convite
      de opt-in, já que Notification.requestPermission() exige gesto
      direto do usuário — um botão de UI é o gesto).
```

**Item 5 é o que mais precisa de spike prévio** (confiança MEDIUM-BAIXA em
`pywebpush`, comportamento de expiração de subscription, teste real em iPhone
16.4+ instalado — o iOS só permite testar o fluxo de push DE VERDADE com o
PWA instalado na Tela de Início, não no Expo web local; isto é uma limitação
de verificação que a máquina sem toolchain nativa já teria de qualquer forma,
mas aqui é mais severa: nem simulador ajuda, precisa do hardware).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Workbox CLI | Passo de build (`generateSW`) encadeado no `buildCommand` do `vercel.json`, depois do `expo export` | Não é dependência de runtime do app — só do build |
| Web Push API (browser) | `navigator.serviceWorker.ready.pushManager.subscribe(...)` no cliente, chamado a partir de um gesto do usuário na página de instalação/onboarding | Exige HTTPS (já garantido pela Vercel) e SW registrado |
| pywebpush (backend) | `pip install pywebpush`, chamado pelo job/scheduler existente (`job_manager.py`) | Validar tratamento de HTTP 410 (subscription expirada) em spike |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Service Worker ↔ App shell | Cache-first via precache manifest do Workbox | Sem comunicação com o outbox — camadas independentes |
| Outbox ↔ Supabase/PostgREST | RPC direta (fetch/`@supabase/supabase-js`), sem passar pelo SW | Nenhuma rota do SW registrada para `*.supabase.co` |
| `alertShim` ↔ Telas existentes | Import trocado (`Alert` → `showAlert`), mesma assinatura | 12 call sites, migração mecânica |
| Backend Flask ↔ `push_subscriptions` | Leitura via `service_role` (bypassa RLS), mesmo padrão de outras operações privilegiadas do backend | Não expor `service_role` no cliente — só no Flask |

## Sources

- [PWA push notifications on iOS 16.4 — pwa.io](https://pwa.io/articles/web-push-with-ios-safari-16-4-made-easy) (MEDIUM — cruzado com Pushly, PushEngage, Apple Developer Forums)
- [Setting up Web Push on iOS/iPadOS — PushEngage](https://www.pushengage.com/documentation/setting-up-web-push-notifications-for-ios-ipad/) (MEDIUM)
- [Safari on Mobile — Pushly](https://documentation.pushly.com/integration/web-browser-push/safari/safari-on-mobile-ios-ipados) (MEDIUM)
- [Precaching dos and don'ts — Chrome for Developers / Workbox](https://developer.chrome.com/docs/workbox/precaching-dos-and-donts) (MEDIUM)
- [Caching resources during runtime — Workbox](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime/) (MEDIUM)
- [Progressive web apps — Expo Documentation](https://docs.expo.dev/guides/progressive-web-apps/) (MEDIUM — confirma que Expo não tem integração nativa de PWA/SW no SDK atual)
- [Flask-pyWebPush — GitHub](https://github.com/illright/flask-pywebpush) (LOW — poucas fontes independentes, validar em spike)
- [Python Web Push com Flask — Gabriele Romanato](https://gabrieleromanato.name/python-how-to-implement-web-push-notifications-in-flask) (LOW)
- [React Native Alert.alert não funciona no web — w3tutorials](https://www.w3tutorials.net/blog/react-native-alert-alert-only-works-on-ios-and-android-not-web/) (MEDIUM)
- [React Native custom alert patterns — Medium](https://medium.com/react-native-custom-alert/react-native-custom-alert-c85514311cc4) (MEDIUM)
- Codebase (fonte primária, HIGH): `vercel.json`, `public/manifest.json`, `public/index.html`, `src/services/sessionOutboxDrain.ts`, `src/services/sessionOutboxStorage.ts`, `src/utils/haptics.ts`, `backend/app.py`, `requirements.txt`, `.planning/PROJECT.md`

---
*Architecture research for: PWA de primeira classe no iOS (v1.2)*
*Researched: 2026-08-14*
