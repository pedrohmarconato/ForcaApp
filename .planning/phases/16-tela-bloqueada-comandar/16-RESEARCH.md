# Phase 16: Tela bloqueada — comandar - Research

**Researched:** 2026-08-17
**Domain:** App Intents interativos em Live Activity (ActivityKit + AppIntents), iOS 17+, Expo Modules API, React Native bridge nativa
**Confidence:** MEDIUM — a mecânica central (`LiveActivityIntent.perform()` roda no processo do app, não pode abrir o app) está cross-verificada em 3 fontes independentes; o comportamento exato no cold-launch (app force-quit) segue sem fonte primária conclusiva e é o próprio critério de sucesso 3 desta fase — só o spike em aparelho decide.

## Summary

Esta fase adiciona botões interativos (`Button(intent:)`) à Live Activity somente-leitura entregue na Fase 15, sem trocar de arquitetura de dados: o toque no botão precisa terminar exatamente no mesmo caminho `completeSet()` → `enqueueAndDrain()` (outbox) → servidor que já existe em `src/store/activeSessionStore.ts`. A pesquisa confirma, com múltiplas fontes independentes (incluindo um Apple DTS Engineer citado literalmente em fórum oficial), que um `AppIntent` conformando ao protocolo `LiveActivityIntent` executa `perform()` **no processo do app principal**, nunca no processo da extensão de widget — isto já era a hipótese de trabalho herdada da pesquisa do milestone (`research/ARCHITECTURE.md`) e agora está reforçada por fonte externa. Isso muda o desenho de "preciso de um canal cross-process" para "preciso de um canal in-process JS↔Swift mais um canal durável para quando o processo não estava vivo" — exatamente o padrão que a Fase 14 já deixou preparado com o App Group `group.com.pmarconato.forcaapp.shared` (comprovado PASS em aparelho físico, spike D-09).

