# backend/tests/test_push_reminder_scheduler.py
# Cobre os 5 comportamentos do Plano 13-02 Task 1 (PUSH-02): tick só na hora
# configurada, idempotência a "restart" (reminder_sent_at persistido — não em
# memória), aluno sem subscription pulado sem erro (mas marcado), e
# iniciar_scheduler() gated por PUSH_REMINDER_SCHEDULER_ENABLED.
#
# Fake em memória de planned_sessions/push_subscriptions (nunca um mock
# "sempre retorna a mesma lista"): a segunda rodada do tick (Teste 2) só
# prova idempotência de verdade se o GET de candidatos reflete o PATCH da
# primeira rodada — exatamente o que a query real com `reminder_sent_at
# is.null` faria contra o Postgres.

import datetime
import json
import os
import sys
import unittest.mock as mock

import pytest
import requests

os.environ["SUPABASE_URL"] = "https://teste.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "anon-key-teste"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "service-role-key-teste"

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

import backend.services.push_reminder_scheduler as scheduler  # noqa: E402


# 08:00 America/Sao_Paulo == 11:00 UTC (Brasil sem horário de verão desde
# 2019 -- America/Sao_Paulo é UTC-3 fixo, sem ambiguidade de DST no teste).
AGORA_08H_UTC = datetime.datetime(2026, 8, 17, 11, 0, tzinfo=datetime.timezone.utc)
AGORA_14H_UTC = datetime.datetime(2026, 8, 17, 17, 0, tzinfo=datetime.timezone.utc)

USER_A = "3f6b8f2e-9c4a-4d2e-a1b5-7c8d9e0f1a2b"
USER_B = "8a1b2c3d-4e5f-6789-a0b1-c2d3e4f5a6b7"


class _FakeSupabase:
    """Simula planned_sessions/push_subscriptions o suficiente para provar
    idempotência real: o GET de candidatos exclui quem o PATCH já marcou."""

    def __init__(self):
        self.planned_sessions = {}
        self.subscriptions = []
        self.raise_on_patch_for = set()

    def seed_session(self, session_id, user_id, title, scheduled_date="2026-08-17", status="pending"):
        self.planned_sessions[session_id] = {
            "user_id": user_id,
            "title": title,
            "scheduled_date": scheduled_date,
            "status": status,
            "reminder_sent_at": None,
        }

    def seed_subscription(self, user_id, endpoint):
        self.subscriptions.append(
            {"user_id": user_id, "endpoint": endpoint, "p256dh": "p256dh-teste", "auth": "auth-teste"}
        )

    def get(self, url, headers=None, params=None, timeout=None):
        response = mock.Mock()
        response.status_code = 200
        response.raise_for_status = mock.Mock()
        if url.endswith("/rest/v1/planned_sessions"):
            hoje = params["scheduled_date"].split("eq.", 1)[1]
            resultado = [
                {"id": sid, "user_id": s["user_id"], "title": s["title"]}
                for sid, s in self.planned_sessions.items()
                if s["scheduled_date"] == hoje
                and s["status"] == "pending"
                and s["reminder_sent_at"] is None
            ]
            response.json = mock.Mock(return_value=resultado)
        elif url.endswith("/rest/v1/push_subscriptions"):
            filtro = params["user_id"]  # "in.(id1,id2)"
            ids = filtro[len("in.(") : -1].split(",")
            resultado = [s for s in self.subscriptions if s["user_id"] in ids]
            response.json = mock.Mock(return_value=resultado)
        else:
            raise AssertionError("URL inesperada no fake: {}".format(url))
        return response

    def patch(self, url, headers=None, params=None, json=None, timeout=None):
        assert url.endswith("/rest/v1/planned_sessions")
        session_id = params["id"].split("eq.", 1)[1]
        if session_id in self.raise_on_patch_for:
            raise requests.exceptions.HTTPError(
                "500 Server Error (simulado) ao marcar reminder_sent_at de {}".format(session_id)
            )
        self.planned_sessions[session_id]["reminder_sent_at"] = json["reminder_sent_at"]
        response = mock.Mock()
        response.status_code = 204
        response.raise_for_status = mock.Mock()
        return response


@pytest.fixture()
def fake_db():
    return _FakeSupabase()


@pytest.fixture(autouse=True)
def _patch_requests(fake_db):
    with mock.patch("backend.services.push_reminder_scheduler.requests.get", side_effect=fake_db.get), \
         mock.patch("backend.services.push_reminder_scheduler.requests.patch", side_effect=fake_db.patch):
        yield


