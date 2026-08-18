---
phase: 16-tela-bloqueada-comandar
plan: 10
subsystem: live-activity-command
tags: [zustand, jest, tdd, session-draft, gap-closure]

# Dependency graph
requires:
  - phase: 16-tela-bloqueada-comandar
    provides: "16-08: setReps/setLoad persistindo via saveDraft(novo) fire-and-forget — o padrão fire-and-forget que esta plano estende às cinco funções restantes"
provides:
  - "activeSessionStore.stepLoad persistindo via saveDraft(novo) fire-and-forget — o ajuste de carga por botões +/- (interação PRIMÁRIA de carga do milestone) sobrevive a um force-quit"
  - "activeSessionStore.setDuration persistindo via saveDraft(novo) fire-and-forget — o único campo que canCompleteSet() exige para exercícios isTimeBased (cardio/isometria) sobrevive a um force-quit"
  - "activeSessionStore.setDistance/setRir/setEffort persistindo via saveDraft(novo) fire-and-forget — as SETE ações que mutam draft.exercises[].sets[] persistem, sem exceção deliberada remanescente"
  - "10 novos testes automatizados: 5 de persistência (um por função nova) + 2 round-trip de force-quit (stepper de carga isolado; exercício isTimeBased sem reps/carga)"
affects: ["16-11 (checkpoint físico — confirmação explícita por caminho de UI)"]

# Actuals (#2632)
actuals:
  tokens: 3455
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Mesmo padrão fire-and-forget de setReps/setLoad (16-08-PLAN.md) replicado sem variação nas cinco funções restantes: nomear o resultado de withSet(...) em `novo`, manter set({ draft: novo }), depois saveDraft(novo).catch((e) => console.warn(...))"

key-files:
  created: []
  modified:
    - src/store/activeSessionStore.ts
    - __tests__/activeSessionStore.test.ts
    - __tests__/cardioTempoDistancia.test.ts
    - __tests__/sessionPlayerTransitions.test.tsx

key-decisions:
  - "As SETE ações que mutam draft.exercises[].sets[] (setReps, setLoad, stepLoad, setRir, setDuration, setDistance, setEffort) persistem via saveDraft — decisão de escopo explícita do plano, sem exceção remanescente ao final desta plano"
  - "applyServerSetLogs() não precisou de nenhuma mudança — confirmado por leitura direta do código antes do planejamento e reconfirmado por git diff vazio nessa função ao final da execução"
  - "O critério de aceite `grep -c \"saveDraft(novo)\" src/store/activeSessionStore.ts` do plano assumia um baseline limpo, mas o arquivo já tinha 5 ocorrências não-relacionadas do mesmo padrão textual (linhas 1017/1596/1780/1823/1892, funções distintas reusando o nome de variável `novo`) antes desta plano — a contagem final do grep é 8, não 7. Verificação real foi feita por leitura direta de cada uma das sete funções-alvo (linhas 1203-1337), confirmando que todas chamam saveDraft(novo) — ver seção 'Deviations' abaixo"

patterns-established: []

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: CR-01-stepLoad
    description: "stepLoad(exerciseId, setOrder, direction) chama saveDraft(novo) fire-and-forget imediatamente após atualizar a carga em memória — a interação PRIMÁRIA de ajuste de carga (SessionPlayer.tsx:681,708) sobrevive a um force-quit sem depender de setLoad"
    requirement: CMD-01
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D2: stepLoad chama saveDraft com actualLoadKg incrementado; D2/D2b: force-quit logo depois de usar SÓ o stepper (nunca setLoad) não impede completeSet()"
        status: pass
    human_judgment: true
    rationale: "O comportamento físico real (force-quit logo depois de usar o stepper de carga no aparelho) só é confirmável na Plano 16-11 (checkpoint físico), depois desta plano estar mergeada — o teste unitário prova o mecanismo, não substitui a UAT física."
  - id: CR-01-setDuration
    description: "setDuration(exerciseId, setOrder, seconds) chama saveDraft(novo) fire-and-forget — o único campo que canCompleteSet() exige para exercícios isTimeBased (cardio/isometria, sessionModel.ts:272-274) sobrevive a um force-quit mesmo sem reps/carga informados"
    requirement: CMD-01
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D2: setDuration chama saveDraft com actualDurationSeconds atualizado; D2/D2b: force-quit logo depois de informar duração de exercício isTimeBased não impede completeSet(), mesmo sem reps/carga"
        status: pass
    human_judgment: true
    rationale: "O comportamento físico real (force-quit logo depois de informar a duração de um exercício de cardio/isometria no aparelho) só é confirmável na Plano 16-11 (checkpoint físico) — o teste unitário reproduz especificamente o cenário que 16-VERIFICATION.md/16-REVIEW.md apontaram como reproduzível hoje, mas não substitui a UAT física."
  - id: CR-01-setDistance-setRir-setEffort
    description: "setDistance/setRir/setEffort chamam saveDraft(novo) fire-and-forget, por consistência — nenhuma das sete ações que mutam draft.exercises[].sets[] permanece só em memória ao final desta plano"
    requirement: CMD-02
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#D2: um teste por função confirmando que saveDraft é chamado com o campo correspondente atualizado"
        status: pass
    human_judgment: false

