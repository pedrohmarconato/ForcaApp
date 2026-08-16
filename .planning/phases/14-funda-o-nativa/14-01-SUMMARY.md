---
phase: 14-funda-o-nativa
plan: 01
subsystem: infra
tags: [ios, bundle-identifier, app-group, expo, apple-targets, package-legitimacy]

requires: []
provides:
  - "Decisão D-06 registrada: option-a — espelhar o Android (ios.bundleIdentifier = com.pmarconato.forcaapp)"
  - "Bundle id do widget congelado: com.pmarconato.forcaapp.session-widget (sufixo .session-widget via @bacons/apple-targets)"
  - "App Group candidato congelado: group.com.pmarconato.forcaapp.shared (condicionado ao spike da Plano 14-06/14-07)"
  - "Aprovação explícita do dono para instalar @bacons/apple-targets e expo-build-properties (pacotes sinalizados SUS)"
affects: [14-02, 14-05, 14-07]

actuals:
  tokens: 0
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/14-funda-o-nativa/14-01-SUMMARY.md
  modified: []

key-decisions:
  - "D-06 option-a: espelhar o Android — app com.pmarconato.forcaapp, widget com.pmarconato.forcaapp.session-widget, App Group group.com.pmarconato.forcaapp.shared"
  - "Pacotes SUS aprovados pelo dono contra o registro público: @bacons/apple-targets e expo-build-properties liberados para install na Plano 14-02"

patterns-established: []

requirements-completed: [NAT-01, NAT-02]

coverage:
  - id: D1
    description: "Esquema de bundle identifiers e App Group congelado antes de qualquer scaffold nativo (D-06)"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "Resposta literal do dono nesta conversa (AskUserQuestion, 2026-08-16): 'option-a: espelhar Android (Recomendado)'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Aprovação humana dos 2 pacotes npm sinalizados SUS antes de qualquer npm install"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "Resposta literal do dono nesta conversa (AskUserQuestion, 2026-08-16): 'aprovado'"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-08-16
status: complete
---

# Plano 14-01: Decisões irreversíveis (D-06 + Package Legitimacy Gate) — Summary

**As duas decisões que travam a fase foram registradas pelo dono antes de qualquer código nativo existir: identificadores espelhando o Android (option-a) e aprovação explícita dos dois pacotes SUS.**

## Checkpoint 1 — D-06: esquema de bundle identifiers (checkpoint:decision, gate blocking)

Resposta literal do dono (2026-08-16, nesta conversa):

> **"option-a: espelhar Android (Recomendado)"**

Valores congelados — fonte de verdade para a Plano 14-02 escrever em `app.json` e `targets/session-widget/expo-target.config.js`:

| Identificador | Valor congelado |
|---|---|
| App principal (`ios.bundleIdentifier`) | `com.pmarconato.forcaapp` |
| Target de widget | `com.pmarconato.forcaapp.session-widget` (config do target usa o sufixo `.session-widget`) |
| App Group candidato (se o spike 14-06/14-07 aprovar) | `group.com.pmarconato.forcaapp.shared` |

## Checkpoint 2 — Legitimidade dos pacotes SUS (checkpoint:human-verify, gate blocking-human)

Resposta literal do dono (2026-08-16, nesta conversa):

> **"aprovado"**

Os links do registro público (npmjs.com) e os sinais de legitimidade (autor Evan Bacon para `@bacons/apple-targets`; monorepo `expo/expo` first-party para `expo-build-properties`) foram apresentados ao dono antes da resposta. A instalação de `@bacons/apple-targets` e `expo-build-properties` está liberada para a Task 1 da Plano 14-02. Nenhum install ocorreu antes desta aprovação.

## Deviations

Nenhuma. Plano executado como checkpoint puro — nenhum arquivo de código tocado, conforme a proibição do plano (nenhuma linha de `app.json`, `targets/` ou `modules/` antes das confirmações).

## Self-Check: PASSED

- Decisão D-06 registrada literalmente: PASS
- Aprovação dos 2 pacotes SUS registrada literalmente: PASS
- Nenhum arquivo de código criado/modificado antes das confirmações: PASS (`git status` sem mudanças de código)
