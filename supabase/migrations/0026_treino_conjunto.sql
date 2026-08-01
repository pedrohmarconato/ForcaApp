-- Treino Conjunto 2.0 — Sprint 01: fundação de domínio e sincronização.
--
-- Duas pessoas autenticadas treinam juntas, cada uma no próprio celular,
-- alternando execução e descanso, sem perder a individualidade das cargas nem
-- do histórico. Esta migration entrega o modelo persistente, o convite, a
-- máquina de estados, as RPCs, a RLS, o guard sobre as tabelas existentes e a
-- publicação de Realtime. Nenhuma tela — a UI é dos sprints 02 e 03.
--
-- ============================================================================
-- DECISÕES QUE ESTE ARQUIVO CARREGA (e que um leitor futuro precisa saber)
-- ============================================================================
--
-- 1. MUTAÇÃO SÓ POR RPC `SECURITY DEFINER`. Desvia da convenção `INVOKER` da
--    0020, de propósito. Com `INVOKER` seria preciso uma policy de UPDATE em
--    `joint_sessions` para o participante — e essa policy deixaria o cliente
--    escrever `current_turn_user_id = eu` direto pelo PostgREST, furando a
--    máquina de turno. As 3 tabelas de domínio têm RLS com UMA policy de
--    SELECT cada e nenhuma de escrita; `joint_invite_attempts` tem RLS com
--    ZERO policies. Cada definer revalida `auth.uid()` e a pré-condição antes
--    de escrever.
--
-- 2. ESTRUTURA COMPARTILHADA É COPIADA, não lida por RLS estendida. Estender a
--    RLS de `planned_exercises`/`planned_sets` para o parceiro abriria o plano
--    alheio e viveria no schema para sempre. A cópia OMITE `target_load_kg`
--    (a carga do parceiro), `notes` e `name_original` (coaching pessoal) e
--    `injury_flags` (dado de saúde).
--
-- 3. A CÓPIA VIVE NUM PLANO ARQUIVADO `purpose='joint'`. Toda leitura solo
--    filtra por plano ATIVO (src/services/trainingRepository.ts), então um
--    plano arquivado é invisível para a Home, a aba Plano e o replanejador.
--    Histórico e progresso NÃO filtram por plano, então o treino conjunto
--    entra no histórico normalmente. Nenhuma query solo precisou mudar.
--
-- 4. OS `session_logs` DO TREINO CONJUNTO NASCEM SÓ NA ATIVAÇÃO BILATERAL,
--    dentro de `set_joint_participant_ready`. E ela NÃO chama `start_session`:
--    aquela função é `INVOKER` e insere `user_id = auth.uid()` (0020), e
--    `auth.uid()` lê a claim do JWT — não muda dentro de uma definer. Chamá-la
--    aqui criaria DOIS logs do mesmo usuário. Inserimos os dois logs com
--    `user_id` explícito, validando posse e estado de cada lado antes.
--
-- 5. GUARD SOBRE AS TABELAS EXISTENTES (seção 9). `planned_sessions` e
--    `session_logs` têm policy `FOR ALL` do dono desde a 0001, e as RPCs solo
--    são `INVOKER`. Sem guard, o player solo em OUTRO APARELHO concluiria,
--    pularia ou desvincularia a sessão no meio do treino conjunto — não é
--    ataque hipotético, é o app que já existe. Os gatilhos decidem por
--    `current_user`: dentro de uma definer de dono `postgres` ele é o dono;
--    numa chamada direta ou `INVOKER` é o papel do cliente. Sinal do próprio
--    motor, não spoofável. Inertes quando `joint_session_id` é nulo — o fluxo
--    solo não muda em nada.
--
-- Errcodes que o app trata (src/services/jointSessionRepository.ts):
--   42501 não autenticado · não participante · alheio · convite inválido
--   22023 argumento inválido · 55000 estado não permite · FC001 turno
--   desatualizado · 54000 limite de tentativas · P0001 fila não encerrada ·
--   P0002 não encontrado.
--
--   FC001 é um SQLSTATE nosso de propósito: 40001 (serialization_failure) faz o
--   PostgREST retentar a requisição sozinho e a chamada trava até o gateway
--   desistir — medido em 125s contra 219ms do caminho normal.

-- ============================================================
-- 0. Vocabulários e helpers internos
-- ============================================================

-- Sinal do motor que separa "a RPC conjunta está escrevendo" de "o cliente está
-- escrevendo". Dentro de SECURITY DEFINER de dono postgres, current_user é o
-- dono; em chamada direta por PostgREST ou dentro de INVOKER, é o papel do
-- cliente. Cascade administrativo e service_role também não são cliente.
create or replace function public._forca_papel_de_cliente()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select current_user in ('authenticated', 'anon');
$$;

comment on function public._forca_papel_de_cliente() is
  'Verdadeiro quando quem executa é um papel de cliente. Base do guard das tabelas existentes.';

-- TTL de presença numa fonte só. O TypeScript compara a constante dele com o
-- texto desta função em teste (jointSessionMigration.test.ts) — mudar o TTL é
-- uma linha, não uma caçada.
create or replace function public._forca_joint_presenca_ttl()
returns interval
language sql
immutable
set search_path = public, pg_temp
as $$
  select interval '60 seconds';
$$;

comment on function public._forca_joint_presenca_ttl() is
  'TTL de presença do treino conjunto (60s). Fonte única, espelhada em src/engine/jointSessionModel.ts.';

-- Allowlist do payload dos eventos. Existe para que a trilha de auditoria NUNCA
-- carregue nota de treino, flag de lesão, plano bruto ou carga — o evento diz o
-- que aconteceu, não o que a pessoa levantou.
create or replace function public._forca_joint_payload_valido(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_payload is not null
     and jsonb_typeof(p_payload) = 'object'
     and not exists (
       select 1
         from jsonb_object_keys(p_payload) as k
        where k not in (
          'role', 'mode', 'muscle_group', 'ready', 'reason',
          'planned_session_id', 'copied_planned_session_id',
          'from_status', 'to_status', 'next_turn_user_id',
          'rotated_invite', 'queue_finished', 'participant_completed'
        )
     );
$$;

comment on function public._forca_joint_payload_valido(jsonb) is
  'Allowlist de chaves do payload de evento. Recusa notes, injury_flags, raw_plan, cargas e qualquer chave não prevista.';

-- Alfabeto sem caracteres ambíguos (sem O/0, I/1): o código é digitado por uma
-- pessoa lendo a tela da outra. 32^6 ≈ 1,07e9 combinações.
create or replace function public._forca_joint_codigo_novo()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_i int;
begin
  for v_tentativa in 1..10 loop
    v_codigo := '';
    for v_i in 1..6 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * 32)::int, 1);
    end loop;
    if not exists (select 1 from public.joint_sessions where invite_code = v_codigo) then
      return v_codigo;
    end if;
  end loop;
  raise exception 'não foi possível gerar um código de convite livre' using errcode = '55000';
end;
$$;

-- ============================================================
-- 1. Tabelas
-- ============================================================

create table if not exists public.joint_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id  uuid not null references auth.users (id) on delete cascade,
  guest_user_id uuid references auth.users (id) on delete cascade,
  mode text check (mode in ('host_plan', 'guest_plan', 'each_own')),
  muscle_group text,
  status text not null default 'inviting'
    check (status in ('inviting', 'lobby', 'active', 'paused',
                      'completed', 'canceled', 'abandoned')),
  pause_reason text check (pause_reason in ('presence_lost', 'participant_request')),
  current_turn_user_id uuid references auth.users (id),
  turn_seq  bigint not null default 0,
  event_seq bigint not null default 0,
  invite_code text not null,
  invite_expires_at  timestamptz not null,
  invite_consumed_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at   timestamptz,
  updated_at timestamptz not null default now(),

  constraint joint_sessions_dupla_distinta
    check (guest_user_id is null or guest_user_id <> host_user_id),
  constraint joint_sessions_inviting_sem_convidado
    check (status <> 'inviting' or guest_user_id is null),
  constraint joint_sessions_pos_lobby_com_convidado
    check (status not in ('lobby','active','paused','completed','abandoned')
           or guest_user_id is not null),
  constraint joint_sessions_ativa_tem_turno
    check (status not in ('active','paused')
           or (current_turn_user_id is not null and mode is not null)),
  -- `is not distinct from` em vez de `in`: com guest nulo, `in` devolve NULL e a
  -- constraint passaria calada. O turno nunca é de um terceiro.
  constraint joint_sessions_turno_da_dupla
    check (current_turn_user_id is null
           or current_turn_user_id = host_user_id
           or current_turn_user_id is not distinct from guest_user_id),
  -- Coerência, no espírito de planned_sessions_skip_coerente (0020): motivo de
  -- pausa só existe em sessão pausada.
  constraint joint_sessions_pausa_coerente
    check (pause_reason is null or status = 'paused'),
  constraint joint_sessions_terminal_tem_fim
    check ((ended_at is not null) = (status in ('completed','canceled','abandoned'))),
  constraint joint_sessions_cada_um_tem_grupo
    check (mode <> 'each_own'
           or status not in ('active','paused','completed')
           or muscle_group is not null)
);

create unique index if not exists joint_sessions_invite_code_idx
  on public.joint_sessions (invite_code);

create index if not exists joint_sessions_host_idx  on public.joint_sessions (host_user_id, status);
create index if not exists joint_sessions_guest_idx on public.joint_sessions (guest_user_id, status);

comment on table public.joint_sessions is
  'Sessão de treino conjunto entre duas contas. Mutação apenas pelas RPCs SECURITY DEFINER desta migration.';

