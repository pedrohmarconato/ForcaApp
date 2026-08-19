---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 02
subsystem: state
tags: [typescript, zustand, jest, sessionModel, activeSessionStore, supabase]

# Dependency graph
requires:
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    provides: SessionDraft / lastLoadByExercise (molde exato que este plano espelha para reps)
provides:
  - "SessionDraft.lastRepsByExercise: Record<string, number>"
  - "isFirstSetOfExerciseInSession() — discriminador da precedência híbrida D-17"
  - "suggestReps() / stepReps() / resolveInheritedSet() em src/engine/sessionModel.ts"
  - "getLastRepsByExercise() em src/services/sessionExecutionRepository.ts"
  - "stepReps action + suggestedRepsFor() + seedLastReps() + materialização em completeSet() em src/store/activeSessionStore.ts"
affects: [17-04-tela-do-app-registrar-sem-teclado, 17-05-antecipar-proxima-acao]

# Actuals (#2632)
actuals:
  tokens: 11255
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Precedência híbrida por escopo (D-17): suggestReps() bifurca por isFirstSetOfExerciseInSession — 1ª série do exercício na sessão usa D-01 (histórico > alvo), séries seguintes usam D-08 (alvo já reescrito pela adaptação > histórico). Não é a mesma ordem de suggestLoad()."
    - "Materialização no momento da confirmação: resolveInheritedSet() resolve reps/carga herdados IMEDIATAMENTE ANTES de canCompleteSet() dentro de completeSet() — nenhum outro call site precisa pré-preencher o draft para o '1 toque' funcionar."

key-files:
  created: []
  modified:
    - src/engine/sessionModel.ts
    - src/services/sessionExecutionRepository.ts
    - src/store/activeSessionStore.ts
    - __tests__/sessionModel.test.ts
    - __tests__/sessionExecutionRepository.test.ts
    - __tests__/activeSessionStore.test.ts
    - __tests__/direcao03-fase3-sessao.test.tsx
    - __tests__/intraSessionAdaptation.test.ts
    - __tests__/liveActivityContentState.test.ts
    - __tests__/liveActivityIntentBridge.test.ts
    - __tests__/liveActivityIntentQueue.test.ts
    - __tests__/liveActivitySync.test.ts
    - __tests__/sessionPlayerCleanup.test.tsx
    - __tests__/sessionPlayerTransitions.test.tsx
    - __tests__/weeklyReplanner.test.ts
    - __tests__/adaptacaoRirImpulso.test.ts
    - __tests__/resumeNumericIntegration.test.ts

key-decisions:
  - "lastRepsByExercise é campo OBRIGATÓRIO em SessionDraft (não opcional), espelhando lastLoadByExercise — decisão de paridade explícita do PLAN.md, não uma escolha desta execução."
  - "resolveInheritedSet() muda de assinatura: segundo parâmetro passa de isBodyweight:boolean para exercise inteiro, porque precisa de exercise.sets para calcular isFirstSetOfExerciseInSession internamente (D-17) antes de chamar suggestReps."

patterns-established:
  - "Todo teste que constrói um SessionDraft por objeto literal (em vez de buildDraftFromDetail) precisa incluir lastRepsByExercise — o tipo agora exige o campo e completeSet() lê draft.lastRepsByExercise[chave] por colchete (não mais só spread), então a ausência quebra em runtime, não só em tsc."

requirements-completed: [REG-01]

coverage:
  - id: D1
    description: "SessionDraft.lastRepsByExercise + isFirstSetOfExerciseInSession() + suggestReps() bifurcado pela precedência híbrida D-17 (1ª série do exercício = D-01 histórico>alvo; série seguinte = D-08 alvo>histórico) + stepReps() + resolveInheritedSet(), todos em src/engine/sessionModel.ts"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/sessionModel.test.ts#suggestReps / isFirstSetOfExerciseInSession / stepReps / resolveInheritedSet / coerceDraftNumerics — lastRepsByExercise"
        status: pass
    human_judgment: false
  - id: D2
    description: "getLastRepsByExercise() em sessionExecutionRepository.ts — espelha getLastLoadByExercise() filtrando em actual_reps (bodyweight-inclusive), com fallback 42703 da migration 0026, sem migration nem RPC nova"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/sessionExecutionRepository.test.ts#getLastRepsByExercise (Fase 17, D-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "activeSessionStore.ts: stepReps action, suggestedRepsFor(), seedLastReps() semeado nos dois call sites de startOrResume, reconciliação de lastRepsByExercise em applyServerSetLogs(), e materialização de reps/carga herdados em completeSet() via resolveInheritedSet() ANTES de canCompleteSet()"
    requirement: REG-01
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#Fase 17 (REG-01): reps herdadas — stepReps e materialização em completeSet() (D-17)"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-08-19
status: complete
---

# Phase 17 Plan 02: Motor/dados de reps herdadas (REG-01) Summary

