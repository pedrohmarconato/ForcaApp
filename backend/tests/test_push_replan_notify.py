# backend/tests/test_push_replan_notify.py
# POST /api/push/notify-replan-applied (PUSH-03): autenticação, best-effort
# (nunca 4xx/5xx por causa de uma subscription individual expirada ou
# ausência de subscription), identidade SEMPRE de g.user (JWT) — o corpo da
# requisição nunca decide de quem são as subscriptions.

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


USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"
SUBSCRIPTION_ROW = {
    "endpoint": "https://web.push.apple.com/abc123",
    "p256dh": "chave-p256dh",
    "auth": "chave-auth",
}


# --- Autenticação ---


def test_notify_replan_sem_token_retorna_401(client):
    response = client.post("/api/push/notify-replan-applied", json={})
    assert response.status_code == 401


# --- Sucesso: uma subscription cadastrada ---


def test_notify_replan_com_uma_subscription_chama_enviar_push_e_retorna_sent_1(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.listar_subscriptions", return_value=[SUBSCRIPTION_ROW]), \
         mock.patch("backend.app.enviar_push", return_value=True) as fake_enviar:
        response = client.post(
            "/api/push/notify-replan-applied",
            json={},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    assert response.get_json() == {"sent": 1}
    fake_enviar.assert_called_once()


# --- Usuário sem nenhuma subscription: 200 com sent=0, nunca erro ---


def test_notify_replan_sem_subscription_retorna_200_sent_0(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.listar_subscriptions", return_value=[]), \
         mock.patch("backend.app.enviar_push") as fake_enviar:
        response = client.post(
            "/api/push/notify-replan-applied",
            json={},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    assert response.get_json() == {"sent": 0}
    fake_enviar.assert_not_called()


# --- enviar_push False (expirada): apaga a subscription, não conta em sent ---


def test_notify_replan_subscription_expirada_apaga_e_nao_conta_em_sent(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.listar_subscriptions", return_value=[SUBSCRIPTION_ROW]), \
         mock.patch("backend.app.enviar_push", return_value=False), \
         mock.patch("backend.app.delete_subscription") as fake_delete:
        response = client.post(
            "/api/push/notify-replan-applied",
            json={},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    assert response.get_json() == {"sent": 0}
    fake_delete.assert_called_once_with(USER_ID, "token-valido", SUBSCRIPTION_ROW["endpoint"])


# --- WR-01 (13-REVIEW.md, iteração 3): enviar_push devolvendo None (recusa
# de allowlist) NÃO apaga a subscription -- distinto do 404/410 (False)
# acima, que continua apagando. ---


def test_notify_replan_allowlist_rejeitada_nao_apaga_e_nao_conta_em_sent(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.listar_subscriptions", return_value=[SUBSCRIPTION_ROW]), \
         mock.patch("backend.app.enviar_push", return_value=None), \
         mock.patch("backend.app.delete_subscription") as fake_delete:
        response = client.post(
            "/api/push/notify-replan-applied",
            json={},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    assert response.get_json() == {"sent": 0}
    fake_delete.assert_not_called()


# --- Identidade: user_id do corpo é IGNORADO, só g.user decide ---


def test_notify_replan_nunca_usa_user_id_do_corpo(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response(USER_ID)), \
         mock.patch("backend.app.listar_subscriptions", return_value=[]) as fake_listar:
        response = client.post(
            "/api/push/notify-replan-applied",
            json={"user_id": "user-de-outro-aluno"},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    fake_listar.assert_called_once_with(USER_ID, "token-valido")


# --- Rate limit: mesmo bucket de push_subscribe ---


def test_notify_replan_respeita_rate_limit(client):
    import backend.app as app_module

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app.listar_subscriptions", return_value=[]), \
         mock.patch.object(app_module, "PUSH_RATE_LIMIT", 1):
        r1 = client.post(
            "/api/push/notify-replan-applied",
            json={},
            headers={"Authorization": "Bearer token-valido"},
        )
        r2 = client.post(
            "/api/push/notify-replan-applied",
            json={},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert r1.status_code == 200
    assert r2.status_code == 429
