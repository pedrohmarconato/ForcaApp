# Plano manual: o rascunho do app precisa atravessar o MESMO pipeline do plano
# da IA. Testes escritos antes da implementação. Modos de falha cobertos:
# - schema do app e MOLDE_SCHEMA divergirem;
# - dias escolhidos, duração e regras de progressão mudarem no caminho;
# - aquecimento/alongamento morrerem fora de `exercicios`;
# - nome livre ou limitação do aluno serem descartados pelo mapper;
# - endpoint persistir preview, aceitar dias duplicados ou estourar o teto de sets;
# - erro de banco ser reportado como sucesso.

import datetime
import os
import sys
import unittest.mock as mock

import jsonschema
import pytest

os.environ.setdefault("SUPABASE_URL", "https://teste.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "anon-key-teste")
os.environ.pop("ANTHROPIC_API_KEY", None)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.app as app_module  # noqa: E402
from backend.app import app  # noqa: E402
from backend.schemas.molde_schema import MOLDE_SCHEMA  # noqa: E402
from backend.services.plan_expander import expandir_plano  # noqa: E402
from backend.services.plan_mapper import MAX_TOTAL_SETS, mapear_plano_ia  # noqa: E402
from backend.services.plan_repository import PlanPersistenceError  # noqa: E402

USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"
START = datetime.date(2026, 7, 20)  # segunda-feira
AUTH_HEADERS = {"Authorization": "Bearer token-manual"}


def _exercicio(
    nome="Supino Reto com Barra",
    exercise_key="supino_reto_barra",
    equipamento="Barra",
    series=3,
    repeticoes="8-12",
    duracao_minutos=None,
    distancia_km=None,
    tem_limitacao=False,
    percentual_rm=None,
    metrica=None,
):
    exercicio = {
        "exercise_key": exercise_key,
        "nome": nome,
        "equipamento": equipamento,
        "series": series,
        "repeticoes": repeticoes,
        "duracao_minutos": duracao_minutos,
        "distancia_km": distancia_km,
        "tempo_descanso": 90,
        "prioridade": "primario",
        "percentual_rm": percentual_rm,
        "observacoes": None,
        "tem_limitacao": tem_limitacao,
    }
    if metrica is not None:
        exercicio["metrica"] = metrica
    return exercicio


def _rascunho(
    exercicios=None,
    duracao_semanas=12,
    progressao=None,
    treinos=None,
):
    if treinos is None:
        treinos = [
            {
                "nome": "Treino A",
                "dia_offset": 0,
                "duracao_minutos": None,
                "incluir_aquecimento": False,
                "incluir_alongamento": False,
                "exercicios": exercicios or [_exercicio()],
            }
        ]
    return {
        "nome": "Meu plano manual",
        "duracao_semanas": duracao_semanas,
        "progressao": progressao
        or {
            "series": None,
            "cardio": None,
            "intensidade": None,
            "deload": None,
        },
        "treinos": treinos,
    }


def _construir(rascunho):
    from backend.schemas.plano_manual_schema import PLANO_MANUAL_SCHEMA
    from backend.services.manual_plan_builder import construir_molde_manual

    jsonschema.validate(instance=rascunho, schema=PLANO_MANUAL_SCHEMA)
    molde = construir_molde_manual(rascunho)
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
    return molde


def _expandir(rascunho):
    return expandir_plano(
        _construir(rascunho),
        {"id": USER_ID, "nivel": "iniciante"},
        start_date=START,
    )


def _microciclos(plano):
    return [
        micro
        for ciclo in plano["plano_principal"]["ciclos"]
        for micro in ciclo["microciclos"]
    ]


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _limpa_rate_limits():
    app_module._rate_buckets.clear()
    yield


def _post_autenticado(client, rota, rascunho):
    with mock.patch("backend.utils.auth.validate_token", return_value={"id": USER_ID}):
        return client.post(rota, json=rascunho, headers=AUTH_HEADERS)


def test_rascunho_minimo_vira_plano_valido_criado_pelo_usuario():
    plano = _expandir(_rascunho())
    mapeado = mapear_plano_ia(
        plano, user_id=USER_ID, start_date=START, created_by="user"
    )

    assert mapeado["plan"]["created_by"] == "user"
    assert len(mapeado["sessions"]) == 12
    assert all(sessao["day_of_week"] == "segunda" for sessao in mapeado["sessions"])


def test_quatro_treinos_preservam_segunda_quarta_sexta_domingo():
    treinos = []
    for indice, dia in enumerate((0, 2, 4, 6), start=1):
        treino = _rascunho()["treinos"][0].copy()
        treino.update({"nome": f"Treino {indice}", "dia_offset": dia})
        treinos.append(treino)

    mapeado = mapear_plano_ia(
        _expandir(_rascunho(treinos=treinos, duracao_semanas=1)),
        user_id=USER_ID,
        start_date=START,
        created_by="user",
    )

    assert [s["scheduled_date"] for s in mapeado["sessions"]] == [
        "2026-07-20",
        "2026-07-22",
        "2026-07-24",
        "2026-07-26",
    ]


def test_oito_semanas_geram_calendario_e_duration_weeks_oito():
    rascunho = _rascunho(duracao_semanas=8)
    molde = _construir(rascunho)
    mapeado = mapear_plano_ia(
        _expandir(rascunho), user_id=USER_ID, start_date=START, created_by="user"
    )

    assert molde["calendario"] == ["tipo_a"] * 8
    assert mapeado["plan"]["duration_weeks"] == 8


def test_progressao_desligada_nao_altera_a_semana_doze():
    rascunho = _rascunho()
    molde = _construir(rascunho)
    semanas = _microciclos(_expandir(rascunho))

    assert molde["progressao"]["regras"] == []
    primeira = semanas[0]["sessoes"][0]["exercicios"][0]
    ultima = semanas[-1]["sessoes"][0]["exercicios"][0]
    for campo in ("nome", "series", "repeticoes", "percentual_rm"):
        assert ultima.get(campo) == primeira.get(campo)


def test_deload_na_semana_quatro_reduz_series_com_piso_dois():
    progressao = _rascunho()["progressao"]
    progressao["deload"] = {
        "ativa": True,
        "semana": 4,
        "fator_rm": 0.5,
        "fator_series": 0.5,
    }
    semanas = _microciclos(
        _expandir(_rascunho(exercicios=[_exercicio(series=5)], progressao=progressao))
    )

    assert semanas[0]["sessoes"][0]["exercicios"][0]["series"] == 5
    assert semanas[3]["sessoes"][0]["exercicios"][0]["series"] == 2


def test_cardio_progride_tempo_ate_no_maximo_o_dobro():
    progressao = _rascunho()["progressao"]
    progressao["cardio"] = {
        "ativa": True,
        "valor": 5,
        "alvo": "ambos",
    }
    caminhada = _exercicio(
        nome="Caminhada",
        exercise_key="caminhada",
        equipamento="Peso corporal",
        repeticoes=None,
        duracao_minutos=20,
    )
    semanas = _microciclos(
        _expandir(_rascunho(exercicios=[caminhada], progressao=progressao))
    )

    primeira = semanas[0]["sessoes"][0]["exercicios"][0]["duracao_minutos"]
    ultima = semanas[-1]["sessoes"][0]["exercicios"][0]["duracao_minutos"]
    assert ultima > primeira
    assert ultima <= 40


def test_aquecimento_e_alongamento_entram_como_exercicios_reais():
    rascunho = _rascunho(duracao_semanas=1)
    rascunho["treinos"][0]["incluir_aquecimento"] = True
    rascunho["treinos"][0]["incluir_alongamento"] = True
    mapeado = mapear_plano_ia(
        _expandir(rascunho), user_id=USER_ID, start_date=START, created_by="user"
    )

    assert len(mapeado["exercises"]) == 3
    primeiro, _, ultimo = mapeado["exercises"]
    assert (primeiro["exercise_key"], primeiro["metric"], primeiro["priority"]) == (
        "aquecimento_articular",
        "tempo",
        "accessory",
    )
    assert (ultimo["exercise_key"], ultimo["metric"], ultimo["priority"]) == (
        "alongamento_dinamico",
        "tempo",
        "accessory",
    )


def test_nome_livre_e_preservado_e_recebe_defaults_de_repeticoes():
    livre = _exercicio(
        nome="Rosca escocesa no banco 45",
        exercise_key=None,
        equipamento=None,
        repeticoes=None,
    )
    mapeado = mapear_plano_ia(
        _expandir(_rascunho(exercicios=[livre], duracao_semanas=1)),
        user_id=USER_ID,
        start_date=START,
        created_by="user",
    )

    assert mapeado["exercises"][0]["name"] == "Rosca escocesa no banco 45"
    assert mapeado["exercises"][0]["exercise_key"] is None
    assert mapeado["exercises"][0]["metric"] == "carga_reps"
    assert mapeado["sets"][0]["target_reps_min"] == 8
    assert mapeado["sets"][0]["target_reps_max"] == 12


def test_cardio_sem_duracao_recebe_default_e_grupo_vem_do_catalogo():
    caminhada = _exercicio(
        nome="Caminhada",
        exercise_key="caminhada",
        equipamento="Peso corporal",
        repeticoes=None,
        duracao_minutos=None,
        distancia_km=5,
    )
    molde = _construir(_rascunho(exercicios=[caminhada], duracao_semanas=1))
    sessao = molde["semanas_tipo"][0]["sessoes"][0]
    mapeado = mapear_plano_ia(
        expandir_plano(molde, {"id": USER_ID}, start_date=START),
        user_id=USER_ID,
        start_date=START,
        created_by="user",
    )

    assert sessao["grupos_musculares"] == [{"nome": "Cardio"}]
    assert mapeado["exercises"][0]["metric"] == "tempo_distancia"
    assert mapeado["sets"][0]["target_duration_seconds"] == 20 * 60
    assert mapeado["sets"][0]["target_distance_m"] == 5000
    assert mapeado["sets"][0]["target_reps_min"] is None


def test_nome_livre_pode_declarar_metrica_de_tempo_sem_virar_repeticoes():
    from backend.schemas.plano_manual_schema import PLANO_MANUAL_SCHEMA

    propriedades = PLANO_MANUAL_SCHEMA["properties"]["treinos"]["items"][
        "properties"
    ]["exercicios"]["items"]["properties"]
    assert "metrica" in propriedades

    livre = _exercicio(
        nome="Circuito de escada do professor",
        exercise_key=None,
        equipamento=None,
        repeticoes=None,
        duracao_minutos=15,
        distancia_km=1,
        metrica="tempo_distancia",
    )
    progressao = _rascunho()["progressao"]
    progressao["cardio"] = {"ativa": True, "valor": 5, "alvo": "ambos"}
    plano = _expandir(_rascunho(exercicios=[livre], progressao=progressao))
    mapeado = mapear_plano_ia(
        plano, user_id=USER_ID, start_date=START, created_by="user"
    )

    assert mapeado["exercises"][0]["exercise_key"] is None
    assert mapeado["exercises"][0]["metric"] == "tempo_distancia"
    assert mapeado["sets"][0]["target_reps_min"] is None
    assert mapeado["sets"][0]["target_duration_seconds"] > 15 * 60
    ultima_serie = mapeado["sets"][-1]
    assert ultima_serie["target_duration_seconds"] > mapeado["sets"][0][
        "target_duration_seconds"
    ]


def test_metrica_digitada_nao_sobrescreve_exercicio_do_catalogo():
    catalogado = _exercicio(metrica="tempo", repeticoes="8-12", duracao_minutos=20)
    mapeado = mapear_plano_ia(
        _expandir(_rascunho(exercicios=[catalogado], duracao_semanas=1)),
        user_id=USER_ID,
        start_date=START,
        created_by="user",
    )

    assert mapeado["exercises"][0]["exercise_key"] == "supino_reto_barra"
    assert mapeado["exercises"][0]["metric"] == "carga_reps"
    assert mapeado["sets"][0]["target_reps_min"] == 8


def test_delta_series_zero_e_omitido_mesmo_quando_toggle_esta_ligado():
    progressao = _rascunho()["progressao"]
    progressao["series"] = {
        "ativa": True,
        "valor": 0,
        "semana_inicio": 1,
        "semana_fim": 12,
    }

    assert _construir(_rascunho(progressao=progressao))["progressao"]["regras"] == []


def test_limitacao_manual_marca_so_o_exercicio_escolhido():
    exercicios = [
        _exercicio(tem_limitacao=True),
        _exercicio(
            nome="Remada Curvada com Halteres",
            exercise_key="remada_curvada_halteres",
            equipamento="Halteres",
        ),
    ]
    mapeado = mapear_plano_ia(
        _expandir(_rascunho(exercicios=exercicios, duracao_semanas=1)),
        user_id=USER_ID,
        start_date=START,
        created_by="user",
    )

    assert mapeado["exercises"][0]["injury_flags"] == ["limitacao_aluno"]
    assert mapeado["exercises"][1]["injury_flags"] == []


def test_endpoint_rejeita_dois_treinos_no_mesmo_dia(client):
    treino = _rascunho()["treinos"][0]
    rascunho = _rascunho(treinos=[treino, {**treino, "nome": "Treino B"}])

    response = _post_autenticado(client, "/api/manual-plan", rascunho)

    assert response.status_code == 400
    assert "dois treinos no mesmo dia" in response.get_json()["error"].lower()


def test_endpoint_rejeita_teto_de_sets_antes_de_expandir(client):
    treinos = []
    for treino_indice in range(7):
        exercicios = [
            _exercicio(
                nome=f"Movimento livre {treino_indice}-{exercicio_indice}",
                exercise_key=None,
                equipamento=None,
                series=10,
            )
            for exercicio_indice in range(30)
        ]
        treinos.append(
            {
                "nome": f"Treino {treino_indice + 1}",
                "dia_offset": None,
                "duracao_minutos": None,
                "incluir_aquecimento": False,
                "incluir_alongamento": False,
                "exercicios": exercicios,
            }
        )
    assert sum(ex["series"] for t in treinos for ex in t["exercicios"]) > MAX_TOTAL_SETS

    with mock.patch.object(app_module, "expandir_plano") as expandir:
        response = _post_autenticado(
            client, "/api/manual-plan", _rascunho(treinos=treinos, duracao_semanas=1)
        )

    assert response.status_code == 400
    assert str(MAX_TOTAL_SETS) in response.get_json()["error"]
    expandir.assert_not_called()


def test_endpoint_salva_progressao_e_devolve_201(client):
    progressao = _rascunho()["progressao"]
    progressao["deload"] = {
        "ativa": True,
        "semana": 4,
        "fator_rm": 0.8,
        "fator_series": 0.8,
    }
    with mock.patch.object(app_module, "persistir_plano", return_value="plano-manual-1") as persistir:
        response = _post_autenticado(
            client, "/api/manual-plan", _rascunho(progressao=progressao)
        )

    assert response.status_code == 201
    assert response.get_json() == {"plan_id": "plano-manual-1"}
    mapeado = persistir.call_args.args[0]
    assert mapeado["plan"]["created_by"] == "user"
    assert mapeado["plan"]["progression_rules"] == [
        {
            "tipo": "deload_percentual",
            "semana": 4,
            "fator_rm": 0.8,
            "fator_series": 0.8,
        }
    ]
    assert persistir.call_args.kwargs["access_token"] == "token-manual"


def test_endpoint_persiste_nome_livre_sem_chave(client):
    livre = _exercicio(
        nome="Rosca escocesa no banco 45",
        exercise_key=None,
        equipamento=None,
    )
    with mock.patch.object(app_module, "persistir_plano", return_value="plano-livre") as persistir:
        response = _post_autenticado(
            client,
            "/api/manual-plan",
            _rascunho(exercicios=[livre], duracao_semanas=1),
        )

    assert response.status_code == 201
    exercicio = persistir.call_args.args[0]["exercises"][0]
    assert exercicio["name"] == "Rosca escocesa no banco 45"
    assert exercicio["exercise_key"] is None


def test_preview_devolve_so_primeira_meio_ultima_semana_sem_persistir(client):
    progressao = _rascunho()["progressao"]
    progressao["series"] = {
        "ativa": True,
        "valor": 1,
        "semana_inicio": 5,
        "semana_fim": 8,
    }
    with mock.patch.object(app_module, "persistir_plano") as persistir:
        response = _post_autenticado(
            client,
            "/api/manual-plan/preview",
            _rascunho(progressao=progressao, duracao_semanas=8),
        )

    assert response.status_code == 200
    semanas = response.get_json()["semanas"]
    assert [semana["semana"] for semana in semanas] == [1, 4, 8]
    assert semanas[0]["treinos"][0]["dia"] == "segunda"
    assert semanas[0]["treinos"][0]["exercicios"][0]["alvo"] == "3 séries × 8-12 reps"
    assert semanas[-1]["treinos"][0]["exercicios"][0]["alvo"] == "7 séries × 8-12 reps"
    assert semanas[0]["treinos"][0]["minutos"] > 0
    persistir.assert_not_called()


def test_preview_usa_serie_no_singular(client):
    rascunho = _rascunho(duracao_semanas=1)
    rascunho["treinos"][0]["incluir_aquecimento"] = True

    response = _post_autenticado(client, "/api/manual-plan/preview", rascunho)

    assert response.status_code == 200
    assert response.get_json()["semanas"][0]["treinos"][0]["exercicios"][0][
        "alvo"
    ] == "1 série × 5 min"


def test_preview_formata_progressao_cardio_em_minutos_decimais(client):
    livre = _exercicio(
        nome="Circuito de escada do professor",
        exercise_key=None,
        equipamento=None,
        repeticoes=None,
        duracao_minutos=15,
        distancia_km=1,
        metrica="tempo_distancia",
        series=2,
    )
    progressao = _rascunho()["progressao"]
    progressao["cardio"] = {"ativa": True, "valor": 5, "alvo": "ambos"}

    response = _post_autenticado(
        client,
        "/api/manual-plan/preview",
        _rascunho(exercicios=[livre], progressao=progressao),
    )

    assert response.status_code == 200
    assert response.get_json()["semanas"][0]["treinos"][0]["exercicios"][0][
        "alvo"
    ] == "2 séries × 15,8 min / 1,05 km"


def test_falha_de_persistencia_vira_502_sem_plan_id(client):
    with mock.patch.object(
        app_module,
        "persistir_plano",
        side_effect=PlanPersistenceError("banco indisponível"),
    ):
        response = _post_autenticado(client, "/api/manual-plan", _rascunho())

    assert response.status_code == 502
    assert "plan_id" not in response.get_json()
    assert "salvar" in response.get_json()["error"].lower()


def test_criacao_manual_tem_rate_limit_proprio(client):
    with mock.patch.object(app_module, "MANUAL_PLAN_RATE_LIMIT", 2), mock.patch.object(
        app_module, "persistir_plano", return_value="plano-manual-1"
    ):
        primeira = _post_autenticado(client, "/api/manual-plan", _rascunho())
        segunda = _post_autenticado(client, "/api/manual-plan", _rascunho())
        terceira = _post_autenticado(client, "/api/manual-plan", _rascunho())

    assert primeira.status_code == 201
    assert segunda.status_code == 201
    assert terceira.status_code == 429
