-- 0032: hardening das tabelas de backup criadas pela 0031.
-- As 3 _m0031_backup_leg_* nasceram por CREATE TABLE AS SELECT, sem RLS e com
-- os grants default do schema public (anon/authenticated via PostgREST) --
-- mesmo padrao ja tratado em funcoes pelas 0019 e 0023. Sonda de 07/08/2026:
-- SELECT anonimo respondia HTTP 200. Aqui: revoke de anon/authenticated e RLS
-- ligada sem policy (deny-by-default); service_role mantem acesso -- e por ele
-- que o rollback documentado na 0031 continua executavel.
do $$
declare t text;
begin
  foreach t in array array[
    '_m0031_backup_leg_sessions',
    '_m0031_backup_leg_exercises',
    '_m0031_backup_leg_sets'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
