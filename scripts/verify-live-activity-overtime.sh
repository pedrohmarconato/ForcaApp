#!/usr/bin/env bash
# scripts/verify-live-activity-overtime.sh — prova Swift pura da transição
# temporal de descanso para Pronto/overtime (D-04, Fase 15 Plano 15-07,
# fechando os blockers CR-01/CR-02 de 15-VERIFICATION.md).
#
# Por que existe: o widget precisa trocar sozinho de `resting` para
# `readyOvertime` no vencimento absoluto de `restEndsAt` — inclusive com o
# processo JS suspenso — e o overtime precisa crescer até o teto +59:59 sem
# nenhuma atualização por segundo vinda do app. `RestPhaseResolver.swift` e
# `OvertimeFormatter.swift` (targets/session-widget/) são os dois helpers
# Swift puros que fazem essa derivação; este script compila os arquivos REAIS
# (sem mock, sem cópia funcional) junto com um harness de asserções e prova
# as fronteiras antes/no/depois de `restEndsAt` para as duas fases de entrada
# possíveis (`resting` e `readyOvertime`), além das bordas do formatter.
#
# Por que extrair só `SessionActivityPhase` de SessionActivityAttributes.swift:
# `ActivityAttributes`/`ContentState` (o resto daquele arquivo) usam o
# protocolo `ActivityAttributes`, que o próprio ActivityKit marca indisponível
# fora de iOS/watchOS — não compila com o SDK padrão de macOS deste host, e
# compilar contra o SDK do simulador de iOS produziria um binário que este
# script não conseguiria executar diretamente (exigiria simctl + app bundle,
# o overhead de "novo target XCTest" que este script existe para evitar). O
# enum `SessionActivityPhase` em si não usa nenhuma API indisponível em
# macOS — só a struct que o envolve mais abaixo no arquivo. Por isso este
# script extrai (não redeclara manualmente) só o bloco do enum da FONTE REAL
# com `sed`, preservando fonte única de verdade sem herdar a indisponibilidade
# da struct vizinha.
#
# Sem XCTest, sem simulador, sem novo scheme — compila e roda um binário nativo
# de linha de comando, no estilo de scripts/verify-intent-action-queue-race.sh.
#
# Uso:
#   bash scripts/verify-live-activity-overtime.sh

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

vermelho() { printf '\033[1;31m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[1;32m%s\033[0m\n' "$*"; }

readonly WIDGET_FILE="targets/session-widget/WidgetLiveActivity.swift"
readonly RESOLVER_FILE="targets/session-widget/RestPhaseResolver.swift"
readonly FORMATTER_FILE="targets/session-widget/OvertimeFormatter.swift"
readonly ATTRIBUTES_FILE="targets/session-widget/SessionActivityAttributes.swift"

TMPDIR_LVA="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_LVA"' EXIT

# ---------------------------------------------------------------------------
# 1) Extrai o enum SessionActivityPhase da fonte real (ver comentário acima
#    sobre por que a struct ContentState/ActivityAttributes fica de fora).
# ---------------------------------------------------------------------------
if ! sed -n '/^public enum SessionActivityPhase/,/^}/p' "$ATTRIBUTES_FILE" > "$TMPDIR_LVA/SessionActivityPhase.swift"; then
  vermelho "ABORTADO: não foi possível extrair SessionActivityPhase de ${ATTRIBUTES_FILE}."
  exit 1
fi
if [[ ! -s "$TMPDIR_LVA/SessionActivityPhase.swift" ]]; then
  vermelho "ABORTADO: extração de SessionActivityPhase produziu arquivo vazio — ${ATTRIBUTES_FILE} mudou de formato?"
  exit 1
fi
{
  echo "import ActivityKit"
  echo "import Foundation"
  echo
  cat "$TMPDIR_LVA/SessionActivityPhase.swift"
} > "$TMPDIR_LVA/SessionActivityPhaseExtract.swift"

# ---------------------------------------------------------------------------
# 2) Harness de asserções. RED 1/2/3 cobrem exatamente as três fronteiras do
#    <behavior> do Plano 15-07: antes do prazo, no instante exato e depois
#    dele — para as duas fases de entrada possíveis (resting e readyOvertime,
#    já que o ContentState pode chegar de qualquer um dos dois lados). O
#    resto cobre fases não temporais, prazo ausente e as bordas isoladas do
#    formatter (0, 3599 e acima do teto).
# ---------------------------------------------------------------------------
cat > "$TMPDIR_LVA/main.swift" <<'SWIFT_EOF'
import ActivityKit
import Foundation

