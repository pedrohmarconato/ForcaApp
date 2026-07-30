-- Recusa declarada: "não vou fazer este exercício" e "não vou treinar hoje".
--
-- O que não existia: o aluno não tinha como dizer que não ia fazer algo. As
-- únicas vias eram indiretas e nenhuma era uma decisão dele:
--   1. declarar menos tempo no check-in e deixar a escada de corte (Fase 6)
--      escolher o que sai — "tenho menos tempo", não "não quero isto";
--   2. deixar a data passar e esperar o replanejador semanal marcar a sessão
--      como 'skipped' — sem motivo, sem momento, sem autoria.
-- Resultado: recusa por dor, por não gostar do exercício ou por falta de
-- equipamento chegava ao banco indistinguível de esquecimento.
--
-- O que muda:
--   1. `planned_sessions` passa a registrar MOTIVO, MOMENTO e AUTORIA da recusa
--      (skip_source 'user' | 'replan'), com coerência garantida por constraint:
--      motivo só existe em sessão 'skipped'.
--   2. `exercise_skips` (nova): a recusa de um exercício DENTRO de uma execução.
--      Escopo é o session_log, não o plano — recusar hoje não apaga o exercício
--      das próximas semanas.
--   3. Quatro RPCs atômicas (recusar/desfazer × exercício/sessão) com o
--      vocabulário fechado de motivos validado no servidor.
--
-- Vocabulário de motivos (fechado): sem_tempo, dor_ou_lesao, sem_equipamento,
-- nao_gosto, cansaco, outro. É fechado porque este dado precisa ser AGREGÁVEL
-- (recusou o mesmo exercício 3×) e alimentar decisão — texto livre não agrega.
-- A nota é opcional e complementa, nunca substitui o motivo.
--
-- SECURITY INVOKER em todas: a RLS de 0001/0002 continua valendo dentro.
--
-- Errcodes que o app trata (sessionExecutionRepository / planEditRepository):
--   42501 log/sessão/exercício inexistente ou alheio · 22023 motivo ou nota
--   inválidos · P0001 log já finalizado · 55000 status não permite a operação.

