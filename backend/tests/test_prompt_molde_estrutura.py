# backend/tests/test_prompt_molde_estrutura.py
# Estrutura do prompt do molde (layout v2 + structured outputs).
#
# Modos de falha que estes testes reproduzem:
#   - dado do aluno vazando para o bloco estável: o prefixo passa a mudar a
#     cada geração e o cache NUNCA casa — o layout v2 vira custo puro (a
#     escrita de cache custa 1,25x) sem nenhuma leitura;
#   - schema no texto E em output_config ao mesmo tempo: o mesmo schema pago
#     duas vezes em cada geração, que é exatamente o que a mudança quer evitar;
#   - `effort` sobrescrevendo o `format` (ou vice-versa): os dois moram no
#     MESMO parâmetro output_config, então dois dicts separados fazem o segundo
#     apagar o primeiro em silêncio — o plano sai sem structured output e
#     ninguém percebe até um JSON malformado derrubar a geração;
#   - flag desligada mudando o prompt: enquanto FORCA_PROMPT_MOLDE_V2 for
#     false, produção precisa receber o MESMO texto de sempre, byte a byte.

import os
import sys

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app  # noqa: E402
from backend.schemas.molde_schema import MOLDE_SCHEMA_API  # noqa: E402

QUESTIONARIO = '{"objetivo": "<<MARCADOR_QUESTIONARIO>>"}'
DIRETRIZES = '{"preferencias": ["<<MARCADOR_DIRETRIZES>>"]}'
CATALOGO = "Peito: Supino Reto com Barra | Crucifixo com Halteres"


@pytest.fixture
def flags(monkeypatch):
    def configurar(*, v2=False, structured=False):
        monkeypatch.setattr(app, "FORCA_PROMPT_MOLDE_V2", v2)
        monkeypatch.setattr(app, "FORCA_STRUCTURED_OUTPUT", structured)
        return app._montar_chamada_do_molde(QUESTIONARIO, DIRETRIZES, CATALOGO)

    return configurar


def test_layout_legado_continua_num_unico_bloco_de_usuario(flags):
    chamada = flags()
    assert set(chamada) == {"messages"}
    assert len(chamada["messages"]) == 1
    conteudo = chamada["messages"][0]["content"]
    assert "SCHEMA DO MOLDE:" in conteudo
    assert QUESTIONARIO in conteudo and CATALOGO in conteudo


def test_v2_separa_o_estavel_do_volatil(flags):
    chamada = flags(v2=True)
    estavel = chamada["system"][0]["text"]
    volatil = chamada["messages"][0]["content"]

    # O que muda por aluno não pode estar no prefixo cacheado.
    assert "<<MARCADOR_QUESTIONARIO>>" not in estavel
    assert "<<MARCADOR_DIRETRIZES>>" not in estavel
    assert "<<MARCADOR_QUESTIONARIO>>" in volatil and "<<MARCADOR_DIRETRIZES>>" in volatil

    # E o que é estável não pode ficar depois do breakpoint.
    assert CATALOGO in estavel and CATALOGO not in volatil
    assert "INSTRUÇÕES:" in estavel and "INSTRUÇÕES:" not in volatil


def test_v2_marca_o_fim_do_prefixo_com_cache_control(flags):
    chamada = flags(v2=True)
    assert chamada["system"][-1]["cache_control"] == {"type": "ephemeral"}


def test_v2_mantem_persona_antes_do_catalogo(flags):
    """Cache é casamento de prefixo: a persona (100% estável) precisa vir antes
    do catálogo, que varia com inclui_cardio/inclui_alongamento do aluno."""
    estavel = flags(v2=True)["system"][0]["text"]
    assert estavel.index("treinador de elite") < estavel.index("CATÁLOGO DE EXERCÍCIOS")


@pytest.mark.parametrize("v2", [False, True], ids=["legado", "v2"])
def test_structured_output_tira_o_schema_do_texto(flags, v2):
    chamada = flags(v2=v2, structured=True)
    texto = " ".join(
        [bloco["text"] for bloco in chamada.get("system", [])]
        + [m["content"] for m in chamada["messages"]]
    )
    assert "SCHEMA DO MOLDE:" not in texto
    assert '"$schema"' not in texto
    assert chamada["output_config"]["format"]["schema"] is MOLDE_SCHEMA_API


def test_sem_structured_output_nao_manda_output_config(flags):
    assert "output_config" not in flags(v2=True)


# O modelo precisa ser explícito em todo teste de effort: o gate por modelo
# roda ANTES da checagem de valor, então chamar sem modelo faria estes testes
# passarem pelo motivo errado (barrados pelo gate, não pela regra que testam).
MODELO_COM_EFFORT = "claude-opus-4-8"


def test_effort_convive_com_o_formato_no_mesmo_output_config(monkeypatch):
    monkeypatch.setenv("PLAN_EFFORT", "medium")
    config = app._output_config_da_geracao(
        {"format": {"type": "json_schema", "schema": {}}}, MODELO_COM_EFFORT
    )
    assert config["effort"] == "medium"
    assert config["format"]["type"] == "json_schema"


def test_effort_ausente_preserva_o_comportamento_atual(monkeypatch):
    monkeypatch.delenv("PLAN_EFFORT", raising=False)
    assert "effort" not in app._output_config_da_geracao({"format": {}}, MODELO_COM_EFFORT)
    assert app._output_config_da_geracao(None, MODELO_COM_EFFORT) == {}


def test_effort_invalido_e_ignorado_em_vez_de_virar_400(monkeypatch):
    """Um valor inválido aqui volta 400 da API, e o aluno lê 'falha na
    comunicação com o serviço de IA' — erro de operação virando erro de produto."""
    monkeypatch.setenv("PLAN_EFFORT", "altissimo")
    assert app._output_config_da_geracao({"format": {}}, MODELO_COM_EFFORT) == {"format": {}}


def test_structured_output_para_de_pedir_semanas_avulsas(flags):
    """`semanas_avulsas` não cabe no schema que a API impõe. Instruir o modelo
    a usá-la seria pedir uma saída rejeitada — e queimar a única tentativa do
    retry dirigido nisso."""
    # Sem structured output o campo existe e a instrução continua valendo.
    assert "Use semanas_avulsas APENAS" in flags()["messages"][0]["content"]

    chamada = flags(v2=True, structured=True)
    estavel = chamada["system"][0]["text"]
    assert "semanas_avulsas" not in estavel
    assert "deload_percentual para semanas mais leves" in estavel
