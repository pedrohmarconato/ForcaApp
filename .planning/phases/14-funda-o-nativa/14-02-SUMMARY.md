---
phase: 14-funda-o-nativa
plan: 02
subsystem: infra
tags: [ios, expo-prebuild, apple-targets, expo-modules, cocoapods, xcodebuild, xcode-simulator-runtime]

# Dependency graph
requires:
  - phase: 14-funda-o-nativa (plano 01)
    provides: "D-06 (bundle identifiers congelados) e aprovação dos pacotes SUS"
provides:
  - "Pipeline nativo completo provado ponta a ponta: app.json → target de widget (@bacons/apple-targets) → módulo local (native-info) → expo prebuild --clean → xcodebuild para simulador — BUILD SUCCEEDED, exit 0, sem device signing"
  - "Nome do scheme Xcode confirmado: ForcaApp (NÃO schemes[0] do JSON — esse array é alfabético, não app-first; ver Deviations)"
  - "scripts/verify-native-skeleton.sh — trava de regressão reutilizável por scripts/resign.sh (Plano 14-04) e qualquer sessão futura desta fase"
  - "iOS 26.5 Simulator runtime instalado nesta máquina (gap de ambiente novo, distinto do CocoaPods da Plano 14-01)"
affects: [14-03, 14-04, 14-05, 14-06, 14-07]

actuals:
  tokens: 16775
  tasks: 2
  commits: 4

tech-stack:
  added: ["@bacons/apple-targets@^5.0.0", "expo-build-properties@~1.0.10", "CocoaPods 1.17.0 (sistema)", "iOS 26.5 Simulator runtime (sistema, via xcodebuild -downloadPlatform iOS)"]
  patterns: ["scripts/verify-*.sh — trava shell no estilo supabase-preflight.sh (cores + ABORTADO: + comando de correção), reutilizada agora para o domínio nativo"]

key-files:
  created:
    - targets/session-widget/expo-target.config.js
    - modules/native-info/expo-module.config.json
    - modules/native-info/index.ts
    - modules/native-info/ios/NativeInfoModule.swift
    - scripts/verify-native-skeleton.sh
  modified:
    - app.json
    - package.json
    - package-lock.json
    - targets/session-widget/WidgetControl.swift
    - targets/session-widget/index.swift

key-decisions:
  - "modules/native-info criado manualmente (não via CLI) — npx create-expo-module --local falhou 3x com ReferenceError de template EJS mesmo com --repo explícito; conteúdo replica fielmente o exemplo default do template oficial"
  - "targets/widget/ renomeado manualmente para targets/session-widget/ — npx create-target não aceitou nome/slug via stdin (RESEARCH.md Pitfall 7 previa esse fallback)"
  - "Scheme Xcode usado: ForcaApp, não schemes[0] do JSON de xcodebuild -list — o array vem alfabético (EXConstants primeiro), não app-first; RESEARCH.md Open Question 2 já assumia SCHEME=\"ForcaApp\" a confirmar"
  - "Control Widget scaffold (WidgetControl.swift) gated atrás de @available(iOS 18.0, *) — o default do @bacons/apple-targets usa ControlWidgetConfiguration/SetValueIntent.perform(), ambos iOS 18+, incompatível com o deploymentTarget 17.0 já decidido"

patterns-established:
  - "Descoberta de scheme Xcode: nunca usar schemes[0] do JSON de -list (alfabético); confirmar contra expo.name/workspace.name"
  - "Checagem de .entitlements em ios/ deve usar find, não glob ios/*/*.entitlements — targets scaffolded por @bacons/apple-targets gravam entitlements sob diretórios ocultos (ios/.targets/<slug>/)"

requirements-completed: [NAT-01, NAT-02]

