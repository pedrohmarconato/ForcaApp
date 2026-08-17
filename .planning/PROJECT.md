# Projeto: ForcaApp — Fluxo cardio e alongamento

## O que é

App Força (React Native/Expo + backend Flask/Claude + Supabase): geração de plano de
treino de 12 semanas por IA, sessão interativa série a série, adaptação intra-sessão e
replanejamento semanal. Este ciclo GSD cobre a reformulação do fluxo de **cardio e
alongamento**, hoje deslocados do resto do treino.

## Core Value

O cardio e o alongamento passam a ser parte coerente do treino: registro fiel do que o
usuário fez, meta com uma única fonte de verdade e condução guiada do alongamento.

## Requisitos

- **REQ-01** — O campo de distância do cardio aceita número decimal com vírgula
  (ex.: 2,4 km), persiste e exibe o valor exato.
  ✓ Validado na Fase 1 (verificação retroativa 2026-08-13, passed 4/4).
- **REQ-02** — A meta de cardio da tela Progresso deixa de existir como definição
  paralela à do treino — deriva da prescrição do plano (decisão do dono).
  ✓ Validado na Fase 1 (CardioPrescritoSection; verificação retroativa 2026-08-13).
- **REQ-03** — O alongamento ganha condução: quais exercícios, quanto tempo ou quantos
  movimentos cada um. O pedido de foco em alongamentos específicos feito no chat da IA
  reflete na condução apresentada.
  ✓ Validado na Fase 1 (checkpoint humano aprovado 2026-08-09 em geração real no HML;
  reconfirmado pelo dono em 2026-08-13).
- **REQ-04** *(Fase 2)* — O questionário captura experiência de cardio (já corre?,
  distância/tempo confortável, objetivo) e as respostas chegam comprovadamente ao
  gerador. ✓ Validado na Fase 2 (2026-08-09; verificação 9/9 + checkpoint humano).
- **REQ-05** *(Fase 2)* — O prompt do molde calibra dose inicial conservadora e teto de
  progressão semanal pelo nível de cardio declarado — sem mudar o schema do molde.
  ✓ Validado na Fase 2 (2026-08-09; geração real iniciante × experiente aprovada).
- **REQ-06** *(Fase 3)* — Um momento de cardio da sessão pode ser trocado por outra
  modalidade aceita (escada, bike, remo…), preservando a dose por tempo; a distância da
  modalidade original não vira meta da nova.
  ✓ Validado na Fase 3 (re-verificação 2026-08-13, passed 8/8; migrations 0034→0036 em
  homologação e produção; UAT rodada 3 com soma multi-modalidade provada — 45/90 min,
  7/15 km; resta o caveat deferido do teste 8(c): build nativo).
- **REQ-07** *(Fase 4)* — Registrar séries durante o treino para de depender de rede boa
  a cada série. As escritas de execução de sessão ganham buffer local durável e envio
  agrupado/reenviado, de modo que soluço de rede na academia não interrompa o treino nem
  apareça ao aluno como falha. Origem: sessão de debug
  `.planning/debug/typeerror-envio-series-treino.md`, causa-raiz (2).
  ✓ Validado na Fase 4 (2026-08-12; prova em 3 níveis — unitário, Postgres real via
  `test:integration:pg`, UAT modo avião aprovado pelo dono. Migration 0037 corrige o
  errcode P0005 da 0036, mascarado pelo PostgREST; aplicada só no stack local —
  staging/produção pendem do fluxo normal de deploy de migrations).

## Current State (v1.2 shipped 2026-08-15)

