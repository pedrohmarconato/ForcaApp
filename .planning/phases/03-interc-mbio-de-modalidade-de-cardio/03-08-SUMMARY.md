---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 08
subsystem: database
tags: [postgres, supabase, rls, migration, plpgsql, jest]

# Dependency graph
requires:
  - phase: 03-interc-mbio-de-modalidade-de-cardio (fase corrente)
    provides: "Migrations 0034/0035 já vivas em staging e produção (03-01, AGENTS.md) — 0036 é create or replace de follow-up sobre swap_session_exercise"
provides:
  - "Migration 0036 pronta (arquivo, não aplicada) fechando G-03-5-servidor: guarda nova de set_logs já gravado, errcode P0005"
  - "Harness de teste que prova o conteúdo da migration sem tocar banco vivo (8 testes)"
  - "Decisão do dono registrada: aplicar agora, staging primeiro — comandos são do dono, executor permanece proibido de rodar supabase"
affects: []

# Actuals (#2632)
actuals:
  tokens: 8500
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "create or replace sobre função já viva em produção, mesma assinatura, para acrescentar guarda de defesa em profundidade sem drop function"
    - "Guarda nova inserida DEPOIS da guarda de métrica de 0035 e ANTES do insert — ordem e texto das guardas anteriores preservados byte a byte"
    - "join via planned_sets.exercise_id porque set_logs não tem FK direta para planned_exercises (0001_modelo_treino.sql:89-129)"
    - "errcode novo (P0005) documentado no cabeçalho junto dos códigos já tratados pelo app, sem exigir mudança de cliente para esta plan"

key-files:
  created:
    - supabase/migrations/0036_guarda_set_log_troca_cardio.sql
    - __tests__/cardioSwapGuardaSerieConcluida.test.ts
  modified: []

key-decisions:
  - "Task 2 (checkpoint:decision, gate blocking): dono escolheu option-a — aplicar agora, staging primeiro. Comandos são do dono, executor permanece proibido de rodar supabase/preflight. Ver seção 'Decisão do Checkpoint' abaixo."

patterns-established:
  - "Follow-up migration sobre RPC já em produção: create or replace preservando ordem/texto das guardas existentes, guarda nova inserida no ponto certo do fluxo, asserção runtime estendida (não substituída)."

requirements-completed: [REQ-06]

coverage:
  - id: D1
    description: "Migration 0036 criada como create or replace sobre swap_session_exercise: guarda nova de set_logs já registrado (errcode P0005) inserida após a guarda de métrica de 0035, guarda de métrica preservada intocada, revoke/grant repetidos, asserção runtime estendida com duas checagens novas — provado por harness sem tocar banco vivo"
    requirement: "REQ-06"
    verification:
      - kind: unit
        ref: "__tests__/cardioSwapGuardaSerieConcluida.test.ts (8 testes)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Decisão do dono sobre quando aplicar a migration 0036 em cada ambiente (checkpoint:decision, gate blocking)"
    requirement: "REQ-06"
    verification: []
    human_judgment: true
    rationale: "Decisão operacional do dono sobre janela de aplicação em banco vivo — não é algo que um teste automatizado possa classificar como pass/fail; é registro de escolha humana, comandos executados pelo próprio dono, fora deste agente."
  - id: D3
    description: "must_have truth de verification: backstop ('Aplicada a um banco vivo, uma chamada direta... é recusada com errcode P0005') permanece NÃO VERIFICADA nesta plan — nenhum agente aplicou 0036 a banco algum"
    requirement: "REQ-06"
    verification: []
    human_judgment: true
    rationale: "A verificação contra banco vivo só pode ocorrer depois que o dono aplicar a migration manualmente (staging → produção); esta plan entrega o arquivo testado localmente e a decisão registrada, não a aplicação em si."

# Metrics
duration: N/A (agente de continuação — Task 1 executada em sessão anterior; esta sessão concluiu o registro do checkpoint da Task 2 e o SUMMARY)
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 8: Migração 0036 (guarda server-side de série já concluída) Summary

**Migration 0036 pronta e testada localmente (create or replace sobre `swap_session_exercise`, guarda nova que recusa troca de modalidade quando já existe `set_log` gravado para o `planned_exercise_id` alvo, errcode `P0005`) — decisão do dono registrada (aplicar agora, staging primeiro, comandos executados PELO DONO), migration ainda NÃO aplicada a nenhum banco.**

