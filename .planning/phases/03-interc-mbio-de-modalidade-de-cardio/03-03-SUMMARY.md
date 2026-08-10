---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 03
subsystem: session-execution-ui
tags: [cardio, swap-modality, ui, session-queue, active-session]
dependency-graph:
  requires:
    - src/engine/sessionModel.ts (applyCardioSwapToDraft, DraftExercise.swappedFrom — Plano 03-02)
    - src/store/activeSessionStore.ts (swapExercise — Plano 03-02)
    - src/services/cardioModalidadesAceitasRepository.ts (getModalidadesAceitas — Plano 03-02)
    - src/components/session/SkipReasonSheet.tsx (molde de sheet)
    - src/components/progress/CardioPrescritoSection.tsx (molde de 3 estados erro/carregando/vazio)
  provides:
    - src/components/session/SwapModalitySheet.tsx (componente novo)
    - SessionQueue.tsx — prop onSolicitarTroca, botão "Trocar modalidade", rótulo "Trocado de X"
    - ActiveSessionScreen.tsx — estado troca/trocaBusy/modalidadesAceitas/modalidadesAceitasErro, onConfirmarTroca
  affects:
    - Plano 03-04 (SkipReasonSheet ramo sem_equipamento reaproveita SwapModalitySheet)
    - Plano 03-05 (histórico — não tocado por esta plan; sibling em worktree separado)
tech-stack:
  added: []
  patterns:
    - "Molde exato de SkipReasonSheet: Modal nativo + prop inline, backdrop, card, lista fechada radio-select"
    - "3 estados replicando CardioPrescritoSection.tsx: erro (Notice) > carregando (Skeleton) > vazio (EmptyState) > lista"
    - "Servidor primeiro, mesmo padrão de onConfirmarRecusa: falha não fecha o sheet nem aplica a troca"
    - "Busca lazy de modalidades aceitas: só na primeira vez que o aluno pede a troca"
key-files:
  created:
    - src/components/session/SwapModalitySheet.tsx
    - __tests__/swapModalitySheet.test.tsx
  modified:
    - src/components/session/SessionQueue.tsx
    - src/screens/ActiveSessionScreen.tsx
    - __tests__/activeSessionScreen.test.tsx
    - __tests__/cardioTempoDistancia.test.ts
decisions:
  - "SwapModalitySheet não coleta nota: swapExercise(exerciseId, toModality) não aceita nota nesta plan (Plano 03-02) — um campo de nota aqui pareceria funcionar mas seria descartado em silêncio."
  - "onRequestClose do Modal 'Ver andamento' também limpa o estado troca (não só recusa) — sem isso, fechar pelo botão físico Android deixaria o SwapModalitySheet externo reabrir com estado obsoleto."
metrics:
  duration: "~35min"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 9236
  tasks: 2
  commits: 2
---

# Phase 3 Plan 03: Entry point 1 — troca de modalidade na fila da sessão Summary

Entry point 1 do REQ-06 (ROADMAP Success Criterion 1): um exercício de cardio da fila da
sessão oferece "Trocar modalidade" ao lado de "Não vou fazer", listando só as modalidades
aceitas do usuário (D-02) via `SwapModalitySheet` — sheet novo, molde exato de
`SkipReasonSheet` sem campo de nota — e a troca confirmada fica visível na sessão ativa
como "Trocado de X" (metade "sessão ativa" de D-08). Consome inteiramente o motor/store
provados no tracer do Plano 03-02 (`applyCardioSwapToDraft`, `swapExercise`,
`getModalidadesAceitas`) — esta plan só adiciona a camada de apresentação.

## What Was Built

**Task 1 — `SwapModalitySheet.tsx` (sheet de escolha de modalidade)**

- Componente novo em `src/components/session/SwapModalitySheet.tsx`: Modal nativo/prop
  `inline`, backdrop, card com handle — mesma estrutura de `SkipReasonSheet.tsx`, SEM campo
  de nota opcional (a assinatura de `swapExercise` do store não aceita nota nesta plan).
- Três estados condicionais na mesma ordem de prioridade de
  `CardioPrescritoSection.tsx:60-81`: (1) `erro` → `Notice` tone="danger" com ação "Tentar
  novamente"; (2) `modalidades === null` → `Skeleton`; (3) `modalidades.length === 0` →
  `EmptyState` "Nenhuma modalidade cadastrada" (D-02 — nunca lista o catálogo inteiro); (4)
  lista fechada radio-select, excluindo a modalidade atual (evita troca-para-si-mesma).
- `useEffect` em `visible` reseta a seleção ao reabrir (mesmo padrão de `SkipReasonSheet`).
- 7 testes (`__tests__/swapModalitySheet.test.tsx`) cobrindo os 3 estados, lista fechada com
  `testID`/`accessibilityRole="radio"`, exclusão da modalidade atual, confirmação e
  busy/reset de seleção.