Duas descobertas desta pesquisa mudam decisões de design que não estavam explícitas no CONTEXT/ROADMAP: (1) `LiveActivityIntent` **não pode abrir o app** sob nenhuma circunstância — nem com `openAppWhenRun` (essa propriedade não existe nesse protocolo) — confirmado por um DTS Engineer da Apple; a única forma nativa de "reabrir o app" a partir da Live Activity é `Link`/`widgetURL()` no corpo do card, fora do botão do intent. Isso obriga o critério de sucesso 3 ("ação aplicada de fato ou app reaberto para concluir") a usar dois mecanismos native distintos, não um fallback dentro do mesmo botão. (2) A Expo Modules API não documenta como emitir um evento para o JS a partir de código nativo fora da própria classe do módulo (GitHub Discussion #27468, sem resposta oficial da Expo) — o padrão usado na comunidade React Native (registrar uma referência estática da instância do módulo durante o lifecycle de criação) precisa ser portado manualmente para este projeto, e é exatamente o tipo de lacuna que só aparece ao implementar, não ao ler a arquitetura já escrita na Fase 14.

**Primary recommendation:** Implementar três `LiveActivityIntent`s (`CompleteSetIntent`, `SkipRestIntent`, `AdjustRestIntent`) como cópias duplicadas em `modules/live-activity/ios/` (target do app, com `perform()` real) e `targets/session-widget/` (target da extensão, cópia idêntica ou stub — replicando o padrão JÁ existente com `SessionActivityAttributes.swift`, duplicado hoje nos dois locais). `perform()` faz DUAS coisas na ordem: (a) grava a intenção na fila durável do App Group (para sobreviver a cold-launch) e (b) tenta emitir um evento in-process via uma referência estática de `LiveActivityModule` registrada em `OnCreate`. O lado JS assina esse evento e chama as ações JÁ EXISTENTES da store (`completeSet`, `adjustRest`, e uma nova ação de "pular descanso" que reaproveita `activateSet`), nunca lógica nova de persistência. Bloquear a Fase 16 em um plano dedicado de "reconciliação da fila do App Group no boot" — sem ele, o critério de sucesso 3 (force-quit) não tem como passar de forma confiável.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMD-01 | O dono conclui a série atual com 1 toque no botão da tela bloqueada (App Intent), sem abrir o app — o registro segue o MESMO caminho `completeSet()` → outbox → servidor que já existe (a Live Activity é espelho, nunca fonte de verdade). | Padrão "App Intent perform() emite evento in-process → JS chama `completeSet(exerciseId, setOrder)` já existente" (Pattern 1, Code Examples). `completeSet` já é idempotente por status `'done'` (`src/store/activeSessionStore.ts:1220`) e já tem guarda de CAS/reentrância (`inFlight`, linhas 1222-1228) — nenhuma mudança nele é necessária, só um novo call site. |
| CMD-02 | O dono pula ou ajusta o descanso direto na tela bloqueada; o timer nativo reflete o ajuste imediatamente. | `adjustRest(deltaSeconds)` já existe na store (`activeSessionStore.ts:1100-1109`) e já traduz o `restEndsAt` via `ajustarRestEndsAt` (`sessionSummary.ts:79-87`) — CMD-02 (ajustar) é reaproveitamento direto. "Pular" não tem ação de store dedicada hoje; a Fase 16 precisa expor uma via que reusa `activateSet(exerciseId, setOrder)` (`activeSessionStore.ts:1085-1098`, já zera `restEndsAt`) sobre o próximo `pending` set — ver Pattern 3. Atualização "imediata" do timer nativo decorre de `Activity.update()` chamado DENTRO do próprio `perform()` (roda no processo do app, tem acesso a `Activity.activities`), não depende do round-trip até o JS terminar. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Renderização dos botões na Live Activity (Lock Screen + Dynamic Island) | Extensão de widget (WidgetKit, SwiftUI) | — | `targets/session-widget/WidgetLiveActivity.swift` já é o dono da UI da Live Activity (Fase 15); só ganha `Button(intent:)`/`Toggle(intent:)` novos, sem mudar de camada. |
| Execução de `perform()` do App Intent | Processo do app principal (não a extensão) | — | Confirmado por fonte primária Apple (DTS Engineer, forum thread 812949) e reforçado por thread 735382: `activity.update()` só funciona quando o intent está no bundle do app. |
| Registro definitivo da série (persistência) | JS / `activeSessionStore.completeSet()` → outbox → backend | — | Requisito explícito CMD-01: "MESMO caminho... a Live Activity é espelho, nunca fonte de verdade". `perform()` NUNCA fala com Supabase diretamente. |
| Feedback visual imediato no lock screen (antes do round-trip JS completar) | `perform()` chamando `Activity<T>.update()` nativo, direto | — | `Activity.activities`/`Activity.update()` só funcionam no processo do app (confirmado); usar isso para feedback instantâneo, independente da bridge RN estar pronta. |
| Durabilidade para cold-launch (app estava morto) | App Group `UserDefaults(suiteName:)` compartilhado | Reconciliação em `App.tsx`/`activeSessionStore` no próximo `startOrResume`/foreground | Espelha o padrão já usado pela Fase 15 (`reconcileOrphanActivities`) e pela outbox offline (`applyServerSetLogs`) — mesma filosofia "servidor/store é autoridade, fila é durabilidade". |
| Reabertura do app a partir da Live Activity (quando necessário) | `Link`/`widgetURL()` no corpo do card | — | `LiveActivityIntent` **não pode** abrir o app (confirmação DTS) — nenhuma lógica de "abrir app" pode viver dentro de `perform()`. |

## Standard Stack

### Core
| Framework | Versão mínima | Propósito | Por que é o padrão |
|---------|---------|---------|--------------|
| ActivityKit | iOS 16.1 (a fase usa 17.0, já fixado no projeto) | `Activity<SessionActivityAttributes>.update()`/`.activities` chamados de dentro de `perform()` | Framework do sistema, já em uso desde a Fase 15 (`modules/live-activity/ios/LiveActivityModule.swift`) — sem alternativa. |
| App Intents (`AppIntents`) | iOS 16.0 (protocolo `LiveActivityIntent` especificamente é iOS 17.0+) | `CompleteSetIntent`/`SkipRestIntent`/`AdjustRestIntent` conformando a `LiveActivityIntent` | Único mecanismo suportado pela Apple para botões interativos em Live Activity — `Button(intent:)`/`Toggle(isOn:intent:)` exigem um tipo conformando a esse protocolo. `[CITED: developer.apple.com/forums — múltiplas threads, ver Sources]` |
| WidgetKit | iOS 16.1 | `Button(intent:)` dentro de `ActivityConfiguration` (`WidgetLiveActivity.swift`) | Já em uso desde a Fase 15; ganha os elementos interativos nesta fase. |
| Expo Modules API (`ExpoModulesCore`) | Já pinado via Expo SDK 54 (`expo: ^54.0.36`) | `Events(...)` + `sendEvent(...)` no `LiveActivityModule` para notificar o JS a partir do intent | Já é o mecanismo usado pelo módulo `LiveActivityModule` existente (Fase 15) — ganha um bloco `Events`/`OnStartObserving` que ainda não existe. `[VERIFIED: modules/live-activity/ios/LiveActivityModule.swift:1-102]` (arquivo lido nesta sessão — hoje NÃO declara nenhum `Events(...)`). |

Nenhum pacote npm novo é necessário nesta fase — App Intents e ActivityKit são frameworks do sistema operacional, não dependências de registry. `@bacons/apple-targets@^5.0.0` e `expo-modules-core` (via `expo@^54.0.36`) já estão instalados desde a Fase 14 e não mudam de versão.

### Supporting
| Item | Versão | Propósito | Quando usar |
|---------|---------|---------|-------------|
| `UserDefaults(suiteName: "group.com.pmarconato.forcaapp.shared")` | — (API do sistema) | Fila durável de intenções (App Group), canal de leitura para o cold-launch | Único canal comprovado app ⇄ extensão em time gratuito (spike D-09, PASS nas duas direções). Usar SOMENTE para durabilidade de intenção, nunca como fonte de verdade de sessão. |
| `Link`/`widgetURL()` (SwiftUI) | iOS 16.0+ | Reabrir o app a partir do CORPO da Live Activity (não do botão do intent) | Necessário para o caminho "app reaberto para concluir" do critério de sucesso 3 — `LiveActivityIntent` não pode fazer isso sozinho. `Link` funciona no Dynamic Island expandido; no Lock Screen a Apple restringe por segurança — `widgetURL()` aplicado à view inteira é o caminho mais confiável no Lock Screen. `[CITED: developer.apple.com/forums/thread/812949]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Referência estática da instância do `LiveActivityModule` para `sendEvent` fora da classe | `NotificationCenter`/`CFNotificationCenter` (Darwin notification) | Pesquisa da Fase 14 (`research/ARCHITECTURE.md:210`) já descartou Darwin notification para ESTE caso especificamente: como `perform()` já roda no processo do app (não na extensão), não existe fronteira de processo a cruzar — Darwin notification resolveria um problema que não existe aqui, e adiciona uma falha nova (não entrega a processo terminado, exatamente como o App Group já teria de resolver de qualquer forma). Mantido: referência estática + App Group. |
| Duplicar o Swift do Intent nos dois targets (padrão já usado por `SessionActivityAttributes.swift`) | Um único arquivo compartilhado via `modules/live-activity/ios/` referenciado pelos dois `expo-target.config.js` | Não investigado se `@bacons/apple-targets` suporta apontar o MESMO arquivo físico para dois targets sem duplicar; a duplicação manual já é o padrão comprovado no repo (`SessionActivityAttributes.swift` está fisicamente em dois arquivos idênticos hoje) — seguir o padrão existente reduz risco de descoberta tardia no prebuild. Ver Pitfall 1. |

**Installation:** Nenhuma — sem pacotes npm novos, apenas arquivos Swift novos dentro de `modules/live-activity/ios/` e `targets/session-widget/`.

**Version verification:** Deployment targets já conferidos nos dois arquivos de configuração desta sessão:
- `app.json:51` → `"deploymentTarget": "17.0"` (plugin `expo-build-properties`, app principal). `[VERIFIED: app.json:46-53]` — bloco lido nesta sessão: `"@bacons/apple-targets", ["expo-build-properties", {"ios": {"deploymentTarget": "17.0"}}]`.
- `targets/session-widget/expo-target.config.js:6` → `deploymentTarget: "17.0"`. `[VERIFIED: targets/session-widget/expo-target.config.js:1-13]`.

Os dois targets já estão em iOS 17.0 — acima do mínimo exigido por `LiveActivityIntent`/`Button(intent:)` (iOS 17.0). Nenhuma mudança de deployment target é necessária nesta fase.

## Package Legitimacy Audit

Não aplicável — esta fase não instala nenhum pacote novo (npm, CocoaPods ou Swift Package Manager). Todo o trabalho é código Swift novo dentro de módulos/targets já existentes e provisionados desde a Fase 14, mais chamadas a frameworks do sistema operacional (ActivityKit, AppIntents, WidgetKit).

## Architecture Patterns

### System Architecture Diagram

```
LOCK SCREEN (processo da extensão de widget — só renderiza)
  Button(intent: CompleteSetIntent())  ─┐
  Button(intent: SkipRestIntent())      │  tap
  Button(intent: AdjustRestIntent(-30)) ┘
        │
        │ iOS roteia perform() para o PROCESSO DO APP PRINCIPAL
        │ (não para a extensão — confirmado por fonte Apple)
        ▼
┌────────────────────────────────────────────────────────────┐
│ PROCESSO DO APP (pode estar suspenso/terminado → relançado  │
│ brevemente pelo iOS, sem UI em primeiro plano)               │
│                                                                │
│  CompleteSetIntent.perform() [modules/live-activity/ios/]    │
│    1. grava intenção na fila App Group (durável, PRIMEIRO)   │
│    2. Activity<T>.update(...) direto — feedback visual        │
│       imediato, NUNCA depende do JS estar vivo                │
│    3. LiveActivityModule.shared?.sendEvent("onIntentTapped")  │
│       — só chega ao JS SE a bridge já estiver de pé            │
└────────────┬──────────────────────────┬─────────────────────┘
             │ (bridge viva)            │ (cold-launch: bridge
             ▼                          │  ainda não subiu OU já
  NativeEventEmitter (JS)               │  foi suspensa de novo)
  listener → activeSessionStore         │
    .completeSet(exerciseId, setOrder)  │
    (MESMA função já existente)         │
             │                          ▼
             ▼                 App reabre em foreground depois
  enqueueAndDrain() (outbox)   (toque do dono OU próxima sessão)
             │                          │
             ▼                          ▼
        SERVIDOR              reconcileLiveActivityIntents()
      (Supabase, via          (novo — espelha
       backend REST)          reconcileOrphanActivities já       
                               existente em App.tsx) drena a
                               fila do App Group e replica cada
                               intenção pendente no MESMO
                               completeSet()/adjustRest()
```

### Recommended Project Structure
```
modules/live-activity/ios/
├── LiveActivityModule.swift        # existente (Fase 15) — ganha Events()/OnCreate
├── SessionActivityAttributes.swift # existente (Fase 15), sem mudanças
├── CompleteSetIntent.swift         # NOVO — perform() REAL (roda no processo do app)
├── SkipRestIntent.swift            # NOVO — perform() REAL
├── AdjustRestIntent.swift          # NOVO — perform() REAL (parâmetro deltaSeconds)
└── IntentActionQueue.swift         # NOVO — leitura/escrita da fila no App Group

targets/session-widget/
├── WidgetLiveActivity.swift        # existente — ganha Button(intent:)/Toggle(intent:)
├── SessionActivityAttributes.swift # existente, cópia idêntica (padrão já estabelecido)
├── CompleteSetIntent.swift         # NOVO — cópia p/ compilar o Button(intent:) na extensão
├── SkipRestIntent.swift            # NOVO — cópia
└── AdjustRestIntent.swift          # NOVO — cópia

src/native/
├── liveActivitySync.ts             # existente — ganha listener de evento nativo
└── liveActivityIntentBridge.ts     # NOVO — assina o evento, chama ações da store

src/store/activeSessionStore.ts     # ganha `skipRestFromIntent`/reaproveita `activateSet`,
                                     # ganha `reconcileLiveActivityIntents()`
```

### Pattern 1: `perform()` roda no processo do app — não precisa (nem consegue) cruzar processo para o caminho rápido

**What:** Um `AppIntent` conformando a `LiveActivityIntent` (não `AppIntent` genérico) tem seu `perform()` executado dentro do processo do app principal quando o intent também está incluído no target do app — não no processo da extensão que desenhou o botão.

**When to use:** Sempre, para os três intents desta fase. É a premissa que torna viável ligar o toque na tela bloqueada direto em `completeSet()`/`adjustRest()` sem inventar um protocolo de IPC novo.

**Example:**
```swift
// Source: padrão consolidado a partir de developer.apple.com/forums/thread/735382
// (confirmação: intent precisa estar no bundle do APP, não só da extensão, para
// perform() rodar lá e Activity.update() funcionar) + reactnative.university
// (padrão de emissão de evento estático, adaptado de RCTEventEmitter p/ Expo Modules)
// modules/live-activity/ios/CompleteSetIntent.swift
import AppIntents
import ActivityKit

struct CompleteSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource { "Concluir série" }

    func perform() async throws -> some IntentResult {
        // 1) durável PRIMEIRO — sobrevive mesmo se o passo 3 não chegar ao JS
        IntentActionQueue.enqueue(.completeSet)

        // 2) feedback nativo imediato — só funciona pois este perform() roda
        //    no processo do app (Activity.activities não está vazio aqui)
        if let activity = Activity<SessionActivityAttributes>.activities.first {
            // opcional: já materializa um estado otimista local
        }

        // 3) round-trip in-process para o JS, se a bridge já estiver viva
        LiveActivityModule.shared?.sendEvent("onIntentAction", ["kind": "completeSet"])

        return .result()
    }
}
```

### Pattern 2: A instância do módulo Expo precisa se auto-registrar para ser alcançável de fora da própria classe

**What:** A Expo Modules API não expõe (confirmado: GitHub Discussion #27468, sem resposta oficial) uma forma documentada de chamar `sendEvent` numa instância de módulo a partir de código nativo que não é a própria classe do módulo. A instanciação manual (`MyModule().sendExpoEvent(...)`) falha com `"You can't access the app context"`.

**When to use:** Sempre que o Intent (que vive fisicamente fora da classe `LiveActivityModule`) precisar notificar o JS.

**Example:**
```swift
// Source: padrão adaptado de reactnative.university/blog/live-activities-interactions
// (usa RCTEventEmitter clássico) — portado para Expo Modules API via OnCreate,
// já que o discussion #27468 do expo/expo não documenta um caminho oficial.
// modules/live-activity/ios/LiveActivityModule.swift
@available(iOS 16.2, *)
public class LiveActivityModule: Module {
  static weak var shared: LiveActivityModule?