func falhar(_ mensagem: String) -> Never {
    FileHandle.standardError.write(Data("FALHA: \(mensagem)\n".utf8))
    exit(1)
}

func assertEqual<T: Equatable>(_ actual: T, _ expected: T, _ mensagem: String) {
    if actual != expected {
        falhar("\(mensagem) — esperado \(expected), obtido \(actual)")
    }
}

let base = Date(timeIntervalSince1970: 1_700_000_000) // âncora fixa e determinística

// RED 1: para ContentState recebido como resting e now estritamente anterior
// a restEndsAt, o resolvedor mantém resting e não há segundos de overtime.
let antesDoPrazo = base.addingTimeInterval(-1)
for fase: SessionActivityPhase in [.resting, .readyOvertime] {
    let resolvida = RestPhaseResolver.effectivePhase(receivedPhase: fase, restEndsAt: base, now: antesDoPrazo)
    assertEqual(resolvida, .resting, "RED1: fase recebida \(fase) antes do prazo deveria resolver para resting")
}
assertEqual(
    RestPhaseResolver.overtimeSeconds(restEndsAt: base, now: antesDoPrazo), 0,
    "RED1: overtime antes do prazo deveria ser 0"
)

// RED 2: no instante exato de restEndsAt, tanto o estado recebido resting
// quanto readyOvertime resolvem para readyOvertime e o formatter recebe
// zero, exibindo +0:00.
for fase: SessionActivityPhase in [.resting, .readyOvertime] {
    let resolvida = RestPhaseResolver.effectivePhase(receivedPhase: fase, restEndsAt: base, now: base)
    assertEqual(resolvida, .readyOvertime, "RED2: fase recebida \(fase) no instante exato deveria resolver para readyOvertime")
}
let overtimeNoInstante = RestPhaseResolver.overtimeSeconds(restEndsAt: base, now: base)
assertEqual(overtimeNoInstante, 0, "RED2: overtime no instante exato deveria ser 0")
assertEqual(
    OvertimeFormatter.format(elapsedSeconds: overtimeNoInstante), "+0:00",
    "RED2: formatter no instante exato deveria exibir +0:00"
)

// RED 3: após restEndsAt, ambos os estados recebidos resolvem para
// readyOvertime; o overtime cresce com now e o formatter exibe +59:59 em
// 3599 segundos e acima do teto.
let em3599s = base.addingTimeInterval(3599)
let acimaDoTeto = base.addingTimeInterval(4000)
for fase: SessionActivityPhase in [.resting, .readyOvertime] {
    assertEqual(
        RestPhaseResolver.effectivePhase(receivedPhase: fase, restEndsAt: base, now: em3599s), .readyOvertime,
        "RED3: fase recebida \(fase) depois do prazo (3599s) deveria resolver para readyOvertime"
    )
    assertEqual(
        RestPhaseResolver.effectivePhase(receivedPhase: fase, restEndsAt: base, now: acimaDoTeto), .readyOvertime,
        "RED3: fase recebida \(fase) acima do teto (4000s) deveria resolver para readyOvertime"
    )
}
let overtimeEm3599 = RestPhaseResolver.overtimeSeconds(restEndsAt: base, now: em3599s)
assertEqual(overtimeEm3599, 3599, "RED3: overtimeSeconds em 3599s deveria ser exatamente 3599")
assertEqual(
    OvertimeFormatter.format(elapsedSeconds: overtimeEm3599), "+59:59",
    "RED3: formatter em 3599s deveria exibir +59:59"
)
let overtimeAcimaDoTeto = RestPhaseResolver.overtimeSeconds(restEndsAt: base, now: acimaDoTeto)
assertEqual(overtimeAcimaDoTeto, 4000, "RED3: overtimeSeconds acima do teto deveria refletir o valor bruto (4000) — o clamp é do formatter")
assertEqual(
    OvertimeFormatter.format(elapsedSeconds: overtimeAcimaDoTeto), "+59:59",
    "RED3: formatter acima do teto deveria clampar em +59:59"
)

// Fases não temporais preservam o valor recebido, mesmo com restEndsAt
// presente — o resolvedor nunca fabrica overtime fora de resting/readyOvertime.
for fase: SessionActivityPhase in [.measuring, .blockOnly] {
    assertEqual(
        RestPhaseResolver.effectivePhase(receivedPhase: fase, restEndsAt: base, now: acimaDoTeto), fase,
        "fase não temporal \(fase) não deveria ser alterada pelo resolvedor"
    )
}

