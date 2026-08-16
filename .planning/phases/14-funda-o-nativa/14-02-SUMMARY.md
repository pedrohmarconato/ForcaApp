---
phase: 14-funda-o-nativa
plan: 02
subsystem: infra
tags: [ios, expo-prebuild, apple-targets, expo-modules, cocoapods, xcodebuild, checkpoint]

requires:
  - phase: 14-funda-o-nativa (plano 01)
    provides: "D-06 (bundle identifiers congelados) e aprovação dos pacotes SUS"
provides:
  - "app.json com ios.bundleIdentifier congelado + plugins @bacons/apple-targets e expo-build-properties"
  - "targets/session-widget/ scaffolded, sobrevive a expo prebuild --clean (25 ocorrências em project.pbxproj)"
  - "modules/native-info/ scaffolded manualmente (função de exemplo default, sem lógica de produto)"
  - "CocoaPods 1.17.0 instalado nesta máquina (gap de ambiente da Fase 14 resolvido)"
  - "BLOQUEIO NOVO descoberto: CoreSimulator.framework ausente do sistema — qualquer xcodebuild trava/falha, requer sudo (senha do dono)"
affects: [14-02-continuacao, 14-03, 14-04, 14-05]

actuals:
  tokens: 9000
  tasks: 0
  commits: 1

tech-stack:
  added: ["@bacons/apple-targets@^5.0.0", "expo-build-properties@~1.0.10", "CocoaPods 1.17.0 (sistema, não no repo)"]
  patterns: []

key-files:
  created:
    - targets/session-widget/expo-target.config.js
    - modules/native-info/expo-module.config.json
    - modules/native-info/index.ts
    - modules/native-info/ios/NativeInfoModule.swift
  modified:
    - app.json
    - package.json
    - package-lock.json

