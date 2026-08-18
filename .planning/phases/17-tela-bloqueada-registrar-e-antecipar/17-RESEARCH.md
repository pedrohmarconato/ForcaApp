# Phase 17: Tela bloqueada — registrar e antecipar - Research

**Researched:** 2026-08-18
**Domain:** ActivityKit interativa (App Intents com `@Parameter`, Lock Screen sem Dynamic Island) + histórico de reps no app RN/Expo já existente
**Confidence:** MEDIUM — o app RN é HIGH (código lido linha a linha nesta sessão); a camada ActivityKit é MEDIUM porque nenhuma fonte oficial da Apple documenta explicitamente o comportamento sob toque rápido nem o orçamento de `Activity.update()` — os dois maiores riscos desta fase só o UAT físico resolve.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pré-preenchimento: de onde vem o número**
- **D-01:** A fonte das reps é híbrida: últimas reps reais do exercício quando existem, alvo do plano (`targetRepsMin`) na estreia. Exige criar um mapa `lastRepsByExercise` — hoje não existe nada de histórico de reps no repositório (zero ocorrências de `lastReps`); só carga tem (`lastLoadByExercise`, `sessionModel.ts:148`). Reversibility: costly.
- **D-02:** O histórico guarda um número por exercício — o mais recente por `completed_at` —, espelhando exatamente o formato e a chave (`exerciseIdentity`) que `lastLoadByExercise` já usa (`activeSessionStore.ts:427-502`). Descartado: mapa por ordem de série.
- **D-03:** O valor herdado nasce marcado visualmente (tratamento distinto do valor digitado, no espírito da linha "Última carga" de `SessionPlayer.tsx:642`) e vira firme no primeiro `+/−`. A marca é só apresentação: nada muda no banco.
- **D-04:** Na estreia de um exercício com carga — sem histórico e sem `target_load_kg`, caso em que `suggestLoad()` devolve `null` (`sessionModel.ts:222`) — o campo fica vazio e o teclado numérico abre por conta própria.

**O teclado no app**
- **D-05:** No fluxo padrão o número deixa de ser editável: vira texto entre os botões `−/+`. O teclado só aparece por gesto deliberado e no caso da D-04. Vale igualmente no PWA web, que herda o componente RN. Reversibility: costly.
- **D-06:** Em exercício `carga_reps`, o botão "Iniciar série" some quando o pré-preenchimento já passa em `canCompleteSet()` — o card nasce com os campos revelados e o único toque é "Concluir série". Exercício por tempo/distância não muda. Reversibility: costly.
- **D-07:** O RIR opcional ("Quantas ainda aguentaria?", 5 chips, `SessionPlayer.tsx:745`) fica onde está.
- **D-08:** Dentro da mesma sessão, a série seguinte reusa `suggestLoad()` para carga — precedência inalterada: adaptação intra-sessão > alvo do plano > histórico. Reps seguem o mesmo desenho. A Fase 17 não cria regra concorrente com o motor de adaptação (`intraSessionAdaptation.ts:426`).

**Registro pela tela bloqueada (REG-02)**
- **D-09:** A tela bloqueada ajusta reps e carga, dois pares de `−/+` mais o botão de concluir — fiel à letra de REG-02. Consequência aceita: card denso, alvos de toque encolhem; legibilidade e tamanho são critério de aprovação no UAT físico.
- **D-10:** A store acumula, por delta. Cada toque manda um incremento (`+1 passo`) e a store aplica sobre o valor corrente — o molde do `AdjustRestIntent(deltaSeconds:)` já validado no aparelho na Fase 16. O widget nunca guarda valor nem manda absoluto.
- **D-11:** O card mostra o valor em edição, com a mesma marca de herdado da D-03 — leitura idêntica no app e na tela bloqueada. Reversibility: costly — o `ContentState` ganha campos de valor em edição e o sinalizador de origem, e `SessionActivityAttributes.swift` é duplicado entre `targets/session-widget/` e `modules/live-activity/ios/`: as duas cópias precisam continuar idênticas, e mexer no contrato depois exige encerrar e recriar Activities vivas.
- **D-12:** Valor fora do passo (37,5 kg com passo 5): um botão explícito "abrir para ajustar" no card (`openAppWhenRun`), sempre disponível. Os `−/+` continuam preservando o offset (`stepLoad()` já faz isso hoje, `sessionModel.ts:247`). Não implementar snapping a múltiplos do passo. **Nota de divergência do dono:** o critério 3 do ROADMAP fala em "abre o app em vez de travar ou truncar", mas o stepper do app nunca travou nem truncou — esta decisão cumpre o critério sem inventar restrição nova.

**Antecipação da próxima ação (PRED-01)**
- **D-13:** A linha "A seguir" aparece durante o descanso inteiro, publicada no mesmo `Activity.update()` que já acontece ao concluir a série. Não depende de update agendado nem do app acordar no meio do descanso.
- **D-14:** O conteúdo é exercício, série X/Y e o valor que vai nascer pré-preenchido (mesmo `suggestLoad()` da D-08) — não o da prescrição do papel.
- **D-15:** Rótulo único ("A SEGUIR") em todos os casos, com destaque na virada de exercício.
- **D-16:** Dentro de bloco de cardio/alongamento o card segue reduzido (D-03 da Fase 15) — sem linha "A seguir". Mas a virada de musculação para o bloco é anunciada ("A seguir: Alongamento").

### Claude's Discretion
- Layout exato do card da tela bloqueada com os dois pares de `−/+` — dentro do que a Fase 15 já estabeleceu (D-01: descansando, o timer é o elemento grande).
- Gesto exato do escape para o teclado da D-05 (long-press no número × botão visível "digitar"). Ressalva: long-press é frágil no PWA web — se o gesto não for confiável nos dois canais, o botão visível é o caminho.
- Passo do stepper de reps. `REQUIREMENTS.md` sugere ±1; carga já tem `load_increment_kg` por exercício (default 2,5, `sessionModel.ts:441`) e não precisa de nada novo.
- Como a marca de "herdado" da D-03/D-11 é renderizada (opacidade, ícone, cor) no app e no widget — desde que a mesma leitura sirva nos dois.
- Estrutura dos arquivos Swift novos (`AdjustRepsIntent` / `AdjustLoadIntent`) seguindo o molde já existente do `AdjustRestIntent(deltaSeconds:)`, com o par stub-na-extensão + implementação-no-app.
- Comportamento em exercício de peso corporal (`isBodyweight`): não há carga a ajustar; o caminho natural é só o stepper de reps.
- O que o card mostra entre o toque e a store responder. Restrição: Live Activity é render sem estado local — feedback otimista dentro do widget não é opção real.
- Formato e número das sessões físicas com o iPhone. Herda a D-13 da Fase 15: roteiro auto-contido, parada da execução em checkpoint até o dono reportar. "Compilou" nunca é critério de conclusão.

