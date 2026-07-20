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
