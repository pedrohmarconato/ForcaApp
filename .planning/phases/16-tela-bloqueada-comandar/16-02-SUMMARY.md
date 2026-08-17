---
phase: 16-tela-bloqueada-comandar
plan: 02
subsystem: mobile-native
tags: [swift, expo-modules, live-activity, react-native, zustand, jest, cold-launch]

# Dependency graph
requires:
  - phase: 16-tela-bloqueada-comandar
    provides: "Plano 16-01: IntentActionQueue durável do App Group (enqueue já em produção via CompleteSetIntent/SkipRestIntent/AdjustRestIntent), drainAll() pronto-e-não-invocado, bridge JS 'quente' (liveActivityIntentBridge.ts) para o app já vivo"
provides:
  - "AsyncFunction drainIntentQueue() no LiveActivityModule.swift — lê e limpa a fila durável do App Group via IntentActionQueue.drainAll(), conversão pura para QueuedIntentActionRecord (Record serializável pela ponte Expo)"
  - "drainQueuedLiveActivityIntents()/QueuedLiveActivityIntent em modules/live-activity/index.ts — wrapper fino, mesmo padrão dos demais exports do arquivo"
  - "reconcileLiveActivityIntents() em activeSessionStore.ts — drena a fila e aplica cada entrada contra completeSet()/activateSet()/adjustRest() já existentes, com guarda de CAS por sessionLogId relida a cada iteração do loop"
  - "App.tsx: reconcileLiveActivityIntents() chamado no boot ANTES de reconcileOrphanActivities(), encadeado via .finally() (ordem importa)"
  - "moduleNameMapper global (package.json) para modules/live-activity — necessário porque a store agora importa o módulo nativo diretamente"
affects: [16-03-uat-fisica]

# Actuals (#2632)
actuals:
  tokens: 4913
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Guarda de CAS relida a cada iteração do loop (get().draft dentro do for, não uma cópia capturada antes) — necessário porque completeSet() dentro da própria iteração pode mudar o draft antes da próxima entrada ser processada"
    - "Ordem de boot: reconcileLiveActivityIntents() -> .finally() -> reconcileOrphanActivities() -> (síncrono, sem esperar) initLiveActivitySync()/registerLiveActivityIntentListener() — aplica ações pendentes na store antes de sincronizar o card nativo com o estado já atualizado"

key-files:
  created:
    - __tests__/liveActivityIntentQueue.test.ts
    - __mocks__/modules-live-activity.ts
  modified:
    - modules/live-activity/ios/LiveActivityModule.swift
    - modules/live-activity/index.ts
    - src/store/activeSessionStore.ts
    - App.tsx
    - package.json

key-decisions:
  - "Task 2 (tdd=true) seguiu RED->GREEN explícito: 7 casos de teste escritos primeiro (todos falhando com 'reconcileLiveActivityIntents is not a function'), commitados, depois a implementação real fez os 7 passarem — sem REFACTOR (código já limpo na primeira implementação)."
  - "activeSessionStore.ts passou a importar modules/live-activity diretamente (instrução explícita do PLAN.md) — isso quebrou 14 suítes de teste que importam a store transitivamente, porque jest-expo lança 'Cannot find native module LiveActivityModule' na importação do módulo nativo sem mock. Corrigido com um moduleNameMapper global (package.json) mapeando modules/live-activity para __mocks__/modules-live-activity.ts, que não interfere nos 3 arquivos que já declaram seu próprio jest.mock(..., { virtual: true }) para o mesmo módulo (mock explícito por arquivo tem precedência sobre moduleNameMapper)."
  - "Teste da Task 2 mocka as três ações de gravação (completeSet/activateSet/adjustRest) via useActiveSessionStore.setState({...}) em vez de usar a store 100% real — opção explicitamente deixada a critério do executor pelo PLAN.md; evita que os testes de reconciliação de fila dependam da implementação interna de completeSet (rede, outbox, etc.), mantendo o foco nos asserts sobre QUAL ação foi chamada e com QUE argumentos."

