-- 0031 — Remove o treino de perna do plano ativo do Pedro e substitui por
-- variações B de superior (decisão do dono, 2026-08-06).
--
-- Contexto: o plano ativo de pedrohmarconato (plan_id 753757e7-...) tinha
-- 5x/semana com 2 dias de perna (Qua "Quadríceps + Corrida", Sex
-- "Posterior/Glúteos + Corrida"). Decisão do dono: Pedro não treina pernas
-- (preferência pessoal). Estudo aprovado: os 2 dias viram variações B de
-- superior, mantendo a dose de cardio declarada (2x/semana, 20min, Corrida):
--   Qua → "Peito/Tríceps B + Corrida"   (hipertrofia/fase de força)
--   Sex → "Costas/Bíceps B + Corrida"
-- Frequência dos grupos principais sobe para 2x/semana (melhor p/ hipertrofia).
--
-- O que esta migration faz (apenas dados, nenhum schema):
--   1. Guardas: plano existe; zero session_logs nas 24 sessões-alvo (nem em
--      andamento); sessões ainda não substituídas (idempotência).
--   2. Backup: copia sessões/exercícios/séries atuais para tabelas
--      _m0031_backup_* (permanentes, para rollback — não dropadas aqui).
--   3. UPDATE planned_sessions (title, session_type, muscle_groups) das 24
--      sessões, por fase (semanas 1-6 Hipertrofia, 7-12 Força-Hipertrofia).
--   4. DELETE planned_exercises das 24 sessões (planned_sets some por
--      ON DELETE CASCADE).
--   5. INSERT 24x7 exercícios novos com exercise_key canônico do catálogo
--      (catalogo_exercicios.json, versao 2), injury_flags '{}' e
--      load_increment_kg do catálogo.
--   6. INSERT planned_sets: 1 linha por série; reps parseadas do reps_raw
--      ("8-10" → 8/10); aquecimento/alongamento com a duração das sessões
--      superiores A do próprio plano (por fase); corrida REAPROVEITANDO a
--      duração original de cada sessão (a dose de cardio progride ~5%/semana
--      no plano — 900s→1596s — e não pode ser achatada num valor único).
--
-- Limitação declarada: training_plans.raw_plan fica com o JSON antigo (com
-- pernas). O app lê das tabelas materializadas; raw_plan só alimenta
-- metadados do editor manual, e o editor reimporta do banco
-- (manualPlanImport.ts) — limitação já conhecida do código
-- (planEditRepository.ts:9-11). Não reescrevemos o JSON da IA.
--
-- Rollback (se necessário, via psql/Management API):
--   -- os backups guardam as linhas ORIGINAIS:
--   delete from public.planned_exercises where session_id in (<24 ids>);
--   update public.planned_sessions
--      set title = b.title, session_type = b.session_type,
--          muscle_groups = b.muscle_groups
--     from public._m0031_backup_leg_sessions b
--    where public.planned_sessions.id = b.id;
--   insert into public.planned_exercises select * from public._m0031_backup_leg_exercises;
--   insert into public.planned_sets select * from public._m0031_backup_leg_sets;
--   drop table public._m0031_backup_leg_sets, public._m0031_backup_leg_exercises,
--                    public._m0031_backup_leg_sessions;
--
-- Verificação pós-aplicada (esperado):
--   1) zero exercícios de perna no plano ativo:
--      select count(*) from planned_exercises pe
--        join planned_sessions ps on ps.id = pe.session_id
--       where ps.plan_id = '753757e7-fff1-46fc-a34e-279b02494c3e'
--         and pe.muscle_group in
--             ('Quadríceps','Posterior de Coxa','Glúteos','Panturrilha','Adutores');
--      -- → 0
--   2) 24 sessões com os títulos novos:
--      select count(*) from planned_sessions
--       where plan_id = '753757e7-fff1-46fc-a34e-279b02494c3e'
--         and title in ('Peito/Tríceps B + Corrida','Costas/Bíceps B + Corrida');
--      -- → 24
--   3) integridade de séries: por sessão, count(planned_sets) =
--      sum(sets_planned) dos exercícios da sessão.
--
-- Em HML (forcaapp-staging) o plano-alvo não existe: a migration vira no-op
-- com RAISE NOTICE (esperado — é migration de dado de produção).

