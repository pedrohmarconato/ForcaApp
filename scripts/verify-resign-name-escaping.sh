#!/usr/bin/env bash
# scripts/verify-resign-name-escaping.sh — prova comportamental de WR-03
# (14-REVIEW.md, 2026-08-19: scripts/resign.sh:61-72).
#
# Gap encontrado na validação Nyquist da Fase 14: WR-03 foi corrigido (o
# valor de expo.name passa a chegar ao `node -e` por variável de ambiente,
# não por interpolação de string dentro de um literal JS de aspas simples),
# mas nenhum teste automatizado exercitava esse comportamento — só leitura
# de código. Este script reproduz o segundo `node -e` de
# scripts/resign.sh:62-72 byte-a-byte, injeta um expo.name adversarial
# contendo aspa simples + chamada de child_process, e prova que NENHUM
# código injetado executa.
#
# Se scripts/resign.sh regredir para o padrão antigo (interpolação de
# string, ex.: `const nome = '${EXPO_NAME}';` dentro do -e), este teste
# falha: o arquivo sentinela abaixo passaria a existir.
#
# Uso:
#   bash scripts/verify-resign-name-escaping.sh
# Saída 0 = injeção não executa (comportamento seguro, mesmo com o payload
#           malicioso). Saída != 0 = a injeção executou — regressão de WR-03.

set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

vermelho() { printf '\033[1;31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[1;32m%s\033[0m\n' "$*"; }

SENTINELA="$(mktemp -u)"
rm -f "$SENTINELA"

# Payload adversarial: uma aspa simples fecha um literal JS de aspas
# simples, seguida de código que cria o arquivo sentinela. Se resign.sh
# ainda interpolasse ${EXPO_NAME} dentro do -e (padrão pré-WR-03), este
# valor executaria o require(...).writeFileSync(...) como JS arbitrário.
EXPO_NAME_MALICIOSO="ForcaApp'; require('fs').writeFileSync('${SENTINELA}', 'pwned'); //"

# Reproduz exatamente o segundo node -e de scripts/resign.sh:62-72 —
# mesmo padrão de leitura de EXPO_NAME via process.env, nunca por
# interpolação de string no literal JS.
SCHEMES_JSON='{"workspace":{"schemes":["ForcaApp","EXConstants","EXApplication"]}}'
SCHEME_RESULTADO="$(echo "$SCHEMES_JSON" | EXPO_NAME="$EXPO_NAME_MALICIOSO" node -e "
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

if [[ -f "$SENTINELA" ]]; then
  vermelho "ABORTADO: injecao via expo.name executou codigo arbitrario (arquivo sentinela criado em ${SENTINELA}) — regressao de WR-03."
  rm -f "$SENTINELA"
  exit 1
fi

# Confirma também que o comportamento funcional continua correto: o nome
# malicioso não bate com nenhum scheme real, então nada é impresso (sem
# scheme "encontrado" por acidente de comparação de string).
if [[ -n "$SCHEME_RESULTADO" ]]; then
  vermelho "ABORTADO: nome malicioso casou com um scheme (${SCHEME_RESULTADO}) — comparacao inesperada."
  exit 1
fi

verde "OK: expo.name malicioso nao executa codigo e nao casa com scheme algum (WR-03 comportamentalmente provado)."
exit 0
