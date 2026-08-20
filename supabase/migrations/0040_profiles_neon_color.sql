-- Preferencia de cor neon por conta (PREF-01, Fase 18, Plano 18-02).
-- O default faz o backfill implicito das contas existentes e preserva inserts
-- que ainda nao enviam neon_color.

alter table public.profiles
  add column neon_color text not null default 'yellow'
  constraint profiles_neon_color_check
  check (neon_color in ('yellow', 'blue', 'green', 'red'));

comment on column public.profiles.neon_color is
  'Chave fechada da cor neon da conta: yellow, blue, green ou red.';

-- Confirma o contrato da coluna sem recriar policies nem ampliar grants.
do $$
declare
  expected_constraint_definition text;
begin
  -- O proprio parser do servidor produz a definicao canonica de referencia.
  -- Comparar as duas definicoes prova o dominio completo, sem depender da
  -- formatacao textual de uma versao especifica do PostgreSQL.
  create temporary table expected_profiles_neon_color_domain (
    neon_color text
      constraint expected_profiles_neon_color_check
      check (neon_color in ('yellow', 'blue', 'green', 'red'))
  ) on commit drop;

  select pg_get_constraintdef(constraint_metadata.oid, true)
    into expected_constraint_definition
    from pg_constraint constraint_metadata
    join pg_class table_metadata
      on table_metadata.oid = constraint_metadata.conrelid
   where table_metadata.relnamespace = pg_my_temp_schema()
     and table_metadata.relname = 'expected_profiles_neon_color_domain'
     and constraint_metadata.conname = 'expected_profiles_neon_color_check'
     and constraint_metadata.convalidated;

  if expected_constraint_definition is null then
    raise exception 'assercao falhou: CHECK de referencia nao foi criado';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'neon_color'
       and data_type = 'text'
       and is_nullable = 'NO'
       and column_default = '''yellow''::text'
  ) then
    raise exception
      'assercao falhou: profiles.neon_color deve ser text not null default yellow';
  end if;

  if not exists (
    select 1
      from pg_constraint constraint_metadata
      join pg_class table_metadata
        on table_metadata.oid = constraint_metadata.conrelid
      join pg_namespace schema_metadata
        on schema_metadata.oid = table_metadata.relnamespace
     where schema_metadata.nspname = 'public'
       and table_metadata.relname = 'profiles'
       and constraint_metadata.conname = 'profiles_neon_color_check'
       and constraint_metadata.contype = 'c'
       and constraint_metadata.convalidated
       and pg_get_constraintdef(constraint_metadata.oid, true) =
           expected_constraint_definition
  ) then
    raise exception
      'assercao falhou: CHECK profiles_neon_color_check ausente, invalido ou com dominio divergente';
  end if;

  if not exists (
    select 1
      from pg_class table_metadata
      join pg_namespace schema_metadata
        on schema_metadata.oid = table_metadata.relnamespace
     where schema_metadata.nspname = 'public'
       and table_metadata.relname = 'profiles'
       and table_metadata.relrowsecurity
  ) then
    raise exception 'assercao falhou: RLS nao esta ativo em public.profiles';
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'profiles'
       and policyname = 'profiles update own'
       and cmd = 'UPDATE'
       and regexp_replace(coalesce(qual, ''), '\s+', '', 'g') =
           '(auth.uid()=id)'
       and regexp_replace(coalesce(with_check, ''), '\s+', '', 'g') =
           '(auth.uid()=id)'
  ) then
    raise exception
      'assercao falhou: policy profiles update own nao preserva USING/WITH CHECK por auth.uid() = id';
  end if;

  if not has_schema_privilege('authenticated', 'public', 'USAGE')
     or not has_column_privilege(
       'authenticated', 'public.profiles', 'neon_color', 'SELECT'
     )
     or not has_column_privilege(
       'authenticated', 'public.profiles', 'neon_color', 'UPDATE'
     ) then
    raise exception
      'assercao falhou: authenticated nao possui USAGE/SELECT/UPDATE efetivos para neon_color';
  end if;
end;
$$;
