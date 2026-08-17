# Phase 16: Tela bloqueada — comandar - Mapa de Padrões

**Mapeado:** 2026-08-17
**Arquivos analisados:** 11
**Analogs encontrados:** 9 / 11

## File Classification

| Arquivo novo/modificado | Papel | Fluxo de dados | Analog mais próximo | Qualidade do match |
|---|---|---|---|---|
| `modules/live-activity/ios/CompleteSetIntent.swift` | controller (App Intent, `perform()` roda no app) | event-driven | `targets/session-widget/AppIntent.swift` (estrutura de `AppIntent`/`@Parameter`) + `modules/live-activity/ios/LiveActivityModule.swift` (chamadas ActivityKit) | role-match (nenhum `LiveActivityIntent` real existe ainda no repo) |
| `modules/live-activity/ios/SkipRestIntent.swift` | controller (App Intent) | event-driven | mesmo par acima | role-match |
| `modules/live-activity/ios/AdjustRestIntent.swift` | controller (App Intent, com `@Parameter deltaSeconds`) | event-driven | `targets/session-widget/AppIntent.swift` (`@Parameter(title:)`) | role-match |
| `modules/live-activity/ios/IntentActionQueue.swift` | utility (fila durável App Group) | file-I/O | nenhum análogo direto — ver "No Analog Found" | sem análogo |
| `targets/session-widget/CompleteSetIntent.swift` (cópia) | controller (App Intent, stub/cópia p/ compilar extensão) | event-driven | `targets/session-widget/SessionActivityAttributes.swift` (padrão de duplicação já em produção entre os dois targets) | exact (padrão de duplicação) |
| `targets/session-widget/SkipRestIntent.swift` (cópia) | controller | event-driven | idem | exact (padrão de duplicação) |
| `targets/session-widget/AdjustRestIntent.swift` (cópia) | controller | event-driven | idem | exact (padrão de duplicação) |
| `modules/live-activity/ios/LiveActivityModule.swift` (+ `Events`/`OnCreate`/`shared`) | service (native bridge) | event-driven | ele mesmo — modificação in-place | exact |
| `targets/session-widget/WidgetLiveActivity.swift` (+ `Button(intent:)`) | component (SwiftUI widget) | streaming + event-driven | ele mesmo — modificação in-place | exact |
| `src/native/liveActivityIntentBridge.ts` (novo) | service (listener de evento nativo → ações da store) | event-driven | `src/native/liveActivitySync.ts` (listener/subscribe já existente, mesmo diretório) | role-match |
| `src/store/activeSessionStore.ts` (+ `reconcileLiveActivityIntents()`, possível `skipRestFromIntent`) | store | CRUD + event-driven | ele mesmo — `completeSet`/`adjustRest`/`activateSet` (padrão CAS já existente) | exact (modificação de arquivo existente) |
| `App.tsx` (+ registro do listener `onIntentAction` / import de `liveActivityIntentBridge`) | provider/host wiring | event-driven (boot-time) | ele mesmo — `reconcileOrphanActivities()` chamado em `useEffect` na montagem | exact |
| `__tests__/liveActivityIntentBridge.test.ts` (novo) | test | unit | `__tests__/activeSessionStore.test.ts` (estilo de mock de módulo nativo + asserção CAS) | role-match |
| `__tests__/liveActivityIntentQueue.test.ts` (novo) | test | unit | `__tests__/activeSessionStore.test.ts` | role-match |

## Pattern Assignments

### `modules/live-activity/ios/CompleteSetIntent.swift` / `SkipRestIntent.swift` / `AdjustRestIntent.swift` (controller, event-driven)

