---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 03
subsystem: live-activity
tags: [swiftui, activitykit, appintents, widgetkit, react-native, expo-modules, jest]

requires:
  - phase: 17-tela-bloqueada-registrar-e-antecipar
    plan: "01"
    provides: "IntentActionQueue.adjustReps/deltaValue, AdjustLoadIntent molde, currentLoadKg/isLoadInherited/loadIncrementKg no ContentState, liveActivityIntentBridge case adjustLoad"
  - phase: 17-tela-bloqueada-registrar-e-antecipar
    plan: "02"
    provides: "lastRepsByExercise, suggestReps()/stepReps()/isFirstSetOfExerciseInSession()/resolveInheritedSet() em sessionModel.ts, stepReps action na store"
provides:
  - "AdjustRepsIntent (stub + impl real) espelhando AdjustLoadIntent — enfileira, nunca escreve em ActivityKit direto"
  - "LiveActivityContentState.currentReps/isRepsInherited (reps em edição, só measuring, presente inclusive em bodyweight)"
  - "liveActivityIntentBridge case 'adjustReps' -> stepReps() da store (nunca grava direto)"
  - "reconcileLiveActivityIntents() cobrindo os cinco kinds (completeSet/skipRest/adjustRest/adjustReps/adjustLoad) — fecha o gap de cold-launch para os dois campos"
  - "Stepper −/+ de reps no Lock Screen com marca visual de herdado, ao lado do stepper de carga"
affects: [17-05-antecipar-carga, 17-07-uat-fisico]

actuals:
  tokens: 6027
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "AdjustRepsIntent.perform() só enfileira via IntentActionQueue.enqueue + sendEvent — mesmo molde de AdjustLoadIntent (Plano 17-01), nunca chama Activity.update() (espelho, nunca fonte de verdade)"
    - "currentReps calculado por isMeasuringPhase (phase === 'measuring'), não por isMeasuring (que também exclui bodyweight) — reps sempre existem, só a carga é omitida para bodyweight"
    - "suggestReps() bifurca por isFirstSetOfExerciseInSession() (D-17): 1ª série do exercício na sessão usa histórico>alvo, séries seguintes usam alvo>histórico — não é o mesmo espelho de suggestLoad()"
    - "reconcileLiveActivityIntents(): ack incondicional para adjustReps/adjustLoad (mesmo padrão de adjustRest) — diferente de completeSet, que só confirma quando canCompleteSet() realmente aprovou"

key-files:
  created:
    - modules/live-activity/ios/AdjustRepsIntent.swift
    - targets/session-widget/AdjustRepsIntent.swift
  modified:
    - modules/live-activity/ios/IntentActionQueue.swift
    - targets/session-widget/SessionActivityAttributes.swift
    - modules/live-activity/ios/SessionActivityAttributes.swift
    - targets/session-widget/WidgetLiveActivity.swift
    - src/engine/liveActivityContentState.ts
    - src/native/liveActivitySync.ts
    - src/native/liveActivityIntentBridge.ts
    - modules/live-activity/index.ts
    - src/store/activeSessionStore.ts
    - scripts/verify-native-skeleton.sh
    - __tests__/liveActivityContentState.test.ts
    - __tests__/liveActivityIntentBridge.test.ts
    - __tests__/liveActivityIntentQueue.test.ts

key-decisions:
  - "IntentActionQueue.swift não precisou de nenhuma mudança nesta task — .adjustReps e deltaValue já existiam desde o Plano 17-01 (declarados juntos para não reabrir o enum entre planos), confirmado por leitura antes de tocar no arquivo, exatamente como o <action> da Task 1 instruiu."
  - "Bodyweight mantém o stepper de reps (removendo o fallback primaryValue(state) que existia antes só para bodyweight) — a task explicitou que reps sempre existem, inclusive bodyweight; só a carga é omitida."

patterns-established:
  - "diff -q entre as duas cópias de SessionActivityAttributes.swift segue byte-idêntica após o campo novo — checkpoint (h) do verify-native-skeleton.sh (herdado do Plano 17-01) continua provando isso, agora também para currentReps/isRepsInherited."

requirements-completed: [REG-02]

