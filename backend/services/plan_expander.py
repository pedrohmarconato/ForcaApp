# backend/services/plan_expander.py
# Expansor determinístico: molde → plano completo de N semanas.
# Função PURA (sem I/O, sem random, sem dependência de tempo).
# Mesma entrada → mesma saída, sempre.
#
# O output é o mesmo contrato JSON que TreinadorEspecialista.gerar_plano()
# produz hoje: { treinamento_id, versao, data_criacao, usuario, plano_principal }.
# plan_mapper e plan_repository continuam consumindo sem alteração.

import copy
import datetime
import math
import uuid
from typing import Any, Dict, List, Optional

from backend.schemas.molde_schema import MOLDE_SCHEMA
from backend.services.exercise_catalog import (
    METRICA_TEMPO,
    METRICA_TEMPO_DISTANCIA,
    resolver_exercicio,
)

# --- Constantes do expansor ---
_INCREMENTO_CARGA_KG = 2.5  # incremento padrão de carga
_TETO_PERCENTUAL_RM = 95     # %RM nunca passa disso
_PISO_SERIES = 2             # séries nunca caem abaixo disso
_PISO_DESCANSO_SEGUNDOS = 30
_PLANO_VERSAO = "1.0"
# Cardio não cresce indefinidamente: teto de crescimento acumulado sobre a
# prescrição original (regra dos ~10%/semana da corrida, com margem).
_TETO_CARDIO_MULTIPLICADOR = 2.0


def expandir_plano(
    molde: Dict[str, Any],
    dados_usuario: Dict[str, Any],
    start_date: Optional[datetime.date] = None,
) -> Dict[str, Any]:
    """
    Molde → plano completo no contrato atual.

    Args:
        molde: dict validado contra MOLDE_SCHEMA.
        dados_usuario: dict com id, nome, nivel, objetivos, restricoes, lesoes.
        start_date: data de início (default: hoje).

    Returns:
        dict com a estrutura { treinamento_id, versao, data_criacao, usuario, plano_principal }
        pronta para plan_mapper e plan_repository.

    Raises:
        ValueError: se o molde for inválido.
    """
    import jsonschema

    try:
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)
    except jsonschema.exceptions.ValidationError as e:
        raise ValueError(f"Molde inválido: regra '{e.validator}' violada em {list(e.path)}") from e

    calendario = molde["calendario"]
    semanas_tipo = {st["id"]: st for st in molde["semanas_tipo"]}
    regras = molde.get("progressao", {}).get("regras", [])
    semanas_avulsas = molde.get("semanas_avulsas", {}) or {}

    inicio = start_date or datetime.date.today()

    plan_id = str(uuid.uuid4())

    usuario = {
        "id": str(dados_usuario.get("id", "N/A")),
        "nome": dados_usuario.get("nome"),
        "nivel": dados_usuario.get("nivel", "iniciante"),
        "objetivos": dados_usuario.get("objetivos", []),
        "restricoes": dados_usuario.get("restricoes", []),
    }

    ciclos = _construir_ciclos(calendario, semanas_tipo, regras, semanas_avulsas)
    duracao = len(calendario)
    freq = _calcular_frequencia_semanal(semanas_tipo)

    plano_principal = {
        "nome": molde.get("nome") or "Plano de Treino",
        "descricao": molde.get("descricao") or "",
        "periodizacao": molde.get("periodizacao") or {"tipo": "Linear", "descricao": None},
        "duracao_semanas": duracao,
        "frequencia_semanal": freq,
        "ciclos": ciclos,
        "metricas": None,
    }

    return {
        "treinamento_id": plan_id,
        "versao": _PLANO_VERSAO,
        "data_criacao": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "usuario": usuario,
        "plano_principal": plano_principal,
    }


