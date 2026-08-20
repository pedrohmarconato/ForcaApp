#!/usr/bin/env bash
# scripts/resign.sh — comando único de reassinatura semanal (D-01, D-02).
#
# Por que existe: o time pessoal gratuito da Apple expira certificados a
# cada 7 dias. Sem um comando único versionado, "reassinar" vira uma
# sequência de comandos para lembrar de cabeça toda semana — e é exatamente
# esse esquecimento que o NAT-01 ("rotina de reassinatura semanal
# documentada e repetível em 1 comando") existe para eliminar. Este script
# é essa rotina: regenera ios/, compila um build assinado e instala no
# iPhone via cabo, abortando com mensagem acionável em cada ponto de falha
# conhecido — nunca morre só com o stderr cru de xcodebuild/devicectl.
#
# Uso:
#   npm run resign              # auto-detecta o único device conectado por cabo
#   npm run resign -- <UDID>    # UDID explícito (útil com múltiplos devices pareados)
#
# Saída 0 = build assinado instalado E scripts/verify-native-skeleton.sh
#           (gate final) passou — só então a reassinatura é considerada OK.
# Saída != 0 = alguma etapa falhou; a mensagem ABORTADO diz qual e como corrigir.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

vermelho() { printf '\033[1;31m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[1;32m%s\033[0m\n' "$*"; }

DEVICE_UDID="${1:-}"
readonly PRODUCTION_SUPABASE_REF="zanqygwsgxkyjiuhrzju"

validar_env_supabase_uat() {
  if ! node <<'NODE'
const expectedRef = process.env.FORCA_EXPECT_SUPABASE_REF;
const expectedUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const productionRef = "zanqygwsgxkyjiuhrzju";
const validRef =
  typeof expectedRef === "string" &&
  /^[a-z0-9]+$/u.test(expectedRef) &&
  expectedRef !== "localhost" &&
  expectedRef !== productionRef;

let validUrl = false;
if (validRef && typeof expectedUrl === "string") {
  const canonicalUrl = `https://${expectedRef}.supabase.co`;
  try {
    const parsed = new URL(expectedUrl);
    validUrl =
      expectedUrl === canonicalUrl &&
      parsed.protocol === "https:" &&
      parsed.hostname === `${expectedRef}.supabase.co` &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.port === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "";
  } catch {
    validUrl = false;
  }
}

process.exit(validUrl ? 0 : 1);
NODE
  then
    vermelho "ABORTADO: EXPO_PUBLIC_SUPABASE_URL nao aponta para o ambiente UAT esperado"
    echo "  Use uma URL HTTPS canonica do ref esperado; localhost e producao sao recusados." >&2
    exit 1
  fi
}