### Deferred Ideas (OUT OF SCOPE)
- Carimbar no banco a origem do valor (herdado × ajustado) — exigiria migration; v1.3 não mexe em schema.
- Migrar o RIR para o card de descanso.
- Antecipação completa dentro do bloco de cardio/alongamento (próximo alongamento e tempo previsto).
- Rótulos distintos por caso na antecipação ("PRÓXIMA SÉRIE", "PRÓXIMO EXERCÍCIO", etc.).
- Prescrição do cardio na tela bloqueada — segue excluída pela D-03 da Fase 15.
- Som/vibração no fim do descanso e modo mãos-livres — deferidos para pós-v1.3.
- Dynamic Island compact/minimal/expanded — implementação preservada, UAT física deferida (sem hardware).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-01 | Reps e carga pré-preenchidos do histórico, ajuste só por +/−, confirmação em 1 toque, sem teclado no fluxo padrão | Seed query real localizada (`sessionExecutionRepository.ts:627-677`), padrão de mirror de `lastLoadByExercise` documentado com file:line, componente `SessionPlayer.tsx` mapeado campo a campo |
| REG-02 | Mesmo registro sem teclado na Live Activity, valor acumulado entre toques preservado, valor atípico abre o app | Pattern do intent `@Parameter` documentado com os dois arquivos lidos (stub + impl), risco de toque rápido levantado com fonte de fórum Apple, mecanismo real de abertura do app pesquisado e corrigido (não é `openAppWhenRun`) |
| PRED-01 | Antes do descanso acabar, a tela bloqueada já mostra a próxima série/exercício e a prescrição prevista | `liveActivityContentState.ts` lido por inteiro — hoje NÃO compõe nenhum campo de "próximo"; gap real documentado com o contrato exato a estender |
</phase_requirements>

## Summary

O app RN já tem tudo que REG-01 precisa, menos uma coisa: um histórico de reps. A carga já
funciona ponta a ponta — semeadura via `getLastLoadByExercise()` (que hoje seleciona só
`actual_load_kg, completed_at`, `sessionExecutionRepository.ts:636-643`), atualização a cada
`completeSet()` (`activeSessionStore.ts:1474-1477`) e stepper (`stepLoad()`,
`sessionModel.ts:247-255`). A coluna `actual_reps` **já existe** em `set_logs` e já é lida em
OUTRA query do mesmo arquivo (`sessionExecutionRepository.ts:805-806`) — logo, criar
`lastRepsByExercise` (D-01/D-02) é widening de SELECT, não migration; a restrição "v1.3 não
muda schema" está automaticamente respeitada. `SessionPlayer.tsx` também já tem 90% do desenho
visual pronto (stepper de carga, linha "Última carga", RIR chips) — D-05/D-06 exigem trocar
`TextInput` por texto estático mais um segundo stepper de reps, não reconstruir a tela.

Do lado nativo, a fundação de REG-02 (fila durável via App Group, `IntentActionQueue.swift`,
o roteamento de `perform()` para o processo do app) está pronta e testada desde a Fase 16 — os
dois novos intents (`AdjustRepsIntent`/`AdjustLoadIntent`) são cópias estruturais de
`AdjustRestIntent(deltaSeconds:)`, cujo par stub+impl foi lido nesta sessão nos dois targets.
O achado que muda o plano é outro: **`openAppWhenRun` não é o mecanismo certo para o botão
"abrir para ajustar" da D-12** — um engenheiro de DTS da Apple confirma por escrito que
`LiveActivityIntent` nunca abre o app; a abertura só acontece por `widgetURL`/`Link`, e o
`widgetURL` atual do widget (`forcaapp://session/active`,
`targets/session-widget/WidgetLiveActivity.swift:187`) **não corresponde a nenhuma rota
registrada** em `LINKING_CONFIG` (`src/navigation/linkingConfig.ts:63-99` define
`home/active-session/:sessionId`, não `session/active`) — hoje esse deep link é morto. E como
o Lock Screen (sem Dynamic Island, iPhone 13) só suporta UM tap-target de deep-link por
Activity, o "botão explícito" da D-12 provavelmente precisa reusar o `widgetURL` do card
inteiro, não um `Link` isolado ao lado dos steppers — isto é um achado de plataforma, não um
detalhe de layout, e precisa entrar no plano como restrição de design.

`liveActivityContentState.ts` (lido por inteiro) hoje só descreve o estado ATUAL — nenhum campo
de "próximo exercício/série" existe no `ContentState`. PRED-01 exige estender o contrato dos
dois `SessionActivityAttributes.swift` (confirmados byte-idênticos nesta sessão) com os campos
de antecipação, o que ativa a nota de migração da D-11: Activities já em curso no aparelho
precisam ser encerradas/recriadas quando o contrato mudar — não há atualização incremental de
schema em ActivityKit.

**Primary recommendation:** tratar REG-01 (widening de SELECT + espelho de `lastLoadByExercise`)
como o trabalho de baixo risco desta fase, e reservar tempo de UAT físico deliberado para os
três riscos de plataforma não documentados oficialmente pela Apple: toque rápido no stepper
(pode saltar para o app em vez de rodar o intent — bug de fórum sem resposta oficial), orçamento
de `Activity.update()` sob rajada de toques, e o mecanismo real do botão "abrir para ajustar" no
Lock Screen sem Dynamic Island.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pré-preenchimento de reps/carga (REG-01) | Browser/Client (RN app, também PWA) | Database/Storage (seed query) | A UI e a store já resolvem toda a lógica local; o banco só fornece o histórico via SELECT existente, sem RPC nova |
| Ajuste por stepper no app | Browser/Client | — | `SessionPlayer.tsx` + `activeSessionStore.ts`, sem I/O de rede síncrono (persistência é fire-and-forget local) |
| Ajuste por stepper na tela bloqueada (REG-02) | Browser/Client (processo do app, via `LiveActivityIntent`) | — | Apple roteia `perform()` de `LiveActivityIntent` para o processo do app (Pattern 1, Fase 16 RESEARCH.md) — não existe camada de servidor nem de extensão nesta escrita |
| Espelho visual da Live Activity | Browser/Client (`liveActivitySync.ts` como único escritor) | — | ActivityKit é puramente local (`pushType: .none`); nenhuma camada de backend participa |
| Antecipação "A seguir" (PRED-01) | Browser/Client (composição de UI a partir do `SessionDraft` já em memória) | — | Todo dado necessário (próxima série/exercício, `suggestLoad()`) já existe no store; é composição, não busca nova |
| Backend/Supabase | Fora do raio de alcance desta fase | — | Nenhuma rota, RPC ou migration nova — confirmado pela leitura de `sessionExecutionRepository.ts` |

## Standard Stack

Esta fase **não introduz nenhuma dependência nova**. Toda a superfície é código Swift local
(dois arquivos novos por convenção, seguindo o molde já existente) e TypeScript dentro do stack
já pinado do milestone.

| Peça | Versão confirmada | Fonte |
|------|--------------------|-------|
| Expo SDK | `^54.0.36` | `[VERIFIED: package.json]` |
| React Native | `0.81.5` | `[VERIFIED: package.json]` |
| TypeScript | `^5.2.2` | `[VERIFIED: package.json]` |
| Zustand | `^4.5.7` | `[VERIFIED: package.json]` |
| Jest | `^29.7.0` | `[VERIFIED: package.json]` |
| iOS deployment target | `17.0` | `[VERIFIED: app.json:51]` — `"deploymentTarget": "17.0"` |
| URL scheme do app | `forcaapp` | `[VERIFIED: app.json:56]` — `"scheme": "forcaapp"` |

Nenhuma tabela de "Alternativas Consideradas" ou instalação — não há pacote a escolher.

## Package Legitimacy Audit

