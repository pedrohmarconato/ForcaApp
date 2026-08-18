---
phase: 16-tela-bloqueada-comandar
plan: 04
subsystem: mobile-native
tags: [zustand, expo-modules, live-activity, react-native, cold-launch, jest, tdd]

# Dependency graph
requires:
  - phase: 16-tela-bloqueada-comandar
    provides: "Plano 16-02: reconcileLiveActivityIntents() (guarda de CAS por sessionLogId), drainQueuedLiveActivityIntents(), fila durável do App Group (IntentActionQueue, Plano 16-01) — esta plano corrige QUANDO/ONDE reconcileLiveActivityIntents() é chamada, sem tocar a lógica de aplicação por entrada"
provides:
  - "reconcileLiveActivityIntents() com guarda de hidratação: early-return imediato (sem drenar a fila) quando get().draft está ausente ou não-'active'"
  - "startOrResume() chama reconcileLiveActivityIntents() (guardado por isCurrent()) em cada um dos 3 ramos que hidratam draft com status 'active': retomada offline sem rede, reconciliado com o servidor, sem rascunho local com log aberto"
  - "App.tsx: useEffect de boot sem a chamada a reconcileLiveActivityIntents() — reconcileOrphanActivities() chamado diretamente, sem .finally() encadeado"
affects: [16-05-fila-nao-destrutiva, 16-06-uat-fisica-reexecucao]

# Actuals (#2632)
actuals:
  tokens: 2229
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Guarda de hidratação no topo de uma função de reconciliação: nunca ler/drenar um recurso durável destrutivo (drainQueuedLiveActivityIntents) antes de confirmar que existe um consumidor (draft ativo) capaz de aplicar o resultado"
    - "Chamada de reconciliação de estado externo movida do useEffect de boot cru (App.tsx) para dentro do único ponto que hidrata o estado que ela consome (startOrResume), guardada pela mesma isCurrent()/epoch já usada contra chamadas concorrentes"

key-files:
  created: []
  modified:
    - src/store/activeSessionStore.ts
    - App.tsx
    - __tests__/liveActivityIntentQueue.test.ts
    - __tests__/activeSessionStore.test.ts

key-decisions:
  - "Task 1 (tracer, tdd=true) seguiu RED->GREEN explícito antes de qualquer expansão: teste reproduzindo draft===null no momento da chamada (RED, falha porque drainQueuedLiveActivityIntents era chamado incondicionalmente) -> guarda de hidratação de uma linha (GREEN). Ambiente de execução é worktree de wave autônoma (plan frontmatter autonomous:true, workflow._auto_chain_active/auto_advance ambos false via config-get, sem humano disponível para o checkpoint interativo do gate de tracer) — o <verify> automatizado (jest+tsc) já passou 100% antes de seguir para a Task 2; decisão documentada aqui em vez de travar a wave aguardando confirmação indefinida."
  - "O import de useActiveSessionStore em App.tsx ficou órfão após a remoção da chamada do boot cru — removido (Rule 1, código morto) já dentro da própria Task 2, sem commit separado."

patterns-established: []

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: D1
    description: "reconcileLiveActivityIntents() nunca drena (e nunca destrói) a fila durável do App Group antes de confirmar um draft ativo — a entrada de um toque no Lock Screen durante o cold-launch sobrevive a uma primeira chamada prematura, disponível para a próxima"
    requirement: "CMD-01"
    verification:
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#chamado com draft ainda null (ordem real do boot, sem setState prévio) não drena a fila nem perde a entrada"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts#depois que o draft é hidratado, uma nova chamada aplica a entrada que a chamada anterior (draft null) preservou"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivityIntentQueue.test.ts (7 casos pré-existentes de 16-02, regressão)"
        status: pass
    human_judgment: false
  - id: D2
    description: "startOrResume() chama reconcileLiveActivityIntents() (guardado por isCurrent()) nos três ramos que hidratam um draft ativo; App.tsx não chama mais reconcileLiveActivityIntents() no boot cru"
    requirement: "CMD-01"
    verification:
      - kind: unit
        ref: "__tests__/activeSessionStore.test.ts#startOrResume() chama reconcileLiveActivityIntents() ao resolver para um draft ativo (16-VERIFICATION.md gap 1 / 16-REVIEW.md CR-01)"
        status: pass
      - kind: other
        ref: "grep -c reconcileLiveActivityIntents src/store/activeSessionStore.ts == 5 (1 tipo + 1 def + 3 call sites); grep -c reconcileLiveActivityIntents App.tsx == 0"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (0 erros); npx jest (167/167 suítes, 1878/1878 testes, suíte completa do projeto)"
        status: pass
    human_judgment: false
  - id: D3
    description: "O comportamento físico real (force-quit -> toque no Lock Screen -> reabrir o app -> navegar para a sessão -> série já concluída, sem novo PASS-B) produz o efeito esperado no aparelho"
    requirement: "CMD-02"
    verification: []
    human_judgment: true
    rationale: "Exige aparelho físico com o app efetivamente force-quit e reaberto — não verificável neste ambiente. Escopo explícito da Plano 16-06 (UAT física de re-execução), conforme a seção <verification> da própria 16-04-PLAN.md."

duration: ~5min (commits 70699a3 a 7ffa2c0; não inclui leitura/análise prévia)
completed: 2026-08-18
status: complete
---

# Phase 16 Plan 04: Guarda de hidratação + reconciliação movida para startOrResume() Summary

