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
  tokens: 3600
  tasks: 2
  commits: 2

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
  - "Checkpoint (Task 2) respondido pelo dono em 2026-08-09: option-a — aplicar agora, staging primeiro. Produção fica PENDENTE, só aplicada antes de qualquer merge/deploy para produção."
  - "Migration 0033 aplicada em forcaapp-staging (ref mjdjtiujhwklchalquhc) via scripts/supabase-preflight.sh hml && supabase db push — confirmado por supabase migration list (0033 local=remoto) e por consulta a information_schema.columns (6 linhas: 3 colunas × 2 tabelas)"
  - "Produção (forcaapp-prod, ref zanqygwsgxkyjiuhrzju) NÃO tocada nesta execução — nenhum supabase link nem db push apontou para o ref de produção"

patterns-established:
  - "Toda coluna nova em questionario_usuario segue: add column + CHECK condicional + comment on column + espelho em questionario_historico + snapshot_questionario() reescrito + bloco de asserção final (mesmo contrato desde a 0021)"

requirements-completed: [REQ-04]  # arquivo pronto, decisão do dono registrada e migration aplicada em staging; produção pendente por decisão explícita (option-a), não por bloqueio técnico

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
    description: "Decisão do dono sobre quando aplicar a migration 0033 em staging/produção (checkpoint bloqueante) — option-a escolhida: aplicar agora, staging primeiro; produção pendente"
    verification:
      - kind: manual
        ref: "supabase migration list (0033 local=remoto em forcaapp-staging) + supabase db query --linked sobre information_schema.columns (6 linhas: 3 colunas em questionario_usuario + 3 em questionario_historico)"
        status: pass
    human_judgment: true
    rationale: "Aplicação de migration em banco vivo é ação irreversível de fato (reverter exige DDL manual e decisão sobre dado já gravado) — checkpoint de decisão exigiu resposta explícita do dono antes de qualquer aplicação; dono respondeu option-a em 2026-08-09."

duration: 18min
completed: 2026-08-09
status: complete
---

# Phase 2 Plan 02: Migração 0033 (anamnese de cardio) Summary

**Migration `0033_anamnese_cardio_declarada.sql` criada seguindo byte a byte o molde de 0021, testada localmente (7 casos verdes) e aplicada em `forcaapp-staging` por decisão explícita do dono (option-a) — produção fica PENDENTE, só aplicada antes de qualquer merge/deploy para produção.**

## Performance

- **Duration:** 18 min (12 min Task 1 + ~6 min Task 2/continuação)
- **Started:** 2026-08-09T00:00:00Z (aprox.)
- **Completed:** 2026-08-09
- **Tasks:** 2/2 completas
- **Files modified:** 2 código (ambos novos) + 1 documentação (este SUMMARY)

## Accomplishments
- `supabase/migrations/0033_anamnese_cardio_declarada.sql` criada seguindo byte a byte o precedente de `0021_dose_cardio_declarada.sql`: 3 colunas novas (`cardio_pratica_atualmente`, `cardio_distancia_confortavel_km`, `cardio_objetivo`) em `questionario_usuario`, 4 constraints condicionais de faixa/coerência, espelho em `questionario_historico`, `snapshot_questionario()` reescrito, bloco de asserção final.
- `backend/tests/test_migration_anamnese_cardio.py` criado: harness que lê o `.sql` como texto (sem conexão de banco) e prova 7 propriedades — existência do arquivo, colunas espelhadas nas duas tabelas, nomes das 4 constraints, snapshot grava as colunas no INSERT, bloco de asserção confere as colunas, vocabulário fechado do objetivo, nenhum comando `supabase` no arquivo.
- **Checkpoint da Task 2 respondido pelo dono em 2026-08-09: option-a** ("aplicar agora, staging primeiro"). Migration aplicada em `forcaapp-staging` (ref `mjdjtiujhwklchalquhc`) via `scripts/supabase-preflight.sh hml && supabase db push`, com verificação pós-aplicação por `supabase migration list` e consulta direta a `information_schema.columns`. Produção (`forcaapp-prod`, ref `zanqygwsgxkyjiuhrzju`) **NÃO** foi tocada.

## Aplicação em Staging — Evidência Literal

