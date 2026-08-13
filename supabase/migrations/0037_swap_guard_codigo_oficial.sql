-- ============================================================
-- 0037 — corrige o errcode da guarda de série já registrada para um
-- SQLSTATE oficial (P0005 → 23505)
-- ============================================================
-- FOLLOW-UP de 0036 (OD-01). NÃO foi aplicada a banco nenhum além do stack
-- LOCAL de desenvolvimento; aplicação a staging/produção é decisão explícita
-- do dono, via preflight staging → prod (mesmo padrão de checkpoint das
-- migrations 0034/0035/0036) — 0036 ainda não foi promovida (ver seu próprio
-- header: "aplicação é decisão explícita do dono").
--
-- Achado (D-16 nível 2, plano 04-03, harness
-- `__tests__/integration/sessionOutboxDrain.postgrest.test.ts`, Teste B,
-- diagnosticado contra o Postgres/PostgREST LOCAL real em 2026-08-13):
-- `errcode = 'P0005'` (0036, linha 136) NÃO é um SQLSTATE oficial. A tabela
-- oficial de erros do Postgres (`errcodes.txt`, confirmada na versão 17.6 do
-- container local) só define P0000-P0004 como códigos reservados de PL/pgSQL
-- (raise_exception/no_data_found/too_many_rows/assert_failure) — 'P0005' foi
-- uma escolha DELIBERADA da 0036 (OD-01) para dar ao cliente um código
-- distinto, mas por não ser oficial, o PostgREST 14.5 MASCARA esse SQLSTATE
-- na resposta: devolve um 500 genérico `{"message":"Something went wrong"}`
-- SEM `code`/`details`/`hint`, mesmo com o Postgres tendo processado e
-- logado o `RAISE` corretamente (confirmado por chamada direta à RPC fora da
-- fila — o mesmo código OFICIAL 'P0002', usado nesta mesma função, propaga
-- normalmente `{"code":"P0002",...}`; só o código inventado é mascarado).
-- Efeito em produção, se 0036 fosse promovida como está: o cliente nunca vê
-- `.code === 'P0005'` — a política de allowlist do outbox
-- (`sessionOutboxPolicy.ts`, D-14) nunca classifica a recusa como definitiva,
-- e o item fica REAGENDANDO a troca (já rejeitada e nunca vai ter sucesso)
-- por até 7 dias (D-11) em vez de quarentena imediata.
--
-- Decisão do dono (resume signal deste checkpoint): "0037 com 23505" — trocar
-- 'P0005' por '23505' (unique_violation, classe 23, código OFICIAL da tabela
-- de erros do Postgres — confirmado em errcodes.txt). Segue o precedente já
-- em uso neste projeto: migrations 0010 (progression_rules.sql:135) e 0015
-- (progression_rules_na_rpc.sql:137) já usam `errcode = '23505'` para o mesmo
-- padrão semântico (conflito de unicidade tratado explicitamente pela RPC, em
-- vez de propagar a exceção nativa do índice). '23505' é semanticamente
-- adequado aqui: a troca colide com uma série JÁ existente para o mesmo
-- exercício — é, na essência, um conflito de unicidade de negócio (mesmo sem
-- vir de um índice único diretamente sobre essa condição).
--
-- Genuíno 23505 do índice físico? NÃO pode ocorrer a partir do INSERT desta
-- própria função: o único índice UNIQUE de `cardio_exercise_swaps` é
-- `(session_log_id, planned_exercise_id)` (migration 0034), e o INSERT desta
-- função já usa `on conflict (session_log_id, planned_exercise_id) do update`
-- — cobre exatamente essa chave, então o Postgres nunca chega a levantar um
-- 23505 nativo a partir deste INSERT (o ON CONFLICT resolve a colisão antes
-- de qualquer exceção). Se um dia esse comportamento mudasse (ex.: um índice
-- único NOVO fosse adicionado a `cardio_exercise_swaps` sem cobertura por um
-- ON CONFLICT correspondente) e um 23505 GENUÍNO do índice físico chegasse a
-- ser levantado por outro caminho, o cliente trataria da mesma forma — como
-- recusa definitiva (quarentena imediata) — o que é o comportamento CORRETO
-- também para esse caso: um conflito de unicidade real sobre a troca É, por
-- definição, uma recusa definitiva, nunca um erro transitório de rede.
--
-- 0036 NÃO foi editada (fica como está, histórico do achado) — esta é uma
-- migration de FOLLOW-UP, `create or replace` com a MESMA assinatura, nunca
-- um `drop function`, mesmo padrão da própria 0034→0035→0036.
--
-- Errcodes que o app trata (mesmos já documentados em
-- sessionExecutionRepository.ts, migrations 0020/0034/0035/0036): 42501
-- autenticação/posse ausente · 22023 modalidade/nota/métrica inválida ·
-- P0001 log já finalizado · P0002 log inexistente ou alheio · 23505
-- (substitui o inventado P0005 da 0036) série já registrada para o exercício
-- alvo, troca recusada.

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

  -- Guarda de G-03-5-servidor (herdada de 0036): recusa a troca no PRÓPRIO
  -- SERVIDOR quando já existe um set_log gravado para o planned_exercise_id
  -- alvo nesta sessão. set_logs não tem FK direta para planned_exercises —
  -- o join passa por planned_sets.exercise_id (0001_modelo_treino.sql:89-129).
  -- Defesa em profundidade: o guard client-side de CR-01
  -- (activeSessionStore.ts:1518-1521) continua a primeira linha, esta é a
  -- segunda, no servidor — nenhuma das duas substitui a outra.
  --
  -- ÚNICA MUDANÇA desta migration em relação a 0036: errcode 'P0005'
  -- (inventado, mascarado pelo PostgREST) → '23505' (unique_violation,
  -- SQLSTATE oficial, propaga normalmente — ver header desta migration).
  if exists (
    select 1
      from public.set_logs sl
      join public.planned_sets ps on ps.id = sl.planned_set_id
     where sl.session_log_id = p_session_log_id
       and ps.exercise_id = p_planned_exercise_id
  ) then
    raise exception 'exercício % já tem série registrada nesta sessão; troca de modalidade recusada',
      p_planned_exercise_id
      using errcode = '23505';
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
-- Grants — mesmo padrão da 0034/0035/0036 (revoke de public E de anon, lição da 0019)
-- ============================================================
revoke all on function public.swap_session_exercise(uuid, uuid, text, text) from public, anon;
grant execute on function public.swap_session_exercise(uuid, uuid, text, text) to authenticated;

-- ============================================================
-- Asserção: a guarda de métrica de 0035 continua presente, e a guarda de
-- set_logs desta migration usa o errcode OFICIAL 23505 (não mais P0005)
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
    raise exception 'asserção falhou: guarda de set_logs ausente';
  end if;
  if v_def not like '%errcode = ''23505''%' then
    raise exception 'asserção falhou: errcode 23505 (oficial) da guarda de set_logs ausente';
  end if;
  if v_def like '%errcode = ''P0005''%' then
    raise exception 'asserção falhou: errcode P0005 (mascarado pelo PostgREST) ainda presente';
  end if;
end;
$$;
