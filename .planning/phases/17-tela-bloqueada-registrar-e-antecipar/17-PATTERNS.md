# Phase 17: Tela bloqueada — registrar e antecipar - Pattern Map

**Mapeado:** 2026-08-18
**Arquivos analisados:** 15 (novos + modificados)
**Analogs encontrados:** 15 / 15 (todos com correspondência exata — a fase é extensão aditiva
de contratos existentes, conforme RESEARCH.md "Key insight")

## File Classification

| Arquivo novo/modificado | Papel | Fluxo de dado | Analog mais próximo | Qualidade |
|---|---|---|---|---|
| `stepReps()` em `src/engine/sessionModel.ts` | utility (pure function) | transform | `stepLoad()` — `sessionModel.ts:240-255` | exact |
| `suggestReps()` em `src/engine/sessionModel.ts` | utility (pure function) | transform | `suggestLoad()` — `sessionModel.ts:222` | exact |
| `SessionDraft.lastRepsByExercise` | model (state field) | CRUD (seed + update) | `SessionDraft.lastLoadByExercise` — `sessionModel.ts:148` | exact |
| `getLastRepsByExercise()` (ou widening de `getLastLoadByExercise`) — `sessionExecutionRepository.ts` | service (query) | request-response (Supabase SELECT) | `getLastLoadByExercise()` — `sessionExecutionRepository.ts:627-677` | exact |
| Seed de `lastRepsByExercise` na store | service/store (bootstrap) | batch | seed de `lastLoadByExercise` — `activeSessionStore.ts:427-502` (consumido via `seedLastLoads()` em `sessionModel.ts:358-373`) | exact |
| `stepReps()` action na store | store (mutation) | event-driven | `stepLoad` action — `activeSessionStore.ts:1258` | exact |
| Atualização de `lastRepsByExercise` em `completeSet()` | store (mutation) | event-driven | atualização de `lastLoadByExercise` em `completeSet()` — `activeSessionStore.ts:1474-1492` | exact |
| `targets/session-widget/AdjustRepsIntent.swift` (stub) | controller (App Intent) | event-driven | `targets/session-widget/AdjustRestIntent.swift:1-24` | exact |
| `targets/session-widget/AdjustLoadIntent.swift` (stub) | controller (App Intent) | event-driven | `targets/session-widget/AdjustRestIntent.swift:1-24` | exact |
| `modules/live-activity/ios/AdjustRepsIntent.swift` (impl) | controller (App Intent, processo do app) | event-driven | `modules/live-activity/ios/AdjustRestIntent.swift:1-41` | exact |
| `modules/live-activity/ios/AdjustLoadIntent.swift` (impl) | controller (App Intent, processo do app) | event-driven | `modules/live-activity/ios/AdjustRestIntent.swift:1-41` | exact |
| `QueuedIntentActionKind` + `deltaValue` genérico — `IntentActionQueue.swift` | model (enum/struct) | event-driven | `QueuedIntentActionKind`/`QueuedIntentAction` atuais — `IntentActionQueue.swift:1-40` | role-match (extensão do mesmo struct) |
| casos `adjustReps`/`adjustLoad` em `liveActivityIntentBridge.ts` | controller (event dispatcher) | event-driven | caso `adjustRest` — `liveActivityIntentBridge.ts:22-48` | exact |
| campos "A seguir" em `liveActivityContentState.ts` + `ContentState` (dois `.swift`) | model/transform (builder) | transform | campos atuais do `ContentState` + `buildLiveActivityContentState()` — `liveActivityContentState.ts:16-51,59-60` | exact |
| `SessionPlayer.tsx` (texto não-editável + 2º stepper + marca "herdado" + botão condicional) | component | request-response (UI) | stepper de carga + linha "Última carga" já existentes — `SessionPlayer.tsx:620-660` | exact |
| `WidgetLiveActivity.swift` (dois pares `−/+`, botão "abrir para ajustar", linha "A seguir") | component (SwiftUI) | request-response (render) | layout atual do widget — `WidgetLiveActivity.swift` (timer + botões já existentes) | exact |
| `widgetURL` corrigido — `WidgetLiveActivity.swift:187` | config (deep link) | request-response | rota real — `src/navigation/linkingConfig.ts:63-71` | role-match (bug fix, não feature nova) |
| `scripts/verify-native-skeleton.sh` — lista de intents | test/config (shell verifier) | batch | linha 151, checagem (g) — `verify-native-skeleton.sh:143-164` | exact |
| Novos casos Jest | test | request-response (unit) | `__tests__/sessionModel.test.ts`, `activeSessionStore.test.ts`, `liveActivityContentState.test.ts`, `liveActivityIntentBridge.test.ts`, `liveActivityIntentQueue.test.ts`, `sessionPlayerTransitions.test.tsx` (todos já existem) | exact |

