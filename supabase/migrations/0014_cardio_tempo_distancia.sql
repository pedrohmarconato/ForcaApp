-- Cardio e isometria: tempo, distância e pace viram DADO, não texto livre.
--
-- Antes desta migration o modelo só sabia carga × repetição. Um cardio de
-- "20min" era parseado como 20 REPETIÇÕES (target_reps_min/max = 20) e ainda
-- recebia progressão de %RM (2%, 3%, 4%... por semana) — número sem
-- significado. O aluno abria o player e o app pedia "quantas reps?" para uma
-- caminhada. A única informação boa que a IA dava ("120-140 bpm") morria em
-- texto livre nas observações.
--
-- O que muda:
--   1. planned_exercises.metric — como o exercício é medido (do catálogo):
--      carga_reps (padrão) | tempo (prancha, HIIT, corda) | tempo_distancia
--      (caminhada, corrida, bike, remo, elíptico).
--   2. planned_sets ganha alvo de duração e distância; reps deixam de ser
--      obrigatórias (cardio não tem repetição).
--   3. set_logs registra duração, distância e percepção de esforço, e o PACE
--      é coluna GERADA — derivada, nunca digitada, nunca fora de sincronia.
--   4. save_set_log e save_training_plan reescritas para gravar os campos
--      novos (as duas listam colunas uma a uma: sem isso o dado novo seria
--      descartado em silêncio).

-- ============================================================
-- 1. Métrica do exercício
-- ============================================================
alter table public.planned_exercises
  add column if not exists metric text not null default 'carga_reps';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planned_exercises_metric_check'
  ) then
    alter table public.planned_exercises
      add constraint planned_exercises_metric_check
      check (metric in ('carga_reps', 'tempo', 'tempo_distancia'));
  end if;
end
$$;

comment on column public.planned_exercises.metric is
  'Como o exercício é medido (vem do catálogo): carga_reps | tempo | tempo_distancia. Define o que o plano prescreve e o que o app pergunta.';

-- ============================================================
-- 2. Alvo de duração/distância nas séries planejadas
-- ============================================================
alter table public.planned_sets
  add column if not exists target_duration_seconds integer,
  add column if not exists target_distance_m numeric;

alter table public.planned_sets
  alter column target_reps_min drop not null,
  alter column target_reps_max drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planned_sets_duracao_positiva'
  ) then
    alter table public.planned_sets
      add constraint planned_sets_duracao_positiva
      check (target_duration_seconds is null or target_duration_seconds > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'planned_sets_distancia_positiva'
  ) then
    alter table public.planned_sets
      add constraint planned_sets_distancia_positiva
      check (target_distance_m is null or target_distance_m > 0);
  end if;

  -- Uma série precisa prescrever ALGUMA coisa: reps ou duração.
  if not exists (
    select 1 from pg_constraint where conname = 'planned_sets_alvo_coerente'
  ) then
    alter table public.planned_sets
      add constraint planned_sets_alvo_coerente
      check (target_reps_min is not null or target_duration_seconds is not null);
  end if;
end
$$;

comment on column public.planned_sets.target_duration_seconds is
  'Duração-alvo em segundos (cardio e isometria). Null em séries de carga × repetição.';
comment on column public.planned_sets.target_distance_m is
  'Distância-alvo em metros. Null quando a prescrição é só por tempo.';

-- ============================================================
-- 3. Registro real: duração, distância, esforço e PACE derivado
-- ============================================================
alter table public.set_logs
  add column if not exists actual_duration_seconds integer,
  add column if not exists actual_distance_m numeric,
  add column if not exists perceived_effort text;

alter table public.set_logs
  alter column actual_reps drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'set_logs_duracao_positiva'
  ) then
    alter table public.set_logs
      add constraint set_logs_duracao_positiva
      check (actual_duration_seconds is null or actual_duration_seconds > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'set_logs_distancia_positiva'
  ) then
    alter table public.set_logs
      add constraint set_logs_distancia_positiva
      check (actual_distance_m is null or actual_distance_m > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'set_logs_esforco_check'
  ) then
    alter table public.set_logs
      add constraint set_logs_esforco_check
      check (perceived_effort is null or perceived_effort in ('leve', 'moderado', 'forte'));
  end if;

  -- Série registrada sem NADA medido não é registro. Reps (musculação) ou
  -- duração (cardio/isometria) — uma das duas tem de existir.
  if not exists (
    select 1 from pg_constraint where conname = 'set_logs_medicao_coerente'
  ) then
    alter table public.set_logs
      add constraint set_logs_medicao_coerente
      check (actual_reps is not null or actual_duration_seconds is not null);
  end if;
end
$$;

-- Pace em segundos por quilômetro. GERADA: derivar no banco impede que o app
-- grave um pace que não corresponde ao tempo/distância da própria linha.
alter table public.set_logs
  add column if not exists pace_seconds_per_km numeric
  generated always as (
    case
      when actual_distance_m is not null
       and actual_distance_m > 0
       and actual_duration_seconds is not null
      then actual_duration_seconds / (actual_distance_m / 1000.0)
      else null
    end
  ) stored;

comment on column public.set_logs.actual_duration_seconds is
  'Duração real da série em segundos (cardio e isometria).';
comment on column public.set_logs.actual_distance_m is
  'Distância real percorrida em metros.';
comment on column public.set_logs.perceived_effort is
  'Percepção de esforço: leve | moderado | forte. Equivalente do RIR para cardio.';
