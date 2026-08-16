# Phase 14: Fundação nativa - Research

**Researched:** 2026-08-16
**Domain:** Build/assinatura nativa iOS por sideload gratuito (Xcode 26 + Apple ID pessoal, sem EAS), scaffolding de target de widget + módulo Expo Swift local via Continuous Native Generation, leitura de provisioning profile em runtime
**Confidence:** MEDIUM — a pesquisa do milestone (SUMMARY/STACK/ARCHITECTURE/PITFALLS.md) já arbitrou stack e riscos com confiança MEDIUM; esta pesquisa de fase confirma via fontes primárias (npm registry, `bundledNativeModules.json` do SDK 54, README oficial do `@bacons/apple-targets`, auditoria do ambiente local) os pontos de implementação que faltavam. Dois fatos centrais (App Groups em time gratuito; processo que roda `perform()`) seguem UNKNOWN até o spike no aparelho — não resolvidos por pesquisa, apenas confirmado que o protocolo do spike está correto.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rotina de reassinatura semanal**
- **D-01:** O comando único é um script versionado no repo (ex.: `npm run resign` → `expo prebuild` + build assinado + instalação no aparelho). É ele que cumpre o "runbook documentado e repetível" do NAT-01.
- **D-02:** Instalação por cabo USB (ex.: `xcrun devicectl`) — caminho mais confiável; Wi-Fi não faz parte do fluxo padrão.
- **D-03:** O app mostra um banner discreto de validade ("Reassine até sexta") quando faltarem ≤2 dias para o provisioning profile expirar — lido do profile embarcado. Escopo mínimo: um aviso, não um sistema de notificação.

**Identidade do app no iPhone**
- **D-04:** O nativo assume a identidade "Força" (ícone/splash já existentes em `assets/`). O dono remove o atalho do PWA da tela de início quando o nativo estiver estável; o PWA segue vivo como canal web/push no navegador — nada do PWA é desmontado.
- **D-05:** O build do dia a dia durante o v1.3 é **dev-client** (um só app: conecta no Metro quando o dono quiser, roda o bundle embarcado na academia). Vira Release no fechamento do milestone.
- **D-06:** Bundle identifiers (app principal + extensão de widget) e o App Group ID (se o spike aprovar) são congelados na primeira escolha — **Reversibility:** costly — o time pessoal gratuito tem quota de ~10 App IDs/semana (PITFALLS.md); renomear queima quota, exige re-confiar o certificado no aparelho e invalida o resultado do spike.

**Ambiente e dados do build**
- **D-07:** O bundle embarcado aponta para **produção** (Supabase prod + `forca-api.cadastrai.com`) — o app é útil de verdade desde o primeiro build. Conectado no Metro, usa o stack local/staging como no fluxo de dev atual. A troca é pelo modo de execução, sem rebuild dedicado.
- **D-08:** UAT no aparelho usa a **conta real do dono** — validar é treinar de verdade. Teste deliberado/artificial fica no Metro + stack local, nunca contra produção.

**Logística dos momentos com iPhone**
- **D-09:** Os momentos que exigem o aparelho físico são agrupados em **duas sessões**: Sessão 1 no início da fase (~45 min: primeira instalação, Developer Mode, confiar certificado, spike de App Groups) e Sessão 2 no fim (UAT: rotina de reassinatura + fluxo de treino sem diferença percebida). O spike vem cedo porque a decisão de arquitetura das fases 16–17 depende dele.
- **D-10:** Cada sessão é entregue como **roteiro auto-contido** (comandos prontos para copiar, resultado esperado, critério de aprovação) e a execução da fase PARA nesses checkpoints até o dono reportar o resultado — o dono roda quando puder (rotina remota). Nunca usar "compilou" como critério de conclusão.

### Claude's Discretion
- Ferramenta exata de instalação (`xcrun devicectl` vs alternativa) e estrutura interna do script de reassinatura.
- Como ler a validade do provisioning profile para o banner (D-03) — qualquer mecanismo simples e local serve.
- Formato do registro escrito do spike (sugestão: `14-SPIKE-APP-GROUPS.md` no diretório da fase) — desde que a decisão com/sem App Group fique explícita e citável pelas fases 16–17.
- Nome exibido exato sob o ícone (respeitando D-04: identidade "Força").

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Reassinatura automática via
AltStore já está registrada como Future em REQUIREMENTS.md, decisão anterior.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAT-01 | Instalação nativa via `expo prebuild` + assinatura Apple ID gratuito, com rotina de reassinatura semanal documentada e repetível em 1 comando | Ver `## Architecture Patterns` (fluxo prebuild→build→install), `## Code Examples` (script de reassinatura, leitura de expiry do provisioning profile), `## Environment Availability` (CocoaPods ausente é bloqueador a resolver antes do primeiro build) |
| NAT-02 | Target da extensão de widget + módulo Expo Swift local sobrevivem a `expo prebuild --clean`; spike de App Groups no aparelho registra a arquitetura de estado | Ver `## Standard Stack` (`@bacons/apple-targets` + `create-expo-module --local`), `## Common Pitfalls` (Pitfall 1, 3, 4, 5), `## Validation Architecture` (verificação automatizável de sobrevivência ao `--clean` sem precisar do aparelho) |
</phase_requirements>

## Summary

Esta fase não introduz feature nova de produto — ela cria a fundação de build nativo sobre a qual as fases 15-17 (Live Activity, App Intents, registro sem teclado) serão construídas. A pesquisa do milestone (`SUMMARY.md`, `PITFALLS.md`, `STACK.md`, `ARCHITECTURE.md`) já resolveu as escolhas de stack e mapeou os riscos; o que faltava para planejar esta fase especificamente eram os comandos exatos, os nomes de campo corretos e o estado real desta máquina — todos verificados nesta sessão.

