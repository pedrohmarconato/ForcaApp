# Relatório Técnico: Treinador Especialista (Wrapper 1)

## 1. Visão Geral

O **Treinador Especialista** (Wrapper 1) é um componente fundamental da arquitetura do sistema FORCA, responsável pela geração de planos de treinamento personalizados. Este módulo encapsula a comunicação com a API Claude (Anthropic) e transforma as interações com a IA em um plano de treino estruturado seguindo um formato específico de dados.

Este relatório detalha todos os aspectos necessários para recriar este componente com fidelidade, mantendo suas funcionalidades e padrões de integração.

## 2. Propósito e Responsabilidades

O Wrapper 1 tem como responsabilidades principais:

- Comunicar-se com a API Claude de forma padronizada
- Transformar dados do usuário em prompts estruturados
- Validar e padronizar as respostas da IA
- Garantir a geração de planos de treinamento consistentes
- Tratar falhas e implementar fallbacks
- Preparar dados para os próximos wrappers no pipeline

## 3. Arquitetura e Estrutura de Classes

```
backend/
└── wrappers/
    ├── __init__.py
    ├── treinador_especialista.py  # Implementação principal do Wrapper 1
    └── claude_client.py           # Cliente para comunicação com a API Claude
└── utils/
    ├── logger.py                  # Sistema de logging utilizado pelo wrapper
    ├── config.py                  # Configurações e carregamento de variáveis
    └── path_resolver.py           # Utilitário para resolução de caminhos
```

### Diagrama de Classes

```
┌─────────────────────┐      ┌─────────────────┐
│ TreinadorEspecialista│─────▶│  ClaudeWrapper  │
└─────────────────────┘      └─────────────────┘
         │                           │
         │                           │
         ▼                           ▼
┌─────────────────────┐      ┌─────────────────┐
│    WrapperLogger    │      │  Config Utils   │
└─────────────────────┘      └─────────────────┘
```

## 4. Fluxo de Operação

O fluxo de execução do Treinador Especialista segue estas etapas:

1. Inicialização com configurações e carregamento de recursos
2. Recebimento dos dados do usuário
3. Transformação dos dados em um prompt estruturado
4. Envio da requisição para a API Claude
5. Processamento da resposta
6. Extração e validação do JSON retornado
7. Aplicação de correções e fallbacks quando necessário
8. Retorno do plano de treinamento validado

## 5. Implementação Detalhada

### 5.1 Classe Principal: `TreinadorEspecialista`

```python
class TreinadorEspecialista:
    def __init__(self, api_key: str, api_url: str = "https://api.anthropic.com/v1/messages"):
        """
        Inicializa o wrapper do Treinador Especialista.
        
        Args:
            api_key (str): Chave de API para o serviço Claude
            api_url (str): URL da API Claude
        """
        # Configuração do logger
        self.logger = WrapperLogger("Wrapper1_Treinador")
        
        # Configurações da API
        self.api_key = api_key
        self.api_url = api_url
        
        # Carregamento de recursos necessários
        self.prompt_template = self._carregar_prompt()
        self.schema = self._carregar_schema_json()
```

### 5.2 Método Principal: `criar_plano_treinamento`

Este é o método principal que orquestra o fluxo completo:

```python
def criar_plano_treinamento(self, dados_usuario: Dict[str, Any]) -> Dict[str, Any]:
    """
    Cria um plano de treinamento personalizado usando a API Claude.
    
    Args:
        dados_usuario (Dict): Dados do usuário para personalizar o treino
        
    Returns:
        Dict: Plano de treinamento no formato JSON
    """
    # Geração de metadados do plano
    treinamento_id = str(uuid.uuid4())
    versao = "1.0"
    data_criacao = datetime.datetime.now().isoformat()
    
    # Preparação do prompt para a API Claude
    prompt_completo = self._preparar_prompt(dados_usuario)
    
    # Requisição para a API Claude
    resposta_json = self._fazer_requisicao_claude(prompt_completo)
    
    # Extração e processamento do JSON da resposta
    plano_treinamento = self._extrair_json_da_resposta(resposta_json)
    
    # Adição de metadados
    plano_treinamento["treinamento_id"] = treinamento_id
    plano_treinamento["versao"] = versao
    plano_treinamento["data_criacao"] = data_criacao
    plano_treinamento["usuario"]["id"] = dados_usuario.get("id", str(uuid.uuid4()))
    
    # Validação do plano
    plano_validado = self._validar_plano(plano_treinamento)
    
    return plano_validado
```