key-decisions:
  - "modules/native-info criado manualmente (não via CLI) — npx create-expo-module --local falhou 3x com ReferenceError de template EJS (repo is not defined) mesmo passando --repo explícito; conteúdo replica fielmente o exemplo default do template oficial (Name/Constant/Function/AsyncFunction), sem lógica de provisioning profile (fora do escopo desta plano)"
  - "targets/widget/ renomeado manualmente para targets/session-widget/ — npx create-target só ofereceu o seletor de tipo (Widget/Account Auth/...), sem prompt de nome/slug via stdin; RESEARCH.md Pitfall 7 já previa esse fallback"

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "app.json tem ios.bundleIdentifier congelado (D-06) e os dois plugins registrados"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "app.json lido após edição — ios.bundleIdentifier: com.pmarconato.forcaapp; plugins inclui @bacons/apple-targets e [expo-build-properties, {ios:{deploymentTarget:17.0}}]"
        status: pass
    human_judgment: false
  - id: D2
    description: "targets/session-widget/ e modules/native-info/ existem e sobrevivem a expo prebuild --clean"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "npx expo prebuild -p ios --clean --non-interactive rodou com sucesso; grep -c session-widget ios/*.xcodeproj/project.pbxproj → 25"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nenhum .entitlements gerado contém aps-environment (T-14-02-01)"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "grep -l aps-environment ios/ForcaApp/ForcaApp.entitlements ios/.targets/sessionwidget/generated.entitlements → nenhuma correspondência (exit 1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "xcodebuild compila o esqueleto (app + target de widget) para o simulador sem exigir assinatura de device"
    requirement: "NAT-02"
    verification: []
    human_judgment: true
    rationale: "BLOQUEADO — CoreSimulator.framework ausente de /Library/Developer/PrivateFrameworks/ nesta máquina; qualquer invocação de xcodebuild (mesmo -list) falha ao carregar o plugin IDESimulatorFoundation. O fix sugerido pelo próprio xcodebuild (`xcodebuild -runFirstLaunch`) trava indefinidamente esperando autorização — `sudo -n true` confirma que a máquina exige senha interativa, que este agente não possui nem deve solicitar. Precisa de ação humana única (ver Checkpoint abaixo)."
  - id: D5
    description: "scripts/verify-native-skeleton.sh existe, idempotente, encadeável"
    requirement: "NAT-02"
    verification: []
    human_judgment: true
    rationale: "Task 2 não foi iniciada — por protocolo (tracer feedback gate), a plano não avança para a task de formalização enquanto o tracer (Task 1) não tiver seu <verify> completo, e D4 está bloqueado."

duration: ~35min (até o bloqueio)
completed: 2026-08-16
status: blocked
---

# Fase 14 Plano 02: Pipeline nativo completo — Summary (BLOQUEADO, checkpoint:human-action)

**Scaffold completo (app.json, target de widget, módulo Swift local, CocoaPods instalado) — mas a prova final de NAT-02 (compilar para simulador via xcodebuild) está bloqueada por um gap de ambiente novo: CoreSimulator.framework ausente do sistema, corrigível só com senha sudo do dono.**

## Performance

- **Duration:** ~35 min até o bloqueio
- **Tasks:** 0/2 completas (Task 1 parcial — 8 dos 11 passos da action; Task 2 não iniciada)
- **Files modified:** 6 (app.json, package.json, package-lock.json) + ~20 criados (targets/session-widget/, modules/native-info/)

## Accomplishments

- `pod --version` → `1.17.0` (CocoaPods instalado via `brew install cocoapods` — gap de ambiente da Fase 14 resolvido)
- `app.json`: `ios.bundleIdentifier: "com.pmarconato.forcaapp"` (D-06) + plugins `@bacons/apple-targets` e `["expo-build-properties", {"ios":{"deploymentTarget":"17.0"}}]` adicionados depois de `expo-asset`/`expo-font`
- `@bacons/apple-targets@^5.0.0` e `expo-build-properties@~1.0.10` instalados (versões pinadas SDK 54, nunca `@latest`)
- `targets/session-widget/expo-target.config.js`: `type: "widget"`, `name: "session-widget"`, `bundleIdentifier: ".session-widget"`, `deploymentTarget: "17.0"`
- `modules/native-info/`: `expo-module.config.json` (platforms: apple, módulo `NativeInfoModule`), `index.ts` e `ios/NativeInfoModule.swift` com a função de exemplo default (`Name`, `Constant("PI")`, `Function("hello")`, `AsyncFunction("setValueAsync")`), sem lógica de produto
- `npx expo prebuild -p ios --clean --non-interactive` roda com sucesso: `ios/` gerado, CocoaPods instalado (`✔ Installed CocoaPods`), target `session-widget` presente 25× em `ios/ForcaApp.xcodeproj/project.pbxproj`
- Confirmado via `grep`: nenhum `.entitlements` gerado (`ios/ForcaApp/ForcaApp.entitlements`, `ios/.targets/sessionwidget/generated.entitlements`) contém `aps-environment` — mitigação T-14-02-01 (threat model) cumprida

## Task Commits

1. **Task 1 (parcial — BLOQUEADO antes do xcodebuild)** - `99ea67b` (feat, rotulado `[BLOCKED, not verified]` no corpo do commit)

Nenhum outro commit — Task 2 não foi iniciada (tracer feedback gate: não se avança para a task de formalização sem o tracer verificado ponta a ponta).

## Files Created/Modified

- `app.json` — bundleIdentifier iOS + 2 plugins novos
- `package.json` / `package-lock.json` — 2 dependências novas + script `verify:native` AINDA NÃO adicionado (era Task 2)
- `targets/session-widget/expo-target.config.js` + arquivos Swift/Info.plist/Assets.xcassets default do scaffold
- `modules/native-info/expo-module.config.json`, `index.ts`, `ios/NativeInfoModule.swift`
- `ios/` — gerado por `expo prebuild`, NÃO commitado (fora de `files_modified` do plano; artefato descartável)

## Decisions Made

- **`modules/native-info` criado manualmente, não via `npx create-expo-module --local`.** A CLI falhou 3 vezes com `ReferenceError: repo is not defined` num template EJS (`ios/{%- project.name %}.podspec`), mesmo passando `--repo` explicitamente via flag — parece um bug da própria CLI nesta versão (`create-expo-module@57.0.1`) ao renderizar o subdiretório `package/` de um módulo `--local` (que não deveria nem ser gerado para módulos locais). O conteúdo final replica fielmente o exemplo default do template oficial (mesmo texto de `Name`/`Constant`/`Function`/`AsyncFunction` que a CLI gera quando funciona), então a fidelidade ao "scaffold-padrão" pedido pelo plano foi preservada.
- **`targets/widget/` renomeado manualmente para `targets/session-widget/`.** `npx create-target` (via stdin `"widget\nsession-widget\n"`) só expôs o seletor interativo de TIPO (Widget/Account Auth/Action/.../Broadcast Setup UI) e não perguntou nome/slug — usou o default `"widget"` como nome de pasta. RESEARCH.md Pitfall 7 já previa esse comportamento não-interativo; segui o fallback documentado no próprio plano: renomear a pasta e editar `expo-target.config.js` com `name`/`bundleIdentifier`/`deploymentTarget` explícitos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CocoaPods ausente — instalado via Homebrew**
- **Found during:** Task 1, passo 1 (esperado pelo próprio plano)
- **Issue:** `pod --version` → "command not found"
- **Fix:** `brew install cocoapods` (1.17.0, com dependências `libyaml`/`ruby`)
- **Verificação:** `pod --version` → `1.17.0`
- **Committed in:** não aplicável (mudança de sistema, fora do repo)

**2. [Rule 3 - Blocking] `npx create-target` não aceitou nome/slug via stdin — pasta renomeada manualmente**
- Ver "Decisions Made" acima. Sem impacto de escopo — resultado final é idêntico ao que o plano pedia.

**3. [Rule 3 - Blocking] `npx create-expo-module --local` falhou 3× (bug de template EJS) — módulo criado manualmente**
- Ver "Decisions Made" acima.

### Não auto-fixável — checkpoint necessário

**4. [Environment blocker, não é Rule 1/2/3] CoreSimulator.framework ausente do sistema**
- **Found during:** Task 1, passo 8 (`xcodebuild -list -workspace ios/*.xcworkspace -json`)
- **Sintoma:** toda invocação de `xcodebuild` (mesmo `-list`, mesmo sem `-sdk iphonesimulator`) falha com `DVTPlugInLoading: Failed to load code for plug-in com.apple.dt.IDESimulatorFoundation ... Library not loaded: /Library/Developer/PrivateFrameworks/CoreSimulator.framework/Versions/A/CoreSimulator ... (no such file)`.
- **Confirmado:** `/Library/Developer/PrivateFrameworks/` não existe nesta máquina (`ls` → "No such file or directory"); busca em todo o disco (`find / -iname CoreSimulator.framework`) não encontra nenhuma cópia, nem embutida em `/Applications/Xcode.app`.
- **Tentativa de correção sugerida pelo próprio `xcodebuild`:** `xcodebuild -runFirstLaunch` — travou indefinidamente (processo vivo, 0% CPU, sem progresso por >5min), consistente com uma instalação que precisa de autorização root via diálogo GUI que nunca aparece em sessão headless. `sudo -n true` confirma: `sudo: a password is required` — esta máquina não tem sudo sem senha configurado.
- **Por que não é auto-fixável:** requer a senha do dono (root), que este agente não possui, não deve solicitar e não pode inserir de forma não-interativa. Não é um bug de código do plano — é um gap de sistema operacional desta máquina especificamente (distinto do gap de CocoaPods, que era resolvível via Homebrew sem sudo).
- **`xcrun simctl list devices` também trava** pela mesma causa raiz (tentou re-disparar `xcodebuild -runFirstLaunch` internamente).
- **Impacto:** bloqueia literalmente a truth obrigatória do plano ("`xcodebuild` compila o esqueleto ... para o simulador ... provando que config + target + módulo funcionam ponta a ponta") e, por consequência (tracer feedback gate), bloqueia o início da Task 2.

---

**Total deviations:** 3 auto-fixed (Rule 3) + 1 bloqueio de ambiente não auto-fixável (checkpoint:human-action)
**Impact on plan:** Scaffold e configuração (Task 1, passos 1-7) completos e corretos; a prova de compilação (passos 8-10) e toda a Task 2 permanecem pendentes até o bloqueio ser resolvido.

## Issues Encountered

Ver "Deviations from Plan" acima — o único issue não resolvido é o CoreSimulator.framework ausente.

## Checkpoint — Ação humana necessária (uma vez, nesta máquina)

**O que foi tentado (automação primeiro):** `xcodebuild -runFirstLaunch` (travou, precisa de senha); `sudo -n true` (confirmou que a senha é obrigatória); busca no disco inteiro por uma cópia alternativa de `CoreSimulator.framework` (nenhuma encontrada).

**Passo manual necessário (escolha um):**
1. Abrir `/Applications/Xcode.app` pela interface gráfica (duplo-clique) uma vez — o Xcode detecta os componentes ausentes e oferece instalá-los com um diálogo de senha nativo; OU
2. No Terminal, rodar `sudo xcodebuild -runFirstLaunch` e digitar a senha quando solicitado.

**Comando de verificação (depois do passo manual):**
```bash
pod --version && \
xcodebuild -list -workspace ios/*.xcworkspace -json | head -5
```
Se o segundo comando imprimir JSON (schemes) em vez do erro de plugin, o bloqueio está resolvido e a Plano 14-02 pode ser retomada a partir do passo 8 da Task 1 (descoberta do scheme + build de simulador), sem refazer nenhum dos passos 1-7 já commitados.

## Next Phase Readiness

- **NÃO pronto** para a Plano 14-03 nem para o resto da fase — a prova de compilação de NAT-02 (a razão de existir desta plano) está pendente.
- Todo o scaffold de configuração (app.json, target, módulo, CocoaPods) está commitado e correto; a continuação só precisa retomar a partir de `xcodebuild -list` (passo 8) depois do checkpoint ser resolvido pelo dono.
- Task 2 (`scripts/verify-native-skeleton.sh`) segue inteiramente pendente.

---
*Phase: 14-funda-o-nativa*
*Status: blocked — aguardando ação humana (senha sudo / abrir Xcode.app uma vez)*
