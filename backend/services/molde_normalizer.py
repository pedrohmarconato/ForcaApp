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


def normalizar_molde(molde: dict) -> dict:
    """Remove no-ops que reprovariam no schema sem mudar a semântica do plano.

    Hoje: regras de progressão delta_* com valor == 0. A remoção é segura por
    construção — o expansor sem a regra produz o mesmo resultado que teria com
    um delta de zero. Qualquer outro problema segue para a validação de schema
    (e para o retry dirigido) — este módulo NUNCA inventa ou corrige valores.
    """
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
