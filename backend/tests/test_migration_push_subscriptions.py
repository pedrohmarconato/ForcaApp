# backend/tests/test_migration_push_subscriptions.py
# WR-03 de 13-REVIEW.md: cobertura ESTRUTURAL da migration 0038
# (push_subscriptions) — mesmo padrão de leitura de .sql como texto, sem
# abrir conexão de banco, de test_migration_anamnese_cardio.py.
#
# LIMITAÇÃO EXPLÍCITA (não finge cobertura): este arquivo prova que o TEXTO
# da policy/GRANT está correto por parsing — NÃO exercita RLS de verdade
# contra um Postgres vivo. Esta máquina não tem um daemon Docker rodando
# (`docker info` falha) nem uma instância Supabase/Postgres local no ar, e
# subir uma (supabase start / docker compose) está fora do escopo deste
# fix. O teste que falta — e que fica registrado como pendência de
# UAT/staging em 13-REVIEW-FIX.md — é o cenário fim-a-fim descrito no
# achado: (1) INSERT como user A, (2) SELECT/UPDATE/DELETE da mesma linha
# como user B assertando 0 linhas afetadas/visíveis, e (3) upsert
# on_conflict=endpoint como user B contra o endpoint de A assertando rejeição
# em vez de reatribuição silenciosa da linha para B.

import os
from pathlib import Path

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)

MIGRATION_PATH = (
    Path(REPO_ROOT) / "supabase" / "migrations" / "0038_push_subscriptions.sql"
)


def _sql() -> str:
    return MIGRATION_PATH.read_text(encoding="utf-8").lower()


def test_migration_existe():
    assert MIGRATION_PATH.exists(), (
        "supabase/migrations/0038_push_subscriptions.sql não encontrada"
    )


def test_rls_esta_habilitada_na_tabela():
    sql = _sql()
    assert "alter table public.push_subscriptions enable row level security" in sql


def test_policy_cobre_using_e_with_check_com_auth_uid_igual_user_id():
    """A parte mais subtil do achado WR-03: sem `with check`, um UPDATE (e o
    upsert on_conflict=endpoint, que é um INSERT ... ON CONFLICT DO UPDATE)
    poderia REESCREVER a linha de outro usuário mesmo com `using` correto —
    `using` filtra quais linhas o comando enxerga, `with check` é quem
    barra o valor final gravado. As duas cláusulas precisam citar
    `auth.uid() = user_id` explicitamente."""
    sql = _sql()
    assert 'create policy "own push subscriptions" on public.push_subscriptions' in sql
    inicio = sql.index('create policy "own push subscriptions"')
    fim = sql.index(";", inicio)
    bloco_policy = sql[inicio:fim]

    assert "for all" in bloco_policy, (
        "policy precisa cobrir todos os comandos (select/insert/update/delete), "
        "não só um subconjunto"
    )
    assert "using (auth.uid() = user_id)" in bloco_policy, (
        "cláusula USING ausente ou não usa auth.uid() = user_id — sem ela, "
        "user B enxergaria/afetaria linhas de user A"
    )
    assert "with check (auth.uid() = user_id)" in bloco_policy, (
        "cláusula WITH CHECK ausente — sem ela, o upsert on_conflict=endpoint "
        "de user B contra o endpoint de user A poderia reescrever a linha "
        "silenciosamente para B mesmo com USING correto"
    )


def test_grant_dml_completo_para_authenticated_e_revoke_de_public_e_anon():
    sql = _sql()
    assert "revoke all on table public.push_subscriptions from public, anon" in sql, (
        "sem o revoke explícito, o GRANT default do Postgres a `public` "
        "sobreviveria e o backstop de RLS ficaria sozinho, sem a camada de "
        "GRANT antes dela"
    )
    assert (
        "grant select, insert, update, delete on table public.push_subscriptions "
        "to authenticated"
        in sql
    ), (
        "GRANT precisa cobrir select, insert, UPDATE (obrigatório pelo upsert "
        "on_conflict=endpoint) e delete para authenticated"
    )


def test_bloco_de_assercao_final_confere_policy_e_os_tres_grants_dml():
    sql = _sql()
    assert "raise exception" in sql
    inicio = sql.rindex("do $$")
    bloco_final = sql[inicio:]

    assert "pg_policies" in bloco_final, (
        "bloco de asserção final não confere a existência da RLS policy"
    )
    for privilegio in ("insert", "update", "delete"):
        assert f"privilege_type = '{privilegio}'" in bloco_final, (
            f"bloco de asserção final não confere GRANT {privilegio.upper()} "
            "para authenticated"
        )


def test_endpoint_e_unique_para_o_upsert_on_conflict_funcionar():
    """`endpoint text not null unique` é o que torna `on_conflict=endpoint`
    válido no upsert de subscribe — sem UNIQUE, o Postgres rejeitaria a
    cláusula ON CONFLICT com 42P10, então isso também é uma checagem
    estrutural de regressão."""
    sql = _sql()
    assert "endpoint text not null unique" in sql


def test_nenhum_comando_supabase_no_arquivo():
    sql = _sql()
    assert "supabase db push" not in sql
    assert "supabase migration up" not in sql
