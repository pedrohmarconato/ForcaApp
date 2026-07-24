# backend/services/exercise_catalog.py
# Catálogo canônico de exercícios: resolve o nome de texto livre que o modelo
# devolve para uma identidade estável (chave + nome + grupo muscular).
#
# Por que existe: o nome do exercício era 100% texto livre do modelo. Modelos
# menores traduzem literalmente do inglês ("bent-over row" → "Linha Curvada")
# e enfiam o estado da semana no nome ("Supino com Halteres (Deload)"), o que
# quebra QUALQUER casamento por nome — inclusive a sugestão de carga, que casa
# o histórico pelo nome normalizado.
#
# Função PURA de I/O externo: lê um JSON versionado no repo, sem rede e sem banco.

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_CAMINHO_CATALOGO = Path(__file__).resolve().parent.parent / "data" / "catalogo_exercicios.json"

# Palavras sem poder discriminante: não entram no casamento por tokens.
_STOPWORDS = frozenset({
    "com", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
    "a", "o", "as", "os", "e", "ou", "para", "por", "the", "of", "with",
})

# Incremento de carga usado quando o catálogo não define um positivo
# (exercícios de peso corporal). O motor de adaptação assume incremento > 0.
_INCREMENTO_PADRAO_KG = 2.5

# Um token anatômico não coberto pelo candidato VETA o casamento: "Rosca Direta
# de Perna" não pode virar "Rosca Direta com Barra" (bíceps) só porque duas
# palavras batem. Falhar fechado preserva o nome da IA; casar errado grava
# bíceps no lugar de posterior de coxa e contamina o replanejamento.
_TOKENS_ANATOMICOS = frozenset({
    "perna", "pernas", "coxa", "coxas", "femoral", "femorais", "isquiotibiais",
    "panturrilha", "panturrilhas", "gemeos", "gluteo", "gluteos", "quadril",
    "ombro", "ombros", "trapezio", "peito", "peitoral", "peitorais",
    "costas", "dorsal", "dorsais", "lombar", "biceps", "triceps", "antebraco",
    "abdomen", "abdominal", "abdominais", "core", "joelho", "joelhos",
    "panturilha", "adutor", "adutores", "abdutor", "abdutores",
})

# Cobertura mínima da consulta para aceitar um casamento por tokens. Uma forma
# de uma palavra só ("flexao") precisa cobrir metade da consulta; formas de duas
# ou mais palavras ("leg curl") podem cobrir menos, porque já são específicas.
_COBERTURA_MINIMA = 0.5
_COBERTURA_MINIMA_FORMA_LONGA = 0.35


@dataclass(frozen=True)
class ExercicioCanonico:
    """Uma entrada do catálogo."""
    chave: str
    nome: str
    grupo_muscular: str
    equipamento: str
    peso_corporal: bool
    incremento_kg: float
    aliases: Tuple[str, ...]


@dataclass(frozen=True)
class ResultadoResolucao:
    """
    Resultado de resolver um nome vindo do modelo.

    casou=False significa que o nome NÃO está no catálogo: nesse caso o nome
    original é preservado tal como veio e a chave/grupo ficam nulos. Nunca
    inventamos um grupo muscular — dado errado é pior que dado ausente.
    """
    nome: str
    nome_original: str
    chave: Optional[str]
    grupo_muscular: Optional[str]
    equipamento: Optional[str]
    incremento_kg: float
    peso_corporal: bool
    qualificador: Optional[str]
    casou: bool


def normalizar(texto: str) -> str:
    """Minúsculas, sem acento, sem pontuação, espaços colapsados."""
    if not texto:
        return ""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    sem_pontuacao = re.sub(r"[^a-z0-9]+", " ", sem_acento.lower())
    return re.sub(r"\s+", " ", sem_pontuacao).strip()


def _tokens(texto_normalizado: str) -> frozenset:
    return frozenset(t for t in texto_normalizado.split() if t not in _STOPWORDS)