patterns-established: []

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: D1
    description: "reconcileLiveActivityIntents() drena a fila do App Group e aplica completeSet/activateSet/adjustRest com guarda de CAS por sessionLogId — entradas com sessionLogId nulo ou divergente do draft atual são sempre descartadas"
    requirement: "CMD-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#completeSet com sessionLogId igual ao draft atual aplica completeSet sobre a série resolvida"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#entrada com sessionLogId diferente do draft atual não aplica nenhuma ação (CAS)"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#entrada com sessionLogId null não aplica nenhuma ação (descartada por ambiguidade)"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#fila vazia não chama nenhuma ação e não lança"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#drainQueuedLiveActivityIntents rejeitando resolve sem lançar"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#adjustRest com deltaSeconds: 45 chama adjustRest(45) com o valor exato"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#skipRest aplica activateSet sobre a próxima série pendente"
        status: pass
    human_judgment: false
  - id: D2
    description: "drainIntentQueue() exposto na ponte Expo, lendo e limpando a fila durável via IntentActionQueue.drainAll() (Plano 16-01), sem lógica de negócio nova no Swift"
    requirement: "CMD-02"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (0); grep -c drainQueuedLiveActivityIntents modules/live-activity/index.ts == 1; grep -c 'AsyncFunction(\"drainIntentQueue\")' modules/live-activity/ios/LiveActivityModule.swift == 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "O caminho FRIO real (force-quit físico -> toque no Lock Screen -> reabertura do app -> reconciliação aplicada) produz o efeito esperado no draft e no card nativo, sem série perdida nem aplicada contra sessão errada"
    verification: []
    human_judgment: true
    rationale: "Exige aparelho físico com o app efetivamente force-quit e reaberto — não verificável neste ambiente sem Xcode+device attach. Escopo explícito da Plano 16-03 (UAT física), conforme a seção <verification> da própria 16-02-PLAN.md."

duration: ~5min (commits df12b7a a 17946c2; não inclui leitura/análise prévia)
completed: 2026-08-17
status: complete
---

# Phase 16 Plan 02: Reconciliação de cold-launch da fila de intents (CMD, caminho frio) Summary

**`reconcileLiveActivityIntents()` drena a fila durável do App Group na próxima abertura do app em foreground e aplica cada intenção pendente contra o MESMO `completeSet()`/`activateSet()`/`adjustRest()` já existentes, com guarda de CAS por `sessionLogId` relida a cada iteração — fecha o caminho "frio" que a Plano 16-01 deixou como pré-requisito.**

## Performance

- **Duration:** ~5 min entre o primeiro e o último commit (df12b7a → 17946c2); não inclui o tempo de leitura/análise do código existente antes de codar
- **Started:** 2026-08-17T20:16:07-03:00 (commit Task 1)
- **Completed:** 2026-08-17T20:20:50-03:00 (commit GREEN da Task 2)
- **Tasks:** 2 de 2
- **Files modified:** 7 (2 criados, 5 modificados)

## Accomplishments
- `LiveActivityModule.swift`: `QueuedIntentActionRecord` + `AsyncFunction("drainIntentQueue")` — conversão pura de `QueuedIntentAction` (Codable, Plano 16-01) para o `Record` serializável pela ponte Expo, sem lógica de negócio nova
- `modules/live-activity/index.ts`: `QueuedLiveActivityIntent` (tipo, união de string literal), `drainQueuedLiveActivityIntents()` — wrapper fino, mesmo padrão de `reconcileLiveActivityOrphans`
- `activeSessionStore.ts`: `reconcileLiveActivityIntents()` drena a fila e aplica cada entrada com guarda de CAS por `sessionLogId` relida a cada iteração do loop (`get().draft`, não uma cópia capturada antes)
- `App.tsx`: `reconcileLiveActivityIntents()` chamado no boot ANTES de `reconcileOrphanActivities()`, encadeado via `.finally()` (não `Promise.all` — ordem importa)
- `__tests__/liveActivityIntentQueue.test.ts`: 7 casos cobrindo match/mismatch/null de `sessionLogId`, fila vazia, rejeição da drenagem, `adjustRest` com delta exato, `skipRest`
- **Deviation-fix:** `package.json` (moduleNameMapper) + `__mocks__/modules-live-activity.ts` — corrige a quebra de 14 suítes de teste causada pela store agora importar o módulo nativo diretamente (ver Deviations abaixo)

## Task Commits

Task 1 é `type="auto"`; Task 2 é `tdd="true"` (ciclo RED→GREEN, sem REFACTOR):

1. **Task 1 — drainIntentQueue() na ponte Expo (CMD-02)** - `df12b7a` (feat)
2. **Task 2 RED — teste falho para reconcileLiveActivityIntents** - `e4f5bee` (test)
3. **Task 2 GREEN — reconcileLiveActivityIntents() + wiring no boot + fix da regressão de teste (CMD-01)** - `17946c2` (feat)

