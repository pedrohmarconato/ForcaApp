---
phase: 03-interc-mbio-de-modalidade-de-cardio
plan: 06
subsystem: cardio-progress
tags: [cardio, progresso, motor-puro, ui]
dependency-graph:
  requires: []
  provides:
    - "distanciaRealizadaSemanaM (src/engine/cardioGoals.ts)"
    - "ProgressoPrescrito.realizadoKm/.fracaoKm (src/engine/cardioPrescrito.ts)"
    - "linha de km prescrito × realizado (CardioPrescritoSection.tsx)"
  affects:
    - "src/components/progress/CardioPrescritoSection.tsx"
tech-stack:
  added: []
  patterns:
    - "motor puro sem I/O, mesmo corte de semana (inicioDaSemana) de progressoConsistencia"
    - "sem amostra = null; zero é fato só quando existe prescrição comparável"
key-files:
  created: []
  modified:
    - src/engine/cardioGoals.ts
    - src/engine/cardioPrescrito.ts
    - src/components/progress/CardioPrescritoSection.tsx
    - __tests__/cardioGoals.test.ts
    - __tests__/cardioPrescrito.test.ts
    - __tests__/cardioPrescritoSecao.test.tsx
decisions:
  - "Nenhuma decisão nova — plano seguiu D-05/D-06 do CONTEXT.md à risca (soma total sem separação por modalidade; prescrito permanece cheio)."
metrics:
  duration: "~15min"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 2382
  tasks: 2
  commits: 3
requirements: [REQ-06]
---

# Phase 3 Plan 06: Km prescrito × realizado na aba Progresso (D-05/D-06) Summary

Aba Progresso agora soma o km REALIZADO da semana de qualquer modalidade de cardio
(trocada ou não) num total único, comparado ao km PRESCRITO — que permanece cheio, sem
desconto por sessão trocada, atendendo o Success Criterion 3 do ROADMAP da Fase 3.

## What Was Built

- **`distanciaRealizadaSemanaM(logs, referencia)`** (`src/engine/cardioGoals.ts`): função
  pura nova, ao lado de `progressoConsistencia`. Soma `distanceM` de todo `CardioLog` cuja
  `completedAt` cai na semana de referência (mesmo corte `inicioDaSemana` + janela de 7
  dias), independente do nome/modalidade do exercício ("km é km", D-05). Devolve `null`
  quando nenhum log da janela tem distância — nunca `0` inventado.
- **`ProgressoPrescrito.realizadoKm`/`.fracaoKm`** (`src/engine/cardioPrescrito.ts`):
  `progressoPrescrito` agora calcula `distanciaRealizadaSemanaM` uma vez e expõe
  `realizadoKm` (km realizado, `0` é fato quando há prescrição de km mas nenhuma amostra;
  `null` quando não há prescrição de km — nada a comparar) e `fracaoKm` (0..1, mesmo
  padrão de `fracaoMinutos`/`fracaoSessoes`). O lado PRESCRITO (`prescritoKm`,
  `prescritoSessoes`, `duracaoSegundos`) permanece intocado — `somarPrescricaoSemana` e
  `getPrescricaoSemanaCorrente`/`cardioPrescritoRepository.ts` não foram tocados (D-06),
  confirmado por `git diff` vazio.
- **Linha "X de Y km" com barra** (`src/components/progress/CardioPrescritoSection.tsx`):
  nova seção condicional entre o bloco de minutos e o de sessões, replicando o molde
  existente (`Text` + `ProgressTrack`, reaproveitando `styles.detalhe`/`styles.barra`).
  Aparece só quando `progresso.prescritoKm != null`; sem km prescrito, nenhuma linha de km
  é renderizada (nem "0 de 0 km").

## Deviations from Plan

None — plano executado exatamente como escrito. Task 1 seguiu RED→GREEN (TDD): 8 testes
novos escritos primeiro (falharam confirmadamente), depois implementação fez os 38 testes
de `cardioGoals.test.ts`+`cardioPrescrito.test.ts` passarem (30 pré-existentes + 8 novos).
Task 2 seguiu o mesmo padrão teste-antes-de-implementar (não exigido por `tdd="true"`, mas
aplicado por disciplina) — 2 testes novos, 12/12 passando ao final.

## Known Stubs

None.

## Threat Flags

None — nenhuma superfície nova além do já registrado no `<threat_model>` do plano
(T-03-10, aceito: motor puro sem I/O, sem input externo além de dado já lido via RLS).

## Verification

- `npx jest __tests__/cardioGoals.test.ts __tests__/cardioPrescrito.test.ts __tests__/cardioPrescritoSecao.test.tsx` — 50/50 passed.
- `npx tsc --noEmit` — sem erros.
- `git diff src/services/cardioPrescritoRepository.ts` (desde a base do plano) — vazio; último commit a tocar o arquivo é da Fase 1 (#77), confirmando que esta plan não alterou o lado prescrito.

## Self-Check: PASSED

- FOUND: src/engine/cardioGoals.ts (distanciaRealizadaSemanaM presente)
- FOUND: src/engine/cardioPrescrito.ts (realizadoKm/fracaoKm presentes)
- FOUND: src/components/progress/CardioPrescritoSection.tsx (linha de km presente)
- FOUND commit 5a1e7d8 (test RED)
- FOUND commit bc5f4de (feat GREEN — motor)
- FOUND commit 74db237 (feat — UI)

## TDD Gate Compliance

Task 1 (`tdd="true"`): RED commit `5a1e7d8` (test) seguido de GREEN commit `bc5f4de`
(feat) — gate sequence completo. Sem REFACTOR separado (não necessário).
