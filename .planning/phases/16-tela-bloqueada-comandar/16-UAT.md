---
status: complete
phase: 16-tela-bloqueada-comandar
source:
  - 16-03-SUMMARY.md
  - 16-09-SUMMARY.md
  - 16-11-SUMMARY.md (corpo + adendo)
started: 2026-08-18
updated: 2026-08-18
---

## Current Test

number: —
name: —
expected: —
awaiting: nada — todos os testes desta rodada foram respondidos pelo dono

## Tests

Os testes abaixo mapeiam 1:1 os três **Success Criteria** da Fase 16 no
`ROADMAP.md`, mais o item de duração que a `16-VERIFICATION.md` levantou por
leitura de código (não é critério do ROADMAP).

### 1. Concluir série pela tela bloqueada, sem abrir o app (ROADMAP crit. 1)
expected: o toque em "Concluir série" na Lock Screen registra a série pelo mesmo caminho `completeSet()` → outbox → servidor, sem a Live Activity virar fonte de verdade
result: pass
evidence: UAT físico da Plano 16-03; mecanismo inalterado desde então

### 2. Pular/ajustar descanso pela tela bloqueada (ROADMAP crit. 2)
expected: o timer nativo reflete o ajuste imediatamente, sem lag perceptível
result: pass
evidence: UAT físico da Plano 16-03 (`pular_descanso=PASS`); `16-VERIFICATION.md` classifica CMD-02 como ✓ SATISFIED

### 3. Force-quit + toque na tela bloqueada valida o `perform()` no cold-launch (ROADMAP crit. 3)
expected: com o app force-quit, o toque no botão da Lock Screen resulta em ação de fato aplicada na reabertura
result: pass
reported: "agora deu certo"
ui_path_confirmado: "Só pelos botões -/+ do stepper"
evidence: |
  Rodada 1 (build sem o fix, HEAD b05e4b2): FAIL — a série "ficou como estava",
  SEM nenhuma mensagem de erro. Resposta literal do dono: "part 1 nao aconteceu,
  simlesmente ficoou como estava". Sob pergunta dirigida, confirmou que o botão
  da Lock Screen apareceu e respondeu ao toque.

  Diagnóstico: descarte silencioso de intent órfã — `CompleteSetIntent.swift:12`
  pode resolver `sessionLogId` como `nil` no cold-launch, e
  `activeSessionStore.ts:1699-1712` tratava nulo e divergente como o mesmo caso,
  fazendo `ack` (remoção definitiva) sem nunca chamar `completeSet()`.

  Fix `54de3ef`: nulo passa a ser adotado pelo draft ativo quando há prova
  temporal (`queuedAt >= startedAt`); divergente segue descartado.

  Rodada 2 (build com o fix, HEAD dbb2e7e, árvore limpa): PASS. Mesmo roteiro,
  mesmo aparelho, MESMO caminho de UI (só o stepper de carga). Variável isolada
  — o build só diferiu por `54de3ef`, com proveniência provada direto no bundle
  (`nasceuNestaSessao` presente 1× em `main.jsbundle`), não inferida por commit.

  Como `completeSet()` só conclui se `canCompleteSet()` aprovar
  (`actualLoadKg > 0`), o PASS também prova que a carga ajustada pelo stepper
  sobreviveu ao force-quit.

### 4. Force-quit após informar duração de exercício de cardio/isometria
expected: a série de métrica `tempo`/`tempo_distancia` conclui automaticamente na reabertura
result: blocked
blocked_by: physical-device
reason: |
  O dono declinou executar. Motivo declarado, que é fato de domínio relevante:
  o programa de treino dele **não contém** exercício de métrica
  `tempo`/`tempo_distancia`; quando contém, a duração é digitada. Resposta
  literal: "na parte 2 nao temos esse tipo de treinamento, quando há nos
  digitamos o tempo mas se quiser tenta voce esse pq eu nao quero".

  NÃO é um Success Criteria do ROADMAP — é um item derivado que a
  `16-VERIFICATION.md` levantou por leitura de código.

  Cobertura substitutiva (commit `91ec4b4`, 4 testes): caminho `setDuration` →
  persistência → reconciliação, incluindo ciclo de force-quit simulado que
  reidrata só do que `saveDraft` gravou. Validado por mutação: removendo
  `saveDraft()` de `setDuration`, exatamente os 2 testes de persistência falham.

  LIMITE, registrado como evidência de tipo diferente e nunca como UAT físico
  cumprido: exercita só o trecho JS entre `setDuration()` e `completeSet()`.
  Não passa por force-quit real, Lock Screen, App Group nem cold start do iOS.

## Summary

total: 4
passed: 3
issues: 0
blocked: 1

**Os três Success Criteria do ROADMAP da Fase 16 estão cobertos por UAT físico.**
O único item sem verificação física (teste 4) não é critério do ROADMAP e tem
cobertura automatizada, com o limite dela declarado.

## Correção do registro histórico

As Planos 16-08, 16-09 e 16-10 trataram persistência de carga/duração como a
causa do `force_quit_toque=FAIL`. A rodada de hoje mostrou que a causa estava
uma camada acima — na reconciliação da fila de intents. Aquele trabalho não foi
inútil (a persistência é necessária e o PASS de hoje depende dela), mas **não
era o que bloqueava CMD-01**.

## Gaps residuais (não bloqueiam os critérios do ROADMAP)

| Item | Origem | Situação |
|---|---|---|
| Caminho de duração sem UAT físico | teste 4 acima | Cobertura automatizada; exposição baixa (o programa do dono não tem esse tipo de exercício) |
| Causa raiz do `nil` no Swift | `CompleteSetIntent.swift:12` | Não corrigida. O fix `54de3ef` é defesa no consumidor; a origem do `nil` continua |
| `reconcileOrphans` encerra Live Activities incondicionalmente no boot | `LiveActivityModule.swift:120-127` | Bug real, separado, não investigado |
| WR-01: `void ackQueuedLiveActivityIntent(...)` sem `.catch()` | `16-VERIFICATION.md` | Pré-existente e carregado; o fix `54de3ef` manteve o padrão |
| WR-02/WR-03/WR-04 | `16-VERIFICATION.md` | Carregados das rodadas anteriores, sem mudança |
