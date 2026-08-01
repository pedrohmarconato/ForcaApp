# backend/tests/test_quota_ia.py
# RATE-01 do review defensivo de 31/07/2026.
#
# Cada teste aqui reproduz um modo de falha que o rate limit em memória NÃO
# cobria, e prova que a chamada paga deixa de acontecer — não basta a rota
# devolver 429 depois de já ter gasto o Opus.
#
# Todos os testes deste arquivo carregam `quota_real`: o fixture autouse do
# conftest neutraliza a quota para o resto da suíte, e aqui a queremos viva.

import os
import sys
import types
import unittest.mock as mock

import pytest

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.app import app  # noqa: E402
from backend.services import ai_quota  # noqa: E402

pytestmark = pytest.mark.quota_real

USER_ID = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _limpa_rate_limits():
    """O bucket em memória não pode mascarar (nem ser mascarado por) a quota."""
    import backend.app as app_module

    buckets = getattr(app_module, "_rate_buckets", None)
    if isinstance(buckets, dict):
        buckets.clear()
    yield


def _fake_user_response(user_id=USER_ID):
    resposta = mock.Mock()
    resposta.status_code = 200
    resposta.json.return_value = {"id": user_id, "email": "user@teste.com"}
    return resposta


def _fake_anthropic_client(reply_text="Resposta da IA"):
    bloco = types.SimpleNamespace(type="text", text=reply_text)
    cliente = mock.Mock()
    cliente.messages.create.return_value = types.SimpleNamespace(
        content=[bloco],
        usage=types.SimpleNamespace(
            input_tokens=1000, output_tokens=200,
            cache_creation_input_tokens=0, cache_read_input_tokens=0,
        ),
    )
    return cliente


def _rpc_resposta(permitido, motivo=None, chamadas=0, custo=0.0, rota="chat"):
    return {
        "permitido": permitido,
        "motivo": motivo,
        "rota": rota,
        # `chamadas_rota` (0025): a contagem é POR ROTA; o custo é do dia todo.
        "chamadas_rota": chamadas,
        "custo_dia_usd": custo,
    }


# --- 1. Teto atingido: a chamada paga não acontece ---

def test_quota_estourada_no_chat_devolve_429_sem_chamar_o_modelo(client):
    anthropic = _fake_anthropic_client()
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic), \
         mock.patch.object(ai_quota, "_chamar_rpc",
                           return_value=_rpc_resposta(False, "custo", chamadas=12, custo=5.01)):
        resposta = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 429
    # O ponto do achado: não adianta responder 429 DEPOIS de pagar pelo token.
    assert anthropic.messages.create.call_count == 0


def test_quota_estourada_na_consolidacao_devolve_429_sem_chamar_o_modelo(client):
    anthropic = _fake_anthropic_client()
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic), \
         mock.patch.object(ai_quota, "_chamar_rpc",
                           return_value=_rpc_resposta(False, "chamadas", chamadas=40)):
        resposta = client.post(
            "/api/consolidate-chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 429
    assert anthropic.messages.create.call_count == 0


# --- 2. Falha fechada: sem contabilidade, sem gasto ---

def test_quota_indisponivel_falha_fechada_e_nao_chama_o_modelo(client):
    """
    Se a RPC de quota não responde, não há teto. Deixar passar aqui devolveria
    exatamente o furo do achado sempre que o banco piscasse — e nesse estado a
    rota não conseguiria persistir o resultado de qualquer forma.
    """
    anthropic = _fake_anthropic_client()
    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=anthropic), \
         mock.patch.object(ai_quota, "_chamar_rpc",
                           side_effect=ai_quota.QuotaIndisponivel("banco fora")):
        resposta = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 503
    assert anthropic.messages.create.call_count == 0


# --- 3. A quota é contada por TENTATIVA paga, não por requisição ---

def test_reserva_precede_a_chamada_e_o_acerto_a_sucede(client):
    """
    A ordem é o que protege: reservar depois da chamada deixaria a janela
    entre decidir e debitar sem proteção — que é onde a rajada passa.
    """
    ordem = []
    anthropic = _fake_anthropic_client()

    def _rpc_registrando(access_token, payload):
        ordem.append("reserva" if not payload["p_forcar"] else "acerto")
        return _rpc_resposta(True)

    def _create_registrando(**kwargs):
        ordem.append("anthropic")
        return anthropic.messages.create.return_value

    cliente_anthropic = mock.Mock()
    cliente_anthropic.messages.create.side_effect = _create_registrando

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=cliente_anthropic), \
         mock.patch.object(ai_quota, "_chamar_rpc", side_effect=_rpc_registrando):
        resposta = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200
    assert ordem == ["reserva", "anthropic", "acerto"]


# --- 3b. Teto de chamadas por rota (0025) ---
#
# O modo de falha que a 0024 tinha e homologação não podia revelar: com um
# teto único somando as três rotas, uma conversa longa de onboarding gastava a
# cota e o usuário era barrado na geração do plano — a chamada que importa.

