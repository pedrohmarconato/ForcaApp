---
phase: 15-tela-bloqueada-ver-e-cronometrar
reviewed: 2026-08-17T20:33:57Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - App.tsx
  - __tests__/LiveActivityUnavailableBanner.test.tsx
  - __tests__/activeSessionStore.test.ts
  - __tests__/consolidacao-screens.test.tsx
  - __tests__/direcao03-fase3-sessao.test.tsx
  - __tests__/fase3-telas-erro.test.tsx
  - __tests__/intraSessionAdaptation.test.ts
  - __tests__/liveActivityContentState.test.ts
  - __tests__/liveActivitySync.test.ts
  - __tests__/sessionFlow.test.ts
  - __tests__/sessionPlayerCleanup.test.tsx
  - __tests__/sessionPlayerTransitions.test.tsx
  - __tests__/sessionSummary.test.ts
  - __tests__/trainingRepository.test.ts
  - __tests__/trainingSessionReanchoragem.test.tsx
  - __tests__/trainingSessionReorder.test.tsx
  - __tests__/weeklyReplanner.test.ts
  - app.json
  - modules/live-activity/LiveActivityModule.podspec
  - modules/live-activity/expo-module.config.json
  - modules/live-activity/index.ts
  - modules/live-activity/ios/LiveActivityModule.swift
  - modules/live-activity/ios/SessionActivityAttributes.swift
  - modules/live-activity/package.json
  - scripts/verify-native-skeleton.sh
  - src/components/LiveActivityUnavailableBanner.tsx
  - src/components/session/SessionPlayer.tsx
  - src/engine/liveActivityContentState.ts
  - src/engine/sessionFlow.ts
  - src/engine/sessionModel.ts
  - src/engine/sessionSummary.ts
  - src/native/liveActivitySync.ts
  - src/screens/TrainingSessionScreen.tsx
  - src/services/trainingRepository.ts
  - src/store/activeSessionStore.ts
  - targets/session-widget/SessionActivityAttributes.swift
  - targets/session-widget/WidgetLiveActivity.swift
findings:
  critical: 4
  warning: 2
  info: 0
  total: 6
status: resolved
resolved_at: 2026-08-19T21:00:00Z
resolution: |
  Os 6 achados (CR-01..CR-04, WR-01, WR-02) foram fechados pelos planos de
  gap closure 15-07, 15-08, 15-09 e 15-09b. Confirmado no codigo vivo, nao
  no SUMMARY:
  - CR-01/CR-02 (readyOvertime e texto de overtime congelado): resolvidos no
    widget com TimelineView + timeline.date; provados sem JS por
    scripts/verify-live-activity-overtime.sh (exit 0).
  - CR-03 (modulo iOS carregado incondicionalmente): requireOptionalNativeModule
    sob ramo Platform.OS === 'ios' em modules/live-activity/index.ts. O IRMAO
    do mesmo bug em modules/native-info/index.ts so apareceu ao reexecutar o
    browser depois do primeiro conserto (15-09b, f88b7c3).
  - CR-04 (Activity nao recriada apos timeout de inatividade): caminho de
    recriacao em src/native/liveActivitySync.ts:96-115.
  - WR-01 (exercicio recusado elegivel ao card): regra canonica
    exercicioForaDeJogo aplicada em sessionModel.ts:378 e :391.
  - WR-02 (3h medindo qualquer edicao): hasNewlyDoneSet
    (liveActivitySync.ts:59) e a UNICA transicao que adia o prazo.
  RESSALVA: o Escalation Gate deste documento exige tambem a UAT fisica dos
  caminhos alterados antes de declarar LOCK-01/LOCK-03 concluidos. Essa UAT
  e o checkpoint do 15-09, ainda NAO respondido pelo dono. Review resolvido
  nao significa fase fechada.
---

# Phase 15: Code Review Report

**Reviewed:** 2026-08-17T20:33:57Z  
**Depth:** standard  
**Files Reviewed:** 37  
**Status:** issues_found

## Summary

A implementação compila e as quatro suítes direcionadas passam, mas o contrato central da Live Activity não se sustenta no tempo: o card não muda de descanso para “Pronto”, e o overtime não atualiza. Há ainda uma falha de plataforma que pode derrubar Android/web e falhas no retorno após inatividade e na seleção de exercício recusado.

## Critical Issues

### CR-01: A Live Activity nunca entra em `readyOvertime` quando o descanso expira

**File:** `src/native/liveActivitySync.ts:71-83`, `targets/session-widget/WidgetLiveActivity.swift:60-68`  
**Issue:** `restEndsAt` só é avaliado por `buildLiveActivityContentState` durante uma mutação do draft. Ao chegar ao horário, nenhum campo do Zustand muda — por design o app não avança a série — e o sync não agenda uma única atualização para a transição de estado. O widget permanece com `phase == .resting`; `Text(timerInterval: ..., countsDown: true)` para em `0:00`. Portanto, na Lock Screen ele não mostra “Pronto” nem o overtime exigido por D-04, apesar de o player em foreground repintar corretamente.

**Fix:** Ao publicar `resting`, arme um único timeout associado a `sessionLogId` e ao valor de `restEndsAt`; no vencimento, releia o draft, confirme que o mesmo timestamp ainda vigora e envie um `updateLiveActivity(buildLiveActivityContentState(draft))`. Cancele/substitua esse timeout em qualquer update, término e unsubscribe. Adicione teste com fake timers que prova `resting -> readyOvertime` sem chamar `activateSet`.

