---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 09
subsystem: ui
tags: [cardio, ux, troca-de-modalidade, react-native]
dependency-graph:
  requires:
    - phase: 03-interc-mbio-de-modalidade-de-cardio
      provides: "guard client-side de CR-01 em activeSessionStore.swapExercise (alvo.sets.some(s => s.status === 'done'))"
  provides:
    - "condição estendida do botão 'Trocar modalidade' em SessionQueue.tsx (mesmo predicado do guard de CR-01)"
    - "recusaEhCardio estendida em ActiveSessionScreen.tsx, fechando o segundo entry point via SkipReasonSheet.ofereceTroca"
  affects: []
tech-stack:
  added: []
  patterns:
    - "predicado de série concluída (sets.some(s => s.status === 'done')) reaproveitado nos dois entry points de UI a partir da mesma fonte de verdade do guard client-side, em vez de duplicar a checagem no servidor"
key-files:
  created: []
  modified:
    - src/components/session/SessionQueue.tsx
    - src/screens/ActiveSessionScreen.tsx
    - __tests__/activeSessionScreen.test.tsx
decisions:
  - "Nenhuma decisão nova — plano seguiu a decisão do dono (owner_decisions, 'IN — UX') à risca: esconder o caminho ANTES do aluno entrar nele, reaproveitando o mesmo predicado do guard de CR-01 em vez de duplicar a lógica de recusa."
metrics:
  duration: "~10min"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 1530
  tasks: 1
  commits: 1
requirements: [REQ-06]
coverage:
  - id: D1
    description: "Botão 'Trocar modalidade' da fila (SessionQueue.tsx) some quando qualquer série do exercício já está status 'done'"
    requirement: "REQ-06"
    verification:
      - kind: automated_ui
        ref: "__tests__/activeSessionScreen.test.tsx#entry point 1: some \"Trocar modalidade\" quando a série já está concluída"
        status: pass
    human_judgment: false
  - id: D2
    description: "CTA 'Trocar modalidade em vez de recusar' dentro de SkipReasonSheet (ramo sem_equipamento) some nas mesmas condições, e o botão de confirmação volta ao rótulo padrão 'Não vou fazer'"
    requirement: "REQ-06"
    verification:
      - kind: automated_ui
        ref: "__tests__/activeSessionScreen.test.tsx#entry point 2: SkipReasonSheet não oferece troca quando a série já está concluída"
        status: pass
    human_judgment: false
  - id: D3
    description: "Botão 'Não vou fazer' continua visível e funcional nas mesmas condições de antes"
    requirement: "REQ-06"
    verification:
      - kind: automated_ui
        ref: "__tests__/activeSessionScreen.test.tsx#entry point 1: some \"Trocar modalidade\" quando a série já está concluída"
        status: pass
    human_judgment: false
---

# Phase 3 Plan 09: Fecha o dead-end de UX da troca de modalidade após série concluída Summary

Os dois entry points da troca de modalidade (botão "Trocar modalidade" na fila e a CTA
dentro de `SkipReasonSheet` no ramo `sem_equipamento`) agora somem assim que qualquer série
do exercício já está `status: 'done'` — mesmo predicado do guard client-side de CR-01 em
`activeSessionStore.swapExercise`, fechando o beco sem saída registrado no 03-UAT.md teste 5
(caveat).

## What Was Built

- **`src/components/session/SessionQueue.tsx`** (linha 117): condição de exibição do botão
  "Trocar modalidade" ganhou `&& !ex.sets.some((s) => s.status === 'done')`, reaproveitando
  exatamente o predicado do guard de CR-01 (`activeSessionStore.ts:1518`). O botão "Não vou
  fazer" (linha 106) e `exercicioForaDeJogo` (`sessionModel.ts:554-556`) não foram tocados —
  recusar uma série já feita continua fazendo sentido, só a TROCA precisava da guarda nova.
- **`src/screens/ActiveSessionScreen.tsx`** (linha 364): `recusaEhCardio` ganhou o mesmo
  predicado (`&& !recusaExercicio.sets.some((s) => s.status === 'done')`). Como
  `SkipReasonSheet.ofereceTroca` já deriva inteiramente do prop `ehCardio` recebido de fora,
  nenhuma edição foi necessária em `SkipReasonSheet.tsx` — com `recusaEhCardio=false`, o
  componente cai sozinho no ramo sem oferta de troca (CTA `skip-reason-oferecer-troca`
  ausente, rótulo do botão principal volta a `'Não vou fazer'`).
- **`__tests__/activeSessionScreen.test.tsx`**: 2 testes novos, reaproveitando a fixture
  `detailComCardio` e o padrão já estabelecido de `useActiveSessionStore.setState(...)` para
  precondicionar o draft sem dirigir a UI de medição do `SessionPlayer` — um por entry point,
  ambos precondicionando a única série do exercício de cardio como `done` e provando que a
  opção de troca desaparece (fila) e que o `SkipReasonSheet` não oferece a CTA nem troca o
  rótulo do botão de confirmação (segundo entry point).

## Deviations from Plan

None — plano executado exatamente como escrito. Task 1 (`type="tracer"`) foi commitado como
`auto`: implementação real, `<verify>` real, commit atômico. Como esta plan tem uma única
task (sem tasks de expansão depois dela) e o `<verify>` do tracer é inteiramente automatizado
(`npx jest ... && npx tsc --noEmit`, sem passo manual/UI), o gate de feedback do tracer foi
satisfeito pela própria verificação automatizada já executada e verde (12/12 testes, tsc
limpo) — não havia checkpoint humano substantivo a fazer nem task de expansão a proteger.

## Known Stubs

None.

## Threat Flags

None — nenhuma superfície nova além do já registrado no `<threat_model>` do plano (T-03-13,
aceito: mudança puramente de renderização client-side, a autorização real continua no
guard de `swapExercise`/servidor).

## Verification

- `npx jest __tests__/activeSessionScreen.test.tsx` — 12/12 passed (10 pré-existentes sem
  edição de asserção + 2 novos).
- `npx tsc --noEmit` — sem erros.
- `grep -n "isTimeBased(metricOf(ex))" src/components/session/SessionQueue.tsx` — condição
  estendida com `!ex.sets.some`.
- `grep -n "recusaEhCardio =" src/screens/ActiveSessionScreen.tsx` — condição estendida com
  `!recusaExercicio.sets.some`.

## Self-Check: PASSED

- FOUND: src/components/session/SessionQueue.tsx (condição estendida na linha 117-120)
- FOUND: src/screens/ActiveSessionScreen.tsx (condição estendida na linha 364-367)
- FOUND: __tests__/activeSessionScreen.test.tsx (2 testes novos presentes)
- FOUND commit 768ac1c (feat(03-09): esconde entry points de troca após série concluída)
