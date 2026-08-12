# Roadmap: ForcaApp — Fluxo cardio e alongamento

## Overview

Reformular cardio e alongamento para que deixem de ser apêndices deslocados do treino:
registro decimal fiel do cardio, meta com fonte única de verdade e alongamento com
condução real integrada ao chat da IA.

## Phases

- [x] **Phase 1: Fluxo cardio e alongamento** - Registro decimal do cardio, meta coerente com o treino e alongamento guiado
- [x] **Phase 2: Anamnese e calibração do cardio** - Questionário captura experiência de cardio e o gerador calibra dose inicial e progressão por ela (completed 2026-08-09)
- [ ] **Phase 3: Intercâmbio de modalidade de cardio** - Trocar um momento de cardio por outra modalidade aceita (escada, bike, remo) preservando a dose por tempo
- [ ] **Phase 4: Escrita de execução de treino em lote e offline-first** - Séries deixam de ir uma a uma direto ao banco; buffer local durável e envio agrupado/reenviado (REQ-07)

## Phase Details

### Phase 1: Fluxo cardio e alongamento

**Goal**: Cardio registra distância decimal com vírgula; a meta de cardio do Progresso
não existe mais como definição paralela ao treino; o alongamento tem condução (exercícios,
tempo/movimentos) que responde a pedidos de foco feitos no chat da IA.
**Depends on**: Nothing (first phase)
**Requirements**: REQ-01, REQ-02, REQ-03
**Success Criteria** (what must be TRUE):

  1. Usuário digita "2,4" no campo de distância do cardio, o valor persiste e volta a
     aparecer como 2,4 km (não 2).

  2. A tela Progresso não exibe meta de cardio desconectada do treino — conforme a
     decisão do dono, ela some ou passa a derivar da prescrição do plano.

  3. Na parte de alongamento da sessão, o usuário vê quais exercícios fazer e quanto
     tempo ou quantos movimentos em cada um.

  4. Um pedido de foco de alongamento feito no chat da IA muda a condução de alongamento
     apresentada nas sessões correspondentes.
**Plans**: 4 plans

Plans:

- [x] 01-01-PLAN.md — REQ-01: verificar em runtime e corrigir a exibição de distância decimal (ManualExerciseRow)
- [x] 01-02-PLAN.md — REQ-02: motor cardioPrescrito.ts + repositório de leitura da prescrição semanal
- [x] 01-03-PLAN.md — REQ-02: trocar CardioGoalsSection por CardioPrescritoSection na aba Progresso
- [x] 01-04-PLAN.md — REQ-03: expandir catálogo de Mobilidade + reforçar prompt do molde (checkpoint humano aprovado 2026-08-09 em geração real no HML)

### Phase 2: Anamnese e calibração do cardio

**Goal**: O gerador conhece a experiência de cardio do usuário — o questionário ganha
perguntas de anamnese (já corre?, distância/tempo confortável, objetivo) e o prompt do
molde calibra ponto de partida conservador e teto de progressão semanal pelo nível
declarado. Lição do PR #64: a pergunta nova tem de comprovadamente chegar ao gerador.
**Depends on**: Phase 1
**Requirements**: REQ-04, REQ-05
**Success Criteria** (what must be TRUE):

  1. O questionário pergunta experiência de cardio e as respostas aparecem no payload
     que chega ao prompt do gerador (verificável em teste).

  2. O prompt instrui dose inicial conservadora e teto de progressão por nível; planos
     gerados para iniciante × experiente diferem na dose inicial de cardio.

  3. Nenhuma mudança no schema do molde (campos km/min existentes bastam).

**Plans**: 3/3 plans executed

Plans:

- [x] 02-01-PLAN.md — REQ-04/REQ-05: pergunta de anamnese ponta a ponta (tracer) + motor de nível/calibração no backend
- [x] 02-02-PLAN.md — REQ-04: migração 0033 (anamnese de cardio) + checkpoint de decisão antes de aplicar em banco vivo
- [x] 02-03-PLAN.md — REQ-04/REQ-05: distância confortável + objetivo do cardio na UI e no prompt + checkpoint humano de geração real

### Phase 3: Intercâmbio de modalidade de cardio

**Goal**: Na sessão, o usuário troca um momento de cardio por outra modalidade aceita
(escada, bike, remo…) preservando a dose por tempo (`target_duration_seconds`); evolui o
fluxo de recusa declarada (motivo `sem_equipamento`) para substituição.
**Depends on**: Phase 1
**Requirements**: REQ-06
**Success Criteria** (what must be TRUE):

  1. Um exercício de cardio da sessão oferece "trocar modalidade" listando só as
     modalidades aceitas do usuário.

  2. A troca preserva a duração-alvo; a distância prescrita da modalidade original NÃO é
     exibida como meta da nova (sem dado inventado).

  3. O realizado na modalidade trocada conta normalmente no realizado do Progresso.

