---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 02
subsystem: session-execution
tags: [cardio, swap-modality, engine, repository, store, tdd]
dependency-graph:
  requires:
    - src/engine/sessionModel.ts (applyExerciseSkipToDraft — molde de imutabilidade)
    - src/services/sessionExecutionRepository.ts (skipSessionExercise/getOpenSessionLog — molde servidor-primeiro)
    - src/store/activeSessionStore.ts (skipExercise/applyServerSetLogs — ponto único de reconciliação)
    - src/constants/cardioModalidades.ts (CARDIO_MODALIDADES/CARDIO_MODALIDADES_COM_DISTANCIA)
    - supabase/migrations 0034 (RPC swap_session_exercise — Plano 03-01, não tocado aqui)
  provides:
    - applyCardioSwapToDraft (sessionModel.ts)
    - isCardioModalidade (cardioModalidades.ts)
    - swapSessionExercise + ServerCardioSwap + OpenSessionLog.exerciseSwaps (sessionExecutionRepository.ts)
    - swapExercise (activeSessionStore.ts)
    - getModalidadesAceitas (cardioModalidadesAceitasRepository.ts — arquivo novo)
  affects:
    - Plano 03-03 (entry point fila + SwapModalitySheet, consome swapExercise + getModalidadesAceitas)
    - Plano 03-04 (SkipReasonSheet ramo sem_equipamento, mesmo swapExercise)
    - Plano 03-05 (histórico, consome swappedFrom no draft persistido)
tech-stack:
  added: []
  patterns:
    - "Servidor primeiro: RPC confirma antes de tocar o draft local (mesmo padrão de skipExercise)"
    - "Ponto único de reconciliação: applyServerSetLogs reaplica trocas do servidor na retomada (comTrocas), mesmo raciocínio de comRecusas"
    - "Leitura estrita de fallback vazio: ausência de declaração nunca vira 'aceita tudo' (D-02)"
key-files:
  created:
    - src/services/cardioModalidadesAceitasRepository.ts
    - __tests__/cardioSwap.test.ts
    - __tests__/cardioSwapFluxo.test.ts
    - __tests__/cardioModalidadesAceitas.test.ts
  modified:
    - src/engine/sessionModel.ts
    - src/constants/cardioModalidades.ts
    - src/services/sessionExecutionRepository.ts
    - src/store/activeSessionStore.ts
decisions:
  - "D-02 estrito confirmado na implementação: getModalidadesAceitas devolve [] para null/ausente/vazio, nunca as 9 modalidades do catálogo — decisão já registrada no plano, aqui só verificada por teste."
  - "toModality de swapExercise chamado com note: null nesta plan — a UI de nota (se vier a existir) fica a critério dos planos 03-03/03-04, que já podem passar um valor real ao swapExercise no futuro sem mudar a assinatura."
metrics:
  duration: "~35min"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 9031
  tasks: 2
  commits: 2
---

# Phase 3 Plan 02: Motor de troca de modalidade de cardio (tracer) Summary

TRACER da Fase 3: motor puro de troca de modalidade (`applyCardioSwapToDraft`), repositório
de escrita/leitura server-first (`swapSessionExercise` + `OpenSessionLog.exerciseSwaps`),
ação `swapExercise` no store seguindo o padrão servidor-primeiro-depois-draft de
`skipExercise`, reconciliação na retomada pelo mesmo ponto único que já reaplica recusas, e
o primeiro repositório de leitura de "modalidades aceitas" (`cardio_modalidades`) que o
cliente jamais teve fora do onboarding — tudo provado por 17 testes automatizados reais
(store↔repositório mockado, não manual), antes de qualquer botão de UI.

## What Was Built

**Task 1 — Motor de troca (D-01/D-04) + repositório de escrita + store, servidor primeiro**

- `isCardioModalidade` em `src/constants/cardioModalidades.ts` — type guard, molde exato de
  `isSkipReason`.
- `applyCardioSwapToDraft(draft, exerciseId, toModality)` em `src/engine/sessionModel.ts`:
  troca `name` para a nova modalidade, preserva `targetDurationSeconds` de toda série
  (D-01), zera `targetDistanceM` de toda série (D-01 — a distância prescrita da original
  nunca vira meta da nova), atualiza `metric` para `'tempo_distancia'` ou `'tempo'` conforme
  `CARDIO_MODALIDADES_COM_DISTANCIA` (D-04 — o que liga/desliga o campo de distância
  REALIZADA em `SessionPlayer.tsx` sem tocar aquele arquivo), grava `swappedFrom` com
  `ex.swappedFrom ?? ex.name` (preserva a origem VERDADEIRA em trocas encadeadas, D-08).
  Campo `DraftExercise.swappedFrom?: string | null` adicionado ao lado de `skipNote`.
