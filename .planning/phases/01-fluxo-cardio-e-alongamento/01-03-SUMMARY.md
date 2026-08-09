---
phase: 01-fluxo-cardio-e-alongamento
plan: 03
subsystem: ui
tags: [react-native, jest, cardio, prescrito-realizado, progress-screen]

# Dependency graph
requires:
  - phase: 01-fluxo-cardio-e-alongamento
    provides: "cardioPrescrito.ts (progressoPrescrito) + cardioPrescritoRepository.ts (getPrescricaoSemanaCorrente) — 01-02"
provides:
  - "CardioPrescritoSection.tsx: seção Cardio da aba Progresso mostrando prescrito x realizado, sem nenhuma ação de escrita de meta"
  - "ProgressScreen.tsx religado a getPrescricaoSemanaCorrente em vez de getMetasAtivas/CardioGoalsSection"
affects: []

actuals:
  tokens: 12766
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Componente de apresentação puro reaproveitando progressoPrescrito (motor do 01-02); nenhuma escrita, só leitura + onRecarregar"

key-files:
  created:
    - src/components/progress/CardioPrescritoSection.tsx
    - __tests__/cardioPrescritoSecao.test.tsx
  modified:
    - src/screens/ProgressScreen.tsx
    - __tests__/progressScreenOrigemJoint.test.tsx

key-decisions:
  - "Card único 'Cardio desta semana' mostra só os dois eixos que a prescrição realmente popula (minutos e sessões/dias); prescritoKm (distância) fica no motor mas não vira linha própria na UI — a prescrição do plano não expõe uma meta de desempenho por ritmo, então não há o que comparar"
  - "formatDuration (sessionModel) usado numa linha secundária ('Prescrito: MM:SS no total') junto ao título do card, além do par 'X de Y min' — texto complementar, não substitui o contador de minutos"
  - "Estado vazio ('Sem cardio prescrito nesta semana') e estado com prescrição zerada (logs=[] mas prescrição existe → '0 de Y min') são dois estados distintos e testados separadamente, preservando a disciplina zero-é-fato de cardioGoals.ts"

patterns-established: []

requirements-completed: [REQ-02]

coverage:
  - id: D1
    description: "CardioPrescritoSection substitui CardioGoalsSection na aba Progresso: mostra prescrito x realizado (minutos e dias) sem nenhum botão de definir/trocar/remover meta"
    requirement: "REQ-02"
    verification:
      - kind: unit
        ref: "__tests__/cardioPrescritoSecao.test.tsx (8 testes: skeleton, erro, estado vazio, zero-é-fato, prescrito x realizado, prova negativa de ausência de UI de escrita)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CardioGoalsSection.tsx e CardioGoalSheet.tsx removidos do código; cardio_goals e suas RPCs permanecem intactas no banco (nenhuma migration criada)"
    requirement: "REQ-02"
    verification:
      - kind: other
        ref: "grep -rn 'definirMeta|CardioGoalSheet' src/components/progress/CardioPrescritoSection.tsx (vazio) + git status supabase/migrations/ (vazio)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ProgressScreen.tsx religado: carrega getPrescricaoSemanaCorrente em vez de getMetasAtivas, renderiza CardioPrescritoSection na mesma posição da árvore; teste de regressão de origem conjunta continua verde com o novo mock"
    requirement: "REQ-02"
    verification:
      - kind: unit
        ref: "__tests__/progressScreenOrigemJoint.test.tsx (4 testes verdes)"
        status: pass
      - kind: other
        ref: "grep -n 'CardioGoalsSection|getMetasAtivas' src/screens/ProgressScreen.tsx (vazio) + npx tsc --noEmit (sem erro)"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-08-09
status: complete
---

# Phase 1 Plan 3: Seção de cardio prescrito x realizado na aba Progresso Summary

**`CardioPrescritoSection.tsx` substitui `CardioGoalsSection` na aba Progresso — REQ-02 fecha: a meta de cardio deixa de ser definição paralela e passa a mostrar prescrito × realizado direto do plano ativo, sem nenhum botão de definir/trocar/remover meta.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2
- **Files modified:** 4 (2 novos, 2 editados) + 3 removidos

