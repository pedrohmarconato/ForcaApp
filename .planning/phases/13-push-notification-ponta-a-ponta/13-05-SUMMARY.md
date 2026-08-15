---
phase: 13-push-notification-ponta-a-ponta
plan: 05
subsystem: ui
tags: [react-native-web, zustand, async-storage, web-push, alertShim]

# Dependency graph
requires:
  - phase: 13-push-notification-ponta-a-ponta
    provides: "src/services/pushSubscription.ts (subscribeToPush/isPushSupported), botão de opt-in do Perfil, ENDPOINTS.PUSH.SUBSCRIBE (Plano 13-01)"
  - phase: 09-fechamento-dos-gaps-do-runtime-web
    provides: "alertShim.ts/showAlert() + AlertHost.tsx (Modal web substituto de Alert.alert)"
provides:
  - "src/components/PushInviteHost.tsx: convite ÚNICO de opt-in via alertShim, montado uma vez em App.tsx"
  - "Flag AsyncStorage push_invite_shown gravada nos dois caminhos (aceitar/recusar) — convite nunca reaparece"
affects: [13-04-producao-e-uat]

actuals:
  tokens: 3326
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Convite proativo global: mesmo molde de UpdateBanner (componente montado uma vez em App.tsx, decide sozinho via useEffect, sem props), mas usando o Modal bloqueante de AlertHost em vez de uma faixa não-bloqueante."
    - "subscribeToPush() como primeira expressão síncrona do onPress do botão do Modal web — mesma garantia do botão nativo do Perfil (13-01), agora também no caminho do convite proativo."

key-files:
  created:
    - src/components/PushInviteHost.tsx
    - __tests__/pushInviteHost.test.tsx
  modified:
    - App.tsx

key-decisions:
  - "Flag push_invite_shown escrita com o literal explícito em cada onPress (aceitar e recusar), em vez de uma função helper compartilhada — mantém o grep de verificação e a leitura do código diretos, sem indireção desnecessária para uma chamada de uma linha (YAGNI: a duplicação é trivial e não justifica abstração)."
  - "Leitura da flag (AsyncStorage.getItem) é assíncrona antes do setTimeout de exibição — o efeito usa uma flag local `cancelado` + guarda no cleanup para não agendar/disparar o Modal depois de um unmount (ex.: logout durante os 2s de atraso)."
  - "Teste 4 do plano (permission granted OU denied) foi dividido em dois testes (Teste 4 e Teste 4b) para cobrir os dois valores de permissão já decidida sem overloading de um único `it`."

patterns-established:
  - "Handler de opt-in via Modal web: subscribeToPush() é literalmente a primeira linha do onPress do botão 'Ativar' — mesmo padrão já estabelecido no botão nativo do Perfil (13-01), agora replicado no convite proativo."

requirements-completed: [PUSH-01]

coverage:
  - id: D1
    description: "PushInviteHost mostra o convite exatamente uma vez (usuário com plano, push suportado, permission default, sem flag) e nunca em onboarding incompleto, permissão já decidida, ou flag já gravada"
    requirement: "PUSH-01"
    verification:
      - kind: unit
        ref: "__tests__/pushInviteHost.test.tsx#Teste 1, Teste 2, Teste 3, Teste 4, Teste 4b"
        status: pass
    human_judgment: false
  - id: D2
    description: "subscribeToPush() é a primeira expressão síncrona do onPress do botão 'Ativar' do convite (gesto do usuário preservado para o iOS)"
    requirement: "PUSH-01"
    verification:
      - kind: unit
        ref: "__tests__/pushInviteHost.test.tsx#Teste 5"
        status: pass
      - kind: other
        ref: "grep -n 'subscribeToPush()' src/components/PushInviteHost.tsx — primeira expressão do bloco onPress (linha 84), sem await/checagem antes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Flag push_invite_shown gravada nos dois caminhos (aceitar e recusar) — convite não reaparece mesmo se recusado"
    requirement: "PUSH-01"
    verification:
      - kind: unit
        ref: "__tests__/pushInviteHost.test.tsx#Teste 5, Teste 6"
        status: pass
      - kind: other
        ref: "grep -n 'push_invite_shown' src/components/PushInviteHost.tsx — aparece nos dois onPress (linhas 73 e 89)"
        status: pass
    human_judgment: false
  - id: D4
    description: "PushInviteHost montado em App.tsx depois de AlertHost, dentro de AuthProvider, sem regressão de boot"
    requirement: "PUSH-01"
    verification:
      - kind: other
        ref: "npx tsc --noEmit -p . — código 0"
        status: pass
      - kind: unit
        ref: "suíte completa (npx jest) — 159 suites, 1803 testes, todos verdes"
        status: pass
    human_judgment: true
    rationale: "Cobertura automatizada completa (tsc + suíte inteira sem regressão); o comportamento visual real do Modal aparecendo em cima do app já montado (timing de 2s, sobreposição com outras telas) só é verificável em UAT de navegador/hardware real, já previsto para o Plano 13-04."