## 6. Componentes Críticos

### 6.1 Preparação de Prompt

O método `_preparar_prompt` é crucial pois determina a qualidade da saída da IA:

```python
def _preparar_prompt(self, dados_usuario: Dict[str, Any]) -> str:
    # Extração de informações do usuário
    nome = dados_usuario.get("nome", "")
    idade = dados_usuario.get("idade", "")
    data_nascimento = dados_usuario.get("data_nascimento", "")
    peso = dados_usuario.get("peso", "")
    altura = dados_usuario.get("altura", "")
    genero = dados_usuario.get("genero", "")
    nivel = dados_usuario.get("nivel", "iniciante")
    historico_treino = dados_usuario.get("historico_treino", "")
    tempo_treino = dados_usuario.get("tempo_treino", 60)
    disponibilidade_semanal = dados_usuario.get("disponibilidade_semanal", 3)
    dias_disponiveis = dados_usuario.get("dias_disponiveis", [])
    cardio = dados_usuario.get("cardio", "não")
    alongamento = dados_usuario.get("alongamento", "não")
    conversa_chat = dados_usuario.get("conversa_chat", "")
    objetivos = dados_usuario.get("objetivos", [])
    restricoes = dados_usuario.get("restricoes", [])
    lesoes = dados_usuario.get("lesoes", [])
    
    # Formatações especiais
    objetivos_str = "\n".join([f"- {obj.get('nome', '')} (Prioridade: {obj.get('prioridade', '')})" for obj in objetivos])
    restricoes_str = "\n".join([f"- {rest.get('nome', '')}, Gravidade: {rest.get('gravidade', '')}" for rest in restricoes])
    lesoes_str = "\n".join([f"- {lesao.get('regiao', '')}, Gravidade: {lesao.get('gravidade', '')}, Obs: {lesao.get('observacoes', '')}" for lesao in lesoes])
    dias_str = ", ".join(dias_disponiveis) if dias_disponiveis else "Não especificado"
    
    # Construção do contexto
    contexto = f"""
    Dados do Usuário:
    Nome: {nome}
    Idade: {idade}
    Data de Nascimento: {data_nascimento}
    Peso: {peso} kg
    Altura: {altura} cm
    Gênero: {genero}
    Nível: {nivel}
    Histórico de Treino: {historico_treino}
    Tempo disponível por sessão: {tempo_treino} minutos
    Dias disponíveis para treino: {dias_str}
    Disponibilidade semanal: {disponibilidade_semanal} dias
    Incluir cardio: {cardio}
    Incluir alongamento: {alongamento}
    Data de início do plano: {data_inicio}
    
    Objetivos:
    {objetivos_str}
    
    Restrições:
    {restricoes_str}
    
    Lesões:
    {lesoes_str}
    
    Informações adicionais do chat:
    {conversa_chat}
    
    INSTRUÇÕES ESPECÍFICAS:
    1. Crie um plano de treinamento detalhado para EXATAMENTE 12 semanas.
    2. Organize os treinos nos dias da semana que o usuário selecionou: {dias_str}.
    3. Cada treino deve incluir exercícios específicos, número de séries e repetições.
    4. Especifique a % de 1RM para cada exercício, exceto para o primeiro treino onde será testada a força máxima.
    5. Se o usuário solicitou cardio ({cardio}) ou alongamento ({alongamento}), inclua-os no plano de 12 semanas.
    6. O plano deve começar em {data_inicio}.
    
    Agora, crie um plano de treinamento completo para este usuário seguindo exatamente o formato JSON abaixo:
    
    ```json
    {self._obter_template_json()}
    ```
    
    Preencha todos os campos necessários e retorne apenas o JSON válido.
    """
    
    prompt_final = f"{self.prompt_template}\n\n{contexto}"
    return prompt_final
```

### 6.2 Comunicação com a API Claude

A comunicação com a API é gerenciada pelo método `_fazer_requisicao_claude`:

```python
def _fazer_requisicao_claude(self, prompt: str) -> Dict[str, Any]:
    headers = {
        "anthropic-version": "2023-06-01",
        "x-api-key": self.api_key.strip(),
        "content-type": "application/json"
    }
    
    data = {
        "model": "claude-3-opus-20240229",
        "max_tokens": 4000,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    
    try:
        response = requests.post(self.api_url, headers=headers, json=data)
        
        if response.status_code != 200:
            # Tratamento de erro e fallback
            # ...código de fallback...
            
        return response.json()
    
    except Exception as e:
        # Tratamento de exceções e fallback
        # ...código de fallback...
```

