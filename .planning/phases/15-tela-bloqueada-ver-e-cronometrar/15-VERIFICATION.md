---
phase: 15-tela-bloqueada-ver-e-cronometrar
verified: 2026-08-19T21:12:29Z
status: human_needed
score: 4/8 must-haves verified
behavior_unverified: 4
overrides_applied: 0
requirements_covered:
  LOCK-01: human_needed
  LOCK-02: satisfied
  LOCK-03: human_needed
next_action: "UAT física do dono no iPhone — checkpoint bloqueante do Plano 15-09 Task 2 (rest_to_ready_overtime, inactivity_timeout_recovery, no_resurrection_after_finish_cancel)"
re_verification:
  previous_status: gaps_found
  previous_score: 3/8
  gaps_closed:
    - "Truth 5 — resting -> readyOvertime autônomo (CR-01): RestPhaseResolver.swift + TimelineView periódico (Plano 15-07)"
    - "Truth 6 — overtime cresce até +59:59 (CR-02): OvertimeFormatter.swift + TimelineView periódico (Plano 15-07)"
    - "Truth 1 (parte de recuperação) — sessão active recria a Activity após update=false (CR-04): recoverAfterFailedUpdate() (Plano 15-08)"
    - "Truth 7 — Android/web não falham ao carregar módulo exclusivo de iOS (CR-03): requireOptionalNativeModule gated por Platform.OS === 'ios' (Plano 15-09) + irmão do mesmo bug em modules/native-info corrigido à parte (commits f88b7c3/1328aaa, referidos no projeto como 15-09b)"
    - "Truth 8 — timeout de 3h substituído só por série done, não por qualquer edição (WR-02): hasNewlyDoneSet() (Plano 15-08)"
    - "WR-01 (warning do review) — exercício skippedByUser deixa de ser selecionável em findActiveSet/findNextPendingSet: exercicioForaDeJogo() (Plano 15-08)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Truth 1 — uma sessão que continua active após o timeout de inatividade volta a ter Live Activity quando o draft muda"
    test: "No iPhone: deixar a sessão 3h sem nenhuma série concluída até a Activity encerrar por inatividade; em seguida editar reps, carga, RIR ou o ajuste de descanso de uma série ainda active."
    expected: "O card reaparece na tela bloqueada com o draft atual, sem exigir reabertura do app."
    why_human: "Depende de ActivityKit real recriar a Live Activity via Activity.request com o processo em segundo plano; o teste automatizado usa fake timers e um bridge mockado (D-13/D-14 do projeto — cenário não reprodutível em simulador)."
  - truth: "Truth 5 — ao vencer restEndsAt, o mesmo card passa sozinho de resting para Pronto/readyOvertime"
    test: "No iPhone: iniciar um descanso curto, bloquear a tela e deixar o prazo vencer sem tocar no aparelho."
    expected: "O card muda para 'Pronto' na tela bloqueada no instante exato do vencimento, sem desbloqueio."
    why_human: "TimelineView(.periodic) é mecanismo real do WidgetKit; o comportamento de tick em produção (throttling do sistema, Low Power Mode, app suspenso) só é observável no aparelho físico — o harness Swift prova a lógica pura, não o repaint do sistema."
  - truth: "Truth 6 — o overtime mostrado cresce até +59:59"
    test: "No mesmo roteiro acima, seguir com o card visível além do vencimento do descanso."
    expected: "O contador +m:ss cresce a cada tick visível até o teto +59:59."
    why_human: "Mesmo mecanismo de TimelineView real; scripts/verify-live-activity-overtime.sh prova só as fronteiras lógicas do formatador, não o repaint do WidgetKit no Lock Screen."
  - truth: "Truth 8 — sem série registrada por 3h a Activity encerra mesmo com edições; e uma sessão active recém-editada não ressuscita indevidamente após finish/cancel"
    test: "Roteiro do Plano 15-09 Task 2: (a) editar só reps/carga/RIR/descanso perto do prazo de 3h e confirmar que a Activity encerra no prazo original, sem adiamento; (b) finalizar ou cancelar a sessão bem no instante de uma tentativa de recuperação e confirmar que nenhum card reaparece."
    expected: "(a) Activity encerra no prazo original apesar das edições. (b) Nenhum card ressuscita para sessão já finalizada ou cancelada."
    why_human: "Ciclo de vida real de ActivityKit (Activity.end, corrida entre update assíncrono e finish/cancel) só é observável no processo do iOS; é literalmente o checkpoint bloqueante do Plano 15-09 (autonomous: false), ainda sem resposta do dono."
