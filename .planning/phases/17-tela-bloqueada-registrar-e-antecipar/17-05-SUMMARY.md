---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 05
subsystem: live-activity
tags: [typescript, swiftui, activitykit, widgetkit, jest]

requires:
  - phase: 17-tela-bloqueada-registrar-e-antecipar
    plan: "02"
    provides: "suggestReps()/suggestLoad()/isFirstSetOfExerciseInSession()/lastRepsByExercise em sessionModel.ts"
  - phase: 17-tela-bloqueada-registrar-e-antecipar
    plan: "03"
    provides: "ContentState pós-reps (currentReps/isRepsInherited) nas duas cópias de SessionActivityAttributes.swift e em liveActivityContentState.ts"
provides:
  - "findPendingSetAfter() em src/engine/sessionModel.ts — série ESTRITAMENTE depois de uma referência"
  - "6 campos next* (nextExerciseName/nextSetIndex/nextSetTotal/nextSuggestedReps/nextSuggestedLoadKg/nextIsBodyweight) em LiveActivityContentState e nas duas cópias de SessionActivityAttributes.ContentState"
  - "Linha 'A SEGUIR' no Lock Screen (WidgetLiveActivity.swift), com destaque visual na virada de exercício"
affects: [17-06, 17-07-uat-fisico]

actuals:
  tokens: 5338
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "findPendingSetAfter() espelha o padrão de iteração de findActiveSet/findNextPendingSet (ignora cutByReplan), mas usa uma flag local 'passed' para nunca devolver a própria referência nem a primeira pendente do draft inteiro — a série ESTRITAMENTE depois"
    - "anticipatedFieldsFor() (liveActivityContentState.ts) é o terceiro incremento do mesmo ContentState schema-só-cresce da Fase 17: carga (17-01) → reps (17-03) → antecipação (17-05), todos com fallback null quando o parâmetro opcional não é passado"
    - "A antecipação nunca duplica a lógica de suggestReps()/suggestLoad() — chama as MESMAS funções do Plano 17-02 sobre o set encontrado por findPendingSetAfter, garantindo que o valor anunciado 'A SEGUIR' seja bit-a-bit o mesmo que nascerá pré-preenchido quando a série virar atual"

key-files:
  created: []
  modified:
    - src/engine/sessionModel.ts
    - src/engine/liveActivityContentState.ts
    - src/native/liveActivitySync.ts
    - targets/session-widget/SessionActivityAttributes.swift
    - modules/live-activity/ios/SessionActivityAttributes.swift
    - targets/session-widget/WidgetLiveActivity.swift
    - __tests__/sessionModel.test.ts
    - __tests__/liveActivityContentState.test.ts

key-decisions:
  - "Nota de flag do PLAN.md (edge-probe PRED-01 unclassified/unresolved): a assunção 'durante o descanso, current É a própria próxima série pendente — a antecipação busca a série DEPOIS dessa' já vinha adotada e documentada no próprio plano, não como decisão do dono pendente de checkpoint. Implementada como escrita (current = active ?? next; anticipatedFieldsFor(draft, current) chama findPendingSetAfter(draft, current)) e coberta pelo teste 'resting: a série depois da atual pertence ao exercício SEGUINTE (B), não um fallback repetindo A' — não foi surfaced como checkpoint por não estar marcada como owner-call no PLAN.md."
  - "Task 1 (tracer, tdd=true): o <verify> automatizado (jest) já prova o comportamento e não há nenhum artefato visual/UI ainda nesse ponto do plano (a superfície visível só nasce na Task 3) — a linha do protocolo de checkpoint ('Users ONLY visit URLs, click UI, evaluate visuals') não tem o que pedir a um humano aqui. Segui direto para a Task 2 sem checkpoint intermediário, documentando a decisão aqui em vez de pausar a wave por um checkpoint sem conteúdo verificável."

patterns-established:
  - "Toda extensão futura do ContentState que precisar de 'olhar para frente' no draft deve usar findPendingSetAfter(draft, ref), não repetir findNextPendingSet — a diferença semântica (primeira pendente do draft vs. estritamente depois de uma referência) é o que torna a antecipação correta durante o descanso."

requirements-completed: [PRED-01]

