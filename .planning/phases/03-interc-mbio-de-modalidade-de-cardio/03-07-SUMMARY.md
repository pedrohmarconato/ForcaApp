---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 07
subsystem: session-history
tags: [cardio, historico, bugfix, tdd, integracao-real, postgrest]
dependency-graph:
  requires: []
  provides:
    - "getSessionLogDetail.ts corrigido (planned_sets.exercise_id, coluna real)"
    - "harness de integração real (__tests__/integration/getSessionLogDetail.postgrest.test.ts)"
    - "npm run test:integration:pg (fora da suíte padrão)"
  affects:
    - "src/services/sessionExecutionRepository.ts"
    - "__tests__/sessionExecutionRepository.test.ts"
    - "package.json (scripts, jest.testPathIgnorePatterns)"
tech-stack:
  added:
    - "jest.integration.config.js (ts-jest, testEnvironment node, config Jest separada)"
  patterns:
    - "harness de integração fala com Postgres/PostgREST local real via @supabase/supabase-js, sem mock — jest.mock('../../src/config/supabaseClient', ...) troca só o módulo do cliente RN, importa a função de produção sem réplica"
    - "seed/leitura via sessão autenticada real (signInWithPassword), não via service_role — service_role neste stack local só tem grants Dxtm (sem select/insert) em tabelas de public, então admin.auth.admin.* fica restrito ao ciclo de vida do usuário (GoTrue admin, sem grant de tabela)"
    - "trava de loopback hard-fail (regex 127.0.0.1/localhost) roda no import, antes de qualquer chamada de rede"
key-files:
  created:
    - __tests__/integration/getSessionLogDetail.postgrest.test.ts
    - jest.integration.config.js
  modified:
    - src/services/sessionExecutionRepository.ts
    - __tests__/sessionExecutionRepository.test.ts
    - package.json
decisions:
  - "Nenhuma decisão nova do dono — plano seguiu OD-02 à risca (RED com Postgres real antes da correção, harness fora da suíte padrão)."
metrics:
  duration: "~35min"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 3213
  tasks: 1
  commits: 2
requirements: [REQ-06]
---

# Phase 3 Plan 07: Fecha G-03-3 — getSessionLogDetail lê exercise_id (coluna real de planned_sets) Summary

`getSessionLogDetail` selecionava `planned_sets(set_order, planned_exercise_id, ...)`, mas a
tabela `planned_sets` não tem essa coluna — a real é `exercise_id`. PostgREST devolvia 42703 e
quebrava o detalhe do Histórico de qualquer sessão com séries registradas. Corrigido, e um
harness de integração novo prova isso contra Postgres real, fora da suíte mockada que nunca
capturava esse tipo de erro.

## What Was Built

- **`src/services/sessionExecutionRepository.ts`**: o `select` de `set_logs` (linha ~891) e a
  leitura `l?.planned_sets?.planned_exercise_id` (linha ~916) trocados para `exercise_id` —
  a coluna real de `planned_sets` (migration `0001_modelo_treino.sql:91`). Comentário novo
  documenta por que o degrau `erroDeColunaAusente` (usado para `active_seconds`, gap real
  entre a 0022 e a 0028 em produção) não se aplica aqui: as colunas novas desta segunda query
  nasceram na 0014, sempre anterior à 0020/0034 que este mesmo select já embute nas outras
  duas queries — a topologia de migrations torna esse gap impossível.
- **`__tests__/sessionExecutionRepository.test.ts`**: os 3 mocks de `planned_sets` que
  reproduziam `planned_exercise_id` (o MESMO nome errado do bug de produção — por isso o mock
  nunca capturou o 42703, ele aceita qualquer nome de propriedade) corrigidos para
  `exercise_id`. `cardio_exercise_swaps.planned_exercise_id` (coluna real e correta dessa
  outra tabela, migrations 0020/0034) intocado.
- **`__tests__/integration/getSessionLogDetail.postgrest.test.ts`** (novo): harness de
  integração real — importa `getSessionLogDetail` de produção (nunca uma réplica), fala com
  um Postgres/PostgREST local de verdade via `@supabase/supabase-js`, sem mockar o cliente
  Supabase. Escrito e observado FALHANDO (RED, mensagem `column
  planned_sets_1.planned_exercise_id does not exist`, o mesmo texto do 03-UAT.md teste 3)
  ANTES de tocar o código de produção; GREEN confirmado depois da correção.
- **`jest.integration.config.js`** (novo): config Jest dedicada (`ts-jest`, `testEnvironment:
  'node'`), roda só `__tests__/integration/**/*.test.ts`.
