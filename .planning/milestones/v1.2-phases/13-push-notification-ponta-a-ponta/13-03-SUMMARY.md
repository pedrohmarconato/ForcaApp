---
phase: 13-push-notification-ponta-a-ponta
plan: 03
subsystem: ui
tags: [badging-api, navigator.setAppBadge, pwa, react-hooks]

# Dependency graph
requires:
  - phase: 13-push-notification-ponta-a-ponta (plan 01)
    provides: "estado real de permissão de notificação (Notification.permission), padrão de shim web-only (alertShim.ts) usado como molde de estilo"
provides:
  - "src/utils/pushBadge.ts — updateTrainingBadge(pendente): gated por 'setAppBadge' in navigator E Notification.permission === 'granted', no-op silencioso caso contrário"
  - "Hook em HomeScreen.tsx que chama updateTrainingBadge reusando exatamente ehHoje/todaySession.status já calculados na tela"
affects: [13-04-producao-e-uat]

actuals:
  tokens: 2347
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Badging API (navigator.setAppBadge/clearAppBadge) gated por dupla checagem: suporte via 'x' in navigator E Notification.permission === 'granted' — nenhuma chamada antes dos dois serem verdadeiros"
    - "Guard de runtime via cast pontual (navigator as unknown as Record<string, unknown>) para contornar o TS estreitar o ramo 'ausente' para never quando o lib.dom já declara a propriedade como não-opcional"

key-files:
  created:
    - src/utils/pushBadge.ts
    - __tests__/pushBadge.test.ts
  modified:
    - src/screens/HomeScreen.tsx

key-decisions:
  - "navigator.setAppBadge/clearAppBadge já são tipados como não-opcionais em lib.dom.d.ts deste projeto (TypeScript recente inclui NavigatorBadge) — descartada a interface NavegadorComBadge com campos opcionais estendendo Navigator (gerava TS2430: incompatível com a interface base) em favor de um cast pontual documentado só para a checagem de runtime via 'in'."
  - "useEffect em HomeScreen.tsx reusa literalmente a expressão 'ehHoje && todaySession?.status === \"pending\"', a MESMA condição já usada em tituloDestaque/ehAtrasado — nenhuma segunda definição de 'treino pendente hoje' introduzida, conforme prohibition do plano."

patterns-established:
  - "Badge do ícone: qualquer tela futura que precise atualizar o badge deve reusar updateTrainingBadge (não reimplementar o gate de suporte/permissão) e continuar delegando a decisão de O QUE contar para si mesma — pushBadge.ts nunca deve ganhar lógica de negócio de pendência."

requirements-completed: [PUSH-04]

coverage:
  - id: D1
    description: "updateTrainingBadge(true) chama navigator.setAppBadge(1) quando 'setAppBadge' in navigator e Notification.permission === 'granted'"
    requirement: "PUSH-04"
    verification:
      - kind: unit
        ref: "__tests__/pushBadge.test.ts#'com API presente e permissão granted, pendente=true chama setAppBadge(1)'"
        status: pass
    human_judgment: false
  - id: D2
    description: "updateTrainingBadge(false) chama navigator.clearAppBadge() (ou setAppBadge(0) se clearAppBadge indisponível), nunca deixando um badge '1' preso"
    requirement: "PUSH-04"
    verification:
      - kind: unit
        ref: "__tests__/pushBadge.test.ts#'com API presente e permissão granted, pendente=false chama clearAppBadge', __tests__/pushBadge.test.ts#'sem clearAppBadge disponível, pendente=false cai para setAppBadge(0)'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Sem 'setAppBadge' in navigator (iOS < 16.4) OU permissão default/denied, updateTrainingBadge nunca chama setAppBadge — no-op silencioso, sem exceção"
    requirement: "PUSH-04"
    verification:
      - kind: unit
        ref: "__tests__/pushBadge.test.ts#'sem \"setAppBadge\" in navigator (iOS < 16.4), não lança e não chama nada', __tests__/pushBadge.test.ts#'com permissão \"default\"...', __tests__/pushBadge.test.ts#'com permissão \"denied\"...'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Promise rejeitada de navigator.setAppBadge/clearAppBadge é engolida via .catch silencioso, nunca aparece como unhandled rejection nem crasha a tela"
    requirement: "PUSH-04"
    verification:
      - kind: unit
        ref: "__tests__/pushBadge.test.ts#'Promise rejeitada de setAppBadge é engolida silenciosamente (sem throw, sem unhandled rejection)'"
        status: pass
    human_judgment: false
  - id: D5
    description: "HomeScreen.tsx dispara updateTrainingBadge via useEffect reusando ehHoje/todaySession.status já calculados, sem duplicar a lógica de 'treino de hoje'"
    requirement: "PUSH-04"
    verification:
      - kind: other
        ref: "grep -n 'updateTrainingBadge(ehHoje' src/screens/HomeScreen.tsx — 1 match; npx tsc --noEmit -p . limpo"
        status: pass
      - kind: unit
        ref: "__tests__/fase3-home.test.tsx, __tests__/homeScreenAtrasado.test.tsx, __tests__/homeScreenJointFlag.test.tsx (28 testes, sem regressão após a mudança)"
        status: pass
    human_judgment: true
    rationale: "A chamada real de navigator.setAppBadge em produção (badge aparecendo de fato no ícone do PWA instalado) só é verificável em UAT de hardware real com iOS 16.4+, já previsto para o Plano 13-04 conforme nota do próprio 13-03-PLAN.md — a lógica de gate/no-op está 100% coberta por jest, o efeito visual do ícone não é simulável em jsdom."