coverage:
  - id: D1
    description: "findPendingSetAfter() — série pendente estritamente posterior a uma referência dada, ignorando cutByReplan, nunca lançando para referência ausente"
    requirement: PRED-01
    verification:
      - kind: unit
        ref: "__tests__/sessionModel.test.ts#findPendingSetAfter — a série ESTRITAMENTE DEPOIS de uma referência (Fase 17, PRED-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "6 campos next* compostos por anticipatedFieldsFor() sobre findPendingSetAfter(draft, current) em measuring/resting/readyOvertime; suprimidos em blockOnly; virada para bloco de cardio/alongamento mostra só o nome (D-03/D-16); buildFinishedContentState preenche os 6 campos como null"
    requirement: PRED-01
    verification:
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#antecipação \"A SEGUIR\" (next* — Fase 17, PRED-01)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "Linha 'A SEGUIR' no Lock Screen (WidgetLiveActivity.swift) nos cases .measuring/.resting/.readyOvertime, com destaque visual (activityNeon + peso de fonte) só quando o exercício antecipado difere do atual (D-15); as duas cópias de SessionActivityAttributes.swift permanecem byte-idênticas"
    requirement: PRED-01
    verification:
      - kind: other
        ref: "bash scripts/verify-native-skeleton.sh (checagens a-h, 2 rodadas idempotentes)"
        status: pass
    human_judgment: true
    rationale: "SwiftUI de widget — a prova visual de que a linha aparece desde o primeiro segundo do descanso e o destaque de cor/peso são legíveis no Lock Screen físico só se confirma no aparelho; deferido ao Plano 17-07 conforme o success_criteria original deste plano."

duration: ~20min
completed: 2026-08-19
status: complete
---

# Phase 17 Plan 05: Antecipação da próxima série "A SEGUIR" (PRED-01) Summary

**`findPendingSetAfter()` compõe a série estritamente posterior à atual e alimenta 6 novos campos `next*` no `ContentState` — a linha "A SEGUIR" do Lock Screen mostra, desde o primeiro segundo do descanso, o MESMO valor (`suggestReps()`/`suggestLoad()`) que vai nascer pré-preenchido quando essa série virar a atual, suprimindo qualquer prescrição de cardio/alongamento e anunciando só o nome na virada de bloco.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3/3
- **Files modified:** 8

## Accomplishments
- `findPendingSetAfter(draft, ref)` em `sessionModel.ts`: nova função pura que espelha o padrão de iteração de `findActiveSet`/`findNextPendingSet` (ignora `cutByReplan`), mas devolve a série ESTRITAMENTE depois de uma referência — nunca a mesma, nunca a primeira pendente do draft inteiro. 5 casos de comportamento cobertos (mesmo exercício, exercício esgotado, fim do treino, `cutByReplan` ignorado, referência inexistente).
- `LiveActivityContentState` (TS) e as DUAS cópias de `SessionActivityAttributes.ContentState` (Swift, mantidas byte-idênticas) ganharam 6 campos `next*`. Compostos por `anticipatedFieldsFor()`, chamada só em measuring/resting/readyOvertime (nunca em blockOnly, D-16). Reps via `suggestReps()` bifurcado pela precedência híbrida D-17 sobre o PRÓPRIO set encontrado; carga via `suggestLoad()` (D-08, precedência inalterada) — o valor anunciado "A SEGUIR" é bit-a-bit o mesmo que nascerá pré-preenchido quando a série virar atual, nunca a prescrição crua do plano.
- Virada para bloco de cardio/alongamento (próxima série `isTimeBased`): só `nextExerciseName` vem preenchido, os outros cinco saem `null` — D-03 da Fase 15 continua vetando qualquer prescrição de tempo/distância antecipada.
- `WidgetLiveActivity.swift` ganhou `nextUpLine()` (ViewBuilder): renderiza "A SEGUIR" com o formato `"<nome> · Série X/Y · <valor>"` (ou só o nome na virada de bloco), com destaque visual (cor `activityNeon` + peso de fonte) só quando o exercício antecipado difere do atual (D-15 — a única transição que muda o que o dono faz fisicamente). Chamada nos cases `.measuring`, `.resting` e `.readyOvertime`; nunca em `.blockOnly`.
- `buildFinishedContentState` (`liveActivitySync.ts`) preenche os 6 campos novos como `null`, mesmo padrão dos campos anteriores (Planos 17-01/17-03).

## Task Commits

Each task was committed atomically:

1. **Task 1: findPendingSetAfter — a série DEPOIS da atual, não em vez dela** — `7286592` (feat, tracer/tdd)
2. **Task 2: Campos de antecipação no builder + null defaults no resumo final** — `dcd6e4e` (feat, tdd)
3. **Task 3: Linha A SEGUIR no widget (Swift) com destaque na virada de exercício** — `8952442` (feat)

**Plan metadata:** committed together with worktree wave metadata by the orchestrator (SUMMARY.md + STATE.md are excluded from per-plan commits in worktree isolation mode; see `<parallel_execution>`).

_Note: Task 1 is `type="tracer" tdd="true"`; Tasks 2-3 follow the plan's own task-type declarations (`auto tdd="true"` and `auto`). Behavior-driven tests were written and committed together with the implementation for each task, per the plan's TDD framing._

