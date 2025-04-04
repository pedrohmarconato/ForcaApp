# backend/wrappers/distribuidor_treinos.py
import json
import copy
import uuid
import datetime
import jsonschema
import os
import traceback
import time
# Adicionado Callable para type hint em TabelaMapping.condition
from typing import Dict, Any, List, Tuple, Optional, Union, Callable
from dataclasses import dataclass, field

# Importar o WrapperLogger e utils
from ..utils.logger import WrapperLogger
from ..utils.path_resolver import (
    get_schema_path,
    load_file_with_fallback # Assuming this utility exists as per report
)
from ..utils.config import get_supabase_config, get_db_config
# Importar o SupabaseWrapper (confirm path based on your project structure)
from ..wrappers.supabase_client import SupabaseWrapper # Corrected import path assumption

@dataclass
class TabelaMapping:
    """
    Define o mapeamento entre um campo no JSON de entrada e uma coluna na tabela do BD.
    Inclui a tabela de destino e uma lista de mapeamentos de campos.
    """
    tabela: str
    campos: List[Dict[str, Any]] = field(default_factory=list)
    list_path: Optional[str] = None
    # Adicionando condição opcional
    condition: Optional[Callable[[Dict[str, Any]], bool]] = None


class DistribuidorBD:
    # __init__ permanece o mesmo, garantindo carregamento de schema e mapeamento
    def __init__(self, config_db: Optional[Dict[str, Any]] = None, modo_simulacao: bool = False, check_tables: bool = False):
        """
        Inicializa o Distribuidor de Treinos para o BD.
        (Código omitido para brevidade - igual à versão anterior no Search Result 1,
         mas com tratamento de erro robusto na carga de schema/mapeamento)
        """
        # Configurar logger
        self.logger = WrapperLogger("Wrapper3_Distribuidor")
        self.logger.info("Inicializando Distribuidor BD")

        self.modo_simulacao = modo_simulacao
        self.config_db = config_db or get_db_config() # Use get_db_config for Supabase details

        if not self.config_db:
            self.logger.warning("Configuração de BD não fornecida ou inválida, usando configuração padrão ou variáveis de ambiente.")
        else:
            self.logger.debug("Usando configuração de BD fornecida explicitamente")

        # --- Carregamento do Schema Específico do Wrapper 2 ---
        schema_filename = "wrapper2_output_schema.json"
        try:
            self.schema = self._carregar_schema_json(schema_filename)
            self.logger.info(f"Schema JSON '{schema_filename}' carregado com sucesso.")
        except Exception as e:
            self.logger.error(f"Falha CRÍTICA ao carregar o schema JSON '{schema_filename}': {str(e)}")
            self.logger.error(traceback.format_exc())
            raise ValueError(f"Não foi possível carregar o schema JSON necessário '{schema_filename}'. Wrapper 3 não pode operar.") from e

        # --- Criação do Mapeamento de Tabelas ---
        try:
            self.mapeamento_tabelas = self._criar_mapeamento_tabelas()
            self.logger.info("Mapeamento de tabelas criado com sucesso.")
            self.logger.debug(f"Entidades mapeadas: {list(self.mapeamento_tabelas.keys())}")
        except Exception as e:
            self.logger.error(f"Falha CRÍTICA ao criar o mapeamento de tabelas: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise ValueError("Não foi possível criar o mapeamento de tabelas necessário. Wrapper 3 não pode operar.") from e

        # Inicializar estado da conexão
        self.conexao_db = None
        self.supabase_client = None

        if not self.modo_simulacao:
            try:
                self._inicializar_conexao()
            except Exception as e:
                self.logger.warning(f"Não foi possível estabelecer conexão inicial com o banco: {str(e)}")
                self.logger.warning("Operando em modo de contingência (conexão será tentada novamente quando necessário)")

        # Métricas de operação
        self.metricas = {
            "operacoes_totais": 0,
            "operacoes_sucesso": 0,
            "operacoes_falha": 0,
            "ultima_operacao": None,
            "tempo_total_operacoes": 0.0
        }

        # Níveis de humor e tempo
        self.niveis_humor = ["muito_cansado", "cansado", "neutro", "disposto", "muito_disposto"]
        self.tempos_disponiveis = ["muito_curto", "curto", "padrao", "longo", "muito_longo"]

        self.logger.info("Distribuidor BD inicializado com sucesso.")

    # _carregar_schema_json permanece o mesmo
    def _carregar_schema_json(self, schema_filename: str) -> Dict[str, Any]:
        """
        Carrega o JSON schema do arquivo especificado usando utilitários de path.
        (Código omitido para brevidade - igual à versão anterior no Search Result 1)
        """
        if not schema_filename:
             self.logger.error("Nome do arquivo de schema não pode ser vazio.")
             raise ValueError("Nome do arquivo de schema inválido.")

        self.logger.info(f"Tentando carregar schema JSON: '{schema_filename}'")
        try:
            schema_path = get_schema_path(schema_filename)
            self.logger.debug(f"Caminho resolvido para o schema: {schema_path}")

            if not os.path.exists(schema_path):
                self.logger.error(f"Arquivo de schema não encontrado em: {schema_path}")
                raise FileNotFoundError(f"Arquivo de schema '{schema_filename}' não encontrado no caminho esperado.")

            with open(schema_path, 'r', encoding='utf-8') as f:
                schema_data = json.load(f)

            self.logger.info(f"Schema JSON '{schema_filename}' carregado e parseado com sucesso.")
            return schema_data

        except FileNotFoundError as e:
            self.logger.error(f"Erro ao carregar schema: {e}")
            raise
        except json.JSONDecodeError as e:
            self.logger.error(f"Erro ao fazer parse do JSON do schema '{schema_filename}': {e}")
            raise
        except Exception as e:
            self.logger.error(f"Erro inesperado ao carregar/processar o schema '{schema_filename}': {str(e)}")
            self.logger.error(traceback.format_exc())
            raise

    # _criar_mapeamento_tabelas - ESTRUTURA MANTIDA - PRECISA SER PREENCHIDA PELO USUÁRIO
    def _criar_mapeamento_tabelas(self) -> Dict[str, TabelaMapping]:
        """
        Cria o mapeamento detalhado JSON -> Supabase.
        !! ESTA FUNÇÃO PRECISA SER COMPLETADA PELO USUÁRIO !!
        Preencha os 'campos' com 'json_path' e 'tabela_campo' corretos.
        Configure 'list_path', 'source', 'context_key', 'transform', 'generator' conforme necessário.
        """
        self.logger.info("Criando mapeamento de dados JSON -> Supabase")

        # --- Mapeamento para Fato_Treinamento ---
        mapeamento_treinamento = TabelaMapping(
            tabela="Fato_Treinamento",
            campos=[
                # !! Exemplo - COMPLETE COM SEUS CAMPOS !!
                {"json_path": "dados.plano_principal.nome", "tabela_campo": "nome"},
                {"json_path": "dados.plano_principal.descricao", "tabela_campo": "descricao"},
                {"json_path": "dados.plano_principal.objetivo", "tabela_campo": "objetivo"},
                {"json_path": "dados.plano_principal.nivel_experiencia", "tabela_campo": "nivel_experiencia"},
                {"json_path": "dados.plano_principal.duracao_semanas", "tabela_campo": "duracao_semanas"},
                {"json_path": "dados.plano_principal.frequencia_semanal", "tabela_campo": "frequencia_semanal"},
                # Gerar ID se não vier do JSON (exemplo) - Certifique-se que a coluna 'id' existe
                {"tabela_campo": "id", "generator": "uuid"},
                # Mapear ID do usuário (exemplo) - Certifique-se que 'usuario_id' existe no JSON e na tabela
                # {"json_path": "metadados.usuario_id", "tabela_campo": "usuario_id"},
            ]
        )
        # --- Mapeamento para Fato_AdaptacaoTreinamento ---
        mapeamento_adaptacoes = TabelaMapping(
            tabela="Fato_AdaptacaoTreinamento",
            list_path="dados.adaptacoes_matrix", # Caminho para a lista de adaptações no JSON
            campos=[
                # !! Exemplo - COMPLETE COM SEUS CAMPOS !!
                {"json_path": "sessao_original_id", "tabela_campo": "sessao_original_id"},
                {"json_path": "nivel_humor", "tabela_campo": "nivel_humor"},
                {"json_path": "tempo_disponivel", "tabela_campo": "tempo_disponivel"},
                {"json_path": "adaptacao_aplicada", "tabela_campo": "adaptacao_aplicada"},
                {"json_path": "justificativa", "tabela_campo": "justificativa_adaptacao"},
                # Chave estrangeira vinda do contexto (ID do treino principal)
                {"tabela_campo": "treinamento_id", "source": "context", "context_key": "treinamento_id_principal"},
                # Sessão adaptada como JSONB (certifique-se que a coluna aceita JSONB/TEXT)
                {"json_path": "sessao_adaptada", "tabela_campo": "sessao_adaptada_detalhes", "transform": "to_jsonb"},
            ]
        )
        # --- Mapeamento para Fato_SessaoTreinamento ---
        mapeamento_sessoes = TabelaMapping(
            tabela="Fato_SessaoTreinamento",
            # !! Ajuste o list_path conforme a estrutura do seu JSON !!
            # Exemplo: Se as sessões estão numa lista dentro do plano principal
            list_path="dados.plano_principal.sessoes",
            campos=[
                # !! Exemplo - COMPLETE COM SEUS CAMPOS !!
                {"json_path": "id", "tabela_campo": "sessao_id_original"}, # ID da sessão vindo do JSON
                {"json_path": "nome", "tabela_campo": "nome_sessao"},
                {"json_path": "dia_semana", "tabela_campo": "dia_da_semana"},
                # Chave estrangeira vinda do contexto
                {"tabela_campo": "treinamento_id", "source": "context", "context_key": "treinamento_id_principal"},
                # Gerar ID para a própria sessão (se necessário)
                {"tabela_campo": "id", "generator": "uuid"},
                # {"tabela_campo": "microciclo_id", "source": "context", "context_key": "microciclo_id_atual"}, # Se aplicável
            ]
        )
        # --- Mapeamento para Fato_ExercicioSessao ---
        mapeamento_exercicios = TabelaMapping(
            tabela="Fato_ExercicioSessao",
             # !! Ajuste o list_path conforme a estrutura do seu JSON !!
             # Exemplo: Iterar sobre exercícios DENTRO de cada sessão da lista mapeada acima.
             # Isso requer que _extrair_dados_por_mapeamento consiga lidar com paths relativos complexos
             # ou que a estrutura do JSON seja mais plana.
             # Alternativa mais simples: O Wrapper 2 pode fornecer uma lista única de todos os exercícios
             # com referência ao ID da sessão. Ex: list_path="dados.todos_exercicios"
             list_path="dados.plano_principal.sessoes[*].exercicios", # Este path complexo é tratado em _get_value_by_path
             campos=[
                # !! Exemplo - COMPLETE COM SEUS CAMPOS !!
                 {"json_path": "nome", "tabela_campo": "nome_exercicio"},
                 {"json_path": "series", "tabela_campo": "series"},
                 {"json_path": "repeticoes", "tabela_campo": "repeticoes"},
                 {"json_path": "carga", "tabela_campo": "carga_prevista"},
                 {"json_path": "descanso_segundos", "tabela_campo": "descanso_segundos"},
                 # Chave estrangeira da sessão vinda do contexto
                 # ATENÇÃO: O contexto precisa ser atualizado corretamente em _gerar_comandos_db
                 # para refletir a sessão atual sendo processada.
                 {"tabela_campo": "sessao_id", "source": "context", "context_key": "sessao_id_atual"},
                 # Gerar ID para o registro do exercício na sessão
                 {"tabela_campo": "id", "generator": "uuid"},
                 # {"tabela_campo": "exercicio_dim_id", "lookup": "Dim_Exercicio", ...} # Exemplo lookup (requer lógica adicional)
            ]
        )

        # Adicionar mapeamentos para Fato_CicloTreinamento, Fato_MicrocicloSemanal aqui...

        mapeamento_completo = {
            "treinamento_principal": mapeamento_treinamento,
            "adaptacoes": mapeamento_adaptacoes,
            "sessoes_originais": mapeamento_sessoes,
            "exercicios_originais": mapeamento_exercicios,
            # "ciclos": mapeamento_ciclos,
            # "microciclos": mapeamento_microciclos,
        }
        self.logger.info(f"Mapeamento de dados definido para: {list(mapeamento_completo.keys())}")
        return mapeamento_completo

    # _inicializar_conexao e desconectar_bd permanecem os mesmos
    def _inicializar_conexao(self) -> None:
        """Inicializa a conexão com o Supabase."""
        # (Código omitido para brevidade - igual à versão anterior no Search Result 1)
        self.logger.info("Tentando inicializar conexão com Supabase...")
        supabase_config = self.config_db or get_supabase_config()
        if not supabase_config or not supabase_config.get('url') or not supabase_config.get('api_key'):
            self.logger.error("Configuração Supabase incompleta. Não é possível conectar.")
            self.conexao_db = {"status": "config_error", "timestamp": datetime.datetime.now().isoformat()}
            return
        try:
            self.supabase_client = SupabaseWrapper(
                url=supabase_config['url'],
                api_key=supabase_config['api_key']
            )
            self.conexao_db = {
                "status": "connected", "tipo": "supabase",
                "url": supabase_config['url'],
                "timestamp": datetime.datetime.now().isoformat()
            }
            self.logger.info("Conexão com Supabase estabelecida.")
        except Exception as e:
            self.logger.error(f"Erro ao inicializar ou conectar ao Supabase: {str(e)}")
            self.logger.error(traceback.format_exc())
            self.conexao_db = {"status": "connection_error", "error": str(e), "timestamp": datetime.datetime.now().isoformat()}

    def desconectar_bd(self) -> None:
        """Encerra a conexão com o banco de dados (se aplicável)."""
        # (Código omitido para brevidade - igual à versão anterior no Search Result 1)
        if self.supabase_client:
            self.logger.info("Encerrando referência ao cliente Supabase.")
            self.supabase_client = None
            self.conexao_db = {"status": "disconnected", "timestamp": datetime.datetime.now().isoformat()}
        else:
            self.logger.info("Nenhuma conexão ativa com Supabase para encerrar.")


    # processar_plano - Ajustado para tentar extrair ID principal do resultado
    def processar_plano(self, plano_adaptado: Dict[str, Any]) -> Dict[str, Any]:
        """ Ponto de entrada principal para processar e persistir um plano adaptado. """
        start_time = time.time()
        self.logger.info("Iniciando processamento do plano adaptado para BD.")
        self.metricas["operacoes_totais"] += 1
        resultado = {
            "status": "error", "mensagem": "Processamento não iniciado",
            "treinamento_id_principal": None, "comandos_gerados": [],
            "comandos_executados": 0, "erros": []
        }
        try:
            erros_validacao = self._validar_plano(plano_adaptado)
            if erros_validacao:
                 resultado["mensagem"] = "Falha na validação do schema do plano."
                 resultado["erros"] = erros_validacao
                 self.logger.error(f"Validação do schema falhou: {erros_validacao}")
                 self.metricas["operacoes_falha"] += 1
                 return resultado

            # Geração de comandos agora usa a lógica implementada de extração
            comandos = self._gerar_comandos_db(plano_adaptado)
            # Log simplificado dos comandos gerados para evitar verbosidade excessiva
            resultado["comandos_gerados"] = [
                f"{c.get('operacao')} {c.get('tabela')} ({c.get('mapeamento_origem')})" for c in comandos
            ]
            self.logger.info(f"Gerados {len(comandos)} comandos para o BD.")

            if not comandos:
                 resultado["status"] = "success"; resultado["mensagem"] = "Nenhum comando de BD gerado."
                 self.logger.warning("Nenhum comando de BD foi gerado.")
                 # Considerar se isso deve contar como sucesso nas métricas
                 # self.metricas["operacoes_sucesso"] += 1
                 return resultado

            resultado_execucao = self._executar_comandos_db(comandos)
            resultado.update(resultado_execucao) # Atualiza status, contagens, etc.

            # Tenta extrair o ID principal do resultado da execução (se o insert retornou dados)
            # Isso depende do SupabaseWrapper retornar os dados inseridos e da ordem dos comandos.
            if resultado_execucao.get("dados_retornados"):
                 try:
                     # Procura pelo resultado do comando originado pelo mapeamento 'treinamento_principal'
                     for res_cmd in resultado_execucao["dados_retornados"]:
                         if res_cmd.get("comando_origem") == "treinamento_principal":
                              # Assumindo que o Supabase retorna uma lista e pegamos o primeiro item
                              inserted_data_list = res_cmd.get("resultado", [])
                              if inserted_data_list and isinstance(inserted_data_list, list):
                                   inserted_data = inserted_data_list[0]
                                   # Tenta obter o ID (assumindo que a PK se chama 'id')
                                   pk_field_name = "id" # Ajuste se o nome da sua PK for diferente
                                   id_principal = inserted_data.get(pk_field_name)
                                   if id_principal:
                                       resultado["treinamento_id_principal"] = id_principal
                                       self.logger.info(f"ID do Treinamento Principal extraído: {id_principal}")
                                       break # Para após encontrar o primeiro
                 except (IndexError, KeyError, TypeError, AttributeError) as e:
                      self.logger.warning(f"Não foi possível extrair o ID do treinamento principal dos resultados da execução: {e}")

            # Atualiza métricas com base no status final da execução
            if resultado["status"] in ["success", "simulated", "partial_success"]:
                # Conta sucesso mesmo se parcial, pois algo foi feito. Ajuste se necessário.
                self.metricas["operacoes_sucesso"] += 1
            elif resultado["status"] != "noop": # Não conta falha se foi noop
                self.metricas["operacoes_falha"] += 1

        except Exception as e:
            self.logger.error(f"Erro inesperado durante o processamento do plano: {str(e)}")
            self.logger.error(traceback.format_exc())
            resultado["status"] = "error"; resultado["mensagem"] = f"Erro interno inesperado: {str(e)}"
            resultado["erros"].append(traceback.format_exc())
            self.metricas["operacoes_falha"] += 1
        finally:
            end_time = time.time()
            duration = end_time - start_time
            self.metricas["tempo_total_operacoes"] += duration
            self.metricas["ultima_operacao"] = datetime.datetime.now().isoformat()
            self.logger.info(f"Processamento do plano finalizado em {duration:.4f} segundos. Status: {resultado['status']}")
        return resultado

    # _validar_plano permanece o mesmo
    def _validar_plano(self, plano: Dict[str, Any]) -> List[str]:
        """ Valida o plano de entrada contra o schema JSON carregado. """
        # (Código omitido para brevidade - igual à versão anterior no Search Result 1)
        erros = []
        self.logger.debug("Iniciando validação do plano contra o schema JSON.")
        if not self.schema:
             self.logger.error("Schema JSON não carregado, impossível validar.")
             return ["Erro interno: Schema JSON não está disponível para validação."]
        try:
            jsonschema.validate(instance=plano, schema=self.schema)
            self.logger.info("Plano validado com sucesso contra o schema JSON.")
        except jsonschema.exceptions.ValidationError as e:
            erro_msg = f"Erro de validação no campo '{'.'.join(map(str, e.path))}': {e.message}"
            self.logger.error(f"Falha na validação do schema: {erro_msg}")
            erros.append(erro_msg)
        except Exception as e:
             self.logger.error(f"Erro inesperado durante a validação do schema: {str(e)}")
             self.logger.error(traceback.format_exc())
             erros.append(f"Erro inesperado na validação: {str(e)}")
        return erros

    # _gerar_comandos_db - Implementação completa para processar o plano adaptado
    def _gerar_comandos_db(self, plano: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Gera uma lista de comandos para o banco de dados com base no plano adaptado.
        
        Esta função é o coração do Wrapper 3, responsável por transformar o plano
        adaptado em comandos para o banco de dados Supabase.
        
        Args:
            plano (Dict[str, Any]): O plano adaptado completo do Wrapper 2.
            
        Returns:
            List[Dict[str, Any]]: Lista de comandos para o banco de dados.
        """
        self.logger.info("Gerando comandos para o banco de dados...")
        comandos = []
        
        # Contexto para rastreamento de IDs e relacionamentos entre entidades
        contexto = {"dados_origem_completos": plano}
        
        # Definir a ordem de processamento para garantir que as dependências sejam respeitadas
        # (ex: treinamento_principal antes de ciclos, ciclos antes de microciclos, etc.)
        ordem_processamento = [
            "treinamento_principal",  # Primeiro o treinamento principal
            "ciclos",               # Depois os ciclos
            "microciclos",          # Depois os microciclos
            "sessoes_originais",    # Depois as sessões originais
            "exercicios_originais", # Depois os exercícios originais
            "adaptacoes",           # Depois as adaptações
            "exercicios_adaptados", # Depois os exercícios adaptados
            "exercicios_removidos"  # Por último os exercícios removidos
        ]

        # --- ATENÇÃO: Atualização do Contexto ---
        # O contexto é atualizado *durante* a geração de comandos.
        # Se um ID é gerado pelo banco (SERIAL), ele NÃO estará disponível aqui.
        # Esta implementação assume que IDs necessários como FKs são:
        #   a) Gerados via 'generator': 'uuid' (e capturados aqui).
        #   b) Já existentes no JSON de origem (e capturados aqui).
        #   c) Ou que a relação é feita de outra forma (ex: usando IDs originais do JSON se forem únicos).

        for nome_mapeamento in ordem_processamento:
            if nome_mapeamento not in self.mapeamento_tabelas:
                self.logger.warning(f"Mapeamento '{nome_mapeamento}' definido na ordem mas não encontrado. Pulando.")
                continue
                
            mapeamento = self.mapeamento_tabelas[nome_mapeamento]
            self.logger.debug(f"Processando mapeamento para: {nome_mapeamento} (Tabela: {mapeamento.tabela})")
            
            # Caso especial para adaptações (matriz de adaptações)
            if nome_mapeamento == "adaptacoes" and "matriz_adaptacoes" in plano:
                # Processar a matriz de adaptações (humor x tempo)
                comandos_adaptacoes = self._processar_matriz_adaptacoes(plano, contexto)
                comandos.extend(comandos_adaptacoes)
                continue
            
            # Para os demais mapeamentos, extrair dados normalmente
            dados_extraidos_lista = self._extrair_dados_por_mapeamento(plano, mapeamento, contexto)
            
            for i, dados_item in enumerate(dados_extraidos_lista):
                if not dados_item:
                    continue
                    
                # Criar comando INSERT
                operacao = "INSERT"
                comando = {
                    "operacao": operacao,
                    "tabela": mapeamento.tabela,
                        "dados": dados_item,
                        "mapeamento_origem": nome_mapeamento, # Rastreabilidade
                        "item_indice": i # Índice do item dentro da lista (se list_path foi usado)
                    }
                    comandos.append(comando)

                    # --- Atualização do Contexto ---
                    # Atualiza o contexto com IDs gerados/extraídos DESTE item
                    # para serem usados por mapeamentos/itens subsequentes.
                    pk_field_name = "id" # Assuma 'id' como PK padrão, ajuste se necessário

                    if nome_mapeamento == "treinamento_principal" and pk_field_name in dados_item:
                         contexto["treinamento_id_principal"] = dados_item[pk_field_name]
                         self.logger.debug(f"Contexto atualizado: treinamento_id_principal={dados_item[pk_field_name]}")

                    # Se estiver processando sessões, atualiza o ID da sessão atual no contexto
                    # Assumindo que a PK da sessão (gerada ou do JSON) está em 'id' ou 'sessao_id_original'
                    elif nome_mapeamento == "sessoes_originais":
                         sessao_id_atual = dados_item.get(pk_field_name) or dados_item.get("sessao_id_original")
                         if sessao_id_atual:
                              contexto["sessao_id_atual"] = sessao_id_atual
                              # Log apenas se mudar, para evitar spam em listas grandes
                              if contexto.get("_last_sessao_id") != sessao_id_atual:
                                   self.logger.debug(f"Contexto atualizado: sessao_id_atual={sessao_id_atual} (Item {i})")
                                   contexto["_last_sessao_id"] = sessao_id_atual
                         else:
                              self.logger.warning(f"Não foi possível obter ID da sessão (item {i}) para atualizar contexto em {nome_mapeamento}")

                    # Adicionar lógica similar para outros IDs de contexto (ciclo, microciclo) se necessário

        # Limpar chaves internas do contexto
        contexto.pop("_last_sessao_id", None)

        self.logger.info(f"Total de {len(comandos)} comandos de BD gerados.")
        return comandos

    # --- IMPLEMENTAÇÃO DA EXTRAÇÃO (Passo 3) ---
    def _extrair_dados_por_mapeamento(self, dados_origem: Dict[str, Any], mapeamento: TabelaMapping, contexto: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extrai dados de `dados_origem` com base em um `TabelaMapping`,
        lidando com `list_path`, `campos`, `contexto`, `generator` e `transform`.
        """
        self.logger.debug(f"Extraindo dados para tabela '{mapeamento.tabela}' usando list_path '{mapeamento.list_path}'")
        resultados = []
        itens_a_processar = []
        path_context = [] # Para rastrear o caminho ao lidar com list_path aninhados

        # 1. Determinar os itens a serem processados
        if mapeamento.list_path:
            # Tenta obter a lista do JSON usando o path fornecido
            # A função _get_value_by_path agora lida com paths mais complexos, incluindo wildcards para extração de listas
            lista_bruta = self._get_value_by_path(dados_origem, mapeamento.list_path, allow_wildcard_list=True)

            if isinstance(lista_bruta, list):
                # Se o path continha [*], lista_bruta já será a lista de itens corretos.
                # Se não continha [*], mas resultou em lista, usamos essa lista.
                itens_a_processar = lista_bruta
                self.logger.debug(f"Encontrados {len(itens_a_processar)} itens em '{mapeamento.list_path}'")
            else:
                self.logger.warning(f"list_path '{mapeamento.list_path}' não resultou em uma lista válida ou não encontrado. Nenhum item será processado para {mapeamento.tabela}.")
                itens_a_processar = []
        else:
            # Processa o dicionário de origem como um único item
            itens_a_processar = [dados_origem]
            self.logger.debug(f"Processando dados_origem como item único para {mapeamento.tabela}.")

        # 2. Processar cada item
        for indice_item, item_atual in enumerate(itens_a_processar):
            # Garante que o item seja um dicionário para processamento dos campos
            if not isinstance(item_atual, dict):
                self.logger.warning(f"Item {indice_item} para {mapeamento.tabela} não é um dicionário (tipo: {type(item_atual)}). Pulando item.")
                continue

            self.logger.debug(f"Processando item {indice_item} para {mapeamento.tabela}")

            # 2a. Verificar condição do mapeamento (se houver)
            if mapeamento.condition and not mapeamento.condition(item_atual):
                self.logger.debug(f"Item {indice_item} pulado devido à condição não atendida.")
                continue

            linha_dados: Dict[str, Any] = {}
            processamento_item_ok = True

            # 2c. Iterar sobre os campos definidos no mapeamento
            for campo_map in mapeamento.campos:
                tabela_campo = campo_map.get("tabela_campo")
                if not tabela_campo:
                    self.logger.warning(f"Mapeamento de campo inválido (sem 'tabela_campo') em {mapeamento.tabela}. Pulando campo: {campo_map}")
                    continue

                valor_final = None
                origem_valor = "desconhecida"

                try:
                    # Determinar a origem do valor
                    if "json_path" in campo_map:
                        json_path = campo_map["json_path"]
                        origem_valor = f"json_path: {json_path}"
                        # O valor é buscado relativo ao item_atual
                        valor_bruto = self._get_value_by_path(item_atual, json_path)
                    elif campo_map.get("source") == "context":
                        context_key = campo_map.get("context_key")
                        origem_valor = f"context: {context_key}"
                        if context_key:
                            valor_bruto = contexto.get(context_key)
                            if valor_bruto is None:
                                # Log como debug, pois pode ser esperado que o contexto não tenha a chave ainda
                                self.logger.debug(f"Chave de contexto '{context_key}' não encontrada para {mapeamento.tabela}.{tabela_campo}")
                        else:
                            self.logger.warning(f"Mapeamento de contexto sem 'context_key' para {mapeamento.tabela}.{tabela_campo}")
                            valor_bruto = None
                    elif "generator" in campo_map:
                        generator_type = campo_map.get("generator")
                        origem_valor = f"generator: {generator_type}"
                        if generator_type == "uuid":
                            valor_bruto = self._generate_uuid()
                        elif generator_type == "now_iso":
                           valor_bruto = datetime.datetime.now(datetime.timezone.utc).isoformat()
                        else:
                            self.logger.warning(f"Tipo de gerador desconhecido '{generator_type}' para {mapeamento.tabela}.{tabela_campo}")
                            valor_bruto = None
                    else:
                         self.logger.debug(f"Campo '{tabela_campo}' não tem fonte definida (json_path, context, generator). Será omitido ou dependerá de default no BD.")
                         valor_bruto = None # Explicitamente None

                    # Aplicar transformação (se houver e valor não for None)
                    if valor_bruto is not None and "transform" in campo_map:
                        transform_type = campo_map.get("transform")
                        origem_valor += f" -> transform: {transform_type}"
                        if transform_type == "to_jsonb":
                            valor_final = self._transform_to_jsonb(valor_bruto)
                        elif transform_type == "to_string":
                             valor_final = str(valor_bruto)
                        elif transform_type == "to_int":
                             try: valor_final = int(valor_bruto)
                             except (ValueError, TypeError): self.logger.warning(f"Falha ao converter para int: {valor_bruto}"); valor_final = None
                        elif transform_type == "to_float":
                             try: valor_final = float(valor_bruto)
                             except (ValueError, TypeError): self.logger.warning(f"Falha ao converter para float: {valor_bruto}"); valor_final = None
                        # Adicionar outras transformações se necessário
                        else:
                            self.logger.warning(f"Tipo de transformação desconhecida '{transform_type}'. Usando valor bruto.")
                            valor_final = valor_bruto
                    else:
                        valor_final = valor_bruto # Usa valor bruto

                    # Adicionar ao dicionário da linha se o valor não for None
                    # (Supabase geralmente ignora chaves com valor None em inserts/updates)
                    if valor_final is not None:
                        linha_dados[tabela_campo] = valor_final
                        # Log mais conciso para evitar poluição excessiva
                        # self.logger.debug(f"  -> Mapeado para '{tabela_campo}': {str(valor_final)[:50]}... (Origem: {origem_valor})")
                    # else:
                         # self.logger.debug(f"  -> Campo '{tabela_campo}' resultou em None (Origem: {origem_valor}). Será omitido.")

                except Exception as e:
                    self.logger.error(f"Erro ao processar campo '{tabela_campo}' para {mapeamento.tabela} (Item {indice_item}, Origem: {origem_valor}): {str(e)}")
                    self.logger.error(traceback.format_exc())
                    processamento_item_ok = False
                    break # Aborta processamento dos campos deste item

            # 2d. Adicionar linha aos resultados se o processamento foi OK e gerou dados
            if processamento_item_ok and linha_dados:
                resultados.append(linha_dados)
                self.logger.debug(f"Item {indice_item} processado com sucesso para {mapeamento.tabela}. Dados: {linha_dados}")
            elif not linha_dados and processamento_item_ok:
                 self.logger.debug(f"Item {indice_item} para {mapeamento.tabela} não gerou dados mapeáveis (campos resultaram em None ou não tinham fonte).")
            elif not processamento_item_ok:
                 self.logger.error(f"Item {indice_item} para {mapeamento.tabela} falhou no processamento e não será adicionado.")

        self.logger.debug(f"Extração para '{mapeamento.tabela}' resultou em {len(resultados)} linhas.")
        return resultados

    # --- IMPLEMENTAÇÃO DA EXTRAÇÃO (Passo 3) ---
    def _get_value_by_path(self, data: Union[Dict[str, Any], List[Any]], path: str, allow_wildcard_list: bool = False) -> Optional[Any]:
        """
        Obtém um valor de uma estrutura aninhada (dict/list) usando notação de ponto.
        Suporta índices numéricos (lista[0]) e wildcard de lista (lista[*]) se allow_wildcard_list=True.
        Retorna None se o caminho for inválido ou não encontrado.
        Retorna uma lista de valores se o path terminar com [*] e allow_wildcard_list=True.
        """
        try:
            parts = path.split('.')
            current_value = data

            for i, part in enumerate(parts):
                if current_value is None:
                    # Não pode navegar mais fundo se o valor atual é None
                    # self.logger.debug(f"Path '{path}' interrompido em '{part}' pois o valor anterior é None.")
                    return None

                is_last_part = (i == len(parts) - 1)

                # Tratar acesso a lista (ex: "lista[0]", "lista[*]")
                if '[' in part and part.endswith(']'):
                    list_key = part[:part.find('[')]
                    index_str = part[part.find('[')+1:-1]

                    # Acessa a lista alvo
                    target_list = None
                    if list_key: # Ex: "sessoes[0]"
                        if isinstance(current_value, dict):
                            target_list = current_value.get(list_key)
                        else:
                            self.logger.warning(f"Path '{path}': Tentativa de acessar chave '{list_key}' em um não-dicionário ({type(current_value)}).")
                            return None
                    else: # Ex: "[0]" (acessa a própria current_value se for lista)
                        target_list = current_value

                    if not isinstance(target_list, list):
                        # self.logger.debug(f"Path '{path}': Elemento em '{list_key or 'current'}' não é uma lista ({type(target_list)}).")
                        return None # Não é uma lista ou não encontrada

                    # Tratar wildcard [*]
                    if index_str == '*':
                        if is_last_part and allow_wildcard_list:
                            # Se for a última parte e permitido, retorna a lista inteira
                            # self.logger.debug(f"Path '{path}' com wildcard [*] retornando lista de {len(target_list)} itens.")
                            return target_list
                        elif is_last_part and not allow_wildcard_list:
                             self.logger.warning(f"Path '{path}': Wildcard [*] encontrado no final, mas não permitido para extração de valor único.")
                             return None
                        elif not is_last_part:
                             # Se não for a última parte, precisamos iterar e coletar os resultados das partes restantes
                             # Isso adiciona complexidade, por ora, vamos retornar None e logar um aviso.
                             # A abordagem recomendada é usar list_path no mapeamento para lidar com iterações.
                             self.logger.warning(f"Path '{path}': Wildcard [*] encontrado em parte intermediária não é suportado diretamente por _get_value_by_path. Use list_path no mapeamento.")
                             return None
                    # Tratar índice numérico
                    else:
                        try:
                            index = int(index_str)
                            if 0 <= index < len(target_list):
                                current_value = target_list[index]
                            else:
                                # self.logger.debug(f"Path '{path}': Índice {index} fora dos limites (0-{len(target_list)-1}) em '{part}'.")
                                return None # Índice fora dos limites
                        except ValueError:
                            self.logger.warning(f"Path '{path}': Índice inválido '{index_str}' em '{part}'.")
                            return None # Índice não numérico

                # Tratar acesso a dicionário
                elif isinstance(current_value, dict):
                    current_value = current_value.get(part) # Retorna None se a chave não existe
                # Se não for dicionário e a chave não for de lista, caminho inválido
                else:
                    # self.logger.debug(f"Path '{path}': Tentativa de acessar chave '{part}' em um não-dicionário ({type(current_value)}).")
                    return None

            # Retorna o valor final encontrado (pode ser None)
            return current_value

        except Exception as e:
            self.logger.error(f"Erro inesperado ao obter valor pelo path '{path}': {str(e)}")
            self.logger.error(traceback.format_exc())
            return None

    # --- Funções Auxiliares para Geradores e Transformadores ---
    def _generate_uuid(self) -> str:
        """Gera uma string UUID v4."""
        return str(uuid.uuid4())

    def _transform_to_jsonb(self, data: Any) -> Optional[str]:
        """Converte dados Python para uma string JSON (adequada para JSONB)."""
        if data is None:
            return None
        try:
            # Usar ensure_ascii=False para suportar caracteres não-ASCII diretamente
            # default=str para tentar converter tipos não serializáveis (como datetime)
            return json.dumps(data, ensure_ascii=False, default=str)
        except TypeError as e:
            self.logger.error(f"Erro ao serializar dados para JSONB: {e}. Dados: {type(data)}")
            try:
                # Fallback mais robusto: tenta converter para string
                return str(data)
            except Exception:
                 # Último recurso se str() falhar
                 return f"Erro de serialização: {e}"


    # _executar_comandos_db - Atualizado para melhor log e tratamento de retorno (Passo 4)
    def _executar_comandos_db(self, comandos: List[Dict[str, Any]], retry_count: int = 1, timeout: int = 30) -> Dict[str, Any]:
        """
        Executa uma lista de comandos no Supabase ou simula a execução.
        Verifica a integração com SupabaseWrapper.
        """
        self.logger.info(f"Executando/Simulando {len(comandos)} comandos no BD.")
        resultados_execucao = {
            "status": "pending", "mensagem": "", "comandos_executados": 0,
            "comandos_sucesso": 0, "comandos_falha": 0,
            "erros_detalhados": [], "dados_retornados": []
        }

        # --- Modo Simulação ---
        if self.modo_simulacao or not self.supabase_client:
            if not self.supabase_client and not self.modo_simulacao:
                 self.logger.warning("Supabase client não inicializado. Forçando modo de simulação.")
            self.logger.info(f"MODO SIMULAÇÃO: Processando {len(comandos)} comandos.")
            for i, cmd in enumerate(comandos):
                 # Log mais informativo na simulação
                 log_data = str(cmd.get('dados', {}))[:100] + ('...' if len(str(cmd.get('dados', {}))) > 100 else '')
                 self.logger.debug(f"Simulando Cmd {i+1} ({cmd.get('mapeamento_origem', 'N/A')}, Item {cmd.get('item_indice', 'N/A')}): {cmd['operacao']} na tabela {cmd['tabela']} com dados: {log_data}")
            resultados_execucao["status"] = "simulated"; resultados_execucao["mensagem"] = f"Simulados {len(comandos)} comandos."
            resultados_execucao["comandos_executados"] = len(comandos); resultados_execucao["comandos_sucesso"] = len(comandos)
            return resultados_execucao

        # --- Modo Real (Passo 4: Integração com SupabaseWrapper) ---
        if not hasattr(self.supabase_client, 'insert_data') or \
           not hasattr(self.supabase_client, 'update_data') or \
           not hasattr(self.supabase_client, 'delete_data'):
            self.logger.error("SupabaseWrapper não possui os métodos necessários (insert_data, update_data, delete_data). Abortando execução.")
            resultados_execucao["status"] = "error"
            resultados_execucao["mensagem"] = "Erro interno: SupabaseWrapper incompatível."
            return resultados_execucao

        comandos_executados = 0; comandos_sucesso = 0; comandos_falha = 0
        for i, comando in enumerate(comandos):
            tabela = comando.get("tabela")
            operacao = comando.get("operacao", "").upper()
            dados = comando.get("dados")
            mapeamento_origem = comando.get("mapeamento_origem", "N/A")
            item_indice = comando.get("item_indice", "N/A")

            if not tabela or not operacao or (operacao in ["INSERT", "UPDATE"] and not dados):
                self.logger.error(f"Comando {i+1} ({mapeamento_origem}, Item {item_indice}) inválido. Pulando: {comando}")
                resultados_execucao["erros_detalhados"].append({"comando_indice": i, "erro": "Comando inválido/incompleto", "detalhes": comando})
                comandos_falha += 1; continue

            tentativas = 0; sucesso_comando = False
            while tentativas <= retry_count and not sucesso_comando:
                tentativas += 1
                try:
                    log_data_preview = str(dados)[:100] + ('...' if len(str(dados)) > 100 else '')
                    self.logger.debug(f"Tentativa {tentativas}/{retry_count+1} - Executando {operacao} em {tabela} (Origem: {mapeamento_origem}, Item {item_indice}) Dados: {log_data_preview}")
                    resultado_op = None; start_op_time = time.time()

                    # Chamada aos métodos do SupabaseWrapper
                    if operacao == "INSERT":
                        # SupabaseWrapper deve retornar a lista de registros inseridos (ou levantar exceção)
                        resultado_op = self.supabase_client.insert_data(table_name=tabela, data=dados)
                    elif operacao == "UPDATE":
                        condicao = comando.get("condicao_where", {})
                        if not condicao: raise ValueError("UPDATE requer condicao_where.")
                        resultado_op = self.supabase_client.update_data(table_name=tabela, data=dados, filters=condicao)
                    elif operacao == "DELETE":
                        condicao = comando.get("condicao_where", {})
                        if not condicao: raise ValueError("DELETE requer condicao_where.")
                        resultado_op = self.supabase_client.delete_data(table_name=tabela, filters=condicao)
                    else:
                        raise NotImplementedError(f"Operação '{operacao}' não suportada.")

                    end_op_time = time.time()
                    # O SupabaseWrapper deve idealmente logar o resultado interno, aqui logamos o tempo
                    self.logger.debug(f"Comando {operacao} em {tabela} ({mapeamento_origem}, Item {item_indice}) executado em {end_op_time - start_op_time:.4f}s.")

                    # Assumir sucesso se não houve exceção. A validação do resultado_op
                    # depende muito do que o SupabaseWrapper retorna em caso de sucesso/erro parcial.
                    sucesso_comando = True; comandos_sucesso += 1
                    # Adiciona o resultado E a origem ao array de dados retornados
                    # Verifica se resultado_op não é None e contém dados (lista não vazia)
                    if resultado_op and isinstance(resultado_op, list) and len(resultado_op) > 0:
                         resultados_execucao["dados_retornados"].append({
                             "comando_indice": i,
                             "comando_origem": mapeamento_origem,
                             "item_indice": item_indice,
                             "resultado": resultado_op # Guarda a lista retornada pelo Supabase
                         })
                    elif resultado_op: # Se retornou algo, mas não lista ou vazia, loga como debug
                         self.logger.debug(f"Comando {i+1} retornou dados não esperados/vazios: {resultado_op}")


                except Exception as e:
                    error_msg = str(e)
                    # Tentar extrair mensagem de erro específica do Supabase (depende do wrapper)
                    # if hasattr(e, 'details'): error_msg = e.details
                    # elif hasattr(e, 'message'): error_msg = e.message

                    self.logger.error(f"Falha na tentativa {tentativas} de executar comando {i+1} ({operacao} em {tabela}, Origem: {mapeamento_origem}, Item {item_indice}): {error_msg}")
                    if tentativas > retry_count:
                        self.logger.error(f"Comando {i+1} ({mapeamento_origem}, Item {item_indice}) falhou após {retry_count+1} tentativas.")
                        comandos_falha += 1
                        resultados_execucao["erros_detalhados"].append({
                            "comando_indice": i,
                            "mapeamento_origem": mapeamento_origem,
                            "item_indice": item_indice,
                            "erro": error_msg,
                            "detalhes_comando": comando, # Log do comando que falhou
                            "traceback": traceback.format_exc() # Opcional, pode ser muito verboso
                        })
                    else:
                        self.logger.info(f"Aguardando antes de tentar novamente...")
                        time.sleep(0.5 * tentativas) # Backoff simples

            comandos_executados += 1

        # Determinar status final (lógica igual à anterior)
        resultados_execucao["comandos_executados"] = comandos_executados
        resultados_execucao["comandos_sucesso"] = comandos_sucesso
        resultados_execucao["comandos_falha"] = comandos_falha
        # ... (lógica de status final igual à anterior) ...
        if comandos_falha == 0 and comandos_sucesso > 0:
            resultados_execucao["status"] = "success"; resultados_execucao["mensagem"] = f"Sucesso: {comandos_sucesso}/{comandos_executados} comandos executados."
        elif comandos_falha > 0 and comandos_sucesso > 0:
            resultados_execucao["status"] = "partial_success"; resultados_execucao["mensagem"] = f"Parcial: {comandos_sucesso}/{comandos_executados} com sucesso, {comandos_falha} falharam."
        elif comandos_falha > 0 and comandos_sucesso == 0:
             resultados_execucao["status"] = "error"; resultados_execucao["mensagem"] = f"Erro: Todos os {comandos_falha}/{comandos_executados} comandos falharam."
        elif comandos_executados == 0 and len(comandos) > 0:
             resultados_execucao["status"] = "error"; resultados_execucao["mensagem"] = "Erro: Nenhum comando foi executado devido a falhas prévias."
        else:
             resultados_execucao["status"] = "noop"; resultados_execucao["mensagem"] = "Nenhum comando foi gerado ou executado."


        return resultados_execucao

# ... (fim da classe DistribuidorBD)