### CR-02: O texto de overtime é congelado no primeiro render do widget

**File:** `targets/session-widget/WidgetLiveActivity.swift:27-35`, `targets/session-widget/WidgetLiveActivity.swift:101-108`  
**Issue:** `overtimeText` calcula uma `String` com `Date.now` uma única vez durante a avaliação da view. Diferentemente de `Text(timerInterval:)`, uma string comum não recebe atualizações periódicas do WidgetKit. Mesmo se CR-01 for corrigido e a fase mudar para `readyOvertime`, o cartão mostrará tipicamente `+0:00` para sempre (ou o valor existente no momento do único `Activity.update`), violando D-04 e o crescimento até `+59:59`.

**Fix:** Renderize o valor dentro de um `TimelineView(.periodic(from: .now, by: 1))` e passe `timeline.date` a um formatador com o clamp de 3.599 segundos. Cubra o formatador puro nas bordas 0, 59:59 e acima do teto; a atualização de fase continua sendo um único update nativo de CR-01, não um update por segundo.

### CR-03: O módulo exclusivo de iOS é carregado incondicionalmente e pode impedir a inicialização em Android/web

**File:** `App.tsx:15-18`, `modules/live-activity/index.ts:20`  
**Issue:** `App.tsx` importa `liveActivitySync` em todas as plataformas, o qual carrega `modules/live-activity`. Esse módulo chama `requireNativeModule('LiveActivityModule')` no topo. O próprio Expo Modules Core lança quando o módulo não existe; `expo-module.config.json` registra-o apenas para `apple`. Assim, Android e o bundle web no navegador podem falhar antes de alcançar os guards de `Platform.OS` do banner.

**Fix:** Forneça uma implementação iOS e stubs seguros para Android/web (por exemplo, `index.ios.ts` real e `index.android.ts`/`index.web.ts` retornando `false`), ou use `requireOptionalNativeModule` atrás de um guard de plataforma e faça os wrappers retornarem `Promise.resolve(false)` quando indisponíveis. Condicione também a inicialização no `App` a iOS. Adicione testes que importem `App`/o sync com `Platform.OS = 'android'` e `'web'` sem mock do módulo.

### CR-04: Depois do timeout de inatividade, uma sessão retomada nunca recria sua Live Activity

**File:** `src/native/liveActivitySync.ts:28-35`, `src/native/liveActivitySync.ts:71-82`  
**Issue:** Ao vencer o timeout, `endLiveActivity('immediate')` encerra a instância nativa e o Swift zera `currentActivity` (`LiveActivityModule.swift:84-85`). Uma ação posterior do aluno altera o draft e segue o caminho `publishUpdate`; `updateActivity` então retorna `false`, mas o resultado é apenas ignorado. Não há fallback para `startLiveActivity`. A sessão permanece `active` e pode ser retomada no app, porém deixa de ter card na tela bloqueada até reiniciar o processo, contrariando a preservação para retomada de D-08/LOCK-01.

**Fix:** Quando um update retornar `false`, confirme que o mesmo `sessionLogId` continua ativo e faça um único `startLiveActivity` com o estado corrente; não rearme nem recrie após término/cancelamento. Adicione teste que dispara o timeout, altera o draft de uma sessão ainda ativa e espera uma nova chamada a `startLiveActivity`.

## Warnings

### WR-01: Exercícios recusados continuam elegíveis para o card e podem ser exibidos como a próxima série

**File:** `src/engine/sessionModel.ts:289-306`, `src/engine/liveActivityContentState.ts:58-60`  
**Issue:** `findActiveSet` e `findNextPendingSet` ignoram apenas `cutByReplan`, mas a regra canônica `exercicioForaDeJogo` também inclui `skippedByUser`. Após o aluno recusar um exercício, suas séries pendentes ainda podem ser selecionadas pelo builder e enviadas para a Lock Screen, exibindo uma prescrição que ele acabou de dispensar.

**Fix:** Faça ambos os seletores ignorarem `exercicioForaDeJogo(ex)` (movendo o helper acima deles, se necessário) e adicione casos para uma próxima série e uma série ativa que pertencem a exercício `skippedByUser`.

### WR-02: O timeout de três horas mede qualquer edição do draft, não “três horas sem série registrada”

**File:** `src/native/liveActivitySync.ts:74-79`, `src/native/liveActivitySync.ts:183-185`  
**Issue:** Todo novo objeto `draft` no estado ativo chama `publishUpdate`, e qualquer update nativo bem-sucedido rearma o timeout. Alterar reps, carga, RIR ou os botões de ajuste de descanso repetidamente adia indefinidamente o encerramento, ainda que nenhuma série tenha sido concluída. Isso não implementa o contrato D-08 de “sem nenhuma série registrada por 3h”.

**Fix:** Compare a contagem/identidade de séries `done` entre `state.draft` e `previousState.draft` e rearme o timer somente quando uma nova série for concluída (além do start inicial, se essa for a regra desejada). Adicione um teste que altera apenas carga/reps antes do prazo e confirma que o timeout original continua valendo.

---

_Reviewed: 2026-08-17T20:33:57Z_  
_Reviewer: the agent (gsd-code-reviewer)_  
_Depth: standard_
