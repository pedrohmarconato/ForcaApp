"""
Dose de cardio declarada pelo aluno, como CONTRATO do molde (migration 0021).

Antes disto, `inclui_cardio` era toda a voz do aluno: um sim/não. Quantos dias,
quantos minutos e em qual modalidade eram decisão exclusiva do modelo, e o único
canal para pedir algo diferente era texto livre na conversa — não verificável
depois.

A decisão do dono foi CONTRATO, não preferência: além de entrar no prompt e
filtrar o cardápio, a dose e o teto de progressão por nível são validados
localmente. Um molde que os viole é reprovado com mensagem dirigida para o retry
(o mesmo caminho que o refinamento do alvo de prescrição usa em app.py).

Duas linhas que este módulo não cruza:

1. **Nunca reprova por impossibilidade.** Se o aluno declara cardio em 4 dias mas
   a semana-tipo tem 2 sessões, o alvo efetivo é o que cabe. Reprovar aqui
   travaria TODA geração desse aluno num loop de duas tentativas perdidas.
2. **Nunca levanta exceção.** Roda depois do schema, mas um erro aqui derrubaria
   a geração inteira; entrada sem contrato não inventa dose, enquanto falha
   interna do validador reprova de forma controlada em vez de liberar persistência.
"""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ±25% absorve o arredondamento do modelo (25 ou 36 min contra um alvo de 30) sem
# deixar passar um cardio de 5 min onde o aluno pediu 30 — que é o caso que fez
# a dose existir.
TOLERANCIA_MINUTOS = 0.25

# Quantas violações entram na mensagem. Mais que isso vira parede de texto e o
# modelo corrige a primeira e ignora o resto; a próxima tentativa pega o que
# sobrou.
MAX_VIOLACOES_NA_MENSAGEM = 4


@dataclass(frozen=True)
class DoseCardio:
    """O que o aluno declarou. Campos None = ele não disse (não é zero)."""
    sem_cardio: bool
    dias_semana: Optional[int]
    minutos_sessao: Optional[int]
    modalidades: Tuple[str, ...]

    @property
    def tem_alvo(self) -> bool:
        return (
            self.dias_semana is not None
            or self.minutos_sessao is not None
            or bool(self.modalidades)
        )


def _inteiro_na_faixa(valor: Any, minimo: int, maximo: int) -> Optional[int]:
    """
    Inteiro dentro da faixa, ou None. Valor fora da faixa é IGNORADO em vez de
    coagido: um "8 dias" coagido para 7 viraria alvo que o aluno não pediu, e
    reprovaria o molde por uma dose inventada aqui.
    """
    if isinstance(valor, bool) or not isinstance(valor, int):
        return None
    return valor if minimo <= valor <= maximo else None


def _quer_cardio(valor: Any) -> bool:
    """
    Mesma coerção conservadora do cardápio do prompt (app.py): só negativo
    EXPLÍCITO significa "sem cardio". Ausente/ambíguo mantém — chave com formato
    inesperado não pode virar plano sem cardio em silêncio.
    """
    if valor is None:
        return True
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, (int, float)):
        return valor != 0
    return str(valor).strip().lower() not in ("false", "nao", "não", "no", "n", "0")


def canonicalizar_modalidades_cardio(valor: Any) -> Tuple[str, ...]:
    """
    Aceita somente modalidades que o catálogo resolve como Cardio e devolve os
    nomes CANÔNICOS, sem duplicatas.

    A canonização precisa acontecer na entrada do contrato, não apenas no bloco
    dedicado do prompt: a mesma dose também aparece no JSON do questionário e
    na mensagem de retry. Preservar o texto cru nesses caminhos permitiria
    injeção; preservar um alias válido (``run``) faria ``Corrida`` reprovar por
    mera diferença textual.
    """
    if not isinstance(valor, (list, tuple)):
        return ()

    from backend.services.exercise_catalog import GRUPO_CARDIO, resolver_exercicio

    nomes: List[str] = []
    chaves_vistas = set()
    for item in valor:
        if not isinstance(item, str) or not item.strip():
            continue
        try:
            resultado = resolver_exercicio(item)
        except Exception:  # catálogo indisponível não pode quebrar a geração
            continue
        if (
            not resultado.casou
            or resultado.grupo_muscular != GRUPO_CARDIO
            or not resultado.chave
            or resultado.chave in chaves_vistas
        ):
            continue
        chaves_vistas.add(resultado.chave)
        nomes.append(resultado.nome)
    return tuple(nomes)


