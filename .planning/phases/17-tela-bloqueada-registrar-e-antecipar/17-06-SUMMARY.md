---
phase: 17-tela-bloqueada-registrar-e-antecipar
plan: 06
subsystem: infra
tags: [ios, expo, activitykit, swift, jest, tsc, ci-gate]

# Dependency graph
requires:
  - phase: 17-tela-bloqueada-registrar-e-antecipar (planos 17-01..17-05)
    provides: >
      Campos de delta (currentLoadKg/isLoadInherited/loadIncrementKg/currentReps/
      isRepsInherited, REG-02) e antecipação "A SEGUIR" (nextExerciseName..
      nextIsBodyweight, PRED-01) em SessionActivityAttributes.ContentState e em
      LiveActivityContentState (TS), mais o diff-parity check (h) em
      verify-native-skeleton.sh (D-11).
provides:
  - "Confirmação com evidência literal de que as cinco waves anteriores integram sem regressão (Jest completo, tsc, verify-native-skeleton.sh)"
  - "LiveActivityContentStateRecord (bridge Expo) e contentState(from:) em LiveActivityModule.swift atualizados para os 17 campos novos de ContentState — sem essa correção o binário Release NÃO compilava"
  - "package-lock.json sincronizado com o workspace local modules/live-activity (estava faltando desde que o módulo foi criado; npm ci falhava)"
  - "Binário Release compilado com sucesso (BUILD SUCCEEDED) pronto para instalação no Plano 17-07"
affects: [17-07-uat-fisico]

# Actuals (#2632)
actuals:
  tokens: 680
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Todo campo novo adicionado a SessionActivityAttributes.ContentState precisa de atualização em PARALELO em três lugares: (1) o tipo TS LiveActivityContentState, (2) LiveActivityContentStateRecord (Swift, bridge Expo), (3) contentState(from:) — nenhum teste TS/Jest pega a lacuna em (2)/(3), só compilação Swift completa (npm run resign)."

key-files:
  created: []
  modified:
    - modules/live-activity/ios/LiveActivityModule.swift
    - package-lock.json

key-decisions:
  - "Task 2 foi considerada cumprida pelo BUILD SUCCEEDED (compilação Release completa) mesmo com `npm run resign` saindo com exit 1 — a falha residual é exclusivamente a etapa 7/8 (instalação via cabo), que exige o iPhone físico fisicamente conectado; o próprio objetivo do plano e o precondition da Tarefa 2 já deferem essa instalação para o Plano 17-07 'com o dono presente'. Não modifiquei scripts/resign.sh para adicionar um modo build-only — seria uma mudança estrutural em um script usado pela sessão física real, fora do escopo autorizado ('só o necessário para os gates ficarem verdes')."

patterns-established: []

requirements-completed: [REG-01, REG-02, PRED-01]

coverage:
  - id: D1
    description: "Suite Jest completa (167/167 suítes, 1977/1977 testes) passa após integração dos 5 planos anteriores"
    requirement: REG-01
    verification:
      - kind: other
        ref: "npm test (execução literal, ver evidência no corpo do SUMMARY)"
        status: pass
    human_judgment: false
  - id: D2
    description: "npx tsc --noEmit não acusa erro em nenhum arquivo tocado pela fase"
    verification:
      - kind: other
        ref: "npx tsc --noEmit (exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "scripts/verify-native-skeleton.sh passa (a)-(h) em 2 rodadas consecutivas, incluindo o diff-parity de SessionActivityAttributes.swift"
    requirement: PRED-01
    verification:
      - kind: other
        ref: "bash scripts/verify-native-skeleton.sh (exit 0, rodada 1 e 2 OK)"
        status: pass
    human_judgment: false
  - id: D4
    description: "expo prebuild --clean não apaga nenhum target/módulo nativo desta fase (session-widget, native-info, live-activity sobrevivem, autolinked e no Podfile.lock)"
    verification:
      - kind: other
        ref: "verify-native-skeleton.sh checagens (b)/(d)/(e)/(g) — parte do mesmo comando de D3"
        status: pass
    human_judgment: false
  - id: D5
    description: "Binário Release compila com todas as mudanças Swift+TS desta fase (npm run resign, etapas 1/8-5/8)"
    verification:
      - kind: other
        ref: "npm run resign — log mostra ** BUILD SUCCEEDED ** na etapa 4/8; etapa 7/8 (instalação via cabo) falha só por ausência do iPhone físico neste worktree automatizado"
        status: pass
    human_judgment: true
    rationale: "O binário compila e assina (evidência literal capturada), mas a instalação no device físico e o gate final de scripts/resign.sh (etapa 8/8, que roda verify-native-skeleton.sh de novo pós-install) exigem o iPhone conectado por cabo — isso só acontece no Plano 17-07, com o dono presente. Marcar human_judgment:true para não auto-aprovar silenciosamente uma etapa que nenhuma automação neste ambiente consegue completar."

