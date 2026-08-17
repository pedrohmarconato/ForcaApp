# Phase 15: Tela bloqueada — ver e cronometrar - Research

**Researched:** 2026-08-16
**Domain:** ActivityKit (Live Activity somente leitura) + WidgetKit (Dynamic Island) sobre Expo SDK 54 / RN 0.81, integrado a um Zustand store existente (`activeSessionStore`)
**Confidence:** MEDIUM — mecânica do ActivityKit é bem documentada e cross-checada nesta sessão; o ponto de maior incerteza real não é a API da Apple, é como this exact refactor (`restEndsAt`, reconciliação no boot do app) se encaixa no código já existente — esse ponto foi verificado lendo o código-fonte, não só pesquisado.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Conteúdo e hierarquia do card**
- **D-01:** O card troca de layout com o estado, espelhando os dois cartões que `SessionPlayer.tsx` já alterna hoje. Descansando: o timer é o elemento grande e o exercício vira linha secundária. Executando a série: a prescrição (reps × carga) é o elemento grande.
- **D-02:** Nas apresentações espremidas do Dynamic Island (compact e minimal) a prioridade é o tempo: mm:ss do descanso correndo. Fora do descanso, essas apresentações caem para série X/Y.
- **D-03:** Só blocos de musculação têm card detalhado. Durante cardio e alongamento, a Live Activity permanece viva (D-05) mas mostra apenas nome do bloco e progresso (ex.: "Alongamento 2/6") — sem linha de prescrição. Consequência aceita e explícita: a dose do cardio (tempo/distância) não aparece na tela bloqueada nesta fase.
- **D-04:** Quando o descanso zera e o dono não age, o card mostra "Pronto · Série 3/4" em destaque + contagem crescente discreta do tempo excedido desde o zero (ex.: `+2:30`).