### 6.3 Extração e Validação de JSON

```python
def _extrair_json_da_resposta(self, resposta: Dict[str, Any]) -> Dict[str, Any]:
    try:
        conteudo = resposta.get("content", [])
        texto_completo = ""
        
        # Extrair texto da resposta
        for item in conteudo:
            if isinstance(item, dict):
                texto_completo += item.get("text", "")
            elif isinstance(item, str):
                texto_completo += item
        
        # Buscar blocos JSON
        import re
        json_blocks = re.findall(r'```json(.*?)```', texto_completo, re.DOTALL)
        
        if json_blocks:
            json_text = json_blocks[0].strip()
        else:
            # Tentar extrair JSON diretamente do texto
            json_pattern = re.compile(r'\{(?:[^{}]|(?:\{[^{}]*\}))*\}')
            matches = json_pattern.findall(texto_completo)
            
            if matches:
                json_text = max(matches, key=len)
            else:
                raise ValueError("Nenhum JSON encontrado na resposta")
        
        # Converter para objeto Python
        json_obj = json.loads(json_text)
        
        return json_obj
        
    except Exception as e:
        # Fallback em caso de falha na extração
        return self._criar_estrutura_completa_basica()
```

## 7. Sistema de Templates e Prompts

O wrapper utiliza templates pré-definidos tanto para o prompt quanto para a estrutura esperada da resposta:

### 7.1 Template do Prompt Principal

```
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
```

### 7.2 Template JSON de Resposta

```json
{
  "treinamento_id": "",
  "versao": "",
  "data_criacao": "",
  "usuario": {
    "id": "",
    "nome": "",
    "nivel": "",
    "objetivos": [
      {
        "objetivo_id": "",
        "nome": "",
        "prioridade": null
      }
    ],
    "restricoes": [
      {
        "restricao_id": "",
        "nome": "",
        "gravidade": ""
      }
    ]
  },
  "plano_principal": {
    "nome": "",
    "descricao": "",
    "periodizacao": {
      "tipo": "",
      "descricao": ""
    },
    "duracao_semanas": null,
    "frequencia_semanal": null,
    "ciclos": [
      {
        "ciclo_id": "",
        "nome": "",
        "ordem": null,
        "duracao_semanas": null,
        "objetivo": "",
        "microciclos": [
          {
            "semana": null,
            "volume": "",
            "intensidade": "",
            "foco": "",
            "sessoes": [
              {
                "sessao_id": "",
                "nome": "",
                "tipo": "",
                "duracao_minutos": null,
                "nivel_intensidade": null,
                "dia_semana": null,
                "grupos_musculares": [
                  {
                    "grupo_id": "",
                    "nome": "",
                    "prioridade": null
                  }
                ],
                "exercicios": [
                  {
                    "exercicio_id": "",
                    "nome": "",
                    "ordem": null,
                    "equipamento": "",
                    "series": null,
                    "repeticoes": "",
                    "percentual_rm": null,
                    "tempo_descanso": null,
                    "cadencia": "",
                    "metodo": "",
                    "progressao": [
                      {
                        "semana": null,
                        "ajuste": ""
                      }
                    ],
                    "observacoes": ""
                  }
                ],
                "aquecimento": {
                  "duracao_minutos": null,
                  "exercicios": []
                },
                "desaquecimento": {
                  "duracao_minutos": null,
                  "exercicios": []
                }
              }
            ]
          }
        ]
      }
    ],
    "metricas": {
      "calorias_estimadas": null,
      "nivel_fadiga_esperado": null,
      "tempo_recuperacao_horas": null
    }
  }
}
```

## 8. Gerenciamento de Erros e Fallbacks

Uma das características mais importantes do Treinador Especialista é sua robustez através de um extensivo sistema de fallbacks:

