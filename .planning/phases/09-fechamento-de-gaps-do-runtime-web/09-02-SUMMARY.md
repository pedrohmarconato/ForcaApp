---
phase: 09-fechamento-de-gaps-do-runtime-web
plan: 02
subsystem: web-runtime-gaps
tags: [alert-shim, react-native-web, questionnaire, signup]

requires:
  - phase: 09-fechamento-de-gaps-do-runtime-web (plan 01)
    provides: src/utils/alertShim.ts (showAlert), src/store/alertStore.ts, src/components/AlertHost.tsx
provides:
  - QuestionnaireScreen.tsx e SignUpScreen.tsx migrados de Alert.alert para showAlert
  - Fix de aridade em alertShim.ts (repasse nativo preserva o número exato de argumentos)
affects: [09-03, 09-04]

actuals:
  tokens: 1393
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "showAlert repassa Alert.alert com aridade condicional (title / title+message / title+message+buttons) em vez de sempre 3 args — preserva compatibilidade com spies que checam a lista exata de argumentos"

key-files:
  created: []
  modified:
    - src/screens/QuestionnaireScreen.tsx
    - src/screens/SignUpScreen.tsx
    - src/utils/alertShim.ts

key-decisions:
  - "Rule 1 (bug): alertShim.ts (criado na Plan 09-01) sempre repassava 3 argumentos a Alert.alert (buttons=undefined quando omitido) — quebrava toHaveBeenCalledWith de 2 args nos call sites 2-arg introduzidos por esta plan. Corrigido para chamar Alert.alert com exatamente os argumentos fornecidos."

requirements-completed: [WEB-01]

coverage:
  - id: D1
    description: "6 call sites de QuestionnaireScreen.tsx migrados de Alert.alert para showAlert, texto e argumentos idênticos"
    requirement: WEB-01
    verification:
      - kind: unit
        ref: "__tests__/questionnaireDiasESessao.test.tsx (espiona Alert.alert, sem modificação)"
        status: pass
      - kind: unit
        ref: "__tests__/questionnaireScreen.test.tsx"
        status: pass
      - kind: unit
        ref: "__tests__/doseCardioQuestionario.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "1 call site de SignUpScreen.tsx migrado de Alert.alert para showAlert, incluindo onPress de navegação para Login"
    requirement: WEB-01
    verification:
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-08-14
status: complete
---

# Phase 9 Plan 02: Migração de QuestionnaireScreen.tsx e SignUpScreen.tsx para showAlert Summary

7 dos 12 call sites de `Alert.alert` (WEB-01) migrados para `showAlert` (alertShim
criado na Plan 09-01) em `QuestionnaireScreen.tsx` (6) e `SignUpScreen.tsx` (1) —
texto e argumentos idênticos, mecanismo trocado. Corrigido um bug de aridade em
`alertShim.ts` que quebrava o repasse nativo (D-03) para call sites sem `buttons`.

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files modified:** 3 (2 planejados + 1 correção de dependência)