**`lastRepsByExercise` espelhando `lastLoadByExercise` byte a byte, com `suggestReps()` bifurcado pela precedência híbrida D-17 (1ª série do exercício usa histórico > alvo; série seguinte usa alvo > histórico) e materialização em `completeSet()` via `resolveInheritedSet()` antes da validação — REG-01 (app) e REG-02 (tela bloqueada) passam a ter a mesma fonte de verdade de "o que nasce pré-preenchido".**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-19
- **Tasks:** 3/3
- **Files modified:** 17 (3 arquivos de produção + 14 de teste)

## Accomplishments
- `SessionDraft.lastRepsByExercise`, `isFirstSetOfExerciseInSession()`, `suggestReps()`, `stepReps()` e `resolveInheritedSet()` em `src/engine/sessionModel.ts`, testados nos dois ramos da precedência híbrida D-17 (1ª série do exercício vs. série seguinte na mesma sessão)
- `getLastRepsByExercise()` em `sessionExecutionRepository.ts`, irmã de `getLastLoadByExercise()`, filtrando em `actual_reps` (inclusive bodyweight) — sem migration, sem RPC nova
- `activeSessionStore.ts`: action `stepReps`, `suggestedRepsFor()`, `seedLastReps()` semeado nos dois pontos de retomada/início, reconciliação de `lastRepsByExercise` em `applyServerSetLogs()`, e `completeSet()` materializando reps/carga herdados via `resolveInheritedSet()` antes de `canCompleteSet()` — "1 toque" sem ajuste manual agora grava o valor herdado no ramo D-17 correto

## Task Commits

Each task was committed atomically:

1. **Task 1: Motor puro — lastRepsByExercise, suggestReps, stepReps, resolveInheritedSet** - `fb04135` (feat)
2. **Task 2: getLastRepsByExercise() — widening do histórico** - `8b7fbb4` (feat)
3. **Task 3: Store — seed, stepReps action, materialização em completeSet()** - `f68ca18` (feat)

**Plan metadata:** committed together with worktree wave metadata by the orchestrator (SUMMARY.md + STATE.md are excluded from per-plan commits in worktree isolation mode; see `<parallel_execution>`).

_Note: this is a `type="tracer" tdd="true"` first task followed by `type="auto" tdd="true"` tasks — each committed test-then-implementation together per the plan's TDD framing (behavior-driven `<behavior>` blocks translated to `it()` cases before/alongside the implementation edit, not as separate RED/GREEN commits)._

## Files Created/Modified
- `src/engine/sessionModel.ts` - `lastRepsByExercise` field, `isFirstSetOfExerciseInSession()`, `suggestReps()`, `stepReps()`, `resolveInheritedSet()`, `buildDraftFromDetail()` 4th param, `coerceDraftNumerics()` coercion
- `src/services/sessionExecutionRepository.ts` - `getLastRepsByExercise()`, mirrors `getLastLoadByExercise()` on `actual_reps`
- `src/store/activeSessionStore.ts` - `stepReps` action, `suggestedRepsFor()`, `seedLastReps()`, `applyServerSetLogs()` reconciliation, `completeSet()` materialization
- `__tests__/sessionModel.test.ts` - 15 new `it()` cases (D-17 both branches, `stepReps`, `resolveInheritedSet`, `coerceDraftNumerics`)
- `__tests__/sessionExecutionRepository.test.ts` - 6 new `it()` cases (`getLastRepsByExercise`, incl. 42703 fallback)
- `__tests__/activeSessionStore.test.ts` - 6 new `it()` cases (`stepReps`, `completeSet` both D-17 branches, bodyweight `lastRepsByExercise` update)
- 11 other test files - `lastRepsByExercise: {}` added to hand-built `SessionDraft` literals (Rule 3 fallout, see below)

## Decisions Made
- `lastRepsByExercise` is a **required** field on `SessionDraft` (not optional), matching `lastLoadByExercise`'s existing shape — this was the plan's explicit instruction ("MESMO comentário de intenção... adicione... ao tipo SessionDraft"), not a choice made during execution.
- `resolveInheritedSet()`'s second parameter changed from `isBodyweight: boolean` to the full `exercise` object, because it now needs `exercise.sets` to compute `isFirstSetOfExerciseInSession` internally before calling `suggestReps` — this was specified by the plan, not an ad-hoc deviation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc fallout across 8 unrelated test files after making `lastRepsByExercise` required**
- **Found during:** Task 1 (`npx tsc --noEmit` acceptance criterion)
- **Issue:** Making `SessionDraft.lastRepsByExercise` a required field (per plan instruction, mirroring `lastLoadByExercise`) broke `tsc --noEmit` for 8 test files that construct `SessionDraft` object literals directly instead of via `buildDraftFromDetail()`: `direcao03-fase3-sessao.test.tsx`, `intraSessionAdaptation.test.ts`, `liveActivityContentState.test.ts`, `liveActivityIntentBridge.test.ts`, `liveActivityIntentQueue.test.ts`, `liveActivitySync.test.ts`, `sessionPlayerCleanup.test.tsx`, `sessionPlayerTransitions.test.tsx`, `weeklyReplanner.test.ts`.
- **Fix:** Added `lastRepsByExercise: {}` (or `{ 'k:...': N }` where the fixture already seeds `lastLoadByExercise` with a value) to each literal.
- **Files modified:** the 9 files listed above.
- **Verification:** `npx tsc --noEmit` clean; all 9 suites' existing tests still pass (113 tests).
- **Committed in:** `fb04135` (Task 1 commit)