coverage:
  - id: D1
    description: "app.json tem ios.bundleIdentifier congelado (D-06) e os dois plugins registrados"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "node -e lendo app.json após edição — ios.bundleIdentifier: com.pmarconato.forcaapp; plugins inclui @bacons/apple-targets e [expo-build-properties, {ios:{deploymentTarget:17.0}}]"
        status: pass
    human_judgment: false
  - id: D2
    description: "targets/session-widget/ e modules/native-info/ existem e sobrevivem a expo prebuild --clean"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "npx expo prebuild -p ios --clean --non-interactive (2x, dentro de scripts/verify-native-skeleton.sh) — sucesso nas duas rodadas; grep -c session-widget ios/*.xcodeproj/project.pbxproj = 25"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nenhum .entitlements gerado contém aps-environment (T-14-02-01)"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "find ios -name '*.entitlements' | xargs grep -c aps-environment → 0 em ios/ForcaApp/ForcaApp.entitlements e ios/.targets/sessionwidget/generated.entitlements"
        status: pass
    human_judgment: false
  - id: D4
    description: "xcodebuild compila o esqueleto (app + target de widget) para o simulador sem exigir assinatura de device"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "xcodebuild -workspace ios/*.xcworkspace -scheme ForcaApp -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO → ** BUILD SUCCEEDED **, exit 0 (log completo em /tmp/xcodebuild_out3.log desta sessão)"
        status: pass
    human_judgment: false
  - id: D5
    description: "scripts/verify-native-skeleton.sh existe, é idempotente entre execuções e está encadeável por outros scripts"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "bash scripts/verify-native-skeleton.sh — 2 invocações independentes desta sessão, ambas exit 0, ambas com 'Rodada 1: (a)-(d) OK.' e 'Rodada 2: (a)-(d) OK.' idênticos; grep -c 'ABORTADO:' scripts/verify-native-skeleton.sh = 5 (≥3 exigido); package.json contém \"verify:native\": \"bash scripts/verify-native-skeleton.sh\""
        status: pass
    human_judgment: false

duration: ~52min (2 sessões: ~35min scaffold+bloqueio, ~17min desbloqueio+build+Task 2, dos quais ~9min foram só o download do runtime de 8.52GB)
completed: 2026-08-16
status: complete
---

# Fase 14 Plano 02: Pipeline nativo completo — Summary

**Pipeline nativo (app.json → target de widget @bacons/apple-targets → módulo Swift local → expo prebuild --clean → xcodebuild) provado ponta a ponta com BUILD SUCCEEDED para simulador, sem device signing, e formalizado em scripts/verify-native-skeleton.sh como trava de regressão idempotente.**

## Performance

- **Duration:** ~52 min no total, em 2 sessões de execução (a primeira parou num checkpoint de ambiente; esta sessão retomou do passo 8 da Task 1)
- **Tasks:** 2/2 completas
- **Files modified:** 10 rastreados pelo git (app.json, package.json, package-lock.json, targets/session-widget/{expo-target.config.js,WidgetControl.swift,index.swift,AppIntent.swift,WidgetLiveActivity.swift,widgets.swift,Info.plist}, modules/native-info/{expo-module.config.json,index.ts,ios/NativeInfoModule.swift}, scripts/verify-native-skeleton.sh) + ios/ gerado por prebuild, intencionalmente não commitado (fora de files_modified do plano; artefato descartável e reproduzível)

## Accomplishments

- `pod --version` → `1.17.0` (CocoaPods, resolvido na sessão anterior)
- `app.json`: `ios.bundleIdentifier: "com.pmarconato.forcaapp"` (D-06) + plugins `@bacons/apple-targets` e `["expo-build-properties", {"ios":{"deploymentTarget":"17.0"}}]`
- `targets/session-widget/` e `modules/native-info/` scaffolded e sobrevivem a `expo prebuild -p ios --clean --non-interactive` (2 execuções nesta sessão, mesmo resultado nas duas)
- **Scheme Xcode descoberto e confirmado: `ForcaApp`** — registrado aqui para as Planos 14-04 e 14-05 reutilizarem sem redescobrir. O comando literal do plano (`schemes[0]` do JSON de `xcodebuild -list`) NÃO produz esse valor — ver Deviations.
- **`xcodebuild ... -sdk iphonesimulator ... build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` → `** BUILD SUCCEEDED **`, exit 0.** Esta é a prova central do plano (NAT-02): o esqueleto nativo completo (app + target de widget) compila para simulador sem device físico nem assinatura.
- NAT-02 confirmado literalmente: `grep -c session-widget ios/*.xcodeproj/project.pbxproj` = 25; nenhum `.entitlements` gerado contém `aps-environment` (mitigação T-14-02-01 do threat model cumprida)
- `scripts/verify-native-skeleton.sh` criado, roda as 4 checagens (a)-(d) duas vezes sem alteração de estado entre elas, `exit 0` em 2 invocações independentes desta sessão; `package.json` ganhou `"verify:native": "bash scripts/verify-native-skeleton.sh"`

