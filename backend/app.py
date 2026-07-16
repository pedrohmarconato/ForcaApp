# backend/app.py
import os
import sys

from flask import Flask, g, jsonify, request
from flask_cors import CORS  # Para permitir requisições do frontend (React Native)

# Adiciona o diretório deste arquivo ao sys.path para permitir importações de 'backend.*'
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
PARENT_ROOT = os.path.dirname(PROJECT_ROOT)
for path in (PROJECT_ROOT, PARENT_ROOT):
    if path not in sys.path:
        sys.path.append(path)

try:
    from wrappers.treinador_especialista import TreinadorEspecialista
    from utils.logger import WrapperLogger
    from utils.auth import token_required
    from utils.config import get_api_key, get_model_name
except ImportError as e:
    print(f"ERRO FATAL: Falha ao importar módulos necessários: {e}")
    print("Verifique a estrutura do projeto e se o PYTHONPATH está configurado corretamente.")
    print(f"PROJECT_ROOT: {PROJECT_ROOT}")
    print(f"sys.path: {sys.path}")
    exit(1)

app = Flask(__name__)

# --- CORS restrito por variável de ambiente ---
# Lista de origens separadas por vírgula em CORS_ORIGINS.
# O app React Native não depende de CORS (não envia Origin de browser);
# isto protege contra chamadas via navegador de origens não autorizadas.
DEFAULT_CORS_ORIGINS = "http://localhost:8081,http://localhost:19006"
allowed_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

# Inicializa o logger da aplicação
app_logger = WrapperLogger("FlaskAPI")

# Instancia o treinador (pode ser otimizado com padrões como Singleton ou Factory se necessário)
try:
    treinador = TreinadorEspecialista()
    app_logger.info("Instância de TreinadorEspecialista criada com sucesso.")
except ValueError as e:
    app_logger.error(f"Erro Crítico: Falha ao inicializar TreinadorEspecialista - {e}. A API não poderá gerar planos.")
    treinador = None
except Exception as e:
    app_logger.error(f"Erro Crítico Inesperado ao inicializar TreinadorEspecialista: {e}", exc_info=True)
    treinador = None

# --- Cliente Anthropic compartilhado para o endpoint de chat (lazy) ---
_chat_anthropic_client = None

# Limites de saneamento do payload de chat
MAX_CHAT_MESSAGES = 20
MAX_MESSAGE_LENGTH = 4000
ALLOWED_CHAT_ROLES = {"user", "assistant"}


def _get_chat_anthropic_client():
    """Cria (uma única vez) o cliente Anthropic para o endpoint de chat."""
    global _chat_anthropic_client
    if _chat_anthropic_client is None:
        import anthropic  # import tardio: só exige a lib quando o chat é usado

        api_key = get_api_key("ANTHROPIC")
        if not api_key:
            raise RuntimeError("Chave da API Anthropic não configurada no backend (ANTHROPIC_API_KEY).")
        _chat_anthropic_client = anthropic.Anthropic(api_key=api_key)
    return _chat_anthropic_client


def _sanitize_chat_messages(raw_messages):
    """
    Valida e saneia as mensagens recebidas do app.
    Aceita apenas itens {role: user|assistant, content: str} e limita
    quantidade e tamanho para evitar abuso de tokens/custo.
    Retorna a lista saneada ou None se inválida.
    """
    if not isinstance(raw_messages, list) or not raw_messages:
        return None

    sanitized = []
    for item in raw_messages[-MAX_CHAT_MESSAGES:]:
        if not isinstance(item, dict):
            return None
        role = item.get("role")
        content = item.get("content")
        if role not in ALLOWED_CHAT_ROLES or not isinstance(content, str):
            return None
        content = content.strip()
        if not content:
            return None
        sanitized.append({"role": role, "content": content[:MAX_MESSAGE_LENGTH]})

    # A API da Anthropic exige que a conversa comece com 'user':
    # descarta mensagens iniciais do assistente (ex.: saudação de boas-vindas)
    first_user_index = next((i for i, msg in enumerate(sanitized) if msg["role"] == "user"), None)
    if first_user_index is None:
        return None
    sanitized = sanitized[first_user_index:]

    return sanitized


