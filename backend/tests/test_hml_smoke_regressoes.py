# backend/tests/test_hml_smoke_regressoes.py
# Dois modos de falha encontrados pelo PRIMEIRO smoke E2E no ambiente de
# homologação (22/07/2026, PLAN_MODEL_NAME=claude-haiku-4-5):
#
# 1. O caminho do molde enviava thinking={"type": "adaptive"} incondicional —
#    a API rejeita com 400 "adaptive thinking is not supported on this model"
#    em qualquer modelo que não suporte (Haiku no HML; qualquer downgrade
#    futuro em prod quebraria igual).
#
# 2. WrapperLogger não tinha o método .exception(): os TRÊS handlers de erro
#    do job (_executar_geracao_molde) chamavam app_logger.exception e o
#    próprio tratamento de erro crashava com AttributeError — a falha real
#    virava "internal_error" genérico sem o log específico. Vivo em produção.

import os
import sys
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app_module  # noqa: E402
import backend.services.job_manager as jm  # noqa: E402
from backend.utils.logger import WrapperLogger  # noqa: E402


# ==================== 1. thinking condicional ao modelo ====================

@pytest.mark.parametrize("modelo,esperado", [
    ("claude-haiku-4-5", None),
    ("claude-sonnet-5", None),
    ("claude-opus-4-8", {"type": "adaptive"}),
    ("claude-fable-5", {"type": "adaptive"}),
    ("", None),
    (None, None),
])
def test_thinking_config_por_modelo(modelo, esperado):
    assert app_module._thinking_config_para_modelo(modelo) == esperado


def _job():
    with jm._jobs_lock:
        jm._jobs.clear()
    job, _ = jm.criar_job(user_id="user-smoke")
    return job


def _rodar_molde_capturando_chamada(monkeypatch, modelo):
    monkeypatch.setenv("PLAN_MODEL_NAME", modelo)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-para-teste")
    job = _job()
    # O import de criar_mensagem_com_deadline é LOCAL à função — o patch
    # precisa mirar o módulo de origem, não backend.app.
    with mock.patch(
        "backend.utils.anthropic_retry.criar_mensagem_com_deadline", autospec=True,
    ) as chamada:
        # O mock devolve algo sem .content parseável: o fluxo morre DEPOIS da
        # chamada (molde_parse) — o que interessa aqui são os kwargs enviados.
        app_module._executar_geracao_molde(
            job, {"nivelExperiencia": "iniciante"},
            {"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
            "user-smoke", "token-fake",
        )
    assert chamada.call_count == 1
    return chamada.call_args.kwargs


def test_molde_com_haiku_nao_envia_thinking(monkeypatch):
    kwargs = _rodar_molde_capturando_chamada(monkeypatch, "claude-haiku-4-5")
    assert "thinking" not in kwargs
    assert kwargs["model"] == "claude-haiku-4-5"


def test_molde_com_opus_envia_thinking_adaptive(monkeypatch):
    kwargs = _rodar_molde_capturando_chamada(monkeypatch, "claude-opus-4-8")
    assert kwargs.get("thinking") == {"type": "adaptive"}


# ==================== 2. WrapperLogger.exception ====================

def test_wrapper_logger_exception_loga_traceback(caplog):
    logger = WrapperLogger("teste-exception")
    with caplog.at_level("ERROR", logger="teste-exception"):
        try:
            raise ValueError("falha-sintetica")
        except ValueError:
            logger.exception("contexto do erro")
    assert "contexto do erro" in caplog.text
    assert "ValueError: falha-sintetica" in caplog.text  # traceback presente


def test_handler_de_erro_do_molde_nao_crasha(monkeypatch, caplog):
    """Regressão direta do smoke: erro na chamada da IA deve virar
    molde_api_error COM log — não AttributeError no próprio handler."""
    monkeypatch.setenv("PLAN_MODEL_NAME", "claude-haiku-4-5")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-para-teste")
    job = _job()
    with mock.patch(
        "backend.utils.anthropic_retry.criar_mensagem_com_deadline", autospec=True,
        side_effect=RuntimeError("api fora"),
    ), caplog.at_level("ERROR"):
        app_module._executar_geracao_molde(
            job, {"nivelExperiencia": "iniciante"},
            {"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
            "user-smoke", "token-fake",
        )
    visao = job.to_dict()
    assert visao["status"] == "erro"
    assert visao["error"]["code"] == "molde_api_error"  # não internal_error
    assert "falha na chamada do molde" in caplog.text