human_verification:
  - test: "rest_to_ready_overtime — iniciar um descanso curto, bloquear a tela, deixar vencer sem tocar no app e continuar a observar o card."
    expected: "O card muda sozinho de 'em descanso' para 'Pronto' no instante do vencimento e o overtime cresce em +m:ss até +59:59."
    why_human: "TimelineView periódico do WidgetKit real; D-13/D-14 do projeto já registram que ActivityKit/Lock Screen não é reproduzível em simulador ou Jest."
  - test: "inactivity_timeout_recovery — deixar uma sessão active 3h sem nenhuma série concluída até a Activity encerrar; depois editar reps/carga de uma série ainda active."
    expected: "O card volta a aparecer na tela bloqueada e reflete o draft atual."
    why_human: "Depende de Activity.request real que recria a Live Activity a partir de update=false; o teste automatizado usa bridge mockado."
  - test: "no_resurrection_after_finish_cancel — finalizar ou cancelar a sessão exatamente durante uma tentativa de recuperação pós-timeout."
    expected: "Nenhum card ressuscita para a sessão já encerrada."
    why_human: "Corrida real entre a promise de updateLiveActivity e a mudança de status no store só existe no processo do iOS; o teste automatizado prova a guarda lógica (sessionLogId + status active), não a corrida real do sistema."
---

# Phase 15: Tela bloqueada — ver e cronometrar — Verification Report

**Phase Goal:** A tela bloqueada mostra a sessão de treino ao vivo — exercício atual, série e timer de descanso nativo — no Lock Screen, sem abrir o app, e a Live Activity se encerra sozinha quando a sessão termina ou é cancelada (inclusive após force-quit).

**Verified:** 2026-08-19T21:12:29Z
**Status:** `human_needed`
**Re-verification:** Sim — após o fechamento dos gaps pelos Planos 15-07, 15-08 e 15-09 (mais o commit avulso 15-09b)

## Ressalva crítica (Escalation Gate)

`15-REVIEW.md` marca os seis achados (CR-01..CR-04, WR-01, WR-02) como resolvidos, mas o próprio texto de resolução carrega a ressalva: o Escalation Gate exige UAT física dos caminhos alterados antes de declarar LOCK-01/LOCK-03 concluídos. Essa UAT é a Task 2 do Plano 15-09 (`autonomous: false`, `checkpoint:human-verify`, `gate="blocking"`) e continua sem resposta do dono — `15-09-SUMMARY.md` registra `status: checkpoint-pending` e `requirements-completed: []` de propósito.

Por isso esta verificação **não** declara `passed`. O código está íntegro e coberto por teste para os quatro gaps e os dois warnings do review anterior, mas as invariantes que ele fecha são transições de estado de ActivityKit/Lock Screen — a mesma classe de comportamento que o projeto já documentou (D-13/D-14) como não reprodutível fora do aparelho físico. O resultado é `human_needed`, com os três roteiros físicos nomeados no checkpoint do 15-09 listados abaixo, não inferidos como concluídos por teste automatizado.

## Nota de concorrência

No início desta verificação o worktree principal já continha `15-REVIEW.md` e `16-VERIFICATION.md` modificados e não commitados (fora do escopo desta tarefa — não editados aqui). `npx jest` reportou colisões de haste-map contra `.claude/worktrees/agent-ae137084b71853a62/` (arquivos espelhados de outro agente ativo na Fase 16); as suítes rodaram e passaram contra os arquivos do `rootDir` do clone principal, não contra o worktree. Toda leitura de código nesta verificação é do estado atual do `main`.