create table if not exists public.joint_session_participants (
  joint_session_id uuid not null references public.joint_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  -- Denormalização deliberada: é ela que permite o unique parcial abaixo, que é
  -- o ÚNICO jeito de o banco impedir pertencimento vivo cruzando papéis.
  live boolean not null default true,
  planned_session_id uuid references public.planned_sessions (id) on delete restrict,
  session_log_id     uuid references public.session_logs (id) on delete set null,
  ready boolean not null default false,
  ready_at timestamptz,
  queue_finished_at timestamptz,
  completed_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (joint_session_id, user_id),
  constraint joint_participants_ready_coerente check (ready = (ready_at is not null)),
  constraint joint_participants_ready_tem_sessao
    check (not ready or planned_session_id is not null)
);

create unique index if not exists joint_participants_papel_unico_idx
  on public.joint_session_participants (joint_session_id, role);

-- O invariante que dois índices parciais em host_user_id/guest_user_id NÃO dão:
-- sem isto, a mesma pessoa seria anfitriã de uma sessão e convidada de outra.
create unique index if not exists joint_participants_um_vivo_por_usuario_idx
  on public.joint_session_participants (user_id)
  where live;

-- Uma sessão planejada participa de no máximo um treino conjunto.
create unique index if not exists joint_participants_sessao_unica_idx
  on public.joint_session_participants (planned_session_id)
  where planned_session_id is not null;

comment on column public.joint_session_participants.live is
  'Pertencimento vivo. Desligado pelo gatilho quando a sessão chega a estado terminal; sustenta o unique parcial por user_id.';

create table if not exists public.joint_session_events (
  id uuid primary key default gen_random_uuid(),
  joint_session_id uuid not null references public.joint_sessions (id) on delete cascade,
  seq bigint not null,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'created', 'joined', 'mode_set', 'session_confirmed', 'copy_materialized',
    'ready', 'unready', 'started', 'turn_advanced', 'queue_finished',
    'paused', 'resumed', 'participant_completed', 'completed',
    'canceled', 'abandoned'
  )),
  client_event_id text,
  set_log_id uuid references public.set_logs (id) on delete set null,
  expected_turn_seq bigint,
  turn_seq_after bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint joint_events_client_id_curto
    check (client_event_id is null or char_length(client_event_id) <= 64),
  constraint joint_events_payload_allowlist
    check (public._forca_joint_payload_valido(payload))
);

create unique index if not exists joint_events_seq_idx
  on public.joint_session_events (joint_session_id, seq);

-- Idempotência do turno: o mesmo client_event_id do mesmo ator é um retry.
create unique index if not exists joint_events_client_id_idx
  on public.joint_session_events (joint_session_id, actor_user_id, client_event_id)
  where client_event_id is not null;

-- Uma série confirma o turno UMA vez. Sem isto, corrigir a série e reenviar com
-- outro id de evento avançaria o treino do parceiro de novo.
create unique index if not exists joint_events_set_log_idx
  on public.joint_session_events (joint_session_id, set_log_id)
  where set_log_id is not null;

comment on table public.joint_session_events is
  'Trilha append-only do treino conjunto. Também é o mecanismo de idempotência do avanço de turno.';

create table if not exists public.joint_invite_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);

comment on table public.joint_invite_attempts is
  'Antibrute-force do código de convite. RLS ligada com ZERO policies e ZERO grants: só as funções definer a tocam.';

-- ============================================================
-- 2. Colunas nas tabelas existentes
-- ============================================================

alter table public.training_plans
  add column if not exists purpose text not null default 'solo';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_plans_purpose_check') then
    alter table public.training_plans
      add constraint training_plans_purpose_check check (purpose in ('solo', 'joint'));
  end if;
end
$$;

-- Um container de treino conjunto por usuário. `status='archived'` o mantém
-- fora do índice de plano ativo único e fora de toda leitura solo.
create unique index if not exists training_plans_um_container_joint_idx
  on public.training_plans (user_id)
  where purpose = 'joint';

comment on column public.training_plans.purpose is
  'solo = plano de treino do usuário | joint = container arquivado das sessões copiadas de treino conjunto.';

-- `on delete set null`, não `restrict`: joint_sessions referencia auth.users com
-- cascade, então apagar uma conta apaga a sessão conjunta. Com `restrict`, a
-- planned_session ainda vinculada DO PARCEIRO bloquearia o apagamento da conta —
-- um direito do titular viraria deadlock. A imutabilidade do vínculo contra o
-- cliente vem do gatilho da seção 9, que é onde ela pertence.
alter table public.planned_sessions
  add column if not exists joint_session_id uuid
    references public.joint_sessions (id) on delete set null;

create index if not exists planned_sessions_joint_idx
  on public.planned_sessions (joint_session_id)
  where joint_session_id is not null;

comment on column public.planned_sessions.joint_session_id is
  'Liga esta sessão planejada ao treino conjunto que a executou. Não editável pelo cliente (gatilho _forca_guarda_planned_session).';

-- ============================================================
-- 3. RLS — SELECT para participantes, nenhuma escrita
-- ============================================================

alter table public.joint_sessions             enable row level security;
alter table public.joint_session_participants enable row level security;
alter table public.joint_session_events       enable row level security;
alter table public.joint_invite_attempts      enable row level security;

drop policy if exists "joint sessions visiveis a dupla" on public.joint_sessions;
create policy "joint sessions visiveis a dupla" on public.joint_sessions
  for select using (
    auth.uid() = host_user_id or auth.uid() is not distinct from guest_user_id
  );

drop policy if exists "joint participantes visiveis a dupla" on public.joint_session_participants;
create policy "joint participantes visiveis a dupla" on public.joint_session_participants
  for select using (
    exists (
      select 1 from public.joint_sessions s
       where s.id = joint_session_id
         and (auth.uid() = s.host_user_id or auth.uid() is not distinct from s.guest_user_id)
    )
  );

drop policy if exists "joint eventos visiveis a dupla" on public.joint_session_events;
create policy "joint eventos visiveis a dupla" on public.joint_session_events
  for select using (
    exists (
      select 1 from public.joint_sessions s
       where s.id = joint_session_id
         and (auth.uid() = s.host_user_id or auth.uid() is not distinct from s.guest_user_id)
    )
  );

-- joint_invite_attempts: RLS ligada e NENHUMA policy. Com RLS ligada e zero
-- policies, nenhum papel de cliente lê ou escreve — e o contador de tentativas
-- não devolve ao atacante o próprio sinal do rate limit.

-- ============================================================
-- 4. Gatilhos das tabelas novas
-- ============================================================

create or replace function public._forca_joint_touch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists joint_sessions_touch on public.joint_sessions;
create trigger joint_sessions_touch before update on public.joint_sessions
  for each row execute function public._forca_joint_touch();

drop trigger if exists joint_participants_touch on public.joint_session_participants;
create trigger joint_participants_touch before update on public.joint_session_participants
  for each row execute function public._forca_joint_touch();

-- Terminal é terminal: nem uma RPC distraída, nem o dono da tabela reabre.
create or replace function public._forca_joint_terminal_imutavel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('completed', 'canceled', 'abandoned') then
    raise exception 'sessão conjunta % está em estado terminal (%) e não muda mais', old.id, old.status
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists joint_sessions_terminal_imutavel on public.joint_sessions;
create trigger joint_sessions_terminal_imutavel before update on public.joint_sessions
  for each row execute function public._forca_joint_terminal_imutavel();

-- Ao encerrar, libera as duas pessoas para um novo treino conjunto.
create or replace function public._forca_joint_liveness()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('completed', 'canceled', 'abandoned')
     and old.status not in ('completed', 'canceled', 'abandoned') then
    update public.joint_session_participants
       set live = false
     where joint_session_id = new.id
       and live;
  end if;
  return null;
end;
$$;

drop trigger if exists joint_sessions_liveness on public.joint_sessions;
create trigger joint_sessions_liveness after update on public.joint_sessions
  for each row execute function public._forca_joint_liveness();

-- O papel gravado tem de bater com a coluna correspondente da sessão. Sem isto,
-- um terceiro ou um papel fantasma entraria na tabela por qualquer caminho.
create or replace function public._forca_joint_participante_coerente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sessao public.joint_sessions;
begin
  select * into v_sessao from public.joint_sessions where id = new.joint_session_id;
  if not found then
    raise exception 'sessão conjunta % inexistente', new.joint_session_id using errcode = 'P0002';
  end if;
  if new.role = 'host' and new.user_id <> v_sessao.host_user_id then
    raise exception 'participante host tem de ser o host_user_id da sessão' using errcode = '42501';
  end if;
  if new.role = 'guest' and new.user_id is distinct from v_sessao.guest_user_id then
    raise exception 'participante guest tem de ser o guest_user_id da sessão' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists joint_participants_coerente on public.joint_session_participants;
create trigger joint_participants_coerente
  before insert or update on public.joint_session_participants
  for each row execute function public._forca_joint_participante_coerente();

-- Append-only de verdade: nem UPDATE, nem DELETE, nem pelo dono.
create or replace function public._forca_joint_evento_imutavel()
returns trigger
language plpgsql
-- INVOKER pelo mesmo motivo dos gatilhos do guard: é `current_user` que separa
-- o cliente do cascade administrativo.
security invoker
set search_path = public, pg_temp
as $$
begin
  -- UPDATE nunca: não existe caso legítimo de reescrever a trilha.
  if tg_op = 'UPDATE' then
    raise exception 'joint_session_events é append-only (UPDATE recusado)' using errcode = '55000';
  end if;
  -- DELETE pelo cliente também nunca. Mas o cascade de `auth.users` roda em
  -- papel não-cliente e PRECISA passar: apagar a conta é direito do titular, e
  -- uma trilha de auditoria que impede o apagamento é retenção indevida
  -- disfarçada de integridade. A trilha conjunta existe enquanto as duas contas
  -- existirem — está declarado no contrato, não é efeito colateral.
  if public._forca_papel_de_cliente() then
    raise exception 'joint_session_events é append-only (DELETE recusado)' using errcode = '55000';
  end if;
  return old;