**Analog 1 — forma de `AppIntent` com parâmetro** (`targets/session-widget/AppIntent.swift`, arquivo completo, 10 linhas — hoje é só o scaffold do template Expo, ainda não usado por nenhum widget real):
```swift
import WidgetKit
import AppIntents

struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Configuration" }
    static var description: IntentDescription { "This is an example widget." }

    @Parameter(title: "Favorite Emoji", default: "😃")
    var favoriteEmoji: String
}
```
Copiar a forma de `@Parameter(title:)` para `AdjustRestIntent.deltaSeconds`. **Atenção:** este scaffold conforma a `WidgetConfigurationIntent`, não a `LiveActivityIntent` — os três Intents novos DEVEM conformar a `LiveActivityIntent` (per RESEARCH.md Pitfall 5), não copiar o protocolo, só a sintaxe de `@Parameter`/`static var title`.

**Analog 2 — acesso a `Activity<SessionActivityAttributes>` e datas ISO8601** (`modules/live-activity/ios/LiveActivityModule.swift`, lido nesta sessão, linhas 1-60):
```swift
import ActivityKit
import ExpoModulesCore

@available(iOS 16.2, *)
public class LiveActivityModule: Module {
  private var currentActivity: Activity<SessionActivityAttributes>?
  ...
  currentActivity = try Activity.request(
    attributes: attributes,
    content: ActivityContent(state: state, staleDate: nil),
    pushType: nil
  )
```
Os três Intents usam o mesmo tipo `Activity<SessionActivityAttributes>` (já existe, sem mudança) para leitura via `Activity<SessionActivityAttributes>.activities.first` dentro de `perform()`, conforme RESEARCH.md Pattern 1.

**Import/estrutura a seguir** (combinação dos dois analogs, per RESEARCH.md Code Examples — já validado contra os arquivos reais lidos nesta sessão):
```swift
import AppIntents
import ActivityKit

struct CompleteSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource { "Concluir série" }

    func perform() async throws -> some IntentResult {
        IntentActionQueue.enqueue(.completeSet)
        LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "completeSet"])
        return .result()
    }
}
```

---

### `targets/session-widget/CompleteSetIntent.swift` / `SkipRestIntent.swift` / `AdjustRestIntent.swift` (cópias no target da extensão)

**Analog — padrão de duplicação física já em produção:** `targets/session-widget/SessionActivityAttributes.swift` e `modules/live-activity/ios/SessionActivityAttributes.swift` são hoje **byte-a-byte idênticos** (29 linhas, verificado na pesquisa da Fase 16 e herdado da Fase 15). Este é o único precedente de "mesmo arquivo Swift fisicamente duplicado em dois targets" no repo — `@bacons/apple-targets` não oferece compartilhamento de arquivo único entre targets (RESEARCH.md Pitfall 1/Assumption A2).

**Regra a aplicar:** os três novos arquivos de Intent devem ser criados como cópia literal nos dois diretórios (`modules/live-activity/ios/` e `targets/session-widget/`), sem divergência de conteúdo. Adicionar ao `scripts/verify-native-skeleton.sh` uma checagem de diff entre os pares — ver Shared Patterns.

---

### `modules/live-activity/ios/LiveActivityModule.swift` (+ `Events`/`OnCreate`/`shared`)

**Analog:** ele mesmo — hoje (lido nesta sessão, linhas 1-60+) declara `AsyncFunction`s (`startActivity` etc.) mas **nenhum `Events(...)`, `OnCreate`, nem referência estática `shared`** — confirmado por RESEARCH.md `[VERIFIED: modules/live-activity/ios/LiveActivityModule.swift:1-102]`.

**Padrão a introduzir** (per RESEARCH.md Pattern 2, adaptado do módulo Expo já existente — `Name(...)` já é usado, só falta o bloco novo):
```swift
@available(iOS 16.2, *)
public class LiveActivityModule: Module {
  static weak var shared: LiveActivityModule?

  public func definition() -> ModuleDefinition {
    Name("LiveActivityModule")

    OnCreate {
      LiveActivityModule.shared = self
    }

    Events("onIntentAction")

    // AsyncFunctions já existentes (startActivity/updateActivity/endActivity/
    // isActivityRunning/reconcileOrphans) permanecem sem mudança
  }
}
```
Colocar `OnCreate`/`Events` no topo do bloco `definition()`, antes das `AsyncFunction`s já existentes, seguindo a ordem "Name → lifecycle hooks → events → functions" que a Expo Modules API usa (docs.expo.dev/modules/module-api).

