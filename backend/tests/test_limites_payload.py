# backend/tests/test_limites_payload.py
# VALID-01 do review defensivo de 31/07/2026.
#
# O modo de falha: /api/chat media o questionário (32 KiB), mas
# /api/consolidate-chat e /api/generate-plan aceitavam qualquer dict e o
# serializavam inteiro dentro do prompt pago — o único teto era o do corpo da
# requisição, 256 KiB. Cada teste aqui manda um payload grande e prova que a
# rota recusa ANTES de chamar o modelo.

import json
import os
import sys
import types
import unittest.mock as mock

import jsonschema
import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app_module  # noqa: E402
from backend.app import app  # noqa: E402
from backend.schemas.diretrizes_schema import (  # noqa: E402
    DIRETRIZES_SCHEMA, MAX_ITENS_POR_LISTA, podar_chaves_desconhecidas,
)

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


def _questionario_gigante(kib=64):
    """Dict válido em forma, grande em bytes — bem abaixo dos 256 KiB do corpo."""
    return {"notas": "x" * (kib * 1024)}


def _diretrizes_validas():
    return {"preferencias": [], "restricoes": [], "excecoes_estruturais": []}


# --- 1. /api/consolidate-chat mede o questionário ---

def test_consolidate_recusa_questionario_gigante_sem_chamar_o_modelo(client):
    anthropic = mock.Mock()
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [{"role": "user", "content": "Oi"}],
                "questionnaireData": _questionario_gigante(64),
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400
    assert "questionnaireData" in resposta.get_json()["error"]
    assert anthropic.messages.create.call_count == 0


# --- 2. /api/generate-plan mede questionário e diretrizes ---

def test_generate_plan_recusa_questionario_gigante(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        resposta = client.post(
            "/api/generate-plan",
            json={"questionnaireData": _questionario_gigante(64)},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400
    assert "questionnaireData" in resposta.get_json()["error"]


def test_generate_plan_recusa_diretrizes_gigantes(monkeypatch, client):
    """As diretrizes viram texto do prompt do molde — precisam de teto próprio."""
    monkeypatch.setattr(app_module, "FORCA_USE_MOLDE_ARCHITECTURE", True)
    diretrizes = _diretrizes_validas()
    diretrizes["observacoes_gerais"] = "y" * (32 * 1024)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.criar_job") as criar_job:
        resposta = client.post(
            "/api/generate-plan",
            json={"questionnaireData": {"idade": 30}, "diretrizes": diretrizes},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400
    assert "diretrizes" in resposta.get_json()["error"]
    assert criar_job.call_count == 0  # nenhum job, nenhuma geração paga


# --- 3. O schema fechado recusa o desconhecido vindo do CLIENTE ---

def test_diretrizes_com_campo_extra_do_cliente_sao_recusadas(monkeypatch, client):
    monkeypatch.setattr(app_module, "FORCA_USE_MOLDE_ARCHITECTURE", True)
    diretrizes = _diretrizes_validas()
    diretrizes["payload_extra"] = "x" * 100

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.criar_job") as criar_job:
        resposta = client.post(
            "/api/generate-plan",
            json={"questionnaireData": {"idade": 30}, "diretrizes": diretrizes},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400
    assert criar_job.call_count == 0


def test_schema_limita_a_quantidade_de_itens_por_lista():
    diretrizes = _diretrizes_validas()
    diretrizes["preferencias"] = ["ok"] * (MAX_ITENS_POR_LISTA + 1)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(diretrizes, DIRETRIZES_SCHEMA)


def test_schema_limita_as_chaves_de_detalhes():
    diretrizes = _diretrizes_validas()
    diretrizes["excecoes_estruturais"] = [{
        "tipo": "outro",
        "descricao": "x",
        "detalhes": {str(i): i for i in range(500)},
    }]
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(diretrizes, DIRETRIZES_SCHEMA)


# --- 4. ...mas NÃO transforma o ruído do modelo em 502 ---

def test_campo_extra_vindo_do_modelo_e_podado_e_a_rota_responde_200(client):
    """
    A consolidação não tem retry: reprovar por uma chave a mais que o modelo
    inventou trocaria ruído ignorável por erro de produto. A poda vale só aqui,
    onde a origem é o modelo — nunca na entrada do cliente.
    """
    diretrizes_do_modelo = _diretrizes_validas()
    diretrizes_do_modelo["campo_que_o_modelo_inventou"] = "ruído"

    bloco = types.SimpleNamespace(type="text", text=json.dumps(diretrizes_do_modelo))
    anthropic = mock.Mock()
    anthropic.messages.create.return_value = types.SimpleNamespace(
        content=[bloco],
        usage=types.SimpleNamespace(
            input_tokens=10, output_tokens=10,
            cache_creation_input_tokens=0, cache_read_input_tokens=0,
        ),
    )

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200
    devolvidas = resposta.get_json()["diretrizes"]
    assert "campo_que_o_modelo_inventou" not in devolvidas


# --- 5. Modo legado: adjustments passa pelo mesmo saneamento do chat ---

def test_modo_legado_saneia_adjustments(monkeypatch, client):
    """
    `adjustments` virava texto de `conversa_chat` sem saneamento nenhum,
    enquanto /api/chat já limitava os mesmos campos.
    """
    monkeypatch.setattr(app_module, "FORCA_USE_MOLDE_ARCHITECTURE", False)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        resposta = client.post(
            "/api/generate-plan",
            json={
                "questionnaireData": {"idade": 30},
                "adjustments": ["z" * 50_000],  # acima do MAX_ADJUSTMENT_LENGTH
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400
    assert "adjustments" in resposta.get_json()["error"]


def test_modo_legado_recusa_adjustments_em_excesso(monkeypatch, client):
    monkeypatch.setattr(app_module, "FORCA_USE_MOLDE_ARCHITECTURE", False)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        resposta = client.post(
            "/api/generate-plan",
            json={
                "questionnaireData": {"idade": 30},
                "adjustments": ["ok"] * (app_module.MAX_ADJUSTMENTS_ITEMS + 1),
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400
    assert "adjustments" in resposta.get_json()["error"]


# --- 6. A poda não estraga diretriz legítima ---

def test_poda_preserva_todo_campo_declarado():
    completa = {
        "preferencias": ["focar em peito"],
        "restricoes": [{
            "descricao": "evitar supino", "tipo": "exercicio_especifico",
            "exercicio_afetado": "Supino", "grupo_afetado": "Peito",
        }],
        "excecoes_estruturais": [{
            "tipo": "dias_alternados", "descricao": "seg/qua/sex",
            "detalhes": {"dias": [1, 3, 5]},
        }],
        "observacoes_gerais": "treina de manhã",
    }
    assert podar_chaves_desconhecidas(completa) == completa
    jsonschema.validate(completa, DIRETRIZES_SCHEMA)
