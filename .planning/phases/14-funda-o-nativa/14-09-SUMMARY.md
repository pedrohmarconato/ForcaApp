---
phase: 14-funda-o-nativa
plan: 09
subsystem: infra
tags: [ios, device, resign, uat, provisioning, physical-session]

requires:
  - phase: 14-funda-o-nativa (plano 08)
    provides: "Regressão automatizada verde antes da UAT física"
  - phase: 14-funda-o-nativa (plano 04)
    provides: "scripts/resign.sh — a rotina exercitada nesta sessão"
provides:
  - "Sessão 2 física concluída: npm run resign roda 8/8 e o app reabre sem erro de confiança"
  - "Critério 2 do ROADMAP fechado: rotina de reassinatura semanal validada no aparelho"
  - "Item de UAT em aberto por decisão do dono: fluxo de treino real, bloqueado pelo backend"
affects: []

actuals:
  tokens: 0
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/14-funda-o-nativa/14-09-SUMMARY.md
  modified: []

key-decisions:
  - "Fase 14 fecha com 3 dos 4 itens de UAT confirmados; o fluxo de treino real fica explicitamente em aberto por decisão do dono, não por omissão"
  - "resign.sh passou a construir Release durante esta sessão: Debug não embute main.jsbundle e instalaria um app que abre sem funcionar"

patterns-established:
  - "Item de UAT bloqueado por dependência externa é registrado como pendência rastreada, nunca convertido em PASS por proximidade"

requirements-completed: [NAT-01]

coverage:
  - id: D1
    description: "Rotina de reassinatura semanal roda em um comando e o app reabre sem erro de confiança"
    requirement: "NAT-01"
    verification:
      - kind: e2e
        ref: "npm run resign → 8/8 passos, ** BUILD SUCCEEDED **, App installed (bundleID com.pmarconato.forcaapp), gate (a)-(f) OK, exit 0"
        status: pass
      - kind: manual_procedural
        ref: "Resposta literal do dono (2026-08-16): reassinatura = PASS"
        status: pass
    human_judgment: false
  - id: D2
    description: "Identidade visual do app no aparelho (ícone e nome) corresponde ao Força"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "Resposta literal do dono (2026-08-16): identidade = PASS"
        status: pass
    human_judgment: false
  - id: D3
    description: "Banner de expiração não produz alarme falso com o perfil longe do vencimento"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "Resposta literal do dono (2026-08-16): banner = N-A, nenhum aviso apareceu (perfis expiram 2026-08-23, 7 dias)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Sessão de treino real de ponta a ponta no app nativo, com a conta do dono, indistinguível do PWA"
    verification: []
    human_judgment: true
    rationale: "BLOQUEADO — o login não completa no aparelho porque EXPO_PUBLIC_SUPABASE_URL aponta para 127.0.0.1. O dono decidiu deixar este item em aberto e testá-lo junto com a migração para o Supabase de produção. Rastreado em .planning/todos/pending/backend-supabase-producao-no-aparelho.md. NÃO é PASS."

duration: 15min
completed: 2026-08-16
status: complete
---

# Plano 14-09: Sessão 2 física — reassinatura e UAT de paridade — Summary

**A rotina de reassinatura semanal funciona em um comando e o app reabre limpo no aparelho; três dos quatro itens de UAT passaram, e o quarto ficou explicitamente em aberto por decisão do dono, bloqueado por backend.**

## Respostas do dono (formato exigido por D-10)

| Item | Resposta |
|---|---|
| reassinatura | **PASS** |
| identidade | **PASS** |
| banner | **N-A** — nenhum aviso apareceu |
| fluxo_de_treino | **em aberto** — *"Deixar em aberto e fechar o resto"* |

Nenhum item foi presumido PASS. O quarto item não recebeu PASS/FAIL porque não pôde ser exercitado: o dono decidiu, com a causa já diagnosticada e registrada, adiá-lo em vez de forçar um veredito sem teste.

## Evidência da reassinatura

`npm run resign` executou os 8 passos e terminou com `exit 0`:

```
** BUILD SUCCEEDED **
5/8 — .app: .../Build/Products/Release-iphoneos/ForcaApp.app
6/8 — Device UDID: 4697DDAD-BE62-54D1-9DE9-47FA02F4A7F7
7/8 — App installed: bundleID: com.pmarconato.forcaapp
8/8 — Rodada 1: (a)-(f) OK. / Rodada 2: (a)-(f) OK.
OK: reassinatura concluida — build assinado instalado e esqueleto nativo verificado.
```

Perfis de provisionamento válidos até **2026-08-23** (7 dias), para os dois alvos — o que torna `N-A` a resposta correta para o banner nesta data, e não uma checagem pulada.

## Correção aplicada antes desta sessão

`scripts/resign.sh` construía `-configuration Debug`. A Plano 14-06 provou empiricamente que um build Debug não embute `main.jsbundle` e não roda sem o Metro — a rotina teria reinstalado um app que abre e não funciona, justamente o oposto do seu propósito. O script foi corrigido para Release (commit `0fd3376`) e `verify-native-skeleton.sh` ganhou a checagem `(f)`, que aborta se alguém reverter para Debug (commit `7bab1b5`). O comentário do script que descrevia o adiamento foi substituído pela causa real.

## Item em aberto

**Fluxo de treino real (critério 1 do ROADMAP)** — não exercitado. O login não completa no aparelho: `EXPO_PUBLIC_SUPABASE_URL` aponta para `127.0.0.1:54321`, que dentro do iPhone é o próprio aparelho, e o Supabase local não estava em execução. Decisão do dono: usar Supabase em produção conectado ao banco original, e testar o fluxo junto com essa migração. Rastreado em `.planning/todos/pending/backend-supabase-producao-no-aparelho.md`.

Este item não afeta os entregáveis técnicos da Fase 14 — o app compila, assina, instala, abre, mantém identidade visual e compartilha dados entre widget e app. Ele afeta a validação de paridade com o PWA, que depende de dados reais.

## Self-Check: PASSED

- Quatro itens endereçados explicitamente, três com veredito e um com decisão registrada de adiamento: PASS
- Nenhum item presumido PASS por "compilou" (proibição D-10 respeitada): PASS
- Item bloqueado registrado como pendência rastreável em vez de silenciado: PASS
- Defeito do `resign.sh` corrigido e protegido por gate antes da sessão física, em vez de descoberto por ela: PASS
