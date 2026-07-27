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
                                        "description": (
                                            "Todo exercício precisa de PELO MENOS UM alvo de prescrição: "
                                            "`repeticoes` (carga × repetição), `duracao_minutos` (cardio e "
                                            "isometria) ou `distancia_km`. Cardio e isometria NÃO usam "
                                            "`repeticoes`."
                                        ),
                                        "required": ["nome", "ordem", "series"],
                                        "anyOf": [
                                            {"required": ["repeticoes"]},
                                            {"required": ["duracao_minutos"]},
                                            {"required": ["distancia_km"]},
                                        ],
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
                                            # Piso em 0,25 min (15 s): isometria
                                            # curta — prancha de 45 s = 0,75 —
                                            # é prescrição legítima e o piso de
                                            # 1 minuto a tornava inexprimível.
                                            "duracao_minutos": {
                                                "type": "number",
                                                "minimum": 0.25,
                                                "maximum": 180,
                                                "description": (
                                                    "OBRIGATÓRIO em cardio e isometria (prancha): quanto tempo "
                                                    "dura a série, em minutos (0,75 = 45 s). Nesses exercícios "
                                                    "NÃO use repeticoes."
                                                ),
                                            },
                                            "distancia_km": {
                                                "type": "number",
                                                "minimum": 0.01,
                                                "maximum": 100,
                                                "description": "Distância-alvo em km, quando a prescrição for por distância.",
                                            },
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
                                "required": ["tipo", "semana_inicio", "semana_fim", "valor"],
                                "description": (
                                    "Progressão do CARDIO: aumenta duração (e distância, quando houver) "
                                    "em X% por semana. Cardio não progride por %RM."
                                ),
                                "properties": {
                                    "tipo": {"const": "delta_cardio_percentual"},
                                    "semana_inicio": {"type": "integer", "minimum": 1},
                                    "semana_fim": {"type": "integer", "minimum": 1},
                                    "valor": {"type": "number", "minimum": 1.0, "maximum": 10.0},
                                    "alvo": {"type": "string", "enum": ["duracao", "distancia", "ambos"]}
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
        # Mapa `semana_N -> {...}`. O expansor lê por essa chave. Mapa de
        # chaves livres não é expressável em structured outputs, e cabia mal no
        # teto de parâmetros opcionais da API, então o campo fica FORA do
        # MOLDE_SCHEMA_API (ver _reduzir_opcionais): com structured output
        # ligado o modelo não emite semanas avulsas. Aqui continua valendo —
        # é o formato do modo sem structured e dos moldes já gerados.
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
                                # Espelha o item das semanas-tipo: `nome` era
                                # exigido mas não tipado, o que deixava o
                                # objeto sem forma — e sem forma ele não é
                                # expressável em structured outputs.
                                "grupos_musculares": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "required": ["nome"],
                                        "properties": {"nome": {"type": "string"}}
                                    }
                                },
                                "exercicios": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "description": (
                                            "Mesmo contrato das semanas-tipo: pelo menos um alvo de "
                                            "prescrição entre `repeticoes`, `duracao_minutos` e `distancia_km`."
                                        ),
                                        "required": ["nome", "ordem", "series"],
                                        "anyOf": [
                                            {"required": ["repeticoes"]},
                                            {"required": ["duracao_minutos"]},
                                            {"required": ["distancia_km"]},
                                        ],
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
                                            "duracao_minutos": {"type": "number", "minimum": 0.25, "maximum": 180},
                                            "distancia_km": {"type": "number", "minimum": 0.01, "maximum": 100},
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


# ============================================================
# Schema para `output_config.format` (structured outputs)
# ============================================================
# Derivado do MOLDE_SCHEMA acima — nunca escrito à mão. Ver
# backend/schemas/schema_api.py para o porquê e para o subconjunto que a API
# aceita.
#
# Dois ajustes precisam acontecer ANTES da derivação, porque são construções
# que esse subconjunto não expressa de jeito nenhum:
#
#   1. `tempo_descanso: {}` (schema vazio, aceita qualquer coisa) vira um
#      anyOf explícito. É o que o plan_mapper realmente consome:
#      _parse_descanso_segundos aceita "60s", 90 e None.
#   2. `semanas_avulsas` deixa de ser mapa `semana_N -> {...}` e vira array.
#      molde_normalizer.normalizar_molde converte de volta antes da validação
#      local, então nada a jusante enxerga a diferença.

import copy as _copy

from backend.schemas.schema_api import derivar_schema_api

_TEMPO_DESCANSO_TIPADO = {
    "anyOf": [{"type": "string"}, {"type": "number"}, {"type": "null"}],
    "description": "Ex: '60s', 90, '2min'.",
}


