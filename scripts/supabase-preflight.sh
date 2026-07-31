#!/usr/bin/env bash
# scripts/supabase-preflight.sh — porta de entrada obrigatória de qualquer
# comando que toque o banco (db push, db reset, psql, script de limpeza).
#
# Por que existe: em 31/07/2026 um briefing de revisão trocou os dois refs e
# descreveu a PRODUÇÃO como "HML descartável". Nada no repo estava errado —
# AGENTS.md e docs/AMBIENTE_HML.md sempre trouxeram o mapeamento certo — mas
# um roteiro que afirma o ref errado é suficiente para apontar um `db push`
# ou uma limpeza de dados ao banco real. Documentação correta não impede o
# comando; este script impede.
#
# A confusão tem origem conhecida: o projeto de PRODUÇÃO chamava-se
# `forcaapp-hml` até 25/07/2026 e o ref não mudou com a renomeação. Ou seja,
# a string "hml" aparece na história do projeto de produção. Nunca decida o
# ambiente pelo NOME. Decida pelo REF.
#
# Uso:
#   scripts/supabase-preflight.sh hml  && supabase db push
#   scripts/supabase-preflight.sh prod && supabase db push
#
# Saída 0 = o diretório está linkado ao ambiente que você declarou.
# Saída != 0 = não execute o comando seguinte.

set -euo pipefail

# ---------------------------------------------------------------------------
# Refs canônicos. Fonte da verdade: AGENTS.md (seção "Ambiente Supabase").
# Se algum dia um destes mudar, mude AQUI e no AGENTS.md na mesma edição.
# ---------------------------------------------------------------------------
readonly REF_HML="mjdjtiujhwklchalquhc"   # forcaapp-staging  — dados descartáveis
readonly REF_PROD="zanqygwsgxkyjiuhrzju"  # forcaapp-prod     — DADOS REAIS

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REF_FILE="${REPO_ROOT}/supabase/.temp/project-ref"

vermelho() { printf '\033[1;31m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
verde()    { printf '\033[1;32m%s\033[0m\n' "$*"; }

uso() {
  cat >&2 <<'EOF'
uso: scripts/supabase-preflight.sh <hml|prod>

  hml   exige que o diretório esteja linkado ao forcaapp-staging
  prod  exige que esteja linkado ao forcaapp-prod E confirmação digitada
EOF
  exit 2
}

[[ $# -eq 1 ]] || uso

esperado_nome=""
esperado_ref=""
case "$1" in
  hml|staging|homologacao)  esperado_nome="HOMOLOGAÇÃO (forcaapp-staging)"; esperado_ref="$REF_HML" ;;
  prod|producao|production) esperado_nome="PRODUÇÃO (forcaapp-prod)";       esperado_ref="$REF_PROD" ;;
  *) uso ;;
esac

# ---------------------------------------------------------------------------
# 1. Descobrir a que projeto ESTE diretório está linkado.
#    `supabase link` grava o ref aqui; é o valor que o db push vai usar.
# ---------------------------------------------------------------------------
if [[ ! -f "$REF_FILE" ]]; then
  vermelho "ABORTADO: o diretório não está linkado a nenhum projeto Supabase."
  echo "  Esperado: $REF_FILE" >&2
  echo "  Rode:     supabase link --project-ref <ref>" >&2
  exit 1
fi

# O arquivo não tem newline final e já chegou a carregar lixo concatenado —
# corta em qualquer coisa que não seja o alfabeto de um ref (a-z de 20 chars).
ref_linkado="$(tr -cd 'a-z' < "$REF_FILE" | head -c 20)"

if [[ ! "$ref_linkado" =~ ^[a-z]{20}$ ]]; then
  vermelho "ABORTADO: ref linkado ilegível em $REF_FILE."
  echo "  Lido: '${ref_linkado}'" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Allowlist: o ref precisa ser um dos DOIS projetos do Forca.
#    A conta também tem os projetos do CarreraCampos (app jurídico, outra
#    base) — um `supabase link` na conta errada cai neles em silêncio.
# ---------------------------------------------------------------------------
case "$ref_linkado" in
  "$REF_HML"|"$REF_PROD") ;;
  *)
    vermelho "ABORTADO: ref '$ref_linkado' não é um projeto do ForcaApp."
    echo "  Refs válidos: $REF_HML (hml) | $REF_PROD (prod)" >&2
    echo "  Um link na conta errada cai nos projetos do CarreraCampos." >&2
    exit 1 ;;
esac

if [[ "$ref_linkado" == "$REF_PROD" ]]; then
  ambiente_real="PRODUÇÃO (forcaapp-prod) — DADOS REAIS"
else
  ambiente_real="HOMOLOGAÇÃO (forcaapp-staging) — dados descartáveis"
fi

echo
echo "  Projeto linkado neste diretório: $ambiente_real"
echo "  Ref:                             $ref_linkado"
echo "  Ambiente declarado no comando:   $esperado_nome"
echo

# ---------------------------------------------------------------------------
# 3. A trava que fecha o AMB-01: divergência entre o declarado e o linkado.
# ---------------------------------------------------------------------------
if [[ "$ref_linkado" != "$esperado_ref" ]]; then
  vermelho "ABORTADO: você declarou '$1', mas o diretório aponta para outro projeto."
  if [[ "$ref_linkado" == "$REF_PROD" ]]; then
    echo >&2
    vermelho "  Este é o banco de PRODUÇÃO, com dados reais de usuários."
    echo "  Um roteiro que chama '$REF_PROD' de HML está ERRADO — é herança do" >&2
    echo "  nome antigo do projeto (forcaapp-hml até 25/07/2026). Não siga." >&2
  fi
  echo >&2
  echo "  Para operar em '$1': supabase link --project-ref $esperado_ref" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Produção nunca passa em silêncio: exige confirmação digitada.
# ---------------------------------------------------------------------------
if [[ "$esperado_ref" == "$REF_PROD" ]]; then
  amarelo "  O próximo comando vai atuar sobre DADOS REAIS de produção."
  echo "  A migration já foi aplicada e validada em homologação? (AGENTS.md)"
  echo
  printf "  Digite exatamente PRODUCAO para continuar: "
  read -r confirmacao
  if [[ "$confirmacao" != "PRODUCAO" ]]; then
    vermelho "ABORTADO: confirmação não recebida."
    exit 1
  fi
fi

verde "OK: prossiga — o diretório está linkado a $esperado_nome."
exit 0