**Ciclo de vida da Live Activity**
- **D-05:** A Activity sobe ao iniciar a sessão de treino (não no primeiro descanso) e vive até o fim — inclusive durante blocos de cardio/alongamento (com o conteúdo reduzido de D-03).
- **D-06:** Ao terminar o treino, o card vira resumo curto e desaparece sozinho em ~2–5 min (`dismissalPolicy` por data, não `.default`). Ao cancelar a sessão, encerra imediatamente. Nenhum caminho deixa card preso.
- **D-07:** Com o app em foreground a Activity continua viva — um único ciclo de vida por sessão (start → update → end), sem start/end repetidos ao alternar foreground/background.
- **D-08:** Timeout de inatividade: sem nenhuma série registrada por um período, a Live Activity se encerra sozinha (a sessão no store permanece intacta para retomada — só o card sai da tela bloqueada). Padrão sugerido: 3h (ajustável — Claude's Discretion).

**Semântica do descanso com `restEndsAt`**
- **D-09:** O descanso nunca auto-avança. Ao chegar a zero, o estado vira "Pronto" e o avanço para a próxima série só acontece por ação do dono. Reversibility: costly — inverte o comportamento vigente de `SessionPlayer.tsx:298`.
- **D-10:** Regra única, sem depender do estado do app. "Nunca auto-avança" vale igualmente com o app aberto e com o iPhone bloqueado.

**Reconciliação e falhas**
- **D-11:** Ao reabrir o app após force-quit: encerra toda Live Activity existente e, se a sessão ainda estiver viva no store, sobe um card novo já com o estado corrente. Um caminho só — não tenta decidir se o card órfão ainda servia.
- **D-12:** Se a Live Activity não conseguir subir (Live Activities desativada em Ajustes, recusa do iOS, limite do sistema): aviso discreto uma única vez no app, sem bloquear o treino. Nunca silêncio total, nunca aviso repetido a cada tentativa.

**Logística dos momentos com iPhone**
- **D-13:** Duas sessões físicas com roteiro auto-contido (comandos copiáveis + "o que você deve ver" + critério PASS/FAIL), execução da fase parando no checkpoint até o dono reportar. Sessão 1 (cedo, ~20 min): card sobe, aparece nas 4 apresentações, timer conta com iPhone bloqueado, sessão de mentira, stack local. Sessão 2 (fim): UAT com treino real, conta real, Supabase de produção.
- **D-14:** "Compilou" nunca é critério de conclusão.

### Claude's Discretion
- Formato interno do `ContentState`/`ActivityAttributes` (string pré-formatada vs campos estruturados). Restrição registrada: Fase 17 (REG-02) precisa de reps e carga como NÚMEROS, não texto renderizado.
- Valor exato do timeout de inatividade da D-08 (3h é o padrão sugerido).
- Onde e como o aviso da D-12 aparece na UI do app (banner, toast, linha na tela de sessão) — desde que discreto e não bloqueante, no espírito do banner de validade de reassinatura (D-03 da Fase 14).
- Mecânica do `±30s` existente (`ajustarDescanso`) depois do refactor para `restEndsAt`.
- Estrutura de arquivos dentro de `targets/session-widget/` e `modules/live-activity/`, e o mecanismo de sincronia do `ActivityAttributes` duplicado entre app e extensão.
- Estilo visual do card (cores, tipografia, uso da identidade Força) — fase marcada **UI hint: yes**.

### Deferred Ideas (OUT OF SCOPE)
- Prescrição do cardio na tela bloqueada (tempo/distância prescritos durante blocos de cardio) — excluída pela D-03.
- Antecipação da próxima ação durante o descanso — PRED-01, Fase 17.
- Ajustar/pular descanso pela tela bloqueada — CMD-02, Fase 16.
- Som/vibração no fim do descanso — deferido para pós-v1.3.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOCK-01 | Tela bloqueada mostra exercício atual, série X/Y e prescrição (reps × carga) num card de Live Activity, sem desbloquear/abrir o app, com as 4 apresentações do Dynamic Island | Ver Architecture Patterns (WidgetLiveActivity.swift já escalado com as 4 closures — Pattern 1), Standard Stack, Code Examples |
| LOCK-02 | Timer de descanso conta regressivamente na tela bloqueada de forma nativa (`Text(timerInterval:)`), estado sai de `SessionPlayer.tsx` e vira `restEndsAt` no `activeSessionStore` | Ver Architecture Patterns (Pattern 2), Common Pitfalls (Pitfall 1, 2), Code Examples |
| LOCK-03 | Live Activity encerra sozinha ao terminar/cancelar, inclusive após force-quit (reconciliação na reabertura) | Ver Architecture Patterns (Pattern 3, 4), Common Pitfalls (Pitfall 3, 4), Runtime State Inventory |
</phase_requirements>

## Summary

Esta fase transforma o target `targets/session-widget/` — hoje um esqueleto template do `@bacons/apple-targets` com `WidgetAttributes`/`emoji` de exemplo, já escalado nas 4 apresentações do Dynamic Island e já sobrevivendo a `expo prebuild --clean` — numa Live Activity real, somente leitura, espelhando `activeSessionStore`. Não há App Intents nesta fase (isso é Fase 16): toda atualização de conteúdo é um `Activity<T>.update(...)` disparado a partir do processo principal do app, nunca da extensão. Por isso, ao contrário do que a pesquisa do milestone (STACK.md) temia, o App Group **não é necessário para o fluxo de dados desta fase** — ele já foi comprovado disponível (spike PASS, Fase 14) e permanece congelado em `app.json`/`expo-target.config.js`, mas só passa a ser carga estrutural na Fase 16 (App Intents rodando `perform()` no processo do app, escrevendo numa fila durável).

O trabalho tem três frentes que devem ser sequenciadas nesta ordem, pela mesma razão da pesquisa do milestone (isolar risco): (1) o refactor `restEndsAt` — tirar `restRemaining`/`restTotal`/`setInterval` de `SessionPlayer.tsx` (linhas 161–306) e colocar um timestamp absoluto no store, respeitando a nova semântica D-09/D-10 ("nunca auto-avança", removendo a linha `if (rest && restRemaining === 0) endRest(true)` em `SessionPlayer.tsx:298`); (2) o módulo Swift `modules/live-activity/` (molde: `modules/native-info/`, já existente e revisável) com `start`/`update`/`end`; (3) o corpo real do `WidgetLiveActivity.swift`, incluindo a troca de layout por estado (D-01), a redução para blocos de cardio/alongamento (D-03, mapeável 1:1 para `isTimeBased(metricOf(exercise))` — já existe no código, `src/engine/sessionModel.ts:277`), e o `dismissalPolicy`/reconciliação de D-06/D-11.

O ponto mais frágil não é a API do ActivityKit (bem documentada, cross-checada aqui) — é que **nenhum destes três mecanismos existe hoje no repositório**: não há `useActiveSessionStore.subscribe()` (padrão "sole writer" descrito em ARCHITECTURE.md é uma recomendação nova, não um padrão já usado em código), `startOrResume` só é chamado de `ActiveSessionScreen.tsx` (a reconciliação de D-11 não pode depender de o dono abrir a tela de sessão — precisa rodar no boot do app, como `ProvisioningBanner.tsx` já faz para outro aviso), e `app.json` não tem a chave `NSSupportsLiveActivities` (obrigatória no app principal, não no target do widget, mesmo para Live Activity 100% local).

**Primary recommendation:** Construir em 3 fatias sequenciais e verificáveis fisicamente uma de cada vez (Sessão 1 do D-13 no fim): refactor `restEndsAt` (verificável em `jest`, sem device) → módulo `modules/live-activity` com `start`/`update`/`end` chamando `Activity<SessionActivityAttributes>` (Content State com campos numéricos, não strings pré-formatadas, por causa da restrição de REG-02) → `liveActivitySync.ts` como único escritor, montado num componente-host no root do `App.tsx` (mesmo padrão de `ProvisioningBanner`/`PushInviteHost`) que também roda a reconciliação de órfãos no mount, antes de qualquer navegação para a tela de sessão.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Renderização do card (Lock Screen + Dynamic Island) | Widget Extension (SwiftUI, `targets/session-widget/`) | — | Único processo que a Apple permite renderizar UI de Live Activity; não roda JS/RN |
| Cronômetro do descanso (contagem regressiva/crescente) | Widget Extension (`Text(timerInterval:)`, renderização nativa do sistema) | Browser/Client (JS) para o anel visual do app em foreground | O relógio na tela bloqueada não depende de nenhum processo vivo depois do push; o anel do app (`SessionPlayer.tsx`) é cosmético e deriva do mesmo `restEndsAt` |
| Fonte de verdade da sessão (série ativa, status, exercícios) | Frontend Server local — na prática, "Client" App/JS tier (`activeSessionStore.ts`, Zustand) | API/Backend (Supabase, via outbox) | O store já é a fonte de verdade local hoje; a Live Activity é espelho, nunca grava nada — mantém o mesmo contrato do resto do app (server autoritativo via outbox) |
| Ponte JS ↔ ActivityKit (start/update/end) | Client tier — `modules/live-activity/` (Expo Module Swift) chamado por `src/native/liveActivitySync.ts` | — | Só o processo do app principal pode chamar `Activity.request/update/end`; a extensão nunca inicia nada |
| Reconciliação de card órfão no boot | Client tier — componente-host montado em `App.tsx` | — | Precisa rodar independente de qual tela o dono abre primeiro; `startOrResume` só dispara dentro da tela de sessão hoje (verificado — `grep` não encontrou chamador fora de `ActiveSessionScreen.tsx`) |
| Aviso "Live Activity não subiu" (D-12) | Client tier — componente banner no root, mesmo padrão de `ProvisioningBanner.tsx` | — | Não bloqueante, uma vez só, mesmo espírito do aviso de validade de provisioning |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ActivityKit (framework nativo Apple, não npm) | iOS 16.1+ (Dynamic Island), target já pinado em `deploymentTarget: "17.0"` | `Activity<T>.request/update/end`, `Text(timerInterval:)`, `DynamicIsland` | Único framework da Apple para este recurso; sem alternativa |
| `@bacons/apple-targets` | `^5.0.0` — **[VERIFIED: npm registry — `npm view` confirmou 5.0.0, publicado 2026-07-17, repo `github.com/evanbacon/expo-apple-targets`, 285k downloads/semana]** | Já instalado (Fase 14); scaffold do target `session-widget` que sobrevive a `expo prebuild --clean` | Já em uso no repo, nada a instalar; ver Package Legitimacy Audit |
| Expo Modules API (`ExpoModulesCore`) | Já em uso (`modules/native-info/`) | Base do novo `modules/live-activity/` — bridge Swift↔JS | Já é o padrão do repo (`modules/native-info/`), New-Architecture-nativo, sem lib de terceiros |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Nenhuma nova dependência npm | — | — | Esta fase não instala pacote novo — `expo-notifications`/`expo-speech`/`expo-audio` continuam fora do `package.json` (confirmado: `grep` não encontrou nenhum dos três) porque pertencem a fases futuras/deferidas |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Módulo Expo hand-rolled (`modules/live-activity/`) | `@kingstinct/react-native-activity-kit` | Já descartado na pesquisa do milestone (STACK.md): não documenta `LiveActivityIntent`/wiring interativo, pré-1.0; para esta fase (sem botões) o ganho seria só `start/update/end`, e o molde já existe em `modules/native-info/` — manter consistência de padrão do repo pesa mais |
| `Text(timerInterval:)` | Push per-second de `Activity.update()` | Já vetado pela pesquisa do milestone (Pitfall 7/PITFALLS.md) e reconfirmado nesta sessão — throttling real em descansos de 60-180s |

**Installation:**
```bash
# Nada a instalar nesta fase — @bacons/apple-targets já está em package.json (^5.0.0)
# e modules/live-activity/ é código local (Swift + expo-module.config.json),
# não um pacote de registro.
```

**Version verification:** `@bacons/apple-targets` confirmado via `npm view @bacons/apple-targets version` → `5.0.0`, publicado 2026-07-17 — [VERIFIED: npm registry]. Nenhum outro pacote entra no escopo desta fase.

## Package Legitimacy Audit

> Nenhum pacote NOVO é instalado nesta fase. A auditoria abaixo cobre `@bacons/apple-targets` — já instalado desde a Fase 14, mas central o suficiente para o trabalho desta fase (scaffold do target de Live Activity) para valer a reconfirmação.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@bacons/apple-targets` | npm | publicado 2026-07-17 (versão atual) | ~285k/semana | `github.com/evanbacon/expo-apple-targets` | **[OK]** — `gsd-tools query package-legitimacy check` | Já instalado, aprovado, nenhuma ação |

**Packages removed due to [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** nenhum.

## Architecture Patterns

### System Architecture Diagram

```
┌────────────────────── LOCK SCREEN / DYNAMIC ISLAND ───────────────────────┐
│  targets/session-widget/WidgetLiveActivity.swift (SwiftUI, sem JS)        │
│  ┌──────────────────────────────┐  ┌───────────────────────────────────┐  │
│  │ ActivityConfiguration body:   │  │ dynamicIsland: (4 apresentações)   │  │
│  │  - measuring: reps×carga GDE  │  │  compactLeading/Trailing (D-02):   │  │
│  │  - resting:   timer GDE       │  │    mm:ss durante descanso,         │  │
│  │  - readyOvertime: "+2:30"     │  │    série X/Y fora dele             │  │
│  │  - blockOnly (D-03): nome +   │  │  minimal: idem, mais compacto      │  │
│  │    progresso, sem prescrição  │  │  expanded: leading/trailing/       │  │
│  └──────────────────────────────┘  │    bottom (espelha o Lock Screen)  │  │
└───────────────────────────────────────────────────────────────────────────┘
                 ▲ Activity<SessionActivityAttributes>.update(ContentState)
                 │ push ÚNICO por mudança relevante — nunca por segundo
┌────────────────┴────────────────────────────────────────────────────────┐
│                    MAIN APP TARGET (processo RN 0.81)                    │
│  ┌───────────────────────────┐   ┌─────────────────────────────────────┐│
│  │ modules/live-activity/     │   │ src/native/liveActivitySync.ts (novo)││
│  │  ios/LiveActivityModule.   │◄──┤  ÚNICO escritor: subscribe() no      ││
│  │  swift — start/update/end  │   │  activeSessionStore, traduz diff em  ││
│  │  (molde: native-info/)     │   │  chamada nativa                      ││
│  └─────────────────────────────┘  └───────────────┬───────────────────┘│
│                                                     ▼                    │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ src/store/activeSessionStore.ts (MODIFICADO)                        ││
│  │  + restEndsAt: string | null (ISO, substitui restRemaining/restTotal││
│  │    de SessionPlayer.tsx)                                             ││
│  │  + status 'active'|'finished'|... já existe — sync observa aqui     ││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  App.tsx (root) — NOVO componente-host (molde: ProvisioningBanner.tsx)  │
│    useEffect no mount: Activity<T>.activities → encerra órfãs (D-11),   │
│    depois, se draft ainda ativo, sobe card novo — roda ANTES de         │
│    qualquer navegação, não depende de abrir ActiveSessionScreen         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app.json                                    # MODIFICADO — ios.infoPlist.NSSupportsLiveActivities: true
modules/
└── live-activity/                          # NOVO — molde: modules/native-info/
    ├── expo-module.config.json             #   { platforms: ["apple"], apple: { podspecPath, modules: ["LiveActivityModule"] } }
    ├── index.ts                            #   startActivity/updateActivity/endActivity/isActivityRunning
    ├── ios/
    │   ├── LiveActivityModule.swift        #   Module { Name("LiveActivityModule"); AsyncFunction(...) }
    │   └── SessionActivityAttributes.swift #   CÓPIA — ver Anti-Pattern de drift abaixo
    └── LiveActivityModule.podspec          #   molde: NativeInfoModule.podspec
targets/session-widget/
├── WidgetLiveActivity.swift                # MODIFICADO — hoje é o template emoji; vira o card real
├── expo-target.config.js                   # sem mudança (App Group já congelado, deploymentTarget 17.0 já ok)
└── (widgets.swift, WidgetControl.swift, AppIntent.swift permanecem — home-screen widget fora de escopo, não tocar)
src/
├── native/
│   └── liveActivitySync.ts                 # NOVO — único chamador de modules/live-activity
├── store/
│   └── activeSessionStore.ts               # MODIFICADO — + restEndsAt, + reconciliação de órfãs no boot
├── components/
│   ├── session/SessionPlayer.tsx           # MODIFICADO — lê restEndsAt do store, remove setInterval local (linhas 161-306)
│   └── LiveActivityUnavailableBanner.tsx   # NOVO (D-12) — molde: ProvisioningBanner.tsx
└── engine/sessionSummary.ts                # ajustarDescanso já isolado — tradução p/ timestamp fica em liveActivitySync ou no store
scripts/verify-native-skeleton.sh           # MODIFICADO — checagem (e) precisa incluir o novo módulo local (ver Pitfall 5)
```

### Structure Rationale

- **`modules/live-activity/` copia o molde de `modules/native-info/` linha por linha** (mesmo `expo-module.config.json`, mesmo padrão de `.podspec`) — é o único módulo Expo local que já sobrevive a `expo prebuild --clean` e já está provado no `Podfile.lock` (guardado por `scripts/verify-native-skeleton.sh`). Reinventar a estrutura do módulo é risco sem ganho.
- **`liveActivitySync.ts` como único escritor, mas sem precedente real de `.subscribe()` no repo** — vale registrar: `grep -rn "\.subscribe("` em `src/` não encontrou nenhum uso de Zustand `subscribe()` fora de testes; o padrão "sole writer observando o store" é novo neste código, mesmo sendo a API padrão do Zustand. Tratar como padrão a introduzir, não a copiar de outro lugar do repo.
- **Componente-host no root do `App.tsx`, não dentro de `ActiveSessionScreen.tsx`** — `startOrResume` só é chamado de dentro de `ActiveSessionScreen.tsx` (`grep -rln "startOrResume" src` devolveu só esse arquivo e o próprio store). Se a reconciliação de D-11 rodar só ali, um card órfão sobrevive indefinidamente sempre que o dono reabre o app numa tela diferente (Home, Progresso) sem entrar na sessão. `App.tsx` já tem esse padrão para outro aviso: `ProvisioningBanner` e `PushInviteHost` são montados no root e rodam side-effects no mount, independente de navegação.

### Pattern 1: Card muda de forma por estado, mas o layout scaffold já existe

**What:** `targets/session-widget/WidgetLiveActivity.swift` já tem `ActivityConfiguration(for:)` com o corpo do Lock Screen e `dynamicIsland` com as 4 closures (`compactLeading`/`compactTrailing`/`minimal`/`expanded` via `DynamicIslandExpandedRegion(.leading/.trailing/.bottom)`) — hoje preenchidas com o template "Hello 😀" do `@bacons/apple-targets`. `DynamicIsland(expanded:compactLeading:compactTrailing:minimal:)` exige as 4 closures — não há uma "apresentação opcional" — confirmado via busca cross-checada e já refletido no próprio scaffold.

**When to use:** É a estrutura para as 4 apresentações exigidas por LOCK-01. O trabalho real é trocar o `switch` interno por estado (`measuring`/`resting`/`readyOvertime`/`blockOnly`), não criar a estrutura.

**Example:**
```swift
// targets/session-widget/WidgetLiveActivity.swift — estrutura JÁ presente no repo
// (verificado: Read desta sessão), só o CONTEÚDO das closures muda:
ActivityConfiguration(for: SessionActivityAttributes.self) { context in
    switch context.state.phase {
    case .resting:
        // D-01: timer GRANDE, exercício linha secundária
        Text(timerInterval: Date.now...context.state.restEndsAt!, countsDown: true)
    case .measuring:
        // D-01: prescrição GRANDE (reps × carga, campos NUMÉRICOS — REG-02)
        Text("\(context.state.targetRepsMin)–\(context.state.targetRepsMax) reps")
    case .readyOvertime:
        // D-04: "Pronto · Série 3/4" + tempo excedido crescente desde o zero
        Text(timerInterval: context.state.restEndsAt!...Date.distantFuture, countsDown: false)
    case .blockOnly:
        // D-03: cardio/alongamento — só nome do bloco + progresso, sem prescrição
        Text("\(context.state.blockLabel ?? "") \(context.state.blockIndex ?? 0)/\(context.state.blockTotal ?? 0)")
    }
} dynamicIsland: { context in
    DynamicIsland {
        DynamicIslandExpandedRegion(.leading) { /* espelha o Lock Screen */ }
        DynamicIslandExpandedRegion(.trailing) { /* … */ }
        DynamicIslandExpandedRegion(.bottom) { /* … */ }
    } compactLeading: {
        // D-02: compact prioriza TEMPO durante descanso, série X/Y fora dele
    } compactTrailing: { /* … */
    } minimal: { /* … */ }
}
```
*(pseudo-código combinando o scaffold verificado com as decisões D-01–D-04; não é literal do arquivo atual, que ainda tem o corpo "Hello \(emoji)" — [ASSUMED] a forma exata do `switch`, [VERIFIED: targets/session-widget/WidgetLiveActivity.swift:15-50] a estrutura das 4 closures e dos 3 `DynamicIslandExpandedRegion`.)*

### Pattern 2: `restEndsAt` — timestamp absoluto, nunca segundos restantes, e nunca auto-avança

**What:** `Text(timerInterval: start...end, countsDown:)` renderiza no lado do sistema; precisa de um `ClosedRange<Date>`, não de um inteiro mutável. Hoje (`SessionPlayer.tsx:161-306`) o descanso vive em `useState` local (`restRemaining`, `restTotal`) avançado por `setInterval` a cada 1s, e **auto-avança ao zerar** — `SessionPlayer.tsx:298`: `if (rest && restRemaining === 0) endRest(true);` chama `endRest(true)`, que ativa a próxima série automaticamente (`SessionPlayer.tsx:288-295`). D-09/D-10 revertem esse comportamento: ao zerar, o estado vira "Pronto" (não avança sozinho), e essa regra vale igual com o app em foreground ou a tela bloqueada — não é uma regra "só para a Live Activity", é uma mudança de comportamento do app inteiro.

**When to use:** Todo elemento de tempo da Live Activity (o descanso). O anel visual do app (`ringAnim`, `SessionPlayer.tsx:167-179`) pode continuar existindo, mas precisa derivar de `restEndsAt - now()` a cada frame, não ser a fonte da verdade.

**Trade-offs:** Perder o `setInterval` de 1s como fonte de verdade é só cosmético para o anel do app (ele pode recalcular a cada tick de animação); o que muda de verdade é onde o "zerou" é decidido — cai no store, não em `SessionPlayer.tsx`. `ajustarDescanso` (`src/engine/sessionSummary.ts:65-72`, já isolado, puro) continua servindo para o cálculo de `±30s`, mas passa a operar sobre `Date`/timestamp, não sobre `remaining`/`total` em segundos — tradução direta (delta em segundos somado ao `Date`), não reescrita da lógica.

**Example:**
```typescript
// src/engine/sessionSummary.ts — ASSINATURA ATUAL (verificada, linhas 65-72):
export const ajustarDescanso = (
  remaining: number,
  total: number,
  deltaSeconds: number,
): { remaining: number; total: number } => {
  const novoRestante = Math.max(1, remaining + deltaSeconds);
  return { remaining: novoRestante, total: Math.max(total, novoRestante) };
};
// Tradução para restEndsAt (Claude's Discretion — forma exata do adaptador é do
// planner decidir): o "remaining" vira `restEndsAt.getTime() - Date.now()`, o
// delta some no relógio e volta como novo restEndsAt = now + max(1s, remaining+delta).
```

### Pattern 3: Reduzir o card fora de musculação é um `if` sobre um campo que já existe

**What:** `ExerciseMetric = 'carga_reps' | 'tempo' | 'tempo_distancia'` [VERIFIED: src/engine/sessionModel.ts:18 — `export type ExerciseMetric = 'carga_reps' | 'tempo' | 'tempo_distancia';`]. `isTimeBased(metric)` [VERIFIED: src/engine/sessionModel.ts:277-278 — `export const isTimeBased = (metric: ExerciseMetric | null | undefined): boolean => metric === 'tempo' || metric === 'tempo_distancia';`] já classifica cardio E alongamento/isometria como "medido por tempo" (comentário na própria função: "Exercício medido por tempo (cardio e isometria)"). D-03 ("só blocos de musculação têm card detalhado") mapeia 1:1 para `!isTimeBased(metricOf(exercise))` = detalhado (musculação/`carga_reps`), `isTimeBased(...)` = reduzido (cardio/alongamento).

**When to use:** No `ContentState`, ao montar cada push a partir do exercício ativo. Não precisa de um campo `blockType` novo — deriva do `metric` que já existe no `DraftExercise`.

**Trade-offs:** O "Alongamento 2/6" do exemplo em CONTEXT.md é uma posição DENTRO do bloco de cardio/alongamento — `posicaoDoExercicio` [VERIFIED: src/engine/sessionFlow.ts:24-32] hoje conta a posição do exercício em RELAÇÃO A TODOS os exercícios em jogo (`exerciciosEmJogo`, linha 17-18), não só aos de cardio/alongamento. Não existe hoje uma função "posição dentro do bloco de mesma métrica" — é trabalho novo desta fase, não uma chamada pronta. Sinalizado em Open Questions.

### Pattern 4: `staleDate`/`dismissalPolicy` — três instrumentos, três papéis diferentes

**What:** `staleDate` marca quando o CONTEÚDO deixa de ser confiável (o sistema pode escurecer/tratar como desatualizado) — tem mínimo de ~2min à frente por observação da pesquisa do milestone [CITED: developer.apple.com/documentation/activitykit, cross-checado nesta sessão]. `dismissalPolicy` no `Activity.end(...)` controla quando o card SOME: `.immediate` (agora — D-06 "cancelar"), `.after(Date)` (some numa data futura — D-06 "terminar", resumo por 2–5 min), `.default` (o sistema decide, tipicamente horas — nunca usar para "terminar"/"cancelar" nesta fase). Independente disso, uma Live Activity tem um teto de vida do PRÓPRIO SISTEMA — reportado como 8h ativa + até mais 4h residual no Lock Screen (~12h total) [CITED via WebSearch cross-checada, múltiplas fontes concordantes] — isso é uma rede de segurança adicional ao D-08 (timeout de inatividade de 3h sugerido), não um substituto: o app deve chamar `.end()` explicitamente pelos motivos de produto (D-06/D-08), não confiar no teto do sistema.

**When to use:** `dismissalPolicy: .immediate` no caminho de cancelamento; `.after(Date().addingTimeInterval(...))` no caminho de término (resumo curto primeiro, depois some); nunca `.default` para os dois caminhos de D-06.

**Trade-offs:** Como não existe hoje um `cancelSession()` distinto de `finishSession()` no store [VERIFIED: src/store/activeSessionStore.ts — `grep` por `cancelSession|abandonar` não encontrou nada; a única saída "não vou treinar hoje" é `skipWholeSession` (linha 205-206, docstring `/** "Não vou treinar hoje": recusa a sessão inteira e encerra a tela. */`), que existe para ANTES de começar, não durante], "cancelar a sessão" (D-06) precisa de um sinal claro que hoje não existe no código — ver Open Questions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Contagem regressiva/crescente na tela bloqueada | `Timer`/`setInterval` disparando `Activity.update()` a cada segundo | `Text(timerInterval:...,countsDown:)` — push único por mudança | Já vetado pela pesquisa do milestone (PITFALLS.md Pitfall 7) — throttling real em descansos de 60-180s, bateria |
| Detecção de "bloco de musculação vs cardio/alongamento" | Novo enum `blockType` paralelo ao `metric` | `isTimeBased(metricOf(exercise))`, já existente e testado (`sessionModel.ts:277`) | Campo duplicado diverge do catálogo com o tempo — mesmo risco de drift já documentado para `CARDIO_MODALIDADES` no próprio repo |
| Ponte Swift↔JS para start/update/end da Activity | Wrapper de terceiros (`@kingstinct/react-native-activity-kit`) | Módulo Expo local, molde `modules/native-info/` | Já decidido na pesquisa do milestone (STACK.md) — nenhum wrapper documenta o suficiente para este uso, e o repo já tem o padrão pronto pra copiar |
| Registro de sobrevivência do novo módulo a `--clean` | Confiar visualmente ("funcionou uma vez") | Adicionar `LiveActivityModule` (ou nome escolhido) ao loop da checagem (e) de `scripts/verify-native-skeleton.sh:111` | O próprio script documenta um bug real da Fase 14 que essa checagem existe para pegar: módulo "encontrado" no autolinking mas nunca compilado no `Podfile.lock` |

**Key insight:** Este repositório já tem os dois moldes que esta fase precisa (`modules/native-info/` para o módulo Swift, `ProvisioningBanner.tsx`/`scripts/verify-native-skeleton.sh` para os padrões de aviso discreto e de trava de regressão) — o trabalho novo genuíno é a lógica de estado (`restEndsAt`, reconciliação de órfã), não a integração nativa em si.

## Common Pitfalls

### Pitfall 1: `NSSupportsLiveActivities` falta no app principal, não só no target do widget

**What goes wrong:** A Live Activity falha ao subir com um erro que aponta para "target does not include NSSupportsLiveActivities plist key" — mesmo com o target do widget corretamente escalado.
**Why it happens:** A chave é exigida no `Info.plist` do APP PRINCIPAL, não da extensão — mesmo para Live Activities 100% locais (`pushType: .none`), sem qualquer relação com push [CITED via WebSearch, múltiplas fontes concordantes]. `app.json` hoje só declara `ios.entitlements` (App Group) e `ios.bundleIdentifier`/`appleTeamId` — **nenhuma chave `infoPlist`** [VERIFIED: app.json — arquivo lido nesta sessão por inteiro, seção `"ios"` não contém `infoPlist`].
**How to avoid:** Adicionar `ios.infoPlist.NSSupportsLiveActivities: true` em `app.json` como parte do primeiro plano desta fase — antes de qualquer tentativa de `Activity.request(...)` em device.
**Warning signs:** `Activity.request` lança/retorna erro de "not supported" mesmo com o target certo e o app rodando em device físico com iOS 26.x.
**Phase to address:** Plano 1 desta fase (fundação do módulo/attributes), antes da Sessão 1 física de D-13.

### Pitfall 2: Reconciliação de órfã presa dentro da tela de sessão

**What goes wrong:** D-11 exige "ao reabrir o app após force-quit, encerra toda Live Activity existente" — mas se essa lógica só rodar dentro de `startOrResume` (chamado de `ActiveSessionScreen.tsx`), um dono que reabre o app e vai direto para outra tela (Progresso, Perfil) nunca dispara a reconciliação, e o card órfão sobrevive.
**Why it happens:** `startOrResume` é hoje a ÚNICA porta de entrada de retomada de sessão no código [VERIFIED: `grep -rln "startOrResume" src` retornou só `ActiveSessionScreen.tsx` e `activeSessionStore.ts`] — não há hoje um efeito de boot independente de tela.
**How to avoid:** Rodar a reconciliação (`Activity<T>.activities` → encerrar todas → se draft ainda ativo, subir nova) num componente montado no root do `App.tsx`, no mesmo padrão de `ProvisioningBanner`/`PushInviteHost` (ambos já montados ali, ambos já rodam side-effect no mount independente de navegação).
**Warning signs:** UAT físico (D-13, Sessão 2): force-quit durante a sessão, reabrir o app na aba errada, olhar a tela bloqueada — se o card antigo ainda estiver lá, a reconciliação está presa atrás de uma tela que o dono não visitou.
**Phase to address:** Esta fase — é literalmente o critério de sucesso 4 do ROADMAP.

### Pitfall 3: "Cancelar sessão" não tem hoje um sinal distinto de "terminar sessão" no store

**What goes wrong:** D-06 pede comportamento DIFERENTE para "terminar" (resumo + `dismissalPolicy: .after(...)`) vs "cancelar" (`.immediate`) — mas o store só tem `finishSession()` [VERIFIED: src/store/activeSessionStore.ts:207] e `reset(userId?)` [VERIFIED: linha 215, comentário "reset: (userId?: string | null) => void"], além de `skipWholeSession` para ANTES de começar [VERIFIED: linha 205-206]. Não existe `cancelSession()` nem qualquer chamador de "abandonar sessão em andamento" na UI (`grep` por "Abandonar"/"cancelar sessão"/"Sair do treino" em `src/screens/ActiveSessionScreen.tsx` não encontrou nada).
**Why it happens:** O produto hoje não tem uma ação explícita de "desistir no meio do treino" — o dono só termina (`finishSession`) ou navega para longe sem gravar nada (o que hoje não limpa nada, o rascunho fica pendente para retomada).
**How to avoid:** Este é um ponto que o planner precisa decidir explicitamente, não assumir: (a) mapear "cancelar" para uma AÇÃO NOVA que ainda não existe na UI (fora do escopo desta fase se ninguém pediu), ou (b) mapear "cancelar" para o único sinal que hoje existe de "a sessão não é mais a ativa" — `reset()`/draft virando `null` — e documentar que hoje não há um botão de UI que dispare isso durante uma sessão em andamento, então o critério de sucesso 3 ("ao cancelar a sessão... encerra imediatamente") pode não ter um caminho de UI para testar fisicamente ainda.
**Warning signs:** Se o plano assumir "cancelar" sem apontar qual função do store ele observa, o Plano vai declarar sucesso sobre um caminho que nunca dispara em device.
**Phase to address:** Esta fase — sinalizado também em Open Questions, é uma decisão de escopo, não só técnica.

### Pitfall 4: `SessionActivityAttributes.swift` duplicado diverge entre o módulo e o target

**What goes wrong:** `modules/live-activity/ios/` e `targets/session-widget/` precisam CADA UM da definição do `ActivityAttributes`/`ContentState` — não é um arquivo compartilhado de verdade entre os dois targets (confirmado como padrão do ecossistema `@bacons/apple-targets` pela pesquisa do milestone). Se um campo for adicionado só de um lado, a extensão falha silenciosamente ao decodificar o `ContentState` empurrado.
**Why it happens:** Cada target compila seu próprio código; não há um pacote Swift compartilhado configurado.
**How to avoid:** Manter os dois arquivos como cópias EXATAS deliberadas (mesmo padrão já documentado em ARCHITECTURE.md com `scripts/sync-activity-attrs.sh`), e — Claude's Discretion do CONTEXT.md — decidir se um script de diff-check entra nesta fase ou fica para depois. Dado o histórico do repo de travas de regressão baratas (`verify-native-skeleton.sh`), um `grep -c`/`diff` simples entre os dois arquivos como parte da checagem existente é consistente com o padrão já estabelecido.
**Warning signs:** Build da extensão falha silenciosamente ao decodificar `ContentState`, card mostra dado truncado/padrão em vez do valor real.
**Phase to address:** Esta fase, ao definir o formato do `ContentState` (Claude's Discretion do CONTEXT.md).

### Pitfall 5: `scripts/verify-native-skeleton.sh` não sabe que `modules/live-activity/` existe

**What goes wrong:** A checagem (e) do script — a que prova que um módulo local realmente COMPILOU (`ios/Podfile.lock`), não só foi "encontrado" pelo autolinking — hoje itera só `for modulo_local in NativeInfoModule; do` [VERIFIED: scripts/verify-native-skeleton.sh:111 — `for modulo_local in NativeInfoModule; do`]. Um `modules/live-activity/` que falhe silenciosamente em compilar (mesmo bug documentado no comentário do próprio script, linhas 18-22, já aconteceu uma vez nesta fase 14) passaria pela checagem sem ser pego.
**Why it happens:** O script foi escrito quando só existia um módulo local; não se atualiza sozinho.
**How to avoid:** Adicionar o nome real do novo módulo (`LiveActivityModule`, ou o nome que o plano escolher) à lista da linha 111 como parte do trabalho desta fase.
**Warning signs:** `npm run verify:native` passa, mas o módulo de Live Activity não aparece em tempo de execução no device — mesmo sintoma documentado no comentário do script para o bug original.
**Phase to address:** Esta fase, junto com a criação do módulo.

## Code Examples

### `modules/live-activity/index.ts` (molde direto de `modules/native-info/index.ts`)

```typescript
// Source: modules/native-info/index.ts (verificado nesta sessão, arquivo completo lido)
import { NativeModule, requireNativeModule } from 'expo';

export type LiveActivityContentState = {
  phase: 'measuring' | 'resting' | 'readyOvertime' | 'blockOnly';
  exerciseName: string;
  setIndex: number;
  setTotal: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetLoadKg?: number | null;
  isBodyweight: boolean;
  restEndsAt?: string | null; // ISO — Text(timerInterval:) recebe Date no lado nativo
  blockLabel?: string | null;
  blockIndex?: number | null;
  blockTotal?: number | null;
};

declare class LiveActivityModuleType extends NativeModule<{}> {
  startActivity(state: LiveActivityContentState): Promise<void>;
  updateActivity(state: LiveActivityContentState): Promise<void>;
  endActivity(dismissalPolicy: 'immediate' | 'afterDate', afterSeconds?: number): Promise<void>;
  isActivityRunning(): Promise<boolean>;
}

const LiveActivityModule = requireNativeModule<LiveActivityModuleType>('LiveActivityModule');

export const startLiveActivity = (s: LiveActivityContentState) => LiveActivityModule.startActivity(s);
export const updateLiveActivity = (s: LiveActivityContentState) => LiveActivityModule.updateActivity(s);
export const endLiveActivity = (policy: 'immediate' | 'afterDate', afterSeconds?: number) =>
  LiveActivityModule.endActivity(policy, afterSeconds);
```
*(estrutura calcada no arquivo real `modules/native-info/index.ts`; os nomes dos campos de `LiveActivityContentState` são [ASSUMED] — proposta a confirmar no plano, respeitando só a restrição travada de REG-02: reps/carga como números.)*

### Reconciliação no boot (D-11) — pseudo-Swift do lado do módulo

```swift
// modules/live-activity/ios/LiveActivityModule.swift — chamado no boot via
// liveActivitySync.ts, ANTES de qualquer navegação (App.tsx root)
AsyncFunction("reconcileOrphans") { (stillActiveSessionLogId: String?) -> Bool in
  for activity in Activity<SessionActivityAttributes>.activities {
    await activity.end(dismissalPolicy: .immediate) // D-11: um caminho só, sem tentar decidir se ainda servia
  }
  return stillActiveSessionLogId != nil // sinal para o JS decidir se chama startActivity de novo
}
```
*([ASSUMED] — API real de `Activity<T>.activities` e `.end(dismissalPolicy:)` confirmada via WebSearch cross-checada [CITED], mas a assinatura exata do módulo Expo é proposta de plano, não código existente.)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Rest timer em `useState`/`setInterval` local (`SessionPlayer.tsx`) | `restEndsAt` absoluto no store, renderizado nativamente por `Text(timerInterval:)` | Decisão desta fase (D-09/D-10, LOCK-02) | Muda comportamento visível do app inteiro, não só a tela bloqueada — descanso não auto-avança mais em nenhum contexto |
| App Groups "incerto em time gratuito" (STACK.md, pesquisa do milestone) | App Groups CONFIRMADO disponível (spike D-09 da Fase 14, PASS nas duas direções) | 2026-08-16, `14-SPIKE-APP-GROUPS.md` | Não muda a arquitetura desta fase (que não precisa de App Group para conteúdo — só processo único, push direto), mas remove a incerteza que bloqueava a Fase 16 |

**Deprecated/outdated:**
- A hipótese "App-Group-free" do STACK.md (arquitetura alternativa para o caso de App Groups não estarem disponíveis) está obsoleta — o spike já resolveu essa dúvida a favor de "COM App Group". Não desenhar esse fallback.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Forma exata do `ContentState`/`ActivityAttributes` (campos, nomes) — proposta em Code Examples | Standard Stack, Code Examples | Baixo — é Claude's Discretion explícito no CONTEXT.md; só a restrição de "números, não texto" (REG-02) é travada |
| A2 | `Activity<T>.activities` e `.end(dismissalPolicy:)` têm exatamente a assinatura descrita (cross-checada via WebSearch, não lida em código-fonte da Apple nesta sessão) | Architecture Patterns (Pattern 4), Code Examples | Médio — se a assinatura real divergir sutilmente (ex.: `dismissalPolicy` sendo um parâmetro nomeado diferente), é erro de compilação Swift detectável cedo, não um bug silencioso |
| A3 | staleDate mínimo de ~2min e teto de vida do sistema (~8h ativo + 4h residual) — herdados de ARCHITECTURE.md (pesquisa do milestone) e cross-checados nesta sessão via WebSearch, não confirmados em doc oficial com texto completo lido | Architecture Patterns (Pattern 4) | Baixo para esta fase — nenhuma decisão de produto depende do valor exato (D-08 usa 3h, bem abaixo de qualquer teto reportado); risco só cresceria se um plano tentasse "otimizar" perto do limite |
| A4 | "Cancelar sessão" (D-06) não tem hoje um sinal de UI/store dedicado — pode exigir decisão de escopo do planner/dono antes de codificar | Common Pitfalls (Pitfall 3) | Alto se ignorado — o critério de sucesso 3 do ROADMAP pode não ter caminho de teste físico sem essa decisão |

**Se esta tabela estivesse vazia:** não está — A1-A4 acima precisam de decisão explícita do planner ou confirmação do dono antes de virar plano executável, principalmente A4.

## Open Questions

1. **O que exatamente dispara "cancelar a sessão" (D-06) na UI hoje?**
   - What we know: `finishSession()` existe e é bem entendido; `skipWholeSession()` existe mas é "antes de começar"; `reset()` limpa o estado local sem falar com o servidor.
   - What's unclear: não há hoje nenhum botão/fluxo de "abandonar sessão em andamento" em `ActiveSessionScreen.tsx` — D-06 pode estar descrevendo um comportamento a IMPLEMENTAR (não só a Live Activity reagir a ele), o que expandiria o escopo desta fase para além de "somente leitura, espelho".
   - Recommendation: o plano precisa decidir explicitamente — ou (a) definir que "cancelar" observa `reset()`/draft virando `null`, aceitando que hoje não há caminho de UI que dispare isso durante o treino (e então o critério de sucesso 3 fica sem teste físico completo até uma ação de UI existir), ou (b) tratar como escopo implícito e adicionar o botão/confirmação de "abandonar treino" nesta fase. Vale confirmar com o dono antes do plano, não assumir.
   - **RESOLVED (2026-08-16, revisão do Plano 15-03):** a premissa acima ("`skipWholeSession()` existe mas é 'antes de começar'") estava errada. Evidência ao vivo em `src/store/activeSessionStore.ts:1698-1728`: `skipWholeSession` seta `draft: null` e `status: 'finished'` na MESMA chamada `set()` (linhas 1721-1728, sem frame intermediário), e o próprio comentário inline do store (linhas 1701-1702) confirma "Vale antes de começar (recusar no check-in) e durante a execução". O caminho de UI já existe: o link **"Não vou treinar hoje"** (`testID="recusar-treino-hoje"`, `src/screens/ActiveSessionScreen.tsx:615-625`), visível quando `progresso.done === 0 && !sessionSemNadaAFazer(draft)` — ou seja, durante uma sessão em andamento sem nenhuma série ainda registrada. O Plano 15-03 mapeia "cancelar" (D-06) para esse mesmo `skipWholeSession`, sem UI nova — opção (a) acima, mas SEM a limitação assumida ("sem caminho de UI que dispare isso durante o treino") que motivou a recomendação. Pitfall 3 acima permanece válido como histórico de como o problema foi identificado, mas sua conclusão ("não existe `cancelSession()` distinto... nenhum chamador de 'abandonar sessão em andamento' na UI") está desatualizada no mesmo ponto — o chamador é `skipWholeSession` via "Não vou treinar hoje", só não tinha um consumidor de Live Activity antes do Plano 15-03.

2. **"Alongamento 2/6" — posição dentro de QUAL conjunto?**
   - What we know: `posicaoDoExercicio` conta a posição entre TODOS os exercícios em jogo da sessão, não só os de uma métrica.
   - What's unclear: se o "2/6" do exemplo em CONTEXT.md é a posição só entre exercícios de cardio/alongamento (`isTimeBased`), ou a posição geral reaproveitada mesmo em bloco reduzido.
   - Recommendation: nova função pura (ex. `posicaoNoBlocoDeMetrica`), testável isoladamente como as demais em `sessionFlow.ts` — não reaproveitar `posicaoDoExercicio` sem confirmar a semântica com o dono/CONTEXT, já que o exemplo textual sugere contagem separada.

3. **Sincronia do `SessionActivityAttributes.swift` duplicado — script dedicado ou checagem manual?**
   - What we know: é Claude's Discretion no CONTEXT.md; o repo já tem o padrão de trava barata (`verify-native-skeleton.sh`).
   - What's unclear: se vale a pena um script `diff`/`sync-activity-attrs.sh` dedicado nesta fase ou se um comentário forte + revisão manual basta para o volume de campos desta fase (pequeno, sem botões ainda).
   - Recommendation: decisão de planner — dado que a Fase 16 vai reabrir este mesmo arquivo para adicionar App Intents, um script simples agora paga dividendo cedo; mas não é bloqueante.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | Build do target `session-widget` + módulo Swift | ✓ | 26.6 (build 17F113) — [VERIFIED: `xcodebuild -version` executado nesta sessão] | — |
| CocoaPods | `pod install` do módulo local | ✓ | 1.17.0 — [VERIFIED: `pod --version`] | — |
| Expo CLI | `expo prebuild`/`expo run:ios` | ✓ | 54.0.26 — [VERIFIED: `npx expo --version`] | — |
| iPhone físico do dono (iOS 26.x) | D-13 (Sessão 1 e Sessão 2) — única forma de testar Live Activity/Dynamic Island de verdade | ✗ nesta máquina — só o dono tem o aparelho | — | Nenhum — Live Activity/Dynamic Island não é testável em Simulator para comportamento real de lock screen (herdado da pesquisa do milestone, PITFALLS.md); execução da fase PARA no checkpoint de D-13 até o dono reportar |
| Supabase de produção acessível do device | Sessão 2 do D-13 (treino real) | ✗ — `EXPO_PUBLIC_SUPABASE_URL` aponta hoje para `127.0.0.1:54321` (todo dobrado `backend-supabase-producao-no-aparelho`, ver STATE.md/CONTEXT.md) | — | Sem fallback para a Sessão 2; a Sessão 1 (stack local, sessão de mentira) não depende disso e pode rodar antes |

**Missing dependencies with no fallback:**
- iPhone físico do dono — bloqueia toda verificação real de LOCK-01/02/03; a fase entrega código + Sessão 1 e para no checkpoint conforme D-13.
- Supabase de produção no device — bloqueia especificamente a Sessão 2 (UAT com treino real); é o todo dobrado já registrado em CONTEXT.md, não uma descoberta nova desta pesquisa.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest `^29.7.0` com preset `jest-expo` — [VERIFIED: package.json, `"jest": { "preset": "jest-expo" }`] |
| Config file | `package.json` (`jest` key) |
| Quick run command | `npx jest __tests__/activeSessionStore.test.ts` (ou o novo arquivo de teste do refactor `restEndsAt`) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOCK-02 | `restEndsAt` calculado corretamente ao iniciar descanso, ajustado por `±30s`, "Pronto" ao zerar (sem auto-avançar) | unit | `npx jest __tests__/activeSessionStore.test.ts` | ✅ arquivo existe [VERIFIED: `__tests__/activeSessionStore.test.ts` encontrado] — Wave 0: adicionar casos novos para `restEndsAt`/D-09 |
| LOCK-02 | `ajustarDescanso`/equivalente para timestamp — puro, testável offline | unit | `npx jest __tests__/sessionSummary.test.ts` (confirmar se existe; se não, criar) | ❌ Wave 0 — confirmar/criar arquivo de teste para a tradução de `ajustarDescanso` |
| LOCK-03 | Reconciliação de órfãs no boot — lógica JS (decidir se sobe activity nova) é testável sem device; o `Activity.end()` nativo em si não é | unit (parte JS) + manual (parte nativa) | `npx jest` no novo módulo de sync (mock do módulo nativo) | ❌ Wave 0 — criar teste com mock de `modules/live-activity` |
| LOCK-01, LOCK-03 | Card aparece nas 4 apresentações, some sozinho, sobrevive/recupera de force-quit | manual-only | roteiro físico D-13 (Sessão 1 e 2) — não automatizável (ActivityKit/Dynamic Island não roda em Simulator com fidelidade) | N/A — UAT físico, não teste automatizado |
| D-03 | Card reduzido em bloco de cardio/alongamento (`isTimeBased`) | unit | teste da função que monta `ContentState` a partir de `DraftExercise` | ❌ Wave 0 — nova função, novo teste |

### Sampling Rate

- **Per task commit:** `npx jest <arquivo relevante>` (rápido, sem device)
- **Per wave merge:** `npm test` (suíte completa) — build Swift NÃO entra no CI, verificado manualmente via `npm run verify:native` e no device
- **Phase gate:** Suíte completa verde + `npm run verify:native` OK + Sessão 1/2 físicas do D-13 reportadas PASS pelo dono, antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Casos novos em `__tests__/activeSessionStore.test.ts` cobrindo `restEndsAt`, D-09 (não auto-avança), D-08 (timeout de inatividade)
- [ ] Teste para a tradução de `ajustarDescanso` (ou função nova) operando sobre timestamp em vez de segundos restantes
- [ ] Teste (com mock de `modules/live-activity`) para a lógica JS de reconciliação de órfãs — o que decide "encerra + sobe nova" vs "encerra só"
- [ ] Teste para a função que decide `phase` (`measuring`/`resting`/`readyOvertime`/`blockOnly`) e monta o `ContentState` a partir do `DraftExercise`/`DraftSet` ativo — pura, sem I/O, mesmo padrão de `sessionModel.ts`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | não | Nenhuma mudança de autenticação nesta fase |
| V3 Session Management | não (sessão de TREINO, não sessão de autenticação — nome colidente, sem relação com ASVS V3) | — |
| V4 Access Control | não | App pessoal, single-user, sem distribuição a terceiros (já fora de escopo por REQUIREMENTS.md) |
| V5 Input Validation | marginal | A Live Activity é somente leitura — nenhum input do usuário entra por ela nesta fase (sem `TextField`, sem botões); validação relevante já existe no lado que ESCREVE (`completeSet`, etc.), não tocado aqui |
| V6 Cryptography | não | Nenhum dado criptografado novo |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Vazamento de dado sensível para o processo da extensão (superfície menor, menos controlada) | Information Disclosure | Já documentado na pesquisa do milestone (PITFALLS.md, Security Mistakes): `ContentState` deve carregar só os campos mínimos que o card precisa renderizar (nome do exercício, série, reps/carga alvo, timestamp) — nunca token de auth, plano completo, ou dado de outro usuário. Como esta fase não usa App Group para conteúdo (push direto via `Activity.update()`), a superfície é ainda menor que a arquitetura original previa |
| Entitlement de push vazando para o target e quebrando a assinatura | Denial of Service (build) | Já coberto por `scripts/verify-native-skeleton.sh` checagem (c) — nenhuma mudança necessária, só reconfirmar que continua passando após esta fase |

## Sources

### Primary (HIGH confidence)
- Leitura direta do código-fonte nesta sessão: `src/components/session/SessionPlayer.tsx`, `src/store/activeSessionStore.ts`, `src/engine/sessionModel.ts`, `src/engine/sessionFlow.ts`, `src/engine/sessionSummary.ts`, `src/constants/cardioModalidades.ts`, `app.json`, `targets/session-widget/*.swift`, `modules/native-info/*`, `scripts/verify-native-skeleton.sh`, `src/components/ProvisioningBanner.tsx`, `App.tsx`
- `npm view @bacons/apple-targets version` — registro npm, HIGH confidence
- `xcodebuild -version`, `pod --version`, `npx expo --version` — ambiente local, HIGH confidence
- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` — evidência de device física já colhida (Fase 14), HIGH confidence dentro do projeto

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`, `SUMMARY.md` (pesquisa do milestone, 2026-08-15) — MEDIUM, já rotulada assim pela própria pesquisa
- WebSearch cross-checada (2+ fontes concordantes) nesta sessão: `Text(timerInterval:)`, `dismissalPolicy`/`staleDate`, `Activity<T>.activities`, `DynamicIsland` 4 regiões, `NSSupportsLiveActivities` no app principal, teto de vida de ~8h/12h da Live Activity

### Tertiary (LOW confidence)
- Nenhuma citação de fonte única não-cross-checada usada como base de decisão nesta pesquisa

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nada novo a instalar, `@bacons/apple-targets` reconfirmado via registro
- Architecture: MEDIUM — mecânica ActivityKit cross-checada, mas o encaixe no store/telas existentes (reconciliação no boot, ausência de "cancelar sessão") é achado de leitura de código desta sessão, ainda não validado por device
- Pitfalls: MEDIUM-HIGH — pitfalls 1, 2, 3, 5 vêm de leitura direta de código com citação de linha; pitfall 4 vem da pesquisa do milestone

**Research date:** 2026-08-16
**Valid until:** ~30 dias para a parte de código (Standard Stack, Architecture) — reconfirmar se `activeSessionStore.ts`/`SessionPlayer.tsx` mudarem de novo antes do plano rodar; ~7 dias para qualquer claim de comportamento exato do ActivityKit não cross-checado contra doc oficial com texto completo (staleDate mínimo exato, teto de 8h/12h) — reverificar em device na Sessão 1 do D-13, que é a fonte de verdade real para este projeto.
