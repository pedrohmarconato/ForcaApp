# Conversor PURO: rascunho do editor → MOLDE_SCHEMA.
#
# Não existe um pipeline paralelo para plano manual. Esta camada só traduz os
# campos anuláveis e os toggles da UI para a mesma semana-tipo que já alimenta
# `expandir_plano` nos planos da IA.

from typing import Any, Dict, List

from backend.services.exercise_catalog import (
    METRICA_TEMPO,
    METRICA_TEMPO_DISTANCIA,
    resolver_exercicio,
)
from backend.services.plan_mapper import (
    DEFAULT_DURACAO_CARDIO_SEGUNDOS,
    DEFAULT_REPS_MAX,
    DEFAULT_REPS_MIN,
)

_AQUECIMENTO = {
    "exercise_key": "aquecimento_articular",
    "nome": "Aquecimento Articular",
    "equipamento": "Peso corporal",
    "series": 1,
    "duracao_minutos": 5,
    "prioridade": "acessorio",
    "tem_limitacao": False,
}

_ALONGAMENTO = {
    "exercise_key": "alongamento_dinamico",
    "nome": "Alongamento Dinâmico",
    "equipamento": "Peso corporal",
    "series": 1,
    "duracao_minutos": 5,
    "prioridade": "acessorio",
    "tem_limitacao": False,
}


def _exercicio_do_molde(exercicio: Dict[str, Any], ordem: int) -> Dict[str, Any]:
    canonico = resolver_exercicio(
        exercicio.get("nome"), exercicio.get("equipamento")
    )
    eh_tempo = canonico.metrica in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA)
    convertido: Dict[str, Any] = {
        "nome": str(exercicio.get("nome") or canonico.nome),
        "ordem": ordem,
        "series": exercicio.get("series", 1),
        "prioridade": exercicio.get("prioridade") or "acessorio",
        "tem_limitacao": exercicio.get("tem_limitacao") is True,
    }

    # Mantido no raw_plan para round-trip do editor. O mapper resolve de novo
    # pelo nome/equipamento e não confia nesta chave para canonizar entrada.
    if exercicio.get("exercise_key"):
        convertido["exercise_key"] = exercicio["exercise_key"]
    for origem, destino in (
        ("equipamento", "equipamento"),
        ("percentual_rm", "percentual_rm"),
        ("tempo_descanso", "tempo_descanso"),
        ("observacoes", "observacoes"),
        ("distancia_km", "distancia_km"),
    ):
        if exercicio.get(origem) is not None:
            convertido[destino] = exercicio[origem]

    if eh_tempo:
        duracao = exercicio.get("duracao_minutos")
        if not isinstance(duracao, (int, float)) or duracao <= 0:
            duracao = DEFAULT_DURACAO_CARDIO_SEGUNDOS / 60
        convertido["duracao_minutos"] = duracao
        # %RM não descreve cardio/isometria e o mapper o descartaria de todo modo.
        convertido.pop("percentual_rm", None)
    else:
        repeticoes = exercicio.get("repeticoes")
        convertido["repeticoes"] = (
            repeticoes
            if repeticoes is not None
            else f"{DEFAULT_REPS_MIN}-{DEFAULT_REPS_MAX}"
        )

    return convertido


def _regras_progressao(
    progressao: Dict[str, Any], duracao_semanas: int
) -> List[Dict[str, Any]]:
    regras: List[Dict[str, Any]] = []

    series = progressao.get("series") or {}
    if series.get("ativa") is True and series.get("valor") != 0:
        regras.append(
            {
                "tipo": "delta_series",
                "semana_inicio": series["semana_inicio"],
                "semana_fim": series["semana_fim"],
                "valor": series["valor"],
                "grupo_alvo": "todos",
            }
        )

    cardio = progressao.get("cardio") or {}
    if cardio.get("ativa") is True:
        regras.append(
            {
                "tipo": "delta_cardio_percentual",
                "semana_inicio": 1,
                "semana_fim": duracao_semanas,
                "valor": cardio["valor"],
                "alvo": cardio["alvo"],
            }
        )

    intensidade = progressao.get("intensidade") or {}
    if intensidade.get("ativa") is True:
        regras.append(
            {
                "tipo": "delta_rm_percentual",
                "semana_inicio": 1,
                "semana_fim": duracao_semanas,
                "valor": intensidade["valor"],
                "grupo_alvo": "todos",
            }
        )

    deload = progressao.get("deload") or {}
    if deload.get("ativa") is True:
        regras.append(
            {
                "tipo": "deload_percentual",
                "semana": deload["semana"],
                "fator_rm": deload["fator_rm"],
                "fator_series": deload["fator_series"],
            }
        )

    return regras


def construir_molde_manual(rascunho: Dict[str, Any]) -> Dict[str, Any]:
    """Rascunho do editor → uma semana-tipo válida repetida no calendário."""
    duracao_semanas = rascunho.get("duracao_semanas", 12)
    sessoes: List[Dict[str, Any]] = []

    for treino in rascunho.get("treinos") or []:
        brutos: List[Dict[str, Any]] = []
        if treino.get("incluir_aquecimento") is True:
            brutos.append(dict(_AQUECIMENTO))
        brutos.extend(dict(exercicio) for exercicio in treino.get("exercicios") or [])
        if treino.get("incluir_alongamento") is True:
            brutos.append(dict(_ALONGAMENTO))

        exercicios = [
            _exercicio_do_molde(exercicio, ordem)
            for ordem, exercicio in enumerate(brutos, start=1)
        ]
        grupos: List[str] = []
        for exercicio in exercicios:
            canonico = resolver_exercicio(
                exercicio.get("nome"), exercicio.get("equipamento")
            )
            if canonico.grupo_muscular and canonico.grupo_muscular not in grupos:
                grupos.append(canonico.grupo_muscular)

        sessao: Dict[str, Any] = {
            "nome": treino.get("nome") or "Treino",
            "tipo": "Personalizado",
            "grupos_musculares": [{"nome": grupo} for grupo in grupos],
            "exercicios": exercicios,
        }
        if treino.get("dia_offset") is not None:
            sessao["dia_offset"] = treino["dia_offset"]
        if treino.get("duracao_minutos") is not None:
            sessao["duracao_minutos"] = treino["duracao_minutos"]
        sessoes.append(sessao)

    return {
        "nome": rascunho.get("nome") or "Meu plano",
        "descricao": "Plano montado manualmente pelo aluno.",
        "periodizacao": {
            "tipo": "Personalizada",
            "descricao": "Semana definida pelo aluno e repetida no calendário.",
        },
        "duracao_semanas": duracao_semanas,
        "frequencia_semanal": len(sessoes),
        "semanas_tipo": [{"id": "tipo_a", "nome": "Semana", "sessoes": sessoes}],
        "calendario": ["tipo_a"] * duracao_semanas,
        "progressao": {
            "regras": _regras_progressao(
                rascunho.get("progressao") or {}, duracao_semanas
            )
        },
    }