def separar_qualificador(nome: str) -> Tuple[str, Optional[str]]:
    """
    Separa o nome do exercício dos qualificadores entre parênteses.

    'Supino com Halteres (Deload)' → ('Supino com Halteres', 'Deload')
    O qualificador costuma ser estado da semana ou tradução — nunca identidade.
    """
    if not nome:
        return "", None
    partes = re.findall(r"\(([^)]*)\)", nome)
    base = re.sub(r"\([^)]*\)", " ", nome)
    base = re.sub(r"\s+", " ", base).strip(" -–—,;")
    qualificador = " · ".join(p.strip() for p in partes if p.strip()) or None
    return (base or nome.strip()), qualificador


@lru_cache(maxsize=1)
def carregar_catalogo() -> Tuple[ExercicioCanonico, ...]:
    """Carrega e valida o catálogo do disco (uma vez por processo)."""
    with open(_CAMINHO_CATALOGO, "r", encoding="utf-8") as fh:
        bruto = json.load(fh)

    entradas: List[ExercicioCanonico] = []
    chaves_vistas = set()
    for item in bruto.get("exercicios", []):
        chave = item["chave"]
        if chave in chaves_vistas:
            raise ValueError(f"Catálogo inválido: chave duplicada '{chave}'.")
        chaves_vistas.add(chave)
        incremento = item.get("incremento_kg")
        entradas.append(ExercicioCanonico(
            chave=chave,
            nome=item["nome"],
            grupo_muscular=item["grupo_muscular"],
            equipamento=item["equipamento"],
            peso_corporal=bool(item.get("peso_corporal", False)),
            incremento_kg=float(incremento) if isinstance(incremento, (int, float)) and incremento > 0
            else _INCREMENTO_PADRAO_KG,
            aliases=tuple(item.get("aliases", [])),
        ))
    if not entradas:
        raise ValueError("Catálogo inválido: nenhum exercício carregado.")
    return tuple(entradas)


@lru_cache(maxsize=1)
def _indice() -> Dict[str, Any]:
    """
    Índices de busca. Um alias que aponte para DUAS chaves diferentes é erro de
    catálogo e explode no carregamento — ambiguidade silenciosa canonizaria
    errado para sempre.
    """
    exato: Dict[str, ExercicioCanonico] = {}
    formas: List[Tuple[frozenset, ExercicioCanonico]] = []
    por_chave: Dict[str, ExercicioCanonico] = {}

    for ex in carregar_catalogo():
        por_chave[ex.chave] = ex
        for forma in (ex.nome, *ex.aliases):
            n = normalizar(forma)
            if not n:
                continue
            anterior = exato.get(n)
            if anterior is not None and anterior.chave != ex.chave:
                raise ValueError(
                    f"Catálogo inválido: a forma '{forma}' aponta para "
                    f"'{anterior.chave}' e '{ex.chave}'."
                )
            exato[n] = ex
            formas.append((_tokens(n), ex))

    return {"exato": exato, "formas": formas, "por_chave": por_chave}


def _melhor_por_tokens(consulta: frozenset) -> Optional[ExercicioCanonico]:
    """
    Casamento conservador por tokens: só aceita quando uma forma do catálogo
    está CONTIDA na consulta (ou vice-versa). Sem sobreposição parcial — é o
    que impede 'Rosca Direta com Halteres' de virar 'Rosca Direta com Barra'.
    Empate entre chaves diferentes = ambíguo = não casa.
    """
    if not consulta:
        return None

    melhor_score = 0.0
    # chave → (melhor score, entrada, união dos tokens da consulta que as formas dessa entrada cobrem)
    candidatos: Dict[str, Tuple[float, ExercicioCanonico, frozenset]] = {}

    for tokens_forma, ex in _indice()["formas"]:
        if not tokens_forma:
            continue
        if tokens_forma <= consulta:
            score = len(tokens_forma) / len(consulta)
            minimo = (
                _COBERTURA_MINIMA_FORMA_LONGA if len(tokens_forma) >= 2
                else _COBERTURA_MINIMA
            )
            if score < minimo:
                continue
        elif consulta <= tokens_forma:
            score = len(consulta) / len(tokens_forma)
        else:
            continue
        anterior = candidatos.get(ex.chave)
        cobertos = (tokens_forma & consulta) | (anterior[2] if anterior else frozenset())
        melhor_da_chave = max(score, anterior[0]) if anterior else score
        candidatos[ex.chave] = (melhor_da_chave, ex, cobertos)
        melhor_score = max(melhor_score, score)

    if melhor_score <= 0:
        return None

    vencedores = [c for c in candidatos.values() if c[0] >= melhor_score - 1e-9]
    if len(vencedores) == 1:
        return _sem_veto_anatomico(vencedores[0], consulta)

    # Empate: ganha quem cobre mais tokens da consulta somando todas as suas
    # formas ('Rosca Direta Inclinada com Halteres' cobre os 4 tokens em
    # 'rosca direta inclinada' + 'rosca inclinada com halteres'; a rosca direta
    # simples deixa 'inclinada' de fora). Empate persistente = ambíguo.
    cobertura_maxima = max(len(c[2]) for c in vencedores)
    finalistas = [c for c in vencedores if len(c[2]) == cobertura_maxima]
    if len(finalistas) != 1:
        return None  # ambíguo: melhor não decidir
    return _sem_veto_anatomico(finalistas[0], consulta)


