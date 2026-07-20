# backend/tests/test_job_endpoints.py
# Testes dos novos endpoints: job async de geração e consolidate-chat.

import os
import sys
import types
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"
os.environ.pop("ANTHROPIC_API_KEY", None)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import app  # noqa: E402
import backend.services.job_manager as jm  # noqa: E402


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _limpa():
    import backend.app as app_module
    import backend.services.job_manager as jm

    buckets = getattr(app_module, "_rate_buckets", None)
    if isinstance(buckets, dict):
        buckets.clear()

    with jm._jobs_lock:
        jm._jobs.clear()

    yield


def _fake_user_response(user_id="3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"):
    response = mock.Mock()
    response.status_code = 200
    response.json.return_value = {"id": user_id, "email": "user@teste.com"}
    return response


def _fake_anthropic_client(reply_text="Resposta da IA"):
    block = types.SimpleNamespace(type="text", text=reply_text)
    client = mock.Mock()
    client.messages.create.return_value = types.SimpleNamespace(content=[block])
    return client


# ==================== Consolidate-chat ====================

def test_consolidate_chat_com_token_valido_retorna_diretrizes(client):
    diretrizes_json = '{"preferencias":["focar peito"],"restricoes":[],"excecoes_estruturais":[]}'
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=_fake_anthropic_client(diretrizes_json)):
        response = client.post(
            "/api/consolidate-chat",
            json={
                "messages": [{"role": "user", "content": "Quero focar em peito"}],
                "questionnaireData": {"idade": 30},
            },
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    assert response.get_json()["diretrizes"] == {
        "preferencias": ["focar peito"], "restricoes": [],
        "excecoes_estruturais": [],
    }


def test_consolidate_chat_exige_auth(client):
    response = client.post("/api/consolidate-chat", json={"messages": []})
    assert response.status_code == 401


def test_consolidate_chat_rejeita_payload_invalido(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/consolidate-chat",
            json={"messages": []},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 400


def test_consolidate_chat_usa_chat_model_name(client):
    """Consolidate-chat deve usar get_chat_model_name()."""
    capturado = {}

    class FakeClient:
        def __init__(self, **kwargs):
            capturado.update(kwargs)
        def messages_create(self, **kwargs):
            capturado["model"] = kwargs.get("model")
            block = types.SimpleNamespace(type="text", text='{"preferencias":[],"restricoes":[],"excecoes_estruturais":[]}')
            return types.SimpleNamespace(content=[block])

    fake_client = FakeClient()
    fake_client.messages = types.SimpleNamespace()
    fake_client.messages.create = fake_client.messages_create

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=fake_client):
        client.post(
            "/api/consolidate-chat",
            json={
                "messages": [{"role": "user", "content": "Oi"}],
                "questionnaireData": {},
            },
            headers={"Authorization": "Bearer token-valido"},
        )
    assert capturado.get("model") is not None


# ==================== Generate-plan (modo antigo — default) ====================

def test_generate_plan_modo_antigo_funciona(client):
    import backend.app as app_module

    class FakeTreinador:
        def gerar_plano(self, dados):
            return {
                "treinamento_id": "plano-1",
                "plano_principal": {
                    "nome": "Plano",
                    "ciclos": [{"microciclos": [{"semana": 1, "sessoes": [
                        {"nome": "A", "exercicios": [
                            {"nome": "Supino", "ordem": 1, "series": 3, "repeticoes": "10"}
                        ]}
                    ]}]}],
                },
            }

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch.object(app_module, "treinador", FakeTreinador()), \
         mock.patch.object(app_module, "persistir_plano", return_value="db-plan-1"):
        response = client.post(
            "/api/generate-plan",
            json={"questionnaireData": {"nivelExperiencia": "iniciante"}},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    assert response.get_json()["plan_id"] == "db-plan-1"
    assert response.get_json()["status"] == "success"


def test_generate_plan_modo_antigo_exige_questionario(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/generate-plan",
            json={"questionnaireData": None},
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 400


# ==================== Generate-plan (modo novo — flag ON) ====================

def test_generate_plan_modo_novo_retorna_job_id(client, monkeypatch):
    monkeypatch.setattr("backend.app.FORCA_USE_MOLDE_ARCHITECTURE", True)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/generate-plan",
            json={
                "questionnaireData": {"nivelExperiencia": "iniciante"},
                "diretrizes": {"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
            },
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 202
    data = response.get_json()
    assert "job_id" in data
    assert data["status"] == "created"


def test_generate_plan_modo_novo_exige_diretrizes_validas(client, monkeypatch):
    monkeypatch.setattr("backend.app.FORCA_USE_MOLDE_ARCHITECTURE", True)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/generate-plan",
            json={
                "questionnaireData": {"nivelExperiencia": "iniciante"},
                "diretrizes": {"preferencias": "não é array"},
            },
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 400


def test_generate_plan_modo_novo_aceita_diretrizes_vazias(client, monkeypatch):
    monkeypatch.setattr("backend.app.FORCA_USE_MOLDE_ARCHITECTURE", True)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.post(
            "/api/generate-plan",
            json={
                "questionnaireData": {"nivelExperiencia": "iniciante"},
                "diretrizes": {"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
            },
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 202


# ==================== Job polling ====================

def test_poll_job_inexistente_retorna_404(client):
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.get(
            "/api/generate-plan/nao-existe",
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 404


def test_poll_job_de_outro_usuario_retorna_403(client):
    import backend.services.job_manager as jm

    job = jm.criar_job(user_id="outro-usuario")

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        response = client.get(
            f"/api/generate-plan/{job.job_id}",
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 403


def test_poll_job_proprio_retorna_status(client):
    import backend.services.job_manager as jm

    user_id = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"
    job = jm.criar_job(user_id=user_id)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response(user_id)):
        response = client.get(
            f"/api/generate-plan/{job.job_id}",
            headers={"Authorization": "Bearer token-valido"},
        )
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "created"
    assert data["job_id"] == job.job_id


def test_poll_job_exige_auth(client):
    response = client.get("/api/generate-plan/qualquer-id")
    assert response.status_code == 401


# ==================== Integração: fluxo completo modo novo ====================

def test_fluxo_completo_modo_novo(client, monkeypatch):
    """Simula o pipeline de _executar_geracao_molde diretamente."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "dummy-para-teste")

    user_id = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"

    import json as _json
    molde_json = _json.dumps({
        "nome": "Plano Teste",
        "descricao": "",
        "periodizacao": {"tipo": "Linear"},
        "duracao_semanas": 4,
        "frequencia_semanal": 2,
        "semanas_tipo": [{
            "id": "tipo_a", "nome": "A",
            "sessoes": [{
                "nome": "Treino A", "tipo": "Hipertrofia", "duracao_minutos": 60, "dia_offset": 0,
                "grupos_musculares": [{"nome": "Peito"}],
                "exercicios": [{
                    "nome": "Supino", "ordem": 1, "series": 3, "repeticoes": "10",
                    "percentual_rm": 75, "prioridade": "primario",
                }],
            }],
        }],
        "calendario": ["tipo_a"] * 4,
        "progressao": {"regras": []},
    })

    fake_response_obj = types.SimpleNamespace(content=[
        types.SimpleNamespace(type="text", text=molde_json)
    ])

    from backend.app import _executar_geracao_molde

    job = jm.criar_job(user_id=user_id)

    with mock.patch("backend.utils.anthropic_retry.criar_mensagem_com_deadline", return_value=fake_response_obj), \
         mock.patch("backend.app.persistir_plano", return_value="db-plan-2"):
        with app.app_context():
            _executar_geracao_molde(
                job,
                questionnaire_data={"nivelExperiencia": "iniciante"},
                diretrizes={"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
                user_id=user_id,
                access_token="fake-token",
            )

    assert job.status == jm.JobStatus.SALVO
    assert job.plan_id == "db-plan-2"
