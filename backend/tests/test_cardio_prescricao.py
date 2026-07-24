"""
Prescrição de cardio e isometria (migration 0014).

O defeito que motivou tudo, observado no plano ativo do HML em 23/07/2026:
`reps_raw: "20min"` era parseado como target_reps_min/max = 20 (VINTE
REPETIÇÕES para uma caminhada) e o cardio ainda recebia progressão de %RM
(2%, 3%, 4%… por semana), número sem significado nenhum.
"""

import copy

import pytest

from backend.services.plan_expander import expandir_plano
from backend.services.plan_mapper import (
    _parse_distancia_metros,
    _parse_duracao_segundos,
    mapear_plano_ia,
)

USER_ID = "11111111-1111-4111-8111-111111111111"


class TestParseDuracao:
    @pytest.mark.parametrize("entrada,esperado", [
        ("20min", 1200),
        ("20 min", 1200),
        ("45s", 45),
        ("45 seg", 45),
        ("1h", 3600),
        ("25-30min", 1500),   # faixa: prescreve o piso
        (30, 1800),           # número puro em campo de duração é minuto
        ("", None),
        (None, None),
        ("AMRAP", None),
    ])
    def test_duracoes(self, entrada, esperado):
        assert _parse_duracao_segundos(entrada) == esperado


class TestParseDistancia:
    @pytest.mark.parametrize("entrada,esperado", [
        ("5km", 5000),
        ("5 km", 5000),
        ("5,5km", 5500),
        ("800m", 800),
        ("20min", None),   # tempo não é distância
        ("", None),
    ])
    def test_distancias(self, entrada, esperado):
        assert _parse_distancia_metros(entrada) == esperado


def _plano(exercicio: dict) -> dict:
    return {
        "plano_principal": {
            "nome": "Plano",
            "duracao_semanas": 1,
            "ciclos": [{
                "microciclos": [{
                    "semana": 1,
                    "sessoes": [{
                        "nome": "Cardio + Core",
                        "tipo": "Cardio",
                        "dia_semana": "sexta",
                        "grupos_musculares": [],
                        "exercicios": [exercicio],
                    }],
                }],
            }],
        }
    }


def _mapear(exercicio: dict):
    resultado = mapear_plano_ia(_plano(exercicio), user_id=USER_ID)
    return resultado["exercises"][0], resultado["sets"]


class TestCardioNoMapper:
    def test_20min_nao_vira_mais_20_repeticoes(self):
        """O defeito literal do plano do HML."""
        ex, series = _mapear({
            "nome": "Caminhada", "ordem": 1, "series": 1, "repeticoes": "20min",
        })
        assert ex["metric"] == "tempo_distancia"
        assert series[0]["target_reps_min"] is None
        assert series[0]["target_reps_max"] is None
        assert series[0]["target_duration_seconds"] == 1200

    def test_percentual_rm_de_cardio_e_descartado(self):
        """%RM 2%,3%,4%… numa caminhada é ruído da progressão de musculação."""
        ex, _ = _mapear({
            "nome": "Caminhada", "ordem": 1, "series": 1,
            "repeticoes": "20min", "percentual_rm": 4,
        })
        assert ex["target_rm_percent"] is None

    def test_duracao_minutos_explicita_tem_precedencia(self):
        _, series = _mapear({
            "nome": "Corrida", "ordem": 1, "series": 1,
            "repeticoes": "8-12", "duracao_minutos": 30,
        })
        assert series[0]["target_duration_seconds"] == 1800

    def test_distancia_em_km_vira_metros(self):
        _, series = _mapear({
            "nome": "Corrida", "ordem": 1, "series": 1,
            "repeticoes": "30min", "distancia_km": 5,
        })
        assert series[0]["target_distance_m"] == 5000

    def test_distancia_no_texto_das_repeticoes(self):
        _, series = _mapear({
            "nome": "Corrida", "ordem": 1, "series": 1, "repeticoes": "5km",
        })
        assert series[0]["target_distance_m"] == 5000

    def test_isometria_tambem_e_por_tempo(self):
        ex, series = _mapear({
            "nome": "Prancha", "ordem": 1, "series": 3, "repeticoes": "45s",
        })
        assert ex["metric"] == "tempo"
        assert series[0]["target_duration_seconds"] == 45
        assert series[0]["target_reps_min"] is None

    def test_exercicio_so_tempo_nao_recebe_distancia(self):
        _, series = _mapear({
            "nome": "Prancha", "ordem": 1, "series": 1,
            "repeticoes": "45s", "distancia_km": 5,
        })
        assert series[0]["target_distance_m"] is None

    def test_cardio_sem_prescricao_legivel_ganha_duracao_padrao(self):
        """CHECK planned_sets_alvo_coerente: a série precisa prescrever algo."""
        _, series = _mapear({
            "nome": "Bicicleta Ergométrica", "ordem": 1, "series": 1,
            "repeticoes": "moderado",
        })
        assert series[0]["target_duration_seconds"] == 20 * 60

    def test_musculacao_nao_muda(self):
        ex, series = _mapear({
            "nome": "Supino Reto com Barra", "ordem": 1, "series": 3,
            "repeticoes": "8-12", "percentual_rm": 75,
        })
        assert ex["metric"] == "carga_reps"
        assert ex["target_rm_percent"] == 75
        assert series[0]["target_reps_min"] == 8
        assert series[0]["target_duration_seconds"] is None


