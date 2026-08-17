---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 02
subsystem: ui
tags: [activitykit, live-activity, widgetkit, swiftui, dynamic-island, restEndsAt]

# Dependency graph
requires:
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    provides: Live Activity bridge, structured ContentState, restEndsAt absolute timestamp, and Swift renderer scaffold from Plan 15-01
provides:
  - Metric-scoped block position derivation for cardio/alongamento labels
  - Complete four-phase Live Activity ContentState derivation
  - Real Lock Screen and Dynamic Island content with capped overtime rendering
affects: [15-03, 15-05, 15-06, 16-comandos-na-tela-bloqueada, 17-registro-sem-teclado]

# Actuals (#2632)
actuals:
  tokens: 2555
  tasks: 2
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Metric-aware block positioning through the existing pure session-flow helpers"
    - "Swift-side manual overtime formatting with a fixed +59:59 upper bound"

key-files:
  created: []
  modified:
    - src/engine/sessionFlow.ts
    - src/engine/liveActivityContentState.ts
    - targets/session-widget/WidgetLiveActivity.swift
    - __tests__/liveActivityContentState.test.ts
    - __tests__/sessionFlow.test.ts

key-decisions:
  - "Alongamento/Cardio position counts only exercises with the exact same time metric; carga_reps exercises never enter the block denominator."
  - "The active exercise wins over the next pending exercise when deriving the current ContentState, while a valid rest timestamp remains the source for resting/readyOvertime."
  - "Overtime is formatted manually as +m:ss and clamped to 3599 seconds so the Micro region never expands into an h:mm:ss layout."

patterns-established:
  - "Time-based exercises route directly to blockOnly before rest/measuring phase selection."
  - "Compact Dynamic Island keeps numeric mm:ss or X/Y content; minimal keeps the approved SF Symbol state glyph."

requirements-completed: [LOCK-01]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "posicaoNoBlocoDeMetrica reports 1-based position within the matching metric block and excludes strength exercises."
    requirement: LOCK-01
    verification:
      - kind: unit
        ref: "__tests__/sessionFlow.test.ts#posição no treino > conta a posição apenas dentro do bloco da mesma métrica"
        status: pass
    human_judgment: false
  - id: D2
    description: "buildLiveActivityContentState emits measuring, resting, readyOvertime, or blockOnly from SessionDraft without inventing prescription data."
    requirement: LOCK-01
    verification:
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#buildLiveActivityContentState"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D3
    description: "WidgetLiveActivity.swift renders phase-specific Lock Screen and Dynamic Island regions, including compact/minimal fallbacks and capped overtime."
    requirement: LOCK-01
    verification:
      - kind: integration
        ref: "npm run verify:native"
        status: pass
      - kind: integration
        ref: "xcodebuild -workspace ios/ForcaApp.xcworkspace -scheme session-widget -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build"
        status: pass
      - kind: integration
        ref: "xcodebuild -workspace ios/ForcaApp.xcworkspace -scheme LiveActivityModule -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build"
        status: pass
    human_judgment: false
  - id: D4
    description: "Physical Lock Screen and Dynamic Island legibility and visual fidelity across all four presentations."
    requirement: LOCK-01
    verification: []
    human_judgment: true
    rationale: "Live Activity rendering, compact width, Always-On behavior, and Dynamic Island region collapse require the owner's iPhone; no physical-device UAT was fabricated. The planned device session remains in Plan 15-05."

# Metrics
duration: 10min
completed: 2026-08-17
status: complete
---

# Phase 15 Plan 02: Conteúdo completo da Live Activity — Summary

**Derivação de `blockOnly`/`readyOvertime` e card SwiftUI completo, com posição por métrica e overtime limitado a `+59:59` para preservar o layout.**

## Performance

- **Duration:** aproximadamente 10 min; medido da primeira confirmação de tarefa à verificação final
- **Started:** 2026-08-17T12:39:45Z (primeiro commit da tarefa; o timestamp de início do executor não foi capturado)
- **Completed:** 2026-08-17
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Adicionada `posicaoNoBlocoDeMetrica`, que preserva a semântica `Alongamento 2/6` dentro do conjunto de exercícios em jogo com a mesma métrica de tempo.
- Estendido `buildLiveActivityContentState` para derivar `blockOnly` antes de qualquer ramo de descanso/medição e para propagar `readyOvertime` quando `now >= restEndsAt`, mantendo o timestamp absoluto no contrato.
- Completo o conteúdo real do widget para Lock Screen, Dynamic Island expandido, compacto e mínimo; o overtime usa `+m:ss` manual, monoespaçado e limitado em `+59:59`, sem URL placeholder.

## Task Commits

Cada tarefa foi commitada de forma atômica:

1. **Task 1 RED: cobertura de posições, blockOnly e readyOvertime** — `84eec02` (`test`)
2. **Task 1 GREEN: derivação de fase e posição por métrica** — `0ca145c` (`feat`)
3. **Task 2: conteúdo das apresentações e clamp de overtime** — `5010fcc` (`feat`)

**Plan metadata:** commit criado após as atualizações GSD.

## Files Created/Modified

- `src/engine/sessionFlow.ts` — exporta a posição 1-based dentro do bloco da mesma métrica.
- `src/engine/liveActivityContentState.ts` — seleciona o exercício corrente e emite as quatro fases do ContentState.
- `targets/session-widget/WidgetLiveActivity.swift` — formata overtime com teto fixo e mantém as quatro apresentações com conteúdo por fase.
- `__tests__/liveActivityContentState.test.ts` — cobre `tempo`, `tempo_distancia`, descanso, igualdade no zero, overtime e bloco misto.
- `__tests__/sessionFlow.test.ts` — cobre posição por métrica e exclusão de musculação do denominador.

## Decisions Made

- A posição do bloco usa igualdade exata da métrica efetiva (`tempo` ou `tempo_distancia`), sem misturar cardio/isometria com modalidades de distância nem com `carga_reps`.
- `restEndsAt` continua como timestamp absoluto; o JS apenas deriva a fase e o Swift calcula a apresentação do relógio, sem tick JS adicional.
- O card mínimo usa SF Symbol conforme D-02/E10, enquanto o compacto mantém `mm:ss` durante descanso e `X/Y` nas outras fases.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Todas as verificações automatizadas passaram. A validação visual no iPhone físico não foi executada nem declarada como concluída; ela permanece explicitamente para o roteiro físico do Plan 15-05.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- O Plan 15-03 pode fechar o ciclo de vida da Activity sem alterar o contrato de conteúdo.
- O Plan 15-05 pode executar as sessões físicas de Lock Screen/Dynamic Island com as quatro fases já derivadas e renderizadas.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Plan: 02*
*Completed: 2026-08-17*

## Self-Check: PASSED

- `15-02-SUMMARY.md` exists at the canonical phase path.
- Task commits `84eec02`, `0ca145c`, and `5010fcc` exist in git history.
- Only the five files declared by the plan were changed by implementation commits; the pre-existing untracked `14-PATTERNS.md` was left untouched.
