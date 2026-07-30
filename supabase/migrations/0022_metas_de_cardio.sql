-- Metas de cardio: desempenho e consistência.
--
-- O que não existia: o cardio era MEDIDO com precisão desde a 0014 (duração,
-- distância, esforço e pace como coluna gerada), mas nada disso era comparado
-- com nada. A aba Progresso mostrava constância, volume em kg e recordes de
-- carga — cardio não aparecia em lugar nenhum, e o pace calculado no banco não
-- tinha consumidor. Sem alvo, "melhorei?" não tinha resposta no app.
--
-- Dois tipos, decisão do dono ("as duas"):
--   • desempenho   — "5 km em 30 min": modalidade + distância + tempo-alvo.
--                    Compara com o MELHOR tempo real numa distância equivalente.
--   • consistencia — "120 min por semana" e/ou "3 sessões de cardio por semana".
--                    Compara com a semana corrente.
--
-- Por que uma tabela e não colunas no questionário: meta tem ciclo de vida
-- próprio (nasce, é batida, é arquivada) e histórico — o questionário é uma
-- fotografia do aluno, não um registro de objetivos que se sucedem.

create table if not exists public.cardio_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('desempenho', 'consistencia')),

  -- desempenho -------------------------------------------------------------
  -- A modalidade é OBRIGATÓRIA aqui: comparar o pace de uma corrida com o de
  -- uma bike não mede evolução nenhuma. Nome do catálogo (grupo Cardio).
  modality text,
  target_distance_m numeric,
  target_duration_seconds integer,
  -- Semana do plano até quando a meta vale. Null = sem prazo.
  target_week integer,

  -- consistencia -----------------------------------------------------------
  weekly_minutes integer,
  weekly_sessions integer,

  status text not null default 'active'
    check (status in ('active', 'achieved', 'archived')),
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cada tipo exige o SEU conjunto de campos e proíbe o do outro. Sem isto,
  -- uma meta de consistência com distância-alvo (ou vice-versa) chegaria à tela
  -- e o cálculo teria de adivinhar o que o aluno quis dizer.
  constraint cardio_goals_desempenho_coerente check (
    kind <> 'desempenho'
    or (
      modality is not null
      and target_distance_m is not null and target_distance_m > 0
      and target_duration_seconds is not null and target_duration_seconds > 0
      and weekly_minutes is null and weekly_sessions is null
    )
  ),
  constraint cardio_goals_consistencia_coerente check (
    kind <> 'consistencia'
    or (
      (weekly_minutes is not null or weekly_sessions is not null)
      and (weekly_minutes is null or weekly_minutes between 5 and 1200)
      and (weekly_sessions is null or weekly_sessions between 1 and 14)
      and modality is null
      and target_distance_m is null
      and target_duration_seconds is null
    )
  ),
  constraint cardio_goals_semana_alvo check (
    target_week is null or target_week between 1 and 52
  ),
  -- achieved_at só existe em meta batida, e meta batida tem de ter a data:
  -- "conquistado" sem quando é dado que não se pode mostrar nem auditar.
  constraint cardio_goals_conquista_coerente check (
    (status = 'achieved' and achieved_at is not null)
    or (status <> 'achieved' and achieved_at is null)
  )
);

-- Uma meta ATIVA por tipo e por usuário. Duas metas de consistência ativas
-- deixariam a tela escolher qual mostrar — e escolher errado é pior que barrar.
create unique index if not exists cardio_goals_ativa_por_tipo
  on public.cardio_goals (user_id, kind)
  where status = 'active';

create index if not exists cardio_goals_user_idx
  on public.cardio_goals (user_id, status, created_at desc);

comment on table public.cardio_goals is
  'Metas de cardio do aluno: desempenho (distância × tempo por modalidade) e consistência (minutos/sessões por semana).';
comment on column public.cardio_goals.modality is
  'Nome do catálogo (grupo Cardio). Obrigatório em desempenho: pace só se compara na mesma modalidade.';
comment on column public.cardio_goals.target_week is
  'Semana do plano até quando a meta vale. Null = sem prazo.';

alter table public.cardio_goals enable row level security;

drop policy if exists "own cardio goals" on public.cardio_goals;
create policy "own cardio goals" on public.cardio_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- updated_at não é responsabilidade do cliente: sem o trigger, um app que
-- esqueça de mandar o campo faria a linha mentir sobre quando mudou.
create or replace function public.touch_cardio_goal()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_cardio_goal on public.cardio_goals;
create trigger trg_touch_cardio_goal
  before update on public.cardio_goals
  for each row execute function public.touch_cardio_goal();

revoke all on function public.touch_cardio_goal() from public, anon;

