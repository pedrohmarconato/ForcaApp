# Project Research Summary

**Project:** ForçaApp v1.2 — "App de iPhone instalável via site (PWA)"
**Domain:** PWA de primeira classe no iOS (instalação, offline, push) sobre app Expo/RN-web já em produção
**Researched:** 2026-08-14
**Confidence:** MEDIUM-HIGH

## Executive Summary

O ForçaApp v1.2 não começa do zero: manifest, ícones, meta tags iOS e CSP já estão em produção na Vercel. O que falta de verdade é infraestrutura nova em quatro frentes concretas — service worker (não existe hoje), splash screens iOS dedicadas, infraestrutura de push (VAPID + tabela de subscriptions + envio via `pywebpush` no Flask existente) e o fechamento sistemático do `Alert.alert` no-op no runtime web. O padrão de mercado (guia oficial Expo + Workbox) é claro e bem documentado para as três primeiras peças; a única área de confiança mais baixa é o comportamento fino de `pywebpush`/expiração de subscription no iOS, que carece de documentação primária robusta.

A abordagem recomendada é de **integração cirúrgica, não reconstrução**: o service worker deve cachear exclusivamente o app shell estático (nunca as chamadas ao Supabase/PostgREST ou às APIs do Flask), preservando o outbox offline-first já validado em produção como única camada de retry de dados. Push deve ser implementado no backend Flask já existente (`pywebpush`), não em Edge Functions do Supabase, evitando fragmentar lógica de servidor em dois runtimes. A página de instalação guiada deve ser uma rota dentro do próprio app React Native-Web (não um HTML estático separado), reaproveitando o design system e evitando conflito com o catch-all de rewrites do `vercel.json`.

O maior risco do milestone não é técnico no sentido de "não sabemos como fazer" — é operacional: cache mal configurado (SW ou headers da Vercel) trava usuários numa versão antiga sem forma de o dono orientar reload manual em standalone; pedido de permissão de push fora do gesto síncrono do usuário falha silenciosamente no Safari sem qualquer erro visível; e um SW que intercepta chamadas de API duplicaria a camada de retry que o outbox já resolve, reintroduzindo exatamente o tipo de bug (mutação duplicada de estado) que as regras do projeto pedem para evitar com teste antes de implementar. Boa parte da verificação final (push ponta a ponta, splash real, persistência de sessão em standalone, comportamento de instalação) só é validável em iPhone real — a máquina de dev não tem toolchain nativa, então cada fase relevante deve terminar com item explícito de UAT do dono, não com "passou no Lighthouse".

## Key Findings

### Recommended Stack

O stack novo é enxuto e reaproveita a infraestrutura existente: `workbox-cli` (7.4.1) gera o service worker a partir do `dist/` produzido pelo `expo export -p web` — não existe suporte nativo do Expo/Metro para PWA desde a migração para Metro (SDK 50+), e este é o caminho que o guia oficial do Expo recomenda explicitamente. `pwa-asset-generator` (8.1.5) gera as splash screens iOS (`apple-touch-startup-image`), que o iOS não deriva automaticamente do manifest. No backend, `pywebpush` (2.4.0) + `py-vapid` (1.9.4) enviam Web Push assinado a partir do Flask já em produção — sem necessidade de SDK de terceiros (OneSignal etc.), já que iOS 16.4+ implementa o padrão Web Push nativamente.

**Core technologies:**
- `workbox-cli generateSW` — gera o service worker pós-build — único caminho suportado para PWA em Expo SDK 54 (Metro não tem plugin nativo)
- `pwa-asset-generator` — gera splash screens iOS por resolução/orientação — evita gerar ~30 combinações manualmente
- `pywebpush` + `py-vapid` (Flask) — envio de Web Push com VAPID — reaproveita o backend existente, sem infra nova
- Web Push API nativa do navegador (cliente) — sem SDK de terceiros — iOS 16.4+ já expõe o padrão nativamente

### Expected Features

**Must have (table stakes):**
- Manifest completo + `apple-touch-icon` + meta tags standalone — já existe, mas é a base de tudo mais
- Splash screen iOS (`apple-touch-startup-image`) — sem isso a abertura parece bug (flash em branco)
- Página de instalação guiada com detecção de iOS/Safari e de "já instalado" — único caminho de descoberta, já que `beforeinstallprompt` não existe no iOS
- Offline de casca via service worker, casando com o outbox existente — app precisa abrir sem rede
- Fluxo de atualização de SW com aviso não-bloqueante — nunca reload forçado durante sessão de treino
- Push notification (gesto explícito + infra backend) — declarado no escopo, mas é a peça mais cara/arriscada em tempo
- Correção do `Alert.alert` no-op — dívida já mapeada, baixo custo, alto impacto percebido

**Should have (competitive):**
- Badge no ícone (contagem de treino pendente) — gated por permissão de push já concedida
- Detecção de navegador (Safari vs Chrome iOS) na página de instalação — baixo custo, ganho real de clareza