# --- Teste 1: envia um push por (sessão, subscription) e marca reminder_sent_at ---


def test_tick_as_08h_envia_push_e_marca_reminder_sent_at(fake_db):
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/abc")

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push", return_value=True
    ) as fake_enviar:
        enviados = scheduler.processar_tick(AGORA_08H_UTC)

    assert enviados == 1
    fake_enviar.assert_called_once()
    assert fake_db.planned_sessions["sess-1"]["reminder_sent_at"] is not None


# --- Teste 2: restart do processo (tick duas vezes) não duplica o lembrete ---


def test_tick_duas_vezes_nao_duplica_envio_apos_restart_simulado(fake_db):
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/abc")

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push", return_value=True
    ) as fake_enviar:
        primeira_rodada = scheduler.processar_tick(AGORA_08H_UTC)
        # Representa um restart do processo Flask: nova chamada do tick sobre
        # o MESMO conjunto de dados simulado, minutos depois.
        segunda_rodada = scheduler.processar_tick(AGORA_08H_UTC)

    assert primeira_rodada == 1
    assert segunda_rodada == 0
    fake_enviar.assert_called_once()


# --- Teste 3: aluno sem subscription é pulado, sem erro, mas marcado ---


def test_sessao_sem_subscription_nao_chama_enviar_push_nem_lanca_excecao_mas_e_marcada(fake_db):
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    # Nenhuma subscription cadastrada para USER_A.

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push"
    ) as fake_enviar:
        enviados = scheduler.processar_tick(AGORA_08H_UTC)

    assert enviados == 0
    fake_enviar.assert_not_called()
    assert fake_db.planned_sessions["sess-1"]["reminder_sent_at"] is not None


# --- Teste 4: fora da hora configurada, early return sem consultar nada ---


def test_fora_da_hora_configurada_nao_consulta_candidatos_nem_envia(fake_db):
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/abc")

    with mock.patch("backend.services.push_reminder_scheduler.requests.get") as fake_get, \
         mock.patch(
             "backend.services.push_reminder_scheduler.push_sender.enviar_push"
         ) as fake_enviar:
        enviados = scheduler.processar_tick(AGORA_14H_UTC)

    assert enviados == 0
    fake_get.assert_not_called()
    fake_enviar.assert_not_called()


# --- Teste 5: iniciar_scheduler() não inicia thread sem opt-in explícito ---


def test_iniciar_scheduler_nao_inicia_thread_quando_flag_ausente(monkeypatch):
    monkeypatch.delenv("PUSH_REMINDER_SCHEDULER_ENABLED", raising=False)
    with mock.patch("backend.services.push_reminder_scheduler.threading.Thread") as fake_thread:
        scheduler.iniciar_scheduler()
    fake_thread.assert_not_called()


def test_iniciar_scheduler_nao_inicia_thread_quando_flag_false(monkeypatch):
    monkeypatch.setenv("PUSH_REMINDER_SCHEDULER_ENABLED", "false")
    with mock.patch("backend.services.push_reminder_scheduler.threading.Thread") as fake_thread:
        scheduler.iniciar_scheduler()
    fake_thread.assert_not_called()


def test_iniciar_scheduler_inicia_thread_daemon_quando_flag_true(monkeypatch):
    monkeypatch.setenv("PUSH_REMINDER_SCHEDULER_ENABLED", "true")
    with mock.patch("backend.services.push_reminder_scheduler.threading.Thread") as fake_thread:
        instancia = fake_thread.return_value
        scheduler.iniciar_scheduler()
    fake_thread.assert_called_once()
    _, kwargs = fake_thread.call_args
    assert kwargs.get("daemon") is True
    instancia.start.assert_called_once()


# --- Bônus: subscription expirada (404/410) é apagada, mesmo contrato do spike ---


def test_enviar_push_retornando_false_apaga_subscription_expirada(fake_db):
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/expirado")

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push", return_value=False
    ), mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.delete_subscription"
    ) as fake_delete:
        enviados = scheduler.processar_tick(AGORA_08H_UTC)

    assert enviados == 0
    fake_delete.assert_called_once_with(
        USER_A, "service-role-key-teste", "https://web.push.apple.com/expirado"
    )
    assert fake_db.planned_sessions["sess-1"]["reminder_sent_at"] is not None


# --- CR-01: exceção ao marcar reminder_sent_at de UM aluno não pode abortar
# o resto do tick (REVIEW.md 13-REVIEW.md CR-01) ---