  public func definition() -> ModuleDefinition {
    Name("LiveActivityModule")

    OnCreate {
      LiveActivityModule.shared = self
    }

    Events("onIntentAction")

    // ... AsyncFunctions já existentes (startActivity/updateActivity/endActivity/
    // isActivityRunning/reconcileOrphans) permanecem sem mudança
  }
}
```

### Pattern 3: "Pular descanso" reaproveita `activateSet`, não é uma ação nova de domínio

**What:** Não existe hoje uma ação de store chamada "skip rest" — o comportamento de pular o descanso já existe na UI (`SessionPlayer.tsx:294-300`, função `endRest(true)`) e é implementado chamando `activateSet(exercise.exerciseId, set.setOrder)` sobre a PRÓXIMA série pendente, que por sua vez zera `restEndsAt` (`activeSessionStore.ts:1097`, `set({ draft: { ...novo, restEndsAt: null } })`).

**When to use:** CMD-02 ("pular descanso"). O `SkipRestIntent.perform()` deve localizar a próxima série pendente (mesma lógica de `findNextPendingSet`, `sessionModel.ts:300`) e disparar essa MESMA chamada via o evento in-process — nunca duplicar a lógica de "o que é a próxima série" dentro do Swift.

**Example:**
```typescript
// src/native/liveActivityIntentBridge.ts (novo)
// Source: composição de padrões já existentes em activeSessionStore.ts e
// SessionPlayer.tsx:294-300 (lidos nesta sessão)
LiveActivityModule.addListener('onIntentAction', (event) => {
  const draft = useActiveSessionStore.getState().draft;
  if (!draft) return;

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
});
```

### Anti-Patterns to Avoid
- **Tentar abrir o app a partir de dentro de `perform()`:** Confirmado por DTS Engineer Apple (thread 812949) — impossível para `LiveActivityIntent`. Se um fallback "abre o app" for necessário (ex.: valor atípico fora do passo — REG-02, Fase 17, mas o mecanismo é o mesmo), use `Link`/`widgetURL()` no corpo do card, nunca dentro do intent.
- **Fazer chamada de rede síncrona ou trabalho pesado dentro de `perform()`:** Já vetado explicitamente em `REQUIREMENTS.md` ("Out of Scope: ações pesadas nos botões... `perform()` grava intenção local; processamento pesado é do app") e reforçado pela pesquisa do milestone (`research/FEATURES.md:51`) — `perform()` roda num contexto de execução em background com tempo/memória limitados.
- **Confiar só no evento in-process, sem a fila durável do App Group:** É exatamente o padrão que a blog da comunidade (`reactnative.university`) mostra funcionando bem no dia a dia e falhando silenciosamente no cold-launch — "funciona até não funcionar". A fila é o que garante o critério de sucesso 3.
- **Duplicar a lógica de "qual é a série atual" em Swift:** `findActiveSet`/`findNextPendingSet` (`sessionModel.ts:290-300`) já são a fonte de verdade; o Swift só precisa saber "o dono quer concluir a série atual" — a resolução de QUAL série é sempre JS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Emissão de evento nativo → JS | Um bridge RCTEventEmitter separado da Expo Modules API | `Events(...)` + `OnCreate` + referência estática (Pattern 2) | O projeto já usa Expo Modules API para tudo (`LiveActivityModule`, `NativeInfoModule`); misturar com o bridge legado do React Native antigo (`RCTEventEmitter`) introduziria duas formas concorrentes de comunicação nativa. |
| Fila durável de intenções | Um novo mecanismo de persistência (arquivo JSON próprio, SQLite) | `UserDefaults(suiteName:)` do App Group já provisionado (spike D-09, PASS) | Já é o canal comprovado neste time gratuito; introduzir outro mecanismo de storage compartilhado exige reprovar entitlements do zero. |
| Determinar "qual é a série atual" | Lógica duplicada em Swift dentro do Intent | `findActiveSet`/`findNextPendingSet` via o evento JS (Pattern 3) | Essas funções já encapsulam as regras de negócio (série ativa vs próxima pendente); reimplementar em Swift duplica uma fonte de verdade que já existe e já tem testes. |
| Ajuste de ±30s no timer de descanso | Recalcular o delta em Swift | `adjustRest(deltaSeconds)` → `ajustarRestEndsAt` (já existe, `sessionSummary.ts:79-87`) | Já trata o piso de 1s e o não-retorno ao passado; reescrever em Swift arrisca divergir do comportamento já testado (`ajustarDescanso`/`ajustarRestEndsAt`). |

**Key insight:** Toda a "inteligência de domínio" desta fase já existe em TypeScript, testada, com guardas de CAS/reentrância. O trabalho novo de Phase 16 é 100% "encanamento" — levar o toque do Lock Screen até essas funções já existentes e de volta, com um canal durável para quando o processo não estava vivo. Nenhuma regra de negócio nova precisa ser escrita.

## Common Pitfalls

### Pitfall 1: Duplicação de arquivo entre os dois targets é frágil a divergência silenciosa
**What goes wrong:** O padrão já estabelecido no repo (`SessionActivityAttributes.swift`) exige que o MESMO conteúdo exista fisicamente em dois arquivos — `targets/session-widget/SessionActivityAttributes.swift` e `modules/live-activity/ios/SessionActivityAttributes.swift`. `[VERIFIED: targets/session-widget/SessionActivityAttributes.swift:1-28 e modules/live-activity/ios/SessionActivityAttributes.swift:1-28]` — os dois arquivos lidos nesta sessão têm conteúdo byte-a-byte idêntico (29 linhas, mesmo `ContentState` com `phase`/`exerciseName`/`setIndex`/`setTotal`/`targetRepsMin`/`targetRepsMax`/`targetLoadKg`/`isBodyweight`/`restEndsAt`/`blockLabel`/`blockIndex`/`blockTotal`, e `sessionLogId` em `SessionActivityAttributes`). Os três Intents novos precisam do MESMO tratamento — sem um mecanismo automático de sincronia, um editor que altera só uma cópia quebra a compilação de um dos dois targets sem aviso até o próximo `prebuild`/build.
**Why it happens:** `@bacons/apple-targets` não expõe (não investigado a fundo nesta pesquisa se existe) uma forma de apontar o mesmo arquivo físico para dois targets do Xcode gerado — o padrão observado no repo é duplicação manual.
**How to avoid:** Manter os arquivos dos três Intents literalmente idênticos entre os dois diretórios (aceitar a duplicação, seguindo o precedente já em produção) e adicionar ao `scripts/verify-native-skeleton.sh` (já existe, checagem `(e)` de módulos locais, `14-SPIKE-APP-GROUPS.md:46`) uma comparação de hash/diff entre os pares de arquivos duplicados.
**Warning signs:** Build falha só num dos dois targets; comportamento do botão diverge do que a extensão mostra.

### Pitfall 2: `perform()` não pode abrir o app — o critério de sucesso 3 precisa de DOIS mecanismos, não um fallback dentro do botão
**What goes wrong:** É tentador tentar fazer o próprio `CompleteSetIntent` "abrir o app se `perform()` não conseguir completar" — impossível por design.
**Why it happens:** A intuição de "app não aberto → abrir o app como fallback" é natural, mas `LiveActivityIntent` roda deliberadamente sem UI em primeiro plano (confirmação DTS explícita: `"A LiveActivityIntent is designed for background execution... without necessarily bringing the app to the foreground or displaying its UI"`).
**How to avoid:** Separar os dois caminhos fisicamente: o botão "concluir série" nunca abre o app; o toque no CORPO do card (fora dos botões) usa `widgetURL()`/`Link` para abrir o app quando o dono quiser fazer isso manualmente. O "app reaberto para concluir" do critério de sucesso 3 é sempre uma ação EXPLÍCITA do dono tocando fora do botão — nunca automática dentro do `perform()`.
**Warning signs:** Tentativa de retornar algum `IntentResult` que "navega" ou "abre" a partir de um `LiveActivityIntent` — não existe essa API.

### Pitfall 3: Evento in-process emitido antes do listener JS existir se perde silenciosamente
**What goes wrong:** No cold-launch, o processo é relançado para rodar `perform()`, mas a bridge Hermes/RN pode não ter terminado de inicializar (e o `useEffect` que assina `onIntentAction` em `App.tsx` pode nunca chegar a rodar antes do processo ser suspenso de novo). O `sendEvent` chamado no passo 3 do Pattern 1 nesse caso não tem efeito nenhum — não há erro, não há retry.
**Why it happens:** Nem a documentação da Apple nem a da Expo garantem uma janela mínima de execução para `perform()` continuar vivo até a bridge JS estar pronta — é o próprio gap identificado (e ainda não resolvido) pela pesquisa do milestone (`research/SUMMARY.md`: "Cold-launch `perform()` reliability... valide empiricamente... com um cenário de teste deliberado 'force-quit, then tap'").
**How to avoid:** A fila durável do App Group (passo 1 do Pattern 1) é o único mecanismo confiável — precisa ser escrita ANTES de tentar o evento in-process, e precisa ser drenada por uma reconciliação explícita (`reconcileLiveActivityIntents()`, análoga a `reconcileOrphanActivities` já existente em `App.tsx`) na próxima vez que o app abrir em foreground.
**Warning signs:** Toque no botão "funciona" quando o app está aberto mas "não faz nada" depois de um force-quit real — exatamente o cenário do critério de sucesso 3.

### Pitfall 4: Toque duplo/rápido no botão da Live Activity pode contornar o próprio App Intent
**What goes wrong:** Há relatos (fórum Apple, thread 739243, "WidgetKit: Interactive widget rapid tap bypasses app intent") de que toques muito rápidos em um botão de widget interativo podem abrir o app diretamente em vez de rodar o `perform()`.
**Why it happens:** Comportamento de debounce do próprio WidgetKit, não documentado a fundo pela Apple.
**How to avoid:** Este projeto já tem defesa suficiente do lado JS — `completeSet` já é idempotente por `status === 'done'` (`activeSessionStore.ts:1220`, `// Já concluída → idempotente, não regrava (F2).`) e já tem uma trava de reentrância por `(sessionLogId, plannedSetId)` (`inFlight`, linhas 1222-1228). Se o toque duplo cair no caminho "abre o app" em vez de `perform()`, o app abre com o estado real do store — nenhuma dupla gravação é possível.
**Warning signs:** Não crítico dado o idempotency já existente — registrar como observação, não como bloqueador.

