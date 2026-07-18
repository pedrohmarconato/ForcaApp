-- Fase 4.2 — persistência atômica do plano completo.
--
-- O backend antigo fazia PATCH + quatro POSTs + DELETE compensatório. Qualquer
-- falha deixava uma janela observável de plano arquivado/parcial. Esta RPC executa
-- archive + plan + sessions + exercises + sets em uma única transação Postgres.

create or replace function public.save_training_plan(
  p_plan      jsonb,
  p_sessions  jsonb,
  p_exercises jsonb,
  p_sets      jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_id uuid;
begin
  if v_user_id is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) is distinct from 'object'
     or jsonb_typeof(p_sessions) is distinct from 'array'
     or jsonb_typeof(p_exercises) is distinct from 'array'
     or jsonb_typeof(p_sets) is distinct from 'array' then
    raise exception 'payload do plano inválido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_sessions) = 0
     or jsonb_array_length(p_exercises) = 0
     or jsonb_array_length(p_sets) = 0 then
    raise exception 'plano precisa conter sessões, exercícios e séries'
      using errcode = '22023';
  end if;

  v_plan_id := (p_plan ->> 'id')::uuid;
  if (p_plan ->> 'user_id')::uuid is distinct from v_user_id then
    raise exception 'user_id do plano não corresponde ao JWT' using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_sessions) s
     where (s ->> 'user_id')::uuid is distinct from v_user_id
        or (s ->> 'plan_id')::uuid is distinct from v_plan_id
  ) then
    raise exception 'sessão fora do plano/usuário do JWT' using errcode = '42501';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_exercises) e
     where not exists (
       select 1 from jsonb_array_elements(p_sessions) s
        where s ->> 'id' = e ->> 'session_id'
     )
  ) then
    raise exception 'exercício fora das sessões do payload' using errcode = '23503';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_sets) st
     where not exists (
       select 1 from jsonb_array_elements(p_exercises) e
        where e ->> 'id' = st ->> 'exercise_id'
     )
  ) then
    raise exception 'série fora dos exercícios do payload' using errcode = '23503';
  end if;

  -- Serializa duas gerações concorrentes do mesmo usuário antes de arquivar. Sem
  -- isso, ambas poderiam observar zero planos ativos e uma terminaria em 23505.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- Retry após timeout: se a árvore deste mesmo ID já foi confirmada integralmente,
  -- retorna sucesso sem DELETE/INSERT. Deletar aqui acionaria ON DELETE SET NULL em
  -- profiles.current_plan_id. Uma colisão parcial/divergente falha fechada.
  if exists (
    select 1 from public.training_plans
     where id = v_plan_id and user_id = v_user_id
  ) then
    if exists (
      select 1 from public.training_plans
       where id = v_plan_id
         and user_id = v_user_id
         and status = coalesce(p_plan ->> 'status', 'active')
    )
    and (
      select count(*) from public.planned_sessions where plan_id = v_plan_id
    ) = jsonb_array_length(p_sessions)
    and (
      select count(*)
        from public.planned_exercises e
        join public.planned_sessions s on s.id = e.session_id
       where s.plan_id = v_plan_id
    ) = jsonb_array_length(p_exercises)
    and (
      select count(*)
        from public.planned_sets st
        join public.planned_exercises e on e.id = st.exercise_id
        join public.planned_sessions s on s.id = e.session_id
       where s.plan_id = v_plan_id
    ) = jsonb_array_length(p_sets)
    and not exists (
      select 1 from jsonb_array_elements(p_sessions) item
       where not exists (
         select 1 from public.planned_sessions s
          where s.id = (item ->> 'id')::uuid and s.plan_id = v_plan_id
       )
    )
    and not exists (
      select 1 from jsonb_array_elements(p_exercises) item
       where not exists (
         select 1
           from public.planned_exercises e
           join public.planned_sessions s on s.id = e.session_id
          where e.id = (item ->> 'id')::uuid and s.plan_id = v_plan_id
       )
    )
    and not exists (
      select 1 from jsonb_array_elements(p_sets) item
       where not exists (
         select 1
           from public.planned_sets st
           join public.planned_exercises e on e.id = st.exercise_id
           join public.planned_sessions s on s.id = e.session_id
          where st.id = (item ->> 'id')::uuid and s.plan_id = v_plan_id
       )
    ) then
      return v_plan_id;
    end if;

    raise exception 'plan_id % já existe com árvore divergente', v_plan_id
      using errcode = '23505';
  end if;

  update public.training_plans
     set status = 'archived'
   where user_id = v_user_id
     and status = 'active';

  insert into public.training_plans (
    id,
    user_id,
    source_plan_id,
    name,
    description,
    periodization_type,
    duration_weeks,
    sessions_per_week,
    start_date,
    status,
    raw_plan,
    created_by
  ) values (
    v_plan_id,
    v_user_id,
    nullif(p_plan ->> 'source_plan_id', '')::uuid,
    p_plan ->> 'name',
    p_plan ->> 'description',
    p_plan ->> 'periodization_type',
    (p_plan ->> 'duration_weeks')::integer,
    (p_plan ->> 'sessions_per_week')::integer,
    (p_plan ->> 'start_date')::date,
    coalesce(p_plan ->> 'status', 'active'),
    p_plan -> 'raw_plan',
    coalesce(p_plan ->> 'created_by', 'ai')
  );

  insert into public.planned_sessions (
    id,
    plan_id,
    user_id,
    week_number,
    day_of_week,
    order_in_week,
    title,
    session_type,
    scheduled_date,
    estimated_minutes,
    status,
    muscle_groups
  )
  select
    x.id,
    x.plan_id,
    x.user_id,
    x.week_number,
    x.day_of_week,
    x.order_in_week,
    x.title,
    x.session_type,
    x.scheduled_date,
    x.estimated_minutes,
    x.status,
    coalesce(x.muscle_groups, '{}')
  from jsonb_to_recordset(p_sessions) as x(
    id uuid,
    plan_id uuid,
    user_id uuid,
    week_number integer,
    day_of_week text,
    order_in_week integer,
    title text,
    session_type text,
    scheduled_date date,
    estimated_minutes integer,
    status text,
    muscle_groups text[]
  );

  insert into public.planned_exercises (
    id,
    session_id,
    exercise_order,
    name,
    muscle_group,
    priority,
    equipment,
    load_increment_kg,
    rest_seconds,
    target_rm_percent,
    sets_planned,
    reps_raw,
    method,
    cadence,
    notes,
    injury_flags
  )
  select
    x.id,
    x.session_id,
    x.exercise_order,
    x.name,
    x.muscle_group,
    x.priority,
    x.equipment,
    x.load_increment_kg,
    x.rest_seconds,
    x.target_rm_percent,
    x.sets_planned,
    x.reps_raw,
    x.method,
    x.cadence,
    x.notes,
    coalesce(x.injury_flags, '{}')
  from jsonb_to_recordset(p_exercises) as x(
    id uuid,
    session_id uuid,
    exercise_order integer,
    name text,
    muscle_group text,
    priority text,
    equipment text,
    load_increment_kg numeric,
    rest_seconds integer,
    target_rm_percent numeric,
    sets_planned integer,
    reps_raw text,
    method text,
    cadence text,
    notes text,
    injury_flags text[]
  );

  insert into public.planned_sets (
    id,
    exercise_id,
    set_order,
    target_reps_min,
    target_reps_max,
    target_load_kg,
    target_rir
  )
  select
    x.id,
    x.exercise_id,
    x.set_order,
    x.target_reps_min,
    x.target_reps_max,
    x.target_load_kg,
    x.target_rir
  from jsonb_to_recordset(p_sets) as x(
    id uuid,
    exercise_id uuid,
    set_order integer,
    target_reps_min integer,
    target_reps_max integer,
    target_load_kg numeric,
    target_rir integer
  );

  return v_plan_id;
end;
$$;

revoke all on function public.save_training_plan(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_training_plan(jsonb, jsonb, jsonb, jsonb) to authenticated;
