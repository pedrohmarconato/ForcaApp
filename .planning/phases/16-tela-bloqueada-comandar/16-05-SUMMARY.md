---
phase: 16-tela-bloqueada-comandar
plan: 05
subsystem: live-activity
tags: [swift, app-intents, expo-modules, userdefaults, jest, tdd]

# Dependency graph
requires:
  - phase: 16-tela-bloqueada-comandar (Plano 16-01)
    provides: "IntentActionQueue durável (enqueue/drainAll), os 3 LiveActivityIntents, liveActivityIntentBridge.ts com handleIntentAction"
provides:
  - "QueuedIntentAction.id (UUID, default no init) + IntentActionQueue.remove(ids:) — remoção seletiva não-destrutiva"
  - "AsyncFunction(\"ackIntentAction\") — remove a entrada da fila durável quando a entrega in-process teve sucesso"
  - "handleIntentAction chamando ackQueuedLiveActivityIntent(event.id) só dentro do bloco onde a ação foi de fato despachada"
  - "Os 3 LiveActivityIntents gerando actionId por toque e propagando idêntico ao enqueue e ao sendEvent"
affects: ["16-06 (UAT física de re-execução)", "Fase 17 (REG-02, mesmo canal onIntentAction/QueuedIntentAction)"]

# Actuals (#2632)
actuals:
  tokens: 4110
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "id estável (UUID) gerado uma vez em perform(), propagado ao mesmo tempo para o enqueue durável e para o payload do evento in-process — nenhum identificador paralelo inventado no lado JS"
    - "Ack seletivo (remove(ids:)) só dentro do bloco onde o alvo foi resolvido — nunca antes do guard de draft, nunca quando nenhum alvo foi encontrado"

key-files:
  created: []
  modified:
    - modules/live-activity/ios/IntentActionQueue.swift
    - modules/live-activity/ios/LiveActivityModule.swift
    - modules/live-activity/ios/CompleteSetIntent.swift
    - modules/live-activity/ios/SkipRestIntent.swift
    - modules/live-activity/ios/AdjustRestIntent.swift
    - modules/live-activity/index.ts
    - src/native/liveActivityIntentBridge.ts
    - __mocks__/modules-live-activity.ts
    - __tests__/liveActivityIntentBridge.test.ts

key-decisions:
  - "id como parâmetro trailing com default (UUID().uuidString) no init de QueuedIntentAction — nenhum call site existente precisou mudar"
  - "ack chamado DENTRO dos blocos if(alvo)/if(proxima) para completeSet/skipRest (nunca fora) — adjustRest sempre, pois não tem guarda de alvo (mesmo desenho do CR-02 de 16-REVIEW.md)"

patterns-established:
  - "Confirmação explícita de entrega (ack) por id estável, em vez de drenagem destrutiva de tiro único — mesmo padrão que a Plano 16-04 aplica ao lado da reconciliação de cold-launch"

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: D1
    description: "Entrega in-process bem-sucedida (completeSet/skipRest/adjustRest) confirma via ackQueuedLiveActivityIntent(event.id) apenas quando a ação foi de fato despachada contra um alvo resolvido; entrega guardada (sem alvo, sem draft) nunca confirma"
    requirement: "CMD-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentBridge.test.ts (8 casos: 6 atualizados com id+ack, 2 novos de 'sem alvo -> sem ack')"
        status: pass
    human_judgment: false
  - id: D2
    description: "Os 3 LiveActivityIntents (CompleteSetIntent/SkipRestIntent/AdjustRestIntent) geram um actionId (UUID) por toque e o propagam idêntico ao enqueue durável e ao payload do sendEvent in-process, compilando nos dois targets"
    requirement: "CMD-01"
    verification:
      - kind: unit
        ref: "npm run verify:native (prebuild --clean + pod install reais, 2 rodadas consecutivas)"
        status: pass
      - kind: integration
        ref: "npm test — 167/167 suites, 1877/1877 testes, sem regressão"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 05: id estável + ackIntentAction confirmam entrega in-process Summary

**Cada `QueuedIntentAction` ganha um `id` (UUID) que viaja idêntico do `perform()` Swift até o payload `onIntentAction`, e `liveActivityIntentBridge.ts` confirma a remoção seletiva da fila durável (`ackIntentAction`) só quando a ação foi de fato despachada contra um alvo resolvido — fecha 16-VERIFICATION.md gap 2 / 16-REVIEW.md CR-02.**

## Performance

