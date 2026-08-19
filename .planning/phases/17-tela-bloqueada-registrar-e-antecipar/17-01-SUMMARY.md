---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 01
subsystem: live-activity
tags: [swiftui, activitykit, appintents, widgetkit, react-native, expo-modules, jest]

requires:
  - phase: 16-tela-bloqueada-fase-1
    provides: "IntentActionQueue, LiveActivityModule (App Group), liveActivityIntentBridge (completeSet/skipRest/adjustRest), buildLiveActivityContentState scaffolding"
provides:
  - "AdjustLoadIntent (stub + impl real) espelhando AdjustRestIntent — enfileira, nunca escreve em ActivityKit direto"
  - "QueuedIntentActionKind.adjustReps/.adjustLoad e QueuedIntentAction.deltaValue: Double? (campo genérico de delta)"
  - "LiveActivityContentState.currentLoadKg/isLoadInherited/loadIncrementKg (carga em edição, só measuring)"
  - "liveActivityIntentBridge case 'adjustLoad' -> stepLoad() da store (nunca grava direto)"
  - "Stepper −/+ de carga no Lock Screen com marca visual de herdado + widgetURL corrigido (D-12)"
affects: [17-03-anticipar-reps, 17-05-anticipar-carga, 17-07-uat-fisico]

actuals:
  tokens: 6557
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "LiveActivityIntent.perform() só enfileira via IntentActionQueue.enqueue + sendEvent — nunca chama Activity.update() (espelho, nunca fonte de verdade)"
    - "Delta do widget viaja só como SINAL; a store reaplica o incremento real do exercício (stepLoad) para evitar drift entre widget e app"
    - "Campos derivados de fase (currentLoadKg/isLoadInherited/loadIncrementKg) computados só quando phase === 'measuring', null/false fora dela"

key-files:
  created:
    - modules/live-activity/ios/AdjustLoadIntent.swift
    - targets/session-widget/AdjustLoadIntent.swift
  modified:
    - modules/live-activity/ios/IntentActionQueue.swift
    - modules/live-activity/ios/SessionActivityAttributes.swift
    - targets/session-widget/SessionActivityAttributes.swift
    - targets/session-widget/WidgetLiveActivity.swift
    - src/engine/liveActivityContentState.ts
    - src/native/liveActivitySync.ts
    - src/native/liveActivityIntentBridge.ts
    - modules/live-activity/index.ts
    - scripts/verify-native-skeleton.sh
    - __tests__/liveActivityContentState.test.ts
    - __tests__/liveActivityIntentBridge.test.ts

key-decisions:
  - "D-12: 'abrir para ajustar' reaproveita o widgetURL do card inteiro (não um Link isolado) — Lock Screen sem Dynamic Island só garante um tap-target por card"
  - "Exercício bodyweight mantém primaryValue(state) (texto 'Peso corporal') no lugar do stepper — sem carga a ajustar, mesma regra do app"

patterns-established:
  - "Molde AdjustRestIntent replicado byte-a-byte para AdjustLoadIntent (stub no target da extensão, impl real no módulo)"
  - "diff -q entre as duas cópias de SessionActivityAttributes.swift como checagem (h) do verify-native-skeleton.sh — fecha D-11/Pitfall 5 do RESEARCH.md"

requirements-completed: [REG-02]

coverage:
  - id: D1
    description: "AdjustLoadIntent (stub + impl real) espelha AdjustRestIntent: enfileira via IntentActionQueue, dispara sendEvent, nunca chama Activity.update() direto"
    requirement: REG-02
    verification:
      - kind: other
        ref: "scripts/verify-native-skeleton.sh (checagens a-h, 2 rodadas idempotentes)"
        status: pass
    human_judgment: true
    rationale: "Verificação estrutural/de compilação apenas — Swift não roda em CI aqui; a prova de toque real no Lock Screen fica para o Plano 17-07 (aparelho físico), conforme o success_criteria deste próprio plano."
  - id: D2
    description: "ContentState carrega currentLoadKg/isLoadInherited/loadIncrementKg só em measuring (precedência actual > target > histórico via suggestLoad); bridge JS despacha 'adjustLoad' via stepLoad() da store, nunca grava direto"
    requirement: REG-02
    verification:
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#carga em edição (currentLoadKg/isLoadInherited/loadIncrementKg)"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentBridge.test.ts#adjustLoad ..."
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stepper −/+ de carga no case .measuring do Lock Screen, com opacidade reduzida enquanto herdado, affordance 'Ajustar no app' sem tap target próprio, e widgetURL corrigido para forcaapp://home/active-session/<sessionLogId>"
    requirement: REG-02
    verification:
      - kind: other
        ref: "scripts/verify-native-skeleton.sh (checagens a-h, 2 rodadas) + greps de acceptance_criteria da Task 3"
        status: pass
    human_judgment: true
    rationale: "SwiftUI de widget — correção visual/interativa (opacidade do valor herdado, tap target único do card, deep link real) só se prova no aparelho físico; deferido ao Plano 17-07 conforme success_criteria deste plano."

