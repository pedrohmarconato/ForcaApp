# Deferred Items — Phase 10

Out-of-scope discoveries logged during plan execution (scope boundary rule:
only auto-fix issues directly caused by the current task's changes).

## Plan 10-01, Task 2 — pre-existing flaky Jest suites (unrelated to this plan)

**Found during:** `npx jest` (full suite) run for Task 2 verification.

**Observation:** Two consecutive full-suite runs produced different failure
counts/sets:
- Run 1: `Test Suites: 11 failed, 140 passed` — failures included
  `authContextClockSkew.test.tsx`, `jointLobbyDoisClientes.test.tsx`
  ("Exceeded timeout of 5000 ms"), `trainingSessionReanchoragem.test.tsx`,
  `questionnaireDiasESessao.test.tsx`, `activeSessionScreen.test.tsx`,
  `doseCardioQuestionario.test.tsx`, `questionnaireScreen.test.tsx`.
- Run 2 (immediately after): `Test Suites: 3 failed, 148 passed` — failures:
  `homeScreenAtrasado.test.tsx`, `questionnaireScreen.test.tsx`,
  `trainingSessionReanchoragem.test.tsx`.

None of the failing suites touch files modified by Plan 10-01
(`public/index.html`, `vercel.json`, `package.json` scripts block,
`__tests__/splashAssets.test.ts`) — all are pre-existing auth/lobby/training
session/questionnaire screens, unrelated domain. `__tests__/splashAssets.test.ts`
(3 assertions: link→arquivo, vercel.json rewrites regex, vercel.json headers
regex) passed in both runs. The differing failure sets between two runs of
the identical unmodified suite confirm this is pre-existing test-suite
flakiness (consistent with `AGENTS.md:91` note that the full Jest suite with
`--runInBand` can behave unreliably), not a regression introduced by this
plan.

**Action:** Not fixed — out of scope for Plan 10-01 (splash screen identity).
Logged here per scope-boundary rule; not re-run further to "chase" a clean
result. Candidate for a future phase/plan focused on test suite stability if
it keeps recurring.
