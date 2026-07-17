-- Fase 4.2 — Correções do 2º review adversarial (BLOCKER + HIGH na gravação/retomada).
--
-- CONTEXTO (fatos que motivam esta migration):
--   * O supabase-js `.upsert(..., { onConflict })` gera `ON CONFLICT (cols)` SEM
--     predicado. O índice único de série é PARCIAL (0003:
--     `set_logs (session_log_id, planned_set_id) WHERE planned_set_id IS NOT NULL`).
--     O Postgres NÃO infere índice PARCIAL sem o predicado explícito → erro 42P10 em
--     TODA gravação de série. É o BLOCKER: com a 0003 aplicada e o app da 4.1, gravar
--     série quebra em runtime. (F1)
--   * A gravação por PostgREST/RLS não barra escrever em session_log já FINALIZADO
--     (a RLS confere posse, não `finished_at`). (F2/F6)
--
-- O QUE ESTA MIGRATION FAZ:
--   1) `save_set_log(...)`: RPC ATÔMICA, SECURITY INVOKER, com `ON CONFLICT (...)
--      WHERE planned_set_id IS NOT NULL` (casa o índice parcial → F1), `completed_at =
--      now()` no UPDATE (sem linha híbrida → F5) e GUARDA que recusa log finalizado/
--      alheio (F2/F6). Trava a linha do log com `for update` para SERIALIZAR contra
--      finish_session concorrente (fecha o TOCTOU). O app passa a chamá-la no lugar
--      do `.upsert`.
--   2) `finish_session(...)`: IDEMPOTENTE (F4) — se já estava finalizada (dela),
--      RETORNA sucesso; só inexistente/alheio levanta exceção. Também com `for update`.
--
-- APLICAR em TRANSAÇÃO ÚNICA, com backup. Tabelas legadas fato_*/dim_* intocadas.
-- Depende da 0003 (índices únicos parciais + start_session) JÁ aplicada.
--
-- ============================================================
-- PRÉ-CHECKS (rodar ANTES; têm de vir VAZIOS — a 0003 já deduplicou, reconferir):
--   a) duplicatas de série por log (quebrariam o UPSERT idempotente):
--      select session_log_id, planned_set_id, count(*) from public.set_logs
--        where planned_set_id is not null group by 1,2 having count(*) > 1;
--   b) mais de um log ABERTO por sessão:
--      select planned_session_id, count(*) from public.session_logs
--        where finished_at is null group by 1 having count(*) > 1;
--   c) o índice parcial da 0003 existe (save_set_log depende dele p/ inferir o ON CONFLICT):
--      select indexname from pg_indexes
--        where schemaname='public' and indexname='set_logs_uniq_log_plannedset';
-- ============================================================

-- ============================================================
-- 1. save_set_log — gravação idempotente da série (F1/F2/F5/F6)
--    SECURITY INVOKER → a RLS do usuário continua valendo dentro da função.
-- ============================================================
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
as $$
declare
  v_log public.session_logs;
  v_row public.set_logs;
begin
  -- GUARDA (F2/F6): a série só pode ser gravada numa execução ABERTA e DO PRÓPRIO
  -- usuário. O `for update` trava a linha do log e SERIALIZA contra finish_session
  -- concorrente — fecha o TOCTOU entre "conferir aberto" e "inserir a série": se o
  -- finish vencer a corrida, relemos aqui finished_at preenchido e recusamos. A RLS
  -- esconde log alheio → vira 'not found' (sem vazar existência).
  select * into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid()
   for update;

  if not found then
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'no_data_found';
  end if;

  if v_log.finished_at is not null then
    raise exception 'session_log % já finalizado; não aceita novas séries', p_session_log_id
      using errcode = 'check_violation';
  end if;

  -- UPSERT com PREDICADO explícito (F1): `WHERE planned_set_id IS NOT NULL` casa o
  -- índice único PARCIAL da 0003 (o que o .upsert do PostgREST não consegue fazer).
  -- completed_at = now() também no UPDATE evita linha híbrida (F5). adaptation fica
  -- nulo (Fase 5).
  insert into public.set_logs (
    session_log_id, planned_set_id, actual_reps, actual_load_kg, actual_rir, outcome, completed_at
  )
  values (
    p_session_log_id, p_planned_set_id, p_actual_reps, p_actual_load_kg, p_actual_rir, p_outcome, now()
  )
  on conflict (session_log_id, planned_set_id) where planned_set_id is not null
  do update set
    actual_reps    = excluded.actual_reps,
    actual_load_kg = excluded.actual_load_kg,
    actual_rir     = excluded.actual_rir,
    outcome        = excluded.outcome,
    completed_at   = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 2. finish_session — atômica e IDEMPOTENTE (F4/F6)