- **`package.json`**: script `test:integration:pg` novo; `jest.testPathIgnorePatterns`
  estendido para excluir `__tests__/integration/` da suíte padrão — o projeto continua sem CI
  (PROJECT.md) e o harness nunca roda sem invocação explícita via `npm run
  test:integration:pg`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Seed/leitura do harness reescritos para usar sessão autenticada real em vez do client `service_role`**

- **Found during:** Task 1, primeira tentativa de RED (antes de tocar `sessionExecutionRepository.ts`).
- **Issue:** o plano especificava usar o client `service_role` tanto para semear as fixtures
  (`training_plans`/`planned_sessions`/`session_logs`) quanto como o `supabase` mockado
  dentro de `getSessionLogDetail`. No stack Supabase local deste ambiente (CLI 2.107.0,
  Postgres 17.6), o role `service_role` tem só privilégios `Dxtm` (delete/references/
  trigger/maintain) nas tabelas de `public` — sem `select`/`insert` — confirmado via `psql
  \dp` em `training_plans`, `planned_sessions`, `session_logs`, `set_logs`, `planned_sets`,
  `planned_exercises`, `cardio_exercise_swaps` (padrão idêntico em todas, não é regressão
  desta plan nem de nenhuma migration do projeto). `BYPASSRLS` (que `service_role` tem)
  contorna as políticas de RLS, mas não os GRANTs de tabela — a primeira tentativa de seed
  falhou com `permission denied for table training_plans`, e mesmo se a seed funcionasse, a
  leitura de `session_logs`/`set_logs` pelo `getSessionLogDetail` mockado com esse client
  falharia do mesmo jeito.
- **Fix:** o client `service_role` (`admin`) ficou restrito ao ciclo de vida do usuário de
  teste (`auth.admin.createUser`/`deleteUser`, endpoint GoTrue — não passa por grant de
  tabela do schema `public`). Um segundo client, autenticado via `signInWithPassword` com a
  chave `anon` pública padrão do stack local (a mesma chave demo documentada em qualquer
  `supabase init`, não é segredo), faz a seed E é o client injetado em
  `getSessionLogDetail` — o role `authenticated` tem `arwdDxtm` completo nas tabelas
  envolvidas, com RLS escopando por `auth.uid() = user_id`. Isso é, na prática, MAIS fiel ao
  caminho real de produção (a função sempre roda sob a sessão do usuário, nunca sob
  `service_role`) do que o desenho original do plano. Comportamento observável idêntico ao
  especificado no `<behavior>`: RED com a mesma mensagem 42703, GREEN depois da correção,
  mesmas asserções (`sessionLogId`, `exercises: []`).
- **Files modified:** `__tests__/integration/getSessionLogDetail.postgrest.test.ts`.
- **Commit:** `afb0e2b` (RED, já inclui este desenho).

Nenhuma migration/schema/grant foi tocado — a correção ficou inteiramente dentro do arquivo
de teste novo, sem qualquer mudança que precisasse passar pelo preflight de staging/produção
(AGENTS.md).

## Known Stubs

None.

## Threat Flags

None — a única superfície nova (harness com chave `service_role` sobre a rede) já estava
registrada no `<threat_model>` do plano (T-03-09), com a trava de loopback e a exclusão via
`testPathIgnorePatterns` implementadas exatamente como especificado. O desvio documentado
acima reduz essa superfície (o `service_role` agora só fala com o endpoint de admin de auth,
nunca com tabelas de `public`).

## Verification

- `npm run test:integration:pg` — 1/1 passed (RED confirmado antes da correção com `column
  planned_sets_1.planned_exercise_id does not exist`; GREEN depois).
- `npx jest __tests__/sessionExecutionRepository.test.ts` — 47/47 passed (9 do describe
  `getSessionLogDetail`, incluindo os 3 mocks editados).
- `npx jest` (suíte padrão completa) — 140 suítes / 1609 testes passed, lido do resumo.
- `npx tsc --noEmit` — sem erros.
- `grep -rn "planned_sets(set_order, planned_exercise_id" src/` — vazio.
- `git log --oneline -2` — `afb0e2b test(03-07): ...` (RED) seguido de `afb35ab fix(03-07):
  ...` (GREEN), duas commits atômicas mínimas.

## Self-Check: PASSED

- FOUND: src/services/sessionExecutionRepository.ts (exercise_id presente na query e na leitura)
- FOUND: __tests__/integration/getSessionLogDetail.postgrest.test.ts
- FOUND: jest.integration.config.js
- FOUND commit afb0e2b (test RED)
- FOUND commit afb35ab (fix GREEN)

## TDD Gate Compliance

Task 1 (`tdd="true"`, tracer): RED commit `afb0e2b` (test — harness observado falhando com
42703 contra Postgres local real) seguido de GREEN commit `afb35ab` (fix — correção da coluna
+ mocks). Gate sequence completo. Sem REFACTOR separado (não necessário).
