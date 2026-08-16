---
phase: 14-funda-o-nativa
plan: 04
subsystem: infra
tags: [ios, resign, xcodebuild, devicectl, cocoapods, shell-script]

# Dependency graph
requires:
  - phase: 14-funda-o-nativa (plano 02)
    provides: "Pipeline nativo provado ponta a ponta, scheme Xcode ForcaApp confirmado, scripts/verify-native-skeleton.sh como gate de regressão"
provides:
  - "npm run resign — comando único que cumpre D-01: prebuild --clean + build assinado (Debug, D-05) + install via cabo (D-02) + gate final verify-native-skeleton.sh"
  - "Descoberta dinâmica de scheme Xcode em resign.sh, confirmada contra expo.name (nunca schemes[0] — bug documentado na Plano 14-02)"
affects: [14-06, 14-09]

actuals:
  tokens: 6300
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns: ["scripts/resign.sh reutiliza o estilo canônico de scripts/supabase-preflight.sh (cores + ABORTADO: + comando de correção)"]

key-files:
  created:
    - scripts/resign.sh
  modified:
    - package.json

key-decisions:
  - "Descoberta de scheme em resign.sh usa xcodebuild -list -json + confirmação contra expo.name (app.json), não schemes[0] — segue o patterns-established registrado em 14-02-SUMMARY.md, evitando o bug já documentado onde schemes[0] resolve para EXConstants (scheme de dependência CocoaPods, alfabeticamente primeiro), não para o app"
  - "Configuração de build é Debug (dev-client), não Release — conforme D-05, decisão já travada na fase; troca para Release fica para o fechamento do milestone"

patterns-established:
  - "resign.sh: guard ABORTADO: <causa> + echo com comando de correção explícito + exit 1, em cada ponto de falha conhecido (CocoaPods, scheme não encontrado, build, .app ausente, device count, install, gate final) — nunca deixa xcodebuild/devicectl/find morrer com stderr cru sem contexto"

requirements-completed: [NAT-01]

coverage:
  - id: D1
    description: "npm run resign existe como comando único cobrindo prebuild + build + install (D-01)"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "node -e lendo package.json após edição — scripts.resign === 'bash scripts/resign.sh'"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/resign.sh existe com as 8 etapas numeradas na ordem correta"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "grep -n '^echo \"[0-9]/8' scripts/resign.sh → 8 marcadores, 1/8 a 8/8, em ordem crescente"
        status: pass
    human_judgment: false
  - id: D3
    description: "bash -n scripts/resign.sh sai com código 0 (sintaxe válida)"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "bash -n scripts/resign.sh executado nesta sessão → exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "Os 4 pontos de falha conhecidos (CocoaPods, build, .app ausente, device count) têm guard ABORTADO: + comando de correção explícito"
    requirement: "NAT-01"
    verification:
      - kind: manual_procedural
        ref: "grep -c 'ABORTADO:' scripts/resign.sh = 7 (≥4 exigido); grep -n -A2 'ABORTADO:' scripts/resign.sh confirma comando de correção explícito nas 2 linhas seguintes de cada uma das 7 ocorrências"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-08-16
status: complete
---

# Fase 14 Plano 04: scripts/resign.sh — comando único de reassinatura (D-01, D-02) — Summary

**`npm run resign` agora existe como comando único cobrindo prebuild --clean + build assinado (Debug, D-05) + instalação via cabo (D-02) + gate final `verify-native-skeleton.sh`, com guard `ABORTADO:` explícito em todos os pontos de falha conhecidos e descoberta de scheme dinâmica que evita o bug de `schemes[0]` já documentado na Plano 14-02.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2/2 completas (Task 2 foi auditoria-only — ver Deviations)
- **Files modified:** 2 (`scripts/resign.sh` novo, `package.json` +1 linha)

## Accomplishments

- `scripts/resign.sh` criado seguindo exatamente o estilo de `scripts/supabase-preflight.sh` (`set -euo pipefail`, `readonly REPO_ROOT` via `BASH_SOURCE`, funções `vermelho()`/`amarelo()`/`verde()`, passos numerados em português)
- 8 etapas na ordem exigida: (1) checar CocoaPods, (2) `expo prebuild -p ios --clean --non-interactive`, (3) descobrir scheme dinamicamente, (4) build assinado (Debug), (5) localizar `.app` em DerivedData, (6) resolver device único via cabo (ou UDID explícito por `$1`), (7) `xcrun devicectl device install app`, (8) gate final `scripts/verify-native-skeleton.sh`
- `package.json`: `"resign": "bash scripts/resign.sh"` adicionado ao objeto `scripts`
- `bash -n scripts/resign.sh` → exit 0 (sintaxe válida)
- `grep -c 'ABORTADO:' scripts/resign.sh` → 7 (exigido ≥4) — cada ocorrência confirmada com comando de correção explícito nas linhas seguintes

## Task Commits

1. **Task 1 (scripts/resign.sh + package.json)** - `6f05c98` (feat)
2. **Task 2 (hardening — guard ABORTADO: em todos os pontos de falha)** - sem commit adicional; ver Deviations

## Files Created/Modified

