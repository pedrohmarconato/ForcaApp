---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 01
subsystem: ui
tags: [activitykit, live-activity, widgetkit, swiftui, expo-modules, zustand, restEndsAt]

# Dependency graph
requires:
  - phase: 14-funda-o-nativa
    provides: CNG-safe session-widget target, local NativeInfoModule pattern, and iOS native verification script
provides:
  - Local Expo LiveActivityModule bridge with ActivityKit lifecycle primitives
  - Real SwiftUI Live Activity card for measuring/resting states and native timer rendering
  - ISO-8601 UTC restEndsAt source of truth in SessionDraft and active-session mutations
  - Sole JS store subscriber that publishes initial and changed Live Activity content
affects: [15-02, 15-03, 16-comandos-na-tela-bloqueada, 17-registro-sem-teclado]

# Actuals (#2632)
actuals:
  tokens: 15632
  tasks: 1
  commits: 2

# Tech tracking
tech-stack:
  added: [ActivityKit, WidgetKit, local Expo Modules API bridge]
  patterns: [absolute ISO-8601 rest timestamp, native Text(timerInterval:), Zustand sole-writer subscription, duplicated ActivityKit contract across app and widget targets]

key-files:
  created:
    - modules/live-activity/ios/LiveActivityModule.swift
    - modules/live-activity/ios/SessionActivityAttributes.swift
    - targets/session-widget/SessionActivityAttributes.swift
    - targets/session-widget/WidgetLiveActivity.swift
    - src/engine/liveActivityContentState.ts
    - src/native/liveActivitySync.ts
    - __tests__/sessionSummary.test.ts
    - __tests__/liveActivityContentState.test.ts
    - __tests__/liveActivitySync.test.ts
  modified:
    - app.json
    - scripts/verify-native-skeleton.sh
    - src/engine/sessionModel.ts
    - src/engine/sessionSummary.ts
    - src/store/activeSessionStore.ts
    - src/components/session/SessionPlayer.tsx
    - App.tsx
    - __tests__/activeSessionStore.test.ts
    - __tests__/sessionPlayerTransitions.test.tsx

key-decisions:
  - "ContentState usa campos estruturados e numericos, preservando a futura necessidade de reps/carga da Fase 17; o timestamp cru continua ISO-8601 UTC até a ponte Swift."
  - "O timer nativo usa Text(timerInterval:) e o app mantém apenas um intervalo cosmético de repaint; nenhum tick JS atualiza ActivityKit."
  - "A classe Swift do módulo declara disponibilidade iOS 16.2, enquanto o podspec conserva o molde 15.1; isso permite compilar o módulo em CNG e mantém a exigência real do ActivityContent."

patterns-established:
  - "SessionDraft.restEndsAt é a fonte única do descanso: completeSet calcula, activateSet limpa e adjustRest ajusta sem await."
  - "liveActivitySync.ts é o único escritor JS→ActivityKit e só reage a transições/mudanças de referência do store."
  - "SessionActivityAttributes.swift permanece byte-identical entre o módulo Expo e a extensão widget."