- **Duration:** ~5min
- **Started:** 2026-08-18T10:21:40Z
- **Completed:** 2026-08-18T10:26:35Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- `QueuedIntentAction`/`QueuedIntentActionRecord` ganham `id: String` (default `UUID().uuidString`) — nenhum call site pré-existente precisou mudar (parâmetro trailing com default).
- `IntentActionQueue.remove(ids:)` — remoção seletiva não-destrutiva, reaproveitando os mesmos `readAll`/`writeAll` privados já existentes.
- `AsyncFunction("ackIntentAction")` no `LiveActivityModule.swift`, exposto ao TS como `ackQueuedLiveActivityIntent(id)`.
- `liveActivityIntentBridge.ts::handleIntentAction` chama `ackQueuedLiveActivityIntent(event.id)` **dentro** de cada bloco onde a ação foi de fato despachada (`if (alvo)`/`if (proxima)` para completeSet/skipRest; sempre para adjustRest, que não tem guarda de alvo) — nunca antes do guard `if (!draft) return`, nunca quando nenhum alvo foi encontrado.
- Os três `LiveActivityIntent`s (`CompleteSetIntent`/`SkipRestIntent`/`AdjustRestIntent`) geram `let actionId = UUID().uuidString` uma vez por `perform()` e o propagam idêntico ao `enqueue(...)` durável e ao `sendEvent("onIntentAction", [...])` in-process.
- Suíte de teste TDD (RED→GREEN): 8 casos em `liveActivityIntentBridge.test.ts` (6 atualizados + 2 novos cobrindo "sem alvo → sem ack").

## Task Commits

Cada task foi comitada atomicamente:

1. **Task 1 (RED):** adiciona asserções de ack em `liveActivityIntentBridge.test.ts` — `7c3d69b` (test)
2. **Task 1 (GREEN):** id estável + `ackIntentAction` + `liveActivityIntentBridge.ts` confirmando cada ação aplicada — `f64c33e` (feat)
3. **Task 2:** os 3 `LiveActivityIntents` geram e propagam o `actionId` — `a648eee` (feat)

**Plan metadata:** (este commit — `docs(16-05): complete plan`)

_Nota: Task 1 é `tracer` + `tdd="true"` — dois commits (test → feat). Task 2 é `auto` — um commit._

## Files Created/Modified

- `modules/live-activity/ios/IntentActionQueue.swift` - `QueuedIntentAction.id` (UUID) + `IntentActionQueue.remove(ids:)`
- `modules/live-activity/ios/LiveActivityModule.swift` - `QueuedIntentActionRecord.id` + `AsyncFunction("ackIntentAction")`
- `modules/live-activity/ios/CompleteSetIntent.swift` - `let actionId = UUID().uuidString`, propagado ao enqueue e ao sendEvent
- `modules/live-activity/ios/SkipRestIntent.swift` - mesmo padrão
- `modules/live-activity/ios/AdjustRestIntent.swift` - mesmo padrão
- `modules/live-activity/index.ts` - `id: string` em `LiveActivityIntentActionEvent`/`QueuedLiveActivityIntent`; `ackIntentAction`/`ackQueuedLiveActivityIntent`
- `src/native/liveActivityIntentBridge.ts` - `handleIntentAction` chama `ackQueuedLiveActivityIntent(event.id)` após cada despacho bem-sucedido
- `__mocks__/modules-live-activity.ts` - export mockado `ackQueuedLiveActivityIntent`
- `__tests__/liveActivityIntentBridge.test.ts` - 8 casos (6 atualizados + 2 novos) cobrindo ack/dedup

## Decisions Made

- `id` como parâmetro trailing com default (`UUID().uuidString`) no `init` de `QueuedIntentAction` — preserva os call sites `kind:deltaSeconds:sessionLogId:queuedAt:` já existentes sem quebra.
- Ack chamado estritamente dentro dos blocos `if (alvo)`/`if (proxima)` (completeSet/skipRest) e incondicionalmente só para `adjustRest` (sem guarda de alvo) — replica exatamente o desenho proposto em `16-REVIEW.md` CR-02 opção 1, evitando ack prematuro (T-16-05-02 do threat register desta plano).

## Deviations from Plan

None - plan executado exatamente como escrito. O gate de feedback da tracer (Task 1) foi confirmado end-to-end (`npx tsc --noEmit && npx jest __tests__/liveActivityIntentBridge.test.ts`, 8/8 verde) antes de expandir para a Task 2, conforme protocolo de execução para plano `autonomous: true`.

## Issues Encountered

None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- Gap 2 de `16-VERIFICATION.md` (truth #8, "nenhum caminho de gravação paralelo/duplicado") tem agora o mecanismo de id+ack implementado e provado por teste automatizado (`liveActivityIntentBridge.test.ts`) e por compilação Swift real (`verify:native`), sem regressão na suíte completa (167/167, 1877/1877).
- **Confirmação física pendente:** o comportamento real de ponta a ponta (toque com app vivo → ack → force-quit posterior → reabrir → nenhuma duplicação) só é confirmável no aparelho físico — isso é explicitamente o escopo da Plano 16-06 (UAT física de re-execução), não desta plano. `16-05-PLAN.md` já documenta essa fronteira na seção `<verification>`.
- Prohibitions T-16-05-01/T-16-05-02 do threat register desta plano permanecem `status: flagged-unverified` até a UAT física da Plano 16-06 confirmar o comportamento observável no dispositivo.
- Esta plano é independente da Plano 16-04 (mesma wave, nenhum arquivo em comum) — nenhum conflito de merge esperado.

## Self-Check: PASSED

- FOUND: `.planning/phases/16-tela-bloqueada-comandar/16-05-SUMMARY.md`
- FOUND: `7c3d69b` (test — RED)
- FOUND: `f64c33e` (feat — GREEN, Task 1)
- FOUND: `a648eee` (feat, Task 2)
- FOUND: `80796c4` (docs — plan metadata)

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-18*
