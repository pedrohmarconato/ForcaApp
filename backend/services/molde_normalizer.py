# backend/services/molde_normalizer.py
# Saneamento determinístico do molde gerado pela IA, ANTES da validação de
# schema. Motivação (HML, 22/07/2026, plano em Haiku): o modelo gera regras de
# progressão delta_* com valor 0 para expressar "sem progressão nestas
# semanas" — o schema exige valor >= 0.5 (ou != 0) e a geração inteira era
# paga e descartada. Um delta de 0 é um no-op semântico: remover a regra
# produz exatamente o plano pretendido.

import json
import re
from typing import Optional

from backend.schemas.molde_schema import CAMPOS_NULAVEIS_DO_EXERCICIO

_TIPOS_DELTA = ("delta_rm_percentual", "delta_series")

# Sentinela: distingue "chave ausente" de "chave presente valendo None".
_AUSENTE = object()


def extrair_molde_do_texto(texto: str) -> Optional[dict]:
    """Extrai o primeiro objeto JSON do texto da resposta. None se não houver
    JSON parseável ou se o JSON não for um objeto."""
    match = re.search(r"\{.*\}", texto or "", re.DOTALL)
    if not match:
        return None
    try:
        candidato = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return candidato if isinstance(candidato, dict) else None


def _semanas_avulsas_para_mapa(molde: dict) -> None:
    """Converte `semanas_avulsas` de array para o mapa `semana_N -> {...}`.

    Mapa com chave sintética (`semana_4`) é o tipo de formato que modelo erra:
    a informação já está dentro do item (`semana`), e devolver uma lista é a
    leitura natural. O expansor lê pelo mapa, e a validação local exige objeto
    — sem esta conversão, um molde perfeitamente bom reprova, a geração é paga
    e descartada, e o aluno vê "Erro ao gerar plano: Molde inválido".

    Mesma família do delta zero abaixo: reparo de FORMA, nunca de conteúdo.

    Item sem `semana` inteira não vira chave nenhuma: em vez de inventar um
    número, deixamos a lista chegar à validação e reprovar com a mensagem do
    schema, que é o que alimenta o retry dirigido.
    """
    avulsas = molde.get("semanas_avulsas")
    if not isinstance(avulsas, list):
        return
    mapa = {}
    for item in avulsas:
        if not isinstance(item, dict):
            return
        semana = item.get("semana")
        if not isinstance(semana, int) or isinstance(semana, bool):
            return
        mapa[f"semana_{semana}"] = item
    molde["semanas_avulsas"] = mapa


def _remover_grupos_musculares_vazios(molde: dict) -> None:
    """Tira `grupos_musculares: []` das sessões, em qualquer semana.

    O schema da API exige o campo (foi assim que se cortaram opcionais para
    caber no teto de 24), mas structured outputs não expressa `minItems` — então
    a lista vazia é completação legal e barata, e o modelo a usa justamente onde
    grupo muscular não faz sentido: sessão de cardio puro. Com `minItems: 1` no
    schema local, isso reprovaria a geração inteira; observado em geração real,
    numa 2ª tentativa que já vinha de outro reparo — ou seja, custaria o plano
    do aluno por um campo que não carrega informação nenhuma.

    Lista vazia é EXATAMENTE equivalente a campo ausente para todo mundo a
    jusante (o mapper faz `sessao.get("grupos_musculares") or []`), então
    removê-la é reparo de FORMA na mesma família do delta zero: não inventa
    conteúdo, só deixa de afirmar o que não foi dito. O que sobra no schema
    local é a garantia útil — quando o campo VEM, vem com conteúdo.
    """
    for semana in (molde.get("semanas_tipo") or []):
        if not isinstance(semana, dict):
            continue
        for sessao in (semana.get("sessoes") or []):
            if isinstance(sessao, dict) and sessao.get("grupos_musculares") == []:
                sessao.pop("grupos_musculares")

    avulsas = molde.get("semanas_avulsas")
    for avulsa in (avulsas.values() if isinstance(avulsas, dict) else avulsas or []):
        if not isinstance(avulsa, dict):
            continue
        for sessao in (avulsa.get("sessoes") or []):
            if isinstance(sessao, dict) and sessao.get("grupos_musculares") == []:
                sessao.pop("grupos_musculares")


def _sessoes(molde: dict):
    """Todas as sessões do molde — semanas-tipo e semanas avulsas."""
    avulsas = molde.get("semanas_avulsas")
    semanas = list(molde.get("semanas_tipo") or [])
    semanas.extend(avulsas.values() if isinstance(avulsas, dict) else avulsas or [])
    for semana in semanas:
        if not isinstance(semana, dict):
            continue
        for sessao in (semana.get("sessoes") or []):
            if isinstance(sessao, dict):
                yield sessao


def _remover_metadados_nulos(molde: dict) -> None:
    """Tira os metadados do exercício que vieram `null`.

    Esses campos são obrigatórios no schema da API DE PROPÓSITO: opcional é o
    que fazia a gramática explodir (ver `_nulificar_metadados_do_exercicio` em
    molde_schema). O preço combinado é que o modelo agora escreve
    `"cadencia": null` onde antes omitia a chave — e `null` reprovaria no schema
    local, que tipa cadência como string.

    Mesma família do delta zero e do `grupos_musculares: []`: reparo de FORMA,
    nunca de conteúdo. `null` aqui significa exatamente "não se aplica", que é o
    que a ausência da chave sempre significou para o expansor e para o mapper.
    """
    for sessao in _sessoes(molde):
        for exercicio in (sessao.get("exercicios") or []):
            if not isinstance(exercicio, dict):
                continue
            for campo in CAMPOS_NULAVEIS_DO_EXERCICIO:
                if exercicio.get(campo, _AUSENTE) is None:
                    exercicio.pop(campo)


def normalizar_molde(molde: dict) -> dict:
    """Remove no-ops que reprovariam no schema sem mudar a semântica do plano.

    Hoje: regras de progressão delta_* com valor == 0, `semanas_avulsas` em
    array (formato que o modelo às vezes devolve), `grupos_musculares: []`
    (lista vazia que o schema da API não consegue proibir e que é idêntica a
    ausência para todo mundo a jusante) e os metadados do exercício em `null`
    (que a API agora exige presentes). A remoção do delta zero é segura
    por construção — o expansor sem a regra produz o mesmo resultado que teria
    com um delta de zero. Qualquer outro problema segue para a validação de
    schema (e para o retry dirigido) — este módulo NUNCA inventa ou corrige
    valores.
    """
    _semanas_avulsas_para_mapa(molde)
    _remover_grupos_musculares_vazios(molde)
    _remover_metadados_nulos(molde)

    progressao = molde.get("progressao")
    if isinstance(progressao, dict) and isinstance(progressao.get("regras"), list):
        progressao["regras"] = [
            regra
            for regra in progressao["regras"]
            if not (
                isinstance(regra, dict)
                and regra.get("tipo") in _TIPOS_DELTA
                and regra.get("valor") == 0
            )
        ]
    return molde