-- ============================================================
-- RPCs de ciclo de vida
-- ============================================================

/*
 * Define a meta ativa de um tipo: ARQUIVA a anterior e insere a nova na mesma
 * transação.
 *
 * Por que RPC e não dois requests do cliente: o índice único parcial
 * (uma ativa por tipo) faz o INSERT falhar com 23505 se o UPDATE anterior não
 * tiver acontecido — e, entre os dois requests, uma segunda tela do mesmo
 * usuário produziria exatamente essa corrida. O advisory lock por usuário
 * serializa duas definições concorrentes, como em save_training_plan.
 *
 * A coerência por tipo (quais campos são obrigatórios) fica nas constraints da
 * tabela: a RPC passa os valores adiante e deixa o banco recusar o incoerente.
 */
create or replace function public.upsert_cardio_goal(
  p_kind                    text,
  p_modality                text default null,
  p_target_distance_m       numeric default null,
  p_target_duration_seconds integer default null,
  p_target_week             integer default null,
  p_weekly_minutes          integer default null,
  p_weekly_sessions         integer default null
)
returns public.cardio_goals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.cardio_goals;
begin
  if v_user is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('desempenho', 'consistencia') then
    raise exception 'tipo de meta inválido: %', coalesce(p_kind, '<null>')
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_kind, 0));

  update public.cardio_goals
     set status = 'archived'
   where user_id = v_user
     and kind = p_kind
     and status = 'active';

  insert into public.cardio_goals (
    user_id, kind, modality, target_distance_m, target_duration_seconds,
    target_week, weekly_minutes, weekly_sessions
  ) values (
    v_user, p_kind, nullif(btrim(coalesce(p_modality, '')), ''),
    p_target_distance_m, p_target_duration_seconds,
    p_target_week, p_weekly_minutes, p_weekly_sessions
  )
  returning * into v_row;

  return v_row;
end;
$$;

/* Arquiva uma meta (o aluno desistiu ou trocou de objetivo). */
create or replace function public.archive_cardio_goal(p_id uuid)
returns public.cardio_goals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.cardio_goals;
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  update public.cardio_goals
     set status = 'archived', achieved_at = null
   where id = p_id
     and user_id = auth.uid()
     and status = 'active'
  returning * into v_row;

  if not found then
    raise exception 'meta % inexistente, alheia ou já encerrada', p_id
      using errcode = '42501';
  end if;
  return v_row;
end;
$$;

/*
 * Registra a meta como batida. É ação do ALUNO, não do sistema: o cálculo na
 * tela mostra que ele alcançou, mas quem carimba é ele — mesma regra do resto do
 * app (a adaptação e o replanejamento também nunca se aplicam sozinhos).
 */
create or replace function public.achieve_cardio_goal(p_id uuid)
returns public.cardio_goals
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row public.cardio_goals;
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  update public.cardio_goals
     set status = 'achieved', achieved_at = now()
   where id = p_id
     and user_id = auth.uid()
     and status = 'active'
  returning * into v_row;

  if not found then
    raise exception 'meta % inexistente, alheia ou já encerrada', p_id
      using errcode = '42501';
  end if;
  return v_row;
end;
$$;

revoke all on function public.upsert_cardio_goal(text, text, numeric, integer, integer, integer, integer) from public, anon;
revoke all on function public.archive_cardio_goal(uuid) from public, anon;
revoke all on function public.achieve_cardio_goal(uuid) from public, anon;

grant execute on function public.upsert_cardio_goal(text, text, numeric, integer, integer, integer, integer) to authenticated;
grant execute on function public.archive_cardio_goal(uuid) to authenticated;
grant execute on function public.achieve_cardio_goal(uuid) to authenticated;

-- ============================================================
-- Asserções
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'cardio_goals'
  ) then
    raise exception 'asserção falhou: cardio_goals não existe';
  end if;

  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'cardio_goals' and rowsecurity
  ) then
    raise exception 'asserção falhou: RLS desligada em cardio_goals';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'cardio_goals_ativa_por_tipo'
  ) then
    raise exception 'asserção falhou: índice de meta ativa por tipo não existe';
  end if;

  -- anon sem EXECUTE nas RPCs novas (aprendizado da 0019: os default privileges
  -- concedem EXECUTE a anon em toda função criada).
  if has_function_privilege('anon',
       'public.upsert_cardio_goal(text, text, numeric, integer, integer, integer, integer)',
       'EXECUTE')
     or has_function_privilege('anon', 'public.archive_cardio_goal(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.achieve_cardio_goal(uuid)', 'EXECUTE') then
    raise exception 'asserção falhou: anon ainda executa alguma RPC de meta';
  end if;
end
$$;
