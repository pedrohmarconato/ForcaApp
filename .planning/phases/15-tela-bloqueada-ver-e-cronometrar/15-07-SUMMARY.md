---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 07
subsystem: live-activity-widget
tags: [activitykit, widgetkit, timelineview, swift, gap-closure]

requires:
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    plan: 06
    provides: UAT física da Sessão 2 e o relatório 15-VERIFICATION.md com os cinco gaps a fechar
provides:
  - Resolução Swift pura da fase efetiva resting/readyOvertime a partir de restEndsAt e do instante do TimelineView
  - Formatter Swift puro do overtime, clampado em +59:59
  - TimelineView periódico no Lock Screen que reavalia a apresentação temporal sem update de Activity nem timer JS
  - Prova Swift standalone (sem XCTest) das fronteiras antes/no/depois de restEndsAt, conectada ao gate npm run verify:native
affects: [15-08, 15-09]

tech-stack:
  added: []
  patterns:
    - "TimelineView(.periodic(from:by:)) deriva apresentação temporal do WidgetKit a partir de timeline.date, nunca de uma atualização JS"
    - "Helpers Swift puros (sem ActivityKit/WidgetKit) testados por binário standalone compilado com xcrun swiftc, sem novo target XCTest"

key-files:
  created:
    - targets/session-widget/OvertimeFormatter.swift
    - targets/session-widget/RestPhaseResolver.swift
    - scripts/verify-live-activity-overtime.sh
  modified:
    - targets/session-widget/WidgetLiveActivity.swift
    - scripts/verify-native-skeleton.sh

key-decisions:
  - "RestPhaseResolver/OvertimeFormatter recebem now explicitamente (timeline.date), nunca chamam Date.now internamente — só o ponto de chamada no widget decide a origem do instante."
  - "O harness de teste extrai (via sed) só o enum SessionActivityPhase da fonte real de SessionActivityAttributes.swift, sem duplicar manualmente — o restante do arquivo (ActivityAttributes/ContentState) não compila fora do SDK de iOS/watchOS e forçar isso exigiria simulador + app bundle, o overhead de 'novo target XCTest' que o script existe para evitar."
  - "Dynamic Island (compact/minimal/expanded) não recebeu o mesmo TimelineView — segue deferido por ausência de hardware compatível no iPhone do dono (decisão já registrada em STATE.md na Fase 15); overtimeValue() ali continua recebendo Date.now no ponto de chamada, comportamento idêntico ao anterior."

actuals:
  tokens: 6347
  tasks: 2
  commits: 2

status: complete
---

# Phase 15 Plan 07: Transição temporal resting -> readyOvertime e overtime clampado — Summary

**O Lock Screen agora deriva sozinho, via `TimelineView(.periodic(from:by:))` e dois helpers Swift puros, a troca de descanso para "Pronto" no vencimento absoluto de `restEndsAt` e o crescimento do overtime até +59:59 — sem nenhuma atualização por segundo do processo JS — fechando os blockers CR-01/CR-02 do relatório de verificação.**

## O que foi feito

- **`targets/session-widget/RestPhaseResolver.swift`** (novo): resolução Swift pura da fase efetiva. Recebe a fase já presente no `ContentState` (`resting` ou `readyOvertime`), `restEndsAt` e `now`; resolve para `.resting` estritamente antes do prazo e para `.readyOvertime` no instante exato do prazo e depois dele. Fases não temporais (`measuring`, `blockOnly`) ou prazo ausente preservam o valor recebido sem fabricar overtime. Também calcula os segundos não negativos de overtime.
- **`targets/session-widget/OvertimeFormatter.swift`** (novo): formatter puro extraído de dentro da View — `elapsedSeconds` clampado em `[0, 3599]` e formatado `+m:ss`.
- **`targets/session-widget/WidgetLiveActivity.swift`** (modificado): a região Lock Screen do `ActivityConfiguration` agora envolve `lockScreenBody` em `TimelineView(.periodic(from: .now, by: 1))`; a cada tick, `effectiveState(context.state, now: timeline.date)` recalcula a fase efetiva via `RestPhaseResolver` antes de renderizar, e `overtimeText`/`overtimeValue` passam a receber `now` explicitamente (`timeline.date` no Lock Screen). O Dynamic Island manteve seu comportamento anterior (fora de escopo — sem hardware do dono para validar).
- **`scripts/verify-live-activity-overtime.sh`** (novo): compila os arquivos reais `RestPhaseResolver.swift`/`OvertimeFormatter.swift` junto com um harness gerado em diretório temporário (trap de limpeza) e o enum `SessionActivityPhase` extraído por `sed` da fonte real de `SessionActivityAttributes.swift`. Prova as três fronteiras do plano (antes, no instante exato, depois de `restEndsAt`) para as duas fases de entrada possíveis, as bordas do formatter (0, 3599, acima do teto, negativo) e faz inspeção de fonte de `WidgetLiveActivity.swift` (presença de `TimelineView`/`timeline.date`, ausência de `setTimeout`/`updateLiveActivity`).
- **`scripts/verify-native-skeleton.sh`** (modificado): nova checagem (j) executa `verify-live-activity-overtime.sh` em cada uma das duas rodadas, depois do prebuild (checagem a) e antes da mensagem de sucesso da rodada; mesma disciplina de falha das checagens (a)-(i) (identifica a rodada, sugere a correção, sai não-zero, não esconde erro). Comentários de cabeçalho e o print final atualizados de "nove"/"(a)-(i)" para "dez"/"(a)-(j)".

