---
phase: 02-anamnese-e-calibra-o-do-cardio
plan: 02
subsystem: database
tags: [postgres, supabase, migration, questionario, cardio]

# Dependency graph
requires:
  - phase: 01-fluxo-cardio-e-alongamento
    provides: "migration 0021_dose_cardio_declarada.sql como molde byte a byte para constraints condicionais e espelho de histórico"
provides:
  - "supabase/migrations/0033_anamnese_cardio_declarada.sql — arquivo pronto, NÃO aplicado a nenhum banco"
  - "backend/tests/test_migration_anamnese_cardio.py — harness que prova o conteúdo da migration sem tocar banco vivo"
affects: ["02-01", "02-03", "REQ-04", "REQ-05"]

actuals:
  tokens: 2840
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Migration com CHECK condicional via do $$ ... end $$ + pg_constraint (padrão 0021)"
    - "Harness de teste de migration por leitura de texto (.read_text().lower() + asserção de substring), sem conexão de banco (padrão test_plan_repository.py)"

key-files:
  created:
    - supabase/migrations/0033_anamnese_cardio_declarada.sql
    - backend/tests/test_migration_anamnese_cardio.py
  modified: []

key-decisions:
  - "Migration 0033 confirmada como próximo número livre (última existente era 0032_harden_m0031_backup_tables.sql)"
  - "CHECK questionario_cardio_distancia_km_check usa faixa 0-50km (teto realista, mesmo espírito de questionario_cardio_minutos_check da 0021 com faixa 5-180)"
  - "CHECK questionario_cardio_objetivo_check trava vocabulário fechado ('condicionamento', 'completar_5k', 'emagrecimento') — os mesmos literais que o Plano 02-03 vai usar como value das opções no frontend"
  - "CHECK questionario_cardio_distancia_coerente: distância confortável só é válida quando cardio_pratica_atualmente is true"
  - "CHECK questionario_anamnese_cardio_coerente: anamnese inteira só existe com inclui_cardio = true (mesmo padrão de questionario_cardio_dose_coerente da 0021)"
  - "PENDENTE — checkpoint de decisão (Task 2) não respondido nesta execução: quando aplicar a migration 0033 em staging/produção é decisão do dono, ainda em aberto"

patterns-established:
  - "Toda coluna nova em questionario_usuario segue: add column + CHECK condicional + comment on column + espelho em questionario_historico + snapshot_questionario() reescrito + bloco de asserção final (mesmo contrato desde a 0021)"

requirements-completed: []  # REQ-04 só fecha quando o checkpoint da Task 2 (aplicação real) for decidido — arquivo pronto e testado, mas não aplicado a nenhum ambiente

coverage:
  - id: D1
    description: "Migration 0033 adiciona as 3 colunas de anamnese de cardio em questionario_usuario com CHECK de faixa/coerência, espelha em questionario_historico e reescreve snapshot_questionario() para gravá-las"
    requirement: "REQ-04"
    verification:
      - kind: unit
        ref: "backend/tests/test_migration_anamnese_cardio.py -q (7 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Decisão do dono sobre quando aplicar a migration 0033 em staging/produção (checkpoint bloqueante)"
    verification: []
    human_judgment: true
    rationale: "Aplicação de migration em banco vivo é ação irreversível de fato (reverter exige DDL manual e decisão sobre dado já gravado) — checkpoint de decisão exige resposta explícita do dono, não pode ser auto-aprovado."

duration: 12min
completed: 2026-08-09
status: checkpoint-pending
---

# Phase 2 Plan 02: Migração 0033 (anamnese de cardio) Summary

**Migration `0033_anamnese_cardio_declarada.sql` pronta e testada localmente (7 casos verdes), seguindo byte a byte o molde de 0021 — aplicação real em staging/produção aguarda decisão do dono no checkpoint da Task 2.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-09T00:00:00Z (aprox.)
- **Completed:** Task 1 completa; Task 2 (checkpoint) pendente
- **Tasks:** 1/2 completas (checkpoint:decision aguardando resposta do dono)
- **Files modified:** 2 (ambos novos)