def _sem_veto_anatomico(candidato, consulta: frozenset):
    """Devolve a entrada só se nenhum token anatômico da consulta ficou de fora."""
    _, ex, cobertos = candidato
    nao_cobertos = consulta - cobertos
    if nao_cobertos & _TOKENS_ANATOMICOS:
        return None
    return ex


# Formas equivalentes de declarar o mesmo equipamento.
_EQUIPAMENTO_SINONIMOS = {
    "haltere": "halteres", "halter": "halteres", "dumbbell": "halteres", "dumbbells": "halteres",
    "barbell": "barra", "barra livre": "barra", "barra w": "barra w", "barra ez": "barra w",
    "maquina": "maquina", "machine": "maquina", "aparelho": "maquina",
    "cabo": "polia", "cable": "polia", "polias": "polia", "crossover": "polia",
    "peso do corpo": "peso corporal", "corporal": "peso corporal", "bodyweight": "peso corporal",
    "nenhum": "peso corporal", "sem equipamento": "peso corporal", "livre": "peso corporal",
}


def _equipamento_chave(equipamento: Any) -> str:
    n = normalizar(str(equipamento or ""))
    return _EQUIPAMENTO_SINONIMOS.get(n, n)


@lru_cache(maxsize=1)
def _equipamentos_do_catalogo() -> frozenset:
    return frozenset(_equipamento_chave(ex.equipamento) for ex in carregar_catalogo())


def _equipamento_no_qualificador(qualificador: Optional[str]) -> str:
    """
    O modelo costuma pôr o implemento entre parênteses: 'Supino Inclinado
    (Halteres)'. Isso é identidade, não estado da semana — e vale mais que o
    campo equipamento, porque está dentro do nome que ele escolheu.
    Qualificador ambíguo ('Barra ou Halteres') não é equipamento.
    """
    chave = _equipamento_chave(qualificador)
    return chave if chave in _equipamentos_do_catalogo() else ""


