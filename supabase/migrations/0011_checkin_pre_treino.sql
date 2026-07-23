-- 0011_checkin_pre_treino.sql
-- Check-in obrigatório antes do treino (decisão do dono, 22/07/2026):
--   1. "Como está se sentindo para treinar?" → session_logs.mood
--   2. "Quanto tempo disponível tem?"        → session_logs.available_minutes (já existia da 0001)
--
-- O mood modula o volume do dia no ENGINE do app (fator de capacidade efetiva
-- alimentando a escada de corte por tempo); o banco só registra a resposta.
--
-- Fluxo de aplicação: staging (mjdjtiujhwklchalquhc) primeiro, prod depois,
-- SEMPRE registrada via `supabase db push` (nunca SQL direto sem registro).

alter table public.session_logs
  add column if not exists mood text
  constraint session_logs_mood_check
  check (mood is null or mood in ('cansado', 'normal', 'com_energia'));

comment on column public.session_logs.mood is
  'Check-in pré-treino: cansado | normal | com_energia. Null em sessões anteriores à 0011.';

-- start_session ganha os dois campos do check-in. DROP em vez de overload:
-- manter start_session(uuid) junto com a nova assinatura criaria ambiguidade
-- no PostgREST para chamadas antigas com um único argumento.
drop function if exists public.start_session(uuid);

create or replace function public.start_session(
  p_planned_session_id uuid,
  p_mood text default null,
  p_available_minutes integer default null
)
returns public.session_logs
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
begin
  if p_mood is not null and p_mood not in ('cansado', 'normal', 'com_energia') then
    raise exception 'mood inválido: %', p_mood using errcode = '22023';
  end if;

  insert into public.session_logs (planned_session_id, user_id, mood, available_minutes)
  values (p_planned_session_id, auth.uid(), p_mood, p_available_minutes)
  on conflict (planned_session_id) where finished_at is null
  do nothing
  returning * into v_log;

  if v_log.id is null then
    -- Retomada: a execução aberta já tem o check-in original — NÃO sobrescrever
    -- (a resposta vale para a sessão inteira, não para cada reabertura do app).
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

revoke all on function public.start_session(uuid, text, integer) from public;
grant execute on function public.start_session(uuid, text, integer) to authenticated;