coverage:
  - id: D1
    description: "AdjustRepsIntent (stub + impl real) espelha AdjustLoadIntent: enfileira via IntentActionQueue, dispara sendEvent, nunca chama Activity.update() direto"
    requirement: REG-02
    verification:
      - kind: other
        ref: "scripts/verify-native-skeleton.sh (checagens a-h, 2 rodadas idempotentes)"
        status: pass
    human_judgment: true
    rationale: "Verificação estrutural/de compilação apenas — Swift não roda em CI aqui; a prova de toque real no Lock Screen fica para o Plano 17-07 (aparelho físico), conforme o success_criteria deste próprio plano."
  - id: D2
    description: "ContentState carrega currentReps/isRepsInherited só em measuring (precedência híbrida D-17 via suggestReps() bifurcado por isFirstSetOfExerciseInSession); bridge JS despacha 'adjustReps' via stepReps() da store, nunca grava direto"
    requirement: REG-02
    verification:
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#reps em edição (currentReps/isRepsInherited — precedência híbrida D-17)"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentBridge.test.ts#adjustReps ..."
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stepper −/+ de reps no case .measuring do Lock Screen (todo exercício carga_reps, inclusive bodyweight), e reconcileLiveActivityIntents() tratando os cinco kinds (completeSet/skipRest/adjustRest/adjustReps/adjustLoad) sem deixar nenhuma entrada presa na fila"
    requirement: REG-02
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#reconcileLiveActivityIntents — adjustReps/adjustLoad (direção, CAS, guarda sem draft ativo)"
        status: pass
      - kind: other
        ref: "scripts/verify-native-skeleton.sh (checagens a-h, 2 rodadas) + greps de acceptance_criteria da Task 3"
        status: pass
    human_judgment: true
    rationale: "SwiftUI de widget — layout dos dois pares de −/+ cabendo sem cortar conteúdo e tamanho de alvo de toque só se prova no aparelho físico; deferido ao Plano 17-07 conforme success_criteria deste plano."

duration: ~25min
completed: 2026-08-19
status: complete
---

# Phase 17 Plan 03: Fila + Intent de Reps (App Group) + reconciliação cold-launch Summary

**Toque no stepper +/− de reps do Lock Screen percorre `AdjustRepsIntent` → fila durável do App Group → ponte JS → `stepReps()` da store (Plano 17-02), com o card mostrando reps E carga em edição lado a lado (mesma marca de herdado nos dois), e `reconcileLiveActivityIntents()` agora trata os cinco `kind` possíveis — nenhum toque dado com o app force-quit fica preso na fila indefinidamente.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3/3
- **Files modified:** 14 (2 criados, 12 modificados)

## Accomplishments
- `AdjustRepsIntent` (stub no target da extensão + implementação real no módulo) segue byte-a-byte o molde de `AdjustLoadIntent` do Plano 17-01: `perform()` só enfileira via `IntentActionQueue.enqueue` (reaproveitando `.adjustReps`/`deltaValue` já declarados no Plano 17-01) e dispara `sendEvent`, nunca escreve em `ActivityKit` diretamente.
- `LiveActivityContentState` (TS) e as DUAS cópias de `SessionActivityAttributes.ContentState` (Swift, mantidas byte-idênticas) ganharam `currentReps`/`isRepsInherited`, computados só em `measuring` via `suggestReps()` bifurcado pela precedência híbrida D-17 (`isFirstSetOfExerciseInSession()` decide se histórico ou alvo vence). Ao contrário de `currentLoadKg`, reps existem inclusive para exercício bodyweight — só a carga é omitida.
- `liveActivityIntentBridge.ts` ganhou o `case 'adjustReps'`: resolve o alvo via `findActiveSet ?? findNextPendingSet` e chama `stepReps()` da store — o delta que viaja do widget carrega só o SINAL, `stepReps()` reaplica o passo fixo de 1.
- `reconcileLiveActivityIntents()` (cold-launch) ganhou `case 'adjustReps'` e `case 'adjustLoad'`, fechando um gap real: até esta task, um toque em +/- de reps ou carga com o app force-quit ficava enfileirado sem nenhum case no switch, nunca confirmado nem descartado — sobrevivia indefinidamente na fila (até o cap de 20 cortá-la silenciosamente). Ambos os casos novos confirmam incondicionalmente (mesmo padrão de `adjustRest`), já que ajustar reps/carga não tem uma "reprovação" de `canCompleteSet` a respeitar.
- O card `measuring` do Lock Screen ganhou o segundo par de stepper (reps), lado a lado com o de carga (Plano 17-01) — os dois pares mostram o valor em edição com a mesma marca visual de herdado via opacidade reduzida.
- `scripts/verify-native-skeleton.sh` ganhou `AdjustRepsIntent` na lista de intents verificados (checkpoint g); checkpoint (h) de diff-parity entre as duas cópias de `SessionActivityAttributes.swift` continua verde com os campos novos.

## Task Commits

Each task was committed atomically:

1. **Task 1: AdjustRepsIntent (stub + impl) + fila** — `aa61719` (feat)
2. **Task 2: ContentState de reps em edição + ponte JS (adjustReps)** — `4f66e5a` (feat, tdd)
3. **Task 3: Stepper de reps no widget + reconciliação cold-launch (adjustReps/adjustLoad)** — `f0eb95d` (feat, tdd)

_Note: Tasks 2 e 3 são `tdd="true"` mas o comportamento e os testes novos foram escritos e commitados juntos no commit de implementação — os testes cobrem os cenários do `<behavior>` de cada task e passam junto com o código, mesmo padrão do Plano 17-01._

