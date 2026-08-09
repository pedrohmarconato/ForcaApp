# backend/tests/test_migration_anamnese_cardio.py
# Harness de leitura da migration 0033 (anamnese de cardio, REQ-04) — mesmo
# padrão de test_plan_repository.py:132-167: lê o .sql como texto, sem abrir
# conexão de banco. Prova que a migration segue o molde da 0021: colunas
# espelhadas nas duas tabelas, constraints de faixa/coerência, snapshot
# reescrito para gravar as colunas novas, e bloco de asserção final.

import os
from pathlib import Path

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)

MIGRATION_PATH = (
    Path(REPO_ROOT) / "supabase" / "migrations" / "0033_anamnese_cardio_declarada.sql"
)

COLUNAS_NOVAS = (
    "cardio_pratica_atualmente",
    "cardio_distancia_confortavel_km",
    "cardio_objetivo",
)

NOMES_CONSTRAINT = (
    "questionario_cardio_distancia_km_check",
    "questionario_cardio_objetivo_check",
    "questionario_cardio_distancia_coerente",
    "questionario_anamnese_cardio_coerente",
)

LITERAIS_OBJETIVO = ("'condicionamento'", "'completar_5k'", "'emagrecimento'")


def _sql() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8").lower()


def test_migration_existe():
    assert MIGRATION_PATH.exists(), (
        "supabase/migrations/0033_anamnese_cardio_declarada.sql não encontrada"
    )


def test_colunas_novas_aparecem_nas_duas_tabelas():
    sql = _sql()
    for coluna in COLUNAS_NOVAS:
        ocorrencias = sql.count(f"add column if not exists {coluna}")
        assert ocorrencias == 2, (
            f"esperava '{coluna}' em 'add column if not exists' DUAS vezes "
            f"(questionario_usuario + questionario_historico), achou {ocorrencias}"
        )


def test_constraints_de_faixa_e_coerencia_presentes():
    sql = _sql()
    for nome in NOMES_CONSTRAINT:
        assert nome.lower() in sql, f"constraint '{nome}' não encontrada na migration"


def test_snapshot_questionario_reescrito_grava_colunas_novas():
    sql = _sql()
    assert "create or replace function public.snapshot_questionario" in sql

    inicio = sql.index("create or replace function public.snapshot_questionario")
    fim = sql.index("revoke all on function public.snapshot_questionario", inicio)
    bloco_funcao = sql[inicio:fim]

    for coluna in COLUNAS_NOVAS:
        assert coluna in bloco_funcao, (
            f"snapshot_questionario() não referencia '{coluna}' — o histórico "
            "perderia o campo em silêncio"
        )
        assert f"new.{coluna}" in bloco_funcao, (
            f"snapshot_questionario() não grava 'new.{coluna}' no INSERT"
        )


def test_bloco_de_assercao_final_confere_colunas_novas():
    sql = _sql()
    assert "raise exception" in sql
    inicio = sql.rindex("do $$")
    bloco_final = sql[inicio:]
    for coluna in COLUNAS_NOVAS:
        assert coluna in bloco_final, (
            f"bloco de asserção final não confere '{coluna}'"
        )


def test_vocabulario_fechado_do_objetivo_presente():
    sql = _sql()
    for literal in LITERAIS_OBJETIVO:
        assert literal in sql, (
            f"literal {literal} não encontrado — CHECK de cardio_objetivo "
            "precisa usar o vocabulário exato do frontend"
        )


def test_nenhum_comando_supabase_no_arquivo():
    sql = _sql()
    # A aplicação real é decisão do dono (checkpoint da Task 2) — a migration
    # em si nunca deve conter um comando de aplicação (ex.: \connect, psql
    # meta-comandos). Uma checagem simples de sanidade sobre o arquivo.
    assert "supabase db push" not in sql
    assert "supabase migration up" not in sql
