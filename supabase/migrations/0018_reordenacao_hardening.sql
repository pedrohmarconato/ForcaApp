-- Hardening da reordenação (achados do review do PR #54). Recria as RPCs de
-- 0016/0017 — aquelas já foram aplicadas e são imutáveis; esta é a versão vigente.
--
-- A1 (ALTO): com datas EMPATADAS (estado real: o clamp da semana 1 no
--   plan_mapper agenda várias sessões no mesmo dia), permutar datas é
--   identidade e a renumeração antiga desempatava pelo order_in_week ANTIGO —
--   a reordenação virava no-op confirmado como sucesso. Agora a intenção do
--   usuário manda no desempate: array_position(p_session_ids, id) na semana
--   base e array_position(v_title_order, title) nas semanas propagadas.
-- B1: revoke de public nas três funções (padrão da casa desde a 0004).
-- B2: reorder_planned_exercises passa a exigir plano ATIVO (a 0017 já exigia).
-- B3: UPDATE de exercise_order restrito a id = any(p_exercise_ids) — defesa em
--   profundidade contra INSERT concorrente receber ordem NULL.
-- Extra: reorder_planned_exercises adota o MESMO advisory lock da
--   save_training_plan/reorder_week_sessions — serializa com geração de plano.

-- ============================================================
-- 1. reorder_planned_exercises (v2 — substitui a da 0016)
-- ============================================================
create or replace function public.reorder_planned_exercises(
  p_session_id  uuid,
  p_exercise_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_status text;
  v_total  int;
begin
  if v_user is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  if coalesce(array_length(p_exercise_ids, 1), 0) < 2
     or (select count(distinct x) from unnest(p_exercise_ids) x)
        <> array_length(p_exercise_ids, 1) then
    raise exception 'lista de exercícios inválida' using errcode = '22023';
  end if;

  -- Serializa com geração de plano e outras edições do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Trava a sessão e valida posse + status + plano ATIVO (sessão de plano
  -- arquivado é dado morto — editar dá a ilusão de efeito).
  select s.status into v_status
    from planned_sessions s
    join training_plans p on p.id = s.plan_id and p.status = 'active'
   where s.id = p_session_id
     and s.user_id = v_user
     for update of s;
  if not found then
    raise exception 'sessão inexistente, alheia ou de plano não ativo'
      using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'sessão % não pode ser reordenada', v_status using errcode = '55000';
  end if;

  select count(*) into v_total
    from (select id from planned_exercises
           where session_id = p_session_id
             for update) t;
  if v_total <> array_length(p_exercise_ids, 1)
     or exists (
       select 1 from planned_exercises
        where session_id = p_session_id
          and id <> all (p_exercise_ids)
     ) then
    raise exception 'lista divergente do estado atual — recarregue'
      using errcode = '40001';
  end if;

  update planned_exercises
     set exercise_order = array_position(p_exercise_ids, id)
   where session_id = p_session_id
     and id = any (p_exercise_ids);
end;
$$;

revoke all on function public.reorder_planned_exercises(uuid, uuid[]) from public;
grant execute on function public.reorder_planned_exercises(uuid, uuid[]) to authenticated;

-- ============================================================
-- 2. reorder_week_sessions (v2 — substitui a da 0017)
-- ============================================================
create or replace function public.reorder_week_sessions(
  p_plan_id      uuid,
  p_week_number  int,
  p_session_ids  uuid[],
  p_apply_future boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := auth.uid();
  v_slots       date[];
  v_pending     int;
  v_base_count  int;
  v_title_order text[];
  v_applied     int[]  := array[]::int[];
  v_skipped     jsonb  := '[]'::jsonb;
  w             record;
  v_wk_reason   text;
  v_wk_count    int;
  v_wk_pending  int;
  v_wk_sem_data int;
  v_wk_titles   text[];
  v_wk_slots    date[];
begin
  if v_user is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  if coalesce(array_length(p_session_ids, 1), 0) < 2
     or (select count(distinct x) from unnest(p_session_ids) x)
        <> array_length(p_session_ids, 1) then
    raise exception 'lista de treinos inválida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists (
    select 1 from training_plans
     where id = p_plan_id and user_id = v_user and status = 'active'
  ) then
    raise exception 'plano inexistente, alheio ou não ativo' using errcode = '42501';
  end if;

  perform 1 from planned_sessions
   where plan_id = p_plan_id and week_number = p_week_number
   for update;

  select count(*) into v_pending
    from planned_sessions
   where plan_id = p_plan_id and week_number = p_week_number and status = 'pending';
  if v_pending <> array_length(p_session_ids, 1)
     or exists (
       select 1 from planned_sessions
        where plan_id = p_plan_id and week_number = p_week_number
          and status = 'pending' and id <> all (p_session_ids)
     )
     or exists (
       select 1 from unnest(p_session_ids) x
        where not exists (
          select 1 from planned_sessions
           where id = x and plan_id = p_plan_id
             and week_number = p_week_number and status = 'pending'
        )
     ) then
    raise exception 'lista divergente do estado atual — recarregue'
      using errcode = '40001';
  end if;

  if exists (
    select 1 from planned_sessions
     where plan_id = p_plan_id and week_number = p_week_number
       and status = 'pending' and scheduled_date is null
  ) then
    raise exception 'treino pendente sem data não pode ser reordenado'
      using errcode = '55000';
  end if;

  select array_agg(scheduled_date order by scheduled_date, order_in_week, id)
    into v_slots
    from planned_sessions
   where plan_id = p_plan_id and week_number = p_week_number and status = 'pending';

  update planned_sessions ps
     set scheduled_date = v_slots[ord.i],
         day_of_week    = public._forca_dia_label(v_slots[ord.i])
    from unnest(p_session_ids) with ordinality as ord(sid, i)
   where ps.id = ord.sid
     and ps.user_id = v_user;

  -- order_in_week derivado, renumerado pela fila real. Fix A1: com datas
  -- empatadas, a POSIÇÃO ESCOLHIDA (array_position) desempata — senão a
  -- permuta de datas iguais seria identidade e a reordenação, um no-op.
  update planned_sessions ps
     set order_in_week = r.rn
    from (
      select id,
             row_number() over (
               order by scheduled_date nulls last,
                        array_position(p_session_ids, id) nulls last,
                        order_in_week, id
             ) as rn
        from planned_sessions
       where plan_id = p_plan_id and week_number = p_week_number
    ) r
   where ps.id = r.id
     and ps.order_in_week <> r.rn;

  v_applied := array[p_week_number];

  if p_apply_future then
    select array_agg(title order by scheduled_date nulls last, order_in_week, id),
           count(*)
      into v_title_order, v_base_count
      from planned_sessions
     where plan_id = p_plan_id and week_number = p_week_number;

    for w in
      select distinct week_number as wn
        from planned_sessions
       where plan_id = p_plan_id and week_number > p_week_number
       order by 1
    loop
      perform 1 from planned_sessions
       where plan_id = p_plan_id and week_number = w.wn
       for update;

      select count(*),
             count(*) filter (where status = 'pending'),
             count(*) filter (where scheduled_date is null),
             array_agg(title)
        into v_wk_count, v_wk_pending, v_wk_sem_data, v_wk_titles
        from planned_sessions
       where plan_id = p_plan_id and week_number = w.wn;

      v_wk_reason := null;
      if v_wk_pending <> v_wk_count then
        v_wk_reason := 'sessao_nao_pendente';
      elsif v_wk_count <> v_base_count then
        v_wk_reason := 'contagem_diferente';
      elsif v_wk_sem_data > 0 then
        v_wk_reason := 'sem_data';
      elsif (select count(distinct t) from unnest(v_title_order) t) <> v_base_count
         or (select count(distinct t) from unnest(v_wk_titles) t) <> v_wk_count then
        v_wk_reason := 'titulos_ambiguos';
      elsif exists (
        select t from unnest(v_wk_titles) t
        except
        select t from unnest(v_title_order) t
      ) then
        v_wk_reason := 'titulos_diferentes';
      end if;

      if v_wk_reason is not null then
        v_skipped := v_skipped
          || jsonb_build_object('week', w.wn, 'reason', v_wk_reason);
        continue;
      end if;

      select array_agg(scheduled_date order by scheduled_date, order_in_week, id)
        into v_wk_slots
        from planned_sessions
       where plan_id = p_plan_id and week_number = w.wn;

      update planned_sessions ps
         set scheduled_date = v_wk_slots[t.i],
             day_of_week    = public._forca_dia_label(v_wk_slots[t.i])
        from unnest(v_title_order) with ordinality as t(title, i)
       where ps.plan_id = p_plan_id
         and ps.week_number = w.wn
         and ps.user_id = v_user
         and ps.title = t.title
         and ps.scheduled_date is distinct from v_wk_slots[t.i];

      -- Fix A1 nas propagadas: a posição do TÍTULO na ordem da base desempata.
      update planned_sessions ps
         set order_in_week = r.rn
        from (
          select id,
                 row_number() over (
                   order by scheduled_date,
                            array_position(v_title_order, title) nulls last,
                            order_in_week, id
                 ) as rn
            from planned_sessions
           where plan_id = p_plan_id and week_number = w.wn
        ) r
       where ps.id = r.id
         and ps.order_in_week <> r.rn;

      v_applied := v_applied || w.wn;
    end loop;
  end if;

  return jsonb_build_object(
    'applied_weeks', to_jsonb(v_applied),
    'skipped_weeks', v_skipped
  );
end;
$$;

revoke all on function public.reorder_week_sessions(uuid, int, uuid[], boolean) from public;
grant execute on function public.reorder_week_sessions(uuid, int, uuid[], boolean) to authenticated;

revoke all on function public._forca_dia_label(date) from public;
grant execute on function public._forca_dia_label(date) to authenticated;