-- ============================================================
-- 0. Vocabulário de motivos — uma definição, usada em 3 lugares
-- ============================================================
-- Function em vez de enum/domain: um enum novo exigiria ALTER TYPE para
-- evoluir o vocabulário (e não é transacional em toda versão do Postgres),
-- enquanto a lista aqui é lida pelas constraints e pelas RPCs no mesmo lugar.
create or replace function public._forca_motivo_recusa_valido(p_motivo text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_motivo in (
    'sem_tempo',
    'dor_ou_lesao',
    'sem_equipamento',
    'nao_gosto',
    'cansaco',
    'outro'
  );
$$;

comment on function public._forca_motivo_recusa_valido(text) is
  'Vocabulário fechado dos motivos de recusa. Fonte única das constraints e das RPCs de recusa.';

-- ============================================================
-- 1. Motivo, momento e autoria da recusa na sessão planejada
-- ============================================================
alter table public.planned_sessions
  add column if not exists skip_reason text,
  add column if not exists skip_note   text,
  add column if not exists skipped_at  timestamptz,
  add column if not exists skip_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'planned_sessions_skip_reason_check'
  ) then
    alter table public.planned_sessions
      add constraint planned_sessions_skip_reason_check
      check (skip_reason is null or public._forca_motivo_recusa_valido(skip_reason));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'planned_sessions_skip_source_check'
  ) then
    alter table public.planned_sessions
      add constraint planned_sessions_skip_source_check
      check (skip_source is null or skip_source in ('user', 'replan'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'planned_sessions_skip_note_len'
  ) then
    alter table public.planned_sessions
      add constraint planned_sessions_skip_note_len
      check (skip_note is null or char_length(skip_note) <= 280);
  end if;

  -- Coerência: dado de recusa só existe em sessão recusada. Sem isto, desfazer
  -- a recusa poderia deixar motivo órfão numa sessão 'pending' e a tela diria
  -- "você recusou por dor" num treino que está de pé.
  if not exists (
    select 1 from pg_constraint where conname = 'planned_sessions_skip_coerente'
  ) then
    alter table public.planned_sessions
      add constraint planned_sessions_skip_coerente
      check (
        status = 'skipped'
        or (skip_reason is null and skip_note is null
            and skipped_at is null and skip_source is null)
      );
  end if;
end
$$;

comment on column public.planned_sessions.skip_reason is
  'Motivo da recusa (vocabulário fechado). Null em sessão pulada pelo replanejador antes da 0020.';
comment on column public.planned_sessions.skip_note is
  'Complemento livre do aluno, até 280 caracteres. Nunca substitui o motivo.';
comment on column public.planned_sessions.skipped_at is
  'Quando a sessão foi recusada. Distingue recusa declarada de status herdado.';
comment on column public.planned_sessions.skip_source is
  'Quem recusou: user (o aluno declarou) | replan (o replanejador marcou a perdida).';

-- ============================================================
-- 2. Recusa de exercício dentro de uma execução
-- ============================================================
create table if not exists public.exercise_skips (
  id uuid primary key default gen_random_uuid(),
  session_log_id      uuid not null references public.session_logs (id) on delete cascade,
  planned_exercise_id uuid not null references public.planned_exercises (id) on delete cascade,
  reason text not null,
  note   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma recusa por exercício por execução. Trocar de ideia sobre o MOTIVO
  -- atualiza a linha (a RPC faz on conflict), não empilha registros.
  unique (session_log_id, planned_exercise_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercise_skips_reason_check'
  ) then
    alter table public.exercise_skips
      add constraint exercise_skips_reason_check
      check (public._forca_motivo_recusa_valido(reason));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'exercise_skips_note_len'
  ) then
    alter table public.exercise_skips
      add constraint exercise_skips_note_len
      check (note is null or char_length(note) <= 280);
  end if;
end
$$;

-- Consulta "quantas vezes este exercício foi recusado" (base do follow-up de
-- sugerir substituição). O unique já indexa (session_log_id, ...) pelo prefixo.
create index if not exists exercise_skips_exercise_idx
  on public.exercise_skips (planned_exercise_id, created_at desc);

comment on table public.exercise_skips is
  'Recusa declarada de um exercício DENTRO de uma execução (escopo session_log, não o plano).';

alter table public.exercise_skips enable row level security;

-- Posse herdada do session_log, mesmo padrão de set_logs (0001).
drop policy if exists "own exercise skips" on public.exercise_skips;
create policy "own exercise skips" on public.exercise_skips
  for all using (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. RPCs — recusar e desfazer
-- ============================================================

/*
 * Recusa um exercício da execução em aberto. As séries já registradas dele
 * permanecem (histórico não se reescreve); as pendentes deixam de ser exigidas
 * para concluir o treino — quem aplica isso é o app (sessionProgress).
 */
create or replace function public.skip_session_exercise(
  p_session_log_id      uuid,
  p_planned_exercise_id uuid,
  p_reason              text,
  p_note                text default null
)
returns public.exercise_skips
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
  v_row public.exercise_skips;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_planned_exercise_id is null then
    raise exception 'exercício não pode ser nulo' using errcode = '22004';
  end if;
  if p_reason is null or not public._forca_motivo_recusa_valido(p_reason) then
    raise exception 'motivo de recusa inválido: %', coalesce(p_reason, '<null>')
      using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'nota da recusa excede 280 caracteres' using errcode = '22023';
  end if;

  select * into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'P0002';
  end if;
  if v_log.finished_at is not null then
    raise exception 'session_log % já finalizado; não aceita recusa', p_session_log_id
      using errcode = 'P0001';
  end if;

  -- O exercício tem de pertencer à sessão planejada DESTE log (mesma guarda de
  -- save_set_log): sem isto, um id alheio entraria via RLS do log próprio.
  if not exists (
    select 1
      from public.planned_exercises pe
     where pe.id = p_planned_exercise_id
       and pe.session_id = v_log.planned_session_id
  ) then
    raise exception 'exercício % não pertence à sessão do log %',
      p_planned_exercise_id, p_session_log_id
      using errcode = '42501';
  end if;

  insert into public.exercise_skips (
    session_log_id, planned_exercise_id, reason, note
  )
  values (
    p_session_log_id, p_planned_exercise_id, p_reason, v_note
  )
  on conflict (session_log_id, planned_exercise_id)
  -- Trocar o motivo é legítimo (o aluno reabre o sheet e corrige). created_at
  -- preserva a PRIMEIRA recusa; updated_at marca a correção.
  do update set reason = excluded.reason,
                note = excluded.note,
                updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

/* Desfaz a recusa de um exercício. Idempotente: sem recusa, devolve false. */
create or replace function public.unskip_session_exercise(
  p_session_log_id      uuid,
  p_planned_exercise_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
  v_apagou int;
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'P0002';
  end if;
  if v_log.finished_at is not null then
    raise exception 'session_log % já finalizado; recusa não muda mais', p_session_log_id
      using errcode = 'P0001';
  end if;

  delete from public.exercise_skips
   where session_log_id = p_session_log_id
     and planned_exercise_id = p_planned_exercise_id;
  get diagnostics v_apagou = row_count;

  return v_apagou > 0;
end;
$$;

/*
 * Recusa a sessão inteira ("não vou treinar hoje"), com motivo.
 *
 * Fecha a execução em aberto desta sessão, se houver: sem isso a sessão ficaria
 * 'skipped' com session_log aberto, e um start_session posterior reaproveitaria
 * aquele log (0004/0005 são idempotentes por log aberto) — o aluno voltaria
 * para dentro de um treino que ele declarou que não faria.
 *
 * O volume desta sessão NÃO é redistribuído: a redistribuição da Fase 6 age
 * sobre sessões perdidas por decurso de data. Recusa declarada é perda
 * registrada, não compensada em silêncio.
 */
create or replace function public.skip_planned_session(
  p_planned_session_id uuid,
  p_reason             text,
  p_note               text default null
)
returns public.planned_sessions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sessao public.planned_sessions;
  v_row    public.planned_sessions;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_reason is null or not public._forca_motivo_recusa_valido(p_reason) then
    raise exception 'motivo de recusa inválido: %', coalesce(p_reason, '<null>')
      using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'nota da recusa excede 280 caracteres' using errcode = '22023';
  end if;

  select * into v_sessao
    from public.planned_sessions
   where id = p_planned_session_id
     and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'sessão % inexistente ou alheia', p_planned_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status = 'completed' then
    raise exception 'sessão concluída não pode ser recusada' using errcode = '55000';
  end if;

  update public.session_logs
     set finished_at = now()
   where planned_session_id = p_planned_session_id
     and user_id = auth.uid()
     and finished_at is null;

  update public.planned_sessions
     set status      = 'skipped',
         skip_reason = p_reason,
         skip_note   = v_note,
         skipped_at  = now(),
         skip_source = 'user'
   where id = p_planned_session_id
  returning * into v_row;

  return v_row;
end;
$$;

/*
 * Desfaz a recusa da sessão ("me arrependi"): volta para 'pending' e limpa o
 * registro. Só desfaz o que o ALUNO recusou — sessão marcada pelo replanejador
 * é consequência de data vencida e voltar a 'pending' a reagendaria no passado.
 *
 * O session_log fechado pela recusa não é reaberto: um log sem série é
 * inofensivo e reabri-lo reescreveria finished_at do servidor.
 */
create or replace function public.unskip_planned_session(
  p_planned_session_id uuid
)
returns public.planned_sessions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sessao public.planned_sessions;
  v_row    public.planned_sessions;
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao
    from public.planned_sessions
   where id = p_planned_session_id
     and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'sessão % inexistente ou alheia', p_planned_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status <> 'skipped' then
    raise exception 'sessão % não está recusada', v_sessao.status using errcode = '55000';
  end if;
  if coalesce(v_sessao.skip_source, 'replan') <> 'user' then
    raise exception 'recusa do replanejamento não é desfeita por aqui'
      using errcode = '55000';
  end if;

  update public.planned_sessions
     set status      = 'pending',
         skip_reason = null,
         skip_note   = null,
         skipped_at  = null,
         skip_source = null
   where id = p_planned_session_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 4. Grants — revoke de public E de anon (aprendizado da 0019)
-- ============================================================
-- Os default privileges do Supabase concedem EXECUTE a anon/authenticated na
-- criação de QUALQUER função: `revoke from public` não corta anon.
revoke all on function public._forca_motivo_recusa_valido(text) from public, anon;
revoke all on function public.skip_session_exercise(uuid, uuid, text, text) from public, anon;
revoke all on function public.unskip_session_exercise(uuid, uuid) from public, anon;
revoke all on function public.skip_planned_session(uuid, text, text) from public, anon;
revoke all on function public.unskip_planned_session(uuid) from public, anon;

grant execute on function public._forca_motivo_recusa_valido(text) to authenticated;
grant execute on function public.skip_session_exercise(uuid, uuid, text, text) to authenticated;
grant execute on function public.unskip_session_exercise(uuid, uuid) to authenticated;
grant execute on function public.skip_planned_session(uuid, text, text) to authenticated;
grant execute on function public.unskip_planned_session(uuid) to authenticated;

-- ============================================================
-- Asserções: o que esta migration promete existe de fato
-- ============================================================
do $$
declare
  v_col  text;
  v_fn   text;
begin
  foreach v_col in array array['skip_reason', 'skip_note', 'skipped_at', 'skip_source'] loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'planned_sessions'
         and column_name = v_col
    ) then
      raise exception 'asserção falhou: planned_sessions.% não existe', v_col;
    end if;
  end loop;

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'exercise_skips'
  ) then
    raise exception 'asserção falhou: exercise_skips não existe';
  end if;

  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'exercise_skips' and rowsecurity
  ) then
    raise exception 'asserção falhou: RLS desligada em exercise_skips';
  end if;

  -- anon sem EXECUTE nas RPCs novas (o furo que a 0019 revelou).
  foreach v_fn in array array[
    'public.skip_session_exercise(uuid, uuid, text, text)',
    'public.unskip_session_exercise(uuid, uuid)',
    'public.skip_planned_session(uuid, text, text)',
    'public.unskip_planned_session(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'asserção falhou: anon ainda executa %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'asserção falhou: authenticated não executa %', v_fn;
    end if;
  end loop;
end
$$;
