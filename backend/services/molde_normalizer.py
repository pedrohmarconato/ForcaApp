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

_TIPOS_DELTA = ("delta_rm_percentual", "delta_series")


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


def normalizar_molde(molde: dict) -> dict:
    """Remove no-ops que reprovariam no schema sem mudar a semântica do plano.

    Hoje: regras de progressão delta_* com valor == 0, e `semanas_avulsas` em
    array (formato que o schema da API pede). A remoção do delta zero é segura
    por construção — o expansor sem a regra produz o mesmo resultado que teria
    com um delta de zero. Qualquer outro problema segue para a validação de
    schema (e para o retry dirigido) — este módulo NUNCA inventa ou corrige
    valores.
    """
    _semanas_avulsas_para_mapa(molde)

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
