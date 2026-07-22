# backend/services/job_manager.py
# Gerenciador de jobs assíncronos de geração de plano.
# MVP: jobs rodam em thread dentro do processo Flask.
# Produção multi-worker: trocar por fila externa (Redis/PostgreSQL).

import datetime
import logging
import os
import threading
import uuid
from enum import Enum
from typing import Any, Callable, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    CREATED = "created"
    GERANDO_MOLDE = "gerando_molde"
    EXPANDINDO = "expandindo"
    SALVANDO = "salvando"
    SALVO = "salvo"
    ERRO = "erro"


_TERMINAIS = (JobStatus.SALVO, JobStatus.ERRO)


class PlanJob:
    def __init__(self, job_id: str, user_id: str):
        self.job_id = job_id
        self.user_id = user_id
        self.status = JobStatus.CREATED
        self.progress: Dict[str, str] = {"step": "created", "detail": "Aguardando início da geração."}
        self.plan_id: Optional[str] = None
        self.error: Optional[Dict[str, str]] = None
        self.created_at = datetime.datetime.now(datetime.timezone.utc)
        self._lock = threading.Lock()

    def to_dict(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "job_id": self.job_id,
                "status": self.status.value,
                "progress": dict(self.progress),
                "plan_id": self.plan_id,
                "error": self.error,
            }

    def transition(self, status: JobStatus, step: str, detail: str) -> None:
        with self._lock:
            self.status = status
            self.progress = {"step": step, "detail": detail}

    def marcar_salvo(self, plan_id: str) -> None:
        # Status e plan_id mudam juntos, sob o lock: um poll concorrente nunca
        # pode ver "salvo" com plan_id ausente.
        with self._lock:
            self.status = JobStatus.SALVO
            self.plan_id = plan_id
            self.progress = {
                "step": "salvo",
                "detail": "Plano salvo com sucesso.",
                "plan_id": plan_id,
            }

    def set_error(self, code: str, message: str) -> None:
        with self._lock:
            self.status = JobStatus.ERRO
            self.error = {"code": code, "message": message}


# Armazenamento em memória (MVP). Limpa jobs com >1h.
_jobs: Dict[str, PlanJob] = {}
_jobs_lock = threading.Lock()

_JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", "3600"))


def _limpar_jobs_expirados() -> None:
    # Job em estado não-terminal ganha 2×TTL: apagá-lo no TTL normal liberava
    # o dedup com a thread antiga ainda viva (duas gerações concorrentes).
    # Além de 2×TTL nenhuma geração real está viva — é zumbi de thread morta,
    # e mantê-lo bloquearia o usuário até o restart do processo.
    agora = datetime.datetime.now(datetime.timezone.utc)
    with _jobs_lock:
        expirados = []
        for jid, job in _jobs.items():
            idade = (agora - job.created_at).total_seconds()
            limite = _JOB_TTL_SECONDS if job.status in _TERMINAIS else 2 * _JOB_TTL_SECONDS
            if idade > limite:
                expirados.append(jid)
        for jid in expirados:
            del _jobs[jid]


def criar_job(user_id: str) -> Tuple[PlanJob, bool]:
    """Devolve (job, created). created=False significa job já em andamento
    para este usuário — o chamador NÃO deve disparar o pipeline de novo.

    Dedup e inserção acontecem sob a MESMA aquisição do lock: exatamente um
    chamador concorrente recebe created=True.
    """
    _limpar_jobs_expirados()
    with _jobs_lock:
        for job in _jobs.values():
            if job.user_id == user_id and job.status not in _TERMINAIS:
                return job, False
        job_id = str(uuid.uuid4())
        job = PlanJob(job_id=job_id, user_id=user_id)
        _jobs[job_id] = job
        return job, True


def obter_job(job_id: str) -> Optional[PlanJob]:
    _limpar_jobs_expirados()
    with _jobs_lock:
        return _jobs.get(job_id)


def executar_job(job: PlanJob, func: Callable[[PlanJob], None]) -> None:
    """Dispara o job em uma thread daemon."""

    def _wrapper():
        try:
            func(job)
        except Exception:
            logger.exception(f"Job {job.job_id}: exceção não tratada no pipeline.")
            if job.status != JobStatus.ERRO:
                job.set_error("internal_error", "Erro interno no servidor. Tente novamente.")

    t = threading.Thread(target=_wrapper, daemon=True)
    t.start()
