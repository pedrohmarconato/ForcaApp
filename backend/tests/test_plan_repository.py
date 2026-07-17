# backend/tests/test_plan_repository.py
# Testes do gravador do plano no Supabase (PostgREST), com rede mockada.
# Modos de falha cobertos:
# - ordem de inserção respeita as FKs (plan → sessions → exercises → sets)
# - escrita usa o JWT DO USUÁRIO (RLS), nunca service role
# - falha no meio → limpeza (DELETE do plano, cascade) + erro claro
# - listas grandes são fatiadas (chunk) para não estourar o PostgREST

import os
import sys
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
for path in (BACKEND_DIR, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from services.plan_repository import (  # noqa: E402
    PlanPersistenceError,
    persistir_plano,
)

TOKEN = "jwt-do-usuario"


def _mapeado(num_sets=3):
    return {
        "plan": {"id": "plan-1", "user_id": "u-1", "name": "Plano"},
        "sessions": [{"id": "s-1", "plan_id": "plan-1"}],
        "exercises": [{"id": "e-1", "session_id": "s-1"}],
        "sets": [{"id": f"set-{i}", "exercise_id": "e-1"} for i in range(num_sets)],
    }


def _resposta(status=201):
    resposta = mock.Mock()
    resposta.status_code = status
    resposta.text = "" if status < 400 else "erro simulado"
    return resposta


def test_insere_na_ordem_das_fks_e_retorna_plan_id():
    with mock.patch("services.plan_repository.requests.post", return_value=_resposta()) as post:
        plan_id = persistir_plano(_mapeado(), access_token=TOKEN)

    assert plan_id == "plan-1"
    tabelas = [chamada.args[0].rsplit("/", 1)[-1] for chamada in post.call_args_list]
    assert tabelas == ["training_plans", "planned_sessions", "planned_exercises", "planned_sets"]


def test_usa_jwt_do_usuario_e_anon_key():
    with mock.patch("services.plan_repository.requests.post", return_value=_resposta()) as post:
        persistir_plano(_mapeado(), access_token=TOKEN)

    for chamada in post.call_args_list:
        headers = chamada.kwargs["headers"]
        assert headers["Authorization"] == f"Bearer {TOKEN}"
        assert headers["apikey"] == "anon-key-teste"
        assert headers["Prefer"] == "return=minimal"


def test_falha_no_meio_limpa_o_plano_e_levanta_erro():
    respostas = [_resposta(201), _resposta(500)]  # plano OK, sessões falham

    with mock.patch("services.plan_repository.requests.post", side_effect=respostas), \
         mock.patch("services.plan_repository.requests.delete", return_value=_resposta(204)) as delete:
        with pytest.raises(PlanPersistenceError):
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert delete.call_count == 1
    url = delete.call_args.args[0]
    assert url.endswith("/training_plans")
    assert delete.call_args.kwargs["params"] == {"id": "eq.plan-1"}


def test_erro_de_rede_tambem_limpa_e_levanta_erro():
    import requests as requests_lib

    with mock.patch(
        "services.plan_repository.requests.post",
        side_effect=[_resposta(201), requests_lib.ConnectionError("rede caiu")],
    ), mock.patch("services.plan_repository.requests.delete", return_value=_resposta(204)) as delete:
        with pytest.raises(PlanPersistenceError):
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert delete.call_count == 1


def test_listas_grandes_sao_fatiadas():
    with mock.patch("services.plan_repository.requests.post", return_value=_resposta()) as post:
        persistir_plano(_mapeado(num_sets=450), access_token=TOKEN)

    chamadas_sets = [c for c in post.call_args_list if c.args[0].endswith("planned_sets")]
    assert len(chamadas_sets) == 3  # 450 em fatias de 200
    total = sum(len(c.kwargs["json"]) for c in chamadas_sets)
    assert total == 450
