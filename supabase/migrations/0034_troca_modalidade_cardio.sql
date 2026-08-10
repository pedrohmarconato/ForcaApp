-- Troca de modalidade de cardio: substituir um momento de cardio da sessão por
-- outra modalidade aceita, preservando a dose por tempo (REQ-06, Fase 3).
--
-- O que não existia: a única via para "não vou fazer esta corrida" era a
-- recusa declarada (motivo `sem_equipamento`, migration 0020) — o exercício
-- saía da sessão, sem alternativa. Não havia caminho para o aluno dizer "não
-- tenho isso, mas tenho aquilo" e continuar treinando com a dose preservada.
--
-- O que muda:
--   1. `cardio_exercise_swaps` (nova, satélite do `session_log`, mesmo padrão
--      de `exercise_skips`): registra que UM exercício de cardio de UMA
--      execução foi trocado para outra modalidade, com nota opcional.
--   2. Vocabulário fechado de modalidade válida
--      (`_forca_modalidade_cardio_valida`), espelhando LITERALMENTE as 9
--      modalidades de `CARDIO_MODALIDADES` (`src/constants/cardioModalidades.ts`)
--      — drift entre banco e app é erro de teste
--      (`__tests__/cardioModalidadesSincronizadas.test.ts`), nunca surpresa em
--      produção.
--   3. RPC `swap_session_exercise`, análoga a `skip_session_exercise`
--      (0020:327-400): guarda de posse do exercício (pertence à sessão do
--      log) + guarda NOVA de métrica cardio (só exercício por tempo pode
--      trocar de modalidade — defesa em profundidade, a UI já restringe isso).
--
-- Esta migration NUNCA faz `UPDATE` em `planned_exercises`/`planned_sets` — a
-- troca é anotada numa tabela satélite ao lado, nunca reescreve o que a IA
-- gerou. `weeklyReplanRepository.ts:113,161,163` lê `planned_exercises.name`
-- para montar o contexto de replanejamento semanal (Fase 6): mutar esse nome
-- in-place vazaria a troca intra-sessão para o replanejador de semanas
-- futuras, que nada sabe sobre troca de modalidade. Reescrever o schema do
-- plano gerado é porta de mão única (one-way door) — fora do escopo desta
-- migration, per 03-CONTEXT.md.
--
-- Esta migration NÃO aplica nenhum comando `supabase` (db push/migration
-- up/link) — a aplicação a staging/produção é decisão explícita do dono,
-- gated pelo checkpoint da Task 2 do plano 03-01.
--
-- Errcodes que o app trata (mesmos já documentados em
-- sessionExecutionRepository.ts, migration 0020): 42501 autenticação/posse
-- ausente · 22023 modalidade/nota/métrica inválida · P0001 log já finalizado ·
-- P0002 log inexistente ou alheio.

