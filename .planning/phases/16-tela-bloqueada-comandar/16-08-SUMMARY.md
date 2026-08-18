---
phase: 16-tela-bloqueada-comandar
plan: 08
subsystem: live-activity-command
tags: [zustand, jest, tdd, session-draft, gap-closure]

# Dependency graph
requires:
  - phase: 16-tela-bloqueada-comandar
    provides: "16-07: peek não-destrutivo + ack condicionado ao resultado real de completeSet() — pré-requisito D1, resolvido antes desta plano"
provides:
  - "activeSessionStore.setReps/setLoad persistindo via saveDraft(novo) fire-and-forget a cada tecla/toque do stepper"
  - "activeSessionStore.applyServerSetLogs() com overlay localSetByPlannedSet — preserva reps/carga/status 'active' de uma série sem confirmação do servidor no ramo de retomada mais comum (reconciliado com o servidor)"
  - "activeSessionStore.deactivateOtherActiveSets() + activateSet() com invariante de série ativa única por draft"
  - "8 novos testes automatizados reproduzindo os dois cenários FAIL do UAT físico de 16-06-SUMMARY.md (force_quit_toque e regressao_geral)"
affects: ["16-09 (UAT física de re-execução)"]

# Actuals (#2632)
actuals:
  tokens: 3854
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Overlay de rascunho local sobre o draft reconstruído do servidor, condicionado a `sl` indefinido — mesmo padrão já usado para `localAdapt` (adaptação) nesta mesma função, agora estendido a reps/carga/status/activatedAt"
    - "Invariante de estado único ('no máximo uma série active') aplicada DENTRO da função de transição de estado (activateSet), nunca por um caminho de ativação alternativo — mesmo espírito de applyExerciseSkipToDraft (sessionModel.ts)"

key-files:
  created: []
  modified:
    - src/store/activeSessionStore.ts
    - __tests__/activeSessionStore.test.ts
    - __tests__/liveActivityIntentQueue.test.ts

key-decisions:
  - "O overlay de D2b só se aplica a séries locais AINDA NÃO confirmadas (status 'active'/'pending') — um set 'done' localmente mas sem `sl` do servidor mantém o comportamento atual (fora do escopo de D2/D2b), evitando regredir o caso já coberto por 'F3/F6: série feita no local SEM lastro no servidor volta a PENDENTE'"
  - "deactivateOtherActiveSets roda DENTRO de activateSet, antes do set() final — nenhum segundo caminho de ativação foi introduzido (prohibition herdada de 16-04-PLAN.md, reafirmada em 16-08-PLAN.md)"
  - "Rule 3 (blocking issue): __tests__/liveActivityIntentQueue.test.ts mockava `saveDraft: jest.fn()` sem resolver a uma Promise — como setReps/setLoad (D2) agora chamam `saveDraft(novo).catch(...)`, um teste pré-existente que exercita setReps via completeSet() real quebrava com 'Cannot read properties of undefined (reading catch)'. Corrigido com `.mockResolvedValue(undefined)`, mesmo padrão já usado em activeSessionStore.test.ts"