## Task Commits

1. **Task 1 (scaffold, passos 1-7) — sessão anterior** - `99ea67b` (feat, rotulado `[BLOCKED, not verified]` no corpo — rótulo obsoleto após esta sessão desbloquear e verificar)
2. **Checkpoint doc (sessão anterior, placeholder substituído por este SUMMARY)** - `5f1fdca`
3. **Task 1 (passos 8-11, prova de compilação + Rule 1 fix)** - `bee2c5b` (fix)
4. **Task 2 (scripts/verify-native-skeleton.sh + package.json)** - `dca95a0` (feat)

**Plan metadata:** commit desta atualização de SUMMARY.md será feito a seguir pelo orquestrador/agente (fora do escopo de commits de task individuais).

## Files Created/Modified

- `app.json` — `ios.bundleIdentifier` congelado + 2 plugins novos (sessão anterior)
- `package.json` / `package-lock.json` — 2 dependências novas (sessão anterior) + script `verify:native` (esta sessão)
- `targets/session-widget/expo-target.config.js` + arquivos Swift/Info.plist/Assets.xcassets default do scaffold (sessão anterior)
- `targets/session-widget/WidgetControl.swift` — Control Widget scaffold gated atrás de `@available(iOS 18.0, *)` (esta sessão, Rule 1)
- `targets/session-widget/index.swift` — inclusão do Control Widget no `WidgetBundle` envolvida em `if #available(iOS 18.0, *)` (esta sessão, Rule 1)
- `modules/native-info/expo-module.config.json`, `index.ts`, `ios/NativeInfoModule.swift` (sessão anterior)
- `scripts/verify-native-skeleton.sh` — novo, trava de regressão do esqueleto nativo (esta sessão)
- `ios/` — gerado por `expo prebuild`, NÃO commitado (fora de `files_modified` do plano; artefato descartável, provado reproduzível por este mesmo plano)

## Decisions Made

- **Scheme Xcode = `ForcaApp`, não `schemes[0]` do JSON.** `xcodebuild -list -workspace ios/*.xcworkspace -json` devolve os schemes em ordem alfabética (`EXConstants` primeiro entre ~100 schemes de dependências CocoaPods), não com o app principal na posição 0. O comando literal do plano's `<verify>` (`.workspace.schemes[0]`) resolveria para `EXConstants`, um scheme de dependência que não compila o app. Usado `ForcaApp` — confirmado presente na lista, idêntico a `expo.name`/`workspace.name`, e é exatamente o valor que RESEARCH.md (Open Question 2) já esperava confirmar manualmente. Nenhuma edição no PLAN.md; documentado aqui como a fonte de verdade para as Planos 14-04/14-05.
- **`modules/native-info` criado manualmente, não via `npx create-expo-module --local`** (decisão da sessão anterior, mantida) — CLI falhou 3x com bug de template EJS.
- **`targets/widget/` renomeado manualmente para `targets/session-widget/`** (decisão da sessão anterior, mantida) — `npx create-target` não aceitou nome/slug via stdin.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Control Widget scaffold não compila no deploymentTarget 17.0 configurado**
- **Found during:** Task 1, passo 9 (primeira tentativa de `xcodebuild ... build`)
- **Issue:** `** BUILD FAILED **` com 4 erros de compilador: `WidgetControl.swift` usa `ControlWidgetConfiguration` e `SetValueIntent.perform()`, ambos exclusivos de iOS 18.0+, enquanto `targets/session-widget/expo-target.config.js` fixa `deploymentTarget: "17.0"` (decisão já tomada no plano, margem acima do mínimo 16.1 de Dynamic Island). Esse é o scaffold default do `@bacons/apple-targets` para o tipo "widget" — não é lógica de produto.
- **Fix:** `WidgetControl.swift` — todo o conteúdo (struct `widgetControl`, extension, `TimerConfiguration`, `StartTimerIntent`) marcado `@available(iOS 18.0, *)`. `index.swift` — a chamada `widgetControl()` dentro do `WidgetBundle` envolvida em `if #available(iOS 18.0, *) { widgetControl() }`. Nenhuma lógica de produto adicionada ou removida — só disponibilidade condicional do scaffold default.
- **Files modified:** `targets/session-widget/WidgetControl.swift`, `targets/session-widget/index.swift`
- **Verification:** segunda tentativa de `xcodebuild ... build` → `** BUILD SUCCEEDED **`, exit 0
- **Committed in:** `bee2c5b`

