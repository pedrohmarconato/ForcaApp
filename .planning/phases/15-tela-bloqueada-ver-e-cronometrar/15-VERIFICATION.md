---
phase: 15-tela-bloqueada-ver-e-cronometrar
verified: 2026-08-17T20:44:17Z
status: gaps_found
score: 3/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
requirements_covered:
  LOCK-01: blocked
  LOCK-02: satisfied
  LOCK-03: blocked
next_action: "/gsd-plan-phase 15 --gaps"
gaps:
  - truth: "Quando o descanso expira sem interação, o card muda de resting para Pronto/readyOvertime."
    status: failed
    reason: "O subscriber só publica em mudanças do store; não agenda uma atualização em restEndsAt. O widget mantém context.state.phase == .resting após o contador zerar."
    artifacts:
      - path: "src/native/liveActivitySync.ts"
        issue: "Linhas 28-35 só agendam timeout de inatividade de 3h; linhas 166-185 chamam publishUpdate apenas após mutação do store."
    missing:
      - "Agendar um único update associado a sessionLogId/restEndsAt e cancelá-lo/substituí-lo nas mudanças de sessão, término e unsubscribe."
      - "Teste com fake timers para resting -> readyOvertime sem activateSet nem mutação externa."
  - truth: "Depois que o descanso expira, o tempo excedido cresce até +59:59 no card nativo."
    status: failed
    reason: "overtimeText materializa Date.now em String uma única vez; não há TimelineView nem outro mecanismo de reavaliação periódica no widget."
    artifacts:
      - path: "targets/session-widget/WidgetLiveActivity.swift"
        issue: "Linhas 27-35 calculam String; linhas 101-108 apenas exibem a String calculada."
    missing:
      - "Renderização temporal (por exemplo TimelineView periódico) que passe a data corrente ao formatador clampado."
      - "Teste do formatador nas bordas 0, +59:59 e acima do teto."
  - truth: "Uma sessão que continua active após o timeout de inatividade volta a ter Live Activity quando o draft muda."
    status: failed
    reason: "Após endLiveActivity, updateLiveActivity pode retornar false; publishUpdate apenas deixa de rearmar o timeout e não chama startLiveActivity."
    artifacts:
      - path: "src/native/liveActivitySync.ts"
        issue: "Linhas 71-82 não têm fallback para startLiveActivity quando updated é false."
    missing:
      - "Fallback protegido por sessionLogId/status active para recriar uma Activity após update=false."
      - "Teste: timeout -> mutação do draft de sessão ainda active -> novo startLiveActivity."
  - truth: "O app continua inicializável em Android e web, onde LiveActivityModule não existe."
    status: failed
    reason: "O App importa o sync incondicionalmente; ele importa o bridge, que chama requireNativeModule no topo. O módulo é declarado somente para Apple."
    artifacts:
      - path: "App.tsx"
        issue: "Linhas 15-18 importam liveActivitySync sem guarda de plataforma."
      - path: "modules/live-activity/index.ts"
        issue: "Linha 20 chama requireNativeModule('LiveActivityModule') no carregamento."
      - path: "modules/live-activity/expo-module.config.json"
        issue: "Linha 2 declara platforms: [apple]."
    missing:
      - "Bridge opcional/stubs por plataforma, ou carregamento condicionado a iOS."
      - "Testes de importação de App/sync com Platform.OS android e web sem mock do módulo."
  - truth: "Três horas sem série registrada encerram a Activity mesmo que o aluno apenas edite o rascunho."
    status: failed
    reason: "Toda alteração de draft dispara publishUpdate e toda atualização bem-sucedida reinicia o timeout, inclusive carga, reps, RIR e ajuste de descanso; isso contradiz o contrato 'sem nenhuma série registrada'."
    artifacts:
      - path: "src/native/liveActivitySync.ts"
        issue: "Linhas 74-78 reiniciam o timeout para qualquer update bem-sucedido; linhas 183-185 publicam para toda troca de referência do draft."
      - path: "__tests__/liveActivitySync.test.ts"
        issue: "O teste 'reinicia o timeout quando uma atualização da Activity conclui' (linhas 299-322) fixa o comportamento incorreto em vez de distinguir completeSet de edição."
    missing:
      - "Rearmar somente no start e quando a transição representa uma nova série done, preservando o prazo em edições sem conclusão."
      - "Teste que altera apenas reps/carga antes do prazo e confirma o disparo na janela original."
---

# Phase 15: Tela bloqueada — ver e cronometrar — Verification Report

