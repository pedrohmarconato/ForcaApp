# backend/utils/auth.py
# Decorador de autenticação para os endpoints da API.
# Valida o JWT emitido pelo Supabase chamando GET /auth/v1/user do projeto.
# Compatível com Python 3.9+.

import functools
import os
import uuid

import requests
from flask import g, jsonify, request

from .logger import WrapperLogger

logger = WrapperLogger("Auth")

REQUEST_TIMEOUT_SECONDS = 10


def _supabase_config():
    """Lê a configuração do Supabase do ambiente."""
    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    anon_key = os.environ.get("SUPABASE_ANON_KEY") or ""
    return base_url, anon_key


def _is_valid_user_payload(payload):
    """
    Um 200 do Supabase Auth só é válido se for um objeto com 'id' em formato
    UUID não vazio. Respostas malformadas (proxy, config incorreta) são
    rejeitadas em vez de aceitas como usuário autenticado.
    """
    if not isinstance(payload, dict):
        return False
    user_id = payload.get("id")
    if not isinstance(user_id, str) or not user_id.strip():
        return False
    try:
        uuid.UUID(user_id)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def validate_token(token):
    """
    Valida um access_token junto ao Supabase Auth.

    Retorna o dict do usuário quando válido, None quando inválido.
    Levanta RuntimeError quando a configuração está ausente ou o
    serviço de autenticação está inacessível.
    """
    base_url, anon_key = _supabase_config()
    if not base_url or not anon_key:
        logger.error("SUPABASE_URL/SUPABASE_ANON_KEY não configurados no backend.")
        raise RuntimeError("Autenticação não configurada no servidor.")

    try:
        response = requests.get(
            "{}/auth/v1/user".format(base_url),
            headers={
                "apikey": anon_key,
                "Authorization": "Bearer {}".format(token),
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        logger.error("Falha ao contatar o Supabase Auth: {}".format(exc))
        raise RuntimeError("Serviço de autenticação indisponível.") from exc

    if response.status_code != 200:
        return None

    try:
        payload = response.json()
    except ValueError:
        return None

    if not _is_valid_user_payload(payload):
        logger.warning("Resposta 200 do Supabase Auth com payload malformado (sem id UUID).")
        return None

    return payload


def token_required(view_func):
    """
    Decorador: exige header 'Authorization: Bearer <access_token>' válido.
    Em caso de sucesso, o usuário autenticado fica disponível em flask.g.user.
    """

    @functools.wraps(view_func)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else None

        if not token:
            return jsonify({"error": "Autenticação necessária."}), 401

        try:
            user = validate_token(token)
        except RuntimeError as exc:
            return jsonify({"error": str(exc)}), 503

        if user is None:
            return jsonify({"error": "Sessão inválida ou expirada."}), 401

        g.user = user
        # Token bruto disponível para chamadas downstream em nome do usuário
        # (ex.: gravar o plano no Supabase respeitando RLS).
        g.access_token = token
        return view_func(*args, **kwargs)

    return wrapper
