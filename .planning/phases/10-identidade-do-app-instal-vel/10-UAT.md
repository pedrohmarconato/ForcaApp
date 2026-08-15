---
status: testing
phase: 10-identidade-do-app-instal-vel
source: [10-01-PLAN.md Task 3 (checkpoint:human-verify, gate blocking)]
started: 2026-08-14T22:30:00Z
updated: 2026-08-14T22:30:00Z
---

## Current Test

number: 1
name: Pré-checagem do deploy (opcional, recomendado)
expected: |
  Deploy da Vercel concluído após o push. Opcional:
  curl -I https://forca-app-six.vercel.app/splash/<arquivo-real-de-public-splash>.png
  retorna content-type: image/png (não text/html).
awaiting: user response

## Tests

### 1. Pré-checagem do deploy (opcional)
expected: curl -I no arquivo de splash retorna content-type image/png (não text/html) após o deploy.
result: [pending]

### 2. Splash aparece sem flash branco (reinstalação obrigatória)
expected: Se o PWA já estava instalado, remover e reinstalar (iOS cacheia a splash na instalação). Ao abrir pelo ícone, aparece a splash com o símbolo F neon centrado sobre #0A0A0A — sem nenhum instante de tela branca.
result: [pending]

### 3. Ícone e nome próprios na Tela de Início
expected: Ícone da identidade final e o nome "Força" (não a URL da Vercel) sob ele.
result: [pending]

### 4. Modo standalone
expected: O app abre sem a barra de endereço do Safari.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
