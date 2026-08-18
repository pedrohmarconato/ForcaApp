---
phase: 16-tela-bloqueada-comandar
plan: 07
subsystem: live-activity-command
tags: [swift, expo-modules, zustand, app-group, jest, tdd]

# Dependency graph
requires:
  - phase: 16-tela-bloqueada-comandar
    provides: "16-01/16-02: fila durável IntentActionQueue (App Group) + drenagem de cold-launch; 16-05: id estável por entrada + ackIntentAction/remove(ids:) seletivo"
provides:
  - "IntentActionQueue.peekAll() — leitura não-destrutiva da fila do App Group"
  - "LiveActivityModule AsyncFunction(\"peekIntentQueue\") — substitui drainIntentQueue, removido"
  - "modules/live-activity peekQueuedLiveActivityIntents — substitui drainQueuedLiveActivityIntents, removido"
  - "activeSessionStore.reconcileLiveActivityIntents() reescrita: peek não-destrutivo + ack seletivo condicionado ao resultado real de completeSet()/à guarda de CAS"
  - "2 testes automatizados que exercitam completeSet() REAL (sem mock de ação), reproduzindo o cenário exato do UAT físico force_quit_toque=FAIL"
affects: ["16-08 (D2)", "16-09 (UAT física de re-execução)"]

# Actuals (#2632)
actuals:
  tokens: 7150
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Leitura não-destrutiva (peek) + confirmação seletiva (ack) condicionada ao resultado real da aplicação, em vez de leitura-e-remoção-na-mesma-chamada (drain) — evita perder uma entrada que a validação reprovou"
    - "Teste com ações REAIS da store (withRealActions, oposto de withMockedActions) para exercitar validação de negócio de verdade em vez de mockar a gravação"

key-files:
  created: []
  modified:
    - modules/live-activity/ios/IntentActionQueue.swift
    - modules/live-activity/ios/LiveActivityModule.swift
    - modules/live-activity/index.ts
    - __mocks__/modules-live-activity.ts
    - src/store/activeSessionStore.ts
    - __tests__/liveActivityIntentQueue.test.ts
    - __tests__/activeSessionStore.test.ts

key-decisions:
  - "Entrada descartada por CAS (draft ausente/inativo, sessionLogId nulo/divergente) confirma o ack imediatamente — ela nunca vai se tornar aplicável tentando de novo, então não deve acumular na fila (cap de 20 entradas)"
  - "Entrada reprovada por canCompleteSet() (dentro de completeSet()) NUNCA é acked — é a única variante que sobrevive na fila, porque pode se tornar aplicável assim que o dono informar reps/carga"
  - "skipRest/adjustRest continuam ackados incondicionalmente após aplicar — não há estado de 'validação reprovada' equivalente para esses dois kinds"

patterns-established:
  - "peek não-destrutivo + ack condicionado é o único primitivo de leitura restante para a fila do App Group — drainAll()/drainIntentQueue()/drainQueuedLiveActivityIntents() foram removidos do código, não deixados como caminho morto alcançável"

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: D1
    description: "reconcileLiveActivityIntents() lê a fila do App Group de forma NÃO-destrutiva (peekAll/peekIntentQueue/peekQueuedLiveActivityIntents) — drainAll/drainIntentQueue/drainQueuedLiveActivityIntents removidos do código (Swift + TS + mock)"
    requirement: CMD-01
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts (9 casos)"
        status: pass
      - kind: other
        ref: "grep -rc drainAll|drainIntentQueue|drainQueuedLiveActivityIntents nos 5 arquivos tocados"
        status: pass
    human_judgment: false
  - id: D2
    description: "Entrada 'completeSet' cuja série alvo reprova canCompleteSet() (reps/carga ausentes) NÃO é confirmada — sobrevive na fila para a próxima reconciliação"
    requirement: CMD-01
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#D1: completeSet reprovado por validação real (reps/carga ausentes) NÃO confirma o ack"
        status: pass
    human_judgment: true
    rationale: "O comportamento físico real (force-quit -> toque sem reps/carga -> reabrir -> a entrada não foi perdida) só é confirmável na Plano 16-09 (UAT física de re-execução), depois de 16-08 (D2) também estar mergeada — o teste unitário prova o mecanismo, não substitui o UAT físico."
  - id: D3
    description: "Entrada efetivamente aplicada (completeSet() true, ou skipRest/adjustRest despachados, ou descartada por CAS) confirma o ack e é removida — nunca reaplicada por reconciliação futura"
    requirement: CMD-02
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts (7 casos existentes atualizados + D1 sucesso)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Swift dos dois arquivos alterados (IntentActionQueue.swift, LiveActivityModule.swift) compila de verdade via prebuild real; suíte completa (167 suítes/1882 testes) permanece verde, zero regressão"
    verification:
      - kind: other
        ref: "npm run verify:native (exit 0)"
        status: pass
      - kind: unit
        ref: "npm test (167 suítes, 1882 testes)"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 07: Peek não-destrutivo + ack condicionado ao resultado real Summary