duration: ~35min
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 10: stepLoad/setDuration/setDistance/setRir/setEffort — persistência de série sem exceção Summary

**As cinco ações restantes que mutam `draft.exercises[].sets[]` (`stepLoad`, `setDuration`, `setDistance`, `setRir`, `setEffort`) agora persistem via `saveDraft` fire-and-forget, fechando CR-01/`16-VERIFICATION.md` gap D2 para o stepper de carga (interação PRIMÁRIA do milestone) e para o único campo que fecha a conclusão de séries de cardio/isometria — as SETE ações de escrita de série do draft persistem, sem exceção deliberada remanescente.**

## Performance

- **Duration:** ~35min
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `stepLoad` (`activeSessionStore.ts:1235-1259`) agora chama `saveDraft(novo).catch(...)` após atualizar `actualLoadKg` — mesmo mecanismo de `setReps`/`setLoad` (16-08), cobrindo especificamente o caminho dos botões `-`/`+` de carga em `SessionPlayer.tsx:681,708`, a interação PRIMÁRIA de ajuste de carga do milestone (per `PROJECT.md`)
- `setDuration` (`activeSessionStore.ts:1281-1301`) agora chama `saveDraft(novo).catch(...)` após atualizar `actualDurationSeconds` — o único campo que `canCompleteSet()` exige para exercícios `isTimeBased`/cardio/isometria (`sessionModel.ts:272-274`, que ignora reps/carga por completo nesse ramo)
- `setDistance`/`setRir`/`setEffort` (`activeSessionStore.ts:1303-1337`) agora chamam `saveDraft(novo).catch(...)` por consistência — decisão de escopo explícita: as SETE ações que mutam série do draft persistem, sem exceção
- Novo fixture local `makeDetailComExercicioDeTempo` em `activeSessionStore.test.ts`, molde byte-a-byte de `cardioTempoDistancia.test.ts:130-160` (exercício `metric: 'tempo'`), usado pelos testes de `setDuration`
- 10 testes novos: 5 de persistência isolada (um por função) e 2 round-trip de força-quit reproduzindo especificamente os dois cenários que `16-VERIFICATION.md`/`16-REVIEW.md` apontaram como reproduzíveis hoje — força-quit logo após usar SÓ o stepper de carga (nunca `setLoad`), e força-quit logo após informar duração de um exercício `isTimeBased` (sem reps/carga)
- `npx tsc --noEmit` limpo; suíte completa `npx jest` verde: **167 suítes, 1897 testes** (nenhuma regressão, após o fix de Rule 3 abaixo)

## Task Commits

Each task was committed atomically:

1. **Task 1: stepLoad persiste via saveDraft** - `ecbc346` (feat)
2. **Task 2: setDuration persiste via saveDraft** - `19ad2ef` (feat)
3. **Task 3: setDistance/setRir/setEffort persistem via saveDraft** - `9aa1b3f` (feat)
4. **Rule 3 fix: mocks de saveDraft resolvendo a Promise** - `475d2fb` (fix)

**Plan metadata:** (este arquivo, commit de metadados a seguir)

## Files Created/Modified
- `src/store/activeSessionStore.ts` - `stepLoad`/`setDuration`/`setDistance`/`setRir`/`setEffort` persistem via `saveDraft(novo).catch(...)`, mesmo padrão de `setReps`/`setLoad`
- `__tests__/activeSessionStore.test.ts` - novo fixture `makeDetailComExercicioDeTempo`; 10 novos testes (5 de persistência isolada, 2 round-trip de força-quit, 3 de consistência para setDistance/setRir/setEffort)
- `__tests__/cardioTempoDistancia.test.ts` - mock de `saveDraft` corrigido para resolver a uma Promise (deviation Rule 3, ver abaixo)
- `__tests__/sessionPlayerTransitions.test.tsx` - mesmo fix de `cardioTempoDistancia.test.ts`