def test_excecao_ao_marcar_reminder_sent_at_de_um_aluno_sem_subscription_nao_aborta_os_demais(fake_db):
    """sess-1 (USER_A, sem subscription) falha ao marcar reminder_sent_at
    (linha 148 do scheduler); sess-2 (USER_B, sem subscription) deve ainda
    assim ser processada e marcada no MESMO tick — antes do fix, a exceção em
    sess-1 propagava e abortava o `for` antes de sess-2 ser sequer tentada."""
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_session("sess-2", USER_B, "Treino de costas")
    fake_db.raise_on_patch_for = {"sess-1"}

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push"
    ) as fake_enviar:
        enviados = scheduler.processar_tick(AGORA_08H_UTC)

    assert enviados == 0
    fake_enviar.assert_not_called()
    # sess-1 falhou ao marcar: reminder_sent_at continua None (será
    # reprocessada num próximo tick dentro da mesma hora, se houver).
    assert fake_db.planned_sessions["sess-1"]["reminder_sent_at"] is None
    # sess-2 NÃO pode ser vítima colateral da falha de sess-1.
    assert fake_db.planned_sessions["sess-2"]["reminder_sent_at"] is not None


def test_excecao_ao_marcar_reminder_sent_at_apos_envio_de_push_nao_aborta_os_demais(fake_db):
    """Mesmo cenário, mas para a chamada de _marcar_lembrete_enviado que
    ocorre APÓS o loop de push (linha 190) — sess-1 tem subscription, recebe
    o push com sucesso, mas falha ao marcar; sess-2 ainda deve ser
    processada."""
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/abc")
    fake_db.seed_session("sess-2", USER_B, "Treino de costas")
    fake_db.seed_subscription(USER_B, "https://web.push.apple.com/def")
    fake_db.raise_on_patch_for = {"sess-1"}

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push", return_value=True
    ) as fake_enviar:
        enviados = scheduler.processar_tick(AGORA_08H_UTC)

    # sess-1 recebeu o push (enviados conta o envio, não a marcação) e sess-2
    # também — ambas subscriptions foram tentadas, apesar da falha de marcação.
    assert enviados == 2
    assert fake_enviar.call_count == 2
    assert fake_db.planned_sessions["sess-1"]["reminder_sent_at"] is None
    assert fake_db.planned_sessions["sess-2"]["reminder_sent_at"] is not None


# --- WR-02: payload do lembrete NÃO pode incluir o título da sessão (13-REVIEW.md,
# iteração 2) — "detalhe de treino" é exatamente o exemplo de Information
# Disclosure listado em 13-RESEARCH.md para um device compartilhado; o
# payload de replan-notify (app.py) já é genérico, o do lembrete diário
# precisa seguir o MESMO padrão. ---


def test_payload_do_lembrete_nao_inclui_titulo_da_sessao(fake_db):
    titulo_sensivel = "Treino de pernas — lesão no joelho"
    fake_db.seed_session("sess-1", USER_A, titulo_sensivel)
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/abc")

    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push", return_value=True
    ) as fake_enviar:
        scheduler.processar_tick(AGORA_08H_UTC)

    fake_enviar.assert_called_once()
    payload_arg = fake_enviar.call_args[0][1]
    payload = json.loads(payload_arg)
    assert titulo_sensivel not in payload["title"]
    assert titulo_sensivel not in payload["body"]
    # Genérico e alinhado ao padrão já usado no replan-notify (app.py):
    # nenhum detalhe de treino visível na tela de bloqueio de um device
    # compartilhado, só o deep link (não exibido no push) carrega o sessionId.
    assert payload["body"] == "Confira seu treino de hoje."


# --- datetime.now() nunca dentro de processar_tick (T-13-08) ---


def test_processar_tick_e_deterministico_com_agora_injetado(fake_db):
    """Mesma prova por comportamento: duas datas 'agora' equivalentes (mesma
    hora local, dias diferentes) produzem resultados independentes — nunca lê
    o relógio de verdade."""
    fake_db.seed_session("sess-1", USER_A, "Treino de pernas")
    fake_db.seed_subscription(USER_A, "https://web.push.apple.com/abc")

    outro_dia_08h_utc = datetime.datetime(2026, 8, 18, 11, 0, tzinfo=datetime.timezone.utc)
    with mock.patch(
        "backend.services.push_reminder_scheduler.push_sender.enviar_push", return_value=True
    ) as fake_enviar:
        enviados = scheduler.processar_tick(outro_dia_08h_utc)

    # Sessão agendada para 17/08, "agora" injetado é 18/08 -> nenhum candidato.
    assert enviados == 0
    fake_enviar.assert_not_called()
