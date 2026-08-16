---
phase: 14-funda-o-nativa
plan: 07
subsystem: infra
tags: [ios, app-groups, widget, entitlements, cleanup, expo-modules]

requires:
  - phase: 14-funda-o-nativa (plano 06)
    provides: "Resultado físico do spike D-09: round-trip de App Group = PASS/PASS no iPhone 13, confirmado literalmente pelo dono"
provides:
  - "14-SPIKE-APP-GROUPS.md: decisão de arquitetura registrada por escrito (COM App Group, id = group.com.pmarconato.forcaapp.shared), citável pelas Fases 15/16 sem re-perguntar ao dono"
  - "Repositório em estado consistente com a decisão: entitlement mantida (permanente), scaffolding de spike removido por inteiro (modules/app-group-spike/, chamada em App.tsx, bloco de escrita em widgets.swift, dependência em package.json/package-lock.json)"
  - "scripts/verify-native-skeleton.sh ajustado honestamente: checagem (e) agora exige só NativeInfoModule linkado (AppGroupSpikeModule não existe mais para ser checado)"
affects: [15, 16, 17]

actuals:
  tokens: 4100
  tasks: 1
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Módulo Expo local de spike removido por inteiro (não deprecado/mantido) quando seu único propósito era responder uma pergunta binária já respondida — Fases seguintes constroem o consumo real do zero, não estendem scaffolding descartável"

key-files:
  created:
    - .planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md
  modified:
    - App.tsx
    - targets/session-widget/widgets.swift
    - package.json
    - package-lock.json
    - scripts/verify-native-skeleton.sh

key-decisions:
  - "Decisão de arquitetura: COM App Group (group.com.pmarconato.forcaapp.shared) — entitlement em app.json e targets/session-widget/expo-target.config.js permanece congelada (D-06), não foi tocada nesta plano por já estar correta desde a Plano 14-05"
  - "modules/app-group-spike/ removido por inteiro em vez de mantido/deprecado — seu único propósito (provar o round-trip) já foi cumprido; manter o módulo criaria a ilusão de que as Fases 15/16 deveriam estendê-lo"
  - "scripts/verify-native-skeleton.sh: checagem (e) reescrita para exigir só NativeInfoModule (não zerada nem enfraquecida em no-op) — refletir a realidade pós-remoção honestamente, mantendo o gate funcional para o módulo que ainda existe"

patterns-established: []

requirements-completed: [NAT-02]

coverage:
  - id: D1
    description: "14-SPIKE-APP-GROUPS.md documenta explicitamente a decisão COM/SEM App Group, com data e resultado PASS/FAIL/AMBIGUO reportado pelo dono, citável pelas fases 15-17"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "grep -q 'Decisão:' .planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "Repositório consistente com a decisão PASS: entitlement mantida em ambos os arquivos de config, scaffolding de spike removido por inteiro (modules/app-group-spike/, App.tsx, widgets.swift, package.json/package-lock.json)"
    requirement: "NAT-02"
    verification:
      - kind: automated
        ref: "bash scripts/verify-native-skeleton.sh (2x consecutivas) -> exit 0"
        status: pass
      - kind: automated
        ref: "grep -c app-group-spike package.json package-lock.json App.tsx targets/session-widget/widgets.swift -> 0 ocorrências"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nenhuma regressão introduzida pela remoção do scaffolding: tsc, suite de testes completa e verify:native permanecem verdes"
    requirement: "NAT-02"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit -> exit 0"
        status: pass
      - kind: unit
        ref: "npm test -> 161 suites, 1818 tests passed"
        status: pass
      - kind: automated
        ref: "npm run verify:native -> exit 0"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-08-16
status: complete
---

# Fase 14 Plano 07: Registro da decisão do spike de App Groups + limpeza do scaffolding — Summary

**Spike D-09 confirmado PASS/PASS pelo dono (Plano 14-06): a decisão "COM App Group" foi registrada por escrito em `14-SPIKE-APP-GROUPS.md`, a entitlement permanente foi preservada, e todo o código de spike (módulo, chamadas, dependência) foi removido do repositório sem deixar nenhuma referência órfã.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 1/1
- **Files modified:** 11 (1 criado, 5 deletados, 5 modificados)

## Accomplishments

- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` criado, citando literalmente as respostas do dono (item a = PASS, item b = PASS) e a evidência de máquina de escrita/leitura no App Group, com a linha `Decisão: COM App Group (id = group.com.pmarconato.forcaapp.shared)` e um parágrafo explicando a implicação para a arquitetura de estado das Fases 15/16
- `modules/app-group-spike/` removido por inteiro (5 arquivos): `AppGroupSpikeModule.podspec`, `expo-module.config.json`, `index.ts`, `ios/AppGroupSpikeModule.swift`, `package.json`
- `App.tsx`: removidos o import de `readAppGroupSpikeValue`, o `useEffect` de leitura do spike, e (Rule 1) o import agora não-usado de `useEffect` de `react`
- `targets/session-widget/widgets.swift`: removido o bloco `// SPIKE-ONLY (14-05)` que escrevia no App Group a cada geração de timeline
- `package.json`/`package-lock.json`: dependência `app-group-spike` removida; lockfile revalidado (`npm ci --dry-run` limpo) após remoção manual de uma entrada órfã (`extraneous: true`) que `npm install`/`npm prune` não limparam sozinhos
- `scripts/verify-native-skeleton.sh`: checagem (e) ajustada para exigir só `NativeInfoModule` no `Podfile.lock` — `AppGroupSpikeModule` removido da lista com comentário explicando por quê, em vez de deixar o gate falhando permanentemente ou enfraquecê-lo em no-op

