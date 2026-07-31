# backend/schemas/diretrizes_schema.py
# Schema do objeto de diretrizes do aluno — output da consolidação do chat.
# Validado localmente por jsonschema antes de alimentar o prompt do molde.

# VALID-01 do review defensivo de 31/07/2026: o schema não fechava
# propriedades extras nem limitava a quantidade de itens, e `detalhes` era um
# objeto de forma livre. Como este mesmo schema valida as diretrizes que
# CHEGAM do cliente em /api/generate-plan — e essas diretrizes são serializadas
# inteiras dentro do prompt pago do molde — um payload autenticado podia
# inflar o prompt até o limite global de 256 KiB.
#
# Os tetos abaixo são folgados para o uso real (uma conversa de onboarding
# produz um punhado de preferências) e apertados o bastante para que o prompt
# não vire vetor de custo.
MAX_ITENS_POR_LISTA = 30
MAX_DETALHES_CHAVES = 20

DIRETRIZES_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "DiretrizesDoAluno",
    "description": "Ajustes, restrições e exceções estruturais extraídas da conversa com o aluno.",
    "type": "object",
    "additionalProperties": False,
    "required": ["preferencias", "restricoes", "excecoes_estruturais"],
    "properties": {
        "preferencias": {
            "type": "array",
            "description": "Preferências e ajustes gerais solicitados pelo aluno.",
            "maxItems": MAX_ITENS_POR_LISTA,
            "items": {"type": "string", "maxLength": 500}
        },
        "restricoes": {
            "type": "array",
            "description": "Restrições pontuais (exercícios, grupos musculares, equipamentos, tempo).",
            "maxItems": MAX_ITENS_POR_LISTA,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["descricao", "tipo"],
                "properties": {
                    "descricao": {"type": "string", "maxLength": 500},
                    "tipo": {
                        "type": "string",
                        "enum": [
                            "exercicio_especifico",
                            "grupo_muscular",
                            "equipamento",
                            "tempo_sessao",
                            "lesao",
                            "outro"
                        ]
                    },
                    "exercicio_afetado": {
                        "type": "string", "maxLength": 200,
                        "description": "Nome do exercício afetado, se aplicável."
                    },
                    "grupo_afetado": {
                        "type": "string", "maxLength": 200,
                        "description": "Nome do grupo muscular afetado, se aplicável."
                    }
                }
            }
        },
        "excecoes_estruturais": {
            "type": "array",
            "description": "Mudanças estruturais no plano (semanas-tipo, dias, sessões).",
            "maxItems": MAX_ITENS_POR_LISTA,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["tipo", "descricao"],
                "properties": {
                    "tipo": {
                        "type": "string",
                        "enum": [
                            "semanas_tipo_diferentes",
                            "dias_alternados",
                            "sessoes_variaveis",
                            "duracao_variavel",
                            "outro"
                        ]
                    },
                    "descricao": {"type": "string", "maxLength": 1000},
                    # Continua de forma livre — quem lê o campo é o prompt do
                    # molde, e engessar a forma aqui rejeitaria diretrizes
                    # legítimas. O que ele ganha é TETO: um objeto com 5 mil
                    # chaves deixa de ser um payload válido.
                    # `maxProperties` não é expressável em structured outputs,
                    # mas isso não importa: `detalhes` é podado na derivação
                    # (ver _preparar_para_api abaixo) e nunca chega à API.
                    "detalhes": {
                        "type": "object",
                        "maxProperties": MAX_DETALHES_CHAVES,
                        "description": "Detalhes estruturados da exceção (ex.: quantas semanas-tipo, quais dias)."
                    }
                }
            }
        },
        "observacoes_gerais": {
            "type": "string",
            "maxLength": 1000,
            "description": "Observações que não se encaixam nas categorias acima."
        }
    }
}


def podar_chaves_desconhecidas(diretrizes):
    """
    Remove do objeto as chaves que o schema não declara.

    Existe por causa do `additionalProperties: false` acima. O schema tem dois
    consumidores com exigências opostas:

      - a ENTRADA do cliente em /api/generate-plan, onde recusar o desconhecido
        é exatamente o ponto (é ela que vira prompt pago);
      - a SAÍDA do modelo na consolidação, onde recusar o desconhecido
        transformaria um campo extra inofensivo em 502 — a rota não tem retry,
        e com FORCA_STRUCTURED_OUTPUT desligado (o default) nada impede o
        modelo de acrescentar uma chave.

    Podar antes de validar atende os dois: o campo extra do modelo é
    descartado em silêncio, e o payload do cliente continua sendo validado
    contra o schema fechado, sem poda.
    """
    if not isinstance(diretrizes, dict):
        return diretrizes

    permitidas_raiz = set(DIRETRIZES_SCHEMA["properties"])
    podado = {k: v for k, v in diretrizes.items() if k in permitidas_raiz}

    for lista in ("restricoes", "excecoes_estruturais"):
        itens = podado.get(lista)
        if not isinstance(itens, list):
            continue
        permitidas = set(
            DIRETRIZES_SCHEMA["properties"][lista]["items"]["properties"]
        )
        podado[lista] = [
            {k: v for k, v in item.items() if k in permitidas} if isinstance(item, dict) else item
            for item in itens
        ]

    return podado


# ============================================================
# Schema para `output_config.format` (structured outputs)
# ============================================================
# Derivado do DIRETRIZES_SCHEMA acima. Ver backend/schemas/schema_api.py.
#
# Um campo é PODADO na derivação: `excecoes_estruturais[].detalhes`, um objeto
# de forma livre (sem `properties`). Structured outputs não expressa isso —
# todo objeto precisa ter forma fechada. O campo continua válido no schema
# local (nada quebra se vier de outra origem), o modelo é que deixa de
# produzi-lo: com a API impondo o formato, o que não está no schema não é
# gerado. A perda é pequena porque `descricao` — que é obrigatória — carrega o
# mesmo conteúdo em texto, e é `descricao` que o prompt do molde lê.

import copy as _copy

from backend.schemas.schema_api import derivar_schema_api


def _preparar_para_api(schema):
    preparado = _copy.deepcopy(schema)
    excecoes = preparado["properties"]["excecoes_estruturais"]["items"]["properties"]
    excecoes.pop("detalhes", None)
    return preparado


DIRETRIZES_SCHEMA_API = derivar_schema_api(_preparar_para_api(DIRETRIZES_SCHEMA))