**Phase Goal:** A tela bloqueada mostra a sessão de treino ao vivo — exercício atual, série e timer de descanso nativo — no Lock Screen, sem abrir o app, e a Live Activity se encerra sozinha quando a sessão termina ou é cancelada (inclusive após force-quit).

**Verified:** 2026-08-17T20:44:17Z  
**Status:** `gaps_found`  
**Re-verification:** Não — verificação inicial

## Resultado

O ciclo principal foi comprovado no iPhone do dono, mas a implementação atual tem cinco lacunas observáveis no código que invalidam comportamentos exigidos pela fase. As alegações CR-01 a CR-04 do review foram todas **confirmadas**, não apenas repetidas.

## Evidência física explícita

Esta verificação trata os resultados abaixo como a UAT física explícita fornecida pelo dono (também registrada em `15-06-SUMMARY.md`), e não como inferência de build:

| Item | Resultado | Uso na verificação |
| --- | --- | --- |
| `card_ao_vivo` | PASS | Confirma o fluxo básico de card com treino real no aparelho. |
| `termina_sozinho` | PASS | Confirma o caminho de finalização testado no aparelho. |
| `cancela_imediato` | PASS | Confirma o cancelamento imediato testado no aparelho. |
| `reconciliacao_force_quit` | PASS | Confirma a reconciliação do cenário físico exercitado. |
| `aviso_indisponivel` | N-A | Aceito pelo checkpoint; não é contado como PASS de disponibilidade. |

Esses PASS não anulam contradições reproduzíveis pela leitura do código: a UAT não cobriu o timeout de três horas seguido de retomada, a transição autônoma `resting -> readyOvertime`, nem Android/web.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Durante sessão ativa, o Lock Screen mostra exercício, série e prescrição. | ✗ FAILED | `card_ao_vivo=PASS` cobre o caminho inicial; porém, após o timeout de inatividade a sessão continua `active` e `publishUpdate()` não recria uma Activity quando `updateLiveActivity()` devolve `false` (`liveActivitySync.ts:71-82`). |
| 2 | O descanso usa `restEndsAt` absoluto e conta nativamente com o app suspenso, sem tick JS para ActivityKit. | ✓ VERIFIED | `completeSet()` grava ISO UTC (`activeSessionStore.ts:1341-1346`); o widget usa `Text(timerInterval:)` (`WidgetLiveActivity.swift:61-68`); `card_sobe=PASS` e `timer_nunca_auto_avanca=PASS` da Sessão 1 confirmam o comportamento no iPhone. |
| 3 | Finalizar ou cancelar remove o card sem deixá-lo preso. | ✓ VERIFIED | O subscriber distingue draft preservado e nulo (`liveActivitySync.ts:108-132`), chamando `afterDate(180)` ou `immediate`; UAT: `termina_sozinho=PASS`, `cancela_imediato=PASS`. |
| 4 | Após force-quit, reabrir encerra órfãos e repõe somente a sessão ainda ativa. | ✓ VERIFIED | `App.tsx:29-32` chama reconciliação; `liveActivitySync.ts:135-161` aplica guarda por `sessionLogId`; UAT: `reconciliacao_force_quit=PASS`. |
| 5 | Ao vencer `restEndsAt`, o mesmo card passa autonomamente de `resting` a `readyOvertime`/“Pronto”. | ✗ FAILED — BLOCKER | `buildLiveActivityContentState()` sabe derivar a fase (`liveActivityContentState.ts:76-79`), mas o único caminho de `publishUpdate()` é uma mutação do store (`liveActivitySync.ts:166-185`). Não há timeout de expiração do descanso. **CR-01 confirmada.** |
| 6 | O overtime mostrado cresce até `+59:59`. | ✗ FAILED — BLOCKER | `overtimeText()` calcula `Date.now` em String uma vez (`WidgetLiveActivity.swift:27-35`), sem `TimelineView`; `overtimeValue()` só exibe esse valor (`101-108`). **CR-02 confirmada.** |
| 7 | Android/web não falham ao carregar uma feature exclusiva de iOS. | ✗ FAILED — BLOCKER | `App.tsx` importa o sync sem guarda; o bridge executa `requireNativeModule` no topo (`modules/live-activity/index.ts:20`), mas o config limita o módulo a Apple. O próprio Expo documenta/implementa `requireNativeModule` como throw quando o módulo não existe (`node_modules/expo-modules-core/src/requireNativeModule.ts:13-23`). **CR-03 confirmada.** |
| 8 | Sem série registrada por 3h, a Activity encerra mesmo havendo apenas edições; após timeout, uma edição de sessão active restabelece o card. | ✗ FAILED — BLOCKER | Qualquer update bem-sucedido rearma o timeout (`liveActivitySync.ts:74-78`), e `update=false` não gera start de fallback (`71-82`). **CR-04 confirmada**; WR-02 também é confirmada. |