## Pattern Assignments

### `stepReps()` / `suggestReps()` (utility, transform) — `src/engine/sessionModel.ts`

**Analog:** `stepLoad()` / `suggestLoad()` no mesmo arquivo.

**`stepLoad()` — molde exato** (`[VERIFIED: sessionModel.ts:240-255]`):
```typescript
const round2 = (n: number): number => Math.round(n * 100) / 100;

export const stepLoad = (
  current: number | null,
  incrementKg: number,
  direction: 1 | -1,
  fallback: number | null = null,
): number => {
  const base = current ?? fallback ?? 0;
  return round2(Math.max(0, base + direction * incrementKg));
};
```

**Diferença para `stepReps()`:** sem `round2` (reps são inteiras); incremento fixo (±1, sugerido
por `REQUIREMENTS.md`, é discretion do planner) em vez de `incrementKg` variável por exercício.
Mesma assinatura de piso `Math.max(0, ...)` — clamp que também cobre o requisito V5 do
RESEARCH.md (Security Domain).

**`suggestLoad()` é a referência de precedência para `suggestReps()`** (`sessionModel.ts:222`):
adaptação intra-sessão > alvo do plano > histórico (`lastRepsByExercise`) — a mesma cadeia,
sem regra concorrente com `intraSessionAdaptation.ts:426` (D-08).

---

### `SessionDraft.lastRepsByExercise` (model) — `src/engine/sessionModel.ts`

**Analog:** `SessionDraft.lastLoadByExercise` — `sessionModel.ts:148`.

Mesmo formato: `Record<string, number>` chaveado por `exerciseIdentity(exercise)`. Campo novo
precisa tolerar ausência na leitura de rascunhos já persistidos (D-01: "Reversibility: costly" —
`sessionDraftStorage.ts` precisa de default `{}` ao desserializar, não `undefined` propagando
para `suggestReps()`).

---

### `getLastRepsByExercise()` (service, request-response) — `src/services/sessionExecutionRepository.ts`

**Analog:** `getLastLoadByExercise()` — `sessionExecutionRepository.ts:627-677`.

**Query real a espelhar** (`[VERIFIED: sessionExecutionRepository.ts:633-650]`):
```typescript
const consultaCargas = (comPurpose: boolean) => {
  const query = supabase
    .from('set_logs')
    .select(
      comPurpose
        ? 'actual_load_kg, completed_at, planned_sets!inner(planned_exercises!inner(name, exercise_key, planned_sessions!inner(training_plans!inner(purpose))))'
        : 'actual_load_kg, completed_at, planned_sets!inner(planned_exercises!inner(name, exercise_key))',
    )
    .not('actual_load_kg', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(300);
  return comPurpose
    ? query.neq('planned_sets.planned_exercises.planned_sessions.training_plans.purpose', 'joint')
    : query;
};
```

**Achado confirmado (não re-derivar):** `actual_reps` já é coluna existente em `set_logs` — outra
função no mesmo arquivo já a seleciona (`[VERIFIED: sessionExecutionRepository.ts:805-806]`:
`'actual_reps, actual_load_kg, completed_at, session_logs!inner(user_id, finished_at), ...'`).
Portanto `lastRepsByExercise` é **widening do `.select(...)`** (trocar `actual_load_kg` por
`actual_reps, actual_load_kg`, e ajustar o filtro `.not(...)`), não migration. Preferir uma única
viagem ao banco para semear os dois mapas, se a semântica de filtro permitir.

