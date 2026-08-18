---
phase: 16-tela-bloqueada-comandar
reviewed: 2026-08-17T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - __mocks__/modules-live-activity.ts
  - __tests__/liveActivityIntentBridge.test.ts
  - __tests__/liveActivityIntentQueue.test.ts
  - App.tsx
  - modules/live-activity/index.ts
  - modules/live-activity/ios/AdjustRestIntent.swift
  - modules/live-activity/ios/CompleteSetIntent.swift
  - modules/live-activity/ios/IntentActionQueue.swift
  - modules/live-activity/ios/LiveActivityModule.swift
  - modules/live-activity/ios/SkipRestIntent.swift
  - package.json
  - scripts/verify-native-skeleton.sh
  - src/native/liveActivityIntentBridge.ts
  - src/store/activeSessionStore.ts
  - targets/session-widget/AdjustRestIntent.swift
  - targets/session-widget/CompleteSetIntent.swift
  - targets/session-widget/SkipRestIntent.swift
  - targets/session-widget/WidgetLiveActivity.swift
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-08-17
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Fase 16 (16-01 + 16-02) adiciona três `LiveActivityIntent`s no processo do app, uma fila durável no App Group (`IntentActionQueue`, cap 20) e a drenagem no boot (`reconcileLiveActivityIntents`) que aplica as entradas pendentes contra `completeSet`/`activateSet`/`adjustRest` já existentes na store, com guarda de CAS por `sessionLogId`.

O relato de UAT físico (PASS-B em vez de PASS-A no force-quit) tem causa raiz identificável no código, não é falha de dispositivo: `reconcileLiveActivityIntents()` é chamado no `useEffect` de montagem de `App.tsx`, ANTES de qualquer `startOrResume()` hidratar `draft` — no cold-launch, `draft` é `null` no momento exato em que a fila é drenada. Como `drainAll()` é destrutivo (lê e `removeObject` na mesma chamada, sem reposição em falha), a entrada enfileirada pelo toque na tela bloqueada é lida, descartada pela guarda `!draft`, e perdida para sempre — exatamente o comportamento observado (PASS-B). Um segundo bug relacionado, mais amplo que o cenário de force-quit, foi encontrado por rastreamento de código: nenhuma entrada da fila é removida quando o `sendEvent` in-process já a entregou com sucesso (app vivo, backgrounded mas não terminado) — a entrada IGUAL fica na fila e é reaplicada na próxima drenagem de boot, contra um `draft` que pode já ter avançado, duplicando a ação.

Os dois achados críticos compartilham a mesma causa estrutural: a fila é drenada uma única vez por ciclo de vida do processo, sem reconciliação tardia nem confirmação de entrega. A suíte de testes de `reconcileLiveActivityIntents` nunca exercita `draft === null` no momento da chamada (sempre popula o draft ANTES de invocar `reconcile`), então o bug real do UAT não tinha como ser pego pelos testes existentes.

## Critical Issues

### CR-01: `reconcileLiveActivityIntents()` corre com a hidratação do `draft` no boot — fila destrutiva perde a ação para sempre (causa raiz do PASS-B do UAT)

**File:** `App.tsx:37-42`, `src/store/activeSessionStore.ts:1574-1583`, `modules/live-activity/ios/IntentActionQueue.swift:67-71`

**Issue:**
`App.tsx` dispara `reconcileLiveActivityIntents()` no `useEffect` de montagem da raiz — o primeiro efeito a rodar no boot, antes de `RootNavigator` resolver auth/navegação e muito antes de `ActiveSessionScreen` chamar `startOrResume()` (único ponto que hidrata `draft`, em `src/screens/ActiveSessionScreen.tsx:278`). No force-quit + relançamento, a store do Zustand não tem `persist`/rehydration síncrona — `draft` começa como `null` (estado inicial declarado em `activeSessionStore.ts:564`) e só é populado depois de I/O assíncrono de `startOrResume`.

`reconcileLiveActivityIntents` (activeSessionStore.ts:1563-1601) chama `drainQueuedLiveActivityIntents()` primeiro, e SÓ DEPOIS lê `get().draft` a cada iteração (linha 1575). No cold-launch, essa primeira leitura sempre encontra `draft === null`, o que cai na guarda `if (!draft || ...) continue;` (linha 1576-1583) — a entrada é descartada em silêncio.

O problema é que `IntentActionQueue.drainAll()` (IntentActionQueue.swift:67-71) é **destrutivo e de tiro único**: lê todo o conteúdo do `UserDefaults` do App Group e imediatamente `removeObject(forKey:)`, sem qualquer mecanismo de "devolver à fila se ninguém consumiu". Uma vez lida e descartada pela guarda do lado JS, a ação do toque na tela bloqueada NUNCA é reaplicada — não há segunda chance, porque nada mais chama `drainIntentQueue()` durante o ciclo de vida do processo (confirmado: único call site é `activeSessionStore.ts:1566`, chamado uma única vez em `App.tsx:37-39`).

Isso é exatamente o cenário do UAT: force-quit, toque no botão da tela bloqueada, reabrir o app → esperado PASS-A (aplicação automática), observado PASS-B (não aplicou sozinho) porque a fila já tinha sido drenada e descartada antes do rascunho existir.