Três achados mudam o plano em relação ao que a pesquisa de milestone deixou implícito. Primeiro, **CocoaPods não está instalado nesta máquina** (`pod --version` falha com "command not found", nenhum gem/keg do Homebrew presente) — isso bloqueia `expo prebuild`/`pod install` e precisa ser resolvido como primeiro passo executável da fase, antes de qualquer tentativa de build. Segundo, o **tag `latest` do npm para os pacotes do ecossistema Expo já aponta para SDK 57** (verificado ao vivo: `npm view expo version` → `57.0.13`, `expo-notifications` → `57.0.11`), muito à frente do SDK 54 deste projeto (`expo@^54.0.36`) — qualquer `npm install <pacote>` sem `npx expo install` ou sem fixar a versão do `sdk-54` em `bundledNativeModules.json` quebra silenciosamente a compatibilidade; os pins do `STACK.md` (`expo-build-properties@~1.0.10`) foram reconfirmados ao vivo contra esse arquivo e continuam corretos. Terceiro, o comando de scaffolding do `@bacons/apple-targets` é `npx create-target` (sem argumento de tipo) e o tipo de target correto para Live Activity é `"widget"` — não existe um tipo `"live-activity"` separado no plugin (ActivityKit é hospedado dentro da mesma extensão WidgetKit).

O escopo real desta fase, confirmado contra NAT-02 literalmente, é mais estreito do que o "Phase 2: Walking-Skeleton Live Activity" da pesquisa de milestone sugere: aqui basta que o target de widget e o módulo Swift **existam e sobrevivam** a `expo prebuild --clean` — conteúdo real de ActivityKit (SwiftUI, `Text(timerInterval:)`, botões) é da Fase 15 (LOCK). A única lógica Swift genuinamente necessária nesta fase é a leitura do `embedded.mobileprovision` para o banner D-03 — tudo o mais no target/módulo pode ser o scaffold-padrão gerado por `npx create-target`.

**Primary recommendation:** Resolver o gap de CocoaPods primeiro (bloqueador de ambiente, sem workaround), depois seguir a ordem: instalar `@bacons/apple-targets@^5.0.0` + `expo-build-properties` (versões `sdk-54` pinadas, nunca `@latest`) → congelar bundle identifiers (D-06) em `app.json` → `npx create-target` para o target `widget` vazio (`targets/session-widget/`) → `npx create-expo-module --local` para o módulo (`modules/native-info/` ou `modules/live-activity/` com apenas a função de leitura de provisioning profile) → primeiro `expo prebuild -p ios` + assinatura manual via Xcode (uma vez, GUI) → Sessão 1 física (spike de App Groups + Developer Mode) → script de reassinatura versionado → Sessão 2 física (UAT).

## Architectural Responsibility Map