end;
$$;

drop trigger if exists joint_events_imutavel on public.joint_session_events;
create trigger joint_events_imutavel
  before update or delete on public.joint_session_events
  for each row execute function public._forca_joint_evento_imutavel();

-- ============================================================
-- 5. Escrita da trilha (interna — sem EXECUTE para authenticated)
-- ============================================================

-- Emitida SEMPRE antes de a sessão virar terminal: ela toca joint_sessions
-- (event_seq), e depois do terminal o gatilho de imutabilidade recusaria.
create or replace function public._forca_joint_evento(
  p_joint_session_id  uuid,
  p_actor             uuid,
  p_kind              text,
  p_payload           jsonb   default '{}'::jsonb,
  p_client_event_id   text    default null,
  p_set_log_id        uuid    default null,
  p_expected_turn_seq bigint  default null,
  p_turn_seq_after    bigint  default null
)
returns public.joint_session_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seq bigint;
  v_row public.joint_session_events;
begin
  if not public._forca_joint_payload_valido(p_payload) then
    raise exception 'payload de evento fora do allowlist' using errcode = '22023';
  end if;

  update public.joint_sessions
     set event_seq = event_seq + 1
   where id = p_joint_session_id
  returning event_seq into v_seq;

  if v_seq is null then
    raise exception 'sessão conjunta % inexistente', p_joint_session_id using errcode = 'P0002';
  end if;

  insert into public.joint_session_events (
    joint_session_id, seq, actor_user_id, kind, client_event_id,
    set_log_id, expected_turn_seq, turn_seq_after, payload
  )
  values (
    p_joint_session_id, v_seq, p_actor, p_kind, p_client_event_id,
    p_set_log_id, p_expected_turn_seq, p_turn_seq_after, p_payload
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- Papel do usuário na sessão, ou null se ele não pertence à dupla.
create or replace function public._forca_joint_papel(
  p_joint_session_id uuid,
  p_user_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role
    from public.joint_session_participants p
   where p.joint_session_id = p_joint_session_id
     and p.user_id = p_user_id;
$$;

-- Exercícios que ainda impedem declarar a fila encerrada: toda série prescrita
-- precisa ter execução registrada OU recusa declarada do exercício. É o que
-- torna "terminei" verificável em vez de autoafirmado.
create or replace function public._forca_joint_fila_pendente(p_session_log_id uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct pe.name order by pe.name), '{}'::text[])
    from public.session_logs l
    join public.planned_exercises pe on pe.session_id = l.planned_session_id
    join public.planned_sets ps      on ps.exercise_id = pe.id
   where l.id = p_session_log_id
     and not exists (
       select 1 from public.set_logs sl
        where sl.session_log_id = l.id
          and sl.planned_set_id = ps.id
     )
     and not exists (
       select 1 from public.exercise_skips es
        where es.session_log_id = l.id
          and es.planned_exercise_id = pe.id
     );
$$;

comment on function public._forca_joint_fila_pendente(uuid) is
  'Nomes dos exercícios com série prescrita sem execução e sem recusa. Vazio = fila realmente encerrada.';

-- ============================================================
-- 6. Convite — criar e aceitar
-- ============================================================

create or replace function public.create_joint_session()
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_viva   public.joint_sessions;
  v_row    public.joint_sessions;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  -- Pertencimento vivo, qualquer que seja o papel.
  select s.* into v_viva
    from public.joint_session_participants p
    join public.joint_sessions s on s.id = p.joint_session_id
   where p.user_id = v_uid and p.live
   limit 1
   for update of s;

  if found then
    if v_viva.status <> 'inviting' then
      raise exception 'você já está em um treino conjunto (%)', v_viva.status
        using errcode = '55000';
    end if;
    -- Convite expirado NÃO prende o usuário: rotaciona código e validade e
    -- devolve utilizável. O código antigo deixa de existir.
    if v_viva.invite_expires_at <= now() then
      update public.joint_sessions
         set invite_code = public._forca_joint_codigo_novo(),
             invite_expires_at = now() + interval '15 minutes'
       where id = v_viva.id
      returning * into v_row;
      perform public._forca_joint_evento(
        v_row.id, v_uid, 'created', jsonb_build_object('rotated_invite', true));
      return v_row;
    end if;
    return v_viva;  -- idempotente
  end if;

  insert into public.joint_sessions (host_user_id, invite_code, invite_expires_at)
  values (v_uid, public._forca_joint_codigo_novo(), now() + interval '15 minutes')
  returning * into v_row;

  insert into public.joint_session_participants (joint_session_id, user_id, role)
  values (v_row.id, v_uid, 'host');

  perform public._forca_joint_evento(
    v_row.id, v_uid, 'created', jsonb_build_object('role', 'host'));

  return v_row;
end;
$$;

create or replace function public.join_joint_session(p_invite_code text)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_codigo   text := upper(btrim(coalesce(p_invite_code, '')));
  v_sessao   public.joint_sessions;
  v_row      public.joint_sessions;
  v_tentativas int;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  -- ------------------------------------------------------------------
  -- POR QUE O CAMINHO DE FALHA DEVOLVE NULL EM VEZ DE LEVANTAR EXCEÇÃO
  --
  -- O contrato pedia `42501` para convite inválido e `54000` para excesso de
  -- tentativas. Isso é IMPOSSÍVEL junto com um contador que funcione: no
  -- PostgreSQL, a exceção aborta a transação e leva junto o incremento feito
  -- nesta mesma chamada. Um limitador que só conta as tentativas BEM-SUCEDIDAS
  -- nunca dispara — é um controle de segurança decorativo.
  --
  -- Não há saída em plpgsql: commit dentro de função chamada por SELECT não
  -- existe, bloco EXCEPTION que registra e re-levanta também aborta no fim, e
  -- não há dblink/pg_background neste projeto.
  --
  -- Então a recusa por convite inválido OU por excesso de tentativas devolve
  -- `null`. O contador sobrevive, o limite passa a valer de verdade, e os dois
  -- casos ficam INDISTINGUÍVEIS — o que reforça B12 em vez de enfraquecê-lo.
  -- A tradução para erro de domínio é do repositório TypeScript.
  -- Desvio deliberado do contrato, relatado no handoff. Ver
  -- src/services/jointSessionRepository.ts (ConviteInvalidoError).
  -- ------------------------------------------------------------------
  insert into public.joint_invite_attempts (user_id, window_started_at, attempts)
  values (v_uid, now(), 1)
  on conflict (user_id) do update
    set attempts = case
          when joint_invite_attempts.window_started_at < now() - interval '10 minutes'
          then 1 else joint_invite_attempts.attempts + 1 end,
        window_started_at = case
          when joint_invite_attempts.window_started_at < now() - interval '10 minutes'
          then now() else joint_invite_attempts.window_started_at end
  returning attempts into v_tentativas;

  if v_tentativas > 10 then
    return null;
  end if;

  -- Resposta ÚNICA para inexistente, expirado, consumido e já em outro estado:
  -- distinguir os casos transformaria esta função num oráculo de enumeração.
  select * into v_sessao
    from public.joint_sessions
   where invite_code = v_codigo
   for update;

  if v_sessao.id is null
     or v_sessao.status <> 'inviting'
     or v_sessao.invite_consumed_at is not null
     or v_sessao.invite_expires_at <= now() then
    return null;
  end if;

  if v_sessao.host_user_id = v_uid then
    raise exception 'você não pode entrar no próprio convite' using errcode = '55000';
  end if;

  if exists (select 1 from public.joint_session_participants
              where user_id = v_uid and live) then
    raise exception 'você já está em um treino conjunto' using errcode = '55000';
  end if;

  update public.joint_sessions
     set guest_user_id = v_uid,
         status = 'lobby',
         invite_consumed_at = now()
   where id = v_sessao.id
  returning * into v_row;

  insert into public.joint_session_participants (joint_session_id, user_id, role)
  values (v_row.id, v_uid, 'guest');

  -- Tentativa bem-sucedida zera o contador: o limite pune busca cega, não uso.
  delete from public.joint_invite_attempts where user_id = v_uid;

  perform public._forca_joint_evento(
    v_row.id, v_uid, 'joined', jsonb_build_object('role', 'guest'));

  return v_row;
end;
$$;

-- ============================================================
-- 7. Lobby — modo, sessão de cada um, cópia e prontidão
-- ============================================================

create or replace function public.set_joint_session_mode(
  p_joint_session_id uuid,
  p_mode text,
  p_muscle_group text default null
)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_sessao public.joint_sessions;
  v_row    public.joint_sessions;
  v_grupo  text := nullif(btrim(coalesce(p_muscle_group, '')), '');
  v_copia  uuid;
  v_copias uuid[];
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('host_plan', 'guest_plan', 'each_own') then
    raise exception 'modo inválido: %', coalesce(p_mode, '<null>') using errcode = '22023';
  end if;
  if p_mode = 'each_own' and v_grupo is null then
    raise exception 'modo each_own exige um grupo muscular comum' using errcode = '22023';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.host_user_id <> v_uid then
    raise exception 'só o anfitrião escolhe o modo' using errcode = '42501';
  end if;
  if v_sessao.status <> 'lobby' then
    raise exception 'modo só muda no lobby (status %)', v_sessao.status using errcode = '55000';
  end if;

  -- Trocar de modo invalida TUDO que dependia do modo anterior: ninguém fica
  -- "pronto" para um treino que não é mais o combinado, e a cópia do modo
  -- antigo não pode sobrar reutilizável.
  -- ORDEM IMPORTA. `joint_session_participants.planned_session_id` referencia
  -- `planned_sessions` com ON DELETE RESTRICT: apagar a cópia ANTES de soltar
  -- essa referência falha com 23503 assim que o parceiro já tiver confirmado a
  -- cópia — que é o caminho normal, não o excepcional.
  --  1. anota o que apagar;  2. solta as FKs;  3. só então apaga.
  select coalesce(array_agg(ps.id), '{}'::uuid[]) into v_copias
    from public.joint_session_participants p
    join public.planned_sessions ps on ps.id = p.planned_session_id
    join public.training_plans tp on tp.id = ps.plan_id
   where p.joint_session_id = p_joint_session_id
     and tp.purpose = 'joint';

  update public.joint_session_participants
     set planned_session_id = null, session_log_id = null,
         ready = false, ready_at = null
   where joint_session_id = p_joint_session_id;

  update public.planned_sessions
     set joint_session_id = null
   where joint_session_id = p_joint_session_id;

  foreach v_copia in array v_copias loop
    -- No lobby a cópia nunca tem execução, então apagá-la não apaga histórico.
    -- A guarda existe mesmo assim.
    if not exists (select 1 from public.session_logs where planned_session_id = v_copia) then
      delete from public.planned_sessions where id = v_copia;
    end if;
  end loop;

  -- Container sem nenhuma sessão restante não fica de lembrança.
  -- Escopo por usuário é obrigatório: sem o `in (...)`, uma definer apagaria o
  -- container VAZIO de qualquer outra conta do banco.
  delete from public.training_plans tp
   where tp.purpose = 'joint'
     and tp.user_id in (
       select user_id from public.joint_session_participants
        where joint_session_id = p_joint_session_id
     )
     and not exists (select 1 from public.planned_sessions ps where ps.plan_id = tp.id);

  update public.joint_sessions
     set mode = p_mode, muscle_group = case when p_mode = 'each_own' then v_grupo else null end
   where id = p_joint_session_id
  returning * into v_row;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'mode_set',
    jsonb_build_object('mode', p_mode, 'muscle_group', v_grupo));

  return v_row;