# Teto de progressão semanal por nível de cardio declarado (REQ-05, Fase 2).
# Os 3 valores ficam DENTRO de [1.0, 10.0] — a faixa que
# `molde_schema.py::delta_cardio_percentual` já aceita para TODOS os alunos.
# O teto por nível só pode restringir para baixo, nunca pedir mais do que o
# schema permite (senão a IA reprova por schema no retry).
TETO_PROGRESSAO_POR_NIVEL: Dict[str, float] = {
    "iniciante": 3.0,
    "intermediario": 6.0,
    "avancado": 10.0,
}


def nivel_cardio_declarado(questionario: Any) -> Optional[str]:
    """
    Deriva um nível de cardio (iniciante/intermediario/avancado) dos sinais de
    anamnese declarados pelo aluno (REQ-04/REQ-05, Fase 2).

    Segue as MESMAS duas linhas que este módulo não cruza (ver docstring do
    módulo): nunca reprova por impossibilidade (não existe "reprovação" aqui,
    só ausência de sinal) e nunca levanta exceção — qualquer dado malformado
    devolve None, nunca um "raise".

    Regras:
    - questionário que não é dict, ou `cardio_pratica_atualmente` que não é
      `bool` (isinstance estrito) -> None (sem dado suficiente).
    - `cardio_pratica_atualmente is False` -> "iniciante" SEMPRE, direto: quem
      não pratica cardio hoje começa conservador, independente de qualquer
      outra resposta.
    - `cardio_pratica_atualmente is True` -> lê `cardio_distancia_confortavel_km`:
      - não é int/float (excluindo bool) ou fora de [0, 50] -> sem distância
        válida -> "intermediario" (meio-termo: nem o mais conservador, nem o
        mais agressivo, dado incompleto).
      - < 3.0 km -> "iniciante"
      - < 8.0 km -> "intermediario"
      - caso contrário -> "avancado"
    """
    if not isinstance(questionario, dict):
        return None

    pratica = questionario.get("cardio_pratica_atualmente")
    if not isinstance(pratica, bool):
        return None

    if pratica is False:
        return "iniciante"

    distancia = questionario.get("cardio_distancia_confortavel_km")
    if isinstance(distancia, bool) or not isinstance(distancia, (int, float)):
        return "intermediario"
    if not (0 <= distancia <= 50):
        return "intermediario"

    if distancia < 3.0:
        return "iniciante"
    if distancia < 8.0:
        return "intermediario"
    return "avancado"


def nivel_cardio_efetivo(questionario: Any) -> Optional[str]:
    """Nível usado tanto no prompt quanto no gate local de persistência."""
    if (
        not isinstance(questionario, dict)
        or questionario.get("inclui_cardio") is False
    ):
        return None
    nivel = nivel_cardio_declarado(questionario)
    if nivel is not None:
        return nivel
    return "iniciante" if questionario.get("inclui_cardio") is True else None


def dose_declarada(questionario: Any) -> Optional[DoseCardio]:
    """
    Lê a dose do questionário. Devolve None quando não há NADA a validar
    (questionário anterior à 0021, ou aluno que quer cardio sem especificar) —
    e nesse caso a geração segue como antes.
    """
    if not isinstance(questionario, dict):
        return None

    if not _quer_cardio(questionario.get("inclui_cardio")):
        # Recusa explícita também é contrato: o molde não pode trazer cardio.
        return DoseCardio(sem_cardio=True, dias_semana=None, minutos_sessao=None, modalidades=())

    modalidades = canonicalizar_modalidades_cardio(questionario.get("cardio_modalidades"))
    dose = DoseCardio(
        sem_cardio=False,
        dias_semana=_inteiro_na_faixa(questionario.get("cardio_dias_semana"), 1, 7),
        minutos_sessao=_inteiro_na_faixa(questionario.get("cardio_minutos_sessao"), 5, 180),
        modalidades=modalidades,
    )
    return dose if dose.tem_alvo else None