def _build_chat_system_prompt(questionnaire_data, adjustments):
    """Monta a mensagem de sistema com o contexto do questionário (mesma lógica que existia no app)."""
    import json

    try:
        questionnaire_str = json.dumps(questionnaire_data, indent=2, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        questionnaire_str = "(dados do questionário indisponíveis)"

    adjustments_list = adjustments if isinstance(adjustments, list) else []
    adjustments_str = (
        "\n".join(f"{i + 1}. {str(adj)}" for i, adj in enumerate(adjustments_list))
        if adjustments_list
        else "Nenhum ajuste anterior."
    )

    return (
        "Você é um assistente prestativo. O usuário respondeu a um questionário e pode querer "
        "fazer ajustes ou perguntas sobre os resultados.\n"
        "Respostas do Questionário:\n"
        f"{questionnaire_str}\n\n"
        "Ajustes/Perguntas anteriores do usuário neste chat:\n"
        f"{adjustments_str}\n\n"
        "Responda à última pergunta ou solicitação do usuário de forma concisa e útil, "
        "considerando todo o contexto fornecido."
    )


@app.route('/api/chat', methods=['POST'])
@token_required
def handle_chat():
    """
    Proxy seguro do chat: recebe as mensagens do app, adiciona o contexto
    do questionário e chama a API Claude com a chave protegida no servidor.
    """
    if not request.is_json:
        return jsonify({"error": "Requisição inválida. Esperado JSON."}), 400

    data = request.get_json()
    messages = _sanitize_chat_messages(data.get('messages'))
    if messages is None:
        return jsonify({"error": "Campo 'messages' ausente ou inválido."}), 400

    questionnaire_data = data.get('questionnaireData') or {}
    adjustments = data.get('adjustments') or []
    system_prompt = _build_chat_system_prompt(questionnaire_data, adjustments)

    user_id = (g.user or {}).get('id', 'desconhecido')
    app_logger.info(f"Chat: usuário {user_id} enviou {len(messages)} mensagens.")

    try:
        client = _get_chat_anthropic_client()
        response = client.messages.create(
            model=get_model_name(),
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )
    except Exception as e:
        app_logger.error(f"Erro ao chamar a API Claude no chat para usuário {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Erro ao comunicar com o serviço de IA."}), 502

    reply = ""
    if getattr(response, "content", None):
        for block in response.content:
            if getattr(block, "type", None) == "text":
                reply = block.text
                break

    if not reply:
        app_logger.warning(f"Chat: resposta da IA sem texto para usuário {user_id}.")
        return jsonify({"error": "A IA não retornou uma resposta de texto."}), 502

    return jsonify({"reply": reply.strip()}), 200


