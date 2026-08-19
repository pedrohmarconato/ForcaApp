---
phase: 16-tela-bloqueada-comandar
reviewed: 2026-08-19T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - App.tsx
  - __mocks__/modules-live-activity.ts
  - __tests__/activeSessionStore.test.ts
  - __tests__/cardioTempoDistancia.test.ts
  - __tests__/liveActivityIntentBridge.test.ts
  - __tests__/liveActivityIntentQueue.test.ts
  - __tests__/sessionPlayerTransitions.test.tsx
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
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Fase 16: Code Review Report

**Reviewed:** 2026-08-19
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Review adversário da Fase 16 ("tela bloqueada comandar") — fila durável de intents do App Group (`IntentActionQueue.swift`), ponte TS (`liveActivityIntentBridge.ts`), reconciliação no `activeSessionStore` e stubs do widget target. A arquitetura geral está sólida: enqueue-antes-do-sendEvent, peek não-destrutivo, ack seletivo por id e a guarda de hidratação em `startOrResume` fecham os gaps 1/2 registrados na verificação. A suíte focada passa (44/44 nos dois arquivos de intent; paridade byte-a-byte de `SessionActivityAttributes` confirmada; checagem (i) do skeleton correta).

O problema central está no **caminho quente** (`liveActivityIntentBridge.ts`): ele é o único ponto de despacho de intents e **não implementa a guarda de CAS que o próprio desenho da fase declara como universal** — os eventos `sendEvent` não carregam `sessionLogId`, e o bridge aplica o toque ao draft atual sem verificar a qual sessão o toque pertencia. Além disso, o ack do `completeSet` quente é incondicional, violando a invariante D1 ("entrada reprovada por canCompleteSet nunca é acked") que o loop de reconciliação respeita. As demais falhas são de robustez (clock skew na heurística de órfã, throw de um item abortando o boot da sessão, corrida de entrega duplicada no boot) e consistência.

## Critical Issues

### CR-01: Caminho quente aplica intents SEM vínculo de sessão — toque de sessão antiga pode concluir série na sessão errada

**File:** `src/native/liveActivityIntentBridge.ts:18-30` (e `modules/live-activity/ios/CompleteSetIntent.swift:32`, `SkipRestIntent.swift:28`, `AdjustRestIntent.swift:38`, `AdjustLoadIntent.swift:40`, `AdjustRepsIntent.swift:41`)
**Issue:** A documentação da fase (activeSessionStore.ts:203-212) promete "guarda de CAS por sessionLogId — nunca aplica contra uma sessão que não é mais a ativa". O loop de reconciliação cumpre isso (`pertenceAoDraft`, activeSessionStore.ts:1860-1870), mas o caminho quente **não tem como cumprir**: os payloads de `sendEvent` dos cinco Intents carregam apenas `kind`/`id` (e deltas), nunca `sessionLogId`. O `handleIntentAction` lê o draft atual e despacha `completeSet`/`activateSet`/`stepLoad`/`stepReps`/`adjustRest` cegamente.

**Cenário de falha concreto (corrupção silenciosa de histórico):** o app suporta troca de sessão no mesmo processo (fluxos F7 testados em activeSessionStore.test.ts:1515+). Usuário em sessão B; a Live Activity da sessão A (encerrada com `.after(180s)` ou nunca encerrada — `endLiveActivity` só roda em finish/cancel/inatividade) ainda está na Lock Screen. Toque em "Concluir série" no card de A → `perform()` enfileira com `sessionLogId` de `Activity.activities.first` (coleção **sem ordem definida**, pode resolver A ou B) → `sendEvent` → bridge aplica `completeSet` no draft de B → série de B concluída sem o aluno ter executado. O CAS da fila (que descartaria a entrada divergente) roda só no cold-launch, tarde demais. Variante dentro do próprio loop: sessão trocada entre a re-leitura do draft (linha 1847) e a entrada de `completeSet` — o `alvo` (exerciseId/setOrder) veio do draft de A mas é aplicado ao draft de B se o exercício/série coincidir.

**Fix:**
1. Incluir `sessionLogId` no payload de todos os `sendEvent` (os intents já o capturam em `perform()`):
   ```swift
   LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "completeSet", "sessionLogId": sessionLogId ?? "", "id": actionId])
   ```
2. No bridge, recusar (sem aplicar e sem ack) evento cujo `sessionLogId` não corresponda ao draft atual — ou, na ausência do campo, tratar como o CAS do loop (não aplicar; o ack só via reconciliação):
   ```ts
   case 'completeSet': {
     if (event.sessionLogId && event.sessionLogId !== draft.sessionLogId) return; // não ack: o CAS da reconciliação decide
     ...
   }
   ```

## Warnings

### WR-01: Bridge confirma o ack do completeSet sem aguardar o resultado — toque reprovado por canCompleteSet é destruído no caminho quente