## Accomplishments
- `supabase/migrations/0033_anamnese_cardio_declarada.sql` criada seguindo byte a byte o precedente de `0021_dose_cardio_declarada.sql`: 3 colunas novas (`cardio_pratica_atualmente`, `cardio_distancia_confortavel_km`, `cardio_objetivo`) em `questionario_usuario`, 4 constraints condicionais de faixa/coerência, espelho em `questionario_historico`, `snapshot_questionario()` reescrito, bloco de asserção final.
- `backend/tests/test_migration_anamnese_cardio.py` criado: harness que lê o `.sql` como texto (sem conexão de banco) e prova 7 propriedades — existência do arquivo, colunas espelhadas nas duas tabelas, nomes das 4 constraints, snapshot grava as colunas no INSERT, bloco de asserção confere as colunas, vocabulário fechado do objetivo, nenhum comando `supabase` no arquivo.
- Nenhum comando `supabase` (`db push`, `migration up`) foi executado — a migration existe apenas como arquivo versionado, não aplicada a nenhum ambiente.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migração 0033 (anamnese de cardio) + harness de teste local** - `ab5c659` (feat)

**Task 2 (checkpoint:decision, gate="blocking"):** NÃO respondida nesta execução — este plano roda com `autonomous: false`; o executor para no checkpoint e devolve o relatório estruturado para o dono decidir.

_Plan metadata commit (este SUMMARY): a ser criado após esta escrita._

## Files Created/Modified
- `supabase/migrations/0033_anamnese_cardio_declarada.sql` - Migration nova (não aplicada): 3 colunas de anamnese de cardio + CHECK de faixa/coerência + espelho em `questionario_historico` + `snapshot_questionario()` reescrito + asserção final
- `backend/tests/test_migration_anamnese_cardio.py` - Harness de teste (7 casos) que lê o `.sql` e confere o conteúdo sem tocar banco vivo

## Decisions Made
- Migration numerada `0033` — confirmado via `ls supabase/migrations/ | tail -3` no início da execução (última migration existente era `0032_harden_m0031_backup_tables.sql`, nenhuma outra mesclada entretanto).
- Estrutura da migration segue EXATAMENTE o molde de `0021_dose_cardio_declarada.sql` (comentário de cabeçalho, `add column if not exists`, bloco `do $$` com constraints condicionais via `pg_constraint`, `comment on column`, espelho em `questionario_historico`, `create or replace function snapshot_questionario()` + `revoke all ... from public, anon`, bloco de asserção final).
- CHECK de faixa da distância confortável: `0 a 50 km` (teto realista, análogo ao teto de 5-180 minutos da 0021).
- CHECK do objetivo trava vocabulário fechado: `'condicionamento'`, `'completar_5k'`, `'emagrecimento'` — estes literais exatos serão reusados como `value` das opções no frontend do Plano 02-03.
- Nenhuma alteração em `backend/schemas/molde_schema.py` (confirmado por `git diff` vazio) — respeita a restrição do CONTEXT.md de que schema do molde é porta de mão única.

## Deviations from Plan

None - plan executado exatamente como especificado para a Task 1. A Task 2 (checkpoint de decisão) permanece pendente por design — este plano tem `autonomous: false` e o checkpoint é `gate="blocking"`, exigindo resposta explícita do dono antes de qualquer aplicação real da migration.

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo é necessária para esta task. A DECISÃO pendente (quando aplicar a migration em staging/produção) é o próprio checkpoint da Task 2, reportado separadamente ao orquestrador.

## Next Phase Readiness
- Arquivo de migration pronto e testado localmente — pode ser revisado e mesclado sem risco de efeito colateral em banco vivo (nenhum comando `supabase` foi executado).
- **Bloqueio real:** os Planos 02-01 (mesma wave) e 02-03 já adicionam campos ao payload do frontend que dependem destas colunas existirem no banco de cada ambiente. Se esse código chegar a staging/produção ANTES desta migration ser aplicada LÁ, `saveQuestionnaireDataAPI` falha com PostgREST 42703 e quebra TODO o salvamento do questionário nesse ambiente — não só o campo novo.
- A Task 2 (checkpoint:decision, gate="blocking") precisa da decisão do dono entre "aplicar agora, staging primeiro" (option-a) ou "aguardar e aplicar mais perto do deploy, com reconferência manual antes de cada merge" (option-b) antes que este plano seja considerado encerrado.

---
*Phase: 02-anamnese-e-calibra-o-do-cardio*
*Plan: 02*
*Completed (Task 1 only): 2026-08-09*
*Status: checkpoint-pending — aguardando decisão do dono (Task 2)*