---

### Seed + atualização de `lastRepsByExercise` na store — `src/store/activeSessionStore.ts`

**Analog:** seed de `lastLoadByExercise` (`activeSessionStore.ts:427-502`, consumido via
`seedLastLoads()` em `sessionModel.ts:358-373` — tratamento best-effort, falha não derruba o
início da sessão).

**Atualização em `completeSet()` — molde exato** (`[VERIFIED: activeSessionStore.ts:1474-1477]`):
```typescript
const lastLoad = { ...atual.lastLoadByExercise };
if (actualLoadKg != null && !exercise.isBodyweight) {
  lastLoad[exerciseIdentity(exercise)] = actualLoadKg;
}
```
`lastRepsByExercise` espelha isto com `actualReps`, **sem** a checagem `isBodyweight` — peso
corporal ainda tem reps a memorizar.

**Regra herdada que se aplica igualmente:** toda mutação de série persiste o rascunho —
`stepReps()` precisa do mesmo `saveDraft()` fire-and-forget que as outras sete ações de série já
fazem (`activeSessionStore.ts:1275-1281`, regra da 16-10). Sem isso, force-quit no meio de um
ajuste de reps perde o valor.

---

### `AdjustRepsIntent.swift` / `AdjustLoadIntent.swift` (controller, event-driven)

**Analog:** `AdjustRestIntent(deltaSeconds:)`, par stub + implementação.

**Stub na extensão** (`[VERIFIED: targets/session-widget/AdjustRestIntent.swift:1-24]`):
```swift
import AppIntents

struct AdjustRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar descanso" }

  @Parameter(title: "Delta em segundos")
  var deltaSeconds: Int

  init() {}

  init(deltaSeconds: Int) {
    self.deltaSeconds = deltaSeconds
  }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
```

**Implementação real no target do app** (`[VERIFIED: modules/live-activity/ios/AdjustRestIntent.swift:1-41]`):
```swift
import ActivityKit
import AppIntents

@available(iOS 16.2, *)
struct AdjustRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource { "Ajustar descanso" }

  @Parameter(title: "Delta em segundos")
  var deltaSeconds: Int

  init() {}
  init(deltaSeconds: Int) { self.deltaSeconds = deltaSeconds }

  func perform() async throws -> some IntentResult {
    let sessionLogId = Activity<SessionActivityAttributes>.activities.first?.attributes.sessionLogId
    let actionId = UUID().uuidString

    IntentActionQueue.enqueue(
      QueuedIntentAction(
        kind: .adjustRest,
        deltaSeconds: deltaSeconds,
        sessionLogId: sessionLogId,
        queuedAt: ISO8601DateFormatter().string(from: Date()),
        id: actionId
      )
    )

    LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "adjustRest", "deltaSeconds": deltaSeconds, "id": actionId])
    return .result()
  }
}
```

**Ressalvas concretas (não deduzidas — descobertas na pesquisa):**
1. `QueuedIntentAction` hoje só tem `deltaSeconds: Int?` como payload numérico. `AdjustLoadIntent`
   precisa de delta em **kg** (`Double`, já que `load_increment_kg` é fracionário, ex. 2,5) — o
   struct precisa de um campo novo (`deltaValue: Double?` ou equivalente).
2. `IntentActionQueue.swift` **não é duplicado** entre os dois targets — só existe em
   `modules/live-activity/ios/` (a extensão não linka `ExpoModulesCore`, comentário verbatim em
   `targets/session-widget/CompleteSetIntent.swift:8-10`). Só `SessionActivityAttributes.swift`
   precisa das duas cópias.

---

### `QueuedIntentActionKind` + `deltaValue` genérico (model) — `modules/live-activity/ios/IntentActionQueue.swift`