**File:** `src/native/liveActivityIntentBridge.ts:26-29`
**Issue:** O handler de `completeSet` dispara `void completeSet(...)` e logo em seguida `void ackQueuedLiveActivityIntent(event.id)` — sem aguardar o booleano. Quando `completeSet` retorna `false` (reps/carga ausentes — o cenário exato do gap 1 da fase; ou a trava `inFlight` de reentrância), a entrada é **removida da fila durável**, o mesmo sintoma que a 16-07/D1 eliminou no cold path: o loop de reconciliação só ack-ar entradas aplicadas (`if (aplicado) void ack...`, activeSessionStore.ts:1882), mas o caminho quente (app vivo — o caminho principal da feature) mantém o comportamento destruidor. O teste `liveActivityIntentBridge.test.ts:143-152` codifica o comportamento errado: `completeSet` é um `jest.fn()` que nunca resolve `false`, então a asserção de ack incondicional nunca falharia. Um teste com `completeSet` resolvendo `false` + asserção de NÃO-ack teria capturado o defeito.

**Fix:**
```ts
case 'completeSet': {
  const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
  if (alvo) {
    const ok = await useActiveSessionStore.getState().completeSet(alvo.exercise.exerciseId, alvo.set.setOrder);
    if (ok) void ackQueuedLiveActivityIntent(event.id);
  }
  return;
}
```
(tornar `handleIntentAction` async e propagar a promise do listener; adicionar o teste com `completeSet → false`.)

### WR-02: Falha de UM item na reconciliação aborta o boot da sessão para status 'error'

**File:** `src/store/activeSessionStore.ts:1829-1935` (chamadas em 790, 831, 868; catch em 869-871)
**Issue:** `reconcileLiveActivityIntents` é chamado com `await` DENTRO do try de `startOrResume`. O loop protege só o `peek` (try/catch, linhas 1837-1845); a aplicação de cada entrada não tem try/catch. `completeSet()` rejeita se `enqueueAndDrain` falhar (persistência local — disco cheio, quota do AsyncStorage), e essa rejeição propaga para fora do loop → cai no catch de `startOrResume` → `status: 'error'` + `saveError` genérico: um toque da Lock Screen com falha de I/O local impede a sessão de abrir. As entradas restantes ficam na fila (sem ack), mas o boot falhou.

**Fix:** envolver o corpo do `for` num try/catch por entrada:
```ts
for (const entry of entries) {
  try {
    // ...aplicação existente...
  } catch (e) {
    console.warn(`[liveActivity] intent ${entry.id} falhou ao aplicar (mantido na fila):`, e);
  }
}
```

### WR-03: Heurística de adoção de órfã compara relógios de domínios diferentes (device × servidor) com precisão de segundos

**File:** `src/store/activeSessionStore.ts:282-291` e `modules/live-activity/ios/CompleteSetIntent.swift:23`
**Issue:** `nasceuNestaSessao` compara `queuedAt` (gerado no aparelho, `ISO8601DateFormatter().string(from:)` **sem fração de segundos**) contra `startedAt` (carimbo do servidor, com milissegundos). Dois modos de falha:
1. **Relógio do aparelho atrás do servidor** (comum): um toque legítimo na Lock Screen (cold-launch, `sessionLogId` nulo — o caso que a 16-12 foi criada para salvar) é descartado porque `queuedAt < startedAt` mesmo sendo da sessão atual. Skew de ~1 minuto anula o fix da 16-12.
2. **Fronteira de precisão**: toque no mesmo segundo do início da sessão (device) perde a comparação `>=` contra o `startedAt` do servidor com fração (ex.: queuedAt "11:00:00" vs startedAt "11:00:00.300").
O próprio design reconhece o tradeoff ("aplicar na sessão errada é pior"), mas a prova temporal só é válida dentro de um único domínio de relógio.

**Fix:** (a) usar formatter com `.withFractionalSeconds` no `queuedAt`; (b) aplicar tolerância explícita de skew (ex.: `enfileiradoEm >= iniciadaEm - SKEW_MS` com SKEW_MS documentado, ex. 60_000) — e registrar a decisão; ou (c) persistir `sessionLogId` do lado do widget no atributo da Activity para eliminar a dependência da heurística no caso comum.

### WR-04: Entrega duplicada (evento quente + snapshot da fila) pode avançar DUAS séries num único toque de "Pular descanso" no boot

