-- Reordenação dos TREINOS da semana (feature "Reordenar" da aba Plano).
--
-- Semântica: permuta de FILA REAL. As sessões pendentes da semana trocam de
-- scheduled_date entre si (o conjunto de datas da semana é preservado por
-- construção); day_of_week é recalculado e order_in_week vira campo derivado —
-- renumerado para a semana INTEIRA pela data. Fixas (completed/skipped/
-- in_progress) nunca são tocadas.
--
-- Propagação opcional (p_apply_future): replica o padrão às semanas seguintes
-- casando por TÍTULO (é o que o usuário quer dizer: "Treino B antes do A,
-- sempre"). Semana futura inelegível é PULADA e reportada no retorno — nunca
-- aborta a transação das demais.
--
-- Por que RPC e não UPDATEs do cliente: permuta parcial de datas deixaria duas
-- sessões no mesmo dia — corrompe getTodaySession de forma silenciosa e não há
-- constraint que detecte. Aqui ou aplica tudo, ou nada.
--
-- Errcodes que o app trata (planEditRepository):
--   42501 plano inexistente/alheio/não ativo · 55000 pendente sem data ·
--   22023 lista inválida · 40001 lista divergente do estado vivo (recarregar).

-- Rótulos idênticos aos gravados pelo backend (plan_mapper.DIAS_SEMANA):
-- sem acento, segunda=isodow 1.
create or replace function public._forca_dia_label(p_data date)
returns text
language sql
immutable
as $$
  select (array['segunda','terca','quarta','quinta','sexta','sabado','domingo'])
         [extract(isodow from p_data)::int]
$$;

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

  -- Mesmo lock da save_training_plan: serializa com geração de plano e com
  -- outra edição concorrente do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists (
    select 1 from training_plans
     where id = p_plan_id and user_id = v_user and status = 'active'
  ) then
    raise exception 'plano inexistente, alheio ou não ativo' using errcode = '42501';
  end if;

  -- Trava a semana base.
  perform 1 from planned_sessions
   where plan_id = p_plan_id and week_number = p_week_number
   for update;

  -- A lista precisa ser o conjunto EXATO das pendentes da semana base.
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

  -- Slots: datas das pendentes em ordem (desempate: order_in_week, id) —
  -- mesmo critério do preview no app (engine/planReorder).
  select array_agg(scheduled_date order by scheduled_date, order_in_week, id)
    into v_slots
    from planned_sessions
   where plan_id = p_plan_id and week_number = p_week_number and status = 'pending';

  -- Sessão na posição i recebe o slot i.
  update planned_sessions ps
     set scheduled_date = v_slots[ord.i],
         day_of_week    = public._forca_dia_label(v_slots[ord.i])
    from unnest(p_session_ids) with ordinality as ord(sid, i)
   where ps.id = ord.sid
     and ps.user_id = v_user;

  -- order_in_week derivado: renumera a semana inteira pela data (fixas
  -- incluídas) para a aba Plano exibir exatamente a fila real.
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

  v_applied := array[p_week_number];

  if p_apply_future then
    -- Ordem completa de títulos da base pós-permuta (fixas nas posições reais).
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
      -- Trava a semana futura antes de avaliar elegibilidade.
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

      -- Slots da semana futura (todas pendentes) e atribuição por título:
      -- o i-ésimo título da base recebe o slot i desta semana.
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

      update planned_sessions ps
         set order_in_week = r.rn
        from (
          select id,
                 row_number() over (order by scheduled_date, order_in_week, id) as rn
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

grant execute on function public.reorder_week_sessions(uuid, int, uuid[], boolean) to authenticated;