## Accomplishments
- `CardioPrescritoSection.tsx` novo: consome `progressoPrescrito` (01-02), renderiza um único card "Cardio desta semana" com minutos e dias prescritos × realizados, cada eixo com sua `ProgressTrack`, e nenhuma ação de escrita de meta.
- `CardioGoalsSection.tsx`/`CardioGoalSheet.tsx`/`cardioGoalsSecao.test.tsx` removidos do repositório (decisão travada do dono, CONTEXT.md) — a tabela `cardio_goals` e as RPCs continuam intactas no banco, sem migration nesta fase.
- `ProgressScreen.tsx` religado: `getMetasAtivas`/`metasCardio` saem, `getPrescricaoSemanaCorrente`/`prescricaoCardio` entram, `CardioPrescritoSection` ocupa a mesma posição da árvore que `CardioGoalsSection` ocupava.
- `progressScreenOrigemJoint.test.tsx` atualizado: mock de `cardioGoalRepository` reduzido a `getCardioLogs`, novo mock de `cardioPrescritoRepository` — os 4 testes de regressão de origem conjunta continuam verdes.
- Prova negativa explícita nos testes novos: nenhum `getByText`/`getByLabelText`/`getByTestId` de "Trocar"/"Remover"/"Definir meta"/`meta-desempenho-bati` sobrevive na árvore renderizada, em nenhum dos estados (com prescrição, sem prescrição).

## Task Commits

Cada tarefa foi commitada atomicamente:

1. **Task 1: Criar CardioPrescritoSection.tsx e remover CardioGoalsSection/CardioGoalSheet** - `d1f8a36` (feat)
2. **Task 2: Religar ProgressScreen.tsx e atualizar o teste de regressão de origem conjunta** - `dc7d8ba` (feat)

## Files Created/Modified
- `src/components/progress/CardioPrescritoSection.tsx` - seção nova: skeleton/erro/estado vazio/card prescrito×realizado, sem UI de escrita
- `__tests__/cardioPrescritoSecao.test.tsx` - 8 testes cobrindo os 3 modos de falha do plano
- `src/components/progress/CardioGoalsSection.tsx` - removido
- `src/components/progress/CardioGoalSheet.tsx` - removido
- `__tests__/cardioGoalsSecao.test.tsx` - removido
- `src/screens/ProgressScreen.tsx` - troca de import/estado/JSX para `CardioPrescritoSection` + `getPrescricaoSemanaCorrente`
- `__tests__/progressScreenOrigemJoint.test.tsx` - mock atualizado (`cardioPrescritoRepository` + `cardioGoalRepository` reduzido)

## Decisions Made
- O card único mostra só minutos e dias (os dois eixos que `PrescricaoCardio` realmente popula pelo repositório do 01-02); `prescritoKm` (distância) permanece no tipo/motor mas não ganha linha própria na UI nesta fase — não há meta de ritmo/desempenho na prescrição do plano para comparar contra ela, então uma linha de "distância prescrita" ficaria solta sem contraparte de "realizado" equivalente.
- `formatDuration` (pedido explícito do plano) aparece como linha secundária de contexto ("Prescrito: MM:SS no total") acima do par "X de Y min" — não substitui o contador em minutos, que é o que o teste "zero-é-fato" e o antigo padrão de `CardioGoalsSection` usam.
- Estado vazio ("Sem cardio prescrito nesta semana") e prescrição com zero registros ("0 de Y min", zero é fato) ficaram como dois testes/estados distintos — a mesma disciplina que `cardioGoals.ts` já documenta para a seção antiga.

## Deviations from Plan
None - plan executado exatamente como escrito.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
Nenhum. `CardioPrescritoSection` renderiza sempre a partir de `logs`/`prescricao` reais vindos do repositório (01-02); não há dado mockado/vazio fixo na árvore de produção.

## Self-Check: PASSED
- FOUND: src/components/progress/CardioPrescritoSection.tsx
- FOUND: __tests__/cardioPrescritoSecao.test.tsx
- CONFIRMED removed: src/components/progress/CardioGoalsSection.tsx
- CONFIRMED removed: src/components/progress/CardioGoalSheet.tsx
- CONFIRMED removed: __tests__/cardioGoalsSecao.test.tsx
- FOUND commit: d1f8a36
- FOUND commit: dc7d8ba
- `npx jest __tests__/cardioPrescritoSecao.test.tsx __tests__/progressScreenOrigemJoint.test.tsx --silent` → 12 testes verdes
- `npx tsc --noEmit` → sem erro
- `git status supabase/migrations/` → vazio

## Next Phase Readiness
- Success Criterion 2 do ROADMAP (Fase 1) fechado: a aba Progresso não oferece mais definição manual de meta de cardio — mostra prescrito × realizado do plano ativo.
- REQ-02 completo end-to-end (motor 01-02 + repositório 01-02 + UI 01-03).
- Nenhum bloqueio conhecido para 01-04 (já commitado nesta branch, conforme HEAD de partida).

---
*Phase: 01-fluxo-cardio-e-alongamento*
*Plan: 03*
*Completed: 2026-08-09*