duration: ~12min
completed: 2026-08-15
status: complete
---

# Phase 13 Plan 03: Badge do ícone gated por permissão Summary

**`updateTrainingBadge()` novo em `src/utils/pushBadge.ts` (Badging API `navigator.setAppBadge`/`clearAppBadge`, gated por suporte + `Notification.permission === 'granted'`) ligado à `HomeScreen.tsx` via `useEffect` que reusa exatamente a mesma condição `ehHoje && todaySession.status === 'pending'` já usada no card de destaque — fecha PUSH-04.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-15T12:43:00-03:00
- **Completed:** 2026-08-15T12:47:04-03:00
- **Tasks:** 2 (Task 1 TDD, Task 2 auto)
- **Files modified:** 3 (2 novos, 1 modificado)

## Accomplishments

- `src/utils/pushBadge.ts`: `updateTrainingBadge(pendente: boolean)` — chama `navigator.setAppBadge(1)` quando há pendência, `navigator.clearAppBadge()` (ou `setAppBadge(0)` como fallback) quando não há, SOMENTE com a API presente E `Notification.permission === 'granted'`; qualquer Promise rejeitada é engolida via `.catch` silencioso.
- `__tests__/pushBadge.test.ts`: 7 testes cobrindo os 5 comportamentos do bloco `<behavior>` do plano (mais os 2 sub-casos de clearAppBadge indisponível e permissão denied separada de default).
- `src/screens/HomeScreen.tsx`: `useEffect([ehHoje, todaySession?.status])` chamando `updateTrainingBadge(ehHoje && todaySession?.status === 'pending')` — nenhuma nova definição de "treino pendente hoje", reusa a variável já existente na tela.

## Task Commits

Cada task foi commitada atomicamente (Task 1 seguiu TDD RED→GREEN):

1. **Task 1 RED: cobertura falha de updateTrainingBadge** - `03722b3` (test)
2. **Task 1 GREEN: updateTrainingBadge — badge gated por suporte e permissão (PUSH-04)** - `62e26f4` (feat)
3. **Task 2: Hook em HomeScreen.tsx — badge reflete o treino de hoje (PUSH-04)** - `e72dd3c` (feat)
4. **Fix: substitui setImmediate por Promise.resolve() no teste de Promise rejeitada** - `0d023ba` (fix — deveria ter entrado em `62e26f4`, ficou destravado sem stage, corrigido em commit separado)

**Plan metadata:** `fd708a0` (docs: complete plan)

## Files Created/Modified

- `src/utils/pushBadge.ts` — novo: `updateTrainingBadge()`, gated por suporte + permissão, no-op silencioso, `.catch` silencioso em toda chamada à Badging API.
- `__tests__/pushBadge.test.ts` — novo: guarda permanente dos 7 casos (5 do plano + 2 sub-casos de permissão/fallback).
- `src/screens/HomeScreen.tsx` — modificado: import de `updateTrainingBadge` e `useEffect`, hook novo logo após o cálculo de `ehHoje`/`tituloDestaque`, reusando a variável existente.

## Decisions Made