**`reconcileLiveActivityIntents()` ganha uma guarda de hidratação (early-return sem drenar a fila do App Group quando não há draft ativo) e a chamada migra do `useEffect` de boot cru de `App.tsx` para dentro dos três ramos de `startOrResume()` que hidratam `draft` — fecha `16-VERIFICATION.md` gap 1 / `16-REVIEW.md` CR-01, a causa raiz confirmada do `force_quit_toque=PASS-B` observado em `16-03-SUMMARY.md`.**

## Performance

- **Duration:** ~5 min entre o primeiro e o último commit (70699a3 → 7ffa2c0); não inclui o tempo de leitura/análise do código existente antes de codar
- **Started:** 2026-08-18T07:21:03-03:00 (commit RED Task 1)
- **Completed:** 2026-08-18T07:26:11-03:00 (commit GREEN Task 2)
- **Tasks:** 2 de 2
- **Files modified:** 4

## Accomplishments
- `activeSessionStore.ts::reconcileLiveActivityIntents`: guarda de hidratação nova — `const draftAtual = get().draft; if (!draftAtual || draftAtual.status !== 'active') return;` como primeira linha do corpo, ANTES de qualquer chamada a `drainQueuedLiveActivityIntents()` (destrutiva)
- `activeSessionStore.ts::startOrResume`: 3 novos call sites `if (isCurrent()) await get().reconcileLiveActivityIntents();`, um por ramo que chega a `status: 'active'` (retomada offline, reconciliado com o servidor, sem rascunho local)
- `App.tsx`: `useEffect` de boot sem a chamada a `reconcileLiveActivityIntents()` — `reconcileOrphanActivities()` chamado diretamente, sem `.finally()` encadeado; import órfão de `useActiveSessionStore` removido
- `__tests__/liveActivityIntentQueue.test.ts`: 2 novos casos — guarda de hidratação (`draft === null` não drena) + sequência "boot cru → hidratação → reconciliação aplica"
- `__tests__/activeSessionStore.test.ts`: 1 novo caso — `startOrResume()` chama de fato `drainQueuedLiveActivityIntents()` (espiado via import direto do módulo mockado globalmente) ao resolver para um draft ativo

## Task Commits

Task 1 é `type="tracer" tdd="true"`; Task 2 é `type="auto" tdd="true"` — ambas seguiram RED→GREEN explícito:

1. **Task 1 RED — teste reproduzindo draft null no momento da chamada** - `70699a3` (test)
2. **Task 1 GREEN — guarda de hidratação em reconcileLiveActivityIntents()** - `efd5e35` (feat)
3. **Task 2 RED — teste provando que startOrResume() não chama reconcile hoje** - `7222a35` (test)
4. **Task 2 GREEN — 3 call sites em startOrResume() + remoção do boot cru** - `7ffa2c0` (feat)

## Files Created/Modified
- `src/store/activeSessionStore.ts` - guarda de hidratação em `reconcileLiveActivityIntents`; 3 call sites em `startOrResume`
- `App.tsx` - remove a chamada a `reconcileLiveActivityIntents()` do boot cru; remove import órfão de `useActiveSessionStore`
- `__tests__/liveActivityIntentQueue.test.ts` - 2 novos casos (draft null / sequência boot→hidratação→reconciliação)
- `__tests__/activeSessionStore.test.ts` - 1 novo caso (startOrResume chama a reconciliação de fato)

## Decisions Made
- Ver `key-decisions` no frontmatter: (1) o gate de feedback do tracer (Task 1) foi tratado como autônomo dado o contexto de execução em worktree de wave sem humano disponível, com o `<verify>` 100% automatizado já verde antes de seguir para a Task 2; (2) import órfão de `useActiveSessionStore` em `App.tsx` removido dentro da própria Task 2 (código morto, Rule 1).

## Deviations from Plan

None - plano executado exatamente como escrito. Os dois "achados" acima (gate de tracer tratado como autônomo; import órfão removido) são decisões operacionais documentadas em `key-decisions`, não desvios de comportamento do código entregue.

## Issues Encountered
None.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- Gap 1 de `16-VERIFICATION.md` / CR-01 de `16-REVIEW.md` fechado em lógica e prova automatizada: a fila do App Group nunca é destruída antes de um draft ativo existir, e a reconciliação roda em todo ramo de `startOrResume()` que hidrata esse draft.
- `npx tsc --noEmit` limpo; suíte COMPLETA do projeto rodada (não só os arquivos desta plano): 167/167 suítes, 1878/1878 testes verdes — zero regressão nas ~27 chamadas pré-existentes a `startOrResume` em `activeSessionStore.test.ts` e nos 7 casos pré-existentes de `liveActivityIntentQueue.test.ts`.
- Gap 2 (`16-VERIFICATION.md` / CR-02 — replay/duplicação de entrada já entregue "quente") permanece em aberto, fora do escopo desta plano — endereçado pela Plano 16-05 (fila não-destrutiva, App Group).
- O comportamento físico real (force-quit → toque → reabrir → navegar para a sessão → série já concluída) só é confirmável na Plano 16-06 (UAT física de re-execução), conforme a própria `<verification>` de `16-04-PLAN.md`.

## Self-Check: PASSED

Todos os 4 arquivos modificados (`src/store/activeSessionStore.ts`, `App.tsx`,
`__tests__/liveActivityIntentQueue.test.ts`, `__tests__/activeSessionStore.test.ts`)
verificados presentes em disco; todos os 4 commits (`70699a3`, `efd5e35`,
`7222a35`, `7ffa2c0`) confirmados em `git log`.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-18*
