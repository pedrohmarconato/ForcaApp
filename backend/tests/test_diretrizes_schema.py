# backend/tests/test_diretrizes_schema.py
# Testes de validação do DIRETRIZES_SCHEMA.

import os
import sys

import pytest
import jsonschema

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from backend.schemas.diretrizes_schema import DIRETRIZES_SCHEMA  # noqa: E402


def _diretrizes_validas():
    return {
        "preferencias": ["Focar mais em peito", "Evitar agachamento livre"],
        "restricoes": [
            {
                "descricao": "Dor no ombro direito ao levantar peso acima da cabeça",
                "tipo": "lesao",
                "exercicio_afetado": "Desenvolvimento com halteres",
            },
            {
                "descricao": "Só tenho 40 minutos às terças-feiras",
                "tipo": "tempo_sessao",
            },
        ],
        "excecoes_estruturais": [
            {
                "tipo": "semanas_tipo_diferentes",
                "descricao": "Uma semana com 3 grupos musculares por dia e outra com 2",
                "detalhes": {"semanas_tipo": 2},
            }
        ],
        "observacoes_gerais": "Prefere treinar de manhã.",
    }


def test_diretrizes_validas_passam():
    jsonschema.validate(instance=_diretrizes_validas(), schema=DIRETRIZES_SCHEMA)


def test_sem_preferencias_falha():
    d = _diretrizes_validas()
    del d["preferencias"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_sem_restricoes_falha():
    d = _diretrizes_validas()
    del d["restricoes"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_sem_excecoes_estruturais_falha():
    d = _diretrizes_validas()
    del d["excecoes_estruturais"]
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_diretrizes_vazias_passam():
    d = {"preferencias": [], "restricoes": [], "excecoes_estruturais": []}
    jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_restricao_sem_tipo_falha():
    d = _diretrizes_validas()
    d["restricoes"][0] = {"descricao": "Sem tipo"}
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_restricao_tipo_invalido_falha():
    d = _diretrizes_validas()
    d["restricoes"][0]["tipo"] = "tipo_inventado"
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_excecao_sem_tipo_falha():
    d = _diretrizes_validas()
    d["excecoes_estruturais"][0] = {"descricao": "Sem tipo"}
    with pytest.raises(jsonschema.exceptions.ValidationError):
        jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_excecao_com_detalhes_passa():
    d = _diretrizes_validas()
    d["excecoes_estruturais"][0]["detalhes"] = {"dias_afetados": ["terça"]}
    jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_preferencias_com_array_vazio_passa():
    d = _diretrizes_validas()
    d["preferencias"] = []
    jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)


def test_restricao_com_campos_opcionais_passa():
    d = _diretrizes_validas()
    d["restricoes"].append({
        "descricao": "Evitar exercícios de alto impacto no joelho",
        "tipo": "exercicio_especifico",
        "exercicio_afetado": "Agachamento com salto",
        "grupo_afetado": "Quadríceps",
    })
    jsonschema.validate(instance=d, schema=DIRETRIZES_SCHEMA)
