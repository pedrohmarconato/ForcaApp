# backend/tests/test_schema_api.py
# Derivação do schema que vai em `output_config.format` (structured outputs).
#
# Modos de falha que estes testes reproduzem:
#   - schema derivado com chave que a API não aceita (minimum, maxLength,
#     pattern, oneOf): a chamada volta 400 na COMPILAÇÃO do schema, o pipeline
#     trata como "falha na comunicação com o serviço de IA" e o aluno vê um
#     erro genérico enquanto o defeito está no nosso schema;
#   - objeto sem `additionalProperties: false`: mesmo 400, mesmo diagnóstico
#     ruim — e basta UM objeto esquecido no fundo da árvore;
#   - objeto de forma livre virando `{}` fechado em silêncio: o campo continua
#     no schema e nunca mais recebe conteúdo (foi o que aconteceu com
#     `grupos_musculares` das semanas avulsas, que exigia `nome` sem tipá-lo);
#   - schema derivado que perde uma propriedade do schema local: o modelo deixa
#     de poder gerar aquele campo e ninguém percebe, porque nada falha.

import os
import sys

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.schemas.diretrizes_schema import DIRETRIZES_SCHEMA, DIRETRIZES_SCHEMA_API  # noqa: E402
from backend.schemas.molde_schema import (  # noqa: E402
    CAMPOS_NULAVEIS_DO_EXERCICIO,
    MOLDE_SCHEMA,
    MOLDE_SCHEMA_API,
)
from backend.schemas.schema_api import (  # noqa: E402
    SchemaNaoExpressavel,
    chaves_proibidas_restantes,
    derivar_schema_api,
    formato_json_schema,
    objetos_sem_fechamento,
)


@pytest.mark.parametrize("schema", [MOLDE_SCHEMA_API, DIRETRIZES_SCHEMA_API], ids=["molde", "diretrizes"])
def test_derivado_nao_tem_chave_que_a_api_rejeita(schema):
    assert chaves_proibidas_restantes(schema) == []


@pytest.mark.parametrize("schema", [MOLDE_SCHEMA_API, DIRETRIZES_SCHEMA_API], ids=["molde", "diretrizes"])
def test_todo_objeto_do_derivado_esta_fechado(schema):
    assert objetos_sem_fechamento(schema) == []


def test_limites_numericos_continuam_no_schema_local():
    """A API não impõe minimum/maximum — quem impõe é a validação local.

    Se alguém "limpar" o schema local para deixá-lo igual ao da API, os limites
    somem do sistema inteiro: séries negativas e %RM de 300 passariam a valer.
    """
    series = MOLDE_SCHEMA["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"][
        "properties"
    ]["exercicios"]["items"]["properties"]["series"]
    assert series["minimum"] == 1 and series["maximum"] == 10


def test_oneof_das_regras_vira_anyof():
    """`oneOf` não está no subconjunto aceito. Os ramos são discriminados por
    um `const` em `tipo`, então `anyOf` casa exatamente o mesmo conjunto."""
    regras = MOLDE_SCHEMA_API["properties"]["progressao"]["properties"]["regras"]["items"]
    assert "oneOf" not in regras
    tipos = [r["properties"]["tipo"]["const"] for r in regras["anyOf"]]
    assert tipos == [
        "delta_rm_percentual",
        "delta_series",
        "delta_cardio_percentual",
        "deload_percentual",
    ]


# Os três limites que a API impõe ao schema de structured outputs. Cada um
# deles derrubou uma versão deste schema com um 400 — e nenhum aparece em
# validação local de JSON Schema, porque o schema é válido: só não é aceito.
LIMITE_PARAMETROS_OPCIONAIS = 24


def _contar_opcionais(no, acc=None):
    acc = acc if acc is not None else []
    if isinstance(no, dict):
        props = no.get("properties") or {}
        obrigatorios = set(no.get("required") or [])
        acc.extend(nome for nome in props if nome not in obrigatorios)
        for sub in props.values():
            _contar_opcionais(sub, acc)
        for chave in ("items", "additionalProperties"):
            if isinstance(no.get(chave), dict):
                _contar_opcionais(no[chave], acc)
        for chave in ("anyOf", "allOf"):
            for ramo in no.get(chave) or []:
                _contar_opcionais(ramo, acc)
    return acc