**Shipped:** v1.2 "App de iPhone instalável via site (PWA)" — o PWA da Vercel é
app instalável de primeira classe: alertShim (Alert.alert deixou de ser no-op),
Wake Lock na sessão ativa, identidade completa (ícones/splash), service worker
Workbox com offline de app shell e atualização manual segura, rota pública
`/instalar` guiada, e Web Push ponta a ponta (VAPID próprio, opt-in no Perfil,
lembrete 8h por scheduler no VPS, aviso de replanejamento, badge). Infra toda
verificada em produção em 15/08 (migrations 0038/0039, VAPID+service_role no
VPS, chave pública na Vercel, backend e web deployados). UAT físico no iPhone
DEFERIDO nas 5 fases — arquivos em `milestones/v1.2-phases/*/NN-UAT.md`.

**O que existe agora:** tudo do v1.0/v1.1 (cardio decimal, meta por prescrição,
alongamento guiado, anamnese calibrada, troca de modalidade com guarda, execução
offline-first, gráfico de evolução) MAIS o app instalável com push — em produção
(https://forca-app-six.vercel.app / https://forca-api.cadastrai.com).

**Dívidas conhecidas (com dono e caminho):** teste 8(c) em build nativo (máquina sem
toolchain); sessão de debug `resolved_partial` (falta o texto literal do erro de
produção); GRANT DML ausente para projetos Supabase novos; `Alert.alert` no-op no
react-native-web; tabela `cardio_goals` órfã; Nyquist not-validated nas fases do
v1.0. Detalhe: STATE.md (Pending Todos/Deferred Items).

## Current Milestone: v1.3 Treino de tela bloqueada (app nativo pessoal)

**Goal:** O dono faz a sessão de treino INTEIRA com o iPhone bloqueado — vê,
comanda e registra o treino pela tela bloqueada, como o Spotify
opera música — via app nativo pessoal por sideload gratuito (sem Apple Developer
pago, sem distribuição a terceiros).

**Target features:**
- Build nativo iOS por sideload gratuito: `expo prebuild` + assinatura com Apple
  ID pessoal (validade 7 dias), rotina de reassinatura semanal documentada
- Live Activity interativa da sessão: exercício atual, série X/Y e timer de
  descanso nativo na tela bloqueada, com botões via App Intents
  (concluir série, pular descanso) — sem abrir o app
- Registro sem teclado com memória: reps e carga pré-preenchidos do histórico do
  exercício, ajuste só por botões +/− e confirmação em 1 toque — na tela do app
  e na tela bloqueada (componente RN compartilhado: o PWA web herda)
- Fim de descanso audível: som/vibração via notificação local agendada
- Modo mãos-livres: sessão viva em background via sessão de áudio com cues
  falados (viável por ser sideload pessoal, sem review de loja)

**Contexto de contorno:** iPhone 13 do dono em iOS 26.x (Live Activity interativa
no Lock Screen; Dynamic Island deferida por ausência de hardware compatível);
Xcode instalado em 15/08 (licença pendente de aceite via
`sudo xcodebuild -license`); push nativo/APNs vetado no regime gratuito —
notificação local cobre; widget de tela de início (WidgetKit) fica fora deste
milestone; o PWA de produção segue intacto como canal web + push web.

## Restrições

- Sem CI de testes no repo — verificação é local: `tsc` + `jest` + `pytest`.
- Dois projetos Supabase: staging `forcaapp-staging` (ref `mjdjtiujhwklchalquhc`) e
  produção `forcaapp-prod` (ref `zanqygwsgxkyjiuhrzju`, DADOS REAIS); conferir
  `supabase/.temp/project-ref` antes de qualquer comando linkado (constatado na
  aplicação da migration 0033, Fase 2).
- Nada de dado inventado na UI: sem amostra é "—", nunca "0".
- Mudança de schema do JSON do plano gerado pela IA é porta de mão única (one-way
  door) — exige decisão explícita do dono.

## Key Decisions

| Data | Decisão | Contexto |
|------|---------|----------|
| 2026-08-08 | Feature planejada via GSD, fase única | Início do uso de GSD no repo |
| 2026-08-08 | REQ-02: meta de cardio derivada da prescrição do treino (prescrito × realizado); UI de meta manual sai | Decisão do dono via pergunta direta |
| 2026-08-08 | REQ-02: tabela `cardio_goals` fica intacta (órfã) — sem drop/arquivamento nesta fase | Decisão do dono; limpeza pode virar fase futura |
| 2026-08-08 | REQ-03: pedido de foco de alongamento acontece no chat de onboarding existente; canal contínuo pós-geração deferred | Decisão do dono; escopo contido, sem schema novo |
| 2026-08-09 | Migration 0033 (anamnese de cardio): option-a — aplicada em staging e depois em produção ANTES de merge/deploy dependente | Decisão do dono no checkpoint do plano 02-02; ambas verificadas via migration list + information_schema |
| 2026-08-09 | `claude-opus-4-8` aposentado em todo o conteúdo vivo do repo → `claude-opus-5` (17 arquivos) | Diretriz global do dono; histórico git preservado |
| 2026-08-12 | REQ-07: errcode P0005 da 0036 → 23505 via migration 0037 (supersede) | Decisão do dono no checkpoint do 04-03; PostgREST mascara SQLSTATE não oficial — achado do teste de integração contra Postgres real |
| 2026-08-13 | Teste 8(c) da Fase 3 (build nativo) deferido como caveat; itens (a)/(b) executados a pedido do dono ("teste você") e PASS | Fechamento do v1.0; máquina do ciclo sem Xcode/Android SDK; persistência já provada por leitura direta no banco |
| 2026-08-13 | v1.0 fechado como override_closeout com 1 item deferido (debug resolved_partial) | Decisão do dono no fechamento; demais portões todos verdes (4/4 fases verificadas) |
| 2026-08-14 | Fase 8: preview+smoke da Vercel pulado — deploy direto `--prod` | Decisão do dono ("manda tudo para prod logo"); smoke cumprido em produção (200 + verificação visual) |
| 2026-08-14 | UAT visual da Fase 5 cumprido pelo dono no PWA de produção ("passou") | Fecha a verificação 11/11; supera o alvo original (Expo web local) |
| 2026-08-14 | v1.1 fechado como override_closeout: fases 6-8 sem diretórios de fase (evidência direta em ROADMAP/STATE), sem audit formal; debug resolved_partial segue deferida | Milestone operacional de release; trilha de evidência completa (CI, md5, 200) |
| 2026-08-14 | v1.2 será app de iPhone via site pelo caminho PWA — SEM Apple Developer pago | Pesquisa 2026-08-14: TCC CADE trouxe só marketplaces alternativos (iOS 26.5), que exigem conta paga; dono não quer pagar; Ad Hoc/TestFlight ficam como porta reaberta se pagar US$ 99/ano |
| 2026-08-15 | v1.2 fechado como override_closeout com UAT físico deferido nas 5 fases; infra da fase 13 concluída e verificada no mesmo dia | Decisão do dono no /gsd-new-milestone; arquivos de UAT preservados em milestones/v1.2-phases/ |
| 2026-08-15 | v1.3 muda o canal: app NATIVO pessoal por sideload gratuito (Apple ID, 7 dias), objetivo = sessão inteira operada pela tela bloqueada (Live Activity interativa) | App é de uso próprio (sem alunos por ora); US$ 99/ano recusado de novo; push nativo vetado no regime gratuito → notificação local; iOS 26.x confirmado pelo dono |
| 2026-08-15 | Registro de série sem teclado: reps/carga pré-preenchidos do histórico + botões +/− | Pedido do dono no ajuste de escopo; pré-requisito real do registro na tela bloqueada (Live Activity não tem teclado) |
| 2026-08-17 | Dynamic Island (compact/minimal/expanded) sai do acceptance gate do v1.3 e vira feature futura; implementação atual permanece sem UAT física | O aparelho disponível é um iPhone 13, sem Dynamic Island, e o dono não tem aparelho mais novo para teste; decisão explícita de não bloquear a evolução |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-15 — v1.2 shipped; milestone v1.3 started*