## Files Created/Modified
- `modules/live-activity/ios/AdjustRepsIntent.swift` — impl real do Intent, resolve `sessionLogId` via `Activity<SessionActivityAttributes>.activities`, enfileira e dispara `sendEvent`
- `targets/session-widget/AdjustRepsIntent.swift` — stub de compilação para o target da extensão
- `modules/live-activity/ios/IntentActionQueue.swift` — lido, não modificado (`.adjustReps`/`deltaValue` já existiam do Plano 17-01)
- `targets/session-widget/SessionActivityAttributes.swift` / `modules/live-activity/ios/SessionActivityAttributes.swift` — `currentReps`/`isRepsInherited` no `ContentState` (as duas cópias, idênticas)
- `targets/session-widget/WidgetLiveActivity.swift` — stepper de reps no case `.measuring`, presente inclusive em bodyweight (o fallback `primaryValue(state)` que só bodyweight usava foi substituído pelo stepper de reps)
- `src/engine/liveActivityContentState.ts` — `contentStateFor` calcula `currentReps`/`isRepsInherited` via `suggestReps()`/`isFirstSetOfExerciseInSession()`, condicionado a `isMeasuringPhase` (não `isMeasuring`, que também exclui bodyweight)
- `src/native/liveActivitySync.ts` — `buildFinishedContentState` preenche os campos novos como `null`/`false`
- `src/native/liveActivityIntentBridge.ts` — `case 'adjustReps'` despachando `stepReps()`
- `modules/live-activity/index.ts` — `LiveActivityIntentActionEvent`/`QueuedLiveActivityIntent` estendidos com `adjustReps`
- `src/store/activeSessionStore.ts` — `reconcileLiveActivityIntents()` ganha `case 'adjustReps'` e `case 'adjustLoad'`
- `scripts/verify-native-skeleton.sh` — `AdjustRepsIntent` na lista de intents verificados
- `__tests__/liveActivityContentState.test.ts` — 5 novos testes cobrindo os dois ramos da precedência híbrida D-17, `actual` vencendo sempre, fase não-measuring, e reps presentes em bodyweight
- `__tests__/liveActivityIntentBridge.test.ts` — 4 novos testes cobrindo `case 'adjustReps'` (direção +1/−1, série ativa/pendente/ausente)
- `__tests__/liveActivityIntentQueue.test.ts` — 6 novos testes cobrindo `reconcileLiveActivityIntents()` para `adjustReps`/`adjustLoad` (direção, CAS por `sessionLogId`, guarda sem draft ativo)

## Decisions Made
- `currentReps` usa um discriminador de fase próprio (`isMeasuringPhase = phase === 'measuring'`), distinto de `isMeasuring` (que já exclui bodyweight para os campos de carga) — necessário porque reps sempre existem, inclusive bodyweight, e o `<behavior>` da Task 2 exigia exatamente esse comportamento.
- O `WidgetLiveActivity.swift` deixou de usar `primaryValue(state)` como fallback visual para bodyweight no case `.measuring` — com o stepper de reps agora sempre presente, ele substitui esse fallback (a Task 3 não pedia manter os dois).

## Deviations from Plan

### Auto-fixed Issues

None — plano executado exatamente como escrito. `IntentActionQueue.swift` foi lido e confirmado íntegro (Task 1 instrução explícita), sem necessidade de correção.

**Total deviations:** 0
**Impact on plan:** Nenhum.

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- O caminho ponta a ponta "toque no stepper de reps → `stepReps()` da store → ContentState republicado → widget renderiza o valor atualizado" está codificado e passa em toda verificação automatizada disponível: `bash scripts/verify-native-skeleton.sh` (checagens a-h, 2 rodadas idempotentes), `npx jest __tests__/liveActivityContentState.test.ts __tests__/liveActivityIntentBridge.test.ts __tests__/liveActivityIntentQueue.test.ts` (62 testes), `npx tsc --noEmit` (limpo), `diff -q` entre as duas cópias de `SessionActivityAttributes.swift` (idênticas). Suíte Jest completa do projeto (167 suites / 1960 testes) também verde após as mudanças.
- REG-02 está completo NO CÓDIGO para os dois campos (reps e carga): hot path (app em foreground, via `liveActivityIntentBridge.ts`) e cold path (`reconcileLiveActivityIntents()` pós force-quit) tratam os cinco kinds de intent sem lacuna.
- **Bloqueio conhecido, não deste plano:** a prova física no aparelho (toque real no Lock Screen sem lag, tamanho de alvo de toque dos dois pares de stepper, opacidade do valor herdado visível) fica para o Plano 17-07, conforme o `success_criteria` original deste plano — "compilou" não é critério de conclusão desta fase.
- Os Planos 17-05 (PRED-01, antecipação da próxima ação) e 17-07 (UAT físico) podem reaproveitar `currentReps`/`isRepsInherited` e o padrão de `case 'adjustReps'`/`case 'adjustLoad'` sem reabrir nenhum contrato.

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: modules/live-activity/ios/AdjustRepsIntent.swift
- FOUND: targets/session-widget/AdjustRepsIntent.swift
- FOUND: .planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-03-SUMMARY.md
- FOUND: aa61719
- FOUND: 4f66e5a
- FOUND: f0eb95d
