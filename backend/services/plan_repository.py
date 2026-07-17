# backend/services/plan_repository.py
# Grava o plano mapeado no Supabase via PostgREST.
# Segurança: a escrita usa o JWT DO USUÁRIO (Authorization: Bearer) + anon key,
# então o RLS do banco vale — o backend não tem (nem precisa de) service role.
# Consistência: se qualquer inserção falhar, o plano é apagado (DELETE com
# cascade remove sessões/exercícios/séries) e um erro claro é levantado.

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


def _limpar_plano(base_url: str, headers: Dict[str, str], plan_id: str) -> None:
    """Best-effort: remove o plano parcial (cascade limpa os filhos)."""
    try:
        requests.delete(
            "{}/rest/v1/{}".format(base_url, "training_plans"),
            headers=headers,
            params={"id": "eq.{}".format(plan_id)},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        pass  # limpeza é best-effort; o erro original é o que importa


def persistir_plano(mapeado: Dict[str, Any], access_token: str) -> str:
    """
    Insere plan → sessions → exercises → sets (ordem das FKs).
    Retorna o id do plano gravado. Levanta PlanPersistenceError em falha.
    """
    base_url, anon_key = _config()
    headers = _headers(anon_key, access_token)
    plan = mapeado["plan"]
    plan_id = plan["id"]

    try:
        _inserir(base_url, headers, "training_plans", plan)
    except (PlanPersistenceError, requests.RequestException) as exc:
        raise PlanPersistenceError("Falha ao gravar o plano: {}".format(exc)) from exc

    try:
        _inserir_em_fatias(base_url, headers, "planned_sessions", mapeado["sessions"])
        _inserir_em_fatias(base_url, headers, "planned_exercises", mapeado["exercises"])
        _inserir_em_fatias(base_url, headers, "planned_sets", mapeado["sets"])
    except (PlanPersistenceError, requests.RequestException) as exc:
        _limpar_plano(base_url, headers, plan_id)
        raise PlanPersistenceError(
            "Falha ao gravar os detalhes do plano (plano parcial removido): {}".format(exc)
        ) from exc

    return plan_id
