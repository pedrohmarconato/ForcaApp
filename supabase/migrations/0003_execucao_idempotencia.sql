-- Fase 4.1 — Idempotência e atomicidade da EXECUÇÃO da sessão.
-- REQUISITO do app da Fase 4.1: sem estes objetos, iniciar/concluir/gravar série
-- QUEBRA em runtime — o app chama as RPCs start_session/finish_session e faz UPSERT
-- com onConflict (session_log_id, planned_set_id).
--
-- Aplicar em TRANSAÇÃO ÚNICA, com backup. Tabelas legadas fato_*/dim_* intocadas.
-- Rodar os PRÉ-CHECKS abaixo ANTES: criar índice único falha se já houver duplicata.
--
-- PRÉ-CHECKS (têm de vir VAZIOS; se não, deduplicar antes):
--   a) duplicatas de série por log:
--      select session_log_id, planned_set_id, count(*) from public.set_logs
--        where planned_set_id is not null group by 1,2 having count(*) > 1;
--   b) mais de um log ABERTO por sessão:
--      select planned_session_id, count(*) from public.session_logs
--        where finished_at is null group by 1 having count(*) > 1;
--   c) conferir que as policies vivas do 0002 batem com o repositório (o 0002 foi
--      aplicado a partir de texto reconstruído de transmissão corrompida):
--      select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy
--        where polrelid in ('public.session_logs'::regclass,'public.set_logs'::regclass);

-- ============================================================
-- 1. Uma execução de série por (log, planned_set) → UPSERT idempotente (F2/F3)
-- ============================================================
create unique index if not exists set_logs_uniq_log_plannedset
  on public.set_logs (session_log_id, planned_set_id)
  where planned_set_id is not null;

-- ============================================================
-- 2. No máximo UMA execução aberta por sessão planejada (F7)
-- ============================================================
create unique index if not exists session_logs_one_open_per_session
  on public.session_logs (planned_session_id)
  where finished_at is null;

-- ============================================================
-- 3. start atômico: reusa o log aberto ou cria + marca a sessão 'in_progress' (F6/F7)
--    SECURITY INVOKER → a RLS do usuário continua valendo dentro da função.
-- ============================================================
create or replace function public.start_session(p_planned_session_id uuid)
returns public.session_logs
language plpgsql
security invoker
as $$
declare
  v_log public.session_logs;
begin
  select *
    into v_log
    from public.session_logs
   where planned_session_id = p_planned_session_id
     and user_id = auth.uid()
     and finished_at is null
   order by started_at desc
   limit 1;
  if found then
    return v_log; -- idempotente: já existe execução aberta desta sessão
  end if;

  insert into public.session_logs (planned_session_id, user_id)
  values (p_planned_session_id, auth.uid())
  returning * into v_log;

  update public.planned_sessions
     set status = 'in_progress'
   where id = p_planned_session_id
     and user_id = auth.uid();

  return v_log;
end;
$$;

-- ============================================================
-- 4. finish atômico: erro se 0 linhas (inexistente/alheio/já finalizado) (F5/F6)
-- ============================================================
create or replace function public.finish_session(p_session_log_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_planned uuid;
  v_rows int;
begin
  update public.session_logs
     set finished_at = now()
   where id = p_session_log_id
     and user_id = auth.uid()
     and finished_at is null
   returning planned_session_id into v_planned;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'session_log % inexistente, alheio ou já finalizado', p_session_log_id
      using errcode = 'no_data_found';
  end if;

  update public.planned_sessions
     set status = 'completed'
   where id = v_planned
     and user_id = auth.uid();
end;
$$;

grant execute on function public.start_session(uuid) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;

-- ============================================================
-- 5. (OPCIONAL — defesa a mais, F9) endurecer o WITH CHECK de set_logs para exigir
--    que o planned_set pertença à MESMA planned_session do session_log. Não é
--    necessário para o fluxo normal (o app monta os IDs da mesma sessão); habilite
--    só se quiser fechar a brecha de corrupção relacional dentro da própria conta.
-- ============================================================
-- drop policy if exists "own set logs" on public.set_logs;
-- create policy "own set logs" on public.set_logs
--   for all
--   using (
--     exists (select 1 from public.session_logs l
--             where l.id = session_log_id and l.user_id = auth.uid())
--   )
--   with check (
--     exists (select 1 from public.session_logs l
--             where l.id = session_log_id and l.user_id = auth.uid())
--     and (
--       planned_set_id is null
--       or exists (
--         select 1
--           from public.planned_sets ps
--           join public.planned_exercises e on e.id = ps.exercise_id
--           join public.planned_sessions s on s.id = e.session_id
--           join public.session_logs l2 on l2.id = session_log_id
--          where ps.id = planned_set_id
--            and s.user_id = auth.uid()
--            and s.id = l2.planned_session_id  -- MESMA sessão do log
--       )
--     )
--   );
