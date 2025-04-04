# backend/wrappers/sistema_adaptacao_treino.py
import json
import copy
import uuid
import datetime
import traceback
import math
from typing import Dict, Any, List, Optional

# --- Dependências e Componentes Internos ---
# (Manter as importações e fallbacks de jsonschema e WrapperLogger da versão anterior)
try:
    import jsonschema
except ImportError:
    print("ERRO: Dependência 'jsonschema' não encontrada. Execute: pip install jsonschema")
    class MockJsonschema:
        def validate(self, *args, **kwargs): pass
        class exceptions: class ValidationError(Exception): pass
    jsonschema = MockJsonschema()
    print("AVISO: Usando mock para 'jsonschema'.")

try:
    from backend.utils.logger import WrapperLogger
except ImportError:
     try: from ..utils.logger import WrapperLogger
     except ImportError:
          import logging
          class WrapperLogger:
              def __init__(self, name): self.logger = logging.getLogger(name); self.logger.addHandler(logging.StreamHandler()); self.logger.setLevel(logging.INFO)
              def info(self, msg): self.logger.info(msg)
              def warning(self, msg): self.logger.warning(msg)
              def error(self, msg, exc_info=None): self.logger.error(msg, exc_info=exc_info)
              def debug(self, msg): self.logger.debug(msg)
          print("AVISO: Usando logger básico de fallback.")