**Score:** 3/8 truths verified (0 present-but-behavior-unverified).

### Required Artifacts

| Artifact | Expected | L1/L2/L3/L4 status | Details |
| --- | --- | --- | --- |
| `src/native/liveActivitySync.ts` | Escritor único JS → ActivityKit e ciclo de vida | EXISTS / SUBSTANTIVE / WIRED / PARTIAL | Assina Zustand e chama bridge; os ramos normal de término, cancelamento e boot funcionam. Faltam o agendamento de expiração, o fallback `update=false` e a semântica correta do timeout. |
| `src/engine/liveActivityContentState.ts` | Derivação pura de estado | EXISTS / SUBSTANTIVE / WIRED / FLOWING | Deriva `resting`, `readyOvertime`, `blockOnly` e `measuring` de dados reais do draft; a derivação não é acionada autonomamente no instante de expiração. |
| `modules/live-activity/index.ts` + Swift | Bridge nativa ActivityKit | EXISTS / SUBSTANTIVE / WIRED / PARTIAL | Start/update/end/reconcile são implementados e ligados ao módulo Swift; o carregamento é inseguro fora de iOS. |
| `targets/session-widget/WidgetLiveActivity.swift` | Lock Screen nativo | EXISTS / SUBSTANTIVE / WIRED / PARTIAL | Consome `context.state`, usa `Text(timerInterval:)` para descanso; o overtime é uma string congelada. |
| `src/components/LiveActivityUnavailableBanner.tsx` | Aviso único e não bloqueante | EXISTS / SUBSTANTIVE / WIRED / FLOWING | Montado em `App.tsx:50`, assina a falha de start e tem testes; UAT foi N-A. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `App.tsx` | `liveActivitySync.ts` | mount effect | ✓ WIRED | `reconcileOrphanActivities()` e `initLiveActivitySync()` em `App.tsx:29-32`. |
| Zustand active-session store | `liveActivitySync.ts` | `subscribe` | ✓ WIRED | `initLiveActivitySync()` assina mudanças em `liveActivitySync.ts:166-185`. |
| Sync | Expo/Swift bridge | `start/update/end/reconcile` | ✓ WIRED | Imports e chamadas diretas em `liveActivitySync.ts:1-6,57,74,120,128,143`. |
| Swift bridge | widget | `SessionActivityAttributes.ContentState` | ✓ WIRED | Os contratos duplicados são idênticos e o widget recebe `context.state`. |
| `restEndsAt` | update nativo na expiração | timeout/atualização única | ✗ NOT_WIRED | Nenhum agendamento para o prazo do descanso existe; só há timeout de inatividade de 3h. |
| `updateLiveActivity === false` | `startLiveActivity` | fallback de recuperação | ✗ NOT_WIRED | O resultado false é ignorado, mantendo a sessão ativa sem card. |

### Data-Flow Trace (Level 4)

`completeSet()` persiste `restEndsAt` em UTC → a mutação do Zustand chega ao subscriber → `buildLiveActivityContentState()` produz dados reais → bridge Swift atualiza `Activity` → `WidgetLiveActivity` renderiza `context.state`. O fluxo é real no início e nas mutações, corroborado pelo card físico PASS. Ele fica oco em dois momentos sem mutação: o vencimento de `restEndsAt` e a retomada após o timeout, porque não há produtor de atualização/fallback nesses pontos.

## Review adversarial: CR-01 a CR-04

| Achado | Veredito | Evidência direta |
| --- | --- | --- |
| CR-01 — não entra em `readyOvertime` | **CONFIRMADO (BLOCKER)** | Não existe timeout de `restEndsAt`; a única chamada `setTimeout` é o timeout de 3h (`liveActivitySync.ts:28-35`); `publishUpdate` depende de mutação do store. |
| CR-02 — overtime congelado | **CONFIRMADO (BLOCKER)** | `Date.now` é transformado em String em `overtimeText`; não há `TimelineView` no widget. |
| CR-03 — import iOS derruba Android/web | **CONFIRMADO (BLOCKER)** | O bridge obrigatório é avaliado no import, o módulo só tem plataforma Apple e `requireNativeModule` lança quando ausente. |
| CR-04 — não recria após timeout | **CONFIRMADO (BLOCKER)** | `updateLiveActivity` false apenas impede reset do timer; não existe chamada condicional a `startLiveActivity`. |