do $$
declare
  v_plan_id constant uuid := '753757e7-fff1-46fc-a34e-279b02494c3e';

  -- 24 sessões-alvo (Qua Quadríceps + Sex Posterior/Glúteos, semanas 1-12)
  v_qua_h uuid[] := array[
    '1a348d2d-9343-4e0f-8f3c-0874d7bb9884',  -- w1
    '0690a76f-e9b5-4f87-a1ca-5e2091c89bb7',  -- w2
    '865f6396-b81e-4341-b3e0-8e58b5f8a2b3',  -- w3
    '8cab34a4-8c05-460d-ba91-2bc01a333b54',  -- w4
    'b5cdd8ef-60f8-41b0-86c2-00fd467586c3',  -- w5
    '48436ea3-4283-4730-8098-78ad41aac5f6'   -- w6
  ];
  v_qua_f uuid[] := array[
    'c4d97353-798f-44c3-b32e-ab8fa0852aa2',  -- w7
    '9b28622a-6068-4b0e-bcc2-8712db7408a9',  -- w8
    'ba4b9fe7-4276-49c0-8fd3-964e7b6f6df5',  -- w9
    'bc58a031-6801-4189-aa79-58ba5d6bb10f',  -- w10
    'e6574de8-d888-4fce-b35d-9bd12fdeb0a0',  -- w11
    '675d1c9d-d0eb-409d-8730-b90e96b695cc'   -- w12
  ];
  v_sex_h uuid[] := array[
    '45fc927b-68d2-4717-bf03-413a4d430f7b',  -- w1
    'c13c9d8d-737e-49d5-b20b-67e691064954',  -- w2
    '84645567-8630-4b94-9c22-d2601a25b1e2',  -- w3
    '795447ba-6ed8-4762-a36d-5fc67c3431d6',  -- w4
    '59bf3219-6a64-4943-b7ac-671b11e5a7b9',  -- w5
    'e36c12cd-532e-4288-84c2-2aa298c089c6'   -- w6
  ];
  v_sex_f uuid[] := array[
    '5dabe578-598f-4d91-b6c7-a26f4ea12499',  -- w7
    'f9ee0c13-8c97-43b7-ab27-91ee5d7ce2b5',  -- w8
    '152ee8ee-cb7d-465f-8ef8-bbccd56ba40c',  -- w9
    '2e0fafb8-974b-48b6-af43-0ff383e58946',  -- w10
    'c1d7ce0b-30d8-48f6-ae0b-b805a7f74bf9',  -- w11
    'beafb8bc-ac12-411d-b6de-43ed5c7a674b'   -- w12
  ];

  -- sessões superiores A (intocadas) usadas como template de duração
  v_tpl_h constant uuid := '8e56894d-6945-422c-b4db-ff2099f15931'; -- Peito/Tríceps A, semana 1
  v_tpl_f constant uuid := '1301178a-3994-4e9e-b7fc-0cc77377e5b5'; -- Peito/Tríceps A, semana 7

  v_n_logs   int;
  v_aq_h     int;
  v_aq_f     int;
  v_al_h     int;
  v_al_f     int;