duration: ~35min
completed: 2026-08-19
status: complete
---

# Phase 17 Plan 06: Gate de Integração Pós-Código Summary

**Gate de integração achou e corrigiu dois bugs reais que bloqueavam a compilação Release (campos novos de ContentState nunca chegando ao bridge Swift + lockfile dessincronizado do workspace local live-activity) — sem eles, o Plano 17-07 teria começado a sessão física do dono sobre um binário que não compila.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-19T01:51:00-03:00 (aprox., primeira ação de setup do ambiente)
- **Completed:** 2026-08-19T05:10:07Z
- **Tasks:** 2/2
- **Files modified:** 2 (`modules/live-activity/ios/LiveActivityModule.swift`, `package-lock.json`)

## Accomplishments

- Suite Jest completa: **167/167 suítes, 1977/1977 testes, 0 falhas** (confirmado 2x — antes e depois da correção Swift, para provar que a correção não teve efeito colateral no lado TS).
- `npx tsc --noEmit`: **0 erros** (confirmado 2x).
- `bash scripts/verify-native-skeleton.sh`: **(a)-(h) OK em 2 rodadas consecutivas**, incluindo a checagem (h) de diff-parity byte-a-byte entre as duas cópias de `SessionActivityAttributes.swift` (D-11) — confirmado 2x, antes e depois da correção.
- Descoberto e corrigido: `LiveActivityModule.swift` não compilava — `LiveActivityContentStateRecord` (bridge Expo) e a função `contentState(from:)` nunca foram atualizados quando planos anteriores desta fase adicionaram 11 campos novos a `SessionActivityAttributes.ContentState` (5 campos de delta REG-02 + 6 campos de antecipação "A SEGUIR" PRED-01). O inicializador memberwise do Swift exige `isLoadInherited`/`isRepsInherited` (Bool não-opcional, sem default) — só esse par gerava erro de compilação; os demais campos, todos `Optional`, recebem `nil` implícito (SE-0242) e não bloqueavam o build, mas ficavam SEMPRE `nil` na ponte nativa mesmo quando o lado TS os populava corretamente — ou seja, o bug real era maior que o erro de compilação reportado: toda a antecipação "A SEGUIR" e os campos de delta jamais chegariam ao Lock Screen.
- Descoberto e corrigido: `package-lock.json` estava sem a entrada do workspace local `modules/live-activity` (presente para `modules/native-info`, ausente para `live-activity`) — `npm ci` falhava com `Missing: live-activity@1.0.0 from lock file`. `npm install` sincronizou o lockfile (diff de 11 linhas, nenhum bump de versão de terceiros).
- `npm run resign`: **`** BUILD SUCCEEDED **`** na etapa 4/8 (build Release assinado, todas as mudanças Swift+TS desta fase). Etapa 7/8 (instalação via cabo) falha apenas por ausência física do iPhone neste worktree automatizado — comportamento esperado e documentado no próprio plano ("a instalação no iPhone físico só acontece no Plano 17-07, com o dono presente").

## Task Commits

1. **Task 1: Suite completa + tsc + skeleton nativo** — sem commit (nenhuma alteração de arquivo; tarefa de verificação pura, todos os gates já vieram verdes na primeira rodada).
2. **Task 2: Build de produção (resign)** — `5080d87` (fix)

**Plan metadata:** (este commit, feito logo em seguida)

## Files Created/Modified

- `modules/live-activity/ios/LiveActivityModule.swift` — `LiveActivityContentStateRecord` ganhou os 11 `@Field` que faltavam (currentLoadKg, isLoadInherited, loadIncrementKg, currentReps, isRepsInherited, nextExerciseName, nextSetIndex, nextSetTotal, nextSuggestedReps, nextSuggestedLoadKg, nextIsBodyweight); `contentState(from:)` agora repassa todos os 23 campos de `ContentState` na ordem declarada.
- `package-lock.json` — entrada `modules/live-activity` (workspace link) adicionada, espelhando o padrão já existente para `modules/native-info`.

## Decisions Made