**Não aplicável.** Esta fase não instala nenhum pacote novo (nem npm, nem CocoaPods/SPM) — os
únicos arquivos novos são Swift no molde já existente do repositório (`AdjustRepsIntent.swift`,
`AdjustLoadIntent.swift`, seguindo `AdjustRestIntent.swift`). O gate de legitimidade de pacotes
não se aplica.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────── APP (foreground) ───────────────────────────┐
│                                                                          │
│  SessionPlayer.tsx (stepper reps/carga)                                │
│        │ setReps()/setLoad()/stepReps()*/stepLoad()                    │
│        ▼                                                               │
│  activeSessionStore.ts (Zustand)                                       │
│        │ saveDraft() fire-and-forget          │ completeSet()          │
│        ▼                                       ▼                       │
│  sessionDraftStorage.ts (disco)         enqueueAndDrain() → outbox     │
│                                                 │                       │
│        └── lastLoadByExercise/lastRepsByExercise* atualizados ─────────┤
│                          │                                              │
│                          ▼                                              │
│              buildLiveActivityContentState()  (PRED-01 estende aqui)   │
│                          │                                              │
│                          ▼                                              │
│              liveActivitySync.ts (ÚNICO escritor ActivityKit)          │
│                          │ Activity<SessionActivityAttributes>.update()│
└──────────────────────────┼──────────────────────────────────────────────┘
                           ▼
              ╔═══════════ LOCK SCREEN (ActivityKit) ═══════════╗
              ║  WidgetLiveActivity.swift                        ║
              ║  Button(intent: AdjustRepsIntent(delta: ±1))*    ║
              ║  Button(intent: AdjustLoadIntent(delta: ±2.5))*  ║
              ║  Button(intent: CompleteSetIntent())             ║
              ║  widgetURL(...) → único tap-target de deep link  ║
              ╚════════════════════╤══════════════════════════════╝
                                    │ perform() roteado para o PROCESSO DO APP
                                    │ (Pattern 1, Fase 16 — fonte Apple DTS)
                                    ▼
                    IntentActionQueue.enqueue() (App Group, durável)
                                    │
                    ┌───────────────┴────────────────┐
                    ▼ (app em foreground, quente)     ▼ (cold-launch)
        sendEvent("onIntentAction")         peekIntentQueue() na retomada
                    │                                 │
                    ▼                                 ▼
        liveActivityIntentBridge.ts ─── (mesmo switch) ───┘
                    │
                    ▼
        ação já existente da store (stepReps*/stepLoad/completeSet)
        + ackQueuedLiveActivityIntent(id) — só depois do resultado real

* novo nesta fase — o resto já existe e funciona (Fases 15/16).
```

### Recommended Project Structure

Nenhum diretório novo — a fase estende arquivos existentes no molde já estabelecido:

```
src/engine/
├── sessionModel.ts              # + lastRepsByExercise no SessionDraft, suggestReps()
├── liveActivityContentState.ts  # + campos de "A seguir" no builder
src/store/
├── activeSessionStore.ts        # + stepReps(), seed de reps, atualização em completeSet()
src/services/
├── sessionExecutionRepository.ts # widen do SELECT de getLastLoadByExercise (ou nova getLastRepsByExercise)
src/components/session/
├── SessionPlayer.tsx             # texto não-editável + 2º stepper + marca "herdado"
targets/session-widget/
├── AdjustRepsIntent.swift        # NOVO — stub, molde de AdjustRestIntent.swift
├── AdjustLoadIntent.swift        # NOVO — stub
├── WidgetLiveActivity.swift      # + steppers reps/carga + botão "abrir para ajustar" + linha "A seguir"
├── SessionActivityAttributes.swift # + campos de valor em edição + campos de antecipação
modules/live-activity/ios/
├── AdjustRepsIntent.swift        # NOVO — impl real, molde de AdjustRestIntent.swift
├── AdjustLoadIntent.swift        # NOVO — impl real
├── IntentActionQueue.swift       # + kind .adjustReps/.adjustLoad no enum, + campo de delta genérico
├── SessionActivityAttributes.swift # cópia byte-idêntica da acima
```

### Pattern 1: Stepper por delta com fila durável (molde `AdjustRestIntent`)

**O que é:** um `LiveActivityIntent` com `@Parameter` que NUNCA lê nem escreve estado
diretamente — ele só enfileira a intenção (`IntentActionQueue.enqueue`) e dispara um evento
in-process para o app aplicar contra a store real.

**Quando usar:** todo ajuste por delta na tela bloqueada (reps, carga, descanso). É o único
padrão já validado no aparelho físico nesta arquitetura (Fase 16).

**Exemplo — stub na extensão** (`[VERIFIED: targets/session-widget/AdjustRestIntent.swift:1-24]`):
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

**Exemplo — implementação real no target do app**
(`[VERIFIED: modules/live-activity/ios/AdjustRestIntent.swift:1-41]`):
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

**AdjustRepsIntent/AdjustLoadIntent devem seguir exatamente este molde.** Duas ressalvas
concretas descobertas nesta sessão, não deduzidas:

1. `QueuedIntentAction` (`[VERIFIED: modules/live-activity/ios/IntentActionQueue.swift:15-40]`)
   hoje só tem `deltaSeconds: Int?` como campo de payload numérico — não existe campo genérico
   de "delta valor". `AdjustLoadIntent` precisa de um delta em **kg** (`Double`, já que
   `load_increment_kg` é fracionário, ex. 2,5) — `deltaSeconds: Int?` não serve para isso. O
   struct precisa de um novo campo (`deltaValue: Double?` ou equivalente) e o
   `QueuedIntentActionKind` (mesmo arquivo, linhas 5-9) precisa de dois casos novos:
   `.adjustReps` e `.adjustLoad`.
2. `IntentActionQueue.swift` **não é duplicado** entre os dois targets — só existe em
   `modules/live-activity/ios/` (`[VERIFIED: find output — arquivo ausente em
   targets/session-widget/]`), porque a extensão não linka `ExpoModulesCore`
   (comentário verbatim em `[VERIFIED: targets/session-widget/CompleteSetIntent.swift:8-10]`:
   "Esta cópia existe só para o `Button(intent: CompleteSetIntent())` do SwiftUI compilar no
   target da extensão, que não linka `ExpoModulesCore` e portanto não pode referenciar
   `IntentActionQueue`/`LiveActivityModule`."). Só `SessionActivityAttributes.swift` precisa
   das duas cópias.

### Pattern 2: Espelho único (`liveActivitySync.ts`) e ponte única (`liveActivityIntentBridge.ts`)

**O que é:** nenhum componente React fala com ActivityKit direto; toda escrita passa por
`liveActivitySync.ts`. Todo toque da tela bloqueada entra por um switch único
(`[VERIFIED: src/native/liveActivityIntentBridge.ts:22-48]`):
```typescript
switch (event.kind) {
  case 'completeSet': { /* findActiveSet/findNextPendingSet + completeSet() + ack */ }
  case 'skipRest': { /* findNextPendingSet + activateSet() + ack */ }
  case 'adjustRest': { /* adjustRest(event.deltaSeconds) + ack */ }
}
```
Os dois casos novos (`adjustReps`, `adjustLoad`) entram aqui no MESMO formato — resolvem a série
alvo com `findActiveSet(draft)` e chamam `stepReps()`/`stepLoad()` já existente (ou nova
`stepReps()` espelhando `stepLoad()`), seguido de `ackQueuedLiveActivityIntent(event.id)`.

O tipo `LiveActivityIntentActionEvent` (`[VERIFIED: modules/live-activity/index.ts:7-10]`)
precisa dos dois casos novos na união:
```typescript
export type LiveActivityIntentActionEvent =
  | { id: string; kind: 'completeSet' }
  | { id: string; kind: 'skipRest' }
  | { id: string; kind: 'adjustRest'; deltaSeconds: number }
  // novos:
  | { id: string; kind: 'adjustReps'; deltaReps: number }
  | { id: string; kind: 'adjustLoad'; deltaLoadKg: number };
