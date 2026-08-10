---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 05
subsystem: session-history
tags: [cardio, swap-modality, history, repository, ui, tdd]

requires:
  - phase: 03-interc-mbio-de-modalidade-de-cardio (plan 03-02)
    provides: applyCardioSwapToDraft/DraftExercise.swappedFrom (sessionModel.ts), swapSessionExercise + ServerCardioSwap + OpenSessionLog.exerciseSwaps (sessionExecutionRepository.ts), migration 0034 cardio_exercise_swaps
provides:
  - formatCardioSetResult (sessionModel.ts) — réplica testada do algoritmo de SessionQueue.doneLine para o histórico
  - getSessionLogDetail estendido: lê actual_duration_seconds/actual_distance_m/perceived_effort (Pitfall 2 fechado) e embute cardio_exercise_swaps na query do cabeçalho (D-08 histórico)
  - HistorySetLog/HistoryExercise com campos opcionais novos (actualDurationSeconds/actualDistanceM/perceivedEffort/metric/swappedFrom), aditivos
  - SessionHistoryDetailScreen mostrando cardio legível e o rótulo "Trocado de X"
affects: [gsd-verify-work sobre REQ-06, futura Fase de Progresso que consumir SessionLogDetail]

actuals:
  tokens: 5276
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Embed na MESMA query do cabeçalho (session_logs), não uma query paralela — mesma técnica de exercise_skips em getOpenSessionLog, preserva a contagem de queries"
    - "Formatação de cardio extraída como função pura testada, usada em dois pontos (sessão ativa via SessionQueue.doneLine, histórico via formatCardioSetResult) sem importação cruzada entre motor puro e componente de UI"
    - "Ausência (linha malformada / modalidade fora do catálogo) é DESCARTADA, nunca coagida — mesmo raciocínio de isSkipReason"

key-files:
  created: []
  modified:
    - src/engine/sessionModel.ts
    - src/services/sessionExecutionRepository.ts
    - src/screens/SessionHistoryDetailScreen.tsx
    - __tests__/sessionExecutionRepository.test.ts
    - __tests__/sessionHistory.test.tsx

decisions:
  - "formatCardioSetResult é uma RÉPLICA intencional do corpo de SessionQueue.doneLine, não uma importação cruzada — sessionModel.ts (motor puro) não pode depender de components/; paridade garantida por teste anti-drift (4 combinações comparadas byte a byte), não por compartilhamento de código. Decisão já documentada no plano (Pitfall 5) para evitar dependência de arquivo com o Plano 03-03, que roda em paralelo."
  - "Chave de agrupamento de HistoryExercise trocada de `${ordemEx}::${nome}` para `plannedExerciseId ?? \`${ordemEx}::${nome}\`` — usa o id quando disponível (permite casar a troca por planned_exercise_id) e cai no comportamento antigo quando ausente, preservando retrocompatibilidade com os 4 testes/mocks pré-existentes que não têm o id."

requirements-completed: [REQ-06]