**Fix:**
Não drenar a fila antes que haja um `draft` candidato. Duas alternativas concretas:

1. **Adiar a drenagem para depois da hidratação** — mover a chamada de `reconcileLiveActivityIntents()` para dentro (ou imediatamente depois) de `startOrResume()`, quando `draft` já está populado, em vez de no mount da raiz do app:
```ts
// src/store/activeSessionStore.ts — dentro de startOrResume, após `set({ draft: ..., status: 'active', ... })`
await get().reconcileLiveActivityIntents();
```
2. **Ou tornar a leitura não-destrutiva até confirmar aplicação** — trocar `drainAll()` por um `peekAll()` que só remove as entradas efetivamente aplicadas (ou nenhuma, se `draft` ainda for `null`), e repetir a tentativa em cada `startOrResume`/retomada até a fila esvaziar:
```swift
// IntentActionQueue.swift
public static func drainMatching(sessionLogId: String) -> [QueuedIntentAction] {
  let all = readAll()
  let (aplicaveis, resto) = all.reduce(into: ([QueuedIntentAction](), [QueuedIntentAction]())) { acc, a in
    if a.sessionLogId == sessionLogId { acc.0.append(a) } else { acc.1.append(a) }
  }
  writeAll(resto)
  return aplicaveis
}
```
Qualquer uma das duas fecha a lacuna — a essencial é: nunca destruir uma entrada da fila antes de confirmar que existe um `draft` ativo com o `sessionLogId` correspondente para aplicá-la.

---

### CR-02: Entrada da fila entregue com sucesso via `sendEvent` in-process nunca é removida do App Group — replay duplicado na próxima drenagem de boot

**File:** `modules/live-activity/ios/CompleteSetIntent.swift:16-26`, `modules/live-activity/ios/SkipRestIntent.swift:13-20`, `modules/live-activity/ios/AdjustRestIntent.swift:23-32`, `modules/live-activity/ios/IntentActionQueue.swift` (ausência de remoção seletiva)

**Issue:**
Os três `LiveActivityIntent`s sempre fazem `IntentActionQueue.enqueue(...)` incondicionalmente, e SÓ ENTÃO tentam `LiveActivityModule.shared?.sendEvent(...)`. Quando o app está vivo (backgrounded, não terminado) e a bridge JS ainda está registrada, o `sendEvent` chega a `handleIntentAction` (`src/native/liveActivityIntentBridge.ts:17-45`) e a ação é aplicada IMEDIATAMENTE contra o `draft` corrente.

Porém a entrada gravada em `IntentActionQueue` (App Group `UserDefaults`) **não é removida** quando essa entrega in-process tem sucesso — não existe nenhum "ack" ou remoção seletiva por entrada; a única forma de esvaziar a fila é `drainAll()`, chamado uma única vez por processo (boot, ver CR-01). Isso significa que toda ação tocada com o app ainda vivo continua acumulando no App Group (até o cap de 20, `IntentActionQueue.swift:39`) mesmo tendo sido aplicada corretamente na hora.

Se, mais tarde (minutos ou horas depois, mesma sessão ou não), o usuário força o encerramento do app e o relança, `reconcileLiveActivityIntents()` drena TODAS as entradas acumuladas — incluindo as que já foram aplicadas ao vivo — e as reaplica contra o `draft` então corrente. Como a guarda de CAS só verifica `sessionLogId` (não identidade da entrada nem se ela já foi processada), qualquer entrada cujo `sessionLogId` ainda bater com a sessão ativa é reaplicada: um `completeSet` já contabilizado é aplicado de novo sobre a série seguinte (avançando o treino sozinho), um `adjustRest` já usado desloca o cronômetro de novo, um `skipRest` já usado pula mais uma série.

**Fix:**
A entrega in-process bem-sucedida precisa remover a entrada correspondente da fila durável — ela só deve sobreviver para o boot quando NINGUÉM a consumiu. Duas formas de fechar isso sem reescrever o desenho:

1. **Identificador estável por entrada + remoção no ACK do lado JS**: adicionar um `id: String` (UUID) a `QueuedIntentAction`/`QueuedIntentActionRecord`, incluí-lo no payload de `sendEvent`, e o listener JS confirmar explicitamente a remoção via uma nova função nativa (`AsyncFunction("ackIntentAction") { id in IntentActionQueue.remove(id) }`) depois de aplicar a ação com sucesso.
2. **Ou, mais simples dado o desenho atual**: só enfileirar de forma durável quando o `sendEvent` falhar/não tiver ouvinte — mas isso exige que `perform()` saiba se a entrega chegou (o `LiveActivityIntent` roda no processo do app, então pode checar `LiveActivityModule.shared != nil` antes de decidir enfileirar):
```swift
// CompleteSetIntent.swift
func perform() async throws -> some IntentResult {
  let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId
  let delivered = LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "completeSet"]) != nil
  if !delivered {
    IntentActionQueue.enqueue(QueuedIntentAction(kind: .completeSet, deltaSeconds: nil, sessionLogId: sessionLogId, queuedAt: ISO8601DateFormatter().string(from: Date())))
  }
  return .result()
}
```
   (Nota: `sendEvent` não retorna se há ouvinte JS de fato inscrito, só se o módulo existe — a opção 1 é mais correta porque cobre o caso "módulo vivo mas sem listener/handler ainda montado"; a opção 2 é um paliativo mais simples, ainda assim melhor que o estado atual.)

