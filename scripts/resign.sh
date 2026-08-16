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
# conhecido — nunca morre só com o stderr cru de xcodebuild/devicectl/find.
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

# ---------------------------------------------------------------------------
# 1/8 — CocoaPods precisa estar instalado antes de qualquer prebuild.
#       Bloqueador de ambiente sem workaround (mesmo gap resolvido na
#       Plano 14-01/14-02, verificado de novo aqui porque uma máquina
#       nova pode não ter o Homebrew keg instalado).
# ---------------------------------------------------------------------------
echo "1/8 — checando CocoaPods..."
if ! pod --version >/dev/null 2>&1; then
  vermelho "ABORTADO: CocoaPods ausente"
  echo "  Rode: brew install cocoapods" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2/8 — Regenerar ios/ a partir de targets/ + modules/ + app.json.
# ---------------------------------------------------------------------------
echo "2/8 — expo prebuild --clean..."
npx expo prebuild -p ios --clean --non-interactive

# ---------------------------------------------------------------------------
# 3/8 — Descobrir o scheme Xcode dinamicamente. NUNCA usar schemes[0] do
#       JSON de `xcodebuild -list` — esse array vem em ordem alfabética
#       (EXConstants primeiro, entre ~100 schemes de dependências
#       CocoaPods), não com o app principal na posição 0. Provado na
#       Plano 14-02 (14-02-SUMMARY.md, "Decisions Made"). O padrão
#       estabelecido lá ("patterns-established") é confirmar o scheme
#       contra expo.name — dinâmico (não hardcoda "ForcaApp") e correto.
# ---------------------------------------------------------------------------
echo "3/8 — descobrindo scheme Xcode..."
EXPO_NAME="$(node -e "console.log(require('${REPO_ROOT}/app.json').expo.name)")"
SCHEME="$(xcodebuild -list -workspace ios/*.xcworkspace -json | node -e "
let d = '';
process.stdin.on('data', (c) => { d += c; });
process.stdin.on('end', () => {
  const schemes = JSON.parse(d).workspace.schemes;
  const nome = '${EXPO_NAME}';
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
# 4/8 — Build assinado (time pessoal, assinatura automática). Debug/
#       dev-client é a configuração do dia a dia durante o v1.3 (D-05); a
#       troca para Release fica para o fechamento do milestone.
# ---------------------------------------------------------------------------
echo "4/8 — build assinado (xcodebuild)..."
if ! xcodebuild -workspace "ios/${SCHEME}.xcworkspace" -scheme "$SCHEME" \
  -configuration Debug -destination "generic/platform=iOS" \
  -allowProvisioningUpdates build; then
  vermelho "ABORTADO: build falhou"
  echo "  Confira Xcode > Settings > Accounts: Apple ID pessoal com o time selecionavel para assinatura automatica" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 5/8 — Localizar o .app gerado em DerivedData.
# ---------------------------------------------------------------------------
echo "5/8 — localizando .app em DerivedData..."
APP_PATH="$(find ~/Library/Developer/Xcode/DerivedData -name "${SCHEME}.app" -path "*Debug-iphoneos*" -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  vermelho "ABORTADO: .app nao encontrado em DerivedData"
  echo "  Confira se a etapa 4 (build) terminou sem erro" >&2
  exit 1
fi
echo "  .app: ${APP_PATH}"

# ---------------------------------------------------------------------------
# 6/8 — Resolver o device de destino (D-02: cabo USB). Aceita UDID
#       explícito via $1; senão exige exatamente 1 device conectado —
#       zero ou múltiplos aborta em vez de escolher um arbitrário
#       (T-14-04-01, threat model desta plano).
# ---------------------------------------------------------------------------
echo "6/8 — resolvendo device conectado..."
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
# 7/8 — Instalar no device via cabo (D-02).
# ---------------------------------------------------------------------------
echo "7/8 — instalando no device..."
if ! xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_PATH"; then
  vermelho "ABORTADO: instalacao no device falhou"
  echo "  Confira se o iPhone esta conectado por cabo, desbloqueado e com 'Confiar neste computador' aceito; tente: xcrun devicectl list devices" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 8/8 — Gate final: o esqueleto nativo precisa continuar íntegro. "Compilou
#       e instalou" não é o critério de sucesso — se o esqueleto regrediu
#       (target de widget não sobreviveu ao --clean, entitlement vazou,
#       módulo native-info parou de ser autolinked), a reassinatura inteira
#       é FALHA.
# ---------------------------------------------------------------------------
echo "8/8 — gate final: verify-native-skeleton.sh..."
if ! bash "${REPO_ROOT}/scripts/verify-native-skeleton.sh"; then
  vermelho "ABORTADO: verify-native-skeleton.sh falhou apos a reassinatura"
  echo "  A instalacao no device pode ter funcionado, mas o esqueleto nativo nao passa nas checagens de regressao — nao considere a reassinatura concluida." >&2
  exit 1
fi

verde "OK: reassinatura concluida — build assinado instalado e esqueleto nativo verificado."
exit 0