def test_cada_rota_carrega_o_proprio_teto_de_chamadas(client):
    """O chat é generoso porque é barato; o plano é restrito porque é Opus."""
    limites = {}

    def _rpc_capturando(access_token, payload):
        # Só a RESERVA leva limites; o acerto pós-chamada (p_forcar) manda
        # None de propósito, e capturá-lo aqui mascararia o que se quer medir.
        if not payload["p_forcar"]:
            limites[payload["p_rota"]] = payload["p_limite_chamadas"]
        return _rpc_resposta(True, rota=payload["p_rota"])

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=_fake_anthropic_client()), \
         mock.patch.object(ai_quota, "_chamar_rpc", side_effect=_rpc_capturando):
        client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert limites["chat"] == ai_quota.AI_DAILY_CALL_LIMIT_CHAT
    # O chat precisa caber num onboarding conversado sem racionar mensagem.
    assert ai_quota.AI_DAILY_CALL_LIMIT_CHAT > ai_quota.AI_DAILY_CALL_LIMIT_PLAN * 10


def test_o_teto_de_custo_e_o_mesmo_para_todas_as_rotas():
    """
    Quem contém o Opus é o dinheiro, não a contagem. O limite em dólares tem de
    ser global — se fosse por rota, três rotas dariam três vezes o orçamento.
    """
    enviados = []

    def _rpc_capturando(access_token, payload):
        enviados.append(payload["p_limite_usd"])
        return _rpc_resposta(True, rota=payload["p_rota"])

    with mock.patch.object(ai_quota, "_chamar_rpc", side_effect=_rpc_capturando):
        for rota in ("chat", "consolidate", "plan"):
            ai_quota.reservar("token", rota, 0.01)

    assert enviados == [ai_quota.AI_DAILY_USD_LIMIT] * 3


def test_rota_desconhecida_nao_vira_teto_ausente():
    """Um None em p_limite_chamadas significaria 'sem limite' para a RPC."""
    capturado = {}

    def _rpc_capturando(access_token, payload):
        capturado.update(payload)
        return _rpc_resposta(True)

    with mock.patch.object(ai_quota, "_chamar_rpc", side_effect=_rpc_capturando):
        ai_quota.reservar("token", "rota-que-nao-existe", 0.01)

    assert capturado["p_limite_chamadas"] is not None
    assert capturado["p_limite_chamadas"] == ai_quota.AI_DAILY_CALL_LIMIT_PLAN


# --- 4. Aritmética do custo, contra a tabela de preços publicada ---

def test_custo_estimado_bate_com_a_tabela_de_precos():
    # Opus 4.8: US$ 5,00 / 1M entrada e US$ 25,00 / 1M saída.
    assert ai_quota.custo_estimado_usd("claude-opus-4-8", 4_000_000, 0) == pytest.approx(5.0)
    assert ai_quota.custo_estimado_usd("claude-opus-4-8", 0, 1_000_000) == pytest.approx(25.0)
    # Haiku 4.5: US$ 1,00 / 1M entrada e US$ 5,00 / 1M saída.
    assert ai_quota.custo_estimado_usd("claude-haiku-4-5", 4_000_000, 0) == pytest.approx(1.0)
    assert ai_quota.custo_estimado_usd("claude-haiku-4-5", 0, 1_000_000) == pytest.approx(5.0)


def test_modelo_desconhecido_e_cobrado_pelo_teto_e_nao_pelo_piso():
    """Um preço subestimado vira teto que não segura nada."""
    desconhecido = ai_quota.custo_estimado_usd("claude-modelo-que-nao-existe", 0, 1_000_000)
    haiku = ai_quota.custo_estimado_usd("claude-haiku-4-5", 0, 1_000_000)
    assert desconhecido > haiku
    assert desconhecido == pytest.approx(25.0)


def test_custo_real_conta_tokens_de_cache_como_entrada():
    usage = types.SimpleNamespace(
        input_tokens=100_000, output_tokens=0,
        cache_creation_input_tokens=500_000, cache_read_input_tokens=400_000,
    )
    # 1M tokens de entrada no total → US$ 5,00 em Opus 4.8.
    assert ai_quota.custo_real_usd("claude-opus-4-8", usage) == pytest.approx(5.0)


def test_usage_ausente_mantem_a_reserva_de_pior_caso():
    """Sem contagem utilizável não há acerto — e errar para cima é o lado seguro."""
    assert ai_quota.custo_real_usd("claude-opus-4-8", None) is None
    vazio = types.SimpleNamespace(
        input_tokens=0, output_tokens=0,
        cache_creation_input_tokens=0, cache_read_input_tokens=0,
    )
    assert ai_quota.custo_real_usd("claude-opus-4-8", vazio) is None


# --- 5. O acerto nunca derruba a resposta do usuário ---

