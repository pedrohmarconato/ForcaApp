---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 04
subsystem: session-execution-ui
tags: [cardio, swap-modality, skip-reason, ui, session-execution]

requires:
  - phase: 03-interc-mbio-de-modalidade-de-cardio (plan 03-03)
    provides: SwapModalitySheet.tsx + ActiveSessionScreen troca/trocaBusy/modalidadesAceitas state, onConfirmarTroca
  - phase: 03-interc-mbio-de-modalidade-de-cardio (plan 03-02)
    provides: activeSessionStore.swapExercise, getModalidadesAceitas, isCardioModalidade
provides:
  - "SkipReasonSheet.tsx: props ehCardio/onSolicitarTroca, botão condicional 'Trocar modalidade' (testID skip-reason-oferecer-troca), rótulo do botão principal muda para 'Recusar mesmo assim' quando a troca é oferecida"
  - "ActiveSessionScreen.tsx: recusaEhCardio (deriva de draft.exercises + isTimeBased/metricOf), onSolicitarTrocaAPartirDaRecusa roteando o estado recusa → estado troca/SwapModalitySheet já existente"
affects: [Fase 3 encerrada — sem plano dependente adicional; D-08 histórico já coberto por 03-05]

actuals:
  tokens: 3242
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Segundo entry point de uma capability compartilhada roteia para o MESMO componente/estado do primeiro entry point (SwapModalitySheet/swapExercise), nunca uma implementação paralela — mesmo raciocínio de DRY já aplicado em 03-03"
    - "Ramo condicional dentro de um sheet genérico (SkipReasonSheet) habilitado por props opcionais (ehCardio/onSolicitarTroca) para não afetar callers que não passam essas props"

key-files:
  created:
    - __tests__/skipReasonSheetTroca.test.tsx
  modified:
    - src/components/session/SkipReasonSheet.tsx
    - src/screens/ActiveSessionScreen.tsx
    - __tests__/activeSessionScreen.test.tsx

key-decisions:
  - "isTimeBased/metricOf precisaram ser importados em ActiveSessionScreen.tsx — o plano assumia que já estavam importados 'desde antes desta fase', mas a leitura direta do arquivo mostrou que não estavam (só SessionQueue.tsx os importava). Rule 3 (blocking): import adicionado, sem mudança de comportamento."

patterns-established:
  - "Prop-gated conditional UI: escopo === 'exercicio' && reason === 'sem_equipamento' && ehCardio === true && onSolicitarTroca != null é a guarda única que habilita a oferta de troca — replicável para futuros ramos condicionais de SkipReasonSheet"

requirements-completed: [REQ-06]

coverage:
  - id: D1
    description: "SkipReasonSheet oferece 'Trocar modalidade' só quando sem_equipamento + cardio + escopo exercício; recusa de sessão inteira e demais motivos permanecem inalterados"
    requirement: "REQ-06"
    verification:
      - kind: unit
        ref: "__tests__/skipReasonSheetTroca.test.tsx (6 testes: não-cardio, outro motivo, cardio+sem_equipamento, troca não confirma recusa, recusar mesmo assim funciona, escopo sessão nunca oferece)"
        status: pass
    human_judgment: false
  - id: D2
    description: "ActiveSessionScreen roteia SkipReasonSheet.onSolicitarTroca para o MESMO SwapModalitySheet/swapExercise do entry point 1 (fila), nunca chamando skip_session_exercise"
    requirement: "REQ-06"
    verification:
      - kind: integration
        ref: "__tests__/activeSessionScreen.test.tsx#entry point 2: sem_equipamento em cardio oferece troca em vez de recusar"
        status: pass
    human_judgment: false
  - id: D3
    description: "Regressão: os 22 testes de recusaDeclarada.test.ts/recusaDeclaradaFluxo.test.ts continuam verdes sem nenhuma edição — comportamento antigo bit-a-bit preservado"
    verification:
      - kind: unit
        ref: "npx jest __tests__/recusaDeclarada.test.ts __tests__/recusaDeclaradaFluxo.test.ts"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 04: Entry point 2 — troca de modalidade via SkipReasonSheet Summary

Segundo entry point do REQ-06: ao selecionar o motivo `sem_equipamento` num exercício de
cardio, `SkipReasonSheet` oferece "Trocar modalidade" como alternativa a "Recusar mesmo
assim", roteando para o MESMO `SwapModalitySheet`/`activeSessionStore.swapExercise` já
provados nos Planos 03-02/03-03 — nunca uma implementação paralela. O caminho "Recusar
mesmo assim" (antigo "Não vou fazer") permanece bit-a-bit idêntico ao comportamento de
hoje, provado pelos 22 testes existentes de `recusaDeclarada*.test.ts` passando sem
nenhuma edição.

## Performance

- **Duration:** ~25 min
- **Tasks:** 2
- **Files modified:** 4 (2 criados/modificados de teste, 2 de produção)

