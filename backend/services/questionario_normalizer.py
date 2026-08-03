# backend/services/questionario_normalizer.py
# Normalizador de questionário: converte ambos os formatos (app novo e legado)
# para um dicionário canônico com as chaves que o wrapper e o plan_mapper esperam.

import datetime
from typing import Any, Dict, List, Optional


# Mapa de dias em inglês (como o app envia) para português sem acento
_DIAS_EN_PARA_PT = {
    "mon": "segunda",
    "tue": "terca",
    "wed": "quarta",
    "thu": "quinta",
    "fri": "sexta",
    "sat": "sabado",
    "sun": "domingo",
}

# Mapa de dias em português (com ou sem acento) para formato canônico
_DIAS_PT_NORMALIZADOS = {
    # Sem acento (já canônico)
    "segunda": "segunda",
    "segunda-feira": "segunda",
    "terca": "terca",
    "terca-feira": "terca",
    "quarta": "quarta",
    "quarta-feira": "quarta",
    "quinta": "quinta",
    "quinta-feira": "quinta",
    "sexta": "sexta",
    "sexta-feira": "sexta",
    "sabado": "sabado",
    "domingo": "domingo",
    # Com acento (normalizados)
    "terça": "terca",
    "terça-feira": "terca",
    "quarta-feira": "quarta",
    "quinta-feira": "quinta",
    "sexta-feira": "sexta",
    "sábado": "sabado",
}

# Ordem canônica dos dias para sorting
_ORDEM_DIAS = {
    "segunda": 0,
    "terca": 1,
    "quarta": 2,
    "quinta": 3,
    "sexta": 4,
    "sabado": 5,
    "domingo": 6,
}


def _normalizar_dias(dias_raw: Any) -> Optional[List[str]]:
    """
    Converte dias em qualquer formato para lista canônica em português sem acento.

    Aceita:
    - lista de códigos em inglês ['mon', 'tue', ...]
    - lista de nomes em português ['segunda', 'terça', ...]
    - lista mista
    - None ou vazio → retorna None ou lista vazia

    Resultado: lista dedupilicada em ordem canônica [segunda, terca, ...].
    """
    if not dias_raw:
        return None

    if not isinstance(dias_raw, (list, tuple)):
        return None

    normalizados = set()
    for dia in dias_raw:
        if not dia:
            continue

        dia_str = str(dia).strip().lower()

        # Tenta conversão de inglês para português
        if dia_str in _DIAS_EN_PARA_PT:
            normalizados.add(_DIAS_EN_PARA_PT[dia_str])
            continue

        # Tenta conversão de português (com ou sem acento) para canônico
        if dia_str in _DIAS_PT_NORMALIZADOS:
            normalizados.add(_DIAS_PT_NORMALIZADOS[dia_str])
            continue

        # Dia desconhecido é silenciosamente ignorado

    if not normalizados:
        return None

    # Retorna em ordem canônica
    return sorted(normalizados, key=lambda d: _ORDEM_DIAS.get(d, 99))


def _calcular_idade(data_nascimento_str: Optional[str]) -> Optional[int]:
    """
    Calcula idade a partir de `data_nascimento` em formato `YYYY-MM-DD`.
    Retorna None se inválido.
    """
    if not data_nascimento_str:
        return None

    try:
        data_nascimento = datetime.datetime.strptime(data_nascimento_str, "%Y-%m-%d").date()
        hoje = datetime.date.today()
        idade = hoje.year - data_nascimento.year

        # Se aniversário ainda não chegou neste ano, subtrai 1
        if (hoje.month, hoje.day) < (data_nascimento.month, data_nascimento.day):
            idade -= 1

        return idade if idade >= 0 else None
    except (ValueError, TypeError, AttributeError):
        return None


def _normalizar_booleano(valor: Any) -> str:
    """
    Converte valor booleano para 'sim' ou 'não'.
    Strings já em pt-BR ('sim', 'não', 'nao') são preservadas.
    """
    if isinstance(valor, bool):
        return "sim" if valor else "não"

    if isinstance(valor, str):
        valor_lower = valor.lower().strip()
        if valor_lower in ("sim", "s", "true", "yes", "1"):
            return "sim"
        if valor_lower in ("não", "nao", "n", "false", "no", "0"):
            return "não"

    return "não"  # default


