-- ============================================================
-- 0038 — push_subscriptions: infra de dados para Web Push (VAPID) do
-- aluno (PUSH-01, Fase 13).
-- ============================================================
-- Segue LITERALMENTE o molde de RLS + GRANT DML explícito de 0037
-- (revoke-then-grant + DO-block de asserção), aplicado aqui a uma tabela
-- nova em vez de uma função. Fecha a dívida técnica conhecida do v1.0
-- (STATE.md "Migrations sem GRANT DML para authenticated"): um projeto
-- Supabase novo não pode subir quebrado por RLS sem GRANT.
--
-- Escopo do GRANT: select, insert, update, delete — o `update` é
-- OBRIGATÓRIO (correção em relação ao "select/insert/delete" literal do
-- CONTEXT.md), porque o upsert de subscribe usa
-- `on_conflict=endpoint` (INSERT ... ON CONFLICT DO UPDATE), que o
-- Postgres recusa sem GRANT UPDATE — sem isso o duplo-clique/duas-abas do
-- critério de concorrência de PUSH-01 quebraria com 42501.
--
-- Aplicação: SOMENTE staging (mjdjtiujhwklchalquhc) nesta task — produção
-- é checkpoint do dono (Plano 13-04), mesmo padrão de md5 staging×prod já
-- usado na fase 7 do v1.1.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Subscriptions de Web Push (VAPID) do aluno. endpoint é UNIQUE porque o
   mesmo navegador/dispositivo produz sempre o mesmo endpoint para uma
   subscription ativa -- reassinar substitui em vez de duplicar (upsert por
   on_conflict=endpoint).';

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- GRANT DML explícito: RLS sozinha NÃO basta, o GRANT de tabela é a camada
-- ANTES da RLS no Postgres (mesma lição do 0022/cardio_goals, fechada aqui).
revoke all on table public.push_subscriptions from public, anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- ============================================================
-- Asserção (mesmo padrão de 0037): confirma que a policy e os GRANTs
-- (incluindo UPDATE, necessário para o upsert) existem.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
  ) then
    raise exception 'asserção falhou: nenhuma RLS policy em push_subscriptions';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'push_subscriptions'
       and grantee = 'authenticated' and privilege_type = 'INSERT'
  ) then
    raise exception 'asserção falhou: GRANT INSERT para authenticated ausente';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'push_subscriptions'
       and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ) then
    raise exception 'asserção falhou: GRANT UPDATE para authenticated ausente (upsert on_conflict quebraria com 42501)';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'push_subscriptions'
       and grantee = 'authenticated' and privilege_type = 'DELETE'
  ) then
    raise exception 'asserção falhou: GRANT DELETE para authenticated ausente';
  end if;
end;
$$;