```

### Pattern 3: Semeadura de histórico (o molde exato para `lastRepsByExercise`)

`getLastLoadByExercise` (`[VERIFIED: src/services/sessionExecutionRepository.ts:627-677]`)
é a função a espelhar. Query real:
```typescript
// [VERIFIED: src/services/sessionExecutionRepository.ts:633-650]
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
**Achado central para D-01/D-02:** esta query seleciona `actual_load_kg` — NÃO
`actual_reps`. Mas `actual_reps` **já é uma coluna existente** em `set_logs` — confirmado
porque OUTRA função no mesmo arquivo já a seleciona
(`[VERIFIED: src/services/sessionExecutionRepository.ts:805-806]`: `'actual_reps,
actual_load_kg, completed_at, session_logs!inner(user_id, finished_at), ...'`). Logo:
- `lastRepsByExercise` NÃO exige migration nem RPC nova — é widening do `.select(...)` desta
  query (ou uma função irmã `getLastRepsByExercise`), trocando `actual_load_kg` por
  `actual_reps, actual_load_kg` e `.not('actual_load_kg', ...)` por um filtro equivalente em
  `actual_reps` (ou ambos, se o objetivo for semear os dois mapas numa única viagem ao banco —
  mais barato que duas).
- O seed é consumido em `sessionModel.ts:429,481` (`lastLoadSeed` → `lastLoadByExercise`) e
  chamado por `seedLastLoads()` em `sessionModel.ts:358-373`, que já tem tratamento
  best-effort (falha não derruba o início da sessão) — o mesmo padrão vale para reps.
- A atualização por sessão corrente segue o padrão de
  `[VERIFIED: src/store/activeSessionStore.ts:1474-1477]`:
  ```typescript
  const lastLoad = { ...atual.lastLoadByExercise };
  if (actualLoadKg != null && !exercise.isBodyweight) {
    lastLoad[exerciseIdentity(exercise)] = actualLoadKg;
  }
  ```
  `lastRepsByExercise` espelha isto com `actualReps` (sem a checagem `isBodyweight`, já que
  peso corporal ainda tem reps).

### Anti-Patterns to Avoid

- **Escrever direto em ActivityKit de um componente novo:** a regra herdada continua —
  `liveActivitySync.ts` é o único escritor. Um `AdjustRepsIntent` que chamasse
  `Activity.update()` direto do `perform()` quebraria o princípio "Live Activity é espelho,
  nunca fonte de verdade" e criaria uma segunda fonte de verdade divergente da store.
- **Usar `openAppWhenRun` num `LiveActivityIntent`:** não existe — ver Pitfall 3 abaixo.
- **Presumir que `Link` dá um segundo tap-target no Lock Screen sem Dynamic Island:** ver
  Pitfall 3.
- **Persistir só em memória:** todo `stepReps()`/`stepLoad()` precisa do mesmo `saveDraft()`
  fire-and-forget que as outras 7 ações de série já fazem (regra estabelecida na 16-10,
  documentada em `activeSessionStore.ts:1275-1281`) — senão um force-quit no meio de um ajuste
  de reps perde o valor.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Comunicação Lock Screen → app | Novo canal de IPC/notificação | `IntentActionQueue` (App Group `UserDefaults`) + `sendEvent("onIntentAction")` já existente | Já resolve durabilidade (force-quit), dedup por id (16-05) e cold-launch (16-07); reinventar é regressão garantida |
| Histórico "última X por exercício" | Nova tabela/índice/RPC | Widening de `getLastLoadByExercise` (ou função irmã) sobre `set_logs` já existente | A coluna já existe, a query já existe, o padrão de fallback best-effort já existe |
| Contador regressivo no Lock Screen | Polling/timer JS acordando o app | `Text(timerInterval:)` nativo (já em uso, `WidgetLiveActivity.swift:63`, Fase 15) | Fora do escopo desta fase tocar, mas não recriar |
| Deep link Lock Screen → tela certa do app | Novo esquema de URL paralelo | `forcaapp://` + `LINKING_CONFIG` já registrado (`src/navigation/linkingConfig.ts`) | O scheme e o parser já existem; o bug real é que o `widgetURL` atual não bate com nenhuma rota — corrigir a URL, não inventar mecanismo |

**Key insight:** o repositório já tem TODOS os primitivos de que esta fase precisa (fila
durável, dedup, ack condicionado, deep link tipado, stepper de carga, seed de histórico) — o
trabalho real é *estender* três contratos (`SessionDraft`, `QueuedIntentAction`,
`SessionActivityAttributes.ContentState`) e *corrigir* um deep link morto, não desenhar
arquitetura nova.

## Common Pitfalls

### Pitfall 1: Toque rápido no stepper pode pular o `AppIntent` inteiro e abrir o app

**What goes wrong:** um relato não respondido no fórum de desenvolvedores Apple descreve
exatamente o cenário de D-10/critério 2 desta fase: "Rapidly tapping on a Button in an
interactive widget bypasses the button's AppIntent action, and launches the host app instead."
(`[CITED: developer.apple.com/forums/thread/739243]`, aberto 2023, **zero respostas, zero
confirmação oficial, radar sem retorno público**).

**Why it happens:** não documentado pela Apple. A hipótese mais provável (sem fonte oficial) é
que o sistema trata uma sequência de toques MUITO rápida no mesmo botão como um "toque
inválido" e cai no comportamento padrão de abrir o host app — mas isto é especulação, não
fato verificado.

**How to avoid:** não há mitigação documentada. O plano deve tratar isto como um cenário de
UAT físico OBRIGATÓRIO — o dono precisa tocar `+` quatro vezes em ~1 segundo no stepper de
carga/reps do Lock Screen e confirmar (a) que o app NÃO abre sozinho e (b) que o valor
acumulado bate com quatro incrementos, não menos. Se falhar, a mitigação prática (não
documentada pela Apple, mas comum na comunidade) é debounce visual client-side — mas como
`perform()` roda no processo do app e cada toque gera uma entrada NOVA na fila durável, um
debounce teria que viver dentro do próprio `perform()` (ex.: ignorar toques a menos de N ms do
anterior) — isto muda o desenho de "delta puro" da D-10 e precisa ser decidido só se o UAT
confirmar o problema.

**Warning signs:** no UAT físico, app abre sozinho durante uma sequência de toques rápidos, ou
o valor final no card não bate com a soma dos incrementos tocados.

### Pitfall 2: Orçamento de `Activity.update()` não é documentado numericamente pela Apple