--    (create or replace: substitui a versão da 0003, que levantava em 0 linhas mesmo
--     quando o log já estava finalizado pelo próprio usuário — deixava o cliente preso
--     em erro ao concluir duas vezes.) `for update` serializa dois finish concorrentes.
-- ============================================================
create or replace function public.finish_session(p_session_log_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_log public.session_logs;
begin
  select * into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid()
   for update;

  if not found then
    -- inexistente OU alheio (a RLS esconde o alheio) → erro. Não vaza existência.
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'no_data_found';
  end if;

  if v_log.finished_at is not null then
    return; -- já estava finalizada (dela) → idempotente (F4)
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

grant execute on function public.save_set_log(uuid, uuid, int, numeric, int, text) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;

-- ============================================================
-- PÓS-CHECKS COM PROVA (rodar MANUALMENTE contra HML após aplicar).
-- É TRANSACIONAL e faz ROLLBACK — não deixa resíduo. Prova, na ordem do review:
--   (i)   save_set_log é idempotente (2 chamadas idênticas = 1 linha);
--   (ii)  finish_session é idempotente (2ª chamada = sucesso, sem erro);
--   (iii) save_set_log RECUSA gravar em log finalizado;
--   (iv)  finish_session RECUSA log alheio/inexistente.
-- Copie o bloco abaixo (sem os '--') para o SQL editor e rode:
-- ------------------------------------------------------------
-- begin;
-- do $proof$
-- declare
--   v_owner uuid; v_plan uuid; v_sess uuid; v_ex uuid; v_set uuid;
--   v_log public.session_logs; v_setlog public.set_logs; v_count int;
-- begin
--   -- pega um usuário real (dono) ANTES de baixar o privilégio para authenticated
--   select id into v_owner from auth.users order by created_at limit 1;
--   if v_owner is null then raise exception 'sem usuário para o teste'; end if;
--
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
--   perform set_config('role', 'authenticated', true);  -- RLS ativa como o dono
--
--   -- fixtures mínimas (como o dono)
--   insert into public.training_plans (user_id, name) values (v_owner, 'PROOF') returning id into v_plan;
--   insert into public.planned_sessions (plan_id, user_id, week_number, title)
--     values (v_plan, v_owner, 1, 'PROOF') returning id into v_sess;
--   insert into public.planned_exercises (session_id, exercise_order, name)
--     values (v_sess, 1, 'PROOF') returning id into v_ex;
--   insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max)
--     values (v_ex, 1, 8, 10) returning id into v_set;
--
--   v_log := public.start_session(v_sess);
--
--   -- (i) idempotência do save: 2 chamadas idênticas → 1 linha
--   v_setlog := public.save_set_log(v_log.id, v_set, 8, 40, 2, 'on_target');
--   v_setlog := public.save_set_log(v_log.id, v_set, 8, 40, 2, 'on_target');
--   select count(*) into v_count from public.set_logs where session_log_id = v_log.id and planned_set_id = v_set;
--   if v_count <> 1 then raise exception 'FALHOU (i): esperava 1 set_log, veio %', v_count; end if;
--   raise notice 'OK (i): save_set_log idempotente (1 linha)';
--
--   -- (ii) idempotência do finish: 2 chamadas → sucesso nas duas
--   perform public.finish_session(v_log.id);
--   perform public.finish_session(v_log.id);
--   raise notice 'OK (ii): finish_session idempotente (2a chamada sem erro)';
--
--   -- (iii) save em log FINALIZADO → erro
--   begin
--     v_setlog := public.save_set_log(v_log.id, v_set, 9, 42.5, 1, 'on_target');
--     raise exception 'FALHOU (iii): save deveria recusar log finalizado';
--   exception when others then
--     if SQLERRM like 'FALHOU%' then raise; end if;
--     raise notice 'OK (iii): save recusou log finalizado (%)', SQLERRM;
--   end;
--
--   -- (iv) finish de log ALHEIO/inexistente → erro (vira outro usuário)
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
--   begin
--     perform public.finish_session(v_log.id);
--     raise exception 'FALHOU (iv): finish deveria recusar log alheio';
--   exception when others then
--     if SQLERRM like 'FALHOU%' then raise; end if;
--     raise notice 'OK (iv): finish recusou log alheio/inexistente (%)', SQLERRM;
--   end;
--
--   raise notice 'PROVA COMPLETA ✅';
-- end
-- $proof$;
-- rollback;
-- ------------------------------------------------------------

-- ============================================================
-- OPCIONAL (defesa a mais — NÃO aplicada aqui de propósito): endurecer o WITH CHECK de
-- set_logs para exigir que o planned_set pertença à MESMA planned_session do log (não
-- só ao mesmo usuário). É uma mudança de POLÍTICA DE SEGURANÇA e sai do escopo desta
-- correção (o app já monta os IDs da mesma sessão), então fica como decisão explícita
-- do dono. Para habilitar, descomente e aplique separadamente:
-- ------------------------------------------------------------
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
-- ------------------------------------------------------------
