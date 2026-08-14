---
status: partial
phase: 05-integra-o-e-review-do-gr-fico-de-cardio
source: [05-VERIFICATION.md]
started: 2026-08-14T00:00:00Z
updated: 2026-08-14T00:00:00Z
---

## Current Test

number: 1
name: Renderização visual do gráfico de evolução de cardio
expected: |
  Na aba Progresso, entre a seção de prescrição de cardio e Recordes, o
  CardioEvolucaoChart renderiza: eixo X em ordem cronológica, pace formatado
  pt-BR, chip por modalidade (série trocada agrupa na modalidade de DESTINO —
  fix do achado 4), sem "0" inventado onde não há amostra (mostra "—"/estado
  vazio com menos de 2 pontos). Alvo aceito: Expo web (`npx expo start --web`)
  com Supabase local — build nativo iOS/Android fica como caveat conhecido da
  máquina (mesma regra do teste 8(c) da Fase 3).
awaiting: user response

## Tests

### 1. Renderização visual do gráfico de evolução de cardio
expected: Gráfico visível e correto na aba Progresso via Expo web (detalhe acima); estados de loading/erro/vazio não quebram a tela.
result: skipped — decisão do dono (2026-08-14): "manda tudo para prod logo quero fazer a verificacao em producao". A verificação visual será feita PELO DONO no PWA de produção após o deploy da Fase 8; este item permanece como dívida até o dono reportar o resultado.

## Summary

total: 1
passed: 0
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
