-- Base do ForcaApp: tabela public.profiles + trigger de auto-criação no signup.
--
-- As migrations 0001-0006 assumem que public.profiles já existe (0001 adiciona
-- profiles.current_plan_id referenciando training_plans). Esta base não estava
-- versionada no repo; foi reconstruída a partir do dump de schema em
--   docs/Supabase Snippet Função e Trigger para Perfis de Usuários.csv
-- (colunas id/username/full_name/avatar_url/updated_at/created_at/email/
-- onboarding_completed) e validada contra o uso em src/contexts/AuthContext.js
-- (select/update por id = auth.uid()). Padrão Supabase: profiles espelha
-- auth.users; trigger popular email no signup; RLS dono-próprio.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  full_name text,
  avatar_url text,
  updated_at timestamptz,
  created_at timestamptz not null default now(),
  email text not null,
  onboarding_completed boolean not null default false
);

alter table public.profiles enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-cria a linha de profile ao registrar um usuário em auth.users.
-- SECURITY DEFINER + search_path travado: roda como dono da tabela, bypassando
-- a RLS (necessário porque ainda não há linha para o WITH CHECK validar).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
