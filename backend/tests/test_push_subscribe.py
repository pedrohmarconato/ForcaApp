# backend/tests/test_push_subscribe.py
# POST /api/push/subscribe: autenticação, allowlist de endpoint (SSRF),
# upsert idempotente. DELETE /api/push/subscribe (Task 3 do Plano 13-01) é
# adicionado na mesma suíte quando a rota existir.

import os
import sys
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"
os.environ.pop("ANTHROPIC_API_KEY", None)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import app  # noqa: E402


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _limpa_rate_limits():
    import backend.app as app_module

    buckets = getattr(app_module, "_rate_buckets", None)
    if isinstance(buckets, dict):
        buckets.clear()
    yield


def _fake_user_response(user_id="3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"):
    response = mock.Mock()
    response.status_code = 200
    response.json.return_value = {"id": user_id, "email": "user@teste.com"}
    return response


ENDPOINT_VALIDO = "https://web.push.apple.com/abc123"


def _corpo_valido(endpoint=ENDPOINT_VALIDO):
    return {
        "endpoint": endpoint,
        "keys": {"p256dh": "chave-p256dh", "auth": "chave-auth"},
    }


# --- Autenticação ---


def test_subscribe_sem_token_retorna_401(client):
    response = client.post("/api/push/subscribe", json=_corpo_valido())
    assert response.status_code == 401


# --- Allowlist de host (SSRF) ---


def test_subscribe_com_endpoint_fora_da_allowlist_retorna_400(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/push/subscribe",
            json=_corpo_valido(endpoint="https://attacker.example.com/abc"),
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 400


def test_subscribe_com_corpo_incompleto_retorna_400(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/push/subscribe",
            json={"endpoint": ENDPOINT_VALIDO, "keys": {"p256dh": "chave"}},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 400


# --- Upsert com sucesso ---


def test_subscribe_com_token_valido_chama_upsert_com_merge_duplicates(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.upsert_subscription") as fake_upsert:
        response = client.post(
            "/api/push/subscribe",
            json=_corpo_valido(),
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 201
    assert response.get_json()["status"] == "subscribed"
    fake_upsert.assert_called_once()
    args, _ = fake_upsert.call_args
    assert args[2] == ENDPOINT_VALIDO


def test_subscribe_falha_de_persistencia_retorna_502(client):
    from backend.services.push_sender import SubscriptionError

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.upsert_subscription", side_effect=SubscriptionError("falhou")):
        response = client.post(
            "/api/push/subscribe",
            json=_corpo_valido(),
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 502


# --- Concorrência: duplo clique / duas abas com o MESMO endpoint ---


def test_duas_chamadas_com_mesmo_endpoint_nao_geram_upserts_divergentes(client):
    """Duplo clique/duas abas: o endpoint envia o MESMO corpo duas vezes.
    O handler chama upsert_subscription() duas vezes, mas com a MESMA
    assinatura de argumentos (mesmo endpoint) — o upsert real (testado em
    test_push_sender.py) é quem garante a idempotência via on_conflict.
    """
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.upsert_subscription") as fake_upsert:
        r1 = client.post(
            "/api/push/subscribe",
            json=_corpo_valido(),
            headers={"Authorization": "Bearer token-valido"},
        )
        r2 = client.post(
            "/api/push/subscribe",
            json=_corpo_valido(),
            headers={"Authorization": "Bearer token-valido"},
        )

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert fake_upsert.call_count == 2
    primeira, segunda = fake_upsert.call_args_list
    assert primeira.args[2] == segunda.args[2] == ENDPOINT_VALIDO
    assert primeira.args[3] == segunda.args[3]  # mesmo p256dh
    assert primeira.args[4] == segunda.args[4]  # mesmo auth