duration: ~15min
completed: 2026-08-15
status: complete
---

# Phase 13 Plan 05: PushInviteHost — convite único de opt-in via alertShim Summary

**Convite proativo de opt-in de push (`PushInviteHost`), mostrado exatamente uma vez via o mesmo Modal web (`alertShim`/`AlertHost`) já usado em todo o app, fechando a peça de PUSH-01 que faltava: o aluno não precisa mais descobrir sozinho o botão "Ativar notificações" no Perfil.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Tasks:** 2
- **Files modified:** 3 (2 novos, 1 modificado)

## Accomplishments

- `src/components/PushInviteHost.tsx`: componente global (molde de `UpdateBanner`), montado uma vez, decide sozinho via `useEffect` se deve mostrar o convite: usuário autenticado, `profile.current_plan_id` presente (onboarding completo), push suportado, `Notification.permission === 'default'` (nunca perguntado) e a flag `push_invite_shown` ainda ausente no `AsyncStorage`.
- Convite exibido com atraso de 2s (não competir com o primeiro paint) via `showAlert()` do `alertShim` — mesmo Modal custom de `AlertHost.tsx` já auditado na Fase 9.
- Botão "Ativar" do convite: `subscribeToPush()` é a primeira expressão síncrona do `onPress`, preservando o gesto do usuário exigido pelo iOS Safari (mesmo critério 2 já aplicado ao botão do Perfil em 13-01) — reusa o mesmo `POST /api/push/subscribe`, sem duplicar lógica.
- Botão "Agora não" e botão "Ativar": os dois caminhos gravam a flag `push_invite_shown = 'true'` no `AsyncStorage` — o convite é único e nunca reaparece, independente da decisão do aluno.
- `App.tsx`: `PushInviteHost` montado dentro de `AuthProvider`, depois de `AlertHost` (precisa que o `alertStore` já esteja pronto para receber o `showAlert`).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: PushInviteHost — decide UMA VEZ, convida via alertShim (PUSH-01)** - `43fac10` (feat)
2. **Task 2: Regressão de App.tsx (montagem não quebra o boot do app)** - `9dd964d` (feat)

**Plan metadata:** (este commit)

## Files Created/Modified

- `src/components/PushInviteHost.tsx` - convite único de opt-in, decide sozinho quando aparecer, reusa `subscribeToPush()`/`showAlert()` sem duplicar lógica
- `__tests__/pushInviteHost.test.tsx` - 7 testes cobrindo os 6 comportamentos do plano (Teste 4 dividido em granted/denied)
- `App.tsx` - importa e monta `PushInviteHost` dentro de `AuthProvider`, depois de `AlertHost`

## Decisions Made

- **Literal `push_invite_shown` duplicado em cada `onPress`** (em vez de uma função helper): mantém o grep de verificação e a leitura direta, sem indireção para uma chamada de uma linha.
- **Guarda `cancelado` + cleanup do `useEffect`**: como a leitura da flag é assíncrona (antes do `setTimeout` de exibição), um unmount durante os 2s de atraso (ex.: logout) não deve agendar nem disparar o Modal depois do componente ter saído da árvore.
- **Teste 4 do plano dividido em dois `it`s** (Teste 4 e Teste 4b) para cobrir `permission === 'granted'` e `permission === 'denied'` separadamente, mais legível que um `it.each` para apenas dois casos.

## Deviations from Plan

None - plan executed exactly as written. Os 6 comportamentos do bloco `<behavior>` foram implementados e testados literalmente como especificado; o único ajuste foi de granularidade de teste (dividir o Teste 4 em dois `it`s), não uma mudança de comportamento.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (A aplicação da migration `0038_push_subscriptions.sql` em staging, bloqueada no Plano 13-01, continua pendente do dono — este plano não depende dela para os testes automatizados passarem, já que reusa o mesmo `subscribeToPush()`/`POST /api/push/subscribe` já entregues.)

## Next Phase Readiness

- PUSH-01 está com toda a superfície de opt-in entregue: botão no Perfil (13-01) + convite proativo único (este plano). Nenhuma pendência de frontend restante para PUSH-01.
- UAT ponta a ponta do convite (aparência real do Modal 2s após onboarding, em navegador/hardware real) segue prevista para o Plano 13-04, junto da aplicação da migration em staging.

---
*Phase: 13-push-notification-ponta-a-ponta*
*Completed: 2026-08-15*

## Self-Check: PASSED

Both files created by this plan verified present on disk (`src/components/PushInviteHost.tsx`, `__tests__/pushInviteHost.test.tsx`), plus this SUMMARY.md. Both task commits (`43fac10`, `9dd964d`) verified present in `git log`. No missing items.