- `scripts/resign.sh` — novo, 8 etapas, comando único do D-01
- `package.json` — `scripts.resign` adicionado

## Decisions Made

- **Descoberta de scheme via `expo.name`, não `schemes[0]`.** O plano pedia "o MESMO padrão... usado na Plano 14-02 Task 1" — mas o padrão *literal* de `schemes[0]` foi provado errado nessa mesma Plano (resolve para `EXConstants`, scheme de dependência CocoaPods, alfabeticamente primeiro entre ~100 schemes, não o app). A Plano 14-02 já registrou o padrão correto em `patterns-established`: "confirmar contra expo.name/workspace.name". `resign.sh` lê `expo.name` de `app.json` via `node -e`, roda `xcodebuild -list -workspace ios/*.xcworkspace -json` e confirma que esse nome está na lista de schemes — dinâmico (não hardcoda `"ForcaApp"`, como o plano exigiu) e correto (evita o bug documentado). Se `schemes[0]` tivesse sido usado literalmente, `npm run resign` compilaria silenciosamente o scheme errado — quebrando a própria promessa do D-01 de ser um comando confiável.
- **Build Debug, não Release** — D-05 já trava essa decisão para o v1.3; nenhuma escolha nova aqui.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Descoberta de scheme via `schemes[0]` seria um bug conhecido, não implementado literalmente**
- **Found during:** Task 1, escrita da etapa 3
- **Issue:** O texto do plano pede o "MESMO padrão... usado na Plano 14-02 Task 1" para descobrir o scheme, mas o comando literal daquela Task 1 (`.workspace.schemes[0]`) foi provado incorreto na própria 14-02-SUMMARY.md — resolve para `EXConstants` (scheme de dependência), não para o app. Implementar isso literalmente produziria um `resign.sh` que falha silenciosamente na primeira execução real.
- **Fix:** Implementada a descoberta confirmando o scheme contra `expo.name` de `app.json` — o padrão que a própria Plano 14-02 registrou como `patterns-established` ("nunca usar schemes[0]... confirmar contra expo.name/workspace.name"). Continua dinâmico (não hardcoda `"ForcaApp"`, requisito explícito do plano) e usa o mesmo mecanismo de base (`xcodebuild -list -json` + `node -e`).
- **Files modified:** `scripts/resign.sh` (etapa 3)
- **Verification:** `bash -n scripts/resign.sh` → exit 0; lógica revisada manualmente contra o `patterns-established` de `14-02-SUMMARY.md`. Validação real (device físico) fica para a Plano 14-09 (Sessão 2 UAT), conforme `<verification>` do próprio plano.
- **Committed in:** `6f05c98`

### Task 2 — resultado de auditoria (sem commit adicional)

Task 2 pedia "confirmar (e completar se faltar)" guard `ABORTADO:` + comando de correção nos 4 pontos de falha conhecidos. A ação da Task 1 já especificava literalmente esses 4 guards (CocoaPods, build, `.app` ausente, device count) — a auditoria da Task 2 (`grep -n -A2 'ABORTADO:' scripts/resign.sh`) confirmou que as 7 ocorrências totais (os 4 exigidos + 3 adicionais: scheme não encontrado, falha de install, falha do gate final) já têm comando de correção explícito nas linhas seguintes. Nenhuma mudança de código foi necessária; nenhum commit adicional foi feito para Task 2.

## Issues Encountered

Nenhum além do documentado em Deviations.

## User Setup Required

None. Nenhuma ação do dono necessária nesta plano — a validação física (executar `npm run resign` de ponta a ponta com o iPhone conectado) é escopo da Plano 14-09 (Sessão 2 UAT), conforme já esperado pelo `<verification>` do plano ("Validação física de ponta a ponta acontece na Plano 14-09").

## Next Phase Readiness

- `npm run resign` está pronto para ser exercitado fisicamente na Plano 14-09 (Sessão 2 UAT) — nenhum device estava conectado nesta sessão (ambiente sem hardware físico), então as etapas 6-7 (resolução de device + `devicectl install`) não foram exercitadas fim-a-fim, só verificadas por leitura/sintaxe, conforme esperado pelo escopo desta plano.
- O gate final (etapa 8, `verify-native-skeleton.sh`) já está provado funcional pela Plano 14-02 — reutilizado aqui sem modificação.

## Known Stubs

Nenhum stub de produto. A ausência de execução física de `xcrun devicectl device install app` (etapas 6-7) não é um stub de código — é a condição de ambiente documentada em `<environment_notes>` do prompt de execução ("Nenhum dispositivo físico está conectado... verificado depois na sessão física da Plano 14-06/14-09"), e o próprio plano já define a validação de ponta a ponta como escopo da Plano 14-09.

## Self-Check: PASSED

- `scripts/resign.sh` existe no worktree: PASS
- `package.json` contém `"resign": "bash scripts/resign.sh"`: PASS
- Commit `6f05c98` existe em `git log --all`: PASS (confirmado abaixo)
- `bash -n scripts/resign.sh` → exit 0: PASS
- `grep -c 'ABORTADO:' scripts/resign.sh` → 7 (≥4 exigido): PASS

---
*Phase: 14-funda-o-nativa*
*Completed: 2026-08-16*
