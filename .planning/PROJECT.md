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

## Current State (v1.0 shipped 2026-08-13)

**Shipped:** v1.0 "Cardio e alongamento" — 4 fases, 19 planos, 28 tasks; 126 commits,
183 arquivos, +26.702/−1.603 linhas em 6 dias (2026-08-08 → 2026-08-13). Todos os 7
requisitos validados; 4/4 fases com verificação `passed`; integração cross-phase 6/6 e
fluxo E2E completo (auditoria em `milestones/v1.0-MILESTONE-AUDIT.md`).

**O que existe agora:** cardio com registro decimal fiel; meta derivada da prescrição
(fonte única); alongamento guiado pilotável pelo chat; gerador calibrado por anamnese;
troca de modalidade com guarda no servidor; execução de treino offline-first (outbox
durável com retry/dedupe/quarentena).

**Dívidas conhecidas (com dono e caminho):** deploy da migration 0037 em
staging/produção; teste 8(c) em build nativo; sessão de debug `resolved_partial`
(falta o texto literal do erro de produção); GRANT DML ausente para projetos Supabase
novos; `Alert.alert` no-op no react-native-web; tabela `cardio_goals` órfã; Nyquist
not-validated nas 4 fases. Detalhe: STATE.md (Pending Todos/Deferred Items) e o audit.

## Current Milestone: v1.1 Release em produção

**Goal:** Tudo que está pronto e verificado neste clone chega em produção com
evidência — código no GitHub com CI verde, migration 0037 viva em staging e produção,
PWA atualizado na Vercel e pendências fechadas no STATE.md.

**Target features:**
- Gráfico de evolução de cardio integrado, revisado (painel adversarial) e commitado
  com higiene (`.claude/` no `.gitignore`, adds nomeados — nunca `git add -A`)
- ~46 commits locais publicados em `origin/main` com CI `session-contract` verde
- Migration 0037 (P0005→23505) aplicada em staging e produção COM preflight,
  verificada por leitura + md5 (mesmo protocolo da 0036)
- Deploy web Vercel manual (preview → smoke → `--prod`) com verificação pós-produção

**Fora do escopo:** config ESLint, flakiness de timeouts da suíte, deploy automático
Vercel, `test:integration:pg`, backend HML na VPS. Comandos de produção
(`supabase db push` prod e `vercel deploy --prod`) são portão do dono: a sessão
entrega os comandos prontos com preflight validado; o dono executa.

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
*Last updated: 2026-08-14 — milestone v1.1 started*
