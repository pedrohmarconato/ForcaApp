# backend/services/push_sender.py
# CRUD de push_subscriptions via PostgREST (mesmo padrão de plan_repository.py:
# anon key + Authorization: Bearer <token do usuário>, RLS aplica) + envio real
# de Web Push via pywebpush, com o contrato 410/404 -> apagar subscription
# provado em 13-SPIKE.md (seções 5a-5d).

import logging
import os
from typing import Dict, List, Optional

import requests
from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 20

# Códigos que significam "subscription não existe mais no push service" —
# ÚNICOS que disparam DELETE da linha. Qualquer outro erro propaga sem apagar
# nada (contrato provado no spike, seção 5d: 400 NÃO apaga).
EXPIRED_STATUS_CODES = (404, 410)

# Allowlist de hosts de push service conhecidos (Apple/Mozilla/Google) —
# mitigação do achado de Tampering/SSRF de 13-RESEARCH.md ("Known Threat
# Patterns"): sem isto, /api/push/subscribe viraria um proxy autenticado que
# aceita POST assinado para QUALQUER endpoint. Entradas SEM ponto à esquerda
# (IN-02 de 13-REVIEW.md, iteração 3): o boundary de subdomínio é aplicado
# uniformemente por `endpoint_e_permitido` (exact match OU sufixo com "."),
# nunca por `str.endswith()` cru — isso evita que
# "evilfcm.googleapis.com".endswith("fcm.googleapis.com") (True, bug clássico
# de suffix-check) autorize um host que não é o vendor real.
PUSH_SERVICE_HOST_SUFFIXES = (
    "push.apple.com",
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
    sem whitespace; ADICIONALMENTE checa que o hostname é EXATAMENTE um dos
    hosts da allowlist ou um subdomínio dele (boundary de "." — IN-02 de
    13-REVIEW.md, iteração 3: `hostname.endswith(sufixo)` cru deixava
    "evilfcm.googleapis.com" casar o sufixo "fcm.googleapis.com" por ser uma
    substring no fim, sem "." de fronteira entre os dois).
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
    return any(
        hostname == sufixo or hostname.endswith("." + sufixo)
        for sufixo in PUSH_SERVICE_HOST_SUFFIXES
    )


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
) -> Optional[bool]:
    """Envia um push real via pywebpush.

    Devolve True se enviado com sucesso. Devolve False APENAS quando o push
    service respondeu 404/410 (subscription confirmada expirada/inexistente)
    — o CHAMADOR é responsável por apagar a linha correspondente nesse caso.
    Devolve None quando o PRÓPRIO allowlist recusou o endpoint antes de
    qualquer tentativa de envio (ver WR-01 abaixo) — isto NÃO é uma expiração
    confirmada pelo push service, o chamador NÃO deve apagar a subscription.
    Qualquer outro erro (WebPushException com outro status, ou sem response)
    é relançado, NUNCA mascarado por um catch-all — mesmo contrato provado em
    13-SPIKE.md seções 5a-5d.

    Defesa em profundidade (CR-01 de 13-REVIEW.md, iteração 2):
    `endpoint_e_permitido()` era checado SOMENTE em `handle_push_subscribe`
    (POST /api/push/subscribe) — uma linha maliciosa podia chegar em
    `push_subscriptions` pelo caminho PostgREST direto (INSERT/UPDATE
    concedido a `authenticated`, RLS só valida ownership, não o CONTEÚDO de
    `endpoint`) e ser enviada sem re-checagem por qualquer chamador de
    `enviar_push`. Por isso o allowlist é revalidado AQUI, no ponto de envio
    real, antes de montar `subscription_info`/chamar `webpush`.

    WR-01 (13-REVIEW.md, iteração 3): a revalidação acima devolvia `False`
    pelo MESMO contrato do 404/410, e todo chamador tratava `False` como
    "apaga a linha" — mas uma recusa de allowlist não é uma confirmação do
    push service de que a subscription não existe mais; pode ser uma linha
    maliciosa OU a allowlist estar desatualizada (ex.: vendor migrou de
    domínio). Apagar nesse caso destrói dado legítimo do usuário
    silenciosamente. Por isso a recusa de allowlist é logada em nível
    `error` (sinal explícito para o operador revisar allowlist/vendor) e
    devolve `None` — um terceiro estado que os chamadores tratam como
    "pular o envio, NÃO apagar a subscription", distinto do `False`
    confirmado por 404/410.
    """
    endpoint = subscription_row.get("endpoint") or ""
    if not endpoint_e_permitido(endpoint):
        logger.error(
            "enviar_push recusou endpoint fora da allowlist — revisar "
            "allowlist/vendor (endpoint=%s, user_id=%s). Subscription NÃO "
            "apagada: isto não é um 404/410 confirmado pelo push service.",
            endpoint,
            subscription_row.get("user_id"),
        )
        return None
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