**Estado atual completo** (`[VERIFIED: IntentActionQueue.swift:1-40]`):
```swift
import Foundation

public enum QueuedIntentActionKind: String, Codable {
  case completeSet
  case skipRest
  case adjustRest
}

public struct QueuedIntentAction: Codable {
  public let kind: QueuedIntentActionKind
  public let deltaSeconds: Int?
  public let sessionLogId: String?
  public let queuedAt: String
  public let id: String

  public init(
    kind: QueuedIntentActionKind,
    deltaSeconds: Int?,
    sessionLogId: String?,
    queuedAt: String,
    id: String = UUID().uuidString
  ) {
    self.kind = kind
    self.deltaSeconds = deltaSeconds
    self.sessionLogId = sessionLogId
    self.queuedAt = queuedAt
    self.id = id
  }
}
```
Extensão necessária: dois casos novos em `QueuedIntentActionKind` (`.adjustReps`, `.adjustLoad`)
e um campo `deltaValue: Double?` (ou nome equivalente) em `QueuedIntentAction` — `deltaSeconds`
continua servindo só `adjustRest`. Mitigação de DoS local já existe e não muda:
`maxEntries = 20` com corte das mais antigas (`IntentActionQueue.swift:51-53,70-77` — não relido
nesta sessão, já citado em RESEARCH.md).

---

### Casos `adjustReps`/`adjustLoad` (controller, event-driven) — `src/native/liveActivityIntentBridge.ts`

**Estado atual completo, arquivo pequeno** (`[VERIFIED: liveActivityIntentBridge.ts:1-55]`):
```typescript
import {
  ackQueuedLiveActivityIntent,
  subscribeLiveActivityIntentAction,
  type LiveActivityIntentActionEvent,
} from '../../modules/live-activity';
import { findActiveSet, findNextPendingSet } from '../engine/sessionModel';
import { useActiveSessionStore } from '../store/activeSessionStore';

const handleIntentAction = (event: LiveActivityIntentActionEvent): void => {
  const draft = useActiveSessionStore.getState().draft;
  if (!draft) return;

  switch (event.kind) {
    case 'completeSet': {
      const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
      if (alvo) {
        void useActiveSessionStore
          .getState()
          .completeSet(alvo.exercise.exerciseId, alvo.set.setOrder);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
    case 'skipRest': {
      const proxima = findNextPendingSet(draft);
      if (proxima) {
        useActiveSessionStore
          .getState()
          .activateSet(proxima.exercise.exerciseId, proxima.set.setOrder);
        void ackQueuedLiveActivityIntent(event.id);
      }
      return;
    }
    case 'adjustRest': {
      useActiveSessionStore.getState().adjustRest(event.deltaSeconds);
      void ackQueuedLiveActivityIntent(event.id);
      return;
    }
  }
};

export const registerLiveActivityIntentListener = (): (() => void) =>
  subscribeLiveActivityIntentAction(handleIntentAction);
```

**Molde direto para os casos novos** — resolver a série alvo com `findActiveSet(draft)` (mesmo
helper), chamar `stepReps()`/`stepLoad()` sobre ela, e `ackQueuedLiveActivityIntent(event.id)` só
depois do resultado real (regra herdada da Fase 16, `16-VERIFICATION.md`). O tipo
`LiveActivityIntentActionEvent` (`[VERIFIED: modules/live-activity/index.ts:7-10]`) precisa dos
dois casos novos na união:
```typescript
export type LiveActivityIntentActionEvent =
  | { id: string; kind: 'completeSet' }
  | { id: string; kind: 'skipRest' }
  | { id: string; kind: 'adjustRest'; deltaSeconds: number }
  | { id: string; kind: 'adjustReps'; deltaReps: number }
  | { id: string; kind: 'adjustLoad'; deltaLoadKg: number };
```

---

### Campos "A seguir" em `ContentState` (model/transform) — `src/engine/liveActivityContentState.ts` + 2× `SessionActivityAttributes.swift`

**`ContentState` atual, byte-idêntico nos dois targets** (`[VERIFIED:
targets/session-widget/SessionActivityAttributes.swift:11-28]` e
`[VERIFIED: modules/live-activity/ios/SessionActivityAttributes.swift:11-28]`):
```swift
public struct SessionActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var phase: SessionActivityPhase
        var exerciseName: String
        var setIndex: Int
        var setTotal: Int
        var targetRepsMin: Int?
        var targetRepsMax: Int?
        var targetLoadKg: Double?
        var isBodyweight: Bool
        var restEndsAt: Date?
        var blockLabel: String?
        var blockIndex: Int?
        var blockTotal: Int?
    }

    var sessionLogId: String
}
```