**2. [Rule 3 - Blocking] iOS 26.5 Simulator runtime ausente — instalado via xcodebuild -downloadPlatform**
- **Found during:** Task 1, passo 9 (primeira tentativa de `xcodebuild ... -sdk iphonesimulator ... build`)
- **Issue:** `xcodebuild: error: Found no destinations for the scheme 'ForcaApp' and action build.` — `xcrun simctl list devices available` retornava vazio; `xcodebuild -showdestinations` apontava `iOS 26.5 is not installed. Please download and install the platform from Xcode > Settings > Components.` O SDK (`xcodebuild -showsdks`) já listava `iphonesimulator26.5`, mas o runtime de simulador em si (imagem de disco, ~8.52 GB) não estava baixado nesta máquina, distinto do bloqueio de `CoreSimulator.framework` já resolvido pelo dono antes desta sessão.
- **Fix:** `xcodebuild -downloadPlatform iOS -verbose` — download de 8.52 GB acompanhado até o fim (`iOS 26.5 (23F77) - <UUID>` instalado). Não é `npm install <pkg>`/`pip install`/`cargo add` (excluído da lista de auto-fixáveis por legitimidade de pacote) — é um componente de plataforma Xcode, baixado da própria Apple via ferramenta oficial, sem alternativa de nome a confundir.
- **Verification:** `xcrun simctl list devices available` passou a listar 8+ simuladores (iPhone 17 Pro, iPhone 17, iPad Pro etc.); segunda tentativa de build avançou além do erro de destination.
- **Committed in:** não aplicável (mudança de sistema, fora do repo — mesmo padrão da instalação do CocoaPods na Plano 14-02 sessão anterior)

**3. [Rule 1 - Bug] Glob do plano para checar .entitlements não alcança o diretório oculto do widget**
- **Found during:** Task 1, passo 10 (confirmação de NAT-02) e Task 2 (escrita do script)
- **Issue:** `grep -L aps-environment ios/*/*.entitlements` (comando literal do `<verify>` do plano) só encontra `ios/ForcaApp/ForcaApp.entitlements` — o entitlements do widget vive em `ios/.targets/sessionwidget/generated.entitlements`, um diretório com `.` inicial que o glob `ios/*/*.entitlements` (sem dotglob) não alcança. O grep original, portanto, provaria menos do que a acceptance criteria pede.
- **Fix:** confirmação manual do passo 10 feita com `find ios -name '*.entitlements'` + checagem explícita por arquivo (ambos com 0 ocorrências de `aps-environment`). `scripts/verify-native-skeleton.sh` (Task 2) usa `find ios -name '*.entitlements'` desde o início, não o glob do plano — evita a mesma lacuna permanentemente.
- **Files modified:** nenhum arquivo de produto; só o método de verificação (documentado aqui + no script)
- **Verification:** ambos os arquivos de entitlements confirmados sem `aps-environment`, via `find` explícito e via `scripts/verify-native-skeleton.sh` checagem (c)
- **Committed in:** `dca95a0` (o `find`-based check faz parte do script commitado)

### Não auto-fixável — referência ausente, contornada

