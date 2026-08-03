# backend/tests/test_consolidate_mensagem_vazia.py
# Reprodução do incidente de 30/07/2026: o usuário pediu no chat um treino
# sem perna nas duas primeiras semanas, /api/consolidate-chat respondeu 400 e
# o app gerou o plano com as diretrizes do questionário — o pedido do chat
# nunca chegou ao molde.
#
# Hipótese do 400 (55 bytes = "Campo 'messages' ausente ou inválido."):
# o app monta o histórico com `content: msg.parts[0]?.text ?? ''`; se qualquer
# mensagem (em geral do assistente) chega sem texto, _sanitize_chat_messages
# rejeita o lote INTEIRO em vez de filtrar a mensagem inválida.

import json
import os
import sys
import types
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app_module  # noqa: E402
from backend.app import app  # noqa: E402
from backend.app import _sanitize_chat_messages  # noqa: E402

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


# --- 1. Reprodução: uma mensagem vazia NÃO pode derrubar o lote inteiro ---

def test_consolidate_com_mensagem_assistente_vazia_nao_derruba_o_lote(client):
    """
    O app manda o histórico com `msg.parts[0]?.text ?? ''`. Uma resposta do
    assistente sem texto (imagem, tool call, stream truncado) vira content ''
    e derrubava a conversa inteira com 400 — o pedido do aluno ("sem perna
    nas duas primeiras semanas") morria antes do molde. Pós-correção a
    mensagem vazia é filtrada e a consolidação segue.
    """
    def _captura_messages(*args, **kwargs):
        mensagens_enviadas = kwargs.get("messages")
        conteudos = [m["content"] for m in mensagens_enviadas]
        assert "" not in conteudos
        assert "Não quero treinar perna nas duas primeiras semanas" in conteudos
        bloco = types.SimpleNamespace(
            type="text",
            text=json.dumps({
                "preferencias": ["sem perna nas duas primeiras semanas"],
                "restricoes": [],
                "excecoes_estruturais": [],
            }),
        )
        return types.SimpleNamespace(
            content=[bloco],
            usage=types.SimpleNamespace(
                input_tokens=10, output_tokens=10,
                cache_creation_input_tokens=0, cache_read_input_tokens=0,
            ),
        )

    anthropic = mock.Mock()
    anthropic.messages.create.side_effect = _captura_messages

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [
                    {"role": "user", "content": "Não quero treinar perna nas duas primeiras semanas"},
                    {"role": "assistant", "content": ""},
                    {"role": "user", "content": "Pode ser?"},
                ],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200
    diretrizes = resposta.get_json()["diretrizes"]
    assert "sem perna nas duas primeiras semanas" in diretrizes["preferencias"]


def test_consolidate_com_mensagem_assistente_so_espacos_segue_em_frente(client):
    def _captura_messages(*args, **kwargs):
        mensagens_enviadas = kwargs.get("messages")
        conteudos = [m["content"] for m in mensagens_enviadas]
        assert "   " not in conteudos
        bloco = types.SimpleNamespace(
            type="text",
            text=json.dumps({
                "preferencias": [],
                "restricoes": [{
                    "descricao": "sem perna na semana 1 e 2",
                    "tipo": "grupo_muscular",
                    "grupo_afetado": "perna",
                }],
                "excecoes_estruturais": [],
            }),
        )
        return types.SimpleNamespace(
            content=[bloco],
            usage=types.SimpleNamespace(
                input_tokens=10, output_tokens=10,
                cache_creation_input_tokens=0, cache_read_input_tokens=0,
            ),
        )

    anthropic = mock.Mock()
    anthropic.messages.create.side_effect = _captura_messages

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [
                    {"role": "user", "content": "Sem perna na semana 1 e 2"},
                    {"role": "assistant", "content": "   "},
                ],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200


def test_consolidate_sem_nenhuma_mensagem_user_e_recusado(client):
    anthropic = mock.Mock()
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [{"role": "assistant", "content": "Olá, vamos começar?"}],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 400


# --- 2. Comportamento esperado APÓS a correção: filtrar, não derrubar ---

