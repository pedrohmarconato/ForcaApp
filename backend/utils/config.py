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

def get_api_key(service_name: str = "ANTHROPIC") -> str | None:
    """
    Obtém a chave de API de uma variável de ambiente.
    Exemplo: ANTHROPIC_API_KEY
    """
    var_name = f"{service_name.upper()}_API_KEY"
    return get_env_variable(var_name)

def get_model_name(default: str = "claude-3-5-sonnet-20240620") -> str:
    """Obtém o nome do modelo de uma variável de ambiente ou usa o padrão."""
    return get_env_variable("CLAUDE_MODEL_NAME", default)

# Adicione outras configurações conforme necessário