## Task Commits

1. **Task 1: Registrar a decisão do spike e reverter/manter a entitlement** - `26c3140` (docs)

**Plan metadata:** este commit final (SUMMARY.md, sem STATE.md/ROADMAP.md por instrução explícita — orquestrador é dono desses arquivos)

## Files Created/Modified

- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` - decisão de arquitetura registrada por escrito
- `App.tsx` - chamada de leitura do spike removida
- `targets/session-widget/widgets.swift` - bloco de escrita do spike removido
- `package.json` / `package-lock.json` - dependência de spike removida
- `scripts/verify-native-skeleton.sh` - checagem (e) honestamente ajustada ao módulo que ainda existe
- `modules/app-group-spike/*` (5 arquivos) - deletados por inteiro

## Decisions Made

- Ver `key-decisions` no frontmatter. Resumo: entitlement mantida (branch PASS do plano), módulo de spike removido por inteiro (não deprecado), gate de verificação ajustado honestamente em vez de enfraquecido.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `useEffect` importado sem uso após remover a chamada de leitura do spike em `App.tsx`**
- **Found during:** Task 1, imediatamente após remover o `useEffect` do spike
- **Issue:** `import React, { useEffect } from 'react'` deixaria `useEffect` importado e nunca referenciado, gerando warning de lint/tsc não-intencional
- **Fix:** import ajustado para `import React from 'react'`
- **Files modified:** `App.tsx`
- **Verification:** `npx tsc --noEmit` -> exit 0
- **Committed in:** `26c3140`

**2. [Rule 1 - Bug] Entrada órfã (`extraneous: true`) de `modules/app-group-spike` sobrevivendo em `package-lock.json` após `rm -rf` do módulo**
- **Found during:** Task 1, ao rodar `npm install` para sincronizar o lockfile
- **Issue:** `npm install`, `npm install --package-lock-only` e `npm prune` deixaram a entrada `"modules/app-group-spike": {"extraneous": true, ...}` no lockfile mesmo com o diretório já deletado e a dependência já removida de `package.json` — o npm não recalculou o grafo de workspaces sozinho
- **Fix:** entrada removida manualmente do `package-lock.json`; JSON revalidado (`node -e "JSON.parse(...)"`) e consistência confirmada com `npm ci --dry-run` (sem erro)
- **Files modified:** `package-lock.json`
- **Verification:** `grep -c app-group-spike package-lock.json` -> 0; `npm ci --dry-run` -> sem erro
- **Committed in:** `26c3140`

---

**Total deviations:** 2 auto-fixed (Rule 1, ambos bugs mecânicos descobertos ao executar a própria task)
**Impact on plan:** Nenhum scope creep — os dois fixes eram estritamente necessários para a remoção do scaffolding não deixar resíduo (lint limpo, lockfile consistente). Nenhuma mudança fora do escopo `app.json`/`targets/session-widget/expo-target.config.js`/`14-SPIKE-APP-GROUPS.md` declarado no frontmatter foi feita sem justificativa de Rule 1/2/3 documentada aqui.

## Issues Encountered

Nenhum além dos dois itens documentados em Deviations acima.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Threat Flags

Nenhum. Nenhuma nova superfície de rede, autenticação ou schema foi introduzida — esta plano é puramente remoção de scaffolding temporário e registro de decisão.

## Next Phase Readiness

- **Pronto** para as Fases 15 (LOCK) e 16 (CMD) citarem `14-SPIKE-APP-GROUPS.md` diretamente ao decidir a arquitetura de estado da Live Activity, sem precisar re-perguntar ao dono.
- Entitlement `com.apple.security.application-groups` = `group.com.pmarconato.forcaapp.shared` permanece congelada, idêntica em `app.json` e `targets/session-widget/expo-target.config.js`, e comprovadamente sobrevive a `expo prebuild --clean` (`scripts/verify-native-skeleton.sh`, 2x consecutivas).
- Nenhum resíduo de código de spike no repositório: `grep -r app-group-spike` (case-sensitive, excluindo este SUMMARY e o `14-06-SUMMARY.md`/`14-05-SUMMARY.md` históricos) não retorna nenhum arquivo de código-fonte.
- `tsc --noEmit`, suíte completa (`npm test`, 161 suítes / 1818 testes) e `npm run verify:native` todos verdes após a remoção.

## Self-Check: PASSED

- `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` existe e contém `Decisão: COM App Group`: PASS (`grep -q 'Decisão:' ...`)
- Commit `26c3140` existe em `git log --oneline`: PASS
- `application-groups` presente em `app.json` e `targets/session-widget/expo-target.config.js`: PASS (não tocados, já corretos desde 14-05)
- `modules/app-group-spike/` não existe mais: PASS
- `bash scripts/verify-native-skeleton.sh` sai com código 0 (2 rodadas): PASS
- `npx tsc --noEmit` -> exit 0: PASS
- `npm test` -> 161 suítes / 1818 testes passaram: PASS
- `npm run verify:native` -> exit 0: PASS

---
*Phase: 14-funda-o-nativa*
*Completed: 2026-08-16*
