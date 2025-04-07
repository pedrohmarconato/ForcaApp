# backend/wrappers/treinador_especialista.py
import json
import uuid
import datetime
import traceback
import re
from typing import Dict, Any, Optional, List

# --- Dependências Externas ---
try:
    import anthropic
    import jsonschema
except ImportError:
    print("ERRO: Dependências não encontradas. Execute: pip install anthropic jsonschema python-dotenv")
    exit(1)

# --- Componentes Internos ---
try:
    from backend.utils.logger import WrapperLogger
    from backend.utils.config import get_api_key, get_model_name
except ImportError:
    print("ERRO: Não foi possível importar utils. Verifique a estrutura de pastas e os arquivos __init__.py.")
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
    MODEL_NAME = get_model_name()
    MAX_TOKENS = 4096
    PLANO_VERSAO = "1.0" # Versão do schema/plano

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
        # Conteúdo do relatório (Seção 7.1) - Mantido como no original
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
        # Schema baseado no relatório (Seção 7.2) - Mantido como no original
        schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "PlanoDeTreinamentoFORCA",
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
                                                            "aquecimento": {
                                                                "type": ["object", "null"],
                                                                "properties": {
                                                                    "duracao_minutos": {"type": ["integer", "null"]},
                                                                    "exercicios": {"type": "array", "items": {"type": "string"}}
                                                                }
                                                            },
                                                            "desaquecimento": {
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
                        "metricas": {
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
        # Cria uma versão simplificada do schema com valores de exemplo/nulos - Mantido como no original
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
                "metricas": {"calorias_estimadas": None, "nivel_fadiga_esperado": None, "tempo_recuperacao_horas": None}
            }
            # Campos de metadados e usuário são omitidos aqui, pois são preenchidos depois ou vêm do input
        }
        return json.dumps(template, indent=2)

    def _preparar_prompt(self, dados_usuario: Dict[str, Any]) -> str:
        """Prepara o prompt completo para a API Claude."""
        self.logger.info("Preparando prompt para a API Claude...")

        # Extração segura de dados do usuário - Mantido como no original
        # Nota: A chave 'conversa_chat' agora virá dos 'adjustments' do frontend
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
        conversa_chat = dados_usuario.get("conversa_chat", "Nenhuma conversa registrada.") # Receberá os ajustes
        objetivos = dados_usuario.get("objetivos", [])
        restricoes = dados_usuario.get("restricoes", [])
        lesoes = dados_usuario.get("lesoes", [])

        # Formatações - Mantido como no original
        objetivos_str = "\n".join([f"- {obj.get('nome', 'N/A')} (Prioridade: {obj.get('prioridade', 'N/A')})" for obj in objetivos]) if objetivos else "Nenhum objetivo específico."
        restricoes_str = "\n".join([f"- {rest.get('nome', 'N/A')}, Gravidade: {rest.get('gravidade', 'N/A')}" for rest in restricoes]) if restricoes else "Nenhuma restrição específica."
        lesoes_str = "\n".join([f"- {lesao.get('regiao', 'N/A')}, Gravidade: {lesao.get('gravidade', 'N/A')}, Obs: {lesao.get('observacoes', 'N/A')}" for lesao in lesoes]) if lesoes else "Nenhuma lesão reportada."
        dias_str = ", ".join(map(str, dias_disponiveis)) if dias_disponiveis else "Não especificado" # Garante que dias sejam strings

        # Construção do prompt final - Mantido como no original
        prompt_completo = f"""
{self.prompt_template_base}

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
```""" # Fim do prompt_completo

        self.logger.debug(f"Prompt preparado:\n{prompt_completo[:500]}...") # Loga início do prompt
        return prompt_completo.strip()

    def _extrair_json_da_resposta(self, texto_resposta: str) -> Optional[Dict[str, Any]]:
        """Tenta extrair um objeto JSON de uma string que pode conter texto adicional."""
        self.logger.debug("Tentando extrair JSON da resposta da API...")
        # Procura por ```json ... ``` ou apenas { ... }
        match = re.search(r"```json\s*(\{.*?\})\s*```|(\{.*?\})", texto_resposta, re.DOTALL)
        if match:
            json_str = match.group(1) or match.group(2)
            try:
                parsed_json = json.loads(json_str)
                self.logger.debug("JSON extraído e parseado com sucesso.")
                return parsed_json
            except json.JSONDecodeError as e:
                self.logger.error(f"Falha ao decodificar JSON extraído: {e}\nJSON String: {json_str[:500]}...")
                return None
        else:
            self.logger.warning("Nenhum bloco JSON encontrado na resposta da API.")
            return None

    def _validar_plano_com_schema(self, plano_json: Dict[str, Any]) -> bool:
        """Valida o JSON do plano contra o schema definido."""
        self.logger.debug("Validando JSON do plano contra o schema...")
        try:
            jsonschema.validate(instance=plano_json, schema=self.schema)
            self.logger.info("Validação do JSON do plano bem-sucedida.")
            return True
        except jsonschema.exceptions.ValidationError as e:
            self.logger.error(f"Erro de validação do JSON: {e.message} em {list(e.path)}")
            # Log mais detalhado do erro
            self.logger.debug(f"Detalhes da validação:\nSchema: {e.schema}\nInstância no erro: {e.instance}")
            return False
        except Exception as e:
            self.logger.error(f"Erro inesperado durante a validação do JSON: {e}", exc_info=True)
            return False

    def _chamar_api_claude(self, prompt: str) -> Optional[str]:
        """
        Encapsula a chamada à API Anthropic Claude.
        Retorna o texto da resposta da IA ou None em caso de erro.
        """
        self.logger.info(f"Enviando prompt para o modelo {self.MODEL_NAME}...")
        try:
            response = self.anthropic_client.messages.create(
                model=self.MODEL_NAME,
                max_tokens=self.MAX_TOKENS,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            # Verifica se a resposta tem o conteúdo esperado
            if response.content and isinstance(response.content, list) and len(response.content) > 0:
                # Assume que a resposta principal está no primeiro bloco de conteúdo
                resposta_texto = response.content[0].text
                self.logger.info("Resposta recebida da API Claude.")
                self.logger.debug(f"Resposta bruta (início): {resposta_texto[:500]}...")
                return resposta_texto
            else:
                self.logger.error(f"Resposta inesperada da API Claude: {response}")
                return None

        except anthropic.APIConnectionError as e:
            self.logger.error(f"Erro de conexão com a API Anthropic: {e}", exc_info=True)
            raise ConnectionError(f"Falha ao conectar à API Anthropic: {e}") from e
        except anthropic.RateLimitError as e:
            self.logger.error(f"Erro de limite de taxa da API Anthropic: {e}", exc_info=True)
            raise ConnectionError(f"Limite de taxa da API Anthropic excedido: {e}") from e
        except anthropic.APIStatusError as e:
            self.logger.error(f"Erro de status da API Anthropic: status={e.status_code}, response={e.response}", exc_info=True)
            raise ConnectionError(f"Erro na API Anthropic (Status {e.status_code}): {e}") from e
        except Exception as e:
            self.logger.error(f"Erro inesperado ao chamar a API Claude: {e}", exc_info=True)
            raise RuntimeError(f"Erro inesperado durante a chamada da API: {e}") from e

    def gerar_plano(self, dados_usuario: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Orquestra a geração do plano de treinamento.
        1. Prepara o prompt.
        2. Chama a API Claude.
        3. Extrai e valida o JSON da resposta.
        4. Adiciona metadados.
        5. Retorna o plano validado ou None em caso de falha.
        """
        self.logger.info(f"Iniciando geração de plano para usuário ID: {dados_usuario.get('id', 'N/A')}")

        # 1. Preparar Prompt
        try:
            prompt = self._preparar_prompt(dados_usuario)
        except Exception as e:
            self.logger.error(f"Erro ao preparar o prompt: {e}", exc_info=True)
            return None

        # 2. Chamar API Claude
        try:
            resposta_texto = self._chamar_api_claude(prompt)
            if not resposta_texto:
                self.logger.error("Não foi possível obter uma resposta válida da API Claude.")
                return None
        except (ConnectionError, RuntimeError) as e:
            # Erros já logados em _chamar_api_claude
            self.logger.error(f"Falha na comunicação com a API: {e}")
            return None # Retorna None para indicar falha na geração
        except Exception as e:
            self.logger.error(f"Erro inesperado durante a chamada da API: {e}", exc_info=True)
            return None

        # 3. Extrair JSON da Resposta
        plano_bruto = self._extrair_json_da_resposta(resposta_texto)
        if not plano_bruto:
            self.logger.error("Falha ao extrair JSON da resposta da API.")
            # Tentar logar a resposta completa se a extração falhar
            self.logger.debug(f"Resposta completa da API que falhou na extração:\n{resposta_texto}")
            return None

        # 4. Adicionar Metadados e Informações do Usuário (conforme schema)
        try:
            plano_final = {
                "treinamento_id": str(uuid.uuid4()),
                "versao": self.PLANO_VERSAO,
                "data_criacao": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "usuario": {
                    "id": str(dados_usuario.get("id", "N/A")), # Garante que ID seja string
                    "nome": dados_usuario.get("nome"),
                    "nivel": dados_usuario.get("nivel", "iniciante"),
                    "objetivos": dados_usuario.get("objetivos", []),
                    "restricoes": dados_usuario.get("restricoes", [])
                    # Adicione outros campos do usuário se necessário no schema
                },
                "plano_principal": plano_bruto.get("plano_principal") # Pega a parte gerada pela IA
            }
            # Verifica se plano_principal existe no JSON bruto
            if not plano_final["plano_principal"]:
                 self.logger.error("A chave 'plano_principal' não foi encontrada no JSON retornado pela IA.")
                 self.logger.debug(f"JSON bruto recebido: {plano_bruto}")
                 return None

        except Exception as e:
            self.logger.error(f"Erro ao adicionar metadados ao plano: {e}", exc_info=True)
            return None

        # 5. Validar JSON Final com Schema
        if self._validar_plano_com_schema(plano_final):
            self.logger.info(f"Plano de treinamento gerado e validado com sucesso (ID: {plano_final['treinamento_id']}).")
            return plano_final
        else:
            self.logger.error("Falha na validação do schema do plano final.")
            self.logger.debug(f"Plano final que falhou na validação: {json.dumps(plano_final, indent=2)}")
            # Considerar salvar o plano inválido para análise, se necessário
            # salvar_plano_invalido(plano_final)
            return None

# Exemplo de uso (para teste local, se necessário)
if __name__ == '__main__':
    # CUIDADO: Isso requer um arquivo .env na raiz do projeto com ANTHROPIC_API_KEY
    print("Executando teste local do TreinadorEspecialista...")

    # Dados de exemplo (simulando o que viria do backend/API)
    dados_teste_usuario = {
        "id": "usuario_teste_123",
        "nome": "Usuário Teste",
        "idade": 30,
        "peso": 80,
        "altura": 175,
        "genero": "masculino",
        "nivel": "intermediário",
        "historico_treino": "Treina há 2 anos, focado em hipertrofia.",
        "tempo_treino": 75,
        "disponibilidade_semanal": 4,
        "dias_disponiveis": ["segunda", "terça", "quinta", "sexta"],
        "cardio": "sim",
        "alongamento": "sim",
        "objetivos": [
            {"nome": "Hipertrofia Muscular", "prioridade": 1},
            {"nome": "Melhorar força no supino", "prioridade": 2}
        ],
        "restricoes": [
            {"nome": "Dor leve no ombro direito ao elevar muito peso acima da cabeça", "gravidade": "leve"}
        ],
        "lesoes": [], # Sem lesões ativas
        "conversa_chat": "- Gostaria de focar mais em peito e costas.\n- Evitar exercícios que sobrecarreguem o ombro direito."
    }

    try:
        treinador = TreinadorEspecialista()
        plano_gerado = treinador.gerar_plano(dados_teste_usuario)

        if plano_gerado:
            print("\n--- Plano Gerado com Sucesso ---")
            # Imprime apenas algumas chaves principais para não poluir o console
            print(f"ID: {plano_gerado.get('treinamento_id')}")
            print(f"Versão: {plano_gerado.get('versao')}")
            print(f"Data Criação: {plano_gerado.get('data_criacao')}")
            print(f"Usuário ID: {plano_gerado.get('usuario', {}).get('id')}")
            print(f"Nome do Plano: {plano_gerado.get('plano_principal', {}).get('nome')}")
            print(f"Periodização: {plano_gerado.get('plano_principal', {}).get('periodizacao', {}).get('tipo')}")
            print(f"Número de Ciclos: {len(plano_gerado.get('plano_principal', {}).get('ciclos', []))}")

            # Opcional: Salvar o JSON em um arquivo para análise
            # with open("plano_exemplo.json", "w", encoding="utf-8") as f:
            #     json.dump(plano_gerado, f, indent=2, ensure_ascii=False)
            # print("\nPlano salvo em plano_exemplo.json")

        else:
            print("\n--- Falha ao gerar o plano ---")
            print("Verifique os logs para mais detalhes.")

    except ValueError as e:
        print(f"Erro de configuração: {e}")
    except Exception as e:
        print(f"Erro inesperado durante o teste: {e}")
        traceback.print_exc()