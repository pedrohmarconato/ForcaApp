import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIR = REPO_ROOT / "supabase" / "migrations"
MIGRATION_SUFFIX = "_profiles_neon_color.sql"


def _migration_paths() -> list[Path]:
    return sorted(MIGRATIONS_DIR.glob(f"*{MIGRATION_SUFFIX}"))


def _strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    return re.sub(r"--[^\n]*(?=\n|$)", "", sql)


def _normalize_sql(sql: str) -> str:
    return " ".join(_strip_sql_comments(sql).lower().split())


def _sql() -> str:
    paths = _migration_paths()
    assert len(paths) == 1, (
        "esperada exatamente uma migration *_profiles_neon_color.sql, "
        f"encontradas: {[path.name for path in paths]}"
    )
    return _normalize_sql(paths[0].read_text(encoding="utf-8"))


def test_existe_exatamente_uma_migration_com_sufixo_estavel():
    paths = _migration_paths()
    assert len(paths) == 1, (
        "a migration deve ser localizada pelo sufixo, independentemente de "
        f"renumeracao; encontradas: {[path.name for path in paths]}"
    )


def test_normalizacao_remove_ddl_em_comentarios_de_linha_e_bloco():
    ddl = "alter table public.profiles add column neon_color text"
    sql = _normalize_sql(
        f"-- {ddl}\n/* {ddl}; create policy falsa on public.profiles */\nselect 1;"
    )

    assert ddl not in sql
    assert "create policy" not in sql
    assert sql == "select 1;"


def test_adiciona_neon_color_text_not_null_com_default_yellow():
    sql = _sql()
    assert (
        "alter table public.profiles add column neon_color text not null "
        "default 'yellow'" in sql
    )


def test_check_nomeado_aceita_exatamente_as_quatro_chaves_sem_enum():
    sql = _sql()
    assert (
        "constraint profiles_neon_color_check check "
        "(neon_color in ('yellow', 'blue', 'green', 'red'))" in sql
    )
    assert "create type" not in sql
    assert " as enum" not in sql


def test_bloco_final_confere_metadados_constraint_rls_e_policy():
    sql = _sql()
    inicio = sql.rindex("do $$")
    bloco_final = sql[inicio:]

    assert "information_schema.columns" in bloco_final
    assert "data_type = 'text'" in bloco_final
    assert "is_nullable = 'no'" in bloco_final
    assert "column_default" in bloco_final
    assert "'yellow'" in bloco_final
    assert "pg_constraint" in bloco_final
    assert "profiles_neon_color_check" in bloco_final
    assert "constraint_metadata.convalidated" in bloco_final
    assert (
        "create temporary table expected_profiles_neon_color_domain" in bloco_final
    )
    assert (
        "constraint expected_profiles_neon_color_check check "
        "(neon_color in ('yellow', 'blue', 'green', 'red'))" in bloco_final
    )
    assert "pg_my_temp_schema()" in bloco_final
    assert "into expected_constraint_definition" in bloco_final
    assert (
        "pg_get_constraintdef(constraint_metadata.oid, true) = "
        "expected_constraint_definition" in bloco_final
    )
    assert "pg_class" in bloco_final
    assert "relrowsecurity" in bloco_final
    assert "pg_policies" in bloco_final
    assert "raise exception" in bloco_final


def test_bloco_final_confere_update_own_e_privilegios_authenticated():
    sql = _sql()
    bloco_final = sql[sql.rindex("do $$") :]

    assert "policyname = 'profiles update own'" in bloco_final
    assert "cmd = 'update'" in bloco_final
    assert (
        "regexp_replace(coalesce(qual, ''), '\\s+', '', 'g') = "
        "'(auth.uid()=id)'" in bloco_final
    )
    assert (
        "regexp_replace(coalesce(with_check, ''), '\\s+', '', 'g') = "
        "'(auth.uid()=id)'" in bloco_final
    )
    assert "has_schema_privilege('authenticated', 'public', 'usage')" in bloco_final
    for privilegio in ("select", "update"):
        assert re.search(
            r"has_column_privilege\(\s*'authenticated'\s*,\s*"
            r"'public\.profiles'\s*,\s*'neon_color'\s*,\s*"
            rf"'{privilegio}'\s*\)",
            bloco_final,
        )


def test_nao_altera_policies_grants_ou_outras_colunas():
    sql = _sql()

    assert not re.search(r"\b(?:create|drop|alter)\s+policy\b", sql)
    assert not re.search(r"\bgrant\b", sql)
    assert not re.search(r"\brevoke\b", sql)
    assert not re.search(
        r"\b(?:enable|disable|force|no\s+force)\s+row\s+level\s+security\b", sql
    )
    for operacao_destrutiva in (
        r"\bdrop\s+column\b",
        r"\balter\s+column\b",
        r"\brename\s+column\b",
        r"\bdrop\s+table\b",
        r"\btruncate\b",
        r"\bdelete\s+from\b",
        r"\bupdate\s+public\.profiles\b",
        r"\binsert\s+into\s+public\.profiles\b",
    ):
        assert not re.search(operacao_destrutiva, sql)