**Analog de campo opcional a seguir:** `blockLabel: String?` / `blockIndex: Int?` /
`blockTotal: Int?` — mesmo padrão (`Type?`) para os campos novos de "A seguir"
(`nextExerciseName: String?`, `nextSetLabel: String?`, `nextValue: ...?`, conforme D-14/D-15).

**Gap confirmado no builder:** `buildLiveActivityContentState()` já calcula `next =
findNextPendingSet(draft)` (`liveActivityContentState.ts:59`) mas hoje `next` só é usado como
FALLBACK quando não há série ativa (`current = active ?? next`, `liveActivityContentState.ts:60`)
— nunca exposto como "o que vem depois do atual". D-13/D-14 exigem um segundo lookup
independente (próxima série/exercício DEPOIS da ativa/em descanso, não em vez dela).

**Pitfall a registrar no plano (não mitigável em código):** mudar o schema estrutural de
`ContentState` mata Activities já em curso — não há migração incremental em ActivityKit. Passo
explícito antes do UAT: `endLiveActivity('immediate')` (`modules/live-activity/index.ts:56-59`)
ou reinstalar via `resign.sh` antes de testar os campos novos.

---

### `SessionPlayer.tsx` (component, request-response/UI)

**Analog:** o próprio componente já tem 90% do desenho pronto — stepper de carga, linha "Última
carga", RIR chips.

**Trecho atual do card ativo** (`[VERIFIED: SessionPlayer.tsx:620-660]`):
```typescript
if (active) {
  const { exercise, set } = active;
  const suggestedLoad = suggestedLoadFor(exercise, set);
  const podeConcluir = canCompleteSet(set, exercise.isBodyweight, metricOf(exercise));
  const precisaCarga =
    !exercise.isBodyweight && suggestedLoad == null && set.actualLoadKg == null;
  const totalSeries = exercise.sets.length;

  const ultimaCarga = draft.lastLoadByExercise[exerciseIdentity(exercise)];

  return (
    <Animated.View style={[styles.card, styles.cardActive, estiloDeEntrada]}>
      {/* ... */}
      {!exercise.isBodyweight && ultimaCarga != null ? (
        <View style={styles.lastLine}>
          <Feather name="rotate-ccw" size={12} color={theme.colors.text.quiet} />
          <Text style={styles.lastLineText}>
            Última carga: {String(ultimaCarga).replace('.', ',')} kg
          </Text>
        </View>
      ) : null}

      <View style={styles.inputsRow}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Reps</Text>
          <TextInput
            style={styles.bigInput}
            editable={!saving}
            keyboardType="number-pad"
            value={set.actualReps != null ? String(set.actualReps) : ''}
            onChangeText={(t) => setReps(exercise.exerciseId, set.setOrder, parseIntOrNull(t))}
          />
```

**O que muda:** `TextInput` de reps vira texto estático entre `−/+` (D-05); mesmo tratamento
para carga; a marca de "herdado" reusa o padrão visual de `ultimaCarga`/`lastLine` (ícone
`rotate-ccw` + texto quiet) já existente para o valor herdado em edição (D-03/D-11); `podeConcluir`
(já calculado via `canCompleteSet(...)`) é a mesma função que decide se "Iniciar série" some
(D-06) — nenhuma nova função de validação, só mudar QUANDO ela é checada (contra valores
pré-preenchidos, não só digitados).

**RIR chips ficam onde estão** (`[VERIFIED: SessionPlayer.tsx:740-760]`) — D-07, sem mudança.

**Layout web (`sessionPlayerLayout.ts:9-14`):** `LOAD_INPUT_STYLE = { flex: 1, minWidth: 0 }` —
`minWidth: 0` é obrigatório para o campo não estourar no PWA web (react-native-web não reseta
isso em `TextInput`). Trocar `TextInput` por `Text` estático elimina essa classe de bug para o
campo em si, mas os NOVOS botões `−/+` de reps devem seguir a mesma disciplina de `flex`/`minWidth`
na linha, para não reabrir o mesmo defeito.