def _construir_ciclos(
    calendario: List[str],
    semanas_tipo: Dict[str, Dict[str, Any]],
    regras: List[Dict[str, Any]],
    semanas_avulsas: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Constrói os ciclos/microciclos a partir do calendário e regras de progressão."""

    # Agrupa em ciclos de 4 semanas (simplificado; pode ser refinado depois)
    total_semanas = len(calendario)
    ciclos: List[Dict[str, Any]] = []
    ordem_ciclo = 0

    for semana_inicio in range(0, total_semanas, 4):
        ordem_ciclo += 1
        semana_fim = min(semana_inicio + 4, total_semanas)
        duracao = semana_fim - semana_inicio

        microciclos = []
        for idx in range(semana_inicio, semana_fim):
            num_semana = idx + 1
            tipo_id = calendario[idx]

            # Verifica se é uma semana avulsa (válvula de escape)
            chave_avulsa = f"semana_{num_semana}"
            if chave_avulsa in semanas_avulsas:
                avulsa = semanas_avulsas[chave_avulsa]
                if isinstance(avulsa, dict) and avulsa.get("sessoes"):
                    sessoes = _copiar_sessoes(avulsa["sessoes"])
                    microciclos.append({
                        "semana": num_semana,
                        "volume": _classificar_volume(sessoes),
                        "intensidade": _classificar_intensidade(sessoes),
                        "foco": None,
                        "sessoes": sessoes,
                    })
                    continue

            tipo = semanas_tipo.get(tipo_id)
            if not tipo:
                raise ValueError(f"Semana-tipo '{tipo_id}' referenciada no calendário mas não definida.")

            sessoes = _copiar_sessoes(tipo.get("sessoes", []))

            # Aplica regras de progressão
            _aplicar_progressao(sessoes, regras, num_semana)

            microciclos.append({
                "semana": num_semana,
                "volume": _classificar_volume(sessoes),
                "intensidade": _classificar_intensidade(sessoes),
                "foco": None,
                "sessoes": sessoes,
            })

        ciclos.append({
            "ciclo_id": str(uuid.uuid4()),
            "nome": f"Ciclo {ordem_ciclo}",
            "ordem": ordem_ciclo,
            "duracao_semanas": duracao,
            "objetivo": "Progressão estruturada",
            "microciclos": microciclos,
        })

    return ciclos


def _copiar_sessoes(sessoes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deep copy das sessões, gerando IDs novos para sessões e exercícios."""
    copia = []
    for sessao in sessoes:
        s = copy.deepcopy(sessao)
        s["sessao_id"] = str(uuid.uuid4())
        if "exercicios" in s:
            for ex in s["exercicios"]:
                ex["exercicio_id"] = str(uuid.uuid4())
        copia.append(s)
    return copia


def _aplicar_progressao(
    sessoes: List[Dict[str, Any]],
    regras: List[Dict[str, Any]],
    semana: int,
) -> None:
    """Aplica regras de progressão NUMÉRICAS às sessões de uma semana."""
    for regra in regras:
        tipo = regra.get("tipo")

        if tipo == "delta_rm_percentual":
            ini = regra.get("semana_inicio", 1)
            fim = regra.get("semana_fim", 1)
            valor = regra.get("valor", 0)
            grupo_alvo = regra.get("grupo_alvo", "todos")
            if ini <= semana <= fim:
                semanas_decorridas = semana - ini + 1
                incremento = valor * semanas_decorridas
                for sessao in sessoes:
                    for ex in sessao.get("exercicios", []):
                        # Cardio não tem %RM: progride por tempo/distância.
                        if _atinge_grupo(ex, grupo_alvo) and not _e_por_tempo(ex):
                            rm_atual = ex.get("percentual_rm")
                            if isinstance(rm_atual, (int, float)):
                                novo_rm = min(rm_atual + incremento, _TETO_PERCENTUAL_RM)
                                ex["percentual_rm"] = round(novo_rm)

        elif tipo == "delta_series":
            ini = regra.get("semana_inicio", 1)
            fim = regra.get("semana_fim", 1)
            valor = regra.get("valor", 0)
            grupo_alvo = regra.get("grupo_alvo", "todos")
            if ini <= semana <= fim:
                semanas_decorridas = semana - ini + 1
                incremento = valor * semanas_decorridas
                for sessao in sessoes:
                    for ex in sessao.get("exercicios", []):
                        if _atinge_grupo(ex, grupo_alvo):
                            series_atual = ex.get("series", 1)
                            if isinstance(series_atual, int):
                                novo = max(series_atual + incremento, _PISO_SERIES)
                                ex["series"] = min(novo, 10)  # schema max

        elif tipo == "delta_cardio_percentual":
            _aplicar_progressao_cardio(sessoes, regra, semana)

        elif tipo == "deload_percentual":
            semana_deload = regra.get("semana")
            if semana == semana_deload:
                fator_rm = regra.get("fator_rm", 0.8)
                fator_series = regra.get("fator_series", 0.8)
                for sessao in sessoes:
                    for ex in sessao.get("exercicios", []):
                        if _e_por_tempo(ex):
                            # Deload de cardio = menos tempo/distância.
                            duracao = ex.get("duracao_minutos")
                            if isinstance(duracao, (int, float)) and duracao > 0:
                                ex["duracao_minutos"] = round(duracao * fator_rm, 1)
                            distancia = ex.get("distancia_km")
                            if isinstance(distancia, (int, float)) and distancia > 0:
                                ex["distancia_km"] = round(distancia * fator_rm, 2)
                            continue
                        rm_atual = ex.get("percentual_rm")
                        if isinstance(rm_atual, (int, float)):
                            ex["percentual_rm"] = round(rm_atual * fator_rm)
                        series_atual = ex.get("series")
                        if isinstance(series_atual, int):
                            ex["series"] = max(int(series_atual * fator_series), _PISO_SERIES)


def _e_por_tempo(exercicio: Dict[str, Any]) -> bool:
    """Cardio/isometria: medido por tempo (e distância), nunca por %RM."""
    canonico = resolver_exercicio(exercicio.get("nome"), exercicio.get("equipamento"))
    return canonico.metrica in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA)


