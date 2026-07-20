# backend/tests/test_plan_expander.py
# Testes do expansor determinístico: molde → plano completo de 12 semanas.
# Cobre: estrutura, progressão, determinismo, edge cases.

import datetime
import json
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.services.plan_expander import expandir_plano  # noqa: E402

DADOS_USUARIO = {
    "id": "usr-123",
    "nome": "Teste",
    "nivel": "intermediário",
    "objetivos": [{"nome": "Hipertrofia", "prioridade": 1}],
    "restricoes": [],
}


def _molde_minimo():
    return {
        "nome": "Plano Teste",
        "descricao": "Plano mínimo para testes.",
        "periodizacao": {"tipo": "Linear"},
        "duracao_semanas": 4,
        "frequencia_semanal": 2,
        "semanas_tipo": [
            {
                "id": "tipo_a",
                "nome": "Tipo A",
                "sessoes": [
                    {
                        "nome": "Treino A",
                        "tipo": "Hipertrofia",
                        "duracao_minutos": 60,
                        "dia_offset": 0,
                        "grupos_musculares": [{"nome": "Peito"}],
                        "exercicios": [
                            {
                                "nome": "Supino Reto",
                                "ordem": 1,
                                "series": 4,
                                "repeticoes": "8-12",
                                "percentual_rm": 75,
                                "tempo_descanso": "60s",
                                "prioridade": "primario",
                            },
                            {
                                "nome": "Crucifixo",
                                "ordem": 2,
                                "series": 3,
                                "repeticoes": "12-15",
                                "percentual_rm": 65,
                                "prioridade": "secundario",
                            },
                        ],
                    },
                    {
                        "nome": "Treino B",
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
        "calendario": ["tipo_a"] * 4,
        "progressao": {"regras": []},
    }


# ==================== Estrutura e integridade ====================

def test_expansor_retorna_estrutura_completa():
    plano = expandir_plano(_molde_minimo(), DADOS_USUARIO)
    assert "treinamento_id" in plano
    assert "versao" in plano
    assert "data_criacao" in plano
    assert "usuario" in plano
    assert "plano_principal" in plano


def test_plano_principal_tem_ciclos():
    plano = expandir_plano(_molde_minimo(), DADOS_USUARIO)
    pp = plano["plano_principal"]
    assert pp["nome"] == "Plano Teste"
    assert pp["duracao_semanas"] == 4
    assert pp["frequencia_semanal"] == 2
    assert len(pp["ciclos"]) == 1  # 4 semanas = 1 ciclo
    assert pp["ciclos"][0]["duracao_semanas"] == 4


def test_cada_semana_tem_sessoes():
    plano = expandir_plano(_molde_minimo(), DADOS_USUARIO)
    for ciclo in plano["plano_principal"]["ciclos"]:
        for micro in ciclo["microciclos"]:
            assert len(micro["sessoes"]) == 2
            for sessao in micro["sessoes"]:
                assert len(sessao["exercicios"]) > 0


def test_ids_sao_unicos():
    plano = expandir_plano(_molde_minimo(), DADOS_USUARIO)
    ids = set()
    for ciclo in plano["plano_principal"]["ciclos"]:
        for micro in ciclo["microciclos"]:
            for sessao in micro["sessoes"]:
                assert sessao["sessao_id"] not in ids
                ids.add(sessao["sessao_id"])
                for ex in sessao["exercicios"]:
                    assert ex["exercicio_id"] not in ids
                    ids.add(ex["exercicio_id"])


def test_usuario_preservado():
    plano = expandir_plano(_molde_minimo(), DADOS_USUARIO)
    assert plano["usuario"]["id"] == "usr-123"
    assert plano["usuario"]["nivel"] == "intermediário"


# ==================== Determinismo ====================

def test_mesma_entrada_mesma_saida():
    molde = _molde_minimo()
    p1 = expandir_plano(molde, DADOS_USUARIO)
    p2 = expandir_plano(molde, DADOS_USUARIO)

    # Remove campos variáveis (timestamp, UUIDs)
    del p1["data_criacao"]
    del p1["treinamento_id"]
    del p2["data_criacao"]
    del p2["treinamento_id"]

    # Remove UUIDs de ciclos/sessões/exercícios (são regenerados a cada chamada)
    for plano in [p1, p2]:
        for ciclo in plano["plano_principal"]["ciclos"]:
            ciclo.pop("ciclo_id", None)
            for micro in ciclo["microciclos"]:
                for sessao in micro["sessoes"]:
                    sessao.pop("sessao_id", None)
                    for ex in sessao["exercicios"]:
                        ex.pop("exercicio_id", None)

    assert p1 == p2


# ==================== Progressão ====================

def test_delta_rm_aplica_incremento():
    molde = _molde_minimo()
    molde["progressao"]["regras"] = [
        {
            "tipo": "delta_rm_percentual",
            "semana_inicio": 2,
            "semana_fim": 4,
            "valor": 2.5,
            "grupo_alvo": "todos",
        }
    ]

    plano = expandir_plano(molde, DADOS_USUARIO)
    ciclos = plano["plano_principal"]["ciclos"]
    sessoes_semana1 = ciclos[0]["microciclos"][0]["sessoes"]
    sessoes_semana2 = ciclos[0]["microciclos"][1]["sessoes"]
    sessoes_semana4 = ciclos[0]["microciclos"][3]["sessoes"]

    supino_sem1 = sessoes_semana1[0]["exercicios"][0]
    supino_sem2 = sessoes_semana2[0]["exercicios"][0]
    supino_sem4 = sessoes_semana4[0]["exercicios"][0]

    assert supino_sem1["percentual_rm"] == 75  # semana 1: sem incremento
    assert supino_sem2["percentual_rm"] == 78  # semana 2: +2.5
    assert supino_sem4["percentual_rm"] == 82  # semana 4: +7.5 acumulado


def test_delta_rm_respeita_teto():
    molde = _molde_minimo()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["percentual_rm"] = 93
    molde["progressao"]["regras"] = [
        {
            "tipo": "delta_rm_percentual",
            "semana_inicio": 2,
            "semana_fim": 4,
            "valor": 3.0,
            "grupo_alvo": "todos",
        }
    ]

    plano = expandir_plano(molde, DADOS_USUARIO)
    sessoes_sem4 = plano["plano_principal"]["ciclos"][0]["microciclos"][3]["sessoes"]
    rm = sessoes_sem4[0]["exercicios"][0]["percentual_rm"]
    assert rm <= 95


def test_delta_series_aplica_incremento():
    molde = _molde_minimo()
    molde["progressao"]["regras"] = [
        {
            "tipo": "delta_series",
            "semana_inicio": 2,
            "semana_fim": 3,
            "valor": 1,
            "grupo_alvo": "primario",
        }
    ]

    plano = expandir_plano(molde, DADOS_USUARIO)
    ciclos = plano["plano_principal"]["ciclos"]
    supino_sem1 = ciclos[0]["microciclos"][0]["sessoes"][0]["exercicios"][0]
    supino_sem2 = ciclos[0]["microciclos"][1]["sessoes"][0]["exercicios"][0]
    crucifixo_sem2 = ciclos[0]["microciclos"][1]["sessoes"][0]["exercicios"][1]

    assert supino_sem1["series"] == 4  # semana 1: baseline
    assert supino_sem2["series"] == 5  # semana 2: +1 (primario)
    assert crucifixo_sem2["series"] == 3  # semana 2: sem delta (secundario)


def test_delta_series_respeita_piso():
    molde = _molde_minimo()
    molde["semanas_tipo"][0]["sessoes"][0]["exercicios"][0]["series"] = 3
    molde["progressao"]["regras"] = [
        {
            "tipo": "delta_series",
            "semana_inicio": 2,
            "semana_fim": 3,
            "valor": -2,
            "grupo_alvo": "todos",
        }
    ]

    plano = expandir_plano(molde, DADOS_USUARIO)
    sessoes_sem2 = plano["plano_principal"]["ciclos"][0]["microciclos"][1]["sessoes"]
    series = sessoes_sem2[0]["exercicios"][0]["series"]
    assert series >= 2  # piso


def test_deload_aplica_fatores():
    molde = _molde_minimo()
    molde["progressao"]["regras"] = [
        {
            "tipo": "deload_percentual",
            "semana": 4,
            "fator_rm": 0.8,
            "fator_series": 0.8,
        }
    ]

    plano = expandir_plano(molde, DADOS_USUARIO)
    ciclos = plano["plano_principal"]["ciclos"]

    supino_sem1 = ciclos[0]["microciclos"][0]["sessoes"][0]["exercicios"][0]
    supino_sem4 = ciclos[0]["microciclos"][3]["sessoes"][0]["exercicios"][0]

    assert supino_sem1["percentual_rm"] == 75
    assert supino_sem4["percentual_rm"] == 60  # 75 * 0.8 = 60
    assert supino_sem1["series"] == 4
    assert supino_sem4["series"] == 3  # 4 * 0.8 = 3 (arredondado)


def test_deload_nao_afeta_outras_semanas():
    molde = _molde_minimo()
    molde["progressao"]["regras"] = [
        {
            "tipo": "deload_percentual",
            "semana": 4,
            "fator_rm": 0.8,
            "fator_series": 0.8,
        }
    ]

    plano = expandir_plano(molde, DADOS_USUARIO)
    sessoes_sem3 = plano["plano_principal"]["ciclos"][0]["microciclos"][2]["sessoes"]
    rm_sem3 = sessoes_sem3[0]["exercicios"][0]["percentual_rm"]
    assert rm_sem3 == 75  # inalterado


# ==================== Semanas avulsas ====================

def test_semana_avulsa_substitui():
    molde = _molde_minimo()
    molde["semanas_avulsas"] = {
        "semana_2": {
            "semana": 2,
            "sessoes": [
                {
                    "nome": "Treino Especial",
                    "tipo": "Resistência",
                    "duracao_minutos": 45,
                    "grupos_musculares": [{"nome": "Full Body"}],
                    "exercicios": [
                        {"nome": "Burpee", "ordem": 1, "series": 5, "repeticoes": "15", "percentual_rm": 50}
                    ],
                }
            ],
        }
    }

    plano = expandir_plano(molde, DADOS_USUARIO)
    sessoes_sem2 = plano["plano_principal"]["ciclos"][0]["microciclos"][1]["sessoes"]
    assert len(sessoes_sem2) == 1
    assert sessoes_sem2[0]["nome"] == "Treino Especial"
    assert sessoes_sem2[0]["tipo"] == "Resistência"

    # Verifica que outras semanas não são afetadas
    sessoes_sem1 = plano["plano_principal"]["ciclos"][0]["microciclos"][0]["sessoes"]
    assert sessoes_sem1[0]["nome"] == "Treino A"


# ==================== Molde inválido ====================

def test_molde_invalido_levanta_valueerror():
    with pytest.raises(ValueError, match="Molde inválido"):
        expandir_plano({}, DADOS_USUARIO)


def test_semana_tipo_inexistente_no_calendario_levanta_valueerror():
    molde = _molde_minimo()
    molde["calendario"] = ["tipo_z"] * 4
    with pytest.raises(ValueError, match="tipo_z"):
        expandir_plano(molde, DADOS_USUARIO)


# ==================== Classificação automática ====================

def test_volume_classificado():
    molde = _molde_minimo()
    plano = expandir_plano(molde, DADOS_USUARIO)
    micro = plano["plano_principal"]["ciclos"][0]["microciclos"][0]
    # 2 sessões × (4 + 3 séries) = 14 séries → "Baixo"
    assert micro["volume"] == "Baixo"


def test_intensidade_classificada():
    molde = _molde_minimo()
    plano = expandir_plano(molde, DADOS_USUARIO)
    micro = plano["plano_principal"]["ciclos"][0]["microciclos"][0]
    # Média: (75 + 65 + 70) / 3 ≈ 70 → "Moderada"
    assert micro["intensidade"] == "Moderada"


# ==================== Calendário variável ====================

def test_calendario_com_dois_tipos():
    molde = _molde_minimo()
    molde["semanas_tipo"].append({
        "id": "tipo_b",
        "nome": "Tipo B",
        "sessoes": [
            {
                "nome": "Full Body",
                "tipo": "Força",
                "duracao_minutos": 45,
                "dia_offset": 0,
                "grupos_musculares": [{"nome": "Full Body"}],
                "exercicios": [
                    {"nome": "Agachamento", "ordem": 1, "series": 5, "repeticoes": "5", "percentual_rm": 85}
                ],
            }
        ],
    })
    molde["calendario"] = ["tipo_a", "tipo_a", "tipo_b", "tipo_a"]

    plano = expandir_plano(molde, DADOS_USUARIO)
    ciclos = plano["plano_principal"]["ciclos"]

    sem1 = ciclos[0]["microciclos"][0]
    sem3 = ciclos[0]["microciclos"][2]

    assert sem1["sessoes"][0]["nome"] == "Treino A"
    assert sem3["sessoes"][0]["nome"] == "Full Body"
    assert len(sem3["sessoes"]) == 1


# ==================== Contrato de saída ====================

def test_saida_compativel_com_plan_mapper():
    """O output do expansor deve ser aceito pelo mapear_plano_ia sem erros."""
    from backend.services.plan_mapper import mapear_plano_ia

    plano = expandir_plano(_molde_minimo(), DADOS_USUARIO)
    resultado = mapear_plano_ia(plano, user_id=DADOS_USUARIO["id"])
    assert "plan" in resultado
    assert len(resultado["sessions"]) > 0
    assert len(resultado["exercises"]) > 0
    assert len(resultado["sets"]) > 0
