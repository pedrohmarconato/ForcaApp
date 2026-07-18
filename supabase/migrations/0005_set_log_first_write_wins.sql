-- Fase 4.2 — endurecimento incremental para retries após timeout.
--
-- AbortSignal interrompe a espera do cliente, mas não constitui prova de que o
-- Postgres cancelou a transação. Se uma chamada antiga chegar depois de um retry,
-- ela não pode sobrescrever a confirmação que já venceu. Por isso conflitos agora
-- preservam integralmente a primeira linha e devolvem esse valor autoritativo.

-- A 0005 precisa ser autossuficiente para bancos que já registraram uma variante
-- anterior da 0004: reaplica também o start concorrente e valida o índice parcial.
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
  -- No-op intencional: trava e retorna a linha vencedora sem trocar medição nem
  -- completed_at. Assim uma RPC atrasada não reordena confirmações.
  do update set planned_set_id = excluded.planned_set_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.start_session(uuid) from public;
revoke all on function public.save_set_log(uuid, uuid, int, numeric, int, text) from public;
revoke all on function public.finish_session(uuid) from public;
grant execute on function public.start_session(uuid) to authenticated;
grant execute on function public.save_set_log(uuid, uuid, int, numeric, int, text) to authenticated;
