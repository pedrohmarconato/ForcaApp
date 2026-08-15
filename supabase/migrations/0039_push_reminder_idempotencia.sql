-- ============================================================
-- 0039 — push_reminder_idempotencia: chave de idempotência do lembrete
-- diário de treino (PUSH-02, Fase 13, Plano 13-02).
-- ============================================================
-- planned_sessions.reminder_sent_at é a ÚNICA defesa contra duplicar o
-- lembrete de treino num restart do processo Flask no meio do dia:
-- push_reminder_scheduler.py (thread única, mesmo padrão MVP de
-- job_manager.py) consulta candidatos com `reminder_sent_at is.null` e marca
-- o campo IMEDIATAMENTE após processar cada sessão (sucesso, falha parcial
-- ou zero subscriptions) — um segundo tick sobre a MESMA sessão no MESMO dia
-- nunca a reencontra como candidata, mesmo que o processo tenha reiniciado
-- entre as duas chamadas (a chave é persistida no Postgres, nunca em
-- memória).
--
-- Sem mudança de RLS/GRANT nesta migration: a leitura/escrita deste campo é
-- feita SOMENTE por push_reminder_scheduler.py, usando
-- SUPABASE_SERVICE_ROLE_KEY (bypassa RLS por design — é o único processo do
-- sistema sem usuário logado por trás, cenário para o qual o service role
-- existe). Nenhuma rota HTTP alcançável pelo cliente usa essa chave
-- (T-13-06, verificado por grep em backend/app.py).
--
-- Aplicação: SOMENTE staging (mjdjtiujhwklchalquhc) nesta task — produção é
-- checkpoint do dono (Plano 13-04), mesmo protocolo de md5 staging×prod já
-- usado desde a fase 7 do v1.1 (conferir supabase/.temp/project-ref antes de
-- qualquer comando linkado).

alter table public.planned_sessions
  add column if not exists reminder_sent_at timestamptz;

comment on column public.planned_sessions.reminder_sent_at is
  'Chave de idempotência do lembrete diário de treino (PUSH-02). NULL =
   ainda não enviado (ou tentado). O scheduler (push_reminder_scheduler.py)
   nunca reenvia uma sessão já marcada, mesmo depois de um restart do
   processo -- a query de candidatos filtra reminder_sent_at is null.';

-- Índice PARCIAL: acelera a query diária do scheduler
-- (scheduled_date = hoje AND status = pending AND reminder_sent_at is null)
-- sem indexar linhas já processadas ou fora do fluxo de lembrete.
create index if not exists planned_sessions_reminder_pending_idx
  on public.planned_sessions (scheduled_date)
  where status = 'pending' and reminder_sent_at is null;

-- ============================================================
-- Asserção: confirma que a coluna e o índice parcial existem.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'planned_sessions'
       and column_name = 'reminder_sent_at'
  ) then
    raise exception 'asserção falhou: coluna reminder_sent_at ausente em planned_sessions';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'planned_sessions'
       and indexname = 'planned_sessions_reminder_pending_idx'
  ) then
    raise exception 'asserção falhou: índice parcial planned_sessions_reminder_pending_idx ausente';
  end if;
end;
$$;
