#!/usr/bin/env python3
"""
Backfill do catálogo de exercícios em planos JÁ gravados (migration 0013).

Planos gerados antes do catálogo têm o nome livre da IA, exercise_key nulo,
muscle_group nulo e load_increment_kg 2.5 para tudo. Este script resolve cada
exercício contra o catálogo e atualiza as linhas — sem regerar plano nenhum.

Uso (dry-run por padrão, NÃO escreve nada):
    SUPABASE_URL=https://<ref>.supabase.co \\
    SUPABASE_SERVICE_ROLE_KEY=<chave> \\
    python3 scripts/backfill_catalogo_exercicios.py

Para aplicar de verdade, acrescente --apply.
Para restringir a um plano:            --plan-id <uuid>
Para não mexer no incremento de carga: --sem-incremento

Requer service_role (ignora RLS) — rode apenas em ambiente autorizado.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.services.exercise_catalog import resolver_exercicio  # noqa: E402

PAGINA = 500


def _requisicao(url, chave, metodo="GET", corpo=None, extra_headers=None):
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo)
    req.add_header("apikey", chave)
    req.add_header("Authorization", f"Bearer {chave}")
    req.add_header("Content-Type", "application/json")
    for k, v in (extra_headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            texto = resp.read().decode("utf-8")
            return json.loads(texto) if texto else None
    except urllib.error.HTTPError as e:
        detalhe = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} em {metodo} {url}: {detalhe}")


def carregar_exercicios(base, chave, plan_id):
    """Traz todos os exercícios (paginado — PostgREST corta em 1000)."""
    filtro = ""
    if plan_id:
        filtro = f"&planned_sessions.plan_id=eq.{plan_id}"
    select = (
        "select=id,name,equipment,exercise_key,name_original,muscle_group,"
        "load_increment_kg,planned_sessions!inner(plan_id)"
    )
    linhas, offset = [], 0
    while True:
        url = f"{base}/rest/v1/planned_exercises?{select}{filtro}&order=id&limit={PAGINA}&offset={offset}"
        pagina = _requisicao(url, chave) or []
        linhas.extend(pagina)
        if len(pagina) < PAGINA:
            return linhas
        offset += PAGINA


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="escreve de verdade")
    parser.add_argument("--plan-id", default=None, help="restringe a um plano")
    parser.add_argument("--sem-incremento", action="store_true",
                        help="não atualiza load_increment_kg")
    args = parser.parse_args()

    base = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base or not chave:
        raise SystemExit("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.")

    linhas = carregar_exercicios(base, chave, args.plan_id)
    print(f"Alvo: {base}")
    print(f"{len(linhas)} exercícios lidos"
          f"{' do plano ' + args.plan_id if args.plan_id else ''}.\n")

    atualizacoes, sem_catalogo, ja_ok = [], [], 0
    for linha in linhas:
        if linha.get("exercise_key"):
            ja_ok += 1
            continue
        r = resolver_exercicio(linha.get("name"), linha.get("equipment"))
        if not r.casou:
            sem_catalogo.append(linha.get("name"))
            continue
        patch = {
            "name": r.nome,
            "exercise_key": r.chave,
            "muscle_group": r.grupo_muscular,
            "equipment": r.equipamento,
        }
        if r.nome_original != r.nome:
            patch["name_original"] = r.nome_original
        if not args.sem_incremento:
            patch["load_increment_kg"] = r.incremento_kg
        atualizacoes.append((linha["id"], linha.get("name"), patch))

    distintos = {}
    for _, antigo, patch in atualizacoes:
        distintos.setdefault((antigo, patch["name"], patch["muscle_group"]), 0)
        distintos[(antigo, patch["name"], patch["muscle_group"])] += 1

    print(f"{ja_ok} já tinham chave · {len(atualizacoes)} a atualizar · "
          f"{len(sem_catalogo)} fora do catálogo\n")
    for (antigo, novo, grupo), qtd in sorted(distintos.items()):
        marca = "  " if antigo == novo else "→ "
        print(f"{qtd:4d}x {marca}{antigo!r} → {novo!r} [{grupo}]")
    if sem_catalogo:
        print("\nFora do catálogo (preservados como estão):")
        for nome in sorted(set(sem_catalogo)):
            print(f"       {nome!r}")

    if not args.apply:
        print("\n(dry-run — nada foi escrito; use --apply)")
        return

    print()
    for i, (ident, _, patch) in enumerate(atualizacoes, start=1):
        _requisicao(
            f"{base}/rest/v1/planned_exercises?id=eq.{ident}",
            chave, metodo="PATCH", corpo=patch,
            extra_headers={"Prefer": "return=minimal"},
        )
        if i % 50 == 0 or i == len(atualizacoes):
            print(f"  {i}/{len(atualizacoes)} atualizados")
    print("\nBackfill concluído.")


if __name__ == "__main__":
    main()