Qualquer fix de CR-01 que passe a drenar a fila a cada `startOrResume` (não só no boot) também mitiga parte do estrago de CR-02 (a fila para de crescer sem limite entre relançamentos), mas não resolve a duplicação em si — a raiz é a ausência de remoção na entrega bem-sucedida.

## Warnings

### WR-01: Suíte de `reconcileLiveActivityIntents` nunca testa o cenário real do bug (draft ainda não hidratado no momento da drenagem)

**File:** `__tests__/liveActivityIntentQueue.test.ts:162-172`

**Issue:** `withMockedActions(draftValue)` sempre faz `useActiveSessionStore.setState({ draft: draftValue, ... })` SINCRONAMENTE antes de qualquer teste chamar `reconcileLiveActivityIntents()`. Nenhum caso de teste chama `reconcileLiveActivityIntents()` com `draft: null` já presente desde o `beforeEach` (estado inicial real da store no boot) para depois hidratar o draft — o que é exatamente a ordem de eventos do App.tsx real (`reconcile` roda antes do primeiro `startOrResume`). A suíte cobre bem a guarda de CAS por `sessionLogId` (linhas 193-217), mas não cobre a corrida de inicialização que efetivamente causou o PASS-B do UAT — por isso os testes passam 100% e o bug só apareceu no dispositivo físico.

**Fix:** Adicionar um caso que reproduz a ordem real: chamar `reconcileLiveActivityIntents()` com a store no estado inicial (`draft: null`, sem `setState` prévio) e afirmar que, hoje, nenhuma ação é aplicada — isso documenta o comportamento atual (perda silenciosa) e vira o teste de regressão natural quando CR-01 for corrigido (nesse caso a expectativa muda para "aplica depois que `startOrResume` roda").

### WR-02: `IntentActionQueue.enqueue`/`writeAll` não é atômico entre processos concorrentes (extensão de widget vs. processo do app)

**File:** `modules/live-activity/ios/IntentActionQueue.swift:56-63`

**Issue:** `enqueue` faz `readAll()` → `append` em memória → `writeAll()`, um read-modify-write clássico sem lock nem CAS a nível de `UserDefaults`. Os três `LiveActivityIntent`s rodam no processo do app (não na extensão), mas o AppIntents framework pode, em teoria, despachar dois `perform()` concorrentes (ex.: dois toques quase simultâneos em botões diferentes da Live Activity antes do primeiro `perform()` retornar) — o segundo `writeAll` pode sobrescrever o primeiro se as duas leituras ocorrerem antes de qualquer escrita, perdendo uma entrada sem erro nem log.

**Fix:** Baixo risco prático (toques sequenciais raramente colidem em uma janela tão estreita), mas se quiser fechar de vez, usar `NSFileCoordinator`/lock por semáforo ao redor de `readAll`+`writeAll`, ou mover para um formato append-only (uma entrada por chave, não um array serializado inteiro) para eliminar a janela de corrida.

### WR-03: Falha ao gravar na fila (App Group ausente ou encode falhando) é engolida em silêncio, sem log nem sinal de diagnóstico

**File:** `modules/live-activity/ios/IntentActionQueue.swift:41-53`

**Issue:** `defaults()` retorna `UserDefaults?` e todo call site usa `?.` — se o suite name do App Group estiver mal configurado em produção (regressão de entitlements não pega pelo `verify-native-skeleton.sh`, que só corre em dev/CI), `enqueue`/`writeAll` falham 100% das vezes sem nenhum rastro: nenhum toque na tela bloqueada nunca chegaria ao app, e não haveria nenhuma mensagem no Console/Crashlytics para diagnosticar por quê.

**Fix:** Ao menos um `os_log`/`print` no ramo de falha (`guard let data = defaults()?.data(...) else { os_log(...); return [] }`), para que uma regressão de entitlements deixe rastro no Console do dispositivo em vez de falha 100% silenciosa.

## Info

### IN-01: `moduleNameMapper` do Jest não está ancorado no início — casa qualquer path terminado em "modules/live-activity", não só o import relativo do projeto

**File:** `package.json:125-126`

**Issue:** A chave `"modules/live-activity$"` é regex sem `^`; qualquer caminho de import que termine literalmente em `modules/live-activity` (por exemplo, um pacote hipotético `@algumaLib/modules/live-activity`) seria remapeado para o mock deste projeto. Não há colisão real hoje, é só uma superfície maior que a necessária.

**Fix:** `"(^|/)modules/live-activity$"` ou `"^\\.\\./.*modules/live-activity$"` restringe ao padrão de import relativo realmente usado no projeto (`../../modules/live-activity`, `../modules/live-activity`, etc.).

---

_Reviewed: 2026-08-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
