-- Migration 0027: Agenda congelada e reancoragem de semanas.
--
-- Decisão: os planos gerados capturam uma agenda vigente no momento da geração.
-- Se o aluno edita sua preferência de dias (questionario_usuario.dias_treino),
-- um plano em andamento não reflete isso retroativamente — a agenda é histórica.
-- Este padrão preserva a intenção original do plano e simplifica a auditoria.
--
-- Semântica de reancoragem: quando o aluno atrasa, o motor scheduleShift.ts
-- calcula datas novas para as sessões pendentes de uma semana. Esta RPC aplica
-- as mudanças atomicamente, renumera a fila e impede colisões de data.

-- ============================================================
-- 1. Coluna de agenda congelada
-- ============================================================
alter table public.training_plans
  add column if not exists training_days text[];

comment on column public.training_plans.training_days is
  'Agenda vigente NO MOMENTO da geração do plano (ex: [''segunda'', ''quarta'', ''sexta'']).
   Congelada para evitar que edições posteriores do questionario_usuario.dias_treino
   reescrevam retroativamente planos em andamento. A preferência editável segue em
   questionario_usuario.dias_treino.';

-- ============================================================
-- 2. Atualizar save_training_plan para gravar a coluna
-- ============================================================
-- Versão-base: migration 0015 (inclui progression_rules).
-- Alteração: adiciona training_days ao INSERT de training_plans.
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
    progression_rules,
    training_days,
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
    p_plan -> 'progression_rules',
    case
      when jsonb_typeof(p_plan -> 'training_days') = 'array'
      then (select array_agg(value #>> '{}') from jsonb_array_elements(p_plan -> 'training_days'))
      else null
    end,
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
-- 3. RPC nova: reschedule_week_sessions
-- ============================================================
-- Semântica: aplica novas datas às sessões PENDENTES de uma semana,
-- atomicamente. Diferente de reorder_week_sessions, as datas são novas
-- (calculadas pelo motor scheduleShift.ts no cliente), não uma permuta.
--
-- Validações (errcodes):
--   42501 auth.uid() nulo, plano inexistente/alheio/não ativo
--   22023 p_assignments inválido (não array, vazio, campos faltando,
--         session_id repetido, scheduled_date repetida, data inválida)
--   40001 sessão não existe/não pendente/não da semana (estado divergente)
--   55000 colisão de data com sessão fixa/concluída/adiada da mesma semana
--
-- Design: a RPC valida APENAS o que só ela pode validar: atomicidade,
-- colisão de datas, integridade referencial. Validar se as datas caem
-- na semana-calendário é responsabilidade do motor puro do cliente
-- (que é testado independentemente). Planos legados não garantem a âncora
-- da semana, então replicar essa regra aqui quebraria compatibilidade.

create or replace function public.reschedule_week_sessions(
  p_plan_id     uuid,
  p_week_number int,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user              uuid := auth.uid();
  -- jsonb, não record: `select * from jsonb_array_elements(...)` devolve uma LINHA
  -- com a coluna `value`, e `record ->> texto` não existe. Iterar sobre `value`
  -- mantém o elemento como jsonb, que é o que os operadores abaixo esperam.
  v_assignment        jsonb;
  v_moved             int  := 0;
  v_old_date          date;
  v_new_date          date;
  v_session_id        uuid;
  v_collisions_count  int;
begin
  -- Validação 1: autenticação obrigatória.
  if v_user is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  -- Validação 2: p_assignments deve ser array não-vazio.
  if jsonb_typeof(p_assignments) is distinct from 'array'
     or jsonb_array_length(p_assignments) = 0 then
    raise exception 'assignments inválido (esperado array não-vazio)' using errcode = '22023';
  end if;

  -- Validação 3: cada elemento precisa ter session_id e scheduled_date.
  if exists (
    select 1 from jsonb_array_elements(p_assignments) a
     where (a ->> 'session_id') is null
        or (a ->> 'scheduled_date') is null
  ) then
    raise exception 'assignment sem session_id ou scheduled_date' using errcode = '22023';
  end if;

  -- Validação 4: session_id não pode estar repetido.
  if (
    select count(distinct a ->> 'session_id')
      from jsonb_array_elements(p_assignments) a
  ) <> jsonb_array_length(p_assignments) then
    raise exception 'session_id repetido em assignments' using errcode = '22023';
  end if;

  -- Validação 5: scheduled_date repetida é inválida.
  if (
    select count(distinct a ->> 'scheduled_date')
      from jsonb_array_elements(p_assignments) a
  ) <> jsonb_array_length(p_assignments) then
    raise exception 'scheduled_date repetida em assignments' using errcode = '22023';
  end if;

  -- Validação 5b: validar formato de session_id (UUID) e scheduled_date (YYYY-MM-DD).
  -- UUIDs em maiúsculas são válidos, então usamos !~* (case-insensitive).
  if exists (
    select 1 from jsonb_array_elements(p_assignments) a
     where (a ->> 'session_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (a ->> 'scheduled_date') !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'session_id ou scheduled_date malformado' using errcode = '22023';
  end if;

  -- Validação 5c: data sintaticamente bem formada mas impossível (2026-02-31,
  -- 2026-13-01) só é rejeitada pelo cast — to_date faz overflow em silêncio.
  begin
    perform (a ->> 'scheduled_date')::date
      from jsonb_array_elements(p_assignments) a;
  exception when others then
    raise exception 'scheduled_date contém data inválida' using errcode = '22023';
  end;

  -- Serializa com geração de plano e outras edições do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Validação 6: plano deve existir, ser do usuário e estar ativo.
  if not exists (
    select 1 from training_plans
     where id = p_plan_id and user_id = v_user and status = 'active'
  ) then
    raise exception 'plano inexistente, alheio ou não ativo' using errcode = '42501';
  end if;

  -- Trava as sessões da semana antes de validar.
  perform 1 from planned_sessions
   where plan_id = p_plan_id and week_number = p_week_number
   for update;

  -- Validação 7: todas as sessões em p_assignments devem:
  --   - existir
  --   - pertencer a p_plan_id
  --   - pertencer à semana p_week_number
  --   - ser do usuário v_user
  --   - estar com status 'pending'
  if exists (
    select 1 from jsonb_array_elements(p_assignments) a
     where not exists (
       select 1 from planned_sessions
        where id = (a ->> 'session_id')::uuid
          and plan_id = p_plan_id
          and week_number = p_week_number
          and user_id = v_user
          and status = 'pending'
     )
  ) then
    raise exception 'sessão inexistente, não pendente ou fora da semana/plano'
      using errcode = '40001';
  end if;

  -- Validação 8: nenhuma data nova pode colidir com a scheduled_date
  -- de outra sessão (pendente ou fixa) da MESMA semana que NÃO esteja
  -- sendo reatribuída agora. Usamos NOT EXISTS para evitar armadilhas
  -- com NULL em subqueries.
  select count(*)
    into v_collisions_count
    from planned_sessions ps1
   where ps1.plan_id = p_plan_id
     and ps1.week_number = p_week_number
     and not exists (
       select 1 from jsonb_array_elements(p_assignments) a
        where a ->> 'session_id' = ps1.id::text
     )
     and exists (
       select 1 from jsonb_array_elements(p_assignments) a
        where (a ->> 'scheduled_date')::date = ps1.scheduled_date
     );

  if v_collisions_count > 0 then
    raise exception 'colisão de data com outro treino da semana'
      using errcode = '55000';
  end if;

  -- Aplicar mudanças e contar quantas realmente mudaram.
  for v_assignment in select value from jsonb_array_elements(p_assignments)
  loop
    v_session_id := (v_assignment ->> 'session_id')::uuid;
    v_new_date   := (v_assignment ->> 'scheduled_date')::date;

    -- Pega a data antiga para comparação.
    select scheduled_date into v_old_date
      from planned_sessions
     where id = v_session_id
       and plan_id = p_plan_id
       and user_id = v_user;

    -- Se a data mudou, incrementa o contador e executa UPDATE.
    if v_old_date is distinct from v_new_date then
      v_moved := v_moved + 1;

      update planned_sessions
         set scheduled_date = v_new_date,
             day_of_week    = public._forca_dia_label(v_new_date)
       where id = v_session_id
         and plan_id = p_plan_id
         and user_id = v_user;
    end if;
  end loop;

  -- Renumera order_in_week da semana INTEIRA (mesmo critério da reorder).
  update planned_sessions ps
     set order_in_week = r.rn
    from (
      select id,
             row_number() over (order by scheduled_date nulls last, order_in_week, id) as rn
        from planned_sessions
       where plan_id = p_plan_id and week_number = p_week_number
    ) r
   where ps.id = r.id
     and ps.order_in_week <> r.rn;

  return jsonb_build_object(
    'week', p_week_number,
    'moved', v_moved
  );
end;
$$;

grant execute on function public.reschedule_week_sessions(uuid, int, jsonb) to authenticated;
revoke execute on function public.reschedule_week_sessions(uuid, int, jsonb) from anon;
-- Fix (03/08/2026): revogar também de PUBLIC. Função nova herda EXECUTE para
-- PUBLIC e o revoke de anon não cobre esse grant (medido em HML: anon executava).
revoke execute on function public.reschedule_week_sessions(uuid, int, jsonb) from public;
