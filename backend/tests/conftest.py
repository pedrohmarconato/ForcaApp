# backend/tests/conftest.py
# Hermeticidade da suíte:
#
# 1. FORCA_SKIP_DOTENV=1 ANTES de qualquer import de backend.*: o
#    backend/utils/config.py NÃO injeta o .env real do repositório no
#    processo de teste (achado do review: um .env sintético vazava a chave
#    para dentro dos testes sem ninguém perceber).
#    Este bloco roda antes dos módulos de teste porque o pytest importa o
#    conftest primeiro.
#
# 2. Fixture autouse que fotografa os.environ antes de cada teste e o
#    restaura ao final: mutações diretas (os.environ[...] = ...) deixam de
#    vazar de um teste para o outro.

import os

os.environ.setdefault("FORCA_SKIP_DOTENV", "1")

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _restaura_os_environ():
    snapshot = os.environ.copy()
    yield
    os.environ.clear()
    os.environ.update(snapshot)


@pytest.fixture(autouse=True)
def _quota_ia_neutra(request, monkeypatch):
    """
    Neutraliza a quota diária de IA (migration 0024) por padrão.

    Toda rota paga agora reserva quota antes de chamar o modelo, e a reserva
    falha FECHADA — sem Supabase alcançável ela devolve 503. Sem este fixture
    a suíte inteira tentaria resolver `teste.supabase.co` e as rotas pagas
    responderiam 503 em vez do que o teste realmente quer verificar.

    Um teste que QUER exercitar a quota marca `@pytest.mark.quota_real` e
    mocka `ai_quota._chamar_rpc` do seu jeito.
    """
    if request.node.get_closest_marker("quota_real"):
        return

    from backend.services import ai_quota

    def _rpc_permissiva(access_token, payload):
        return {"permitido": True, "chamadas_dia": 1, "custo_dia_usd": 0.0}

    monkeypatch.setattr(ai_quota, "_chamar_rpc", _rpc_permissiva)


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "quota_real: o teste exercita a quota de IA e mocka a RPC por conta própria",
    )
