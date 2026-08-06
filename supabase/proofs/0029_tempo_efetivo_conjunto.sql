-- supabase/proofs/0029_tempo_efetivo_conjunto.sql
-- Prova transacional da migration 0029 — achado A3: active_seconds do
-- revezamento não pode somar o turno do parceiro.
--
-- COMO RODAR (só em HOMOLOGAÇÃO, ref mjdjtiujhwklchalquhc, DEPOIS de aplicar
-- a 0029 — supabase db push):
--   scripts/supabase-preflight.sh hml
--   psql "$FORCA_HML_URL" -f supabase/proofs/0029_tempo_efetivo_conjunto.sql
--
-- Tudo roda dentro de `begin ... rollback`: as duas contas sintéticas e todo o
-- dado que elas geram desaparecem quando a transação volta.
--
-- O QUE ESTA PROVA FAZ: cria um treino conjunto real (RPCs de produção, mesmo
-- fluxo do proof/0026), faz A treinar, B treinar, A treinar de novo — cada
-- turno com uma duração real e DISTINTA (pg_sleep) — e confere que
-- active_seconds de cada um exclui o turno do outro. Repete o cálculo para a
-- borda do log reaproveitado (0026:1184-1192): started_at do log muito
-- anterior ao started_at do treino conjunto.
--
-- O QUE ESTA PROVA NÃO COBRE: a prova NUMÉRICA fina da fórmula (valores
-- exatos, incluindo a borda, com timestamps determinísticos em vez de
-- pg_sleep) já foi executada em HML com tabelas TEMP (pg_temp), sem tocar
-- auth.users nem dado real — ver o handoff desta migration. Este arquivo é o
-- proof de INTEGRAÇÃO (RPC real, RLS real, gatilhos reais); os valores abaixo
-- são conferidos por DESIGUALDADE (a>b, a+b≈duração real) e não por igualdade
-- exata, porque pg_sleep não garante milissegundo.
--
-- Cada bloco levanta exceção com prefixo 'FALHOU:' quando o invariante quebra.

begin;