def normalizar_questionario(payload: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Normaliza payload de questionário (app novo ou legado) para formato canônico.

    Retorna dicionário com chaves:
    - nome, idade, peso, altura, genero, nivel, historico_treino, tempo_treino,
    - disponibilidade_semanal, dias_disponiveis, cardio, alongamento, objetivos,
    - restricoes, lesoes

    Regras de precedência:
    1. Se chave app existe e não é vazia, usa a app
    2. Senão, tenta a chave legada
    3. Senão, usa default

    Entrada None, não-dict ou vazia nunca levanta exceção.
    """
    if payload is None or not isinstance(payload, dict):
        payload = {}

    # --- DIAS DISPONÍVEIS ---
    dias_raw = payload.get("dias_treino") or payload.get("diasPreferenciais")
    dias_disponiveis = _normalizar_dias(dias_raw)

    # --- DISPONIBILIDADE SEMANAL ---
    # Tenta chave explícita (frequenciaSemanal / frequencia_semanal)
    disponibilidade_semanal = payload.get(
        "frequenciaSemanal"
    ) or payload.get("frequencia_semanal")

    if not isinstance(disponibilidade_semanal, int) or disponibilidade_semanal < 1:
        # Fallback: calcula de len(dias_disponiveis)
        if dias_disponiveis:
            disponibilidade_semanal = len(dias_disponiveis)
        else:
            disponibilidade_semanal = 3  # default

    # Garante que está entre 1 e 7
    disponibilidade_semanal = max(1, min(disponibilidade_semanal, 7))

    # --- IDADE ---
    idade = payload.get("idade")
    if not isinstance(idade, int) or idade < 0:
        # Tenta calcular de data_nascimento
        data_nascimento = payload.get("data_nascimento")
        idade = _calcular_idade(data_nascimento)

    # --- PESO e ALTURA ---
    peso = payload.get("peso_kg") or payload.get("peso")
    if peso is not None:
        try:
            peso = float(peso)
        except (ValueError, TypeError):
            peso = None

    altura = payload.get("altura_cm") or payload.get("altura")
    if altura is not None:
        try:
            altura = int(altura)
        except (ValueError, TypeError):
            altura = None

    # --- GÊNERO ---
    genero = payload.get("genero")

    # --- NÍVEL/EXPERIÊNCIA ---
    nivel = payload.get("experiencia_treino") or payload.get("nivelExperiencia")
    if not nivel:
        nivel = "iniciante"

    # --- HISTÓRICO DE TREINO ---
    historico_treino = payload.get("historico_treino") or payload.get("historicoTreino")

    # --- TEMPO DE TREINO ---
    tempo_treino = payload.get("tempo_medio_treino_min") or payload.get("tempoDisponivelSessao")
    if not isinstance(tempo_treino, int) or tempo_treino < 1:
        tempo_treino = 60  # default

    # --- CARDIO e ALONGAMENTO ---
    cardio_raw = payload.get("inclui_cardio") or payload.get("incluirCardio")
    cardio = _normalizar_booleano(cardio_raw)

    alongamento_raw = payload.get("inclui_alongamento") or payload.get("incluirAlongamento")
    alongamento = _normalizar_booleano(alongamento_raw)

    # --- OBJETIVOS ---
    objetivo = payload.get("objetivo")
    objetivos = payload.get("objetivos")

    # Se objetivo é string, converte para lista
    if objetivo and not objetivos:
        objetivos = [objetivo]
    elif not objetivos:
        objetivos = []

    # --- RESTRIÇÕES ---
    restricoes = payload.get("restricoes")
    if not isinstance(restricoes, list):
        restricoes = []

    # --- LESÕES ---
    lesoes = payload.get("lesoes")
    if not isinstance(lesoes, list):
        lesoes = []

    # --- NOME ---
    nome = payload.get("nome")

    return {
        "nome": nome,
        "idade": idade,
        "peso": peso,
        "altura": altura,
        "genero": genero,
        "nivel": nivel,
        "historico_treino": historico_treino,
        "tempo_treino": tempo_treino,
        "disponibilidade_semanal": disponibilidade_semanal,
        "dias_disponiveis": dias_disponiveis,
        "cardio": cardio,
        "alongamento": alongamento,
        "objetivos": objetivos,
        "restricoes": restricoes,
        "lesoes": lesoes,
    }