```python
def _criar_estrutura_completa_basica(self) -> Dict[str, Any]:
    """
    Cria uma estrutura básica completa de plano de treinamento para casos de fallback.
    
    Returns:
        Dict: Estrutura básica completa do plano
    """
    return {
        "usuario": {
            "id": str(uuid.uuid4()),
            "nome": "Usuário Fallback",
            "nivel": "intermediário",
            "objetivos": [{"objetivo_id": str(uuid.uuid4()), "nome": "Condicionamento", "prioridade": 1}],
            "restricoes": []
        },
        "plano_principal": {
            "nome": "Plano Básico (Fallback)",
            "descricao": "Plano gerado como fallback devido a erro na extração do JSON",
            "periodizacao": {"tipo": "linear", "descricao": "Progressão básica"},
            "duracao_semanas": 12,
            "frequencia_semanal": 3,
            "ciclos": [
                {
                    "ciclo_id": str(uuid.uuid4()),
                    "nome": "Ciclo Único",
                    "ordem": 1,
                    "duracao_semanas": 12,
                    "objetivo": "Condicionamento geral",
                    "microciclos": [
                        {
                            "semana": 1,
                            "volume": "médio",
                            "intensidade": "média",
                            "foco": "Adaptação",
                            "sessoes": [
                                {
                                    "sessao_id": str(uuid.uuid4()),
                                    "nome": "Treino Geral",
                                    "tipo": "resistência",
                                    "duracao_minutos": 60,
                                    "nivel_intensidade": 5,
                                    "dia_semana": 1,
                                    "grupos_musculares": [],
                                    "exercicios": [
                                        {
                                            "exercicio_id": str(uuid.uuid4()),
                                            "nome": "Agachamento",
                                            "ordem": 1,
                                            "equipamento": "Barra",
                                            "series": 3,
                                            "repeticoes": "10",
                                            "percentual_rm": 70,
                                            "tempo_descanso": 60,
                                            "cadencia": "2-0-2",
                                            "metodo": "normal",
                                            "progressao": [],
                                            "observacoes": "Fallback exercise"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
```

## 9. Sistema de Validação

O wrapper implementa validação completa contra um schema JSON para garantir a qualidade dos dados:

```python
def _validar_plano(self, plano: Dict[str, Any]) -> Dict[str, Any]:
    """
    Valida o plano de treinamento contra o schema esperado.
    
    Args:
        plano (Dict): Plano de treinamento
        
    Returns:
        Dict: Plano validado
    """
    try:
        jsonschema.validate(instance=plano, schema=self.schema)
        return plano
        
    except jsonschema.exceptions.ValidationError as e:
        # Log detalhado do erro
        erro_path = ".".join([str(p) for p in e.path])
        self.logger.error(f"Erro de validação em: {erro_path}")
        
        # Tentativa de correção automática
        plano_corrigido = self._tentar_corrigir_erros(plano, e)
        
        try:
            jsonschema.validate(instance=plano_corrigido, schema=self.schema)
            return plano_corrigido
        except jsonschema.exceptions.ValidationError:
            # Se a correção falhar, lançar erro
            raise ValueError("Falha na validação do plano de treinamento")
```

## 10. Integração com o Wrapper 2

O Treinador Especialista foi projetado para integrar diretamente com o Wrapper 2 (Sistema de Adaptação):

```python
def enviar_para_wrapper2(self, plano: Dict[str, Any], wrapper2) -> Dict[str, Any]:
    """
    Envia o plano validado para o wrapper 2.
    
    Args:
        plano (Dict): Plano de treinamento validado
        wrapper2: Instância do wrapper2
        
    Returns:
        Dict: Resultado do processamento do wrapper2
    """
    try:
        resultado = wrapper2.processar_plano(plano)
        return resultado
    except Exception as e:
        # Tratamento de erro na integração
        raise
```

## 11. Exemplo de Saída

Um exemplo simplificado da saída produzida pelo Treinador Especialista:

