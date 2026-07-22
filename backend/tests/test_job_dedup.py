# backend/tests/test_job_dedup.py
# Modos de falha reais da infraestrutura de jobs (avaliação de 22/07):
#
# 1. Execução dupla: o dedup do criar_job devolvia o job em andamento, mas o
#    endpoint chamava executar_job de novo — segunda thread no MESMO job,
#    segunda chamada Opus cobrada e segunda persistência.
# 2. TOCTOU: a checagem de job ativo e a inserção usavam aquisições separadas
#    do lock — duas requisições concorrentes criavam dois jobs.
# 3. executar_job engolia exceção sem log — falha fora dos try/except internos
#    do pipeline ficava invisível.
# 4. TTL apagava job ainda em execução, liberando o dedup com a thread antiga viva.
# 5. transition(SALVO) antes de plan_id (e progress mutado fora do lock): um
#    poll na janela via status=salvo com plan_id=None.

import datetime
import os
import sys
import threading
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

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

    buckets = getattr(app_module, "_rate_buckets", None)
    if isinstance(buckets, dict):
        buckets.clear()

    with jm._jobs_lock:
        jm._jobs.clear()

    yield

    with jm._jobs_lock:
        jm._jobs.clear()


def _fake_user_response(user_id="3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"):
    response = mock.Mock()
    response.status_code = 200
    response.json.return_value = {"id": user_id, "email": "user@teste.com"}
    return response


def _post_generate_plan(client):
    return client.post(
        "/api/generate-plan",
        json={
            "questionnaireData": {"nivelExperiencia": "iniciante"},
            "diretrizes": {"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
        },
        headers={"Authorization": "Bearer token-valido"},
    )


# ==================== 1. Execução dupla no endpoint ====================

def test_post_duplo_com_job_vivo_nao_dispara_pipeline_de_novo(client, monkeypatch):
    """Reenvio do POST com job em andamento devolve o MESMO job_id e NÃO
    executa o pipeline outra vez (era a execução dupla cobrada no Opus)."""
    monkeypatch.setattr("backend.app.FORCA_USE_MOLDE_ARCHITECTURE", True)

    with mock.patch("backend.app.executar_job", autospec=True) as executar, \
         mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        primeira = _post_generate_plan(client)
        segunda = _post_generate_plan(client)

    assert primeira.status_code == 202
    assert segunda.status_code == 202
    assert primeira.get_json()["job_id"] == segunda.get_json()["job_id"]
    # O pipeline só pode ter sido disparado UMA vez, pelo request que criou o job.
    assert executar.call_count == 1


def test_post_apos_job_terminal_cria_job_novo(client, monkeypatch):
    """O dedup não pode travar a geração seguinte: job SALVO/ERRO libera."""
    monkeypatch.setattr("backend.app.FORCA_USE_MOLDE_ARCHITECTURE", True)

    with mock.patch("backend.app.executar_job", autospec=True) as executar, \
         mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()):
        primeira = _post_generate_plan(client)
        job_id_1 = primeira.get_json()["job_id"]
        jm.obter_job(job_id_1).set_error("teste", "encerrado")

        segunda = _post_generate_plan(client)

    assert segunda.status_code == 202
    assert segunda.get_json()["job_id"] != job_id_1
    assert executar.call_count == 2


# ==================== 2. Dedup atômico no criar_job ====================

def test_criar_job_devolve_created_flag():
    job1, created1 = jm.criar_job(user_id="user-a")
    job2, created2 = jm.criar_job(user_id="user-a")

    assert created1 is True
    assert created2 is False
    assert job1.job_id == job2.job_id

    # Usuário diferente não entra no dedup.
    job3, created3 = jm.criar_job(user_id="user-b")
    assert created3 is True
    assert job3.job_id != job1.job_id


def test_criar_job_concorrente_cria_exatamente_um_job():
    """25 threads simultâneas para o mesmo usuário: exatamente 1 criação.
    No código antigo (checagem e inserção em locks separados) este teste
    flakejava com múltiplos jobs criados."""
    n = 25
    barrier = threading.Barrier(n)
    resultados = []
    resultados_lock = threading.Lock()

    def worker():
        barrier.wait()
        resultado = jm.criar_job(user_id="user-corrida")
        with resultados_lock:
            resultados.append(resultado)

    threads = [threading.Thread(target=worker) for _ in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(resultados) == n
    criados = [job for job, created in resultados if created]
    job_ids = {job.job_id for job, _created in resultados}
    assert len(criados) == 1
    assert len(job_ids) == 1


# ==================== 3. Exceção no job é logada ====================

def test_executar_job_loga_excecao_com_traceback(caplog):
    job, _ = jm.criar_job(user_id="user-log")
    pronto = threading.Event()

    def pipeline_que_explode(_job):
        try:
            raise RuntimeError("falha-sintetica-do-pipeline")
        finally:
            pronto.set()

    with caplog.at_level("ERROR"):
        jm.executar_job(job, pipeline_que_explode)
        assert pronto.wait(timeout=5)
        # A thread seta o erro depois do finally; espera o estado terminal.
        for _ in range(50):
            if job.to_dict()["status"] == "erro":
                break
            threading.Event().wait(0.05)

    assert job.to_dict()["status"] == "erro"
    assert "falha-sintetica-do-pipeline" in caplog.text
    assert "RuntimeError" in caplog.text


# ==================== 4. TTL não apaga job em execução ====================

def _envelhecer(job, segundos):
    job.created_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=segundos)


def test_ttl_preserva_job_em_execucao_e_apaga_terminais():
    ttl = jm._JOB_TTL_SECONDS

    em_execucao, _ = jm.criar_job(user_id="user-vivo")
    em_execucao.transition(jm.JobStatus.GERANDO_MOLDE, "gerando_molde", "...")
    _envelhecer(em_execucao, ttl + 60)

    terminal, _ = jm.criar_job(user_id="user-terminal")
    terminal.set_error("x", "acabou")
    _envelhecer(terminal, ttl + 60)

    zumbi, _ = jm.criar_job(user_id="user-zumbi")
    zumbi.transition(jm.JobStatus.GERANDO_MOLDE, "gerando_molde", "...")
    _envelhecer(zumbi, (2 * ttl) + 60)

    jm._limpar_jobs_expirados()

    assert jm.obter_job(em_execucao.job_id) is not None, "job em execução dentro de 2×TTL não pode sumir"
    assert jm.obter_job(terminal.job_id) is None, "job terminal além do TTL deve sumir"
    assert jm.obter_job(zumbi.job_id) is None, "job não-terminal além de 2×TTL é zumbi e deve sumir"


# ==================== 5. SALVO nunca aparece sem plan_id ====================

def test_marcar_salvo_e_atomico():
    job, _ = jm.criar_job(user_id="user-salvo")

    job.marcar_salvo("plan-123")

    visao = job.to_dict()
    assert visao["status"] == "salvo"
    assert visao["plan_id"] == "plan-123"
    assert visao["progress"]["step"] == "salvo"
    assert visao["progress"]["plan_id"] == "plan-123"