## Comandos automatizados exigidos pelo checkpoint

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | exit 0, sem saída |
| `npx jest __tests__/liveActivityPlatformImport.test.ts __tests__/liveActivitySync.test.ts __tests__/sessionModel.test.ts __tests__/liveActivityContentState.test.ts __tests__/nativeModulePlatformImport.test.ts --runInBand` | 5 suítes / 110 testes, todos PASS |
| `bash scripts/verify-live-activity-overtime.sh` | exit 0 — fronteiras antes/no/depois de `restEndsAt`, bordas do formatador (0, 3599, acima do teto), inspeção de fonte (TimelineView presente, sem setTimeout/updateLiveActivity) |

Saída literal do jest (cabeçalho de colisão de haste-map omitido do corpo, reproduzido na Nota de concorrência acima):

```
PASS __tests__/nativeModulePlatformImport.test.ts
PASS __tests__/liveActivityPlatformImport.test.ts
PASS __tests__/liveActivityContentState.test.ts
PASS __tests__/liveActivitySync.test.ts
PASS __tests__/sessionModel.test.ts

Test Suites: 5 passed, 5 total
Tests:       110 passed, 110 total
Snapshots:   0 total
Time:        0.636 s, estimated 4 s
```

Todos os cinco arquivos de teste pedidos existem no repositório — nenhum precisou ser substituído.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Durante sessão ativa, o Lock Screen mostra exercício, série e prescrição — inclusive quando a Activity precisa ser recriada após o timeout de inatividade. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | O caminho básico já tinha PASS físico (`card_ao_vivo`, Sessão 2). O caminho de recuperação (CR-04) agora existe: `recoverAfterFailedUpdate()` em `src/native/liveActivitySync.ts:102-119`, guardado por `sessionLogId`+`status active`, chamado de `publishUpdate()` (:121-133) quando `updateLiveActivity` resolve `false`. Testes `depois do timeout, update=false recria a Activity...` e `finish antes de update=false resolver impede recriar...` (`__tests__/liveActivitySync.test.ts:365-427`) passam. Recriação real de `Activity` no processo iOS não é testável fora do aparelho. |
| 2 | O descanso usa `restEndsAt` absoluto e conta nativamente com o app suspenso, sem tick JS para ActivityKit. | ✓ VERIFIED | Sem alteração desde a verificação anterior: `activeSessionStore.ts` grava ISO absoluto (linhas 624, 1308, 1632-1636); `Text(timerInterval:)` em `WidgetLiveActivity.swift:113`; UAT física `timer_nunca_auto_avanca=PASS`. |
| 3 | Finalizar ou cancelar remove o card sem deixá-lo preso. | ✓ VERIFIED | `publishFinished()` inalterado (`liveActivitySync.ts:169-193`) — distingue draft preservado (`afterDate`, 180s) de draft nulo (`immediate`); UAT física `termina_sozinho=PASS`, `cancela_imediato=PASS`. |
| 4 | Após force-quit, reabrir encerra órfãos e repõe somente a sessão ainda ativa. | ✓ VERIFIED | `reconcileOrphanActivities()` inalterado (`liveActivitySync.ts:196-222`); `App.tsx` mantém a chamada no boot (agora sob guarda `Platform.OS === 'ios'`, linha 39-50); UAT física `reconciliacao_force_quit=PASS`. |
| 5 | Ao vencer `restEndsAt`, o mesmo card passa autonomamente de `resting` a `readyOvertime`/"Pronto". | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Fechado no Swift: `RestPhaseResolver.effectivePhase()` (`RestPhaseResolver.swift:24-35`) resolve a fase a partir de `restEndsAt`/`now`; `WidgetLiveActivity.swift:306-308` envolve `lockScreenBody` num `TimelineView(.periodic(from: .now, by: 1))` que chama `effectiveState()` a cada tick. `scripts/verify-live-activity-overtime.sh` prova as três fronteiras (antes/no/depois do prazo) sem JS — exit 0. Repaint real do WidgetKit no Lock Screen exige o aparelho. |
| 6 | O overtime mostrado cresce até `+59:59`. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `OvertimeFormatter.format()` (`OvertimeFormatter.swift:17-20`) clampa `[0, 3599]`; `overtimeText()` (`WidgetLiveActivity.swift:82-85`) recebe `now` do `timeline.date`, não mais `Date.now` congelado. Bordas 0/3599/acima do teto provadas pelo harness Swift (exit 0). Crescimento visível a cada tick no Lock Screen exige o aparelho. |
| 7 | Android/web não falham ao carregar uma feature exclusiva de iOS. | ✓ VERIFIED | `modules/live-activity/index.ts:65-68` só chama `requireOptionalNativeModule` quando `Platform.OS === 'ios'`; os 8 wrappers resolvem valor neutro quando o módulo é `null`. `App.tsx:39` retorna cedo fora de iOS. `__tests__/liveActivityPlatformImport.test.ts` (9 casos) e `__tests__/nativeModulePlatformImport.test.ts` (8 casos, sobe o grafo de import real de `App.tsx` sob android/web sem mock de `modules/native-info` — guarda de classe contra o bug irmão) passam. Esta é uma verificação de carregamento de módulo JS, não de renderização ActivityKit — Jest a exercita de forma equivalente ao runtime real. |
| 8 | Sem série registrada por 3h, a Activity encerra mesmo com apenas edições; após timeout, uma edição de sessão active restabelece o card. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `hasNewlyDoneSet()` (`liveActivitySync.ts:60-74`) compara `plannedSetId` entre `previousState.draft`/`state.draft` — é a ÚNICA transição que chama `resetInactivityTimeout()` (linha 245-247). `publishUpdate()` não reseta mais o timeout no sucesso do update. Testes `D-08: editar só reps/carga/RIR/descanso...` e `D-08: nova série done...` (`liveActivitySync.test.ts:300-363`) passam e reproduzem exatamente o cenário do WR-02 original. O encerramento e a recuperação reais de `Activity` no vencimento do prazo dependem do aparelho. |

