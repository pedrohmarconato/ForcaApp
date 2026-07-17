# backend/tests/test_plan_repository.py
# Testes do gravador do plano no Supabase (PostgREST), com rede mockada.
# Modos de falha cobertos (inclui achados #1 e #3 do review adversarial do PR #4):
# - planos ativos anteriores são ARQUIVADOS antes de inserir (1 ativo por usuário)
# - ordem de inserção respeita as FKs (plan → sessions → exercises → sets)
# - escrita usa o JWT DO USUÁRIO (RLS), nunca service role
# - falha em QUALQUER etapa de insert → tentativa de limpeza (timeout no insert
#   do plano pode ter confirmado a linha no banco)
# - a mensagem de erro NUNCA afirma "removido" sem confirmação do DELETE
# - listas grandes são fatiadas (chunk) para não estourar o PostgREST

import os
import sys
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
for path in (BACKEND_DIR, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

from services.plan_repository import (  # noqa: E402
    PlanPersistenceError,
    persistir_plano,
)

TOKEN = "jwt-do-usuario"


def _mapeado(num_sets=3):
    return {
        "plan": {"id": "plan-1", "user_id": "u-1", "name": "Plano"},
        "sessions": [{"id": "s-1", "plan_id": "plan-1"}],
        "exercises": [{"id": "e-1", "session_id": "s-1"}],
        "sets": [{"id": f"set-{i}", "exercise_id": "e-1"} for i in range(num_sets)],
    }


def _resposta(status=201, corpo=None):
    resposta = mock.Mock()
    resposta.status_code = status
    resposta.text = "" if status < 400 else "erro simulado"
    resposta.json.return_value = corpo if corpo is not None else []
    return resposta


def _patches(post=None, patch=None, delete=None):
    """Aplica os três mocks de rede de uma vez."""
    return (
        mock.patch(
            "services.plan_repository.requests.post",
            side_effect=post if isinstance(post, list) else None,
            return_value=None if isinstance(post, list) else (post or _resposta()),
        ),
        mock.patch("services.plan_repository.requests.patch", return_value=patch or _resposta(204)),
        mock.patch(
            "services.plan_repository.requests.delete",
            return_value=delete or _resposta(200, corpo=[{"id": "plan-1"}]),
        ),
    )


# ---------- Fluxo feliz ----------

def test_arquiva_ativos_e_insere_na_ordem_das_fks():
    p_post, p_patch, p_delete = _patches()
    with p_post as post, p_patch as patcher, p_delete:
        plan_id = persistir_plano(_mapeado(), access_token=TOKEN)

    assert plan_id == "plan-1"
    # arquivamento ANTES de qualquer insert: 1 PATCH em training_plans (status ativo → archived)
    assert patcher.call_count == 1
    assert patcher.call_args.args[0].endswith("/training_plans")
    assert patcher.call_args.kwargs["params"] == {"user_id": "eq.u-1", "status": "eq.active"}
    assert patcher.call_args.kwargs["json"] == {"status": "archived"}

    tabelas = [chamada.args[0].rsplit("/", 1)[-1] for chamada in post.call_args_list]
    assert tabelas == ["training_plans", "planned_sessions", "planned_exercises", "planned_sets"]


def test_usa_jwt_do_usuario_e_anon_key():
    p_post, p_patch, p_delete = _patches()
    with p_post as post, p_patch as patcher, p_delete:
        persistir_plano(_mapeado(), access_token=TOKEN)

    for chamada in list(post.call_args_list) + list(patcher.call_args_list):
        headers = chamada.kwargs["headers"]
        assert headers["Authorization"] == f"Bearer {TOKEN}"
        assert headers["apikey"] == "anon-key-teste"


def test_listas_grandes_sao_fatiadas():
    p_post, p_patch, p_delete = _patches()
    with p_post as post, p_patch, p_delete:
        persistir_plano(_mapeado(num_sets=450), access_token=TOKEN)

    chamadas_sets = [c for c in post.call_args_list if c.args[0].endswith("planned_sets")]
    assert len(chamadas_sets) == 3  # 450 em fatias de 200
    assert sum(len(c.kwargs["json"]) for c in chamadas_sets) == 450


# ---------- Achado #3: arquivamento obrigatório ----------

def test_falha_no_arquivamento_aborta_sem_inserir_nada():
    p_post, _, p_delete = _patches()
    with p_post as post, \
         mock.patch("services.plan_repository.requests.patch", return_value=_resposta(500)), \
         p_delete:
        with pytest.raises(PlanPersistenceError):
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert post.call_count == 0  # nada foi criado, nada a limpar


# ---------- Achado #1: limpeza e mensagens honestas ----------

def test_falha_nos_filhos_limpa_e_confirma_remocao():
    respostas_post = [_resposta(201), _resposta(500)]  # plano OK, sessões falham
    p_post, p_patch, _ = _patches(post=respostas_post)
    with p_post, p_patch, \
         mock.patch(
             "services.plan_repository.requests.delete",
             return_value=_resposta(200, corpo=[{"id": "plan-1"}]),
         ) as delete:
        with pytest.raises(PlanPersistenceError) as exc:
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert delete.call_count == 1
    assert delete.call_args.kwargs["params"] == {"id": "eq.plan-1"}
    assert "removido" in str(exc.value)


def test_timeout_no_insert_do_plano_TAMBEM_tenta_limpeza():
    # O banco pode ter confirmado a linha mesmo com timeout na resposta:
    # a limpeza precisa ser tentada já na falha do PRIMEIRO insert.
    import requests as requests_lib

    p_post, p_patch, _ = _patches(post=[requests_lib.Timeout("estourou")])
    with p_post, p_patch, \
         mock.patch(
             "services.plan_repository.requests.delete",
             return_value=_resposta(200, corpo=[]),
         ) as delete:
        with pytest.raises(PlanPersistenceError):
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert delete.call_count == 1


def test_delete_que_falha_NAO_vira_mensagem_de_removido():
    respostas_post = [_resposta(201), _resposta(500)]
    p_post, p_patch, _ = _patches(post=respostas_post)
    with p_post, p_patch, \
         mock.patch("services.plan_repository.requests.delete", return_value=_resposta(500)):
        with pytest.raises(PlanPersistenceError) as exc:
            persistir_plano(_mapeado(), access_token=TOKEN)

    mensagem = str(exc.value)
    assert "foi removido" not in mensagem
    assert "plan-1" in mensagem  # aponta o órfão para verificação manual


def test_delete_sem_linhas_afetadas_reporta_nada_ficou():
    respostas_post = [_resposta(201), _resposta(500)]
    p_post, p_patch, _ = _patches(post=respostas_post)
    with p_post, p_patch, \
         mock.patch(
             "services.plan_repository.requests.delete",
             return_value=_resposta(200, corpo=[]),
         ):
        with pytest.raises(PlanPersistenceError) as exc:
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert "nenhum plano parcial" in str(exc.value).lower()


def test_erro_de_rede_na_limpeza_tambem_e_honesto():
    import requests as requests_lib

    respostas_post = [_resposta(201), _resposta(500)]
    p_post, p_patch, _ = _patches(post=respostas_post)
    with p_post, p_patch, \
         mock.patch(
             "services.plan_repository.requests.delete",
             side_effect=requests_lib.ConnectionError("rede caiu"),
         ):
        with pytest.raises(PlanPersistenceError) as exc:
            persistir_plano(_mapeado(), access_token=TOKEN)

    assert "foi removido" not in str(exc.value)
