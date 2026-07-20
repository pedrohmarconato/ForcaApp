# backend/tests/test_generate_plan_persistence.py
# Fase 3 — o endpoint /api/generate-plan agora GRAVA o plano gerado.
# Modos de falha cobertos:
# - sucesso: devolve o plan_id DO BANCO (não o treinamento_id da IA)
# - gravação falha → 502 com mensagem honesta (nada de sucesso otimista)
# - plano da IA sem sessões → 502 (mapeamento inválido não passa batido)
# - a gravação usa o JWT do usuário recebido no header

import os
import sys
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"
os.environ.pop("ANTHROPIC_API_KEY", None)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app_module  # noqa: E402
from backend.app import app  # noqa: E402
from backend.services.plan_repository import PlanPersistenceError  # noqa: E402

USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _limpa_rate_limits():
    buckets = getattr(app_module, "_rate_buckets", None)
    if isinstance(buckets, dict):
        buckets.clear()
    yield


def _fake_user_response():
    resposta = mock.Mock()
    resposta.status_code = 200
    resposta.json.return_value = {"id": USER_ID, "email": "user@teste.com"}
    return resposta


def _plano_valido():
    return {
        "treinamento_id": "0b6c1c2d-1111-4222-8333-444455556666",
        "plano_principal": {
            "nome": "Plano Teste",
            "ciclos": [{"microciclos": [{"semana": 1, "sessoes": [
                {"nome": "Treino A", "dia_semana": "segunda", "exercicios": [
                    {"nome": "Supino", "ordem": 1, "series": 3, "repeticoes": "8-12"}
                ]}
            ]}]}],
        },
    }


class FakeTreinador:
    def __init__(self, plano):
        self._plano = plano

    def gerar_plano(self, dados_usuario):
        return self._plano


def _post_generate(client):
    return client.post(
        "/api/generate-plan",
        json={"questionnaireData": {"nivelExperiencia": "iniciante"}},
        headers={"Authorization": "Bearer token-valido"},
    )


def test_sucesso_devolve_plan_id_do_banco(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch.object(app_module, "treinador", FakeTreinador(_plano_valido())), \
         mock.patch.object(app_module, "persistir_plano", return_value="db-plan-42") as persistir:
        response = _post_generate(client)

    assert response.status_code == 200
    corpo = response.get_json()
    assert corpo["plan_id"] == "db-plan-42"

    # A gravação recebeu o mapeamento e o JWT do usuário
    assert persistir.call_count == 1
    mapeado = persistir.call_args.args[0]
    assert mapeado["plan"]["user_id"] == USER_ID
    assert persistir.call_args.kwargs["access_token"] == "token-valido"


def test_falha_na_gravacao_retorna_502_sem_sucesso_otimista(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch.object(app_module, "treinador", FakeTreinador(_plano_valido())), \
         mock.patch.object(
             app_module, "persistir_plano",
             side_effect=PlanPersistenceError("banco indisponível"),
         ):
        response = _post_generate(client)

    assert response.status_code == 502
    corpo = response.get_json()
    assert "não pôde ser salvo" in corpo["error"]
    assert "plan_id" not in corpo


def test_plano_da_ia_sem_sessoes_retorna_502(client):
    plano_vazio = {"treinamento_id": "x", "plano_principal": {"nome": "Vazio", "ciclos": []}}
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch.object(app_module, "treinador", FakeTreinador(plano_vazio)), \
         mock.patch.object(app_module, "persistir_plano") as persistir:
        response = _post_generate(client)

    assert response.status_code == 502
    assert persistir.call_count == 0  # nem tenta gravar mapeamento inválido
