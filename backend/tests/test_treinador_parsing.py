# backend/tests/test_treinador_parsing.py
# Achado #7 do review do PR #4: o parser descartava JSON válido sem code fence
# (regex não-gulosa parava no primeiro '}') e truncamento por max_tokens era
# tratado como falha genérica, sem diagnóstico.

import json
import os
import sys
import unittest.mock as mock

import pytest

os.environ["ANTHROPIC_API_KEY"] = "dummy-para-teste"
os.environ.setdefault("SUPABASE_URL", "https://teste.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key-teste")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.wrappers.treinador_especialista import TreinadorEspecialista  # noqa: E402

OBJ_ANINHADO = {
    "plano_principal": {
        "nome": "Plano X",
        "ciclos": [{"microciclos": [{"semana": 1, "sessoes": [{"nome": "A"}]}]}],
    }
}


@pytest.fixture(scope="module")
def treinador():
    return TreinadorEspecialista()


def test_json_aninhado_SEM_code_fence_e_extraido(treinador):
    """A instrução pede 'somente JSON' — obedecer não pode quebrar o parser."""
    texto = json.dumps(OBJ_ANINHADO, ensure_ascii=False)
    assert treinador._extrair_json_da_resposta(texto) == OBJ_ANINHADO


def test_json_com_texto_em_volta_e_extraido(treinador):
    texto = "Aqui está o plano:\n" + json.dumps(OBJ_ANINHADO) + "\nBons treinos!"
    assert treinador._extrair_json_da_resposta(texto) == OBJ_ANINHADO


def test_code_fence_continua_funcionando(treinador):
    texto = "```json\n" + json.dumps(OBJ_ANINHADO) + "\n```"
    assert treinador._extrair_json_da_resposta(texto) == OBJ_ANINHADO


def test_lixo_retorna_none(treinador):
    assert treinador._extrair_json_da_resposta("não tem json aqui { quebrado") is None


def test_resposta_truncada_por_max_tokens_vira_erro_explicito(treinador):
    resposta = mock.Mock()
    resposta.stop_reason = "max_tokens"
    bloco = mock.Mock()
    bloco.text = '{"plano_principal": {'
    resposta.content = [bloco]

    cliente = mock.Mock()
    cliente.messages.create.return_value = resposta

    with mock.patch.object(treinador, "anthropic_client", cliente):
        with pytest.raises(RuntimeError, match="truncad"):
            treinador._chamar_api_claude("prompt qualquer")
