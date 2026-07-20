# backend/tests/test_config_consolidacao.py
# Protege contra regressão do item 5.6 do prompt de correção:
# - config.py deve ter UM ÚNICO load_dotenv (do .env da raiz)
# - não deve haver código inalcançável nem referência a service_name fora de escopo
# - get_model_name deve retornar sempre um modelo ativo (não o aposentado)

import inspect
import os
import sys

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.utils import config as config_module  # noqa: E402


def test_config_tem_apenas_um_load_dotenv():
    src = inspect.getsource(config_module)
    # Aceita "load_dotenv(" (chamada) e "load_dotenv(" em comentário é improvável,
    # mas contamos apenas chamadas reais — a definição não aparece pois é import.
    calls = src.count("load_dotenv(")
    # 1 no carregamento do módulo. Não pode haver segundo bloco.
    assert calls == 1, f"Expected 1 load_dotenv call, found {calls}"


def test_config_nao_contem_referencia_service_name_fora_de_escopo():
    """O código inalcançável original referenciava `service_name` após o
    return de get_anthropic_api_key, onde essa variável nem existia."""
    src = inspect.getsource(config_module)
    # `service_name` só deve aparecer dentro de get_api_key (parâmetro).
    # Verificamos que NÃO há menção após o return de get_anthropic_api_key.
    anth_fn_src = inspect.getsource(config_module.get_anthropic_api_key)
    assert "service_name" not in anth_fn_src, (
        "get_anthropic_api_key não deve referenciar service_name (código "
        "inalcançável removido)."
    )


def test_config_carrega_da_raiz_do_repositorio():
    """DOTENV_PATH deve apontar para <repo>/.env, não <repo>/backend/.env."""
    # backend/utils/config.py → sobe 2 níveis: backend/utils → backend → repo
    expected_root = os.path.abspath(os.path.join(REPO_ROOT))
    assert config_module.PROJECT_ROOT == expected_root
    assert config_module.DOTENV_PATH == os.path.join(expected_root, ".env")
    assert "backend" not in os.path.relpath(config_module.DOTENV_PATH, REPO_ROOT)


def test_get_model_name_padrao_ativo(monkeypatch):
    """Padrão deve ser claude-sonnet-4-6 (ativo), não o aposentado."""
    monkeypatch.delenv("CLAUDE_MODEL_NAME", raising=False)
    modelo = config_module.get_model_name()
    assert modelo != "claude-3-5-sonnet-20240620"
    assert "sonnet-4" in modelo or "haiku-4" in modelo or "opus-4" in modelo


def test_get_api_key_nao_loga_valor(caplog, monkeypatch):
    """Importante: logs nunca podem conter o valor da chave."""
    import logging

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-VALOR-SECRETO-12345")
    with caplog.at_level(logging.DEBUG):
        config_module.get_api_key("ANTHROPIC")
    assert "sk-ant-VALOR-SECRETO-12345" not in caplog.text


def test_get_anthropic_timeout_seconds_invalido_falla_graceful(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_TIMEOUT_SECONDS", "nao-e-numero")
    assert config_module.get_anthropic_timeout_seconds() == 150.0