**What goes wrong:** a Apple não publica um número fixo para quantos `Activity.update()` por
hora um app pode disparar antes de throttling (`[CITED: developer.apple.com — ActivityKit
notification budget]` — múltiplas fontes de terceiros confirmam que o "budget" existe para
**push updates** de prioridade alta, mas nenhuma fonte encontrada nesta sessão confirma se
updates **locais** (chamados de dentro do app em foreground, como é o caso aqui — `pushType:
.none`) estão sujeitos ao MESMO orçamento ou a um regime diferente/sem limite.

**Why it happens:** o mecanismo de throttling documentado pela Apple é desenhado para o caso de
**push remoto** (que esta fase explicitamente NÃO usa — Out of Scope). Cada toque de stepper
nesta fase dispara `IntentActionQueue.enqueue` → evento in-process → ação da store →
`liveActivitySync.ts` → `Activity.update()` local, com o app em FOREGROUND (Pattern 1: `perform()`
roda no processo do app). É plausível que updates locais com o app ativo não sofram o mesmo
throttling de push, mas isto é **inferência, não fato verificado** — nenhuma fonte oficial
líquida encontrada nesta sessão confirma isso explicitamente para o caso local.

**How to avoid:** o plano NÃO deve presumir um número. Deve incluir debounce/coalescing como
opção de design em `liveActivitySync.ts` SE o UAT físico revelar updates perdidos ou atrasados
sob toque rápido — mas não implementar isso preventivamente sem evidência de que o problema
existe (o app já sobrevive a rajadas de toque no descanso desde a Fase 16, com o mesmo
`AdjustRestIntent`; reps/carga apenas dobram a frequência potencial de toque).

**Warning signs:** no UAT, o card do Lock Screen "atrasa" visualmente em relação aos toques, ou
para de atualizar depois de uma sequência longa de ajustes.

### Pitfall 3: `openAppWhenRun` não existe para `LiveActivityIntent` — e o Lock Screen só tem UM tap-target de deep link

**What goes wrong:** D-12 nomeia `openAppWhenRun` como o mecanismo do botão "abrir para
ajustar". Isto está **incorreto tecnicamente** — não muda a decisão do dono (ter um botão
explícito), mas muda como ela precisa ser implementada.

**Why it happens:** `openAppWhenRun` é uma propriedade estática de `AppIntent` genérico —
não existe para `LiveActivityIntent`. Confirmado por um engenheiro de Apple Developer
Technical Support (DTS), Albert Pascual, num tópico do fórum oficial dedicado exatamente a
esta pergunta (`[CITED: developer.apple.com/forums/thread/812949]`):
> "It is not possible to open an app using a LiveActivity. A LiveActivityIntent is designed
> for background execution. Its purpose is to perform a specific action within your app's
> process without necessarily bringing the app to the foreground or displaying its UI."
>
> "If every tap on a LiveActivity button brought the app to the foreground, it could lead to
> a disruptive user experience." — comportamento intencional, não bug.

O mesmo engenheiro recomenda **Universal Links** para abrir o app a partir de um botão de Live
Activity; um segundo engenheiro DTS (Ziqiao Chen) no mesmo tópico sugere `Link`/`widgetURL`.
Um usuário do tópico relata que `Link` funciona na visão expandida da Dynamic Island mas tem
limitações no Lock Screen "devido a comportamento de segurança" — sem detalhe adicional
verificável nesta sessão.

A documentação oficial de `widgetURL(_:)` (via busca) confirma que ele cobre Lock Screen +
compact leading/trailing + minimal, enquanto `Link` é oferecido como opção adicional só na
"expanded presentation" — que **este device (iPhone 13) não tem** (sem Dynamic Island). A
leitura mais defensável: **no Lock Screen sem Dynamic Island, `widgetURL(_:)` é o único
tap-target de deep link disponível para o card inteiro** — não é possível ter um `Link`
separado ao lado dos botões `Button(intent:)` de stepper com garantia documentada de
funcionamento.

**Achado adicional, verificado nesta sessão:** o `widgetURL` ATUAL já está quebrado:
```swift
// [VERIFIED: targets/session-widget/WidgetLiveActivity.swift:187]
.widgetURL(URL(string: "forcaapp://session/active"))
```
Mas a rota real registrada é (`[VERIFIED: src/navigation/linkingConfig.ts:63-71]`):
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
— ou seja, a URL tipada correta é `forcaapp://home/active-session/<sessionId>` (o próprio
comentário de `linking.ts:26-30` documenta essa forma), não `forcaapp://session/active`. Hoje,
tocar no card fora de um botão não navega para lugar nenhum reconhecido por
`LINKING_CONFIG` — nenhum teste automatizado cobre isto porque `Linking`/deep link nativo não
roda em Jest.

**How to avoid:** o plano deve (1) trocar `widgetURL` para `forcaapp://home/active-session/<sessionLogId>`, usando o `sessionLogId` que já está em `SessionActivityAttributes.sessionLogId` (`[VERIFIED: targets/session-widget/SessionActivityAttributes.swift:27]`); (2) tratar "abrir para
ajustar" da D-12 como reaproveitamento do MESMO `widgetURL` do card (ex.: um botão visual sem
`Button(intent:)`, ou área de toque fora dos botões de stepper) em vez de tentar um `Link`
paralelo; (3) marcar como UAT físico explícito se o botão precisa estar visualmente separado
dos steppers mas tecnicamente compartilha o mesmo destino de toque do card.

**Warning signs:** no UAT, tocar no botão "abrir para ajustar" não abre nada, ou abre o app na
tela errada (Home genérica em vez da sessão ativa).

### Pitfall 4: mudar `ContentState` mata Activities já em curso

**What goes wrong:** D-11 já flagra isto, e a pesquisa confirma o mecanismo: ActivityKit não
tem migração incremental de schema — `[CITED: múltiplas fontes de terceiros consistentes
sobre o comportamento de ContentState]` "quando o schema estrutural de `ContentState` precisa
mudar, Activities existentes precisam ser encerradas e novas Activities criadas com o schema
atualizado."

**Why it happens:** o `ContentState` é serializado (`Codable`) e decodificado pelo lado que
renderiza o widget; se os dois lados (app recém-instalado com o novo schema vs. Activity
antiga já em memória do sistema) divergem, o comportamento não é definido pela documentação
pública consultada.

**How to avoid:** o plano deve incluir, como passo explícito antes do UAT físico de PRED-01/D-11:
encerrar qualquer Live Activity em curso (`endLiveActivity('immediate')`, já exposto por
`modules/live-activity/index.ts:56-59`) OU simplesmente reinstalar o app via `resign.sh`
(que já é o fluxo padrão de deploy deste projeto) antes de iniciar uma sessão nova para testar
os campos novos — nunca testar contra uma Activity iniciada com o binário antigo.

**Warning signs:** card do Lock Screen mostra campos em branco/zerados para "A seguir" mesmo
com uma sessão nova, ou o app trava/loga erro de decodificação ao tentar `update()` numa
Activity antiga.

### Pitfall 5: `verify-native-skeleton.sh` não garante paridade de conteúdo entre os targets

**What goes wrong:** a checagem (g) do script (`[VERIFIED:
scripts/verify-native-skeleton.sh:143-164]`) só confirma que `struct <Nome>` existe em AMBOS
os arquivos — não faz diff de conteúdo:
> "esta checagem confirma só presença + declaração do struct, não diff de conteúdo."

Isto é intencional para os Intents (que NÃO precisam ser byte-idênticos por design — só o stub
compila, nunca executa). Mas para `SessionActivityAttributes.swift`, que a D-11 exige manter
IDÊNTICO nos dois targets, **não existe nenhuma checagem automatizada de paridade** — nem no
script, nem em teste Jest (Swift não roda em Jest).

**How to avoid:** o plano deve (1) adicionar `AdjustRepsIntent`/`AdjustLoadIntent` à lista de
nomes checados na função `for nome_intent in CompleteSetIntent SkipRestIntent AdjustRestIntent`
(linha 151); (2) considerar um passo de verificação manual explícito (ou um `diff` simples no
próprio script) comparando os dois `SessionActivityAttributes.swift` byte a byte, já que hoje
essa paridade depende só de disciplina do desenvolvedor.