def _aplicar_progressao_cardio(
    sessoes: List[Dict[str, Any]],
    regra: Dict[str, Any],
    semana: int,
) -> None:
    """Aumenta duração/distância do cardio em X% por semana, com teto."""
    ini = regra.get("semana_inicio", 1)
    fim = regra.get("semana_fim", 1)
    valor = regra.get("valor", 0)
    alvo = regra.get("alvo", "ambos")
    if not (ini <= semana <= fim) or not valor:
        return
    semanas_decorridas = semana - ini + 1
    fator = min(1 + (valor / 100.0) * semanas_decorridas, _TETO_CARDIO_MULTIPLICADOR)
    for sessao in sessoes:
        for ex in sessao.get("exercicios", []):
            if not _e_por_tempo(ex):
                continue
            if alvo in ("duracao", "ambos"):
                duracao = ex.get("duracao_minutos")
                if isinstance(duracao, (int, float)) and duracao > 0:
                    ex["duracao_minutos"] = round(duracao * fator, 1)
            if alvo in ("distancia", "ambos"):
                distancia = ex.get("distancia_km")
                if isinstance(distancia, (int, float)) and distancia > 0:
                    ex["distancia_km"] = round(distancia * fator, 2)


def _atinge_grupo(exercicio: Dict[str, Any], grupo_alvo: str) -> bool:
    if grupo_alvo == "todos":
        return True
    prioridade = str(exercicio.get("prioridade") or "").lower()
    if grupo_alvo == "primario":
        return prioridade in ("primario", "primário", "primary")
    if grupo_alvo == "secundario":
        return prioridade in ("secundario", "secundário", "secondary")
    return True


def _classificar_volume(sessoes: List[Dict[str, Any]]) -> str:
    total_series = sum(
        sum(ex.get("series", 0) for ex in (s.get("exercicios") or []))
        for s in sessoes
    )
    if total_series <= 20:
        return "Baixo"
    if total_series <= 40:
        return "Médio"
    return "Alto"


def _classificar_intensidade(sessoes: List[Dict[str, Any]]) -> str:
    rms = [
        ex.get("percentual_rm")
        for s in sessoes
        for ex in (s.get("exercicios") or [])
        if isinstance(ex.get("percentual_rm"), (int, float))
    ]
    if not rms:
        return "Moderada"
    media = sum(rms) / len(rms)
    if media <= 65:
        return "Leve"
    if media <= 80:
        return "Moderada"
    if media <= 90:
        return "Alta"
    return "Máxima"


def _calcular_frequencia_semanal(semanas_tipo: Dict[str, Dict[str, Any]]) -> int:
    """Frequência semanal = número de sessões do primeiro tipo (representativo)."""
    for tipo in semanas_tipo.values():
        sessoes = tipo.get("sessoes")
        if isinstance(sessoes, list):
            return len(sessoes)
    return 3