### Pitfall 5: `LiveActivityIntent` silenciosamente não dispara se o tipo conformar só a `AppIntent` genérico
**What goes wrong:** Bug documentado em beta do iOS 18 (thread 760342) — com `openAppWhenRun = false` num `AppIntent` (não `LiveActivityIntent`), `perform()` nunca era chamado.
**Why it happens:** `openAppWhenRun` é propriedade do protocolo `AppIntent` genérico; `LiveActivityIntent` tem semântica diferente e não deve usar essa propriedade.
**How to avoid:** Os três structs (`CompleteSetIntent`, `SkipRestIntent`, `AdjustRestIntent`) devem conformar EXPLICITAMENTE a `LiveActivityIntent` (não `AppIntent`), sem declarar `openAppWhenRun`. Testar explicitamente no aparelho físico do dono (iOS 26.x) — o bug era de beta do iOS 18 e pode já estar corrigido, mas a UAT física da fase (critério de sucesso 1 e 2) já cobre esse caso na prática.
**Warning signs:** Botão visível, toque não gera nenhum efeito nem no app nem no card — sem erro no console/Xcode.

## Code Examples

### Botão interativo na Live Activity com ajuste de descanso parametrizado
```swift
// Source: padrão consolidado a partir de múltiplas threads do Apple Developer
// Forums (interatividade Live Activity iOS 17+) + estrutura de estado já
// existente em targets/session-widget/WidgetLiveActivity.swift (lido nesta sessão)
struct AdjustRestIntent: LiveActivityIntent {
    static var title: LocalizedStringResource { "Ajustar descanso" }

    @Parameter(title: "Delta em segundos")
    var deltaSeconds: Int

    init() {}
    init(deltaSeconds: Int) {
        self.deltaSeconds = deltaSeconds
    }

    func perform() async throws -> some IntentResult {
        IntentActionQueue.enqueue(.adjustRest(deltaSeconds: deltaSeconds))
        LiveActivityModule.shared?.sendEvent("onIntentAction", [
            "kind": "adjustRest",
            "deltaSeconds": deltaSeconds,
        ])
        return .result()
    }
}

// No WidgetLiveActivity.swift (dentro de lockScreenBody, fase .resting):
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

### Reabertura do app a partir do corpo do card (não do botão)
```swift
// Source: developer.apple.com/forums/thread/812949 (confirmação DTS de que
// widgetURL()/Link, não o intent, é o caminho correto)
// targets/session-widget/WidgetLiveActivity.swift
lockScreenBody(context.state)
    .padding()
    .activityBackgroundTint(activityBackground)
    .widgetURL(URL(string: "forcaapp://session/active"))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Live Activity somente "toque abre o app" (sem interatividade) | `Button(intent:)`/`Toggle(isOn:intent:)` com `LiveActivityIntent` | iOS 17 (2023) | É a mudança que torna CMD-01/CMD-02 possíveis sem abrir o app — já era a premissa da pesquisa do milestone, agora reconfirmada. |