**Score:** 4/8 truths verified (4 present, behavior-unverified).

### Required Artifacts

| Artifact | Expected | L1/L2/L3/L4 status | Details |
| --- | --- | --- | --- |
| `src/native/liveActivitySync.ts` | Timeout de inatividade correto (D-08) e fallback CAS-safe | EXISTS/SUBSTANTIVE/WIRED/FLOWING | `hasNewlyDoneSet()` (60-74) e `recoverAfterFailedUpdate()` (102-119), guardados por `sessionLogId`+`status active`. |
| `targets/session-widget/RestPhaseResolver.swift` | Resolução pura da fase efetiva | EXISTS/SUBSTANTIVE/WIRED/FLOWING | Novo em 15-07; consumido por `effectiveState()` em `WidgetLiveActivity.swift:255-266`. |
| `targets/session-widget/OvertimeFormatter.swift` | Formatador puro clampado em +59:59 | EXISTS/SUBSTANTIVE/WIRED/FLOWING | Novo em 15-07; consumido por `overtimeText()` (82-85). |
| `targets/session-widget/WidgetLiveActivity.swift` | Lock Screen com reavaliação temporal periódica | EXISTS/SUBSTANTIVE/WIRED/FLOWING | `TimelineView(.periodic(from: .now, by: 1))` (306-308) substitui o render estático anterior. |
| `modules/live-activity/index.ts` | Bridge opcional, seguro fora de iOS | EXISTS/SUBSTANTIVE/WIRED/FLOWING | `requireOptionalNativeModule` gated por `Platform.OS === 'ios'` (65-68); 8 wrappers com branch neutro. |
| `modules/native-info/index.ts` | Bridge irmão seguro fora de iOS (mesma classe de bug) | EXISTS/SUBSTANTIVE/WIRED/FLOWING | Mesmo padrão de guard (linhas 28-31). |
| `App.tsx` | Efeito root da Live Activity limitado a iOS | EXISTS/SUBSTANTIVE/WIRED/FLOWING | `if (Platform.OS !== 'ios') return undefined;` (linha 39). |
| `src/engine/sessionModel.ts` | Seletores canônicos sem exercício recusado | EXISTS/SUBSTANTIVE/WIRED/FLOWING | `findActiveSet`/`findNextPendingSet` chamam `exercicioForaDeJogo` (378, 391); regra definida em 707-709. |
| `scripts/verify-live-activity-overtime.sh` | Prova Swift standalone sem JS | EXISTS/SUBSTANTIVE/WIRED/FLOWING | Executada nesta verificação: exit 0. |
| `src/components/LiveActivityUnavailableBanner.tsx` | Aviso único e não bloqueante | EXISTS/SUBSTANTIVE/WIRED/FLOWING | Inalterado; ainda montado em `App.tsx`, assina `getLastStartFailed`/`subscribeLiveActivityStartFailure`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `App.tsx` | `liveActivitySync.ts` | mount effect, sob guarda `Platform.OS === 'ios'` | ✓ WIRED | Linha 39 retorna cedo fora de iOS; linhas 50-52 chamam `reconcileOrphanActivities`/`initLiveActivitySync`/`registerLiveActivityIntentListener` só no ramo iOS. |
| Zustand active-session store | `liveActivitySync.ts` | `subscribe` | ✓ WIRED | `initLiveActivitySync()` (225-256), agora com `hasNewlyDoneSet` como responsável pela decisão de resetar o timeout antes de `publishUpdate`. |
| `restEndsAt` | mudança de fase na Lock Screen | `TimelineView` periódico + `RestPhaseResolver` | ✓ WIRED (fechado nesta rodada) | Antes: nenhum produtor de update no vencimento. Agora: reavaliação a cada tick do WidgetKit, sem depender de update de Activity. |
| `updateLiveActivity === false` | `startLiveActivity` | `recoverAfterFailedUpdate` | ✓ WIRED (fechado nesta rodada) | Guarda por `sessionLogId`+`status active`; teste cobre inclusive a corrida contra `finish`. |
| `modules/live-activity` import | bootstrap Android/web | `Platform.OS === 'ios'` no module scope | ✓ WIRED (fechado nesta rodada) | `requireOptionalNativeModule` só avaliado em iOS; import real testado sem mock em `liveActivityPlatformImport.test.ts`. |
| `findActiveSet`/`findNextPendingSet` | seleção do card atual | `exercicioForaDeJogo` | ✓ WIRED (fechado nesta rodada) | Cobre `cutByReplan` e `skippedByUser`. |

