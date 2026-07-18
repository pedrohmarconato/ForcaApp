# backend/tests/test_plan_repository.py
# A fronteira HTTP deve fazer uma única chamada à RPC transacional da migration
# 0006. Os testes não fingem transação com compensação mockada: falha = uma RPC
# rejeitada e nenhum PATCH/DELETE separado.

import os
import sys
import unittest.mock as mock
from pathlib import Path

import pytest
import requests as requests_lib

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
for path in (BACKEND_DIR, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from services.plan_repository import PlanPersistenceError, persistir_plano  # noqa: E402

TOKEN = "jwt-do-usuario"


def _mapeado(num_sets=3):
    return {
        "plan": {"id": "plan-1", "user_id": "u-1", "name": "Plano"},
        "sessions": [{"id": "s-1", "plan_id": "plan-1", "user_id": "u-1"}],
        "exercises": [{"id": "e-1", "session_id": "s-1"}],
        "sets": [{"id": "set-{}".format(i), "exercise_id": "e-1"} for i in range(num_sets)],
    }


def _response(status=200, body="plan-1"):
    response = mock.Mock()
    response.status_code = status
    response.json.return_value = body
    return response


def test_uma_rpc_recebe_arvore_completa_e_jwt_do_usuario():
    with mock.patch(
        "services.plan_repository.requests.post", return_value=_response()
    ) as post, mock.patch("services.plan_repository.requests.patch") as patch, mock.patch(
        "services.plan_repository.requests.delete"
    ) as delete:
        plan_id = persistir_plano(_mapeado(), access_token=TOKEN)

    assert plan_id == "plan-1"
    assert post.call_count == 1
    call = post.call_args
    assert call.args[0] == "https://teste.supabase.co/rest/v1/rpc/save_training_plan"
    assert call.kwargs["headers"]["Authorization"] == "Bearer {}".format(TOKEN)
    assert call.kwargs["headers"]["apikey"] == "anon-key-teste"
    assert call.kwargs["json"] == {
        "p_plan": _mapeado()["plan"],
        "p_sessions": _mapeado()["sessions"],
        "p_exercises": _mapeado()["exercises"],
        "p_sets": _mapeado()["sets"],
    }
    patch.assert_not_called()
    delete.assert_not_called()


def test_payload_grande_continua_em_uma_unica_transacao_http():
    mapped = _mapeado(num_sets=450)
    with mock.patch(
        "services.plan_repository.requests.post", return_value=_response()
    ) as post:
        persistir_plano(mapped, access_token=TOKEN)

    assert post.call_count == 1
    assert len(post.call_args.kwargs["json"]["p_sets"]) == 450


def test_erro_sql_da_rpc_propaga_sem_tentar_limpeza_compensatoria():
    with mock.patch(
        "services.plan_repository.requests.post", return_value=_response(status=409)
    ), mock.patch("services.plan_repository.requests.delete") as delete:
        with pytest.raises(PlanPersistenceError, match="atômica"):
            persistir_plano(_mapeado(), access_token=TOKEN)

    delete.assert_not_called()


def test_timeout_e_reportado_sem_afirmar_sucesso_ou_remocao():
    with mock.patch(
        "services.plan_repository.requests.post",
        side_effect=requests_lib.Timeout("estourou"),
    ), mock.patch("services.plan_repository.requests.delete") as delete:
        with pytest.raises(PlanPersistenceError) as exc:
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert "confirmar" in str(exc.value)
    assert "removido" not in str(exc.value)
    delete.assert_not_called()


def test_resposta_sem_o_mesmo_plan_id_nao_vira_sucesso_otimista():
    with mock.patch(
        "services.plan_repository.requests.post",
        return_value=_response(body="outro-plan"),
    ):
        with pytest.raises(PlanPersistenceError, match="diferente"):
            persistir_plano(_mapeado(), access_token=TOKEN)


def test_mapeamento_incompleto_falha_antes_da_rede():
    with mock.patch("services.plan_repository.requests.post") as post:
        with pytest.raises(PlanPersistenceError, match="incompleto"):
            persistir_plano({"plan": {"id": "plan-1"}}, access_token=TOKEN)
    post.assert_not_called()


def test_migration_declara_serializacao_rls_e_todas_as_insercoes():
    sql = (
        Path(REPO_ROOT) / "supabase" / "migrations" / "0006_save_training_plan.sql"
    ).read_text(encoding="utf-8").lower()
    assert "security invoker" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "delete from public.training_plans" not in sql
    assert "profiles.current_plan_id" in sql
    assert "update public.training_plans" in sql
    for table in (
        "training_plans",
        "planned_sessions",
        "planned_exercises",
        "planned_sets",
    ):
        assert "insert into public.{}".format(table) in sql