class SistemaAdaptacao:
    """
    Wrapper 2: Gera uma matriz de adaptações (Humor x Tempo) para cada sessão
    de um plano de treinamento, usando regras pré-definidas baseadas
    em princípios de treinamento físico.
    """

    def __init__(self):
        self.logger = WrapperLogger("Wrapper2_Adaptacao_Matrix")
        self.logger.info("Inicializando SistemaAdaptacao (Matrix)...")
        self.schema_output = self._carregar_schema_json_output()
        self.niveis_humor = ["muito_cansado", "cansado", "neutro", "disposto", "muito_disposto"]
        self.tempos_disponiveis = ["muito_curto", "curto", "padrao", "longo", "muito_longo"]
        self.logger.info("SistemaAdaptacao (Matrix) inicializado.")

    def _carregar_schema_json_output(self) -> Dict[str, Any]:
        """
        Define o schema JSON DETALHADO para validar a SAÍDA deste wrapper,
        incluindo a estrutura da matriz de adaptações.
        """
        self.logger.debug("Definindo schema JSON de saída detalhado...")

        # Definição da estrutura de um exercício adaptado (o que pode mudar)
        schema_exercicio_adaptado = {
            "type": "object",
            "properties": {
                "exercicio_id": {"type": "string", "description": "ID do exercício original."},
                "nome": {"type": "string", "description": "Nome original para referência."},
                "ordem": {"type": "integer", "description": "Ordem mantida ou ajustada."},
                "series": {"type": "integer", "minimum": 1, "description": "Número de séries adaptado."},
                "repeticoes": {"type": "string", "description": "Faixa de repetições adaptada."},
                "percentual_rm": {"type": ["number", "null"], "minimum": 0, "maximum": 100, "description": "%RM adaptado."},
                "tempo_descanso": {"type": ["integer", "string", "null"], "description": "Tempo de descanso adaptado."},
                "metodo": {"type": ["string", "null"], "description": "Método de intensidade sugerido/removido."},
                "observacoes": {"type": ["string", "null"], "description": "Observações específicas da adaptação."}
                # Não incluir campos que não mudam (equipamento, cadencia original) para evitar redundância? Ou incluir tudo?
                # Decisão: Incluir os campos principais que definem o estímulo adaptado.
            },
            "required": ["exercicio_id", "nome", "ordem", "series", "repeticoes"],
            "additionalProperties": True # Permite outros campos originais se necessário
        }

        # Definição da estrutura de uma adaptação específica (para uma combinação humor/tempo)
        schema_adaptacao_especifica = {
            "type": "object",
            "properties": {
                "adaptacao_id": {"type": "string", "format": "uuid"},
                "sessao_original_id": {"type": "string"},
                "nivel_humor": {"type": "string", "enum": self.niveis_humor},
                "tempo_disponivel": {"type": "string", "enum": self.tempos_disponiveis},
                "estrategia_aplicada": {"type": "string", "description": "Breve descrição da estratégia (ex: Redução de volume, Foco em intensidade)."},
                "duracao_estimada_ajustada": {"type": ["integer", "null"]},
                "nivel_intensidade_estimado_ajustado": {"type": ["integer", "null"]},
                "exercicios_adaptados": {
                    "type": "array",
                    "description": "Lista dos exercícios *mantidos* na sessão, com seus parâmetros adaptados.",
                    "items": schema_exercicio_adaptado
                },
                "exercicios_removidos_ids": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Lista de IDs dos exercícios originais que foram removidos nesta adaptação."
                }
                # Poderíamos adicionar 'exercicios_adicionados' se a lógica permitir
            },
            "required": ["adaptacao_id", "sessao_original_id", "nivel_humor", "tempo_disponivel", "estrategia_aplicada", "exercicios_adaptados", "exercicios_removidos_ids"],
            "additionalProperties": False
        }

        # Schema Principal da Saída
        schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "PlanoDeTreinamentoAdaptadoMatrixFORCA_V1.2",
            "description": "Schema para validar a estrutura do plano com matriz de adaptações (Humor x Tempo).",
            "type": "object",
            "properties": {
                "treinamento_id": {"type": "string", "format": "uuid"},
                "versao": {"type": "string"},
                "data_criacao": {"type": "string", "format": "date-time"},
                "usuario": {"type": "object", "description": "Schema do usuário (detalhar/reutilizar)"},
                "plano_principal": {"type": "object", "description": "Schema do plano principal (detalhar/reutilizar)"},
                "adaptacoes_matrix": { # Nome alterado para clareza
                    "type": "object",
                    "description": "Matriz de adaptações por sessão, indexada por sessao_original_id.",
                    "patternProperties": {
                        # A chave é o ID da sessão original (string)
                        "^[a-zA-Z0-9_-]+$": {
                            "type": "object",
                            "description": "Adaptações para uma sessão específica, aninhadas por humor e tempo.",
                            "properties": {
                                humor: {
                                    "type": "object",
                                    "properties": {
                                        tempo: schema_adaptacao_especifica # <<< Usa o schema detalhado da adaptação
                                        for tempo in self.tempos_disponiveis
                                    },
                                    "required": self.tempos_disponiveis,
                                    "additionalProperties": False
                                } for humor in self.niveis_humor
                            },
                            "required": self.niveis_humor,
                            "additionalProperties": False
                        }
                    },
                    "additionalProperties": False # Não permite outras chaves além dos IDs de sessão
                }
            },
            "required": ["treinamento_id", "versao", "data_criacao", "usuario", "plano_principal", "adaptacoes_matrix"]
        }
        self.logger.info("Schema JSON de saída DETALHADO (Matrix) definido.")
        return schema

    # --- Métodos _log_info_basica_plano e _extrair_todas_sessoes mantidos da versão anterior ---
    def _log_info_basica_plano(self, plano: Dict[str, Any]):
        try:
            user_id = plano.get("usuario", {}).get("id", "N/A"); plano_id = plano.get("treinamento_id", "N/A")
            num_ciclos = len(plano.get("plano_principal", {}).get("ciclos", [])); self.logger.info(f"Processando plano ID {plano_id} para usuário {user_id}. Ciclos: {num_ciclos}.")
        except Exception as e: self.logger.warning(f"Não foi possível logar info básica: {e}")

    def _extrair_todas_sessoes(self, plano_principal_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        self.logger.debug("Extraindo todas as sessões do plano principal...")
        todas_sessoes = []
        if not isinstance(plano_principal_data, dict): self.logger.error("Formato inválido para 'plano_principal_data'."); return todas_sessoes
        ciclos = plano_principal_data.get("ciclos", [])
        if not isinstance(ciclos, list): self.logger.warning("'ciclos' não é lista ou ausente."); ciclos = []
        for ciclo in ciclos:
            if not isinstance(ciclo, dict): continue
            ciclo_id = ciclo.get("ciclo_id") or str(uuid.uuid4()); ciclo["ciclo_id"] = ciclo_id
            microciclos = ciclo.get("microciclos", [])
            if not isinstance(microciclos, list): continue
            for microciclo in microciclos:
                if not isinstance(microciclo, dict): continue
                semana = microciclo.get("semana", 0); sessoes_micro = microciclo.get("sessoes", [])
                if not isinstance(sessoes_micro, list): continue
                for sessao_original in sessoes_micro:
                    if not isinstance(sessao_original, dict): continue
                    sessao_completa = copy.deepcopy(sessao_original)
                    sessao_id = sessao_completa.get("sessao_id") or str(uuid.uuid4()); sessao_completa["sessao_id"] = sessao_id
                    sessao_completa["_ciclo_id"] = ciclo_id; sessao_completa["_semana"] = semana
                    exercicios = sessao_completa.get("exercicios", [])
                    if isinstance(exercicios, list):
                        for i, ex in enumerate(exercicios):
                             if isinstance(ex, dict) and ("exercicio_id" not in ex or not ex["exercicio_id"]):
                                 ex["exercicio_id"] = f"{sessao_id}-ex{i+1}-{str(uuid.uuid4())[:4]}"
                    todas_sessoes.append(sessao_completa)
        self.logger.info(f"Total de {len(todas_sessoes)} sessões extraídas e IDs garantidos.")
        return todas_sessoes
    # ------------------------------------------------------------------------------------

    def _adaptar_sessao_combinada(self, sessao_original: Dict[str, Any], nivel_humor: str, tempo_disponivel: str) -> Dict[str, Any]:
        """
        Aplica regras de adaptação combinando humor e tempo.
        Retorna a estrutura da adaptação específica.
        """
        sessao_id = sessao_original.get("sessao_id", "N/A")
        self.logger.debug(f"Adaptando sessão ID {sessao_id} para Humor='{nivel_humor}', Tempo='{tempo_disponivel}'")

        adaptacao_id = str(uuid.uuid4())
        # Começa com uma cópia profunda dos exercícios originais para modificar
        exercicios_originais = sorted(copy.deepcopy(sessao_original.get("exercicios", [])), key=lambda x: x.get("ordem", float('inf')))
        exercicios_adaptados = [] # Lista final de exercícios mantidos/adaptados
        exercicios_removidos_ids = []

        # --- Fatores de Modificação Base (podem ser ajustados pela combinação) ---
        # Humor
        mod_volume_humor = {"muito_cansado": -0.4, "cansado": -0.2, "neutro": 0.0, "disposto": 0.15, "muito_disposto": 0.3}
        mod_intensidade_humor = {"muito_cansado": -0.15, "cansado": -0.07, "neutro": 0.0, "disposto": 0.05, "muito_disposto": 0.1} # Modifica %RM
        mod_descanso_humor = {"muito_cansado": 1.3, "cansado": 1.15, "neutro": 1.0, "disposto": 0.9, "muito_disposto": 0.8} # Multiplicador

        # Tempo (afeta principalmente número de exercícios e descanso)
        num_ex_tempo = {"muito_curto": 2, "curto": 3, "padrao": len(exercicios_originais), "longo": len(exercicios_originais) + 1, "muito_longo": len(exercicios_originais) + 2}
        mod_descanso_tempo = {"muito_curto": 0.5, "curto": 0.7, "padrao": 1.0, "longo": 1.0, "muito_longo": 1.0}
        sugestao_tecnica_tempo = {"muito_curto": "Circuito/Superset", "curto": "Superset Antagonista", "padrao": None, "longo": None, "muito_longo": "Drop-set/Rest-pause"}

        # --- Lógica Combinada ---
        estrategia = []
        num_ex_final = min(len(exercicios_originais), num_ex_tempo[tempo_disponivel]) # Começa com o limite de tempo

        # Ajuste de intensidade (%RM) - Combina humor
        intensidade_mod_final = mod_intensidade_humor[nivel_humor]
        if intensidade_mod_final != 0.0:
            estrategia.append(f"Intensidade ({'reduzida' if intensidade_mod_final < 0 else 'aumentada'}) devido ao humor.")

        # Ajuste de volume (Séries) - Combina humor
        volume_mod_final = mod_volume_humor[nivel_humor]
        if volume_mod_final != 0.0:
             estrategia.append(f"Volume ({'reduzido' if volume_mod_final < 0 else 'aumentado'}) devido ao humor.")

        # Ajuste de descanso - Combina ambos (pega o mais restritivo/modificador maior)
        descanso_mult = min(mod_descanso_humor[nivel_humor], mod_descanso_tempo[tempo_disponivel]) # Ex: se cansado (1.15) e curto (0.7), usa 0.7
        if descanso_mult != 1.0:
             estrategia.append(f"Descanso {'reduzido' if descanso_mult < 1.0 else 'aumentado'}.")

        # Seleção de Exercícios - Prioriza tempo, mas humor pode remover mais
        if nivel_humor in ["muito_cansado", "cansado"] and tempo_disponivel not in ["muito_curto", "curto"]:
            # Se cansado mas com tempo, reduz o número de exercícios além do padrão
            num_ex_final = max(2, math.ceil(num_ex_final * (0.6 if nivel_humor == "muito_cansado" else 0.8)))
            estrategia.append("Número de exercícios reduzido devido ao cansaço.")
        elif nivel_humor in ["disposto", "muito_disposto"] and tempo_disponivel in ["longo", "muito_longo"]:
             # Se disposto e com tempo, permite adicionar mais que o padrão de tempo
             num_ex_final = num_ex_tempo[tempo_disponivel] # Usa o limite superior do tempo
             estrategia.append("Exercícios adicionais incluídos.")
        elif tempo_disponivel in ["muito_curto", "curto"]:
             estrategia.append("Foco nos exercícios principais devido ao tempo.")

        # Aplica as regras aos exercícios selecionados
        exercicios_selecionados = exercicios_originais[:num_ex_final]
        exercicios_removidos_ids = [ex.get("exercicio_id") for ex in exercicios_originais[num_ex_final:] if ex.get("exercicio_id")]

        for ex in exercicios_selecionados:
            ex_adaptado = copy.deepcopy(ex) # Modifica a cópia

            # 1. Ajustar Séries (baseado no volume_mod_final)
            series_orig = ex.get("series", 3)
            series_nova = max(1, math.ceil(series_orig * (1 + volume_mod_final)))
            ex_adaptado["series"] = series_nova

            # 2. Ajustar %RM (baseado no intensidade_mod_final)
            rm_orig = ex.get("percentual_rm")
            if rm_orig is not None:
                rm_novo = max(30, min(100, round(rm_orig * (1 + intensidade_mod_final)))) # Limites 30-100
                ex_adaptado["percentual_rm"] = rm_novo
            else:
                ex_adaptado["percentual_rm"] = None # Mantém null se original era null

            # 3. Ajustar Descanso (baseado no descanso_mult)
            descanso_orig = ex.get("tempo_descanso", "60s") # Assume 60s se não especificado
            descanso_novo = descanso_orig # Default
            try:
                if isinstance(descanso_orig, int):
                    descanso_novo = max(15, math.ceil(descanso_orig * descanso_mult)) # Min 15s
                elif isinstance(descanso_orig, str) and 's' in descanso_orig:
                    segundos = int(descanso_orig.replace('s','').strip())
                    descanso_novo = f"{max(15, math.ceil(segundos * descanso_mult))}s"
            except ValueError: pass # Mantém original se não conseguir parsear
            ex_adaptado["tempo_descanso"] = descanso_novo

            # 4. Sugerir Método (baseado em tempo e humor)
            metodo_sugerido = None
            if tempo_disponivel in ["muito_curto", "curto"]:
                metodo_sugerido = sugestao_tecnica_tempo[tempo_disponivel]
            elif nivel_humor == "muito_disposto" and tempo_disponivel in ["longo", "muito_longo"]:
                 # Adiciona chance de sugerir técnica avançada se muito disposto e com tempo
                 if ex.get("ordem", 0) % 3 == 0: # Exemplo: no 3º, 6º exercício...
                     metodo_sugerido = sugestao_tecnica_tempo["muito_longo"]

            ex_adaptado["metodo"] = metodo_sugerido
            ex_adaptado["observacoes"] = f"Adaptado para: {nivel_humor}, {tempo_disponivel}. {ex.get('observacoes','')}".strip()

            # Remove campos internos antes de adicionar
            ex_adaptado.pop("_ciclo_id", None)
            ex_adaptado.pop("_semana", None)
            exercicios_adaptados.append(ex_adaptado)

        # Calcular duração e intensidade estimadas (simplificado)
        # Uma lógica mais precisa consideraria séries, reps, descanso de cada ex adaptado
        duracao_estimada = math.ceil(sessao_original.get("duracao_minutos", 60) * (1 + volume_mod_final) * (descanso_mult))
        intensidade_estimada = max(1, min(10, math.ceil(sessao_original.get("nivel_intensidade", 5) * (1 + intensidade_mod_final))))

        # Monta o objeto final da adaptação
        adaptacao_final = {
            "adaptacao_id": adaptacao_id,
            "sessao_original_id": sessao_id,
            "nivel_humor": nivel_humor,
            "tempo_disponivel": tempo_disponivel,
            "estrategia_aplicada": ", ".join(estrategia) if estrategia else "Execução padrão.",
            "duracao_estimada_ajustada": duracao_estimada,
            "nivel_intensidade_estimado_ajustado": intensidade_estimada,
            "exercicios_adaptados": exercicios_adaptados,
            "exercicios_removidos_ids": exercicios_removidos_ids
        }
        return adaptacao_final

    def _criar_adaptacoes_matrix(self, plano_principal: Dict[str, Any]) -> Dict[str, Any]:
        """
        Cria a matriz completa de adaptações (Humor x Tempo) para cada sessão.
        Retorna um dicionário indexado pelo ID da sessão original.
        """
        adaptacoes_matrix = {}
        plano_principal_data = plano_principal.get("plano_principal")
        if not plano_principal_data: return adaptacoes_matrix

        try:
            todas_sessoes = self._extrair_todas_sessoes(plano_principal_data)
            if not todas_sessoes: return adaptacoes_matrix
        except Exception as e:
            self.logger.error(f"Erro ao extrair sessões para matriz: {e}", exc_info=True)
            return adaptacoes_matrix

        self.logger.info(f"Gerando matriz de adaptações para {len(todas_sessoes)} sessões...")
        for sessao in todas_sessoes:
            sessao_id = sessao.get("sessao_id")
            if not sessao_id:
                self.logger.warning("Sessão sem ID encontrada, pulando.")
                continue

            adaptacoes_matrix[sessao_id] = {}
            for humor in self.niveis_humor:
                adaptacoes_matrix[sessao_id][humor] = {}
                for tempo in self.tempos_disponiveis:
                    try:
                        adaptacao_combinada = self._adaptar_sessao_combinada(sessao, humor, tempo)
                        adaptacoes_matrix[sessao_id][humor][tempo] = adaptacao_combinada
                    except Exception as e:
                         self.logger.error(f"Erro ao gerar adaptação combinada para Sessão {sessao_id}, Humor {humor}, Tempo {tempo}: {e}", exc_info=True)
                         # Adiciona um placeholder de erro ou omite? Omitir por enquanto.
                         adaptacoes_matrix[sessao_id][humor][tempo] = {
                             "adaptacao_id": str(uuid.uuid4()), "sessao_original_id": sessao_id,
                             "nivel_humor": humor, "tempo_disponivel": tempo,
                             "estrategia_aplicada": f"Erro ao gerar adaptação: {e}",
                             "exercicios_adaptados": [], "exercicios_removidos_ids": []
                         } # Placeholder de erro

        self.logger.info("Matriz de adaptações gerada.")
        return adaptacoes_matrix

    def _validar_plano(self, plano_adaptado: Dict[str, Any]) -> Dict[str, Any]:
        """Valida o plano adaptado completo contra o schema de saída esperado."""
        self.logger.info("Validando estrutura do plano adaptado completo...")
        try:
            jsonschema.validate(instance=plano_adaptado, schema=self.schema_output)
            self.logger.info("Validação do schema JSON de saída bem-sucedida.")
            return plano_adaptado
        except jsonschema.exceptions.ValidationError as e:
            self.logger.error(f"Erro de validação do schema JSON de SAÍDA: {e.message} em {list(e.path)}", exc_info=False)
            self.logger.warning("Retornando plano adaptado SEM validação devido a erro.")
            return plano_adaptado # Retorna mesmo com erro
        except Exception as e:
            self.logger.error(f"Erro inesperado durante a validação: {e}", exc_info=True)
            self.logger.warning("Retornando plano adaptado SEM validação devido a erro inesperado.")
            return plano_adaptado

    # --- Método Principal de Orquestração ---
    def processar_plano(self, plano_principal: Dict[str, Any]) -> Dict[str, Any]:
        """Processa o plano principal recebido e cria a matriz de adaptações."""
        plano_id = plano_principal.get('treinamento_id', 'N/A')
        self.logger.info(f"Iniciando processamento e adaptação (Matrix) do plano ID: {plano_id}")
        self._log_info_basica_plano(plano_principal)

        plano_final_com_adaptacoes = {
            "treinamento_id": plano_id if plano_id != 'N/A' else str(uuid.uuid4()),
            "versao": plano_principal.get("versao", "1.0") + "-adaptado", # Indica que tem adaptações
            "data_criacao": plano_principal.get("data_criacao", datetime.datetime.now().isoformat()),
            "usuario": copy.deepcopy(plano_principal.get("usuario", {})),
            "plano_principal": copy.deepcopy(plano_principal.get("plano_principal", {})),
            "adaptacoes_matrix": {} # Será preenchido
        }

        try:
            matriz_adaptacoes = self._criar_adaptacoes_matrix(plano_principal)
            plano_final_com_adaptacoes["adaptacoes_matrix"] = matriz_adaptacoes
            # Logar resumo (contar total de adaptações geradas)
            total_adaptacoes = sum(len(tempo_dict) for humor_dict in matriz_adaptacoes.values() for tempo_dict in humor_dict.values())
            self.logger.info(f"Total de {total_adaptacoes} adaptações combinadas geradas na matriz.")
        except Exception as e:
            self.logger.error(f"Erro crítico ao gerar matriz de adaptações para {plano_id}: {e}", exc_info=True)
            plano_final_com_adaptacoes["adaptacoes_matrix"] = {} # Matriz vazia em caso de erro

        plano_validado = self._validar_plano(plano_final_com_adaptacoes)
        self.logger.info(f"Processamento e adaptação (Matrix) concluídos para o plano ID: {plano_validado.get('treinamento_id', 'N/A')}")
        return plano_validado

    # --- Placeholder para Integração Futura ---
    def enviar_para_wrapper3(self, plano_adaptado: Dict[str, Any], wrapper3_instance) -> Optional[Dict[str, Any]]:
        self.logger.warning("Integração com Wrapper 3 ainda não implementada.")
        return {"status": "enviado_placeholder", "treinamento_id": plano_adaptado.get('treinamento_id')}


# --- Bloco para Teste ---
if __name__ == "__main__":
    print("-" * 30)
    print("Executando teste do SistemaAdaptacao (Matrix - Wrapper 2)...")
    print("-" * 30)

    # Exemplo de entrada (simulando a saída do Wrapper 1)
    plano_entrada_exemplo = {
        "treinamento_id": "plano_teste_w1_matrix", "versao": "1.0", "data_criacao": "2024-05-15T10:00:00Z",
        "usuario": { "id": "user-test-matrix", "nome": "Usuário Matriz", "nivel": "intermediário", "objetivos": [{"nome": "Hipertrofia"}], "restricoes": [] },
        "plano_principal": {
            "nome": "Plano Matrix Hipertrofia", "descricao": "Plano base.", "periodizacao": {"tipo": "Linear"},
            "duracao_semanas": 12, "frequencia_semanal": 4,
            "ciclos": [{
                "ciclo_id": "c1", "nome": "Fase 1", "ordem": 1, "duracao_semanas": 4, "objetivo": "Volume",
                "microciclos": [{
                    "semana": 1, "volume": "Médio", "intensidade": "Moderada", "foco": "Volume",
                    "sessoes": [
                        { "sessao_id": "s1w1a", "nome": "Peito/Tríceps", "tipo": "Hipertrofia", "duracao_minutos": 60, "nivel_intensidade": 7, "dia_semana": "segunda", "grupos_musculares": [{"nome": "Peito"}, {"nome": "Tríceps"}],
                          "exercicios": [ {"exercicio_id": "ex1", "nome": "Supino Reto", "ordem": 1, "series": 4, "repeticoes": "8-12", "percentual_rm": 75, "tempo_descanso": "60s"}, {"exercicio_id": "ex2", "nome": "Supino Inclinado", "ordem": 2, "series": 3, "repeticoes": "10-12", "percentual_rm": 70, "tempo_descanso": "60s"}, {"exercicio_id": "ex3", "nome": "Tríceps Testa", "ordem": 3, "series": 3, "repeticoes": "10-15", "percentual_rm": None, "tempo_descanso": "45s"} ] },
                        { "sessao_id": "s1w1b", "nome": "Costas/Bíceps", "tipo": "Hipertrofia", "duracao_minutos": 55, "nivel_intensidade": 7, "dia_semana": "terca", "grupos_musculares": [{"nome": "Costas"}, {"nome": "Bíceps"}],
                          "exercicios": [ {"exercicio_id": "ex4", "nome": "Barra Fixa", "ordem": 1, "series": 4, "repeticoes": "6-10", "percentual_rm": None, "tempo_descanso": "75s"}, {"exercicio_id": "ex5", "nome": "Remada Curvada", "ordem": 2, "series": 3, "repeticoes": "8-12", "percentual_rm": 70, "tempo_descanso": "60s"}, {"exercicio_id": "ex6", "nome": "Rosca Direta", "ordem": 3, "series": 3, "repeticoes": "10-12", "percentual_rm": None, "tempo_descanso": "45s"} ] }
                        # Adicionar mais sessões e semanas...
                    ]
                }]
            }]
        }
    }

    try:
        adaptador = SistemaAdaptacao()
        plano_final = adaptador.processar_plano(plano_entrada_exemplo)
        print("\n--- PLANO FINAL COM MATRIZ DE ADAPTAÇÕES ---")
        print(json.dumps(plano_final, indent=2, ensure_ascii=False))

        # Verificação básica da estrutura de saída
        if plano_final.get("adaptacoes_matrix"):
            print("\nINFO: Bloco 'adaptacoes_matrix' gerado.")
            # Verifica se tem adaptações para a primeira sessão como exemplo
            primeira_sessao_id = plano_entrada_exemplo["plano_principal"]["ciclos"][0]["microciclos"][0]["sessoes"][0]["sessao_id"]
            if primeira_sessao_id in plano_final["adaptacoes_matrix"]:
                 print(f"INFO: Adaptações encontradas para a sessão ID: {primeira_sessao_id}")
                 # Verifica uma combinação específica
                 if "cansado" in plano_final["adaptacoes_matrix"][primeira_sessao_id] and \
                    "curto" in plano_final["adaptacoes_matrix"][primeira_sessao_id]["cansado"]:
                     print("INFO: Adaptação para 'cansado' + 'curto' encontrada.")
                 else:
                     print("AVISO: Adaptação específica 'cansado' + 'curto' não encontrada (pode ser erro ou fallback).")
            else:
                 print(f"AVISO: Nenhuma adaptação encontrada para a sessão ID: {primeira_sessao_id}")
        else:
            print("\nATENÇÃO: Bloco 'adaptacoes_matrix' vazio ou ausente.")

    except ValueError as e: print(f"\nERRO DE CONFIGURAÇÃO: {e}")
    except Exception as e: print(f"\nERRO INESPERADO NA EXECUÇÃO: {e}"); traceback.print_exc()
    print("-" * 30)