def _nome_cardio_canonico(nome: Any) -> Optional[str]:
    """
    Nome canônico quando o exercício é Cardio, ou None. Resolve pelo CATÁLOGO,
    nunca por palpite no nome: validação e persistência concordam por construção.
    """
    from backend.services.exercise_catalog import GRUPO_CARDIO, resolver_exercicio

    if not isinstance(nome, str) or not nome.strip():
        return None
    try:
        resultado = resolver_exercicio(nome)
    except Exception:  # catálogo indisponível não pode reprovar molde
        return None
    if resultado.casou and resultado.grupo_muscular == GRUPO_CARDIO:
        return resultado.nome
    return None


def _e_cardio(nome: Any) -> bool:
    return _nome_cardio_canonico(nome) is not None


def _e_temporal_fora_do_catalogo(exercicio: Dict[str, Any]) -> bool:
    from backend.services.exercise_catalog import (
        METRICA_TEMPO,
        METRICA_TEMPO_DISTANCIA,
        metrica_do_exercicio,
        resolver_exercicio,
    )

    resultado = resolver_exercicio(
        exercicio.get("nome"),
        exercicio.get("equipamento"),
    )
    if resultado.casou:
        return False
    duracao = exercicio.get("duracao_minutos")
    distancia = exercicio.get("distancia_km")
    tem_duracao = (
        isinstance(duracao, (int, float))
        and not isinstance(duracao, bool)
        and duracao > 0
    )
    tem_distancia = (
        isinstance(distancia, (int, float))
        and not isinstance(distancia, bool)
        and distancia > 0
    )
    return tem_duracao or tem_distancia or metrica_do_exercicio(exercicio) in (
        METRICA_TEMPO,
        METRICA_TEMPO_DISTANCIA,
    )


def _minutos_do_exercicio(exercicio: Dict[str, Any]) -> Optional[float]:
    """
    Minutos que este exercício ocupa: duração × séries.

    Ignorar `series` era o erro mais provável aqui — um HIIT de 3 × 10 min é meia
    hora de cardio, e contá-lo como 10 reprovaria um molde correto.
    """
    duracao = exercicio.get("duracao_minutos")
    if isinstance(duracao, bool) or not isinstance(duracao, (int, float)):
        return None
    if duracao <= 0:
        return None
    series = exercicio.get("series")
    fator = series if isinstance(series, int) and not isinstance(series, bool) and series > 0 else 1
    return float(duracao) * fator


def _distancia_do_exercicio(exercicio: Dict[str, Any]) -> Optional[float]:
    distancia = exercicio.get("distancia_km")
    if isinstance(distancia, bool) or not isinstance(distancia, (int, float)):
        return None
    if distancia <= 0:
        return None
    series = exercicio.get("series")
    fator = (
        series
        if isinstance(series, int) and not isinstance(series, bool) and series > 0
        else 1
    )
    return float(distancia) * fator


def _exercicios(sessao: Any) -> List[Dict[str, Any]]:
    if not isinstance(sessao, dict):
        return []
    itens = sessao.get("exercicios")
    return [e for e in itens if isinstance(e, dict)] if isinstance(itens, list) else []


def _sessoes(semana: Any) -> List[Dict[str, Any]]:
    if not isinstance(semana, dict):
        return []
    itens = semana.get("sessoes")
    return [s for s in itens if isinstance(s, dict)] if isinstance(itens, list) else []


