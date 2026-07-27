# backend/schemas/schema_api.py
# Derivação do schema que vai em `output_config.format` (structured outputs).
#
# Por que derivar em vez de escrever um segundo schema à mão: dois schemas
# soltos divergem em silêncio. O dia em que alguém acrescenta um campo ao
# MOLDE_SCHEMA e esquece da cópia, o modelo passa a não conseguir mais gerar
# esse campo — e nada falha, o plano só vem sem ele. Aqui o schema da API é
# SEMPRE função do schema local; um teste garante que a derivação cobre tudo.
#
# O que a API aceita (Structured Outputs) é um subconjunto do JSON Schema:
#   - suportado: tipos básicos, enum, const, anyOf, allOf, $ref/$defs,
#     formatos de string, additionalProperties: false;
#   - NÃO suportado: restrições numéricas (minimum/maximum/multipleOf),
#     restrições de string (minLength/maxLength/pattern), restrições de
#     array (minItems/maxItems), schemas recursivos e additionalProperties
#     com qualquer valor que não seja `false`.
#
# Consequência que vale registrar: as restrições numéricas continuam
# existindo — só não são mais impostas pela API. Quem as impõe é a validação
# local com o schema COMPLETO (jsonschema.validate), que roda depois. O
# structured output garante a FORMA; o schema local garante os LIMITES.

import copy
from typing import Any, Dict

# Palavras-chave que a API rejeita ou ignora. Removidas em todos os níveis.
CHAVES_NAO_SUPORTADAS = frozenset({
    "$schema",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "multipleOf",
    "minLength",
    "maxLength",
    "pattern",
    "minItems",
    "maxItems",
    "uniqueItems",
})

# Chaves que descrevem a forma de um nó. A API não aceita nenhuma delas no
# mesmo nó que um `anyOf`/`allOf`.
_CHAVES_ESTRUTURAIS = frozenset({"type", "properties", "required", "additionalProperties"})

# Chaves cujo valor é um sub-schema (recursão simples).
_CHAVES_SUBSCHEMA = ("items", "additionalProperties", "not")
# Chaves cujo valor é uma lista de sub-schemas.
_CHAVES_LISTA_SUBSCHEMA = ("anyOf", "allOf", "oneOf")


class SchemaNaoExpressavel(ValueError):
    """O schema tem uma construção que structured outputs não expressa.

    Levantada em vez de gerar um schema silenciosamente mutilado: um objeto de
    forma livre (sem `properties`) vira `additionalProperties: false` e passa a
    aceitar APENAS `{}` — o campo continuaria no schema e nunca mais teria
    conteúdo. Melhor falhar aqui, no import/teste, do que em produção.
    """


