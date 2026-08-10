---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migration, plpgsql, jest]

# Dependency graph
requires:
  - phase: 03-interc-mbio-de-modalidade-de-cardio (fase corrente, sem dependência de fase anterior)
    provides: "Nada — esta plan é a base da fase (REQ-06)"
provides:
  - "Migration 0034 pronta (arquivo, não aplicada) com tabela satélite cardio_exercise_swaps, função de vocabulário fechado _forca_modalidade_cardio_valida e RPC swap_session_exercise"
  - "Harness de teste que prova o conteúdo da migration sem tocar banco vivo (12 testes)"
  - "Decisão do dono registrada: aplicar agora, staging primeiro — execução delegada e PENDENTE de confirmação"
affects: [03-02, 03-03, 03-04, 03-05]

# Actuals (#2632)
actuals:
  tokens: 4330
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabela satélite (nunca UPDATE em planned_exercises/planned_sets) — mesmo padrão de exercise_skips (migration 0020)"
    - "Vocabulário fechado espelhando constante do app (CARDIO_MODALIDADES) via função SQL immutable + CHECK constraint"
    - "RPC com guardas em profundidade: autenticação (42501), vocabulário (22023), posse do log (P0002), sessão finalizada (P0001), posse do exercício (42501), métrica cardio (22023)"

key-files:
  created:
    - supabase/migrations/0034_troca_modalidade_cardio.sql
    - __tests__/cardioSwapMigration.test.ts
  modified: []

key-decisions:
  - "Task 2 (checkpoint:decision, gate blocking): dono escolheu option-a — aplicar agora, staging primeiro. Ver seção 'Decisão do Checkpoint' abaixo para o registro completo."

patterns-established:
  - "Toda RPC nova neste repo segue o molde 0020: revoke all from public/anon + grant execute to authenticated, com asserção has_function_privilege no bloco final."

requirements-completed: [REQ-06]

coverage:
  - id: D1
    description: "Migration 0034 criada com tabela satélite, vocabulário fechado sincronizado com CARDIO_MODALIDADES, RPC com guardas de posse e métrica cardio, revoke/grant e asserções finais — provado por harness de teste sem tocar banco vivo"
    requirement: "REQ-06"
    verification:
      - kind: unit
        ref: "__tests__/cardioSwapMigration.test.ts (12 testes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Decisão do dono sobre quando aplicar a migration 0034 em cada ambiente (checkpoint:decision, gate blocking)"
    requirement: "REQ-06"
    verification: []
    human_judgment: true
    rationale: "Decisão operacional do dono sobre janela de aplicação em banco vivo — não é algo que um teste automatizado possa classificar como pass/fail; é registro de escolha humana."

# Metrics
duration: N/A (agente de continuação — Task 1 executada em sessão anterior; esta sessão só concluiu o registro do checkpoint da Task 2)
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 1: Migração 0034 (troca de modalidade de cardio) Summary

**Migration 0034 pronta e testada localmente (tabela satélite `cardio_exercise_swaps`, vocabulário fechado `_forca_modalidade_cardio_valida`, RPC `swap_session_exercise`) — decisão do dono registrada (aplicar agora, staging primeiro), execução DELEGADA e ainda NÃO aplicada a nenhum banco.**

## Performance

- **Tasks:** 2/2 completas
- **Files modified:** 2 (migration + harness de teste)
- **Nota de continuação:** o agente original executou a Task 1 e parou no checkpoint bloqueante da Task 2 aguardando decisão do dono. Este agente de continuação verificou os artefatos da Task 1 (sem recriar nada), registrou a decisão do dono na Task 2 e produziu este SUMMARY.

## Accomplishments
- `supabase/migrations/0034_troca_modalidade_cardio.sql` criada seguindo byte a byte o molde de `0020_recusa_declarada.sql`: função `_forca_modalidade_cardio_valida` (9 modalidades exatas de `CARDIO_MODALIDADES`), tabela `cardio_exercise_swaps` (satélite, `unique (session_log_id, planned_exercise_id)`), RLS com policy de posse, RPC `swap_session_exercise` com guardas em profundidade, revoke/grant e bloco de asserções finais.
- `__tests__/cardioSwapMigration.test.ts` — harness que lê o `.sql` bruto via `readFileSync` (sem conexão de banco) e confirma via `toMatch`/`toContain` todas as seções acima. **12/12 testes passando** (reverificado nesta sessão: `npx jest __tests__/cardioSwapMigration.test.ts` → `Tests: 12 passed, 12 total`).
- `grep -c "grant execute.*to anon" supabase/migrations/0034_troca_modalidade_cardio.sql` → `0` (reverificado).
- Checkpoint de decisão (Task 2) respondido pelo dono e registrado — ver seção dedicada abaixo.
- Nenhum comando `supabase` foi executado em nenhum momento desta plan (Task 1 nem Task 2 desta continuação).

## Task Commits