Esta fase é 100% infraestrutura de cliente nativo — nenhuma capacidade toca o backend Flask, o Supabase ou o PWA Vercel (confirmado em CONTEXT.md "Integration Points": "O PWA de produção... e o backend... não são tocados nesta fase"). Por isso toda a tabela mapeia para o mesmo tier; a tabela existe para deixar essa ausência de cross-tier explícita para o planner, não para distinguir tiers entre si.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Build + assinatura do binário iOS (`expo prebuild` + `xcodebuild`) | Client (processo de build local no Mac, produz o binário do Client) | — | Não há servidor envolvido; certificados/perfis são geridos pela conta Apple ID do dono, não por infraestrutura do projeto |
| Instalação via cabo (`xcrun devicectl`) | Client | — | Transporte do binário assinado para o dispositivo físico; não fala com nenhum backend do projeto |
| Target de extensão de widget (scaffold vazio) | Client (processo separado, mesma app iOS) | — | WidgetKit extension roda no dispositivo, sandboxed, sem rede |
| Módulo Expo Swift local (leitura de `embedded.mobileprovision`) | Client | — | Lê um arquivo do próprio bundle do app; nenhuma chamada de rede |
| Banner de validade (D-03) | Client (UI React Native) | — | Renderiza dado já lido localmente pelo módulo nativo |
| Spike de App Groups | Client (dois processos do mesmo device: app + extension) | — | `UserDefaults(suiteName:)` compartilhado é armazenamento local do dispositivo, não é a camada Database/Storage do projeto (Supabase) |
| Script de reassinatura semanal | Client (tooling de build) | — | Roda na máquina de desenvolvimento, não em CI nem em produção |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@bacons/apple-targets` | `^5.0.0` [VERIFIED: npm registry — `npm view @bacons/apple-targets version` → `5.0.0`, publicado 2026-07-17] | Config plugin que gera o target de extensão (widget/ActivityKit) fora de `ios/`, sobrevivendo a `expo prebuild --clean` | Único mecanismo do ecossistema que satisfaz literalmente NAT-02; peer dep `expo>=52` [VERIFIED: npm registry `peerDependencies`] cobre o SDK 54 do projeto; requisitos mínimos "CocoaPods 1.16.2, Xcode 16, Expo SDK +53" citados verbatim do README oficial [CITED: raw.githubusercontent.com/EvanBacon/expo-apple-targets/main/packages/apple-targets/README.md] |
| Módulo Expo local (Swift), via `npx create-expo-module --local` | N/A — scaffold in-repo, não é um pacote npm publicado | Bridge JS↔Swift para (a) ler o `embedded.mobileprovision` (D-03) e (b) hospedar, nas fases seguintes, as chamadas ActivityKit | Módulos locais em `modules/` são descobertos pelo Expo Autolinking pelo caminho do projeto (`nativeModulesDir`, default `"./modules"`) [CITED: docs.expo.dev/modules/autolinking], e por estarem fora de `ios/` sobrevivem ao `prebuild --clean` do mesmo jeito que `targets/` |
| `expo-build-properties` | `~1.0.10` [VERIFIED: `raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json`, buscado ao vivo nesta sessão — confirma exatamente o pin já usado em `STACK.md`] | Fixa o deployment target iOS do target de widget (16.1+ para Dynamic Island) independente do floor do app principal | Único caminho documentado para configurar build settings por-target sem editar `ios/*.xcodeproj` à mão |

**Fora do escopo desta fase (não instalar ainda):** `expo-notifications`, `expo-speech`, `expo-audio` — pertencem às Fases 15+ (Live Activity, áudio em background). Instalá-los agora não quebra nada, mas expande escopo sem necessidade (YAGNI) — o planner não deve incluí-los nas tasks desta fase.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Xcode 26.6 (já instalado e licenciado) [VERIFIED: `xcodebuild -version` executado nesta sessão → "Xcode 26.6 Build version 17F113"; licença já aceita — `defaults read /Library/Preferences/com.apple.dt.Xcode IDEXcodeVersionForAgreedToGMLicense` → `26.6`, executado nesta sessão] | Compila e assina o target da app + o target do widget | Pitfall 11 (licença não aceita) já não se aplica nesta máquina — verificado, não assumido |
| CocoaPods | **NÃO instalado** [VERIFIED: `pod --version` → "command not found"; `gem list cocoapods` vazio; `brew list cocoapods` → "No such keg"; verificado nesta sessão] | `pod install` roda dentro de `expo prebuild -p ios` | Bloqueador de ambiente — ver `## Environment Availability` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@bacons/apple-targets` | `@kingstinct/expo-apple-targets` (fork da comunidade) ou `@niondigital/widgets-expo-config-plugin` | Só se precisar de dependência SPM dentro do target de widget — não é o caso aqui (target vazio nesta fase) |
| `npx create-expo-module --local` (módulo hand-rolled) | `@kingstinct/react-native-activity-kit` (Nitro Modules) | Não documenta o caminho App-Group-free / `LiveActivityIntent`; e nesta fase nem chega a precisar de lógica ActivityKit — só leitura de provisioning profile |
| Instalar CocoaPods via `gem install cocoapods` | Instalar via Homebrew (`brew install cocoapods`) | Ambas funcionam; Homebrew evita conflito com o Ruby do sistema (macOS moderno restringe `gem install` fora de sandbox sem `sudo`) — preferir Homebrew nesta máquina |

**Installation:**
```bash
# Resolver o bloqueador de ambiente primeiro (ver Environment Availability)
brew install cocoapods

# Pacotes desta fase — SEMPRE via `npx expo install`, nunca `npm install <pkg>@latest`
# (o dist-tag "latest" do npm já aponta para SDK 57, muito à frente do SDK 54 deste projeto)
npx expo install expo-build-properties
npm install @bacons/apple-targets@^5.0.0

# Scaffold do target (gera targets/session-widget/ + registra o plugin)
npx create-target

# Scaffold do módulo Swift local
npx create-expo-module --local
```

**Version verification:** `npx expo install <pkg>` resolve automaticamente a versão pinada para o SDK 54 lendo `bundledNativeModules.json` do próprio pacote `expo` instalado — é o único comando seguro para pacotes do ecossistema Expo neste repo. `npm view <pkg> version` retorna o dist-tag `latest`, que nesta sessão apontava para SDK 57 em todos os pacotes testados (`expo`, `expo-notifications`, `expo-speech`, `expo-audio`, `expo-build-properties`) — **não usar para decidir a versão a instalar**, só para confirmar que o pacote existe no registro.

## Package Legitimacy Audit

| Package | Registry | Age (publish mais recente) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@bacons/apple-targets` | npm | 2026-07-17 [VERIFIED: `npm view` nesta sessão] | 371.350/semana | `github.com/evanbacon/expo-apple-targets` | SUS (`too-new`) | Aprovado com nota — o verdict "too-new" do gate é heurística sobre a data do *último publish*, não sobre idade real do pacote; 371k downloads/semana e repositório oficial do próprio Evan Bacon (autor do Expo Router) são sinais fortes de legitimidade. Ainda assim, seguindo o protocolo: **planner deve inserir `checkpoint:human-verify` antes do `npm install`** para o dono confirmar visualmente o pacote no npm antes de instalar. |
| `expo-build-properties` | npm | 2026-08-14 [VERIFIED: `npm view` nesta sessão] | 2.956.904/semana | `github.com/expo/expo` | SUS (`too-new`) | Mesmo caso — pacote first-party do monorepo `expo/expo`, republicado a cada corte de SDK (é por isso que a data de publish é recente). **checkpoint:human-verify** recomendado apenas por rigor do protocolo; risco real é baixo. |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@bacons/apple-targets`, `expo-build-properties` — ambos com explicação de falso-positivo acima; planner deve inserir `checkpoint:human-verify` antes de cada `npm install`/`npx expo install` mesmo assim, por aderência ao protocolo.

*Nomes de pacote descobertos nesta sessão vieram da pesquisa de milestone (`STACK.md`, já com fontes citadas) e foram reconfirmados ao vivo via `npm view` + `bundledNativeModules.json` do SDK 54 — tratados como `[VERIFIED]` quanto a existência/versão, mas o *verdict* SUS do gate de legitimidade ainda se aplica pelo protocolo.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  MÁQUINA DE DESENVOLVIMENTO (este Mac, Xcode 26.6)                      │
│                                                                           │
│  app.json (D-06: bundle ids congelados aqui)                            │
│    │                                                                     │
│    ▼                                                                     │
│  npx expo prebuild -p ios --clean                                       │
│    │  lê targets/session-widget/expo-target.config.js (@bacons plugin)  │
│    │  lê modules/<nome>/ (Expo Autolinking, nativeModulesDir="./modules")│
│    │  roda `pod install` (requer CocoaPods — GAP nesta máquina)         │
│    ▼                                                                     │
│  ios/  (gerado, nunca commitado, descartável a cada --clean)            │
│    ├── <App>.xcodeproj  (target principal + target "session-widget")    │
│    └── Podfile.lock                                                     │
│    │                                                                     │
│    ▼                                                                     │
│  xcodebuild ... -allowProvisioningUpdates DEVELOPMENT_TEAM=<id>         │
│    CODE_SIGN_STYLE=Automatic   (assina AMBOS os targets: app + widget)  │
│    │                                                                     │
│    ▼                                                                     │
│  xcrun devicectl device install app --device <udid> <path>.app          │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ cabo USB, Developer Mode ativo no iPhone
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  IPHONE DO DONO (iOS 26.x)                                              │
│                                                                           │
│  App principal (processo React Native/Hermes)                           │
│    ├── módulo Swift local: lê embedded.mobileprovision no bundle        │
│    │     → expõe expiryDate para JS → banner D-03 ("Reassine até sexta")│
│    └── (Sessão 1) spike: escreve/lê UserDefaults(suiteName: group.*)    │
│                                                                           │
│  Extensão de widget "session-widget" (processo separado, scaffold vazio)│
│    └── (Sessão 1) spike: escreve/lê o MESMO App Group, nos dois sentidos│
└─────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
app.json                          # MODIFICADO — ios.bundleIdentifier + ios.appleTeamId (D-06)
                                   # plugins: adiciona "@bacons/apple-targets", "expo-build-properties"
targets/
└── session-widget/                # NOVO — scaffold gerado por `npx create-target` (type: "widget")
    ├── expo-target.config.js      #   deploymentTarget, bundleIdentifier: ".session-widget"
    └── (arquivos Swift default do scaffold — sem ActivityKit ainda, isso é Fase 15)
modules/
└── native-info/                   # NOVO — módulo local, scaffold via `npx create-expo-module --local`
    ├── expo-module.config.json
    ├── index.ts                   # getProvisioningProfileExpiry(): Promise<string | null>
    └── ios/
        └── NativeInfoModule.swift # lê embedded.mobileprovision, extrai ExpirationDate
scripts/
├── resign.sh                      # NOVO — comando único do D-01 (npm run resign)
└── verify-native-skeleton.sh      # NOVO — checagem automatizável de NAT-02 (sem device)
src/
└── components/
    └── ProvisioningBanner.tsx     # NOVO — banner D-03 (lê do módulo, decide "≤2 dias")
.planning/phases/14-funda-o-nativa/
└── 14-SPIKE-APP-GROUPS.md         # NOVO — registro escrito do spike (Claude's Discretion)
```

### Structure Rationale

- **`targets/` na raiz, fora de `ios/`:** confirmado pela linha exata do README oficial — "Any changes you make outside of the `expo:targets` directory in Xcode are subject to being overwritten by the next `npx expo prebuild --clean`" [CITED: raw README]. Único jeito de satisfazer NAT-02 literalmente.
- **`modules/native-info/` como módulo dedicado, não dentro de `modules/live-activity/`:** nesta fase a única responsabilidade Swift real é ler o provisioning profile — nomear o módulo pelo que ele faz agora evita que a Fase 15 precise decidir se renomeia ou expande um módulo já carregado de significado errado. Se o planner preferir já criar `modules/live-activity/` e colocar a função de expiry ali como primeira função, também é válido — decisão de escopo do plano, não da pesquisa.
- **`scripts/verify-native-skeleton.sh` como arquivo próprio:** é o único jeito de tornar NAT-02 parcialmente verificável sem o aparelho físico (rodar `--clean` e inspecionar o `.xcodeproj`/Podfile gerado) — ver `## Validation Architecture`.

### Pattern 1: Congelar identificadores antes de qualquer scaffold (D-06)

**What:** Definir `ios.bundleIdentifier` e `ios.appleTeamId` em `app.json` (main app) e o `bundleIdentifier` do target de widget em `expo-target.config.js` (convenção `".session-widget"`, que o plugin concatena automaticamente ao bundle id do app — "If the specified bundle identifier is prefixed with a dot (.), the bundle identifier will be appended to the main app's bundle identifier" [CITED: raw README]) **antes** do primeiro `npx create-target`/`expo prebuild`.
**When to use:** Primeiro passo executável da fase, depois de resolver o gap de CocoaPods.
**Example:**
```json
// app.json — trecho a adicionar (valores exatos são decisão do dono/planner, não fato de pesquisa)
{
  "expo": {
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.pmarconato.forcaapp",
      "appleTeamId": "XXXXXXXXXX"
    },
    "plugins": [
      "expo-asset",
      "expo-font",
      "@bacons/apple-targets",
      ["expo-build-properties", { "ios": { "deploymentTarget": "17.0" } }]
    ]
  }
}
```
[CITED: raw.githubusercontent.com/EvanBacon/expo-apple-targets/main/packages/apple-targets/README.md — "If you already know your Apple Team ID, then set it under the `ios.appleTeamId` property in your `app.json`."] O android bundle existente (`com.pmarconato.forcaapp`) [VERIFIED: app.json:24, lido nesta sessão — `"android": { "package": "com.pmarconato.forcaapp", ...`] é um candidato natural para espelhar no iOS, mas a escolha final é do dono (decisão D-06, não fato verificável).

### Pattern 2: `app.json` estático é suficiente para esta fase — não migrar para `app.config.ts` ainda

**What:** A pesquisa de arquitetura do milestone (`ARCHITECTURE.md`) recomenda `app.config.ts` "porque plugins precisam de lógica JS", mas isso é uma necessidade das fases 15+ (App Group condicional ao resultado do spike, lógica de ambiente). Para esta fase, tanto `"plugins": ["@bacons/apple-targets"]` quanto `ios.appleTeamId` são expressáveis em JSON estático — nenhuma lógica condicional é necessária ainda.
**When to use:** Manter `app.json` como está nesta fase (YAGNI); revisitar a migração para `app.config.ts` só quando a Fase 16/17 precisar de config condicional real (ex.: incluir/excluir a entitlement de App Group dependendo do resultado do spike).
**Trade-off:** Adiar a migração significa que a Fase 15 ou 16 pode precisar fazê-la — mas isso é responsabilidade daquela fase, não desta.

### Pattern 3: Leitura do provisioning profile embarcado (D-03)

**What:** `embedded.mobileprovision` é um arquivo binário com um plist XML embutido; não existe parser oficial da Apple para isso — todo caminho encontrado na pesquisa usa `Bundle.main.path(forResource:ofType:)` + leitura como string Latin-1 + `Scanner` para isolar o bloco `<plist>...</plist>` + `PropertyListDecoder` para decodificar `ExpirationDate` como `Date` nativa.
**When to use:** Dentro do módulo Swift local, exposto como uma função assíncrona para JS.
**Example:**
```swift
// modules/native-info/ios/NativeInfoModule.swift
// Fonte do padrão: process-one.net/blog/reading-ios-provisioning-profile-in-swift/ [CITED]
struct MobileProvision: Decodable {
    let expirationDate: Date

    enum CodingKeys: String, CodingKey {
        case expirationDate = "ExpirationDate"
    }
}

func readProvisioningProfileExpiry() -> Date? {
    guard let path = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
          let profileString = try? NSString(contentsOfFile: path, encoding: String.Encoding.isoLatin1.rawValue)
    else { return nil }

    let scanner = Scanner(string: profileString as String)
    guard scanner.scanUpToString("<plist") != nil else { return nil }
    guard let plistString = scanner.scanUpToString("</plist>") else { return nil }
    let fullPlist = plistString + "</plist>"
    guard let plistData = fullPlist.data(using: .utf8) else { return nil }

    let decoder = PropertyListDecoder()
    return try? decoder.decode(MobileProvision.self, from: plistData).expirationDate
}
```
**Trade-off:** Não funciona no Simulator (o profile só existe em build de device) — irrelevante aqui porque D-02 já fixa instalação por cabo em device físico. A API `NSString(contentsOfFile:encoding:)` é de estilo Objective-C mas continua válida em Swift; alternativa mais "Swifty" seria `Data(contentsOf:)` + decodificação manual do range binário — qualquer uma resolve, escolha é do executor.

### Anti-Patterns to Avoid

- **Editar `ios/*.xcodeproj` à mão para adicionar o target:** funciona uma vez, é apagado no próximo `--clean` (Pitfall 1). Sempre passar por `targets/session-widget/expo-target.config.js`.
- **`npm install <pacote-expo>@latest`:** o dist-tag `latest` do npm para pacotes Expo aponta para SDK 57 nesta sessão — muito à frente do SDK 54 do projeto. Sempre `npx expo install <pacote>`.
- **Declarar `com.apple.security.application-groups` no `expo-target.config.js` antes do spike aprovar:** gera entitlement em ambos os targets antes de saber se o time gratuito realmente concede a capability — se o spike falhar, o rollback envolve reverter entitlements e potencialmente re-registrar App IDs (queima quota, Pitfall 5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gerar/manter target Xcode de extensão | Editar `ios/*.xcodeproj` manualmente ou via script custom de manipulação de `.pbxproj` | `@bacons/apple-targets` (`npx create-target`) | É o único mecanismo que sobrevive a `expo prebuild --clean` de forma declarativa; escrever um manipulador de `.pbxproj` próprio é reinventar um parser de formato binário/plist frágil |
| Assinatura automática do build | Script custom de geração de certificado/profile via API da Apple | `xcodebuild -allowProvisioningUpdates` + `CODE_SIGN_STYLE=Automatic` (Xcode já resolve isso, ver Pattern acima) | A API de provisioning da Apple é versionada e muda; `-allowProvisioningUpdates` é o mecanismo oficial suportado |
| Parsing de plist do provisioning profile | Regex manual sobre o binário inteiro | `Scanner` para isolar `<plist>...</plist>` + `PropertyListDecoder` (padrão citado em Pattern 3) | O arquivo é binário fora do bloco plist; regex sobre bytes arbitrários é frágil e quebra em profiles com conteúdo binário diferente |

**Key insight:** Todo o "hand-rolling" que a Fase 14 evita já foi mapeado pela pesquisa de milestone (`PITFALLS.md` Pitfall 1) — o achado novo desta pesquisa de fase é que mesmo a peça mais "caseira" da fase (ler o provisioning profile) tem um padrão publicado e verificável, não precisa de invenção.

## Common Pitfalls

### Pitfall 1 (herdado de PITFALLS.md): `expo prebuild --clean` apaga target editado à mão
**What goes wrong:** Ver PITFALLS.md item 1 — resumo: adicionar o target pelo Xcode GUI funciona uma vez, desaparece no próximo `--clean` sem erro visível.
**How to avoid:** `@bacons/apple-targets` desde o primeiro target criado; nunca editar `ios/*.xcodeproj` para nada que precise sobreviver.
**Phase to address:** Esta fase — é o requisito literal de NAT-02.

### Pitfall 2 (novo, verificado nesta sessão): CocoaPods ausente bloqueia o primeiro `expo prebuild -p ios`
**What goes wrong:** `pod --version` retorna "command not found" nesta máquina; nenhum `Gemfile` no repo, nenhum gem `cocoapods` instalado, nenhum keg do Homebrew. `expo prebuild -p ios` roda `pod install` como parte do processo — sem CocoaPods instalado, o comando falha (não é um erro do projeto, é um gap do ambiente).
**Why it happens:** Xcode 26.6 foi instalado/licenciado recentemente nesta máquina (per STATE.md); CocoaPods é uma ferramenta separada (Ruby gem), não vem com o Xcode.
**How to avoid:** `brew install cocoapods` (preferível a `gem install cocoapods` em macOS moderno, que restringe gems de sistema) como primeiro passo executável antes de qualquer `expo prebuild -p ios`.
**Warning signs:** `expo prebuild -p ios` falha com erro mencionando `pod install` ou "command not found: pod".
**Phase to address:** Esta fase, literalmente o primeiro passo — sem isso nenhum build local existe.

### Pitfall 3 (novo, verificado nesta sessão): dist-tag `latest` do npm para pacotes Expo já é SDK 57
**What goes wrong:** `npm view expo version` retorna `57.0.13`; `npm view expo-notifications version` retorna `57.0.11` — 3 major versions à frente do `expo@^54.0.36` já fixado no projeto. Um `npm install expo-build-properties` sem qualificação instalaria a versão de SDK 57, incompatível.
**Why it happens:** O tag `latest` do npm sempre aponta para o release mais recente do pacote, independente do que o projeto usa — pacotes Expo publicam uma nova major a cada corte de SDK, e o ecossistema já avançou 3 SDKs desde que este projeto travou no 54.
**How to avoid:** Sempre `npx expo install <pacote>` (resolve contra o `expo` já instalado no projeto) ou fixar manualmente a versão do `sdk-54` lida de `bundledNativeModules.json` [VERIFIED nesta sessão: `expo-build-properties` → `~1.0.10`, igual ao que `STACK.md` já recomendava].
**Warning signs:** `package.json` mostra uma versão de pacote Expo com major muito maior que os outros pacotes Expo do projeto (ex.: `expo-build-properties: ^57.0.11` ao lado de `expo: ^54.0.36`).
**Phase to address:** Esta fase — os dois pacotes novos (`@bacons/apple-targets`, `expo-build-properties`) são o primeiro ponto onde esse risco aparece no v1.3.

### Pitfall 4 (herdado de PITFALLS.md item 3): App Groups em time gratuito é UNKNOWN — spike antes de decidir arquitetura
Ver PITFALLS.md item 3 na íntegra — resolvido apenas pelo spike no aparelho (Sessão 1, D-09). Esta pesquisa não resolve o fato, apenas confirma que o protocolo do spike (criar target, adicionar App Groups aos dois targets, build+run no device, round-trip via `UserDefaults(suiteName:)` nos dois sentidos) está corretamente descrito e é o único jeito de saber.

### Pitfall 5 (herdado de PITFALLS.md item 4): `aps-environment` vazando quebra a assinatura inteira em time gratuito
Ver PITFALLS.md item 4. Verificação recomendada nesta fase: depois do primeiro `expo prebuild`, inspecionar os `.entitlements` gerados (`ios/*/*.entitlements`) e confirmar ausência da chave `aps-environment` — isso é automatizável via `grep` (ver `## Validation Architecture`).