## Accomplishments
- `QuestionnaireScreen.tsx`: import `Alert` removido, `showAlert` importado de
  `../utils/alertShim`; 6 call sites migrados (`handleSessionExpiration` — 1;
  `handleSubmit` — 5: 'Erro Interno' x2, 'Erro', 'Campos Incompletos', 'Erro ao
  Salvar').
- `SignUpScreen.tsx`: import `Alert` removido, `showAlert` importado; 1 call
  site migrado ('Cadastro realizado!') preservando o `onPress` de navegação
  para `Login`.
- `alertShim.ts` (Plan 09-01): corrigido bug de aridade — repasse nativo agora
  chama `Alert.alert(title)`, `Alert.alert(title, message)` ou
  `Alert.alert(title, message, buttons)` conforme o que foi realmente passado
  ao `showAlert`, em vez de sempre 3 argumentos com `buttons=undefined`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrar os 6 call sites de QuestionnaireScreen.tsx** - `92d4abf` (feat)
2. **Task 2: Migrar o call site de SignUpScreen.tsx** - `7d09f31` (feat)

_Note: Task 1's commit bundles the alertShim.ts arity fix (Rule 1) alongside the
planned QuestionnaireScreen.tsx migration — the fix was required for the plan's
own must_haves (unmodified test passing) to hold._

## Files Created/Modified
- `src/screens/QuestionnaireScreen.tsx` - 6 call sites `Alert.alert` → `showAlert`, import `Alert` removido
- `src/screens/SignUpScreen.tsx` - 1 call site `Alert.alert` → `showAlert`, import `Alert` removido
- `src/utils/alertShim.ts` - repasse nativo agora preserva a aridade exata da chamada

## Decisions Made

- **[Rule 1 - Bug] Aridade do repasse nativo em `alertShim.ts`.** O shim criado
  na Plan 09-01 sempre chamava `Alert.alert(title, message, buttons)`, mesmo
  quando `buttons` não era fornecido — nesse caso `buttons` valia `undefined`
  mas ainda assim era passado como terceiro argumento explícito. Isso é
  observável por um spy: `Alert.alert('t', 'm', undefined)` tem
  `arguments.length === 3`, enquanto uma chamada direta `Alert.alert('t', 'm')`
  tem `arguments.length === 2` — e `toHaveBeenCalledWith('t', 'm')` do Jest
  falha contra a primeira. Nenhum call site anterior (Plan 09-01, todos com
  `buttons`) expunha o bug; os 2 call sites 2-arg desta plan
  (`'Erro Interno'`/`'Erro'`/`'Campos Incompletos'`/`'Erro ao Salvar'` em
  `QuestionnaireScreen.tsx`) o expuseram via
  `__tests__/questionnaireDiasESessao.test.tsx` (linha 186,
  `toHaveBeenCalledWith('Erro ao Salvar', expect.any(String))`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] alertShim.ts sempre repassava 3 argumentos a Alert.alert, quebrando spies de aridade exata**
- **Found during:** Task 1 (execução do `<verify>` — `npx jest __tests__/questionnaireDiasESessao.test.tsx ...`)
- **Issue:** `showAlert(title, message)` (sem `buttons`) resultava em
  `Alert.alert(title, message, undefined)` — 3 argumentos reais, quebrando
  `expect(Alert.alert).toHaveBeenCalledWith('Erro ao Salvar', expect.any(String))`
  (2 argumentos esperados) em 2 testes de
  `__tests__/questionnaireDiasESessao.test.tsx`.
- **Fix:** `alertShim.ts` agora chama `Alert.alert` com o número exato de
  argumentos fornecidos ao `showAlert` (`title` sozinho, `title+message`, ou
  `title+message+buttons`), preservando a MESMA aridade que uma chamada direta
  a `Alert.alert` teria.
- **Files modified:** `src/utils/alertShim.ts`.
- **Verification:** `npx jest __tests__/questionnaireDiasESessao.test.tsx __tests__/questionnaireScreen.test.tsx __tests__/doseCardioQuestionario.test.tsx __tests__/alertShim.test.ts __tests__/activeSessionScreen.test.tsx __tests__/alertHostWeb.test.tsx` — 52/52 passam (nenhum teste modificado); `npx tsc --noEmit` sem erros.
- **Committed in:** `92d4abf` (Task 1 commit).

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Correção necessária para que o próprio must_have da plan
("`questionnaireDiasESessao.test.tsx` continua passando SEM modificação")
fosse verdadeiro. Sem escopo além do estritamente necessário — nenhuma
mudança de comportamento no `showAlert` no web (o branch web não foi tocado).

## Issues Encountered

Rodando os 3 arquivos de teste da `<verify>` juntos (`jest questionnaireDiasESessao.test.tsx questionnaireScreen.test.tsx doseCardioQuestionario.test.tsx`) aparece um warning de React ("Encountered two children with the same key, `90`") em `questionnaireScreen.test.tsx` quando executado em conjunto com outros arquivos — não trava nenhuma asserção (rodando `questionnaireScreen.test.tsx` sozinho: 18/18 passam) e é pré-existente ao escopo desta plan (chave duplicada em `TIME_OPTIONS`, fora dos arquivos modificados aqui). Registrado aqui para não mascarar o warning, não corrigido (fora do escopo — `src/constants/tempoTreino.ts` não está em `files_modified`).

## Ambiente (worktree)

Sem `node_modules` instalado no worktree; `package-lock.json` idêntico
(md5 `5d99d777d4943bea1e2ad78bbdd525b0`) ao do repositório principal no
commit-base — symlink `node_modules -> ../../../../ForcaApp/node_modules`
criado localmente para rodar `jest`/`tsc` sem reinstalar. Removido antes do
retorno (fora do controle de versão, `.gitignore` já cobre `node_modules/`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

7 dos 12 call sites de WEB-01 fechados (Plan 09-01: 4, Plan 09-02: 7 — total
11/12). Resta a Plan 09-03 (`JointLobbyScreen.tsx`, `PostQuestionnaireChat.tsx`)
em paralelo, e a Plan 09-04 (teste de regressão de cobertura total,
`alertNoAlertRemanescente.test.ts`). O fix de aridade em `alertShim.ts` desta
plan beneficia diretamente os call sites 2-arg que a Plan 09-03 for migrar.

## Self-Check: PASSED

Arquivos modificados confirmados em disco:
- src/screens/QuestionnaireScreen.tsx — FOUND, sem `Alert.` (grep vazio)
- src/screens/SignUpScreen.tsx — FOUND, sem `Alert.` (grep vazio)
- src/utils/alertShim.ts — FOUND

Commits confirmados em `git log --oneline`:
- 92d4abf — FOUND
- 7d09f31 — FOUND

---
*Phase: 09-fechamento-de-gaps-do-runtime-web*
*Completed: 2026-08-14*