def test_falha_no_acerto_de_custo_nao_derruba_a_resposta(client):
    """
    O gasto já aconteceu e a reserva de pior caso já protegeu o teto. Trocar
    isso por um 500 seria transformar um erro de centavos em erro de produto.
    """
    chamadas = {"n": 0}

    def _rpc_que_falha_no_acerto(access_token, payload):
        chamadas["n"] += 1
        if payload["p_forcar"]:
            raise ai_quota.QuotaIndisponivel("banco caiu depois da chamada")
        return _rpc_resposta(True)

    with mock.patch("backend.utils.auth.requests.get", return_value=_fake_user_response()), \
         mock.patch("backend.app._get_chat_anthropic_client", return_value=_fake_anthropic_client()), \
         mock.patch.object(ai_quota, "_chamar_rpc", side_effect=_rpc_que_falha_no_acerto):
        resposta = client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Oi"}],
                  "questionnaireData": {"idade": 30}},
            headers={"Authorization": "Bearer token-valido"},
        )

    assert resposta.status_code == 200
    assert chamadas["n"] == 2  # reserva + tentativa de acerto


# --- 6. O laço do molde: cada tentativa é uma geração Opus cobrada ---
#
# Este é o cenário exato do achado: "usuário induz reprovação local do
# primeiro molde -> até 6 conclusões do modelo de plano são cobradas". O
# rate limit antigo contava 1 requisição; a conta da Anthropic contava 2.

def _pipeline_do_molde(monkeypatch, respostas, rpc_quota):
    """Roda _executar_geracao_molde com N respostas e a RPC de quota dada."""
    import json

    import backend.services.job_manager as jm
    from backend.app import _executar_geracao_molde
    from test_molde_validacao_resiliente import (  # fixtures já validadas pela suíte
        MOLDE_VALIDO, REGRA_VALIDA, _molde_com_regras, _resposta,
    )

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake-para-teste")
    monkeypatch.setenv("PLAN_MODEL_NAME", "claude-haiku-4-5")
    with jm._jobs_lock:
        jm._jobs.clear()
    job, _ = jm.criar_job(user_id="user-quota")

    corpos = []
    for r in respostas:
        molde = MOLDE_VALIDO if r == "valido" else _molde_com_regras({**REGRA_VALIDA, "valor": 15})
        corpos.append(_resposta(json.dumps(molde)))

    with mock.patch(
        "backend.utils.anthropic_retry.criar_mensagem_com_deadline",
        autospec=True, side_effect=corpos,
    ) as chamada, \
         mock.patch("backend.app.persistir_plano", return_value="db-plan-quota"), \
         mock.patch.object(ai_quota, "_chamar_rpc", side_effect=rpc_quota) as rpc:
        with app.app_context():
            _executar_geracao_molde(
                job,
                questionnaire_data={"nivelExperiencia": "iniciante"},
                diretrizes={"preferencias": [], "restricoes": [], "excecoes_estruturais": []},
                user_id="user-quota",
                access_token="fake-token",
            )
    return job, chamada, rpc


def test_cada_tentativa_do_molde_consome_quota_separadamente(monkeypatch):
    reservas = []

    def _rpc(access_token, payload):
        if not payload["p_forcar"]:
            reservas.append(payload["p_rota"])
        return _rpc_ok()

    job, chamada, _ = _pipeline_do_molde(monkeypatch, ["invalido", "valido"], _rpc)

    assert job.to_dict()["status"] == "salvo"
    assert chamada.call_count == 2          # duas gerações Opus realmente pagas
    assert reservas == ["plan", "plan"]     # e duas reservas — não uma


def test_quota_estourada_na_segunda_tentativa_impede_a_segunda_geracao(monkeypatch):
    """A primeira tentativa passa; o teto fecha antes da segunda ser paga."""
    estado = {"reservas": 0}

    def _rpc(access_token, payload):
        if payload["p_forcar"]:
            return _rpc_ok()
        estado["reservas"] += 1
        if estado["reservas"] == 1:
            return _rpc_ok()
        return _rpc_resposta(False, "custo", chamadas=7, custo=5.02)

    job, chamada, _ = _pipeline_do_molde(monkeypatch, ["invalido", "valido"], _rpc)

    visao = job.to_dict()
    assert visao["status"] == "erro"
    assert visao["error"]["code"] == "quota_diaria_excedida"
    assert chamada.call_count == 1  # a 2ª geração Opus nunca foi cobrada


def _rpc_ok():
    return {"permitido": True, "rota": "plan", "chamadas_rota": 1, "custo_dia_usd": 0.1}


# --- 7. A reserva cobre o gasto real (senão o teto vaza) ---

def test_reserva_de_pior_caso_cobre_o_gasto_real_do_molde():
    modelo = "claude-opus-4-8"
    caracteres = 40_000
    max_saida = 32_768
    reservado = ai_quota.custo_estimado_usd(modelo, caracteres, max_saida)

    # Pior caso real: a saída chega ao teto e a entrada é a estimada.
    usage_pior_caso = types.SimpleNamespace(
        input_tokens=caracteres // ai_quota.CARACTERES_POR_TOKEN,
        output_tokens=max_saida,
        cache_creation_input_tokens=0, cache_read_input_tokens=0,
    )
    real = ai_quota.custo_real_usd(modelo, usage_pior_caso)
    assert reservado >= real
