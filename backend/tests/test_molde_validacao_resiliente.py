# backend/tests/test_molde_validacao_resiliente.py
# Modo de falha real (HML 22/07/2026, 2ª ocorrência — smoke e teste do dono):
# o modelo gera uma regra de progressão delta_* com valor 0 ("sem progressão
# nas semanas N-M") que o MOLDE_SCHEMA rejeita — a geração é paga e jogada
# fora, e o usuário vê "Erro ao gerar plano: Molde inválido".
#
# Correção em duas camadas:
#   1. normalizar_molde(): delta com valor 0 é no-op semântico → removido
#      antes da validação (o payload REAL do erro do dono passa a validar).
#   2. Retry dirigido (1x): se a validação ainda falhar, o pipeline re-chama o
#      modelo UMA vez com o erro de validação na conversa para ele corrigir o
#      próprio JSON. Duas falhas seguidas → molde_validation, sem loop.

import copy
import json
import os
import sys
import types
import unittest.mock as mock

import jsonschema
import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import _executar_geracao_molde, app  # noqa: E402
import backend.services.job_manager as jm  # noqa: E402
from backend.schemas.molde_schema import MOLDE_SCHEMA  # noqa: E402
from backend.services.molde_normalizer import (  # noqa: E402
    extrair_molde_do_texto,
    normalizar_molde,
)

# Molde mínimo VÁLIDO (mesma fixture do teste de contrato de chamada).
MOLDE_VALIDO = {
    "nome": "Plano Teste",
    "descricao": "",
    "periodizacao": {"tipo": "Linear"},
    "duracao_semanas": 4,
    "frequencia_semanal": 2,
    "semanas_tipo": [{
        "id": "tipo_a", "nome": "A",
        "sessoes": [{
            "nome": "Treino A", "tipo": "Hipertrofia", "duracao_minutos": 60, "dia_offset": 0,
            "grupos_musculares": [{"nome": "Peito"}],
            "exercicios": [{
                "nome": "Supino", "ordem": 1, "series": 3, "repeticoes": "10",
                "percentual_rm": 75, "prioridade": "primario",
            }],
        }],
    }],
    "calendario": ["tipo_a"] * 4,
    "progressao": {"regras": []},
}

# A regra EXATA que derrubou a geração do dono no HML.
REGRA_NO_OP_REAL = {
    "tipo": "delta_rm_percentual",
    "semana_inicio": 1,
    "semana_fim": 3,
    "valor": 0,
    "grupo_alvo": "todos",
    "observacoes": "Semanas 1-3: adaptar, testar técnica sem progressão agressiva.",
}

REGRA_VALIDA = {
    "tipo": "delta_rm_percentual",
    "semana_inicio": 4,
    "semana_fim": 8,
    "valor": 2.5,
    "grupo_alvo": "todos",
}


def _molde_com_regras(*regras):
    molde = copy.deepcopy(MOLDE_VALIDO)
    molde["progressao"]["regras"] = list(regras)
    return molde


# ==================== 1. Normalizador ====================

def test_payload_real_do_erro_passa_a_validar_apos_normalizacao():
    molde = _molde_com_regras(REGRA_NO_OP_REAL, REGRA_VALIDA)
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)

    normalizado = normalizar_molde(molde)

    jsonschema.validate(instance=normalizado, schema=MOLDE_SCHEMA)  # não levanta
    assert normalizado["progressao"]["regras"] == [REGRA_VALIDA]


def test_delta_series_zero_tambem_e_removido():
    regra_series_zero = {"tipo": "delta_series", "semana_inicio": 1, "semana_fim": 2, "valor": 0}
    molde = normalizar_molde(_molde_com_regras(regra_series_zero))
    assert molde["progressao"]["regras"] == []
    jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)


def test_deload_e_regras_validas_sao_preservados():
    deload = {"tipo": "deload_percentual", "semana": 4, "fator_rm": 0.7}
    molde = normalizar_molde(_molde_com_regras(REGRA_VALIDA, deload))
    assert molde["progressao"]["regras"] == [REGRA_VALIDA, deload]