patterns-established: []

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: D1
    description: "setReps/setLoad chamam saveDraft(novo) fire-and-forget imediatamente após atualizar o draft em memória, sem debounce"
    requirement: CMD-01
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D2: setReps/setLoad persistem via saveDraft (2 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "applyServerSetLogs() preserva reps/carga/status 'active'/activatedAt do rascunho LOCAL para uma série sem confirmação do servidor, testado nos dois ramos de retomada (offline e reconciliado com o servidor) — e confirma que uma série 'done' local sem lastro no servidor não é afetada (fora de escopo)"
    requirement: CMD-01
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D2/D2b: retomada preserva reps/carga digitados antes de um force-quit (3 casos)"
        status: pass
    human_judgment: true
    rationale: "O comportamento físico real (force-quit com reps/carga já informados -> reabrir -> série concluída automaticamente sem erro) só é confirmável na Plano 16-09 (UAT física de re-execução), depois desta plano E de 16-07 estarem mergeadas — o teste unitário prova o mecanismo, não substitui o UAT físico."
  - id: D3
    description: "activateSet() garante no máximo uma série 'active' por vez em todo o draft — qualquer série 'active' remanescente (travada por um completeSet() reprovado) é desativada para 'pending' com reps/carga preservados antes de ativar a nova"
    requirement: CMD-02
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D3: activateSet garante no máximo uma série active por vez (3 casos, incluindo a reprodução exata da sequência do UAT físico)"
        status: pass
    human_judgment: true
    rationale: "O comportamento físico real ('Pular' na última série de um exercício avançando corretamente após uma rejeição anterior) só é confirmável na Plano 16-09 (UAT física de re-execução) — o teste unitário reproduz a sequência exata do UAT que reprovou (16-06-SUMMARY.md, regressao_geral=FAIL), mas não substitui a confirmação no aparelho."

duration: ~30min
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 08: D2/D2b/D3 — persistência de reps/carga + invariante de série ativa única Summary

**`setReps`/`setLoad` passam a persistir de fato via `saveDraft` (e `applyServerSetLogs` preserva esses valores no ramo de retomada mais comum), e `activateSet()` garante no máximo uma série `active` por vez — fechando os dois defeitos pré-existentes confirmados por UAT físico real em `16-06-SUMMARY.md` (`force_quit_toque=FAIL` e `regressao_geral=FAIL`).**

## Performance

- **Duration:** ~30min
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `setReps`/`setLoad` (`activeSessionStore.ts`) agora chamam `saveDraft(novo).catch(...)` fire-and-forget, sem debounce — `sessionDraftStorage.ts` já serializa escritas da mesma chave via `withKeyQueue`, então chamadas rápidas em sequência do stepper são seguras sem coordenação adicional
- `applyServerSetLogs()` ganha o overlay `localSetByPlannedSet`: quando o servidor ainda não confirmou uma série (`sl` indefinido), reps/carga/RIR/duração/distância/esforço percebido e status `'active'`/`activatedAt` do rascunho LOCAL são preservados — sem isto, o fix de `saveDraft` sozinho não sobreviveria ao ramo MAIS comum de retomada (rede disponível), que reconstrói o draft do zero
- Novo helper `deactivateOtherActiveSets`: qualquer série `active` remanescente volta a `pending` (com `activatedAt: null`, reps/carga preservados) antes/durante a ativação de uma nova série — `activateSet()` agora garante a invariante "no máximo uma série `active` por vez" em todo o draft
- 8 testes novos reproduzem exatamente os dois cenários de `FAIL` do UAT físico: persistência de reps/carga via `setReps`/`setLoad`, round-trip pelo ramo offline E pelo ramo reconciliado com o servidor, não-regressão do caso "série done sem lastro no servidor", e a sequência exata `completeSet() reprovado -> activateSet() no próximo exercício -> travada volta a pending, nova fica active, exatamente UMA ativa`
- `npx tsc --noEmit` limpo; suíte completa `npx jest` verde: **167 suítes, 1890 testes** (nenhuma regressão)

## Task Commits

Each task was committed atomically:

1. **Task 1: D2 — setReps/setLoad persistem via saveDraft + applyServerSetLogs preserva reps/carga em andamento** - `9cfce59` (feat)
2. **Task 2: D3 — activateSet garante no máximo uma série 'active' por vez** - `5a039af` (feat)

**Plan metadata:** (este arquivo, commit de metadados a seguir)

## Files Created/Modified
- `src/store/activeSessionStore.ts` - `setReps`/`setLoad` persistem via `saveDraft`; `applyServerSetLogs` com overlay `localSetByPlannedSet`; novo helper `deactivateOtherActiveSets`; `activateSet` chama o helper antes do commit final
- `__tests__/activeSessionStore.test.ts` - 8 novos testes (D2 persistência, D2/D2b round-trip nos dois ramos + caso fora de escopo, D3 invariante de série ativa única)
- `__tests__/liveActivityIntentQueue.test.ts` - mock de `saveDraft` corrigido para resolver a uma Promise (deviation Rule 3, ver abaixo)

## Decisions Made
- O overlay de D2b só se aplica a séries locais AINDA NÃO confirmadas (`status !== 'done'`) — uma série `'done'` localmente mas sem `sl` do servidor mantém o comportamento atual, sem regredir o teste pré-existente "série feita no local SEM lastro no servidor volta a PENDENTE"
- `deactivateOtherActiveSets` roda DENTRO de `activateSet`, nunca por um caminho de ativação alternativo — reafirma a prohibition herdada de `16-04-PLAN.md`
- `console.warn` (não `logger.warn`) foi o padrão adotado para os dois novos catches de `saveDraft`, por consistência com os ~18 usos existentes de `console.warn` no mesmo arquivo para falhas não-fatais de persistência

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock de `saveDraft` em `liveActivityIntentQueue.test.ts` corrigido para resolver a uma Promise**
- **Found during:** Task 2 (verificação da suíte completa após D3)
- **Issue:** `__tests__/liveActivityIntentQueue.test.ts` mockava `sessionDraftStorage` com `saveDraft: jest.fn()` (sem `mockResolvedValue`). Como `setReps`/`setLoad` (Task 1, D2) passaram a chamar `saveDraft(novo).catch(...)`, um teste pré-existente que exercita `setReps` via `completeSet()` real (`withRealActions`, adicionado em 16-07) quebrou com `TypeError: Cannot read properties of undefined (reading 'catch')` — `jest.fn()` sem mock explícito retorna `undefined`, não uma Promise
- **Fix:** `saveDraft: jest.fn().mockResolvedValue(undefined)`, mesmo padrão já usado em `__tests__/activeSessionStore.test.ts`
- **Files modified:** `__tests__/liveActivityIntentQueue.test.ts`
- **Verification:** `npx jest` completo voltou a 167/167 suítes, 1890/1890 testes
- **Committed in:** `5a039af` (parte do commit da Task 2)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Fix estritamente necessário para não regredir uma suíte pré-existente — consequência direta e esperada de D2 tocar uma função (`setReps`) já exercitada por outro arquivo de teste. Sem escopo além do necessário.

## Issues Encountered
None além do deviation documentado acima.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- D2/D2b/D3 fechados no nível de mecanismo/teste unitário. O comportamento físico real (force-quit com reps/carga já informados -> reabrir -> série concluída automaticamente sem erro; "Pular" na última série de um exercício avançando corretamente após uma rejeição anterior) só é confirmável na Plano 16-09 (UAT física de re-execução), depois desta plano E de 16-07 estarem mergeadas.
- Nenhum bloqueio identificado para 16-09.
- A linha `unclassified` do edge-probe CMD-02 (mencionada no `<objective>` do plano) permanece sinalizada como suposição do planner — nenhum defeito adicional distinto de D3 foi identificado; fica para o verificador avaliar explicitamente na próxima rodada.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 3 files created/modified confirmed present on disk; both commits
(`9cfce59`, `5a039af`) confirmed present in `git log`.
