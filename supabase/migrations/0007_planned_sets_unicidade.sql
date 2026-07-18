-- Fase 6 — backstop de banco contra duplicação CROSS-DEVICE do replanejamento.
--
-- A aplicação de um replan confirmado insere séries com set_order sequencial
-- (max(set_order) + i por exercício). A guarda de reentrância do app cobre o
-- caso single-device; dois APARELHOS com o mesmo contexto, confirmando ao mesmo
-- tempo, gerariam os MESMOS set_order — sem esta trava, os dois INSERTs passam
-- e o volume duplica. Com o índice único, o segundo falha com 23505; o app
-- classifica o conflito (stage insert + code 23505), descarta a proposta
-- obsoleta e recalcula do servidor. O bulk insert do PostgREST é um statement
-- só, portanto o INSERT conflitante falha inteiro — nada parcial.

-- ============================================================
-- 1. Pré-checagem: dados existentes não podem violar a unicidade.
--    Se houver duplicata, a migration ABORTA com a lista dos ofensores
--    (resolver manualmente antes — nunca apagar dado às cegas).
-- ============================================================
do $$
declare
  v_dups text;
begin
  select string_agg(format('exercise_id=%s set_order=%s (%s linhas)', exercise_id, set_order, n), '; ')
    into v_dups
    from (
      select exercise_id, set_order, count(*) as n
        from public.planned_sets
       group by exercise_id, set_order
      having count(*) > 1
    ) d;
  if v_dups is not null then
    raise exception 'planned_sets tem (exercise_id, set_order) duplicados — resolver antes da 0007: %', v_dups;
  end if;
end;
$$;

-- ============================================================
-- 2. O índice único (o nome é contrato: o erro 23505 citando
--    planned_sets_exercise_set_order_key é o que o app classifica).
-- ============================================================
create unique index if not exists planned_sets_exercise_set_order_key
  on public.planned_sets (exercise_id, set_order);

-- Torna o antigo índice de busca redundante? NÃO remover: o índice único acima
-- cobre buscas por exercise_id (prefixo), mas planned_sets_exercise_idx pode
-- estar referenciado por planos de execução em produção. Remoção fica para uma
-- limpeza deliberada, não de carona no backstop.

-- ============================================================
-- 3. Asserção de catálogo: a migration só termina se o índice existir e for
--    ÚNICO sobre exatamente (exercise_id, set_order).
-- ============================================================
do $$
declare
  v_ok boolean;
begin
  select i.indisunique
       and i.indnkeyatts = 2
       and pg_get_indexdef(i.indexrelid) like '%(exercise_id, set_order)%'
    into v_ok
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
   where c.relname = 'planned_sets_exercise_set_order_key'
     and i.indrelid = 'public.planned_sets'::regclass;
  if v_ok is distinct from true then
    raise exception 'planned_sets_exercise_set_order_key ausente ou não-único — 0007 não aplicada corretamente';
  end if;
end;
$$;

-- ============================================================
-- 4. PROVA comportamental (rodar em HML, fora da migration, com rollback):
--    escolhe uma série real e tenta duplicar o (exercise_id, set_order) —
--    o INSERT deve falhar com 23505 e nada persiste.
--    ATENÇÃO: exige ao menos 1 linha em planned_sets; com a tabela vazia o
--    insert não faz nada e a prova NÃO conta (semear uma série antes).
-- ============================================================
-- begin;
-- with alvo as (
--   select exercise_id, set_order, target_reps_min, target_reps_max
--     from public.planned_sets
--    limit 1
-- )
-- insert into public.planned_sets (exercise_id, set_order, target_reps_min, target_reps_max)
-- select exercise_id, set_order, target_reps_min, target_reps_max from alvo;
-- -- esperado: ERROR 23505 duplicate key value violates unique constraint
-- --           "planned_sets_exercise_set_order_key"
-- rollback;