**4. [Rule 3 - Missing referenced file] 14-PATTERNS.md do `<read_first>` da Task 2 não existe neste worktree**
- **Found during:** início da Task 2
- **Issue:** o plano referencia `.planning/phases/14-funda-o-nativa/14-PATTERNS.md` seção "scripts/verify-native-skeleton.sh" como leitura obrigatória, mas esse arquivo existe só como untracked no checkout principal (`/Users/phmarconato/ForcaApp`), não neste worktree. As instruções de binding deste agente proíbem tocar no checkout principal, mesmo para leitura.
- **Fix:** Task 2 escrita usando o texto de `<action>` do próprio PLAN.md (que já especifica literalmente shebang, `set -euo pipefail`, funções de cor, checagens (a)-(d) e mensagens `ABORTADO:`) mais o estilo real de `scripts/supabase-preflight.sh` e `scripts/verify-web-bundle.mjs`, ambos lidos integralmente neste worktree — suficientes para especificar a forma do script sem a referência ausente.
- **Verification:** `scripts/verify-native-skeleton.sh` passa em todos os critérios de aceitação da Task 2 (exit 0, `grep -c 'ABORTADO:'` = 5, `verify:native` em `package.json`)
- **Committed in:** `dca95a0`

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3) + 1 referência ausente contornada (Rule 3)
**Impact on plan:** Todos os auto-fixes foram necessários para a prova de compilação funcionar (Rule 1) ou para o ambiente ter os componentes exigidos pelo próprio plano (Rule 3). Nenhum scope creep — nenhuma lógica de produto foi adicionada ao Control Widget ou ao módulo `native-info`; a Task 2 seguiu literalmente as checagens (a)-(d) especificadas no plano.

## Issues Encountered

- Primeira tentativa de build (antes do Rule 1 fix) falhou com `** BUILD FAILED **` — ver Deviations #1.
- Primeira tentativa de build (antes do runtime do simulador estar instalado) falhou com `Found no destinations` — ver Deviations #2. O download de 8.52 GB foi o maior consumidor de tempo desta sessão (~9 min).
- Nenhum outro issue não documentado em Deviations.

## User Setup Required

None - nenhuma configuração de serviço externo necessária. O download do runtime do simulador (Deviations #2) foi feito por este agente via ferramenta oficial da Apple, sem exigir senha ou ação humana — distinto do bloqueio de `CoreSimulator.framework` da sessão anterior, que sim exigiu senha sudo do dono (já resolvido antes desta sessão começar).

## Next Phase Readiness

- **Pronto** para a Plano 14-03 e o restante da fase — NAT-01 e NAT-02 estão comprovados ponta a ponta nesta máquina, sem depender de device físico nem assinatura de distribuição.
- **Scheme Xcode confirmado: `ForcaApp`.** Planos 14-04 e 14-05 devem reusar esse valor literal, não redescobrir via `schemes[0]` do JSON (ver Deviations/Decisions acima — esse índice não é confiável).
- `scripts/verify-native-skeleton.sh` (`npm run verify:native`) está disponível como gate de regressão para qualquer plano/sessão futura desta fase, incluindo a rotina semanal de reassinatura (Plano 14-04's `scripts/resign.sh`).
- `ios/` permanece intencionalmente fora do controle de versão — reproduzido do zero por `expo prebuild --clean` a cada verificação, conforme provado por este plano rodando o prebuild 4 vezes nesta sessão (2x na Task 1, 2x dentro do script da Task 2) com resultado idêntico em todas.

## Self-Check: PASSED

- Todos os 8 arquivos citados (scaffold + fix + script) existem no worktree: PASS
- Todos os 4 commits citados (99ea67b, 5f1fdca, bee2c5b, dca95a0) existem em `git log --all`: PASS
- `xcodebuild ... build` exit 0 confirmado nesta sessão (log completo em `/tmp/xcodebuild_out3.log`): PASS
- `bash scripts/verify-native-skeleton.sh` exit 0 em 2 invocações independentes desta sessão: PASS

---
*Phase: 14-funda-o-nativa*
*Completed: 2026-08-16*
