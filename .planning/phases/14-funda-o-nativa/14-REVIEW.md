---
phase: 14-funda-o-nativa
reviewed: 2026-08-19T00:00:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - scripts/resign.sh
  - scripts/verify-native-skeleton.sh
  - app.json
  - targets/session-widget/expo-target.config.js
  - targets/session-widget/widgets.swift
  - targets/session-widget/Info.plist
  - modules/native-info/ios/NativeInfoModule.swift
  - modules/native-info/index.ts
  - modules/native-info/expo-module.config.json
  - modules/native-info/NativeInfoModule.podspec
  - modules/native-info/package.json
  - src/components/ProvisioningBanner.tsx
  - package.json
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-08-19
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

Revisão adversarial da Fase 14 (fundação nativa: NAT-01/NAT-02), nunca antes
revisada. Os 9 planos foram lidos por completo e confrontados com o código
vivo em HEAD (`4f6ef78`), incluindo os pontos de atenção explícita: shell de
`scripts/resign.sh`, entitlements/bundle identifiers em `app.json` e
`targets/session-widget/expo-target.config.js`, segredos versionados e
checagens de `scripts/verify-native-skeleton.sh` que possam "passar sem
exercitar nada".

**Nenhum CRITICAL confirmado.** `scripts/resign.sh` tem `set -euo pipefail`,
todas as variáveis usadas estão entre aspas, não há `rm` de escopo largo, não
há credencial em texto claro (o Team ID `9WD49Z5TV7` em `app.json` não é
segredo — é público em qualquer binário assinado) e os 7 pontos de falha
conhecidos abortam com `ABORTADO:` + comando de correção, nunca com stderr
cru. A entitlement `com.apple.security.application-groups` é idêntica
byte-a-byte em `app.json` e `expo-target.config.js`, e nenhum `.entitlements`
gerado contém `aps-environment` — confirmado tanto por leitura do código
quanto pelas checagens (c)/(k) de `verify-native-skeleton.sh`. Nenhum
artefato de assinatura (`.p12`, `.mobileprovision`, `.pem`) está versionado;
`ios/` está corretamente no `.gitignore`. O código de spike de App Groups
(`modules/app-group-spike/`) foi removido por inteiro conforme prometido em
14-07, sem resíduo.

Encontrei 4 WARNINGs (dois no shell/config exatamente nas áreas de atenção
pedidas — uma checagem de `verify-native-skeleton.sh` que pode passar sem
exercitar nada, e um ícone de widget que depende de rede em build time e
falha em silêncio) e 2 INFOs (um deles é só uma referência cruzada a um gap
já rastreado e resolvido por decisão explícita do dono, incluído por
transparência, não como achado novo).

## Warnings

### WR-01: Checagem (c) de verify-native-skeleton.sh passa em silêncio se nenhum .entitlements existir

**File:** `scripts/verify-native-skeleton.sh:106-114`
**Issue:** A checagem (c) — "nenhum `.entitlements` gerado pode conter
`aps-environment`" — itera com `while IFS= read -r arquivo_entitlements; do
... done < <(find ios -name '*.entitlements')`. Se `find` não retornar
nenhum arquivo (por exemplo, o plugin de entitlements do `@bacons/apple-targets`
parar de gerar `.entitlements` para algum target, ou uma regressão no
prebuild fizer `ios/` ser gerado sem esses arquivos), o corpo do loop nunca
executa — a checagem simplesmente não aborta, dando a impressão de "PASS"
sem ter examinado nenhum arquivo. É exatamente o padrão "grep num arquivo
que não existe devolvendo sucesso por causa de pipe" citado no pedido de
revisão. Confirmei que hoje esse cenário não produz um PASS final falso
porque a checagem (k) — adicionada só na Fase 17, com outro propósito
(sobrevivência do App Group) — exige `total_entitlements >= 2` e por
coincidência cobre esse mesmo buraco. Mas (c), isolada, continua com a
falha lógica original desde a Plano 14-02, e nada garante que uma edição
futura em (k) não reabra o blind spot de (c) sem ninguém perceber.
**Fix:**
```bash
# depois de coletar os arquivos, antes de iterar:
local total_encontrados
total_encontrados="$(find ios -name '*.entitlements' | wc -l | tr -d ' ')"
if [[ "$total_encontrados" -eq 0 ]]; then
  vermelho "ABORTADO: [rodada ${rodada}] nenhum .entitlements encontrado em ios/ — checagem (c) não pode confirmar ausência de aps-environment."
  exit 1
