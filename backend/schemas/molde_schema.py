# backend/schemas/molde_schema.py
# Schema do molde que o Opus 4.8 gera. Validado localmente por jsonschema
# ANTES de alimentar o expansor. A API da Anthropic aceita json_schema no
# output_config (GA no Opus 4.8), mas NÃO valida restrições numéricas
# (minimum, maximum etc.) — essas são validadas aqui.

MOLDE_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "MoldeDeTreinamento",
    "description": "Estrutura enxuta do plano: semanas-tipo + calendário + progressão.",
    "type": "object",
    "required": ["semanas_tipo", "calendario", "progressao"],
    "properties": {
        "nome": {"type": "string", "description": "Nome do plano (ex: Hipertrofia + Força)."},
        "descricao": {"type": "string", "description": "Resumo da estratégia."},
        "periodizacao": {
            "type": "object",
            "required": ["tipo"],
            "properties": {
                "tipo": {"type": "string"},
                "descricao": {"type": "string"}
            }
        },
        "duracao_semanas": {"type": "integer", "minimum": 1, "maximum": 52},
        "frequencia_semanal": {"type": "integer", "minimum": 1, "maximum": 7},
        "semanas_tipo": {
            "type": "array",
            "minItems": 1,
            "description": "Semanas-tipo (modelos de semana reutilizáveis no calendário).",
            "items": {
                "type": "object",
                "required": ["id", "sessoes"],
                "properties": {
                    "id": {"type": "string", "pattern": "^tipo_[a-z]$", "description": "Identificador curto (ex: tipo_a)."},
                    "nome": {"type": "string", "description": "Nome descritivo (ex: 3 grupos/dia)."},
                    "sessoes": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 7,
                        "items": {
                            "type": "object",
                            "required": ["nome", "tipo", "exercicios"],
                            "properties": {
                                "nome": {"type": "string", "description": "Nome da sessão (ex: Peito/Tríceps)."},
                                "tipo": {"type": "string", "description": "Tipo de treino (ex: Hipertrofia)."},
                                "duracao_minutos": {"type": "integer", "minimum": 15, "maximum": 180},
                                "dia_offset": {"type": "integer", "minimum": 0, "maximum": 6, "description": "0=segunda ... 6=domingo."},
                                "nivel_intensidade": {"type": "integer", "minimum": 1, "maximum": 10},
                                "grupos_musculares": {
                                    "type": "array",
                                    "items": {"type": "object", "required": ["nome"], "properties": {"nome": {"type": "string"}}}
                                },
                                "exercicios": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "required": ["nome", "ordem", "series", "repeticoes"],
                                        "properties": {
                                            "nome": {
                                                "type": "string",
                                                "description": (
                                                    "Nome EXATO de um exercício do catálogo fornecido no prompt "
                                                    "(ex: 'Remada Curvada com Halteres'). Sem tradução literal do "
                                                    "inglês e sem estado da semana no nome — '(Deload)', '(Força)' "
                                                    "e similares vão em observacoes."
                                                ),
                                            },
                                            "ordem": {"type": "integer", "minimum": 1},
                                            "equipamento": {"type": "string"},
                                            "series": {"type": "integer", "minimum": 1, "maximum": 10},
                                            "repeticoes": {"type": "string", "description": "Ex: '8-12', '10', 'AMRAP'."},
                                            "percentual_rm": {"type": "number", "minimum": 0, "maximum": 100},
                                            "tempo_descanso": {"description": "Ex: '60s', 90, '2min'."},
                                            "cadencia": {"type": "string", "description": "Ex: '2020', 'Explosiva'."},
                                            "metodo": {"type": "string", "description": "Ex: 'Drop-set', 'Rest-pause'."},
                                            "prioridade": {"type": "string", "enum": ["primario", "secundario", "acessorio"]},
                                            "observacoes": {"type": "string"}
                                        }
                                    }
                                },
                                "aquecimento": {
                                    "type": "object",
                                    "properties": {
                                        "duracao_minutos": {"type": "integer"},
                                        "exercicios": {"type": "array", "items": {"type": "string"}}
                                    }
                                },
                                "desaquecimento": {
                                    "type": "object",
                                    "properties": {
                                        "duracao_minutos": {"type": "integer"},
                                        "exercicios": {"type": "array", "items": {"type": "string"}}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "calendario": {
            "type": "array",
            "minItems": 1,
            "maxItems": 52,
            "description": "Qual semana-tipo ocupa cada uma das semanas do plano (índice 0 = semana 1).",
            "items": {"type": "string", "description": "id da semana-tipo (ex: tipo_a)."}
        },
        "progressao": {
            "type": "object",
            "required": ["regras"],
            "properties": {
                "regras": {
                    "type": "array",
                    "items": {
                        "oneOf": [
                            {
                                "type": "object",
                                "required": ["tipo", "semana_inicio", "semana_fim", "valor"],
                                "properties": {
                                    "tipo": {"const": "delta_rm_percentual"},
                                    "semana_inicio": {"type": "integer", "minimum": 1},
                                    "semana_fim": {"type": "integer", "minimum": 1},
                                    "valor": {"type": "number", "minimum": 0.5, "maximum": 10.0},
                                    "grupo_alvo": {"type": "string", "enum": ["todos", "primario", "secundario"]}
                                }
                            },
                            {
                                "type": "object",
                                "required": ["tipo", "semana_inicio", "semana_fim", "valor"],
                                "properties": {
                                    "tipo": {"const": "delta_series"},
                                    "semana_inicio": {"type": "integer", "minimum": 1},
                                    "semana_fim": {"type": "integer", "minimum": 1},
                                    "valor": {"type": "integer", "minimum": -2, "maximum": 3},
                                    "grupo_alvo": {"type": "string", "enum": ["todos", "primario", "secundario"]}
                                }
                            },
                            {
                                "type": "object",
                                "required": ["tipo", "semana"],
                                "properties": {
                                    "tipo": {"const": "deload_percentual"},
                                    "semana": {"type": "integer", "minimum": 1},
                                    "fator_rm": {"type": "number", "minimum": 0.5, "maximum": 0.9},
                                    "fator_series": {"type": "number", "minimum": 0.5, "maximum": 0.9}
                                }
                            }
                        ]
                    }
                }
            }
        },
        "semanas_avulsas": {
            "type": "object",
            "description": "Semanas explícitas para exceções que não couberam no vocabulário de progressão.",
            "additionalProperties": {
                "type": "object",
                "required": ["sessoes", "semana"],
                "properties": {
                    "semana": {"type": "integer", "minimum": 1},
                    "sessoes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["nome", "tipo", "exercicios"],
                            "properties": {
                                "nome": {"type": "string"},
                                "tipo": {"type": "string"},
                                "duracao_minutos": {"type": "integer"},
                                "grupos_musculares": {
                                    "type": "array",
                                    "items": {"type": "object", "required": ["nome"]}
                                },
                                "exercicios": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "required": ["nome", "ordem", "series", "repeticoes"],
                                        "properties": {
                                            "nome": {
                                                "type": "string",
                                                "description": (
                                                    "Nome EXATO de um exercício do catálogo fornecido no prompt. "
                                                    "Semana avulsa NÃO muda o nome do exercício: se é deload, "
                                                    "isso vai em observacoes, nunca em nome."
                                                ),
                                            },
                                            "ordem": {"type": "integer"},
                                            "series": {"type": "integer", "minimum": 1},
                                            "repeticoes": {"type": "string"},
                                            "percentual_rm": {"type": "number"},
                                            "tempo_descanso": {},
                                            "cadencia": {"type": "string"},
                                            "metodo": {"type": "string"},
                                            "prioridade": {"type": "string", "enum": ["primario", "secundario", "acessorio"]},
                                            "observacoes": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