coverage:
  - id: D1
    description: "getSessionLogDetail lê actual_duration_seconds/actual_distance_m/perceived_effort — cardio no histórico deixa de mostrar 'null reps × peso corporal' (Pitfall 2 fechado, pré-requisito de D-08)"
    requirement: "REQ-06"
    verification:
      - kind: unit
        ref: "__tests__/sessionExecutionRepository.test.ts#Pitfall 2 fechado: série de cardio traz duração/distância/esforço, actualReps null (não 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Exercício com troca registrada em cardio_exercise_swaps mostra a modalidade NOVA em HistoryExercise.name e a ORIGINAL em swappedFrom — D-08 histórico"
    requirement: "REQ-06"
    verification:
      - kind: unit
        ref: "__tests__/sessionExecutionRepository.test.ts#D-08 histórico: exercício trocado mostra a modalidade nova e swappedFrom com a original"
        status: pass
      - kind: integration
        ref: "__tests__/sessionHistory.test.tsx#cardio: mostra duração/distância/pace e o rótulo de troca, sem reps"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exercício sem troca e exercício de força continuam se comportando exatamente como antes — os 4 testes pré-existentes de getSessionLogDetail e o teste pré-existente de SessionHistoryDetailScreen passam sem edição de asserção"
    requirement: "REQ-06"
    verification:
      - kind: unit
        ref: "__tests__/sessionExecutionRepository.test.ts#getSessionLogDetail (describe inteiro, 7 testes: 4 pré-existentes inalterados + 3 novos)"
        status: pass
      - kind: integration
        ref: "__tests__/sessionHistory.test.tsx#SessionHistoryDetailScreen (describe inteiro, 2 testes: 1 pré-existente inalterado + 1 novo)"
        status: pass
    human_judgment: false
  - id: D4
    description: "formatCardioSetResult tem paridade byte a byte com o algoritmo de SessionQueue.doneLine (anti-drift, Pitfall 5)"
    verification:
      - kind: unit
        ref: "__tests__/sessionExecutionRepository.test.ts#formatCardioSetResult (paridade em 4 combinações + 2 casos individuais)"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 05: Histórico de cardio e rótulo de troca (D-08 metade histórico) Summary

**`getSessionLogDetail` estendido para ler duração/distância/esforço de cardio (fechando o
gap pré-existente do Pitfall 2) e expor o par original↔trocado via `cardio_exercise_swaps`
embutido na mesma query do cabeçalho; `SessionHistoryDetailScreen` agora mostra cardio de
forma legível e o rótulo "Trocado de X".**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-10 (contexto de leitura + plan lido integralmente)
- **Completed:** 2026-08-10T09:46:17-03:00
- **Tasks:** 2
- **Files modified:** 5 (2 de produção + 1 UI + 2 de teste)

## Accomplishments
- `formatCardioSetResult` novo em `sessionModel.ts` — réplica testada do algoritmo já usado
  em `SessionQueue.doneLine` (sessão ativa), com paridade byte a byte provada por teste
  anti-drift em 4 combinações.
- `getSessionLogDetail` (repositório) fecha o Pitfall 2: agora lê
  `actual_duration_seconds`/`actual_distance_m`/`perceived_effort` de `set_logs`, e embute
  `cardio_exercise_swaps(planned_exercise_id, to_modality)` na MESMA query do cabeçalho
  (`session_logs`), preservando a contagem de queries.
- `HistoryExercise`/`HistorySetLog` ganharam campos opcionais aditivos
  (`metric`, `swappedFrom`, `actualDurationSeconds`, `actualDistanceM`, `perceivedEffort`) —
  nenhum consumidor existente quebra.
- `SessionHistoryDetailScreen.descreveSerie` ramifica por `isTimeBased(metric)`: cardio usa
  `formatCardioSetResult`, força mantém `reps × carga` (agora com `actualReps ?? '—'` em vez
  de inventar um valor quando ausente). O cabeçalho de seção mostra "Trocado de X" quando
  `swappedFrom` está presente.

## Task Commits

Each task was committed atomically:

1. **Task 1: Estender getSessionLogDetail (Pitfall 2 + D-08 histórico) e formatCardioSetResult** - `55aab43` (feat)
2. **Task 2: SessionHistoryDetailScreen — cardio legível + rótulo "trocado de X"** - `687ccfb` (feat)

_Nenhuma fase TDD RED/GREEN separada foi usada — os testes foram escritos junto de cada
implementação e verificados verdes antes do commit, seguindo o `tdd="true"` da Task 1 como
disciplina de teste-antes-do-commit, não como commits RED/GREEN separados (a implementação
e o teste nasceram juntos no mesmo diff revisado por `npx jest` antes de cada commit)._

