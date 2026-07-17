# Relatório Técnico: Reconstrução do Wrapper 3 (Distribuidor BD)

## Índice

1. [Introdução](#introdução)
2. [Arquitetura e Responsabilidades](#arquitetura-e-responsabilidades)
3. [Dependências e Imports](#dependências-e-imports)
4. [Estrutura de Classes](#estrutura-de-classes)
5. [Funcionalidades Principais](#funcionalidades-principais)
6. [Integração com Supabase](#integração-com-supabase)
7. [Mapeamento de Dados](#mapeamento-de-dados)
8. [Validação de Dados](#validação-de-dados)
9. [Tratamento de Erros](#tratamento-de-erros)
10. [Modo de Simulação](#modo-de-simulação)
11. [Logging e Monitoramento](#logging-e-monitoramento)
12. [Interfaces e Métodos Públicos](#interfaces-e-métodos-públicos)
13. [Implementação Completa](#implementação-completa)
14. [Considerações de Performance](#considerações-de-performance)
15. [Testes](#testes)
16. [Glossário](#glossário)

## Introdução

O Wrapper 3, também denominado "Distribuidor BD", é o componente final do pipeline de processamento do sistema FORCA_V1, responsável pela persistência de dados no banco de dados Supabase. Este componente recebe dados processados do Wrapper 2 (Sistema de Adaptação de Treino), formata-os de acordo com o esquema do banco de dados, e realiza operações CRUD (Create, Read, Update, Delete) no Supabase.

Este documento detalha a estrutura, funcionamento e implementação do Wrapper 3, fornecendo todas as informações necessárias para sua reconstrução.

## Arquitetura e Responsabilidades

O Distribuidor BD atua como uma camada de abstração entre o domínio da aplicação e a infraestrutura de persistência. Suas principais responsabilidades são:

1. **Transformação de Dados**: Converter dados do formato de domínio para o formato do banco de dados
2. **Mapeamento de Entidades**: Mapear entidades do domínio para tabelas do banco de dados
3. **Validação**: Validar dados antes da persistência
4. **Persistência**: Executar operações CRUD no Supabase
5. **Tratamento de Erros**: Gerenciar erros de conexão e operações no banco de dados
6. **Simulação**: Permitir operação em modo simulado para testes e desenvolvimento

A arquitetura do Wrapper 3 segue o padrão Repository e Adapter, isolando a lógica de negócio da infraestrutura de dados.

## Dependências e Imports

O Wrapper 3 depende dos seguintes módulos e pacotes:

```python
import json
import copy
import uuid
import datetime
import jsonschema
import os
import traceback
import time
from typing import Dict, Any, List, Tuple, Optional, Union
from dataclasses import dataclass, field

# Módulos internos
from ..utils.logger import WrapperLogger
from ..utils.path_resolver import get_schema_path, load_file_with_fallback
from ..utils.config import get_supabase_config, get_db_config
from ..wrappers.supabase_client import SupabaseWrapper
```

Dependências externas:
- `jsonschema`: Validação de esquemas JSON
- `supabase-py`: Cliente Python para Supabase (via SupabaseWrapper)

## Estrutura de Classes

### Classe Principal

```python
@dataclass
class TabelaMapping:
    tabela: str
    campos: List[Dict[str, str]] = field(default_factory=list)

class DistribuidorBD:
    def __init__(self, config_db: Optional[Dict[str, Any]] = None, modo_simulacao: bool = False, check_tables: bool = False):
        # Inicialização
```

A classe `DistribuidorBD` é o ponto de entrada principal, enquanto `TabelaMapping` é uma classe de dados auxiliar para definir o mapeamento entre campos JSON e tabelas do banco de dados.

## Funcionalidades Principais

### 1. Processamento de Plano de Treinamento

```python
def processar_plano(self, plano_adaptado: Dict[str, Any]) -> Dict[str, Any]:
    """
    Processa o plano adaptado para distribuição no banco de dados.
    
    Args:
        plano_adaptado (Dict): Plano completo com adaptações
        
    Returns:
        Dict: Resultado do processamento
    """
```

Este método é o ponto de entrada principal para processar um plano de treinamento adaptado. O fluxo de processamento é:

1. Validar informações básicas do plano
2. Preparar o plano para o formato do banco de dados
3. Validar o plano contra o esquema JSON
4. Gerar comandos SQL/ORM para o banco de dados
5. Executar os comandos ou simular a execução
6. Retornar o resultado do processamento

### 2. Preparação do Plano para o Banco de Dados

```python
def _preparar_plano_para_bd(self, plano_adaptado: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prepara o plano adaptado para o formato do banco de dados.
    """
```

Este método transforma o plano adaptado em um formato adequado para o banco de dados, adicionando metadados como:
- ID de transação
- Timestamp
- Operação (INSERT, UPDATE)
- Mapeamento de tabelas
- Regras de validação

### 3. Geração de Comandos para o Banco de Dados

```python
def _gerar_comandos_db(self, plano: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Gera comandos para inserção/atualização no banco de dados.
    """
```

Este método analisa o plano e gera uma lista de comandos para o banco de dados, cada um com:
- Tabela alvo
- Operação (INSERT, UPDATE, DELETE)
- Dados a serem inseridos/atualizados
- Condições para filtragem (WHERE)

### 4. Execução de Comandos no Banco de Dados

```python
def _executar_comandos_db(self, comandos: List[Dict[str, Any]], retry_count: int = 3, timeout: int = 15) -> Dict[str, Any]:
    """
    Executa os comandos no banco de dados ou simula a execução.
    """
```

Este método executa cada comando no banco de dados (via Supabase) ou simula a execução. Características:
- Sistema de retry para operações falhas
- Timeout configurável
- Estatísticas de execução
- Tratamento de erros específicos

## Integração com Supabase

A integração com o Supabase é feita através do `SupabaseWrapper`, que encapsula as operações CRUD:

```python
def _inicializar_conexao(self) -> None:
    """
    Inicializa a conexão com o Supabase.
    """
    self.logger.info("Inicializando conexão com Supabase")
    
    supabase_config = get_supabase_config()
    
    # Verificar configurações
    if not supabase_config.get('url') or not supabase_config.get('api_key'):
        self.logger.error("Configuração Supabase incompleta: URL ou API Key não fornecidos")
        raise ValueError("Configuração Supabase incompleta: URL ou API Key não fornecidos")
    
    try:
        self.supabase_client = SupabaseWrapper(
            url=supabase_config.get('url'),
            api_key=supabase_config.get('api_key')
        )
        
        # Registrar conexão
        self.conexao_db = {
            "status": "connected",
            "tipo": "supabase",
            "url": supabase_config.get('url'),
            "timestamp": datetime.datetime.now().isoformat()
        }
        
        self.logger.info("Conexão com Supabase estabelecida com sucesso")
        
    except Exception as e:
        self.logger.error(f"Erro ao inicializar cliente Supabase: {str(e)}")
        self.logger.error(traceback.format_exc())
        raise ValueError(f"Falha na conexão com Supabase: {str(e)}")
```

### Gerenciamento de Conexão

O Wrapper 3 gerencia conexões com o Supabase de maneira eficiente:

1. **Lazy Connection**: A conexão é estabelecida apenas quando necessária
2. **Connection Pooling**: Reutilização de conexões para múltiplas operações
3. **Desconexão**: Liberação explícita de recursos após o uso

```python
def desconectar_bd(self) -> None:
    """Encerra a conexão com o banco de dados."""
    if not self.conexao_db:
        self.logger.warning("Tentativa de desconexão sem conexão ativa")
        return
    
    tipo_conexao = self.conexao_db.get("status", "unknown")    
    self.logger.info(f"Encerrando conexão {tipo_conexao} com o banco de dados")
    
    # Descartar as referências de conexão
    self.conexao_db = None
    self.supabase_client = None
    
    self.logger.info("Conexão com o banco de dados encerrada com sucesso")
```

## Mapeamento de Dados

O mapeamento entre o modelo de domínio e o esquema do banco de dados é definido na função `_criar_mapeamento_tabelas()`:

```python
def _criar_mapeamento_tabelas(self) -> Dict[str, TabelaMapping]:
    """
    Cria o mapeamento de campos entre o JSON e as tabelas do banco de dados.
    """
    mapeamento = {
        "treinamento": TabelaMapping(
            tabela="Fato_Treinamento",
            campos=[
                {"json_path": "dados.plano_principal.nome", "tabela_campo": "nome"},
                {"json_path": "dados.plano_principal.descricao", "tabela_campo": "descricao"},
                # ... outros campos
            ]
        ),
        "ciclos": TabelaMapping(
            tabela="Fato_CicloTreinamento",
            campos=[
                # ... mapeamento de campos
            ]
        ),
        # ... outras tabelas
    }
    return mapeamento
```

Este mapeamento define:
1. **Tabelas**: Cada entidade do domínio é mapeada para uma tabela no banco de dados
2. **Campos**: Caminho no JSON de origem → Campo na tabela de destino
3. **Transformações**: Valores fixos, geração de IDs, conversão de tipos

### Tabelas Principais

O schema do banco de dados inclui as seguintes tabelas principais:

1. **Fato_Treinamento**: Planos de treinamento completos
2. **Fato_CicloTreinamento**: Ciclos de treinamento
3. **Fato_MicrocicloSemanal**: Microciclos semanais
4. **Fato_SessaoTreinamento**: Sessões individuais
5. **Fato_ExercicioSessao**: Exercícios específicos
6. **Fato_AdaptacaoTreinamento**: Adaptações de humor e tempo disponível

### Extração de Dados por Mapeamento

A função `_extrair_dados_por_mapeamento` extrai dados com base no mapeamento definido:

```python
def _extrair_dados_por_mapeamento(self, dados: Dict[str, Any], tipo_mapeamento: str) -> Dict[str, Any]:
    """
    Extrai dados com base no mapeamento de campos.
    
    Args:
        dados (Dict): Dados originais
        tipo_mapeamento (str): Tipo de mapeamento a ser usado
        
    Returns:
        Dict: Dados extraídos conforme mapeamento
    """
```

Este método:
1. Obtém o mapeamento para o tipo especificado
2. Para cada campo no mapeamento, extrai o valor do JSON de origem
3. Aplica transformações conforme necessário (valores fixos, conversão para JSON, etc.)
4. Retorna um dicionário com os campos mapeados para a tabela de destino

## Validação de Dados

A validação de dados é realizada em várias etapas:

### 1. Validação contra Schema JSON

```python
def _validar_plano(self, plano: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valida o plano para o banco de dados contra o schema esperado.
    """
    # Validar schema
    try:
        jsonschema.validate(instance=plano, schema=self.schema)
        self.logger.info("Plano validado com sucesso contra o schema")
    except jsonschema.exceptions.ValidationError as e:
        erro_msg = f"Erro de validação: {str(e)}"
        self.logger.error(erro_msg)
        mensagens_erro.append(erro_msg)
    
    # Validar regras de negócio
    for regra in plano["validacao"]["regras"]:
        campo = regra["campo"]
        validacao = regra["validacao"]
        
        # Obter valor do campo
        valor = self._obter_valor_campo(plano, campo)
        
        # Validar campo conforme regra
        if not self._validar_regra(valor, validacao):
            erro_msg = f"Campo '{campo}' falhou na validação: {validacao}"
            self.logger.error(erro_msg)
            mensagens_erro.append(erro_msg)
```

### 2. Regras de Validação Personalizadas

```python
def _validar_regra(self, valor: Any, validacao: str) -> bool:
    """
    Valida um valor com base na regra especificada.
    """
    if validacao == "numero_positivo":
        return isinstance(valor, (int, float)) and valor > 0
    
    elif validacao == "entre_1_e_7":
        return isinstance(valor, (int, float)) and 1 <= valor <= 7
    
    elif validacao == "nao_vazio":
        return valor is not None and (not isinstance(valor, str) or valor.strip() != "")
    
    elif validacao == "unico":
        # Validação de unicidade (simplificada)
        return True
```

### 3. Correção Automática de Erros

```python
def _tentar_corrigir_erros(self, plano: Dict[str, Any], mensagens_erro: List[str]) -> bool:
    """
    Tenta corrigir erros automaticamente.
    """
    # Aplicar correções para erros comuns
    for erro in mensagens_erro:
        if "duracao_semanas" in erro and "numero_positivo" in erro:
            # Corrigir duração de semanas inválida
            plano["dados"]["plano_principal"]["duracao_semanas"] = 12
            correcao_aplicada = True
        
        elif "frequencia_semanal" in erro and "entre_1_e_7" in erro:
            # Corrigir frequência semanal inválida
            plano["dados"]["plano_principal"]["frequencia_semanal"] = 3
            correcao_aplicada = True
        
        # ... outras correções
```

## Tratamento de Erros

O Wrapper 3 implementa um sistema robusto de tratamento de erros:

### 1. Exceções Específicas

```python
try:
    # Operação que pode falhar
except jsonschema.exceptions.ValidationError as e:
    # Tratamento de erro de validação
except requests.exceptions.RequestException as e:
    # Tratamento de erro de conexão
except json.JSONDecodeError as e:
    # Tratamento de erro de parsing JSON
except Exception as e:
    # Tratamento de erro genérico
```

### 2. Retry para Operações Falhas

```python
# Tentar execução com retry
resultado = None
tentativas = 0

while tentativas < retry_count and resultado is None:
    tentativas += 1
    
    try:
        # Operação que pode falhar
        resultado = self.supabase_client.insert_data(tabela, dados)
        
    except Exception as e:
        if tentativas < retry_count:
            self.logger.info(f"Tentativa {tentativas}/{retry_count} - retrying...")
            time.sleep(1)  # Esperar antes de tentar novamente
        else:
            self.logger.error(f"Falha após {retry_count} tentativas")
```

### 3. Fallback para Modo de Simulação

```python
try:
    # Operação que pode falhar
except Exception as e:
    self.logger.error(f"Não foi possível estabelecer conexão: {str(e)}")
    self.logger.warning("Operando em modo de simulação por falta de conexão")
    self.conexao_db = {
        "status": "simulated",
        "fallback": True,
        "error": str(e),
        "timestamp": datetime.datetime.now().isoformat()
    }
    return True  # Retorna True para permitir a simulação
```

## Modo de Simulação

O Wrapper 3 suporta um modo de simulação para desenvolvimento e testes:

```python
def __init__(self, config_db: Optional[Dict[str, Any]] = None, modo_simulacao: bool = False, check_tables: bool = False):
    """
    Inicializa o Distribuidor de Treinos para o BD.
    
    Args:
        config_db (Dict, optional): Configuração de conexão com o banco de dados
        modo_simulacao (bool): Se True, opera em modo de simulação sem conexão real
        check_tables (bool): Se False (padrão), não verifica se as tabelas necessárias existem no banco de dados
    """
```

No modo de simulação:
1. Não é estabelecida conexão real com o banco de dados
2. Operações CRUD são simuladas e retornam resultados fictícios
3. Os comandos gerados são registrados para depuração
4. Mensagens de log indicam que as operações estão sendo simuladas

```python
# Se estamos em modo de simulação (deliberada ou fallback)
if self.modo_simulacao or (self.conexao_db and self.conexao_db.get("status") == "simulated"):
    self.logger.info(f"Modo simulação: processando {len(comandos)} comandos")
    
    # Contabilizar estatísticas de comandos por tabela
    estatisticas = {}
    for comando in comandos:
        tabela = comando.get("tabela", "desconhecida")
        if tabela not in estatisticas:
            estatisticas[tabela] = 0
        estatisticas[tabela] += 1
    
    for tabela, contagem in estatisticas.items():
        self.logger.info(f"Tabela {tabela}: {contagem} comandos")
        
    # Incrementar métricas
    self.metricas["operacoes_totais"] += 1
    self.metricas["operacoes_sucesso"] += 1
    self.metricas["ultima_operacao"] = "simulada"
    
    return {
        "status": "simulated",
        "mensagem": f"Simulados {len(comandos)} comandos no banco de dados",
        "comandos_executados": len(comandos),
        "estatisticas": estatisticas
    }
```

## Logging e Monitoramento

O Wrapper 3 utiliza o `WrapperLogger` para logging detalhado:

```python
def __init__(self, config_db: Optional[Dict[str, Any]] = None, modo_simulacao: bool = False, check_tables: bool = False):
    # Configurar logger
    self.logger = WrapperLogger("Wrapper3_Distribuidor")
    self.logger.info("Inicializando Distribuidor BD")
```

### Níveis de Log

1. **DEBUG**: Informações detalhadas para depuração
2. **INFO**: Fluxo normal de execução
3. **WARNING**: Situações inesperadas mas não críticas
4. **ERROR**: Erros que impedem a execução normal
5. **CRITICAL**: Erros críticos que impedem a continuação

### Decorador de Log

```python
@WrapperLogger.log_function()
def _extrair_todas_sessoes(self, plano_principal: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extrai todas as sessões do plano principal.
    """
```

Este decorador:
1. Loga a entrada na função com argumentos
2. Loga a saída da função com resultado
3. Captura e loga exceções
4. Permite configurar o nível de log

### Métricas de Operação

```python
# Métricas de operação
self.metricas = {
    "operacoes_totais": 0,
    "operacoes_sucesso": 0,
    "operacoes_falha": 0,
    "ultima_operacao": None,
    "tempo_total_operacoes": 0
}
```

Estas métricas permitem monitorar:
1. Número total de operações
2. Número de operações bem-sucedidas
3. Número de operações com falha
4. Última operação realizada
5. Tempo total gasto em operações

## Interfaces e Métodos Públicos

### Métodos Públicos

1. **processar_plano**: Processa um plano adaptado para o banco de dados
2. **conectar_bd**: Estabelece conexão com o banco de dados
3. **desconectar_bd**: Encerra a conexão com o banco de dados
4. **inicializar_tabelas**: Inicializa as tabelas no banco de dados

### Exemplo de Uso

```python
# Importar o DistribuidorBD
from backend.wrappers.distribuidor_treinos import DistribuidorBD

# Criar instância
distribuidor = DistribuidorBD()

# Conectar ao banco de dados
config_db = {
    "url": "https://seu-projeto.supabase.co",
    "api_key": "sua-api-key"
}
distribuidor.conectar_bd(config_db)

# Processar plano
resultado = distribuidor.processar_plano(plano_adaptado)

# Verificar resultado
if resultado["status"] == "success":
    print(f"Plano processado com sucesso. {resultado['comandos_executados']} comandos executados.")
else:
    print(f"Erro ao processar plano: {resultado['mensagem']}")

# Desconectar
distribuidor.desconectar_bd()
```

## Implementação Completa

A implementação completa do Wrapper 3 pode ser encontrada no arquivo `backend/wrappers/distribuidor_treinos.py`. Este arquivo contém todas as funcionalidades descritas neste documento, organizadas nas classes `TabelaMapping` e `DistribuidorBD`.

### Código-fonte Principal

```python
# Wrapper 3: Distribuidor dos Treinos para BD #

import json
import copy
import uuid
import datetime
import jsonschema
import os
import traceback
import time
from typing import Dict, Any, List, Tuple, Optional, Union
from dataclasses import dataclass, field

# Importar o WrapperLogger e PathResolver
from ..utils.logger import WrapperLogger
from ..utils.path_resolver import (
    get_schema_path,
    load_file_with_fallback
)
from ..utils.config import get_supabase_config, get_db_config
from ..wrappers.supabase_client import SupabaseWrapper

@dataclass
class TabelaMapping:
    tabela: str
    campos: List[Dict[str, str]] = field(default_factory=list)


class DistribuidorBD:
    def __init__(self, config_db: Optional[Dict[str, Any]] = None, modo_simulacao: bool = False, check_tables: bool = False):
        """
        Inicializa o Distribuidor de Treinos para o BD.
        
        Args:
            config_db (Dict, optional): Configuração de conexão com o banco de dados
            modo_simulacao (bool): Se True, opera em modo de simulação sem conexão real
            check_tables (bool): Se False (padrão), não verifica se as tabelas necessárias existem no banco de dados
        """
        # Configurar logger
        self.logger = WrapperLogger("Wrapper3_Distribuidor")
        self.logger.info("Inicializando Distribuidor BD")
        
        # Flag para controlar o modo de simulação - por padrão usa o modo normal
        self.modo_simulacao = modo_simulacao
        
        # Obter configuração de BD
        self.config_db = config_db or get_db_config()
        
        if not config_db:
            self.logger.debug("Configuração de BD não fornecida, usando configuração padrão")
        else:
            self.logger.debug("Usando configuração de BD fornecida explicitamente")
        
        try:
            self.schema = self._carregar_schema_json()
            self.logger.info("Schema JSON carregado com sucesso")
        except Exception as e:
            self.logger.error(f"Erro ao carregar schema JSON: {str(e)}")
            self.logger.warning("Criando schema básico")
            self.schema = self._criar_schema_padrao()
        
        try:
            self.mapeamento_tabelas = self._criar_mapeamento_tabelas()
            self.logger.info("Mapeamento de tabelas criado com sucesso")
            self.logger.debug(f"Tabelas mapeadas: {list(self.mapeamento_tabelas.keys())}")
        except Exception as e:
            self.logger.error(f"Erro ao criar mapeamento de tabelas: {str(e)}")
            raise
        
        # Inicializar conexão
        self.conexao_db = None
        self.supabase_client = None
        
        # Tentar estabelecer conexão com o banco se não estiver em modo simulação
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
            "tempo_total_operacoes": 0
        }
        
        # Níveis de humor atualizados para 5 níveis
        self.niveis_humor = ["muito_cansado", "cansado", "neutro", "disposto", "muito_disposto"]
        
        # Níveis de tempo disponível atualizados para 5 níveis
        self.tempos_disponiveis = ["muito_curto", "curto", "padrao", "longo", "muito_longo"]
        
        # Inicialização sem verificação automática de tabelas
        
        self.logger.info("Distribuidor BD inicializado com sucesso")
    
    # ... outros métodos da classe ...
```

## Considerações de Performance

Para garantir um bom desempenho do Wrapper 3, considere:

### 1. Otimização de Consultas

- Use índices apropriados nas tabelas do Supabase
- Limite o número de registros retornados por consulta
- Use campos de filtro adequados

### 2. Batch Processing

Para operações em massa:

```python
# Inserção em lote
if isinstance(data, list) and len(data) > 1:
    # Inserir em lotes de 100 registros
    batch_size = 100
    for i in range(0, len(data), batch_size):
        batch = data[i:i+batch_size]
        self.supabase_client.insert_data(table, batch)
```

### 3. Cacheing

Considere implementar cacheing para reduzir o número de consultas:

```python
# Cache simples
self.cache = {}

def get_with_cache(self, key, fetch_function):
    if key in self.cache:
        return self.cache[key]
    
    result = fetch_function()
    self.cache[key] = result
    return result
```

### 4. Conexão Reutilizável

Mantenha a conexão aberta para múltiplas operações:

```python
# Usar a mesma conexão para múltiplas operações
with self.get_connection() as conn:
    # Operação 1
    # Operação 2
    # ...
```

## Testes

Para testar o Wrapper 3, recomenda-se:

### 1. Testes Unitários

```python
def test_preparar_plano_para_bd():
    distribuidor = DistribuidorBD(modo_simulacao=True)
    plano_adaptado = { /* ... */ }
    plano_bd = distribuidor._preparar_plano_para_bd(plano_adaptado)
    
    assert "treinamento_id" in plano_bd
    assert "operacao" in plano_bd
    assert "timestamp" in plano_bd
    # ... outras assertions
```

### 2. Testes de Integração

```python
def test_processar_plano():
    distribuidor = DistribuidorBD(modo_simulacao=True)
    plano_adaptado = { /* ... */ }
    resultado = distribuidor.processar_plano(plano_adaptado)
    
    assert resultado["status"] == "simulated"
    assert "comandos" in resultado
    assert len(resultado["comandos"]) > 0
    # ... outras assertions
```

### 3. Mocks e Stubs

```python
def test_executar_comandos_db_com_mock():
    distribuidor = DistribuidorBD()
    
    # Mock do supabase_client
    mock_supabase = MagicMock()
    mock_supabase.insert_data.return_value = {"status": "success", "data": [{"id": 1}]}
    distribuidor.supabase_client = mock_supabase
    
    comandos = [
        {"tabela": "Fato_Treinamento", "operacao": "INSERT", "dados": {"nome": "Teste"}}
    ]
    
    resultado = distribuidor._executar_comandos_db(comandos)
    
    assert resultado["status"] == "success"
    assert resultado["comandos_executados"] == 1
    # ... outras assertions
```

## Glossário

- **Wrapper**: Camada de abstração que encapsula funcionalidades
- **Supabase**: Plataforma de backend como serviço baseada em PostgreSQL
- **Schema**: Estrutura que define o formato e as regras de um documento JSON
- **Mapeamento**: Relação entre campos de origem e destino
- **CRUD**: Create, Read, Update, Delete - operações básicas em banco de dados
- **Retry**: Tentativa repetida de uma operação que falhou
- **Fallback**: Alternativa em caso de falha
- **Modo de Simulação**: Modo de operação que simula interações com o banco de dados
- **JSON Path**: Caminho para acessar um valor em um documento JSON
- **Validação**: Verificação de conformidade com regras e estruturas predefinidas

---

Este relatório técnico fornece todas as informações necessárias para recriar o Wrapper 3 (Distribuidor BD) do projeto FORCA. A implementação seguindo essas diretrizes garantirá uma integração perfeita com os outros componentes do sistema e operação eficiente com o banco de dados Supabase.