def _semanas_tipo(molde: Any) -> List[Dict[str, Any]]:
    if not isinstance(molde, dict):
        return []
    itens = molde.get("semanas_tipo")
    return [s for s in itens if isinstance(s, dict)] if isinstance(itens, list) else []


def _semanas_avulsas(molde: Any) -> List[Dict[str, Any]]:
    if not isinstance(molde, dict):
        return []
    itens = molde.get("semanas_avulsas")
    if not isinstance(itens, dict):
        return []

    semanas = []
    for chave, semana in itens.items():
        if not isinstance(semana, dict):
            continue
        normalizada = dict(semana)
        normalizada["id"] = chave
        semanas.append(normalizada)
    return semanas


def _violacoes_chaves_semanas_avulsas(molde: Any) -> List[str]:
    if not isinstance(molde, dict):
        return []
    itens = molde.get("semanas_avulsas")
    if not isinstance(itens, dict):
        return []

    violacoes = []
    for chave, semana in itens.items():
        if not isinstance(semana, dict):
            continue
        numero_texto = chave[len("semana_"):] if isinstance(chave, str) else ""
        numero = int(numero_texto) if numero_texto.isdigit() else None
        declarado = semana.get("semana")
        if (
            numero is None
            or chave != f"semana_{numero}"
            or isinstance(declarado, bool)
            or not isinstance(declarado, int)
            or declarado != numero
        ):
            violacoes.append(
                f"A semana avulsa {chave!r} precisa coincidir com o campo "
                f"semana={declarado!r}; não é seguro escolher outra semana para "
                "validar e expandir a exceção."
            )
    return violacoes


def _totais_cardio(semana: Dict[str, Any]) -> Tuple[float, float]:
    minutos = 0.0
    distancia = 0.0
    for sessao in _sessoes(semana):
        for exercicio in _exercicios(sessao):
            if not _e_cardio(exercicio.get("nome")):
                continue
            minutos += _minutos_do_exercicio(exercicio) or 0.0
            distancia += _distancia_do_exercicio(exercicio) or 0.0
    return minutos, distancia


def _fator_progressao_cardio(
    regras: List[Any],
    semana: int,
    dimensao: str,
    teto: float,
) -> float:
    fator_regras = 1.0
    for regra in regras:
        if (
            not isinstance(regra, dict)
            or regra.get("tipo") != "delta_cardio_percentual"
        ):
            continue
        inicio = regra.get("semana_inicio")
        fim = regra.get("semana_fim")
        valor = regra.get("valor")
        alvo = regra.get("alvo", "ambos")
        if (
            isinstance(inicio, bool)
            or not isinstance(inicio, int)
            or isinstance(fim, bool)
            or not isinstance(fim, int)
            or isinstance(valor, bool)
            or not isinstance(valor, (int, float))
            or not (inicio <= semana <= fim)
            or alvo not in (dimensao, "ambos")
        ):
            continue
        semanas_decorridas = semana - inicio + 1
        fator_regras *= min(1 + (valor / 100.0) * semanas_decorridas, 2.0)

    fator_teto = 1 + (teto / 100.0) * max(semana - 1, 0)
    return max(fator_regras, fator_teto)


