---
status: testing
phase: 03-interc-mbio-de-modalidade-de-cardio
source: [03-VERIFICATION.md]
started: 2026-08-10T14:01:28Z
updated: 2026-08-10T14:01:28Z
---

## Current Test

number: 1
name: Trocar modalidade pela fila da sessão, contra o servidor real
expected: |
  Numa sessão real em homologação, o exercício de cardio da fila oferece "Trocar modalidade";
  a lista mostra só as modalidades aceitas do usuário (sem a atual); confirmar persiste a
  troca no servidor — não só na tela. Fechar e reabrir o app na mesma sessão mantém a
  modalidade trocada (prova que a gravação foi ao banco e a retomada reconcilia).
awaiting: user response

## Tests

### 1. Trocar modalidade pela fila da sessão, contra o servidor real
expected: O botão "Trocar modalidade" aparece no exercício de cardio da fila; a lista traz só as modalidades aceitas, sem a atual; confirmar grava no servidor (RPC `swap_session_exercise`, tabela `cardio_exercise_swaps`); fechar e reabrir o app mantém a troca.
result: [pending]

### 2. Trocar modalidade pelo fluxo de recusa (`sem_equipamento`)
expected: Ao escolher o motivo "sem equipamento" num exercício de cardio, o sheet oferece "Trocar modalidade" ao lado de "Recusar mesmo assim"; escolher trocar abre o MESMO seletor do teste 1 e persiste igual. Escolher "Recusar mesmo assim" continua se comportando exatamente como o "Não vou fazer" de hoje.
result: [pending]

### 3. Rótulo "Trocado de X" na sessão ativa e no histórico
expected: Depois da troca, a sessão ativa mostra "Trocado de X" no exercício; ao concluir a sessão, o detalhe no histórico mostra o mesmo rótulo E o resultado do cardio legível (tempo/distância) — este último era um bug pré-existente que a Fase 3 consertou.
result: [pending]

### 4. Km realizado na aba Progresso após uma troca
expected: O km realizado da semana soma a distância da modalidade trocada junto com as demais, num total único; o km PRESCRITO permanece cheio, sem desconto pela sessão trocada.
result: [pending]

### 5. Troca bloqueada depois de série concluída (CR-01, contra o servidor real)
expected: Registrar uma série do exercício de cardio e então tentar trocar a modalidade: o app recusa com a mensagem "Não é possível trocar a modalidade depois de uma série concluída" e NADA é gravado no servidor. O histórico da série já feita continua sob a modalidade em que foi realmente executada.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