### Data-Flow Trace (Level 4)

`completeSet()` persiste `restEndsAt` em UTC → mutação do Zustand chega ao subscriber → `hasNewlyDoneSet` decide se reseta o timeout → `buildLiveActivityContentState()` produz o `ContentState` → bridge Swift (gated por plataforma) atualiza a `Activity` → `WidgetLiveActivity` envolve o render num `TimelineView` que recalcula fase e overtime a cada tick via `RestPhaseResolver`/`OvertimeFormatter`, independentemente de nova mutação do JS. O fluxo deixou de ficar oco nos dois pontos que a verificação anterior apontou (vencimento de `restEndsAt` e retomada após timeout) — a lacuna que resta é apenas a confirmação de que o `TimelineView` real do WidgetKit tica como o harness Swift prevê, e que a Activity de fato ressurge no processo iOS. Nenhuma das duas é observável por leitura de código ou por Jest.

## Review adversarial: fechamento de CR-01 a CR-04 e dos warnings

| Achado | Veredito nesta verificação | Evidência direta (código vivo) |
| --- | --- | --- |
| CR-01 — não entra em `readyOvertime` | **FECHADO (código+teste offline); pendente de UAT** | `RestPhaseResolver.effectivePhase` + `TimelineView` periódico; harness Swift exit 0. |
| CR-02 — overtime congelado | **FECHADO (código+teste offline); pendente de UAT** | `OvertimeFormatter.format` + `now` que vem de `timeline.date`; harness Swift exit 0. |
| CR-03 — import iOS derruba Android/web | **FECHADO e verificável sem UAT** | `requireOptionalNativeModule` gated por `Platform.OS`; 17 testes (9+8) exercitam o import real sob android/web sem mock, todos PASS. |
| CR-04 — não recria após timeout | **FECHADO (código+teste offline); pendente de UAT** | `recoverAfterFailedUpdate` guardado por `sessionLogId`+`active`; testes reproduzem exatamente o cenário do achado original. |
| WR-01 — exercício `skippedByUser` ainda selecionável | **FECHADO para o card atual** | `findActiveSet`/`findNextPendingSet` chamam `exercicioForaDeJogo`; 5 testes novos cobrem `skippedByUser` e regressão de `cutByReplan`. Ver achado adicional abaixo sobre uma função irmã não coberta. |
| WR-02 — timeout rearmado por qualquer edição | **FECHADO (código+teste offline); pendente de UAT** | `hasNewlyDoneSet` é a única fonte de reset; teste `D-08: editar só reps/carga/RIR/descanso...` prova que edição sem série concluída NÃO adia o prazo. |

