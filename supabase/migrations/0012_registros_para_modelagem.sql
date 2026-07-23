-- 0012_registros_para_modelagem.sql
-- Fecha 3 lacunas de captura para as modelagens futuras do dono (decisão 23/07/2026):
--   1. Proposta ↔ escolha do motor  → set_logs.adaptation_decision (envelope de telemetria)
--   2. Tempo real por série          → set_logs.started_at (quando a série foi ativada)
--   3. Histórico do questionário     → questionario_historico (append-only por trigger)
--
-- TUDO retrocompatível: colunas novas são nullable; a RPC ganha params com
-- default null (chamadas antigas seguem válidas); a coluna `adaptation` NÃO muda
-- (a retomada depende dela — o envelope de modelagem vive numa coluna separada).
-- Aplicar em staging (mjdjtiujhwklchalquhc) e só depois em prod, sempre via db push.

-- ============================================================
-- Lacuna 1 + 2: colunas em set_logs
-- ============================================================
alter table public.set_logs
  add column if not exists started_at timestamptz;

alter table public.set_logs
  -- Telemetria da decisão de adaptação: recomendado + opções + escolhido +
  -- resposta ('accepted' | 'diverged' | 'declined' | 'auto'). Separada de
  -- `adaptation` (que segue guardando só o Adjustment escolhido, usado no replay).
  add column if not exists adaptation_decision jsonb;

comment on column public.set_logs.started_at is
  'Momento em que o aluno ativou a série (início da execução). Null em séries anteriores à 0012.';
comment on column public.set_logs.adaptation_decision is
  'Envelope de telemetria: {outcome,tier,deviationReps,recommended,options,chosen,response}. Para modelagem de adesão às sugestões do motor.';

-- save_set_log ganha p_started_at (default null → chamadas antigas seguem válidas).
-- DROP + recreate porque a assinatura muda; mantém security invoker + RLS.
drop function if exists public.save_set_log(uuid, uuid, int, numeric, int, text);

create or replace function public.save_set_log(
  p_session_log_id uuid,
  p_planned_set_id uuid,
  p_actual_reps    int,
  p_actual_load_kg numeric,
  p_actual_rir     int,
  p_outcome        text,
  p_started_at     timestamptz default null
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
    session_log_id, planned_set_id, actual_reps, actual_load_kg,
    actual_rir, outcome, started_at, completed_at
  )
  values (
    p_session_log_id, p_planned_set_id, p_actual_reps, p_actual_load_kg,
    p_actual_rir, p_outcome, p_started_at, now()
  )
  on conflict (session_log_id, planned_set_id)
    where planned_set_id is not null
  do update set
    actual_reps = excluded.actual_reps,
    actual_load_kg = excluded.actual_load_kg,
    actual_rir = excluded.actual_rir,
    outcome = excluded.outcome,
    -- started_at só é definido na 1ª gravação; regravar a mesma série (retomada)
    -- NÃO sobrescreve o início real com um valor mais tarde.
    started_at = coalesce(public.set_logs.started_at, excluded.started_at),
    completed_at = excluded.completed_at
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz) from public;
grant execute on function public.save_set_log(uuid, uuid, int, numeric, int, text, timestamptz) to authenticated;

-- ============================================================
-- Lacuna 3: histórico append-only do questionário
-- ============================================================
create table if not exists public.questionario_historico (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  data_nascimento date,
  genero text,
  peso_kg numeric,
  altura_cm integer,
  experiencia_treino text,
  objetivo text,
  tem_lesoes boolean,
  lesoes_detalhes text,
  dias_treino text[],
  inclui_cardio boolean,
  inclui_alongamento boolean,
  tempo_medio_treino_min integer,
  registrado_em timestamptz not null default now()
);

create index if not exists questionario_historico_usuario_idx
  on public.questionario_historico (usuario_id, registrado_em desc);

alter table public.questionario_historico enable row level security;

-- Só o dono lê o próprio histórico. INSERT é feito pelo trigger (SECURITY
-- DEFINER), não pelo cliente — não há policy de insert de propósito.
drop policy if exists "questionario_historico select own" on public.questionario_historico;
create policy "questionario_historico select own"
  on public.questionario_historico
  for select
  using (auth.uid() = usuario_id);

-- Cada INSERT/UPDATE em questionario_usuario deposita um snapshot imutável.
-- SECURITY DEFINER para escrever na tabela de histórico sem policy de insert;
-- search_path fixo (hardening) e grava sempre o usuario_id da linha (não confia
-- em parâmetro).
create or replace function public.snapshot_questionario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.questionario_historico (
    usuario_id, data_nascimento, genero, peso_kg, altura_cm,
    experiencia_treino, objetivo, tem_lesoes, lesoes_detalhes,
    dias_treino, inclui_cardio, inclui_alongamento, tempo_medio_treino_min
  )
  values (
    new.usuario_id, new.data_nascimento, new.genero, new.peso_kg, new.altura_cm,
    new.experiencia_treino, new.objetivo, new.tem_lesoes, new.lesoes_detalhes,
    new.dias_treino, new.inclui_cardio, new.inclui_alongamento, new.tempo_medio_treino_min
  );
  return new;
end;
$$;

drop trigger if exists trg_snapshot_questionario on public.questionario_usuario;
create trigger trg_snapshot_questionario
  after insert or update on public.questionario_usuario
  for each row execute function public.snapshot_questionario();

revoke all on function public.snapshot_questionario() from public;
