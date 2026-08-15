# backend/tests/test_push_sender.py
# Espelha os 4 cenários provados em 13-SPIKE.md (seções 5a-5d) com
# `pywebpush.webpush` mockado: 410 -> apaga, 404 -> apaga, 400 -> propaga,
# 201/sucesso -> sem exceção. Também cobre endpoint_e_permitido (allowlist
# SSRF) e o upsert idempotente via PostgREST.

import os
import sys
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from pywebpush import WebPushException  # noqa: E402

from backend.services.push_sender import (  # noqa: E402
    SubscriptionError,
    delete_subscription,
    enviar_push,
    endpoint_e_permitido,
    upsert_subscription,
)

SUBSCRIPTION_ROW = {
    "endpoint": "https://web.push.apple.com/abc123",
    "p256dh": "chave-p256dh",
    "auth": "chave-auth",
}


def _webpush_exception(status_code):
    response = mock.Mock()
    response.status_code = status_code
    return WebPushException("Push failed", response=response)


def _response(status=201):
    response = mock.Mock()
    response.status_code = status
    return response


# --- Os 4 cenários do spike (13-SPIKE.md §5a-5d) ---


def test_410_gone_apaga_subscription():
    with mock.patch("backend.services.push_sender.webpush", side_effect=_webpush_exception(410)):
        resultado = enviar_push(SUBSCRIPTION_ROW, "payload", "chave-vapid", "mailto:teste@forcaapp.invalid")
    assert resultado is False


def test_404_not_found_apaga_subscription():
    with mock.patch("backend.services.push_sender.webpush", side_effect=_webpush_exception(404)):
        resultado = enviar_push(SUBSCRIPTION_ROW, "payload", "chave-vapid", "mailto:teste@forcaapp.invalid")
    assert resultado is False


def test_400_bad_request_propaga_sem_apagar():
    with mock.patch("backend.services.push_sender.webpush", side_effect=_webpush_exception(400)):
        with pytest.raises(WebPushException):
            enviar_push(SUBSCRIPTION_ROW, "payload", "chave-vapid", "mailto:teste@forcaapp.invalid")


def test_201_sucesso_nao_levanta_excecao():
    with mock.patch("backend.services.push_sender.webpush", return_value=_response(201)) as fake_webpush:
        resultado = enviar_push(SUBSCRIPTION_ROW, "payload", "chave-vapid", "mailto:teste@forcaapp.invalid")
    assert resultado is True
    fake_webpush.assert_called_once()
    _, kwargs = fake_webpush.call_args
    assert kwargs["subscription_info"] == {
        "endpoint": SUBSCRIPTION_ROW["endpoint"],
        "keys": {"p256dh": SUBSCRIPTION_ROW["p256dh"], "auth": SUBSCRIPTION_ROW["auth"]},
    }
    assert kwargs["vapid_claims"] == {"sub": "mailto:teste@forcaapp.invalid"}


def test_webpush_exception_sem_response_propaga():
    exc = WebPushException("timeout", response=None)
    with mock.patch("backend.services.push_sender.webpush", side_effect=exc):
        with pytest.raises(WebPushException):
            enviar_push(SUBSCRIPTION_ROW, "payload", "chave-vapid", "mailto:teste@forcaapp.invalid")


def test_enviar_push_recusa_endpoint_fora_da_allowlist_mesmo_vindo_do_banco():
    """CR-01 (13-REVIEW.md, iteração 2): endpoint_e_permitido() era checado
    SOMENTE em handle_push_subscribe (POST /api/push/subscribe). Uma linha
    maliciosa pode chegar em push_subscriptions pelo caminho PostgREST
    direto (INSERT/UPDATE concedido a `authenticated`, RLS só valida
    ownership, não o CONTEÚDO de `endpoint`) — simulado aqui passando um
    subscription_row com endpoint fora da allowlist diretamente para
    enviar_push, como se tivesse vindo de listar_subscriptions() sobre uma
    linha inserida via PostgREST direto. Defesa em profundidade: enviar_push
    tem que recusar e NUNCA chamar webpush(), devolvendo False pelo MESMO
    contrato do 404/410 (o chamador apaga a linha)."""
    subscription_maliciosa = {
        "endpoint": "http://169.254.169.254/latest/meta-data/",
        "p256dh": "chave-p256dh",
        "auth": "chave-auth",
    }
    with mock.patch("backend.services.push_sender.webpush") as fake_webpush:
        resultado = enviar_push(
            subscription_maliciosa, "payload", "chave-vapid", "mailto:teste@forcaapp.invalid"
        )
    assert resultado is False
    fake_webpush.assert_not_called()