def _tipar_tempo_descanso(no):
    """Substitui todo `tempo_descanso: {}` pelo anyOf explícito, em qualquer
    profundidade — o campo aparece nas semanas-tipo E nas semanas avulsas, e
    um dos dois esquecido reprova o schema inteiro na compilação da API."""
    if isinstance(no, dict):
        for chave, valor in list(no.items()):
            if chave == "tempo_descanso":
                no[chave] = _copy.deepcopy(_TEMPO_DESCANSO_TIPADO)
            else:
                _tipar_tempo_descanso(valor)
    elif isinstance(no, list):
        for item in no:
            _tipar_tempo_descanso(item)
    return no


def _remover_anyof_de_refinamento(no):
    """Tira o `anyOf` dos nós que TAMBÉM descrevem um objeto.

    O padrão no MOLDE_SCHEMA é "exercício é este objeto E tem pelo menos um
    alvo de prescrição (repeticoes | duracao_minutos | distancia_km)". A API
    rejeita a combinação:
        400 — For 'anyOf', 'additionalProperties, properties, required, type'
              is not supported

    A restrição não some do sistema: continua no MOLDE_SCHEMA, que é o que
    valida a resposta antes de qualquer coisa ser gravada, e um molde sem alvo
    de prescrição reprova ali e vai para o retry dirigido. O que se perde é a
    imposição na ORIGEM — o modelo passa a poder devolver um exercício sem
    alvo, e a instrução 7 do prompt é quem o desencoraja.
    """
    if isinstance(no, dict):
        if "anyOf" in no and "properties" in no:
            no.pop("anyOf")
        for valor in no.values():
            _remover_anyof_de_refinamento(valor)
    elif isinstance(no, list):
        for item in no:
            _remover_anyof_de_refinamento(item)
    return no


def _exigir(no, *campos):
    """Move campos de opcional para obrigatório, preservando a ordem."""
    required = list(no.get("required") or [])
    for campo in campos:
        if campo in no.get("properties", {}) and campo not in required:
            required.append(campo)
    no["required"] = required
    return no


def _reduzir_opcionais(schema):
    """A API limita o schema a 24 parâmetros OPCIONAIS (o molde tinha 44):

        400 — Schemas contains too many optional parameters (44), which would
              make grammar compilation inefficient (limit: 24)

    Dois cortes, nesta ordem de preferência:

    1. Campos que na prática sempre deveriam vir preenchidos passam a ser
       obrigatórios. Isso não perde nada — o schema local continua aceitando
       ausência, então nenhum molde antigo deixa de valer — e ainda conserta um
       problema conhecido: `grupos_musculares` opcional é o que deixava
       muscle_group nulo e o replanejamento semanal sem grupo para
       redistribuir (ver migration 0013).

    2. `semanas_avulsas` sai do schema da API. Sozinha ela custava 12 dos 44
       opcionais, por duplicar a estrutura inteira de sessão. Com structured
       output LIGADO o modelo deixa de poder emiti-la — a exceção mais comum
       (deload) já é expressável por `deload_percentual`, e o resto cabe em
       `observacoes`. O campo continua no MOLDE_SCHEMA, então moldes que já
       usam o formato e o modo sem structured seguem funcionando.
    """
    props = schema["properties"]
    _exigir(schema, "nome", "descricao", "duracao_semanas", "frequencia_semanal", "periodizacao")

    semana_tipo = props["semanas_tipo"]["items"]
    _exigir(semana_tipo, "nome")

    sessao = semana_tipo["properties"]["sessoes"]["items"]
    _exigir(sessao, "duracao_minutos", "dia_offset", "grupos_musculares")

    exercicio = sessao["properties"]["exercicios"]["items"]
    _exigir(exercicio, "prioridade", "tempo_descanso")

    props.pop("semanas_avulsas", None)
    return schema


def _podar_campos_inertes(schema):
    """Terceiro limite da API, depois de opcionais e chaves não suportadas:

        400 — The compiled grammar is too large, which would cause performance
              issues. Simplify your tool schemas.

    O corte foi escolhido por bissecção contra a API real, e recaiu no par que
    NADA consome no caminho molde → expansor → mapper → banco:
    `aquecimento`/`desaquecimento` da sessão. Eles existem no schema desde o
    contrato do TreinadorEspecialista (o gerador legado, desligado), o prompt
    nunca os menciona, e o aquecimento que o aluno vê hoje é injetado pelo
    pipeline a partir dos toggles do questionário — não vem do molde.

    `metodo`, `cadencia` e `nivel_intensidade` foram deliberadamente
    PRESERVADOS: são o vocabulário que a rodada de variabilidade vai usar.
    """
    sessao = schema["properties"]["semanas_tipo"]["items"]["properties"]["sessoes"]["items"]
    for campo in ("aquecimento", "desaquecimento"):
        sessao["properties"].pop(campo, None)
    return schema


def _preparar_para_api(schema):
    preparado = _copy.deepcopy(schema)
    _tipar_tempo_descanso(preparado)
    _remover_anyof_de_refinamento(preparado)
    _reduzir_opcionais(preparado)
    _podar_campos_inertes(preparado)
    return preparado


MOLDE_SCHEMA_API = derivar_schema_api(_preparar_para_api(MOLDE_SCHEMA))
