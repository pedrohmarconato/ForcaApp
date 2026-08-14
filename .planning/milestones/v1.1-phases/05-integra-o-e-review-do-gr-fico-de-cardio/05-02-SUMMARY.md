---
phase: 05-integra-o-e-review-do-gr-fico-de-cardio
plan: 02
subsystem: testing
tags: [async-storage, offline-first-queue, jest, supabase, react-native, cardio]

# Dependency graph
requires:
  - phase: 05-01
    provides: "Gráfico de evolução de cardio (cardioEvolucao.ts, CardioEvolucaoChart.tsx) integrado à aba Progresso"
provides:
  - "Painel adversarial de 4 revisores sobre origin/main..HEAD (55→63 commits) consolidado em 05-PAINEL-REPORT.md, com resolução terminal por achado"
  - "Fila offline-first (sessionOutboxDrain) resiliente a hiccup transitório de AsyncStorage no enqueue (retry bounded)"
  - "Gráfico de evolução de cardio corrigido para agrupar séries trocadas de modalidade na modalidade de DESTINO, não na planejada"
  - "Selo de pendência da sessão resincronizado contra a fila real do usuário ao trocar de treino (não zera às cegas)"
  - "Quarentena da fila offline-first visível na tela de sessão ativa (chip de aviso)"
affects: [phase-06-publica-o, phase-07-migracao-0037]

actuals:
  tokens: 8520
  tasks: 1
  commits: 9

tech-stack:
  added: []
  patterns:
    - "Retry bounded (3 tentativas, releitura do disco a cada uma) para operações de AsyncStorage classificadas como transitórias, antes de degradar para fallback só-em-memória"
    - "Correção de identidade de exercício por evento de troca (cardio_exercise_swaps) replicada do padrão já usado em getSessionLogDetail (swappedFrom) para o repositório de metas de cardio"

key-files:
  created:
    - .planning/phases/05-integra-o-e-review-do-gr-fico-de-cardio/05-PAINEL-REPORT.md
  modified:
    - src/services/sessionOutboxDrain.ts
    - src/services/cardioGoalRepository.ts
    - src/store/activeSessionStore.ts
    - src/screens/ActiveSessionScreen.tsx
    - __tests__/sessionOutboxDrain.test.ts
    - __tests__/cardioGoalRepository.test.ts
    - __tests__/activeSessionStore.test.ts
    - __tests__/activeSessionScreen.test.tsx

key-decisions:
  - "Dono decidiu corrigir achados 1 (ALTA), 2, 4 e 5 (MÉDIA) e aceitar 3, 6 e 7 com justificativa registrada no relatório — checkpoint da Task 2, 2026-08-14"
  - "Expansão de escopo autorizada pelo dono para os arquivos citados nas provas dos achados 1/2/4/5 (além dos 4 arquivos do gráfico de cardio do D-01 original do plano)"
  - "Achado 1 corrigido via retry bounded em vez de repassar o doc em memória ao drain — mais simples, resolve o cenário 'hiccup transitório' descrito no relatório sem mudar a arquitetura disco-first de drainAll"

patterns-established:
  - "Painel adversarial pré-push (skill /painel) como portão final antes de qualquer push, com resolução terminal (corrigido-com-teste | aceito-pelo-dono:<motivo>) obrigatória por achado"

requirements-completed: [INT-02]

coverage:
  - id: D1
    description: "enqueueItem da fila offline-first retenta (até 3x) um hiccup transitório de AsyncStorage antes de aceitar perda de persistência — achado 1 (ALTA) corrigido"
    requirement: INT-02
    verification:
      - kind: unit
        ref: "__tests__/sessionOutboxDrain.test.ts#Achado 1 (painel adversarial 05-02): hiccup TRANSITÓRIO do AsyncStorage no enqueue nunca perde a mutação"
        status: pass
    human_judgment: false
  - id: D2
    description: "Quarentena da fila offline-first (quarantineCount) visível na tela de sessão ativa via chip de aviso — achado 2 (MÉDIA) corrigido"
    requirement: INT-02
    verification:
      - kind: automated_ui
        ref: "__tests__/activeSessionScreen.test.tsx#achado 2 (painel 05-02): quarentena da fila fica VISÍVEL na tela, não some em silêncio"
        status: pass
    human_judgment: false
  - id: D3
    description: "getCardioLogs corrige identidade/nome por cardio_exercise_swaps — gráfico de evolução agrupa série trocada na modalidade de DESTINO, não na planejada — achado 4 (MÉDIA) corrigido"
    requirement: INT-02
    verification:
      - kind: unit
        ref: "__tests__/cardioGoalRepository.test.ts#achado 4 (painel 05-02): série trocada de modalidade agrupa no DESTINO da troca, não na planejada original"
        status: pass
    human_judgment: false
  - id: D4
    description: "reset() da sessão ativa resincroniza pendingCount/quarantineCount contra a fila real do usuário (loadOutbox) em vez de zerar incondicionalmente — achado 5 (MÉDIA) corrigido"
    requirement: INT-02
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#Achado 5 (painel 05-02): reset() resincroniza pendingCount/quarantineCount da fila REAL, não zera às cegas"
        status: pass
    human_judgment: false
  - id: D5
    description: "Achados 3 (drift de errcode até 0037 subir), 6 (drenagem pós-troca de conta) e 7 (fetch duplicado) aceitos pelo dono com justificativa registrada em 05-PAINEL-REPORT.md — nenhuma mudança de código"
    verification: []
    human_judgment: true
    rationale: "Aceite de risco residual é decisão de julgamento do dono (severidade/sequenciamento de deploy), não output determinístico de teste — já capturado no checkpoint da Task 2 e registrado no relatório."
  - id: D6
    description: "Nenhum git push executado durante a fase — origin/main..HEAD só cresceu (55 → 63)"
    verification:
      - kind: other
        ref: "git rev-list --count origin/main..HEAD (63, baseline 55 do início da Task 1)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-08-14
