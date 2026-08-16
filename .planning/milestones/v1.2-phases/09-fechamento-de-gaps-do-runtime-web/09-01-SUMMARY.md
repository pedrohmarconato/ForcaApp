---
phase: 09-fechamento-de-gaps-do-runtime-web
plan: 01
subsystem: web-runtime-gaps
tags: [alert-shim, wake-lock, active-session, pwa]
status: complete

dependency-graph:
  requires: []
  provides:
    - src/utils/alertShim.ts (showAlert)
    - src/store/alertStore.ts (useAlertStore, AlertButton)
    - src/components/AlertHost.tsx (default export, mounted in App.tsx)
  affects:
    - src/screens/ActiveSessionScreen.tsx
    - App.tsx

tech-stack:
  added: []
  patterns:
    - "Platform.OS shim (isWeb branch) — molde de src/utils/haptics.ts e src/services/auth/secureStorage.ts"
    - "Zustand single-slot store para estado de UI global (molde src/store/manualPlanStore.ts)"
    - "useEffect com cleanup por status (Wake Lock) em vez de hook incondicional sem tag"

key-files:
  created:
    - src/store/alertStore.ts
    - src/utils/alertShim.ts
    - src/components/AlertHost.tsx
    - __tests__/alertHostWeb.test.tsx
    - __tests__/alertShim.test.ts
  modified:
    - App.tsx
    - src/screens/ActiveSessionScreen.tsx
    - __tests__/activeSessionScreen.test.tsx

decisions:
  - "AlertButton definido em alertStore.ts (não em alertShim.ts) para evitar dependência circular entre os dois módulos novos — alertShim importa o tipo de lá."
  - "Task 1 (tracer) migrou só o call site 'Concluir treino?' para provar a arquitetura ponta a ponta antes de migrar os 3 call sites restantes na Task 2."
  - "Wake Lock: dois useEffect(s) dependentes de [status], não um único hook condicional — ativa/desativa em active/awaiting_checkin, sempre libera fora desses estados (incluindo finished e unmount)."

actuals:
  tokens: 5518
  tasks: 2
  commits: 2
---

# Phase 9 Plan 01: alertShim + AlertHost + Wake Lock lifecycle Summary

Núcleo de WEB-01 (shim central de `Alert.alert` com `AlertHost` custom no web) e
SESS-01 (ciclo de vida correto do Wake Lock via `activateKeepAwakeAsync`/
`deactivateKeepAwake` por status, com readquisição em `visibilitychange`),
provado ponta a ponta em `ActiveSessionScreen.tsx`.

## O que foi construído

**Task 1 (tracer, tdd):**
- `src/store/alertStore.ts` — Zustand, slot único `current`, ações `show`/`dismiss`,
  exporta o tipo `AlertButton`.
- `src/utils/alertShim.ts` — `showAlert(title, message?, buttons?)` com a mesma
  assinatura de `Alert.alert`; repasse puro para `Alert.alert` real no nativo
  (`Platform.OS !== 'web'`, D-03); no web escreve no `alertStore`.
- `src/components/AlertHost.tsx` — Modal custom (backdrop `Pressable` + card),
  renderiza `null` sem alerta ativo, botão default `[{ text: 'OK' }]` quando
  `buttons` é `null`, estilo `destructive` usa `theme.colors.status.danger`.
- `App.tsx` monta `<AlertHost />` dentro de `<AuthProvider>`, irmã de
  `<RootNavigator />` (D-04).
- `ActiveSessionScreen.tsx`: diálogo "Concluir treino?" (o de maior prioridade —
  critério de sucesso 2 do ROADMAP) migrado de `Alert.alert` para `showAlert`.
  `useKeepAwake()` sem tag substituído por `activateKeepAwakeAsync`/
  `deactivateKeepAwake` com `WAKE_LOCK_TAG = 'active-session'` definida no
  escopo do módulo: um `useEffect([status])` ativa em `active`/`awaiting_checkin`
  e desativa (via cleanup ou diretamente) em qualquer outro estado; um segundo
  `useEffect([status])` registra `visibilitychange` (guardado por
  `typeof document === 'undefined'`) e readquire o lock quando a aba volta a
  ficar visível (D-07).

**Task 2 (auto):**
- Os 3 call sites restantes (`onConfirmarRecusa`, `onConfirmarTroca`, o catch de
  `finalizar` dentro de `onConcluirTreino`) migrados de `Alert.alert` para
  `showAlert`, argumentos idênticos.
- Import de `Alert` removido de `react-native` em `ActiveSessionScreen.tsx` —
  nenhum call site restante o usava.
- `__tests__/alertShim.test.ts` novo: prova D-03 (repasse nativo puro, `alertStore`
  nunca tocado no nativo).

## Verificação

`npx jest __tests__/alertHostWeb.test.tsx __tests__/alertShim.test.ts __tests__/activeSessionScreen.test.tsx`
— 21/21 passam. `npx tsc --noEmit` — sem erros. Também rodados (fora do
`files_modified` da plan, para checar regressão em quem importa
`ActiveSessionScreen`): `jointTrainingGate.test.tsx`, `jointSoloNaoRegride.test.tsx`,
`replanScreenFlow.test.tsx` (55/55) e `questionnaireDiasESessao.test.tsx` (5/5,
prova que o `Alert.alert` nativo do `QuestionnaireScreen` — fora de escopo desta
plan — segue intacto). `App.tsx` monta `<AlertHost />`; `ActiveSessionScreen.tsx`
não importa mais `useKeepAwake`.