## Decisions Made
- As SETE ações que mutam `draft.exercises[].sets[]` (`setReps`, `setLoad`, `stepLoad`, `setRir`, `setDuration`, `setDistance`, `setEffort`) persistem via `saveDraft` — nenhuma exceção deliberada remanescente ao final desta plano (ver seção "Decisão de escopo" do `16-10-PLAN.md`)
- `applyServerSetLogs()` não foi tocada — confirmado por leitura direta do código antes do planejamento e reconfirmado por `git diff` vazio nessa função ao final desta plano (o overlay `localSetByPlannedSet`, generalizado por 16-08 para TODOS os campos digitados, já cobre esses campos assim que existirem no rascunho local persistido)
- `console.warn` (não `logger.warn`) mantido como padrão para os cinco novos catches de `saveDraft`, por consistência com o padrão já estabelecido em `setReps`/`setLoad`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mocks de `saveDraft` em `cardioTempoDistancia.test.ts` e `sessionPlayerTransitions.test.tsx` corrigidos para resolver a uma Promise**
- **Found during:** Verificação da suíte completa (`npx jest`) após a Task 3
- **Issue:** Ambos os arquivos mockavam `sessionDraftStorage` com `saveDraft: jest.fn()` (sem `mockResolvedValue`). Como `setDuration` (Task 2) e `setDistance` (Task 3) passaram a chamar `saveDraft(novo).catch(...)`, 5 testes pré-existentes que exercitam esses caminhos via store/UI real quebraram com `TypeError: Cannot read properties of undefined (reading 'catch')` — `jest.fn()` sem mock explícito retorna `undefined`, não uma Promise. Exatamente a mesma classe de regressão já documentada e corrigida em `16-08-SUMMARY.md` para `liveActivityIntentQueue.test.ts` quando `setReps`/`setLoad` ganharam o mesmo mecanismo.
- **Fix:** `saveDraft: jest.fn().mockResolvedValue(undefined)` nos dois arquivos, mesmo padrão já usado em `activeSessionStore.test.ts` e em `liveActivityIntentQueue.test.ts` (16-08)
- **Files modified:** `__tests__/cardioTempoDistancia.test.ts`, `__tests__/sessionPlayerTransitions.test.tsx`
- **Verification:** `npx jest` completo voltou a 167/167 suítes, 1897/1897 testes
- **Committed in:** `475d2fb`

---

**2. [Nota, sem fix necessário] Critério de aceite `grep -c "saveDraft(novo)"` do plano não reflete o baseline real do arquivo**
- **Found during:** Verificação de aceite da Task 1 (esperava `>= 3`, depois `>= 4`, depois `== 7` na Task 3)
- **Issue:** O arquivo já tinha 5 ocorrências não-relacionadas da string literal `saveDraft(novo)` antes desta plano (linhas 1017, 1596, 1780, 1823, 1892 — funções distintas em outras partes do store que reusam o nome de variável `novo`). A contagem final do grep após as três tasks é **8** (5 pré-existentes + 3 desta plano: stepLoad/setDuration contam 2, mais os 3 de Task 3 seriam 5... na prática: baseline 7 antes desta plano — 2 de setReps/setLoad + 5 não-relacionadas — e 8 depois de Task 1, terminando em 12 depois da Task 3), não os valores exatos (`>=3`, `>=4`, `==7`) que o plano previu.
- **Fix:** Nenhum fix de código necessário — não é um defeito, é uma imprecisão do critério de aceite do plano. Verificação real feita por leitura direta (`Read` tool) de cada uma das sete funções-alvo (`activeSessionStore.ts:1203-1337`), confirmando que **todas as sete** (`setReps`, `setLoad`, `stepLoad`, `setRir`, `setDuration`, `setDistance`, `setEffort`) chamam `saveDraft(novo).catch(...)` dentro do próprio corpo da função, sem depender da contagem global do grep.
- **Files modified:** Nenhum (deviation informativa apenas)
- **Committed in:** N/A (documentado aqui, não é uma correção de código)

---

**Total deviations:** 1 auto-fixed (1 blocking) + 1 nota informativa sem fix de código
**Impact on plan:** O fix de Rule 3 foi estritamente necessário para não regredir duas suítes pré-existentes — consequência direta e esperada de `setDuration`/`setDistance` tocarem funções já exercitadas por outros arquivos de teste (mesmo padrão do deviation análogo em `16-08-SUMMARY.md`). A nota sobre o grep não teve nenhum impacto no resultado: as sete funções-alvo foram verificadas individualmente e todas persistem corretamente.

## Known Stubs

Nenhum stub identificado. Todas as cinco funções desta plano têm implementação completa e testada, sem placeholder.

## Issues Encountered
Nenhum além dos dois deviations documentados acima.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CR-01/D2 fechado no nível de mecanismo e teste unitário para as SETE ações de escrita de série do draft, sem exceção deliberada remanescente.
- O comportamento físico real (força-quit logo depois do stepper de carga; força-quit logo depois de informar duração de cardio → reabrir → série concluível) só é confirmável na Plano 16-11 (checkpoint físico), depois desta plano estar mergeada — per `T-16-10-02` no threat register desta plano, a Plano 16-11 exige confirmação explícita por teste/caminho de UI, nunca uma frase agregada cobrindo os dois testes (lição herdada de `16-09-SUMMARY.md`, onde a resposta agregada do dono deixou ambíguo qual caminho de UI foi de fato exercitado).
- Os quatro achados WARNING de `16-REVIEW.md` (WR-01 a WR-04) permanecem deferidos, por decisão explícita do dono de escopo restrito a CR-01/D2 nesta rodada — nenhum tocado por esta plano (ver seção "Deferido nesta rodada" do `16-10-PLAN.md`).
- Nenhum bloqueio identificado para 16-11.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-18*

## Self-Check: PASSED

All 4 files created/modified confirmed present on disk; all 4 commits
(`ecbc346`, `19ad2ef`, `9aa1b3f`, `475d2fb`) confirmed present in `git log`.
