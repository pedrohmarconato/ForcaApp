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


# ==================== Cardio e isometria (prescrição por tempo) ====================
#
# Defeito observado no smoke de HML em 25/07/2026: o job morria em
# `molde_validation` com "'repeticoes' is a required property" sempre que o
# aluno pedia cardio. A instrução 7 do prompt do molde manda NÃO usar
# `repeticoes` em cardio e isometria ("20min" escrito em repeticoes vira 20
# REPETIÇÕES), enquanto o schema — que vai no mesmo prompt — exigia o campo em
# todo exercício. O modelo obedecia à instrução e o schema o reprovava.
#
# Contrato correto: todo exercício precisa de PELO MENOS UM alvo de prescrição —
# `repeticoes` (carga × repetição), `duracao_minutos` (tempo) ou `distancia_km`.


def test_cardio_por_tempo_sem_repeticoes_e_valido():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"].append({
        "nome": "Esteira",
        "ordem": 2,
        "series": 1,
        "duracao_minutos": 20,
        "prioridade": "acessorio",
    })
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_cardio_por_distancia_sem_repeticoes_e_valido():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"].append({
        "nome": "Corrida",
        "ordem": 2,
        "series": 1,
        "distancia_km": 5,
    })
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_isometria_por_tempo_sem_repeticoes_e_valida():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"].append({
        "nome": "Prancha",
        "ordem": 2,
        "series": 3,
        "duracao_minutos": 1,
    })
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_exercicio_sem_nenhum_alvo_de_prescricao_falha():
    """Sem repeticoes, sem duracao e sem distância não há o que prescrever."""
    molde = _molde_valido()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"] = [
        {"nome": "Supino Reto", "ordem": 1, "series": 4, "percentual_rm": 75}
    ]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_semana_avulsa_aceita_cardio_por_tempo():
    molde = _molde_valido()
    molde["semanas_avulsas"] = {
        "semana_6": {
            "semana": 6,
            "sessoes": [
                {
                    "nome": "Recuperação Ativa",
                    "tipo": "Cardio",
                    "duracao_minutos": 30,
                    "exercicios": [
                        {"nome": "Caminhada", "ordem": 1, "series": 1, "duracao_minutos": 30}
                    ],
                }
            ],
        }
    }
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_semana_avulsa_sem_alvo_de_prescricao_falha():
    molde = _molde_valido()
    molde["semanas_avulsas"] = {
        "semana_6": {
            "semana": 6,
            "sessoes": [
                {
                    "nome": "Recuperação Ativa",
                    "tipo": "Cardio",
                    "exercicios": [{"nome": "Caminhada", "ordem": 1, "series": 1}],
                }
            ],
        }
    }
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_repeticoes_nao_e_exigida_incondicionalmente_em_lugar_nenhum():
    """Trava de regressão: nenhum `required` do schema pode voltar a exigir
    `repeticoes` fora de uma alternativa `anyOf`/`oneOf`, senão o prompt e o
    schema voltam a se contradizer."""
    exigencias = []

    def _varrer(no, caminho, dentro_de_alternativa):
        if isinstance(no, dict):
            if not dentro_de_alternativa and "repeticoes" in (no.get("required") or []):
                exigencias.append(caminho)
            for chave, valor in no.items():
                _varrer(valor, f"{caminho}.{chave}", chave in ("anyOf", "oneOf"))
        elif isinstance(no, list):
            for i, item in enumerate(no):
                _varrer(item, f"{caminho}[{i}]", dentro_de_alternativa)

    _varrer(MOLDE_SCHEMA, "MOLDE_SCHEMA", False)
    assert exigencias == [], f"`repeticoes` exigida incondicionalmente em: {exigencias}"


def test_id_semana_tipo_fora_do_pattern_falha():
    molde = _molde_valido()
    molde["semanas_tipo"][0]["id"] = "SemanaTipoInválida"
    molde["calendario"] = ["SemanaTipoInválida"] * 12
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
