---
phase: 16-tela-bloqueada-comandar
plan: 03
subsystem: testing
tags: [uat, live-activity, app-intents, lock-screen, ios]

requires:
  - phase: 16-tela-bloqueada-comandar (planos 16-01 e 16-02)
    provides: intents da tela bloqueada + fila durável + reconciliação de cold-launch
provides:
  - Validação física dos 3 success criteria da Fase 16 (CMD-01, CMD-02, force-quit)
  - Resposta explícita do dono aos 5 itens do runbook (formato obrigatório do plano)
affects: [fase-17-registro, live-activity, reconciliacao]

actuals:
  tokens: 900
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "force_quit_toque classificado PASS-B pelo critério literal do plano (app reabre sem erro, série ainda ativa, conclusão manual funciona)"
  - "Investigação de por que a reconciliação não produziu PASS-A registrada como todo pendente, não como gap da fase (o plano aceita PASS-B explicitamente)"

patterns-established: []

requirements-completed: [CMD-01, CMD-02]

coverage:
  - id: D1
    description: "Tocar 'Concluir série' no Lock Screen grava a série no app sem abrir o app"
    requirement: CMD-01
    verification:
      - kind: manual_procedural
        ref: "sessão física 17/08/2026, iPhone real, conta uat15@example.test — item concluir_serie=PASS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ajustar descanso (+30s/−30s) pelo Lock Screen reflete no timer do app, sem timer negativo"
    requirement: CMD-02
    verification:
      - kind: manual_procedural
        ref: "sessão física 17/08/2026 — item ajustar_descanso=PASS"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pular descanso pelo Lock Screen ativa a série seguinte sem avançar outras"
    requirement: CMD-02
    verification:
      - kind: manual_procedural
        ref: "sessão física 17/08/2026 — item pular_descanso=PASS"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sem lag perceptível entre toque e reação (success criteria 2 do ROADMAP)"
    verification:
      - kind: manual_procedural
        ref: "sessão física 17/08/2026 — item sem_lag=PASS"
        status: pass
    human_judgment: false
  - id: D5
    description: "Force-quit seguido de toque produz comportamento aceitável (sem perda silenciosa da intenção)"
    verification:
      - kind: manual_procedural
        ref: "sessão física 17/08/2026 — item force_quit_toque=PASS-B"
        status: pass
    human_judgment: false

duration: ~2h30 (inclui fix de build, seed da base local e a sessão física do dono)
completed: 2026-08-17
status: complete
---

# Fase 16 — Plano 03: Sessão física de validação (Summary)

**Os 5 itens do runbook da tela bloqueada validados no iPhone físico: 4× PASS e force_quit_toque=PASS-B (conclusão manual após reabrir, sem perda silenciosa).**

## Resultado por item (resposta explícita do dono)

| Item | Resultado |
|---|---|
| concluir_serie | PASS |
| ajustar_descanso | PASS |
| pular_descanso | PASS |
| sem_lag | PASS |
| force_quit_toque | **PASS-B** |

## Resposta literal do dono (exigência do threat T-16-03-01)

Relato inicial, verbatim:

> "tudeo deu certo só o force quit que quando eu conclu ele fecha o ptreino vai para a home e quando eu entro no treino ele nao conclui a serie"

Pergunta de desambiguação (PASS-B vs FAIL): "depois de reabrir o app e entrar de novo no treino, o que aconteceu quando você tentou concluir a série manualmente?" — resposta escolhida, verbatim:

> "Concluí manualmente, funcionou"

Classificação: critério (b) do passo 8 do runbook — "o app abre normalmente, sem travamento/erro, e a série ainda está `active`/`pending`, permitindo concluir manualmente — reportar `force_quit_toque=PASS-B`". Nenhuma perda silenciosa: a intenção foi recuperável manualmente.

## Observações relevantes

- **PASS-B, não PASS-A**: a reconciliação de cold-launch (16-02) não aplicou sozinha o intent enfileirado no cenário force-quit do aparelho real — ao reabrir, o app foi para a Home (treino fechado na visão do dono) e a série não veio concluída. O plano aceita PASS-B explicitamente, mas o dado importa: registrado em `.planning/todos/pending/force-quit-reconciliacao-pass-b.md` para investigação futura (hipóteses: `perform()` não enfileirou com o app morto, drain não rodou antes da Home, ou guarda CAS descartou por `sessionLogId` divergente).
- **Ambiente do teste**: base **local** (Supabase em `192.168.15.77:54321`, conta `uat15@example.test`), com 4 sessões de musculação seedadas no plano ativo — o bundle instalado embute a URL local, não produção.

## Task Commits

1. **Task 1: Sessão física (checkpoint human-verify)** — sem commit de código; resultado registrado neste SUMMARY.

**Plan metadata:** este commit (docs: complete plan)

## Files Created/Modified

- `.planning/phases/16-tela-bloqueada-comandar/16-03-SUMMARY.md` — este registro
- `.planning/todos/pending/force-quit-reconciliacao-pass-b.md` — investigação futura do PASS-B

## Decisions Made

- Ver `key-decisions` no frontmatter.

## Deviations from Plan

None — plano executado como escrito (runbook seguido na ordem; formato de resposta obrigatório respeitado, incluindo a desambiguação explícita do item 5 antes de classificar).

## Issues Encountered

- O `npm run resign` inicial falhou: os 3 intents de 16-01 sem anotações `@available` quebravam o build Release (o `verify:native` não compila Swift — ponto cego já anotado). Corrigido em `be85e55` antes da sessão física.
- A conta de teste não tinha treino pendente; seed direto na base local (4 sessões `pending` de musculação, `rest_seconds=90`).

## User Setup Required

None — ambiente local já configurado (Wi-Fi compartilhada + `supabase start`).

## Next Phase Readiness

- CMD-01/CMD-02 validados fisicamente; Fase 16 pronta para verificação final.
- Follow-up não bloqueante: investigar por que o cold-launch não reconciliou sozinho (PASS-B em vez de PASS-A) antes de fases que dependam de reconciliação automática.

---
*Phase: 16-tela-bloqueada-comandar*
*Completed: 2026-08-17*