end;
$$;

create or replace function public.confirm_joint_participant_session(
  p_joint_session_id uuid,
  p_planned_session_id uuid
)
returns public.joint_session_participants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_papel   text;
  v_sessao  public.joint_sessions;
  v_plan    public.planned_sessions;
  v_purpose text;
  v_row     public.joint_session_participants;
  v_dono_da_fonte text;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  v_papel := public._forca_joint_papel(p_joint_session_id, v_uid);
  if v_sessao.id is null or v_papel is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status <> 'lobby' then
    raise exception 'sessão só é escolhida no lobby (status %)', v_sessao.status
      using errcode = '55000';
  end if;
  if v_sessao.mode is null then
    raise exception 'escolham o modo antes da sessão' using errcode = '55000';
  end if;

  -- Posse explícita: a RLS não vale dentro de uma definer, então a checagem é
  -- aqui e é a única que existe.
  select * into v_plan
    from public.planned_sessions
   where id = p_planned_session_id and user_id = v_uid;
  if not found then
    raise exception 'sessão planejada % inexistente ou alheia', p_planned_session_id
      using errcode = '42501';
  end if;
  if v_plan.status not in ('pending', 'in_progress') then
    raise exception 'sessão com status % não pode entrar em treino conjunto', v_plan.status
      using errcode = '55000';
  end if;

  select purpose into v_purpose from public.training_plans where id = v_plan.plan_id;

  -- Quem é o dono da estrutura neste modo. Em host_plan, o host confirma a
  -- sessão REAL e o convidado só a cópia; em guest_plan, o inverso.
  v_dono_da_fonte := case v_sessao.mode
                       when 'host_plan'  then 'host'
                       when 'guest_plan' then 'guest'
                       else null end;

  if v_sessao.mode = 'each_own' then
    if v_purpose = 'joint' then
      raise exception 'em each_own cada um usa a própria sessão do plano' using errcode = '42501';
    end if;
    if not (coalesce(v_sessao.muscle_group, '') = any (v_plan.muscle_groups)) then
      raise exception 'sessão não elegível para o grupo %', v_sessao.muscle_group
        using errcode = '22023',
              detail = jsonb_build_object(
                'codigo', 'grupo_incompativel',
                'grupo', v_sessao.muscle_group,
                'grupos_da_sessao', to_jsonb(v_plan.muscle_groups))::text;
    end if;
  elsif v_papel = v_dono_da_fonte then
    if v_purpose = 'joint' then
      raise exception 'o dono da estrutura confirma a própria sessão, não uma cópia'
        using errcode = '42501';
    end if;
  else
    if v_purpose is distinct from 'joint' or v_plan.joint_session_id is distinct from p_joint_session_id then
      raise exception 'quem recebe a estrutura confirma a cópia gerada para este treino conjunto'
        using errcode = '42501';
    end if;
  end if;

  update public.joint_session_participants
     set planned_session_id = p_planned_session_id,
         ready = false, ready_at = null
   where joint_session_id = p_joint_session_id and user_id = v_uid
  returning * into v_row;

  update public.planned_sessions
     set joint_session_id = p_joint_session_id
   where id = p_planned_session_id;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'session_confirmed',
    jsonb_build_object('role', v_papel, 'planned_session_id', p_planned_session_id));

  return v_row;
end;
$$;

-- Copia a estrutura que o PARCEIRO confirmou para ESTE treino conjunto. Sem
-- parâmetro de fonte: a fonte é lida do que o dono confirmou, e por isso não
-- existe caminho para copiar outra sessão dele.
create or replace function public.materialize_joint_session_copy(p_joint_session_id uuid)
returns public.planned_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_papel     text;
  v_sessao    public.joint_sessions;
  v_papel_fonte text;
  v_fonte_id  uuid;
  v_fonte     public.planned_sessions;
  v_container uuid;
  v_nova      public.planned_sessions;
  v_ex        record;
  v_novo_ex   uuid;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  v_papel := public._forca_joint_papel(p_joint_session_id, v_uid);
  if v_sessao.id is null or v_papel is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status <> 'lobby' then
    raise exception 'a cópia é feita no lobby (status %)', v_sessao.status using errcode = '55000';
  end if;
  if v_sessao.mode not in ('host_plan', 'guest_plan') then
    raise exception 'modo % não usa cópia de estrutura', coalesce(v_sessao.mode, '<null>')
      using errcode = '55000';
  end if;

  v_papel_fonte := case v_sessao.mode when 'host_plan' then 'host' else 'guest' end;
  if v_papel = v_papel_fonte then
    raise exception 'o dono da estrutura não copia a própria sessão' using errcode = '42501';
  end if;

  -- Idempotente: a cópia já feita é devolvida, não duplicada.
  select ps.* into v_nova
    from public.planned_sessions ps
    join public.training_plans tp on tp.id = ps.plan_id
   where ps.user_id = v_uid
     and ps.joint_session_id = p_joint_session_id
     and tp.purpose = 'joint';
  if found then
    return v_nova;
  end if;

  select p.planned_session_id into v_fonte_id
    from public.joint_session_participants p
   where p.joint_session_id = p_joint_session_id and p.role = v_papel_fonte;
  if v_fonte_id is null then
    raise exception 'o parceiro ainda não confirmou a sessão' using errcode = 'P0001';
  end if;

  select * into v_fonte from public.planned_sessions where id = v_fonte_id;

  select id into v_container
    from public.training_plans
   where user_id = v_uid and purpose = 'joint';
  if v_container is null then
    insert into public.training_plans (
      user_id, name, description, status, created_by, purpose, raw_plan
    )
    values (v_uid, 'Treinos conjuntos', null, 'archived', 'user', 'joint', null)
    returning id into v_container;
  end if;

  insert into public.planned_sessions (
    plan_id, user_id, week_number, day_of_week, order_in_week, title,
    session_type, scheduled_date, estimated_minutes, status, muscle_groups,
    joint_session_id
  )
  values (
    v_container, v_uid, 1, v_fonte.day_of_week, 1, v_fonte.title,
    v_fonte.session_type, current_date, v_fonte.estimated_minutes, 'pending',
    v_fonte.muscle_groups, p_joint_session_id
  )
  returning * into v_nova;

  for v_ex in
    select * from public.planned_exercises where session_id = v_fonte_id order by exercise_order
  loop
    -- O que NÃO viaja: notes e name_original (coaching pessoal), injury_flags
    -- (dado de saúde do parceiro). O que nunca viaja nas séries: target_load_kg.
    insert into public.planned_exercises (
      session_id, exercise_order, name, muscle_group, priority, equipment,
      load_increment_kg, rest_seconds, target_rm_percent, sets_planned,
      reps_raw, method, cadence, notes, name_original, injury_flags,
      exercise_key, metric
    )
    values (
      v_nova.id, v_ex.exercise_order, v_ex.name, v_ex.muscle_group, v_ex.priority,
      v_ex.equipment, v_ex.load_increment_kg, v_ex.rest_seconds, v_ex.target_rm_percent,
      v_ex.sets_planned, v_ex.reps_raw, v_ex.method, v_ex.cadence,
      null, null, '{}'::text[], v_ex.exercise_key, v_ex.metric
    )
    returning id into v_novo_ex;

    insert into public.planned_sets (
      exercise_id, set_order, target_reps_min, target_reps_max,
      target_load_kg, target_rir, target_duration_seconds, target_distance_m
    )
    select v_novo_ex, ps.set_order, ps.target_reps_min, ps.target_reps_max,
           null, ps.target_rir, ps.target_duration_seconds, ps.target_distance_m
      from public.planned_sets ps
     where ps.exercise_id = v_ex.id
     order by ps.set_order;
  end loop;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'copy_materialized',
    jsonb_build_object('copied_planned_session_id', v_nova.id));

  return v_nova;
