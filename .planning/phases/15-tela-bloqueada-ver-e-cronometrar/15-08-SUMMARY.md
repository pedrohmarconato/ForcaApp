---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 08
subsystem: live-activity-widget
tags: [zustand, live-activity, session-model, gap-closure, tdd]

requires:
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    plan: 07
    provides: Transição temporal resting -> readyOvertime e overtime clampado no WidgetKit (fechou CR-01/CR-02)
provides:
  - Deadline de inatividade de 3h armado no start e substituído SOMENTE por uma nova série done da mesma sessionLogId (D-08) — edição de reps/carga/RIR/descanso publica update mas não adia o prazo
  - Fallback CAS-safe update→start: quando updateLiveActivity() resolve false, o sync relê o store e só recria a Activity se a mesma sessão continua active com o mesmo sessionLogId (D-06/D-11)
  - findActiveSet/findNextPendingSet delegam a exercicioForaDeJogo (cutByReplan OU skippedByUser) em vez do filtro local de cutByReplan — Lock Screen nunca mais aponta para exercício recusado (WR-01)
affects: [15-09]

actuals:
  tokens: 3653
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Deadline de inatividade rearmado por transição de estado (não-done -> done) detectada por diff de plannedSetId entre previousState.draft e state.draft no subscriber Zustand, nunca pelo sucesso assíncrono de um update de rede"
    - "Guarda pós-await por (status active, draft existente, mesmo sessionLogId) antes de qualquer chamada nativa que recria estado — mesmo padrão já usado em reconcileOrphanActivities, agora replicado no fallback update=false->start"

key-files:
  created: []
  modified:
    - src/native/liveActivitySync.ts
    - src/engine/sessionModel.ts
    - __tests__/liveActivitySync.test.ts
    - __tests__/sessionModel.test.ts

key-decisions:
  - "hasNewlyDoneSet compara por plannedSetId (identidade estável da série), não por índice/posição — resistente a reordenação e a filtrar exercícios fora de jogo"
  - "recoverAfterFailedUpdate reconstrói o ContentState do draft ATUAL do store (não do draft que originou o update), para não publicar dado obsoleto ao recriar a Activity"
  - "publishUpdate parou de resetar o timeout no sucesso do update — a única fonte de reset agora é a detecção síncrona de nova série done no subscriber, eliminando a dependência de rede para a semântica de D-08"

requirements-completed: [LOCK-01, LOCK-03]

coverage:
  - id: D1
    description: "Deadline de inatividade de 3h só é substituído por uma nova série done da mesma sessão; edição de reps/carga/RIR/descanso não o adia"
    requirement: "LOCK-03"
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#D-08: editar só reps/carga/RIR/descanso perto do prazo publica a atualização, mas o timeout ORIGINAL ainda encerra a Activity"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#D-08: nova série done da mesma sessão substitui o deadline por três horas a partir da conclusão"
        status: pass
    human_judgment: false
  - id: D2
    description: "Depois do timeout, updateLiveActivity=false recria a Activity somente se a sessão ainda é a mesma e active; finish/cancel bloqueia a recriação"
    requirement: "LOCK-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#depois do timeout, update=false recria a Activity quando a sessão ainda é a mesma e active"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#finish antes de update=false resolver impede recriar a Activity de sessão que já terminou"
        status: pass
    human_judgment: false
  - id: D3
    description: "findActiveSet e findNextPendingSet excluem exercício skippedByUser, além de cutByReplan (regra canônica exercicioForaDeJogo)"
    requirement: "LOCK-01"
    verification:
      - kind: unit
        ref: "__tests__/sessionModel.test.ts#findActiveSet / findNextPendingSet — regra canônica exercicioForaDeJogo (WR-01)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-19
status: complete
---

# Phase 15 Plan 08: Ciclo de vida de retomada e seletores canônicos — Summary

**Três horas de inatividade agora contam só a partir do start ou da última série done da mesma sessão (D-08), uma Activity removida volta com segurança quando a sessão ativa recebe uma mutação mas nunca depois de finish/cancel (D-06/D-11), e o card do Lock Screen para de poder apontar para exercício que o aluno recusou (WR-01) — fechando CR-04, WR-01 e WR-02 de `15-VERIFICATION.md`.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-08-19T15:05:11-03:00
- **Completed:** 2026-08-19T15:14:29-03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `liveActivitySync.ts`: `hasNewlyDoneSet()` detecta, por `plannedSetId`, uma série que passou de não-done para done na MESMA sessão — é a ÚNICA transição que substitui a deadline de inatividade. Edição de reps, carga, RIR ou ajuste de descanso publica update normalmente, mas não adia mais o prazo original.
- `liveActivitySync.ts`: `recoverAfterFailedUpdate()` relê o store depois de `updateLiveActivity()` resolver `false` e só chama `startLiveActivity()` quando a mesma sessão (`sessionLogId` idêntico) continua `active` com draft — sessão terminada, cancelada ou trocada nunca ressuscita o card.
- `sessionModel.ts`: `findActiveSet`/`findNextPendingSet` passaram a chamar `exercicioForaDeJogo(ex)` (já usada por `applyExerciseSkipToDraft`/`sessionProgress`) em vez do filtro local `ex.cutByReplan`, cobrindo também `skippedByUser`.
- Quatro testes RED→GREEN novos em `liveActivitySync.test.ts` substituindo o teste que fixava o comportamento incorreto de rearmar por qualquer update; cinco testes novos em `sessionModel.test.ts` (active/pending sob `skippedByUser` com fallback e null, mais regressão explícita de `cutByReplan`).

