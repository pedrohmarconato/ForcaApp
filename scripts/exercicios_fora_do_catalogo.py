#!/usr/bin/env python3
"""Relata exercícios livres gravados para orientar a curadoria do catálogo.

O comando é somente leitura (dry-run por definição): consulta
``planned_exercises.exercise_key is null``, agrupa nomes normalizados e conta
ocorrências e usuários distintos. Nunca imprime a service role.

Uso:
    SUPABASE_URL=https://<ref>.supabase.co \
    SUPABASE_SERVICE_ROLE_KEY=<chave> \
    python3 scripts/exercicios_fora_do_catalogo.py

Saída consumível por automação:
    python3 scripts/exercicios_fora_do_catalogo.py --json
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.services.exercise_catalog import normalizar  # noqa: E402

PAGINA = 500


def _requisicao(url, chave):
    req = urllib.request.Request(url, method="GET")
    req.add_header("apikey", chave)
    req.add_header("Authorization", "Bearer {}".format(chave))
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            texto = response.read().decode("utf-8")
            return json.loads(texto) if texto else []
    except urllib.error.HTTPError as exc:
        detalhe = exc.read().decode("utf-8", errors="replace")
        raise SystemExit("Falha ao consultar planned_exercises (HTTP {}): {}".format(
            exc.code, detalhe
        ))
    except urllib.error.URLError as exc:
        raise SystemExit("Falha de rede ao consultar planned_exercises: {}".format(exc.reason))


def carregar_livres(base_url, chave):
    """Busca todas as linhas nulas, paginadas para não truncar em 1000."""
    linhas = []
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "select": "name,planned_sessions!inner(user_id)",
                "exercise_key": "is.null",
                "order": "id",
                "limit": PAGINA,
                "offset": offset,
            }
        )
        pagina = _requisicao(
            "{}/rest/v1/planned_exercises?{}".format(base_url, query), chave
        ) or []
        linhas.extend(pagina)
        if len(pagina) < PAGINA:
            return linhas
        offset += PAGINA


def agrupar_livres(linhas):
    """Agrupa por normalização idêntica à usada pelo catálogo."""
    grupos = {}
    for linha in linhas:
        nome = str(linha.get("name") or "").strip()
        nome_normalizado = normalizar(nome)
        if not nome_normalizado:
            continue
        grupo = grupos.setdefault(
            nome_normalizado,
            {"nomes": Counter(), "ocorrencias": 0, "usuarios": set()},
        )
        grupo["nomes"][nome] += 1
        grupo["ocorrencias"] += 1
        sessao = linha.get("planned_sessions") or {}
        user_id = sessao.get("user_id") if isinstance(sessao, dict) else None
        if user_id:
            grupo["usuarios"].add(str(user_id))

    resultado = []
    for nome_normalizado, grupo in grupos.items():
        nome = sorted(
            grupo["nomes"], key=lambda item: (-grupo["nomes"][item], item.lower())
        )[0]
        resultado.append(
            {
                "nome": nome,
                "nome_normalizado": nome_normalizado,
                "ocorrencias": grupo["ocorrencias"],
                "usuarios_distintos": len(grupo["usuarios"]),
            }
        )
    return sorted(
        resultado,
        key=lambda item: (
            -item["ocorrencias"],
            -item["usuarios_distintos"],
            item["nome_normalizado"],
        ),
    )


def _imprimir_tabela(itens):
    if not itens:
        print("Nenhum exercício fora do catálogo encontrado.")
        return
    largura = max(len("Exercício"), *(len(item["nome"]) for item in itens))
    print(
        "{:<{}}  {:>11}  {:>18}".format(
            "Exercício", largura, "Ocorrências", "Usuários distintos"
        )
    )
    print("{:-<{}}  {:-<11}  {:-<18}".format("", largura, "", ""))
    for item in itens:
        print(
            "{:<{}}  {:>11}  {:>18}".format(
                item["nome"],
                largura,
                item["ocorrencias"],
                item["usuarios_distintos"],
            )
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emite uma lista JSON")
    args = parser.parse_args()

    base_url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base_url or not chave:
        raise SystemExit("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.")

    itens = agrupar_livres(carregar_livres(base_url, chave))
    if args.json:
        print(json.dumps(itens, ensure_ascii=False, indent=2))
    else:
        _imprimir_tabela(itens)


if __name__ == "__main__":
    main()
