# backend/tests/test_plan_mapper_agenda.py
# Testes da agenda do plan_mapper: quando `dias_disponiveis` é fornecido,
# as sessões são agendadas respeitando os dias e SEM empilhar múltiplas
# sessões no mesmo dia.

import datetime
import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.services.plan_mapper import mapear_plano_ia  # noqa: E402


def _plano_exemplo_2_semanas_5_sessoes():
    """Plano com 2 semanas, 5 sessões na semana 1, 1 na semana 2."""
    return {
        "treinamento_id": "test-plan-1",
        "versao": "1.0",
        "plano_principal": {
            "nome": "Teste Agenda",
            "descricao": "Plano para testes de agenda.",
            "periodizacao": {"tipo": "Linear"},
            "duracao_semanas": 2,
            "frequencia_semanal": 5,
            "ciclos": [
                {
                    "nome": "Ciclo 1",
                    "ordem": 1,
                    "microciclos": [
                        {
                            "semana": 1,
                            "sessoes": [
                                {
                                    "nome": f"Treino {i}",
                                    "tipo": "Forca",
                                    "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta"][i - 1],
                                    "grupos_musculares": [{"nome": "Peito"}],
                                    "exercicios": [
                                        {
                                            "nome": "Supino Reto",
                                            "series": 3,
                                            "repeticoes": "8-10",
                                        }
                                    ],
                                }
                                for i in range(1, 6)
                            ],
                        },
                        {
                            "semana": 2,
                            "sessoes": [
                                {
                                    "nome": "Treino Semana 2",
                                    "tipo": "Forca",
                                    "dia_semana": "segunda",
                                    "grupos_musculares": [{"nome": "Costas"}],
                                    "exercicios": [
                                        {
                                            "nome": "Remada",
                                            "series": 3,
                                            "repeticoes": "8-10",
                                        }
                                    ],
                                }
                            ],
                        },
                    ],
                }
            ],
        },
    }