## Files Created/Modified
- `modules/live-activity/ios/LiveActivityModule.swift` - `QueuedIntentActionRecord` + `AsyncFunction("drainIntentQueue")`
- `modules/live-activity/index.ts` - tipo `QueuedLiveActivityIntent` + wrapper `drainQueuedLiveActivityIntents`
- `src/store/activeSessionStore.ts` - `reconcileLiveActivityIntents()` com guarda de CAS
- `App.tsx` - reordena o boot: reconciliação de intents antes de `reconcileOrphanActivities()`
- `package.json` - `moduleNameMapper` para `modules/live-activity` (fix de regressão)
- `__mocks__/modules-live-activity.ts` - mock global inerte do módulo nativo para testes que não o exercitam
- `__tests__/liveActivityIntentQueue.test.ts` - 7 casos de teste da reconciliação

## Decisions Made
- Task 2 mocka as três ações de gravação via `setState()` em vez de usar `completeSet` 100% real (rede/outbox) — decisão deixada a critério do executor pelo PLAN.md; mantém o foco do teste na lógica de reconciliação/CAS, não na implementação de `completeSet`.
- Ver `key-decisions` no frontmatter para a decisão completa sobre o `moduleNameMapper` (fix de regressão de teste).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import direto de `modules/live-activity` na store quebrou 14 suítes de teste**
- **Found during:** Task 2 (verificação pós-implementação — rodei a suíte completa antes de declarar a tarefa concluída, não só o `<verify>` do plano)
- **Issue:** O PLAN.md instrui explicitamente importar `drainQueuedLiveActivityIntents` de `'../../modules/live-activity'` diretamente em `activeSessionStore.ts`. Isso introduziu uma dependência nova (store → módulo nativo) que antes não existia — só os arquivos "folha" (`liveActivityIntentBridge.ts`, `liveActivitySync.ts`) importavam o módulo nativo, e cada um tinha seu próprio `jest.mock(..., { virtual: true })`. Qualquer teste que importa a store transitivamente agora dispara `requireNativeModule('LiveActivityModule')` do jest-expo, que lança "Cannot find native module" sem um mock. 14 suítes (`activeSessionStore.test.ts`, `activeSessionScreen.test.tsx`, `cardioTempoDistancia.test.ts`, etc.) quebravam por completo (0 testes executados cada).
- **Fix:** Adicionado `moduleNameMapper` global em `package.json` (`"modules/live-activity$": "<rootDir>/__mocks__/modules-live-activity.ts"`) com um mock inerte (todas as funções como `jest.fn()` resolvendo a valores neutros). Mapeamento por sufixo de path — não interfere nos 3 arquivos que já declaram `jest.mock('../modules/live-activity', factory, { virtual: true })` explicitamente (mock explícito por arquivo tem precedência sobre `moduleNameMapper` no registro de módulos do Jest).
- **Files modified:** `package.json`, `__mocks__/modules-live-activity.ts` (novo)
- **Verification:** Suíte completa rodada após o fix — 167/167 suítes, 1875/1875 testes verdes (antes do fix: 14 suítes falhando com 0 testes cada).
- **Committed in:** `17946c2` (parte do commit GREEN da Task 2, documentado no corpo do commit)

---

**Total deviations:** 1 auto-fixado (Rule 1 - bug de regressão de teste, causado diretamente por esta task)
**Impact on plan:** Fix necessário para não deixar 14 suítes de teste quebradas silenciosamente; nenhum scope creep — o import direto em si foi seguido exatamente como o PLAN.md instruiu.

## Issues Encountered
None além do deviation acima.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- O caminho FRIO (cold-launch) está completo em lógica: `reconcileLiveActivityIntents()` drena e aplica a fila com guarda de CAS, chamado no boot antes de `reconcileOrphanActivities()`. Falta apenas o toque físico real com o app force-quit, escopo explícito da Plano 16-03 (UAT física).
- `npx tsc --noEmit` limpo e suíte completa (167/167 suítes, 1875/1875 testes) verde após o fix da regressão.
- A Fase 15 segue `gaps_found` (LOCK-01/LOCK-03) por decisão anterior ao escopo desta plano — nenhum gap daquela fase toca os arquivos criados/modificados aqui.

## Self-Check: PASSED

Todos os 7 arquivos criados/modificados verificados presentes em disco; todos os
3 commits (`df12b7a`, `e4f5bee`, `17946c2`) confirmados em `git log`.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-17*