- **Node modules do worktree:** a primeira tentativa foi um symlink de `node_modules` para o checkout principal (`/Users/phmarconato/ForcaApp/node_modules`) para evitar reinstalar ~1580 pacotes. Isso quebrou a resolução de módulo do Metro (`AppEntry.js`'s `../../App` resolvia para o `App.tsx` do checkout principal via o real-path do symlink, não o do worktree) — removido e substituído por `npm install` real dentro do worktree, que por sua vez expôs o bug de lockfile acima. Documentado aqui porque é uma armadilha genérica de execução em worktree com apps Metro/React Native, não específica desta fase.
- **Não modificar `scripts/resign.sh`:** ver `key-decisions` no frontmatter — a falha de instalação (etapa 7/8) foi deixada como está, sem adicionar um modo "build-only" ao script, por ser mudança estrutural fora do escopo autorizado deste plano e por já haver um plano seguinte (17-07) dedicado à sessão física.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `LiveActivityModule.swift` não compilava — bridge Swift desatualizado em relação a `ContentState`**
- **Found during:** Task 2 (`npm run resign`)
- **Issue:** `LiveActivityContentStateRecord` e `contentState(from:)` só conheciam os 12 campos originais de `ContentState`; os 11 campos adicionados pelos Planos 17-02 (delta) e 17-04/17-05 (antecipação) nunca foram propagados. Erro de compilação citava só `isLoadInherited`/`isRepsInherited` (únicos parâmetros não-opcionais sem default no inicializador memberwise) — mas o impacto real era maior: todos os demais campos novos ficariam sempre `nil` na Live Activity, mesmo com o lado TS enviando valores corretos.
- **Fix:** Adicionados os 11 `@Field` faltantes ao Record e repassados na chamada do inicializador de `ContentState`, na mesma ordem de declaração do struct.
- **Files modified:** `modules/live-activity/ios/LiveActivityModule.swift`
- **Verification:** `npm run resign` progrediu de erro de compilação Swift para `** BUILD SUCCEEDED **`; Jest (167/167) e `tsc --noEmit` re-confirmados verdes após a mudança.
- **Committed in:** `5080d87`

**2. [Rule 3 - Blocking] `package-lock.json` sem a entrada do workspace `modules/live-activity`**
- **Found during:** Task 2, ao tentar `npm ci` para obter um `node_modules` real e isolado no worktree
- **Issue:** `npm ci` falhava com `Missing: live-activity@1.0.0 from lock file` — o módulo workspace local nunca foi registrado no lockfile por um `npm install` de acompanhamento quando foi criado em plano anterior desta fase.
- **Fix:** `npm install` (não `npm ci`) para sincronizar o lockfile; diff resultante restrito a 11 linhas adicionando só a entrada `modules/live-activity`, idêntica em forma à entrada já existente de `modules/native-info` — nenhum bump de versão de terceiros.
- **Files modified:** `package-lock.json`
- **Verification:** `npm run resign` progrediu do erro de resolução de módulo (causado pelo symlink, ver Decisions) para a fase de build real.
- **Committed in:** `5080d87`

---

**Total deviations:** 2 auto-fixed (1 bug de compilação Swift, 1 lockfile desatualizado)
**Impact on plan:** Ambas as correções eram estritamente necessárias para o gate ficar verde — sem elas o binário Release não compilava, o que teria sido descoberto só na sessão física do Plano 17-07. Nenhuma feature nova, nenhum refactor não pedido — apenas os campos e a entrada de lockfile que já deveriam existir.

## Issues Encountered

- `npm run resign` requer device físico conectado por cabo para completar (etapas 6-8), algo que o texto do plano (`<action>` da Task 2) descreve incorretamente como "sem instalar". A leitura do script (`scripts/resign.sh`) mostra que build+assinatura+instalação+gate final são uma sequência monolítica única, sem flag de build-only. O precondition da Task 2 ("Xcode permite build e assinatura sem o aparelho conectado") continua verdadeiro e foi a parte realmente testável aqui — confirmado por `** BUILD SUCCEEDED **`. A instalação real (etapas 6-8, incluindo o gate final `verify-native-skeleton.sh` pós-install) fica para o Plano 17-07, como o próprio plano já previa.

## User Setup Required

None - nenhuma configuração de serviço externo necessária.

## Next Phase Readiness

- Código das cinco waves anteriores (17-01..17-05) integra sem regressão: Jest completo, `tsc`, e `verify-native-skeleton.sh` verdes simultaneamente.
- Bug real de compilação Swift (bridge desatualizado) corrigido — sem essa correção, o Plano 17-07 teria começado com um binário que sequer compila.
- Lockfile sincronizado — `npm ci` (instalação limpa) agora funciona neste repositório.
- Build Release compila e assina com sucesso (`** BUILD SUCCEEDED **`); pronto para a instalação física no Plano 17-07, que deve rodar `npm run resign` com o iPhone conectado por cabo, desbloqueado e com "Confiar neste computador" aceito.
- Nenhum stub, nenhum teste pulado, nenhum `<verify>` que não rodou.

---
*Phase: 17-tela-bloqueada-registrar-e-antecipar*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: modules/live-activity/ios/LiveActivityModule.swift
- FOUND: package-lock.json (modified, verified via `git show --stat 5080d87`)
- FOUND: commit 5080d87 (fix)
- FOUND: commit 7cd3e28 (docs, this SUMMARY)