### Revisão de warnings

| Achado | Veredito | Impacto |
| --- | --- | --- |
| WR-01 — exercício `skippedByUser` ainda selecionável | **CONFIRMADO (WARNING)** | `findActiveSet` e `findNextPendingSet` só filtram `cutByReplan` (`sessionModel.ts:290-305`), embora `exercicioForaDeJogo` também cubra `skippedByUser` (`583-585`). O card pode apontar para exercício recusado. |
| WR-02 — timeout é rearmado por qualquer edição | **CONFIRMADO (BLOCKER)** | Contraria literalmente a verdade do Plano 15-03 “sem nenhuma série registrada por 3h”. O teste verde de linhas 299-322 de `liveActivitySync.test.ts` valida a regra errada, portanto não é evidência de D-08. |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Contratos de sincronização, content state, banner, transição do player e fluxo | `npx jest __tests__/liveActivitySync.test.ts __tests__/liveActivityContentState.test.ts __tests__/LiveActivityUnavailableBanner.test.tsx __tests__/sessionPlayerTransitions.test.tsx __tests__/sessionFlow.test.ts --runInBand` | 5 suítes, 39 testes passaram | ✓ PASS, mas cobertura insuficiente para CR-01–CR-04/WR-02 |
| Tipagem | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Esqueleto nativo | `npm run verify:native` | 2/2 rodadas OK | ✓ PASS |
| Importação Android/web sem mock | nenhum teste existente | não exercitado; leitura de `requireNativeModule` prova throw | ✗ FAIL |

## Requirements Coverage

| Requirement | Source plans | Status | Evidence |
| --- | --- | --- | --- |
| LOCK-01 | 15-01, 15-02, 15-04, 15-05, 15-06 | ✗ BLOCKED | O card inicial e em treino real passou no iPhone, mas uma sessão ainda `active` não recupera o card depois do timeout de inatividade (CR-04). WR-01 também pode publicar exercício recusado. |
| LOCK-02 | 15-01, 15-04, 15-05, 15-06 | ✓ SATISFIED | `restEndsAt` UTC no store, `Text(timerInterval:)` no widget, sem update JS por segundo, e UAT física de timer PASS. |
| LOCK-03 | 15-03, 15-04, 15-06 | ✗ BLOCKED | Finalização, cancelamento e force-quit passaram no UAT e têm caminhos corretos; porém, o contrato D-08 de inatividade é implementado incorretamente (WR-02), deixando o ciclo de vida incompleto. |

Não há requisitos órfãos: `REQUIREMENTS.md` mapeia LOCK-01, LOCK-02 e LOCK-03 para a Fase 15, e todos foram avaliados.

## Anti-Patterns Found

| File | Lines | Pattern | Severity | Impact |
| --- | --- | --- | --- |
| `src/native/liveActivitySync.ts` | 28-35, 166-185 | Evento temporal crítico sem produtor de update | 🛑 BLOCKER | O card não troca para pronto no vencimento. |
| `targets/session-widget/WidgetLiveActivity.swift` | 27-35, 101-108 | `Date.now` materializado em String estática | 🛑 BLOCKER | O overtime não evolui. |
| `modules/live-activity/index.ts` | 20 | Módulo nativo obrigatório exclusivo de Apple | 🛑 BLOCKER | Android/web podem falhar no bootstrap. |
| `__tests__/liveActivitySync.test.ts` | 299-322 | Teste verde especifica o comportamento oposto ao contrato D-08 | 🛑 BLOCKER | A suíte não protege o prazo de três horas sem série concluída. |

Não foram encontrados marcadores de dívida sem referência (`TBD`, `FIXME` ou `XXX`) nos arquivos de implementação verificados.

## Gaps Summary

Há uma discrepância material entre o PASS físico informado e o comportamento que o código atual necessariamente executa em caminhos não cobertos pela UAT: não há mecanismo para trocar a fase ao expirar o descanso, o overtime não é temporal, a Activity não se recupera após timeout e o bootstrap não é seguro fora do iOS. Não há evidência de que fases 16 ou 17 resolvam essas lacunas; a Fase 16 depende expressamente da implementação correta da Fase 15. Portanto, nenhum item foi deferido.

**Escalation Gate:** corrigir os cinco gaps e repetir pelo menos os testes direcionados e a UAT física dos caminhos alterados antes de declarar LOCK-01/LOCK-03 concluídos.

---

_Verified: 2026-08-17T20:44:17Z_  
_Verifier: the agent (gsd-verifier)_
