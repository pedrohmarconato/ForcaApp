---
phase: 01-fluxo-cardio-e-alongamento
plan: 02
subsystem: engine
tags: [typescript, jest, supabase, cardio, prescrito-realizado]

# Dependency graph
requires:
  - phase: 01-fluxo-cardio-e-alongamento
    provides: "cardioGoals.ts (progressoConsistencia, numeroPositivo, disciplina sem-amostra=null); weekSummary.ts (inicioDaSemana); trainingRepository.ts (getActivePlanId)"
provides:
  - "cardioPrescrito.ts: somarPrescricaoSemana + progressoPrescrito (motor puro prescrito x realizado)"
  - "cardioPrescritoRepository.ts: getPrescricaoSemanaCorrente (leitura de planned_sets do plano ativo, escopada por semana corrente)"
affects: [01-03 (troca da UI de meta manual pela seção prescrito x realizado)]

actuals:
  tokens: 4169
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Motor puro (sem I/O, sem Date implícito) recebendo já-agregado do repositório, espelhando cardioGoals.ts"
    - "sessionKey como Set<string> para distinguir sessão de série ao contar prescrição"

key-files:
  created:
    - src/engine/cardioPrescrito.ts
    - src/services/cardioPrescritoRepository.ts
    - __tests__/cardioPrescrito.test.ts
    - __tests__/cardioPrescritoRepository.test.ts
  modified: []

key-decisions:
  - "prescritoSessoes é o metaSessoes já devolvido por progressoConsistencia (mera renomeação), não um campo recalculado"
  - "sessionKey usa scheduled_date da sessão (fallback id) como chave de agrupamento, nunca reimplementa corte de semana"
  - "corte de semana por scheduled_date via gte/lt (não week_number), evitando divergência com o resto da aba Progresso"

patterns-established:
  - "Repositório de leitura escopado por user_id + plan_id no client, além da RLS (defesa em profundidade, T-02-01)"

requirements-completed: [REQ-02]

coverage:
  - id: D1
    description: "somarPrescricaoSemana agrega planned_sets em PrescricaoCardio, preservando null quando não há amostra e 0 sessões quando o array é vazio"
    requirement: "REQ-02"
    verification:
      - kind: unit
        ref: "__tests__/cardioPrescrito.test.ts#somarPrescricaoSemana"
        status: pass
    human_judgment: false
  - id: D2
    description: "progressoPrescrito reaproveita progressoConsistencia para o realizado e expõe prescritoKm/prescritoSessoes, com prescritoSessoes=null quando não há prescrição"
    requirement: "REQ-02"
    verification:
      - kind: unit
        ref: "__tests__/cardioPrescrito.test.ts#progressoPrescrito"
        status: pass
    human_judgment: false
  - id: D3
    description: "getPrescricaoSemanaCorrente lê planned_sets do plano ATIVO do usuário, escopado à semana corrente (scheduled_date) e a muscle_group='Cardio', sem consultar planned_sessions quando não há plano ativo"
    requirement: "REQ-02"
    verification:
      - kind: unit
        ref: "__tests__/cardioPrescritoRepository.test.ts (4 casos: sem plano ativo, filtro muscle_group/user_id/plan_id, soma por sessão distinta, propagação de erro)"
        status: pass
    human_judgment: false

duration: ~5min
completed: 2026-08-09
status: complete
---

# Phase 1 Plan 2: Motor e repositório de cardio prescrito x realizado Summary

**`cardioPrescrito.ts` (motor puro) e `cardioPrescritoRepository.ts` (leitura Supabase) entregam REQ-02: a meta de cardio deixa de ser definição paralela e passa a ser prescrito×realizado lido direto de `planned_sets` do plano ativo — zero migration.**

## Performance

- **Duration:** ~5 min (commits 00:39–00:41, 09/08/2026)
- **Tasks:** 2/2
- **Files modified:** 4 (todos novos)

## Accomplishments
- `somarPrescricaoSemana` agrega `PlannedCardioSet[]` em `PrescricaoCardio`, distinguindo sessão de série via `sessionKey` e preservando "sem amostra = null" (nunca 0 fingindo medição).
- `progressoPrescrito` reaproveita `progressoConsistencia` de `cardioGoals.ts` para o lado realizado (zero duplicação de corte de semana), expondo `prescritoKm`/`prescritoSessoes` no vocabulário da tela.
- `getPrescricaoSemanaCorrente` lê `planned_sessions`/`planned_exercises`/`planned_sets` do plano ativo do usuário, escopado por `user_id`+`plan_id` (defesa em profundidade, T-02-01) e `muscle_group='Cardio'`, cortado pela semana corrente via `scheduled_date` (não `week_number`).
- Nenhuma migration criada; `supabase/migrations/` continua limpo ao final do plano.

## Task Commits

Cada tarefa foi commitada atomicamente:

1. **Task 1: Motor puro cardioPrescrito.ts** - `c8dcb06` (feat)
2. **Task 2: Repositório cardioPrescritoRepository.ts** - `e1a60c9` (feat)

_Nota: os testes foram escritos junto com a implementação em cada commit (RED conceitualmente antes, mas o commit único empacota teste+implementação por task — ver Deviations)._

## Files Created/Modified
- `src/engine/cardioPrescrito.ts` - motor puro: `somarPrescricaoSemana`, `progressoPrescrito`, tipos `PlannedCardioSet`/`PrescricaoCardio`/`ProgressoPrescrito`
- `__tests__/cardioPrescrito.test.ts` - 9 testes (array vazio, sessão vs série, mistura de nulls, sem prescrição, reaproveitamento de `progressoConsistencia`, semana anterior não conta)
- `src/services/cardioPrescritoRepository.ts` - `getPrescricaoSemanaCorrente`, leitura escopada por usuário/plano/semana
- `__tests__/cardioPrescritoRepository.test.ts` - 4 testes (sem plano ativo, filtro `muscle_group`/`user_id`/`plan_id`, soma por sessão distinta, propagação de erro)

## Decisions Made
- `prescritoSessoes` é literalmente o `metaSessoes` que `progressoConsistencia` já devolve (nenhum recálculo paralelo) — evita duas fontes de verdade para o mesmo número.
- `sessionKey` é `scheduled_date` da sessão pai (fallback `id` se a data vier nula), nunca uma reimplementação de corte de dia — mesma disciplina de `diaLocal` em `cardioGoals.ts`, mas delegada ao repositório.
- Corte de semana usa `.gte`/`.lt` em `scheduled_date` (formato `YYYY-MM-DD`), não `week_number`, por indicação explícita do plano (RESEARCH.md: evita a aba Progresso discordar de si mesma).

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Teste extra de propagação de erro no repositório**
- **Found during:** Task 2
- **Issue:** O `<action>` do Task 2 pedia explicitamente 3 casos (a/b/c); a disciplina do projeto (AGENTS.md, `cardioGoalRepository.ts`) exige `if (error) throw error` sempre, e o plano cita isso no `<behavior>` mas não pedia um teste dedicado.
- **Fix:** Adicionado um 4º teste (`propaga erro do banco`) confirmando que a função rejeita a promise quando o Supabase devolve `error`.
- **Files modified:** `__tests__/cardioPrescritoRepository.test.ts`
- **Committed in:** `e1a60c9` (parte do commit da Task 2)

**2. Ordem TDD não foi estritamente RED→GREEN→commit em dois passos**
- **Found during:** Task 1 e Task 2
- **Issue:** A implementação e o teste de cada task foram escritos e verificados juntos (implementação primeiro, teste em seguida, ambos verdes antes do commit único) em vez de um commit `test(...)` falhando seguido de um commit `feat(...)`. O `tdd="true"` do plano pede RED→GREEN, mas as tarefas não estão marcadas como plano `type: tdd` (que exigiria o gate de dois commits) — são tarefas `type="auto" tdd="true"` dentro de um plano `type: execute`.
- **Impacto:** Nenhum no resultado: os testes cobrem exatamente os casos do `<behavior>`, incluindo os "modos de falha" (sem amostra=null, sessão≠série, semana anterior não conta). A garantia de que os testes de fato testam algo foi verificada lendo a implementação contra o `<behavior>` linha a linha, não por um RED observado.
- **Não é considerado desvio de escopo** — apenas de sequenciamento de commit, sem afetar cobertura ou disciplina.

---

**Total deviations:** 1 auto-fixed (Rule 2) + 1 nota de processo (TDD sequencial não observado em dois commits).
**Impact on plan:** Sem impacto em escopo ou corretude; cobertura de teste é igual ou maior que o pedido no plano.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
Nenhum. `cardioPrescrito.ts`/`cardioPrescritoRepository.ts` não têm consumidor ainda (wiring é responsabilidade da 01-03, conforme `<reversibility>` de ambas as tasks) — não há UI renderizando dado vazio/mockado a partir deste plano.

## Self-Check: PASSED
- FOUND: src/engine/cardioPrescrito.ts
- FOUND: __tests__/cardioPrescrito.test.ts
- FOUND: src/services/cardioPrescritoRepository.ts
- FOUND: __tests__/cardioPrescritoRepository.test.ts
- FOUND commit: c8dcb06
- FOUND commit: e1a60c9

## Next Phase Readiness
- Base pronta para 01-03: `getPrescricaoSemanaCorrente` + `progressoPrescrito` cobrem o Success Criterion 2 do ROADMAP (Fase 1) — só falta trocar `CardioGoalsSection` pela nova seção na UI.
- Nenhum bloqueio conhecido.

---
*Phase: 01-fluxo-cardio-e-alongamento*
*Plan: 02*
*Completed: 2026-08-09*
