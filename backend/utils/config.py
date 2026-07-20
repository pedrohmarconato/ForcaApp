# backend/utils/config.py
"""Acesso centralizado à configuração de ambiente do backend.

Carrega EXATAMENTE UM arquivo .env: o do diretório raiz do repositório
(dois níveis acima deste módulo — backend/utils/config.py). Não há mais
um bloco que procura backend/.env nem um segundo load_dotenv.

Os nomes públicos (get_env_variable, get_api_key, get_anthropic_api_key,
get_model_name, get_anthropic_timeout_seconds) são preservados; somente a
implementação foi simplificada. Nenhum valor de variável de ambiente é
registrado em log — apenas a presença/ausência.
"""
import logging
import os
from typing import Optional

from dotenv import load_dotenv

# Configurar logging global (basicConfig) é papel do ENTRYPOINT, nunca de um
# módulo de configuração importável — o basicConfig que vivia aqui duplicava
# handlers em qualquer processo que importasse o backend.
logger = logging.getLogger(__name__)

# Raiz do repositório: sobe dois níveis a partir de backend/utils/config.py.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# FORCA_DOTENV_PATH: caminho alternativo usado pelos testes para provar o
# carregamento com um .env SINTÉTICO, sem tocar no .env real.
DOTENV_PATH = os.environ.get("FORCA_DOTENV_PATH") or os.path.join(PROJECT_ROOT, ".env")

if os.environ.get("FORCA_SKIP_DOTENV") == "1":
    # Modo dos testes (ligado no conftest): o .env real do repositório NÃO é
    # injetado no processo — a suíte permanece hermética.
    logger.debug("FORCA_SKIP_DOTENV=1: .env não carregado.")
elif os.path.exists(DOTENV_PATH):
    loaded = load_dotenv(dotenv_path=DOTENV_PATH)
    if loaded:
        logger.info("Variáveis de ambiente carregadas do .env da raiz do projeto.")
    else:
        logger.warning("Arquivo .env encontrado na raiz, mas não pôde ser carregado.")
else:
    logger.warning(
        "Arquivo .env não encontrado na raiz do projeto. Defina as variáveis "
        "de ambiente manualmente se o ambiente não as prover."
    )


def get_env_variable(var_name: str, default: Optional[str] = None) -> Optional[str]:
    """Busca uma variável de ambiente, retornando `default` se ausente.

    Não registra o valor; apenas avisa quando a variável não está definida.
    """
    value = os.getenv(var_name, default)
    if value is None:
        logger.warning("Variável de ambiente %s não definida.", var_name)
    return value


def get_api_key(service_name: str = "ANTHROPIC") -> Optional[str]:
    """Obtém a chave <SERVICE_NAME>_API_KEY do ambiente.

    Apenas confirma presença/ausência em log — nunca o valor.
    """
    env_var_name = f"{service_name.upper()}_API_KEY"
    api_key = os.getenv(env_var_name)
    if not api_key:
        logger.error(
            "Variável de ambiente '%s' ausente ou vazia.", env_var_name
        )
    else:
        logger.info("Chave API para '%s' disponível (valor omitido).", service_name)
    return api_key


def get_anthropic_api_key() -> Optional[str]:
    """Atalho para get_api_key('ANTHROPIC')."""
    return get_api_key("ANTHROPIC")


def get_model_name(default: str = "claude-sonnet-4-6") -> str:
    """Nome do modelo (default ativo: claude-sonnet-4-6).

    claude-3-5-sonnet-20240620 foi aposentado em 2025-10-28.

    Prefira get_chat_model_name() e get_plan_model_name() para as rotas.
    """
    return get_env_variable("CLAUDE_MODEL_NAME", default) or default


def get_chat_model_name() -> str:
    """Modelo do chat (proxy /api/chat). Default haiku-4-5: mais barato viável."""
    return get_env_variable("CHAT_MODEL_NAME", "claude-haiku-4-5") or "claude-haiku-4-5"


def get_plan_model_name() -> str:
    """Modelo da geração do molde (job async). Default opus-4-8 com thinking."""
    return get_env_variable("PLAN_MODEL_NAME", "claude-opus-4-8") or "claude-opus-4-8"


def get_anthropic_timeout_seconds() -> float:
    """Timeout (s) das chamadas Anthropic no backend.

    Deve ser MENOR que o timeout do app (180s) para o backend falhar antes
    do aplicativo desistir — evita geração paga que o usuário não recebe.
    """
    raw = get_env_variable("ANTHROPIC_TIMEOUT_SECONDS", "150")
    try:
        value = float(raw) if raw is not None else 150.0
    except (TypeError, ValueError):
        logger.warning("ANTHROPIC_TIMEOUT_SECONDS inválido (%r); usando 150s.", raw)
        return 150.0
    return value if value > 0 else 150.0