**Warning signs:** build da extensão falha silenciosamente ou o widget renderiza com campos
`nil`/default por divergência entre as duas cópias do `ContentState`.

## Code Examples

### `ContentState` atual — o contrato exato que PRED-01 precisa estender

`[VERIFIED: src/engine/liveActivityContentState.ts:16-51]` (TS) e
`[VERIFIED: targets/session-widget/SessionActivityAttributes.swift:11-28]` /
`[VERIFIED: modules/live-activity/ios/SessionActivityAttributes.swift:11-28]` (Swift,
byte-idênticos — confirmado por leitura completa dos dois arquivos nesta sessão):

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

**Confirmação do gap:** `buildLiveActivityContentState()` já calcula `next =
findNextPendingSet(draft)` (`[VERIFIED: src/engine/liveActivityContentState.ts:59]`), mas hoje
`next` só é usado como FALLBACK quando não há série ativa (`current = active ?? next`,
`[VERIFIED: liveActivityContentState.ts:60]`) — nunca é exposto como "o que vem depois do
atual". D-13/D-14 exigem um segundo lookup independente (a próxima série/exercício DEPOIS da
série ativa/em descanso, não em vez dela) — campos novos precisam ser adicionados aos DOIS
`SessionActivityAttributes.swift` e ao tipo `LiveActivityContentState` em TS, seguindo o mesmo
padrão opcional (`String?`, `Int?`) já usado para `blockLabel`/`blockIndex`/`blockTotal`.

### `stepLoad()` — o molde exato para `stepReps()`

`[VERIFIED: src/engine/sessionModel.ts:240-255]`:
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
`stepReps()` espelha isto sem `round2` (reps são inteiras) e com incremento fixo (discretion:
±1, sugerido por `REQUIREMENTS.md`) em vez de `incrementKg` variável por exercício.

### `canCompleteSet()` — já cobre D-06 sem mudança