-- ============================================================
-- 1. Vocabulário fechado de modalidade de cardio válida
-- ============================================================
-- Function em vez de enum/domain: mesmo raciocínio de
-- _forca_motivo_recusa_valido (0020) — a lista é lida pela constraint E pela
-- RPC no mesmo lugar, sem precisar de ALTER TYPE para evoluir.
create or replace function public._forca_modalidade_cardio_valida(p_modalidade text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_modalidade in (
    'Caminhada',
    'Corrida',
    'Bicicleta Ergométrica',
    'Elíptico',
    'Remo Ergômetro',
    'Escada Ergométrica',
    'Pular Corda',
    'Cardio Contínuo (LISS)',
    'Cardio Intervalado (HIIT)'
  );
$$;

comment on function public._forca_modalidade_cardio_valida(text) is
  'Vocabulário fechado das modalidades de cardio aceitas em troca. Espelha CARDIO_MODALIDADES (src/constants/cardioModalidades.ts). Fonte única da CHECK constraint e da RPC swap_session_exercise.';

-- ============================================================
-- 2. Troca de modalidade dentro de uma execução
-- ============================================================
create table if not exists public.cardio_exercise_swaps (
  id uuid primary key default gen_random_uuid(),
  session_log_id      uuid not null references public.session_logs (id) on delete cascade,
  planned_exercise_id uuid not null references public.planned_exercises (id) on delete cascade,
  to_modality text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma troca por exercício por execução. Repetir a troca corrige a escolha
  -- (a RPC faz on conflict), não empilha registros — mesma semântica de
  -- exercise_skips.
  unique (session_log_id, planned_exercise_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cardio_exercise_swaps_modalidade_check'
  ) then
    alter table public.cardio_exercise_swaps
      add constraint cardio_exercise_swaps_modalidade_check
      check (public._forca_modalidade_cardio_valida(to_modality));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cardio_exercise_swaps_note_len'
  ) then
    alter table public.cardio_exercise_swaps
      add constraint cardio_exercise_swaps_note_len
      check (note is null or char_length(note) <= 280);
  end if;
end
$$;

-- Consulta "histórico de trocas deste exercício" (rótulo D-08 "trocado de X"
-- no detalhe da sessão). O unique já indexa (session_log_id, ...) pelo prefixo.
create index if not exists cardio_exercise_swaps_exercise_idx
  on public.cardio_exercise_swaps (planned_exercise_id, created_at desc);

comment on table public.cardio_exercise_swaps is
  'Troca de modalidade de cardio DENTRO de uma execução (escopo session_log, não o plano). Nunca reescreve planned_exercises/planned_sets — satélite ao lado, mesmo padrão de exercise_skips (migration 0020).';

alter table public.cardio_exercise_swaps enable row level security;

-- Posse herdada do session_log, mesmo padrão de exercise_skips (0020:163-183).
drop policy if exists "own cardio exercise swaps" on public.cardio_exercise_swaps;
create policy "own cardio exercise swaps" on public.cardio_exercise_swaps
  for all using (
    exists (
      select 1 from public.session_logs l
      where l.id = session_log_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.session_logs l
      join public.planned_exercises pe
        on pe.id = planned_exercise_id
       and pe.session_id = l.planned_session_id
      where l.id = session_log_id
        and l.user_id = auth.uid()
        and l.finished_at is null
    )
  );

-- ============================================================
-- 3. RPC — trocar a modalidade de um exercício de cardio
-- ============================================================
/*
 * Troca a modalidade de um exercício de cardio da execução em aberto,
 * preservando a dose por tempo (a duração-alvo da série vive em
 * planned_sets, que esta RPC nunca toca — D-01 é garantido por construção:
 * a série continua apontando para o mesmo planned_exercise_id/planned_set,
 * só a modalidade REGISTRADA para exibição/histórico muda).
 */
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

  -- Guarda NOVA desta migration: só exercício de cardio/tempo pode trocar de
  -- modalidade. Defesa em profundidade — a UI já só oferece o botão em
  -- exercício isTimeBased, mas a RPC não confia só nisso.
  if not exists (
    select 1
      from public.planned_exercises pe
     where pe.id = p_planned_exercise_id
       and (pe.metric in ('tempo', 'tempo_distancia') or pe.muscle_group = 'Cardio')
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
  -- Trocar de ideia sobre a modalidade é legítimo (o aluno reabre o sheet e
  -- corrige). created_at preserva a PRIMEIRA troca; updated_at marca a correção.
  do update set to_modality = excluded.to_modality,
                note        = excluded.note,
                updated_at  = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 4. Grants — revoke de public E de anon (lição da 0019, reforçada em 0020/0021/0033)
-- ============================================================
-- Os default privileges do Supabase concedem EXECUTE a anon/authenticated na
-- criação de QUALQUER função: `revoke from public` não corta anon.
revoke all on function public._forca_modalidade_cardio_valida(text) from public, anon;
revoke all on function public.swap_session_exercise(uuid, uuid, text, text) from public, anon;

grant execute on function public._forca_modalidade_cardio_valida(text) to authenticated;
grant execute on function public.swap_session_exercise(uuid, uuid, text, text) to authenticated;

-- ============================================================
-- Asserções: o que esta migration promete existe de fato
-- ============================================================
do $$
declare
  v_fn text;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'cardio_exercise_swaps'
  ) then
    raise exception 'asserção falhou: cardio_exercise_swaps não existe';
  end if;

  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'cardio_exercise_swaps' and rowsecurity
  ) then
    raise exception 'asserção falhou: RLS desligada em cardio_exercise_swaps';
  end if;

  -- anon sem EXECUTE nas duas funções criadas por esta migration.
  foreach v_fn in array array[
    'public._forca_modalidade_cardio_valida(text)',
    'public.swap_session_exercise(uuid, uuid, text, text)'
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