// Prazo ausente preserva a fase recebida, mesmo para resting/readyOvertime.
for fase: SessionActivityPhase in [.resting, .readyOvertime, .measuring, .blockOnly] {
    assertEqual(
        RestPhaseResolver.effectivePhase(receivedPhase: fase, restEndsAt: nil, now: base), fase,
        "sem restEndsAt, a fase recebida \(fase) deveria ser preservada"
    )
}
assertEqual(RestPhaseResolver.overtimeSeconds(restEndsAt: nil, now: base), 0, "overtimeSeconds sem prazo deveria ser 0")

// Bordas do formatador isoladamente: 0, 3599, acima do teto e clamp de negativos.
assertEqual(OvertimeFormatter.format(elapsedSeconds: 0), "+0:00", "formatter em 0 deveria exibir +0:00")
assertEqual(OvertimeFormatter.format(elapsedSeconds: 3599), "+59:59", "formatter em 3599 deveria exibir +59:59")
assertEqual(OvertimeFormatter.format(elapsedSeconds: 3600), "+59:59", "formatter em 3600 deveria clampar em +59:59")
assertEqual(OvertimeFormatter.format(elapsedSeconds: -5), "+0:00", "formatter com entrada negativa deveria clampar em +0:00")

print("OK: RestPhaseResolver e OvertimeFormatter passam em todas as fronteiras temporais")
SWIFT_EOF

# ---------------------------------------------------------------------------
# 3) Compila os arquivos REAIS (RestPhaseResolver.swift, OvertimeFormatter.swift)
#    junto com o enum extraído e o harness, roda o binário nativo.
# ---------------------------------------------------------------------------
BIN="$TMPDIR_LVA/rest-phase-resolver-test"
if ! xcrun swiftc \
    "$TMPDIR_LVA/SessionActivityPhaseExtract.swift" \
    "$RESOLVER_FILE" \
    "$FORMATTER_FILE" \
    "$TMPDIR_LVA/main.swift" \
    -o "$BIN" 2>"$TMPDIR_LVA/compile.log"; then
  vermelho "ABORTADO: falha ao compilar RestPhaseResolver.swift/OvertimeFormatter.swift."
  cat "$TMPDIR_LVA/compile.log" >&2
  exit 1
fi

if ! "$BIN"; then
  vermelho "ABORTADO: as provas Swift de RestPhaseResolver/OvertimeFormatter falharam."
  echo "  Veja a mensagem FALHA acima e corrija RestPhaseResolver.swift/OvertimeFormatter.swift." >&2
  exit 1
fi

amarelo "  Provas Swift do resolvedor temporal e do formatter: OK."

# ---------------------------------------------------------------------------
# 4) Inspeção de fonte: WidgetLiveActivity precisa usar TimelineView e
#    timeline.date na região temporal, e o fluxo de expiração não pode
#    depender de setTimeout nem de uma chamada JS a updateLiveActivity
#    dentro do próprio widget.
# ---------------------------------------------------------------------------
if [[ ! -f "$WIDGET_FILE" ]]; then
  vermelho "ABORTADO: ${WIDGET_FILE} não encontrado."
  exit 1
fi

if ! grep -q "TimelineView" "$WIDGET_FILE"; then
  vermelho "ABORTADO: ${WIDGET_FILE} não contém TimelineView — a apresentação temporal não reavalia sozinha."
  exit 1
fi

if ! grep -q "timeline.date" "$WIDGET_FILE"; then
  vermelho "ABORTADO: ${WIDGET_FILE} não usa timeline.date — o resolvedor precisa do instante do TimelineView, não de Date.now capturado uma vez."
  exit 1
fi

if grep -q "setTimeout" "$WIDGET_FILE"; then
  vermelho "ABORTADO: ${WIDGET_FILE} não pode depender de setTimeout — a transição é derivada por TimelineView/RestPhaseResolver, não por timer."
  exit 1
fi

if grep -q "updateLiveActivity(" "$WIDGET_FILE"; then
  vermelho "ABORTADO: ${WIDGET_FILE} não pode chamar updateLiveActivity — o widget só renderiza o ContentState recebido, nunca dispara updates."
  exit 1
fi

amarelo "  Inspeção de fonte de ${WIDGET_FILE}: OK (TimelineView + timeline.date, sem setTimeout/updateLiveActivity)."

verde "OK: transição temporal resting -> readyOvertime e overtime clampado provados sem depender de JS."
exit 0