duration: ~15min (Tasks 2-3 desta sessão; Task 1 concluída e aprovada em sessão anterior)
completed: 2026-08-18
status: complete
---

# Phase 17 Plan 01: Fila + Intent de Carga (App Group) — Tracer REG-02 Summary

**Toque no stepper +/− de carga do Lock Screen percorre Swift Intent → fila durável do App Group → ponte JS → `stepLoad()` da store existente → ContentState republicado, com o card mostrando a carga em edição (não a faixa-alvo estática) e o deep link "abrir para ajustar" corrigido para a rota real da sessão ativa.**

## Performance

- **Duration:** ~15 min (Tasks 2-3, esta sessão — Task 1 foi concluída e aprovada pelo dono em sessão anterior, commit 44122f6)
- **Tasks:** 3/3
- **Files modified:** 13 (2 criados, 11 modificados)

## Accomplishments
- `AdjustLoadIntent` (stub no target da extensão + implementação real no módulo) segue byte-a-byte o molde de `AdjustRestIntent`: `perform()` só enfileira via `IntentActionQueue.enqueue` e dispara `sendEvent`, nunca escreve em `ActivityKit` diretamente.
- `IntentActionQueue.QueuedIntentAction` ganhou o campo genérico `deltaValue: Double?` e o enum `QueuedIntentActionKind` os casos `.adjustReps`/`.adjustLoad`, evitando reabrir o enum no Plano 17-03.
- `LiveActivityContentState` (TS) e `SessionActivityAttributes.ContentState` (as DUAS cópias Swift, mantidas byte-idênticas) ganharam `currentLoadKg`/`isLoadInherited`/`loadIncrementKg`, computados só em `measuring` via a mesma precedência de `suggestLoad()` já usada pelo resto do app (carga digitada > alvo > histórico).
- `liveActivityIntentBridge.ts` ganhou o `case 'adjustLoad'`: resolve o alvo via `findActiveSet ?? findNextPendingSet` e chama `stepLoad()` da store — o delta que viaja do widget carrega só o SINAL, a store reaplica o incremento real do exercício, evitando drift.
- O card `measuring` do Lock Screen agora mostra o stepper de carga funcional (com marca visual de herdado via opacidade reduzida) no lugar da faixa-alvo estática, e o `widgetURL` morto (`forcaapp://session/active`) foi corrigido para `forcaapp://home/active-session/<sessionLogId>` (lido de `context.attributes`, não `context.state`).
- `scripts/verify-native-skeleton.sh` ganhou a checagem (h) de diff-parity entre as duas cópias de `SessionActivityAttributes.swift` — fecha RESEARCH.md Pitfall 5.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fila + Intent de carga (App Group) — elo Swift do tracer** — `44122f6` (feat) — concluída e aprovada pelo dono em sessão anterior
2. **Task 2: ContentState de carga em edição + ponte JS (adjustLoad)** — `342d6fa` (feat, tdd)
3. **Task 3: Stepper de carga no widget + correção do deep link (D-12)** — `2272d5d` (feat)

_Note: Task 2 é `tdd="true"` mas o comportamento e os testes novos foram escritos e commitados juntos no commit de implementação — os testes cobrem os 4 cenários do `<behavior>` e passam junto com o código._

