---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 03
subsystem: ui
tags: [activitykit, live-activity, zustand, reconciliation, timeout, react-native]

# Dependency graph
requires:
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    provides: Live Activity bridge, structured ContentState, restEndsAt, and root-mounted store subscriber from Plans 15-01 and 15-02
provides:
  - Correct delayed dismissal for finished sessions and immediate dismissal for skipWholeSession cancellation
  - Boot reconciliation that ends all native orphans and restarts only the still-current session card
  - Three-hour inactivity timeout that removes only the Live Activity, preserving the session draft
  - One-time iOS-only unavailable banner driven by observable start failure state
affects: [15-05, 15-06, 16-comandos-na-tela-bloqueada, 17-registro-sem-teclado]

# Actuals (#2632)
actuals:
  tokens: 5472.25
  tasks: 3
  commits: 6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-local inactivity timer with explicit cleanup on every active-session exit"
    - "Observable native start failure with a module-level once-per-process UI guard"
    - "Boot reconciliation guarded by the current sessionLogId after the native await"

key-files:
  created:
    - src/components/LiveActivityUnavailableBanner.tsx
    - __tests__/LiveActivityUnavailableBanner.test.tsx
  modified:
    - src/native/liveActivitySync.ts
    - App.tsx
    - __tests__/liveActivitySync.test.ts

key-decisions:
  - "The existing skipWholeSession path remains the cancellation signal: draft null plus status finished in one store set produces immediate dismissal, with no new cancel API or UI."
  - "Finished summaries use a 180-second afterDate dismissal, while inactivity uses a fixed three-hour immediate dismissal without mutating Zustand state."
  - "Start failures are exposed through getLastStartFailed plus a subscription; the banner's module-level guard survives component remounts during one app process."

patterns-established:
  - "All native end, update, and reconcile failures are caught and logged without crossing into the app's error path."
  - "A successful start or update arms the inactivity deadline; leaving active clears it, and a current-status check prevents late promises from rearming it."