---

### `widgetURL` corrigido (config, deep link) — `targets/session-widget/WidgetLiveActivity.swift:187`

**Estado atual quebrado** (`[VERIFIED: WidgetLiveActivity.swift:187]`):
```swift
.widgetURL(URL(string: "forcaapp://session/active"))
```

**Rota real registrada** (`[VERIFIED: src/navigation/linkingConfig.ts:63-71]`):
```typescript
Home: {
  path: 'home',
  initialRouteName: 'HomeMain',
  screens: {
    HomeMain: '',
    WorkoutDetail: 'workout/:sessionId',
    ActiveSession: 'active-session/:sessionId',
    // ...
  },
},
```
URL correta: `forcaapp://home/active-session/<sessionLogId>`, usando o `sessionLogId` já
disponível em `SessionActivityAttributes.sessionLogId` (`targets/session-widget/
SessionActivityAttributes.swift:27`). **Confirmação adicional desta sessão:** abrir
`active-session/:sessionId` não precisa de parâmetro extra — `ActiveSessionScreen.tsx:60`
(`route.params.sessionId` é o único param) e `:271-282` (`iniciar()` chama `getSessionDetail` +
`startOrResume({sessionId, userId, detail})`, que resume o `SessionDraft` já persistido) fazem a
tela pousar automaticamente na série ativa corrente via `<SessionPlayer>`, que lê o estado do
store resumido — nenhum parâmetro de série/exercício é necessário na URL.

**D-12 (botão "abrir para ajustar"):** `openAppWhenRun` não existe para `LiveActivityIntent`
(confirmado por engenheiro DTS da Apple, ver RESEARCH.md Pitfall 3). No Lock Screen sem Dynamic
Island, `widgetURL(_:)` é o único tap-target de deep link do card inteiro — o botão "abrir para
ajustar" deve reaproveitar o MESMO `widgetURL` corrigido, não um `Link` paralelo.

---

### `scripts/verify-native-skeleton.sh` (test/config)

**Checagem (g) atual** (`[VERIFIED: verify-native-skeleton.sh:143-164]`):
```bash
local nome_intent
for nome_intent in CompleteSetIntent SkipRestIntent AdjustRestIntent; do
  if ! grep -q "struct ${nome_intent}" "modules/live-activity/ios/${nome_intent}.swift" 2>/dev/null; then
    vermelho "ABORTADO: [rodada ${rodada}] ${nome_intent} não existe nos dois targets (app + extensão)."
    echo "  Falta modules/live-activity/ios/${nome_intent}.swift ou não declara" >&2
    echo "  \"struct ${nome_intent}\"." >&2
    exit 1
  fi
  if ! grep -q "struct ${nome_intent}" "targets/session-widget/${nome_intent}.swift" 2>/dev/null; then
    vermelho "ABORTADO: [rodada ${rodada}] ${nome_intent} não existe nos dois targets (app + extensão)."
    echo "  Falta targets/session-widget/${nome_intent}.swift ou não declara" >&2
    echo "  \"struct ${nome_intent}\"." >&2
    exit 1
  fi
done
```
**Mudança direta:** adicionar `AdjustRepsIntent AdjustLoadIntent` à lista da linha 151. Esta
checagem só confirma presença + declaração do `struct`, **não** diff de conteúdo — para
`SessionActivityAttributes.swift` (que precisa ficar byte-idêntico, D-11), considerar um `diff`
explícito adicional no script (Pitfall 5, sem checagem automatizada hoje).

---

### Novos casos Jest (test)

**Analogs — todos os arquivos já existem, só precisam de casos novos:**
- `__tests__/sessionModel.test.ts` — `stepReps()`, `suggestReps()`, novo caso de
  `canCompleteSet()` com pré-preenchimento.
- `__tests__/activeSessionStore.test.ts` — seed + atualização de `lastRepsByExercise` em
  `completeSet()`.
