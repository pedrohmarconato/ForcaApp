---
phase: 16-tela-bloqueada-comandar
verified: 2026-08-17T23:00:00Z
status: gaps_found
score: 6/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "16-02 truth #1 — reconcileLiveActivityIntents() drena a fila do App Group e aplica cada intenção pendente contra completeSet()/activateSet()/adjustRest() na próxima abertura do app em foreground (cold-launch, o cenário para o qual esta plano existe)"
    status: failed
    reason: >
      Confirmado por código E por UAT físico que o mecanismo não aplica a
      intenção no cenário de cold-launch que ele foi construído para resolver.
      App.tsx chama reconcileLiveActivityIntents() no useEffect de montagem da
      raiz (primeiro efeito do boot), antes de qualquer startOrResume()
      hidratar `draft` (só ocorre depois, em ActiveSessionScreen, via I/O
      assíncrono de auth/navegação). No cold-launch, `draft` é `null` no
      momento exato da drenagem. IntentActionQueue.drainAll() é destrutivo —
      lê e `removeObject` na mesma chamada, sem devolver a entrada à fila se
      ninguém a consumiu. Resultado: a entrada é lida, descartada pela guarda
      `if (!draft ...) continue`, e perdida para sempre — nenhuma segunda
      tentativa, porque drainIntentQueue() só é chamado uma vez por processo
      (App.tsx:37-39). Isso é EXATAMENTE o que o UAT físico observou:
      force_quit_toque=PASS-B em vez do PASS-A esperado pelo próprio desenho
      de 16-02 (16-03-SUMMARY.md: "a reconciliação de cold-launch (16-02) não
      aplicou sozinha o intent enfileirado ... ao reabrir, o app foi para a
      Home e a série não veio concluída"). 16-REVIEW.md (CR-01) identifica a
      mesma causa raiz por leitura de código, de forma independente do UAT.
    artifacts:
      - path: "App.tsx"
        issue: "reconcileLiveActivityIntents() chamado no useEffect de montagem da raiz (linhas 37-42), antes de qualquer hidratação de draft — corre e sempre perde a corrida no cold-launch"
      - path: "src/store/activeSessionStore.ts"
        issue: "reconcileLiveActivityIntents() (linhas 1563-1601) lê get().draft DEPOIS de já ter drenado (e destruído) a fila — se draft for null, a entrada correspondente já foi perdida, não há segunda chance"
      - path: "modules/live-activity/ios/IntentActionQueue.swift"
        issue: "drainAll() (linhas 67-71) é destrutivo e de tiro único — remove a chave do UserDefaults incondicionalmente, sem mecanismo de devolução em caso de falha de aplicação do lado JS"
    missing:
      - "Adiar a drenagem para depois da hidratação real do draft (ex.: dentro/depois de startOrResume()), OU trocar drainAll() por uma leitura não-destrutiva que só remove entradas efetivamente aplicadas, repetindo a tentativa em cada retomada até a fila esvaziar (fix concreto já proposto em 16-REVIEW.md CR-01)"
      - "Um caso de teste que reproduza a ordem real do boot (draft === null no momento da chamada, sem setState prévio) — a suíte atual (__tests__/liveActivityIntentQueue.test.ts) sempre popula o draft ANTES de invocar reconcile em todos os 7 casos, então nunca exercitou o caminho que causou o PASS-B (confirmado por leitura do arquivo: toda chamada usa withMockedActions(draft()) antes de reconcile)"
  - truth: "Nenhum caminho de gravação paralelo/duplicado é criado — cada toque produz exatamente uma gravação pelo caminho completeSet()/activateSet()/adjustRest() (extensão implícita do goal da fase: 'a Live Activity nunca vira fonte de verdade')"
    status: failed
    reason: >
      16-REVIEW.md (CR-02), confirmado por leitura direta de
      CompleteSetIntent.swift/SkipRestIntent.swift/AdjustRestIntent.swift: os
      três perform() SEMPRE fazem IntentActionQueue.enqueue(...) de forma
      incondicional antes de tentar sendEvent(...) — não existe nenhum
      mecanismo de "ack" ou remoção seletiva quando a entrega in-process (app
      vivo, backgrounded) já teve sucesso e a ação já foi aplicada. A única
      forma de esvaziar a fila é drainAll(), chamado uma única vez por
      processo no boot (App.tsx). Consequência: toda ação tocada com o app
      vivo continua acumulada no App Group até o cap de 20; se o dono depois
      force-quit o app (minutos/horas depois, mesma sessão), o próximo boot
      drena TODAS as entradas acumuladas — incluindo as já aplicadas ao vivo —
      e as reaplica contra o draft então corrente. A guarda de CAS só verifica
      sessionLogId (não identidade da entrada nem se já foi processada), então
      qualquer entrada cujo sessionLogId ainda bate com a sessão ativa é
      reaplicada: um completeSet já contabilizado avança o treino sozinho de
      novo, um adjustRest já usado desloca o cronômetro de novo, um skipRest
      já usado pula mais uma série sem toque do dono.
    artifacts:
      - path: "modules/live-activity/ios/CompleteSetIntent.swift"
        issue: "enqueue incondicional antes de sendEvent — nenhuma remoção quando a entrega in-process tem sucesso (linhas 16-27)"
      - path: "modules/live-activity/ios/SkipRestIntent.swift"
        issue: "mesmo padrão — enqueue incondicional, sem ack de entrega"
      - path: "modules/live-activity/ios/AdjustRestIntent.swift"
        issue: "mesmo padrão — enqueue incondicional, sem ack de entrega"
      - path: "modules/live-activity/ios/IntentActionQueue.swift"
        issue: "nenhuma API de remoção seletiva por entrada existe (só enqueue/drainAll, que limpa tudo)"
    missing:
      - "Identificador estável por entrada (UUID) + confirmação explícita de remoção do lado JS após aplicar com sucesso (AsyncFunction(\"ackIntentAction\")), OU só enfileirar quando sendEvent não tiver sido entregue — fix concreto já proposto em 16-REVIEW.md CR-02"
deferred: []
human_verification: []
---

# Phase 16: Tela bloqueada — comandar Verification Report

**Phase Goal:** O dono controla a série atual e o descanso direto da tela bloqueada — sem abrir o app — com cada toque seguindo o mesmo caminho de registro (completeSet() → outbox → servidor) que já existe hoje; a Live Activity nunca vira fonte de verdade.
**Verified:** 2026-08-17
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (16-01) Toque em "Concluir série" no Lock Screen registra via completeSet() já existente, caminho quente | ✓ VERIFIED | `src/native/liveActivityIntentBridge.ts` despacha para `useActiveSessionStore.getState().completeSet(...)`; `__tests__/liveActivityIntentBridge.test.ts` (6/6 casos) rodado nesta verificação — passa. UAT físico: `concluir_serie=PASS` (16-03-SUMMARY.md) |
| 2 | (16-01) "-30s"/"+30s" chama adjustRest(deltaSeconds) com o delta exato, sem esperar round-trip JS para o card nativo | ✓ VERIFIED | `AdjustRestIntent.perform()` chama `Activity.update()` implícito via `LiveActivityModule`; teste unitário cobre despacho exato do delta. UAT físico: `ajustar_descanso=PASS`, `sem_lag=PASS` |
| 3 | (16-01) "Pular" ativa a próxima série pendente via activateSet(), mesma função do app | ✓ VERIFIED | `handleIntentAction` case `'skipRest'` chama `activateSet`, nunca `completeSet` — teste dedicado passa. UAT físico: `pular_descanso=PASS` |
| 4 | (16-01) Nenhum botão abre o app a partir de dentro de perform() — reabertura só via widgetURL() fora dos intents | ✓ VERIFIED | Os 3 `perform()` só chamam `IntentActionQueue.enqueue` + `sendEvent`, nenhuma navegação/Link; `.widgetURL(...)` está na `ActivityConfiguration`, fora de qualquer `Button(intent:)` |
| 5 | (16-01) Cada toque escreve na fila durável ANTES do evento in-process | ✓ VERIFIED | Confirmado por leitura: `enqueue(...)` antecede `sendEvent(...)` nos 3 arquivos de Intent, sem exceção |
| 6 | (16-02) reconcileLiveActivityIntents() aplica cada intenção pendente drenada no boot, no cenário de cold-launch para o qual foi construída | ✗ FAILED | App.tsx chama a reconciliação antes de qualquer hidratação de `draft`; `drainAll()` é destrutivo e de tiro único — a entrada é lida e perdida quando `draft === null`. Confirmado por código (16-REVIEW.md CR-01) E por UAT físico real (`force_quit_toque=PASS-B`, não PASS-A — 16-03-SUMMARY.md) |
| 7 | (16-02) Intenção com sessionLogId nulo/divergente é descartada, nunca aplicada contra sessão errada | ✓ VERIFIED | Guarda de CAS relida a cada iteração (`get().draft` dentro do loop); 7 testes em `__tests__/liveActivityIntentQueue.test.ts` cobrem match/mismatch/null, rodados nesta verificação — passam |
| 8 | Nenhum caminho de gravação paralelo/duplicado — cada toque produz exatamente uma gravação | ✗ FAILED | Entregas in-process bem-sucedidas nunca removem a entrada da fila durável (nenhuma API de ack/remoção seletiva existe); replay em cold-launch subsequente pode duplicar completeSet/skipRest/adjustRest contra a mesma sessão ainda ativa (16-REVIEW.md CR-02, confirmado por leitura direta dos 3 arquivos de Intent) |

**Score:** 6/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/native/liveActivityIntentBridge.ts` | Despacho onIntentAction → completeSet/activateSet/adjustRest | ✓ VERIFIED | Existe, substantivo, wired em App.tsx, testado (6/6) |
| `modules/live-activity/ios/CompleteSetIntent.swift` | LiveActivityIntent real, grava fila + emite evento | ✓ VERIFIED (com defeito B) | Existe, substantivo, wired; enqueue incondicional sem ack (gap 2) |
| `modules/live-activity/ios/IntentActionQueue.swift` | Fila durável, cap 20, enqueue+drainAll | ⚠️ HOLLOW | Existe, substantivo, wired ao ponto de leitura (drainIntentQueue) — mas `drainAll()` destrutivo é a causa raiz do gap 1; nenhuma API de remoção seletiva (causa raiz do gap 2) |
| `src/store/activeSessionStore.ts::reconcileLiveActivityIntents` | Drena e aplica fila com CAS por sessionLogId | ⚠️ HOLLOW | Existe, substantivo, wired (chamado em App.tsx) — mas funcionalmente inerte no cenário de cold-launch que motivou sua criação (gap 1) |
| `modules/live-activity/ios/LiveActivityModule.swift::drainIntentQueue` | AsyncFunction lê+limpa fila via App Group | ✓ VERIFIED | Existe, conversão pura confirmada, `grep -c "AsyncFunction(\"drainIntentQueue\")"` = 1 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `WidgetLiveActivity.swift` (Button(intent:)) | `CompleteSetIntent.swift`/`SkipRestIntent.swift`/`AdjustRestIntent.swift` | AppIntents roteado para o processo do app | WIRED | Confirmado — perform() real roda no target do app; stub trivial no target da extensão, confirmado por `grep` (0 ocorrências de `IntentActionQueue.enqueue` no stub) |
| `LiveActivityModule.swift` (sendEvent) | `liveActivityIntentBridge.ts` | `onIntentAction` / `subscribeLiveActivityIntentAction` | WIRED | Confirmado — evento tipado, listener registrado em App.tsx |
| `liveActivityIntentBridge.ts` | `activeSessionStore.ts` (completeSet/activateSet/adjustRest) | `getState().<ação>(...)` | WIRED | Confirmado — nenhuma lógica de gravação nova |
| `App.tsx` (boot) | `reconcileLiveActivityIntents()` | chamado antes de `reconcileOrphanActivities()` | WIRED, mas ORDEM ERRADA vs. hidratação de draft | O link em si existe e roda na ordem relativa correta em relação a `reconcileOrphanActivities()`, mas roda ANTES de `startOrResume()` hidratar `draft` — a race que causa o gap 1 |
| `activeSessionStore.ts` (reconcileLiveActivityIntents) | `modules/live-activity/index.ts` (drainQueuedLiveActivityIntents) | `await drainQueuedLiveActivityIntents()` | WIRED | Confirmado — única leitura da fila |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Bridge de intent "quente" despacha corretamente (regressão) | `npx jest __tests__/liveActivityIntentBridge.test.ts __tests__/liveActivityIntentQueue.test.ts` | 2 suites, 13/13 testes passaram | ✓ PASS |
| Tipos TypeScript consistentes (regressão) | `npx tsc --noEmit` | saída vazia (0 erros) | ✓ PASS |
| Suíte de reconciliação nunca exercita `draft === null` no momento da chamada (WR-01) | `grep -n "withMockedActions(draft())" __tests__/liveActivityIntentQueue.test.ts` | 7 ocorrências — todos os 7 casos populam o draft ANTES de chamar reconcile | ✗ FAIL (confirma gap 1 — bug real não coberto por teste) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CMD-01 | 16-01, 16-02, 16-03 | Concluir série com 1 toque, mesmo caminho completeSet()→outbox→servidor | ⚠️ PARCIALMENTE SATISFEITO | Caminho quente totalmente provado (teste + UAT PASS). Caminho frio (cold-launch) tem o mecanismo de reconciliação automática comprovadamente inerte (gap 1) — o critério de sucesso 3 do ROADMAP permite o fallback "app reaberto para concluir" (PASS-B), então a letra do ROADMAP está tecnicamente satisfeita, mas a garantia mais forte que a própria 16-02-PLAN.md se propôs a entregar não se sustenta |
| CMD-02 | 16-01, 16-03 | Pular/ajustar descanso com timer refletindo sem lag | ✓ SATISFEITO | Caminho quente provado por teste + UAT físico (PASS em ajustar_descanso/pular_descanso/sem_lag); nenhum gap identificado nesta metade do requisito |

Nenhum requirement órfão: REQUIREMENTS.md mapeia CMD-01/CMD-02 exclusivamente à Fase 16, ambos cobertos pelas 3 plans desta fase.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `App.tsx` | 37-42 | Race condition: reconciliação de estado durável rodando antes da hidratação do estado que ela precisa consultar | 🛑 Blocker | Causa raiz do gap 1 — perda silenciosa e permanente da intenção no cold-launch |
| `modules/live-activity/ios/IntentActionQueue.swift` | 67-71 | Leitura destrutiva de fila (`drainAll`) sem mecanismo de devolução em caso de não-aplicação | 🛑 Blocker | Amplifica o gap 1 — não há segunda chance depois da primeira leitura |
| `modules/live-activity/ios/CompleteSetIntent.swift`, `SkipRestIntent.swift`, `AdjustRestIntent.swift` | enqueue incondicional | Ausência de ack/remoção seletiva pós-entrega bem-sucedida | 🛑 Blocker | Causa raiz do gap 2 — risco de replay/duplicação de gravação em cold-launch subsequente |
| `modules/live-activity/ios/IntentActionQueue.swift` | 41-53 | Falha silenciosa (`?.`) se `UserDefaults(suiteName:)` retornar nil — sem log | ⚠️ Warning | Regressão de entitlements em produção não deixaria rastro (16-REVIEW.md WR-03) |
| `modules/live-activity/ios/IntentActionQueue.swift` | 56-63 | `enqueue`/`writeAll` não atômico entre processos concorrentes (extensão vs. app) | ⚠️ Warning | Risco baixo, mas presente (16-REVIEW.md WR-02) |

Nenhum marcador de dívida (`TBD`/`FIXME`/`XXX`) sem referência formal encontrado nos arquivos desta fase — os achados acima já estão referenciados em `16-REVIEW.md` e em `.planning/todos/pending/force-quit-reconciliacao-pass-b.md`.

## Human Verification Required

Nenhum item novo — o UAT físico (16-03) já cobriu o comportamento observável (concluir_serie/ajustar_descanso/pular_descanso/sem_lag/force_quit_toque, todos PASS ou PASS-B). Os gaps identificados aqui são de causa raiz no código, já confirmados por leitura estática e por regressão de teste (não dependem de novo julgamento humano) — não é um "PRESENT_BEHAVIOR_UNVERIFIED", é um FAILED comprovado tanto por análise de código quanto pelo próprio resultado físico já coletado.

## Gaps Summary

A Fase 16 entrega de forma sólida o caminho "quente" (app já vivo quando o toque acontece): os três `LiveActivityIntent`s existem, compilam nos dois targets, despacham corretamente para `completeSet()`/`activateSet()`/`adjustRest()` já existentes na store (nenhum caminho de gravação novo), e o UAT físico confirmou isso sem lag perceptível — CMD-02 e a metade "quente" de CMD-01 estão genuinamente completos.

O problema está no caminho "frio" (cold-launch), que é o propósito inteiro da Plano 16-02 e o critério de sucesso 3 do ROADMAP. Dois defeitos relacionados, ambos classificados `critical` pelo code review (`16-REVIEW.md`) e ambos confirmados por leitura direta do código nesta verificação:

1. **A reconciliação nunca aplica nada no cenário para o qual foi construída.** `reconcileLiveActivityIntents()` roda no boot ANTES de qualquer hidratação de `draft`, e a leitura da fila (`drainAll()`) é destrutiva — a entrada do toque na tela bloqueada é lida e descartada silenciosamente, sem segunda chance. Isso não é uma hipótese: o próprio UAT físico observou exatamente esse comportamento (`force_quit_toque=PASS-B`, não o PASS-A que o desenho de 16-02 esperava), e o code review chegou à mesma causa raiz por leitura de código independente do UAT. A suíte de testes de `reconcileLiveActivityIntents` nunca exercitou esse caminho (todos os 7 casos hidratam o draft ANTES de chamar reconcile), confirmado nesta verificação por grep.

2. **Nenhuma entrada é removida da fila quando a entrega "quente" (in-process) já teve sucesso.** Isso cria um risco real de replay/duplicação: ações já aplicadas com o app vivo continuam na fila do App Group e são reaplicadas cegamente contra a sessão ainda ativa na próxima vez que o app for force-quit e reaberto, sujeitas apenas à guarda de `sessionLogId` (que não distingue "já processado" de "novo").

O critério de sucesso 3 do ROADMAP tecnicamente aceita o resultado observado (PASS-B — "app reaberto para concluir" é uma das duas saídas aceitáveis), então a letra do ROADMAP para CMD-01 não é violada pelo gap 1 isoladamente. Mas os `must_haves.truths` da própria 16-02-PLAN.md prometem uma garantia mais forte ("aplica cada intenção pendente") que hoje não se sustenta nem no código nem no comportamento observado — e o gap 2 (replay/duplicação) não tem nenhuma saída aceitável equivalente no ROADMAP: é uma ameaça de integridade de dado sem mitigação nenhuma hoje. Por isso a fase fica `gaps_found`, não `passed`: o dono já teve uma prova de campo (16-03) de que a reconciliação automática não funciona, e o código confirma por que — reportar "passed" aqui seria inflar um resultado que o próprio dono já viu falhar no aparelho.

---

_Verified: 2026-08-17_
_Verifier: Claude (gsd-verifier)_
