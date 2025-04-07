# backend/utils/config.py
import os
from dotenv import load_dotenv
import sys

# Determina o diretório raiz do projeto (assumindo que backend/ está um nível abaixo)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Constrói o caminho para o arquivo .env na raiz
DOTENV_PATH = os.path.join(PROJECT_ROOT, '.env')

# Verifica se o arquivo .env existe antes de tentar carregá-lo
if os.path.exists(DOTENV_PATH):
    load_dotenv(dotenv_path=DOTENV_PATH)
    # print(f"Arquivo .env carregado de: {DOTENV_PATH}") # Para depuração
else:
    print(f"AVISO: Arquivo .env não encontrado em {DOTENV_PATH}. Variáveis de ambiente devem ser definidas manualmente.", file=sys.stderr)


def get_env_variable(var_name: str, default: str | None = None) -> str | None:
    """Busca uma variável de ambiente."""
    value = os.getenv(var_name, default)
    if value is None:
         print(f"AVISO: Variável de ambiente {var_name} não definida.", file=sys.stderr)
    return value

import os
import logging
from dotenv import load_dotenv

# Configuração básica de logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Determina o caminho absoluto para a pasta raiz do projeto (assumindo que config.py está em backend/utils/)
# Isso sobe dois níveis a partir do diretório atual (__file__)
project_root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
dotenv_path = os.path.join(project_root_path, '.env')

# Tenta carregar o arquivo .env da raiz do projeto
if os.path.exists(dotenv_path):
    loaded = load_dotenv(dotenv_path=dotenv_path)
    if loaded:
        logger.info(f"Variáveis de ambiente carregadas com sucesso de: {dotenv_path}")
    else:
         logger.warning(f"Arquivo .env encontrado em {dotenv_path}, mas não pôde ser carregado.")
else:
    logger.warning(f"Arquivo .env não encontrado em {dotenv_path}. Certifique-se de que ele existe na raiz do projeto ou configure as variáveis de ambiente manualmente.")


def get_api_key(service_name: str = "ANTHROPIC") -> str | None:
    """
    Obtém a chave de API de uma variável de ambiente (ex: ANTHROPIC_API_KEY).

    Procura pela variável de ambiente com o nome <SERVICE_NAME>_API_KEY.
    As variáveis são carregadas do arquivo .env na raiz do projeto, se existir.

    Args:
        service_name: O nome do serviço (ex: "ANTHROPIC"). O nome será convertido
                      para maiúsculas e terá "_API_KEY" anexado.

    Returns:
        A chave da API como string, ou None se a variável de ambiente não for encontrada.
    """
    env_var_name = f"{service_name.upper()}_API_KEY"
    api_key = os.getenv(env_var_name)

    if not api_key:
        logger.error(f"ERRO CRÍTICO: A variável de ambiente '{env_var_name}' não foi encontrada ou não está definida no .env ou no ambiente do sistema.")
        # Você pode optar por lançar um erro aqui se a chave for absolutamente essencial:
        # raise ValueError(f"A chave da API '{env_var_name}' é necessária mas não foi encontrada.")
    else:
        # Apenas confirme que foi encontrada, não logue a chave em si por segurança
        logger.info(f"Chave API para '{service_name}' lida com sucesso da variável de ambiente '{env_var_name}'.")

    return api_key

# Função helper opcional para clareza ao buscar a chave específica do Anthropic
def get_anthropic_api_key() -> str | None:
    """Obtém especificamente a chave da API Anthropic."""
    return get_api_key("ANTHROPIC")

    var_name = f"{service_name.upper()}_API_KEY"
    return get_env_variable(var_name)

def get_model_name(default: str = "claude-3-5-sonnet-20240620") -> str:
    """Obtém o nome do modelo de uma variável de ambiente ou usa o padrão."""
    return get_env_variable("CLAUDE_MODEL_NAME", default)

# Adicione outras configurações conforme necessário