| `AppIntent` genérico para qualquer ação de widget | `LiveActivityIntent` especificamente para ações DENTRO de uma Live Activity já ativa | Introduzido junto com iOS 17, mas bugs de compatibilidade relatados até betas de iOS 18 (thread 760342) | Reforça: usar `LiveActivityIntent`, nunca `AppIntent` genérico, para os três intents desta fase. |

**Deprecated/outdated:** Nenhum — este é território relativamente novo (iOS 17+, 2023 em diante); não há uma geração anterior de API a evitar, só a confusão comum entre `AppIntent` genérico e `LiveActivityIntent`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | O cold-launch relança o processo do app por tempo suficiente para `perform()` completar a escrita na fila do App Group, mesmo que a bridge RN não suba a tempo. | Pattern 1, Pitfall 3 | Se a janela for curta demais até para a escrita síncrona no App Group, nem a fila durável sobrevive — critério de sucesso 3 falharia mesmo com a arquitetura de fallback. Só o spike no aparelho físico (parte desta fase, critério de sucesso 3) resolve; nenhuma fonte documental encontrada garante um tempo mínimo. |
| A2 | `@bacons/apple-targets` não oferece um jeito de compartilhar um único arquivo físico entre os dois targets (app + extensão) sem duplicação manual. | Pitfall 1, Alternatives Considered | Se existir suporte não descoberto nesta pesquisa, a duplicação manual proposta é desnecessária e introduz risco de divergência evitável — vale uma checagem rápida da doc do `@bacons/apple-targets` (não vasculhada a fundo nesta sessão) antes de implementar. |
| A3 | O comportamento de "toque rápido contorna o intent" (thread 739243) se aplica igualmente a Live Activities interativas (não só a widgets de tela de início, que é o contexto original do relato). | Pitfall 4 | Se NÃO se aplicar a Live Activities, a mitigação (idempotência já existente) continua válida de qualquer forma — risco baixo mesmo se a premissa estiver errada. |