## Performance

- **Tasks:** 2/2 completas
- **Files modified:** 2 (migration + harness de teste)
- **Nota de continuação:** o agente original executou a Task 1 (commit `9276306`) e parou no checkpoint bloqueante da Task 2 aguardando decisão do dono. Este agente de continuação verificou o guard de worktree (branch/HEAD conferidos), reverificou os artefatos e o teste da Task 1 sem recriar nada, registrou a decisão do dono na Task 2 e produziu este SUMMARY.

## Accomplishments

- `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` — `create or replace function public.swap_session_exercise`, mesma assinatura (`uuid, uuid, text, text`) já instalada por 0034/0035. Corpo completo reproduzido byte a byte (guardas de auth 42501, nulidade 22004, vocabulário 22023, nota 22023, posse do log P0002, sessão finalizada P0001, posse do exercício 42501, guarda de métrica cardio 22023 de 0035) com a guarda NOVA inserida logo após a guarda de métrica e antes do `insert into cardio_exercise_swaps`: recusa a troca com `errcode = 'P0005'` quando já existe `set_log` gravado para o `planned_exercise_id` alvo nesta sessão, via join `set_logs → planned_sets.exercise_id` (sem FK direta). Revoke/grant repetidos exatamente como 0034/0035. Bloco de asserção runtime `do $$...$$` estendido com duas checagens novas (`from public.set_logs sl` e `errcode = ''P0005''`), preservando a checagem herdada de 0035 (`pe.metric in`) e a negativa (`muscle_group = 'Cardio'` ausente).
- `__tests__/cardioSwapGuardaSerieConcluida.test.ts` — harness de leitura do `.sql` bruto (`readFileSync`, sem conexão de banco), molde de `cardioSwapMigration.test.ts`. **8/8 testes passando** (reverificado nesta sessão de continuação: `npx jest __tests__/cardioSwapGuardaSerieConcluida.test.ts` → `Tests: 8 passed, 8 total`).
- `git diff supabase/migrations/0034_troca_modalidade_cardio.sql supabase/migrations/0035_guarda_metric_troca_cardio.sql` → vazio (reverificado nesta sessão): nenhuma das duas migrations existentes foi tocada.
- `grep -c "grant execute.*to anon" supabase/migrations/0036_guarda_set_log_troca_cardio.sql` → `0`. `grep -c "muscle_group = 'Cardio'" supabase/migrations/0036_guarda_set_log_troca_cardio.sql` → `0`.
- Checkpoint de decisão (Task 2) respondido pelo dono e registrado — ver seção dedicada abaixo.
- **Nenhum comando `supabase` e nenhum `scripts/supabase-preflight.sh` foram executados em nenhum momento desta plan** (nem Task 1, nem esta continuação da Task 2) — proibição do plano respeitada integralmente.

## Task Commits

1. **Task 1: Migração 0036 (guarda server-side de série já concluída) + harness de teste local** — `9276306` (feat) — executada em sessão anterior, verificada nesta sessão de continuação (arquivo presente, `git log` confirma o commit, testes reverificados 8/8 verdes).
2. **Task 2: Checkpoint de decisão — quando aplicar a migration 0036** — registro de decisão, sem código produzido; a resposta do dono está documentada neste SUMMARY.md e é commitada junto com ele (mesmo padrão de 03-01: não há commit separado, pois a Task 2 não modifica arquivos de código).

**Plan metadata:** commit deste SUMMARY.md (a seguir).

## Files Created/Modified

- `supabase/migrations/0036_guarda_set_log_troca_cardio.sql` — guarda nova de `set_logs` (errcode P0005), guarda de métrica de 0035 preservada, revoke/grant repetidos, asserção runtime estendida (arquivo, **NÃO aplicado a nenhum banco**)
- `__tests__/cardioSwapGuardaSerieConcluida.test.ts` — harness de leitura do `.sql`, 8 testes, sem banco

## Decisão do Checkpoint (Task 2)

**Pergunta:** Quando aplicar a migration 0036 (`supabase db push`) em cada ambiente?

**Decisão do dono: option-a — Aplicar agora, staging primeiro.**

Substância completa da decisão, registrada fielmente:

1. A migration 0036 SERÁ aplicada agora, na ordem homologação (`forcaapp-staging`, ref `mjdjtiujhwklchalquhc`) → produção (`forcaapp-prod`, ref `zanqygwsgxkyjiuhrzju`), via:
   ```
   scripts/supabase-preflight.sh hml  && supabase db push   # homologação primeiro
   scripts/supabase-preflight.sh prod && supabase db push   # produção (exige a palavra PRODUCAO digitada)
   ```
2. **Os comandos são do dono, executados manualmente por ele, fora deste agente.** No momento em que este SUMMARY é escrito, a migration 0036 **NÃO está aplicada em nenhum banco** (nem staging, nem produção). Estado real: **decidido: aplicar agora, staging primeiro; comandos a rodar pelo dono; aplicação PENDENTE de execução manual.** Este SUMMARY não afirma que a migration foi aplicada nem que os ambientes estão sincronizados — isso ainda não aconteceu.
3. Este agente (Task 1 e esta continuação da Task 2) permaneceu PROIBIDO de rodar qualquer comando `supabase` (login, link, db push, migration list, migration repair) e qualquer `scripts/supabase-preflight.sh`, e essa proibição foi respeitada integralmente — nenhum desses comandos aparece no histórico desta plan. A proibição do plano NÃO foi levantada pela decisão do checkpoint; só a pergunta "quando" foi respondida, não "quem roda".
4. **Consequência direta para o `must_have` de verificação `backstop`** (frontmatter do plano, linha `verification: backstop`): a truth "Aplicada a um banco vivo, uma chamada direta a `swap_session_exercise` para um `planned_exercise_id` que já tem `set_logs` gravados é recusada com `errcode` P0005..." permanece **NÃO VERIFICADA** até o dono rodar o runbook abaixo. Não é reportada aqui como verificada nem como aplicada.

### Runbook para o dono executar, na ordem

```bash
# 1) Staging (forcaapp-staging, ref mjdjtiujhwklchalquhc) — sempre primeiro
scripts/supabase-preflight.sh hml && supabase db push

# 2) Conferir em staging que a guarda nova está de fato instalada (opcional, recomendado):
#    pg_get_functiondef('public.swap_session_exercise(uuid,uuid,text,text)'::regprocedure)
#    deve conter 'from public.set_logs sl' e "errcode = 'P0005'"

# 3) Produção (forcaapp-prod, ref zanqygwsgxkyjiuhrzju) — só depois de staging confirmado
scripts/supabase-preflight.sh prod && supabase db push
#    exige a palavra PRODUCAO digitada; falha fechado com stdin fechado
```

## Decisions Made

- Ver "Decisão do Checkpoint (Task 2)" acima — decisão do dono, não decisão técnica do executor.

## Deviations from Plan

None - plan executado exatamente como escrito. A Task 1 (sessão anterior) seguiu o molde `0035_guarda_metric_troca_cardio.sql` byte a byte conforme especificado; esta continuação da Task 2 registrou fielmente a decisão do dono sem interpretação adicional, e reverificou (sem recriar) os artefatos da Task 1.

## Issues Encountered

None.

## Known Open Risk (herdado da decisão do dono, para o runbook de quem executar)

Enquanto a migration 0036 não estiver aplicada em nenhum ambiente, o comportamento reproduzido no `03-UAT.md` teste 5 continua valendo: uma chamada DIRETA à RPC `swap_session_exercise` (fora do app, um build sem o guard client-side de CR-01, ou uma corrida entre dois dispositivos) ainda consegue gravar uma troca para um exercício com série já concluída. O guard client-side (`activeSessionStore.ts:1513-1521`) continua protegendo o fluxo normal do app hoje — este era o "risco residual aceito" já registrado em `03-VERIFICATION.md` antes desta plan; 0036 fecha esse risco, mas SÓ depois de aplicada pelo dono via o runbook acima.

## User Setup Required

A aplicação real da migration 0036 (runbook acima, staging → produção) é ação manual pendente do dono, conforme decisão option-a registrada nesta plan. Nenhum outro setup é exigido desta plan.

## Next Phase Readiness

- Quem mesclar/fizer deploy de qualquer plan que dependa da guarda `P0005` estar viva em staging/produção deve confirmar antes que o dono já rodou o runbook acima — a `must_have` truth `backstop` deste plano só se torna verdadeira depois disso.
- O guard client-side de CR-01 permanece intocado e é a primeira linha de defesa hoje, independente do estado de aplicação de 0036.

---
*Phase: 03-interc-mbio-de-modalidade-de-cardio*
*Completed: 2026-08-10*