## Files Created/Modified
- `src/engine/sessionModel.ts` — `findPendingSetAfter(draft, ref)`, exportada logo após `findNextPendingSet`
- `src/engine/liveActivityContentState.ts` — 6 campos `next*` no tipo `LiveActivityContentState`, `anticipatedFieldsFor()` (função auxiliar fora de `contentStateFor`), `contentStateFor` com 7º parâmetro opcional `anticipated`, `buildLiveActivityContentState` chamando `anticipatedFieldsFor(draft, current)` em resting/readyOvertime/measuring
- `src/native/liveActivitySync.ts` — `buildFinishedContentState` preenche os 6 campos novos como `null`
- `targets/session-widget/SessionActivityAttributes.swift` / `modules/live-activity/ios/SessionActivityAttributes.swift` — 6 campos `next*` no `ContentState` (as duas cópias, idênticas)
- `targets/session-widget/WidgetLiveActivity.swift` — `nextUpDetailText()`, `nextUpIsExerciseChange()`, `nextUpLine()` (ViewBuilder), chamada nos 3 cases de `lockScreenBody` que mostram card completo
- `__tests__/sessionModel.test.ts` — 5 novos testes de `findPendingSetAfter`
- `__tests__/liveActivityContentState.test.ts` — 5 novos testes de antecipação `next*` + 1 teste `toEqual` pré-existente atualizado com os campos `null` (fallout mecânico da extensão do tipo)

## Decisions Made
- A nota de flag do PLAN.md sobre o edge-probe PRED-01 (`unclassified`/`unresolved`) já trazia a assunção adotada e documentada pelo próprio plano ("durante o descanso, `current` É a própria próxima série pendente") — não estava marcada como decisão do dono pendente. Implementada literalmente (`anticipatedFieldsFor(draft, current)` sobre `current = active ?? next`) e coberta pelo teste que prova que a antecipação durante o descanso aponta para o exercício SEGUINTE, não repete o card principal.
- Task 1 (tracer): o `<verify>` automatizado (jest) já prova o comportamento, e não existe ainda nenhum artefato visual/UI neste ponto do plano — a linha do protocolo de checkpoint ("Users ONLY visit URLs, click UI, evaluate visuals") não tinha o que pedir a um humano. Segui direto para a Task 2 sem pausar a wave com um checkpoint sem conteúdo verificável, documentando a decisão aqui em vez de bloquear a execução silenciosamente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Teste `toEqual` exato pré-existente quebrado pela extensão do tipo**
- **Found during:** Task 2 (`npx jest __tests__/liveActivityContentState.test.ts`)
- **Issue:** O teste "propaga o exercício, a série seguinte e restEndsAt durante o descanso" usa `toEqual` (comparação EXATA, não `toMatchObject`) contra o objeto completo retornado por `buildLiveActivityContentState`. Adicionar os 6 campos `next*` ao tipo quebrou esse teste porque o objeto real agora tem 6 chaves a mais que o esperado não listava.
- **Fix:** Adicionados os 6 campos `next*` (todos `null`, valor correto para esse cenário — a série de referência é a última pendente do treino) ao objeto esperado do teste.
- **Files modified:** `__tests__/liveActivityContentState.test.ts`
- **Verification:** `npx jest __tests__/liveActivityContentState.test.ts` verde (25/25)
- **Committed in:** `dcd6e4e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — fallout mecânico direto da extensão de tipo que a própria Task 2 instruiu).
**Impact on plan:** Nenhum scope creep — ajuste mecânico de um teste pré-existente para refletir o novo contrato do tipo, exigido pelo próprio acceptance criteria da task (`npx jest ... && npx tsc --noEmit`).

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- PRED-01 está completo NO CÓDIGO: `npx jest __tests__/sessionModel.test.ts __tests__/liveActivityContentState.test.ts` (72 testes), `bash scripts/verify-native-skeleton.sh` (checagens a-h, 2 rodadas idempotentes), `npx tsc --noEmit` (limpo), e a suíte Jest completa do projeto (167 suites / 1977 testes) — todos verdes.
- **Bloqueio conhecido, não deste plano:** a prova física no aparelho (linha "A SEGUIR" visível desde o primeiro segundo do descanso, não só quando o timer zera; legibilidade do destaque de cor na virada de exercício) fica para o Plano 17-07, conforme o `success_criteria` original deste plano — "compilou e os testes passam" não é critério de conclusão desta fase.
- **Pitfall 4 (schema change com Activities em curso):** este é o TERCEIRO incremento de schema do `ContentState` na Fase 17 (carga → reps → antecipação). Activities já em curso precisarão ser encerradas/recriadas antes do UAT físico — passo explícito fica no Plano 17-07, sem mitigação possível em código (limitação de plataforma, documentada no `threat_model` deste plano como T-17-13).
- O Plano 17-06 e o UAT físico do 17-07 podem reaproveitar `findPendingSetAfter()` e os 6 campos `next*` sem reabrir nenhum contrato.

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-19*