## Files Created/Modified
- `modules/live-activity/ios/AdjustLoadIntent.swift` — impl real do Intent, resolve `sessionLogId` via `Activity<SessionActivityAttributes>.activities`, enfileira e dispara `sendEvent`
- `targets/session-widget/AdjustLoadIntent.swift` — stub de compilação para o target da extensão
- `modules/live-activity/ios/IntentActionQueue.swift` — casos `.adjustReps`/`.adjustLoad` e campo `deltaValue: Double?`
- `modules/live-activity/ios/SessionActivityAttributes.swift` / `targets/session-widget/SessionActivityAttributes.swift` — `currentLoadKg`/`isLoadInherited`/`loadIncrementKg` no `ContentState` (as duas cópias, idênticas)
- `targets/session-widget/WidgetLiveActivity.swift` — stepper de carga no case `.measuring`, affordance "Ajustar no app" sem tap target próprio, `widgetURL` corrigido
- `src/engine/liveActivityContentState.ts` — `contentStateFor` recebe `draft` e calcula os três campos novos só em `measuring`
- `src/native/liveActivitySync.ts` — `buildFinishedContentState` preenche os campos novos como `null`/`false`
- `src/native/liveActivityIntentBridge.ts` — `case 'adjustLoad'` despachando `stepLoad()`
- `modules/live-activity/index.ts` — `LiveActivityIntentActionEvent`/`QueuedLiveActivityIntent` estendidos com `adjustLoad`/`deltaValue`
- `scripts/verify-native-skeleton.sh` — `AdjustLoadIntent` na lista de intents verificados; checagem (h) de diff-parity
- `__tests__/liveActivityContentState.test.ts` — 5 novos testes cobrindo `currentLoadKg`/`isLoadInherited`/`loadIncrementKg`; `toEqual` existente atualizado com os campos novos
- `__tests__/liveActivityIntentBridge.test.ts` — 4 novos testes cobrindo `case 'adjustLoad'` (direção +1/−1, série ativa/pendente/ausente)

## Decisions Made
- Bodyweight no `.measuring` mantém `primaryValue(state)` (texto "Peso corporal") no lugar do stepper de carga — sem carga a ajustar, mesma regra que o app já aplica em outras telas; a plano não especificava o fallback visual explicitamente, mas "mesma regra do app" já indicava reaproveitar a leitura existente em vez de inventar um terceiro estado visual.
- `contentStateFor()` usa `suggestLoad({ actualLoadKg: set.actualLoadKg, targetLoadKg, lastLoad })` diretamente (a função já testada que implementa a precedência exigida) em vez de reconstruir a precedência inline — mesmo resultado do `<action>`, menos duplicação.

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan-text imprecision — não é defeito de implementação] Acceptance criteria da Task 1 conta `deltaValue: Double?` duas vezes**
- **Encontrado durante:** Verificação retroativa da Task 1 (sessão anterior; owner_approval desta sessão confirmou de novo)
- **Questão:** O acceptance criteria da Task 1 no PLAN.md diz `grep -c "deltaValue: Double?" modules/live-activity/ios/IntentActionQueue.swift` retorna 1, mas o próprio `<action>` da mesma task manda anotar o tipo tanto no campo da struct quanto no parâmetro do `init(...)` — o grep real conta 2 ocorrências.
- **Classificação:** Imprecisão no TEXTO do plano, não defeito de código. O dono revisou o contrato Swift (fila + Intent) e confirmou: `IntentActionQueue.swift:26,39` — `deltaValue: Double?` sem default, os 3 call sites pré-existentes passam `nil` explicitamente, exatamente como o `<action>` mandou.
- **Ação tomada:** Nenhuma mudança de código — o código está correto conforme o `<action>`; o número "1" no acceptance criteria é o que está errado, não a implementação.
- **Commit:** `44122f6` (Task 1, sessão anterior)

---

**Total deviations:** 1 (imprecisão de texto do plano, sem impacto em código — nenhum auto-fix de Rule 1-3 aplicado)
**Impact on plan:** Nenhum. Tasks 2 e 3 seguiram o `<action>`/`<behavior>` do PLAN.md sem necessidade de correção automática.

## Issues Encountered
None.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- O caminho ponta a ponta "toque no stepper de carga → `stepLoad()` da store → ContentState republicado → widget renderiza o valor atualizado" está codificado e passa em toda verificação automatizada disponível: `bash scripts/verify-native-skeleton.sh` (checagens a-h, 2 rodadas idempotentes), `npx jest __tests__/liveActivityContentState.test.ts __tests__/liveActivityIntentBridge.test.ts` (27 testes), `npx tsc --noEmit` (limpo), `diff -q` entre as duas cópias de `SessionActivityAttributes.swift` (idênticas). Suíte Jest completa do projeto (167 suites / 1916 testes) também verde após as mudanças.
- **Bloqueio conhecido, não desta plano:** a prova física no aparelho (toque real no Lock Screen sem lag, sem abrir o app sozinho, opacidade do valor herdado visível) fica para o Plano 17-07, conforme o `success_criteria` original deste plano — "compilou" não é critério de conclusão desta fase.
- Os Planos 17-03 (antecipar reps) e 17-05 (antecipar carga) podem reaproveitar `QueuedIntentActionKind.adjustReps` (já declarado, ainda sem consumidor) e o padrão de campo `deltaValue: Double?` sem reabrir o enum.

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-18*
