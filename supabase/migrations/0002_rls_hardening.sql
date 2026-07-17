-- Fase 3 — Correções do review adversarial do PR #4 (achados #2 e #3).
-- A migration 0001 já está APLICADA no projeto; esta ajusta por cima.
--
-- Achado #2: as policies de escrita permitiam relações entre usuários
-- diferentes (ex.: inserir planned_sessions apontando para o plan_id de outro
-- usuário — a FK não protege: verificação referencial ignora RLS). O WITH CHECK
-- agora valida a POSSE DO PAI em toda tabela que referencia outra.
--
-- Achado #3: nada impedia dois planos ativos por usuário (retry/duplo toque),
-- e a Home misturava sessões dos dois. O índice único parcial garante no banco
-- o que o backend já passa a fazer (arquivar o anterior antes de inserir).

-- ============================================================
-- 1. planned_sessions: só se o plano referenciado é MEU
-- ============================================================
drop policy "own sessions" on public.planned_sessions;
create policy "own sessions" on public.planned_sessions
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.training_plans p
      where p.id = plan_id and p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. session_logs: só se a sessão planejada referenciada é MINHA
-- ============================================================
drop policy "own session logs" on public.session_logs;
create policy "own session logs" on public.session_logs
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.planned_sessions s
      where s.id = planned_session_id and s.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. set_logs: o planned_set referenciado (quando houver) também é MEU
-- ============================================================
drop policy "own set logs" on public.set_logs;
create policy "own set logs" on public.set_logs
  for all
  using (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
    and (
      planned_set_id is null
      or exists (
        select 1
        from public.planned_sets ps
        join public.planned_exercises e on e.id = ps.exercise_id
        join public.planned_sessions s on s.id = e.session_id
        where ps.id = planned_set_id and s.user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 4. Um único plano ATIVO por usuário (defesa no banco)
-- ============================================================
create unique index if not exists training_plans_one_active_per_user_idx
  on public.training_plans (user_id)
  where (status = 'active');