end;
$$;

-- Prontidão e, quando os dois estão prontos, a ativação bilateral: dois logs,
-- duas sessões em andamento, um turno — tudo numa transação. Ver seção 4 do
-- cabeçalho para o motivo de não usar start_session aqui.
create or replace function public.set_joint_participant_ready(
  p_joint_session_id uuid,
  p_ready boolean
)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_papel  text;
  v_sessao public.joint_sessions;
  v_row    public.joint_sessions;
  v_p      record;
  v_plan   public.planned_sessions;
  v_log_id uuid;
  v_prontos int;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  v_papel := public._forca_joint_papel(p_joint_session_id, v_uid);
  if v_sessao.id is null or v_papel is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;

  if v_sessao.status = 'active' then
    return v_sessao;  -- idempotente: já ativou
  end if;
  if v_sessao.status <> 'lobby' then
    raise exception 'prontidão só vale no lobby (status %)', v_sessao.status using errcode = '55000';
  end if;

  if p_ready then
    if not exists (
      select 1 from public.joint_session_participants
       where joint_session_id = p_joint_session_id and user_id = v_uid
         and planned_session_id is not null
    ) then
      raise exception 'escolha a sessão antes de ficar pronto' using errcode = '55000';
    end if;
  end if;

  update public.joint_session_participants
     set ready = p_ready, ready_at = case when p_ready then now() else null end
   where joint_session_id = p_joint_session_id and user_id = v_uid;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, case when p_ready then 'ready' else 'unready' end,
    jsonb_build_object('ready', p_ready));

  select count(*) into v_prontos
    from public.joint_session_participants
   where joint_session_id = p_joint_session_id and ready;

  if v_prontos < 2 then
    select * into v_row from public.joint_sessions where id = p_joint_session_id;
    return v_row;
  end if;

  -- ---- ativação bilateral ----
  for v_p in
    select * from public.joint_session_participants
     where joint_session_id = p_joint_session_id
     order by case role when 'host' then 0 else 1 end
  loop
    select * into v_plan
      from public.planned_sessions
     where id = v_p.planned_session_id and user_id = v_p.user_id
     for update;
    if not found then
      raise exception 'sessão planejada do participante % inexistente ou alheia', v_p.user_id
        using errcode = '42501';
    end if;
    if v_plan.status not in ('pending', 'in_progress') then
      raise exception 'sessão de % está % e não pode ser iniciada', v_p.user_id, v_plan.status
        using errcode = '55000';
    end if;

    -- Mesmo alvo do índice parcial session_logs_one_open_per_session (0003):
    -- execução aberta preexistente é REAPROVEITADA, não duplicada.
    insert into public.session_logs (planned_session_id, user_id)
    values (v_p.planned_session_id, v_p.user_id)
    on conflict (planned_session_id) where finished_at is null
    do nothing
    returning id into v_log_id;

    if v_log_id is null then
      select id into v_log_id
        from public.session_logs
       where planned_session_id = v_p.planned_session_id
         and user_id = v_p.user_id
         and finished_at is null
       order by started_at desc
       limit 1;
    end if;
    if v_log_id is null then
      raise exception 'não foi possível abrir a execução de %', v_p.user_id using errcode = 'P0002';
    end if;

    update public.planned_sessions set status = 'in_progress' where id = v_p.planned_session_id;

    update public.joint_session_participants
       set session_log_id = v_log_id, last_seen_at = now()
     where joint_session_id = p_joint_session_id and user_id = v_p.user_id;
  end loop;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'started',
    jsonb_build_object('next_turn_user_id', v_sessao.host_user_id));

  update public.joint_sessions
     set status = 'active', started_at = now(),
         current_turn_user_id = host_user_id, turn_seq = 1
   where id = p_joint_session_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ============================================================
-- 8. Execução — turno, fila, pausa, presença, conclusão
-- ============================================================

create or replace function public.advance_joint_turn(
  p_joint_session_id  uuid,
  p_client_event_id   text,
  p_expected_turn_seq bigint,
  p_set_log_id        uuid
)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_sessao   public.joint_sessions;
  v_row      public.joint_sessions;
  v_eu       public.joint_session_participants;
  v_parceiro public.joint_session_participants;
  v_anterior public.joint_session_events;
  v_proximo  uuid;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_client_event_id is null or btrim(p_client_event_id) = '' then
    raise exception 'client_event_id é obrigatório' using errcode = '22023';
  end if;
  if p_set_log_id is null then
    raise exception 'a série confirmada é obrigatória para passar o turno' using errcode = '22023';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;

  -- Retry legítimo: mesmo evento, mesmos parâmetros. Devolve o estado e não
  -- avança. Parâmetros DIFERENTES sob o mesmo id não são retry — são bug, e
  -- tratá-los como retry esconderia o bug.
  select * into v_anterior
    from public.joint_session_events
   where joint_session_id = p_joint_session_id
     and actor_user_id = v_uid
     and client_event_id = p_client_event_id;
  if found then
    if v_anterior.set_log_id is distinct from p_set_log_id
       or v_anterior.expected_turn_seq is distinct from p_expected_turn_seq then
      raise exception 'client_event_id % reapresentado com parâmetros diferentes', p_client_event_id
        using errcode = '22023';
    end if;
    return v_sessao;
  end if;

  if v_sessao.status = 'paused' then
    raise exception 'treino pausado (%); retome antes de avançar', v_sessao.pause_reason
      using errcode = '55000';
  end if;
  if v_sessao.status <> 'active' then
    raise exception 'treino conjunto não está em execução (status %)', v_sessao.status
      using errcode = '55000';
  end if;
  -- ORDEM IMPORTA: a versão vem ANTES do dono do turno.
  -- Numa corrida de dois avanços com o mesmo `expected_turn_seq`, o primeiro
  -- commit já transferiu o turno; se o dono fosse checado antes, o perdedor
  -- receberia `42501` ("não é a sua vez") e o cliente trataria um conflito de
  -- versão como falta de permissão — em vez de refazer o snapshot.
  -- ERRCODE 'FC001', e NÃO '40001'.
  --
  -- `40001` é `serialization_failure`, e o PostgREST trata essa classe como
  -- falha transitória e RETENTA a requisição sozinho. Usá-la como erro de
  -- domínio faz a chamada ficar presa até o gateway desistir: medido em HML,
  -- 125 SEGUNDOS e um `upstream request timeout`, sem concorrência nenhuma —
  -- contra 219 ms do caminho feliz. O contrato pedia 40001; através deste
  -- transporte, 40001 não é utilizável. Desvio declarado no handoff.
  if v_sessao.turn_seq <> p_expected_turn_seq then
    raise exception 'turno desatualizado (esperado %, atual %)', p_expected_turn_seq, v_sessao.turn_seq
      using errcode = 'FC001';
  end if;
  if v_sessao.current_turn_user_id <> v_uid then
    raise exception 'não é a sua vez' using errcode = '42501';
  end if;

  select * into v_eu from public.joint_session_participants
   where joint_session_id = p_joint_session_id and user_id = v_uid;
  select * into v_parceiro from public.joint_session_participants
   where joint_session_id = p_joint_session_id and user_id <> v_uid;

  -- A série tem de ser DESTA execução, deste participante.
  if not exists (
    select 1 from public.set_logs
     where id = p_set_log_id and session_log_id = v_eu.session_log_id
  ) then
    raise exception 'série % não pertence à sua execução neste treino conjunto', p_set_log_id
      using errcode = '42501';
  end if;

  -- Série já consumida por um evento anterior: precheck EXPLÍCITO. Sem ele, a
  -- primeira defesa a disparar seria o índice único e o cliente receberia
  -- `23505` cru, que o repositório mapearia como erro desconhecido. Corrigir uma
  -- série e reenviá-la com id de evento novo é o caminho real disto.
  if exists (
    select 1 from public.joint_session_events
     where joint_session_id = p_joint_session_id and set_log_id = p_set_log_id
  ) then
    raise exception 'série % já confirmou um turno; corrigir não avança o treino do parceiro',
      p_set_log_id using errcode = '22023';
  end if;

  -- Fila do parceiro encerrada: o turno FICA com quem ainda tem o que fazer.
  v_proximo := case
    when v_parceiro.queue_finished_at is not null then v_uid
    else v_parceiro.user_id
  end;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'turn_advanced',
    jsonb_build_object('next_turn_user_id', v_proximo),
    p_client_event_id, p_set_log_id, p_expected_turn_seq, v_sessao.turn_seq + 1);

  update public.joint_sessions
     set current_turn_user_id = v_proximo,
         turn_seq = turn_seq + 1
   where id = p_joint_session_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.mark_joint_queue_finished(p_joint_session_id uuid)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_sessao   public.joint_sessions;
  v_row      public.joint_sessions;
  v_eu       public.joint_session_participants;
  v_parceiro public.joint_session_participants;
  v_pendentes text[];
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status <> 'active' then
    raise exception 'fila só é encerrada com o treino em execução (status %)', v_sessao.status
      using errcode = '55000';
  end if;
  -- Declarar o fim da própria fila é ato do turno: quem descansa não altera a
  -- topologia do turno enquanto o parceiro executa.
  if v_sessao.current_turn_user_id <> v_uid then
    raise exception 'só quem está na vez encerra a própria fila' using errcode = '42501';
  end if;

  select * into v_eu from public.joint_session_participants
   where joint_session_id = p_joint_session_id and user_id = v_uid;
  select * into v_parceiro from public.joint_session_participants
   where joint_session_id = p_joint_session_id and user_id <> v_uid;

  if v_eu.queue_finished_at is null then
    -- "Terminei" é verificável, não autoafirmado.
    v_pendentes := public._forca_joint_fila_pendente(v_eu.session_log_id);
    if array_length(v_pendentes, 1) is not null then
      raise exception 'ainda há exercícios pendentes: %', array_to_string(v_pendentes, ', ')
        using errcode = 'P0001';
    end if;

    update public.joint_session_participants
       set queue_finished_at = now()
     where joint_session_id = p_joint_session_id and user_id = v_uid;

    perform public._forca_joint_evento(
      p_joint_session_id, v_uid, 'queue_finished', jsonb_build_object('queue_finished', true));
  end if;

  if v_parceiro.queue_finished_at is null then
    update public.joint_sessions
       set current_turn_user_id = v_parceiro.user_id,
           turn_seq = turn_seq + 1
     where id = p_joint_session_id
    returning * into v_row;
    return v_row;
  end if;

  select * into v_row from public.joint_sessions where id = p_joint_session_id;
  return v_row;