**Defer (v2+):**
- Persistent Storage API — só se houver relato real de perda de dado local
- Splash multi-resolução refinada (matriz completa) — polimento visual, não bloqueia funcionalidade
- Distribuição via Apple Developer pago — porta reaberta só com decisão explícita do dono

### Architecture Approach

O service worker entra como passo de pós-build (`workbox-cli generateSW`) encadeado no `buildCommand` do `vercel.json`, no mesmo padrão que `verify-web-bundle.mjs` já usa hoje — precache apenas do app shell estático, com exclusão explícita de qualquer chamada a `*.supabase.co` ou `forca-api.cadastrai.com`. Push usa uma nova tabela `push_subscriptions` no Supabase (RLS por `auth.uid()`, leitura via `service_role` no backend, mesmo padrão já usado em outras operações privilegiadas do Flask) com envio disparado pelo `job_manager.py` existente. O `Alert.alert` no-op é resolvido por um wrapper único (`alertShim.ts`) com a mesma assinatura de `Alert.alert`, seguindo o precedente já estabelecido por `haptics.ts`/`secureStorage.ts` — migração mecânica dos 12 call sites, sem `Platform.select` espalhado. A página de instalação vira uma rota React Navigation dentro do próprio app, não HTML estático.

**Major components:**
1. Service worker (Workbox `generateSW`) — cache-first do app shell, nunca intercepta APIs
2. `push_subscriptions` (Supabase) + endpoint/job Flask (`pywebpush`) — infra de push ponta a ponta
3. `alertShim.ts` + `AlertHost` (Zustand) — substituição central de `Alert.alert` no web
4. Rota `/instalar` — página de instalação guiada dentro do app, com detecção de plataforma/instalado

### Critical Pitfalls

1. **SW cache-first serve HTML/manifest velho para sempre** — usar `network-first` para HTML raiz e manifest, cache versionado por deploy, nunca `skipWaiting()` silencioso durante sessão ativa.
2. **Headers de cache da Vercel deixando `sw.js` cacheado no CDN** — forçar `Cache-Control: no-cache, must-revalidate` explícito para `/sw.js` e manifest no `vercel.json`; verificar com `curl -I` em produção.
3. **Pedir permissão de push fora de gesto síncrono do usuário** — falha silenciosa no Safari, sem erro no console; a chamada precisa ser a primeira coisa síncrona no `onClick`, sem `await` antes.
4. **Subscription de push iOS expira sem `expirationTime`** — backend precisa tratar 410/404 apagando a subscription imediatamente; nunca chamar `unsubscribe()` no logout.
5. **`Alert.alert` no-op tratado como bug pontual em vez de padrão de classe** — auditoria completa de `Alert\.` no repo, não só o "Concluir treino" já conhecido.

## Implications for Roadmap

Baseado na ordem de dependências reais (não só prioridade de produto), identificada explicitamente em ARCHITECTURE.md:

### Phase 1: Fechamento de gaps do runtime web (Alert.alert)
**Rationale:** Independente de toda infra nova; desbloqueia UAT confiável das telas afetadas antes de mexer no comportamento de load/refresh que o SW vai alterar depois.
**Delivers:** `alertShim.ts` + `AlertHost`, migração dos 12 call sites, auditoria `grep Alert\.` zerada.
**Addresses:** Correção do Alert.alert no-op (table stakes), fechamento de gaps do runtime web.
**Avoids:** Pitfall 5 (no-op tratado como bug pontual, não como padrão de classe).

### Phase 2: Manifest/ícones/splash iOS
**Rationale:** Só assets + meta tags, zero lógica de código; pode rodar em paralelo à Fase 1.
**Delivers:** Splash screens via `pwa-asset-generator`, `<link rel="apple-touch-startup-image">` no `index.html`.
**Uses:** `pwa-asset-generator` (STACK.md).
**Implements:** Componente de manifest/instalação (ARCHITECTURE.md).

### Phase 3: Service worker (app shell offline)
**Rationale:** Depende do pipeline de build (`buildCommand` do `vercel.json`); testável isoladamente antes de push, que depende de SW registrado.
**Delivers:** `sw.js` gerado via Workbox `generateSW`, headers de cache corrigidos no `vercel.json`, fluxo de update com banner não-bloqueante.
**Uses:** `workbox-cli` (STACK.md).
**Implements:** Service worker cache-first do app shell, exclusão explícita de rotas Supabase/API (ARCHITECTURE.md).
**Avoids:** Pitfalls 1 e 2 (cache-first servindo versão velha; headers de cache da Vercel para `sw.js`).

### Phase 4: Página de instalação guiada
**Rationale:** Pode rodar em paralelo à Fase 3 (rota nova, não toca no SW), mas referencia "funciona offline" como parte do pitch.
**Delivers:** Rota `/instalar` com passo a passo, detecção de iOS/Safari vs Chrome iOS, detecção de "já instalado".
**Addresses:** Página de instalação guiada (table stakes), detecção de navegador (differentiator).
**Avoids:** Pitfall de OAuth/redirect cross-context (mapear fluxos de auth que saem do domínio).