def resolver_exercicio(nome: Any, equipamento: Any = None) -> ResultadoResolucao:
    """
    Resolve o nome livre do modelo contra o catálogo.

    O equipamento declarado pelo modelo só é usado como desempate quando o nome
    sozinho não decide (ex.: 'Supino' + 'Halteres').
    """
    nome_original = str(nome).strip() if nome is not None else ""
    if not nome_original:
        return ResultadoResolucao(
            nome="Exercício", nome_original="", chave=None, grupo_muscular=None,
            equipamento=None, incremento_kg=_INCREMENTO_PADRAO_KG,
            peso_corporal=False, qualificador=None, casou=False,
        )

    base, qualificador = separar_qualificador(nome_original)
    idx = _indice()

    # 1. Nome exato (canônico ou alias), com e sem os parênteses.
    encontrado = idx["exato"].get(normalizar(base)) or idx["exato"].get(normalizar(nome_original))

    # 1b. O nome exato pode ser ambíguo quanto ao implemento ('Linha Curvada'
    # existe com barra e com halteres). Se o modelo declarou um equipamento que
    # contradiz o que casou, a variante com o equipamento certo tem precedência.
    # O implemento entre parênteses tem precedência sobre o campo equipamento.
    equip_declarado = _equipamento_no_qualificador(qualificador) or _equipamento_chave(equipamento)
    if encontrado is not None and equip_declarado and _equipamento_chave(encontrado.equipamento) != equip_declarado:
        # Usa a forma CANÔNICA do equipamento na busca: o modelo escreve
        # 'dumbbell'/'Haltere' e o catálogo diz 'Halteres'.
        alternativa = _melhor_por_tokens(_tokens(normalizar(f"{base} {equip_declarado}")))
        if (
            alternativa is not None
            and alternativa.chave != encontrado.chave
            and _equipamento_chave(alternativa.equipamento) == equip_declarado
        ):
            encontrado = alternativa

    # 2. Tokens do nome sem parênteses.
    if encontrado is None:
        encontrado = _melhor_por_tokens(_tokens(normalizar(base)))

    # 3. Desempate pelo equipamento declarado (na forma canônica).
    if encontrado is None and equip_declarado:
        encontrado = _melhor_por_tokens(_tokens(normalizar(f"{base} {equip_declarado}")))

    # 4. Tokens incluindo o conteúdo dos parênteses (último recurso).
    if encontrado is None:
        encontrado = _melhor_por_tokens(_tokens(normalizar(nome_original)))

    if encontrado is None:
        return ResultadoResolucao(
            nome=nome_original,
            nome_original=nome_original,
            chave=None,
            grupo_muscular=None,
            equipamento=str(equipamento) if equipamento else None,
            incremento_kg=_INCREMENTO_PADRAO_KG,
            peso_corporal=False,
            qualificador=qualificador,
            casou=False,
        )

    return ResultadoResolucao(
        nome=encontrado.nome,
        nome_original=nome_original,
        chave=encontrado.chave,
        grupo_muscular=encontrado.grupo_muscular,
        equipamento=encontrado.equipamento,
        incremento_kg=encontrado.incremento_kg,
        peso_corporal=encontrado.peso_corporal,
        qualificador=qualificador,
        casou=True,
    )


def nomes_por_grupo() -> Dict[str, List[str]]:
    """Nomes canônicos agrupados por grupo muscular, na ordem do catálogo."""
    agrupado: Dict[str, List[str]] = {}
    for ex in carregar_catalogo():
        agrupado.setdefault(ex.grupo_muscular, []).append(ex.nome)
    return agrupado


def catalogo_para_prompt(equipamentos_disponiveis: Optional[List[str]] = None) -> str:
    """
    Lista compacta para injetar no prompt do molde: 'Grupo: Nome | Nome | ...'.

    equipamentos_disponiveis filtra o catálogo quando o questionário informa o
    que o aluno tem (peso corporal e cardio nunca são filtrados). Filtro que
    deixaria o catálogo sem exercício com carga externa é ignorado — um rótulo
    de equipamento que não reconhecemos não pode virar um plano só de prancha.
    """
    entradas = carregar_catalogo()

    if equipamentos_disponiveis:
        permitidos = {_equipamento_chave(e) for e in equipamentos_disponiveis if e}
        filtradas = [
            ex for ex in entradas
            if ex.peso_corporal
            or ex.grupo_muscular in ("Cardio", "Mobilidade")
            or _equipamento_chave(ex.equipamento) in permitidos
        ]
        com_carga = [
            ex for ex in filtradas
            if not ex.peso_corporal and ex.grupo_muscular not in ("Cardio", "Mobilidade")
        ]
        if len(com_carga) >= 10 and len({ex.grupo_muscular for ex in filtradas}) >= 5:
            entradas = tuple(filtradas)

    agrupado: Dict[str, List[str]] = {}
    for ex in entradas:
        agrupado.setdefault(ex.grupo_muscular, []).append(ex.nome)

    return "\n".join(f"{grupo}: {' | '.join(nomes)}" for grupo, nomes in agrupado.items())