def _violacoes_teto_semanas_avulsas(
    molde: Dict[str, Any],
    nivel: str,
    regras: List[Any],
) -> List[str]:
    calendario = molde.get("calendario")
    if not isinstance(calendario, list):
        return []
    tipos = {
        semana.get("id"): semana
        for semana in _semanas_tipo(molde)
        if isinstance(semana.get("id"), str)
    }
    teto = TETO_PROGRESSAO_POR_NIVEL[nivel]
    violacoes = []

    for avulsa in _semanas_avulsas(molde):
        numero = avulsa.get("semana")
        id_semana = avulsa.get("id") or f"semana_{numero}"
        if (
            isinstance(numero, bool)
            or not isinstance(numero, int)
            or numero < 1
            or numero > len(calendario)
        ):
            violacoes.append(
                f"A {id_semana} fica fora do calendário de {len(calendario)} "
                "semana(s) e seria descartada na expansão."
            )
            continue
        base = tipos.get(calendario[numero - 1])
        if not isinstance(base, dict):
            continue

        base_minutos, base_distancia = _totais_cardio(base)
        avulsa_minutos, avulsa_distancia = _totais_cardio(avulsa)
        comparacoes = (
            ("duração", base_minutos, avulsa_minutos, "min", 0.1, "duracao"),
            (
                "distância",
                base_distancia,
                avulsa_distancia,
                "km",
                0.01,
                "distancia",
            ),
        )
        for rotulo, valor_base, valor_avulso, unidade, margem, dimensao in comparacoes:
            if valor_avulso <= 0:
                continue
            limite = valor_base * _fator_progressao_cardio(
                regras,
                numero,
                dimensao,
                teto,
            )
            if valor_base > 0 and valor_avulso <= limite + margem:
                continue
            violacoes.append(
                f"Na {id_semana}, a {rotulo} total do cardio é {valor_avulso:g} "
                f"{unidade}, acima do máximo seguro de {limite:g} {unidade} para "
                f"o teto de {teto:g}% do nível {nivel.upper()}."
            )
    return violacoes


def _rotulo_sessao(sessao: Dict[str, Any], indice: int) -> str:
    nome = sessao.get("nome")
    return nome if isinstance(nome, str) and nome.strip() else f"sessão {indice + 1}"


def _descricao_da_dose(dose: DoseCardio) -> str:
    partes = []
    if dose.dias_semana is not None:
        partes.append(f"{dose.dias_semana} dia(s) por semana com cardio")
    if dose.minutos_sessao is not None:
        partes.append(f"cerca de {dose.minutos_sessao} min de cardio em cada um desses dias")
    if dose.modalidades:
        partes.append(f"apenas estas modalidades: {', '.join(dose.modalidades)}")
    return "; ".join(partes)


def validar_dose_cardio(molde: Any, questionario: Any) -> Optional[str]:
    """
    Confere o molde contra a dose declarada.

    Devolve None quando respeita (ou quando não há dose/molde a validar) e, se
    viola, a mensagem que alimenta o retry dirigido — nomeando semana-tipo,
    sessão, o número que veio e o alvo. Mensagem genérica não serve: com uma
    única tentativa de correção, o modelo precisa saber exatamente o que mudar.
    """
    mensagens = []
    for validador in (_validar, _validar_teto_progressao):
        try:
            mensagem = validador(molde, questionario)
        except Exception:
            logger.exception("Falha interna ao validar o contrato de cardio do molde.")
            return (
                "Não foi possível validar com segurança o contrato de cardio do "
                "molde. Gere novamente sem persistir esta versão."
            )
        if mensagem:
            mensagens.append(mensagem)
    return " ".join(mensagens) or None