fi
```

### WR-02: Ícone do widget aponta para URL remota (dependência de rede em build + identidade errada)

**File:** `targets/session-widget/expo-target.config.js:7`
**Issue:** `icon: 'https://github.com/expo.png'` é o default do scaffold da
Plano 14-02 e nunca foi substituído pela identidade "Força" (D-04 do
CONTEXT.md — "o nativo assume a identidade Força… ícone/splash já
existentes em `assets/`"). Confirmei em
`node_modules/@bacons/apple-targets/build/icon/with-ios-icon.js` que esse
campo é baixado via `generateImageAsync` a cada `expo prebuild`
(dependência de rede real, não só estética) e que uma falha de fetch é
capturada e apenas logada (`console.warn(...Skipping icon generation...)`),
sem falhar o build — ou seja, o `.appex` do widget pode ser publicado sem
ícone algum sem que `scripts/verify-native-skeleton.sh` ou `xcodebuild`
acusem nada. `assets/icon.png` já existe localmente e nunca foi usado aqui.
**Fix:**
```js
// targets/session-widget/expo-target.config.js
icon: require.resolve('../../assets/icon.png'),
```

### WR-03: Interpolação de expo.name sem escape dentro de node -e em resign.sh

**File:** `scripts/resign.sh:61-72`
**Issue:** `EXPO_NAME` é lido de `app.json` e depois interpolado
diretamente, sem escape, dentro de um segundo script `node -e` como
`const nome = '${EXPO_NAME}';`. Hoje `expo.name` é `"ForcaApp"` (sem aspas
nem caracteres especiais), então não há exploração possível agora — mas se
esse campo algum dia contiver uma aspa simples ou um crase (edição manual
de `app.json`, merge malfeito, ou compromisso da máquina), o valor quebra
para fora do literal de string e é interpretado como código JS arbitrário
dentro do `node -e`. É a classe exata de "variável sem aspas"/injeção
pedida para atenção especial neste review, mesmo que o vetor de entrada
seja um arquivo do próprio repo (baixo risco prático, mas latente).
**Fix:**
```bash
SCHEME="$(xcodebuild -list -workspace ios/*.xcworkspace -json | EXPO_NAME="$EXPO_NAME" node -e "
let d = '';
process.stdin.on('data', (c) => { d += c; });
process.stdin.on('end', () => {
  const schemes = JSON.parse(d).workspace.schemes;
  const nome = process.env.EXPO_NAME;
  if (schemes.includes(nome)) console.log(nome);
});
")"
```

### WR-04: Promise sem .catch() em ProvisioningBanner

**File:** `src/components/ProvisioningBanner.tsx:42-45`
**Issue:** `getProvisioningProfileExpiry().then((iso) => { ... })` não tem
`.catch()`. Se o módulo nativo rejeitar a promise (exceção do lado Swift
propagada pela ponte Expo, ou o binding nativo ausente lançando em vez de
retornar `null`), o resultado é uma unhandled promise rejection em vez de o
banner simplesmente permanecer oculto — o comportamento pretendido
documentado no próprio arquivo ("a ausência resolve como `null`… o banner
simplesmente não aparece, sem erro") só vale para o caminho de sucesso.
**Fix:**
```tsx
getProvisioningProfileExpiry()
  .then((iso) => {
    if (cancelled || !iso) return;
    setExpiryDate(new Date(iso));
  })
  .catch(() => {
    // Falha de leitura nativa: manter o banner oculto, nunca propagar.
  });
```

## Info

### IN-01: D-07 (bundle aponta para produção) não reflete o comportamento real do build usado por resign.sh — já rastreado e deferido pelo dono

**File:** `.env:1-3` (consumido implicitamente por `scripts/resign.sh:48-49`, que não define `ENVFILE`/`NODE_ENV` de produção antes de `expo prebuild`/`xcodebuild`)
**Issue:** `14-CONTEXT.md` D-07 afirma que "o bundle embarcado aponta para
produção automaticamente… sem nenhuma mudança de código". Na prática, não
existe `.env.production` no worktree e `resign.sh` não define `ENVFILE` —
o build Release embarcado herda o `.env` base, que hoje aponta para
`http://192.168.15.77:54321` (Supabase local via LAN), não para produção.
Isso já foi diagnosticado, documentado e formalmente aceito como gap aberto
pelo próprio dono (`14-09-SUMMARY.md`, `14-VERIFICATION.md` —
`override_closeout`, `.planning/todos/pending/backend-supabase-producao-no-aparelho.md`).
Incluo aqui só para registrar a causa raiz exata no código, não como achado
novo: nenhuma ação adicional é pedida por este review.

### IN-02: Checagem (d) de verify-native-skeleton.sh não produz mensagem ABORTADO se o próprio comando de autolinking falhar

**File:** `scripts/verify-native-skeleton.sh:117-124`
**Issue:** `autolinking="$(npx expo-modules-autolinking search --platform ios 2>/dev/null)"` não usa `|| true` nem é protegida por `if`. Se o comando `npx` falhar (ex.: binário ausente, erro de resolução), `set -e` aborta o script imediatamente nessa linha, com o stderr cru do `npx` (suprimido por `2>/dev/null`, então nem isso aparece) — não com a mensagem `ABORTADO: … native-info e/ou live-activity não foram autolinked.` que o restante da checagem produziria. Não é uma falsa aprovação (o script realmente para), só uma mensagem de diagnóstico pior do que o padrão que o resto do arquivo segue.
**Fix:** `autolinking="$(npx expo-modules-autolinking search --platform ios 2>&1)" || { vermelho "ABORTADO: [rodada ${rodada}] expo-modules-autolinking search falhou."; echo "$autolinking" >&2; exit 1; }`

---

_Reviewed: 2026-08-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
