-- ============================================================
-- 0035 — estreita a guarda de cardio de swap_session_exercise para só metric
-- ============================================================
-- PROPOSTA (WR-03/IN-02 do review da Fase 3, 03-REVIEW.md). NÃO foi aplicada
-- a banco nenhum; aplicação é decisão do dono, via preflight staging → prod.
--
-- Motivo: a 0034 aceita `muscle_group = 'Cardio'` como sinal alternativo de
-- "é cardio" — mais frouxa que o gate do cliente, que decide exclusivamente
-- por `isTimeBased(metric)` (`src/engine/sessionModel.ts:277`). Duas noções
-- paralelas de "é cardio" (metric no cliente, metric OU muscle_group no
-- servidor) criam o risco de uma linha legada com muscle_group='Cardio' e
-- metric='carga_reps' passar pela RPC sem o botão jamais ter existido na tela.
--
-- Decisão canônica: metric. É o sinal que a UI já trata como autoritativo
-- (isTimeBased/canCompleteSet); muscle_group continua existindo como
-- classificação de grupo muscular, não como definidor de cronometragem.
--
-- A 0034 NÃO foi editada (o dono já a mandou aplicar); esta migration é a
-- correção sobreposta, com a MESMA assinatura — `create or replace` troca só
-- o predicado da guarda.

create or replace function public.swap_session_exercise(
  p_session_log_id      uuid,
  p_planned_exercise_id uuid,
  p_to_modality         text,
  p_note                text default null
)
returns public.cardio_exercise_swaps
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log public.session_logs;
  v_row public.cardio_exercise_swaps;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_planned_exercise_id is null then
    raise exception 'exercício não pode ser nulo' using errcode = '22004';
  end if;
  if p_to_modality is null or not public._forca_modalidade_cardio_valida(p_to_modality) then
    raise exception 'modalidade de troca inválida: %', coalesce(p_to_modality, '<null>')
      using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'nota da troca excede 280 caracteres' using errcode = '22023';
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
    raise exception 'session_log % já finalizado; não aceita troca', p_session_log_id
      using errcode = 'P0001';
  end if;

  -- O exercício tem de pertencer à sessão planejada DESTE log (mesma guarda
  -- de skip_session_exercise, 0020:373-382): sem isto, um id alheio entraria
  -- via RLS do log próprio.
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

  -- Guarda de cardio, agora idêntica ao gate do cliente (isTimeBased):
  -- SÓ metric decide (WR-03). A alternativa muscle_group='Cardio' da 0034 é
  -- removida — linha com muscle_group='Cardio' e metric='carga_reps' não
  -- recebe troca, porque o botão nunca existiu para ela.
  if not exists (
    select 1
      from public.planned_exercises pe
     where pe.id = p_planned_exercise_id
       and pe.metric in ('tempo', 'tempo_distancia')
  ) then
    raise exception 'exercício % não é de cardio; troca de modalidade não se aplica',
      p_planned_exercise_id
      using errcode = '22023';
  end if;

  insert into public.cardio_exercise_swaps (
    session_log_id, planned_exercise_id, to_modality, note
  )
  values (
    p_session_log_id, p_planned_exercise_id, p_to_modality, v_note
  )
  on conflict (session_log_id, planned_exercise_id)
  do update set to_modality = excluded.to_modality,
                note        = excluded.note,
                updated_at  = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- Grants — mesmo padrão da 0034 (revoke de public E de anon, lição da 0019)
-- ============================================================
revoke all on function public.swap_session_exercise(uuid, uuid, text, text) from public, anon;
grant execute on function public.swap_session_exercise(uuid, uuid, text, text) to authenticated;

-- ============================================================
-- Asserção: a guarda de cardio está idêntica ao gate do cliente (metric)
-- ============================================================
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.swap_session_exercise(uuid, uuid, text, text)'::regprocedure)
    into v_def;
  if v_def is null then
    raise exception 'asserção falhou: swap_session_exercise não existe';
  end if;
  if v_def not like '%pe.metric in (''tempo'', ''tempo_distancia'')%' then
    raise exception 'asserção falhou: guarda de cardio por metric ausente';
  end if;
  if v_def like '%muscle_group = ''Cardio''%' then
    raise exception 'asserção falhou: sinal alternativo muscle_group ainda presente';
  end if;
end;
$$;