`src/native/liveActivitySync.ts` não foi tocado — nenhum `setTimeout` de `restEndsAt` foi adicionado lá, como o plano exige; a transição continua 100% derivada no WidgetKit a partir do `ContentState` já entregue.

## Verificação executada

| Comando | Resultado |
| --- | --- |
| `bash scripts/verify-live-activity-overtime.sh` | ✓ PASS — fronteiras antes/no/depois de `restEndsAt` para `resting` e `readyOvertime`, bordas do formatter, inspeção de fonte |
| `npm run verify:native` | ✓ PASS — 2/2 rodadas, checagem (j) incluída em ambas |
| `npx tsc --noEmit` | ✓ PASS — exit 0 |
| `npx jest --silent` | ✓ PASS — 167 suítes / 1979 testes (baseline preservado, sem regressão) |

Sanidade extra do harness: uma versão deliberadamente quebrada de `RestPhaseResolver` (retornando sempre a fase recebida sem resolver nada) foi compilada e executada manualmente contra o mesmo harness antes de escrever a versão real — falhou com `FALHA: RED1: fase readyOvertime antes do prazo — esperado resting, obtido readyOvertime`, confirmando que o teste discrimina a regressão que ele existe para prevenir.

## Accomplishments

- Truths #5 e #6 de `15-VERIFICATION.md` (transição autônoma resting -> readyOvertime e crescimento do overtime até +59:59) agora têm implementação Swift real e prova automatizada, fechando CR-01 e CR-02 do review.
- O gate `npm run verify:native`, já usado pela fase inteira, passou a cobrir a fase temporal sem exigir um novo target XCTest ou simulador.

## Files Created/Modified

- `targets/session-widget/OvertimeFormatter.swift` — novo, formatter puro clampado.
- `targets/session-widget/RestPhaseResolver.swift` — novo, resolução pura da fase efetiva e do overtime.
- `targets/session-widget/WidgetLiveActivity.swift` — `TimelineView` na região Lock Screen, threading de `now` para `overtimeText`/`overtimeValue`/`lockScreenBody`.
- `scripts/verify-live-activity-overtime.sh` — novo, prova Swift standalone das fronteiras temporais.
- `scripts/verify-native-skeleton.sh` — nova checagem (j) conectando a prova ao gate existente.

## Decisions Made

- `RestPhaseResolver`/`OvertimeFormatter` recebem `now` explicitamente em vez de capturar `Date.now` internamente, para que o mesmo código seja determinístico em teste e correto em produção via `timeline.date`.
- O harness de verificação extrai o enum `SessionActivityPhase` da fonte real por `sed` em vez de compilar `SessionActivityAttributes.swift` inteiro (que depende do protocolo `ActivityAttributes`, indisponível no SDK padrão de macOS) — evita simulador/app bundle mantendo fonte única de verdade.
- Dynamic Island não ganhou o mesmo `TimelineView` nesta fase — decisão de escopo já registrada em `STATE.md` (sem hardware compatível no iPhone do dono); `overtimeValue` ali segue recebendo `Date.now` no ponto de chamada, sem regressão de comportamento.

## Deviations from Plan

None — plano executado exatamente como escrito. As duas tarefas (resolução temporal + conexão ao gate) foram implementadas, verificadas e commitadas individualmente, sem necessidade de auto-fix além do já previsto no `<action>` de cada tarefa.

## Issues Encountered

Nenhum bloqueio. O único ajuste de processo foi de compilação local: `SessionActivityAttributes.swift` completo não compila fora do SDK de iOS/watchOS (protocolo `ActivityAttributes` indisponível em macOS) — resolvido extraindo só o enum necessário da fonte real, documentado no cabeçalho do script novo.

## Known Stubs

Nenhum stub introduzido por este plano.

## Escopo remanescente (fora deste plano)

Este plano fecha apenas CR-01/CR-02 de `15-VERIFICATION.md`. Os gaps CR-03 (import iOS incondicional em Android/web), CR-04 (recriação da Activity após timeout de inatividade), WR-01 (exercício `skippedByUser` ainda selecionável) e WR-02 (timeout de 3h rearmado por qualquer edição) permanecem para os planos seguintes da cadeia (15-08/15-09), conforme o encadeamento `depends_on` desta fase. LOCK-01/LOCK-03 continuam pendentes de fechamento completo até essa cadeia terminar e a verificação/UAT física final rodar.

## Self-Check: PASSED

- `targets/session-widget/OvertimeFormatter.swift` — FOUND
- `targets/session-widget/RestPhaseResolver.swift` — FOUND
- `scripts/verify-live-activity-overtime.sh` — FOUND (executável)
- `scripts/verify-native-skeleton.sh` contém a checagem (j) — FOUND
- Commit `d483afe` (Task 1) — FOUND em `git log --oneline`
- Commit `9437f06` (Task 2) — FOUND em `git log --oneline`
- `npm run verify:native` 2/2 rodadas — PASS
- `npx jest --silent` 167/167 suítes, 1979/1979 testes — PASS