**2. [Rule 3 - Blocking] Test fixture regressions after Task 3's `completeSet()` materialization change**
- **Found during:** Task 3 (full `npx jest` run per plan's `<verification>`)
- **Issue A:** `resumeNumericIntegration.test.ts` queues exactly 2 `fromMock.mockReturnValueOnce(...)` calls in a fixed order (`getLastLoadByExercise` → `getOpenSessionLog`); adding `seedLastReps()` (`getLastRepsByExercise`) as a 3rd Supabase call between them shifted the queue, starving `getOpenSessionLog` of its mock and producing `status: 'error'` instead of `'active'`.
  **Fix A:** Inserted a 3rd `mockReturnValueOnce` in the correct position (empty history, matching the plan's silent-fallback contract for `seedLastLoads`/`seedLastReps`).
- **Issue B:** `liveActivityIntentQueue.test.ts` had 2 tests ("D1: completeSet reprovado por validação real" / "órfã adotada cujo completeSet REAL reprova") whose premise — reps/carga stay null and `canCompleteSet()` rejects — depended on the shared `draft()` fixture having `targetRepsMin: 8` / `targetLoadKg: 40` with no manual touch. Task 3's intended new behavior (materializing reps/carga from target/history before validation) now fills those fields from the fixture's own targets, making the previously-rejected `completeSet()` succeed — invalidating the tests' premise, not their intent.
  **Fix B:** Added `draftSemPreenchimentoHerdado()` — a variant of `draft()` with `targetRepsMin: 0` (no real target, per the plan's own "specless fallback" note) and `targetLoadKg: null` for the active set — restoring the "nothing to materialize, validation still rejects" scenario these tests exist to prove.
- **Issue C:** `adaptacaoRirImpulso.test.ts` hand-builds a `SessionDraft` literal missing `lastLoadByExercise`/`lastRepsByExercise` entirely (not even `{}`). Before Task 3, `completeSet()` only ever spread these fields (`{...atual.lastLoadByExercise}`, safe on `undefined`); the new `resolveInheritedSet()` call reads `draft.lastRepsByExercise[key]` by bracket access, which throws on `undefined` rather than a missing key.
  **Fix C:** Added `lastLoadByExercise: {}` and `lastRepsByExercise: {}` to the literal.
- **Files modified:** `__tests__/resumeNumericIntegration.test.ts`, `__tests__/liveActivityIntentQueue.test.ts`, `__tests__/adaptacaoRirImpulso.test.ts`.
- **Verification:** Full suite green — 167/167 test files, 1937/1937 tests, `tsc --noEmit` clean.
- **Committed in:** `f68ca18` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking tsc/test fallout directly caused by making `lastRepsByExercise` required and materializing herdado values in `completeSet()`, both explicit plan instructions).
**Impact on plan:** No scope creep — every fallout fix is a mechanical adjustment (adding a missing field to a literal, inserting a mock in the right queue position, or replacing a now-invalid test fixture) required to keep the plan's own acceptance criteria (`tsc --noEmit` clean, full suite green) satisfied. No production logic outside the plan's declared files was touched.

## Issues Encountered
- One `npx jest` run hit a worker-process `SIGSEGV` on `__tests__/cardioPrescritoRepository.test.ts` — re-ran that file standalone (4/4 pass) and the full suite again (167/167 green); confirmed unrelated infra flake, not a regression from this plan's changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `suggestedRepsFor()`, `stepReps` action, and `resolveInheritedSet()` are ready for Plan 17-04 (`SessionPlayer.tsx` wiring — steppers replace the reps `TextInput` in the app UI) to consume as props/actions, per the plan's stated "não toca UI" boundary.
- `lastRepsByExercise` and the D-17 branch logic are also the data source Plan 17-05 (PRED-01, antecipação da próxima ação) needs for "the value that will be confirmed in 1 touch" in the Live Activity's "A seguir" line.
- No blockers. This plan is pure TypeScript (engine + repository + store), ran in parallel to Plan 17-01 with no file conflicts as designed.

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: src/engine/sessionModel.ts
- FOUND: src/services/sessionExecutionRepository.ts
- FOUND: src/store/activeSessionStore.ts
- FOUND: .planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-02-SUMMARY.md
- FOUND: fb04135
- FOUND: 8b7fbb4
- FOUND: f68ca18