**Decisão do dono (checkpoint Task 2):** option-a — "aplicar agora, staging primeiro". Produção fica PENDENTE e só será aplicada antes de merge/deploy para produção.

**Ambiente confirmado antes do push** (`supabase projects list` + preflight):
```
mjdjtiujhwklchalquhc | forcaapp-staging | ACTIVE_HEALTHY | linked: true
zanqygwsgxkyjiuhrzju | forcaapp-prod    | ACTIVE_HEALTHY | linked: false
```

**Comando executado:**
```
export SUPABASE_ACCESS_TOKEN="$(cat ~/.supabase_pat)"
scripts/supabase-preflight.sh hml && supabase db push
```

**Saída do preflight + push:**
```
  Projeto linkado neste diretório: HOMOLOGAÇÃO (forcaapp-staging) — dados descartáveis
  Ref:                             mjdjtiujhwklchalquhc
  Ambiente declarado no comando:   HOMOLOGAÇÃO (forcaapp-staging)

OK: prossiga — o diretório está linkado a HOMOLOGAÇÃO (forcaapp-staging).
---PUSH---
Initialising login role...
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 0033_anamnese_cardio_declarada.sql
Applying migration 0033_anamnese_cardio_declarada.sql...
Warning: failed to cache migrations catalog: error exporting pg-delta catalog: failed to inspect docker image: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?:
Finished supabase db push.
```
(O warning do Docker é do cache local de catálogo — não afeta a aplicação remota; `supabase migration list` confirma a migration registrada nos dois lados.)

**Verificação — `supabase migration list` (staging):** `0033` aparece com o mesmo valor em `Local` e `Remote`, confirmando registro em `supabase_migrations.schema_migrations`.

**Verificação — colunas confirmadas via `supabase db query --linked` sobre `information_schema.columns`:**
```
supabase db query --linked -o json "select table_name, column_name, data_type from information_schema.columns
  where table_schema='public' and column_name in
  ('cardio_pratica_atualmente','cardio_distancia_confortavel_km','cardio_objetivo')
  order by table_name, column_name;"
```
Resultado — 6 linhas (3 colunas × 2 tabelas), tipos conforme especificado na migration:

| table_name | column_name | data_type |
|---|---|---|
| questionario_historico | cardio_distancia_confortavel_km | numeric |
| questionario_historico | cardio_objetivo | text |
| questionario_historico | cardio_pratica_atualmente | boolean |
| questionario_usuario | cardio_distancia_confortavel_km | numeric |
| questionario_usuario | cardio_objetivo | text |
| questionario_usuario | cardio_pratica_atualmente | boolean |

## Produção — PENDENTE

**Produção (`forcaapp-prod`, ref `zanqygwsgxkyjiuhrzju`) NÃO recebeu a migration 0033 nesta execução.** Por decisão explícita do dono (option-a), a aplicação em produção fica pendente e **deve ocorrer antes de qualquer merge/deploy desta branch (ou de qualquer branch que dependa das colunas novas) para produção** — seguindo o mesmo fluxo documentado (`scripts/supabase-preflight.sh prod && supabase db push`, que exige confirmação digitada `PRODUCAO`). Nenhum `supabase link` para o ref de produção foi executado nesta sessão; o diretório permanece linkado a `forcaapp-staging`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migração 0033 (anamnese de cardio) + harness de teste local** - `ab5c659` (feat)
2. **Task 2: Decisão do dono (option-a) + aplicação da migration 0033 em staging** - checkpoint respondido, sem código adicional além deste SUMMARY (a aplicação em si é ação de infraestrutura fora do controle de versão do repo)

_Plan metadata commit (este SUMMARY): commit a seguir, formato `docs(02-02): ...`._

## Files Created/Modified
- `supabase/migrations/0033_anamnese_cardio_declarada.sql` - Migration nova (não aplicada): 3 colunas de anamnese de cardio + CHECK de faixa/coerência + espelho em `questionario_historico` + `snapshot_questionario()` reescrito + asserção final
- `backend/tests/test_migration_anamnese_cardio.py` - Harness de teste (7 casos) que lê o `.sql` e confere o conteúdo sem tocar banco vivo

