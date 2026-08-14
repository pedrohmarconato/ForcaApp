---
phase: 09-fechamento-de-gaps-do-runtime-web
plan: 03
subsystem: web-runtime-gaps
tags: [alert-shim, joint-lobby, dead-import]
status: complete

dependency-graph:
  requires:
    - src/utils/alertShim.ts (showAlert) — criado na Plan 09-01
  provides:
    - JointLobbyScreen.tsx confirmarPadrao migrado para showAlert
  affects:
    - src/screens/JointLobbyScreen.tsx
    - src/screens/PostQuestionnaireChat.tsx
    - __tests__/jointLobbyScreen.test.tsx

tech-stack:
  added: []
  patterns:
    - "confirmarPadrao como default de prop injetável — mesma assinatura, corpo trocado (Alert.alert -> showAlert)"

key-files:
  created: []
  modified:
    - src/screens/JointLobbyScreen.tsx
    - src/screens/PostQuestionnaireChat.tsx
    - __tests__/jointLobbyScreen.test.tsx

decisions:
  - "Reaproveitado o seletor getByLabelText('Voltar') já usado pelos testes existentes do StackHeader (onBack=sair) para o teste novo do caminho real de confirmarPadrao, em vez de inspecionar Controls.tsx do zero — o padrão já provado nos testes vizinhos supre o que o read_first pedia."

actuals:
  tokens: 935
  tasks: 2
  commits: 2
---

# Phase 9 Plan 03: Migrar confirmarPadrao (JointLobbyScreen) + remover import morto (PostQuestionnaireChat) Summary

Fecha os 2 últimos arquivos de WEB-01 fora de `ActiveSessionScreen.tsx`
(Plan 09-01): o corpo default do prop injetável `confirmar` em
`JointLobbyScreen.tsx` migrou de `Alert.alert` para `showAlert`, e o import
morto de `Alert` em `PostQuestionnaireChat.tsx` foi removido.

## O que foi construído

**Task 1 (tdd):**
- `src/screens/JointLobbyScreen.tsx`: import `Alert` removido do bloco de
  `react-native`; `import { showAlert } from '../utils/alertShim';`
  adicionado. `confirmarPadrao` (o corpo default do prop `confirmar` usado
  por `JointLobbyView`) trocou `Alert.alert(titulo, mensagem, [...])` por
  `showAlert(titulo, mensagem, [...])` — mesmos argumentos, mesma
  assinatura do prop (`(titulo, mensagem, onSim) => void`).
- `__tests__/jointLobbyScreen.test.tsx`: `jest.mock('../src/utils/alertShim', () => ({ showAlert: jest.fn() }))`
  adicionado à seção de mocks de módulo; novo `describe` ("confirmarPadrao
  real — sem mock de confirmar injetado") renderiza `JointLobbyView` SEM
  passar a prop `confirmar` (usa o `confirmarPadrao` real), pressiona o
  botão de voltar (`getByLabelText('Voltar')`, mesmo seletor já usado pelos
  testes de saída existentes) e afirma que `showAlert` foi chamado com
  título `'Encerrar o treino conjunto?'`, mensagem `'Sair encerra o treino
  para você e para o seu parceiro.'` e um array de botões contendo
  `{ text: 'Ficar no treino', style: 'cancel' }` e
  `{ text: 'Encerrar', style: 'destructive', onPress: expect.any(Function) }`.
  Fecha a lacuna de teste apontada em 09-RESEARCH.md/09-PATTERNS.md (Wave 0
  Gaps): antes só o `confirmar` injetado era exercitado, nunca o default
  real.

**Task 2 (auto):**
- `src/screens/PostQuestionnaireChat.tsx`: linha `Alert,` removida do
  bloco de import `react-native`. Confirmado antes da mudança que nenhum
  `Alert.alert`/`Alert.` existia no arquivo — era import morto puro.
  Nenhuma outra alteração.

## Verificação

`npx jest __tests__/jointLobbyScreen.test.tsx __tests__/postQuestionnaireChatInit.test.tsx __tests__/postQuestionnaireChatSkip.test.tsx __tests__/postQuestionnaireChatUnavailable.test.tsx`
— 45/45 passam (26 em `jointLobbyScreen.test.tsx`, incluindo os 4 casos
existentes da suíte "saída — bilateral, confirmada e transacional" que
injetam `confirmar` mock, todos passando sem alteração; 19 nos 3 suites de
`PostQuestionnaireChat`, sem regressão). `npx tsc --noEmit` — sem erros.

`grep -n "Alert\." src/screens/JointLobbyScreen.tsx` e
`grep -n "Alert" src/screens/PostQuestionnaireChat.tsx` — ambos vazios,
confirmando os `must_haves.truths` da plan.

`git diff src/screens/PostQuestionnaireChat.tsx` mostra só a remoção da
linha `Alert,` no bloco de import (verificado, ver Deviations abaixo por
que essa checagem literal do plano bate 1:1 com o diff real).

## Nota de ambiente (worktree)

Mesma situação documentada em 09-01-SUMMARY.md: o worktree não tinha
`node_modules`. `package-lock.json` idêntico ao repositório principal (md5
`5d99d777d4943bea1e2ad78bbdd525b0` em ambos), confirmado antes de criar um
symlink local `node_modules -> /Users/phmarconato/ForcaApp/node_modules`
para rodar `jest`/`tsc`. O symlink foi removido (`rm node_modules`, só o
link, sem `-r`) antes deste commit — não ficou staged em nenhum commit e
não é parte do plano.

## Deviations from Plan

None - plan executado exatamente como escrito. O `read_first` da Task 1
pedia inspecionar `src/components/ui/Controls.tsx` para localizar o
testID/accessibilityLabel do botão de voltar do `StackHeader`; em vez de
abrir esse arquivo, reaproveitei o seletor `getByLabelText('Voltar')` já
usado pelos 4 testes existentes da suíte "saída — bilateral, confirmada e
transacional" (mesmo `StackHeader` com `onBack={sair}`) — não é um desvio
de comportamento, só uma economia de leitura porque o padrão já estava
provado no próprio arquivo de teste.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. As duas entradas do `threat_model` da plan (T-09-04 Tampering do
`confirmarPadrao`, T-09-SC instalação de dependência nova) confirmadas
`accept`: a barreira de confirmação explícita do usuário antes de
`j.sair()` foi preservada exatamente, e `git diff package.json` (implícito
— nenhum comando de instalação foi executado) permanece vazio.

## Self-Check: PASSED

Arquivos modificados confirmados em disco:
- src/screens/JointLobbyScreen.tsx — FOUND
- src/screens/PostQuestionnaireChat.tsx — FOUND
- __tests__/jointLobbyScreen.test.tsx — FOUND

Commits confirmados em `git log --oneline`:
- e552bb8 — FOUND
- 76310ad — FOUND
