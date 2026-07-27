# Conversor PURO: rascunho do editor → MOLDE_SCHEMA.
#
# Não existe um pipeline paralelo para plano manual. Esta camada só traduz os
# campos anuláveis e os toggles da UI para a mesma semana-tipo que já alimenta
# `expandir_plano` nos planos da IA.

from typing import Any, Dict, List

from backend.services.exercise_catalog import (
    METRICA_CARGA_REPS,
    METRICA_TEMPO,
    METRICA_TEMPO_DISTANCIA,
    resolver_exercicio,
)
from backend.services.plan_mapper import (
    DEFAULT_DURACAO_CARDIO_SEGUNDOS,
    DEFAULT_REPS_MAX,
    DEFAULT_REPS_MIN,
)

# `progressivel: False` marca o que o aluno NÃO pediu para progredir. A UI
# promete "Aquecimento Articular (5 min)"; sem a marca, a regra de cardio
# esticava esses 5 min junto com a corrida e a promessa da tela virava mentira.
_AQUECIMENTO = {
    "exercise_key": "aquecimento_articular",
    "nome": "Aquecimento Articular",
    "equipamento": "Peso corporal",
    "series": 1,
    "duracao_minutos": 5,
    "prioridade": "acessorio",
    "tem_limitacao": False,
    "progressivel": False,
}

_ALONGAMENTO = {
    "exercise_key": "alongamento_dinamico",
    "nome": "Alongamento Dinâmico",
    "equipamento": "Peso corporal",
    "series": 1,
    "duracao_minutos": 5,
    "prioridade": "acessorio",
    "tem_limitacao": False,
    "progressivel": False,
}

_METRICAS_MANUAIS = {
    METRICA_CARGA_REPS,
    METRICA_TEMPO,
    METRICA_TEMPO_DISTANCIA,
}


def _exercicio_do_molde(exercicio: Dict[str, Any], ordem: int) -> Dict[str, Any]:
    canonico = resolver_exercicio(
        exercicio.get("nome"), exercicio.get("equipamento")
    )
    metrica_declarada = exercicio.get("metrica")
    metrica = (
        metrica_declarada
        if canonico.chave is None and metrica_declarada in _METRICAS_MANUAIS
        else canonico.metrica
    )
    eh_tempo = metrica in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA)
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
    if canonico.chave is None and metrica_declarada in _METRICAS_MANUAIS:
        convertido["metrica"] = metrica_declarada
    if exercicio.get("progressivel") is False:
        convertido["progressivel"] = False
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

    # A semana 1 é a linha de base para TODAS as regras, não só cardio e
    # intensidade: com `semana_inicio: 1` o expansor (`semana - inicio + 1`) já
    # entregava 4 séries na semana 1 de um Supino que o aluno escreveu com 3 —
    # e cada rodada de "Editar plano" reimportava o número inflado e subia mais
    # um degrau, em silêncio, até o teto de 10.
    series = progressao.get("series") or {}
    if series.get("ativa") is True and series.get("valor") != 0:
        inicio_series = max(2, series["semana_inicio"])
        if inicio_series <= series["semana_fim"]:
            regras.append(
                {
                    "tipo": "delta_series",
                    "semana_inicio": inicio_series,
                    "semana_fim": series["semana_fim"],
                    "valor": series["valor"],
                    "grupo_alvo": "todos",
                }
            )

    # O expansor conta `semanas_decorridas = semana - semana_inicio + 1`, então
    # uma regra que começa na semana 1 JÁ progride a semana 1: o aluno digitava
    # 20 min / 70 %RM e a semana 1 nascia com 21 min / 72 %RM — o plano que ele
    # montou não existia em lugar nenhum. A semana 1 é a linha de base; a
    # progressão começa na 2. Plano de 1 semana simplesmente não progride.
    cardio = progressao.get("cardio") or {}
    if cardio.get("ativa") is True and duracao_semanas >= 2:
        regras.append(
            {
                "tipo": "delta_cardio_percentual",
                "semana_inicio": 2,
                "semana_fim": duracao_semanas,
                "valor": cardio["valor"],
                "alvo": cardio["alvo"],
            }
        )

    intensidade = progressao.get("intensidade") or {}
    if intensidade.get("ativa") is True and duracao_semanas >= 2:
        regras.append(
            {
                "tipo": "delta_rm_percentual",
                "semana_inicio": 2,
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


# Alias público: a validação do endpoint precisa da MESMA janela de progressão
# que vai para o molde, senão o pré-cheque e o pipeline divergem.
regras_progressao = _regras_progressao


DIAS_NA_SEMANA = 7


def alocar_dias_dos_treinos(treinos: List[Dict[str, Any]]) -> List[Any]:
    """
    Resolve o dia efetivo de cada treino, na ordem em que aparecem.

    "Sem dia fixo" (`dia_offset: null`) é o DEFAULT de todo treino novo e o
    mapper resolvia esse caso com `order_in_week - 1`: o 1º treino sem dia
    virava segunda-feira e colidia com um treino que o aluno marcou como
    segunda. O guard de dias duplicados nunca via a colisão porque descartava
    os nulos. Aqui o nulo é materializado no primeiro dia ainda livre, antes
    da validação e antes da expansão — o mesmo resultado em ambas.

    Devolve None na posição do treino quando não sobra dia livre.
    """
    ocupados = {
        treino.get("dia_offset")
        for treino in treinos
        if isinstance(treino.get("dia_offset"), int)
    }
    livres = [dia for dia in range(DIAS_NA_SEMANA) if dia not in ocupados]
    alocados: List[Any] = []
    for treino in treinos:
        dia = treino.get("dia_offset")
        if not isinstance(dia, int):
            dia = livres.pop(0) if livres else None
        alocados.append(dia)
    return alocados


def construir_molde_manual(rascunho: Dict[str, Any]) -> Dict[str, Any]:
    """Rascunho do editor → uma semana-tipo válida repetida no calendário."""
    duracao_semanas = rascunho.get("duracao_semanas", 12)
    sessoes: List[Dict[str, Any]] = []
    treinos_do_rascunho = list(rascunho.get("treinos") or [])
    dias_alocados = alocar_dias_dos_treinos(treinos_do_rascunho)

    for indice, treino in enumerate(treinos_do_rascunho):
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
            "exercicios": exercicios,
        }
        # Só emite a chave quando há grupo de verdade. Um treino todo de nome
        # livre não resolve nenhum grupo canônico, e `[]` não é "sem grupo" —
        # é uma lista vazia que o schema (minItems=1) reprova e que chegaria ao
        # mapper indistinguível de ausente. Mesmo critério do dia_offset abaixo.
        if grupos:
            sessao["grupos_musculares"] = [{"nome": grupo} for grupo in grupos]
        if dias_alocados[indice] is not None:
            sessao["dia_offset"] = dias_alocados[indice]
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
