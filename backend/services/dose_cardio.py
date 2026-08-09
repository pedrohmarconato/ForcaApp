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
    nivel = nivel_cardio_declarado(questionario)
    if (
        nivel is None
        and isinstance(questionario, dict)
        and questionario.get("inclui_cardio") is not False
    ):
        nivel = "iniciante"
    if nivel is None or not isinstance(molde, dict):
        return None

    progressao = molde.get("progressao")
    if not isinstance(progressao, dict):
        return None
    regras = progressao.get("regras")
    if not isinstance(regras, list):
        return None

    teto = TETO_PROGRESSAO_POR_NIVEL[nivel]
    violacoes: List[str] = []
    regras_por_dimensao: List[Tuple[int, int, int, Tuple[str, ...]]] = []
    for indice, regra in enumerate(regras):
        if not isinstance(regra, dict) or regra.get("tipo") != "delta_cardio_percentual":
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
            violacoes.append(
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
        for (
            outro_indice,
            outro_inicio,
            outro_fim,
            outras_dimensoes,
        ) in regras_por_dimensao:
            dimensoes_comuns = [d for d in dimensoes if d in outras_dimensoes]
            if not dimensoes_comuns or max(inicio, outro_inicio) > min(fim, outro_fim):
                continue
            nomes = {
                "duracao": "duração",
                "distancia": "distância",
            }
            alvo_comum = " e ".join(nomes[d] for d in dimensoes_comuns)
            violacoes.append(
                f"As regras de progressão {outro_indice + 1} e {indice + 1} se "
                f"sobrepõem nas semanas {max(inicio, outro_inicio)}-"
                f"{min(fim, outro_fim)} para {alvo_comum}. Mantenha uma única "
                "regra por dimensão em cada semana para que os percentuais não "
                "sejam compostos acima do teto."
            )
        regras_por_dimensao.append((indice, inicio, fim, dimensoes))

    if not violacoes:
        return None

    mostradas = violacoes[:MAX_VIOLACOES_NA_MENSAGEM]
    restantes = len(violacoes) - len(mostradas)
    corpo = " ".join(mostradas)
    if restantes > 0:
        corpo += f" (e mais {restantes} violação(ões))"
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
            cardios = [e for e in _exercicios(sessao) if _e_cardio(e.get("nome"))]
            if not cardios:
                continue
            dias_com_cardio += 1
            rotulo = _rotulo_sessao(sessao, indice_sessao)

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
