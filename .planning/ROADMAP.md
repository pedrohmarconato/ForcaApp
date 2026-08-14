# Roadmap: ForcaApp — Fluxo cardio e alongamento

## Milestones

- ✅ **v1.0 Cardio e alongamento** — Phases 1-4 (shipped 2026-08-13) — [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Release em produção** — Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 Cardio e alongamento (Phases 1-4) — SHIPPED 2026-08-13</summary>

- [x] Phase 1: Fluxo cardio e alongamento (4/4 plans) — completed 2026-08-09
- [x] Phase 2: Anamnese e calibração do cardio (3/3 plans) — completed 2026-08-09
- [x] Phase 3: Intercâmbio de modalidade de cardio (9/9 plans) — completed 2026-08-13
- [x] Phase 4: Escrita de execução de treino em lote e offline-first (3/3 plans) — completed 2026-08-12

Detalhes completos: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.1 Release em produção (In Progress)

**Milestone Goal:** Tudo que está pronto e verificado neste clone chega em produção com
evidência — código no GitHub com CI verde, migration 0037 viva em staging e produção,
PWA atualizado na Vercel e pendências fechadas no STATE.md.

- [ ] **Phase 5: Integração e review do gráfico de cardio** - Gráfico de evolução de cardio commitado com higiene de git e revisado por painel adversarial antes do push
- [x] **Phase 6: Publicação do código** - Todos os commits locais publicados em origin/main com CI session-contract verde — completed 2026-08-14 (push `0193742..82fd8db`, run 31822228262 verde)
- [x] **Phase 7: Migration 0037 em staging e produção** - Migration 0037 (P0005→23505) aplicada e verificada nos dois ambientes — completed 2026-08-14 (errcode 23505 vivo, md5 `662cbd9e` idêntico staging×prod)
- [x] **Phase 8: Deploy web e fechamento** - PWA de produção atualizado via Vercel e pendências fechadas com evidência no STATE.md — completed 2026-08-14 (https://forca-app-six.vercel.app, 200; preview pulado por decisão do dono)

## Phase Details

### Phase 5: Integração e review do gráfico de cardio

**Goal**: O gráfico de evolução de cardio (trabalho feito fora do GSD após o
arquivamento do v1.0 — `CardioEvolucaoChart`, `cardioEvolucao.ts`, testes) está
integrado ao repositório com higiene de git e passou por painel adversarial antes de
qualquer push a produção.
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: INT-01, INT-02
**Success Criteria** (what must be TRUE):

  1. O gráfico de evolução de cardio está commitado no repositório com adds nomeados
     — nunca `git add -A`.

  2. `.claude/` está listado no `.gitignore` e não aparece em nenhum commit;
     `.planning/reviews/` está commitado como documentação.

  3. `tsc`, `jest` e `pytest` passam localmente antes do commit da integração.

  4. Um painel adversarial de 4 revisores avaliou o diff completo que vai a produção;
     achados CONFIRMADOS foram corrigidos no código ou aceitos explicitamente pelo
     dono antes do push.

**Plans**: 2/2 plans executed

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — verificação local (tsc/jest/pytest) + 3 commits com adds nomeados (gitignore, .planning/reviews, gráfico de cardio)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — painel adversarial (4 revisores) sobre origin/main..HEAD, decisão do dono por achado, resolução e fechamento sem push

### Phase 6: Publicação do código

**Goal**: Todo o histórico local — os ~46 commits acumulados de v1.0/v1.1 mais a
integração da Fase 5 — chega a `origin/main` com o CI verde.
**Depends on**: Phase 5
**Requirements**: PUB-01
**Success Criteria** (what must be TRUE):

  1. `origin/main` contém todos os commits locais (~46 + integração do gráfico), sem
     divergência entre `HEAD` local e o remoto.

  2. O workflow de CI `session-contract` (tsc, jest, pytest, export web) roda e
     termina verde no push para `origin/main`.

**Plans**: TBD

### Phase 7: Migration 0037 em staging e produção

**Goal**: A correção de errcode da migration 0037 (P0005→23505) está viva nos dois
projetos Supabase, com paridade comprovada entre eles.
**Depends on**: Phase 6
**Requirements**: PUB-02, PUB-03
**Success Criteria** (what must be TRUE):

  1. Migration 0037 aplicada em staging (`mjdjtiujhwklchalquhc`) via preflight +
     `supabase db push`, verificada por leitura direta (errcode 23505 vivo na
     função).

  2. Migration 0037 aplicada em produção (`zanqygwsgxkyjiuhrzju`) pelo mesmo fluxo
     COM preflight — comando entregue pronto pela sessão, executado pelo dono
     (portão humano).

  3. O md5 da função é idêntico entre staging e produção, mesmo protocolo de
     verificação usado na migration 0036.

**Plans**: TBD

### Phase 8: Deploy web e fechamento

**Goal**: O PWA de produção reflete o código publicado e as pendências de deploy
registradas em STATE.md ficam fechadas com evidência.
**Depends on**: Phase 6, Phase 7
**Requirements**: PUB-04, PUB-05
**Success Criteria** (what must be TRUE):

  1. Deploy de preview do Vercel passa por smoke test aprovado (app carrega; aba
     Progresso renderiza o gráfico novo) antes de `vercel deploy --prod`.

  2. `vercel deploy --prod` é executado pelo dono (portão humano), com o comando
     entregue pronto e com preflight validado pela sessão.

  3. STATE.md registra a migration 0037 como concluída em staging e produção, com a
     verificação pós-produção do PWA anotada.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fluxo cardio e alongamento | v1.0 | 4/4 | Complete | 2026-08-09 |
| 2. Anamnese e calibração do cardio | v1.0 | 3/3 | Complete | 2026-08-09 |
| 3. Intercâmbio de modalidade de cardio | v1.0 | 9/9 | Complete | 2026-08-13 |
| 4. Escrita de execução de treino em lote e offline-first | v1.0 | 3/3 | Complete | 2026-08-12 |
| 5. Integração e review do gráfico de cardio | v1.1 | 2/2 | In Progress|  |
| 6. Publicação do código | v1.1 | direto | Complete | 2026-08-14 |
| 7. Migration 0037 em staging e produção | v1.1 | direto | Complete | 2026-08-14 |
| 8. Deploy web e fechamento | v1.1 | direto | Complete | 2026-08-14 |
