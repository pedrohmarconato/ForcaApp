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

import hashlib
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


# Como o exercício é medido. Define o que o plano prescreve, o que o app pergunta
# e o que o motor de adaptação pode mexer.
METRICA_CARGA_REPS = "carga_reps"
METRICA_TEMPO = "tempo"
METRICA_TEMPO_DISTANCIA = "tempo_distancia"
METRICAS_VALIDAS = frozenset({METRICA_CARGA_REPS, METRICA_TEMPO, METRICA_TEMPO_DISTANCIA})


@dataclass(frozen=True)
class ExercicioCanonico:
    """Uma entrada do catálogo."""
    chave: str
    nome: str
    grupo_muscular: str
    equipamento: str
    peso_corporal: bool
    incremento_kg: float
    metrica: str
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
    # Como o exercício é medido: carga_reps (padrão), tempo ou tempo_distancia.
    metrica: str
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
def _carregar_documento() -> Dict[str, Any]:
    """Lê o documento versionado uma vez por processo."""
    with open(_CAMINHO_CATALOGO, "r", encoding="utf-8") as fh:
        bruto = json.load(fh)
    if not isinstance(bruto, dict) or not isinstance(bruto.get("versao"), int):
        raise ValueError("Catálogo inválido: versão inteira ausente.")
    return bruto


@lru_cache(maxsize=1)
def carregar_catalogo() -> Tuple[ExercicioCanonico, ...]:
    """Carrega e valida o catálogo do disco (uma vez por processo)."""
    bruto = _carregar_documento()

    entradas: List[ExercicioCanonico] = []
    chaves_vistas = set()
    for item in bruto.get("exercicios", []):
        chave = item["chave"]
        if chave in chaves_vistas:
            raise ValueError(f"Catálogo inválido: chave duplicada '{chave}'.")
        chaves_vistas.add(chave)
        incremento = item.get("incremento_kg")
        metrica = item.get("metrica", METRICA_CARGA_REPS)
        if metrica not in METRICAS_VALIDAS:
            raise ValueError(f"Catálogo inválido: métrica '{metrica}' em '{chave}'.")
        entradas.append(ExercicioCanonico(
            chave=chave,
            nome=item["nome"],
            grupo_muscular=item["grupo_muscular"],
            equipamento=item["equipamento"],
            peso_corporal=bool(item.get("peso_corporal", False)),
            incremento_kg=float(incremento) if isinstance(incremento, (int, float)) and incremento > 0
            else _INCREMENTO_PADRAO_KG,
            metrica=metrica,
            aliases=tuple(item.get("aliases", [])),
        ))
    if not entradas:
        raise ValueError("Catálogo inválido: nenhum exercício carregado.")
    return tuple(entradas)


def catalogo_serializavel() -> Dict[str, Any]:
    """Catálogo completo para o app: versão + lista achatada, sem aliases."""
    return {
        "versao": _carregar_documento()["versao"],
        "exercicios": [
            {
                "chave": ex.chave,
                "nome": ex.nome,
                "grupo_muscular": ex.grupo_muscular,
                "equipamento": ex.equipamento,
                "peso_corporal": ex.peso_corporal,
                "incremento_kg": ex.incremento_kg,
                "metrica": ex.metrica,
            }
            for ex in carregar_catalogo()
        ],
    }


@lru_cache(maxsize=1)
def etag_catalogo() -> str:
    """ETag forte derivado da versão declarada e do conteúdo exato do arquivo."""
    digest = hashlib.sha256(_CAMINHO_CATALOGO.read_bytes()).hexdigest()[:16]
    return "catalogo-v{}-{}".format(_carregar_documento()["versao"], digest)


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
            peso_corporal=False, metrica=METRICA_CARGA_REPS, qualificador=None, casou=False,
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
            metrica=METRICA_CARGA_REPS,
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
        metrica=encontrado.metrica,
        qualificador=qualificador,
        casou=True,
    )


def nomes_por_grupo() -> Dict[str, List[str]]:
    """Nomes canônicos agrupados por grupo muscular, na ordem do catálogo."""
    agrupado: Dict[str, List[str]] = {}
    for ex in carregar_catalogo():
        agrupado.setdefault(ex.grupo_muscular, []).append(ex.nome)
    return agrupado


# Grupos musculares que representam cardio e mobilidade/alongamento no catálogo.
# São os únicos removíveis por opção do aluno (inclui_cardio/inclui_alongamento).
GRUPO_CARDIO = "Cardio"
GRUPO_MOBILIDADE = "Mobilidade"


