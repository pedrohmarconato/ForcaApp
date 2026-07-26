# Contrato do rascunho produzido pelo editor de plano manual.
#
# O editor trabalha com campos anuláveis porque o usuário pode deixar duração,
# %RM e dia em aberto. O conversor remove esses `null` antes de validar o molde
# legado, que não os aceita. Assim existe uma única fronteira explícita entre o
# contrato do app e o pipeline determinístico já usado pela IA.

_PROGRESSAO_SERIES = {
    "type": "object",
    "required": ["ativa", "valor", "semana_inicio", "semana_fim"],
    "properties": {
        "ativa": {"type": "boolean"},
        "valor": {"type": "integer", "minimum": -2, "maximum": 3},
        "semana_inicio": {"type": "integer", "minimum": 1, "maximum": 52},
        "semana_fim": {"type": "integer", "minimum": 1, "maximum": 52},
    },
}

_PROGRESSAO_CARDIO = {
    "type": "object",
    "required": ["ativa", "valor", "alvo"],
    "properties": {
        "ativa": {"type": "boolean"},
        "valor": {"type": "number", "minimum": 1, "maximum": 10},
        "alvo": {"type": "string", "enum": ["duracao", "distancia", "ambos"]},
    },
}

_PROGRESSAO_INTENSIDADE = {
    "type": "object",
    "required": ["ativa", "valor"],
    "properties": {
        "ativa": {"type": "boolean"},
        "valor": {"type": "number", "minimum": 0.5, "maximum": 10},
    },
}

_PROGRESSAO_DELOAD = {
    "type": "object",
    "required": ["ativa", "semana", "fator_rm", "fator_series"],
    "properties": {
        "ativa": {"type": "boolean"},
        "semana": {"type": "integer", "minimum": 1, "maximum": 52},
        "fator_rm": {"type": "number", "minimum": 0.5, "maximum": 0.9},
        "fator_series": {"type": "number", "minimum": 0.5, "maximum": 0.9},
    },
}

PLANO_MANUAL_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "RascunhoDePlanoManual",
    "type": "object",
    "required": ["nome", "duracao_semanas", "progressao", "treinos"],
    "properties": {
        "nome": {"type": "string", "minLength": 1, "maxLength": 80},
        "duracao_semanas": {
            "type": "integer",
            "minimum": 1,
            "maximum": 52,
            "default": 12,
        },
        "progressao": {
            "type": "object",
            "required": ["series", "cardio", "intensidade", "deload"],
            "properties": {
                "series": {"anyOf": [_PROGRESSAO_SERIES, {"type": "null"}]},
                "cardio": {"anyOf": [_PROGRESSAO_CARDIO, {"type": "null"}]},
                "intensidade": {
                    "anyOf": [_PROGRESSAO_INTENSIDADE, {"type": "null"}]
                },
                "deload": {"anyOf": [_PROGRESSAO_DELOAD, {"type": "null"}]},
            },
        },
        "treinos": {
            "type": "array",
            "minItems": 1,
            "maxItems": 7,
            "items": {
                "type": "object",
                "required": [
                    "nome",
                    "dia_offset",
                    "duracao_minutos",
                    "incluir_aquecimento",
                    "incluir_alongamento",
                    "exercicios",
                ],
                "properties": {
                    "nome": {"type": "string", "minLength": 1, "maxLength": 60},
                    "dia_offset": {
                        "anyOf": [
                            {"type": "integer", "minimum": 0, "maximum": 6},
                            {"type": "null"},
                        ]
                    },
                    "duracao_minutos": {
                        "anyOf": [
                            {"type": "integer", "minimum": 15, "maximum": 180},
                            {"type": "null"},
                        ]
                    },
                    "incluir_aquecimento": {"type": "boolean"},
                    "incluir_alongamento": {"type": "boolean"},
                    "exercicios": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 30,
                        "items": {
                            "type": "object",
                            "required": [
                                "exercise_key",
                                "nome",
                                "equipamento",
                                "series",
                                "repeticoes",
                                "duracao_minutos",
                                "distancia_km",
                                "tempo_descanso",
                                "prioridade",
                                "percentual_rm",
                                "observacoes",
                                "tem_limitacao",
                            ],
                            "properties": {
                                "exercise_key": {
                                    "anyOf": [
                                        {"type": "string", "minLength": 1, "maxLength": 120},
                                        {"type": "null"},
                                    ]
                                },
                                "nome": {
                                    "type": "string",
                                    "minLength": 1,
                                    "maxLength": 80,
                                },
                                "equipamento": {
                                    "anyOf": [
                                        {"type": "string", "maxLength": 80},
                                        {"type": "null"},
                                    ]
                                },
                                "series": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "maximum": 10,
                                },
                                "repeticoes": {
                                    "anyOf": [
                                        {"type": "string", "minLength": 1, "maxLength": 30},
                                        {"type": "null"},
                                    ]
                                },
                                "duracao_minutos": {
                                    "anyOf": [
                                        {"type": "number", "minimum": 1, "maximum": 180},
                                        {"type": "null"},
                                    ]
                                },
                                "distancia_km": {
                                    "anyOf": [
                                        {"type": "number", "minimum": 0.1, "maximum": 100},
                                        {"type": "null"},
                                    ]
                                },
                                "tempo_descanso": {
                                    "anyOf": [
                                        {"type": "string", "minLength": 1, "maxLength": 30},
                                        {"type": "number"},
                                        {"type": "null"},
                                    ]
                                },
                                "prioridade": {
                                    "type": "string",
                                    "enum": ["primario", "secundario", "acessorio"],
                                },
                                "percentual_rm": {
                                    "anyOf": [
                                        {"type": "number", "minimum": 0, "maximum": 100},
                                        {"type": "null"},
                                    ]
                                },
                                "observacoes": {
                                    "anyOf": [
                                        {"type": "string", "maxLength": 1000},
                                        {"type": "null"},
                                    ]
                                },
                                "tem_limitacao": {"type": "boolean"},
                                # O catálogo continua autoritativo. Este campo
                                # só é considerado pelo pipeline quando
                                # exercise_key/nome não casam com o catálogo,
                                # viabilizando o seletor de métrica do nome livre.
                                "metrica": {
                                    "anyOf": [
                                        {
                                            "type": "string",
                                            "enum": [
                                                "carga_reps",
                                                "tempo",
                                                "tempo_distancia",
                                            ],
                                        },
                                        {"type": "null"},
                                    ]
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}