def _validar_teto_progressao(molde: Any, questionario: Any) -> Optional[str]:
    if not isinstance(molde, dict):
        return None

    inconsistencias = _violacoes_chaves_semanas_avulsas(molde)
    if inconsistencias:
        return "O molde tem semanas avulsas inconsistentes. " + " ".join(inconsistencias)

    nivel = nivel_cardio_efetivo(questionario)
    if nivel is None:
        return None

    progressao = molde.get("progressao")
    if not isinstance(progressao, dict):
        return None
    regras = progressao.get("regras")
    if not isinstance(regras, list):
        return None

    teto = TETO_PROGRESSAO_POR_NIVEL[nivel]
    violacoes: List[str] = []
    ha_outras_violacoes = False
    intervalos: List[Tuple[int, int, int, Tuple[str, ...]]] = []

    def registrar(mensagem: str) -> None:
        nonlocal ha_outras_violacoes
        if len(violacoes) < MAX_VIOLACOES_NA_MENSAGEM:
            violacoes.append(mensagem)
        else:
            ha_outras_violacoes = True

    for indice, regra in enumerate(regras):
        if (
            not isinstance(regra, dict)
            or regra.get("tipo") != "delta_cardio_percentual"
        ):
            continue
        valor = regra.get("valor")
        if isinstance(valor, bool) or not isinstance(valor, (int, float)) or valor <= 0:
            continue

        inicio = regra.get("semana_inicio")
        fim = regra.get("semana_fim")
        if valor > teto:
            periodo = (
                f"semanas {inicio}-{fim}"
                if isinstance(inicio, int) and isinstance(fim, int)
                else "período informado"
            )
            registrar(
                f"Na regra de progressão {indice + 1} ({periodo}), "
                f"`delta_cardio_percentual` usa {valor:g}%, acima do teto de "
                f"{teto:g}% para o nível {nivel.upper()}. Reduza `valor` para no "
                "máximo esse teto."
            )

        if (
            isinstance(inicio, bool)
            or not isinstance(inicio, int)
            or isinstance(fim, bool)
            or not isinstance(fim, int)
            or inicio > fim
        ):
            continue

        alvo = regra.get("alvo", "ambos")
        dimensoes = (
            ("duracao", "distancia")
            if alvo == "ambos"
            else (alvo,) if alvo in ("duracao", "distancia") else ()
        )
        intervalos.append((indice, inicio, fim, dimensoes))

    pares: Dict[Tuple[int, int], List[str]] = {}
    for dimensao in ("duracao", "distancia"):
        ativos = sorted(
            (item for item in intervalos if dimensao in item[3]),
            key=lambda item: (item[1], -item[2], item[0]),
        )
        anterior: Optional[Tuple[int, int, int, Tuple[str, ...]]] = None
        for atual in ativos:
            if anterior is not None and atual[1] <= anterior[2]:
                par = tuple(sorted((anterior[0], atual[0])))
                if par in pares:
                    if dimensao not in pares[par]:
                        pares[par].append(dimensao)
                elif len(pares) < MAX_VIOLACOES_NA_MENSAGEM:
                    pares[par] = [dimensao]
                else:
                    ha_outras_violacoes = True
            if anterior is None or atual[2] > anterior[2]:
                anterior = atual

    nomes = {"duracao": "duração", "distancia": "distância"}
    for (primeiro, segundo), dimensoes in pares.items():
        registrar(
            f"As regras de progressão {primeiro + 1} e {segundo + 1} se "
            f"sobrepõem para {' e '.join(nomes[d] for d in dimensoes)}. "
            "Mantenha uma única regra por dimensão em cada semana para que os "
            "percentuais não sejam compostos acima do teto."
        )

    for mensagem in _violacoes_teto_semanas_avulsas(molde, nivel, regras):
        registrar(mensagem)

    if not violacoes:
        return None

    corpo = " ".join(violacoes)
    if ha_outras_violacoes:
        corpo += " (há outras violações)"
    return "O molde não respeita o teto de progressão do cardio declarado. " + corpo