do $prova$
declare
  v_a         uuid := gen_random_uuid();
  v_b         uuid := gen_random_uuid();
  v_plano_a   uuid;
  v_plano_b   uuid;
  v_sessao_a  uuid;
  v_sessao_b  uuid;
  v_ex_a      uuid;
  v_ex_b      uuid;
  v_set_a1    uuid;
  v_set_a2    uuid;
  v_set_b1    uuid;
  v_js        public.joint_sessions;
  v_log_a     uuid;
  v_log_b     uuid;
  v_setlog_a1 uuid;
  v_serie     public.set_logs;
  v_ativo_a   integer;
  v_ativo_b   integer;
  v_ativo_a_borda integer;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'proof-0029-' || u || '@forca.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    from unnest(array[v_a, v_b]) as u;

  insert into public.training_plans (user_id, name, status, purpose)
       values (v_a, 'PROVA 0029 A', 'active', 'solo') returning id into v_plano_a;
  insert into public.training_plans (user_id, name, status, purpose)
       values (v_b, 'PROVA 0029 B', 'active', 'solo') returning id into v_plano_b;

  insert into public.planned_sessions (plan_id, user_id, week_number, title, muscle_groups)
       values (v_plano_a, v_a, 1, 'Peito A', array['Peito']) returning id into v_sessao_a;
  insert into public.planned_sessions (plan_id, user_id, week_number, title, muscle_groups)
       values (v_plano_b, v_b, 1, 'Peito B', array['Peito']) returning id into v_sessao_b;

  insert into public.planned_exercises (session_id, exercise_order, name, exercise_key, metric, equipment)
       values (v_sessao_a, 1, 'Supino reto', 'supino_reto', 'carga_reps', 'barra')
       returning id into v_ex_a;
  insert into public.planned_exercises (session_id, exercise_order, name, exercise_key, metric, equipment)
       values (v_sessao_b, 1, 'Supino reto', 'supino_reto', 'carga_reps', 'barra')
       returning id into v_ex_b;

  insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max, target_load_kg, target_rir)
       values (v_ex_a, 1, 8, 10, 60, 2) returning id into v_set_a1;
  insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max, target_load_kg, target_rir)
       values (v_ex_a, 2, 8, 10, 60, 2) returning id into v_set_a2;
  insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max, target_load_kg, target_rir)
       values (v_ex_b, 1, 8, 10, 40, 2) returning id into v_set_b1;

  -- ================= ativação do treino conjunto (RPCs reais) =================
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  set local role authenticated;
  v_js := public.create_joint_session();

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  v_js := public.join_joint_session(v_js.invite_code);

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  perform public.set_joint_session_mode(v_js.id, 'each_own', 'Peito');
  perform public.confirm_joint_participant_session(v_js.id, v_sessao_a);

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  perform public.confirm_joint_participant_session(v_js.id, v_sessao_b);

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  perform public.set_joint_participant_ready(v_js.id, true);

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  v_js := public.set_joint_participant_ready(v_js.id, true);

  if v_js.status <> 'active' then
    raise exception 'FALHOU: ativação bilateral não chegou a active (status %)', v_js.status;
  end if;

  reset role;
  select session_log_id into v_log_a from public.joint_session_participants
   where joint_session_id = v_js.id and user_id = v_a;
  select session_log_id into v_log_b from public.joint_session_participants
   where joint_session_id = v_js.id and user_id = v_b;

  -- ================= A treina (turno 1, ~3s) =================
  perform pg_sleep(3);
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  v_serie := public.save_set_log(v_log_a, v_set_a1, 8, 60, 2, 'on_target');
  v_setlog_a1 := v_serie.id;
  v_js := public.advance_joint_turn(v_js.id, 'ev-a-1', 1, v_setlog_a1);
  if v_js.current_turn_user_id <> v_b then
    raise exception 'FALHOU: turno não passou a B';
  end if;

  -- ================= B treina (turno 2, ~8s — bem mais longo que o de A) =================
  perform pg_sleep(8);
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role','authenticated')::text, true);
  v_serie := public.save_set_log(v_log_b, v_set_b1, 10, 40, 3, 'on_target');
  v_js := public.advance_joint_turn(v_js.id, 'ev-b-1', 2, v_serie.id);
  if v_js.current_turn_user_id <> v_a then
    raise exception 'FALHOU: turno não voltou a A';
  end if;

  -- ================= A treina de novo (turno 3, ~3s) =================
  perform pg_sleep(3);
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role','authenticated')::text, true);
  perform public.save_set_log(v_log_a, v_set_a2, 9, 62.5, 1, 'on_target');

  -- ================= A3 — o turno do parceiro NÃO pode inflar o dono =================
  v_ativo_a := public._forca_tempo_efetivo_segundos(v_log_a, now());
  v_ativo_b := public._forca_tempo_efetivo_segundos(v_log_b, now());

  -- A treinou ~6s reais (3+3); se o turno de B (~8s) tivesse vazado para A,
  -- active_seconds de A passaria de ~14s. A prova é por desigualdade generosa
  -- (>=15 já seria sinal de vazamento) para não depender de precisão de sleep.
  if v_ativo_a >= 15 then
    raise exception 'FALHOU: active_seconds de A (%) sugere que o turno de B vazou para A', v_ativo_a;
  end if;
  if v_ativo_a < 4 then
    raise exception 'FALHOU: active_seconds de A (%) ficou abaixo do mínimo plausível (~6s reais)', v_ativo_a;
  end if;
  -- B treinou ~8s reais; o teto de 1200s não entra em jogo aqui.
  if v_ativo_b < 6 or v_ativo_b > 11 then
    raise exception 'FALHOU: active_seconds de B (%) fora da faixa plausível para ~8s reais', v_ativo_b;
  end if;

  -- ================= borda: log reaproveitado com started_at ANTIGO =================
  -- Simula o efeito de 0026:1184-1192 (ativação bilateral reaproveita um log
  -- aberto pré-existente): backdata o started_at de A para muito antes da
  -- ativação do treino conjunto. Privilegiado (reset role) — o gatilho
  -- session_logs_guarda_joint só barra o papel de cliente.
  reset role;
  update public.session_logs set started_at = now() - interval '3 hours' where id = v_log_a;

  v_ativo_a_borda := public._forca_tempo_efetivo_segundos(v_log_a, now());

  -- Nem explode (13k+ segundos, o forgotten-session bug que a 0028 já corrigia)
  -- nem zera (o trecho pré-ativação tem de contar para o PRÓPRIO dono, capado
  -- a 1200s) — tem de ficar perto de 1200 (o primeiro intervalo, agora
  -- gigante, capado) + o pouco que A treinou depois.
  if v_ativo_a_borda < 1200 or v_ativo_a_borda > 1230 then
    raise exception 'FALHOU-BORDA: active_seconds de A com log reaproveitado (%) fora da faixa esperada (~1200-1230)',
      v_ativo_a_borda;
  end if;

  raise notice 'OK — A3: ativo_a=% ativo_b=% | borda log reaproveitado: ativo_a_borda=%',
    v_ativo_a, v_ativo_b, v_ativo_a_borda;
end;
$prova$;

rollback;