## Decisions Made
- Migration numerada `0033` — confirmado via `ls supabase/migrations/ | tail -3` no início da execução (última migration existente era `0032_harden_m0031_backup_tables.sql`, nenhuma outra mesclada entretanto).
- Estrutura da migration segue EXATAMENTE o molde de `0021_dose_cardio_declarada.sql` (comentário de cabeçalho, `add column if not exists`, bloco `do $$` com constraints condicionais via `pg_constraint`, `comment on column`, espelho em `questionario_historico`, `create or replace function snapshot_questionario()` + `revoke all ... from public, anon`, bloco de asserção final).
- CHECK de faixa da distância confortável: `0 a 50 km` (teto realista, análogo ao teto de 5-180 minutos da 0021).
- CHECK do objetivo trava vocabulário fechado: `'condicionamento'`, `'completar_5k'`, `'emagrecimento'` — estes literais exatos serão reusados como `value` das opções no frontend do Plano 02-03.
- Nenhuma alteração em `backend/schemas/molde_schema.py` (confirmado por `git diff` vazio) — respeita a restrição do CONTEXT.md de que schema do molde é porta de mão única.
- **Checkpoint da Task 2 respondido pelo dono em 2026-08-09: option-a** — "aplicar agora, staging primeiro". Produção fica PENDENTE, só será aplicada antes de qualquer merge/deploy para produção.
- Migration 0033 aplicada em `forcaapp-staging` (ref `mjdjtiujhwklchalquhc`) via `scripts/supabase-preflight.sh hml && supabase db push`, seguindo exatamente o fluxo documentado em AGENTS.md (staging primeiro, preflight obrigatório antes de qualquer comando que toque o banco).
- Verificação pós-aplicação feita por duas fontes independentes: `supabase migration list` (0033 registrada local=remoto) e `supabase db query --linked` sobre `information_schema.columns` (6 linhas confirmando as 3 colunas nas 2 tabelas, com os tipos corretos).

## Deviations from Plan

None - plan executado exatamente como especificado. Task 1 completa na execução original; Task 2 (checkpoint de decisão) foi respondida pelo dono nesta continuação (option-a) e a migration foi aplicada em staging conforme o fluxo documentado — nenhum desvio de escopo, nenhuma ação em produção.

## Issues Encountered
None. O warning "Cannot connect to the Docker daemon" durante o `supabase db push` é esperado (cache local de catálogo de migrations, não afeta a aplicação remota) e não impediu a aplicação — confirmado pela verificação pós-aplicação via `information_schema.columns`.

## User Setup Required
None - autenticação já configurada (`~/.supabase_pat`, projeto já linkado a `forcaapp-staging`). Nenhuma configuração adicional foi necessária.

## Next Phase Readiness
- Migration 0033 aplicada em `forcaapp-staging` — os Planos 02-01 (mesma wave) e 02-03, que adicionam campos ao payload do frontend dependentes destas colunas, já podem chegar a staging sem risco de quebrar `saveQuestionnaireDataAPI` (PostgREST 42703) nesse ambiente.
- **Bloqueio remanescente, por decisão explícita (não técnico):** produção (`forcaapp-prod`, ref `zanqygwsgxkyjiuhrzju`) ainda NÃO tem a migration 0033. Qualquer merge/deploy dos Planos 02-01/02-03 (ou desta própria branch) para produção **precisa** rodar `scripts/supabase-preflight.sh prod && supabase db push` (com confirmação digitada `PRODUCAO`) ANTES do deploy do código correspondente — do contrário, o mesmo erro 42703 quebra o salvamento do questionário em produção para todos os usuários.

---
*Phase: 02-anamnese-e-calibra-o-do-cardio*
*Plan: 02*
*Completed: 2026-08-09*
*Status: complete — staging aplicado; produção pendente por decisão do dono (aplicar antes do próximo merge/deploy para produção)*

## Self-Check: PASSED
- FOUND: supabase/migrations/0033_anamnese_cardio_declarada.sql
- FOUND: backend/tests/test_migration_anamnese_cardio.py
- FOUND: commit ab5c659 (git log --oneline --all)
- FOUND: migration 0033 aplicada em forcaapp-staging (supabase migration list + information_schema.columns, evidência literal acima)