@app.route('/api/generate-plan', methods=['POST'])
@token_required
def handle_generate_plan():
    """
    Endpoint para receber dados do frontend e solicitar a geração do plano de treino.
    """
    # Verifica se o treinador foi inicializado corretamente
    if treinador is None:
        app_logger.error("Tentativa de acesso a /api/generate-plan, mas o TreinadorEspecialista não está disponível.")
        return jsonify({"error": "Serviço de geração de planos temporariamente indisponível."}), 503

    # Obter dados da requisição (espera JSON)
    if not request.is_json:
        app_logger.warning("Requisição para /api/generate-plan não continha JSON.")
        return jsonify({"error": "Requisição inválida. Esperado JSON."}), 400

    data = request.get_json()
    app_logger.info("Recebida requisição para /api/generate-plan.")
    # Não logar o payload: contém dados pessoais de saúde (peso, lesões)

    # --- Validação e Mapeamento dos Dados ---
    questionnaire_data = data.get('questionnaireData')
    adjustments = data.get('adjustments', [])  # Lista de strings do chat

    if not questionnaire_data or not isinstance(questionnaire_data, dict):
        app_logger.warning("Dados do questionário ausentes ou inválidos na requisição.")
        return jsonify({"error": "Dados do questionário ('questionnaireData') ausentes ou inválidos."}), 400

    # O ID do usuário vem do token validado, não do payload (evita spoofing)
    user_id = (g.user or {}).get('id') or questionnaire_data.get('id')
    if not user_id:
        app_logger.warning("ID do usuário não encontrado na requisição.")
        return jsonify({"error": "ID do usuário não fornecido."}), 400

    # Mapear dados do frontend para o formato esperado pelo wrapper (`dados_usuario`)
    try:
        dados_usuario_para_wrapper = {
            "id": str(user_id),
            "nome": questionnaire_data.get("nome"),
            "idade": questionnaire_data.get("idade"),
            "peso": questionnaire_data.get("peso"),
            "altura": questionnaire_data.get("altura"),
            "genero": questionnaire_data.get("genero"),
            "nivel": questionnaire_data.get("nivelExperiencia", "iniciante"),
            "historico_treino": questionnaire_data.get("historicoTreino"),
            "tempo_treino": questionnaire_data.get("tempoDisponivelSessao", 60),
            "disponibilidade_semanal": questionnaire_data.get("frequenciaSemanal", 3),
            "dias_disponiveis": questionnaire_data.get("diasPreferenciais", []),
            "cardio": questionnaire_data.get("incluirCardio", "não"),
            "alongamento": questionnaire_data.get("incluirAlongamento", "não"),
            "objetivos": questionnaire_data.get("objetivos", []),
            "restricoes": questionnaire_data.get("restricoes", []),
            "lesoes": questionnaire_data.get("lesoes", []),
            "conversa_chat": "\n".join([f"- {adj}" for adj in adjustments]) if adjustments else "Nenhuma interação registrada."
        }
    except Exception as e:
        app_logger.error(f"Erro ao mapear dados do frontend para o wrapper: {e}", exc_info=True)
        return jsonify({"error": "Erro interno ao processar dados do usuário."}), 500

    # --- Chamar o Wrapper para Gerar o Plano ---
    try:
        app_logger.info(f"Solicitando geração de plano para usuário {user_id}...")
        plano_gerado = treinador.gerar_plano(dados_usuario_para_wrapper)

        if plano_gerado:
            app_logger.info(f"Plano gerado com sucesso para usuário {user_id} (ID Plano: {plano_gerado.get('treinamento_id')}).")

            # --- Ação com o Plano Gerado ---
            # Aqui você normalmente salvaria o `plano_gerado` (JSON) no banco de dados
            # associado ao `user_id`.
            # Exemplo: save_plan_to_db(user_id, plano_gerado)

            return jsonify({
                "status": "success",
                "message": "Plano de treinamento solicitado com sucesso.",
                "plan_id": plano_gerado.get('treinamento_id')
            }), 200
        else:
            app_logger.error(f"Falha na geração do plano para o usuário {user_id} (wrapper retornou None).")
            return jsonify({"error": "Não foi possível gerar o plano de treinamento no momento. Tente novamente mais tarde."}), 500

    except (ConnectionError, RuntimeError) as e:
        app_logger.error(f"Erro de comunicação ou runtime durante a geração do plano para {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Erro ao comunicar com o serviço de IA."}), 502
    except Exception as e:
        app_logger.error(f"Erro inesperado no endpoint /api/generate-plan para {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Ocorreu um erro inesperado no servidor."}), 500


# Rota de health check simples
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5001))
    # debug SOMENTE se explicitamente habilitado — nunca em produção
    debug_mode = os.environ.get("FLASK_DEBUG", "false").strip().lower() == "true"
    app_logger.info(f"Iniciando servidor Flask na porta {port} (debug={debug_mode})...")
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
