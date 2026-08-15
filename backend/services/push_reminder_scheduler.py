# backend/services/push_reminder_scheduler.py
# Lembrete diário de treino (PUSH-02): thread única MVP dentro do processo
# Flask (mesmo padrão de job_manager.py — "produção multi-worker: trocar por
# fila externa" vale igualmente aqui). Lê `planned_sessions` DIRETAMENTE
# (scheduled_date/status) — nunca reimplementa a lógica de
# weeklyReplanner.ts/agendaDias.ts em Python (Anti-Pattern de
# 13-RESEARCH.md): reancoragem e aderência continuam sendo cálculo do
# cliente, o scheduler só lê o resultado já persistido.
#
# Idempotência a restart (PUSH-02, edge de concorrência): `reminder_sent_at`
# é PERSISTIDO no Postgres, nunca em memória — um restart do processo no meio
# do dia não duplica o lembrete porque a query de candidatos já exclui quem
# tem `reminder_sent_at` preenchido (migration 0039).
#
# SUPABASE_SERVICE_ROLE_KEY (T-13-06): lida via os.environ SÓ dentro de
# funções (nunca em nível de módulo, para não vazar em import de teste) e
# nunca logada. Este é o ÚNICO módulo do backend que a usa — nenhuma rota
# HTTP em app.py a importa ou a lê.

import datetime
import json
import logging
import os
import threading
import time
import zoneinfo

import requests

from backend.services import push_sender

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 20

TZ_SAO_PAULO = zoneinfo.ZoneInfo("America/Sao_Paulo")
REMINDER_HOUR = int(os.environ.get("PUSH_REMINDER_HOUR", "8"))
POLL_INTERVAL_SECONDS = int(os.environ.get("PUSH_REMINDER_POLL_SECONDS", "300"))


def _service_role_key() -> str:
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""


def _base_url() -> str:
    return (os.environ.get("SUPABASE_URL") or "").rstrip("/")


def _service_role_headers() -> dict:
    """Headers com a chave de serviço — lidos AQUI, lazy, nunca em nível de
    módulo. Único ponto do backend que usa SUPABASE_SERVICE_ROLE_KEY: bypassa
    RLS por design (processo interno, sem usuário logado por trás — T-13-06).
    """
    key = _service_role_key()
    return {
        "apikey": key,
        "Authorization": "Bearer {}".format(key),
        "Content-Type": "application/json",
    }