`git diff package.json` entre o início e o fim da plan: vazio — nenhuma
dependência nova instalada (confirma a disposição `accept` de T-09-SC).

## Nota de ambiente (worktree)

O worktree não tinha `node_modules` instalado. `package-lock.json` é idêntico
ao do repositório principal (mesmo commit-base `3ce14cb`), então um symlink
`node_modules -> ../../../node_modules` foi criado localmente para rodar
`jest`/`tsc` sem reinstalar 700+ pacotes. O symlink está fora do controle de
versão (`node_modules/` já é ignorado por `.gitignore`) e não foi staged em
nenhum commit — é um artefato só deste ambiente de execução, não parte do
plano.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `jest.mock('react-native', () => ({...jest.requireActual(...)}))` quebra o ambiente de teste**
- **Found during:** Task 1, escrevendo `__tests__/alertHostWeb.test.tsx` conforme
  o molde literal do plano.
- **Issue:** Reimportar `react-native` inteiro dentro da factory do
  `jest.mock` (`jest.requireActual('react-native')`) reexecuta o registro de
  TurboModules do RN e derruba o teste com
  `Invariant Violation: TurboModuleRegistry.getEnforcing(...): 'DevMenu' could not be found`.
- **Fix:** Troquei pelo molde já usado em `__tests__/activeSessionScreen.test.tsx`
  (`Object.getOwnPropertyDescriptor(Platform, 'OS')` + `Object.defineProperty`
  em `beforeAll`/`afterAll`), que muta só `Platform.OS` sem reimportar o
  módulo nativo.
- **Files modified:** `__tests__/alertHostWeb.test.tsx`.
- **Commit:** e17e95b.

**2. [Rule 1 - Bug] `document` não existe no ambiente de teste (`react-native/jest-preset`, Node puro)**
- **Found during:** Task 1, teste D-07 (readquisição em `visibilitychange`).
- **Issue:** O preset `jest-expo`/`react-native/jest-preset` roda em Node puro
  — sem `document`/`window` globais (mesmo motivo pelo qual
  `secureStorageWeb.test.ts` já precisa de um `localStorage` de mentira).
  `document.dispatchEvent(new Event('visibilitychange'))` do plano falhava com
  `ReferenceError: document is not defined`.
- **Fix:** `document` de mentira (`Object.assign(new EventTarget(), { visibilityState: 'hidden' })`,
  `EventTarget`/`Event` são globais nativos do Node ≥15) instalado via
  `Object.defineProperty(globalThis, 'document', ...)` em `beforeAll`/`afterAll`
  do describe `Wake Lock lifecycle (SESS-01)`, mesmo raciocínio do
  `localStorage` fake de `secureStorageWeb.test.ts`.
- **Files modified:** `__tests__/activeSessionScreen.test.tsx`.
- **Commit:** e17e95b.

### Acceptance-criteria greps com falso positivo (documentado, não é bug de código)

O plano especifica dois greps de aceite cuja regex casa com texto legítimo
introduzido por esta própria plan — são limitações da regex, não defeitos:

- `grep -n "import.*Alert" src/screens/ActiveSessionScreen.tsx` — o plano
  espera vazio ("import removido"), mas a linha
  `import { showAlert } from '../utils/alertShim';` contém as substrings
  `import` e `Alert` (dentro de `showAlert`) e por isso a regex casa. O que
  importa de verdade — `import { Alert } from 'react-native'` — foi removido
  (confirmado por `npx tsc --noEmit` sem erro de símbolo não usado/ausente e
  pela ausência total de `Alert.alert(` no arquivo, ambos verificados acima).
- `grep -rn 'window\.\(alert\|confirm\)' src/` — o plano espera vazio, mas o
  comentário de `AlertHost.tsx` linha 3 ("nunca window.alert/window.confirm")
  menciona as duas APIs por nome para documentar a decisão D-02. Nenhuma
  chamada real a `window.alert`/`window.confirm` existe no código — só a
  string do comentário casa com a regex.

Nenhum dos dois altera comportamento; registrados aqui para não mascarar a
divergência entre "grep passou literalmente" e "grep expressava a intenção
certa".

## Known Stubs

Nenhum. Os três artefatos novos (`alertStore.ts`, `alertShim.ts`,
`AlertHost.tsx`) estão totalmente cabeados: `AlertHost` é montado em `App.tsx`,
`showAlert` é chamado por 4 call sites reais em `ActiveSessionScreen.tsx`, e o
ciclo de vida do Wake Lock está ligado ao `status` real do
`activeSessionStore`.

## Threat Flags

Nenhum. As três entradas do `threat_model` da plan (T-09-01 DoS do Wake Lock,
T-09-02 Tampering do alertShim/AlertHost, T-09-03 Elevation via
`navigator.wakeLock.request`) foram implementadas exatamente como descrito —
sem superfície nova além da já registrada. T-09-SC (instalação de dependência
nova) confirmado `accept`: `git diff package.json` vazio.

## Self-Check: PASSED

Arquivos criados confirmados em disco:
- src/store/alertStore.ts — FOUND
- src/utils/alertShim.ts — FOUND
- src/components/AlertHost.tsx — FOUND
- __tests__/alertHostWeb.test.tsx — FOUND
- __tests__/alertShim.test.ts — FOUND

Commits confirmados em `git log --oneline`:
- e17e95b — FOUND
- b616ab1 — FOUND
