# backend/services/plan_repository.py
# Persiste o plano completo por uma única RPC transacional no Supabase.
# A chamada usa o JWT do usuário + anon key; SECURITY INVOKER e RLS continuam
# valendo, sem service role no backend.

import os
from typing import Any, Dict

import requests

REQUEST_TIMEOUT_SECONDS = 20


class PlanPersistenceError(RuntimeError):
    """Falha ao confirmar a transação que grava o plano completo."""


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
    }


def persistir_plano(mapeado: Dict[str, Any], access_token: str) -> str:
    """
    Arquiva o plano ativo anterior e grava plan → sessions → exercises → sets na
    mesma transação Postgres (`save_training_plan`, migration 0006).

    Não há DELETE compensatório: qualquer erro SQL reverte também o arquivamento.
    Em timeout a resposta é conservadora (erro), embora o servidor possa ter
    confirmado a transação; repetir o mesmo payload/id é suportado pela RPC.
    """
    base_url, anon_key = _config()
    headers = _headers(anon_key, access_token)
    try:
        plan_id = mapeado["plan"]["id"]
        payload = {
            "p_plan": mapeado["plan"],
            "p_sessions": mapeado["sessions"],
            "p_exercises": mapeado["exercises"],
            "p_sets": mapeado["sets"],
        }
    except (KeyError, TypeError) as exc:
        raise PlanPersistenceError("Mapeamento do plano incompleto.") from exc

    try:
        response = requests.post(
            "{}/rest/v1/rpc/save_training_plan".format(base_url),
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise PlanPersistenceError(
            "Falha de rede ao confirmar a gravação atômica do plano: {}".format(exc)
        ) from exc

    if response.status_code >= 400:
        raise PlanPersistenceError(
            "Falha ao gravar o plano de forma atômica (HTTP {}).".format(
                response.status_code
            )
        )

    try:
        returned_plan_id = response.json()
    except ValueError as exc:
        raise PlanPersistenceError(
            "A RPC de gravação não devolveu confirmação válida do plano."
        ) from exc
    if returned_plan_id != plan_id:
        raise PlanPersistenceError(
            "A RPC confirmou um plan_id diferente do solicitado."
        )

    return plan_id