**Plans**: 9/9 plans executed

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — REQ-06: migração 0034 (tabela satélite `cardio_exercise_swaps` + RPC `swap_session_exercise`) + checkpoint de decisão antes de aplicar em banco vivo
- [x] 03-02-PLAN.md — REQ-06: tracer — motor puro (`applyCardioSwapToDraft`, D-01/D-04) + repositório de escrita/retomada + store (`swapExercise`, servidor primeiro) + leitura de "modalidades aceitas" (D-02)
- [x] 03-06-PLAN.md — REQ-06: Progresso — km realizado soma qualquer modalidade (D-05), prescrito permanece cheio (D-06)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-03-PLAN.md — REQ-06: entry point 1 (fila da sessão) — `SwapModalitySheet` + botão "Trocar modalidade" + visibilidade na sessão ativa (D-08, metade 1)
- [x] 03-05-PLAN.md — REQ-06: histórico — corrige o gap pré-existente de cardio em `getSessionLogDetail` e mostra "trocado de X" (D-08, metade 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — REQ-06: entry point 2 — evolução de `SkipReasonSheet` (motivo `sem_equipamento` oferece substituição)

**Gap closure (UAT contra Postgres real, 2026-08-10) — Wave 1, paralelas entre si**

- [x] 03-07-PLAN.md — REQ-06: G-03-3 (blocker) — corrige `planned_sets.exercise_id` (era `planned_exercise_id`, coluna inexistente) em `getSessionLogDetail` + harness de integração real contra Postgres local (OD-02)
- [x] 03-08-PLAN.md — REQ-06: G-03-5-servidor (major) — migração 0036 promove o guard CR-01 (série já concluída) para o servidor em `swap_session_exercise` + checkpoint de decisão antes de aplicar em banco vivo
- [x] 03-09-PLAN.md — REQ-06: UX — esconde os dois entry points de troca assim que há série concluída, coerente com CR-01 (03-UAT.md teste 5, caveat)

### Phase 4: Escrita de execução de treino em lote e offline-first

**Goal**: Registrar séries durante o treino deixa de ser write-through síncrono por
série. As escritas de execução de sessão (`save_set_log` e correlatas) ganham buffer
local durável e envio agrupado/reenviado, de modo que soluço de rede na academia não
interrompa o treino nem apareça ao aluno como falha.
**Depends on**: Nothing (independente das fases 1–3; toca o motor de execução, não cardio)
**Requirements**: REQ-07
**Origem**: sessão de debug `.planning/debug/typeerror-envio-series-treino.md`,
causa-raiz (2). Grep exaustivo confirmou que NÃO existe hoje nenhuma fila/lote/retry/
outbox para essas escritas — `src/services/sessionDraftStorage.ts` é cache de retomada,
não fila de mutações. É trabalho novo, do zero.
**Escopo fechado (decisão do dono em `/gsd-discuss-phase`, 2026-08-11, 16 decisões
travadas D-01..D-16 em `04-CONTEXT.md`)**: offline-first completo — outbox durável em
storage próprio (D-09), retry com backoff por idade (D-11), dedupe por chave natural
(D-13), quarentena silenciosa para recusa definitiva do servidor (D-06/D-07), flush
por tentativa imediata + retorno ao primeiro plano (D-03), sem dependência nativa
nova.
**Success Criteria** (what must be TRUE):

  1. Com o aparelho sem rede no meio do treino, concluir uma série NÃO exibe erro: a
     série é marcada como concluída e o treino segue sem interrupção.

  2. Restabelecida a rede, toda série registrada offline aparece no banco exatamente
     uma vez — reenvio não duplica (provado contra Postgres real, com a guarda 0005
     viva).

  3. Fechar o app com fila pendente e reabrir drena o que faltou, inclusive quando a
     sessão já foi finalizada.

  4. Item recusado em definitivo pelo servidor (ex.: P0005 da 0036) sai da fila, fica
     registrado localmente com motivo e NÃO trava a drenagem do restante.

  5. Com rede boa, o comportamento observável do registro de séries é o mesmo de hoje.

**Riscos conhecidos a tratar no planejamento**:

  - As guardas de servidor `0005_set_log_first_write_wins.sql` (first-write-wins) e
    `0036_guarda_set_log_troca_cardio.sql` definem hoje o comportamento de reescrita;
    qualquer retry/dedupe do cliente tem de ser desenhado CONTRA elas, não em paralelo.

  - `completeSet` já tem trava de reentrância por série e guard de CAS/epoch — a fila
    não pode duplicá-los nem contorná-los.

**Plans**: 1/3 plans executed

Plans:

- [x] 04-01-PLAN.md — REQ-07: tracer — fila ponta a ponta para save_set_log +
  update_set_log_adaptation (engine, storage, drain, hook, store, selo de pendência)

- [ ] 04-02-PLAN.md — REQ-07: expande a fila para as 4 operações restantes do D-01
  (skip/unskip/swap/finish) + fecha a persistência de update_set_log_adaptation

- [ ] 04-03-PLAN.md — REQ-07: D-16 nível 2 (integração contra Postgres real) e nível
  3 (UAT modo avião no meio de um treino)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fluxo cardio e alongamento | 4/4 | Complete (gate verde + checkpoint HML + review PR #77 corrigido) | 2026-08-09 |
| 2. Anamnese e calibração do cardio | 3/3 | Complete    | 2026-08-09 |
| 3. Intercâmbio de modalidade de cardio | 9/9 | In Progress|  |
| 4. Escrita de execução de treino em lote e offline-first | 1/3 | In Progress|  |
