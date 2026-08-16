---
phase: 14-funda-o-nativa
plan: 05
subsystem: infra
tags: [ios, app-groups, expo-modules, cocoapods-autolinking, xcode-signing, apple-targets]

requires:
  - phase: 14-funda-o-nativa (plano 01)
    provides: "D-06: App Group candidato congelado (group.com.pmarconato.forcaapp.shared)"
  - phase: 14-funda-o-nativa (plano 02)
    provides: "Pipeline nativo provado, scheme Xcode ForcaApp confirmado, targets/session-widget/ e modules/native-info/ scaffolded"
provides:
  - "Entitlement com.apple.security.application-groups aplicada de forma IDENTICA em app.json e targets/session-widget/expo-target.config.js (group.com.pmarconato.forcaapp.shared)"
  - "modules/app-group-spike/ — modulo Expo local funcional (compilado e linkado, confirmado via build de simulador), expondo readAppGroupSpikeValue()"
  - "Bloco SPIKE-ONLY em targets/session-widget/widgets.swift que escreve no App Group a cada timeline do widget"
  - "Bug estrutural descoberto e corrigido: modulos Expo locais (modules/*) nunca estavam sendo linkados no Xcode desde a Plano 14-02 — faltava npm workspaces + apple.podspecPath explicito no expo-module.config.json. modules/native-info permanece com o mesmo gap (fora do escopo desta plano, nao tocado)"
  - "RESULTADO DO SPIKE D-09: time Apple pessoal gratuito CONCEDE App Groups tanto ao app principal quanto ao target de widget — confirmado via build assinado real (nao so config), entitlement com.apple.security.application-groups presente nos dois artefatos assinados (ForcaApp.app e session-widget.appex), ambos com com.apple.developer.team-identifier = 9WD49Z5TV7"
  - "ios.appleTeamId = 9WD49Z5TV7 persistido em app.json (Task 1 da sessao de resolucao) — sobrevive a expo prebuild --clean, resolvendo o bloqueio original"
affects: [14-06, 14-07, 14-09]