## Task Commits

Each task was committed atomically (TDD: cada uma com testes RED escritos e confirmados falhando antes da implementação GREEN):

1. **Task 1: Deadline de inatividade por série concluída e recuperação segura depois do timeout** - `e8edacc` (fix)
2. **Task 2: Usar exercicioForaDeJogo nos seletores de série do card** - `b2c42db` (fix)

**Plan metadata:** este commit (docs: complete plan)

## Files Created/Modified

- `src/native/liveActivitySync.ts` - `hasNewlyDoneSet()`, `recoverAfterFailedUpdate()`, `publishUpdate()` sem mais resetar o timeout no sucesso, subscriber armando o deadline só na transição done.
- `src/engine/sessionModel.ts` - `findActiveSet`/`findNextPendingSet` delegam a `exercicioForaDeJogo`.
- `__tests__/liveActivitySync.test.ts` - teste incorreto de rearme por update substituído por 4 testes (prazo preservado em edição, prazo substituído por done, fallback update=false→start, guarda contra start após finish).
- `__tests__/sessionModel.test.ts` - novo describe block com 5 testes cobrindo `skippedByUser` e regressão de `cutByReplan` para os dois seletores.

## Decisions Made

- `hasNewlyDoneSet` compara por `plannedSetId` (não por posição/índice), coerente com a identidade de série usada no resto do motor (`isFirstSetOfExerciseInSession`, `resolveInheritedSet`).
- `recoverAfterFailedUpdate` reconstrói o `ContentState` do draft ATUAL do store (não do draft que originou a chamada de update), para nunca publicar dado obsoleto ao recriar a Activity.
- `publishUpdate` deixou de resetar a deadline no sucesso da rede — a única fonte de reset é a detecção síncrona (dentro do próprio `setState` do Zustand) de uma nova série done, tornando a semântica de D-08 independente de latência de rede.
- Não foi necessário introduzir um segundo predicado nem alterar `applyExerciseSkipToDraft`: a regra canônica `exercicioForaDeJogo` já expressava as duas origens de exclusão.

## Deviations from Plan

None - plano executado exatamente como escrito. A primeira versão do Teste RED 3 ("nova série done substitui o deadline") tinha um erro de aritmética de timer (advance de `T-1` colidia exatamente com o novo prazo `2T-1` em vez de ficar estritamente antes); corrigido para `T-2` antes de prosseguir ao GREEN — ajuste interno ao próprio teste durante a fase RED, não uma mudança de comportamento ou de escopo.

## Issues Encountered

Nenhum bloqueio. Durante a fase RED, três testes subsequentes falharam em cascata (contagens de mock infladas) porque testes anteriores lançavam exceção antes de chamar `stop()`, deixando a subscrição do Zustand viva entre testes — efeito colateral esperado do RED (não de uma condição de corrida real) que desapareceu assim que a implementação GREEN corrigiu as asserções que causavam a exceção.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CR-04, WR-01 e WR-02 de `15-VERIFICATION.md` fechados por este plano; CR-01/CR-02 já haviam sido fechados por 15-07. Falta apenas CR-03 (import iOS incondicional derrubando Android/web) para 15-09.
- Suíte completa: 167 suítes / 1987 testes, exit 0 (baseline 1979 + 8 testes novos deste plano, sem regressão). `npx tsc --noEmit` limpo. `npm run verify:native` 2/2 rodadas OK.
- Nenhuma assinatura pública, contrato de tipo ou comportamento observável fora do escopo declarado foi alterado; `findActiveSet`/`findNextPendingSet` e `liveActivitySync.ts` continuam com a mesma API consumida pelas Fases 16/17 (`SessionPlayer`, `liveActivityIntentBridge`, `activeSessionStore`, `liveActivityContentState`) — a mudança é estritamente de FILTRO interno (quais séries são candidatas), não de assinatura.
- Janela WINDOWS.md #4 (`blockLabel`/`blockIndex`/`blockTotal` null em `liveActivityContentState.ts:44`) permanece intocada — fora do escopo deste plano.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Completed: 2026-08-19*

## Self-Check: PASSED

- `.planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-08-SUMMARY.md` — FOUND
- Commit `e8edacc` (Task 1) — FOUND em `git log --oneline`
- Commit `b2c42db` (Task 2) — FOUND em `git log --oneline`
- `npx jest --silent` — 167/167 suítes, 1987/1987 testes PASS
- `npx tsc --noEmit` — exit 0
- `npm run verify:native` — 2/2 rodadas OK