**File:** `src/native/liveActivityIntentBridge.ts:33-42` + `src/store/activeSessionStore.ts:1846-1889`
**Issue:** No boot, a fila é lida por `peek` e o bridge (listener já registrado) processa eventos do mesmo intervalo. Se o usuário toca "Pular" enquanto o loop de reconciliação está em andamento (ex.: `await completeSet` de uma entrada anterior), o evento chega ao bridge que ativa a próxima pendente (N+1) sobre o draft já atualizado; quando o loop alcança a entrada de `skipRest` do mesmo snapshot (peek anterior ao ack), `findNextPendingSet` sobre o draft fresco resolve N+2 e ativa mais uma série — um toque, dois descansos pulados. O `completeSet` duplicado é benigno (idempotente por série), mas `activateSet` não é idempotente entre séries distintas. Janela estreita (toque durante o boot), mas o mecanismo de ack não deduplica dentro do mesmo processo.

**Fix:** no bridge, registrar ids já entregues (`Set<string>`) e ignorar eventos duplicados de `skipRest` enquanto a reconciliação está em voo; ou serializar a aplicação: o bridge aguarda uma flag de "reconciliação concluída" antes de despachar `skipRest`.

## Info

### IN-01: Entrada adjustRest sem deltaSeconds é acked silenciosamente — tratamento assimétrico com adjustReps/adjustLoad

**File:** `src/store/activeSessionStore.ts:1891-1894`
**Issue:** `if (entry.deltaSeconds != null) get().adjustRest(...)` seguido de ack incondicional. Uma entrada `adjustRest` sem delta (formato antigo/corrompida — a mesma classe que `adjustReps`/`adjustLoad` tratam com warn + NÃO-ack, linhas 1904-1909 e 1921-1926) é destruída sem log. Os Intents sempre preenchem o campo, então o impacto é só de entradas corrompidas — mas a decisão do dono registrada no CR-01 ("ausência = estado inválido; não ackar preserva") não foi aplicada de forma uniforme. **Fix:** espelhar o tratamento de `deltaValue`: warn + `break` sem ack quando `deltaSeconds == null`.

### IN-02: `deltaValue > 0 ? 1 : -1` mapeia delta 0 para direção -1

**File:** `src/store/activeSessionStore.ts:1911, 1928` e `src/native/liveActivityIntentBridge.ts:56, 68`
**Issue:** um `deltaValue` (ou `deltaLoadKg`/`deltaReps`) exatamente 0 faz `stepLoad`/`stepReps` andar para BAIXO em vez de no-op. O widget nunca envia 0, mas uma entrada corrompida com delta 0 decrementaria carga/reps silenciosamente. **Fix:** tratar `> 0 ? 1 : < 0 ? -1 : 0` e ignorar direção 0 (ou preservar a entrada como inválida).

### IN-03: Falha de decode de UMA entrada descarta a fila inteira

**File:** `modules/live-activity/ios/IntentActionQueue.swift:78-81`
**Issue:** `rawReadAll` usa `(try? JSONDecoder().decode([QueuedIntentAction].self, from: data)) ?? []` — o decode do array é atômico: uma única entrada com formato antigo (anterior ao campo `id` da 16-05 ou ao `deltaValue` do CR-01, ambos sem default no struct) faz a fila INTEIRA — inclusive entradas válidas novas — retornar vazia, perdendo toques pendentes. Foi mitigado na prática (nenhum build shipping tem formato antigo), mas o contrato de "leitura não-destrutiva" da 16-07 não sobrevive a uma entrada corrupta. **Fix:** decodificar elemento a elemento, descartando só a entrada inválida, ou declarar `deltaValue`/`id` com valores default no struct.

### IN-04: verify-native-skeleton.sh não trava a entitlement do App Group

**File:** `scripts/verify-native-skeleton.sh:85-97`
**Issue:** a checagem (c) prova que `aps-environment` não vaza, e a (i) prova a paridade do Record — mas nenhuma checagem prova que a entitlement `com.apple.security.application-groups` sobrevive ao `expo prebuild --clean` nos dois targets. Se ela regredir, `UserDefaults(suiteName:)` no-op silencioso e a fila inteira da fase morre sem erro nem log (o padrão exato de bug que as checagens (e)/(i) existem para pegar). Config atualmente correta em app.json e expo-target.config.js. **Fix:** checagem (j) análoga à (c): `grep -q "group.com.pmarconato.forcaapp.shared"` nos `.entitlements` gerados.

### IN-05: activateSet/adjustRest não persistem o draft — cold-launch completa série com started_at nulo

**File:** `src/store/activeSessionStore.ts:1271-1298`
**Issue:** as sete ações de entrada (16-10) persistem via saveDraft, mas `activateSet` e `adjustRest` continuam só em memória. Consequência no fluxo da fase: um `completeSet` aplicado pela reconciliação de cold-launch envia `startedAt: serie.activatedAt` (linha 1555) com `activatedAt` nulo (nunca persistido) — o set_log chega ao servidor com `started_at` NULL, afetando a linha do tempo do resumo da sessão. Deliberado no escopo 16-10, mas vale registrar: persistir `activatedAt`/`restEndsAt` no mesmo padrão fire-and-forget fecharia a lacuna.

---

_Reviewed: 2026-08-19_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