requirements-completed: [LOCK-01, LOCK-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "ContentState puro deriva exercício, série, prescrição e restEndsAt para measuring/resting sem emitir timer em measuring."
    requirement: LOCK-01
    verification:
      - kind: unit
        ref: "__tests__/liveActivityContentState.test.ts#buildLiveActivityContentState"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Descanso persistido como timestamp UTC, ajustável sem passado e sem avanço automático após expirar."
    requirement: LOCK-02
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#restEndsAt"
        status: pass
      - kind: unit
        ref: "__tests__/sessionSummary.test.ts#ajustarRestEndsAt"
        status: pass
      - kind: automated_ui
        ref: "__tests__/sessionPlayerTransitions.test.tsx#descanso ZERA (timer) → permanece em Pronto até ação explícita"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bridge local Expo compila com ActivityKit e expõe start/update/end/reconcile sem lançar falhas nativas pela ponte."
    requirement: LOCK-01
    verification:
      - kind: integration
        ref: "xcodebuild -workspace ios/ForcaApp.xcworkspace -scheme LiveActivityModule -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#initLiveActivitySync"
        status: pass
    human_judgment: false
  - id: D4
    description: "Widget ActivityConfiguration real substitui o scaffold Hello-emoji e cobre Lock Screen, compact, minimal e expanded."
    requirement: LOCK-01
    verification:
      - kind: integration
        ref: "xcodebuild -workspace ios/ForcaApp.xcworkspace -scheme session-widget -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build"
        status: pass
      - kind: other
        ref: "npm run verify:native"
        status: pass
    human_judgment: true
    rationale: "A contagem real na tela bloqueada/Dynamic Island e o primeiro frame visual exigem iPhone físico; nenhuma UAT física foi executada ou fabricada nesta continuação."

duration: ~45min
completed: 2026-08-17
status: complete
---

# Phase 15 Plan 01: Live Activity real de ponta a ponta — Summary

**Live Activity somente leitura com bridge ActivityKit local, card SwiftUI real e descanso absoluto via `restEndsAt` compartilhado entre app e widget.**

## Performance

- **Duration:** aproximadamente 45 min
- **Started:** início desta continuação não foi carimbado pelo executor
- **Completed:** 2026-08-17T02:52:32Z
- **Tasks:** 1
- **Files modified:** 26

## Accomplishments

- Criado `modules/live-activity/` com contrato `SessionActivityAttributes`, `Record` tipado, `startActivity`, `updateActivity`, `endActivity`, `isActivityRunning` e `reconcileOrphans`; `NSSupportsLiveActivities` foi declarado no app principal.
- Substituído o scaffold de emoji por `ActivityConfiguration` com layouts measuring/resting, quatro apresentações do Dynamic Island, `Text(timerInterval:)`, tipografia monospaced e chrome Força escuro/neon.
- Movido o descanso para `SessionDraft.restEndsAt`: `completeSet` grava ISO UTC, `activateSet` limpa o timestamp, `adjustRest` aplica o piso de 1 segundo e `SessionPlayer` nunca ativa a próxima série quando o relógio chega a zero.
- Adicionado `liveActivitySync.ts` como escritor único JS→ActivityKit, montado no root do `App.tsx`, com cobertura de store/content state/ponte.
- `npx tsc --noEmit`, 164 suítes Jest (1831 testes), `npm run verify:native` e builds Xcode do módulo/widget passaram.

## Task Commits

1. **Task 1 RED: testes de Live Activity e timestamp** — `9326977` (`test`)
2. **Task 1 GREEN: fundação nativa e refactor do descanso** — `228c913` (`feat`)

**Plan metadata:** commit final de documentação/estado será criado após as atualizações GSD.

## Files Created/Modified

- `modules/live-activity/` — módulo Expo local e contrato ActivityKit duplicado no target principal.
- `targets/session-widget/WidgetLiveActivity.swift` — card nativo com timer do sistema e Dynamic Island.
- `src/engine/liveActivityContentState.ts` — derivação pura dos campos mínimos do card.
- `src/engine/sessionModel.ts` — `SetRef`, localização de série e `SessionDraft.restEndsAt`.
- `src/store/activeSessionStore.ts` — cálculo, limpeza e ajuste do timestamp do descanso.
- `src/components/session/SessionPlayer.tsx` — relógio derivado do timestamp, repaint cosmético e sem auto-avanço.
- `src/native/liveActivitySync.ts` e `App.tsx` — assinatura root-mounted e publicação nativa.
- `scripts/verify-native-skeleton.sh` — autolinking e Podfile.lock passaram a exigir `LiveActivityModule`.
- `__tests__/` — testes novos e atualização dos fixtures/transição para a semântica D-09/D-10.

## Decisions Made

- Não foi adicionada dependência npm: o módulo é código local e o workspace/autolinking já o inclui.
- O contrato Swift foi mantido em dois arquivos idênticos, conforme a separação real de targets; a sincronização automatizada dos arquivos permanece fora deste plano.
- `readyOvertime` e `blockOnly` já fazem parte da união/renderer Swift, mas não são emitidos pelo builder JS desta tracer; a expansão é responsabilidade do Plano 15-02.
- As funções nativas de encerramento/reconciliação estão prontas, sem chamador JS nesta task, conforme o plano; o ciclo de vida completo será fechado no Plano 15-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Blocking native compile] Corrigida disponibilidade e inicialização do Record Swift**
- **Found during:** Task 1, build adicional do `LiveActivityModule`.
- **Issue:** O primeiro build revelou que `Record` exigia `init()` público e que `ActivityContent`/`Activity.request` exigiam iOS 16.2, embora o podspec do molde compile em 15.1.
- **Fix:** Adicionado `public init() {}` ao record e `@available(iOS 16.2, *)` ao módulo, conservando o podspec 15.1 e as guardas nativas.
- **Files modified:** `modules/live-activity/ios/LiveActivityModule.swift`.
- **Verification:** build do scheme `LiveActivityModule` passou.
- **Committed in:** `228c913`.

