---
status: testing
phase: 11-service-worker-e-atualiza-o-segura
source: [11-03-PLAN.md Task 3 (checkpoint:human-verify), 11-02 deviation note]
started: 2026-08-15T00:20:00Z
updated: 2026-08-15T00:20:00Z
---

## Current Test

number: 1
name: App shell abre em modo avião (OFF-01, critério 4)
expected: |
  Com o PWA instalado (reinstalar após o deploy de 2026-08-15) e aberto ao menos
  uma vez COM rede (para o SW instalar e precachear), ativar o modo avião,
  fechar o app e abrir pelo ícone da Tela de Início — a casca do app aparece
  (não a página de erro do Safari).
awaiting: user response

## Tests

### 1. App shell abre em modo avião (OFF-01)
expected: Após uma primeira abertura com rede (SW instala/precacheia), modo avião + abrir pelo ícone → casca do app aparece.
result: [pending]

### 2. Banner de atualização no próximo deploy (OFF-02)
expected: Quando um próximo deploy acontecer, com o app aberto (ou ao reabrir), aparece o banner "Nova versão disponível" com "Atualizar"/"Depois"; tocar "Atualizar" recarrega UMA vez para a versão nova; "Depois" dispensa e a versão nova entra na abertura seguinte. Nunca reload sozinho.
result: [pending]

### 3. Sem regressão de dados offline (OFF-01)
expected: Treino executado offline continua sincronizando pelo outbox quando a rede volta (o SW não interfere — spot-check de comportamento igual ao v1.0).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