## Open Questions

1. **Quantos botões cabem visualmente no card do Lock Screen durante `.resting` (−30s / Pular / +30s) sem violar o espaço apertado que a Fase 15 (D-01/D-02) já desenhou?**
   - What we know: A Fase 15 já fixou layouts distintos por fase (`measuring` vs `resting`) e uma prioridade de "tempo" nas apresentações espremidas (D-02). O card de Lock Screen tem uma área de conteúdo limitada.
   - What's unclear: Se três botões lado a lado cabem sem cortar texto/ficar apertado — decisão visual, não arquitetural.
   - Recommendation: Rodar `/gsd-ui-phase 16` (mesmo padrão que a Fase 15 usou) antes ou junto do planejamento, ou decidir isso como discretion do planner com validação na UAT física (critério de sucesso 2 já exige "sem lag perceptível", a mesma sessão física pode validar layout).

2. **A Fase 15 está com status `blocked` (5 gaps de verificação em `liveActivitySync.ts`/`WidgetLiveActivity.swift`, `15-VERIFICATION.md`) — isso bloqueia o início do trabalho de código da Fase 16?**
   - What we know: `STATE.md` marca `current_phase: 15`, `status: blocked`, com `next_action: "/gsd-plan-phase 15 --gaps"` explícito no `15-VERIFICATION.md`. Os 5 gaps são: (1) card não transiciona `resting`→`readyOvertime` sozinho quando o timer zera sem interação; (2) `overtimeText` não é recalculado periodicamente (falta `TimelineView`); (3) falta fallback de `startLiveActivity` quando `updateActivity` retorna `false` após o timeout de inatividade; (4) `App.tsx` importa `liveActivitySync` sem guarda de plataforma, quebrando Android/web; (5) o timeout de inatividade de 3h reinicia em qualquer edição de rascunho, não só em série concluída.
   - What's unclear: Nenhum dos 5 gaps toca diretamente os arquivos que a Fase 16 vai criar (`CompleteSetIntent.swift` etc.), mas o gap (4) — guarda de plataforma ausente em `App.tsx` — afeta o MESMO arquivo onde a Fase 16 precisa registrar o listener de `onIntentAction`, e o gap (5) — timeout de inatividade contaminado por qualquer `publishUpdate` — pode interagir com os novos updates otimistas que `perform()` dispara.
   - Recommendation: Este item pertence à governança do projeto, não à pesquisa técnica — mas o plano da Fase 16 deve, no mínimo, decidir explicitamente se corrige o gap (4) como pré-requisito (ele toca o mesmo arquivo que a Fase 16 edita) ou se herda a mudança de uma Fase 15 corrigida antes. Não presumir que "está resolvido" sem checar `15-VERIFICATION.md` de novo no momento do planejamento.

