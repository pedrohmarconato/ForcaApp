-- supabase/proofs/0026_treino_conjunto.sql
-- Prova transacional da migration 0026 — Treino Conjunto 2.0, Sprint 01.
--
-- COMO RODAR (só em HOMOLOGAÇÃO, ref mjdjtiujhwklchalquhc):
--   scripts/supabase-preflight.sh hml
--   psql "$FORCA_HML_URL" -f supabase/proofs/0026_treino_conjunto.sql
--
-- Tudo roda dentro de `begin ... rollback`: as duas contas sintéticas e todo o
-- dado que elas geram desaparecem quando a transação volta. A limpeza é o
-- próprio rollback, não um `delete` de confiança.
--
-- O QUE ESTA PROVA **NÃO** COBRE, e por quê:
--   as corridas (dois joins no mesmo código, dois advances com o mesmo seq,
--   dois ready simultâneos, contador sob concorrência, pertencimento cross-role
--   concorrente). Uma conexão não executa transações concorrentes — chamar isto
--   de prova de concorrência seria evidência falsa. Essas cinco estão em
--   `scripts/joint-concurrency-smoke.mjs`, que abre conexões de verdade.
--
-- Cada bloco levanta exceção com prefixo 'FALHOU:' quando o invariante quebra.

\set ON_ERROR_STOP on

begin;

do $prova$
declare
  v_a          uuid := gen_random_uuid();  -- anfitrião
  v_b          uuid := gen_random_uuid();  -- convidado
  v_c          uuid := gen_random_uuid();  -- intruso
  v_plano_a    uuid;
  v_plano_b    uuid;
  v_sessao_a   uuid;
  v_sessao_b   uuid;
  v_ex_a       uuid;
  v_set_a1     uuid;
  v_set_a2     uuid;
  v_js         public.joint_sessions;
  v_js2        public.joint_sessions;
  v_codigo     text;
  v_copia      public.planned_sessions;
  v_part       public.joint_session_participants;
  v_log_a      uuid;
  v_log_b      uuid;
  v_setlog_a   uuid;
  v_setlog_b   uuid;
  v_n          int;
  v_md5_antes  text;
  v_md5_depois text;
  v_txt        text;
  v_serie      public.set_logs;
