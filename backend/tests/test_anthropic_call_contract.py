# backend/tests/test_anthropic_call_contract.py
"""Contrato de chamada do helper criar_mensagem_com_deadline.

Modo de falha que estes testes reproduzem (produção, 2026-07-21):

    app.py chamava criar_mensagem_com_deadline(client, deadline_seconds=240.0, ...)
    mas a assinatura é (cliente, orcamento_segundos, **kwargs). Como o nome não
    bate, `orcamento_segundos` ficava sem valor e a chamada morria com
    TypeError ANTES de tocar a rede. O `except Exception` do pipeline engolia o
    traceback e reportava "Falha na comunicação com o serviço de IA", então o
    sintoma apontava para a Anthropic enquanto o defeito era local.

    O bug sobreviveu aos testes porque o pipeline era exercitado com
    mock.patch(...) SEM autospec: um MagicMock aceita qualquer kwarg, inclusive
    um que a função real rejeita. Daí os dois testes abaixo — um estático, que
    varre todos os call sites, e um funcional, com autospec ligado.
"""
import ast
import inspect
import os
import sys
import types
from unittest import mock

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.utils.anthropic_retry import criar_mensagem_com_deadline  # noqa: E402

HELPER = "criar_mensagem_com_deadline"
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _call_sites():
    """Devolve (arquivo, linha, n_posicionais, nomes_keyword) de cada chamada ao helper."""
    encontrados = []
    for raiz, _, arquivos in os.walk(BACKEND_DIR):
        if os.path.basename(raiz) == "tests":
            continue
        for nome in arquivos:
            if not nome.endswith(".py"):
                continue
            caminho = os.path.join(raiz, nome)
            with open(caminho, encoding="utf-8") as fh:
                try:
                    arvore = ast.parse(fh.read(), filename=caminho)
                except SyntaxError:
                    # Módulo que não compila não consegue chamar o helper de todo
                    # jeito (o import falha antes). Não é o alvo deste teste.
                    continue
            for no in ast.walk(arvore):
                if not isinstance(no, ast.Call):
                    continue
                alvo = no.func
                chamado = getattr(alvo, "id", None) or getattr(alvo, "attr", None)
                if chamado != HELPER:
                    continue
                # Chamadas com *args/**kwargs dinâmicos não são verificáveis estaticamente.
                if any(isinstance(a, ast.Starred) for a in no.args):
                    continue
                if any(k.arg is None for k in no.keywords):
                    continue
                encontrados.append((
                    os.path.relpath(caminho, BACKEND_DIR),
                    no.lineno,
                    len(no.args),
                    [k.arg for k in no.keywords],
                ))
    return encontrados


def test_ha_call_sites_para_verificar():
    """Guarda contra o teste virar vacuamente verde se o helper for renomeado."""
    assert _call_sites(), f"nenhuma chamada a {HELPER}() encontrada em backend/"


@pytest.mark.parametrize("sitio", _call_sites(), ids=lambda s: f"{s[0]}:{s[1]}")
def test_call_site_respeita_a_assinatura(sitio):
    """Toda chamada ao helper precisa ser aceitável pela assinatura real.

    É este teste que pega `deadline_seconds=` (ou qualquer outro nome inventado
    para o orçamento): o bind falha porque `orcamento_segundos` fica sem valor.
    """
    arquivo, linha, n_posicionais, keywords = sitio
    assinatura = inspect.signature(criar_mensagem_com_deadline)

    posicionais = [mock.sentinel.arg] * n_posicionais
    nomeados = {k: mock.sentinel.kw for k in keywords}

    try:
        assinatura.bind(*posicionais, **nomeados)
    except TypeError as e:
        pytest.fail(
            f"{arquivo}:{linha} chama {HELPER}() de forma incompatível com "
            f"{HELPER}{assinatura}: {e}. "
            f"O orçamento deve ir como 2º argumento posicional (ou como "
            f"orcamento_segundos=), senão a chamada morre com TypeError antes da rede."
        )


def test_pipeline_do_molde_nao_quebra_na_chamada_do_helper(monkeypatch):
    """Roda o pipeline do molde com autospec ligado — sem mock permissivo.

    Com autospec=True o dublê valida a assinatura real, então a chamada errada
    levanta TypeError, o pipeline cai em molde_api_error e o teste falha.
    """
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-para-teste")
    monkeypatch.setenv("FORCA_USE_MOLDE_ARCHITECTURE", "true")

    import json as _json

    import backend.services.job_manager as jm

    from backend.app import _executar_geracao_molde, app

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

    resposta_falsa = types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text=molde_json)],
        stop_reason="end_turn",
    )

    job, _ = jm.criar_job(user_id="user-contrato")

    with mock.patch(
        "backend.utils.anthropic_retry.criar_mensagem_com_deadline",
        autospec=True,                      # <- o que faltava: valida a assinatura
        return_value=resposta_falsa,
    ) as helper_mock, mock.patch("backend.app.persistir_plano", return_value="db-plan-contrato"):
        with app.app_context():
            _executar_geracao_molde(
                job,
                questionnaire_data={"nivelExperiencia": "iniciante"},
                diretrizes={"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
                user_id="user-contrato",
                access_token="fake-token",
            )

    assert job.status != jm.JobStatus.ERRO, (
        f"pipeline do molde falhou: {getattr(job, 'error_code', None)} "
        f"— {getattr(job, 'error_message', None)}"
    )
    assert job.status == jm.JobStatus.SALVO
    assert job.plan_id == "db-plan-contrato"

    # O orçamento tem de chegar preenchido, não como None nem ausente.
    argumentos = helper_mock.call_args
    orcamento = (
        argumentos.args[1] if len(argumentos.args) > 1
        else argumentos.kwargs.get("orcamento_segundos")
    )
    assert isinstance(orcamento, (int, float)) and orcamento > 0, (
        f"orçamento inválido repassado ao helper: {orcamento!r}"
    )
