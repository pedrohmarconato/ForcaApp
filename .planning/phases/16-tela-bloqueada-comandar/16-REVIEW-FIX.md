---
phase: 16-tela-bloqueada-comandar
fixed_at: 2026-08-19T20:45:54Z
review_path: .planning/phases/16-tela-bloqueada-comandar/16-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Fase 16: Code Review Fix Report

**Fixed at:** 2026-08-19T20:45:54Z
**Source review:** `.planning/phases/16-tela-bloqueada-comandar/16-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 5
- Fixed: 5
- Skipped: 0
- Informativos (IN-01..IN-05): fora de escopo (`fix_scope: critical_warning`)

**Prova das correções:**
- Suíte Jest completa: **1992 testes / 167 suítes verdes** (fase antes dos fixes: 1989 — os 5 achados acrescentaram 3 testes novos líquidos + atualizações).
- `npx tsc --noEmit`: 0 erros.
- Onde rodou: nos 5 commits, os gates rodaram no worktree isolado (`gsd-reviewfix/16-89574`), com `node_modules` do checkout principal acessado via symlink (o worktree não tem dependências por design) — os números são reproduzíveis do checkout principal após o merge dos commits.

## Fixed Issues

### CR-01: Caminho quente aplica intents SEM vínculo de sessão — toque de sessão antiga pode concluir série na sessão errada

**Files modified:**
- `modules/live-activity/ios/CompleteSetIntent.swift`
- `modules/live-activity/ios/SkipRestIntent.swift`
- `modules/live-activity/ios/AdjustRestIntent.swift`
- `modules/live-activity/ios/AdjustLoadIntent.swift`
- `modules/live-activity/ios/AdjustRepsIntent.swift`
- `modules/live-activity/index.ts`
- `src/native/liveActivityIntentBridge.ts`
- `__tests__/liveActivityIntentBridge.test.ts`
- **Commit:** `ec037f8`

**Applied fix:**
1. Os cinco intents agora incluem `sessionLogId` no payload do `sendEvent` (`sessionLogId ?? ""` — o id já era capturado em `perform()` via `Activity.activities.first?.attributes.sessionLogId`).
2. O tipo `LiveActivityIntentActionEvent` ganhou `sessionLogId?: string` em todas as variantes.
3. A bridge ganhou a guarda de CAS em TODOS os `case`s: `if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return;` — evento divergente é recusado **sem aplicar e sem ack**; a entrada dura continua na fila para o CAS da reconciliação decidir. Ausência do campo (build antigo ou atributo irresolvível, enviado como `""`) mantém o comportamento anterior — foi a semântica do código-exemplo do próprio review (recusar só divergência provada).
4. Testes novos: divergente em `completeSet`/`skipRest`/`adjustRest` → sem aplicar e sem ack; `sessionLogId` igual → aplica; ausente → aplica (retrocompat).

### WR-01: Bridge confirma o ack do completeSet sem aguardar o resultado — toque reprovado por canCompleteSet é destruído no caminho quente

**Files modified:**
- `src/native/liveActivityIntentBridge.ts`
- `__tests__/liveActivityIntentBridge.test.ts`
- **Commit:** `fe73503`

**Applied fix:**
- `handleIntentAction` virou `async`; o `case completeSet` agora `await` o resultado e só faz ack **quando `ok === true`** — a mesma invariante D1 do cold path (entrada reprovada por `canCompleteSet`/trava de reentrância nunca é acked; sobrevive na fila).
- Além da sugestão do review, adicionei try/catch em volta do `completeSet`: uma rejeição (I/O local) também não gera ack, e evita unhandled rejection no listener nativo.
- Testes novos: `completeSet → false` → ack NÃO chamado; `completeSet → reject` → ack NÃO chamado. O teste que codificava o comportamento errado (ack incondicional com `jest.fn()` que nunca resolvia `false`) foi corrigido para `mockResolvedValue(true)` e os handlers agora são aguardados (`await handler(...)`).

### WR-02: Falha de UM item na reconciliação aborta o boot da sessão para status 'error'

**Files modified:**
- `src/store/activeSessionStore.ts`
- `__tests__/activeSessionStore.test.ts`
- **Commit:** `7c61138`

**Applied fix:**
- O corpo do `for` de `reconcileLiveActivityIntents` foi envolvido num try/catch **por entrada**: rejeição (ex.: `completeSet()` propagando falha de `enqueueAndDrain` — disco cheio/quota do AsyncStorage) vira `console.warn` e o loop segue para as demais entradas; a entrada que falhou **não é acked** e permanece na fila.
- Teste novo: `enqueueAndDrain` rejeitando (via `jest.spyOn` no módulo real) na primeira entrada + `skipRest` válido na segunda → sessão segue `active` sem `saveError`, a segunda entrada foi processada, a primeira não foi acked.

### WR-03: Heurística de adoção de órfã compara relógios de domínios diferentes (device × servidor) com precisão de segundos

**Files modified:**
- `modules/live-activity/ios/IntentActionQueue.swift` (novo helper `queuedAtNow()`)
- `modules/live-activity/ios/CompleteSetIntent.swift`
- `modules/live-activity/ios/SkipRestIntent.swift`
- `modules/live-activity/ios/AdjustRestIntent.swift`
- `modules/live-activity/ios/AdjustLoadIntent.swift`
- `modules/live-activity/ios/AdjustRepsIntent.swift`
- `src/store/activeSessionStore.ts`
- `__tests__/activeSessionStore.test.ts`
- **Commit:** `2217663`

**Applied fix:** opções (a) + (b) do review:
1. **(a)** `queuedAt` agora é emitido com `.withFractionalSeconds` via `IntentActionQueue.queuedAtNow()` (formatter único, thread-safe), substituindo o `ISO8601DateFormatter().string(from:)` inline nos 5 intents.
2. **(b)** `nasceuNestaSessao` ganhou tolerância explícita `SKEW_MS = 60_000`: `enfileiradoEm >= iniciadaEm - SKEW_MS`. Decisão registrada no código: o custo é admitir um órfão até 60s mais velho que o início da sessão — descartar é irreversível (a própria 16-12 nasceu de um toque descartado em silêncio).
3. A opção (c) (persistir `sessionLogId` no atributo da Activity) não foi necessária: com (a)+(b) o caso comum do cold-launch fica coberto, e a mudança de atributo teria impacto de contrato maior (contentState/paridade) fora do escopo de um fix de review.
4. Testes novos: órfã 30s antes de `startedAt` → adotada e aplicada; órfã 90s antes → descartada por CAS (ack, sem aplicar); órfã sem fração no mesmo segundo de um `startedAt` com `.300` → adotada.

### WR-04: Entrega duplicada (evento quente + snapshot da fila) pode avançar DUAS séries num único toque de "Pular descanso" no boot

**Files modified:**
- `src/native/intentDeliveryRegistry.ts` (novo — módulo puro sem dependências, para não criar ciclo bridge↔store)
- `src/native/liveActivityIntentBridge.ts`
- `src/store/activeSessionStore.ts`
- `__tests__/liveActivityIntentBridge.test.ts`
- `__tests__/activeSessionStore.test.ts`
- **Commit:** `940478a`

**Applied fix:**
- Registro compartilhado por-processo de ids já aplicados pelo caminho quente: a bridge **marca** o id logo após aplicar (e antes do ack) e **salta** reentregas do mesmo id (defensivo contra listener duplicado); o loop de reconciliação **salta** entradas do snapshot cujo id já foi entregue quente — o ack já foi feito pela bridge, reaplicar avançaria N+2 num toque de N+1.
- Marcação só acontece quando a aplicação **de fato** ocorreu (`completeSet → ok`, `skipRest` com alvo etc.) — uma entrada reprovada não é marcada e continua elegível para o loop (D1 preservado).
- Testes novos: reentrega do mesmo id no bridge → aplica/ack 1x; entrada do snapshot já marcada → o loop não aplica nem ack.

## Skipped Issues

Nenhum achado em escopo foi pulado.

## Fora de escopo (Info)

IN-01 (ack assimétrico de `adjustRest` sem delta), IN-02 (`deltaValue > 0 ? 1 : -1` com delta 0), IN-03 (decode atômico da fila Swift), IN-04 (checagem de entitlement no skeleton), IN-05 (`activateSet`/`adjustRest` sem persistência do draft) ficaram fora do `fix_scope: critical_warning`. IN-02 colide com as linhas que o CR-01/WR-01 tocavam, mas mudar a semântica de direção é decisão de comportamento (não foi feita em silêncio).

## Nota de entrega (worktree)

O `main` avançou durante a execução (merges de outras sessões: 15-09, web). O fast-forward do `main` para o branch de fixes não foi possível (`--ff-only` falhou por divergência — comportamento por protocolo, sem reescrita de histórico). Os 5 commits de fix estão no branch **`gsd-reviewfix/16-89574`** (base `fdee6a4`), preservado para merge manual:

```bash
git merge gsd-reviewfix/16-89574   # ou cherry-pick se preferir commits avulsos
```

Os commits só tocam arquivos da Fase 16 (`src/native/liveActivityIntentBridge.ts`, `src/store/activeSessionStore.ts`, `src/native/intentDeliveryRegistry.ts`, `modules/live-activity/...`, `__tests__/liveActivityIntentBridge.test.ts`, `__tests__/activeSessionStore.test.ts`).

---

_Fixed: 2026-08-19T20:45:54Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