## Achado adicional fora do escopo de LOCK-01/02/03 (Fase 17, não bloqueia esta verificação)

`src/engine/sessionModel.ts:406-421` — `findPendingSetAfter()` (criada pelo Plano 17-05, `PRED-01`, para a linha "A SEGUIR" do Lock Screen) só ignora `ex.cutByReplan` (linha 409), não `skippedByUser`. É a mesma classe de bug do WR-01, numa função irmã que não existia quando `15-REVIEW.md` foi escrito e que o Plano 15-08 não tocou. `__tests__/sessionModel.test.ts:260-342` cobre `cutByReplan` para essa função, mas não `skippedByUser`.

**Cenário de falha concreto:** aluno recusa (skip) o próximo exercício da sequência durante o descanso do exercício atual. `findActiveSet`/`findNextPendingSet` corretamente pulam o exercício recusado para a série "atual" (WR-01 fechado), mas `anticipateNextUp()` → `findPendingSetAfter()` (`src/engine/liveActivityContentState.ts:92-109`) ainda pode devolver uma série do exercício recusado como `nextExerciseName`/`nextSetIndex`, exibida na linha "A SEGUIR" do Lock Screen (`WidgetLiveActivity.swift:58-74`, `nextUpLine`).

Não entra em `gaps` desta verificação porque `findPendingSetAfter` é código da Fase 17 (`PRED-01`), fora do texto literal de LOCK-01/LOCK-02/LOCK-03 e fora do que os Planos 15-07/15-08/15-09 se comprometeram a fechar. Registrado aqui para o dono decidir se abre um achado formal na Fase 17.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Tipagem | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Sincronização, seletores canônicos, content state, import multiplataforma | `npx jest __tests__/liveActivityPlatformImport.test.ts __tests__/liveActivitySync.test.ts __tests__/sessionModel.test.ts __tests__/liveActivityContentState.test.ts __tests__/nativeModulePlatformImport.test.ts --runInBand` | 5 suítes / 110 testes PASS | ✓ PASS |
| Transição temporal resting -> readyOvertime e overtime clampado, sem JS | `bash scripts/verify-live-activity-overtime.sh` | exit 0 | ✓ PASS |
| Repaint real do WidgetKit / recriação real de Activity no Lock Screen | nenhum comando reproduz — exige aparelho | não exercitável por Jest/simulador | ? SKIP — roteado para verificação humana |

## Requirements Coverage

| Requirement | Source plans | Status | Evidence |
| --- | --- | --- | --- |
| LOCK-01 | 15-01, 15-02, 15-04, 15-05, 15-06, 15-08, 15-09 | `human_needed` | Card básico e recuperação após timeout de inatividade têm código+teste fechados; a exibição real na tela bloqueada e a recriação real da Activity exigem a UAT do Plano 15-09 Task 2. `REQUIREMENTS.md` marca LOCK-01 como `[x]` — esta verificação não confirma esse fechamento; sinalizado abaixo. |
| LOCK-02 | 15-01, 15-04, 15-05, 15-06 | `satisfied` | Sem alteração desde a verificação anterior; UAT física já passou e nenhum dos Planos 15-07/08/09 tocou esse mecanismo. |
| LOCK-03 | 15-03, 15-04, 15-06, 15-07, 15-08 | `human_needed` | Fim/cancelamento/reconciliação seguem verificados fisicamente (inalterados); o ciclo de inatividade (D-08) tem código+teste fechados, mas a corrida real entre `Activity.end`/recriação e finish/cancel é o próprio checkpoint pendente do 15-09. `REQUIREMENTS.md` marca LOCK-03 como `[ ]` — consistente com este resultado. |