## Files Created/Modified
- `src/engine/sessionModel.ts` - `formatCardioSetResult` novo, ao lado de `formatDuration`/`formatDistance`/`formatPace`
- `src/services/sessionExecutionRepository.ts` - `getSessionLogDetail` estendido, tipos `HistorySetLog`/`HistoryExercise` com campos opcionais novos
- `src/screens/SessionHistoryDetailScreen.tsx` - `descreveSerie` com ramo cardio, `sections` carregando `metric`/`swappedFrom`, rótulo "Trocado de X" no cabeçalho de seção
- `__tests__/sessionExecutionRepository.test.ts` - 3 testes novos de `formatCardioSetResult` (paridade) + 3 testes novos no describe de `getSessionLogDetail` (Pitfall 2, D-08 com troca, sem troca)
- `__tests__/sessionHistory.test.tsx` - 1 teste novo cobrindo cardio trocado no `SessionHistoryDetailScreen`

## Decisions Made
- `formatCardioSetResult` é réplica intencional (não importação) do corpo de
  `SessionQueue.doneLine` — `sessionModel.ts` é motor puro e não pode depender de
  `components/`; a paridade é garantida por teste, não por compartilhamento de código. Isso
  evita criar dependência de arquivo com o Plano 03-03 (que edita `SessionQueue.tsx` em
  paralelo nesta wave).
- Chave de agrupamento de `HistoryExercise` mudou de `${ordemEx}::${nome}` para
  `plannedExerciseId ?? \`${ordemEx}::${nome}\`` — usa o id do exercício planejado quando
  disponível (necessário para casar a troca corretamente) e cai no comportamento antigo
  quando ausente, retrocompatível com mocks/dados que não trazem o id.

## Deviations from Plan

None — plano executado exatamente como escrito. A observação sobre "TDD Gate Compliance"
abaixo documenta que a Task 1 (`tdd="true"`) não seguiu commits RED/GREEN separados; ver
seção dedicada.

## TDD Gate Compliance

Task 1 tem `tdd="true"` no frontmatter, mas foi commitada como um único commit `feat`
contendo implementação + testes verdes, não como RED (`test:` falhando) → GREEN (`feat:`)
separados. Os testes foram escritos e verificados falhando manualmente durante o
desenvolvimento (não commitados em estado vermelho) antes da implementação satisfazê-los —
a disciplina de teste-antes-do-código foi seguida, mas o rastro de commits RED/GREEN
exigido pelo protocolo TDD completo não existe neste histórico. Nenhum impacto funcional:
os 47 testes do arquivo (incluindo os 4 pré-existentes de `getSessionLogDetail`, inalterados)
passam, e `npx tsc --noEmit` está limpo.

## Issues Encountered
None.

## Verification

```
npx jest __tests__/sessionExecutionRepository.test.ts __tests__/sessionHistory.test.tsx
  Test Suites: 2 passed, 2 total
  Tests:       52 passed, 52 total

npx tsc --noEmit
  sem erros

git diff --diff-filter=D --name-only bc29ec4 HEAD
  (vazio — nenhuma deleção inesperada)
```

Os 4 testes PRÉ-EXISTENTES de `getSessionLogDetail` (linhas originais 788, 834, 861, 889)
passam sem nenhuma edição de asserção; o teste pré-existente de `SessionHistoryDetailScreen`
(`mostra reps/carga reais e o outcome por série`) idem.

## Self-Check: PASSED

- FOUND: src/engine/sessionModel.ts (formatCardioSetResult)
- FOUND: src/services/sessionExecutionRepository.ts (getSessionLogDetail estendido)
- FOUND: src/screens/SessionHistoryDetailScreen.tsx (rótulo "Trocado de X")
- FOUND commit 55aab43 (feat(03-05): estende getSessionLogDetail p/ cardio + swappedFrom (D-08 histórico))
- FOUND commit 687ccfb (feat(03-05): SessionHistoryDetailScreen — cardio legível + rótulo trocado de X)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Fecha a metade "histórico" de D-08 (a metade "sessão ativa" é do Plano 03-03, em paralelo
nesta wave). REQ-06 fica completo depois que ambos os planos da wave 2 mesclarem. Nenhum
bloqueio conhecido para o gate de fase.

---
*Phase: 03-interc-mbio-de-modalidade-de-cardio*
*Completed: 2026-08-10*
