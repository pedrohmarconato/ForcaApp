-- ============================================================
-- 0036 — recusa troca de modalidade quando já existe série gravada
-- (G-03-5-servidor, 03-UAT.md teste 5, `server_gap`)
-- ============================================================
-- PROPOSTA (OD-01, decisão do dono após 03-UAT.md). NÃO foi aplicada a banco
-- nenhum; aplicação é decisão explícita do dono, via preflight staging → prod
-- (mesmo padrão de checkpoint da migration 0034, Plano 03-01).
--
-- Achado: comprovado por comportamento contra a RPC real (03-UAT.md teste 5)
-- que, com um `set_log` `on_target` (1500 s, 4200 m) já gravado para o
-- exercício de cardio, uma chamada DIRETA a `swap_session_exercise` foi
-- ACEITA e persistiu em `cardio_exercise_swaps` — `pg_get_functiondef` da
-- função instalada não menciona `set_logs`. A guarda CR-01
-- (`activeSessionStore.ts:1513-1521`, `alvo.sets.some(s => s.status ===
-- 'done')`) existe SÓ no cliente: um dispositivo sem essa guarda, uma
-- chamada direta à API, ou uma corrida entre dois dispositivos grava a troca
-- mesmo assim, e a série já executada como a modalidade original passa a ser
-- exibida sob a nova.
--
-- Decisão: promover a guarda para o servidor como defesa em profundidade,
-- SEM remover o guard client-side — o guard de CR-01 continua a primeira
-- linha de defesa; esta migration é a SEGUNDA linha, no servidor.
--
-- 0034 e 0035 JÁ estão vivas em staging (`forcaapp-staging`, ref
-- `mjdjtiujhwklchalquhc`) e produção (`forcaapp-prod`, ref
-- `zanqygwsgxkyjiuhrzju`) desde 2026-08-10 (AGENTS.md, commit `f69f45f`) —
-- esta é uma migration de FOLLOW-UP sobre uma função já em produção, `create
-- or replace` com a MESMA assinatura, nunca um `drop function`.
--
-- Esta migration NÃO aplica nenhum comando `supabase` (db push/migration
-- up/link) — a aplicação a staging/produção é decisão explícita do dono,
-- gated pelo checkpoint da Task 2 deste plano (03-08).
--
-- Errcodes que o app trata (mesmos já documentados em
-- sessionExecutionRepository.ts, migrations 0020/0034/0035): 42501
-- autenticação/posse ausente · 22023 modalidade/nota/métrica inválida ·
-- P0001 log já finalizado · P0002 log inexistente ou alheio · P0005 NOVO —
-- série já registrada para o exercício alvo, troca recusada. P0005 é um
-- código novo e distinto (não reutiliza P0001/P0002, que já têm outro
-- significado no app, nem P0003/P0004, que são nomes reservados de condição
-- do PL/pgSQL) para que o cliente possa, no futuro, distinguir esta recusa
-- das demais por `error.code === 'P0005'` caso decida tratá-la de forma
-- específica — hoje `errMsg`/`SessionExecutionRequestError.code`, em
-- `sessionExecutionRepository.ts`, já propaga o texto e o código sem
-- necessidade de nenhuma mudança de cliente para esta plan.

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

  -- Guarda de cardio, idêntica ao gate do cliente (isTimeBased): SÓ metric
  -- decide (WR-03, migration 0035). A alternativa muscle_group='Cardio' da
  -- 0034 foi removida — linha com muscle_group='Cardio' e metric='carga_reps'
  -- não recebe troca, porque o botão nunca existiu para ela.
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

  -- Guarda NOVA desta migration (G-03-5-servidor): recusa a troca no PRÓPRIO
  -- SERVIDOR quando já existe um set_log gravado para o planned_exercise_id
  -- alvo nesta sessão. set_logs não tem FK direta para planned_exercises —
  -- o join passa por planned_sets.exercise_id (0001_modelo_treino.sql:89-129).
  -- Defesa em profundidade: o guard client-side de CR-01
  -- (activeSessionStore.ts:1518-1521) continua a primeira linha, esta é a
  -- segunda, no servidor — nenhuma das duas substitui a outra.
  if exists (
    select 1
      from public.set_logs sl
      join public.planned_sets ps on ps.id = sl.planned_set_id
     where sl.session_log_id = p_session_log_id
       and ps.exercise_id = p_planned_exercise_id
  ) then
    raise exception 'exercício % já tem série registrada nesta sessão; troca de modalidade recusada',
      p_planned_exercise_id
      using errcode = 'P0005';
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
-- Grants — mesmo padrão da 0034/0035 (revoke de public E de anon, lição da 0019)
-- ============================================================
revoke all on function public.swap_session_exercise(uuid, uuid, text, text) from public, anon;
grant execute on function public.swap_session_exercise(uuid, uuid, text, text) to authenticated;

-- ============================================================
-- Asserção: a guarda de métrica de 0035 continua presente, e a guarda nova
-- de set_logs/P0005 desta migration está de fato instalada
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
  if v_def not like '%from public.set_logs sl%' then
    raise exception 'asserção falhou: guarda nova de set_logs ausente';
  end if;
  if v_def not like '%errcode = ''P0005''%' then
    raise exception 'asserção falhou: errcode P0005 da guarda nova ausente';
  end if;
end;
$$;