`[VERIFIED: src/engine/sessionModel.ts:262-278]`:
```typescript
export const canCompleteSet = (
  set: Pick<DraftSet, 'actualReps' | 'actualLoadKg' | 'actualDurationSeconds'>,
  isBodyweight: boolean,
  metric: ExerciseMetric = 'carga_reps',
): boolean => {
  if (isTimeBased(metric)) {
    return set.actualDurationSeconds != null && set.actualDurationSeconds > 0;
  }
  if (set.actualReps == null || set.actualReps < 0) return false;
  if (isBodyweight) return true;
  return set.actualLoadKg != null && set.actualLoadKg > 0;
};
```
D-06 ("Iniciar série" some quando o pré-preenchimento já passa em `canCompleteSet()`") não
precisa de nova função de validação — só precisa que a lógica de renderização em
`SessionPlayer.tsx` (hoje o branch `if (next) { ... "Iniciar série" ... }`,
`[VERIFIED: src/components/session/SessionPlayer.tsx:783-807]`) passe a checar
`canCompleteSet()` contra os valores JÁ pré-preenchidos (D-01) antes de decidir se mostra o
card "ready" (com botão "Iniciar série") ou pula direto para o card "measuring" revelado.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-------------------|---------------|--------|
| Carga digitada em `TextInput` no fluxo padrão | Carga como texto entre `−/+`, teclado só por gesto deliberado | Nesta fase (D-05) | `TextInput` continua existindo no componente só para o caminho de escape (D-04/discretion) — não é removido, é despriorizado |
| Nenhum histórico de reps | `lastRepsByExercise` espelhando `lastLoadByExercise` | Nesta fase (D-01/D-02) | Primeira vez que reps ganham memória entre sessões — hoje só carga tem |
| `ContentState` só descreve o AGORA | `ContentState` ganha campos de "A seguir" | Nesta fase (D-13/D-14) | Primeira mudança estrutural no contrato desde a Fase 15 — dispara a mecânica de encerrar/recriar Activities (Pitfall 4) |

**Deprecated/outdated:** nada nesta fase deprecia uma abordagem anterior do projeto — tudo é
extensão aditiva de contratos existentes.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Updates locais de `Activity.update()` com o app em foreground não estão sujeitos ao mesmo orçamento documentado para push de alta prioridade | Pitfall 2 | Se errado, uma rajada de toques de stepper poderia sofrer throttling silencioso — card atrasado ou "congelado" sob uso real; só o UAT físico confirma |
| A2 | `Link` dentro do Lock Screen (sem Dynamic Island) não oferece um segundo tap-target confiável além do `widgetURL` do card inteiro | Pitfall 3 | Se errado (ou seja, se `Link` funcionar de forma isolada no Lock Screen), o plano pode simplificar e usar um `Link` dedicado para "abrir para ajustar" em vez de reaproveitar o `widgetURL` do card — vale um teste rápido no simulador de layout (não de interação) antes de comprometer o design |
| A3 | Tocar um deep link (`widgetURL`) a partir do Lock Screen BLOQUEADO exige desbloqueio (Face ID/passcode) antes de abrir o app, como qualquer abertura de app a partir da tela bloqueada | Pesquisa aberta 4 do prompt | Comportamento padrão conhecido do iOS, mas não citado por fonte oficial nesta sessão — se o fluxo esperar abertura sem gesto de desbloqueio, o UAT revela a diferença imediatamente |
| A4 | Nenhuma fonte encontrada documenta oficialmente um "ack" ou confirmação de entrega de `Activity.update()` — presume-se fire-and-forget, coerente com o padrão já usado por `liveActivitySync.ts` | Architecture Patterns | Se `Activity.update()` puder falhar silenciosamente sob certas condições (ex.: app suspenso), o card poderia ficar desatualizado sem qualquer sinal — mas isto já é um risco pré-existente da Fase 15/16, não introduzido por esta fase |

## Open Questions

1. **Toque rápido no stepper — bypassa o AppIntent e abre o app?**
   - O que sabemos: existe um relato de fórum não respondido descrevendo exatamente este
     comportamento em widgets interativos genéricos (não Live Activity especificamente).
   - O que é incerto: se o mesmo bug se aplica a `LiveActivityIntent` no Lock Screen (vs.
     widget de tela de início, que é o contexto do relato original), e se o iOS 26.x do
     aparelho do dono tem o mesmo comportamento de 2023.
   - Recomendação: tratar como cenário de UAT físico OBRIGATÓRIO no roteiro da Fase 17,
     testado explicitamente com toques rápidos (~4 toques em 1s) nos dois steppers novos.

2. **Orçamento real de `Activity.update()` sob toque rápido, com app em foreground.**
   - O que sabemos: o orçamento documentado pela Apple é para push remoto; não há push nesta
     fase.
   - O que é incerto: se updates locais têm throttling equivalente, e a que taxa.
   - Recomendação: não implementar debounce preventivo; medir no UAT físico (rajada de
     toques) e só adicionar coalescing em `liveActivitySync.ts` se o card visivelmente
     atrasar ou perder updates.

3. **`Link` funciona como segundo tap-target no Lock Screen sem Dynamic Island?**
   - O que sabemos: a documentação da Apple associa `Link` à "expanded presentation" (Dynamic
     Island), que este device não tem; um relato de usuário em fórum confirma "limitações no
     Lock Screen" sem detalhar o comportamento exato.
   - O que é incerto: se `Link` simplesmente é ignorado/não-clicável no Lock Screen, ou se
     funciona mas com alguma degradação (ex.: precisa de long-press).
   - Recomendação: o plano deve assumir que só `widgetURL` (um tap-target por card) está
     garantido; se o time quiser testar `Link` como alternativa antes de comprometer o design
     final, um teste rápido no dispositivo físico resolve isto em minutos — mas não é
     bloqueante, porque reaproveitar `widgetURL` já resolve D-12 de forma cientificamente
     mais segura.

4. **Onde exatamente o toque em "abrir para ajustar" deve navegar — para a série específica,
   ou só para a sessão ativa genérica?**
   - O que sabemos: `sessionLogId` está disponível em `SessionActivityAttributes` e na rota
     `active-session/:sessionId`.
   - O que é incerto: `SessionPlayer.tsx` já reconstrói o card ativo a partir do
     `activeSessionStore` (que já sabe qual série está ativa) — então navegar para
     `active-session/:sessionId` provavelmente já pousa na série certa automaticamente, sem
     precisar de um parâmetro extra de exercício/série na URL. Isto não foi confirmado lendo
     o código de renderização de `ActiveSessionScreen.tsx` nesta sessão.
   - Recomendação: o planner deve ler `src/screens/ActiveSessionScreen.tsx` e confirmar que
     abrir `active-session/:sessionId` sempre mostra a série ativa corrente (sem precisar de
     parâmetro adicional) antes de desenhar a URL do `widgetURL` corrigido.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Xcode | Build/assinatura dos targets nativos | ✓ `[VERIFIED: STATE.md — "Xcode 26.6 licenciado nesta máquina"]` | 26.6 | — |
| iPhone físico (iPhone 13, sem Dynamic Island) | UAT de REG-02/PRED-01/critérios 2-4 do ROADMAP | ✓ (só o dono tem o aparelho) | iOS 26.x | Nenhum — Live Activity e App Intents não são testáveis em simulador (confirmado pela pesquisa da Fase 14/15/16 e reafirmado aqui) |
| Simulador iOS | Verificação de layout estático (SwiftUI Previews) | ✓ (via Xcode) | — | Só cobre layout visual, nunca interação de `Button(intent:)`/toque real |
| Apple ID pessoal (sideload gratuito) | Assinatura/instalação do build para UAT | ✓ `[VERIFIED: REQUIREMENTS.md — "sideload gratuito, validade 7 dias"]` | — | — |
| Supabase (banco) | Seed de `lastRepsByExercise`/`lastLoadByExercise` | Não verificado nesta sessão (fora do escopo — nenhuma migration necessária) | — | — |

**Missing dependencies with no fallback:**
- Nenhuma. Todas as dependências de ambiente já estão disponíveis; o único "fallback ausente"
  é estrutural (Live Activity não é testável em simulador), já conhecido e documentado desde a
  Fase 15.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` (`[VERIFIED: package.json]`) |
| Config file | `jest` key em `package.json` (`[VERIFIED: cat package.json — chave "jest" presente]`) |
| Quick run command | `npx jest __tests__/sessionModel.test.ts __tests__/activeSessionStore.test.ts __tests__/liveActivityContentState.test.ts` |
| Full suite command | `npm test` (roda `jest`) |

Swift (Intents, `WidgetLiveActivity.swift`, `SessionActivityAttributes.swift`) **não tem
framework de teste automatizado neste repositório** — nenhum alvo de teste Swift foi
encontrado (`XCTest` ausente dos targets listados). Toda verificação de código Swift é
compilação (`expo prebuild` + build Release) mais leitura manual; todo comportamento em
runtime é UAT físico.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| REG-01 | `lastRepsByExercise` semeado corretamente (mais recente por `completed_at`, mesma chave `exerciseIdentity` de `lastLoadByExercise`) | unit | `npx jest __tests__/sessionModel.test.ts -t "reps"` | ❌ Wave 0 — precisa de casos novos |
| REG-01 | `stepReps()` nunca desce abaixo de 0, incremento fixo | unit | `npx jest __tests__/sessionModel.test.ts -t "stepReps"` | ❌ Wave 0 |
| REG-01 | `canCompleteSet()` decide corretamente quando "Iniciar série" some (D-06) — reusa lógica JÁ testada, novo caso de pré-preenchimento | unit | `npx jest __tests__/sessionModel.test.ts -t "canCompleteSet"` | ✅ (`sessionModel.test.ts` já existe; precisa de novos `it()`) |
| REG-01 | Renderização do card sem `TextInput` editável no fluxo padrão, com marca visual de "herdado" | unit/component | `npx jest __tests__/sessionPlayerTransitions.test.tsx` | ✅ arquivo existe; precisa de novos casos |
| REG-01 (PWA) | Layout do stepper não estoura no web (`minWidth: 0` continua valendo com o campo virando `Text` em vez de `TextInput`) | manual + visual | Rodar `expo start --web`, inspecionar em viewport 390×844 | ❌ Wave 0 — nenhum teste automatizado de layout web existe hoje (achado de `sessionPlayerLayout.ts:9-14`: o bug anterior só foi pego por medição manual) |
| REG-02 | Delta de reps/carga aplicado corretamente pela store quando disparado via `liveActivityIntentBridge.ts` (mock do evento, sem hardware) | integration | `npx jest __tests__/liveActivityIntentBridge.test.ts` | ✅ arquivo existe; precisa de novos casos `adjustReps`/`adjustLoad` |
| REG-02 | `QueuedIntentAction` decodifica/enfileira o novo campo de delta genérico | integration | `npx jest __tests__/liveActivityIntentQueue.test.ts` | ✅ arquivo existe; precisa de novos casos |
| REG-02 (critério 2 — acumulação sob toque rápido) | Nenhum automatizado possível — ActivityKit não roda em simulador nem CI | **manual-only** | Roteiro físico no iPhone: 4 toques em ~1s, validar valor final | — (ver Pitfall 1) |
| REG-02 (critério 3 — valor fora do passo abre o app) | Nenhum automatizado possível | **manual-only** | Roteiro físico: ajustar carga para 37,5 kg via app, verificar botão "abrir para ajustar" no Lock Screen | — (ver Pitfall 3) |
| PRED-01 | `buildLiveActivityContentState()` compõe corretamente os campos de "A seguir" (próxima série/exercício, valor de `suggestLoad()`) a partir de um `SessionDraft` sintético | unit | `npx jest __tests__/liveActivityContentState.test.ts` | ✅ arquivo existe; precisa de novos casos |
| PRED-01 (critério 4 — visível ANTES do descanso zerar) | Nenhum automatizado possível — depende de renderização real do widget no Lock Screen | **manual-only** | Roteiro físico: iniciar descanso, observar linha "A SEGUIR" aparecer imediatamente, não só ao chegar a zero | — |
| PRED-01 (migração de Activities em curso) | Reinstalação do app não deixa Activity "presa" com schema antigo | manual | Roteiro físico: iniciar sessão, resign+reinstall, verificar que a Activity antiga não trava/corrompe | — (ver Pitfall 4) |

### Sampling Rate
- **Per task commit:** `npx jest <arquivo-do-domínio-tocado>` (sessionModel, activeSessionStore,
  liveActivityContentState, liveActivityIntentBridge/Queue conforme o arquivo TS tocado) + `npx
  tsc --noEmit`.
- **Per wave merge:** `npm test` (suíte completa Jest).
- **Phase gate:** suíte completa verde + roteiro físico dos 4 itens `manual-only` acima
  reportado PASS/FAIL pelo dono, antes de `/gsd-verify-work`. "Compilou"/"prebuild passou" nunca
  é critério de conclusão (D-14 da Fase 15, D-10 da Fase 14, reafirmado no `Claude's Discretion`
  desta fase).

