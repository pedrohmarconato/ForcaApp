# backend/services/plan_repository.py
# Grava o plano mapeado no Supabase via PostgREST.
# Segurança: a escrita usa o JWT DO USUÁRIO (Authorization: Bearer) + anon key,
# então o RLS do banco vale — o backend não tem (nem precisa de) service role.
#
# Consistência (achados #1 e #3 do review do PR #4):
# - Antes de inserir, os planos ATIVOS anteriores do usuário são arquivados:
#   nunca fica mais de um plano ativo (o índice único parcial no banco é a
#   segunda linha de defesa).
# - Se qualquer inserção falhar — INCLUSIVE a do próprio plano, cujo timeout
#   pode ter sido confirmado pelo banco — a limpeza é tentada e o resultado
#   REAL do DELETE entra na mensagem: só dizemos "removido" quando o banco
#   confirmou a remoção.

import os
from typing import Any, Dict, List

import requests

REQUEST_TIMEOUT_SECONDS = 20
# PostgREST aceita listas grandes, mas fatiamos para manter payloads modestos
CHUNK_SIZE = 200


class PlanPersistenceError(RuntimeError):
    """Falha ao gravar o plano no banco (após limpeza best-effort)."""


def _config():
    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY") or ""
    if not base_url or not anon_key:
        raise PlanPersistenceError("SUPABASE_URL/SUPABASE_ANON_KEY não configurados no backend.")
    return base_url, anon_key


def _headers(anon_key: str, access_token: str) -> Dict[str, str]:
    return {
        "apikey": anon_key,
        "Authorization": "Bearer {}".format(access_token),
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _arquivar_planos_ativos(base_url: str, headers: Dict[str, str], user_id: str) -> None:
    """Arquiva planos ativos anteriores do usuário (idempotente)."""
    try:
        resposta = requests.patch(
            "{}/rest/v1/{}".format(base_url, "training_plans"),
            headers=headers,
            params={"user_id": "eq.{}".format(user_id), "status": "eq.active"},
            json={"status": "archived"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise PlanPersistenceError("Falha ao arquivar o plano anterior: {}".format(exc)) from exc
    if resposta.status_code >= 400:
        raise PlanPersistenceError(
            "Falha ao arquivar o plano anterior (HTTP {}).".format(resposta.status_code)
        )


def _inserir(base_url: str, headers: Dict[str, str], tabela: str, payload: Any) -> None:
    resposta = requests.post(
        "{}/rest/v1/{}".format(base_url, tabela),
        headers=headers,
        json=payload,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    if resposta.status_code >= 400:
        raise PlanPersistenceError(
            "Falha ao inserir em {} (HTTP {}).".format(tabela, resposta.status_code)
        )


def _inserir_em_fatias(base_url: str, headers: Dict[str, str], tabela: str, linhas: List[dict]) -> None:
    for inicio in range(0, len(linhas), CHUNK_SIZE):
        _inserir(base_url, headers, tabela, linhas[inicio:inicio + CHUNK_SIZE])


def _limpar_plano(base_url: str, headers: Dict[str, str], plan_id: str) -> str:
    """
    Tenta remover o plano parcial (cascade limpa os filhos) e devolve o
    resultado REAL: 'removed' (banco confirmou remoção de >=1 linha),
    'not_found' (nada para remover) ou 'failed' (não foi possível confirmar).
    """
    headers_confirmacao = dict(headers)
    headers_confirmacao["Prefer"] = "return=representation"  # devolve as linhas apagadas
    try:
        resposta = requests.delete(
            "{}/rest/v1/{}".format(base_url, "training_plans"),
            headers=headers_confirmacao,
            params={"id": "eq.{}".format(plan_id)},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return "failed"
    if resposta.status_code >= 400:
        return "failed"
    try:
        corpo = resposta.json()
    except ValueError:
        return "failed"
    return "removed" if isinstance(corpo, list) and len(corpo) >= 1 else "not_found"


def _mensagem_limpeza(resultado: str, plan_id: str) -> str:
    if resultado == "removed":
        return "O plano parcial foi removido do banco."
    if resultado == "not_found":
        return "Nenhum plano parcial ficou no banco."
    return (
        "ATENÇÃO: não foi possível confirmar a remoção do plano parcial "
        "(plan_id={}) — verificar manualmente.".format(plan_id)
    )


def persistir_plano(mapeado: Dict[str, Any], access_token: str) -> str:
    """
    Arquiva planos ativos anteriores e insere plan → sessions → exercises → sets
    (ordem das FKs). Retorna o id do plano gravado.
    Levanta PlanPersistenceError em falha, com o resultado real da limpeza.
    """
    base_url, anon_key = _config()
    headers = _headers(anon_key, access_token)
    plan = mapeado["plan"]
    plan_id = plan["id"]

    # Nada foi criado ainda: falha aqui aborta sem necessidade de limpeza
    _arquivar_planos_ativos(base_url, headers, plan["user_id"])

    try:
        _inserir(base_url, headers, "training_plans", plan)
    except (PlanPersistenceError, requests.RequestException) as exc:
        # Um timeout pode ter sido CONFIRMADO pelo banco: limpar também aqui
        limpeza = _limpar_plano(base_url, headers, plan_id)
        raise PlanPersistenceError(
            "Falha ao gravar o plano: {}. {}".format(exc, _mensagem_limpeza(limpeza, plan_id))
        ) from exc

    try:
        _inserir_em_fatias(base_url, headers, "planned_sessions", mapeado["sessions"])
        _inserir_em_fatias(base_url, headers, "planned_exercises", mapeado["exercises"])
        _inserir_em_fatias(base_url, headers, "planned_sets", mapeado["sets"])
    except (PlanPersistenceError, requests.RequestException) as exc:
        limpeza = _limpar_plano(base_url, headers, plan_id)
        raise PlanPersistenceError(
            "Falha ao gravar os detalhes do plano: {}. {}".format(
                exc, _mensagem_limpeza(limpeza, plan_id)
            )
        ) from exc

    return plan_id