- `__tests__/liveActivityContentState.test.ts` — campos "A seguir" (D-13 a D-16, incluindo
  virada de bloco cardio/alongamento).
- `__tests__/liveActivityIntentBridge.test.ts` e `__tests__/liveActivityIntentQueue.test.ts` —
  casos `adjustReps`/`adjustLoad`.
- `__tests__/sessionPlayerTransitions.test.tsx` — renderização sem `TextInput` editável no fluxo
  padrão + marca visual "herdado".

Comando rápido por domínio tocado: `npx jest <arquivo> && npx tsc --noEmit`. Suíte completa por
merge de wave: `npm test`. Swift não tem framework de teste no repositório — toda cobertura é
compilação + UAT físico (RESEARCH.md, Validation Architecture).

## Shared Patterns

### Espelho único / única escrita em ActivityKit
**Fonte:** `src/native/liveActivitySync.ts` (não relido nesta sessão — já documentado em
RESEARCH.md como único escritor de `Activity.update()`).
**Aplica-se a:** todas as ações novas de store (`stepReps`, atualização de `lastRepsByExercise`)
e ao builder `buildLiveActivityContentState()`. Nenhum `LiveActivityIntent` deve chamar
`Activity.update()` direto — `perform()` só enfileira (`IntentActionQueue.enqueue`) e dispara
`sendEvent`, igual ao molde `AdjustRestIntent`.

### Fila durável + dedup + ack condicionado
**Fonte:** `IntentActionQueue.swift` (App Group `UserDefaults`) + `liveActivityIntentBridge.ts`.
**Aplica-se a:** `AdjustRepsIntent`/`AdjustLoadIntent` e os casos `adjustReps`/`adjustLoad` no
bridge — mesmo padrão de `id` estável, `ackQueuedLiveActivityIntent(event.id)` só depois do
resultado real da ação de store, cap `maxEntries = 20` herdado sem mudança.

### Persistência a cada mutação de série
**Fonte:** regra da 16-10, `activeSessionStore.ts:1275-1281`.
**Aplica-se a:** `stepReps()` — precisa do mesmo `saveDraft()` fire-and-forget que as outras sete
ações de série já fazem.

### Clamp de piso em steppers
**Fonte:** `Math.max(0, ...)` em `stepLoad()`, `sessionModel.ts:254`.
**Aplica-se a:** `stepReps()` precisa do mesmo piso (0), cobrindo V5 (Input Validation) do
Security Domain do RESEARCH.md — nenhum delta arbitrário entra pela tela bloqueada, só múltiplos
do passo fixo configurado.

## No Analog Found

Nenhum arquivo desta fase ficou sem analog — todos os 15 itens classificados têm correspondência
`exact` ou `role-match` no código já existente (ver tabela acima). Isto é esperado: RESEARCH.md
já identificou que a fase é 100% extensão aditiva de contratos existentes, sem arquitetura nova.

## Metadata

**Escopo de busca de analogs:** `src/engine/`, `src/store/`, `src/services/`,
`src/components/session/`, `src/native/`, `modules/live-activity/`, `targets/session-widget/`,
`scripts/`, `__tests__/` — todos já indicados por file:line no RESEARCH.md desta fase; nenhuma
varredura adicional do repositório foi necessária além da confirmação de `ActiveSessionScreen.tsx`
(Open Question 4) e da extração de excerpts adicionais (`SessionPlayer.tsx`, `IntentActionQueue.swift`,
`liveActivityIntentBridge.ts`, `verify-native-skeleton.sh`) não totalmente citados no RESEARCH.
**Arquivos lidos nesta sessão (targeted):** `src/screens/ActiveSessionScreen.tsx` (1-60, 260-340),
`src/components/session/SessionPlayer.tsx` (620-660, 740-760), `src/components/session/
sessionPlayerLayout.ts` (1-20), `modules/live-activity/ios/IntentActionQueue.swift` (1-55),
`scripts/verify-native-skeleton.sh` (140-167), `src/native/liveActivityIntentBridge.ts` (completo).
**Data da extração:** 2026-08-18
