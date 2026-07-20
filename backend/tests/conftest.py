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
