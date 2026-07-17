# backend/tests/test_plan_mapper.py
# Testes do mapeador puro: JSON do plano gerado pela IA → linhas das tabelas
# novas (training_plans / planned_sessions / planned_exercises / planned_sets).
# Escritos ANTES da implementação (Fase 3). Modos de falha cobertos:
# - reps/descanso em formatos variados ("8-12", "10", "AMRAP", "60s", 90, "2min")
# - prioridade ausente (fallback determinístico por ordem)
# - user_id NUNCA vem do payload (anti-spoofing)
# - datas deterministas (start_date injetado)

import datetime
import os
import sys
import uuid

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
for path in (BACKEND_DIR, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from services.plan_mapper import mapear_plano_ia  # noqa: E402

USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"
START = datetime.date(2026, 7, 20)  # segunda-feira


def _plano_exemplo():
    """Plano mínimo realista: 2 semanas, 2 sessões na semana 1, 1 na semana 2."""
    return {
        "treinamento_id": "0b6c1c2d-1111-4222-8333-444455556666",
        "versao": "1.0",
        "data_criacao": "2026-07-17T10:00:00Z",
        "usuario": {"id": "id-do-payload-NAO-confiavel", "nivel": "intermediário"},
        "plano_principal": {
            "nome": "Hipertrofia Intermediário",
            "descricao": "Plano base.",
            "periodizacao": {"tipo": "Linear"},
            "duracao_semanas": 2,
            "frequencia_semanal": 2,
            "ciclos": [
                {
                    "nome": "Fase 1",
                    "ordem": 1,
                    "duracao_semanas": 2,
                    "objetivo": "Volume",
                    "microciclos": [
                        {
                            "semana": 1,
                            "sessoes": [
                                {
                                    "nome": "Peito/Tríceps",
                                    "tipo": "Hipertrofia",
                                    "duracao_minutos": 60,
                                    "dia_semana": "segunda",
                                    "grupos_musculares": [{"nome": "Peito"}, {"nome": "Tríceps"}],
                                    "exercicios": [
                                        {
                                            "nome": "Supino Reto",
                                            "ordem": 1,
                                            "equipamento": "barra",
                                            "series": 4,
                                            "repeticoes": "8-12",
                                            "percentual_rm": 75,
                                            "tempo_descanso": "60s",
                                            "prioridade": "primario",
                                        },
                                        {
                                            "nome": "Supino Inclinado",
                                            "ordem": 2,
                                            "series": 3,
                                            "repeticoes": "10",
                                            "percentual_rm": 70,
                                            "tempo_descanso": 90,
                                        },
                                        {
                                            "nome": "Tríceps Corda",
                                            "ordem": 4,
                                            "series": 2,
                                            "repeticoes": "AMRAP",
                                            "percentual_rm": None,
                                            "tempo_descanso": "2min",
                                        },
                                    ],
                                },
                                {
                                    "nome": "Costas/Bíceps",
                                    "tipo": "Hipertrofia",
                                    "duracao_minutos": 55,
                                    "dia_semana": "quinta",
                                    "grupos_musculares": [{"nome": "Costas"}],
                                    "exercicios": [
                                        {
                                            "nome": "Remada Curvada",
                                            "ordem": 1,
                                            "series": 3,
                                            "repeticoes": "6-10",
                                            "tempo_descanso": "75s",
                                        }
                                    ],
                                },
                            ],
                        },
                        {
                            "semana": 2,
                            "sessoes": [
                                {
                                    "nome": "Full Body",
                                    "tipo": "Força",
                                    "duracao_minutos": 45,
                                    "dia_semana": None,
                                    "grupos_musculares": [],
                                    "exercicios": [
                                        {
                                            "nome": "Agachamento",
                                            "ordem": 1,
                                            "series": 5,
                                            "repeticoes": "5",
                                            "tempo_descanso": None,
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


@pytest.fixture()
def resultado():
    return mapear_plano_ia(_plano_exemplo(), user_id=USER_ID, start_date=START)


# ---------- Estrutura geral e integridade ----------

def test_estrutura_e_contagens(resultado):
    assert set(resultado.keys()) == {"plan", "sessions", "exercises", "sets"}
    assert len(resultado["sessions"]) == 3
    assert len(resultado["exercises"]) == 5
    # séries expandidas: 4+3+2 (sessão 1) + 3 (sessão 2) + 5 (semana 2) = 17
    assert len(resultado["sets"]) == 17


def test_chaves_estrangeiras_fecham(resultado):
    plan_id = resultado["plan"]["id"]
    session_ids = {s["id"] for s in resultado["sessions"]}
    exercise_ids = {e["id"] for e in resultado["exercises"]}

    assert all(s["plan_id"] == plan_id for s in resultado["sessions"])
    assert all(e["session_id"] in session_ids for e in resultado["exercises"])
    assert all(st["exercise_id"] in exercise_ids for st in resultado["sets"])
    # todos os IDs são UUIDs válidos
    for linha in [resultado["plan"], *resultado["sessions"], *resultado["exercises"], *resultado["sets"]]:
        uuid.UUID(linha["id"])


def test_user_id_vem_do_token_nunca_do_payload(resultado):
    assert resultado["plan"]["user_id"] == USER_ID
    assert all(s["user_id"] == USER_ID for s in resultado["sessions"])
    # o id "id-do-payload-NAO-confiavel" não aparece em lugar nenhum
    import json

    dump = json.dumps({k: v for k, v in resultado.items() if k != "plan"}, default=str)
    assert "id-do-payload-NAO-confiavel" not in dump
    assert resultado["plan"].get("raw_plan", {}).get("usuario", {}).get("id") == "id-do-payload-NAO-confiavel"


def test_plan_campos_principais(resultado):
    plan = resultado["plan"]
    assert plan["name"] == "Hipertrofia Intermediário"
    assert plan["source_plan_id"] == "0b6c1c2d-1111-4222-8333-444455556666"
    assert plan["duration_weeks"] == 2
    assert plan["sessions_per_week"] == 2
    assert plan["periodization_type"] == "Linear"
    assert plan["start_date"] == "2026-07-20"
    assert plan["status"] == "active"
    assert plan["raw_plan"]["plano_principal"]["nome"] == "Hipertrofia Intermediário"


# ---------- Sessões: datas e metadados ----------

def test_datas_agendadas_deterministas(resultado):
    por_titulo = {s["title"]: s for s in resultado["sessions"]}
    # semana 1: segunda = 20/07, quinta = 23/07
    assert por_titulo["Peito/Tríceps"]["scheduled_date"] == "2026-07-20"
    assert por_titulo["Costas/Bíceps"]["scheduled_date"] == "2026-07-23"
    # semana 2 sem dia_semana: cai no início da semana 2 (segunda 27/07)
    assert por_titulo["Full Body"]["scheduled_date"] == "2026-07-27"
    assert por_titulo["Full Body"]["week_number"] == 2


def test_sessao_metadados(resultado):
    sessao = next(s for s in resultado["sessions"] if s["title"] == "Peito/Tríceps")
    assert sessao["session_type"] == "Hipertrofia"
    assert sessao["estimated_minutes"] == 60
    assert sessao["muscle_groups"] == ["Peito", "Tríceps"]
    assert sessao["status"] == "pending"


# ---------- Exercícios: prioridade, descanso, faixas ----------

def test_prioridade_da_ia_e_fallback_por_ordem(resultado):
    por_nome = {e["name"]: e for e in resultado["exercises"]}
    # IA declarou "primario"
    assert por_nome["Supino Reto"]["priority"] == "primary"
    # sem prioridade: ordem 2 → secondary; ordem 4 → accessory; ordem 1 → primary
    assert por_nome["Supino Inclinado"]["priority"] == "secondary"
    assert por_nome["Tríceps Corda"]["priority"] == "accessory"
    assert por_nome["Remada Curvada"]["priority"] == "primary"


def test_descanso_em_formatos_variados(resultado):
    por_nome = {e["name"]: e for e in resultado["exercises"]}
    assert por_nome["Supino Reto"]["rest_seconds"] == 60      # "60s"
    assert por_nome["Supino Inclinado"]["rest_seconds"] == 90  # inteiro
    assert por_nome["Tríceps Corda"]["rest_seconds"] == 120    # "2min"
    assert por_nome["Agachamento"]["rest_seconds"] is None     # ausente


def test_exercicio_campos(resultado):
    supino = next(e for e in resultado["exercises"] if e["name"] == "Supino Reto")
    assert supino["exercise_order"] == 1
    assert supino["equipment"] == "barra"
    assert supino["target_rm_percent"] == 75
    assert supino["sets_planned"] == 4
    assert supino["reps_raw"] == "8-12"


# ---------- Séries: expansão e faixas de reps ----------

def test_expansao_de_series_e_faixa(resultado):
    supino = next(e for e in resultado["exercises"] if e["name"] == "Supino Reto")
    sets_supino = [s for s in resultado["sets"] if s["exercise_id"] == supino["id"]]
    assert len(sets_supino) == 4
    assert [s["set_order"] for s in sorted(sets_supino, key=lambda x: x["set_order"])] == [1, 2, 3, 4]
    assert all(s["target_reps_min"] == 8 and s["target_reps_max"] == 12 for s in sets_supino)
    # carga em kg e RIR ficam nulos na Fase 3 (aluno informa na 1ª execução)
    assert all(s["target_load_kg"] is None and s["target_rir"] is None for s in sets_supino)


def test_reps_fixas_e_amrap(resultado):
    por_nome = {e["name"]: e for e in resultado["exercises"]}
    inclinado_sets = [s for s in resultado["sets"] if s["exercise_id"] == por_nome["Supino Inclinado"]["id"]]
    assert all(s["target_reps_min"] == 10 and s["target_reps_max"] == 10 for s in inclinado_sets)
    # "AMRAP" (sem número): usa faixa padrão 8-12 e preserva o texto em reps_raw
    corda_sets = [s for s in resultado["sets"] if s["exercise_id"] == por_nome["Tríceps Corda"]["id"]]
    assert all(s["target_reps_min"] == 8 and s["target_reps_max"] == 12 for s in corda_sets)
    assert por_nome["Tríceps Corda"]["reps_raw"] == "AMRAP"


# ---------- Robustez ----------

def test_plano_sem_ciclos_gera_erro_claro():
    plano = _plano_exemplo()
    plano["plano_principal"]["ciclos"] = []
    with pytest.raises(ValueError):
        mapear_plano_ia(plano, user_id=USER_ID, start_date=START)


def test_start_date_padrao_e_hoje():
    resultado = mapear_plano_ia(_plano_exemplo(), user_id=USER_ID)
    assert resultado["plan"]["start_date"] == datetime.date.today().isoformat()


# ---------- Achados do review adversarial do PR #4 ----------

def test_nenhuma_sessao_e_agendada_antes_do_inicio_do_plano():
    """Achado #8: gerar numa sexta ancorava a semana 1 na segunda ANTERIOR."""
    inicio_sexta = datetime.date(2026, 7, 17)  # sexta-feira
    resultado = mapear_plano_ia(_plano_exemplo(), user_id=USER_ID, start_date=inicio_sexta)

    datas = [s["scheduled_date"] for s in resultado["sessions"]]
    assert all(d >= "2026-07-17" for d in datas), datas
    por_titulo = {s["title"]: s for s in resultado["sessions"]}
    # segunda (13/07) e quinta (16/07) da semana 1 são puxadas para o início
    assert por_titulo["Peito/Tríceps"]["scheduled_date"] == "2026-07-17"
    assert por_titulo["Costas/Bíceps"]["scheduled_date"] == "2026-07-17"
    # semana 2 não é afetada
    assert por_titulo["Full Body"]["scheduled_date"] == "2026-07-20"


def test_series_absurdas_sao_limitadas():
    """Achado #6: series=100_000_000 não pode explodir a memória."""
    plano = _plano_exemplo()
    sessao = plano["plano_principal"]["ciclos"][0]["microciclos"][0]["sessoes"][0]
    sessao["exercicios"][0]["series"] = 100_000_000

    resultado = mapear_plano_ia(plano, user_id=USER_ID, start_date=START)

    supino = next(e for e in resultado["exercises"] if e["name"] == "Supino Reto")
    assert supino["sets_planned"] == 10  # clamp em MAX_SERIES_POR_EXERCICIO
    assert len([s for s in resultado["sets"] if s["exercise_id"] == supino["id"]]) == 10


def test_teto_global_de_series(monkeypatch):
    """Achado #6: teto global além do clamp por exercício."""
    import services.plan_mapper as pm

    monkeypatch.setattr(pm, "MAX_TOTAL_SETS", 10)  # o plano de exemplo tem 17
    with pytest.raises(ValueError):
        mapear_plano_ia(_plano_exemplo(), user_id=USER_ID, start_date=START)


def test_sessao_sem_exercicios_gera_erro():
    """Achado #5: sessão com exercicios=[] não pode virar treino vazio com 200."""
    plano = _plano_exemplo()
    plano["plano_principal"]["ciclos"][0]["microciclos"][0]["sessoes"][0]["exercicios"] = []
    with pytest.raises(ValueError):
        mapear_plano_ia(plano, user_id=USER_ID, start_date=START)


def test_duration_weeks_reflete_cobertura_real_nao_a_declarada():
    """Achado #5: IA declara 12 semanas mas entrega 2 → o plano registra 2."""
    plano = _plano_exemplo()
    plano["plano_principal"]["duracao_semanas"] = 12
    resultado = mapear_plano_ia(plano, user_id=USER_ID, start_date=START)
    assert resultado["plan"]["duration_weeks"] == 2
