# backend/wrappers/treinador_especialista.py
import json
import uuid
import datetime
import traceback
import re
from typing import Dict, Any, Optional, List

# --- Dependências Externas ---
# Instale com: pip install anthropic jsonschema python-dotenv
try:
    import anthropic
    import jsonschema
except ImportError:
    print("ERRO: Dependências não encontradas. Execute: pip install anthropic jsonschema python-dotenv")
    exit(1)

# --- Componentes Internos ---
# Ajuste os caminhos se a estrutura do seu projeto for diferente
try:
    from backend.utils.logger import WrapperLogger
    from backend.utils.config import get_api_key, get_model_name
except ImportError:
     print("ERRO: Não foi possível importar utils. Verifique a estrutura de pastas e os arquivos __init__.py.")
     # Tentativa de import relativo (pode funcionar se executado de forma diferente)
     try:
         from ..utils.logger import WrapperLogger
         from ..utils.config import get_api_key, get_model_name
     except ImportError:
          print("Falha na importação relativa também.")
          exit(1)


class TreinadorEspecialista:
    """
    Wrapper 1: Responsável por gerar planos de treinamento estruturados
    usando a API Claude e dados do usuário.
    """
    # Obtém o nome do modelo da configuração ou usa o padrão
    MODEL_NAME = get_model_name()
    # Máximo de tokens para a resposta da IA (ajuste conforme necessidade e modelo)
    MAX_TOKENS = 4096

    def __init__(self):
        """Inicializa o wrapper do Treinador Especialista."""
        self.logger = WrapperLogger("Wrapper1_Treinador")
        self.logger.info("Inicializando TreinadorEspecialista...")

        self.api_key = get_api_key("ANTHROPIC")
        if not self.api_key:
            self.logger.error("Chave de API da Anthropic não encontrada (ANTHROPIC_API_KEY).")
            raise ValueError("API Key da Anthropic não configurada.")

        try:
            self.anthropic_client = anthropic.Anthropic(api_key=self.api_key)
            self.logger.info(f"Cliente Anthropic inicializado para o modelo: {self.MODEL_NAME}")
        except Exception as e:
            self.logger.error(f"Falha ao inicializar o cliente Anthropic: {e}", exc_info=True)
            raise

        self.prompt_template_base = self._carregar_prompt_template_base()
        self.schema = self._carregar_schema_json()
        self.json_template_for_prompt = self._obter_template_json_str()

        self.logger.info("TreinadorEspecialista inicializado com sucesso.")

    def _carregar_prompt_template_base(self) -> str:
        """Carrega o template base da persona e expertise do treinador."""
        self.logger.debug("Carregando template base do prompt...")
        # Conteúdo do relatório (Seção 7.1)
        template = """
# PROMPT DO TREINADOR ESPECIALISTA

Você é um treinador de elite especializado em musculação e desempenho físico, com décadas de experiência treinando os maiores atletas do fisiculturismo mundial e de diversos outros esportes.
Sua abordagem científica e personalizada levou centenas de clientes a atingirem seu máximo potencial físico.

Sua Expertise

Avaliação e Planejamento
- Utilize o 1RM (Uma Repetição Máxima)(em % de 1RM) como base fundamental para prescrição de cargas
- Desenvolva planos de treinamento com visão de longo prazo, estabelecendo metas trimestrais (ciclos de 12 semanas)
- Analise profundamente o histórico de lesões do usuário para adaptar exercícios e prevenir recidivas
- Considere fatores entregues como input como pilares da lógica de treinamento

Métodos de Treinamento
    Treinamento tradicional (séries e repetições)
    Treinamento de alta intensidade (HIIT)
    Treinamento em circuito
    Treinamento pliométrico
    Treinamento de força máxima
    Treinamento de potência
    Treinamento de hipertrofia
    Treinamento de resistência muscular
    Treinamento isométrico
    Treinamento excêntrico acentuado
    Treinamento até a falha muscular
    Métodos de intensificação (drop-sets, rest-pause, giant sets, supersets)
    Métodos de recuperação ativa

Periodizações
    Periodização linear (clássica)
    Periodização ondulatória diária
    Periodização ondulatória semanal
    Periodização em blocos
    Periodização conjugada (método Westside)
    Periodização por acumulação/intensificação
    Periodização reversa
    Periodização não-linear
    Periodização por indicadores de desempenho
    Microciclos, mesociclos e macrociclos estruturados

Exercícios
    Exercícios compostos multiarticulares (agachamentos, levantamentos terra, supinos, etc.)
    Exercícios de isolamento para grupos musculares específicos
    Exercícios com peso corporal e calistenia avançada
    Exercícios com implementos especializados (kettlebells, clubes, medicine balls)
    Exercícios de estabilização e core
    Exercícios com bandas elásticas e correntes
    Exercícios de mobilidade e amplitude de movimento
    Exercícios pliométricos e balísticos
    Exercícios corretivos e preventivos
    Variações específicas para cada grupo muscular (pelo menos 10 variações para cada)
    Progressões de exercícios para diferentes níveis de habilidade
"""
        return template.strip()

    def _carregar_schema_json(self) -> Dict[str, Any]:
        """Carrega o schema JSON para validação da resposta, com refinamentos."""
        self.logger.debug("Carregando schema JSON...")
        # Schema baseado no relatório (Seção 7.2), com ajustes
        schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "PlanoDeTreinamentoFORCA", # Adicionado título
            "description": "Schema para validar a estrutura do plano de treinamento gerado.",
            "type": "object",
            "properties": {
                "treinamento_id": {"type": "string", "format": "uuid", "description": "Identificador único do plano."},
                "versao": {"type": "string", "description": "Versão do plano."},
                "data_criacao": {"type": "string", "format": "date-time", "description": "Data e hora da criação do plano."},
                "usuario": {
                    "type": "object",
                    "description": "Informações do usuário para quem o plano foi gerado.",
                    "properties": {
                        "id": {"type": "string", "description": "ID único do usuário."},
                        "nome": {"type": ["string", "null"], "description": "Nome do usuário."},
                        "nivel": {"type": "string", "enum": ["iniciante", "intermediário", "avançado"], "description": "Nível de experiência do usuário."},
                        "objetivos": {
                            "type": "array",
                            "description": "Lista de objetivos do usuário.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "objetivo_id": {"type": ["string", "null"], "description": "ID opcional do objetivo."},
                                    "nome": {"type": "string", "description": "Nome do objetivo."},
                                    "prioridade": {"type": ["integer", "null"], "description": "Prioridade do objetivo (ex: 1 = mais importante)."}
                                },
                                "required": ["nome"]
                            }
                        },
                        "restricoes": {
                            "type": "array",
                            "description": "Lista de restrições ou limitações do usuário.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "restricao_id": {"type": ["string", "null"], "description": "ID opcional da restrição."},
                                    "nome": {"type": "string", "description": "Descrição da restrição."},
                                    "gravidade": {"type": "string", "enum": ["leve", "moderada", "severa"], "description": "Gravidade da restrição."}
                                },
                                "required": ["nome", "gravidade"]
                            }
                        }
                    },
                    "required": ["id", "nivel", "objetivos", "restricoes"]
                },
                "plano_principal": {
                    "type": "object",
                    "description": "Detalhes do plano de treinamento principal.",
                    "properties": {
                        "nome": {"type": "string", "description": "Nome do plano de treinamento."},
                        "descricao": {"type": "string", "description": "Descrição geral do plano."},
                        "periodizacao": {
                            "type": "object",
                            "description": "Tipo e descrição da periodização utilizada.",
                            "properties": {
                                "tipo": {"type": "string", "description": "Ex: Linear, Ondulatória Diária, Blocos."},
                                "descricao": {"type": ["string", "null"], "description": "Breve descrição da estratégia de periodização."}
                            },
                            "required": ["tipo"]
                        },
                        "duracao_semanas": {"type": "integer", "minimum": 1, "description": "Duração total do plano em semanas."},
                        "frequencia_semanal": {"type": "integer", "minimum": 1, "description": "Número de sessões de treino por semana."},
                        "ciclos": {
                            "type": "array",
                            "description": "Organização do plano em ciclos (mesociclos).",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "ciclo_id": {"type": ["string", "null"], "description": "ID opcional do ciclo."},
                                    "nome": {"type": "string", "description": "Nome do ciclo (ex: Fase de Adaptação, Fase de Hipertrofia)."},
                                    "ordem": {"type": "integer", "description": "Ordem de execução do ciclo."},
                                    "duracao_semanas": {"type": "integer", "minimum": 1, "description": "Duração do ciclo em semanas."},
                                    "objetivo": {"type": "string", "description": "Objetivo principal do ciclo."},
                                    "microciclos": {
                                        "type": "array",
                                        "description": "Organização do ciclo em microciclos (semanas).",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "semana": {"type": "integer", "minimum": 1, "description": "Número da semana dentro do plano geral."},
                                                "volume": {"type": "string", "enum": ["Baixo", "Médio", "Alto", "Deload"], "description": "Volume de treino planejado para a semana."},
                                                "intensidade": {"type": "string", "enum": ["Leve", "Moderada", "Alta", "Máxima"], "description": "Intensidade de treino planejada para a semana."},
                                                "foco": {"type": ["string", "null"], "description": "Foco específico da semana (ex: Técnica, Força, Hipertrofia)."},
                                                "sessoes": {
                                                    "type": "array",
                                                    "description": "Sessões de treino planejadas para a semana.",
                                                    "items": {
                                                        "type": "object",
                                                        "properties": {
                                                            "sessao_id": {"type": ["string", "null"], "description": "ID opcional da sessão."},
                                                            "nome": {"type": "string", "description": "Nome da sessão (ex: Treino A, Peito/Tríceps)."},
                                                            "tipo": {"type": "string", "description": "Tipo de treino (ex: Força, Hipertrofia, Fullbody, Resistência)."},
                                                            "duracao_minutos": {"type": ["integer", "null"], "minimum": 1, "description": "Duração estimada da sessão em minutos."},
                                                            "nivel_intensidade": {"type": ["integer", "null"], "minimum": 1, "maximum": 10, "description": "Nível de intensidade percebida (PSE) esperado (1-10)."},
                                                            "dia_semana": {"type": ["string", "integer", "null"], "description": "Dia da semana para a sessão (ex: 'segunda', 1)."},
                                                            "grupos_musculares": {
                                                                "type": "array",
                                                                "description": "Grupos musculares trabalhados na sessão.",
                                                                "items": {
                                                                    "type": "object",
                                                                    "properties": {
                                                                        "grupo_id": {"type": ["string", "null"]},
                                                                        "nome": {"type": "string"},
                                                                        "prioridade": {"type": ["integer", "null"]}
                                                                    },
                                                                    "required": ["nome"]
                                                                }
                                                            },
                                                            "exercicios": {
                                                                "type": "array",
                                                                "description": "Lista de exercícios da sessão.",
                                                                "items": {
                                                                    "type": "object",
                                                                    "properties": {
                                                                        "exercicio_id": {"type": ["string", "null"]},
                                                                        "nome": {"type": "string", "description": "Nome do exercício."},
                                                                        "ordem": {"type": "integer", "description": "Ordem de execução na sessão."},
                                                                        "equipamento": {"type": ["string", "null"], "description": "Equipamento necessário."},
                                                                        "series": {"type": "integer", "minimum": 1, "description": "Número de séries."},
                                                                        "repeticoes": {"type": "string", "description": "Faixa ou número de repetições (ex: '8-12', '10', 'AMRAP')."},
                                                                        "percentual_rm": {"type": ["number", "null"], "minimum": 0, "maximum": 100, "description": "Percentual de 1RM (se aplicável)."},
                                                                        "tempo_descanso": {"type": ["integer", "string", "null"], "description": "Tempo de descanso entre séries (ex: 60, '90s')."},
                                                                        "cadencia": {"type": ["string", "null"], "description": "Cadência de execução (ex: '2020', 'Explosiva')."},
                                                                        "metodo": {"type": ["string", "null"], "description": "Método de intensificação (ex: 'Drop-set', 'Rest-pause')."},
                                                                        "progressao": {"type": ["string", "null"], "description": "Instrução geral de progressão para este exercício (simplificado)."},
                                                                        "observacoes": {"type": ["string", "null"], "description": "Observações importantes sobre a execução ou adaptação."}
                                                                    },
                                                                    "required": ["nome", "ordem", "series", "repeticoes"]
                                                                }
                                                            },
                                                            "aquecimento": { # Simplificado
                                                                "type": ["object", "null"],
                                                                "properties": {
                                                                    "duracao_minutos": {"type": ["integer", "null"]},
                                                                    "exercicios": {"type": "array", "items": {"type": "string"}}
                                                                }
                                                            },
                                                            "desaquecimento": { # Simplificado
                                                                "type": ["object", "null"],
                                                                "properties": {
                                                                    "duracao_minutos": {"type": ["integer", "null"]},
                                                                    "exercicios": {"type": "array", "items": {"type": "string"}}
                                                                }
                                                            }
                                                        },
                                                        "required": ["nome", "tipo", "exercicios"]
                                                    }
                                                }
                                            },
                                            "required": ["semana", "sessoes"]
                                        }
                                    }
                                },
                                "required": ["nome", "ordem", "duracao_semanas", "objetivo", "microciclos"]
                            }
                        },
                        "metricas": { # Opcional
                            "type": ["object", "null"],
                            "properties": {
                                "calorias_estimadas": {"type": ["integer", "null"]},
                                "nivel_fadiga_esperado": {"type": ["integer", "null"]},
                                "tempo_recuperacao_horas": {"type": ["integer", "null"]}
                            }
                        }
                    },
                    "required": ["nome", "periodizacao", "duracao_semanas", "frequencia_semanal", "ciclos"]
                }
            },
            "required": ["treinamento_id", "versao", "data_criacao", "usuario", "plano_principal"]
        }
        return schema

    def _obter_template_json_str(self) -> str:
        """Retorna uma string formatada do template JSON para incluir no prompt."""
        # Cria uma versão simplificada do schema com valores de exemplo/nulos
        template = {
            "plano_principal": {
                "nome": "Nome do Plano (ex: Hipertrofia Intermediário)",
                "descricao": "Descrição breve do plano e seus objetivos.",
                "periodizacao": {"tipo": "Tipo (ex: Linear)", "descricao": "Descrição da periodização"},
                "duracao_semanas": 12,
                "frequencia_semanal": "Número de treinos/semana",
                "ciclos": [
                    {
                        "ciclo_id": "Gerado Automaticamente",
                        "nome": "Nome do Ciclo (ex: Fase 1 - Adaptação)",
                        "ordem": 1,
                        "duracao_semanas": 4,
                        "objetivo": "Objetivo do Ciclo",
                        "microciclos": [
                            {
                                "semana": 1,
                                "volume": "Volume (ex: Médio)",
                                "intensidade": "Intensidade (ex: Moderada)",
                                "foco": "Foco da Semana (ex: Técnica)",
                                "sessoes": [
                                    {
                                        "sessao_id": "Gerado Automaticamente",
                                        "nome": "Nome da Sessão (ex: Treino A - Peito/Tríceps)",
                                        "tipo": "Tipo (ex: Hipertrofia)",
                                        "duracao_minutos": 60,
                                        "nivel_intensidade": 7,
                                        "dia_semana": "Dia (ex: 'segunda')",
                                        "grupos_musculares": [{"nome": "Grupo Muscular"}],
                                        "exercicios": [
                                            {
                                                "exercicio_id": "Gerado Automaticamente",
                                                "nome": "Nome do Exercício",
                                                "ordem": 1,
                                                "equipamento": "Equipamento",
                                                "series": 3,
                                                "repeticoes": "'8-12'", # Aspas para indicar string
                                                "percentual_rm": 75, # Número ou null
                                                "tempo_descanso": "'60s'", # Aspas para indicar string ou número
                                                "cadencia": "'2020'", # Aspas para indicar string ou null
                                                "metodo": "null", # Ou nome do método
                                                "progressao": "null", # Simplificado para string ou null
                                                "observacoes": "Observações relevantes"
                                            }
                                        ],
                                        "aquecimento": {"duracao_minutos": 5, "exercicios": ["Exemplo Aquecimento"]},
                                        "desaquecimento": {"duracao_minutos": 5, "exercicios": ["Exemplo Desaquecimento"]}
                                    }
                                ]
                            }
                        ]
                    }
                ],
                "metricas": {"calorias_estimadas": null, "nivel_fadiga_esperado": null, "tempo_recuperacao_horas": null}
            }
            # Campos de metadados e usuário são omitidos aqui, pois são preenchidos depois ou vêm do input
        }
        return json.dumps(template, indent=2)

    def _preparar_prompt(self, dados_usuario: Dict[str, Any]) -> str:
        """Prepara o prompt completo para a API Claude."""
        self.logger.info("Preparando prompt para a API Claude...")

        # Extração segura de dados do usuário
        nome = dados_usuario.get("nome", "Não informado")
        idade = dados_usuario.get("idade", "Não informado")
        peso = dados_usuario.get("peso", "Não informado")
        altura = dados_usuario.get("altura", "Não informado")
        genero = dados_usuario.get("genero", "Não informado")
        nivel = dados_usuario.get("nivel", "iniciante")
        historico_treino = dados_usuario.get("historico_treino", "Não informado")
        tempo_treino = dados_usuario.get("tempo_treino", 60)
        disponibilidade_semanal = dados_usuario.get("disponibilidade_semanal", 3)
        dias_disponiveis = dados_usuario.get("dias_disponiveis", [])
        cardio = dados_usuario.get("cardio", "não")
        alongamento = dados_usuario.get("alongamento", "não")
        conversa_chat = dados_usuario.get("conversa_chat", "Nenhuma conversa registrada.")
        objetivos = dados_usuario.get("objetivos", [])
        restricoes = dados_usuario.get("restricoes", [])
        lesoes = dados_usuario.get("lesoes", []) # Assumindo que lesões também podem vir

        # Formatações
        objetivos_str = "\n".join([f"- {obj.get('nome', 'N/A')} (Prioridade: {obj.get('prioridade', 'N/A')})" for obj in objetivos]) if objetivos else "Nenhum objetivo específico."
        restricoes_str = "\n".join([f"- {rest.get('nome', 'N/A')}, Gravidade: {rest.get('gravidade', 'N/A')}" for rest in restricoes]) if restricoes else "Nenhuma restrição específica."
        lesoes_str = "\n".join([f"- {lesao.get('regiao', 'N/A')}, Gravidade: {lesao.get('gravidade', 'N/A')}, Obs: {lesao.get('observacoes', 'N/A')}" for lesao in lesoes]) if lesoes else "Nenhuma lesão reportada."
        dias_str = ", ".join(dias_disponiveis) if dias_disponiveis else "Não especificado"

        contexto = f"""
Dados do Usuário:
Nome: {nome}
Idade: {idade}
Peso: {peso} kg
Altura: {altura} cm
Gênero: {genero}
Nível de Experiência: {nivel}
Histórico de Treino: {historico_treino}
Tempo disponível por sessão: {tempo_treino} minutos
Disponibilidade semanal: {disponibilidade_semanal} dias
Dias preferenciais para treino: {dias_str}
Incluir cardio: {cardio}
Incluir alongamento: {alongamento}

Objetivos Principais:
{objetivos_str}

Restrições e Limitações:
{restricoes_str}

Histórico de Lesões:
{lesoes_str}

Ajustes e Preferências Adicionais (do chat):
{conversa_chat}

INSTRUÇÕES ESPECÍFICAS PARA GERAÇÃO DO PLANO:
1. Crie um plano de treinamento detalhado para EXATAMENTE 12 semanas.
2. Distribua as sessões de treino nos dias disponíveis ({dias_str}), respeitando a frequência semanal de {disponibilidade_semanal} dias. Se os dias não forem especificados, distribua uniformemente (ex: Seg/Qua/Sex para 3 dias).
3. Detalhe cada sessão com exercícios, séries, repetições (use formato string como "8-12" ou "10"), % de 1RM (use número ou null), tempo de descanso (em segundos ou string como "60s").
4. Considere o nível ({nivel}) e as restrições/lesões ao selecionar exercícios e métodos. Adapte se necessário (ex: substituir agachamento livre por leg press se houver restrição no joelho). Forneça alternativas seguras.
5. Inclua cardio ({cardio}) e alongamento ({alongamento}) conforme solicitado, integrando-os às sessões ou como sessões separadas.
6. O plano deve ser estruturado em ciclos e microciclos (semanas). Defina um objetivo claro para cada ciclo.
7. A progressão principal deve ser baseada no aumento da %RM ou volume ao longo das semanas. NÃO detalhe a progressão semana a semana no campo 'progressao' do JSON inicialmente. Use o campo 'observacoes' para notas gerais sobre progressão ou adaptações.
8. Retorne SOMENTE a estrutura JSON válida e completa, preenchendo todos os campos aplicáveis conforme o template abaixo. Não inclua nenhuma explicação, introdução, ou texto fora do JSON. Certifique-se que a saída seja um único objeto JSON válido.

TEMPLATE JSON ESPERADO (Preencha os valores, não retorne este template literalmente):
```json
{self.json_template_for_prompt}