---

### `targets/session-widget/WidgetLiveActivity.swift` (+ `Button(intent:)`/`Toggle(intent:)`)

**Analog:** ele mesmo — modificação in-place do arquivo já reescrito na Fase 15 (lido nesta sessão, linhas 1-50: já tem `activityBackground`/`activityNeon`/`activitySecondary` como cores fixas, `prescriptionText`/`seriesText`/`overtimeText`/`secondaryLine` como funções auxiliares por fase).

**Ponto de inserção** (dentro do corpo que já faz `switch state.phase`, fase `.resting` — per RESEARCH.md Code Examples, casando com as cores/tipografia já fixadas na Fase 15):
```swift
HStack {
    Button(intent: AdjustRestIntent(deltaSeconds: -30)) {
        Text("-30s")
    }
    Button(intent: SkipRestIntent()) {
        Text("Pular")
    }
    Button(intent: AdjustRestIntent(deltaSeconds: 30)) {
        Text("+30s")
    }
}
```
Reaproveitar as cores já fixadas no topo do arquivo (`activityNeon`, `activitySecondary`) para o estilo dos botões — não introduzir cores novas sem passar por `/gsd-ui-phase 16` (RESEARCH.md Open Question 1).

**Reabertura do app pelo corpo do card** (não pelo botão — RESEARCH.md Pitfall 2):
```swift
lockScreenBody(context.state)
    .padding()
    .activityBackgroundTint(activityBackground)
    .widgetURL(URL(string: "forcaapp://session/active"))
```

---

### `src/native/liveActivityIntentBridge.ts` (novo)

**Analog:** `src/native/liveActivitySync.ts` (mesmo diretório, lido nesta sessão, linhas 1-60) — já estabelece o padrão do repo para "módulo nativo de Live Activity + estado local de módulo (não React) + listeners registrados via `Set`":
```typescript
import {
  endLiveActivity,
  reconcileLiveActivityOrphans,
  startLiveActivity,
  updateLiveActivity,
} from '../../modules/live-activity';
import { useActiveSessionStore } from '../store/activeSessionStore';

let lastStartFailed = false;
const startFailureListeners = new Set<() => void>();

const recordStartFailure = (failed: boolean): void => {
  lastStartFailed = failed;
  if (!failed) return;
  for (const listener of startFailureListeners) listener();
};

export const subscribeLiveActivityStartFailure = (
  listener: () => void,
): (() => void) => {
  startFailureListeners.add(listener);
  return () => startFailureListeners.delete(listener);
};
```
**Padrão a copiar:** módulo-singleton com estado privado + função `subscribe*` exportada que devolve unsubscribe — mesma forma de `subscribeLiveActivityStartFailure`. Para `liveActivityIntentBridge.ts`, trocar "listener local" por "listener do evento nativo `onIntentAction`" (via `LiveActivityModule.addListener`, conforme RESEARCH.md Pattern 3) e no handler chamar diretamente as ações já existentes da store — nenhuma lógica de domínio nova.

**Lógica de resolução de série/ação** (RESEARCH.md Pattern 3, já reconciliada com `findActiveSet`/`findNextPendingSet` de `src/engine/sessionModel.ts` e as ações reais da store, lidas nesta sessão em `src/store/activeSessionStore.ts:1085-1109`):
```typescript
switch (event.kind) {
  case 'completeSet': {
    const alvo = findActiveSet(draft) ?? findNextPendingSet(draft);
    if (alvo) void useActiveSessionStore.getState().completeSet(
      alvo.exercise.exerciseId,
      alvo.set.setOrder,
    );
    break;
  }
  case 'skipRest': {
    const proxima = findNextPendingSet(draft);
    if (proxima) useActiveSessionStore.getState().activateSet(
      proxima.exercise.exerciseId,
      proxima.set.setOrder,
    );
    break;
  }
  case 'adjustRest':
    useActiveSessionStore.getState().adjustRest(event.deltaSeconds);
    break;
}
```