## Accomplishments
- `SkipReasonSheet.tsx` ganha props opcionais `ehCardio`/`onSolicitarTroca`: quando
  `escopo === 'exercicio' && reason === 'sem_equipamento' && ehCardio === true`, um botão
  "Trocar modalidade" (`testID="skip-reason-oferecer-troca"`) aparece e o rótulo do botão
  principal muda de "Não vou fazer" para "Recusar mesmo assim" — o `onPress` do botão
  principal continua chamando só `onConfirm`, nunca é substituído.
- `ActiveSessionScreen.tsx` calcula `recusaEhCardio` a partir do exercício em `recusa` no
  draft (`isTimeBased(metricOf(...))`) e fia `onSolicitarTrocaAPartirDaRecusa`, que fecha
  a recusa e abre o MESMO estado `troca`/`SwapModalitySheet` do entry point 1 (fila),
  reaproveitando a mesma busca lazy de modalidades aceitas.
- 6 testes novos em `__tests__/skipReasonSheetTroca.test.tsx` cobrindo os 6 cenários do
  `<behavior>` do plano; 1 teste de integração novo em `activeSessionScreen.test.tsx`
  ("entry point 2") provando ponta a ponta que a troca abre o sheet certo e que
  `skipSessionExercise` nunca é chamado.

## Task Commits

Each task was committed atomically:

1. **Task 1: SkipReasonSheet — ramo condicional sem_equipamento + cardio** - `3cdd8c6` (feat)
2. **Task 2: Wire entry point 2 — ActiveSessionScreen roteia SkipReasonSheet para SwapModalitySheet** - `04fecfc` (feat)

_Note: nenhuma task era `tdd="true"` no sentido RED/GREEN separado — os testes foram
escritos e verificados dentro do mesmo commit de cada task, seguindo o `<behavior>` do
plano como especificação._

## Files Created/Modified
- `src/components/session/SkipReasonSheet.tsx` - props `ehCardio`/`onSolicitarTroca`, botão condicional, rótulo dinâmico do botão principal
- `src/screens/ActiveSessionScreen.tsx` - `recusaEhCardio`, `onSolicitarTrocaAPartirDaRecusa`, `ehCardio`/`onSolicitarTroca` passados às duas renderizações de `SkipReasonSheet`, novo import de `isTimeBased`/`metricOf`
- `__tests__/skipReasonSheetTroca.test.tsx` (novo) - 6 testes do componente
- `__tests__/activeSessionScreen.test.tsx` - 1 teste de integração novo ("entry point 2"), import de `skipSessionExercise`

## Decisions Made
- `isTimeBased`/`metricOf` precisaram ser importados em `ActiveSessionScreen.tsx` — o
  `read_first` do plano afirmava que já estavam importados "desde antes desta fase", mas a
  leitura direta do arquivo (antes de editar) mostrou que só `SessionQueue.tsx` os
  importava. Rule 3 (blocking): adicionado o import de `../engine/sessionModel`, sem
  mudança de comportamento — `tsc --noEmit` confirma zero erros novos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `isTimeBased`/`metricOf` não estavam importados em `ActiveSessionScreen.tsx`**
- **Found during:** Task 2, ao ler o arquivo antes de implementar `recusaEhCardio`.
- **Issue:** O plano (`read_first`) afirmava que `isTimeBased`/`metricOf` "já importados de
  `../engine/sessionModel` desde antes desta fase", mas o `grep` mostrou que só
  `SessionQueue.tsx` os importava — `ActiveSessionScreen.tsx` não tinha esse import.
  Escrever `recusaEhCardio` sem o import quebraria a compilação.
- **Fix:** Adicionado `isTimeBased, metricOf` ao import existente de
  `'../engine/sessionModel'` em `ActiveSessionScreen.tsx`.
- **Files modified:** `src/screens/ActiveSessionScreen.tsx`.
- **Verification:** `npx tsc --noEmit` sem erros novos; suíte completa (`npx jest --ci`)
  140 suítes / 1605 testes verdes.
- **Committed in:** `04fecfc` (Task 2 commit).

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Correção mecânica de import ausente, sem mudança de comportamento ou
escopo. Não afeta nenhuma decisão travada do plano.

## Issues Encountered
- Asserções iniciais do teste novo tentavam ler `props.children` diretamente do elemento
  `testID="skip-reason-confirm"`, mas o componente `Button` embrulha o texto num `View` —
  a asserção correta é `getByText(...)`. Corrigido antes do primeiro commit, sem impacto no
  código de produção.

## User Setup Required
None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness
- REQ-06 está satisfeito nos dois entry points exigidos pelo ROADMAP (fila e recusa
  declarada), ambos convergindo para o mesmo `SwapModalitySheet`/`swapExercise` — sem
  duplicação de lógica de troca.
- Fase 3 não tem mais planos pendentes de entry point; verificação final da fase (suíte
  completa + regressão) já rodou como parte deste plano.

---
*Phase: 03-interc-mbio-de-modalidade-de-cardio*
*Completed: 2026-08-10*