class TestPlanMapperAgenda:
    """Testa o agendamento com `dias_disponiveis`."""

    def test_agenda_real_quinta_feira_cinco_sessoes(self):
        """
        Caso de produção: plano gerado numa sexta (2026-07-31),
        com 2 semanas × 5 sessões, agenda seg-sex.
        A semana 1 deve começar em 2026-08-03 (segunda),
        NÃO em 2026-07-31.
        """
        plano = _plano_exemplo_2_semanas_5_sessoes()
        start_date = datetime.date(2026, 7, 31)  # sexta-feira
        dias_disponiveis = ["segunda", "terca", "quarta", "quinta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-123",
            start_date=start_date,
            dias_disponiveis=dias_disponiveis,
        )

        sessoes = resultado["sessions"]

        # Semana 1: 5 sessões, todas em datas distintas
        semana1 = [s for s in sessoes if s["week_number"] == 1]
        assert len(semana1) == 5

        datas_semana1 = [s["scheduled_date"] for s in semana1]
        datas_semana1_uniq = set(datas_semana1)
        assert len(datas_semana1_uniq) == 5, f"Semana 1 tem datas duplicadas: {datas_semana1}"

        # Nenhuma data deve ser anterior a start_date ou na sexta anterior (2026-07-31)
        for sess in semana1:
            data = datetime.date.fromisoformat(sess["scheduled_date"])
            assert data >= datetime.date(2026, 8, 3), f"Sessão em data anterior ao início da semana: {data}"

        # Semana 2: 1 sessão, com data verificada
        semana2 = [s for s in sessoes if s["week_number"] == 2]
        assert len(semana2) == 1
        # A semana 2 deve estar uma semana após a semana 1
        data_semana2 = datetime.date.fromisoformat(semana2[0]["scheduled_date"])
        assert data_semana2 >= datetime.date(2026, 8, 10), f"Semana 2 começou muito cedo: {data_semana2}"

    def test_agenda_tres_dias_com_tres_sessoes_gerado_segunda(self):
        """
        Agenda de 3 dias, plano com 3 sessões na semana 1,
        gerado numa segunda-feira. As 3 sessões devem estar
        em datas DISTINTAS da mesma semana.
        """
        plano = {
            "treinamento_id": "test-3d",
            "versao": "1.0",
            "plano_principal": {
                "nome": "Teste 3 dias",
                "duracao_semanas": 1,
                "frequencia_semanal": 3,
                "ciclos": [
                    {
                        "nome": "C1",
                        "ordem": 1,
                        "microciclos": [
                            {
                                "semana": 1,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "quarta", "sexta"][i - 1],
                                        "grupos_musculares": [{"nome": "Peito"}],
                                        "exercicios": [
                                            {
                                                "nome": "Supino",
                                                "series": 2,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 4)
                                ],
                            }
                        ],
                    }
                ],
            },
        }
        start_date = datetime.date(2026, 8, 3)  # segunda-feira
        dias_disponiveis = ["segunda", "quarta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-456",
            start_date=start_date,
            dias_disponiveis=dias_disponiveis,
        )

        sessoes = resultado["sessions"]
        assert len(sessoes) == 3

        datas = [sess["scheduled_date"] for sess in sessoes]
        datas_uniq = set(datas)
        assert len(datas_uniq) == 3, f"Esperava 3 datas distintas, obteve {datas}"

        # Todos os dias devem estar na semana de 2026-08-03 a 2026-08-09
        for sess in sessoes:
            data = datetime.date.fromisoformat(sess["scheduled_date"])
            assert datetime.date(2026, 8, 3) <= data <= datetime.date(2026, 8, 9)

    def test_sem_agenda_usa_comportamento_atual(self):
        """
        Sem `dias_disponiveis` (ou None/vazio), o plan_mapper
        usa o comportamento atual: fallback posicional, sem desempate
        pela agenda. Testa regressão.
        """
        plano = _plano_exemplo_2_semanas_5_sessoes()
        start_date = datetime.date(2026, 7, 20)  # segunda

        resultado = mapear_plano_ia(
            plano,
            user_id="user-789",
            start_date=start_date,
            dias_disponiveis=None,  # sem agenda
        )

        sessoes_resultado = resultado["sessions"]
        # Apenas verifica que não levanta erro e retorna sessions
        assert len(sessoes_resultado) > 0

    def test_agenda_seis_sessoes_cinco_dias(self):
        """
        6 sessões com agenda de apenas 5 dias.
        A 6ª sessão deve ocupar o próximo dia livre.
        """
        plano = {
            "treinamento_id": "test-6s",
            "versao": "1.0",
            "plano_principal": {
                "nome": "Teste 6 sessões",
                "duracao_semanas": 1,
                "frequencia_semanal": 6,
                "ciclos": [
                    {
                        "nome": "C1",
                        "ordem": 1,
                        "microciclos": [
                            {
                                "semana": 1,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta", "segunda"][
                                            i - 1
                                        ],
                                        "grupos_musculares": [{"nome": "Peito"}],
                                        "exercicios": [
                                            {
                                                "nome": "Supino",
                                                "series": 2,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 7)
                                ],
                            }
                        ],
                    }
                ],
            },
        }
        start_date = datetime.date(2026, 8, 3)  # segunda
        dias_disponiveis = ["segunda", "terca", "quarta", "quinta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-999",
            start_date=start_date,
            dias_disponiveis=dias_disponiveis,
        )

        sessoes = resultado["sessions"]
        assert len(sessoes) == 6

        datas = [sess["scheduled_date"] for sess in sessoes]
        datas_uniq = set(datas)
        assert len(datas_uniq) == 6, f"Esperava 6 datas distintas, obteve {datas}"

    def test_training_days_preservado_no_plan_row(self):
        """O campo `training_days` é adicionado ao plan_row."""
        plano = _plano_exemplo_2_semanas_5_sessoes()
        dias_disponiveis = ["segunda", "terca", "quarta", "quinta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-123",
            start_date=datetime.date(2026, 8, 3),
            dias_disponiveis=dias_disponiveis,
        )

        plan_row = resultado["plan"]
        assert "training_days" in plan_row
        assert plan_row["training_days"] == dias_disponiveis

    def test_plano_inteiro_3_semanas_5_sessoes_sem_colisao(self):
        """
        Teste obrigatório 1: 3 semanas × 5 sessões com agenda seg–sex.
        Verificar as 15 datas distintas e as datas exatas esperadas.
        """
        plano = {
            "treinamento_id": "test-3w-5s",
            "versao": "1.0",
            "plano_principal": {
                "nome": "Teste 3 semanas 5 sessões",
                "duracao_semanas": 3,
                "frequencia_semanal": 5,
                "ciclos": [
                    {
                        "nome": "C1",
                        "ordem": 1,
                        "microciclos": [
                            {
                                "semana": 1,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta"][i - 1],
                                        "grupos_musculares": [{"nome": "Peito"}],
                                        "exercicios": [
                                            {
                                                "nome": "Supino",
                                                "series": 2,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 6)
                                ],
                            },
                            {
                                "semana": 2,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta"][i - 1],
                                        "grupos_musculares": [{"nome": "Costas"}],
                                        "exercicios": [
                                            {
                                                "nome": "Remada",
                                                "series": 2,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 6)
                                ],
                            },
                            {
                                "semana": 3,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta"][i - 1],
                                        "grupos_musculares": [{"nome": "Perna"}],
                                        "exercicios": [
                                            {
                                                "nome": "Agachamento",
                                                "series": 2,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 6)
                                ],
                            },
                        ],
                    }
                ],
            },
        }
        start_date = datetime.date(2026, 7, 31)  # sexta-feira
        dias_disponiveis = ["segunda", "terca", "quarta", "quinta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-3w",
            start_date=start_date,
            dias_disponiveis=dias_disponiveis,
        )

        sessoes = resultado["sessions"]
        assert len(sessoes) == 15

        # Verificar datas distintas (invariante global)
        datas = [s["scheduled_date"] for s in sessoes]
        datas_uniq = set(datas)
        assert len(datas_uniq) == 15, f"Esperava 15 datas distintas, obteve {len(datas_uniq)}"

        # Verificar as datas exatas por semana
        semana1 = sorted([s for s in sessoes if s["week_number"] == 1], key=lambda x: x["order_in_week"])
        semana2 = sorted([s for s in sessoes if s["week_number"] == 2], key=lambda x: x["order_in_week"])
        semana3 = sorted([s for s in sessoes if s["week_number"] == 3], key=lambda x: x["order_in_week"])

        # Semana 1: 03-07/08
        assert semana1[0]["scheduled_date"] == "2026-08-03"
        assert semana1[1]["scheduled_date"] == "2026-08-04"
        assert semana1[2]["scheduled_date"] == "2026-08-05"
        assert semana1[3]["scheduled_date"] == "2026-08-06"
        assert semana1[4]["scheduled_date"] == "2026-08-07"

        # Semana 2: 10-14/08
        assert semana2[0]["scheduled_date"] == "2026-08-10"
        assert semana2[1]["scheduled_date"] == "2026-08-11"
        assert semana2[2]["scheduled_date"] == "2026-08-12"
        assert semana2[3]["scheduled_date"] == "2026-08-13"
        assert semana2[4]["scheduled_date"] == "2026-08-14"

        # Semana 3: 17-21/08
        assert semana3[0]["scheduled_date"] == "2026-08-17"
        assert semana3[1]["scheduled_date"] == "2026-08-18"
        assert semana3[2]["scheduled_date"] == "2026-08-19"
        assert semana3[3]["scheduled_date"] == "2026-08-20"
        assert semana3[4]["scheduled_date"] == "2026-08-21"

    def test_invariante_datas_distintas_com_agenda(self):
        """
        Teste obrigatório 2: invariante global para qualquer combinação
        de agenda e número de semanas.
        """
        # Teste com diferentes números de semanas
        for num_semanas in [1, 2, 4, 5]:
            plano = {
                "treinamento_id": f"test-inv-{num_semanas}w",
                "versao": "1.0",
                "plano_principal": {
                    "nome": f"Teste invariante {num_semanas} semanas",
                    "duracao_semanas": num_semanas,
                    "frequencia_semanal": 4,
                    "ciclos": [
                        {
                            "nome": "C1",
                            "ordem": 1,
                            "microciclos": [
                                {
                                    "semana": w,
                                    "sessoes": [
                                        {
                                            "nome": f"Treino {i}",
                                            "tipo": "Forca",
                                            "dia_semana": ["segunda", "terca", "quarta", "quinta"][i - 1],
                                            "grupos_musculares": [{"nome": "Peito"}],
                                            "exercicios": [
                                                {
                                                    "nome": "Supino",
                                                    "series": 1,
                                                    "repeticoes": "8-10",
                                                }
                                            ],
                                        }
                                        for i in range(1, 5)
                                    ],
                                }
                                for w in range(1, num_semanas + 1)
                            ],
                        }
                    ],
                },
            }
            resultado = mapear_plano_ia(
                plano,
                user_id=f"user-inv-{num_semanas}w",
                start_date=datetime.date(2026, 8, 3),
                dias_disponiveis=["segunda", "terca", "quarta", "quinta"],
            )
            sessoes = resultado["sessions"]
            datas = [s["scheduled_date"] for s in sessoes]
            datas_uniq = set(datas)
            assert len(datas_uniq) == len(datas), \
                f"Invariante quebrada para {num_semanas} semanas: {len(datas)} sessões, {len(datas_uniq)} datas distintas"

    def test_sem_deslocamento_quando_cabe_na_semana_corrente(self):
        """
        Teste obrigatório 3: plano gerado numa segunda com agenda seg–sex
        e 5 sessões → semana 1 começa na PRÓPRIA segunda (não desloca).
        """
        plano = {
            "treinamento_id": "test-no-shift",
            "versao": "1.0",
            "plano_principal": {
                "nome": "Teste sem deslocamento",
                "duracao_semanas": 1,
                "frequencia_semanal": 5,
                "ciclos": [
                    {
                        "nome": "C1",
                        "ordem": 1,
                        "microciclos": [
                            {
                                "semana": 1,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta"][i - 1],
                                        "grupos_musculares": [{"nome": "Peito"}],
                                        "exercicios": [
                                            {
                                                "nome": "Supino",
                                                "series": 1,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 6)
                                ],
                            }
                        ],
                    }
                ],
            },
        }
        # Gerado numa segunda-feira
        start_date = datetime.date(2026, 8, 3)
        dias_disponiveis = ["segunda", "terca", "quarta", "quinta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-no-shift",
            start_date=start_date,
            dias_disponiveis=dias_disponiveis,
        )

        sessoes = resultado["sessions"]
        # A primeira sessão deve estar na segunda do próprio dia 2026-08-03
        primeiro_treino = [s for s in sessoes if s["order_in_week"] == 1][0]
        assert primeiro_treino["scheduled_date"] == "2026-08-03", \
            f"Primeira sessão deveria estar em 2026-08-03, mas está em {primeiro_treino['scheduled_date']}"

    def test_oito_sessoes_cinco_dias_agenda_sem_estouro(self):
        """
        Teste obrigatório 4: 8 sessões numa semana com agenda de 5 dias
        não estoura e devolve 8 registros de sessão (com distribuição
        inteligente entre dias da agenda, sábado, domingo e colisão final).
        Prova que a alocação não quebra com mais sessões que dias da semana.
        """
        plano = {
            "treinamento_id": "test-8s-5d",
            "versao": "1.0",
            "plano_principal": {
                "nome": "Teste 8 sessões 5 dias",
                "duracao_semanas": 1,
                "frequencia_semanal": 8,
                "ciclos": [
                    {
                        "nome": "C1",
                        "ordem": 1,
                        "microciclos": [
                            {
                                "semana": 1,
                                "sessoes": [
                                    {
                                        "nome": f"Treino {i}",
                                        "tipo": "Forca",
                                        "dia_semana": ["segunda", "terca", "quarta", "quinta", "sexta", "segunda", "terca", "quarta"][
                                            i - 1
                                        ],
                                        "grupos_musculares": [{"nome": "Peito"}],
                                        "exercicios": [
                                            {
                                                "nome": "Supino",
                                                "series": 1,
                                                "repeticoes": "8-10",
                                            }
                                        ],
                                    }
                                    for i in range(1, 9)
                                ],
                            }
                        ],
                    }
                ],
            },
        }
        start_date = datetime.date(2026, 8, 3)  # segunda-feira
        dias_disponiveis = ["segunda", "terca", "quarta", "quinta", "sexta"]

        resultado = mapear_plano_ia(
            plano,
            user_id="user-8s-5d",
            start_date=start_date,
            dias_disponiveis=dias_disponiveis,
        )

        sessoes = resultado["sessions"]
        assert len(sessoes) == 8  # Não estoura

        # Quando há mais sessões que dias da semana, espera-se colisão
        datas = [s["scheduled_date"] for s in sessoes]
        datas_uniq = set(datas)
        # 8 sessões em 7 dias inevitavelmente gera 1 colisão (7 datas distintas esperadas)
        assert len(datas_uniq) == 7, f"Esperava 7 datas distintas (1 colisão), obteve {len(datas_uniq)}"