**`reconcileLiveActivityIntents()` deixou de destruir a fila do App Group na leitura (drain) e passou a confirmar cada entrada individualmente só depois de saber o resultado real da aplicação — fechando o bug que perdia o toque na tela bloqueada quando a série reprovava validação (reps/carga ausentes).**

## Performance

- **Duration:** ~35min
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- `drainAll()`/`drainIntentQueue()`/`drainQueuedLiveActivityIntents()` removidos por completo do código (Swift, TS, mock) — `peekAll()`/`peekIntentQueue()`/`peekQueuedLiveActivityIntents()` são o único primitivo de leitura restante, estruturalmente impossível reintroduzir o bug sem escrever código novo
- `reconcileLiveActivityIntents()` reescrita: peek não-destrutivo + `ackQueuedLiveActivityIntent(entry.id)` chamado condicionalmente — só quando `completeSet()` retorna `true` (ou não havia alvo), sempre para `skipRest`/`adjustRest`, e sempre para descarte definitivo por CAS
- Dois testes automatizados novos exercitam `completeSet()` REAL (sem mock de ação, via helper `withRealActions`) e provam: (a) uma entrada reprovada por `canCompleteSet()` sobrevive na fila sem ack; (b) uma entrada aplicada com sucesso confirma o ack — fecha o Warning de cobertura de teste WR-01 (16-REVIEW.md), que apontava a suíte 100% verde compatível com o aparelho falhando de verdade
- `npm run verify:native` (prebuild --clean real + pod install) e `npm test` (167 suítes, 1882 testes) verdes, sem regressão

## Task Commits

Each task was committed atomically:

1. **Task 1: Peek não-destrutivo + ack condicionado ao resultado real (Swift + TS + testes)** - `4e0a163` (feat)
2. **Task 2: Compilação Swift real + regressão completa** - sem commit (verificação pura, nenhuma mudança de código — `npm run verify:native` e `npm test` passaram sem exigir correção)

**Plan metadata:** (este arquivo, commit de metadados a seguir)

## Files Created/Modified
- `modules/live-activity/ios/IntentActionQueue.swift` - `drainAll()` removido; `peekAll()` (leitura não-destrutiva) adicionado
- `modules/live-activity/ios/LiveActivityModule.swift` - `AsyncFunction("drainIntentQueue")` renomeado para `AsyncFunction("peekIntentQueue")`
- `modules/live-activity/index.ts` - `drainQueuedLiveActivityIntents` removido, `peekQueuedLiveActivityIntents` adicionado
- `__mocks__/modules-live-activity.ts` - export mockado renomeado para `peekQueuedLiveActivityIntents`
- `src/store/activeSessionStore.ts` - `reconcileLiveActivityIntents()` reescrita com peek + ack condicionado
- `__tests__/liveActivityIntentQueue.test.ts` - 7 casos existentes atualizados (peek + asserções de ack) + 2 novos testes D1 com `completeSet()` real
- `__tests__/activeSessionStore.test.ts` - import/uso renomeado para `peekQueuedLiveActivityIntents`

## Decisions Made
- Entrada descartada por CAS confirma o ack imediatamente (nunca vai se tornar aplicável tentando de novo) — mudança de comportamento em relação a 16-05/16-06, onde essas entradas simplesmente eram perdidas junto com a fila inteira no `drainAll()`
- Entrada reprovada por `canCompleteSet()` é a ÚNICA variante que nunca é acked — fica na fila até o dono informar reps/carga e uma reconciliação futura conseguir aplicá-la
- `skipRest`/`adjustRest` continuam sendo ackados incondicionalmente após aplicar, mesma semântica que o caminho quente (`liveActivityIntentBridge.ts`) já usa hoje — não há "reprovação de validação" equivalente para esses dois kinds

## Deviations from Plan

None - plan executado exatamente como escrito. As duas partes G-H de renomeação em `__tests__/activeSessionStore.test.ts` foram aplicadas conforme especificado (import + as duas referências no teste "startOrResume() chama reconcileLiveActivityIntents()...").

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- D1 (16-VERIFICATION.md gap 1) fechado no nível de mecanismo/teste unitário. O comportamento físico real (force-quit -> toque sem reps/carga -> reabrir -> a entrada NÃO foi perdida, o app pede reps/carga -> informa -> conclui) só é confirmável na Plano 16-09 (UAT física de re-execução), depois de 16-08 (D2) também estar mergeada — D2 é o pré-requisito complementar para que a série tenha reps/carga a validar quando este mecanismo reconciliar.
- Nenhum bloqueio identificado para 16-08.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-18*