### Pitfall 6 (herdado de PITFALLS.md item 5): quota de ~10 App IDs/semana
Ver PITFALLS.md item 5. Reforça D-06 (congelar identificadores na primeira escolha) — cada rename durante experimentação queima quota.

### Pitfall 7 (novo, específico do comando de scaffold): `npx create-target widget` não é o comando real
**What goes wrong:** A pesquisa de milestone (`STACK.md`) documenta o comando como `npx create-target widget`, mas o README oficial mostra apenas `npx create-target` (sem argumento de subtipo) — o comando é interativo e pergunta o tipo. Também não existe um tipo `"live-activity"` na lista de tipos suportados pelo plugin; o tipo correto para hospedar ActivityKit é `"widget"` (Live Activities são declaradas como parte de um `WidgetBundle`, na mesma extensão de widget).
**How to avoid:** Rodar `npx create-target` interativamente e escolher `widget` quando perguntado; não copiar o comando com argumento de `STACK.md` sem verificar.
**Phase to address:** Esta fase, no passo de scaffold do target.

## Code Examples

### Script de reassinatura semanal (D-01, esqueleto)

```bash
#!/usr/bin/env bash
# scripts/resign.sh — comando único: npm run resign
set -euo pipefail

DEVICE_UDID="${1:-}"   # opcional; se vazio, xcodebuild/devicectl usam o único device conectado
SCHEME="ForcaApp"       # confirmar o nome exato do scheme gerado pelo prebuild antes de travar aqui

echo "1/4 — prebuild (regenera ios/ a partir de targets/ + modules/ + app.json)"
npx expo prebuild -p ios --clean

echo "2/4 — build assinado (time pessoal, assinatura automática)"
xcodebuild -workspace "ios/${SCHEME}.xcworkspace" -scheme "$SCHEME" \
  -configuration Debug -destination "generic/platform=iOS" \
  -allowProvisioningUpdates build

echo "3/4 — localizar o .app gerado"
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData -name "${SCHEME}.app" -path "*Debug-iphoneos*" -print -quit)

echo "4/4 — instalar no device via cabo (D-02)"
xcrun devicectl device install app --device "${DEVICE_UDID:-<preencher-ou-omitir-para-auto>}" "$APP_PATH"
```
[ASSUMED — esqueleto de script, não copiado de uma fonte única; combina os comandos individualmente verificados nesta sessão (`xcodebuild -allowProvisioningUpdates`, `xcrun devicectl device install app`) e no README do `@bacons/apple-targets`. O executor deve validar `SCHEME` exato e o `DerivedData` path reais na primeira execução manual antes de travar o script.]