3. **Existe uma forma suportada de compartilhar (não duplicar) um arquivo Swift entre dois targets do `@bacons/apple-targets`?**
   - What we know: O padrão observado no repo é duplicação manual (`SessionActivityAttributes.swift` em dois lugares).
   - What's unclear: Não pesquisado a fundo nesta sessão — fora do escopo temporal desta pesquisa.
   - Recommendation: Checagem rápida e barata durante o planejamento/implementação (5 minutos na doc do `@bacons/apple-targets`); não bloqueia a decisão de seguir com duplicação manual como caminho padrão, já provado em produção.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | Compilar os 3 novos Intents + rebuild dos dois targets | ✓ | 26.6, licenciado nesta máquina | — |
| iPhone 13 físico do dono | UAT dos critérios de sucesso 1, 2 e 3 (App Intents em Live Activity não são testáveis em simulador) | ✓ (só na posse do dono, não desta máquina) | iOS 26.x (conforme `REQUIREMENTS.md:6`) | Nenhum — simulador não valida App Intents em Live Activity; é o único caminho de aceitação. |
| App Group `group.com.pmarconato.forcaapp.shared` | Fila durável para cold-launch (Pattern 1, Pitfall 3) | ✓ | Já provisionado e comprovado PASS (spike D-09, Fase 14) | — |
| `scripts/resign.sh` / `npm run resign` | Empacotar o build Release com os novos Intents para instalar no aparelho | ✓ (validado na Fase 14, 8/8 passos) | — | — |

**Missing dependencies with no fallback:** Nenhum bloqueador de ambiente identificado — toda a infraestrutura (App Group, deployment target, Xcode, rotina de resign) já foi provisionada e comprovada nas Fases 14/15.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 (config inline em `package.json`, chave `"jest"`) |
| Config file | `package.json` (chave `jest`) — não há `jest.config.*` separado |
| Quick run command | `npx jest __tests__/liveActivitySync.test.ts` (ou o novo arquivo equivalente) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| CMD-01 | Evento `onIntentAction` com `kind: 'completeSet'` chama `activeSessionStore.completeSet(exerciseId, setOrder)` com o par correto resolvido de `findActiveSet`/`findNextPendingSet` | unit | `npx jest __tests__/liveActivityIntentBridge.test.ts` | ❌ Wave 0 |
| CMD-01 | `completeSet` chamado via bridge de intent permanece idempotente (segunda invocação com série já `done` não regrava) | unit | `npx jest __tests__/liveActivityIntentBridge.test.ts -t idempot` | ❌ Wave 0 (reaproveita fixture de `activeSessionStore.test.ts`, que já cobre F2) |
| CMD-02 | Evento `kind: 'adjustRest'` chama `adjustRest(deltaSeconds)` com o delta exato recebido | unit | `npx jest __tests__/liveActivityIntentBridge.test.ts -t adjustRest` | ❌ Wave 0 |
| CMD-02 | Evento `kind: 'skipRest'` chama `activateSet` sobre a próxima série pendente (não a série ativa) | unit | `npx jest __tests__/liveActivityIntentBridge.test.ts -t skipRest` | ❌ Wave 0 |
| CMD-01, CMD-02 | Fila do App Group drenada e reconciliada no boot (`reconcileLiveActivityIntents`), espelhando `reconcileOrphanActivities` já existente | unit/integration | `npx jest __tests__/liveActivityIntentQueue.test.ts` | ❌ Wave 0 |
| CMD-01, CMD-02 (critérios de sucesso 1-3) | Comportamento físico do botão (registro real, timer refletindo ajuste, comportamento no force-quit) | manual (UAT física do dono) | — | N/A — não automatizável (App Intents em Live Activity não rodam em simulador/CI) |

