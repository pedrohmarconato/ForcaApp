# backend/services/push_sender.py
# CRUD de push_subscriptions via PostgREST (mesmo padrão de plan_repository.py:
# anon key + Authorization: Bearer <token do usuário>, RLS aplica) + envio real
# de Web Push via pywebpush, com o contrato 410/404 -> apagar subscription
# provado em 13-SPIKE.md (seções 5a-5d).

import os
from typing import Dict, List, Optional

import requests
from pywebpush import WebPushException, webpush

REQUEST_TIMEOUT_SECONDS = 20

# Códigos que significam "subscription não existe mais no push service" —
# ÚNICOS que disparam DELETE da linha. Qualquer outro erro propaga sem apagar
# nada (contrato provado no spike, seção 5d: 400 NÃO apaga).
EXPIRED_STATUS_CODES = (404, 410)

# Allowlist de hosts de push service conhecidos (Apple/Mozilla/Google) —
# mitigação do achado de Tampering/SSRF de 13-RESEARCH.md ("Known Threat
# Patterns"): sem isto, /api/push/subscribe viraria um proxy autenticado que
# aceita POST assinado para QUALQUER endpoint.
PUSH_SERVICE_HOST_SUFFIXES = (
    ".push.apple.com",
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
)


class SubscriptionError(RuntimeError):
    """Falha ao gravar/remover/listar uma subscription de push via PostgREST."""


def _config():
    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY") or ""
    if not base_url or not anon_key:
        raise SubscriptionError("SUPABASE_URL/SUPABASE_ANON_KEY não configurados no backend.")
    return base_url, anon_key


def _headers(anon_key: str, access_token: str, prefer: Optional[str] = None) -> Dict[str, str]:
    headers = {
        "apikey": anon_key,
        "Authorization": "Bearer {}".format(access_token),
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def endpoint_e_permitido(endpoint: str) -> bool:
    """Valida LOCALMENTE (sem chamada externa) que o endpoint é utilizável e
    pertence a um push service conhecido — mesma lógica de base de
    `_is_usable_http_url` (backend/app.py): scheme http(s), hostname presente,
    sem whitespace; ADICIONALMENTE checa que o hostname termina em um dos
    sufixos da allowlist (Apple/Mozilla/Google).
    """
    from urllib.parse import urlparse

    if not endpoint or any(caractere.isspace() for caractere in endpoint):
        return False
    try:
        parsed = urlparse(endpoint)
        hostname = parsed.hostname
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https") or not hostname:
        return False
    return any(hostname.endswith(sufixo) for sufixo in PUSH_SERVICE_HOST_SUFFIXES)


def upsert_subscription(
    user_id: str,
    access_token: str,
    endpoint: str,
    p256dh: str,
    auth_key: str,
) -> None:
    """Upsert idempotente por `endpoint` (UNIQUE): duplo clique/duas abas do
    mesmo aluno resolvem no mesmo endpoint, sem duplicar linha (`on_conflict`).
    """
    base_url, anon_key = _config()
    headers = _headers(
        anon_key,
        access_token,
        prefer="resolution=merge-duplicates,return=minimal",
    )
    import datetime

    payload = {
        "user_id": user_id,
        "endpoint": endpoint,
        "p256dh": p256dh,
        "auth": auth_key,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    try:
        response = requests.post(
            "{}/rest/v1/push_subscriptions".format(base_url),
            headers=headers,
            params={"on_conflict": "endpoint"},
            json=payload,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise SubscriptionError(
            "Falha de rede ao gravar a subscription de push: {}".format(exc)
        ) from exc

    if response.status_code >= 400:
        raise SubscriptionError(
            "Falha ao gravar a subscription de push (HTTP {}).".format(response.status_code)
        )


def delete_subscription(user_id: str, access_token: str, endpoint: str) -> None:
    """DELETE idempotente: nunca falha por "já não existia" — defesa em
    profundidade filtrando por user_id explicitamente, mesmo com RLS.
    """
    base_url, anon_key = _config()
    headers = _headers(anon_key, access_token)
    try:
        response = requests.delete(
            "{}/rest/v1/push_subscriptions".format(base_url),
            headers=headers,
            params={
                "endpoint": "eq.{}".format(endpoint),
                "user_id": "eq.{}".format(user_id),
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise SubscriptionError(
            "Falha de rede ao remover a subscription de push: {}".format(exc)
        ) from exc

    if response.status_code >= 400:
        raise SubscriptionError(
            "Falha ao remover a subscription de push (HTTP {}).".format(response.status_code)
        )


def listar_subscriptions(user_id: str, access_token: str) -> List[dict]:
    """Lista as subscriptions do usuário (usada pelos Planos 13-02/13-03, não
    chamada nesta task).
    """
    base_url, anon_key = _config()
    headers = _headers(anon_key, access_token)
    try:
        response = requests.get(
            "{}/rest/v1/push_subscriptions".format(base_url),
            headers=headers,
            params={
                "user_id": "eq.{}".format(user_id),
                "select": "endpoint,p256dh,auth",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise SubscriptionError(
            "Falha de rede ao listar subscriptions de push: {}".format(exc)
        ) from exc

    if response.status_code >= 400:
        raise SubscriptionError(
            "Falha ao listar subscriptions de push (HTTP {}).".format(response.status_code)
        )
    try:
        return response.json()
    except ValueError as exc:
        raise SubscriptionError(
            "Resposta inválida ao listar subscriptions de push."
        ) from exc


def enviar_push(
    subscription_row: dict,
    payload: str,
    vapid_private_key: str,
    vapid_subject: str,
) -> bool:
    """Envia um push real via pywebpush.

    Devolve True se enviado com sucesso. Devolve False quando o push service
    respondeu 404/410 (subscription expirada/inexistente) — o CHAMADOR é
    responsável por apagar a linha correspondente. Qualquer outro erro
    (WebPushException com outro status, ou sem response) é relançado, NUNCA
    mascarado por um catch-all — mesmo contrato provado em 13-SPIKE.md
    seções 5a-5d.
    """
    subscription_info = {
        "endpoint": subscription_row["endpoint"],
        "keys": {
            "p256dh": subscription_row["p256dh"],
            "auth": subscription_row["auth"],
        },
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=vapid_private_key,
            vapid_claims={"sub": vapid_subject},
            ttl=3600,
            headers={"Urgency": "normal"},
            timeout=10,
        )
        return True
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in EXPIRED_STATUS_CODES:
            return False
        raise