def _molde_com_cardio(regras):
    return {
        "nome": "Plano",
        "semanas_tipo": [{
            "id": "tipo_a",
            "sessoes": [{
                "nome": "Cardio",
                "tipo": "Cardio",
                "exercicios": [
                    {"nome": "Corrida", "ordem": 1, "series": 1,
                     "repeticoes": "1", "duracao_minutos": 20,
                     "distancia_km": 3, "percentual_rm": 60},
                    {"nome": "Supino Reto com Barra", "ordem": 2, "series": 3,
                     "repeticoes": "8-12", "percentual_rm": 70},
                ],
            }],
        }],
        "calendario": ["tipo_a"] * 4,
        "progressao": {"regras": regras},
    }


def _exercicios_da_semana(plano, semana: int):
    for ciclo in plano["plano_principal"]["ciclos"]:
        for micro in ciclo["microciclos"]:
            if micro["semana"] == semana:
                return micro["sessoes"][0]["exercicios"]
    raise AssertionError(f"semana {semana} não encontrada")


class TestProgressaoNoExpansor:
    def test_progressao_de_rm_nao_toca_cardio(self):
        """Era o que gerava %RM 2,3,4… numa caminhada."""
        molde = _molde_com_cardio([{
            "tipo": "delta_rm_percentual", "semana_inicio": 1,
            "semana_fim": 4, "valor": 5,
        }])
        plano = expandir_plano(molde, {"id": USER_ID})
        cardio, musculacao = _exercicios_da_semana(plano, 4)
        assert cardio["percentual_rm"] == 60, "o %RM do cardio não pode progredir"
        assert musculacao["percentual_rm"] > 70, "a musculação segue progredindo"

    def test_cardio_progride_por_tempo_e_distancia(self):
        molde = _molde_com_cardio([{
            "tipo": "delta_cardio_percentual", "semana_inicio": 1,
            "semana_fim": 4, "valor": 10, "alvo": "ambos",
        }])
        plano = expandir_plano(molde, {"id": USER_ID})
        semana1, semana4 = (_exercicios_da_semana(plano, n)[0] for n in (1, 4))
        assert semana1["duracao_minutos"] == 22   # 20 * 1.10
        assert semana4["duracao_minutos"] > semana1["duracao_minutos"]
        assert semana4["distancia_km"] > semana1["distancia_km"]

    def test_progressao_de_cardio_tem_teto(self):
        """Sem teto, 10%/semana por 12 semanas triplicaria o volume."""
        molde = _molde_com_cardio([{
            "tipo": "delta_cardio_percentual", "semana_inicio": 1,
            "semana_fim": 52, "valor": 10, "alvo": "duracao",
        }])
        molde["calendario"] = ["tipo_a"] * 40
        plano = expandir_plano(molde, {"id": USER_ID})
        ultima = _exercicios_da_semana(plano, 40)[0]
        assert ultima["duracao_minutos"] <= 20 * 2.0

    def test_deload_reduz_o_cardio_por_tempo(self):
        molde = _molde_com_cardio([{
            "tipo": "deload_percentual", "semana": 3,
            "fator_rm": 0.6, "fator_series": 0.6,
        }])
        plano = expandir_plano(molde, {"id": USER_ID})
        cardio = _exercicios_da_semana(plano, 3)[0]
        assert cardio["duracao_minutos"] == 12  # 20 * 0.6
        assert cardio["percentual_rm"] == 60, "deload de cardio não mexe em %RM"

    def test_apenas_o_alvo_declarado_progride(self):
        molde = _molde_com_cardio([{
            "tipo": "delta_cardio_percentual", "semana_inicio": 1,
            "semana_fim": 4, "valor": 10, "alvo": "duracao",
        }])
        plano = expandir_plano(molde, {"id": USER_ID})
        cardio = _exercicios_da_semana(plano, 4)[0]
        assert cardio["duracao_minutos"] > 20
        assert cardio["distancia_km"] == 3