def catalogo_para_prompt(
    equipamentos_disponiveis: Optional[List[str]] = None,
    incluir_cardio: bool = True,
    incluir_mobilidade: bool = True,
) -> str:
    """
    Lista compacta para injetar no prompt do molde: 'Grupo: Nome | Nome | ...'.

    equipamentos_disponiveis filtra o catálogo quando o questionário informa o
    que o aluno tem (peso corporal e cardio nunca são filtrados por equipamento).
    Filtro que deixaria o catálogo sem exercício com carga externa é ignorado —
    um rótulo de equipamento que não reconhecemos não pode virar um plano só de
    prancha.

    incluir_cardio/incluir_mobilidade refletem as opções inclui_cardio e
    inclui_alongamento do questionário: quem optou por não incluir cardio ou
    alongamento não recebe esses nomes no cardápio do modelo (o grupo some do
    prompt). Musculação e peso corporal nunca são cortados por aqui.
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

    grupos_excluidos = set()
    if not incluir_cardio:
        grupos_excluidos.add(GRUPO_CARDIO)
    if not incluir_mobilidade:
        grupos_excluidos.add(GRUPO_MOBILIDADE)
    if grupos_excluidos:
        entradas = tuple(ex for ex in entradas if ex.grupo_muscular not in grupos_excluidos)

    agrupado: Dict[str, List[str]] = {}
    for ex in entradas:
        agrupado.setdefault(ex.grupo_muscular, []).append(ex.nome)

    return "\n".join(f"{grupo}: {' | '.join(nomes)}" for grupo, nomes in agrupado.items())


# --- Decisão ÚNICA de métrica ------------------------------------------------
# O mapper e o expansor precisam concordar sobre o que é exercício "por tempo".
# Quando cada metade decidia sozinha, o mesmo exercício progredia como carga no
# expansor (ganhando séries e %RM) e era gravado como cardio pelo mapper — que
# então descartava o %RM e nunca alongava a duração. Uma corrida de 5 min virava
# 9 séries de 5 min. Qualquer código que precise saber a métrica de um exercício
# do molde tem de chamar `metrica_do_exercicio`.

# "45s", "20 min", "5 km": número seguido de unidade de tempo/distância. É
# prescrição de DURAÇÃO escrita no campo errado, não repetição — o modelo faz
# isso, e o MOLDE_SCHEMA não proíbe (basta um entre reps/duração/distância).
_UNIDADE_NAO_REPETICAO = re.compile(
    r"^\s*\d+(?:[.,]\d+)?\s*(?:s|seg|segs|segundos?|min|mins|minutos?|h|horas?|m|km)\s*$",
    re.IGNORECASE,
)


def _tem_repeticoes_explicitas(valor: Any) -> bool:
    """
    True só quando o molde prescreveu repetições de verdade (com número).

    Uma isometria de nome livre com `repeticoes: "45s"` virava "3 séries de 45
    repetições": o número existe, mas o que ele descreve é tempo.
    """
    if isinstance(valor, bool):
        return False
    if isinstance(valor, int):
        return valor >= 1
    texto = str(valor or "")
    if _UNIDADE_NAO_REPETICAO.match(texto):
        return False
    return any(int(n) >= 1 for n in re.findall(r"\d+", texto))


def _numero_positivo(valor: Any) -> bool:
    return isinstance(valor, (int, float)) and not isinstance(valor, bool) and valor > 0


def metrica_do_exercicio(exercicio: Dict[str, Any]) -> str:
    """
    Métrica de um exercício do molde, pela mesma regra em todo o pipeline.

    Ordem de precedência:
    1. Catálogo, quando o nome casa — é ele quem manda (invariante do produto).
    2. `metrica` declarada, só para nome FORA do catálogo (o editor manual a
       envia; o MOLDE_SCHEMA da IA sequer define o campo).
    3. Prescrição: sem repetições e com duração ou distância legível, é
       exercício por tempo. Sem isso, `_parse_reps` inventaria a faixa 8–12 e a
       duração/distância prescrita seria descartada.
    4. Carga × repetição.
    """
    canonico = resolver_exercicio(exercicio.get("nome"), exercicio.get("equipamento"))
    if canonico.chave is not None:
        return canonico.metrica

    declarada = exercicio.get("metrica")
    if declarada in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA):
        return declarada

    repeticoes = exercicio.get("repeticoes")
    if not _tem_repeticoes_explicitas(repeticoes):
        # A prescrição pode ter vindo no campo errado ("repeticoes": "45s"):
        # o mapper já sabe ler isso, e a métrica precisa concordar com ele.
        unidade = _UNIDADE_NAO_REPETICAO.match(str(repeticoes or ""))
        distancia_em_reps = bool(unidade) and unidade.group(0).strip().lower().endswith(
            ("m", "km")
        ) and not unidade.group(0).strip().lower().endswith(("min", "mins"))
        tem_distancia = _numero_positivo(exercicio.get("distancia_km")) or distancia_em_reps
        tem_duracao = (
            _numero_positivo(exercicio.get("duracao_minutos"))
            or bool(re.findall(r"\d", str(exercicio.get("duracao_minutos") or "")))
            or (bool(unidade) and not distancia_em_reps)
        )
        if tem_distancia:
            return METRICA_TEMPO_DISTANCIA
        if tem_duracao:
            return METRICA_TEMPO

    return canonico.metrica


def e_por_tempo(exercicio: Dict[str, Any]) -> bool:
    """Exercício medido por duração (e distância), nunca por carga × repetição."""
    return metrica_do_exercicio(exercicio) in (METRICA_TEMPO, METRICA_TEMPO_DISTANCIA)


def progride_por_series(exercicio: Dict[str, Any]) -> bool:
    """
    O exercício aceita `delta_series` (mais séries por semana)?

    Cardio de deslocamento cresce por duração/distância: multiplicar SÉRIE de
    uma corrida de 20 min produz 5 corridas de 28 min, que ninguém prescreveu.
    Isometria (prancha, Abdômen) e HIIT curto, esses sim progridem por série —
    congelá-los deixaria o exercício de core parado enquanto o resto do plano
    progride. A fronteira é o vocabulário do próprio catálogo.
    """
    if exercicio.get("progressivel") is False:
        return False
    if not e_por_tempo(exercicio):
        return True  # carga × repetição progride por série, sempre
    canonico = resolver_exercicio(exercicio.get("nome"), exercicio.get("equipamento"))
    if canonico.chave is None:
        # Nome livre medido por tempo: não sabemos se é uma prancha de 45 s ou
        # um bloco de 20 min. Sem essa informação, não inventamos volume.
        return False
    return canonico.grupo_muscular not in ("Cardio", "Mobilidade")
