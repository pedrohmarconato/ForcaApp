---
phase: 01-fluxo-cardio-e-alongamento
plan: 01
subsystem: ui
tags: [react-native, jest, testing-library, formatting, pt-br]

# Dependency graph
requires: []
provides:
  - "ManualExerciseRow exibe distância em pt-BR (vírgula), reaproveitando formatDistance"
  - "Prova por teste automatizado de que SessionPlayer já persistia o decimal corretamente desde 925ba42"
affects: [01-02, fluxo-cardio-e-alongamento]

# Actuals (#2632)
actuals:
  tokens: 1190
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exibição de distância SEMPRE via formatDistance (src/engine/sessionModel.ts), nunca interpolação crua de campo em km"

key-files:
  created:
    - __tests__/manualExerciseRow.test.tsx
  modified:
    - src/components/session/ManualExerciseRow.tsx
    - __tests__/sessionPlayerTransitions.test.tsx

key-decisions:
  - "Task 1 decidiu por execução (não leitura estática) entre as duas hipóteses do RESEARCH.md: SessionPlayer já correto (925ba42), gap real e único é ManualExerciseRow.tsx:13"
  - "Nenhuma expansão de escopo: só a linha de metricLabel foi tocada, per RESEARCH.md Anti-Patterns"

patterns-established:
  - "Pattern: qualquer novo ponto de exibição de distância deve importar formatDistance de sessionModel.ts, nunca reimplementar a formatação pt-BR"

requirements-completed: [REQ-01]

coverage:
  - id: D1
    description: "Editor manual (ManualExerciseRow) exibe distância digitada como '2,4 km' (vírgula pt-BR), nunca '2.4 km'"
    requirement: "REQ-01"
    verification:
      - kind: unit
        ref: "__tests__/manualExerciseRow.test.tsx#exibe distância decimal com vírgula pt-BR (2,4 km), nunca ponto"
        status: pass
    human_judgment: false
  - id: D2
    description: "SessionPlayer (player de sessão) já persiste '2,4' digitado como actualDistanceM=2400 — confirmado por execução real, não leitura de código"
    requirement: "REQ-01"
    verification:
      - kind: unit
        ref: "__tests__/sessionPlayerTransitions.test.tsx#\"2,4\" no campo de distância vira actualDistanceM=2400"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-08-09
status: complete
---

# Phase 1 Plan 01: Decimal pt-BR na distância de cardio (REQ-01) Summary

**ManualExerciseRow.tsx agora exibe "2,4 km" via formatDistance reaproveitado; teste de regressão confirma que SessionPlayer já persistia o decimal corretamente desde `925ba42`.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-09T00:28Z (aprox., commit base `fa8355a`)
- **Completed:** 2026-08-09T00:35:22-03:00
- **Tasks:** 2/2
- **Files modified:** 3 (1 criado, 2 editados)

## Accomplishments
- Task 1 provou por execução (não leitura estática) qual dos dois pontos de entrada do decimal estava quebrado: o player de sessão (`SessionPlayer.tsx`) já estava correto — a `Assumption A1` do RESEARCH.md foi confirmada por um novo caso de teste que passou GREEN sem tocar em código de produção.
- O gap real (único) era `ManualExerciseRow.tsx:13`, que interpolava `exercise.distancia_km` cru (ponto) em vez de formatar em pt-BR — provado por um teste RED novo antes de qualquer edição.
- Task 2 fechou o gap trocando a interpolação crua por `formatDistance` (já usado no player), sem reescrever nenhuma outra tela.
- REQ-01 fechado nos dois pontos de entrada/exibição de distância de cardio mapeados pelo plano.

## Task Commits

Each task was committed atomically:

1. **Task 1: Verificar em runtime qual dos dois pontos de entrada do decimal está quebrado** - `92991db` (test)
2. **Task 2: Corrigir a formatação de distância em ManualExerciseRow.tsx** - `d6eab74` (fix)

**Plan metadata:** commit deste SUMMARY (a seguir)

_Nota: Task 1 é `type="tracer" tdd="true"` mas não introduziu comportamento novo — só testes; por isso um único commit `test(...)` cobre RED (manualExerciseRow) e GREEN (sessionPlayerTransitions) na mesma tarefa, conforme desenhado no plano._

## Files Created/Modified
- `__tests__/manualExerciseRow.test.tsx` - Novo: 3 casos (2,4 km com vírgula, sem distância, distância inteira sem decimal) cobrindo REQ-01 no editor manual
- `__tests__/sessionPlayerTransitions.test.tsx` - Novo describe/caso: prova via execução que `'2,4'` digitado no campo de distância do player vira `actualDistanceM=2400`
- `src/components/session/ManualExerciseRow.tsx` - `metricLabel` passa a importar e usar `formatDistance` de `sessionModel.ts`, convertendo km→metros antes de chamar; removida a interpolação crua e o " km" literal duplicado

## Decisions Made
- Nenhuma decisão além do fluxo já travado no CONTEXT.md/RESEARCH.md: o plano definiu com precisão qual linha mudar e qual teste escrever primeiro. Task 1 confirmou por execução (não presumiu) que o player já estava correto antes de decidir não tocá-lo — evitando expandir escopo para `SessionPlayer.tsx`.

## Deviations from Plan

None - plan executado exatamente como escrito. O resultado da Task 1 (player já correto) bateu com a Assumption A1 do RESEARCH.md, então nenhum "PARE" foi acionado e a Task 2 seguiu o escopo original (apenas `ManualExerciseRow.tsx`).

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- REQ-01 fechado nos dois pontos de entrada mapeados pela pesquisa (player de sessão e editor manual). Nenhum outro ponto de exibição bruta de `distancia_km` foi encontrado fora de `ManualExerciseRow.tsx`/`manualPlan.ts` (grep de verificação do plano confirmado).
- `npx tsc --noEmit` sem erro novo; `npx jest __tests__/manualExerciseRow.test.tsx __tests__/sessionPlayerTransitions.test.tsx --silent` com 8/8 testes GREEN.
- Sem bloqueios para o próximo plano da fase (REQ-02/REQ-03).

---
*Phase: 01-fluxo-cardio-e-alongamento*
*Completed: 2026-08-09*
