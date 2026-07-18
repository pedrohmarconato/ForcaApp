-- Fase 4.2 — RPCs transacionais da execução de treino.
--
-- Esta é a forma canônica da migration 0004. Ela depende dos dois índices
-- parciais criados pela 0003 e mantém SECURITY INVOKER para que a RLS seja
-- aplicada com o JWT do chamador.

-- Falha durante a migration (42P10) se o índice parcial que arbitra o UPSERT
-- não existir ou não puder ser inferido. O SELECT não produz linhas, portanto
-- este pré-check não grava dados.
insert into public.set_logs (
  session_log_id, planned_set_id, actual_reps
)
select l.id, ps.id, 0
  from public.session_logs l
 cross join public.planned_sets ps
 where false
on conflict (session_log_id, planned_set_id)
  where planned_set_id is not null
do nothing;

insert into public.session_logs (planned_session_id, user_id)
select s.id, s.user_id
  from public.planned_sessions s
 where false
on conflict (planned_session_id)
  where finished_at is null
do nothing;

-- Inicia uma sessão sem a corrida SELECT -> INSERT da versão anterior. Quando
-- duas transações concorrem, uma insere e a outra lê o vencedor depois que o
-- ON CONFLICT aguarda a decisão da transação concorrente.
create or replace function public.start_session(p_planned_session_id uuid)
returns public.session_logs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
begin
  insert into public.session_logs (planned_session_id, user_id)
  values (p_planned_session_id, auth.uid())
  on conflict (planned_session_id) where finished_at is null
  do nothing
  returning * into v_log;

  if v_log.id is null then
    select *
      into v_log
      from public.session_logs
     where planned_session_id = p_planned_session_id
       and user_id = auth.uid()
       and finished_at is null
     order by started_at desc
     limit 1;
  end if;

  if v_log.id is null then
    -- A RLS também faz uma sessão alheia chegar aqui sem revelar sua existência.
    raise exception 'planned_session % inexistente ou alheia', p_planned_session_id
      using errcode = '42501';
  end if;

  update public.planned_sessions
     set status = 'in_progress'
   where id = p_planned_session_id
     and user_id = auth.uid();

  return v_log;
end;
$$;

-- Grava/atualiza uma série de uma execução aberta. O predicado do ON CONFLICT
-- é deliberadamente idêntico ao índice parcial da 0003.
create or replace function public.save_set_log(
  p_session_log_id uuid,
  p_planned_set_id uuid,
  p_actual_reps    int,
  p_actual_load_kg numeric,
  p_actual_rir     int,
  p_outcome        text
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

  -- Posse do usuário não basta: a série precisa pertencer à mesma sessão do log.
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
    session_log_id,
    planned_set_id,
    actual_reps,
    actual_load_kg,
    actual_rir,
    outcome,
    completed_at
  )
  values (
    p_session_log_id,
    p_planned_set_id,
    p_actual_reps,
    p_actual_load_kg,
    p_actual_rir,
    p_outcome,
    now()
  )
  on conflict (session_log_id, planned_set_id)
    where planned_set_id is not null
  do update set
    actual_reps = excluded.actual_reps,
    actual_load_kg = excluded.actual_load_kg,
    actual_rir = excluded.actual_rir,
    outcome = excluded.outcome,
    completed_at = excluded.completed_at
  returning * into v_row;

  return v_row;
end;
$$;

-- A linha do log é travada antes de finalizar. save_set_log usa a mesma primeira
-- trava, portanto save e finish concorrentes são serializados sem inversão da
-- ordem de locks.
create or replace function public.finish_session(p_session_log_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
begin
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
    return;
  end if;

  update public.session_logs
     set finished_at = now()
   where id = p_session_log_id;

  update public.planned_sessions
     set status = 'completed'
   where id = v_log.planned_session_id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.start_session(uuid) from public;
revoke all on function public.save_set_log(uuid, uuid, int, numeric, int, text) from public;
revoke all on function public.finish_session(uuid) from public;
grant execute on function public.start_session(uuid) to authenticated;
grant execute on function public.save_set_log(uuid, uuid, int, numeric, int, text) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;

-- Prova transacional para HML (executar como owner da migration):
--   begin;
--   do $proof$
--   declare
--     v_owner uuid;
--     v_plan uuid;
--     v_session uuid;
--     v_other_session uuid;
--     v_exercise uuid;
--     v_set uuid;
--     v_other_set uuid;
--     v_log public.session_logs;
--     v_same_log public.session_logs;
--     v_count int;
--   begin
--     select id into v_owner from auth.users order by created_at limit 1;
--     if v_owner is null then raise exception 'sem usuário para a prova'; end if;
--
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
--     perform set_config('role', 'authenticated', true);
--
--     -- archived evita colidir com training_plans_one_active_per_user_idx.
--     insert into public.training_plans (user_id, name, status)
--       values (v_owner, 'PROOF 0004', 'archived') returning id into v_plan;
--     insert into public.planned_sessions (plan_id, user_id, week_number, title)
--       values (v_plan, v_owner, 1, 'PROOF A') returning id into v_session;
--     insert into public.planned_sessions (plan_id, user_id, week_number, title)
--       values (v_plan, v_owner, 1, 'PROOF B') returning id into v_other_session;
--     insert into public.planned_exercises (session_id, exercise_order, name)
--       values (v_session, 1, 'PROOF A') returning id into v_exercise;
--     insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max)
--       values (v_exercise, 1, 8, 10) returning id into v_set;
--     insert into public.planned_exercises (session_id, exercise_order, name)
--       values (v_other_session, 1, 'PROOF B') returning id into v_exercise;
--     insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max)
--       values (v_exercise, 1, 8, 10) returning id into v_other_set;
--
--     v_log := public.start_session(v_session);
--     v_same_log := public.start_session(v_session);
--     if v_same_log.id <> v_log.id then raise exception 'start_session não foi idempotente'; end if;
--     select count(*) into v_count from public.session_logs
--       where planned_session_id = v_session and finished_at is null;
--     if v_count <> 1 then raise exception 'esperava 1 log aberto, recebeu %', v_count; end if;
--
--     perform public.save_set_log(v_log.id, v_set, 8, 40, 2, 'on_target');
--     perform public.save_set_log(v_log.id, v_set, 8, 40, 2, 'on_target');
--     select count(*) into v_count from public.set_logs
--       where session_log_id = v_log.id and planned_set_id = v_set;
--     if v_count <> 1 then raise exception 'save_set_log criou % linhas', v_count; end if;
--
--     begin
--       perform public.save_set_log(v_log.id, v_other_set, 8, 40, 2, 'on_target');
--       raise exception 'FALHOU: aceitou série de outra sessão';
--     exception when insufficient_privilege then null;
--     end;
--
--     perform public.finish_session(v_log.id);
--     perform public.finish_session(v_log.id);
--     begin
--       perform public.save_set_log(v_log.id, v_set, 9, 42.5, 1, 'on_target');
--       raise exception 'FALHOU: aceitou gravação em log finalizado';
--     exception when raise_exception then
--       if SQLERRM like 'FALHOU:%' then raise; end if;
--     end;
--   end
--   $proof$;
--   rollback;
