---
phase: 17-tela-bloqueada-registrar-e-antecipar
reviewed: 2026-08-19T14:33:25Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - modules/live-activity/ios/IntentActionQueue.swift
  - modules/live-activity/ios/AdjustLoadIntent.swift
  - modules/live-activity/ios/AdjustRepsIntent.swift
  - targets/session-widget/AdjustLoadIntent.swift
  - targets/session-widget/AdjustRepsIntent.swift
  - targets/session-widget/SessionActivityAttributes.swift
  - modules/live-activity/ios/SessionActivityAttributes.swift
  - targets/session-widget/WidgetLiveActivity.swift
  - src/engine/liveActivityContentState.ts
  - src/engine/sessionModel.ts
  - src/native/liveActivitySync.ts
  - src/native/liveActivityIntentBridge.ts
  - modules/live-activity/index.ts
  - src/services/sessionExecutionRepository.ts
  - src/store/activeSessionStore.ts
  - src/components/session/SessionPlayer.tsx
  - src/components/session/sessionPlayerLayout.ts
  - src/screens/ActiveSessionScreen.tsx
  - scripts/verify-native-skeleton.sh
  - modules/live-activity/ios/LiveActivityModule.swift (adjacente ao escopo — é a ponte Expo que materializa QueuedIntentActionRecord/ContentStateRecord citada no risco 4 do pedido; lido para confirmar/negar recorrência do bug fechado em 17-06)
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: resolved
---

# Phase 17: Code Review Report

**Reviewed:** 2026-08-19T14:33:25Z
**Depth:** standard
**Files Reviewed:** 19 (18 do escopo declarado + `LiveActivityModule.swift`, lido por ser a implementação real da ponte TS↔Swift citada no risco 4)
**Status:** issues_found

## Summary

Revisão focada nos cinco riscos apontados: acumulação de valor entre toques (REG-02),
paridade das duas cópias de `SessionActivityAttributes.swift`, migração de `ContentState`,
ponte TS↔Swift e tratamento de erro/imutabilidade/valores mágicos.

Os riscos 1 (acumulação), 2 (paridade) e a maior parte do risco 3 (migração de
`ContentState`) estão bem resolvidos: `stepLoad`/`stepReps` no store leem `get().draft`
de forma síncrona a cada toque (sem closures obsoletas), `withSet` é imutável, e o
script `verify-native-skeleton.sh` prova paridade byte-a-byte das duas cópias de
`SessionActivityAttributes.swift` via `diff -q` (não só presença). `LiveActivityContentStateRecord`
e `contentState(from:)` em `LiveActivityModule.swift` mapeiam corretamente os 23
campos do `ContentState` — o bug de 17-06 (campos faltando na ponte) está de fato
fechado para o `ContentState`.

Porém o risco 4 (ponte TS↔Swift) tem uma recorrência do MESMO bug de 17-06, num
struct irmão que não foi coberto pela correção: `QueuedIntentActionRecord` (a Record
Expo que serializa a fila durável para o lado JS) nunca ganhou o campo `deltaValue`
quando ele foi introduzido em `QueuedIntentAction` (Plano 17-01). Isso quebra
silenciosamente a reconciliação de cold-launch para `adjustReps`/`adjustLoad` — ver
CR-01 abaixo. É o achado mais importante desta revisão.

## Critical Issues

### CR-01: `QueuedIntentActionRecord` não expõe `deltaValue` — reconciliação de cold-launch descarta silenciosamente ajustes de reps/carga da Lock Screen

**File:** `modules/live-activity/ios/LiveActivityModule.swift:36-44` (declaração do Record) e `:158-168` (`peekIntentQueue`, mapeamento campo a campo)

**Issue:**
`QueuedIntentAction` (struct durável, `IntentActionQueue.swift:19-51`) ganhou o campo
`deltaValue: Double?` no Plano 17-01 (commit `44122f6`) para carregar o delta de
`.adjustReps`/`.adjustLoad`. O Record Expo espelho, `QueuedIntentActionRecord`
(`LiveActivityModule.swift:36-44`), usado por `peekIntentQueue()` para expor a fila
ao lado JS, **nunca recebeu esse campo**:

```swift
public struct QueuedIntentActionRecord: Record {
  @Field var kind: String = ""
  @Field var deltaSeconds: Int? = nil
  @Field var sessionLogId: String? = nil
  @Field var queuedAt: String = ""
  @Field var id: String = ""
  // deltaValue: Double? — ausente
  public init() {}
}
```

E o mapeamento em `peekIntentQueue` (linhas 158-168) confirma a omissão — copia
`kind`, `deltaSeconds`, `sessionLogId`, `queuedAt`, `id`, mas nunca `action.deltaValue`:

```swift
AsyncFunction("peekIntentQueue") { () -> [QueuedIntentActionRecord] in
  IntentActionQueue.peekAll().map { action in
    var record = QueuedIntentActionRecord()
    record.kind = action.kind.rawValue
    record.deltaSeconds = action.deltaSeconds
    record.sessionLogId = action.sessionLogId
    record.queuedAt = action.queuedAt
    record.id = action.id
    return record   // action.deltaValue nunca é copiado
  }
}
```

No lado JS, o tipo declara o campo (`modules/live-activity/index.ts:26`,
`deltaValue: number | null`), mas como o struct nativo nunca o preenche, toda
entrada lida via `peekQueuedLiveActivityIntents()` chega com `deltaValue`
`undefined`. Em `reconcileLiveActivityIntents()` (`src/store/activeSessionStore.ts:1892-1910`):

```ts
case 'adjustReps': {
  const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
  if (alvo && entry.deltaValue != null) {          // undefined != null → false
    get().stepReps(alvo.exercise.exerciseId, alvo.set.setOrder, entry.deltaValue > 0 ? 1 : -1);
  }
  void ackQueuedLiveActivityIntent(entry.id);        // ack incondicional acontece de qualquer forma
  break;
}
```

`entry.deltaValue != null` é sempre `false` (JS trata `undefined != null` como
`false`), então `stepReps`/`stepLoad` NUNCA são chamados para entradas recuperadas
da fila durável — mas a entrada é ackada (removida da fila) de qualquer jeito, como
se tivesse sido aplicada com sucesso.

**Cenário de falha real:** o dono ajusta reps ou carga pelos botões +/- da Lock
Screen com o app morto (force-quit) ou suspenso a ponto do round-trip in-process
não disparar; a ação é gravada corretamente na fila durável do App Group
(`IntentActionQueue.enqueue`, caminho SEMPRE gravado antes do `sendEvent` — comentário
em `AdjustLoadIntent.swift:37-39`); ao reabrir o app, `reconcileLiveActivityIntents()`
lê a fila, não encontra `deltaValue`, não aplica o ajuste, e ainda assim confirma
(`ackIntentAction`) a entrada — o toque desaparece sem nenhum sinal de erro. Isso é
exatamente o cenário que a fila durável (Fase 16) foi desenhada para cobrir, e é o
próprio caminho descrito no risco 1 do pedido ("acumulação de valor entre toques").
O caminho "quente" (app já em primeiro plano, `sendEvent`/`onIntentAction` com
`deltaLoadKg`/`deltaReps` literais) não é afetado — só a reconciliação de
cold-launch/fila durável.

