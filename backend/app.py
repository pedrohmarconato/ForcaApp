# backend/app.py
import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS # Para permitir requisições do frontend (React Native)

# Adiciona o diretório raiz ao sys.path para permitir importações de 'backend.*'
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

try:
    from wrappers.treinador_especialista import TreinadorEspecialista
    from utils.logger import WrapperLogger
    # Importar funções de autenticação/autorização se necessário
    # from auth.decorators import token_required
except ImportError as e:
    print(f"ERRO FATAL: Falha ao importar módulos necessários: {e}")
    print("Verifique a estrutura do projeto e se o PYTHONPATH está configurado corretamente.")
    print(f"PROJECT_ROOT: {PROJECT_ROOT}")
    print(f"sys.path: {sys.path}")
    exit(1)

app = Flask(__name__)
# Configurar CORS - ajuste 'origins' para produção se necessário
CORS(app, resources={r"/api/*": {"origins": "*"}}) # Permite todas as origens para /api/*

# Inicializa o logger da aplicação
app_logger = WrapperLogger("FlaskAPI")

# Instancia o treinador (pode ser otimizado com padrões como Singleton ou Factory se necessário)
# Tratamento de erro na inicialização do wrapper
try:
    treinador = TreinadorEspecialista()
    app_logger.info("Instância de TreinadorEspecialista criada com sucesso.")
except ValueError as e:
    app_logger.error(f"Erro Crítico: Falha ao inicializar TreinadorEspecialista - {e}. A API não poderá gerar planos.")
    treinador = None # Define como None para checagem posterior
except Exception as e:
    app_logger.error(f"Erro Crítico Inesperado ao inicializar TreinadorEspecialista: {e}", exc_info=True)
    treinador = None

@app.route('/api/generate-plan', methods=['POST'])
# @token_required # Descomente se tiver um decorator de autenticação
def handle_generate_plan():
    """
    Endpoint para receber dados do frontend e solicitar a geração do plano de treino.
    """
    # Verifica se o treinador foi inicializado corretamente
    if treinador is None:
         app_logger.error("Tentativa de acesso a /api/generate-plan, mas o TreinadorEspecialista não está disponível.")
         return jsonify({"error": "Serviço de geração de planos temporariamente indisponível."}), 503 # Service Unavailable

    # Obter dados da requisição (espera JSON)
    if not request.is_json:
        app_logger.warning("Requisição para /api/generate-plan não continha JSON.")
        return jsonify({"error": "Requisição inválida. Esperado JSON."}), 400

    data = request.get_json()
    app_logger.info(f"Recebida requisição para /api/generate-plan.")
    app_logger.debug(f"Dados recebidos: {data}") # Cuidado ao logar dados sensíveis

    # --- Validação e Mapeamento dos Dados ---
    # Extrair dados do questionário e ajustes do chat
    questionnaire_data = data.get('questionnaireData')
    adjustments = data.get('adjustments', []) # Lista de strings do chat

    # Validar dados essenciais (exemplo básico)
    if not questionnaire_data or not isinstance(questionnaire_data, dict):
        app_logger.warning("Dados do questionário ausentes ou inválidos na requisição.")
        return jsonify({"error": "Dados do questionário ('questionnaireData') ausentes ou inválidos."}), 400

    user_id = questionnaire_data.get('id') # Assumindo que o ID do usuário está aqui
    if not user_id:
        # Tentar obter de um token JWT decodificado, se usar autenticação
        # user_id = getattr(current_user, 'id', None) # Exemplo com Flask-Login ou similar
        # Se ainda não tiver ID, retorna erro
        if not user_id:
             app_logger.warning("ID do usuário não encontrado na requisição.")
             return jsonify({"error": "ID do usuário não fornecido."}), 400

    # Mapear dados do frontend para o formato esperado pelo wrapper (`dados_usuario`)
    # Esta é uma parte CRUCIAL e depende da estrutura EXATA de `questionnaireData`
    try:
        dados_usuario_para_wrapper = {
            "id": str(user_id), # Garante string
            "nome": questionnaire_data.get("nome"),
            "idade": questionnaire_data.get("idade"),
            "peso": questionnaire_data.get("peso"),
            "altura": questionnaire_data.get("altura"),
            "genero": questionnaire_data.get("genero"),
            "nivel": questionnaire_data.get("nivelExperiencia", "iniciante"), # Ajuste a chave conforme seu form
            "historico_treino": questionnaire_data.get("historicoTreino"), # Ajuste a chave
            "tempo_treino": questionnaire_data.get("tempoDisponivelSessao", 60), # Ajuste a chave
            "disponibilidade_semanal": questionnaire_data.get("frequenciaSemanal", 3), # Ajuste a chave
            "dias_disponiveis": questionnaire_data.get("diasPreferenciais", []), # Ajuste a chave
            "cardio": questionnaire_data.get("incluirCardio", "não"), # Ajuste a chave
            "alongamento": questionnaire_data.get("incluirAlongamento", "não"), # Ajuste a chave
            "objetivos": questionnaire_data.get("objetivos", []), # Assumindo formato compatível
            "restricoes": questionnaire_data.get("restricoes", []), # Assumindo formato compatível
            "lesoes": questionnaire_data.get("lesoes", []), # Assumindo formato compatível
            "conversa_chat": "\n".join([f"- {adj}" for adj in adjustments]) if adjustments else "Nenhuma interação registrada."
        }
        app_logger.debug(f"Dados mapeados para o wrapper: {dados_usuario_para_wrapper}")
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
            # ---------------------------------

            # Retorna sucesso para o frontend
            return jsonify({
                "status": "success",
                "message": "Plano de treinamento solicitado com sucesso.",
                # Opcional: retornar o ID do plano ou confirmação
                "plan_id": plano_gerado.get('treinamento_id')
            }), 200 # OK
        else:
            # Se gerar_plano retornou None, significa que houve um erro (já logado pelo wrapper)
            app_logger.error(f"Falha na geração do plano para o usuário {user_id} (wrapper retornou None).")
            return jsonify({"error": "Não foi possível gerar o plano de treinamento no momento. Tente novamente mais tarde."}), 500 # Internal Server Error

    except (ConnectionError, RuntimeError) as e:
        # Erros de comunicação com a API Claude ou runtime no wrapper
        app_logger.error(f"Erro de comunicação ou runtime durante a geração do plano para {user_id}: {e}", exc_info=True)
        return jsonify({"error": f"Erro ao comunicar com o serviço de IA: {e}"}), 502 # Bad Gateway
    except Exception as e:
        # Outros erros inesperados
        app_logger.error(f"Erro inesperado no endpoint /api/generate-plan para {user_id}: {e}", exc_info=True)
        return jsonify({"error": "Ocorreu um erro inesperado no servidor."}), 500

# Rota de health check simples
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"}), 200

if __name__ == '__main__':
    # Obtém a porta da variável de ambiente ou usa 5001 como padrão
    port = int(os.environ.get("PORT", 5001))
    # Roda o servidor Flask
    # Use host='0.0.0.0' para tornar acessível na rede local (necessário para testes com Expo Go)
    app_logger.info(f"Iniciando servidor Flask na porta {port}...")
    app.run(host='0.0.0.0', port=port, debug=True) # debug=True para desenvolvimento