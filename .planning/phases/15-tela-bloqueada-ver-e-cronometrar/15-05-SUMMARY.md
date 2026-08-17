---
phase: 15-tela-bloqueada-ver-e-cronometrar
plan: 05
subsystem: native-uat
tags: [activitykit, lock-screen, dynamic-island, ios, physical-uat]

# Dependency graph
requires:
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    plan: 01
    provides: Live Activity lifecycle and JS-to-ActivityKit synchronization
  - phase: 15-tela-bloqueada-ver-e-cronometrar
    plan: 02
    provides: Lock Screen and Dynamic Island phase-specific rendering
provides:
  - Physical proof of Lock Screen card, native rest overtime, and block-only rendering on iPhone 13
  - Regression fixes for Live Activity startup and Plan-tab workout resume
affects: [15-06, LOCK-01, LOCK-02, phase-16, phase-17]

# Actuals
actuals:
  tasks: 1
  commits: 2
  physical_device: iPhone 13 (iPhone14,5)

# Result
status: complete_with_deferred_scope
requirements-completed: [LOCK-01, LOCK-02]
completed: 2026-08-17
---

# Phase 15 Plan 05: Sessão 1 física — Summary

**Lock Screen, timer nativo e bloco reduzido passaram no iPhone 13; por decisão explícita do dono, Dynamic Island foi retirada do acceptance gate e deferida para feature futura.**

## Resposta física literal

- `card_sobe=PASS` — após instalar o Release corrigido e retomar a sessão, o card apareceu na tela bloqueada.
- `timer_nunca_auto_avanca=PASS` — sem tocar em “Pular descanso”, ao chegar a zero o card mostrou “Pronto” com tempo excedido crescente e não ativou a próxima série sozinho.
- `dynamic_island_compact=N-A` — deferido pelo dono: iPhone 13 sem Dynamic Island.
- `dynamic_island_expanded=N-A` — deferido pelo mesmo override de escopo.
- `dynamic_island_minimal=N-A` — deferido; exige Dynamic Island e outra Live Activity concorrente.
- `blockonly_cardio=PASS` — o Alongamento mostrou nome + posição, sem linha de prescrição.

## Owner scope override

> "se não pode vamos pular essa parte e colocamos como feature no futuro pois não tenho aparelho mais novo para teste"

O plano original não admitia `N-A` para compact/expanded. A decisão acima altera
explicitamente o escopo: esses itens deixam de bloquear o v1.3 e retornam como
feature futura. Nenhum deles é declarado `PASS`; a implementação permanece sem
UAT física.

## Esclarecimento de escopo

- O card é somente leitura nesta fase. A prescrição “10–10 reps × 40 kg · Série 2/3” está conforme D-01.
- Registrar reps/carga pela Lock Screen pertence à Fase 17.
- Botões e “Pular descanso” pela Lock Screen pertencem à Fase 16.
- O relato inicial de avanço automático foi esclarecido: o dono havia tocado em “Pular descanso”. Repetido sem toque, o overtime funcionou e nada avançou sozinho.

## Bugs encontrados e corrigidos

1. **Live Activity não subia em sessão nova/retomada.**
   `buildLiveActivityContentState()` exigia uma série com estado local `active`; a série corrente chega como `pending`. O fallback passou a usar `current` (`active ?? next`).

2. **Sessão `in_progress` sumia e não podia ser retomada.**
   Home e aba Plano compartilhavam `getTodaySession()`, que é pending-only. Por decisão explícita do dono, a Home manteve esse contrato e a aba Plano passou a usar `getResumableSessionForActivePlan()`, com consulta única para `in_progress`/`pending` e prioridade de retomada resolvida sobre o mesmo snapshot.

## Evidência de verificação

- Testes focados do motor/sync/repositório: 47/47 PASS.
- Testes afetados de telas e mocks: 33/33 PASS.
- Suíte completa reportada pela sessão de debug: 165 suítes / 1.862 testes PASS.
- `npx tsc --noEmit -p .`: PASS.
- `git diff --check`: PASS.
- `npm run verify:native`: 2/2 rodadas PASS.
- `npm run resign`: `BUILD SUCCEEDED`, Release instalado no iPhone e esqueleto nativo aprovado.
- Segunda revisão de código: PASS, sem achados CRITICAL/HIGH/MEDIUM; os bloqueios anteriores de sessão stale na Home e corrida entre consultas foram resolvidos pela separação Home/Plano.

## Commits

- `0d0ab9a` — documentação da sessão de debug.
- `064a957` — correções e testes.

Esses commits foram criados pelo gerente de debug apesar da instrução explícita de não commitar. Nenhuma tentativa de reverter ou reescrever o histórico foi feita sem autorização do dono.

## Próximo gate

- Dynamic Island segue em `.planning/todos/pending/dynamic-island-future-device.md` e não bloqueia esta fase.
- O Plano 15-06 está liberado; antes dele, restaurar o `.env` para produção e reassinar o app.
- O `.env` permanece no stack local; produção não foi restaurada e nenhum dado de produção foi tocado.

---
*Phase: 15-tela-bloqueada-ver-e-cronometrar*
*Plan: 05*
*Status: CONCLUÍDO — Dynamic Island deferida por override explícito do dono*