def _candidatos_do_dia(hoje_iso: str) -> list:
    """Sessões de HOJE, pendentes, ainda sem lembrete enviado. Query direta a
    `planned_sessions` — nunca recalcula reancoragem/aderência aqui (essa
    lógica pertence a agendaDias.ts/weeklyReplanner.ts, no cliente)."""
    response = requests.get(
        "{}/rest/v1/planned_sessions".format(_base_url()),
        headers=_service_role_headers(),
        params={
            "scheduled_date": "eq.{}".format(hoje_iso),
            "status": "eq.pending",
            "reminder_sent_at": "is.null",
            "select": "id,user_id,title",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def _subscriptions_por_usuarios(user_ids: list) -> dict:
    """Subscriptions dos alunos candidatos, agrupadas por user_id. Devolve {}
    sem nenhuma chamada de rede quando não há candidatos (evita um filtro
    `in.()` vazio/inválido)."""
    if not user_ids:
        return {}
    response = requests.get(
        "{}/rest/v1/push_subscriptions".format(_base_url()),
        headers=_service_role_headers(),
        params={
            "user_id": "in.({})".format(",".join(user_ids)),
            "select": "user_id,endpoint,p256dh,auth",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    agrupado: dict = {}
    for row in response.json():
        agrupado.setdefault(row["user_id"], []).append(row)
    return agrupado


def _marcar_lembrete_enviado(session_id: str, quando_iso: str) -> None:
    """Marca `reminder_sent_at` — é a chave de idempotência: uma sessão
    marcada nunca mais aparece nos candidatos de `_candidatos_do_dia`, mesmo
    depois de um restart do processo. `quando_iso` vem do "agora" injetado em
    `processar_tick` (nunca um `datetime.now()` novo aqui) — mesma garantia
    de determinismo, testável."""
    response = requests.patch(
        "{}/rest/v1/planned_sessions".format(_base_url()),
        headers=_service_role_headers(),
        params={"id": "eq.{}".format(session_id)},
        json={"reminder_sent_at": quando_iso},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()


def processar_tick(agora: datetime.datetime) -> int:
    """Devolve quantos pushes foram enviados com sucesso. `agora` é SEMPRE
    parâmetro injetado pelo chamador — esta função NUNCA chama
    `datetime.now()` internamente (testável deterministicamente; mitigação de
    T-13-08, reenvio em loop por bug de fuso/hora)."""
    agora_local = agora.astimezone(TZ_SAO_PAULO)
    if agora_local.hour != REMINDER_HOUR:
        return 0

    hoje_iso = agora_local.date().isoformat()
    candidatos = _candidatos_do_dia(hoje_iso)
    if not candidatos:
        return 0

    user_ids = sorted({candidato["user_id"] for candidato in candidatos})
    subs_por_usuario = _subscriptions_por_usuarios(user_ids)

    vapid_private_key = os.environ.get("VAPID_PRIVATE_KEY") or ""
    vapid_subject = os.environ.get("VAPID_SUBJECT") or ""
    service_key = _service_role_key()
    quando_iso = agora_local.isoformat()

    enviados = 0
    for sessao in candidatos:
        subscriptions = subs_por_usuario.get(sessao["user_id"]) or []
        if not subscriptions:
            # Aluno sem subscription: marca mesmo assim — senão o mesmo aluno
            # seria reprocessado eternamente no mesmo dia sem nunca ter push
            # nenhum para enviar. Envolvido em try/except (CR-01 de
            # 13-REVIEW.md): uma falha aqui não pode abortar o `for` e
            # deixar os alunos seguintes sem NENHUMA tentativa neste tick.
            try:
                _marcar_lembrete_enviado(sessao["id"], quando_iso)
            except Exception:
                logger.exception(
                    "Falha ao marcar reminder_sent_at (sessão %s sem "
                    "subscription) — será reprocessada no próximo tick "
                    "dentro da mesma hora, se houver.",
                    sessao["id"],
                )
            continue

        payload = json.dumps(
            {
                "title": "Hora do treino!",
                # WR-02 (13-REVIEW.md, iteração 2): o corpo NUNCA pode incluir
                # o título da sessão — "detalhe de treino" é exatamente o
                # exemplo de Information Disclosure listado em
                # 13-RESEARCH.md ("Known Threat Patterns") para uma
                # notificação visível na tela de bloqueio de um device
                # compartilhado. Mesmo padrão genérico já usado no
                # replan-notify (app.py:handle_push_notify_replan) — o
                # detalhe da sessão só viaja no `url` do deep link, que não
                # aparece na tela de bloqueio.
                "body": "Confira seu treino de hoje.",
                # MESMO id de planned_sessions, mesmo path de linkingConfig.ts
                # (resolve de graça o sessionId do deep link — Open Question
                # Q3 de 13-RESEARCH.md).
                "url": "/home/active-session/{}".format(sessao["id"]),
            }
        )
        for subscription in subscriptions:
            try:
                sucesso = push_sender.enviar_push(
                    subscription, payload, vapid_private_key, vapid_subject,
                )
            except Exception:
                # Uma falha numa subscription não impede as demais nem a
                # marcação da sessão — mesmo espírito de tolerância a falha
                # do _wrapper de job_manager.executar_job.
                logger.exception(
                    "Falha ao enviar lembrete de treino (sessão %s, endpoint %s).",
                    sessao["id"],
                    subscription.get("endpoint"),
                )
                continue
            if sucesso:
                enviados += 1
            elif sucesso is None:
                # WR-01 (13-REVIEW.md, iteração 3): enviar_push devolveu None
                # -- o allowlist recusou o endpoint, NÃO é um 404/410
                # confirmado pelo push service. enviar_push já logou em
                # nível error; aqui só pulamos o envio SEM apagar a linha.
                continue
            else:
                # enviar_push devolveu False: subscription expirada
                # (404/410, contrato provado em 13-SPIKE.md) — apaga.
                try:
                    push_sender.delete_subscription(
                        subscription["user_id"], service_key, subscription["endpoint"],
                    )
                except Exception:
                    logger.exception(
                        "Falha ao apagar subscription expirada (endpoint %s).",
                        subscription.get("endpoint"),
                    )
        # CR-01 de 13-REVIEW.md: mesma proteção do ramo "sem subscription" —
        # uma falha ao marcar reminder_sent_at desta sessão não pode abortar
        # o `for` e impedir a tentativa dos alunos seguintes no mesmo tick.
        try:
            _marcar_lembrete_enviado(sessao["id"], quando_iso)
        except Exception:
            logger.exception(
                "Falha ao marcar reminder_sent_at da sessão %s — será "
                "reprocessada no próximo tick dentro da mesma hora, se "
                "houver.",
                sessao["id"],
            )

    return enviados


def _loop() -> None:
    while True:
        try:
            processar_tick(datetime.datetime.now(datetime.timezone.utc))
        except Exception:
            # Uma exceção não tratada não pode matar a thread silenciosamente
            # — loga e continua (mesmo espírito do _wrapper de
            # job_manager.executar_job).
            logger.exception("Falha não tratada no tick do lembrete de treino.")
        time.sleep(POLL_INTERVAL_SECONDS)


def iniciar_scheduler() -> None:
    """Inicia a thread daemon do lembrete diário — só quando
    PUSH_REMINDER_SCHEDULER_ENABLED=true (default seguro: testes/dev nunca
    sobem thread real; produção liga explicitamente no docker-compose)."""
    habilitado = (
        os.environ.get("PUSH_REMINDER_SCHEDULER_ENABLED", "false").strip().lower() == "true"
    )
    if not habilitado:
        return
    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
