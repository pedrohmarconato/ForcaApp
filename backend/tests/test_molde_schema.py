# backend/tests/test_molde_schema.py
# Testes de validação do MOLDE_SCHEMA com jsonschema.

import os
import sys
import copy

import pytest
import jsonschema

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.schemas.molde_schema import MOLDE_SCHEMA  # noqa: E402


def _molde_valido():
    return {
        "nome": "Hipertrofia + Força",
        "descricao": "Plano com duas semanas-tipo.",
        "periodizacao": {"tipo": "Linear", "descricao": "Progressão gradual."},
        "duracao_semanas": 12,
        "frequencia_semanal": 4,
        "semanas_tipo": [
            {
                "id": "tipo_a",
                "nome": "3 grupos/dia",
                "sessoes": [
                    {
                        "nome": "Peito/Tríceps",
                        "tipo": "Hipertrofia",
                        "duracao_minutos": 60,
                        "dia_offset": 0,
                        "grupos_musculares": [{"nome": "Peito"}, {"nome": "Tríceps"}],
                        "exercicios": [
                            {
                                "nome": "Supino Reto",
                                "ordem": 1,
                                "series": 4,
                                "repeticoes": "8-12",
                                "percentual_rm": 75,
                                "tempo_descanso": "60s",
                                "prioridade": "primario",
                            }
                        ],
                    },
                    {
                        "nome": "Costas/Bíceps",
                        "tipo": "Hipertrofia",
                        "duracao_minutos": 55,
                        "dia_offset": 2,
                        "grupos_musculares": [{"nome": "Costas"}],
                        "exercicios": [
                            {
                                "nome": "Remada Curvada",
                                "ordem": 1,
                                "series": 3,
                                "repeticoes": "8-12",
                                "percentual_rm": 70,
                                "prioridade": "primario",
                            }
                        ],
                    },
                ],
            }
        ],
        "calendario": ["tipo_a"] * 12,
        "progressao": {
            "regras": [
                {
                    "tipo": "delta_rm_percentual",
                    "semana_inicio": 2,
                    "semana_fim": 4,
                    "valor": 2.5,
                    "grupo_alvo": "todos",
                },
                {
                    "tipo": "deload_percentual",
                    "semana": 9,
                    "fator_rm": 0.8,
                    "fator_series": 0.7,
                },
            ]
        },
    }


def test_molde_valido_passa():
    jsonschema.validate(instance=_molde_valido(), schema=MOLDE_SCHEMA)


def test_molde_sem_semanas_tipo_falha():
    molde = _molde_valido()
    del molde["semanas_tipo"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_molde_sem_calendario_falha():
    molde = _molde_valido()
    del molde["calendario"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_molde_sem_progressao_falha():
    molde = _molde_valido()
    del molde["progressao"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_calendario_vazio_falha():
    molde = _molde_valido()
    molde["calendario"] = []
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_semana_tipo_sem_sessoes_falha():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"] = []
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_exercicio_sem_nome_falha():
    molde = _molde_valido()
    ex = molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]
    del ex["nome"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_regra_delta_rm_valida():
    molde = _molde_valido()
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_regra_delta_rm_sem_semana_inicio_falha():
    molde = _molde_valido()
    regra = molde["progressao"]["regras"][0]
    del regra["semana_inicio"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_regra_delta_series_valida():
    molde = _molde_valido()
    molde["progressao"]["regras"] = [
        {"tipo": "delta_series", "semana_inicio": 2, "semana_fim": 6, "valor": 1, "grupo_alvo": "primario"}
    ]
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_regra_tipo_invalido_falha():
    molde = _molde_valido()
    molde["progressao"]["regras"] = [
        {"tipo": "regra_inventada", "semana_inicio": 1, "semana_fim": 2, "valor": 1}
    ]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_semanas_avulsas_valida():
    molde = _molde_valido()
    molde["semanas_avulsas"] = {
        "semana_5": {
            "semana": 5,
            "sessoes": [
                {
                    "nome": "Treino Especial",
                    "tipo": "Resistência",
                    "duracao_minutos": 45,
                    "grupos_musculares": [{"nome": "Full Body"}],
                    "exercicios": [
                        {"nome": "Burpee", "ordem": 1, "series": 3, "repeticoes": "15"}
                    ],
                }
            ],
        }
    }
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_prioridade_invalida_falha():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["prioridade"] = "invalido"
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_series_zero_falha():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["series"] = 0
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_percentual_rm_acima_de_100_falha():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["percentual_rm"] = 120
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_delta_rm_valor_negativo_rejeitado_localmente():
    """O MOLDE_SCHEMA local valida restrições numéricas (minimum).
    A API Anthropic aceita json_schema mas não as valida — a validação
    local cobre esse gap."""
    molde = _molde_valido()
    molde["progressao"]["regras"][0]["valor"] = -5
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_id_semana_tipo_fora_do_pattern_falha():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["id"] = "SemanaTipoInválida"
    molde["calendario"] = ["SemanaTipoInválida"] * 12
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