### Instalação via cabo (D-02)

```bash
# Descobrir o UDID do device conectado (pareamento via Xcode > Window > Devices and Simulators
# precisa ter sido feito uma vez antes)
xcrun devicectl list devices

# Instalar
xcrun devicectl device install app --device <UDID> <path-to-App>.app
```
[VERIFIED: sintaxe confirmada via WebSearch cruzada — "xcrun devicectl device install app --device <udid> <path_to_app_or_ipa>" — fonte MEDIUM confidence (blog + gist técnico, não documentação oficial da Apple, que não publica syntax reference detalhado para devicectl); pareamento único por combinação device/Mac via Xcode GUI é o pré-requisito citado em múltiplas fontes cruzadas.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ios-deploy` (ferramenta de terceiros para instalar `.app` via cabo) | `xcrun devicectl` (ferramenta oficial da Apple, Xcode 15+) | Desde CoreDevice/Xcode 15 | `ios-deploy` ainda funciona em alguns fluxos, mas `devicectl` é o caminho suportado oficialmente para iOS 17+; `react-native-community/cli` tem issue aberta para migrar |
| App Group + `UserDefaults` compartilhado como único canal de comunicação widget↔app | `LiveActivityIntent.perform()` roda no processo do app principal (não precisa de App Group para o caminho rápido) | Documentado desde iOS 17 (App Intents framework) | Muda a arquitetura recomendada — App Group vira canal *durável* (cold-launch), não o único canal; isso só afeta Fases 15-17, não esta |

**Deprecated/outdated:**
- `expo-live-activity` (Software Mansion): arquivado, redireciona para `expo-widgets` (que por sua vez exige SDK 55+ e App Group obrigatório) — já descartado por `STACK.md`, reconfirmado aqui sem achado novo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Valor exato do `ios.bundleIdentifier` (`com.pmarconato.forcaapp`, espelhando o Android) e do `appleTeamId` | Pattern 1 | Baixo se decidido antes do primeiro `create-target` (D-06 exige decisão explícita do dono/planner, não da pesquisa); alto custo de mudar depois (quota de App IDs) |
| A2 | Nome do módulo local (`modules/native-info/` vs reaproveitar `modules/live-activity/` desde já) | Recommended Project Structure | Baixo — é só uma decisão de nomenclatura de pasta, reversível sem custo de quota Apple |
| A3 | Esqueleto do `scripts/resign.sh` (nome do scheme, path do DerivedData) | Code Examples | Médio — se o nome do scheme gerado pelo prebuild for diferente do assumido, o script falha na primeira execução; validar manualmente antes de travar como "comando único" do D-01 |
| A4 | Sintaxe exata de `xcrun devicectl device install app` | Code Examples | Baixo — cross-checada em múltiplas fontes secundárias (blog + gist técnico), mas nenhuma é a documentação oficial da Apple (que não publica um syntax reference completo para `devicectl`); validar no primeiro uso real (Sessão 1) |

## Open Questions

1. **O comando `npm run resign` deve incluir o `pod install`/CocoaPods explicitamente, ou confiar que `expo prebuild -p ios` já dispara isso?**
   - What we know: `expo prebuild -p ios` roda `pod install` internamente como parte do processo.
   - What's unclear: se CocoaPods precisa estar disponível no `PATH` no momento da execução do script, ou se há algum wrapper (`npx pod-install`) mais robusto a falhas de rede/cache.
   - Recommendation: resolver o gap de ambiente (instalar CocoaPods) antes de escrever o script; testar o `prebuild` isolado primeiro, só depois compor o script completo.

2. **Nome exato do scheme gerado pelo prebuild (`ForcaApp` vs `forca-app` vs algo derivado do `slug`)?**
   - What we know: `app.json` tem `"name": "ForcaApp"` e `"slug": "forca-app"` [VERIFIED: app.json:3-4, lido nesta sessão].
   - What's unclear: qual dos dois vira o nome do scheme Xcode gerado — normalmente é o `name`, mas não foi confirmado rodando o prebuild real nesta sessão (CocoaPods ausente impediu um prebuild completo de teste).
   - Recommendation: primeira execução do `expo prebuild -p ios` (depois de resolver CocoaPods) deve confirmar isso antes do script de reassinatura ser travado como "comando único".

3. **App Groups disponível em time pessoal gratuito?** — não é uma pergunta de pesquisa, é o próprio spike (D-09, Sessão 1). Resolvido apenas por evidência do aparelho físico, conforme já estabelecido pela pesquisa de milestone.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | Compilar/assinar ambos os targets | ✓ | 26.6 (licença já aceita) | — |
| CocoaPods | `pod install` dentro de `expo prebuild -p ios` | ✗ | — | `brew install cocoapods` — sem isso, nenhum build local é possível; **bloqueador sem fallback alternativo** |
| Node/npm/npx | Todo o tooling Expo | ✓ | Node v24.17.0, npx 11.13.0 | — |
| Homebrew | Instalar CocoaPods | ✓ | 6.0.17 | — |
| iPhone físico do dono, pareado, Developer Mode ativo | Instalação via cabo (D-02), spike de App Groups, todo UAT | Não verificável desta máquina | — | Nenhum — é literalmente o critério de sucesso da fase (UAT do dono); roteiros das Sessões 1 e 2 (D-09/D-10) existem exatamente para isolar esse dependência |
| Apple ID pessoal configurado no Xcode (Accounts) | Assinatura automática (`-allowProvisioningUpdates`) | Não verificável desta sessão (requer GUI interativa do Xcode) | — | Passo manual único documentado no runbook da Sessão 1 (per `expo/fyi/setup-xcode-signing.md`) |

**Missing dependencies with no fallback:**
- CocoaPods — instalar antes de qualquer outro passo desta fase (`brew install cocoapods`).

**Missing dependencies with fallback:**
- Nenhuma outra — os itens "não verificáveis desta sessão" (iPhone físico, conta Apple ID no Xcode) não são bugs de ambiente, são pré-requisitos que só o dono pode confirmar/configurar fisicamente, já contemplados pelo desenho de Sessão 1/Sessão 2 (D-09/D-10).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (`jest-expo` preset) para JS/TS [VERIFIED: `.planning/codebase/STACK.md` — lido nesta sessão]; **nenhum framework de teste nativo iOS (XCTest) existe no projeto** — não é necessário criar um nesta fase, já que não há lógica Swift complexa o bastante para justificar |
| Config file | `jest.config.js` (existente, não lido nesta sessão — presumido pela referência em `.planning/codebase/STACK.md`) |
| Quick run command | `npx tsc --noEmit && npx jest --runInBand --silent` (checks JS/TS existentes, não cobrem NAT-01/02 diretamente) |
| Full suite command | mesmo comando — não há suíte nativa separada |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAT-02 (sobrevivência ao `--clean`) | Target `session-widget` + módulo `modules/*` continuam presentes/linkados depois de `expo prebuild --clean` | smoke (shell) | `bash scripts/verify-native-skeleton.sh` | ❌ Wave 0 |
| NAT-01 / Pitfall 5 (hygiene de entitlements) | `.entitlements` gerados não contêm `aps-environment` | smoke (shell) | `grep -L aps-environment ios/*/*.entitlements` (parte do mesmo script acima) | ❌ Wave 0 |
| D-03 (banner de validade — lógica pura de "≤2 dias") | Dada uma data de expiração e "agora", decide mostrar/ocultar o banner e o texto | unit | `npx jest src/components/__tests__/ProvisioningBanner.test.tsx` | ❌ Wave 0 |
| NAT-01 (instala e roda no iPhone, assinado, fora do Expo Go) | Fluxo completo de instalação + abertura do app | manual-only | — | UAT do dono, Sessão 2 (D-09/D-10) — não automatizável, requer aparelho físico e conta Apple ID pessoal |
| NAT-01 (rotina de reassinatura roda e o app volta a abrir) | `npm run resign` executado uma semana depois, sem erro de confiança | manual-only | — | UAT do dono — depende de tempo real decorrido (7 dias) e do aparelho |
| NAT-02 (spike de App Groups registrado por escrito) | Round-trip de valor via `UserDefaults(suiteName:)` nos dois sentidos, no aparelho | manual-only | — | UAT do dono, Sessão 1 — comportamento de entitlement do time gratuito não é testável fora do device real |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (mínimo, já existente) + `bash scripts/verify-native-skeleton.sh` sempre que `targets/`, `modules/` ou `app.json` mudarem
- **Per wave merge:** suíte Jest completa + `verify-native-skeleton.sh`
- **Phase gate:** `verify-native-skeleton.sh` verde + Sessão 1 e Sessão 2 reportadas PASS pelo dono antes de fechar a fase — nunca "compilou" como critério (D-10)

### Wave 0 Gaps
- [ ] `scripts/verify-native-skeleton.sh` — não existe; deve rodar `expo prebuild --clean -p ios --non-interactive`, depois `grep` no `.pbxproj` gerado pelo nome do target de widget, `grep -L aps-environment` nos `.entitlements`, e confirmar que o módulo local aparece na saída do autolinking (`npx expo-modules-autolinking search` ou equivalente)
- [ ] `src/components/__tests__/ProvisioningBanner.test.tsx` — não existe; cobre só a lógica pura de decisão do banner (dado `expiryDate`/`now`, decide mostrar e o texto), não a leitura nativa em si (que é manual-only)
- [ ] `.planning/phases/14-funda-o-nativa/14-SPIKE-APP-GROUPS.md` — não existe; é o registro escrito exigido por NAT-02, formato sugerido em CONTEXT.md "Claude's Discretion"

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Não | Fase não adiciona fluxo de autenticação de usuário — assinatura de código é mecanismo de plataforma (Apple), não de aplicação |
| V3 Session Management | Não | Sem sessão de usuário nova nesta fase |
| V4 Access Control | Não | Sem controle de acesso a dado de usuário nesta fase |
| V5 Input Validation | Não | Nenhuma entrada de usuário nova nesta fase (o banner só lê um dado do sistema) |
| V6 Cryptography | Parcial | Assinatura de código (certificados/perfis) é gerida inteiramente pela cadeia de confiança da Apple/Xcode — o projeto não implementa nem armazena criptografia própria; único cuidado é não vazar o certificado/perfil para fora do Keychain do Mac (comportamento padrão do Xcode, não requer ação) |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Entitlement `aps-environment` vazando para o build (Pitfall 5 / PITFALLS.md item 4) | Tampering (assinatura falha silenciosamente ou de forma confusa) | Verificar `.entitlements` gerados depois de cada `prebuild` (parte do `verify-native-skeleton.sh`) |
| Superfície de dados exposta no App Group maior que o necessário (relevante só a partir da Fase 15, mas a decisão de "o que vai no App Group" nasce no spike desta fase) | Information Disclosure | PITFALLS.md "Security Mistakes": manter o payload do App Group ao mínimo necessário — não gravar token de auth nem dado de sessão completo ali; esta fase só grava um valor trivial de teste durante o spike, então não há dado sensível em jogo ainda |

## Sources

### Primary (HIGH confidence)
- npm registry (`registry.npmjs.org`) — `npm view @bacons/apple-targets version/peerDependencies/dist-tags`, `npm view expo dist-tags`, `npm view expo-notifications/expo-speech/expo-audio/expo-build-properties dist-tags` — todos executados ao vivo nesta sessão
- `raw.githubusercontent.com/expo/expo/sdk-54/packages/expo/bundledNativeModules.json` — buscado ao vivo nesta sessão, confirma pins exatos de `expo-notifications`, `expo-speech`, `expo-audio`, `expo-build-properties`, `expo-dev-client`, `expo-av`, `expo-asset`, `expo-font` para SDK 54
- `raw.githubusercontent.com/EvanBacon/expo-apple-targets/main/packages/apple-targets/README.md` — fetched ao vivo nesta sessão (via WebFetch), citações verbatim sobre `ios.appleTeamId`, requisitos mínimos, comportamento do `--clean`, sintaxe de registro do plugin, convenção de bundle identifier, comando `npx create-target`, lista completa de tipos de target
- Este repositório: `app.json` (lido integralmente), `package.json` (dependencies/scripts), `patches/react-native+0.81.5.patch` (confirmado: só afeta `node_modules/react-native/jest/mockComponent.js`, zero impacto no build nativo), `.gitignore` (confirma `ios/`/`android/` como gerados/ignorados)
- Auditoria de ambiente ao vivo nesta sessão: `xcodebuild -version`, `defaults read .../IDEXcodeVersionForAgreedToGMLicense`, `pod --version`, `gem list cocoapods`, `brew list cocoapods`, `node --version`, `npx --version`

### Secondary (MEDIUM confidence)
- [Knowing when your iOS app's provisioning profile is going to expire — Chris Mash, Medium](https://chris-mash.medium.com/knowing-when-your-ios-apps-provisioning-profile-is-going-to-expire-4689d03d0d5)
- [Reading iOS Provisioning Profile in your Swift App — ProcessOne](https://www.process-one.net/blog/reading-ios-provisioning-profile-in-swift/) — fetched via WebFetch, código Swift verbatim
- [An instructions to install PoC apps on-device remotely from paired Mac — GitHub Gist](https://gist.github.com/speedyfriend433/dd0f40e3eb3ab69273f2a7647cbf6e01) — sintaxe de `xcrun devicectl device install app`
- [expo/fyi — setup-xcode-signing.md](https://github.com/expo/fyi/blob/main/setup-xcode-signing.md) — fetched via WebFetch, passo a passo de assinatura manual via Xcode GUI
- [expo/fyi — expo-module-local-autolinking.md / docs.expo.dev/modules/autolinking](https://docs.expo.dev/modules/autolinking/) — confirma `nativeModulesDir` default `"./modules"`
- Pesquisa de milestone já citada: `.planning/research/SUMMARY.md`, `PITFALLS.md`, `STACK.md`, `ARCHITECTURE.md` (2026-08-15) — todas as fontes originais já listadas nesses arquivos, não reproduzidas aqui

### Tertiary (LOW confidence)
- Trechos de WebSearch sem fetch direto da fonte primária (ex.: fórum Apple sobre limites de time pessoal) — já tratados como LOW/MEDIUM na pesquisa de milestone, não reprocessados aqui

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versões confirmadas ao vivo contra `bundledNativeModules.json` (fonte autoritativa) e npm registry nesta sessão
- Architecture: MEDIUM — herda a confiança MEDIUM da pesquisa de milestone para os padrões de Live Activity (fora do escopo desta fase); ALTA para o que é específico desta fase (scaffold do target, comando de scaffold, README oficial citado verbatim)
- Pitfalls: HIGH para os 3 pitfalls novos desta sessão (CocoaPods ausente, dist-tag `latest` desalinhado, comando `create-target` incorreto) — todos verificados por execução direta nesta máquina, não por busca
- Ambiente: HIGH — toda a tabela de Environment Availability vem de comandos executados nesta sessão, não de suposição

**Research date:** 2026-08-16
**Valid until:** 7 dias para os fatos de ambiente (CocoaPods, Xcode, versões de pacote — ecossistema Expo se move rápido, `latest` já mudou 3 SDKs desde a pesquisa de milestone de ontem); 30 dias para os padrões arquiteturais herdados da pesquisa de milestone