---

### `src/store/activeSessionStore.ts` (+ `reconcileLiveActivityIntents()`)

**Analog:** ele mesmo — `adjustRest`/`activateSet` (lidas nesta sessão, linhas 1085-1109) já são as funções-alvo, SEM mudança de assinatura necessária:
```typescript
activateSet: (exerciseId, setOrder) => {
  const draft = get().draft;
  if (!draft) return;
  const agora = new Date().toISOString();
  let ativou = false;
  const novo = withSet(draft, exerciseId, setOrder, (s) => {
    if (s.status !== 'pending') return s;
    ativou = true;
    return { ...s, status: 'active', activatedAt: s.activatedAt ?? agora };
  });
  if (ativou) set({ draft: { ...novo, restEndsAt: null } });
},

adjustRest: (deltaSeconds) => {
  const draft = get().draft;
  if (!draft?.restEndsAt || !Number.isFinite(deltaSeconds)) return;
  set({
    draft: { ...draft, restEndsAt: ajustarRestEndsAt(draft.restEndsAt, deltaSeconds) },
  });
},
```
**Guarda CAS a seguir para a nova `reconcileLiveActivityIntents()`:** o padrão "capturar `sessionLogId` antes do `await`, reconferir depois" já documentado em `15-PATTERNS.md` (linhas 150-167, `finishSession`) continua válido — a reconciliação da fila do App Group deve verificar `sessionLogId` da intenção pendente contra o `draft.sessionLogId` atual e descartar se divergiu (RESEARCH.md Security Domain, "Reconciliação... aplicando intenção contra a sessão ERRADA").

**Idempotência já garantida, sem mudança:** `completeSet` já trata `status === 'done'` como idempotente e já tem `inFlight` (`Set<string>`, linha 236, chave por `(sessionLogId, plannedSetId)`, uso em `1228`/`1265`/`1460`) — o novo call site via `liveActivityIntentBridge.ts` reusa exatamente essa função, nenhuma guarda nova.

---

### `App.tsx` (+ registro do bridge de intent)

**Analog:** ele mesmo — padrão já estabelecido pela Fase 15, lido nesta sessão:
```typescript
import {
  reconcileOrphanActivities,
} from './src/native/liveActivitySync';
import LiveActivityUnavailableBanner from './src/components/LiveActivityUnavailableBanner';
...
useEffect(() => {
  void reconcileOrphanActivities();
  ...
}, []);
...
<LiveActivityUnavailableBanner />
```
**Padrão a copiar:** side effect de montagem, independente de navegação (mesmo `useEffect` raiz, ou um novo ao lado dele) chamando algo como `registerLiveActivityIntentListener()`/`reconcileLiveActivityIntents()` exportado de `liveActivityIntentBridge.ts` — mesma filosofia "roda não importa em qual tela o dono está" já usada por `reconcileOrphanActivities()`.

---

### Tests

**Analog para `liveActivityIntentBridge.test.ts` e `liveActivityIntentQueue.test.ts`:** `__tests__/activeSessionStore.test.ts` — estilo de mock de módulo nativo (`jest.mock('../modules/live-activity', () => ({ ... }))`, per `15-PATTERNS.md` linhas 334-343) + asserção de idempotência/CAS já usada nos testes existentes de `completeSet`. Seguir a mesma estrutura `describe`/`it` e mockar `LiveActivityModule.addListener` como um `EventEmitter` fake para simular o disparo de `onIntentAction`.

## Shared Patterns

### CAS guard em mutações assíncronas da store
**Source:** `src/store/activeSessionStore.ts` (`completeSet`, `finishSession` — ver `15-PATTERNS.md` linhas 150-167)
**Apply to:** `reconcileLiveActivityIntents()` — capturar `sessionLogId` antes de processar a fila do App Group, reconferir depois de qualquer `await`, descartar se a sessão mudou.

