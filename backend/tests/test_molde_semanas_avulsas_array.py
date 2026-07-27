# backend/tests/test_molde_semanas_avulsas_array.py
# `semanas_avulsas` chegando como ARRAY em vez do mapa `semana_N -> {...}`.
#
# Modo de falha que estes testes reproduzem: o mapa tem chave sintética
# (`semana_4`) cuja informação já está dentro do item (`semana`), e devolver
# uma lista é a leitura natural — é erro que modelo comete. O expansor lê pelo
# mapa e a validação local exige objeto, então sem a conversão um molde
# perfeitamente bom reprova, a geração no Opus é paga e descartada, e o aluno
# vê "Erro ao gerar plano: Molde inválido".
#
# O outro lado do mesmo cuidado: a conversão NÃO pode inventar chave. Um item
# sem `semana` inteira precisa seguir para a validação e reprovar com a
# mensagem do schema — é ela que alimenta o retry dirigido.

import copy
import os
import sys

import jsonschema
import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.schemas.molde_schema import MOLDE_SCHEMA  # noqa: E402
from backend.services.molde_normalizer import normalizar_molde  # noqa: E402
from backend.services.plan_expander import expandir_plano  # noqa: E402

MOLDE_BASE = {
    "nome": "Plano Teste",
    "duracao_semanas": 4,
    "frequencia_semanal": 1,
    "semanas_tipo": [{
        "id": "tipo_a",
        "sessoes": [{
            "nome": "Treino A", "tipo": "Hipertrofia", "dia_offset": 0,
            "exercicios": [{
                "nome": "Supino Reto com Barra", "ordem": 1, "series": 3,
                "repeticoes": "10", "percentual_rm": 75, "prioridade": "primario",
            }],
        }],
    }],
    "calendario": ["tipo_a"] * 4,
    "progressao": {"regras": []},
}

SESSOES_DA_AVULSA = [{
    "nome": "Deload A", "tipo": "Deload",
    "exercicios": [{
        "nome": "Supino Reto com Barra", "ordem": 1, "series": 2,
        "repeticoes": "8", "percentual_rm": 55, "prioridade": "primario",
    }],
}]


def _molde(avulsas):
    molde = copy.deepcopy(MOLDE_BASE)
    molde["semanas_avulsas"] = avulsas
    return molde


def test_array_vira_mapa_e_passa_na_validacao_local():
    molde = _molde([{"semana": 4, "sessoes": copy.deepcopy(SESSOES_DA_AVULSA)}])
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=molde, schema=MOLDE_SCHEMA)

    normalizado = normalizar_molde(molde)

    assert list(normalizado["semanas_avulsas"]) == ["semana_4"]
    jsonschema.validate(instance=normalizado, schema=MOLDE_SCHEMA)


def test_semana_avulsa_convertida_chega_ao_plano_expandido():
    """A conversão só vale se o expansor achar a semana pela chave que ele usa."""
    molde = normalizar_molde(_molde([{"semana": 4, "sessoes": copy.deepcopy(SESSOES_DA_AVULSA)}]))
    plano = expandir_plano(molde, {"id": "u1"})

    microciclos = [m for c in plano["plano_principal"]["ciclos"] for m in c["microciclos"]]
    semana_4 = next(m for m in microciclos if m["semana"] == 4)
    assert semana_4["sessoes"][0]["nome"] == "Deload A"
    assert semana_4["sessoes"][0]["exercicios"][0]["series"] == 2


def test_mapa_legado_continua_intacto():
    """Com a flag desligada o modelo segue mandando mapa — não pode ser tocado."""
    avulsas = {"semana_4": {"semana": 4, "sessoes": copy.deepcopy(SESSOES_DA_AVULSA)}}
    normalizado = normalizar_molde(_molde(copy.deepcopy(avulsas)))
    assert normalizado["semanas_avulsas"] == avulsas


@pytest.mark.parametrize(
    "avulsas",
    [
        [{"sessoes": SESSOES_DA_AVULSA}],                    # sem `semana`
        [{"semana": "4", "sessoes": SESSOES_DA_AVULSA}],     # semana como texto
        [{"semana": True, "sessoes": SESSOES_DA_AVULSA}],    # bool é int em Python
        ["semana_4"],                                        # nem objeto é
    ],
    ids=["sem-semana", "semana-texto", "semana-bool", "item-nao-objeto"],
)
def test_item_sem_semana_confiavel_nao_vira_chave_inventada(avulsas):
    """Inventar `semana_1` aqui colocaria uma semana no plano do aluno num
    lugar que o modelo nunca pediu. Melhor reprovar e deixar o retry corrigir."""
    normalizado = normalizar_molde(_molde(copy.deepcopy(avulsas)))
    assert isinstance(normalizado["semanas_avulsas"], list)
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=normalizado, schema=MOLDE_SCHEMA)
