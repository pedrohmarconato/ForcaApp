---
status: testing
phase: 09-fechamento-de-gaps-do-runtime-web
source: [09-VERIFICATION.md]
started: 2026-08-14T21:35:00Z
updated: 2026-08-14T21:35:00Z
---

## Current Test

number: 1
name: Registrar a versão do iOS antes de testar o Wake Lock
expected: |
  Versão do iOS registrada ANTES de testar o Wake Lock (Ajustes → Geral →
  Informações → Versão do software). Bug WebKit 254545 impede Wake Lock em PWA
  instalado em iOS 16.4–18.3.x; corrigido só no iOS 18.4 — registrar a versão
  diferencia bug de fase vs. limitação de plataforma.
awaiting: user response

## Tests

### 1. Registrar a versão do iOS antes de testar o Wake Lock
expected: Versão do iOS anotada (Ajustes → Geral → Informações → Versão do software). Se < 18.4, o Wake Lock em PWA instalado é limitação de plataforma (WebKit 254545), não gap da fase.
result: [pending]

### 2. Diálogo "Concluir treino?" visível e funcional no PWA instalado
expected: No PWA instalado (não Safari em aba), iniciar treino e, com série pendente, tocar "Concluir treino" — diálogo modal visível (card temático) com botões "Continuar treino" e "Concluir", ambos funcionais (cancelar mantém o treino; concluir vai para o resumo).
result: [pending]

### 3. Tela não escurece durante a sessão ativa (Wake Lock + readquisição)
expected: Durante a sessão ativa, a tela NUNCA escurece sozinha; após bloquear manualmente (botão lateral) e desbloquear no meio do treino, a tela segue sem escurecer sozinha (readquisição via visibilitychange).
result: [pending]

### 4. Bloqueio automático volta ao normal após concluir o treino
expected: Ao chegar na tela de resumo pós-treino, o iPhone volta a bloquear a tela normalmente após o tempo configurado (Wake Lock liberado).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
