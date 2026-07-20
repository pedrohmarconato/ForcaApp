# backend/tests/test_treinador_parsing.py
# Achado #7 do review do PR #4: o parser descartava JSON válido sem code fence
# (regex não-gulosa parava no primeiro '}') e truncamento por max_tokens era
# tratado como falha genérica, sem diagnóstico.

import json
import os
import sys
import types
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


def test_resposta_com_bloco_thinking_extrai_o_texto(treinador):
    """Opus 4.8 (adaptive thinking) devolve [thinking, text]; o wrapper deve
    extrair o texto em vez de quebrar no bloco thinking (que não tem .text)."""
    resposta = mock.Mock()
    resposta.stop_reason = "end_turn"
    thinking = types.SimpleNamespace(type="thinking", thinking="", signature="sig")
    texto = types.SimpleNamespace(type="text", text='{"plano_principal": {"nome": "X"}}')
    resposta.content = [thinking, texto]

    cliente = mock.Mock()
    cliente.messages.create.return_value = resposta

    with mock.patch.object(treinador, "anthropic_client", cliente):
        out = treinador._chamar_api_claude("prompt")
    assert out == '{"plano_principal": {"nome": "X"}}'


def test_resposta_sem_bloco_texto_retorna_none(treinador):
    """Se o modelo gastar todo o budget pensando e não houver bloco text,
    o wrapper retorna None (falha tratada, não crash)."""
    resposta = mock.Mock()
    resposta.stop_reason = "end_turn"
    thinking = types.SimpleNamespace(type="thinking", thinking="...", signature="sig")
    resposta.content = [thinking]

    cliente = mock.Mock()
    cliente.messages.create.return_value = resposta

    with mock.patch.object(treinador, "anthropic_client", cliente):
        assert treinador._chamar_api_claude("prompt") is None


# --- Correções pós-migração Opus 4.8 (review 20/07/2026) ---

def test_template_do_prompt_exemplifica_frequencia_semanal_como_inteiro(treinador):
    """Achado #4 do review: o template mandava a string
    "Número de treinos/semana" como exemplo de frequencia_semanal; o Opus 4.8
    copia o TIPO do exemplo e o schema (integer) rejeitava o plano inteiro."""
    template = json.loads(treinador._obter_template_json_str())
    plano = template["plano_principal"]
    assert isinstance(plano["frequencia_semanal"], int)
    assert isinstance(plano["duracao_semanas"], int)


def test_cliente_anthropic_do_treinador_nao_retenta(treinador):
    """Achado #2 do review: sem max_retries=0 o SDK re-tenta timeouts 2x
    (default) — 150s x 3 = 450s de thread presa, além dos 180s do app e dos
    200s do nginx, cobrando gerações que ninguém verá."""
    assert treinador.anthropic_client.max_retries == 0


# --- Achado #5 do review externo: exemplo fixo ancorava a frequência ---

def test_template_usa_a_frequencia_do_questionario(treinador):
    template = json.loads(treinador._obter_template_json_str(frequencia_semanal=5))
    assert template["plano_principal"]["frequencia_semanal"] == 5


def test_prompt_carrega_a_frequencia_validada_no_template(treinador):
    prompt = treinador._preparar_prompt({"disponibilidade_semanal": "5"})
    assert '"frequencia_semanal": 5' in prompt
    assert '"frequencia_semanal": 4' not in prompt


def test_frequencia_invalida_cai_nos_dias_preferidos_e_depois_em_3(treinador):
    assert treinador._frequencia_semanal_do_usuario("abc", ["seg", "qua"]) == 2
    assert treinador._frequencia_semanal_do_usuario(None, []) == 3
    assert treinador._frequencia_semanal_do_usuario(99, []) == 3
    assert treinador._frequencia_semanal_do_usuario("4", []) == 4