end;
$$;

create or replace function public.pause_joint_session(
  p_joint_session_id uuid,
  p_reason text
)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_sessao   public.joint_sessions;
  v_row      public.joint_sessions;
  v_parceiro public.joint_session_participants;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('presence_lost', 'participant_request') then
    raise exception 'motivo de pausa inválido: %', coalesce(p_reason, '<null>') using errcode = '22023';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status = 'paused' then
    return v_sessao;  -- idempotente
  end if;
  if v_sessao.status <> 'active' then
    raise exception 'só um treino em execução pode pausar (status %)', v_sessao.status
      using errcode = '55000';
  end if;

  -- "Perdi o parceiro" é verificado contra o relógio do servidor, sob lock. Um
  -- cliente não declara ausência de quem está presente.
  if p_reason = 'presence_lost' then
    select * into v_parceiro from public.joint_session_participants
     where joint_session_id = p_joint_session_id and user_id <> v_uid;
    if v_parceiro.last_seen_at > now() - public._forca_joint_presenca_ttl() then
      raise exception 'o parceiro está presente; não há perda de presença' using errcode = '55000';
    end if;
  end if;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'paused', jsonb_build_object('reason', p_reason));

  update public.joint_sessions
     set status = 'paused', pause_reason = p_reason
   where id = p_joint_session_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.resume_joint_session(p_joint_session_id uuid)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_sessao public.joint_sessions;
  v_row    public.joint_sessions;
  v_frios  int;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status <> 'paused' then
    raise exception 'só um treino pausado retoma (status %)', v_sessao.status using errcode = '55000';
  end if;

  if v_sessao.pause_reason = 'presence_lost' then
    select count(*) into v_frios
      from public.joint_session_participants
     where joint_session_id = p_joint_session_id
       and last_seen_at <= now() - public._forca_joint_presenca_ttl();
    if v_frios > 0 then
      raise exception 'ainda falta presença de um dos dois para retomar' using errcode = '55000';
    end if;
  end if;

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'resumed', jsonb_build_object('from_status', 'paused'));

  update public.joint_sessions
     set status = 'active', pause_reason = null
   where id = p_joint_session_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Heartbeat. Só a PRÓPRIA linha — não existe parâmetro de usuário para spoofar
-- a presença do parceiro. Permitido em `paused`: é assim que se retoma.
create or replace function public.touch_joint_presence(p_joint_session_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  -- Terminal é imutável também para o heartbeat: sem esta guarda, o watchdog de
  -- um aparelho que ficou para trás continuaria carimbando presença numa sessão
  -- já encerrada.
  if public._forca_joint_status(p_joint_session_id) in ('completed', 'canceled', 'abandoned') then
    raise exception 'sessão conjunta já encerrada; presença não muda mais'
      using errcode = '55000';
  end if;

  update public.joint_session_participants
     set last_seen_at = now()
   where joint_session_id = p_joint_session_id and user_id = v_uid
  returning last_seen_at into v_at;

  if v_at is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  return v_at;
end;
$$;

create or replace function public.complete_joint_participant(p_joint_session_id uuid)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_sessao   public.joint_sessions;
  v_row      public.joint_sessions;
  v_eu       public.joint_session_participants;
  v_parceiro public.joint_session_participants;
  v_pendentes text[];
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  -- Nada avança durante a pausa: sem isto, uma pausa por perda de presença
  -- viraria conclusão conjunta com o parceiro offline.
  if v_sessao.status <> 'active' then
    raise exception 'conclusão só com o treino em execução (status %)', v_sessao.status
      using errcode = '55000';
  end if;

  select * into v_eu from public.joint_session_participants
   where joint_session_id = p_joint_session_id and user_id = v_uid;
  select * into v_parceiro from public.joint_session_participants
   where joint_session_id = p_joint_session_id and user_id <> v_uid;

  if v_eu.completed_at is null then
    v_pendentes := public._forca_joint_fila_pendente(v_eu.session_log_id);
    if array_length(v_pendentes, 1) is not null then
      raise exception 'ainda há exercícios pendentes: %', array_to_string(v_pendentes, ', ')
        using errcode = 'P0001';
    end if;

    -- Reusa a finalização idempotente já provada da 0004/0020. O gatilho da
    -- seção 9 deixa passar porque aqui current_user é o dono da função.
    perform public.finish_session(v_eu.session_log_id);

    update public.joint_session_participants
       set completed_at = now(), queue_finished_at = coalesce(queue_finished_at, now())
     where joint_session_id = p_joint_session_id and user_id = v_uid;

    perform public._forca_joint_evento(
      p_joint_session_id, v_uid, 'participant_completed',
      jsonb_build_object('participant_completed', true));
  end if;

  if v_parceiro.completed_at is null then
    -- O turno não pode ficar preso com quem já terminou.
    if v_sessao.current_turn_user_id = v_uid then
      update public.joint_sessions
         set current_turn_user_id = v_parceiro.user_id, turn_seq = turn_seq + 1
       where id = p_joint_session_id;
    end if;
    select * into v_row from public.joint_sessions where id = p_joint_session_id;
    return v_row;
  end if;

  -- Evento ANTES do terminal: depois dele, o gatilho de imutabilidade recusa
  -- qualquer update em joint_sessions, inclusive o de event_seq.
  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, 'completed', jsonb_build_object('to_status', 'completed'));

  update public.joint_sessions
     set status = 'completed', ended_at = now()
   where id = p_joint_session_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.abandon_joint_session(p_joint_session_id uuid)
returns public.joint_sessions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_sessao public.joint_sessions;
  v_row    public.joint_sessions;
  v_destino text;
  v_copia  uuid;
  v_copias uuid[];
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_sessao from public.joint_sessions where id = p_joint_session_id for update;
  if v_sessao.id is null or public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;
  if v_sessao.status not in ('inviting', 'lobby', 'active', 'paused') then
    raise exception 'sessão conjunta já encerrada (status %)', v_sessao.status using errcode = '55000';
  end if;

  v_destino := case when v_sessao.status in ('inviting', 'lobby') then 'canceled' else 'abandoned' end;

  if v_destino = 'canceled' then
    -- Nada foi executado: as seleções são liberadas para que a sessão real do
    -- plano volte a ser usável em outro treino conjunto (o unique parcial de
    -- planned_session_id a prenderia para sempre, senão).
    -- Mesma ordem obrigatória do set_joint_session_mode: soltar as FKs antes
    -- de apagar a cópia (ON DELETE RESTRICT em participants.planned_session_id).
    select coalesce(array_agg(ps.id), '{}'::uuid[]) into v_copias
      from public.joint_session_participants p
      join public.planned_sessions ps on ps.id = p.planned_session_id
      join public.training_plans tp on tp.id = ps.plan_id
     where p.joint_session_id = p_joint_session_id
       and tp.purpose = 'joint';

    update public.joint_session_participants
       set planned_session_id = null, session_log_id = null, ready = false, ready_at = null
     where joint_session_id = p_joint_session_id;

    update public.planned_sessions
       set joint_session_id = null
     where joint_session_id = p_joint_session_id;

    foreach v_copia in array v_copias loop
      if not exists (select 1 from public.session_logs where planned_session_id = v_copia) then
        delete from public.planned_sessions where id = v_copia;
      end if;
    end loop;

    -- Escopo por usuário é obrigatório: sem o `in (...)`, uma definer apagaria o
    -- container VAZIO de qualquer outra conta do banco.
    delete from public.training_plans tp
     where tp.purpose = 'joint'
       and tp.user_id in (
         select user_id from public.joint_session_participants
          where joint_session_id = p_joint_session_id
       )
       and not exists (select 1 from public.planned_sessions ps where ps.plan_id = tp.id);
  end if;
  -- Em 'abandoned' o vínculo PERMANECE: houve execução, e a trilha é o que
  -- liga os dois registros individuais à mesma sessão conjunta.

  perform public._forca_joint_evento(
    p_joint_session_id, v_uid, v_destino, jsonb_build_object('to_status', v_destino));

  update public.joint_sessions
     set status = v_destino, ended_at = now(),
         pause_reason = null, current_turn_user_id = null
   where id = p_joint_session_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Projeção MÍNIMA do parceiro. Existe porque a RLS de profiles (0000) só