**Task 2 — Wire entry point 1: `SessionQueue` + `ActiveSessionScreen`**

- `SessionQueue.tsx`: prop opcional `onSolicitarTroca`; botão "Trocar modalidade"
  (`testID="swap-<exerciseId>"`) ao lado de "Não vou fazer", condicionado a
  `!foraDeJogo && isTimeBased(metricOf(ex))` — só exercícios de cardio/isometria oferecem a
  troca. Rótulo `Trocado de ${swappedFrom}` sob o nome, com prioridade entre `cutByReplan` e
  `meta` (mesma hierarquia de estados terminais).
- `ActiveSessionScreen.tsx`: estado `troca`/`trocaBusy`/`modalidadesAceitas`/
  `modalidadesAceitasErro`; `carregarModalidadesAceitas` (busca lazy — só na primeira vez que
  o aluno pede a troca); `onConfirmarTroca` — mesmo padrão servidor-primeiro de
  `onConfirmarRecusa`: falha chama `Alert.alert` e NÃO fecha o sheet nem aplica a troca;
  sucesso limpa o estado e fecha o Modal "Ver andamento". `SwapModalitySheet` renderizado
  nos DOIS pontos onde `SkipReasonSheet` já aparece (fora do Modal de andamento e inline
  dentro dele). `onRequestClose` do Modal também limpa `troca` (Rule 2 — sem isso, fechar
  pelo botão físico Android no Android deixaria o sheet externo reaparecer com estado
  obsoleto no próximo `render`).
- Testes: `cardioTempoDistancia.test.ts` ganha o mock de `swapSessionExercise` no factory do
  repositório, describe `'store: trocar modalidade de cardio'` (chamada correta ao
  repositório + draft atualizado), e 2 casos em `'fila de séries (SessionQueue)'` (botão
  condicionado à métrica — cardio tem, musculação não; rótulo "Trocado de X" após
  `applyCardioSwapToDraft`). `activeSessionScreen.test.tsx` ganha o mock de
  `cardioModalidadesAceitasRepository` e 2 casos novos no describe do modal Android (fluxo
  feliz: abre o sheet pela fila, confirma, `swapSessionExercise` é chamado e o modal fecha;
  fluxo de falha: `Alert.alert` é chamado e o sheet permanece aberto sem aplicar a troca).

## Deviations from Plan

**1. [Rule 2 — funcionalidade crítica ausente] `onRequestClose` do Modal "Ver andamento"
também limpa `troca`, não só `recusa`**
- **Found during:** Task 2, ao replicar o `onRequestClose` existente para o novo fluxo.
- **Issue:** o `onRequestClose` original só limpava `setRecusa(null)`; sem limpar `setTroca(null)`
  também, fechar o modal de andamento pelo botão físico Android com uma troca em
  aberto deixaria o `SwapModalitySheet` externo (fora do Modal) reaparecer com o estado
  `troca` ainda preenchido no próximo render — mesma classe de bug que o `onRequestClose`
  original já previne para `recusa`.
- **Fix:** adicionada `setTroca(null)` ao `onRequestClose`, ao lado de `setRecusa(null)`.
- **Files modified:** `src/screens/ActiveSessionScreen.tsx`.
- **Commit:** 479ff0e.

Nenhum outro desvio — plano executado como escrito, incluindo a decisão de não coletar nota
no `SwapModalitySheet` (já prevista no próprio plano, não é desvio).

## Verification

```
npx jest __tests__/swapModalitySheet.test.tsx __tests__/activeSessionScreen.test.tsx __tests__/cardioTempoDistancia.test.ts
  Test Suites: 3 passed, 3 total
  Tests:       52 passed, 52 total

npx jest __tests__/recusaDeclarada.test.ts __tests__/recusaDeclaradaFluxo.test.ts
  Test Suites: 2 passed, 2 total
  Tests:       22 passed, 22 total   (regressão: fiação nova não quebrou o fluxo de recusa)

npx tsc --noEmit
  sem erros

grep -n "swap-" src/components/session/SessionQueue.tsx
  142:                  testID={`swap-${ex.exerciseId}`}

grep -n "SwapModalitySheet" src/screens/ActiveSessionScreen.tsx
  53:import SwapModalitySheet from '../components/session/SwapModalitySheet';
  551:      <SwapModalitySheet   (fora do Modal de andamento)
  584:          <SwapModalitySheet   (inline dentro do Modal de andamento)
```

## Self-Check: PASSED

- FOUND: src/components/session/SwapModalitySheet.tsx
- FOUND: __tests__/swapModalitySheet.test.tsx
- FOUND commit 9677808 (feat(03-03): SwapModalitySheet — sheet de escolha de modalidade)
- FOUND commit 479ff0e (feat(03-03): entry point 1 — SessionQueue + ActiveSessionScreen)