actuals:
  tokens: 4200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Modulos Expo locais (modules/*) precisam de: (1) package.json proprio, (2) entrada em root package.json workspaces + dependencies, (3) expo-module.config.json com apple.podspecPath explicito apontando para um *.podspec no ROOT do modulo (listFilesInDirectories do autolinking so escaneia SUBdiretorios, nunca o root do modulo) — sem os 3, expo-modules-autolinking resolve nunca inclui o modulo e ele nunca e compilado/linkado, mesmo que expo-modules-autolinking search o encontre (search != resolve)"

key-files:
  created:
    - modules/app-group-spike/expo-module.config.json
    - modules/app-group-spike/index.ts
    - modules/app-group-spike/ios/AppGroupSpikeModule.swift
    - modules/app-group-spike/package.json
    - modules/app-group-spike/AppGroupSpikeModule.podspec
  modified:
    - app.json
    - targets/session-widget/expo-target.config.js
    - targets/session-widget/widgets.swift
    - package.json
    - package-lock.json

key-decisions:
  - "package.json ganhou workspaces: ['modules/*'] + app-group-spike como dependency declarada — necessario para expo-modules-autolinking resolve encontrar o modulo (nao e opcional; sem isso o modulo compila isoladamente mas NUNCA e linkado no app, quebrando o round-trip fisico da Plano 14-06 silenciosamente)"
  - "expo-module.config.json do app-group-spike declara apple.podspecPath explicitamente, seguindo a convencao real de modulos Expo publicados (ex. expo-dev-menu), em vez de depender do fallback de busca em subdiretorios do autolinking"
  - "Bloco de escrita SPIKE-ONLY colocado em widgets.swift dentro de Provider.timeline(for:in:) — roda toda vez que o WidgetKit gera uma timeline, o que acontece quando o widget e adicionado a Home/Lock Screen (gatilho natural do round-trip fisico da Plano 14-06)"

patterns-established:
  - "Modulo Expo local so e de fato linkado no Xcode se: root package.json tiver workspaces cobrindo modules/*, o modulo estiver declarado em dependencies do root package.json, e expo-module.config.json declarar apple.podspecPath explicito. Confirmar sempre via 'npx expo-modules-autolinking resolve --platform apple --json' antes de assumir que um modulo scaffolded esta funcional — 'search' encontra o diretorio, 'resolve' e o que realmente importa para o build."

requirements-completed: [NAT-02]

coverage:
  - id: D1
    description: "Entitlement com.apple.security.application-groups identica em app.json e expo-target.config.js, com prefixo group. correto"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "grep -oE 'group\\.[A-Za-z0-9.]+' app.json e targets/session-widget/expo-target.config.js, ambos retornando group.com.pmarconato.forcaapp.shared (Task 2 do plano)"
        status: pass
    human_judgment: false
  - id: D2
    description: "modules/app-group-spike/ existe, compila e e efetivamente linkado no target do app (nao so presente em disco)"
    requirement: "NAT-02"
    verification:
      - kind: manual_procedural
        ref: "grep AppGroupSpikeModule ios/Podfile.lock (3 ocorrencias) + find DerivedData apos xcodebuild -sdk iphonesimulator ... BUILD SUCCEEDED, confirmando libAppGroupSpikeModule.a e AppGroupSpikeModule.swiftmodule gerados nesta sessao"
        status: pass
    human_judgment: false
  - id: D3
    description: "Build assinado para device (xcodebuild -destination generic/platform=iOS -allowProvisioningUpdates) sai com exit 0 e o .app fica localizavel em DerivedData, pronto para a Plano 14-06 instalar"
    requirement: "NAT-02"
    verification:
      - kind: automated
        ref: "xcodebuild -workspace ios/*.xcworkspace -scheme ForcaApp -configuration Debug -destination generic/platform=iOS -allowProvisioningUpdates build -> '** BUILD SUCCEEDED **', EXIT_CODE=0 (sessao de resolucao, apos o dono configurar Xcode Accounts + Personal Team 9WD49Z5TV7 e parear o iPhone). codesign -d --entitlements - em ForcaApp.app e session-widget.appex (DerivedData) confirma com.apple.security.application-groups = [group.com.pmarconato.forcaapp.shared] e com.apple.developer.team-identifier = 9WD49Z5TV7 nos DOIS artefatos assinados."
        status: pass
    human_judgment: false

duration: ~55min (sessao original, bloqueada) + ~15min (sessao de resolucao do bloqueio)
completed: 2026-08-16
status: complete
---

# Fase 14 Plano 05: Entitlement App Group + spike de round-trip — Summary

**RESULTADO DO SPIKE D-09: um time Apple pessoal GRATUITO concede a capability App Groups tanto ao app principal quanto ao target de widget.** Confirmado com o artefato assinado real (não apenas config): `codesign -d --entitlements -` em `ForcaApp.app` e em `session-widget.appex` mostra `com.apple.security.application-groups = [group.com.pmarconato.forcaapp.shared]` nos dois, assinados pelo mesmo `com.apple.developer.team-identifier = 9WD49Z5TV7` (time pessoal gratuito do dono). O bloqueio original desta plano — build assinado falhando por falta de `ios.appleTeamId` — foi resolvido numa sessão de continuação após o dono configurar Xcode → Settings → Accounts e conceder o Team ID; `appleTeamId` foi persistido em `app.json` (não só escrito transientemente no `project.pbxproj` gerado, que é descartado a cada `expo prebuild --clean`).

## Performance

- **Duration:** ~55 min (sessão original) + ~15 min (sessão de resolução do bloqueio)
- **Tasks:** 2 tasks no plano — ambas 100% completas. Task 1 (entitlement + módulo + build assinado) completa incluindo o build assinado final, alcançado na sessão de resolução após o bloqueio de signing ser sanado pelo dono.
- **Files modified:** 10 (commit `60bdf53`, sessão original) + 1 (commit de resolução do bloqueio, `app.json` ganhando `ios.appleTeamId`)

## Accomplishments

- `app.json` e `targets/session-widget/expo-target.config.js`: entitlement `com.apple.security.application-groups` = `["group.com.pmarconato.forcaapp.shared"]` em ambos, confirmado idêntico byte a byte (Task 2, `grep` extraindo o mesmo valor dos dois arquivos)
- `targets/session-widget/widgets.swift`: bloco `// SPIKE-ONLY (14-05) — remover em 14-07` dentro de `Provider.timeline(for:in:)`, escrevendo `"app-group-spike-\(Date())"` em `UserDefaults(suiteName: "group.com.pmarconato.forcaapp.shared")` sob a chave `appGroupSpikeValue`, com `NSLog` de sucesso/falha
- `modules/app-group-spike/` criado manualmente (mesma decisão da Plano 14-02 para `native-info`: `npx create-expo-module --local` não foi tentado novamente por já ter falhado 3x nesse worktree com bug de template EJS) — `index.ts` expõe `readAppGroupSpikeValue(): Promise<string | null>`, `ios/AppGroupSpikeModule.swift` lê de volta o mesmo `UserDefaults(suiteName:)`/chave
- **Bug estrutural descoberto e corrigido:** nenhum módulo Expo local (`modules/native-info` da Plano 14-02, nem `modules/app-group-spike` recém-criado) estava de fato sendo linkado no Xcode — `expo-modules-autolinking resolve` (o comando que o `Podfile` realmente usa via `use_expo_modules!`) nunca os encontrava, apesar de `expo-modules-autolinking search` encontrá-los (são comandos com lógica de descoberta diferente). Corrigido para `app-group-spike` via: `package.json` raiz ganhou `workspaces: ["modules/*"]` + `app-group-spike` declarado em `dependencies`; `modules/app-group-spike/expo-module.config.json` ganhou `apple.podspecPath` explícito apontando para `AppGroupSpikeModule.podspec` (novo, no root do módulo). Confirmado via `grep AppGroupSpikeModule ios/Podfile.lock` (3 ocorrências) e `xcodebuild -sdk iphonesimulator ... build` → `** BUILD SUCCEEDED **` com `libAppGroupSpikeModule.a` e `AppGroupSpikeModule.swiftmodule` de fato gerados em DerivedData.
- `modules/native-info` (Plano 14-02) tem o MESMO gap de linking e **não foi tocado** — está fora do `files_modified` desta plano e o próprio plano proíbe editar esse módulo. Documentado como achado para uma plano futura corrigir (`readAppGroupSpikeValue`/`getProvisioningProfileExpiry` de `native-info` lançariam "Cannot find native module" em runtime hoje).

## Task Commits

1. **Task 1 (entitlement + módulo + fix de autolinking)** - `60bdf53` (feat) — inclui o fix de linking (Rule 2, funcionalidade crítica ausente para o próprio módulo desta task funcionar)
2. **Task 2 (checagem de consistência do App Group ID)** - sem commit adicional (verificação pura, sem mudança de arquivo — critério já satisfeito pelas edições da Task 1)
3. **Sessão de resolução do bloqueio — Team ID persistido** - `576220e` (fix) — `expo.ios.appleTeamId = "9WD49Z5TV7"` adicionado a `app.json` depois que o dono concluiu a configuração de Xcode → Settings → Accounts + pareamento do iPhone; verificado sobrevivendo a `expo prebuild -p ios --clean --non-interactive` (`grep -c 'DEVELOPMENT_TEAM = 9WD49Z5TV7' ios/ForcaApp.xcodeproj/project.pbxproj` → 4)
4. **Sessão de resolução do bloqueio — build assinado** - sem commit adicional (nenhuma mudança de código necessária além do `appleTeamId`; apenas execução verificada: `xcodebuild ... -destination generic/platform=iOS -allowProvisioningUpdates build` → `** BUILD SUCCEEDED **`, `EXIT_CODE=0`)

## Files Created/Modified

- `app.json` — entitlement de App Group adicionada
- `targets/session-widget/expo-target.config.js` — mesma entitlement adicionada
- `targets/session-widget/widgets.swift` — bloco SPIKE-ONLY de escrita
- `modules/app-group-spike/{expo-module.config.json,index.ts,ios/AppGroupSpikeModule.swift,package.json,AppGroupSpikeModule.podspec}` — módulo novo, completo e funcional
- `package.json` — `workspaces` + `app-group-spike` em `dependencies`
- `package-lock.json` — symlink de workspace registrado

## Decisions Made

- **Módulo criado manualmente, não via `npx create-expo-module --local`** — mesma decisão/motivo da Plano 14-02 (bug de template EJS já documentado nesse worktree), sem re-tentar a CLI.
- **`package.json` ganhou `workspaces` + dependency explícita para `app-group-spike`** — não estava no `files_modified` literal do plano, mas é Rule 2 (funcionalidade crítica ausente): sem isso, `readAppGroupSpikeValue()` lançaria erro em runtime no aparelho físico da Plano 14-06, invalidando o propósito inteiro do spike. Ver Deviations.
- **`apple.podspecPath` explícito em vez de depender do fallback de busca em subdiretórios** — investigação do código-fonte de `expo-modules-autolinking` (`listFilesInDirectories` só escaneia SUBdiretórios de cada módulo, nunca o root) confirmou que módulos reais publicados (ex. `expo-dev-menu`) sempre declaram esse campo explicitamente; seguido o mesmo padrão.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Módulos Expo locais nunca eram linkados no Xcode (gap desde a Plano 14-02)**
- **Found during:** Task 1, ao confirmar que `AppGroupSpikeModule` compilava de verdade (não só "não dava erro de build")
- **Issue:** `expo-modules-autolinking resolve --platform apple --json` (o comando que `Podfile`'s `use_expo_modules!` realmente usa) nunca incluía `app-group-spike` nem `native-info`, apesar de `expo-modules-autolinking search` encontrar ambos por diretório. Causa raiz dupla: (a) sem `npm workspaces`, `modules/*` nunca eram symlinked em `node_modules/`, então a resolução recursiva de dependências (que segue `package.json` "dependencies" via resolução Node padrão) nunca os alcançava; (b) mesmo com o symlink, `expo-module.config.json` sem `apple.podspecPath` explícito nunca tinha seu `.podspec` encontrado, porque `listFilesInDirectories` (usado no fallback) só escaneia SUBdiretórios de cada módulo — nunca o arquivo `.podspec` no próprio root do módulo, onde eu (seguindo a convenção comum) o tinha colocado.
- **Fix:** `package.json` raiz: `workspaces: ["modules/*"]` + `"app-group-spike": "*"` em `dependencies`. `modules/app-group-spike/package.json` criado (nome/versão/descrição/licença/autor/homepage — exigidos pela validação do CocoaPods). `modules/app-group-spike/expo-module.config.json`: campo `apple.podspecPath: "AppGroupSpikeModule.podspec"` adicionado. `modules/app-group-spike/AppGroupSpikeModule.podspec` criado seguindo o padrão mínimo de um módulo Expo local (dependency `ExpoModulesCore`, `DEFINES_MODULE`/`SWIFT_COMPILATION_MODE`, `source_files` cobrindo `ios/**/*`).
- **Files modified:** `package.json`, `package-lock.json`, `modules/app-group-spike/package.json` (novo), `modules/app-group-spike/expo-module.config.json`, `modules/app-group-spike/AppGroupSpikeModule.podspec` (novo)
- **Verification:** `npx expo-modules-autolinking resolve --platform apple --json` passou a listar `app-group-spike` com `pods: [{podName: "AppGroupSpikeModule", ...}]`; `grep AppGroupSpikeModule ios/Podfile.lock` → 3 ocorrências (antes: 0); `xcodebuild -workspace ios/*.xcworkspace -scheme ForcaApp -sdk iphonesimulator -configuration Debug build CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` → `** BUILD SUCCEEDED **`, com `libAppGroupSpikeModule.a` e `AppGroupSpikeModule.swiftmodule` confirmados em DerivedData
- **Committed in:** `60bdf53`
- **Escopo:** `modules/native-info` (Plano 14-02) tem exatamente o mesmo gap, mas **não foi tocado** — está fora do `files_modified` desta plano e o plano proíbe editar esse arquivo. Fica registrado aqui como achado para correção futura (a Plano que reintroduzir/usar `getProvisioningProfileExpiry` vai descobrir o mesmo erro "Cannot find native module").

---

**Total deviations:** 1 auto-fixed (Rule 2, funcionalidade crítica ausente)
**Impact on plan:** O fix era estritamente necessário para o próprio entregável desta plano (`readAppGroupSpikeValue()`) funcionar de verdade no aparelho físico da Plano 14-06 — sem ele, o round-trip do spike D-09 falharia silenciosamente com um erro de módulo nativo ausente, não com um resultado real sobre App Groups em time gratuito. Nenhum scope creep: `native-info` foi deixado intocado apesar de ter o mesmo bug.

## Resolução do bloqueio (sessão de continuação)

**O bloqueio original — build assinado falhando por `ios.appleTeamId` ausente — foi resolvido nesta sessão de continuação, após o dono completar a configuração de Xcode → Settings → Accounts e conceder o Team ID.**

- **Time ID do dono:** `9WD49Z5TV7` (personal, free tier). Confirmado em `ios/ForcaApp.xcodeproj/project.pbxproj` como `DEVELOPMENT_TEAM = 9WD49Z5TV7;` (4 ocorrências = 2 targets × 2 configurações) antes desta sessão editar qualquer coisa.
- **Fix aplicado (Task 1 da sessão de resolução):** `ios/` é gitignored e totalmente regenerado por `expo prebuild`, então o `DEVELOPMENT_TEAM` gravado diretamente no `project.pbxproj` pelo Xcode é DESCARTÁVEL — o próximo `--clean` o apagaria. `expo.ios.appleTeamId = "9WD49Z5TV7"` foi adicionado a `app.json` (config permanente) para que o valor sobreviva à regeneração do CNG.
- **Verificação literal (Task 1):** após `npx expo prebuild -p ios --clean --non-interactive`, `grep -c 'DEVELOPMENT_TEAM = 9WD49Z5TV7' ios/ForcaApp.xcodeproj/project.pbxproj` → `4`, sem reabrir o Xcode. Prova que o setting sobrevive à regeneração CNG.
- **Build assinado (Task 2 da sessão de resolução):** `xcodebuild -workspace ios/*.xcworkspace -scheme ForcaApp -configuration Debug -destination "generic/platform=iOS" -allowProvisioningUpdates build` → `** BUILD SUCCEEDED **`, `EXIT_CODE=0`.
- **Entitlement confirmada no artefato assinado real** (não só em config): `codesign -d --entitlements - <ForcaApp.app>` e `codesign -d --entitlements - <session-widget.appex>` (ambos em DerivedData) mostram, nos DOIS:
  ```
  com.apple.security.application-groups = [group.com.pmarconato.forcaapp.shared]
  com.apple.developer.team-identifier   = 9WD49Z5TV7
  ```
- **RESULTADO DO SPIKE D-09 (a pergunta que esta plano existia para responder):** **um time Apple pessoal GRATUITO concede App Groups tanto ao app principal quanto ao target de widget.** Round-trip de config confirmado com artefato assinado real de build — resta apenas a confirmação física do round-trip de dados (escrever no widget, ler no app) na Sessão 1 (Plano 14-06), que depende do aparelho físico e não é automatizável.
- **Nenhuma mudança de código adicional foi necessária** além do `appleTeamId` em `app.json` — o `.app`/`.appex` gerados nesta sessão já usam a entitlement e o módulo `app-group-spike` da sessão original (commit `60bdf53`), sem alteração.
- **Consequência para a Plano 14-06:** o `.app` assinado que a Plano 14-06 espera existe agora em DerivedData (`.../ForcaApp-cmcqxhovmczojncrjtybnwlvfjjs/Build/Products/Debug-iphoneos/ForcaApp.app`, com `PlugIns/session-widget.appex` embutido), pronto para `xcrun devicectl device install app`. Nenhuma instalação foi feita nesta sessão (fora de escopo — instalação física é da Plano 14-06).

## Issues Encountered

Nenhum problema não documentado além do bug de linking (Deviations, sessão original) e do bloqueio de signing agora resolvido (seção acima).

## User Setup Required

**Concluído.** O dono completou a configuração de Xcode → Settings → Accounts (Apple ID pessoal + time gratuito) e o pareamento do iPhone, conforme pedido em `user_setup` do plano. Nenhuma ação adicional do dono é necessária para esta plano.

## Next Phase Readiness

- **Pronto** para a Plano 14-06 instalar o `.app` — ele existe em DerivedData, assinado, com a entitlement de App Group confirmada nos dois artefatos (app + widget).
- Entitlement de App Group correta e idêntica nos dois arquivos de config (Task 2 original passou), `modules/app-group-spike` genuinamente compilável e linkado (confirmado via build de simulador na sessão original E via build de device assinado nesta sessão de resolução).
- `ios.appleTeamId` agora persistido em `app.json` — builds futuros (`npm run resign`, `scripts/resign.sh`, ou repetir o `xcodebuild` desta plano) não vão mais precisar de intervenção manual no Xcode para assinar, mesmo após `expo prebuild --clean`.
- **Achado para plano futura (não resolvido aqui, fora de escopo):** `modules/native-info` tem o mesmo gap de linking que `app-group-spike` tinha antes do fix da sessão original — não foi corrigido por estar fora do `files_modified` desta plano, mas vai quebrar silenciosamente (`Cannot find native module 'NativeInfoModule'`) na primeira vez que `getProvisioningProfileExpiry()` for chamado de verdade no app. *(Nota: `.planning/phases/14-funda-o-nativa/` registra um commit posterior `e70b62b fix(14): link modules/native-info into the native project` que pode já ter endereçado este achado numa plano subsequente — não verificado nesta sessão por estar fora do escopo desta correção.)*

## Self-Check: PASSED

- `modules/app-group-spike/{expo-module.config.json,index.ts,ios/AppGroupSpikeModule.swift,package.json,AppGroupSpikeModule.podspec}` existem no worktree: PASS
- Commit `60bdf53` existe em `git log --oneline`: PASS
- `grep -oE 'group\.[A-Za-z0-9.]+' app.json` e mesmo grep em `targets/session-widget/expo-target.config.js` retornam `group.com.pmarconato.forcaapp.shared` nos dois: PASS
- `grep AppGroupSpikeModule ios/Podfile.lock` → 3 ocorrências: PASS
- `xcodebuild -sdk iphonesimulator ... build` → `BUILD SUCCEEDED`: PASS
- **Sessão de resolução do bloqueio:**
  - Commit `576220e` existe em `git log --oneline`: PASS
  - `grep -q "9WD49Z5TV7" app.json`: PASS
  - `grep -c 'DEVELOPMENT_TEAM = 9WD49Z5TV7' ios/ForcaApp.xcodeproj/project.pbxproj` após `prebuild --clean` → `4`: PASS
  - `xcodebuild -destination generic/platform=iOS -allowProvisioningUpdates build` → `** BUILD SUCCEEDED **`, `EXIT_CODE=0`: PASS
  - `codesign -d --entitlements - ForcaApp.app` e `session-widget.appex` → `com.apple.security.application-groups = [group.com.pmarconato.forcaapp.shared]` nos dois: PASS

---
*Phase: 14-funda-o-nativa*
*Completed: 2026-08-16 (build assinado alcançado na sessão de resolução do bloqueio)*
