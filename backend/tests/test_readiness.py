# backend/tests/test_readiness.py
# Testes do endpoint /api/ready (readiness) e da separação liveness/readiness.
#
# Liveness (/health): processo Flask vivo. Sempre 200 {"status":"ok"}.
# Readiness (/api/ready): backend CONFIGURADO para servir IA/chat.
#   200 quando TreinadorEspecialista instanciado (ANTHROPIC_API_KEY presente)
#       E SUPABASE_URL/SUPABASE_ANON_KEY configurados.
#   503 caso contrário.
# Readiness NÃO faz chamada à Anthropic nem ao Supabase — só checa config
# e inicialização local, evitando custo/latência em cada probe.

import os
import sys
import unittest.mock as mock

import pytest

# Ambiente de teste padrão: treina configs ausentes para forçar readiness 503
# em qualquer ordem de execução (conftest não existe — setup inline).
os.environ.pop("ANTHROPIC_API_KEY", None)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import app, _backend_is_ready  # noqa: E402


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


# --- Liveness permanece público e simples ---

def test_liveness_saude_publica(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_liveness_api_saude_publica(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


# --- Readiness público (não exige Authorization) ---

def test_readiness_nao_exige_autenticacao(client):
    """Readiness é probe de infraestrutura: não pode exigir JWT."""
    response = client.get("/api/ready")
    # 200 ou 503, nunca 401
    assert response.status_code in (200, 503)


# --- Readiness reflete configuração ---

def test_readiness_nao_pronto_quando_treinador_none(client):
    """ANTHROPIC_API_KEY ausente → TreinadorEspecialista inicializa como None
    → readiness deve ser 503 (não pronto), mesmo com Supabase configurado."""
    with mock.patch("backend.app.treinador", None), \
         mock.patch.dict(os.environ, {
             "SUPABASE_URL": "https://teste.supabase.co",
             "SUPABASE_ANON_KEY": "anon-key",
         }):
        assert _backend_is_ready() is False
        response = client.get("/api/ready")
    assert response.status_code == 503
    assert response.get_json()["status"] == "not_ready"


def test_readiness_nao_pronto_quando_supabase_ausente(client, monkeypatch):
    """Treinador instanciado, mas SUPABASE_URL/SUPABASE_ANON_KEY ausentes → 503."""
    fake_treinador = mock.Mock()
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "")
    with mock.patch("backend.app.treinador", fake_treinador):
        assert _backend_is_ready() is False
        response = client.get("/api/ready")
    assert response.status_code == 503


def test_readiness_pronto_quando_configurado(client, monkeypatch):
    """Treinador presente + Supabase configurado → 200 ready (JSON exato)."""
    fake_treinador = mock.Mock()
    monkeypatch.setenv("SUPABASE_URL", "https://teste.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    with mock.patch("backend.app.treinador", fake_treinador):
        assert _backend_is_ready() is True
        response = client.get("/api/ready")
    assert response.status_code == 200
    # Asserção EXATA: nada além do status pode aparecer na resposta.
    assert response.get_json() == {"status": "ready"}


def test_readiness_nao_pronto_retorna_json_exato(client):
    """503 também não pode carregar nada além do status."""
    with mock.patch("backend.app.treinador", None):
        response = client.get("/api/ready")
    assert response.status_code == 503
    assert response.get_json() == {"status": "not_ready"}


# --- Readiness exige SUPABASE_URL utilizável, não apenas não vazia ---
# Achado do review: SUPABASE_URL="http://" passava na checagem de string não
# vazia, o /api/ready devolvia 200 e o /api/chat seguinte devolvia 503
# ("Serviço de autenticação indisponível"). A validação é local (esquema +
# hostname), sem chamada externa.

@pytest.mark.parametrize("url_invalida", [
    "http://",                       # sem hostname (caso reproduzido no review)
    "https://",                      # idem, esquema https
    "http:///caminho",               # hostname vazio com path
    "nao-e-uma-url",                 # sem esquema
    "ftp://teste.supabase.co",       # esquema não-HTTP
    "https://teste .supabase.co",    # whitespace interno
    " https://teste.supabase.co",    # whitespace nas bordas (auth.py não faz strip)
])
def test_readiness_rejeita_url_supabase_inutilizavel(client, monkeypatch, url_invalida):
    fake_treinador = mock.Mock()
    monkeypatch.setenv("SUPABASE_URL", url_invalida)
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    with mock.patch("backend.app.treinador", fake_treinador):
        assert _backend_is_ready() is False
        response = client.get("/api/ready")
    assert response.status_code == 503


def test_readiness_aceita_url_com_userinfo(client, monkeypatch):
    """URL com userinfo é anômala, mas utilizável pelo requests — aceita."""
    fake_treinador = mock.Mock()
    monkeypatch.setenv("SUPABASE_URL", "https://user:pass@teste.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    with mock.patch("backend.app.treinador", fake_treinador):
        assert _backend_is_ready() is True


# --- Readiness não vaza segredos nem stack trace ---

def test_readiness_nao_revela_detalhes_de_config(client, monkeypatch):
    """Mesmo quando SUPABASE_ANON_KEY contém valor sensível, a resposta
    JSON deve conter apenas {status: 'ready'|'not_ready'} — nunca o valor."""
    fake_treinador = mock.Mock()
    monkeypatch.setenv("SUPABASE_URL", "https://teste.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "sk-secret-value-must-not-leak")
    with mock.patch("backend.app.treinador", fake_treinador):
        response = client.get("/api/ready")
    body = response.get_data(as_text=True)
    assert "sk-secret-value-must-not-leak" not in body
    assert "ANTHROPIC_API_KEY" not in body
    assert "SUPABASE_ANON_KEY" not in body


def test_readiness_nao_faz_chamada_externa(client, monkeypatch):
    """Readiness NÃO pode chamar a Anthropic nem QUALQUER rede (custo/latência).

    Além de patch em anthropic.Anthropic (instanciação tardia), bloqueia
    requests.Session.request — caminho comum de qualquer requests.get/post,
    inclusive de clientes já instanciados. Não prova ausência de TODO I/O
    (ex.: httpx de um client Anthropic pré-existente), mas cobre os dois
    vetores usados pelo backend hoje (requests no auth, anthropic no wrapper).
    """
    fake_treinador = mock.Mock()
    monkeypatch.setenv("SUPABASE_URL", "https://teste.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon-key")
    with mock.patch("backend.app.treinador", fake_treinador), \
         mock.patch("anthropic.Anthropic") as mock_anthropic, \
         mock.patch(
             "requests.Session.request",
             side_effect=AssertionError("readiness fez chamada de rede via requests"),
         ):
        response = client.get("/api/ready")
    assert response.status_code == 200
    mock_anthropic.assert_not_called()