### Phase 5: Push notification (subscription + backend)
**Rationale:** Depende do SW registrado (Fase 3, `PushManager.subscribe()`) e do alertShim (Fase 1, UI de opt-in). Maior risco de estouro de tempo e menor confiança de fonte (`pywebpush`).
**Delivers:** Tabela `push_subscriptions`, endpoint/job Flask com `pywebpush`, botão "Ativar notificações" com gesto síncrono, dois gatilhos de domínio (lembrete de treino, replanejamento pronto).
**Uses:** `pywebpush`, `py-vapid` (STACK.md).
**Implements:** Push notification ponta a ponta (ARCHITECTURE.md, seção b).
**Avoids:** Pitfalls 3 e 4 (gesto do usuário; subscription expirada sem limpeza).

### Phase Ordering Rationale

- Alert.alert vem primeiro porque é ortogonal e desbloqueia UAT limpo das telas que o SW vai afetar depois (evita confundir "botão morto por Alert" com "botão morto por SW/cache").
- Manifest/splash e SW/instalação podem ser parcialmente paralelizados, mas push é estritamente sequencial após SW (dependência técnica real: `PushManager` exige SW registrado) e após Alert.alert (dependência de UX: o convite de opt-in usa o alertShim).
- Push fica por último porque é a peça de maior custo de implementação e menor confiança de fonte — se algo precisar cortar por tempo, é a primeira candidata a virar v1.2.1, conforme já sinalizado em FEATURES.md.

### Research Flags

Needs research: **Fase 5 (Push)** — spike de 1-2h confirmando comportamento de expiração de subscription e tratamento de HTTP 410 no `pywebpush` antes de comprometer a fase inteira (confiança MEDIUM-BAIXA nas fontes de `pywebpush`).

Phases with standard patterns (skip research-phase): **Fase 1 (Alert.alert)** — padrão já estabelecido no próprio repo (`haptics.ts`, `secureStorage.ts`); **Fase 2 (manifest/splash)** — geração de assets, sem lógica nova; **Fase 3 (Service worker)** — guia oficial Expo + Workbox documentado; **Fase 4 (instalação guiada)** — rota React Navigation padrão do app.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Versões verificadas direto em npm/PyPI; guia oficial Expo confirmado por fetch direto |
| Features | MEDIUM | Cross-checado entre WebKit, MDN, web.dev, Apple Developer Forums; Apple não documenta PWA como produto de primeira classe |
| Architecture | MEDIUM | Padrões de Workbox/VAPID bem estabelecidos; `pywebpush` tem documentação escassa (validar em spike) |
| Pitfalls | MEDIUM | Múltiplas fontes convergentes (fóruns oficiais, GitHub issues, docs primárias); nenhum teste em iPhone real possível nesta máquina |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- Comportamento fino de expiração/revogação de subscription do `pywebpush` no iOS — resolver com spike técnico antes da Fase 5 (Push), não durante a implementação principal.
- Toda verificação que depende de hardware iOS real (instalação via Tela de Início, push ponta a ponta, splash real, persistência de sessão em standalone 7+ dias, OAuth cross-context) — não é gap de pesquisa, é limitação de ambiente; cada fase relevante deve terminar com item de UAT explícito do dono no iPhone, nunca com "passou no Lighthouse" como critério de conclusão.
- Confirmar se `Alert.alert` é no-op total ou `window.confirm` fora de foco antes de fechar a Fase 1 — teste isolado rápido recomendado em ARCHITECTURE.md.

## Sources

### Primary (HIGH confidence)
- `docs.expo.dev/guides/progressive-web-apps` — guia oficial Expo, verificado por fetch direto
- `npmjs.com` (npm view) — versões `workbox-cli@7.4.1`, `pwa-asset-generator@8.1.5`
- `pypi.org` — `pywebpush@2.4.0`, `py-vapid@1.9.4`
- Codebase do próprio repo: `vercel.json`, `public/manifest.json`, `public/index.html`, `src/services/sessionOutboxDrain.ts`, `src/utils/haptics.ts`, `backend/Dockerfile`, `requirements.txt`, `.planning/PROJECT.md`

### Secondary (MEDIUM confidence)
- WebKit blog oficial (badging), MDN, web.dev/Chrome DevRel — table stakes e padrões de instalação/update
- Apple Developer Forums (threads 728796, 727372, 694805, 767029, 807603) — comportamento de push, background sync, `beforeinstallprompt`
- Chrome for Developers / Workbox docs — precaching e runtime caching
- GitHub issues (`GoogleChrome/workbox#1744`, `vercel/serve#299`, `next-pwa#131`, `supabase/discussions#12227`)

### Tertiary (LOW confidence)
- `Flask-pyWebPush` (GitHub, PyPI) e blogs individuais sobre `pywebpush` — validar em spike técnico antes da Fase 5
- Busca web agregada (sem MCP Exa/Context7) sobre requisitos de instalação PWA no iOS — usada só para padrões amplamente documentados

---
*Research completed: 2026-08-14*
*Ready for roadmap: yes*
