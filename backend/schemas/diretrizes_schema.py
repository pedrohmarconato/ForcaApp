# backend/schemas/diretrizes_schema.py
# Schema do objeto de diretrizes do aluno — output da consolidação do chat.
# Validado localmente por jsonschema antes de alimentar o prompt do molde.

DIRETRIZES_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "DiretrizesDoAluno",
    "description": "Ajustes, restrições e exceções estruturais extraídas da conversa com o aluno.",
    "type": "object",
    "required": ["preferencias", "restricoes", "excecoes_estruturais"],
    "properties": {
        "preferencias": {
            "type": "array",
            "description": "Preferências e ajustes gerais solicitados pelo aluno.",
            "items": {"type": "string", "maxLength": 500}
        },
        "restricoes": {
            "type": "array",
            "description": "Restrições pontuais (exercícios, grupos musculares, equipamentos, tempo).",
            "items": {
                "type": "object",
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
                    "exercicio_afetado": {"type": "string", "description": "Nome do exercício afetado, se aplicável."},
                    "grupo_afetado": {"type": "string", "description": "Nome do grupo muscular afetado, se aplicável."}
                }
            }
        },
        "excecoes_estruturais": {
            "type": "array",
            "description": "Mudanças estruturais no plano (semanas-tipo, dias, sessões).",
            "items": {
                "type": "object",
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
                    "detalhes": {
                        "type": "object",
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