# --- Allowlist de host (mitigação SSRF, T-13-01) ---


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://web.push.apple.com/abc",
        "https://fcm.googleapis.com/fcm/send/xyz",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://push.services.mozilla.com/wpush/v2/abc",
    ],
)
def test_endpoint_e_permitido_aceita_hosts_conhecidos(endpoint):
    assert endpoint_e_permitido(endpoint) is True


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://attacker.example.com/abc",
        "https://web.push.apple.com.attacker.com/abc",
        "http://169.254.169.254/latest/meta-data",
        "",
        "not-a-url",
        "https://",
        "https:// web.push.apple.com",
        "ftp://web.push.apple.com/abc",
    ],
)
def test_endpoint_e_permitido_rejeita_hosts_desconhecidos(endpoint):
    assert endpoint_e_permitido(endpoint) is False


# --- Upsert idempotente via PostgREST ---


def test_upsert_subscription_usa_merge_duplicates_e_on_conflict_endpoint():
    fake_response = mock.Mock(status_code=201)
    with mock.patch("backend.services.push_sender.requests.post", return_value=fake_response) as fake_post:
        upsert_subscription("user-1", "token-1", SUBSCRIPTION_ROW["endpoint"], "p256dh", "auth")

    fake_post.assert_called_once()
    _, kwargs = fake_post.call_args
    assert kwargs["headers"]["Prefer"] == "resolution=merge-duplicates,return=minimal"
    assert kwargs["params"] == {"on_conflict": "endpoint"}
    assert kwargs["json"]["user_id"] == "user-1"
    assert kwargs["json"]["endpoint"] == SUBSCRIPTION_ROW["endpoint"]


def test_upsert_subscription_chamada_dupla_com_mesmo_endpoint_nao_diverge():
    """Duplo clique/duas abas: duas chamadas ao upsert com o MESMO endpoint
    usam a mesma assinatura idempotente (mesmo on_conflict/Prefer) — o
    PostgREST resolve a colisão, o cliente não precisa de lógica especial."""
    fake_response = mock.Mock(status_code=201)
    with mock.patch("backend.services.push_sender.requests.post", return_value=fake_response) as fake_post:
        upsert_subscription("user-1", "token-1", SUBSCRIPTION_ROW["endpoint"], "p256dh", "auth")
        upsert_subscription("user-1", "token-1", SUBSCRIPTION_ROW["endpoint"], "p256dh", "auth")

    assert fake_post.call_count == 2
    primeira_chamada = fake_post.call_args_list[0].kwargs
    segunda_chamada = fake_post.call_args_list[1].kwargs
    assert primeira_chamada["params"] == segunda_chamada["params"] == {"on_conflict": "endpoint"}
    assert primeira_chamada["headers"]["Prefer"] == segunda_chamada["headers"]["Prefer"]
    assert primeira_chamada["json"]["endpoint"] == segunda_chamada["json"]["endpoint"]


def test_upsert_subscription_levanta_subscription_error_em_falha():
    fake_response = mock.Mock(status_code=500)
    with mock.patch("backend.services.push_sender.requests.post", return_value=fake_response):
        with pytest.raises(SubscriptionError):
            upsert_subscription("user-1", "token-1", SUBSCRIPTION_ROW["endpoint"], "p256dh", "auth")


def test_delete_subscription_filtra_por_endpoint_e_user_id():
    fake_response = mock.Mock(status_code=200)
    with mock.patch("backend.services.push_sender.requests.delete", return_value=fake_response) as fake_delete:
        delete_subscription("user-1", "token-1", SUBSCRIPTION_ROW["endpoint"])

    fake_delete.assert_called_once()
    _, kwargs = fake_delete.call_args
    assert kwargs["params"]["endpoint"] == "eq.{}".format(SUBSCRIPTION_ROW["endpoint"])
    assert kwargs["params"]["user_id"] == "eq.user-1"