### Wave 0 Gaps
- [ ] Casos novos em `__tests__/sessionModel.test.ts` cobrindo `stepReps()`,
      `suggestReps()`/reps em `SessionDraft.lastRepsByExercise`.
- [ ] Casos novos em `__tests__/activeSessionStore.test.ts` cobrindo seed + atualização de
      `lastRepsByExercise` em `completeSet()`.
- [ ] Casos novos em `__tests__/liveActivityContentState.test.ts` cobrindo os campos de "A
      seguir" (D-13 a D-16, incluindo o caso de virada de bloco cardio/alongamento).
- [ ] Casos novos em `__tests__/liveActivityIntentBridge.test.ts` e
      `__tests__/liveActivityIntentQueue.test.ts` cobrindo `adjustReps`/`adjustLoad`.
- [ ] Nenhum framework de teste Swift a instalar — fora do escopo (ver nota acima); toda
      cobertura Swift é UAT físico + compilação.
- [ ] Nenhum teste automatizado de layout web para o stepper não-editável — ficará como
      verificação manual explícita (achado documentado no Pitfall/Environment acima), a menos
      que o planner decida introduzir um teste de snapshot (fora do padrão atual do repo).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|--------------------|
| V2 Authentication | Não | Fase não toca autenticação; app pessoal, sideload, sem distribuição |
| V3 Session Management | Não | Nenhuma sessão de rede nova; `sessionLogId` já existente continua sendo o identificador |
| V4 Access Control | Marginal | App de uso pessoal single-tenant (não há outro usuário no aparelho); nenhum controle novo necessário |
| V5 Input Validation | **Sim** | Delta de reps/carga vindo do stepper (app e Lock Screen) precisa de clamp — `stepLoad()` já nunca desce abaixo de 0 (`Math.max(0, ...)`, `sessionModel.ts:254`); `stepReps()` precisa do mesmo piso. No lado Swift, `deltaSeconds`/`deltaValue` do `@Parameter` são tipados (`Int`/`Double`) pelo App Intents framework — não há injeção de string livre, mas o VALOR do delta ainda deve ser um incremento fixo conhecido (±1 rep, ±`load_increment_kg`), nunca um valor arbitrário vindo de fora do app |
| V6 Cryptography | Não | Nenhuma nova superfície de criptografia; App Group `UserDefaults` já é o mecanismo aprovado (Fase 14 spike) |

### Known Threat Patterns for esta fase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Delta malformado/fora de faixa causando `actualLoadKg`/`actualReps` negativo ou absurdo | Tampering | `stepLoad()`/`stepReps()` já clampam no piso (0); o teto natural é o próprio incremento fixo por toque — nenhum valor arbitrário entra pela tela bloqueada, só múltiplos do passo configurado |
| Fila de intents (`IntentActionQueue`) sendo inundada por toques repetidos (DoS local) | Denial of Service | Já mitigado: `maxEntries = 20` com corte das mais antigas (`[VERIFIED: modules/live-activity/ios/IntentActionQueue.swift:51-53,70-77]`) — herdado da Fase 16, continua valendo para os dois `kind` novos sem mudança |
| Deep link (`widgetURL`) apontando para rota errada expondo dados de OUTRA sessão | Information Disclosure (baixo risco — app single-tenant) | Corrigir a URL para incluir o `sessionLogId` correto (Pitfall 3); como o app é de uso pessoal e o `sessionLogId` já é validado do lado do app ao montar a tela, não há superfície de escalonamento entre usuários |

## Sources

### Primary (HIGH confidence)
- Leitura completa nesta sessão: `src/engine/sessionModel.ts`, `src/store/activeSessionStore.ts`
  (trechos 330-510, 1220-1500), `src/services/sessionExecutionRepository.ts` (595-700, grep
  800-940), `src/components/session/SessionPlayer.tsx` (590-810), `src/engine/
  liveActivityContentState.ts` (completo), `src/engine/intraSessionAdaptation.ts` (380-460),
  `src/components/session/sessionPlayerLayout.ts` (completo), `src/native/
  liveActivityIntentBridge.ts` (completo), `modules/live-activity/index.ts` (completo),
  `modules/live-activity/ios/AdjustRestIntent.swift`, `modules/live-activity/ios/
  IntentActionQueue.swift`, `modules/live-activity/ios/SessionActivityAttributes.swift`,
  `targets/session-widget/AdjustRestIntent.swift`, `targets/session-widget/
  CompleteSetIntent.swift`, `targets/session-widget/SessionActivityAttributes.swift`,
  `targets/session-widget/WidgetLiveActivity.swift` (completo), `src/navigation/linking.ts`,
  `src/navigation/linkingConfig.ts`, `scripts/verify-native-skeleton.sh` (60-167), `app.json`
  (grep), `package.json` (grep).
- `.planning/phases/17-tela-bloqueada-registrar-e-antecipar/17-CONTEXT.md` — decisões travadas.
- `.planning/REQUIREMENTS.md` — REG-01, REG-02, PRED-01 no texto integral.
- `.planning/STATE.md` — histórico de decisões e blockers do milestone.

### Secondary (MEDIUM confidence)
- [Can LiveActivityIntent open the app when tapping a Live Activity button on Lock Screen &
  Dynamic Island expanded view?](https://developer.apple.com/forums/thread/812949) — resposta
  direta de engenheiros DTS da Apple (Albert Pascual, Ziqiao Chen), confirmando que
  `LiveActivityIntent` nunca abre o app e recomendando Universal Links/`widgetURL`/`Link`.
- Documentação pública sobre `widgetURL(_:)` cobrir Lock Screen/compact/minimal e `Link` ser
  oferecido adicionalmente só na expanded presentation (via busca; página oficial da Apple não
  citável diretamente por trecho nesta sessão, mas o conteúdo foi consistente entre fontes).
- Comportamento de "orçamento de update" de ActivityKit — consistente entre múltiplas fontes de
  terceiros, mas nenhuma cita um número oficial da Apple para updates locais (não-push).

### Tertiary (LOW confidence)
- [WidgetKit: Interactive widget rapid tap bypasses app intent](
  https://developer.apple.com/forums/thread/739243) — relato de usuário único, sem resposta,
  sem confirmação oficial; tratado como sinal de risco a validar fisicamente, não como fato.
- Relato de usuário (mesmo tópico 812949) sobre `Link` ter "limitações no Lock Screen" — sem
  detalhamento técnico verificável.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nenhuma dependência nova; versões lidas direto de `package.json`/`app.json`.
- Architecture (app RN/TS): HIGH — todo padrão citado foi lido linha a linha nesta sessão, com
  file:line e trecho verbatim.
- Architecture (ActivityKit/App Intents): MEDIUM — os padrões estruturais (stub+impl, fila
  durável) são HIGH (código lido); o comportamento de runtime sob toque rápido e orçamento de
  update é LOW-MEDIUM (sem fonte oficial numérica).
- Pitfalls: MEDIUM-HIGH — os achados de código (deep link morto, `openAppWhenRun` inexistente,
  `QueuedIntentAction` sem campo de delta genérico) são HIGH; os riscos de runtime (toque
  rápido, orçamento) são LOW/comunidade, corretamente marcados como tal.

**Research date:** 2026-08-18
**Valid until:** 2026-09-17 (30 dias — stack estável, mas ActivityKit/App Intents é área que a
Apple pode atualizar em point releases de iOS; revalidar se o iOS do aparelho do dono mudar de
versão maior antes do UAT físico)