requirements-completed: [LOCK-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Finished and cancelled sessions dispatch the distinct ActivityKit dismissal policies and keep native failures non-fatal."
    requirement: LOCK-03
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#termina com resumo e dismissalPolicy afterDate quando o draft sobrevive"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#termina imediatamente quando skipWholeSession limpa o draft no mesmo frame"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#não propaga rejeição do encerramento ao cancelar ou terminar"
        status: pass
    human_judgment: false
  - id: D2
    description: "Boot reconciliation ends native orphans and restarts only the same active session after the native operation resolves."
    requirement: LOCK-03
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#não sobe uma Activity quando a reconciliação não encontra sessão ativa"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#sobe o card corrente depois de encerrar órfãos quando a sessão continua ativa"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#não publica a sessão antiga se o sessionLogId mudar durante a reconciliação"
        status: pass
      - kind: other
        ref: "npm run verify:native"
        status: pass
    human_judgment: false
  - id: D3
    description: "Three hours without a successful Activity update ends only the card, resets on update, and preserves the active store session."
    requirement: LOCK-03
    verification:
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#encerra a Activity após 3h sem update e preserva a sessão no store"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#reinicia o timeout quando uma atualização da Activity conclui"
        status: pass
      - kind: unit
        ref: "__tests__/liveActivitySync.test.ts#limpa o timeout quando a sessão sai de active por outro caminho"
        status: pass
    human_judgment: false
  - id: D4
    description: "The iOS-only unavailable banner displays the exact guidance once, with free wrapping and shared ProvisioningBanner theme tokens."
    requirement: LOCK-03
    verification:
      - kind: unit
        ref: "__tests__/LiveActivityUnavailableBanner.test.tsx#fora do iOS renderiza null e não consulta o estado nativo"
        status: pass
      - kind: unit
        ref: "__tests__/LiveActivityUnavailableBanner.test.tsx#mostra a falha uma vez e não repete o aviso após remount na mesma sessão"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: false
  - id: D5
    description: "Physical Lock Screen behavior after force-quit, three-hour inactivity, and Live Activities disabled in Settings."
    requirement: LOCK-03
    verification: []
    human_judgment: true
    rationale: "ActivityKit dismissal and Lock Screen state require the owner's physical iPhone; the plan explicitly defers physical UAT to Plans 15-05 and 15-06, and no device result was fabricated."

# Metrics
duration: 12 min
completed: 2026-08-17
status: complete
---

# Phase 15 Plan 03: Ciclo de vida da Live Activity — Summary

**Live Activity com término/cancelamento corretos, reconciliação CAS no boot, timeout de inatividade e aviso iOS único quando o start falha.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-17T12:54:33Z
- **Completed:** 2026-08-17T13:06:37Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `finishSession` agora publica um resumo curto e encerra com `afterDate` em 180 segundos; `skipWholeSession` continua sendo o caminho de cancelamento e encerra com `immediate` ao observar `draft: null` junto de `status: 'finished'`.
- O boot encerra todos os órfãos nativos e reinicia o card apenas quando o `sessionLogId` da sessão ativa permanece igual após o `await`, sem iniciar card para uma sessão antiga.
- Um timer de três horas encerra somente a Activity após inatividade; falhas de start ficam observáveis pelo root-mounted banner, que aparece uma única vez por processo e não bloqueia o treino.

## Task Commits

Each TDD task was committed atomically with RED and GREEN commits:

1. **Task 1: Encerramento correto — terminar vs cancelar** — `d739e9d` (test), `0e0c4fe` (feat)
2. **Task 2: Reconciliação de Activity órfã no boot** — `fbe9c6d` (test), `cd27a3c` (feat)
3. **Task 3: Timeout de inatividade + aviso de indisponibilidade** — `f888e39` (test), `cf9bcf6` (feat)

**Plan metadata:** summary, STATE.md, and ROADMAP.md are committed together by the final GSD docs commit.

## Files Created/Modified

- `src/native/liveActivitySync.ts` — políticas de encerramento, reconciliação, timeout, observabilidade de falha e proteção de erros nativos.
- `src/components/LiveActivityUnavailableBanner.tsx` — aviso iOS discreto, não bloqueante e uma única vez por processo.
- `App.tsx` — reconciliação no mount antes do subscriber e montagem do banner no root.
- `__tests__/liveActivitySync.test.ts` — cobertura de término, cancelamento, reconciliação CAS, timeout, limpeza e falha de start.
- `__tests__/LiveActivityUnavailableBanner.test.tsx` — cobertura de plataforma, copy, quebra livre e guard de remount.

## Decisions Made

- Não foi criado `cancelSession()` nem qualquer UI nova: a premissa do planner foi preservada e `skipWholeSession` permanece a fonte do sinal de cancelamento.
- O timeout usa exatamente 3 horas e é rearmado apenas após retorno nativo bem-sucedido de start/update; o store permanece intacto quando o timeout dispara.
- A mensagem do banner é exatamente `Ative as Live Activities em Ajustes para ver o treino na tela bloqueada`, com os tokens e a estrutura de `ProvisioningBanner`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Limpou o timeout em toda saída de `active`**
- **Found during:** Task 3 (Timeout de inatividade + aviso de indisponibilidade)
- **Issue:** A primeira implementação limpava o timer no caminho `finished`, mas um `reset` ou outra transição para `idle` poderia deixar um encerramento tardio agendado.
- **Fix:** O subscriber agora limpa o timer em qualquer transição de `active` para outro status; promessas nativas tardias também conferem o status atual antes de rearmar o timer.
- **Files modified:** `src/native/liveActivitySync.ts`, `__tests__/liveActivitySync.test.ts`
- **Verification:** teste `limpa o timeout quando a sessão sai de active por outro caminho`, suíte específica e suíte completa verdes.
- **Committed in:** `cf9bcf6`.

---

**Total deviations:** 1 auto-fixed (Rule 1: 1).
**Impact on plan:** Correção diretamente necessária para o requisito D-08; sem mudança arquitetural ou expansão de escopo.

## Issues Encountered

- `npx jest --runInBand` passou com **165 suítes e 1850 testes**, mas manteve o aviso conhecido de handles assíncronos abertos do Jest; conforme `AGENTS.md`, o resultado foi tratado pelos testes verdes, não pelo exit code isolado.
- Nenhuma UAT física foi executada ou declarada; force-quit, tela bloqueada, Dynamic Island e a configuração de Live Activities permanecem para os planos físicos 15-05/15-06.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- O código está pronto para a Sessão 1 física do Plano 15-05, com o ciclo de vida JS coberto e o caminho de reconciliação montado no root.
- A prova de comportamento real no iPhone continua pendente por decisão explícita; não há base para declarar PASS físico antes dos planos 15-05/15-06.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Plan: 03*
*Completed: 2026-08-17*

## Self-Check: PASSED

- Summary, component, and banner test files exist at their canonical paths.
- All six task commits (`d739e9d`, `0e0c4fe`, `fbe9c6d`, `cd27a3c`, `f888e39`, `cf9bcf6`) exist in git history.
- `npx tsc --noEmit`, the targeted Jest verification, the full Jest suite, and `npm run verify:native` passed; no physical-device UAT was claimed.