### Duplicação física de arquivo Swift entre os dois targets
**Source:** `targets/session-widget/SessionActivityAttributes.swift` ⇄ `modules/live-activity/ios/SessionActivityAttributes.swift` (idênticos, precedente já em produção desde a Fase 14/15)
**Apply to:** os três novos Intents (`CompleteSetIntent.swift`, `SkipRestIntent.swift`, `AdjustRestIntent.swift`) — mesmo conteúdo nos dois diretórios. Estender `scripts/verify-native-skeleton.sh` (linha 111, loop `for modulo_local in NativeInfoModule; do`) com uma checagem de diff/hash entre os pares duplicados, para pegar divergência silenciosa antes do build.

### Listener nativo com estado de módulo (não React) + `subscribe*` exportado
**Source:** `src/native/liveActivitySync.ts` (`startFailureListeners`, `subscribeLiveActivityStartFailure`)
**Apply to:** `src/native/liveActivityIntentBridge.ts` — assinar `LiveActivityModule.addListener('onIntentAction', ...)` uma vez, despachar para as ações da store já existentes.

### Root-mounted, navigation-independent side-effect host
**Source:** `App.tsx` (`useEffect` que chama `reconcileOrphanActivities()`, já documentado em `15-PATTERNS.md` linhas 366-369)
**Apply to:** registro do listener/reconciliação de intents em `App.tsx`, mesma filosofia — não pode depender do dono estar em `ActiveSessionScreen.tsx`.

### Nenhuma lógica de domínio nova em Swift
**Source:** `src/engine/sessionModel.ts` (`findActiveSet`/`findNextPendingSet`), `src/engine/sessionSummary.ts` (`ajustarRestEndsAt`)
**Apply to:** todos os três Intents — `perform()` só enfileira/emite evento; toda decisão de "qual série" ou "qual delta" já resolvida em TS, replicada em Swift apenas como passagem de parâmetro (RESEARCH.md Anti-Patterns, "Duplicar a lógica de 'qual é a série atual' em Swift").

## No Analog Found

| Arquivo | Papel | Fluxo de dados | Motivo |
|---|---|---|---|
| `modules/live-activity/ios/IntentActionQueue.swift` | utility (fila durável App Group) | file-I/O | Nenhum precedente de leitura/escrita em `UserDefaults(suiteName:)` como fila (lista) existe hoje no repo — o App Group já é usado (Fase 14, spike D-09) só para valores simples/pontuais, não como fila FIFO/cap de itens. RESEARCH.md classifica isso como "decisão de implementação, não achado de pesquisa" (Security Domain, mitigação de DoS local). Implementar do zero seguindo a API padrão `UserDefaults(suiteName:)` já usada em outros pontos do Módulo `NativeInfoModule`/spike, sem duplicar lógica de domínio. |
| Intents em si conformando `LiveActivityIntent` | controller | event-driven | Nenhum `LiveActivityIntent` real existe hoje no repo — `targets/session-widget/AppIntent.swift` é `WidgetConfigurationIntent` (template não usado), protocolo diferente. Usar apenas a sintaxe de `@Parameter`, não a conformidade de protocolo. |

## Metadata

**Analog search scope:** `modules/live-activity/` (index.ts, ios/*.swift), `modules/native-info/` (padrão de módulo local), `targets/session-widget/` (AppIntent.swift, WidgetLiveActivity.swift, SessionActivityAttributes.swift), `src/native/liveActivitySync.ts`, `src/store/activeSessionStore.ts`, `src/engine/sessionModel.ts`/`sessionSummary.ts`, `App.tsx`, `scripts/verify-native-skeleton.sh`, `__tests__/activeSessionStore.test.ts`, herdado de `.planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-PATTERNS.md`
**Files scanned:** 9 lidos diretamente nesta sessão (parcial/completo) + graphify query para orientação + `15-PATTERNS.md` como referência de formato/precedente já validado
**Pattern extraction date:** 2026-08-17