@pytest.mark.parametrize("schema", [MOLDE_SCHEMA_API, DIRETRIZES_SCHEMA_API], ids=["molde", "diretrizes"])
def test_respeita_o_teto_de_parametros_opcionais(schema):
    """400 — "Schemas contains too many optional parameters (N), limit: 24".

    O molde chegou a 44. Um campo opcional novo pode reabrir o estouro, e o
    sintoma em produção é a geração inteira falhando com erro de comunicação.
    """
    opcionais = _contar_opcionais(schema)
    assert len(opcionais) <= LIMITE_PARAMETROS_OPCIONAIS, opcionais


# O teto de 24 é o que a API AVISA. O que ela não avisa é que o custo de
# compilar a gramática cresce com o número de opcionais no MESMO objeto — e o
# estouro chega como "Grammar compilation timed out" depois de dois minutos de
# espera, com a geração do aluno perdida (produção, 31/07/2026, job 7d4d46e7).
# Medido contra a API real, no objeto `exercicio`: 4 opcionais → 18,9 s;
# 6 → 43,7 s; 8 → 72,1 s; 9 → 140,9 s e o 400. O limite abaixo é o último
# degrau com folga confortável.
LIMITE_OPCIONAIS_POR_OBJETO = 4


def _opcionais_por_objeto(no, caminho="$", acc=None):
    acc = acc if acc is not None else {}
    if isinstance(no, dict):
        props = no.get("properties") or {}
        obrigatorios = set(no.get("required") or [])
        opcionais = [nome for nome in props if nome not in obrigatorios]
        if opcionais:
            acc[caminho] = opcionais
        for nome, sub in props.items():
            _opcionais_por_objeto(sub, f"{caminho}.{nome}", acc)
        for chave in ("items", "additionalProperties"):
            if isinstance(no.get(chave), dict):
                _opcionais_por_objeto(no[chave], f"{caminho}[{chave}]", acc)
        for chave in ("anyOf", "allOf"):
            for i, ramo in enumerate(no.get(chave) or []):
                _opcionais_por_objeto(ramo, f"{caminho}.{chave}[{i}]", acc)
    return acc


@pytest.mark.parametrize("schema", [MOLDE_SCHEMA_API, DIRETRIZES_SCHEMA_API], ids=["molde", "diretrizes"])
def test_nenhum_objeto_concentra_opcionais_demais(schema):
    """Reproduz o modo de falha de 31/07: o objeto mais aninhado do molde
    concentrava 8 opcionais e a compilação da gramática estourava o tempo da
    API. Contar o TOTAL (teste acima) não pega isso — 8 opcionais num objeto
    custam muito mais que 8 espalhados por oito objetos."""
    excedentes = {
        caminho: opcionais
        for caminho, opcionais in _opcionais_por_objeto(schema).items()
        if len(opcionais) > LIMITE_OPCIONAIS_POR_OBJETO
    }
    assert excedentes == {}, excedentes


def test_metadados_do_exercicio_sao_obrigatorios_aceitando_null():
    """A troca que derrubou a compilação de 72,1 s para 16,1 s.

    `null` precisa estar em TODOS eles: obrigar a chave sem deixar o modelo
    dizer "não se aplica" o forçaria a inventar cadência para agachamento e
    %RM para corrida — inventado passa em toda validação e chega ao aluno.
    """
    exercicio = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"][
        "items"
    ]["properties"]["exercicios"]["items"]
    for campo in CAMPOS_NULAVEIS_DO_EXERCICIO:
        assert campo in exercicio["required"], campo
        tipos = {ramo.get("type") for ramo in exercicio["properties"][campo]["anyOf"]}
        assert "null" in tipos, campo


def test_alvos_de_prescricao_continuam_opcionais():
    """O contrapeso do teste acima: `repeticoes`, `duracao_minutos` e
    `distancia_km` NÃO podem ser nulificados junto. A ausência deles é o que
    distingue cardio de série com carga, e a API recusa o schema inteiro
    ("The compiled grammar is too large") quando os oito viram nuláveis."""
    exercicio = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"][
        "items"
    ]["properties"]["exercicios"]["items"]
    for alvo in ("repeticoes", "duracao_minutos", "distancia_km"):
        assert alvo not in exercicio["required"], alvo


