---
status: testing
phase: 12-p-gina-de-instala-o-guiada
source: [12-02-PLAN.md Task 1 (checkpoint:human-verify)]
started: 2026-08-15T14:30:00Z
updated: 2026-08-15T14:30:00Z
---

## Current Test

number: 1
name: Aluno leigo instala sozinho via /instalar (critério 3 do ROADMAP)
expected: |
  Você (ou idealmente um aluno real) abre
  https://forca-app-six.vercel.app/instalar no Safari do iPhone e segue os
  passos exibidos SEM ajuda verbal — e termina com o app instalado na Tela de
  Início. Observação (Pitfall 1): note se aparece flash de "Carregando..." ou
  tela escura antes da página; reporte se a rota cair no login.
awaiting: user response

## Tests

### 1. Aluno leigo instala sozinho via /instalar
expected: Página mostra os 3 passos no Safari iOS; a pessoa instala sem ajuda; sem flash/perda de rota na visita fria deslogada.
result: [pending]

### 2. Estado "já instalado" adapta a mensagem
expected: Abrir /instalar DENTRO do PWA instalado (standalone) mostra a mensagem de sucesso com CTA "Abrir o ForçaApp" — sem repetir o passo a passo.
result: [pending]

### 3. Outro navegador redireciona ao Safari
expected: Abrir o link no Chrome iOS mostra "Abra este link no Safari" com instrução.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