- `swapSessionExercise` + tipo `ServerCardioSwap` + campo `OpenSessionLog.exerciseSwaps` em
  `src/services/sessionExecutionRepository.ts` — mesmo shape exato de `skipSessionExercise`/
  `exerciseSkips`: RPC `swap_session_exercise`, `.select(...)` de `getOpenSessionLog`
  estendido com a sibling relation `cardio_exercise_swaps(planned_exercise_id, to_modality,
  note)`, linha malformada (nome fora do catálogo) descartada via `isCardioModalidade`, nunca
  coagida.
- `swapExercise` no store (`src/store/activeSessionStore.ts`): valida draft/sessionLogId,
  guarda de toque duplo, chama `swapSessionExercise` (servidor PRIMEIRO) dentro de
  try/catch, só depois aplica `applyCardioSwapToDraft` ao draft local, limpa
  `pendingAdaptation` do exercício trocado, tenta `saveDraft` não-fatal — shape idêntico a
  `skipExercise`.
- `applyServerSetLogs` estendido: reduce `comTrocas` sobre `aberta.exerciseSwaps ?? []`,
  aplicado DEPOIS de `comRecusas` — mesmo ponto único de reconciliação que já reaplica
  recusas na retomada (local e reconstruída pelo servidor).

**Task 2 — Repositório de "modalidades aceitas" (D-02, capability nova)**

- `src/services/cardioModalidadesAceitasRepository.ts` (arquivo novo): `getModalidadesAceitas(userId)`
  lê `questionario_usuario.cardio_modalidades` via `.maybeSingle()`, relança erro do
  Supabase sempre, filtra por `isCardioModalidade`. Decisão documentada no header e no
  código: leitura ESTRITA de D-02 — `null`/ausente/`[]` devolve `[]` sempre, nunca as 9
  modalidades do catálogo (distinto do comentário da migration 0021, que descreve o
  GERADOR de plano, não esta tela).

## Deviations from Plan

None — plano executado exatamente como escrito. `note: null` fixo em `swapExercise` (a UI de
nota fica a critério dos Planos 03-03/03-04, previsto no próprio plano) não é desvio: a
assinatura já aceita o parâmetro, só não há UI nesta plan (tracer sem UI, por design).

## Verification

```
npx jest __tests__/cardioSwap.test.ts __tests__/cardioSwapFluxo.test.ts __tests__/cardioModalidadesAceitas.test.ts
  Test Suites: 3 passed, 3 total
  Tests:       17 passed, 17 total

npx jest __tests__/recusaDeclaradaFluxo.test.ts
  Test Suites: 1 passed, 1 total
  Tests:       9 passed, 9 total   (regressão: extensão de applyServerSetLogs não quebrou reconciliação de recusas)

npx jest __tests__/cardioTempoDistancia.test.ts -t "outcome de cardio"
  Tests: 4 passed, 4 total   (D-07: computeCardioOutcome cego a modalidade, sem edição — prova de regressão)

npx tsc --noEmit
  sem erros

grep -n "swapExercise" src/store/activeSessionStore.ts
  183:  swapExercise: (exerciseId: string, toModality: CardioModalidade) => Promise<boolean>;
  1503:  swapExercise: async (exerciseId, toModality) => {

grep -n "cardio_modalidades" src/services/cardioModalidadesAceitasRepository.ts
  confirma leitura da coluna correta (.select('cardio_modalidades'))
```

## Self-Check: PASSED

- FOUND: src/services/cardioModalidadesAceitasRepository.ts
- FOUND: __tests__/cardioSwap.test.ts
- FOUND: __tests__/cardioSwapFluxo.test.ts
- FOUND: __tests__/cardioModalidadesAceitas.test.ts
- FOUND commit 162db06 (feat(03-02): motor de troca de modalidade de cardio, servidor primeiro)
- FOUND commit 8ae045d (feat(03-02): repositório de modalidades de cardio aceitas (D-02 estrito))