status: complete
---

# Phase 5 Plan 2: Painel Adversarial Pré-Push — Resolução por Achado Summary

**Painel adversarial de 4 revisores sobre os 63 commits acumulados de v1.0/v1.1 confirmou 7 achados na fila offline-first e no gráfico de cardio; 4 corrigidos com teste-antes-do-fix (retry em `enqueueItem`, resync do selo de pendência, quarentena visível, identidade correta do gráfico por troca de modalidade), 3 aceitos pelo dono — zero push, fase pronta para a Fase 6.**

## Performance

- **Duration:** 9 min (Task 3 — aplicação das resoluções; Tasks 1-2 rodaram em sessão anterior, ver checkpoint)
- **Started:** 2026-08-14T11:47:23-03:00
- **Completed:** 2026-08-14T11:56:00-03:00
- **Tasks:** 1 (Task 3 — Tasks 1 e 2 já concluídas antes deste checkpoint)
- **Files modified:** 8 (4 de produção + 4 de teste)

## Accomplishments

- **Achado 1 (ALTA) corrigido:** `enqueueItem` da fila offline-first agora retenta até 3 vezes (leitura ou escrita) um hiccup transitório de AsyncStorage antes de degradar para o fallback só-em-memória — fecha o gap em que uma série/skip/swap/finish enfileirado durante um soluço de storage nunca chegava ao disco e `drainAll` (que relê o disco de forma independente) nunca o via, perdendo o registro para sempre sem aviso.
- **Achado 4 (MÉDIA) corrigido:** `getCardioLogs` agora corrige identidade/nome de série pela troca de modalidade registrada na sessão (`cardio_exercise_swaps`), mesma semântica do `swappedFrom` já usado no Histórico — o gráfico de evolução de cardio agrupa o ponto na modalidade de DESTINO da troca, não na planejada originalmente.
- **Achado 5 (MÉDIA) corrigido:** `reset()` do store de sessão ativa passou a receber o `userId` e resincronizar `pendingCount`/`quarantineCount` contra a fila real via `loadOutbox` em vez de zerar incondicionalmente — o selo "N registros a caminho" não some mais ao trocar de treino com itens de um treino anterior ainda pendentes (D-10: a fila é do usuário, não da tela).
- **Achado 2 (MÉDIA) corrigido:** quarentena da fila (`quarantineCount`) agora tem UI própria na tela de sessão ativa — chip de aviso "N registros recusados pelo servidor" ao lado do selo de pendência existente; antes o item saía da fila sem qualquer sinal ao aluno.
- **Achados 3, 6 e 7 aceitos pelo dono** com justificativa registrada em `05-PAINEL-REPORT.md`: achado 3 (drift de errcode) mitigado pelo sequenciamento do milestone (Fase 7 aplica a migration 0037 antes do deploy web da Fase 8); achados 6 e 7 são de severidade baixa e autocorretivos/sem corrupção de estado.
- Todas as 7 linhas de `05-PAINEL-REPORT.md` fecharam com resolução terminal (`corrigido-com-teste` ou `aceito-pelo-dono:<motivo>`) — nenhuma ficou `pendente-decisão-do-dono`.

## Task Commits

Cada achado corrigido seguiu teste-antes-do-fix (RED confirmado, depois GREEN, `tsc`/suíte completa verdes antes de cada commit de fix):