def derivar_schema_api(schema: Dict[str, Any], caminho: str = "$") -> Dict[str, Any]:
    """Converte um schema JSON local no subconjunto aceito por output_config.

    Transformações:
      1. remove as chaves de CHAVES_NAO_SUPORTADAS em qualquer profundidade;
      2. `oneOf` vira `anyOf` — na prática equivalente aqui, porque os ramos
         são discriminados por um `const` em `tipo` (um objeto só casa com um);
      3. todo objeto com `properties` ganha `additionalProperties: false`.

    `description` é preservada de propósito: é contexto que o modelo lê.
    """
    if not isinstance(schema, dict):
        raise SchemaNaoExpressavel(f"{caminho}: esperado objeto de schema, veio {type(schema).__name__}")

    derivado: Dict[str, Any] = {}

    for chave, valor in schema.items():
        if chave in CHAVES_NAO_SUPORTADAS:
            continue

        destino = "anyOf" if chave == "oneOf" else chave

        if chave in _CHAVES_LISTA_SUBSCHEMA:
            if not isinstance(valor, list):
                raise SchemaNaoExpressavel(f"{caminho}.{chave}: esperado lista de sub-schemas")
            derivado[destino] = [
                derivar_schema_api(item, f"{caminho}.{chave}[{i}]") for i, item in enumerate(valor)
            ]
        elif chave == "properties":
            if not isinstance(valor, dict):
                raise SchemaNaoExpressavel(f"{caminho}.properties: esperado objeto")
            derivado["properties"] = {
                nome: derivar_schema_api(sub, f"{caminho}.{nome}") for nome, sub in valor.items()
            }
        elif chave in _CHAVES_SUBSCHEMA:
            # additionalProperties: um dict aqui é o mapa de chaves livres, que
            # a API não expressa. Quem usa esse formato precisa converter para
            # array ANTES de derivar (ver MOLDE_SCHEMA_API).
            if chave == "additionalProperties" and isinstance(valor, dict):
                raise SchemaNaoExpressavel(
                    f"{caminho}.additionalProperties: mapa de chaves livres não é expressável "
                    "em structured outputs — converta para array antes de derivar"
                )
            derivado[destino] = (
                derivar_schema_api(valor, f"{caminho}.{chave}") if isinstance(valor, dict) else valor
            )
        else:
            derivado[destino] = copy.deepcopy(valor)

    # `anyOf` só é aceito como o schema INTEIRO do nó. Combiná-lo com a
    # descrição do objeto no mesmo nível (o padrão "objeto assim, E pelo menos
    # um destes campos") volta como:
    #   400 — "For 'anyOf', 'additionalProperties, properties, required, type'
    #          is not supported"
    # Um teste local não pega isso: o schema é JSON Schema válido, só não é
    # aceito pela API. Quem monta o schema precisa resolver o conflito à mão e
    # deixar registrado onde a restrição passou a viver.
    conflito = _CHAVES_ESTRUTURAIS & set(derivado)
    if conflito and ("anyOf" in derivado or "allOf" in derivado):
        raise SchemaNaoExpressavel(
            f"{caminho}: anyOf/allOf no mesmo nó que {sorted(conflito)} não é aceito pela API — "
            "remova o refinamento na preparação do schema (a restrição continua no schema local)"
        )

    if _e_objeto(derivado):
        if "properties" not in derivado:
            raise SchemaNaoExpressavel(
                f"{caminho}: objeto sem `properties` (forma livre) não é expressável — "
                "tipe as propriedades ou troque por string"
            )
        derivado["additionalProperties"] = False

    return derivado


def _e_objeto(schema: Dict[str, Any]) -> bool:
    tipo = schema.get("type")
    if tipo == "object":
        return True
    return isinstance(tipo, list) and "object" in tipo


def chaves_proibidas_restantes(schema: Any, caminho: str = "$") -> list:
    """Varre um schema derivado e devolve os caminhos que ainda têm chave
    proibida. Usado pelos testes — a lista vazia é a prova de que a derivação
    cobriu o schema inteiro, inclusive ramos que ninguém lembrou de olhar."""
    achados = []
    if isinstance(schema, dict):
        for chave, valor in schema.items():
            if chave in CHAVES_NAO_SUPORTADAS or chave == "oneOf":
                achados.append(f"{caminho}.{chave}")
            achados.extend(chaves_proibidas_restantes(valor, f"{caminho}.{chave}"))
    elif isinstance(schema, list):
        for i, item in enumerate(schema):
            achados.extend(chaves_proibidas_restantes(item, f"{caminho}[{i}]"))
    return achados


def objetos_sem_fechamento(schema: Any, caminho: str = "$") -> list:
    """Caminhos de objetos que ficaram sem `additionalProperties: false`.
    A API exige o fechamento em TODO objeto; um só faltando reprova o schema
    inteiro no momento da compilação — e o erro chega como um 400 opaco."""
    achados = []
    if isinstance(schema, dict):
        if _e_objeto(schema) and schema.get("additionalProperties") is not False:
            achados.append(caminho)
        for chave, valor in schema.items():
            achados.extend(objetos_sem_fechamento(valor, f"{caminho}.{chave}"))
    elif isinstance(schema, list):
        for i, item in enumerate(schema):
            achados.extend(objetos_sem_fechamento(item, f"{caminho}[{i}]"))
    return achados


def formato_json_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    """Monta o valor de `output_config` para uma resposta em JSON.

    Só os campos que a API documenta (`type` + `schema`): um campo extra aqui
    volta como 400 na compilação do schema, não como aviso.
    """
    return {"format": {"type": "json_schema", "schema": schema}}