begin
  -- 1. Guarda: plano-alvo existe? (HML não tem o plano do Pedro → no-op)
  if not exists (select 1 from public.training_plans where id = v_plan_id) then
    raise notice 'm0031: plano % nao existe neste ambiente; migration sem efeito (esperado em HML)', v_plan_id;
    return;
  end if;

  -- 2. Guarda: idempotência — sessões já substituídas?
  if exists (
    select 1 from public.planned_sessions
     where id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f)
       and title like '%B + Corrida%'
  ) then
    raise notice 'm0031: sessoes-alvo ja substituidas; no-op';
    return;
  end if;

  -- 3. Guarda: nenhum log nas sessões-alvo (nem sessão em andamento)
  select count(*) into v_n_logs
    from public.session_logs
   where planned_session_id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f);
  if v_n_logs > 0 then
    raise exception 'm0031: % session_logs nas sessoes-alvo; abortando', v_n_logs;
  end if;

  -- 4. Durações de template (do próprio plano, por fase)
  select s.target_duration_seconds into v_aq_h
    from public.planned_sets s
    join public.planned_exercises e on e.id = s.exercise_id
   where e.exercise_key = 'aquecimento_articular' and e.session_id = v_tpl_h
   limit 1;
  select s.target_duration_seconds into v_aq_f
    from public.planned_sets s
    join public.planned_exercises e on e.id = s.exercise_id
   where e.exercise_key = 'aquecimento_articular' and e.session_id = v_tpl_f
   limit 1;
  select s.target_duration_seconds into v_al_h
    from public.planned_sets s
    join public.planned_exercises e on e.id = s.exercise_id
   where e.exercise_key = 'alongamento_dinamico' and e.session_id = v_tpl_h
   limit 1;
  select s.target_duration_seconds into v_al_f
    from public.planned_sets s
    join public.planned_exercises e on e.id = s.exercise_id
   where e.exercise_key = 'alongamento_dinamico' and e.session_id = v_tpl_f
   limit 1;
  v_aq_h := coalesce(v_aq_h, 245);
  v_aq_f := coalesce(v_aq_f, 300);
  v_al_h := coalesce(v_al_h, 288);
  v_al_f := coalesce(v_al_f, 312);

  -- 5. Backup (permanente, para rollback)
  create table if not exists public._m0031_backup_leg_sessions as
    select * from public.planned_sessions
     where id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f);
  create table if not exists public._m0031_backup_leg_exercises as
    select * from public.planned_exercises
     where session_id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f);
  create table if not exists public._m0031_backup_leg_sets as
    select s.* from public.planned_sets s
    join public.planned_exercises e on e.id = s.exercise_id
     where e.session_id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f);

  -- 6. Duração da Corrida por sessão (preserva a progressão de cardio do plano)
  create temp table _m0031_corrida_dur as
    select e.session_id, min(s.target_duration_seconds) as dur
      from public.planned_sets s
      join public.planned_exercises e on e.id = s.exercise_id
     where e.exercise_key = 'corrida'
       and e.session_id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f)
     group by e.session_id;

  -- 7. UPDATE das sessões-alvo
  update public.planned_sessions
     set title = case
           when id = any(v_qua_h || v_qua_f) then 'Peito/Tríceps B + Corrida'
           else 'Costas/Bíceps B + Corrida'
         end,
         session_type = case
           when id = any(v_qua_h || v_sex_h) then 'Hipertrofia + Cardio'
           else 'Força-Hipertrofia + Cardio'
         end,
         muscle_groups = case
           when id = any(v_qua_h || v_qua_f) then array['Peito','Tríceps','Cardio']
           else array['Costas','Bíceps','Cardio']
         end,
         updated_at = now()
   where id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f);

  -- 8. DELETE dos exercícios antigos (planned_sets via ON DELETE CASCADE)
  delete from public.planned_exercises
   where session_id = any(v_qua_h || v_qua_f || v_sex_h || v_sex_f);

  -- 9. INSERT dos exercícios novos (4 templates por fase; chaves do catálogo)
  create temp table _m0031_novos as
  with ins as (
    insert into public.planned_exercises
      (session_id, exercise_order, name, muscle_group, priority, equipment,
       load_increment_kg, rest_seconds, target_rm_percent, sets_planned,
       reps_raw, method, cadence, notes, injury_flags, exercise_key,
       name_original, metric, created_at)
    select s.id, t.exercise_order, t.name, t.grupo, t.prio, t.equip,
           t.inc, t.rest, t.rm, t.sets, t.reps,
           null, null, null, '{}'::text[], t.chave, t.name, t.metric, now()
      from unnest(v_qua_h) as s(id)
      cross join (values
        (1,'aquecimento_articular','Aquecimento Articular','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo'),
        (2,'supino_inclinado_barra','Supino Inclinado com Barra','Peito','primary','Barra',2.5,120,70,4,'8-10','carga_reps'),
        (3,'crucifixo_halteres','Crucifixo com Halteres','Peito','secondary','Halteres',1.0,60,62,3,'12-15','carga_reps'),
        (4,'triceps_testa','Tríceps Testa','Tríceps','secondary','Barra W',2.5,90,66,3,'10-12','carga_reps'),
        (5,'triceps_corda','Tríceps na Polia com Corda','Tríceps','accessory','Polia',2.5,60,62,3,'12-15','carga_reps'),
        (6,'corrida','Corrida','Cardio','primary','Peso corporal',0,null,null,1,null,'tempo_distancia'),
        (7,'alongamento_dinamico','Alongamento Dinâmico','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo')
      ) as t(exercise_order, chave, name, grupo, prio, equip, inc, rest, rm, sets, reps, metric)
    union all
    select s.id, t.exercise_order, t.name, t.grupo, t.prio, t.equip,
           t.inc, t.rest, t.rm, t.sets, t.reps,
           null, null, null, '{}'::text[], t.chave, t.name, t.metric, now()
      from unnest(v_qua_f) as s(id)
      cross join (values
        (1,'aquecimento_articular','Aquecimento Articular','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo'),
        (2,'supino_inclinado_barra','Supino Inclinado com Barra','Peito','primary','Barra',2.5,150,82,4,'5-6','carga_reps'),
        (3,'crucifixo_inclinado','Crucifixo Inclinado com Halteres','Peito','secondary','Halteres',1.0,90,72,3,'8-10','carga_reps'),
        (4,'triceps_testa','Tríceps Testa','Tríceps','secondary','Barra W',2.5,120,80,3,'6-8','carga_reps'),
        (5,'triceps_corda','Tríceps na Polia com Corda','Tríceps','accessory','Polia',2.5,60,68,3,'10-12','carga_reps'),
        (6,'corrida','Corrida','Cardio','primary','Peso corporal',0,null,null,1,null,'tempo_distancia'),
        (7,'alongamento_dinamico','Alongamento Dinâmico','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo')
      ) as t(exercise_order, chave, name, grupo, prio, equip, inc, rest, rm, sets, reps, metric)
    union all
    select s.id, t.exercise_order, t.name, t.grupo, t.prio, t.equip,
           t.inc, t.rest, t.rm, t.sets, t.reps,
           null, null, null, '{}'::text[], t.chave, t.name, t.metric, now()
      from unnest(v_sex_h) as s(id)
      cross join (values
        (1,'aquecimento_articular','Aquecimento Articular','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo'),
        (2,'remada_curvada_barra','Remada Curvada com Barra','Costas','primary','Barra',2.5,120,70,4,'8-10','carga_reps'),
        (3,'puxada_triangulo','Puxada com Triângulo','Costas','secondary','Polia',5.0,90,66,3,'10-12','carga_reps'),
        (4,'rosca_alternada','Rosca Alternada com Halteres','Bíceps','secondary','Halteres',1.0,60,62,3,'12-15','carga_reps'),
        (5,'rosca_martelo','Rosca Martelo','Bíceps','accessory','Halteres',1.0,60,60,3,'12-15','carga_reps'),
        (6,'corrida','Corrida','Cardio','primary','Peso corporal',0,null,null,1,null,'tempo_distancia'),
        (7,'alongamento_dinamico','Alongamento Dinâmico','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo')
      ) as t(exercise_order, chave, name, grupo, prio, equip, inc, rest, rm, sets, reps, metric)
    union all
    select s.id, t.exercise_order, t.name, t.grupo, t.prio, t.equip,
           t.inc, t.rest, t.rm, t.sets, t.reps,
           null, null, null, '{}'::text[], t.chave, t.name, t.metric, now()
      from unnest(v_sex_f) as s(id)
      cross join (values
        (1,'aquecimento_articular','Aquecimento Articular','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo'),
        (2,'remada_curvada_barra','Remada Curvada com Barra','Costas','primary','Barra',2.5,150,82,4,'5-6','carga_reps'),
        (3,'puxada_frontal','Puxada Frontal na Polia','Costas','secondary','Polia',5.0,90,74,3,'8-10','carga_reps'),
        (4,'rosca_direta_halteres','Rosca Direta com Halteres','Bíceps','secondary','Halteres',1.0,90,76,3,'8-10','carga_reps'),
        (5,'rosca_scott','Rosca Scott','Bíceps','accessory','Barra W',2.5,60,68,3,'10-12','carga_reps'),
        (6,'corrida','Corrida','Cardio','primary','Peso corporal',0,null,null,1,null,'tempo_distancia'),
        (7,'alongamento_dinamico','Alongamento Dinâmico','Mobilidade','accessory','Peso corporal',0,null,null,1,null,'tempo')
      ) as t(exercise_order, chave, name, grupo, prio, equip, inc, rest, rm, sets, reps, metric)
    returning id, session_id, sets_planned, reps_raw, metric, exercise_key
  )
  select id, session_id, sets_planned, reps_raw, metric, exercise_key from ins;

  -- 10. INSERT das séries (reps parseadas; durações de template ou da corrida original)
  insert into public.planned_sets
    (exercise_id, set_order, target_reps_min, target_reps_max, target_load_kg,
     target_rir, target_duration_seconds, target_distance_m, created_at)
  select n.id, gs,
         case when n.metric = 'carga_reps' then split_part(n.reps_raw, '-', 1)::int end,
         case when n.metric = 'carga_reps' then split_part(n.reps_raw, '-', 2)::int end,
         null, null,
         case n.exercise_key
           when 'aquecimento_articular' then case when pss.week_number <= 6 then v_aq_h else v_aq_f end
           when 'alongamento_dinamico'  then case when pss.week_number <= 6 then v_al_h else v_al_f end
           when 'corrida'               then coalesce(c.dur, 900)
         end,
         null, now()
    from _m0031_novos n
    join public.planned_sessions pss on pss.id = n.session_id
    left join _m0031_corrida_dur c on c.session_id = n.session_id
    cross join lateral generate_series(1, n.sets_planned) as gs;
end
$$;