def test_normalizador_tolera_molde_sem_progressao():
    assert normalizar_molde({"qualquer": 1}) == {"qualquer": 1}


def test_extrair_molde_do_texto():
    assert extrair_molde_do_texto('prefixo {"a": 1} sufixo') == {"a": 1}
    assert extrair_molde_do_texto("sem json aqui") is None
    assert extrair_molde_do_texto("{quebrado") is None
    assert extrair_molde_do_texto("[1, 2]") is None


# ==================== 2. Retry dirigido no pipeline ====================

def _resposta(texto):
    return types.SimpleNamespace(
        content=[types.SimpleNamespace(type="text", text=texto)],
        stop_reason="end_turn",
    )


def _rodar_pipeline(monkeypatch, respostas):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-para-teste")
    monkeypatch.setenv("PLAN_MODEL_NAME", "claude-haiku-4-5")
    with jm._jobs_lock:
        jm._jobs.clear()
    job, _ = jm.criar_job(user_id="user-retry")
    with mock.patch(
        "backend.utils.anthropic_retry.criar_mensagem_com_deadline",
        autospec=True,
        side_effect=respostas,
    ) as chamada, mock.patch("backend.app.persistir_plano", return_value="db-plan-retry"):
        with app.app_context():
            _executar_geracao_molde(
                job,
                questionnaire_data={"nivelExperiencia": "iniciante"},
                diretrizes={"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
                user_id="user-retry",
                access_token="fake-token",
            )
    return job, chamada


def test_molde_invalido_ganha_um_retry_com_o_erro_na_conversa(monkeypatch):
    # 1ª resposta: valor 15 (acima do máximo — NÃO normalizável); 2ª: válida.
    invalido = _molde_com_regras({**REGRA_VALIDA, "valor": 15})
    job, chamada = _rodar_pipeline(
        monkeypatch,
        [_resposta(json.dumps(invalido)), _resposta(json.dumps(MOLDE_VALIDO))],
    )

    assert job.to_dict()["status"] == "salvo"
    assert chamada.call_count == 2

    # O retry precisa carregar a resposta anterior e o erro de validação.
    mensagens_do_retry = chamada.call_args_list[1].kwargs["messages"]
    assert mensagens_do_retry[0]["role"] == "user"
    assert mensagens_do_retry[1]["role"] == "assistant"
    assert "15" in mensagens_do_retry[1]["content"]
    assert mensagens_do_retry[2]["role"] == "user"
    assert "validação" in mensagens_do_retry[2]["content"].lower()


def test_duas_falhas_seguidas_terminam_em_molde_validation_sem_loop(monkeypatch):
    invalido = _molde_com_regras({**REGRA_VALIDA, "valor": 15})
    job, chamada = _rodar_pipeline(
        monkeypatch,
        [_resposta(json.dumps(invalido)), _resposta(json.dumps(invalido))],
    )

    visao = job.to_dict()
    assert visao["status"] == "erro"
    assert visao["error"]["code"] == "molde_validation"
    assert chamada.call_count == 2  # exatamente 1 retry, nunca loop


def test_no_op_do_dono_salva_na_primeira_chamada_sem_retry(monkeypatch):
    # O caso REAL: normalizador resolve sozinho — nenhuma geração extra paga.
    molde_do_dono = _molde_com_regras(REGRA_NO_OP_REAL)
    job, chamada = _rodar_pipeline(monkeypatch, [_resposta(json.dumps(molde_do_dono))])

    assert job.to_dict()["status"] == "salvo"
    assert chamada.call_count == 1


def test_parse_impossivel_tambem_ganha_retry(monkeypatch):
    job, chamada = _rodar_pipeline(
        monkeypatch,
        [_resposta("desculpe, não consegui gerar"), _resposta(json.dumps(MOLDE_VALIDO))],
    )
    assert job.to_dict()["status"] == "salvo"
    assert chamada.call_count == 2