1. **Task 1: Migração 0034 + harness de teste local** - `5cfad83` (feat) — executada em sessão anterior, verificada nesta sessão de continuação (arquivos presentes, `git log` confirma o commit, testes reverificados 12/12 verdes).
2. **Task 2: Checkpoint de decisão — quando aplicar a migration 0034** - registro de decisão, sem código produzido; a resposta do dono está documentada neste SUMMARY.md e é commitada junto com ele (não há commit separado, pois a Task 2 não modifica arquivos de código).

**Plan metadata:** commit deste SUMMARY.md (a seguir).

## Files Created/Modified
- `supabase/migrations/0034_troca_modalidade_cardio.sql` - tabela satélite, vocabulário fechado, RPC de troca, revoke/grant, asserções finais (arquivo, NÃO aplicado a nenhum banco)
- `__tests__/cardioSwapMigration.test.ts` - harness de leitura do `.sql`, 12 testes, sem banco

## Decisão do Checkpoint (Task 2)

**Pergunta:** Quando aplicar a migration 0034 (`supabase db push`) em cada ambiente?

**Decisão do dono: option-a — Aplicar agora, staging primeiro.**

Substância completa da decisão, registrada fielmente:

1. A migration 0034 SERÁ aplicada agora, na ordem homologação (`forcaapp-staging`, ref `mjdjtiujhwklchalquhc`) → produção (`forcaapp-prod`, ref `zanqygwsgxkyjiuhrzju`), via:
   ```
   scripts/supabase-preflight.sh hml  && supabase db push   # homologação primeiro
   scripts/supabase-preflight.sh prod && supabase db push   # produção (exige a palavra PRODUCAO digitada)
   ```
2. **EXECUÇÃO DELEGADA a uma sessão/IA diferente, fora desta plan.** No momento em que este SUMMARY é escrito, a migration **NÃO está aplicada em nenhum banco** (nem staging, nem produção). Estado real: **decidido: aplicar agora, staging primeiro; execução delegada; aplicação PENDENTE de confirmação.** Este SUMMARY não afirma que a migration foi aplicada nem que os ambientes estão sincronizados — isso ainda não aconteceu.
3. Este agente (Task 1 e esta continuação da Task 2) permaneceu PROIBIDO de rodar qualquer comando `supabase` (login, link, db push, migration list, migration repair) ou tocar qualquer banco vivo, e essa proibição foi respeitada integralmente — nenhum comando `supabase` aparece no histórico desta plan.

## Files Created/Modified
(ver seção acima — sem alterações adicionais nesta Task 2 além do registro da decisão)

## Decisions Made
- Ver "Decisão do Checkpoint (Task 2)" acima — decisão do dono, não decisão técnica do executor.

## Deviations from Plan

None - plan executado exatamente como escrito. A Task 1 seguiu o molde `0020_recusa_declarada.sql` byte a byte conforme especificado; a Task 2 registrou fielmente a decisão do dono sem interpretação adicional.

## Issues Encountered
None.

## Known Open Risk (herdado da decisão do dono, para o runbook de quem executar)

`AGENTS.md` (linhas 48-49) registra que as migrations `0000`→`0032` estão aplicadas e conferidas em ambos os ambientes (staging `mjdjtiujhwklchalquhc` e produção `zanqygwsgxkyjiuhrzju`, conferido em 07/08/2026). Porém `supabase/migrations/0033_anamnese_cardio_declarada.sql` já existe no repositório e **não** aparece confirmada como aplicada nesse mesmo registro de `AGENTS.md`. Isso significa que um `supabase db push` executado para aplicar a 0034 pode aplicar a 0033 junto (ou revelar que a 0033 já estava pendente por outro motivo). Este ponto foi levado ao dono junto com a decisão do checkpoint e faz parte do runbook entregue a quem executar o `db push` — não é resolvido por esta plan; fica registrado aqui como item pendente aberto para quem aplicar a migration confirmar o estado real de 0033 antes de rodar o push.

## User Setup Required

None diretamente desta plan — mas a aplicação real da migration 0034 (e a confirmação do estado da 0033) é ação manual pendente, delegada a outra sessão, conforme decisão do dono acima.

## Next Phase Readiness

- Os Planos 03-02..03-05 podem referenciar as colunas/RPC de `cardio_exercise_swaps`/`swap_session_exercise` com confiança de que o schema está definido e testado localmente.
- **Bloqueio operacional real:** se o código desses planos chegar a staging/produção ANTES da migration 0034 (e da confirmação de 0033) serem de fato aplicadas nesses ambientes, a chamada à RPC falha com "function does not exist" (PostgREST 42883) — a troca de modalidade fica indisponível até a migration ser aplicada, mas nenhuma funcionalidade pré-existente quebra (o app já trata esse padrão de erro via `SessionExecutionRequestError` → `saveError` → `Alert.alert`, mesmo caminho de `skipExercise`).
- Quem mesclar/fizer deploy dos Planos 03-02..03-05 para staging/produção deve confirmar que a migration 0034 (e o estado de 0033) já foi aplicada nesses ambientes antes do merge, conforme a decisão option-a acima.

---
*Phase: 03-interc-mbio-de-modalidade-de-cardio*
*Completed: 2026-08-10*