1. **Achado 1** — `e26f518` test(05): reproduz achado 1 — enqueue perde mutação em hiccup transitório de escrita
2. **Achado 1** — `d2dccc7` fix(05): retenta enqueue da fila offline-first em hiccup transitório de AsyncStorage
3. **Achado 4** — `891e239` test(05): reproduz achado 4 — getCardioLogs ignora troca de modalidade de cardio
4. **Achado 4** — `21fa51b` fix(05): corrige identidade do gráfico de cardio por troca de modalidade
5. **Achado 5** — `16378bb` test(05): reproduz achado 5 — reset() zera selo de pendência sem resync
6. **Achado 5** — `88cf8c5` fix(05): reset() resincroniza selo de pendência contra a fila real (D-10)
7. **Achado 2** — `e6ecf30` test(05): reproduz achado 2 — quarentena da fila fica invisível na tela
8. **Achado 2** — `b0f760b` fix(05): torna quarentena da fila offline-first visível na tela de sessão

**Plan metadata:** `1f0f147` docs(05): registra painel adversarial pré-push com resolução por achado

## Files Created/Modified

- `.planning/phases/05-integra-o-e-review-do-gr-fico-de-cardio/05-PAINEL-REPORT.md` - relatório consolidado do painel com resolução terminal por achado (criado na Task 1, finalizado nesta Task 3)
- `src/services/sessionOutboxDrain.ts` - `enqueueItem` com retry bounded (achado 1)
- `src/services/cardioGoalRepository.ts` - `getCardioLogs` corrige identidade por `cardio_exercise_swaps` (achado 4)
- `src/store/activeSessionStore.ts` - `reset(userId?)` resincroniza contra a fila real (achado 5)
- `src/screens/ActiveSessionScreen.tsx` - chamada de `reset(user.id)` (achado 5) + chip de quarentena visível (achado 2)
- `__tests__/sessionOutboxDrain.test.ts`, `__tests__/cardioGoalRepository.test.ts`, `__tests__/activeSessionStore.test.ts`, `__tests__/activeSessionScreen.test.tsx` - um teste RED→GREEN por achado corrigido

## Decisions Made

- Achado 1 corrigido via **retry bounded** (3 tentativas, releitura do disco a cada uma) em vez da alternativa sugerida de repassar o doc em memória ao `drainAll` — resolve o cenário concreto do relatório (hiccup transitório) sem alterar a arquitetura disco-first de `drainAll`, que continua sendo a fonte única de verdade da fila.
- Achado 4: quando há troca de modalidade, o `exercise_key` do exercício ORIGINAL é descartado (nulo) e a identidade passa a ser derivada do nome normalizado da modalidade de destino — evita que a série trocada carregue a chave de catálogo errada. Limitação conhecida e aceitável: uma série "Corrida" nativa (identity `k:corrida`) e uma série trocada-para-Corrida (identity por nome normalizado) não se fundem sob a mesma identidade; ambas ficam corretamente separadas da modalidade ERRADA (o bug que o achado reportou), mas não se fundem perfeitamente entre si — não há, no código, uma tabela local de nome→chave de catálogo para cardio sem duplicar a lista já mantida em `cardioModalidades.ts` (risco de drift que o próprio projeto evita).
- Achado 5: `reset()` mudou de assinatura (`() => void` → `(userId?: string | null) => void`), compatível com os 2 chamadores existentes em teste que invocam sem argumento (fallback defensivo preserva o comportamento anterior de zerar síncrono).

## Deviations from Plan

None — a Task 3 seguiu exatamente o `<action>` do `05-02-PLAN.md`: teste-antes-do-fix por achado marcado "corrigir", edição só da coluna `Resolução` para os achados "aceitar", e commit final de docs. A expansão de escopo para os 6 arquivos além dos 4 do D-01 original foi explicitamente autorizada pelo dono no checkpoint da Task 2 (não é deviation, é escopo autorizado pelo plano).

## Issues Encountered

- Primeira versão do chip de quarentena usava `testID` no componente `Chip`, que não aceita essa prop (`ChipProps` não a declara) — `npx tsc --noEmit` pegou o erro antes do commit; removido o `testID`, o teste da UI continuou verde usando `getByText`.

## User Setup Required

None - nenhuma configuração de serviço externo.

## Next Phase Readiness

- `05-PAINEL-REPORT.md` fecha com as 7 linhas em resolução terminal — nada pendente para a Fase 6 herdar.
- `git rev-list --count origin/main..HEAD` = 63 no fim desta plan (baseline 55 no início da Task 1, nunca diminuiu) — nenhum push ocorreu, D-06 cumprido.
- Achado 3 (drift de errcode) fica como pré-condição explícita para a Fase 7: a migration `0037_swap_guard_codigo_oficial.sql` precisa subir em staging/produção ANTES do deploy web da Fase 8, conforme a justificativa de aceite registrada no relatório.
- `npx tsc --noEmit` 0 erros; suíte jest completa **147/147 suites, 1692/1692 testes** verdes ao final desta plan.

---
*Phase: 05-integra-o-e-review-do-gr-fico-de-cardio*
*Completed: 2026-08-14*

## Self-Check: PASSED

Todos os 9 commits (test/fix por achado + docs) e todos os arquivos citados foram confirmados presentes no histórico local via `git log --oneline --all | grep`.
