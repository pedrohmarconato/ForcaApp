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

    def _criar_mapeamento_tabelas(self) -> Dict[str, TabelaMapping]:
        """
        Cria o mapeamento detalhado entre a estrutura JSON do plano adaptado e as tabelas do Supabase.
        """
        self.logger.info("Criando mapeamento de dados JSON → Supabase")

        # --- Mapeamento para Fato_Treinamento (Plano Principal) ---
        mapeamento_treinamento = TabelaMapping(
            tabela="Fato_Treinamento",
            campos=[
                # IDs e metadados gerais
                {"json_path": "treinamento_id", "tabela_campo": "id"},
                {"json_path": "versao", "tabela_campo": "versao"},
                {"json_path": "data_criacao", "tabela_campo": "created_at", "transform": "to_datetime"},
                {"json_path": "usuario.id", "tabela_campo": "usuario_id"},
                
                # Dados gerais do plano
                {"json_path": "plano_principal.nome", "tabela_campo": "nome"},
                {"json_path": "plano_principal.descricao", "tabela_campo": "descricao"},
                {"json_path": "plano_principal.periodizacao.tipo", "tabela_campo": "tipo_periodizacao"},
                {"json_path": "plano_principal.periodizacao.descricao", "tabela_campo": "descricao_periodizacao"},
                {"json_path": "plano_principal.duracao_semanas", "tabela_campo": "duracao_semanas"},
                {"json_path": "plano_principal.frequencia_semanal", "tabela_campo": "frequencia_semanal"},
                
                # Status e timestamps
                {"tabela_campo": "status", "value": "ativo"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ]
        )

        # --- Mapeamento para Fato_CicloTreinamento (Ciclos) ---
        mapeamento_ciclos = TabelaMapping(
            tabela="Fato_CicloTreinamento",
            list_path="plano_principal.ciclos",
            campos=[
                # IDs e relações
                {"json_path": "ciclo_id", "tabela_campo": "ciclo_id"},
                {"tabela_campo": "treinamento_id", "source": "context", "context_key": "treinamento_id_principal"},
                
                # Dados do ciclo
                {"json_path": "nome", "tabela_campo": "nome"},
                {"json_path": "ordem", "tabela_campo": "ordem"},
                {"json_path": "duracao_semanas", "tabela_campo": "duracao_semanas"},
                {"json_path": "objetivo", "tabela_campo": "objetivo_especifico"},
                {"json_path": "observacoes", "tabela_campo": "observacoes", "default": ""},
                
                # Timestamps e metadados
                {"tabela_campo": "created_at", "generator": "now_iso", "transform": "to_datetime"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ]
        )
        
        # --- Mapeamento para Fato_MicrocicloSemanal (Semanas) ---
        mapeamento_microciclos = TabelaMapping(
            tabela="Fato_MicrocicloSemanal",
            list_path="plano_principal.ciclos[*].microciclos",
            campos=[
                # IDs e relações
                {"tabela_campo": "microciclo_id", "generator": "uuid"},
                {"tabela_campo": "ciclo_id", "source": "context", "context_key": "ciclo_id_atual"},
                
                # Dados do microciclo
                {"json_path": "semana", "tabela_campo": "semana"},
                {"json_path": "volume", "tabela_campo": "volume_planejado", "transform": "volume_to_numeric"},
                {"json_path": "intensidade", "tabela_campo": "intensidade_planejada", "transform": "intensidade_to_numeric"},
                {"json_path": "foco", "tabela_campo": "foco"},
                {"tabela_campo": "observacoes", "default": ""},
                
                # Timestamps e metadados
                {"tabela_campo": "created_at", "generator": "now_iso", "transform": "to_datetime"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ],
            # Adiciona condição para garantir contexto correto do ciclo
            condition=lambda item: True  # Sempre válido, contexto é gerenciado em _gerar_comandos_db
        )
        
        # --- Mapeamento para Fato_SessaoTreinamento (Sessões originais) ---
        mapeamento_sessoes = TabelaMapping(
            tabela="Fato_SessaoTreinamento",
            list_path="plano_principal.ciclos[*].microciclos[*].sessoes",
            campos=[
                # IDs e relações
                {"json_path": "sessao_id", "tabela_campo": "sessao_id"},
                {"tabela_campo": "microciclo_id", "source": "context", "context_key": "microciclo_id_atual"},
                
                # Dados da sessão
                {"json_path": "nome", "tabela_campo": "nome"},
                {"json_path": "descricao", "tabela_campo": "descricao", "default": ""},
                {"json_path": "tipo", "tabela_campo": "tipo"},
                {"json_path": "duracao_minutos", "tabela_campo": "duracao_minutos"},
                {"json_path": "nivel_intensidade", "tabela_campo": "nivel_intensidade"},
                {"json_path": "dia_semana", "tabela_campo": "dia_semana", "transform": "dia_semana_to_int"},
                {"json_path": "ordem_dia", "tabela_campo": "ordem_dia", "default": 1},
                
                # Metadados
                {"tabela_campo": "created_at", "generator": "now_iso", "transform": "to_datetime"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ]
        )
        
        # --- Mapeamento para Fato_ExercicioSessao (Exercícios originais) ---
        mapeamento_exercicios = TabelaMapping(
            tabela="Fato_ExercicioSessao",
            list_path="plano_principal.ciclos[*].microciclos[*].sessoes[*].exercicios",
            campos=[
                # IDs e relações
                {"json_path": "exercicio_id", "tabela_campo": "exercicio_sessao_id"},
                {"tabela_campo": "sessao_id", "source": "context", "context_key": "sessao_id_atual"},
                {"json_path": "exercicio_dim_id", "tabela_campo": "exercicio_id", "default": None},
                
                # Dados do exercício
                {"json_path": "nome", "tabela_campo": "nome_exercicio", "default": "Exercício"},
                {"json_path": "ordem", "tabela_campo": "ordem"},
                {"json_path": "series", "tabela_campo": "series"},
                {"json_path": "repeticoes", "tabela_campo": "repeticoes_min", "transform": "extract_min_reps"},
                {"json_path": "repeticoes", "tabela_campo": "repeticoes_max", "transform": "extract_max_reps"},
                {"json_path": "percentual_rm", "tabela_campo": "percentual_rm"},
                {"json_path": "tempo_descanso", "tabela_campo": "tempo_descanso_segundos", "transform": "descanso_to_seconds"},
                {"json_path": "cadencia", "tabela_campo": "cadencia"},
                {"json_path": "metodo", "tabela_campo": "metodo_treinamento"},
                {"json_path": "observacoes", "tabela_campo": "observacoes", "default": ""},
                
                # Metadados
                {"tabela_campo": "created_at", "generator": "now_iso", "transform": "to_datetime"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ]
        )
        
        # --- Mapeamento para Fato_AdaptacaoTreinamento (Adaptações) ---
        mapeamento_adaptacoes = TabelaMapping(
            tabela="Fato_AdaptacaoTreinamento",
            list_path="adaptacoes_matrix.*.*.*",  # Acessa todos os níveis da matriz
            campos=[
                # IDs e relações
                {"json_path": "adaptacao_id", "tabela_campo": "adaptacao_id"},
                {"json_path": "sessao_original_id", "tabela_campo": "sessao_original_id"},
                {"tabela_campo": "treinamento_id", "source": "context", "context_key": "treinamento_id_principal"},
                {"tabela_campo": "usuario_id", "source": "context", "context_key": "usuario_id_atual"},
                
                # Dados da adaptação
                {"json_path": "nivel_humor", "tabela_campo": "nivel"},
                {"json_path": "tempo_disponivel", "tabela_campo": "tipo"},
                {"json_path": "estrategia_aplicada", "tabela_campo": "ajustes_aplicados", "transform": "to_jsonb"},
                {"json_path": "duracao_estimada_ajustada", "tabela_campo": "duracao_minutos_ajustada"},
                
                # Lista de exercícios adaptados como JSONB para consulta rápida
                {"json_path": "exercicios_adaptados", "tabela_campo": "exercicios_adaptados", "transform": "to_jsonb"},
                {"json_path": "exercicios_removidos_ids", "tabela_campo": "exercicios_removidos", "transform": "to_jsonb"},
                
                # Status e timestamps
                {"tabela_campo": "status", "value": "gerado"},
                {"tabela_campo": "created_at", "generator": "now_iso", "transform": "to_datetime"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ]
        )
        
        # --- Mapeamento para exercícios adaptados (opcional, depende da sua estratégia de armazenamento) ---
        # Se quiser salvar cada exercício adaptado em Fato_ExercicioSessao com um flag, por exemplo
        
        mapeamento_exercicios_adaptados = TabelaMapping(
            tabela="Fato_ExercicioSessao",
            list_path="adaptacoes_matrix.*.*.*exercicios_adaptados[*]",
            campos=[
                # IDs e relações
                {"json_path": "exercicio_id", "tabela_campo": "exercicio_sessao_id"},
                {"tabela_campo": "sessao_id", "source": "context", "context_key": "sessao_adaptacao_atual"},
                {"tabela_campo": "adaptacao_id", "source": "context", "context_key": "adaptacao_id_atual"},
                
                # Dados do exercício adaptado (similar ao original)
                {"json_path": "nome", "tabela_campo": "nome_exercicio"},
                {"json_path": "ordem", "tabela_campo": "ordem"},
                {"json_path": "series", "tabela_campo": "series"},
                {"json_path": "repeticoes", "tabela_campo": "repeticoes_min", "transform": "extract_min_reps"},
                {"json_path": "repeticoes", "tabela_campo": "repeticoes_max", "transform": "extract_max_reps"},
                {"json_path": "percentual_rm", "tabela_campo": "percentual_rm"},
                {"json_path": "tempo_descanso", "tabela_campo": "tempo_descanso_segundos", "transform": "descanso_to_seconds"},
                {"json_path": "cadencia", "tabela_campo": "cadencia"},
                {"json_path": "metodo", "tabela_campo": "metodo_treinamento"},
                {"json_path": "observacoes", "tabela_campo": "observacoes"},
                
                # Flag para identificar como adaptado
                {"tabela_campo": "é_adaptacao", "value": True},
                
                # Metadados
                {"tabela_campo": "created_at", "generator": "now_iso", "transform": "to_datetime"},
                {"tabela_campo": "updated_at", "generator": "now_iso", "transform": "to_datetime"}
            ],
            condition=lambda item: item is not None and isinstance(item, dict)
        )

        # Consolida todos os mapeamentos
        mapeamento_completo = {
            "treinamento_principal": mapeamento_treinamento,
            "ciclos": mapeamento_ciclos,
            "microciclos": mapeamento_microciclos,
            "sessoes": mapeamento_sessoes,
            "exercicios": mapeamento_exercicios,
            "adaptacoes": mapeamento_adaptacoes,
            "exercicios_adaptados": mapeamento_exercicios_adaptados
        }
        
        self.logger.info(f"Mapeamento de dados definido para: {list(mapeamento_completo.keys())}")
        return mapeamento_completo
    
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
    
    def _transform_to_datetime(self, value: Any) -> str:
        """Converte valor para formato datetime aceito pelo Postgres/Supabase."""
        if not value:
            return datetime.datetime.now().isoformat()
        if isinstance(value, str):
            return value
        if isinstance(value, (datetime.datetime, datetime.date)):
            return value.isoformat()
        return str(value)

    def _extract_min_reps(self, reps_str: Optional[str]) -> Optional[int]:
        """Extrai o número mínimo de repetições de uma string como '8-12'."""
        if not reps_str:
            return None
        try:
            if isinstance(reps_str, int):
                return reps_str
            if '-' in str(reps_str):
                min_reps = str(reps_str).split('-')[0].strip()
                return int(min_reps)
            return int(reps_str)
        except (ValueError, TypeError, IndexError):
            self.logger.warning(f"Não foi possível extrair min_reps de '{reps_str}'")
            return None

    def _extract_max_reps(self, reps_str: Optional[str]) -> Optional[int]:
        """Extrai o número máximo de repetições de uma string como '8-12'."""
        if not reps_str:
            return None
        try:
            if isinstance(reps_str, int):
                return reps_str
            if '-' in str(reps_str):
                max_reps = str(reps_str).split('-')[1].strip()
                return int(max_reps)
            return int(reps_str)
        except (ValueError, TypeError, IndexError):
            self.logger.warning(f"Não foi possível extrair max_reps de '{reps_str}'")
            return None

    def _descanso_to_seconds(self, descanso: Optional[Any]) -> Optional[int]:
        """Converte tempo de descanso para segundos."""
        if descanso is None:
            return None
        
        if isinstance(descanso, int):
            return descanso
        
        if isinstance(descanso, str):
            # Remove 's', 'seg', 'segundos' e converte para int
            descanso_str = descanso.lower().strip()
            for suffix in ['s', 'seg', 'segundos', 'second', 'seconds']:
                descanso_str = descanso_str.replace(suffix, '').strip()
            try:
                return int(descanso_str)
            except ValueError:
                self.logger.warning(f"Não foi possível converter '{descanso}' para segundos")
        
        return None

    def _volume_to_numeric(self, volume: Optional[str]) -> Optional[float]:
        """Converte descrição de volume para valor numérico."""
        if not volume:
            return None
        
        # Mapeamento simples
        volume_map = {
            "baixo": 1.0,
            "médio": 2.0,
            "moderado": 2.0,
            "alto": 3.0,
            "muito alto": 4.0,
            "deload": 0.5
        }
        
        volume_str = str(volume).lower().strip()
        if volume_str in volume_map:
            return volume_map[volume_str]
        
        try:
            # Tenta converter diretamente se for um número
            return float(volume_str)
        except ValueError:
            self.logger.warning(f"Não foi possível converter volume '{volume}' para numérico")
            return None

    def _intensidade_to_numeric(self, intensidade: Optional[str]) -> Optional[float]:
        """Converte descrição de intensidade para valor numérico."""
        if not intensidade:
            return None
        
        # Mapeamento simples
        intensidade_map = {
            "leve": 1.0,
            "moderada": 2.0,
            "média": 2.0,
            "alta": 3.0,
            "muito alta": 4.0,
            "máxima": 5.0
        }
        
        intensidade_str = str(intensidade).lower().strip()
        if intensidade_str in intensidade_map:
            return intensidade_map[intensidade_str]
        
        try:
            # Tenta converter diretamente se for um número
            return float(intensidade_str)
        except ValueError:
            self.logger.warning(f"Não foi possível converter intensidade '{intensidade}' para numérico")
            return None

    def _dia_semana_to_int(self, dia_semana: Any) -> Optional[int]:
        """Converte dia da semana (texto ou número) para inteiro (1=segunda, 7=domingo)."""
        if dia_semana is None:
            return None
        
        # Se já for número, retorna direto (validando range)
        if isinstance(dia_semana, int):
            if 1 <= dia_semana <= 7:
                return dia_semana
            self.logger.warning(f"Dia da semana fora do range (1-7): {dia_semana}")
            return None
        
        # Mapeamento de texto para número
        dia_map = {
            "segunda": 1, "segunda-feira": 1, "seg": 1, "monday": 1, "mon": 1,
            "terça": 2, "terça-feira": 2, "ter": 2, "tuesday": 2, "tue": 2,
            "quarta": 3, "quarta-feira": 3, "qua": 3, "wednesday": 3, "wed": 3,
            "quinta": 4, "quinta-feira": 4, "qui": 4, "thursday": 4, "thu": 4,
            "sexta": 5, "sexta-feira": 5, "sex": 5, "friday": 5, "fri": 5,
            "sábado": 6, "sabado": 6, "sab": 6, "saturday": 6, "sat": 6,
            "domingo": 7, "dom": 7, "sunday": 7, "sun": 7
        }
        
        dia_str = str(dia_semana).lower().strip()
        if dia_str in dia_map:
            return dia_map[dia_str]
        
        # Tenta extrair número se for formato "dia-1" ou similar
        for prefix in ["dia-", "dia ", "day-", "day "]:
            if dia_str.startswith(prefix):
                try:
                    num = int(dia_str[len(prefix):])
                    if 1 <= num <= 7:
                        return num
                except ValueError:
                    pass
        
        self.logger.warning(f"Não foi possível converter dia da semana '{dia_semana}' para inteiro")
        return None
    
    def _gerar_comandos_db(self, plano: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Gera uma lista de comandos para o banco de dados com base no plano adaptado.
        Gerencia o contexto para garantir que relações ID sejam mantidas corretamente.
        """
        self.logger.info("Gerando comandos para o banco de dados...")
        comandos = []
        
        # Contexto para rastreamento de IDs e relacionamentos entre entidades
        contexto = {
            "dados_origem_completos": plano,
            "treinamento_id_principal": plano.get("treinamento_id"),
            "usuario_id_atual": plano.get("usuario", {}).get("id")
        }
        
        # Definir a ordem de processamento para garantir que as dependências sejam respeitadas
        ordem_processamento = [
            "treinamento_principal",  # Primeiro o treinamento principal
            "ciclos",                 # Depois os ciclos
            "microciclos",            # Depois os microciclos 
            "sessoes",                # Depois as sessões originais
            "exercicios",             # Depois os exercícios originais
            "adaptacoes",             # Depois as adaptações
            "exercicios_adaptados"    # Por último os exercícios adaptados
        ]
        
        # --- ETAPA 1: Processamento das Entidades Principais ---
        for nome_mapeamento in ordem_processamento:
            if nome_mapeamento not in self.mapeamento_tabelas:
                self.logger.warning(f"Mapeamento '{nome_mapeamento}' definido na ordem mas não encontrado. Pulando.")
                continue
            
            mapeamento = self.mapeamento_tabelas[nome_mapeamento]
            self.logger.debug(f"Processando mapeamento para: {nome_mapeamento} (Tabela: {mapeamento.tabela})")
            
            # Extrai dados conforme o mapeamento 
            dados_extraidos_lista = self._extrair_dados_por_mapeamento(plano, mapeamento, contexto)
            
            # --- Processamento Especial para Entidades Específicas ---
            for i, dados_item in enumerate(dados_extraidos_lista):
                if not dados_item:
                    continue
                
                # Atualização de contexto por tipo de entidade
                # Ciclo
                if nome_mapeamento == "ciclos" and "ciclo_id" in dados_item:
                    contexto["ciclo_id_atual"] = dados_item["ciclo_id"]
                    self.logger.debug(f"Contexto atualizado: ciclo_id_atual={dados_item['ciclo_id']}")
                
                # Microciclo
                elif nome_mapeamento == "microciclos" and "microciclo_id" in dados_item:
                    contexto["microciclo_id_atual"] = dados_item["microciclo_id"]
                    self.logger.debug(f"Contexto atualizado: microciclo_id_atual={dados_item['microciclo_id']}")
                
                # Sessão
                elif nome_mapeamento == "sessoes" and "sessao_id" in dados_item:
                    contexto["sessao_id_atual"] = dados_item["sessao_id"]
                    self.logger.debug(f"Contexto atualizado: sessao_id_atual={dados_item['sessao_id']}")
                
                # Adaptação
                elif nome_mapeamento == "adaptacoes" and "adaptacao_id" in dados_item:
                    contexto["adaptacao_id_atual"] = dados_item["adaptacao_id"]
                    contexto["sessao_adaptacao_atual"] = dados_item.get("sessao_original_id")
                    self.logger.debug(f"Contexto atualizado: adaptacao_id_atual={dados_item['adaptacao_id']}")
                
                # Criar comando INSERT
                operacao = "INSERT"
                comando = {
                    "operacao": operacao,
                    "tabela": mapeamento.tabela,
                    "dados": dados_item,
                    "mapeamento_origem": nome_mapeamento,
                    "item_indice": i
                }
                comandos.append(comando)
        
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
                    elif "value" in campo_map:
                        # Valor fixo fornecido diretamente
                        valor_bruto = campo_map["value"]
                        origem_valor = f"value: {valor_bruto}"
                    elif "default" in campo_map:
                        # Valor padrão usado quando nenhum outro método é especificado
                        valor_bruto = campo_map["default"]
                        origem_valor = f"default: {valor_bruto}"
                    else:
                         self.logger.debug(f"Campo '{tabela_campo}' não tem fonte definida (json_path, context, generator, value, default). Será omitido ou dependerá de default no BD.")
                         valor_bruto = None # Explicitamente None

                    # Aplicar transformação (se houver e valor não for None)
                    if valor_bruto is not None and "transform" in campo_map:
                        transform_type = campo_map.get("transform")
                        origem_valor += f" -> transform: {transform_type}"
                        if transform_type == "to_jsonb":
                            valor_final = self._transform_to_jsonb(valor_bruto)
                        elif transform_type == "to_datetime":
                            valor_final = self._transform_to_datetime(valor_bruto)
                        elif transform_type == "to_string":
                             valor_final = str(valor_bruto)
                        elif transform_type == "to_int":
                             try: valor_final = int(valor_bruto)
                             except (ValueError, TypeError): self.logger.warning(f"Falha ao converter para int: {valor_bruto}"); valor_final = None
                        elif transform_type == "to_float":
                             try: valor_final = float(valor_bruto)
                             except (ValueError, TypeError): self.logger.warning(f"Falha ao converter para float: {valor_bruto}"); valor_final = None
                        elif transform_type == "extract_min_reps":
                            valor_final = self._extract_min_reps(valor_bruto)
                        elif transform_type == "extract_max_reps":
                            valor_final = self._extract_max_reps(valor_bruto)
                        elif transform_type == "descanso_to_seconds":
                            valor_final = self._descanso_to_seconds(valor_bruto)
                        elif transform_type == "volume_to_numeric":
                            valor_final = self._volume_to_numeric(valor_bruto)
                        elif transform_type == "intensidade_to_numeric":
                            valor_final = self._intensidade_to_numeric(valor_bruto)
                        elif transform_type == "dia_semana_to_int":
                            valor_final = self._dia_semana_to_int(valor_bruto)
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

    # Outros métodos da classe permanecem inalterados...