-- entrega a própria linha, e o lobby precisa dizer com quem se está treinando.
-- Continua respondendo em sessão terminal: o histórico precisa do nome.
create or replace function public.joint_session_partner_profile(p_joint_session_id uuid)
returns table (user_id uuid, display_name text, avatar_url text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;
  if public._forca_joint_papel(p_joint_session_id, v_uid) is null then
    raise exception 'sessão conjunta % inexistente ou alheia', p_joint_session_id
      using errcode = '42501';
  end if;

  return query
    select pr.id,
           coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''),
                    nullif(btrim(coalesce(pr.username, '')), ''),
                    'Parceiro'),
           pr.avatar_url
      from public.joint_session_participants p
      join public.profiles pr on pr.id = p.user_id
     where p.joint_session_id = p_joint_session_id
       and p.user_id <> v_uid;
end;
$$;

-- ============================================================
-- 9. Guard das tabelas existentes
-- ============================================================
--
-- `planned_sessions` e `session_logs` têm policy `FOR ALL` do dono desde a 0001,
-- e `start_session`/`finish_session`/`skip_planned_session` são `INVOKER`. Sem os
-- gatilhos abaixo, o player solo em outro aparelho concluiria, pularia ou
-- desvincularia a sessão no meio do treino conjunto.
--
-- Mecanismo RECUSADO, escrito para ninguém "consertar" isto depois:
-- `revoke update (joint_session_id) ... from authenticated` é NO-OP aqui — o
-- Supabase concede UPDATE em nível de TABELA a authenticated, e no PostgreSQL o
-- privilégio de tabela cobre todas as colunas. Fazê-lo funcionar exigiria
-- revogar o UPDATE da tabela e regrantar todas as outras colunas, plantando uma
-- armadilha para a próxima migration que adicionar coluna.

-- Leitura do vínculo para os gatilhos do guard.
--
-- DEFINER porque a RLS não pode cegar o guard: se a consulta voltasse vazia por
-- falta de permissão, o gatilho concluiria "não há vínculo" e deixaria o bypass
-- passar. E SEGURA DE CONCEDER a `authenticated` porque só responde sobre uma
-- `planned_sessions` do PRÓPRIO `auth.uid()` — não serve de oráculo sobre a
-- sessão de ninguém.
--
-- Precisa ser concedida: o gatilho é INVOKER (senão `current_user` viraria o
-- dono e o guard se desligaria), então ele executa com o papel do cliente e não
-- alcançaria uma função revogada. Foi exatamente esse o furo que travou o
-- `finish_session` solo depois de `abandoned`.
create or replace function public._forca_joint_status(p_joint_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select status from public.joint_sessions where id = p_joint_session_id;
$$;

create or replace function public._forca_joint_vinculo_do_dono(p_planned_session_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select j.status
    from public.planned_sessions ps
    join public.joint_sessions j on j.id = ps.joint_session_id
   where ps.id = p_planned_session_id
     and ps.user_id = auth.uid();
$$;

comment on function public._forca_joint_vinculo_do_dono(uuid) is
  'Status do treino conjunto ligado a uma sessão planejada DO PRÓPRIO usuário. Null quando não há vínculo ou a sessão não é dele.';

create or replace function public._forca_guarda_planned_session()
returns trigger
language plpgsql
-- SECURITY INVOKER de propósito: dentro de um DEFINER, `current_user` vira o
-- DONO da função e `_forca_papel_de_cliente()` responderia "não é cliente" para
-- todo mundo — o guard passaria a autorizar exatamente o que existe para barrar.
-- As leituras que a RLS poderia cegar vão pelos helpers DEFINER acima.
security invoker
set search_path = public, pg_temp
as $$
declare
  v_vinculo uuid;
  v_status  text;
begin
  if tg_op = 'DELETE' then
    -- `current_user` inline: o gatilho é INVOKER e não alcançaria uma função
    -- revogada de `authenticated`. Chamada de função aqui foi o que quebrou
    -- o caminho pós-abandono.
    if old.joint_session_id is null or current_user not in ('authenticated', 'anon') then
      return old;
    end if;
    raise exception 'sessão vinculada a treino conjunto não é apagada pelo cliente'
      using errcode = '42501';
  end if;

  -- Fluxo solo não paga nada: sai antes de qualquer consulta.
  if old.joint_session_id is null and new.joint_session_id is null then
    return new;
  end if;
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.joint_session_id is distinct from old.joint_session_id then
    raise exception 'vínculo de treino conjunto não é editável pelo cliente'
      using errcode = '42501';
  end if;

  v_status := public._forca_joint_vinculo_do_dono(old.id);
  if v_status in ('inviting', 'lobby', 'active', 'paused')
     and new.status is distinct from old.status then
    raise exception 'sessão em treino conjunto: o status muda pela máquina conjunta'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists planned_sessions_guarda_joint on public.planned_sessions;
create trigger planned_sessions_guarda_joint
  before update or delete on public.planned_sessions
  for each row execute function public._forca_guarda_planned_session();

create or replace function public._forca_guarda_session_log()
returns trigger
language plpgsql
-- SECURITY INVOKER pelo mesmo motivo do gatilho acima.
security invoker
set search_path = public, pg_temp
as $$
declare
  v_vinculo uuid;
  v_status  text;
begin
  if tg_op = 'DELETE' then
    if current_user not in ('authenticated', 'anon') then
      return old;
    end if;
    if public._forca_joint_vinculo_do_dono(old.planned_session_id) is null then
      return old;
    end if;
    raise exception 'execução de treino conjunto não é apagada pelo cliente'
      using errcode = '42501';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_status := public._forca_joint_vinculo_do_dono(new.planned_session_id);
  if v_status is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_status in ('inviting', 'lobby', 'active', 'paused') then
      raise exception 'a execução do treino conjunto nasce na ativação bilateral'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_status in ('inviting', 'lobby', 'active', 'paused')
     and new.finished_at is distinct from old.finished_at then
    raise exception 'conclusão em treino conjunto passa por complete_joint_participant'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists session_logs_guarda_joint on public.session_logs;
create trigger session_logs_guarda_joint
  before insert or update or delete on public.session_logs
  for each row execute function public._forca_guarda_session_log();

-- `set_logs` NÃO ganha guard, e é escolha: registrar e corrigir a própria série
-- é execução legítima e não avança turno. Quem avança é advance_joint_turn, que
-- exige série ainda não consumida.

-- ============================================================
-- 10. Realtime
-- ============================================================
-- A RLS de SELECT é o que o Realtime avalia por assinante: um intruso inscrito
-- no canal não recebe as mudanças. joint_invite_attempts fica DE FORA — o
-- contador de tentativas não é sincronizado com cliente nenhum.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'joint_sessions'
    ) then
      alter publication supabase_realtime add table public.joint_sessions;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'joint_session_participants'
    ) then
      alter publication supabase_realtime add table public.joint_session_participants;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'joint_session_events'
    ) then
      alter publication supabase_realtime add table public.joint_session_events;
    end if;
  end if;
end
$$;

-- ============================================================
-- 11. Grants — revoke de public E de anon (aprendizado da 0019/0020)
-- ============================================================
-- Os default privileges do Supabase concedem EXECUTE a anon/authenticated na
-- criação de QUALQUER função: `revoke from public` sozinho não corta anon.

revoke all on function public.create_joint_session()                                     from public, anon;
revoke all on function public.join_joint_session(text)                                   from public, anon;
revoke all on function public.set_joint_session_mode(uuid, text, text)                   from public, anon;
revoke all on function public.confirm_joint_participant_session(uuid, uuid)              from public, anon;
revoke all on function public.materialize_joint_session_copy(uuid)                       from public, anon;
revoke all on function public.set_joint_participant_ready(uuid, boolean)                 from public, anon;
revoke all on function public.advance_joint_turn(uuid, text, bigint, uuid)               from public, anon;
revoke all on function public.mark_joint_queue_finished(uuid)                            from public, anon;
revoke all on function public.pause_joint_session(uuid, text)                            from public, anon;
revoke all on function public.resume_joint_session(uuid)                                 from public, anon;
revoke all on function public.touch_joint_presence(uuid)                                 from public, anon;
revoke all on function public.complete_joint_participant(uuid)                           from public, anon;
revoke all on function public.abandon_joint_session(uuid)                                from public, anon;
revoke all on function public.joint_session_partner_profile(uuid)                        from public, anon;

grant execute on function public.create_joint_session()                                  to authenticated;
grant execute on function public.join_joint_session(text)                                to authenticated;
grant execute on function public.set_joint_session_mode(uuid, text, text)                to authenticated;
grant execute on function public.confirm_joint_participant_session(uuid, uuid)           to authenticated;
grant execute on function public.materialize_joint_session_copy(uuid)                    to authenticated;
grant execute on function public.set_joint_participant_ready(uuid, boolean)              to authenticated;
grant execute on function public.advance_joint_turn(uuid, text, bigint, uuid)            to authenticated;
grant execute on function public.mark_joint_queue_finished(uuid)                         to authenticated;
grant execute on function public.pause_joint_session(uuid, text)                         to authenticated;
grant execute on function public.resume_joint_session(uuid)                              to authenticated;
grant execute on function public.touch_joint_presence(uuid)                              to authenticated;
grant execute on function public.complete_joint_participant(uuid)                        to authenticated;
grant execute on function public.abandon_joint_session(uuid)                             to authenticated;
grant execute on function public.joint_session_partner_profile(uuid)                     to authenticated;