comment on column public.set_logs.pace_seconds_per_km is
  'DERIVADA: segundos por km. Null sem distância. Nunca gravada pelo cliente.';

-- ============================================================
-- 4. save_set_log: aceita duração, distância e esforço
-- (DROP + recreate porque a assinatura muda; mantém security invoker/RLS)
-- ============================================================
drop function if exists public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz);

create or replace function public.save_set_log(
  p_session_log_id uuid,
  p_planned_set_id uuid,
  p_actual_reps    int,
  p_actual_load_kg numeric,
  p_actual_rir     int,
  p_outcome        text,
  p_started_at     timestamptz default null,
  p_actual_duration_seconds int default null,
  p_actual_distance_m numeric default null,
  p_perceived_effort text default null
)
returns public.set_logs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
  v_row public.set_logs;
begin
  if p_planned_set_id is null then
    raise exception 'planned_set_id não pode ser nulo'
      using errcode = '22004';
  end if;

  if p_actual_reps is null and p_actual_duration_seconds is null then
    raise exception 'série precisa de repetições ou duração'
      using errcode = '22023';
  end if;

  select *
    into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'P0002';
  end if;

  if v_log.finished_at is not null then
    raise exception 'session_log % já finalizado; não aceita novas séries', p_session_log_id
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from public.planned_sets ps
      join public.planned_exercises pe on pe.id = ps.exercise_id
     where ps.id = p_planned_set_id
       and pe.session_id = v_log.planned_session_id
  ) then
    raise exception 'planned_set % não pertence ao session_log %',
      p_planned_set_id, p_session_log_id
      using errcode = '42501';
  end if;

  insert into public.set_logs (
    session_log_id, planned_set_id, actual_reps, actual_load_kg,
    actual_rir, outcome, started_at, completed_at,
    actual_duration_seconds, actual_distance_m, perceived_effort
  )
  values (
    p_session_log_id, p_planned_set_id, p_actual_reps, p_actual_load_kg,
    p_actual_rir, p_outcome, p_started_at, now(),
    p_actual_duration_seconds, p_actual_distance_m, p_perceived_effort
  )
  on conflict (session_log_id, planned_set_id)
    where planned_set_id is not null
  -- No-op intencional (0005): trava e devolve a linha vencedora sem trocar a
  -- medição nem completed_at. Uma RPC atrasada não reordena confirmações.
  do update set planned_set_id = excluded.planned_set_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text) from public;
grant execute on function public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text) to authenticated;

-- ============================================================
-- 5. save_training_plan: grava metric e os alvos de duração/distância
-- ============================================================
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
    exercise_key,
    name_original,
    metric,
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
    x.exercise_key,
    x.name_original,
    coalesce(x.metric, 'carga_reps'),
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
    exercise_key text,
    name_original text,
    metric text,
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
    target_rir,
    target_duration_seconds,
    target_distance_m
  )
  select
    x.id,
    x.exercise_id,
    x.set_order,
    x.target_reps_min,
    x.target_reps_max,
    x.target_load_kg,
    x.target_rir,
    x.target_duration_seconds,
    x.target_distance_m
  from jsonb_to_recordset(p_sets) as x(
    id uuid,
    exercise_id uuid,
    set_order integer,
    target_reps_min integer,
    target_reps_max integer,
    target_load_kg numeric,
    target_rir integer,
    target_duration_seconds integer,
    target_distance_m numeric
  );

  return v_plan_id;
end;
$$;

revoke all on function public.save_training_plan(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_training_plan(jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ============================================================
-- Asserções: colunas existem E as RPCs realmente as gravam.
-- ============================================================
do $$
declare
  v_col text;
begin
  foreach v_col in array array['metric'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'planned_exercises' and column_name = v_col
    ) then
      raise exception 'asserção falhou: planned_exercises.% não existe', v_col;
    end if;
  end loop;

  foreach v_col in array array['target_duration_seconds', 'target_distance_m'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'planned_sets' and column_name = v_col
    ) then
      raise exception 'asserção falhou: planned_sets.% não existe', v_col;
    end if;
  end loop;

  foreach v_col in array array['actual_duration_seconds', 'actual_distance_m', 'perceived_effort', 'pace_seconds_per_km'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'set_logs' and column_name = v_col
    ) then
      raise exception 'asserção falhou: set_logs.% não existe', v_col;
    end if;
  end loop;

  -- pace tem de ser GERADA: se alguém a recriar como coluna comum, o app
  -- poderia gravar um pace que não bate com tempo/distância.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'set_logs'
       and column_name = 'pace_seconds_per_km' and is_generated = 'ALWAYS'
  ) then
    raise exception 'asserção falhou: pace_seconds_per_km não é coluna gerada';
  end if;

  foreach v_col in array array['p_actual_duration_seconds', 'p_actual_distance_m', 'p_perceived_effort'] loop
    if position(v_col in pg_get_functiondef(
         'public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz, int, numeric, text)'::regprocedure)) = 0 then
      raise exception 'asserção falhou: save_set_log não recebe %', v_col;
    end if;
  end loop;

  foreach v_col in array array['metric', 'target_duration_seconds', 'target_distance_m'] loop
    if position(v_col in pg_get_functiondef(
         'public.save_training_plan(jsonb, jsonb, jsonb, jsonb)'::regprocedure)) = 0 then
      raise exception 'asserção falhou: save_training_plan não grava %', v_col;
    end if;
  end loop;
end
$$;