validar_bundle_supabase_uat() {
  if [[ "${FORCA_EXPECT_SUPABASE_REF+x}" != "x" ]]; then
    return 0
  fi

  local bundle_path="${APP_PATH}/main.jsbundle"
  if [[ ! -f "$bundle_path" ]]; then
    vermelho "ABORTADO: main.jsbundle ausente no produto desta execucao"
    echo "  O build Release precisa embutir main.jsbundle antes da instalacao." >&2
    exit 1
  fi

  if ! BUNDLE_PATH="$bundle_path" \
    EXPECTED_REF="$FORCA_EXPECT_SUPABASE_REF" \
    PRODUCTION_REF="$PRODUCTION_SUPABASE_REF" \
    node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import process from "node:process";

const contents = readFileSync(process.env.BUNDLE_PATH, "utf8");
const expectedRef = process.env.EXPECTED_REF;
const expectedHost = `${expectedRef}.supabase.co`;
const productionRef = process.env.PRODUCTION_REF;
const hasExpectedEnvironment =
  contents.includes(expectedRef) && contents.includes(expectedHost);
const hasProductionEnvironment = contents.includes(productionRef);
const hasLocalhostEndpoint =
  contents.includes("localhost") || contents.includes("127.0.0.1");

process.exit(
  hasExpectedEnvironment && !hasProductionEnvironment && !hasLocalhostEndpoint
    ? 0
    : 1,
);
NODE
  then
    vermelho "ABORTADO: main.jsbundle nao corresponde ao ambiente UAT esperado"
    echo "  O bundle precisa conter o ref esperado e nao pode conter producao ou Supabase localhost." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# 1/9 — CocoaPods precisa estar instalado antes de qualquer prebuild.
#       Bloqueador de ambiente sem workaround (mesmo gap resolvido na
#       Plano 14-01/14-02, verificado de novo aqui porque uma máquina
#       nova pode não ter o Homebrew keg instalado).
# ---------------------------------------------------------------------------
echo "1/9 — checando CocoaPods..."
if ! pod --version >/dev/null 2>&1; then
  vermelho "ABORTADO: CocoaPods ausente"
  echo "  Rode: brew install cocoapods" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2/9 — Validar o ambiente Supabase somente no modo UAT.
# ---------------------------------------------------------------------------
# A validacao acontece antes do prebuild para falhar sem criar ou modificar ios/.
echo "2/9 — validando ambiente Supabase..."
if [[ "${FORCA_EXPECT_SUPABASE_REF+x}" == "x" ]]; then
  validar_env_supabase_uat
else
  echo "  UAT Supabase nao solicitado."
fi

# ---------------------------------------------------------------------------
# 3/9 — Regenerar ios/ a partir de targets/ + modules/ + app.json.
# ---------------------------------------------------------------------------
echo "3/9 — expo prebuild --clean..."
npx expo prebuild -p ios --clean --non-interactive

# ---------------------------------------------------------------------------
# 4/9 — Descobrir o scheme Xcode dinamicamente. NUNCA usar schemes[0] do
#       JSON de `xcodebuild -list` — esse array vem em ordem alfabética
#       (EXConstants primeiro, entre ~100 schemes de dependências
#       CocoaPods), não com o app principal na posição 0. Provado na
#       Plano 14-02 (14-02-SUMMARY.md, "Decisions Made"). O padrão
#       estabelecido lá ("patterns-established") é confirmar o scheme
#       contra expo.name — dinâmico (não hardcoda "ForcaApp") e correto.
# ---------------------------------------------------------------------------
echo "4/9 — descobrindo scheme Xcode..."
# WR-03 (14-REVIEW.md / 14-SECURITY.md, 2026-08-19): os valores chegam ao
# `node -e` por VARIAVEL DE AMBIENTE, nao por interpolacao de string. Antes,
# ${REPO_ROOT} e ${EXPO_NAME} eram costurados dentro de strings JS de aspas
# simples — um app.json cujo expo.name contivesse aspa simples quebraria a
# string e executaria JS arbitrario no contexto do build. Limite de confianca
# baixo na pratica (so o dono edita app.json), mas e injecao de comando por
# input nao sanitizado, e o custo de fechar e uma linha.
EXPO_NAME="$(APP_JSON_PATH="${REPO_ROOT}/app.json" node -e "console.log(require(process.env.APP_JSON_PATH).expo.name)")"
SCHEME="$(xcodebuild -list -workspace ios/*.xcworkspace -json | EXPO_NAME="$EXPO_NAME" node -e "
let d = '';
process.stdin.on('data', (c) => { d += c; });
process.stdin.on('end', () => {
  const schemes = JSON.parse(d).workspace.schemes;
  const nome = process.env.EXPO_NAME;
  if (schemes.includes(nome)) {
    console.log(nome);
  }
});
")"
if [[ -z "$SCHEME" ]]; then
  vermelho "ABORTADO: scheme Xcode correspondente a expo.name ('${EXPO_NAME}') nao encontrado"
  echo "  Confira app.json (expo.name) e rode: xcodebuild -list -workspace ios/*.xcworkspace -json" >&2
  exit 1
fi
echo "  Scheme: ${SCHEME}"

# ---------------------------------------------------------------------------
# 5/9 — Build assinado (time pessoal, assinatura automática), configuração
#       Release. Provado empiricamente na Plano 14-06 (sessão com o iPhone
#       físico): um build Debug instala e abre nativamente, mas NÃO embute
#       main.jsbundle — ele espera um Metro dev server, que não existe fora
#       de uma sessão de desenvolvimento ativa. Resultado: o app abre e a
#       tela fica em branco, nenhuma linha de JS roda (zero logs, apesar do
#       módulo nativo estar corretamente registrado). Um build Release
#       embute main.jsbundle e roda standalone — é o único que serve ao
#       propósito deste comando (rodar sozinho no device, longe do Mac).
# ---------------------------------------------------------------------------
echo "5/9 — build assinado (xcodebuild)..."
if ! DERIVED_DATA_PATH="$(mktemp -d /tmp/forca-resign.XXXXXX)"; then
  vermelho "ABORTADO: nao foi possivel criar DerivedData exclusivo"
  echo "  Confira permissoes de escrita em /tmp e tente novamente." >&2
  exit 1
fi
readonly DERIVED_DATA_PATH
readonly BUILD_START_MARKER="${DERIVED_DATA_PATH}/.resign-start"
: > "$BUILD_START_MARKER"
trap 'rm -rf "$DERIVED_DATA_PATH"' EXIT
echo "  DerivedData: ${DERIVED_DATA_PATH}"

if ! xcodebuild -workspace "ios/${SCHEME}.xcworkspace" -scheme "$SCHEME" \
  -configuration Release -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates clean build; then
  vermelho "ABORTADO: build falhou"
  echo "  Confira Xcode > Settings > Accounts: Apple ID pessoal com o time selecionavel para assinatura automatica" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 6/9 — Validar o produto da mesma execucao. Nao procurar em DerivedData
#       global: o caminho e deterministico desde o argumento do xcodebuild.
# ---------------------------------------------------------------------------
echo "6/9 — validando produto Release..."
readonly APP_PATH="${DERIVED_DATA_PATH}/Build/Products/Release-iphoneos/${SCHEME}.app"
readonly WIDGET_PATH="${APP_PATH}/PlugIns/session-widget.appex"
if [[ ! -d "$APP_PATH" ]]; then
  vermelho "ABORTADO: .app nao encontrado no DerivedData desta execucao"
  echo "  Confira se a etapa 5 (build) terminou sem erro" >&2
  exit 1
fi
if [[ ! -d "$WIDGET_PATH" ]]; then
  vermelho "ABORTADO: session-widget.appex ausente no .app desta execucao"
  echo "  Confira se o target session-widget foi embutido no build Release." >&2
  exit 1
fi
if [[ ! "$APP_PATH" -nt "$BUILD_START_MARKER" || ! "$WIDGET_PATH" -nt "$BUILD_START_MARKER" ]]; then
  vermelho "ABORTADO: .app ou session-widget.appex nao e posterior ao inicio do build"
  echo "  O produto precisa ser criado pela execucao atual, nao reaproveitado." >&2
  exit 1
fi
if ! codesign --verify --deep --strict --verbose=2 "$APP_PATH" >/dev/null 2>&1; then
  vermelho "ABORTADO: codesign invalido no .app desta execucao"
  echo "  Confira a assinatura automatica e o Apple Team selecionado no Xcode." >&2
  exit 1
fi
if ! codesign --verify --deep --strict --verbose=2 "$WIDGET_PATH" >/dev/null 2>&1; then
  vermelho "ABORTADO: codesign invalido no session-widget.appex"
  echo "  Confira a assinatura do target session-widget no build Release." >&2
  exit 1
fi
validar_bundle_supabase_uat
echo "  .app: ${APP_PATH}"

# ---------------------------------------------------------------------------
# 7/9 — Resolver o device de destino (D-02: cabo USB). Aceita UDID
#       explícito via $1; senão exige exatamente 1 device conectado —
#       zero ou múltiplos aborta em vez de escolher um arbitrário
#       (T-14-04-01, threat model desta plano).
# ---------------------------------------------------------------------------
echo "7/9 — resolvendo device conectado..."
if [[ -z "$DEVICE_UDID" ]]; then
  DEVICE_LIST_OUTPUT="$(xcrun devicectl list devices 2>&1 || true)"
  DEVICE_IDS="$(printf '%s\n' "$DEVICE_LIST_OUTPUT" | grep -oE '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}' || true)"
  DEVICE_COUNT="$(printf '%s\n' "$DEVICE_IDS" | grep -c . || true)"
  if [[ "$DEVICE_COUNT" -ne 1 ]]; then
    vermelho "ABORTADO: nenhum ou mais de um device conectado"
    echo "  Passe o UDID como argumento: npm run resign -- <UDID>" >&2
    echo "  Lista completa: xcrun devicectl list devices" >&2
    exit 1
  fi
  DEVICE_UDID="$DEVICE_IDS"
fi
echo "  Device UDID: ${DEVICE_UDID}"

# ---------------------------------------------------------------------------
# 8/9 — Instalar no device via cabo (D-02).
# ---------------------------------------------------------------------------
echo "8/9 — instalando no device..."
if ! xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_PATH"; then
  vermelho "ABORTADO: instalacao no device falhou"
  echo "  Confira se o iPhone esta conectado por cabo, desbloqueado e com 'Confiar neste computador' aceito; tente: xcrun devicectl list devices" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 9/9 — Gate final: o esqueleto nativo precisa continuar íntegro. "Compilou
#       e instalou" não é o critério de sucesso — se o esqueleto regrediu
#       (target de widget não sobreviveu ao --clean, entitlement vazou,
#       módulo native-info parou de ser autolinked), a reassinatura inteira
#       é FALHA.
# ---------------------------------------------------------------------------
echo "9/9 — gate final: verify-native-skeleton.sh..."
if ! bash "${REPO_ROOT}/scripts/verify-native-skeleton.sh"; then
  vermelho "ABORTADO: verify-native-skeleton.sh falhou apos a reassinatura"
  echo "  A instalacao no device pode ter funcionado, mas o esqueleto nativo nao passa nas checagens de regressao — nao considere a reassinatura concluida." >&2
  exit 1
fi

verde "OK: reassinatura concluida — build assinado instalado e esqueleto nativo verificado."
exit 0
