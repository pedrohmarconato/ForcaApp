# Roadmap: ForcaApp

## Milestones

- ✅ **v1.0 Cardio e alongamento** — Phases 1-4 (shipped 2026-08-13) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Release em produção** — Phases 5-8 (shipped 2026-08-14) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 App de iPhone instalável via site (PWA)** — Phases 9-13 (in progress)

## Phases

<details>
<summary>✅ v1.0 Cardio e alongamento (Phases 1-4) — SHIPPED 2026-08-13</summary>

- [x] Phase 1: Fluxo cardio e alongamento (4/4 plans) — completed 2026-08-09
- [x] Phase 2: Anamnese e calibração do cardio (3/3 plans) — completed 2026-08-09
- [x] Phase 3: Intercâmbio de modalidade de cardio (9/9 plans) — completed 2026-08-13
- [x] Phase 4: Escrita de execução de treino em lote e offline-first (3/3 plans) — completed 2026-08-12

Detalhes completos: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Release em produção (Phases 5-8) — SHIPPED 2026-08-14</summary>

- [x] Phase 5: Integração e review do gráfico de cardio (2/2 plans) — completed 2026-08-14 (verificação 11/11; UAT visual do dono no PWA de produção: "passou")
- [x] Phase 6: Publicação do código (execução direta) — completed 2026-08-14 (push `0193742..82fd8db`, 68 commits, CI `session-contract` verde run 31822228262)
- [x] Phase 7: Migration 0037 em staging e produção (execução direta) — completed 2026-08-14 (errcode 23505 vivo, md5 `662cbd9e` idêntico staging×prod)
- [x] Phase 8: Deploy web e fechamento (execução direta) — completed 2026-08-14 (https://forca-app-six.vercel.app, 200; preview pulado por decisão do dono)

Detalhes completos: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

Nota de fechamento: override_closeout — fases 6-8 executadas sem diretórios de fase
(evidência direta em ROADMAP/STATE); sem audit formal de milestone.

</details>

- [ ] **Phase 9: Fechamento de gaps do runtime web** - Alert.alert deixa de ser no-op e a tela não bloqueia durante a sessão ativa (Wake Lock)
- [ ] **Phase 10: Identidade do app instalável** - Ícones, nome e splash screen próprios ao instalar pela Tela de Início
- [ ] **Phase 11: Service worker e atualização segura** - App abre sem rede e nunca prende o usuário numa versão velha
- [ ] **Phase 12: Página de instalação guiada** - Rota `/instalar` com passo a passo para quem não é técnico
- [ ] **Phase 13: Push notification ponta a ponta** - Lembrete de treino e aviso de replanejamento chegam no iPhone

## Phase Details

### 🚧 v1.2 App de iPhone instalável via site (PWA) (In Progress)

**Milestone Goal:** O ForcaApp vira um app instalável de primeira classe no iPhone —
baixado do site do dono, sem App Store e sem conta Apple — elevando o PWA da Vercel
a uma experiência indistinguível de app nativo para os ~20 usuários (família/alunos).

#### Phase 9: Fechamento de gaps do runtime web

**Goal**: No alvo web, nenhuma tela do treino trava por diálogo mudo (Alert.alert
no-op) nem pelo iPhone bloqueando a tela durante a sessão ativa.
**Depends on**: Nothing (primeira fase do milestone; ortogonal à instalação/SW —
desbloqueia UAT confiável das telas que as fases seguintes vão afetar)
**Requirements**: WEB-01, SESS-01
**Success Criteria** (what must be TRUE):

  1. Auditoria `grep -rn "Alert\.alert" src/` não retorna nenhum call site fora do
     componente `AlertHost`/`alertShim.ts` — os 12 call sites em 6 arquivos migraram
     para o shim central, mesmo padrão de `haptics.ts`/`secureStorage.ts`.

  2. No Expo web, uma ação que antes usava `Alert.alert` (ex.: "Concluir treino" com
     séries pendentes) mostra diálogo visível com opções funcionais — não é mais um
     clique morto.

  3. UAT do dono no iPhone real (PWA instalado): durante uma sessão de treino ativa,
     a tela nunca escurece/bloqueia enquanto o Wake Lock está ativo, e ao concluir ou
     sair da sessão o bloqueio automático do iPhone volta ao normal.
**Plans**: 3/4 plans executed
Plans:
**Wave 1**

- [x] 09-01-PLAN.md — Núcleo alertShim/alertStore/AlertHost + Wake Lock lifecycle em ActiveSessionScreen (tracer)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 09-02-PLAN.md — Migrar Alert.alert em QuestionnaireScreen (6) + SignUpScreen (1)
- [x] 09-03-PLAN.md — Migrar confirmarPadrao (JointLobbyScreen) + remover import morto (PostQuestionnaireChat)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 09-04-PLAN.md — Guarda de regressão D-08 + UAT do dono no iPhone real

#### Phase 10: Identidade do app instalável

**Goal**: O ForcaApp instalado pela Tela de Início abre em modo standalone, com
ícone, nome e splash screen próprios — sem flash de tela branca.
**Depends on**: Nothing (só assets e meta tags; pode rodar em paralelo à Fase 9,
sequenciada aqui para o fluxo do milestone)
**Requirements**: INST-01
**Success Criteria** (what must be TRUE):

  1. `apple-touch-startup-image` (splash screen) é gerado por `pwa-asset-generator`
     para as resoluções/orientações relevantes de iPhone e referenciado no
     `index.html`.

  2. UAT do dono no iPhone real: instala o ForcaApp pela Tela de Início a partir do
     Safari e, ao abrir o app, não há flash de tela branca — a splash screen aparece
     corretamente.

  3. UAT do dono no iPhone real: o ícone na Tela de Início e o nome abaixo dele são
     os do ForcaApp (não a URL genérica da Vercel), e o app abre sem a barra de
     endereço do Safari (modo standalone).
**Plans**: 1 plan
Plans:
**Wave 1**

- [ ] 10-01-PLAN.md — Gerar splash iOS curada (pwa-asset-generator), ligar a index.html, corrigir rewrite do vercel.json e UAT do dono no iPhone real

**UI hint**: yes

#### Phase 11: Service worker e atualização segura

**Goal**: O app instalado abre sem rede (app shell offline) e nunca prende o
usuário numa versão antiga, sem duplicar a camada de retry do outbox offline-first
já validado no v1.0.
**Depends on**: Nothing novo (usa o pipeline de build da Vercel já existente; pode
rodar em paralelo à Fase 10)
**Requirements**: OFF-01, OFF-02
**Success Criteria** (what must be TRUE):

  1. O service worker (`sw.js`, gerado via Workbox `generateSW`) faz cache apenas do
     app shell estático — nenhuma chamada a `*.supabase.co` ou à API Flask é
     interceptada; confirmado inspecionando o `sw.js` gerado e testando que o
     outbox continua sendo a única camada de retry de dados.

  2. `sw.js` e `manifest.json` são servidos em produção com
     `Cache-Control: no-cache, must-revalidate` (verificável via `curl -I`) — nenhum
     dos dois fica preso em cache da CDN da Vercel.

  3. Ao publicar uma nova versão, o usuário recebe um aviso não-bloqueante de
     atualização disponível — nunca um reload forçado durante uma sessão de treino
     ativa.

  4. UAT do dono no iPhone real: com o PWA instalado, ativa o modo avião, abre o app
     pela Tela de Início e confirma que a casca do app aparece mesmo sem rede.
**Plans**: 2/3 plans executed
Plans:
**Wave 1**

- [x] 11-01-PLAN.md — Pipeline Workbox de ponta a ponta (workbox-config.cjs, register-sw.js, vercel.json rewrite/headers, guarda jest) — tracer

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-02-PLAN.md — UpdateBanner + updateStore, banner não-bloqueante de atualização montado em App.tsx

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 11-03-PLAN.md — Checkpoint: Node.js Version na Vercel, curl -I em produção e UAT do dono no iPhone real (modo avião)

#### Phase 12: Página de instalação guiada

**Goal**: Qualquer aluno leigo consegue instalar o ForcaApp sozinho a partir do
site, sem instrução verbal do dono.
**Depends on**: Phase 10 (referencia a identidade — ícone/nome — que o app já
instala corretamente)
**Requirements**: INST-02
**Success Criteria** (what must be TRUE):

  1. A rota `/instalar` existe dentro do próprio app (React Navigation) com passo a
     passo de como instalar no iPhone via Safari.

  2. A página detecta quando o app já está rodando em modo standalone (já
     instalado) e adapta a mensagem, sem repetir o passo a passo de instalação.

  3. UAT do dono (ou de um aluno real) no iPhone: acessa `/instalar` pelo Safari,
     segue os passos exibidos sem ajuda adicional, e consegue instalar o app pela
     Tela de Início.
**Plans**: 1/2 plans executed
Plans:
**Wave 1**

- [x] 12-01-PLAN.md — installDetection.ts + InstallScreen (4 estados) + registro de /instalar em linkingInterceptor/AuthNavigator (tracer) e linkingConfig/OnboardingNavigator/MainNavigator

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 12-02-PLAN.md — Checkpoint: UAT do dono/aluno no iPhone real (instalação guiada sem ajuda)

**UI hint**: yes

#### Phase 13: Push notification ponta a ponta

**Goal**: O aluno recebe notificações push relevantes (lembrete de treino,
replanejamento pronto) e um toque leva direto à sessão, com infra própria
(`pywebpush`) e sem SDK de terceiros.
**Depends on**: Phase 11 (`PushManager.subscribe()` exige service worker
registrado), Phase 9 (o convite de opt-in usa o `alertShim`)
**Requirements**: PUSH-01, PUSH-02, PUSH-03, PUSH-04, PUSH-05
**Success Criteria** (what must be TRUE):

  1. Spike técnico prévio documentado confirma o tratamento de expiração/HTTP 410 de
     subscription no `pywebpush` antes da implementação seguir adiante.

  2. O botão "Ativar notificações" dispara `PushManager.subscribe()` como primeira
     ação síncrona do clique (sem `await` antes) e grava a subscription na tabela
     `push_subscriptions` (RLS por usuário).

  3. UAT do dono no iPhone real (PWA instalado): concede a permissão de
     notificação, recebe o lembrete de treino no horário configurado e a
     notificação de replanejamento pronto quando o job do Flask dispara.

  4. UAT do dono no iPhone real: toca na notificação de lembrete de treino e o app
     abre direto na tela da sessão ativa, pronto para registrar reps/peso — um
     toque do bloqueio ao registro.

  5. Com permissão de push concedida, o ícone do app exibe badge de treino
     pendente; subscriptions que retornam HTTP 410/404 são removidas da tabela
     automaticamente, sem ficarem órfãs.
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fluxo cardio e alongamento | v1.0 | 4/4 | Complete | 2026-08-09 |
| 2. Anamnese e calibração do cardio | v1.0 | 3/3 | Complete | 2026-08-09 |
| 3. Intercâmbio de modalidade de cardio | v1.0 | 9/9 | Complete | 2026-08-13 |
| 4. Escrita de execução de treino em lote e offline-first | v1.0 | 3/3 | Complete | 2026-08-12 |
| 5. Integração e review do gráfico de cardio | v1.1 | 2/2 | Complete | 2026-08-14 |
| 6. Publicação do código | v1.1 | direto | Complete | 2026-08-14 |
| 7. Migration 0037 em staging e produção | v1.1 | direto | Complete | 2026-08-14 |
| 8. Deploy web e fechamento | v1.1 | direto | Complete | 2026-08-14 |
| 9. Fechamento de gaps do runtime web | v1.2 | 3/4 | In Progress|  |
| 10. Identidade do app instalável | v1.2 | 0/1 | Not started | - |
| 11. Service worker e atualização segura | v1.2 | 2/3 | In Progress|  |
| 12. Página de instalação guiada | v1.2 | 1/2 | In Progress|  |
| 13. Push notification ponta a ponta | v1.2 | 0/TBD | Not started | - |