**Discrepância observada (não corrigida aqui, fora do escopo desta tarefa):** `.planning/REQUIREMENTS.md` linhas 26 e 30 marcam LOCK-01 e LOCK-02 como `[x]` (linha 111-112 da tabela de status também diz "Complete"). Esta verificação confirma LOCK-02 como satisfeito, mas classifica LOCK-01 como pendente de UAT física — a marcação `[x]` de LOCK-01 antecede o fechamento real do checkpoint do 15-09 e não deveria ter sido dada como concluída antes da resposta do dono.

Não há requisitos órfãos: `REQUIREMENTS.md` mapeia LOCK-01, LOCK-02 e LOCK-03 para a Fase 15, e todos foram avaliados.

## Anti-Patterns Found

Nenhum marcador de dívida (`TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, `PLACEHOLDER`) encontrado nos arquivos tocados pelos Planos 15-07/08/09/09b (`src/native/liveActivitySync.ts`, `targets/session-widget/WidgetLiveActivity.swift`, `targets/session-widget/RestPhaseResolver.swift`, `targets/session-widget/OvertimeFormatter.swift`, `modules/live-activity/index.ts`, `App.tsx`, `src/engine/sessionModel.ts`, e os cinco arquivos de teste do checkpoint).

## Human Verification Required

Os três roteiros a seguir são o checkpoint bloqueante do Plano 15-09 Task 2 (`autonomous: false`, `gate="blocking"`), ainda sem resposta do dono. Nenhum deles é substituível por teste automatizado — ver justificativa em cada item.

### 1. rest_to_ready_overtime

**Test:** No iPhone: iniciar um descanso curto, bloquear a tela e deixar o prazo vencer sem tocar no app; continuar a observar o card além do vencimento.
**Expected:** O card muda sozinho de "em descanso" para "Pronto" no instante do vencimento e o texto de overtime cresce em `+m:ss` a cada segundo até `+59:59`.
**Why human:** `TimelineView(.periodic)` é mecanismo real do WidgetKit; throttling do sistema, Low Power Mode e o processo suspenso só existem no aparelho físico (D-13/D-14 do projeto).

### 2. inactivity_timeout_recovery

**Test:** No iPhone: deixar uma sessão active 3h sem nenhuma série concluída até a Activity encerrar por inatividade; em seguida editar reps, carga, RIR ou o ajuste de descanso de uma série ainda active.
**Expected:** O card reaparece na tela bloqueada e reflete o draft atual, sem exigir reabertura do app.
**Why human:** Depende de `Activity.request` real recriar a Live Activity a partir de `update=false`; o teste automatizado usa fake timers e um bridge mockado.

### 3. no_resurrection_after_finish_cancel

**Test:** No iPhone: finalizar ou cancelar a sessão exatamente no instante de uma tentativa de recuperação pós-timeout (por exemplo, editar uma série perto do fim do timeout e finalizar a sessão logo em seguida).
**Expected:** Nenhum card ressuscita para a sessão já encerrada ou cancelada.
**Why human:** A corrida real entre a promise de `updateLiveActivity` e a mudança de status no store só existe no processo do iOS; o teste automatizado prova a guarda lógica (`sessionLogId` + `status active`), não a corrida real do sistema.

## Gaps Summary

Não há gap novo que bloqueie LOCK-01/LOCK-02/LOCK-03 nesta rodada: os cinco gaps e os dois warnings de `15-VERIFICATION.md`/`15-REVIEW.md` anteriores têm implementação real e teste automatizado que fecha exatamente os cenários que os motivaram, confirmado por leitura direta do código (não do SUMMARY) e por execução dos comandos do checkpoint. O único achado novo de código (`findPendingSetAfter` sem `skippedByUser`, acima) pertence à Fase 17 e não reabre esta fase.

O que falta é inteiramente físico: os três roteiros do checkpoint bloqueante do Plano 15-09 (Task 2) — a mesma UAT que `15-REVIEW.md` já exige como Escalation Gate antes de declarar LOCK-01/LOCK-03 concluídos. Até essa resposta do dono, o status correto é `human_needed`, não `passed`.

---

_Verified: 2026-08-19T21:12:29Z_
_Verifier: the agent (gsd-verifier)_