**2. [Rule 3 - Blocking typecheck] Atualizados fixtures tipados após tornar `restEndsAt` obrigatório**
- **Found during:** Task 1, `npx tsc --noEmit`.
- **Issue:** Cinco builders de `SessionDraft` existentes não declaravam o novo campo obrigatório.
- **Fix:** Todos passaram a declarar `restEndsAt: null`; nenhum comportamento fora do contrato foi alterado.
- **Files modified:** `__tests__/direcao03-fase3-sessao.test.tsx`, `__tests__/intraSessionAdaptation.test.ts`, `__tests__/sessionPlayerCleanup.test.tsx`, `__tests__/sessionPlayerTransitions.test.tsx`, `__tests__/weeklyReplanner.test.ts`.
- **Verification:** `npx tsc --noEmit` e suíte completa passaram.
- **Committed in:** `228c913`.

**3. [Rule 1 - Behavior contract] Atualizado teste legado que esperava o auto-avanço removido**
- **Found during:** Task 1, suíte de transições do player.
- **Issue:** O teste anterior codificava a semântica antiga, na qual o timer zerado ativava a próxima série.
- **Fix:** O teste agora comprova que o card permanece em descanso/overtime e só avança após `Pular descanso`.
- **Files modified:** `__tests__/sessionPlayerTransitions.test.tsx`.
- **Verification:** a suíte de transições passou e o caso D-09/D-10 ficou explícito.
- **Committed in:** `228c913`.

**4. [Rule 3 - Blocking test isolation] Isolado o teste do subscriber nativo do cliente Supabase**
- **Found during:** Task 1, primeira execução de `liveActivitySync.test.ts`.
- **Issue:** Importar o store real no teste do subscriber carregava `supabaseClient.js` sem variáveis de ambiente.
- **Fix:** O teste usa um store Zustand mínimo mockado; a lógica do subscriber e do builder continuam reais.
- **Files modified:** `__tests__/liveActivitySync.test.ts`.
- **Verification:** `liveActivitySync.test.ts` passou; a suíte completa também passou.
- **Committed in:** `228c913`.

---

**Total deviations:** 4 auto-fixed (Rule 1: 2; Rule 3: 2).
**Impact on plan:** Todas foram correções diretamente causadas pela nova fundação e necessárias para compilação, sem expansão funcional para fora do tracer.

## Known Stubs

- `src/engine/liveActivityContentState.ts:44-46` mantém `blockLabel`, `blockIndex` e `blockTotal` como `null` nesta tracer. É deliberado: o renderer Swift já aceita `blockOnly`, mas o builder só passa a emitir esse estado no Plano 15-02, conforme o escopo explícito do plano.

## Issues Encountered

- `ctx7` não estava instalado; a documentação oficial do Expo Modules API foi consultada via página oficial para confirmar `Record`, `@Field` e `AsyncFunction`.
- A suíte completa terminou com 164/164 suites e 1831/1831 testes verdes, mas reportou o aviso conhecido de handles abertos do Jest e avisos de `act(...)`; nenhum deles foi introduzido como falha deste plano.
- A validação visual em iPhone físico não foi executada por instrução explícita; o build Xcode e o esqueleto nativo comprovam compilação/configuração, não UAT de Lock Screen.

## User Setup Required

None - no external service configuration required for this plan. Physical Lock Screen/Dynamic Island UAT remains a later owner-only checkpoint.

## Next Phase Readiness

- Plano 15-02 pode emitir `blockOnly`/`readyOvertime` no builder e completar a matriz visual sem mudar o contrato Swift.
- Plano 15-03 pode chamar `endActivity`/`reconcileOrphans` no boot e fechar o ciclo de vida sem reabrir o contrato de campos.
- Nenhum pacote novo ou migration Supabase foi introduzido. Nenhuma UAT física foi declarada como concluída.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Plan: 01*
*Completed: 2026-08-17*

## Self-Check: PASSED

- `15-01-SUMMARY.md` exists at the canonical phase path.
- RED commit `9326977` exists in git history.
- GREEN commit `228c913` exists in git history.