def test_campos_que_sempre_deveriam_vir_sao_obrigatorios_para_a_api():
    """Foi assim que se cortaram opcionais sem perder capacidade.

    `dia_offset` NÃO entra: obrigar o modelo a escolher o dia de cada sessão,
    sem poder lhe dizer a faixa (a API não aceita minimum/maximum) e sem
    nenhuma regra de unicidade em lugar nenhum, empilhava a semana inteira num
    dia só — e isso passa em toda a validação e chega ao banco. Opcional, vale
    o fallback determinístico do mapper.
    """
    sessao = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    assert {"duracao_minutos", "grupos_musculares"} <= set(sessao["required"])
    assert "dia_offset" not in sessao["required"]
    exercicio = sessao["properties"]["exercicios"]["items"]
    assert {"prioridade", "tempo_descanso"} <= set(exercicio["required"])
    # ...e nada disso vazou para o schema local, que segue aceitando ausência:
    sessao_local = MOLDE_SCHEMA["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    assert "dia_offset" not in sessao_local["required"]


def test_grupos_musculares_obrigatorio_exige_conteudo_no_schema_local():
    """`required` na API garante a CHAVE; `minItems` garante o CONTEÚDO — e
    `minItems` é justamente o que structured outputs não expressa. Sem a
    restrição no schema local, `[]` satisfaz o obrigatório e o muscle_group
    volta a chegar nulo (migration 0013), que é o problema que a mudança dizia
    ter consertado."""
    sessao_local = MOLDE_SCHEMA["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    assert sessao_local["properties"]["grupos_musculares"]["minItems"] == 1
    # e a chave não pode ter vazado para o schema da API, que a rejeita:
    sessao_api = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    assert "minItems" not in sessao_api["properties"]["grupos_musculares"]


def test_anyof_com_irmaos_estruturais_falha_alto():
    """400 — "For 'anyOf', 'additionalProperties, properties, required, type'
    is not supported". Era o "exercício é este objeto E tem pelo menos um alvo
    de prescrição" do MOLDE_SCHEMA."""
    with pytest.raises(SchemaNaoExpressavel) as erro:
        derivar_schema_api({
            "type": "object",
            "required": ["a"],
            "properties": {"a": {"type": "string"}},
            "anyOf": [{"required": ["a"]}],
        })
    assert "anyOf" in str(erro.value)


def test_o_refinamento_de_alvo_de_prescricao_continua_no_schema_local():
    """A restrição sai do schema da API mas não do sistema: é a validação
    local que reprova um exercício sem repeticoes/duracao/distancia."""
    exercicio_local = MOLDE_SCHEMA["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"][
        "items"
    ]["properties"]["exercicios"]["items"]
    alvos = {tuple(r["required"]) for r in exercicio_local["anyOf"]}
    assert alvos == {("repeticoes",), ("duracao_minutos",), ("distancia_km",)}


def test_tempo_descanso_deixa_de_ser_schema_vazio():
    """`{}` aceita qualquer coisa — inclusive objeto, que _parse_descanso_segundos
    não consome. O anyOf reflete o que o mapper realmente aceita."""
    exercicio = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"][
        "items"
    ]["properties"]["exercicios"]["items"]["properties"]
    tipos = {ramo["type"] for ramo in exercicio["tempo_descanso"]["anyOf"]}
    assert tipos == {"string", "number", "null"}


# O que a derivação PODA, e por quê. Qualquer ausência fora desta lista é
# regressão: um campo some do schema da API, o modelo deixa de poder gerá-lo,
# e nada falha — o plano só chega sem ele.
PODAS_DELIBERADAS = {
    # Sozinha custava 12 dos 44 opcionais (duplica a estrutura de sessão).
    # A exceção mais comum (deload) cabe em deload_percentual.
    "$.semanas_avulsas",
    # Inertes: nada no caminho molde → expansor → mapper lê esses campos. O
    # aquecimento que o aluno vê vem dos toggles do questionário.
    "$.semanas_tipo.sessoes.aquecimento",
    "$.semanas_tipo.sessoes.desaquecimento",
}


def _nomes(schema, prefixo="$"):
    encontrados = set()
    if isinstance(schema, dict):
        for nome, sub in (schema.get("properties") or {}).items():
            encontrados.add(f"{prefixo}.{nome}")
            encontrados |= _nomes(sub, f"{prefixo}.{nome}")
        for chave in ("items", "additionalProperties"):
            if isinstance(schema.get(chave), dict):
                encontrados |= _nomes(schema[chave], prefixo)
        for chave in ("anyOf", "allOf", "oneOf"):
            for ramo in schema.get(chave) or []:
                encontrados |= _nomes(ramo, prefixo)
    return encontrados


def test_derivacao_so_poda_o_que_esta_documentado():
    """Cobertura: cada propriedade do molde local existe no derivado, exceto as
    podas deliberadas — e cada poda deliberada realmente aconteceu."""
    no_local = _nomes(MOLDE_SCHEMA)
    no_derivado = _nomes(MOLDE_SCHEMA_API)

    podado = {c for c in no_local - no_derivado if not any(c.startswith(p) for p in PODAS_DELIBERADAS)}
    assert podado == set(), f"campos sumiram sem estar documentados: {sorted(podado)}"
    assert PODAS_DELIBERADAS <= no_local, "a lista de podas cita campo que nem existe no schema local"


def test_vocabulario_da_variabilidade_sobrevive():
    """metodo/cadencia/nivel_intensidade poderiam ter sido cortados junto para
    encolher a gramática. Não foram: são o que a próxima rodada usa para tirar
    o plano da repetição."""
    sessao = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    assert "nivel_intensidade" in sessao["properties"]
    exercicio = sessao["properties"]["exercicios"]["items"]["properties"]
    assert {"metodo", "cadencia", "observacoes"} <= set(exercicio)


def test_diretrizes_poda_apenas_o_objeto_de_forma_livre():
    """`detalhes` é o único campo podado, e a poda é deliberada: objeto sem
    forma não é expressável. Qualquer outra ausência é regressão."""
    faltando = set(DIRETRIZES_SCHEMA["properties"]) - set(DIRETRIZES_SCHEMA_API["properties"])
    assert faltando == set()
    excecao_local = DIRETRIZES_SCHEMA["properties"]["excecoes_estruturais"]["items"]["properties"]
    excecao_api = DIRETRIZES_SCHEMA_API["properties"]["excecoes_estruturais"]["items"]["properties"]
    assert set(excecao_local) - set(excecao_api) == {"detalhes"}


def test_objeto_de_forma_livre_falha_alto():
    """Sem este guard, o objeto vira `{}` fechado e passa a aceitar só `{}`."""
    with pytest.raises(SchemaNaoExpressavel) as erro:
        derivar_schema_api({"type": "object", "properties": {"livre": {"type": "object"}}})
    assert "livre" in str(erro.value)


def test_mapa_de_chaves_livres_falha_alto():
    with pytest.raises(SchemaNaoExpressavel) as erro:
        derivar_schema_api({
            "type": "object",
            "properties": {"mapa": {"type": "object", "additionalProperties": {"type": "string"}}},
        })
    assert "additionalProperties" in str(erro.value)


def test_formato_so_manda_os_campos_documentados():
    """Campo extra em `format` volta como 400 na compilação, não como aviso."""
    formato = formato_json_schema({"type": "object", "properties": {}, "additionalProperties": False})
    assert set(formato) == {"format"}
    assert set(formato["format"]) == {"type", "schema"}
    assert formato["format"]["type"] == "json_schema"


def test_descricoes_sobrevivem_a_derivacao():
    """As descrições são contexto que o modelo lê — foi assim que o schema
    ensinou a não usar `repeticoes` em cardio. Removê-las é perda silenciosa."""
    exercicios = MOLDE_SCHEMA_API["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"][
        "items"
    ]["properties"]["exercicios"]["items"]
    assert "repeticoes" in exercicios["description"]
    assert "catálogo" in exercicios["properties"]["nome"]["description"].lower()