Este é o MESMO bug de classe fechado no commit `5080d87` (17-06, "wire missing
ContentState fields through native bridge Record") — mas ali a correção cobriu só
`LiveActivityContentStateRecord`; `QueuedIntentActionRecord`, que sofreu a mesma
adição de campo no mesmo plano (17-01), ficou sem o `@Field` correspondente e sem
teste (não há teste Jest possível, é Swift puro — mesmo motivo pelo qual 17-06 só
foi pego num build físico).

**Fix:**
```swift
public struct QueuedIntentActionRecord: Record {
  @Field var kind: String = ""
  @Field var deltaSeconds: Int? = nil
  @Field var deltaValue: Double? = nil   // adicionar
  @Field var sessionLogId: String? = nil
  @Field var queuedAt: String = ""
  @Field var id: String = ""

  public init() {}
}
```
```swift
AsyncFunction("peekIntentQueue") { () -> [QueuedIntentActionRecord] in
  IntentActionQueue.peekAll().map { action in
    var record = QueuedIntentActionRecord()
    record.kind = action.kind.rawValue
    record.deltaSeconds = action.deltaSeconds
    record.deltaValue = action.deltaValue   // adicionar
    record.sessionLogId = action.sessionLogId
    record.queuedAt = action.queuedAt
    record.id = action.id
    return record
  }
}
```
Como não há cobertura automática possível para este arquivo (Swift puro, fora do
alcance do Jest), recomenda-se estender `scripts/verify-native-skeleton.sh` com uma
checagem estática (grep) que os campos de `QueuedIntentAction`
(`IntentActionQueue.swift`) e `QueuedIntentActionRecord` (`LiveActivityModule.swift`)
tenham a mesma contagem/nomes — mesmo espírito da checagem (h) já criada para as
duas cópias de `SessionActivityAttributes.swift` — para este bug de classe não se
repetir uma terceira vez.

## Warnings

### WR-01: `stepLoad`/`stepReps` puros de `sessionModel.ts` são código morto duplicado — risco de drift silencioso com a lógica reimplementada no store

**File:** `src/engine/sessionModel.ts:251-259` (`stepLoad`) e `:309-313` (`stepReps`)

**Issue:** `sessionModel.ts` exporta duas funções puras, documentadas como "um passo
do stepper de carga/reps":

```ts
export const stepLoad = (
  current: number | null,
  incrementKg: number,
  direction: 1 | -1,
  fallback: number | null = null,
): number => {
  const base = current ?? fallback ?? 0;
  return round2(Math.max(0, base + direction * incrementKg));
};

export const stepReps = (
  current: number | null,
  direction: 1 | -1,
  fallback: number | null = null,
): number => Math.max(0, Math.round((current ?? fallback ?? 0) + direction));
```

Nenhuma delas é importada em lugar nenhum do código-fonte nem dos testes
(confirmado por busca em todo `src/`) — `activeSessionStore.ts` (linhas 1330-1354 e
1356-1377) reimplementa a MESMA aritmética inline dentro das actions `stepLoad`/
`stepReps` do store, em vez de chamar as funções puras do motor:

```ts
// activeSessionStore.ts:1341-1344 — duplica round2(Math.max(0, base + direction*increment))
const next =
  Math.round(Math.max(0, base + direction * ex.loadIncrementKg) * 100) / 100;
```

Hoje as duas implementações concordam bit a bit, mas isso é acidental — qualquer
ajuste futuro em uma (ex.: mudar a casa decimal de arredondamento, ou o piso de 0
para permitir carga negativa em algum exercício excêntrico) só será aplicado se
quem editar lembrar de tocar as DUAS. Viola DRY e cria um ponto de drift silencioso
justamente na lógica central do risco 1 (acumulação entre toques).

**Fix:** ou (a) o store passa a chamar `stepLoad`/`stepReps` de `sessionModel.ts`
em vez de reimplementar a conta, ou (b) as duas funções puras são removidas de
`sessionModel.ts` se de fato não servem a nenhum outro consumidor (ex.: um teste de
unidade dedicado ao motor puro, que hoje não existe). A opção (a) é preferível —
reaproveita o motor testável e elimina a duplicação:

```ts
stepLoad: (exerciseId, setOrder, direction) => {
  const draft = get().draft;
  if (!draft) return;
  const novo = withSet(draft, exerciseId, setOrder, (s, ex) => {
    if (ex.isBodyweight) return s;
    const fallback = suggestLoad({ actualLoadKg: null, targetLoadKg: s.targetLoadKg, lastLoad: draft.lastLoadByExercise[exerciseIdentity(ex)] });
    return { ...s, actualLoadKg: stepLoadPure(s.actualLoadKg, ex.loadIncrementKg, direction, fallback) };
  });
  ...
```
(importando `stepLoad as stepLoadPure`/`stepReps as stepRepsPure` de `sessionModel.ts`
para não colidir com o nome da action do store).

### WR-02: `IntentActionQueue.enqueue` não é atômico — toques rápidos e sucessivos na Lock Screen podem perder uma entrada por leitura-modificação-escrita concorrente

**File:** `modules/live-activity/ios/IntentActionQueue.swift:70-88`

**Issue:** `enqueue` (chamado por `AdjustLoadIntent.perform()`, `AdjustRepsIntent.perform()`
e os demais Intents) segue o padrão leitura→modificação→escrita sem qualquer seção
crítica:

```swift
public static func enqueue(_ action: QueuedIntentAction) {
  var actions = readAll()          // 1. lê o array inteiro do UserDefaults
  actions.append(action)           // 2. modifica em memória
  if actions.count > maxEntries {
    actions.removeFirst(actions.count - maxEntries)
  }
  writeAll(actions)                // 3. reescreve o array inteiro
}
```

`UserDefaults.set`/`.data(forKey:)` são thread-safe individualmente, mas a
sequência ler-modificar-escrever como um todo NÃO é atômica — não há `NSLock`,
`DispatchQueue.sync`, `actor` nem CAS em torno dela. `perform()` dos
`LiveActivityIntent`s não declara isolamento de actor, então dois toques muito
próximos no stepper da Lock Screen (o cenário central do risco 1 do pedido —
"toques rápidos e sucessivos") podem, em tese, dar origem a duas execuções
concorrentes de `enqueue`: a segunda lê o array ANTES da primeira escrever, e a
escrita da primeira é sobrescrita pela da segunda — uma entrada (um toque) some da
fila durável sem qualquer sinal de erro. Isso só afeta o caminho frio (app morto/
suspenso o bastante para não haver round-trip in-process); no caminho quente (app
em primeiro plano) o `sendEvent` chega mesmo que a fila durável perca a entrada, o
que mascara o problema em teste manual comum (app aberto) e só apareceria com o
app fechado — justamente o cenário que a fila durável existe para cobrir.

**Fix:** serializar `enqueue`/`readAll`/`writeAll` — por exemplo com uma
`DispatchQueue` serial dedicada, ou convertendo `IntentActionQueue` em um `actor`
(exige que os call sites em `perform()` façam `await`, o que já é um contexto
`async`):

```swift
private static let ioQueue = DispatchQueue(label: "com.pmarconato.forcaapp.intentQueue")

public static func enqueue(_ action: QueuedIntentAction) {
  ioQueue.sync {
    var actions = readAll()
    actions.append(action)
    if actions.count > maxEntries {
      actions.removeFirst(actions.count - maxEntries)
    }
    writeAll(actions)
  }
}
```
Aplicar a mesma seção crítica a `remove(ids:)` (chamado por `ackIntentAction`), que
tem a mesma forma leitura-modificação-escrita.

## Info

### IN-01: `2.5` (fallback de `loadIncrementKg`) é um valor mágico duplicado no widget

**File:** `targets/session-widget/WidgetLiveActivity.swift:199` e `:210`

**Issue:** o fallback do passo de carga quando `state.loadIncrementKg` é `nil`
aparece hardcoded duas vezes:

```swift
Button(intent: AdjustLoadIntent(deltaLoadKg: -(state.loadIncrementKg ?? 2.5))) { ... }
...
Button(intent: AdjustLoadIntent(deltaLoadKg: state.loadIncrementKg ?? 2.5)) { ... }
```

**Fix:** extrair para uma constante nomeada no topo do arquivo (ao lado de
`activityBackground`/`activityNeon`), ex.: `private let defaultLoadIncrementKg = 2.5`,
e documentar por que 2.5 é o piso razoável quando o exercício não define incremento.

### IN-02: `verify-native-skeleton.sh` prova paridade de `SessionActivityAttributes.swift`, mas não prova paridade de campo entre `QueuedIntentAction` e `QueuedIntentActionRecord`

**File:** `scripts/verify-native-skeleton.sh` (checagem `h`, linhas ~150-165 do
arquivo)

**Issue:** a checagem (h), adicionada no Plano 17-01 especificamente para o bug de
classe "campo novo não propagado para a ponte Expo" (mesmo texto do comentário:
"nenhuma checagem anterior provava isso"), cobre só as duas cópias de
`SessionActivityAttributes.swift`. Ela não cobre o struct irmão
`QueuedIntentAction`/`QueuedIntentActionRecord`, que sofreu exatamente o mesmo tipo
de bug (CR-01 acima) sem que o gate pegasse.

**Fix:** ver a sugestão de checagem estática em CR-01 — não é urgente por si só
(é consequência do mesmo achado), mas fechar CR-01 sem endurecer o gate deixa a
porta aberta para uma quarta ocorrência do mesmo bug de classe num quinto struct
futuro.

---

_Reviewed: 2026-08-19T14:33:25Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---

## Resolução (2026-08-19, verificada pelo orquestrador)

Os 5 achados foram corrigidos e as correções foram conferidas no código vivo, não na
mensagem de commit.

| Achado | Commit | Evidência de que fechou |
|---|---|---|
| CR-01 (CRITICAL) | `b02041e` | `@Field var deltaValue: Double? = nil` presente em `QueuedIntentActionRecord` (`LiveActivityModule.swift`); `+102` linhas de teste em `__tests__/liveActivityIntentQueue.test.ts`; suíte subiu de 1977 → 1979 testes |
| WR-02 | `aeab6a3` | Fila serial dedicada cobrindo read-modify-write; harness `scripts/IntentActionQueueConcurrencyTests/main.swift` compila o arquivo REAL (sem mock) e enfileira 20 ações em 8 filas concorrentes. `bash scripts/verify-intent-action-queue-race.sh` → exit 0, "20 entradas enfileiradas em paralelo sobreviveram intactas". Pré-fix o commit registra 16–19 de 20 entradas perdidas |
| WR-01 | `8ef69c6` | Store passa a delegar a `stepLoad`/`stepReps` puros de `sessionModel.ts` — aritmética de passo com fonte única |
| IN-02 | `c257f97` | `verify-native-skeleton.sh` passou de `(a)-(h)` para `(a)-(i)`: ganhou a comparação de campos entre `QueuedIntentAction` e `QueuedIntentActionRecord`. Exit 0 |
| IN-01 | `abdc74a` | Literal `2.5` duplicado extraído para constante nomeada |

**Estado de validação no fechamento:** `npm test` 167 suítes / 1979 testes, exit 0.
`scripts/verify-native-skeleton.sh` exit 0. `scripts/verify-intent-action-queue-race.sh` exit 0.