-- Internas: alcançáveis SÓ de dentro das definer. authenticated não executa.
revoke all on function public._forca_papel_de_cliente()                            from public, anon, authenticated;
revoke all on function public._forca_joint_presenca_ttl()                          from public, anon, authenticated;
revoke all on function public._forca_joint_payload_valido(jsonb)                   from public, anon, authenticated;
revoke all on function public._forca_joint_codigo_novo()                           from public, anon, authenticated;
revoke all on function public._forca_joint_papel(uuid, uuid)                       from public, anon, authenticated;
revoke all on function public._forca_joint_fila_pendente(uuid)                     from public, anon, authenticated;
-- Concedida de propósito (ver comentário da função): o gatilho INVOKER precisa
-- alcançá-la, e ela só responde sobre sessão do próprio chamador.
revoke all on function public._forca_joint_status(uuid)                            from public, anon, authenticated;
revoke all on function public._forca_joint_vinculo_do_dono(uuid)                   from public, anon;
grant execute on function public._forca_joint_vinculo_do_dono(uuid)                to authenticated;
revoke all on function public._forca_joint_evento(uuid, uuid, text, jsonb, text, uuid, bigint, bigint)
  from public, anon, authenticated;

-- Tabelas: a RLS já barra, mas privilégio explícito é a segunda tranca. As
-- tabelas de domínio só permitem SELECT; attempts não permite nada.
revoke all on table public.joint_sessions             from anon;
revoke all on table public.joint_session_participants from anon;
revoke all on table public.joint_session_events       from anon;
revoke all on table public.joint_invite_attempts      from public, anon, authenticated;

revoke insert, update, delete, truncate on table public.joint_sessions             from authenticated;
revoke insert, update, delete, truncate on table public.joint_session_participants from authenticated;
revoke insert, update, delete, truncate on table public.joint_session_events       from authenticated;

grant select on table public.joint_sessions             to authenticated;
grant select on table public.joint_session_participants to authenticated;
grant select on table public.joint_session_events       to authenticated;

-- ============================================================
-- 12. Asserções — o que esta migration promete existe de fato
-- ============================================================

do $$
declare
  v_t   text;
  v_fn  text;
  v_n   int;
begin
  -- Tabelas com RLS
  foreach v_t in array array[
    'joint_sessions', 'joint_session_participants',
    'joint_session_events', 'joint_invite_attempts'
  ] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = v_t) then
      raise exception 'asserção falhou: tabela % não existe', v_t;
    end if;
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = v_t and rowsecurity
    ) then
      raise exception 'asserção falhou: RLS desligada em %', v_t;
    end if;
  end loop;

  -- Exatamente uma policy, de SELECT, nas 3 de domínio
  foreach v_t in array array[
    'joint_sessions', 'joint_session_participants', 'joint_session_events'
  ] loop
    select count(*) into v_n from pg_policy where polrelid = ('public.' || v_t)::regclass;
    if v_n <> 1 then
      raise exception 'asserção falhou: % tem % policies (esperado 1)', v_t, v_n;
    end if;
    if not exists (
      select 1 from pg_policy where polrelid = ('public.' || v_t)::regclass and polcmd = 'r'
    ) then
      raise exception 'asserção falhou: a policy de % não é de SELECT', v_t;
    end if;
  end loop;

  -- attempts: zero policies e zero privilégio de cliente
  select count(*) into v_n from pg_policy where polrelid = 'public.joint_invite_attempts'::regclass;
  if v_n <> 0 then
    raise exception 'asserção falhou: joint_invite_attempts tem % policies (esperado 0)', v_n;
  end if;
  foreach v_t in array array['select', 'insert', 'update', 'delete'] loop
    if has_table_privilege('authenticated', 'public.joint_invite_attempts', v_t) then
      raise exception 'asserção falhou: authenticated ainda tem % em joint_invite_attempts', v_t;
    end if;
    if has_table_privilege('anon', 'public.joint_invite_attempts', v_t) then
      raise exception 'asserção falhou: anon ainda tem % em joint_invite_attempts', v_t;
    end if;
  end loop;

  -- Nenhuma escrita direta nas tabelas de domínio
  foreach v_t in array array[
    'joint_sessions', 'joint_session_participants', 'joint_session_events'
  ] loop
    if has_table_privilege('authenticated', 'public.' || v_t, 'insert')
       or has_table_privilege('authenticated', 'public.' || v_t, 'update')
       or has_table_privilege('authenticated', 'public.' || v_t, 'delete') then
      raise exception 'asserção falhou: authenticated escreve direto em %', v_t;
    end if;
    if not has_table_privilege('authenticated', 'public.' || v_t, 'select') then
      raise exception 'asserção falhou: authenticated não lê % (Realtime silenciaria)', v_t;
    end if;
  end loop;

  -- As 14 RPCs: anon fora, authenticated dentro
  foreach v_fn in array array[
    'public.create_joint_session()',
    'public.join_joint_session(text)',
    'public.set_joint_session_mode(uuid, text, text)',
    'public.confirm_joint_participant_session(uuid, uuid)',
    'public.materialize_joint_session_copy(uuid)',
    'public.set_joint_participant_ready(uuid, boolean)',
    'public.advance_joint_turn(uuid, text, bigint, uuid)',
    'public.mark_joint_queue_finished(uuid)',
    'public.pause_joint_session(uuid, text)',
    'public.resume_joint_session(uuid)',
    'public.touch_joint_presence(uuid)',
    'public.complete_joint_participant(uuid)',
    'public.abandon_joint_session(uuid)',
    'public.joint_session_partner_profile(uuid)'
  ] loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception 'asserção falhou: anon ainda executa %', v_fn;
    end if;
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'asserção falhou: authenticated não executa %', v_fn;
    end if;
  end loop;

  -- Internas: authenticated NÃO executa
  foreach v_fn in array array[
    'public._forca_papel_de_cliente()',
    'public._forca_joint_presenca_ttl()',
    'public._forca_joint_payload_valido(jsonb)',
    'public._forca_joint_codigo_novo()',
    'public._forca_joint_papel(uuid, uuid)',
    'public._forca_joint_fila_pendente(uuid)',
    'public._forca_joint_status(uuid)'
  ] loop
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception 'asserção falhou: authenticated executa a interna %', v_fn;
    end if;
  end loop;

  -- Guard instalado nas duas tabelas existentes
  if not exists (
    select 1 from pg_trigger where tgname = 'planned_sessions_guarda_joint' and not tgisinternal
  ) then
    raise exception 'asserção falhou: guard de planned_sessions ausente';
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'session_logs_guarda_joint' and not tgisinternal
  ) then
    raise exception 'asserção falhou: guard de session_logs ausente';
  end if;

  -- Nenhuma definer PRÉ-EXISTENTE escreve nas tabelas guardadas (H14)
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and p.proname not like '\_forca\_%'
     and p.proname not in (
       'create_joint_session', 'join_joint_session', 'set_joint_session_mode',
       'confirm_joint_participant_session', 'materialize_joint_session_copy',
       'set_joint_participant_ready', 'advance_joint_turn', 'mark_joint_queue_finished',
       'pause_joint_session', 'resume_joint_session', 'touch_joint_presence',
       'complete_joint_participant', 'abandon_joint_session', 'joint_session_partner_profile'
     )
     and (p.prosrc ~* 'insert\s+into\s+public\.(planned_sessions|session_logs)'
       or p.prosrc ~* 'update\s+public\.(planned_sessions|session_logs)'
       or p.prosrc ~* 'delete\s+from\s+public\.(planned_sessions|session_logs)');
  if v_n > 0 then
    raise exception 'asserção falhou: % função(ões) definer pré-existente(s) escrevem nas tabelas guardadas', v_n;
  end if;

  -- Colunas e índices prometidos
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'training_plans' and column_name = 'purpose'
  ) then
    raise exception 'asserção falhou: training_plans.purpose não existe';
  end if;
  if exists (select 1 from public.training_plans where purpose is null) then
    raise exception 'asserção falhou: training_plans.purpose com nulo após o backfill';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'planned_sessions'
       and column_name = 'joint_session_id'
  ) then
    raise exception 'asserção falhou: planned_sessions.joint_session_id não existe';
  end if;

  foreach v_t in array array[
    'joint_sessions_invite_code_idx',
    'joint_participants_papel_unico_idx',
    'joint_participants_um_vivo_por_usuario_idx',
    'joint_participants_sessao_unica_idx',
    'joint_events_seq_idx',
    'joint_events_client_id_idx',
    'joint_events_set_log_idx',
    'training_plans_um_container_joint_idx'
  ] loop
    if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = v_t) then
      raise exception 'asserção falhou: índice % não existe', v_t;
    end if;
  end loop;

  -- Toda função desta migration com search_path travado
  select count(*) into v_n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'joint\_%' or p.proname like '\_forca\_joint\_%'
          or p.proname in ('create_joint_session', 'join_joint_session',
              'set_joint_session_mode', 'confirm_joint_participant_session',
              'materialize_joint_session_copy', 'set_joint_participant_ready',
              'advance_joint_turn', 'mark_joint_queue_finished', 'pause_joint_session',
              'resume_joint_session', 'touch_joint_presence', 'complete_joint_participant',
              'abandon_joint_session', '_forca_papel_de_cliente',
              '_forca_guarda_planned_session', '_forca_guarda_session_log'))
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'));
  if v_n > 0 then
    raise exception 'asserção falhou: % função(ões) sem search_path travado', v_n;
  end if;
end
$$;