- **Sem interface `NavegadorComBadge` custom**: o `lib.dom.d.ts` deste projeto já tipa `setAppBadge`/`clearAppBadge` como propriedades não-opcionais de `Navigator` (via `NavigatorBadge`). Uma interface estendendo `Navigator` com esses campos opcionais gerava `TS2430` (incompatibilidade estrutural). Resolvido com um cast pontual `navigator as unknown as Record<string, unknown>` só para a checagem `'x' in navigator` de runtime — documentado inline no arquivo, mesmo espírito do "as any pontual documentado" já autorizado pelo plano.
- **`useEffect` reusa a expressão literal `ehHoje && todaySession?.status === 'pending'`**, idêntica à condição já usada para `tituloDestaque`/`ehAtrasado` — cumpre a prohibition do plano de nunca recalcular "treino pendente" por conta própria.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `setImmediate is not defined` no teste de Promise rejeitada**
- **Found during:** Task 1, primeira execução GREEN dos testes.
- **Issue:** O ambiente jsdom deste projeto não expõe `setImmediate` globalmente; o teste de "Promise rejeitada engolida" usava `new Promise((resolve) => setImmediate(resolve))` para esvaziar a fila de microtasks antes de finalizar.
- **Fix:** Substituído por dois `await Promise.resolve()` encadeados, que dependem só de APIs padrão do ambiente de teste.
- **Files modified:** `__tests__/pushBadge.test.ts`
- **Verification:** 7/7 testes passam, sem unhandled rejection.
- **Committed in:** `0d023ba` — a correção foi aplicada antes do primeiro `git add` da Task 1, mas o arquivo de teste não foi re-staged junto de `src/utils/pushBadge.ts` no commit GREEN (`62e26f4`); detectado no `git status --short` residual antes do commit de metadados e corrigido em commit `fix` separado, mesmo diff.

**2. [Rule 1 - Bug] `TS2430` ao tipar a checagem de suporte da Badging API**
- **Found during:** Task 1, `npx tsc --noEmit -p .` após a primeira implementação de `pushBadge.ts`.
- **Issue:** A interface `NavegadorComBadge extends Navigator` com `setAppBadge?`/`clearAppBadge?` opcionais conflitava com `Navigator` do `lib.dom.d.ts` local, que já declara essas propriedades como obrigatórias — TS recusava a extensão. Uma segunda tentativa, usando `'clearAppBadge' in navigator` direto (sem cast), fazia o TS estreitar o ramo `else` para `never` (já que a interface promete a propriedade sempre presente), quebrando a compilação do fallback `setAppBadge(0)`.
- **Fix:** Removida a interface custom; guard de runtime feito via `navigator as unknown as Record<string, unknown>` isolado numa variável, comentado explicando por que o cast é necessário mesmo com os tipos "prometendo" a propriedade.
- **Files modified:** `src/utils/pushBadge.ts`
- **Verification:** `npx tsc --noEmit -p .` sai limpo; 7/7 testes seguem verdes.
- **Committed in:** `62e26f4` (Task 1)

---

**Total deviations:** 2 auto-fixed (ambos Rule 1 — bugs causados diretamente pela própria implementação desta plan, um de ambiente de teste e um de tipagem).
**Impact on plan:** Nenhum scope creep — ambos os fixes eram necessários para o próprio código da plan compilar/testar corretamente.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PUSH-04 fechado ponta a ponta no código: badge gated por permissão real, sem depender de nenhuma peça de servidor nova.
- Suíte completa do projeto (`npx jest`) permanece 100% verde (158 suítes, 1796 testes) após a mudança — nenhuma regressão introduzida em `HomeScreen.tsx`.
- **Pendente para o Plano 13-04 (UAT):** o efeito visual real do badge no ícone (`navigator.setAppBadge` de fato marcando o app instalado) só é verificável em device iOS 16.4+ real com o PWA instalado e permissão concedida — não simulável neste ambiente sem toolchain nativa (per `MEMORY.md`).

---
*Phase: 13-push-notification-ponta-a-ponta*
*Completed: 2026-08-15*

## Self-Check: PASSED

All 3 files created/modified by this plan verified present on disk (`src/utils/pushBadge.ts`, `__tests__/pushBadge.test.ts`, `src/screens/HomeScreen.tsx`); all 4 commits (`03722b3`, `62e26f4`, `e72dd3c`, `0d023ba`) verified present in `git log`; `git status --short` clean before the final metadata commit. No missing items.