def test_consolidate_filtra_mensagens_vazias_e_consolida(client):
    """
    Pós-correção: mensagens vazias são FILTRADAS e o restante do histórico
    segue para a consolidação. O pedido do aluno sobrevive a uma resposta do
    assistente sem texto.
    """
    def _captura_messages(*args, **kwargs):
        mensagens_enviadas = kwargs.get("messages")
        assert mensagens_enviadas is not None
        conteudos = [m["content"] for m in mensagens_enviadas]
        assert "" not in conteudos
        assert "Não quero treinar perna nas duas primeiras semanas" in conteudos
        bloco = types.SimpleNamespace(
            type="text",
            text=json.dumps({
                "preferencias": ["sem perna nas duas primeiras semanas"],
                "restricoes": [],
                "excecoes_estruturais": [],
            }),
        )
        return types.SimpleNamespace(
            content=[bloco],
            usage=types.SimpleNamespace(
                input_tokens=10, output_tokens=10,
                cache_creation_input_tokens=0, cache_read_input_tokens=0,
            ),
        )

    anthropic = mock.Mock()
    anthropic.messages.create.side_effect = _captura_messages

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [
                    {"role": "user", "content": "Não quero treinar perna nas duas primeiras semanas"},
                    {"role": "assistant", "content": ""},
                    {"role": "user", "content": "Pode ser?"},
                ],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200
    diretrizes = resposta.get_json()["diretrizes"]
    assert "sem perna nas duas primeiras semanas" in diretrizes["preferencias"]


def test_consolidate_mensagens_vazias_no_inicio_sao_descartadas_antes_do_primeiro_user(client):
    """
    O sanitize já descarta mensagens do assistente ANTES do primeiro 'user'
    (a API da Anthropic exige conversa começando em 'user'). Vazias no início
    devem ser removidas ANTES desse corte, não fazer o corte falhar.
    """
    anthropic = mock.Mock()
    anthropic.messages.create.return_value = types.SimpleNamespace(
        content=[types.SimpleNamespace(
            type="text",
            text=json.dumps({"preferencias": [], "restricoes": [], "excecoes_estruturais": []}),
        )],
        usage=types.SimpleNamespace(
            input_tokens=10, output_tokens=10,
            cache_creation_input_tokens=0, cache_read_input_tokens=0,
        ),
    )

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [
                    {"role": "assistant", "content": ""},
                    {"role": "assistant", "content": "Bem-vindo!"},
                    {"role": "user", "content": "Sem perna na semana 1 e 2"},
                ],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200


# --- 3. Unidade: _sanitize_chat_messages ---

def test_sanitize_filtra_mensagens_vazias_mas_mantem_o_resto():
    saneado = _sanitize_chat_messages([
        {"role": "user", "content": "Olá"},
        {"role": "assistant", "content": ""},
        {"role": "user", "content": "Sem perna"},
    ])
    assert saneado == [
        {"role": "user", "content": "Olá"},
        {"role": "user", "content": "Sem perna"},
    ]


def test_sanitize_so_com_vazias_continua_invalido():
    assert _sanitize_chat_messages([
        {"role": "assistant", "content": ""},
    ]) is None


def test_sanitize_messages_vazio_invalido():
    assert _sanitize_chat_messages([]) is None
    assert _sanitize_chat_messages(None) is None


# --- 4. Structured outputs: o histórico NÃO pode terminar em 'assistant' ---

def test_consolidate_structured_outputs_descarta_assistant_final(client, monkeypatch):
    """
    A API da Anthropic rejeita pre-fill de 'assistant' quando output_config
    (structured outputs) está ativo — e o histórico do chat termina com a
    resposta do coach. O backend precisa descartar as mensagens 'assistant'
    finais ANTES da chamada, senão o consolidate morre com 400 da API e o
    app bloqueia a geração (502 visto na homologação de 03/08/2026).
    """
    monkeypatch.setattr(app_module, "FORCA_STRUCTURED_OUTPUT", True)

    def _captura_messages(*args, **kwargs):
        mensagens_enviadas = kwargs.get("messages")
        assert mensagens_enviadas is not None
        assert mensagens_enviadas[-1]["role"] == "user"
        bloco = types.SimpleNamespace(
            type="text",
            text=json.dumps({
                "preferencias": ["sem perna nas duas primeiras semanas"],
                "restricoes": [],
                "excecoes_estruturais": [],
            }),
        )
        return types.SimpleNamespace(
            content=[bloco],
            usage=types.SimpleNamespace(
                input_tokens=10, output_tokens=10,
                cache_creation_input_tokens=0, cache_read_input_tokens=0,
            ),
        )

    anthropic = mock.Mock()
    anthropic.messages.create.side_effect = _captura_messages

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic):
        resposta = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [
                    {"role": "user", "content": "Não quero treinar perna nas duas primeiras semanas"},
                    {"role": "assistant", "content": "Anotado! Sem perna nas semanas 1 e 2."},
                ],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200
    diretrizes = resposta.get_json()["diretrizes"]
    assert "sem perna nas duas primeiras semanas" in diretrizes["preferencias"]