### Sampling Rate
- **Per task commit:** `npx jest <arquivo tocado>`
- **Per wave merge:** `npm test`
- **Phase gate:** Suíte completa verde + as 3 UATs físicas explícitas do ROADMAP antes de `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `__tests__/liveActivityIntentBridge.test.ts` — cobre CMD-01/CMD-02 (mapeamento evento→ação de store)
- [ ] `__tests__/liveActivityIntentQueue.test.ts` — cobre a fila durável do App Group e a reconciliação no boot
- [ ] Nenhum framework novo necessário — Jest 29.7.0 já cobre TypeScript/JS; os arquivos Swift novos (`CompleteSetIntent.swift` etc.) não têm suíte de teste nativa no projeto (consistente com o padrão já estabelecido: `LiveActivityModule.swift` também não tem testes XCTest, só o lado JS é testado, e o lado nativo é validado por UAT física)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não | Fora de escopo — `perform()` não autentica, só grava intenção local; a autenticação já acontece no caminho existente `completeSet()` → outbox → backend (Supabase Auth), inalterado por esta fase. |
| V3 Session Management | não | Idem — nenhuma sessão nova é criada; a fase só encaminha eventos para a sessão de treino JÁ ativa no `activeSessionStore`. |
| V4 Access Control | sim (indireto) | O App Group é local ao dispositivo do próprio dono (app pessoal, sideload, sem distribuição) — não há superfície de acesso entre usuários distintos. Nenhum controle novo necessário; o RLS do backend (fora do escopo desta fase) já é o ponto de controle real. |
| V5 Input Validation | sim | `AdjustRestIntent.deltaSeconds` (parâmetro vindo de um `LiveActivityIntent`, portanto de input do sistema, não de rede) deve ser validado com os MESMOS limites já aplicados em `ajustarRestEndsAt` (piso de 1s, `sessionSummary.ts:85`) antes de qualquer gravação — reaproveitar a função existente cobre isso automaticamente, sem validação nova. |
| V6 Cryptography | não | Nenhum dado sensível novo é armazenado — a fila do App Group grava apenas `kind`/`deltaSeconds` (metadados de intenção local), nunca reps/carga/identidade. |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Intenção duplicada por toque duplo/reentrância no botão do Lock Screen | Tampering (dado duplicado) | Já mitigado pela guarda de reentrância existente em `completeSet` (`inFlight` por `(sessionLogId, plannedSetId)`, `activeSessionStore.ts:1222-1228`) — nenhuma mitigação nova necessária, só confirmar que o novo call site passa pelo MESMO `completeSet`, nunca por um caminho paralelo. |
| Fila do App Group crescendo sem limite se o app nunca reabrir | Denial of Service (local, ao próprio dono) | Cap explícito no tamanho da fila (ex.: manter só a última intenção pendente por tipo, já que "concluir série" é idempotente e "ajustar descanso" é cumulativo por delta) — decisão de implementação, não achado de pesquisa. |
| Reconciliação da fila do App Group aplicando uma intenção contra a sessão ERRADA (dono trocou de treino entre o tap e a reabertura) | Tampering (estado inconsistente) | Mesma guarda de CAS já usada em todo o resto de `activeSessionStore.ts` (verificar `sessionLogId` antes de aplicar) — `reconcileLiveActivityIntents()` deve seguir o mesmo padrão de `reconcileOrphanActivities`, que já descarta reconciliação se a sessão mudou. |

## Sources

### Primary (MEDIUM confidence — cross-verificado)
- Apple Developer Forums, thread 812949 ("Can LiveActivityIntent open the app...") — resposta literal de DTS Engineer Albert Pascual: `LiveActivityIntent` não pode abrir o app; `Link`/`widgetURL()` é o caminho correto.
- Apple Developer Forums, thread 735382 ("Can Live Activities be updated via `activity.update` in extensions?") — confirma que o intent precisa estar no bundle do APP (não só da extensão) para `perform()` rodar no processo do app e `Activity.update()` funcionar.
- reactnative.university/blog/live-activities-interactions — padrão de emissão de evento estático a partir de um `LiveActivityIntent` (adaptado de RCTEventEmitter clássico para Expo Modules API nesta pesquisa).
- GitHub `expo/expo` Discussion #27468 — confirma que a Expo Modules API não documenta oficialmente acesso à instância do módulo fora da própria classe (sem resposta oficial da equipe Expo).

### Secondary (LOW→MEDIUM confidence — fórum/comunidade, não cross-verificado ou parcialmente)
- Apple Developer Forums, thread 760342 ("Interactive Live Activity Bug in iOS 18 - perform not called") — bug de beta ligado a `openAppWhenRun`/conformidade a `LiveActivityIntent`.
- Apple Developer Forums, thread 739243 ("WidgetKit: Interactive widget rapid tap bypasses app intent") — relato de toque rápido contornando o intent (contexto original: widget de tela de início, não confirmado para Live Activity).
- Expo Docs — docs.expo.dev/modules/module-api (`Name`, `Events`, `OnCreate`, `OnStartObserving`, `AsyncFunction` etc.) — conteúdo confirmado via fetch, mas sem citação literal de trecho.

### Tertiary (herdado da pesquisa do milestone — já MEDIUM/HIGH por fase anterior, reutilizado aqui)
- `.planning/research/ARCHITECTURE.md` (Fase 14, pesquisa do milestone) — Pattern 1 ("App Intent perform() runs in-process; App Group queue is the durable channel, not the only channel") é a base arquitetural desta fase; esta pesquisa reforça essa premissa com fonte nova, não a contradiz.
- `.planning/research/PITFALLS.md`, `.planning/research/STACK.md`, `.planning/research/SUMMARY.md` (Fase 14) — riscos e stack já arbitrados no nível do milestone.
- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` — resultado físico do spike de App Group (PASS nas duas direções, iPhone 13 do dono).

### Código-fonte lido nesta sessão (verificação direta, não fonte externa)
- `src/store/activeSessionStore.ts` (linhas 1085-1350 aprox.) — `completeSet`, `adjustRest`, `activateSet`.
- `src/engine/sessionModel.ts` (`findActiveSet`, `findNextPendingSet` — via grep, linhas 290/300).
- `src/engine/sessionSummary.ts:60-87` — `ajustarDescanso`, `ajustarRestEndsAt`.
- `src/engine/liveActivityContentState.ts` — `buildLiveActivityContentState`.
- `src/native/liveActivitySync.ts` — sync JS→ActivityKit já existente (Fase 15).
- `src/components/session/SessionPlayer.tsx` (linhas 270-334, 401-411) — `endRest`, `ajustarRest`, `onConcluir`.
- `modules/live-activity/index.ts`, `modules/live-activity/ios/LiveActivityModule.swift`, `modules/live-activity/ios/SessionActivityAttributes.swift`.
- `targets/session-widget/WidgetLiveActivity.swift`, `AppIntent.swift`, `widgets.swift`, `index.swift`, `expo-target.config.js`, `SessionActivityAttributes.swift`.
- `app.json` (bloco `plugins` / `expo-build-properties` / `ios`).
- `.planning/phases/15-tela-bloqueada-ver-e-cronometrar/15-VERIFICATION.md` — 5 gaps de verificação, status `gaps_found`.
- `.planning/phases/14-funda-o-nativa/14-06-PLAN.md`, `14-06-SUMMARY.md` — evidência literal do spike de App Group.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — frameworks do sistema já fixados desde a Fase 14/15, deployment target já conferido em arquivo lido nesta sessão, nenhum pacote novo.
- Architecture: MEDIUM — o modelo de processo de `perform()` está cross-verificado por fonte Apple direta (DTS), mas o comportamento no cold-launch específico deste app (RN/Hermes) segue sem confirmação documental — é o próprio objeto do critério de sucesso 3.
- Pitfalls: MEDIUM — pitfalls 1, 2, 3, 5 têm base documental sólida; pitfall 4 é um relato de fórum não cross-verificado para o contexto específico de Live Activity (registrado como tal).

**Research date:** 2026-08-17
**Valid until:** 30 dias (~2026-09-16) — domínio relativamente estável (App Intents/ActivityKit têm cadência anual de mudança via WWDC), mas o aparelho já roda iOS 26.x; reconferir se uma atualização de iOS ocorrer entre a pesquisa e a implementação.