begin
  -- ============================================================
  -- Fixtures (como owner; os user_id são explícitos)
  -- ============================================================
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'proof-' || u || '@forca.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    from unnest(array[v_a, v_b, v_c]) as u;

  insert into public.training_plans (user_id, name, status, purpose)
       values (v_a, 'PROVA 0026 A', 'active', 'solo') returning id into v_plano_a;
  insert into public.training_plans (user_id, name, status, purpose)
       values (v_b, 'PROVA 0026 B', 'active', 'solo') returning id into v_plano_b;

  insert into public.planned_sessions (plan_id, user_id, week_number, title, muscle_groups)
       values (v_plano_a, v_a, 1, 'Peito A', array['Peito']) returning id into v_sessao_a;
  insert into public.planned_sessions (plan_id, user_id, week_number, title, muscle_groups)
       values (v_plano_b, v_b, 1, 'Peito B', array['Peito']) returning id into v_sessao_b;

  -- Exercício com dado PRIVADO preenchido: é o que a cópia não pode levar.
  insert into public.planned_exercises (
    session_id, exercise_order, name, notes, name_original, injury_flags,
    exercise_key, metric, equipment
  )
  values (
    v_sessao_a, 1, 'Supino reto', 'aumentar amplitude — conversa da consulta',
    'Supino Reto (original)', array['ombro_direito'], 'supino_reto', 'carga_reps', 'barra'
  )
  returning id into v_ex_a;

  insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max,
                                   target_load_kg, target_rir)
       values (v_ex_a, 1, 8, 10, 60, 2) returning id into v_set_a1;
  insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max,
                                   target_load_kg, target_rir)
       values (v_ex_a, 2, 8, 10, 60, 2) returning id into v_set_a2;

  -- ============================================================
  -- B20a — anon não executa nenhuma das 14 (falha por PRIVILÉGIO)
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','anon')::text, true);
  set local role anon;
  begin
    perform public.create_joint_session();
    raise exception 'FALHOU: anon executou create_joint_session';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.advance_joint_turn(gen_random_uuid(), 'x', 1, gen_random_uuid());
    raise exception 'FALHOU: anon executou advance_joint_turn';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- ============================================================
  -- C1/C1b — convite: idempotência e rotação do expirado
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  set local role authenticated;

  v_js := public.create_joint_session();
  if v_js.status <> 'inviting' then raise exception 'FALHOU: sessão nova não é inviting'; end if;
  v_codigo := v_js.invite_code;

  v_js2 := public.create_joint_session();
  if v_js2.id <> v_js.id then raise exception 'FALHOU: create_joint_session não foi idempotente'; end if;

  -- C1b: convite expirado ROTACIONA em vez de prender o usuário.
  reset role;
  update public.joint_sessions set invite_expires_at = now() - interval '1 minute' where id = v_js.id;
  set local role authenticated;
  v_js2 := public.create_joint_session();
  if v_js2.invite_code = v_codigo then
    raise exception 'FALHOU: convite expirado não rotacionou o código';
  end if;
  if v_js2.invite_expires_at <= now() then
    raise exception 'FALHOU: convite rotacionado já nasceu expirado';
  end if;
  v_codigo := v_js2.invite_code;

  -- B14 — o anfitrião não entra no próprio convite
  begin
    perform public.join_joint_session(v_codigo);
    raise exception 'FALHOU: anfitrião entrou no próprio convite';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '55000' then raise exception 'FALHOU: errcode % no self-join', sqlstate; end if;
  end;

  -- B12 — inexistente e consumido devolvem a MESMA resposta (nula)
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role','authenticated')::text, true);
  if public.join_joint_session('ZZZZZZ') is not null then
    raise exception 'FALHOU: código inexistente foi aceito';
  end if;

  -- ============================================================
  -- C2/A11 — join legítimo e pertencimento vivo
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  v_js := public.join_joint_session(v_codigo);
  if v_js.status <> 'lobby' or v_js.guest_user_id <> v_b then
    raise exception 'FALHOU: join não levou ao lobby com o convidado certo';
  end if;

  -- B16 — convite consumido não aceita um terceiro
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role','authenticated')::text, true);
  if public.join_joint_session(v_codigo) is not null then
    raise exception 'FALHOU: convite consumido aceitou um terceiro';
  end if;

  -- A11 (sequencial) — B já vivo não cria outra sessão
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  begin
    perform public.create_joint_session();
    raise exception 'FALHOU: usuário vivo criou uma segunda sessão conjunta';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '55000' then raise exception 'FALHOU: errcode % no pertencimento vivo', sqlstate; end if;
  end;

  -- B11 — o intruso não enxerga nem opera
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.joint_sessions where id = v_js.id;
  if v_n <> 0 then raise exception 'FALHOU: intruso enxerga a sessão conjunta'; end if;
  select count(*) into v_n from public.joint_session_participants where joint_session_id = v_js.id;
  if v_n <> 0 then raise exception 'FALHOU: intruso enxerga os participantes'; end if;
  begin
    perform public.set_joint_participant_ready(v_js.id, true);
    raise exception 'FALHOU: intruso operou a sessão conjunta';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % para intruso', sqlstate; end if;
  end;

  -- ============================================================
  -- C3/D — modo, elegibilidade e cópia
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);

  -- C3 — só o host escolhe o modo
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  begin
    perform public.set_joint_session_mode(v_js.id, 'each_own', 'Peito');
    raise exception 'FALHOU: convidado escolheu o modo';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % no modo pelo convidado', sqlstate; end if;
  end;

  -- D1a — each_own com grupo incompatível
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  perform public.set_joint_session_mode(v_js.id, 'each_own', 'Costas');
  begin
    perform public.confirm_joint_participant_session(v_js.id, v_sessao_a);
    raise exception 'FALHOU: sessão inelegível foi aceita para o grupo';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '22023' then raise exception 'FALHOU: errcode % na inelegibilidade', sqlstate; end if;
  end;

  -- host_plan: A confirma a real, B materializa a cópia
  perform public.set_joint_session_mode(v_js.id, 'host_plan');
  v_part := public.confirm_joint_participant_session(v_js.id, v_sessao_a);
  if v_part.planned_session_id <> v_sessao_a then
    raise exception 'FALHOU: confirmação não gravou a sessão do host';
  end if;

  -- D6a(b) — confirmar sessão ALHEIA é recusado
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  begin
    perform public.confirm_joint_participant_session(v_js.id, v_sessao_a);
    raise exception 'FALHOU: convidado confirmou a sessão do parceiro';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % ao confirmar alheia', sqlstate; end if;
  end;

  -- D6a(c) — o convidado não LÊ a sessão do parceiro
  select count(*) into v_n from public.planned_sessions where id = v_sessao_a;
  if v_n <> 0 then raise exception 'FALHOU: convidado lê a planned_session do parceiro'; end if;

  -- D3a — cópia idempotente
  v_copia := public.materialize_joint_session_copy(v_js.id);
  if v_copia.user_id <> v_b then raise exception 'FALHOU: a cópia não pertence a quem a pediu'; end if;
  declare
    v_copia2 public.planned_sessions;
  begin
    v_copia2 := public.materialize_joint_session_copy(v_js.id);
    if v_copia2.id <> v_copia.id then
      raise exception 'FALHOU: materialize_joint_session_copy não foi idempotente';
    end if;
  end;

  -- B17/D4a — o que a cópia leva e o que ela NÃO leva
  reset role;
  select count(*) into v_n
    from public.planned_exercises pe
   where pe.session_id = v_copia.id
     and (pe.notes is not null or pe.name_original is not null
          or coalesce(array_length(pe.injury_flags, 1), 0) > 0);
  if v_n > 0 then raise exception 'FALHOU: a cópia levou notes/name_original/injury_flags'; end if;

  select count(*) into v_n
    from public.planned_sets ps
    join public.planned_exercises pe on pe.id = ps.exercise_id
   where pe.session_id = v_copia.id and ps.target_load_kg is not null;
  if v_n > 0 then raise exception 'FALHOU: a cópia levou a carga do parceiro'; end if;

  select count(*) into v_n
    from public.planned_exercises pe
   where pe.session_id = v_copia.id
     and pe.exercise_key = 'supino_reto' and pe.metric = 'carga_reps';
  if v_n <> 1 then raise exception 'FALHOU: a cópia perdeu exercise_key/metric'; end if;

  select count(*) into v_n
    from public.planned_sets ps
    join public.planned_exercises pe on pe.id = ps.exercise_id
   where pe.session_id = v_copia.id;
  if v_n <> 2 then raise exception 'FALHOU: a cópia tem % séries (esperado 2)', v_n; end if;

  -- D4b/D5a — container arquivado, sem raw_plan
  select count(*) into v_n
    from public.training_plans
   where user_id = v_b and purpose = 'joint'
     and status = 'archived' and raw_plan is null and description is null;
  if v_n <> 1 then raise exception 'FALHOU: container joint fora do formato'; end if;

  -- E5 — o plano ativo do convidado NÃO enxerga a cópia
  select count(*) into v_n
    from public.planned_sessions ps
    join public.training_plans tp on tp.id = ps.plan_id
   where ps.user_id = v_b and tp.status = 'active' and ps.joint_session_id is not null;
  if v_n <> 0 then raise exception 'FALHOU: a cópia caiu no plano ativo do convidado'; end if;

  set local role authenticated;
  perform public.confirm_joint_participant_session(v_js.id, v_copia.id);

  -- ============================================================
  -- H4/H5 — nenhum log nasce no lobby
  -- ============================================================
  select count(*) into v_n from public.session_logs where planned_session_id in (v_sessao_a, v_copia.id);
  if v_n <> 0 then raise exception 'FALHOU: já existe log antes da ativação'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  begin
    perform public.start_session(v_sessao_a);
    raise exception 'FALHOU: start_session criou log no lobby';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % no start_session do lobby', sqlstate; end if;
  end;
  begin
    insert into public.session_logs (planned_session_id, user_id) values (v_sessao_a, v_a);
    raise exception 'FALHOU: insert direto criou log no lobby';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % no insert direto', sqlstate; end if;
  end;

  select count(*) into v_n from public.session_logs where planned_session_id in (v_sessao_a, v_copia.id);
  if v_n <> 0 then raise exception 'FALHOU: bypass criou log mesmo tendo sido recusado'; end if;

  -- ============================================================
  -- C4/C5 — prontidão e ativação bilateral
  -- ============================================================
  perform public.set_joint_participant_ready(v_js.id, true);
  reset role;
  select count(*) into v_n from public.session_logs where planned_session_id in (v_sessao_a, v_copia.id);
  if v_n <> 0 then raise exception 'FALHOU: um ready sozinho já criou log (C5b)'; end if;
  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  v_js := public.set_joint_participant_ready(v_js.id, true);

  if v_js.status <> 'active' or v_js.turn_seq <> 1 or v_js.current_turn_user_id <> v_a then
    raise exception 'FALHOU: ativação bilateral não pôs o turno no host com seq 1';
  end if;

  reset role;
  select p.session_log_id into v_log_a from public.joint_session_participants p
   where p.joint_session_id = v_js.id and p.user_id = v_a;
  select p.session_log_id into v_log_b from public.joint_session_participants p
   where p.joint_session_id = v_js.id and p.user_id = v_b;
  if v_log_a is null or v_log_b is null or v_log_a = v_log_b then
    raise exception 'FALHOU: a ativação não deu um log próprio a cada participante';
  end if;

  -- C5c — cada log no nome do dono, não de quem apertou "pronto"
  select count(*) into v_n from public.session_logs where id = v_log_a and user_id = v_a;
  if v_n <> 1 then raise exception 'FALHOU: o log do host saiu no nome errado'; end if;
  select count(*) into v_n from public.session_logs where id = v_log_b and user_id = v_b;
  if v_n <> 1 then raise exception 'FALHOU: o log do convidado saiu no nome errado'; end if;

  select count(*) into v_n from public.planned_sessions
   where id in (v_sessao_a, v_copia.id) and status = 'in_progress';
  if v_n <> 2 then raise exception 'FALHOU: as duas sessões não foram para in_progress'; end if;

  -- C5f — retry do ready devolve os mesmos logs
  set local role authenticated;
  perform public.set_joint_participant_ready(v_js.id, true);
  reset role;
  select count(*) into v_n from public.session_logs
   where planned_session_id in (v_sessao_a, v_copia.id) and finished_at is null;
  if v_n <> 2 then raise exception 'FALHOU: retry do ready criou log a mais'; end if;

  -- ============================================================
  -- H — guard durante a execução
  -- ============================================================
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);

  select md5(j::text) into v_md5_antes from public.joint_sessions j where id = v_js.id;

  -- H1/H2 — o vínculo não é editável pelo cliente
  begin
    update public.planned_sessions set joint_session_id = null where id = v_sessao_a;
    raise exception 'FALHOU: cliente limpou joint_session_id';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % ao limpar vínculo', sqlstate; end if;
  end;

  -- H3 — status direto
  begin
    update public.planned_sessions set status = 'completed' where id = v_sessao_a;
    raise exception 'FALHOU: cliente mudou status da sessão em treino conjunto';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % ao mudar status', sqlstate; end if;
  end;

  -- H6 — finish_session solo durante o treino conjunto
  begin
    perform public.finish_session(v_log_a);
    raise exception 'FALHOU: finish_session concluiu no meio do treino conjunto';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % no finish_session', sqlstate; end if;
  end;

  -- H7 — update direto de finished_at
  begin
    update public.session_logs set finished_at = now() where id = v_log_a;
    raise exception 'FALHOU: cliente fechou o log direto';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % ao fechar log direto', sqlstate; end if;
  end;

  -- H8 — recusa da sessão inteira durante o treino conjunto
  begin
    perform public.skip_planned_session(v_sessao_a, 'cansaco');
    raise exception 'FALHOU: skip_planned_session pulou sessão em treino conjunto';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % no skip', sqlstate; end if;
  end;

  -- H9 — delete de linha vinculada
  begin
    delete from public.session_logs where id = v_log_a;
    raise exception 'FALHOU: cliente apagou o log vinculado';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % ao apagar log', sqlstate; end if;
  end;
  begin
    delete from public.planned_sessions where id = v_sessao_a;
    raise exception 'FALHOU: cliente apagou a sessão vinculada';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % ao apagar sessão', sqlstate; end if;
  end;

  -- H16 — nenhum bypass recusado alterou nada
  reset role;
  select md5(j::text) into v_md5_depois from public.joint_sessions j where id = v_js.id;
  if v_md5_antes is distinct from v_md5_depois then
    raise exception 'FALHOU: um bypass recusado mudou a sessão conjunta';
  end if;
  select count(*) into v_n from public.session_logs
   where id in (v_log_a, v_log_b) and finished_at is not null;
  if v_n <> 0 then raise exception 'FALHOU: um bypass fechou algum log'; end if;
  set local role authenticated;

  -- ============================================================
  -- C6..C12 — turno
  -- ============================================================
  -- Série do host (registrada pelo caminho normal, que continua livre)
  v_serie := public.save_set_log(v_log_a, v_set_a1, 8, 60, 2, 'on_target');
  select id into v_setlog_a from public.set_logs
   where session_log_id = v_log_a and planned_set_id = v_set_a1;

  -- C6 — quem não está na vez não avança
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  begin
    perform public.advance_joint_turn(v_js.id, 'ev-b-1', 1, v_setlog_a);
    raise exception 'FALHOU: quem não estava na vez avançou o turno';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '42501' then raise exception 'FALHOU: errcode % no avanço fora da vez', sqlstate; end if;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);

  -- C10 — série obrigatória e de quem avança
  begin
    perform public.advance_joint_turn(v_js.id, 'ev-nulo', 1, null);
    raise exception 'FALHOU: avanço sem série foi aceito';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '22023' then raise exception 'FALHOU: errcode % no avanço sem série', sqlstate; end if;
  end;

  -- C8 — seq desatualizado
  begin
    perform public.advance_joint_turn(v_js.id, 'ev-velho', 99, v_setlog_a);
    raise exception 'FALHOU: avanço com seq desatualizado foi aceito';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '40001' then raise exception 'FALHOU: errcode % no seq desatualizado', sqlstate; end if;
  end;

  -- C9 — avanço válido
  v_js := public.advance_joint_turn(v_js.id, 'ev-a-1', 1, v_setlog_a);
  if v_js.current_turn_user_id <> v_b or v_js.turn_seq <> 2 then
    raise exception 'FALHOU: o turno não passou ao parceiro';
  end if;

  -- C7 — retry idêntico é idempotente
  v_js := public.advance_joint_turn(v_js.id, 'ev-a-1', 1, v_setlog_a);
  if v_js.turn_seq <> 2 then raise exception 'FALHOU: retry do mesmo evento avançou de novo'; end if;
  reset role;
  select count(*) into v_n from public.joint_session_events
   where joint_session_id = v_js.id and client_event_id = 'ev-a-1';
  if v_n <> 1 then raise exception 'FALHOU: retry gravou % eventos', v_n; end if;
  set local role authenticated;

  -- C7b — mesmo id com parâmetros diferentes NÃO é retry
  begin
    perform public.advance_joint_turn(v_js.id, 'ev-a-1', 2, v_setlog_a);
    raise exception 'FALHOU: mesmo client_event_id com seq diferente passou como retry';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '22023' then raise exception 'FALHOU: errcode % no id reapresentado', sqlstate; end if;
  end;

  -- C10b — a mesma série não confirma o turno duas vezes
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  v_serie := public.save_set_log(v_log_b, (select ps.id from public.planned_sets ps
     join public.planned_exercises pe on pe.id = ps.exercise_id
    where pe.session_id = v_copia.id order by ps.set_order limit 1),
    10, 40, 3, 'on_target');
  select id into v_setlog_b from public.set_logs where session_log_id = v_log_b limit 1;
  v_js := public.advance_joint_turn(v_js.id, 'ev-b-2', 2, v_setlog_b);
  if v_js.current_turn_user_id <> v_a then raise exception 'FALHOU: turno não voltou ao host'; end if;

  begin
    perform public.advance_joint_turn(v_js.id, 'ev-b-3', v_js.turn_seq, v_setlog_b);
    raise exception 'FALHOU: a mesma série confirmou o turno duas vezes';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate not in ('22023','42501') then
      raise exception 'FALHOU: errcode % na série reusada', sqlstate;
    end if;
  end;

  -- ============================================================
  -- C12b/C16 — fila encerrada é verificável
  -- ============================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  begin
    perform public.mark_joint_queue_finished(v_js.id);
    raise exception 'FALHOU: fila com série pendente foi declarada encerrada';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> 'P0001' then raise exception 'FALHOU: errcode % na fila pendente', sqlstate; end if;
  end;

  begin
    perform public.complete_joint_participant(v_js.id);
    raise exception 'FALHOU: conclusão aceita com fila pendente';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> 'P0001' then raise exception 'FALHOU: errcode % na conclusão com pendência', sqlstate; end if;
  end;

  -- C16 (negativa) — nada foi concluído
  reset role;
  select count(*) into v_n from public.planned_sessions where id = v_sessao_a and status = 'completed';
  if v_n <> 0 then raise exception 'FALHOU: sessão virou completed com fila pendente'; end if;
  set local role authenticated;

  -- ============================================================
  -- C13/C14/C15 — pausa e presença
  -- ============================================================
  begin
    perform public.pause_joint_session(v_js.id, 'presence_lost');
    raise exception 'FALHOU: pausa por ausência aceita com o parceiro presente';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '55000' then raise exception 'FALHOU: errcode % na pausa indevida', sqlstate; end if;
  end;

  v_js := public.pause_joint_session(v_js.id, 'participant_request');
  if v_js.status <> 'paused' then raise exception 'FALHOU: a pausa não persistiu'; end if;
  -- C14 — idempotente
  v_js := public.pause_joint_session(v_js.id, 'participant_request');

  -- C13 — nada avança pausado
  begin
    perform public.advance_joint_turn(v_js.id, 'ev-pausa', v_js.turn_seq, v_setlog_a);
    raise exception 'FALHOU: turno avançou com o treino pausado';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '55000' then raise exception 'FALHOU: errcode % no avanço pausado', sqlstate; end if;
  end;

  -- C16b — conclusão não passa durante a pausa
  begin
    perform public.complete_joint_participant(v_js.id);
    raise exception 'FALHOU: conclusão aceita com o treino pausado';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '55000' then raise exception 'FALHOU: errcode % na conclusão pausada', sqlstate; end if;
  end;

  v_js := public.resume_joint_session(v_js.id);
  if v_js.status <> 'active' or v_js.pause_reason is not null then
    raise exception 'FALHOU: retomada não limpou o estado de pausa';
  end if;

  -- ============================================================
  -- E7..E13 — registro individual
  -- ============================================================
  -- Fecha a fila dos dois: série restante do host + recusa do que sobrar.
  v_serie := public.save_set_log(v_log_a, v_set_a2, 9, 62.5, 1, 'on_target');

  perform public.mark_joint_queue_finished(v_js.id);
  v_js := public.complete_joint_participant(v_js.id);
  if v_js.status = 'completed' then
    raise exception 'FALHOU: sessão conjunta concluiu com só um dos dois';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  -- A cópia tem 2 séries; a segunda é recusada em vez de executada.
  perform public.skip_session_exercise(
    v_log_b,
    (select pe.id from public.planned_exercises pe where pe.session_id = v_copia.id limit 1),
    'cansaco');
  v_js := public.complete_joint_participant(v_js.id);
  if v_js.status <> 'completed' or v_js.ended_at is null then
    raise exception 'FALHOU: sessão conjunta não concluiu com os dois prontos';
  end if;

  reset role;
  -- E7 — dois logs distintos
  select count(distinct id) into v_n from public.session_logs where id in (v_log_a, v_log_b);
  if v_n <> 2 then raise exception 'FALHOU: não há dois registros individuais'; end if;

  -- E8 — números diferentes
  select count(*) into v_n
    from public.set_logs a, public.set_logs b
   where a.session_log_id = v_log_a and b.session_log_id = v_log_b
     and a.actual_load_kg = b.actual_load_kg and a.actual_reps = b.actual_reps;
  if v_n > 0 then raise exception 'FALHOU: os dois históricos têm os mesmos números'; end if;

  -- E12 — trilha auditável dos dois lados
  select count(*) into v_n
    from public.session_logs l
    join public.planned_sessions ps on ps.id = l.planned_session_id
   where l.id in (v_log_a, v_log_b) and ps.joint_session_id = v_js.id;
  if v_n <> 2 then raise exception 'FALHOU: a trilha não liga os dois registros à sessão conjunta'; end if;

  -- A23a — terminal recusa as mutantes
  select md5(j::text) into v_md5_antes from public.joint_sessions j where id = v_js.id;
  set local role authenticated;
  begin
    perform public.pause_joint_session(v_js.id, 'participant_request');
    raise exception 'FALHOU: sessão terminal aceitou pausa';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
    if sqlstate <> '55000' then raise exception 'FALHOU: errcode % em terminal', sqlstate; end if;
  end;
  -- A23b — a leitura do parceiro continua servindo o histórico
  select display_name into v_txt from public.joint_session_partner_profile(v_js.id);
  if v_txt is null then raise exception 'FALHOU: perfil do parceiro sumiu depois do fim'; end if;
  reset role;
  select md5(j::text) into v_md5_depois from public.joint_sessions j where id = v_js.id;
  if v_md5_antes is distinct from v_md5_depois then
    raise exception 'FALHOU: uma RPC recusada mudou a sessão terminal';
  end if;

  -- A11b — encerrada, os dois voltam a poder criar treino conjunto
  select count(*) into v_n from public.joint_session_participants
   where joint_session_id = v_js.id and live;
  if v_n <> 0 then raise exception 'FALHOU: pertencimento continuou vivo depois do fim'; end if;

  -- H12 — não regressão solo: sessão SEM vínculo aceita o fluxo normal
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role','authenticated')::text, true);
  declare
    v_plano_c uuid; v_sessao_c uuid; v_log_c public.session_logs;
  begin
    reset role;
    insert into public.training_plans (user_id, name, status) values (v_c, 'SOLO C', 'active')
      returning id into v_plano_c;
    insert into public.planned_sessions (plan_id, user_id, week_number, title)
      values (v_plano_c, v_c, 1, 'Solo') returning id into v_sessao_c;
    set local role authenticated;
    v_log_c := public.start_session(v_sessao_c, 'normal', 60);
    perform public.finish_session(v_log_c.id);
    reset role;
    select count(*) into v_n from public.planned_sessions
     where id = v_sessao_c and status = 'completed';
    if v_n <> 1 then raise exception 'FALHOU: o fluxo solo quebrou com o guard instalado'; end if;
  end;

  raise notice 'PROVA 0026: todos os invariantes sequenciais passaram.';
end
$prova$;

rollback;