def _validar(molde: Any, questionario: Any) -> Optional[str]:
    dose = dose_declarada(questionario)
    if dose is None:
        return None

    semanas = _semanas_tipo(molde) + _semanas_avulsas(molde)
    if not semanas:
        return None

    violacoes: List[str] = []
    permitidas = set(dose.modalidades)

    for indice_semana, semana in enumerate(semanas):
        id_semana = semana.get("id")
        rotulo_semana = (
            id_semana if isinstance(id_semana, str) and id_semana.strip()
            else f"semana-tipo {indice_semana + 1}"
        )
        sessoes = _sessoes(semana)
        if not sessoes:
            continue

        dias_com_cardio = 0
        for indice_sessao, sessao in enumerate(sessoes):
            exercicios = _exercicios(sessao)
            rotulo = _rotulo_sessao(sessao, indice_sessao)
            temporais_desconhecidos = [
                e for e in exercicios if _e_temporal_fora_do_catalogo(e)
            ]
            if temporais_desconhecidos:
                nomes = ", ".join(
                    str(e.get("nome")) for e in temporais_desconhecidos
                )
                violacoes.append(
                    f"Em {rotulo_semana}/{rotulo}: {nomes} usa duração ou "
                    "distância, mas não existe no catálogo. Use uma modalidade "
                    "catalogada para que a dose de cardio seja verificável."
                )

            cardios = [e for e in exercicios if _e_cardio(e.get("nome"))]
            if not cardios:
                continue
            dias_com_cardio += 1

            if dose.sem_cardio:
                nomes = ", ".join(str(e.get("nome")) for e in cardios)
                violacoes.append(
                    f"Em {rotulo_semana}/{rotulo}: o aluno pediu um plano SEM cardio, "
                    f"mas há {nomes}. Remova esses exercícios."
                )
                continue

            if permitidas:
                fora = [
                    str(e.get("nome"))
                    for e in cardios
                    if _nome_cardio_canonico(e.get("nome")) not in permitidas
                ]
                if fora:
                    violacoes.append(
                        f"Em {rotulo_semana}/{rotulo}: {', '.join(fora)} não está entre as "
                        f"modalidades que o aluno aceita. Use apenas: "
                        f"{', '.join(dose.modalidades)}."
                    )

            if dose.minutos_sessao is not None:
                minutos = [_minutos_do_exercicio(e) for e in cardios]
                if all(m is None for m in minutos):
                    violacoes.append(
                        f"Em {rotulo_semana}/{rotulo}: o cardio não tem `duracao_minutos`. "
                        f"A dose do aluno é em minutos ({dose.minutos_sessao} min por dia de "
                        f"cardio) — prescreva `duracao_minutos` mesmo quando houver "
                        f"`distancia_km`."
                    )
                else:
                    total = sum(m for m in minutos if m is not None)
                    piso = dose.minutos_sessao * (1 - TOLERANCIA_MINUTOS)
                    teto = dose.minutos_sessao * (1 + TOLERANCIA_MINUTOS)
                    if total < piso or total > teto:
                        violacoes.append(
                            f"Em {rotulo_semana}/{rotulo}: o cardio soma "
                            f"{total:g} min (séries × duração), fora da faixa aceita de "
                            f"{piso:g} a {teto:g} min — o aluno declarou "
                            f"{dose.minutos_sessao} min por dia de cardio."
                        )

        if dose.sem_cardio or dose.dias_semana is None:
            continue

        # Alvo EFETIVO: o aluno pode ter pedido mais dias de cardio do que existem
        # sessões na semana. Cobrar o impossível gastaria as duas tentativas.
        alvo = min(dose.dias_semana, len(sessoes))
        if dias_com_cardio != alvo:
            if dias_com_cardio < alvo:
                falta = alvo - dias_com_cardio
                violacoes.append(
                    f"Em {rotulo_semana}: há cardio em {dias_com_cardio} de {len(sessoes)} "
                    f"sessões, e o aluno declarou {alvo}. Acrescente cardio em {falta} "
                    f"sessão(ões) desta semana-tipo."
                )
            else:
                sobra = dias_com_cardio - alvo
                violacoes.append(
                    f"Em {rotulo_semana}: há cardio em {dias_com_cardio} sessões, mais que "
                    f"os {alvo} que o aluno declarou. Remova o cardio de {sobra} "
                    f"sessão(ões) desta semana-tipo."
                )

    if not violacoes:
        return None

    cabecalho = (
        "O molde não respeita o cardio que o aluno declarou no questionário "
        f"({_descricao_da_dose(dose)})."
        if not dose.sem_cardio
        else "O aluno declarou que NÃO quer cardio no plano."
    )
    mostradas = violacoes[:MAX_VIOLACOES_NA_MENSAGEM]
    restantes = len(violacoes) - len(mostradas)
    corpo = " ".join(mostradas)
    if restantes > 0:
        corpo += f" (e mais {restantes} ocorrência(s) do mesmo tipo)"
    return f"{cabecalho} {corpo}"