```json
{
  "treinamento_id": "34d61972-6f03-4b15-80a6-e590f29be82e",
  "versao": "1.0",
  "data_criacao": "2025-03-25T13:24:07.477403",
  "usuario": {
    "id": "user123",
    "nome": "João Silva",
    "nivel": "intermediário",
    "objetivos": [
      {
        "objetivo_id": "OBJ-01",
        "nome": "Hipertrofia",
        "prioridade": 1
      }
    ],
    "restricoes": [
      {
        "restricao_id": "RES-01",
        "nome": "Dor no joelho",
        "gravidade": "moderada"
      }
    ]
  },
  "plano_principal": {
    "nome": "Plano Hipertrofia João Silva",
    "descricao": "Plano de 12 semanas para ganho de massa muscular focado em membros superiores.",
    "periodizacao": {
      "tipo": "Linear",
      "descricao": "Periodização linear com aumento progressivo de carga."
    },
    "duracao_semanas": 12,
    "frequencia_semanal": 4,
    "ciclos": [
      {
        "ciclo_id": "CIC-01",
        "nome": "Ciclo Hipertrofia 1",
        "ordem": 1,
        "duracao_semanas": 4,
        "objetivo": "Hipertrofia",
        "microciclos": [
          {
            "semana": 1,
            "volume": "Moderado",
            "intensidade": "Leve",
            "foco": "Adaptação",
            "sessoes": [
              {
                "sessao_id": "SES-01",
                "nome": "Treino A",
                "tipo": "Fullbody",
                "duracao_minutos": 60,
                "nivel_intensidade": 6,
                "dia_semana": "segunda",
                "grupos_musculares": [
                  {
                    "grupo_id": "GP-01",
                    "nome": "Peitoral",
                    "prioridade": 1
                  }
                ],
                "exercicios": [
                  {
                    "exercicio_id": "EX-01",
                    "nome": "Supino Reto",
                    "ordem": 1,
                    "equipamento": "Barra",
                    "series": 3,
                    "repeticoes": "8-12",
                    "percentual_rm": null,
                    "tempo_descanso": 60,
                    "cadencia": "2020",
                    "metodo": "Falha",
                    "progressao": [
                      {
                        "semana": 1,
                        "ajuste": "Teste de RM"
                      }
                    ],
                    "observacoes": "Amplitude completa."
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## 12. Dependências

O Treinador Especialista depende das seguintes bibliotecas e componentes:

- **Python Standard Libraries**: json, requests, uuid, datetime, traceback, typing, re
- **Bibliotecas Externas**: jsonschema, anthropic
- **Componentes Internos**: 
  - WrapperLogger (sistema de logging)
  - Configurações (config.py)
  - Resolvedor de Caminhos (path_resolver.py)

## 13. Recomendações para Recriação

Ao recriar o Treinador Especialista, considere os seguintes pontos:

1. **Modularidade** - Mantenha a separação de responsabilidades entre preparação de prompt, comunicação com API, e processamento de resposta

2. **Robustez** - Implemente todos os mecanismos de fallback para garantir que o sistema nunca falhe completamente

3. **Validação** - Utilize validação de schema para garantir a qualidade dos dados

4. **Logging** - Mantenha um sistema de logging detalhado para facilitar o diagnóstico de problemas

5. **Configuração** - Separe as configurações do código para facilitar alterações

6. **Templates** - Utilize um sistema de templates para os prompts e estruturas JSON

7. **Integração** - Projete para integração fácil com o Wrapper 2

## 14. Implementação de Referência

```python
import json
import requests
import uuid
import datetime
import traceback
from typing import Dict, Any, Optional

class TreinadorEspecialista:
    def __init__(self, api_key: str, api_url: str = "https://api.anthropic.com/v1/messages"):
        # Inicializações básicas
        self.api_key = api_key
        self.api_url = api_url
        
        # Carregar recursos
        self.prompt_template = self._carregar_prompt()
        self.schema = self._carregar_schema_json()
    
    def criar_plano_treinamento(self, dados_usuario: Dict[str, Any]) -> Dict[str, Any]:
        # Identificadores únicos
        treinamento_id = str(uuid.uuid4())
        
        # Preparar dados para API
        prompt = self._preparar_prompt(dados_usuario)
        
        # Fazer requisição
        resposta = self._fazer_requisicao_claude(prompt)
        
        # Processar resposta
        plano = self._extrair_json_da_resposta(resposta)
        
        # Adicionar metadados
        plano["treinamento_id"] = treinamento_id
        plano["versao"] = "1.0"
        plano["data_criacao"] = datetime.datetime.now().isoformat()
        
        # Validar plano
        plano_validado = self._validar_plano(plano)
        
        return plano_validado
```

## 15. Conclusão

O Treinador Especialista (Wrapper 1) é um componente sofisticado e fundamental no sistema FORCA. Sua capacidade de traduzir dados de usuário em planos de treinamento estruturados através de comunicação com IA o torna o ponto de partida para toda a geração de conteúdo personalizado no aplicativo.

A recriação deste componente deve seguir estritamente as especificações detalhadas neste relatório para garantir compatibilidade com o restante do sistema e qualidade na geração dos planos de treinamento.

---

*Este relatório foi preparado para auxiliar na recriação do Wrapper 1 (Treinador Especialista) do sistema FORCA.*
