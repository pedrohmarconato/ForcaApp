-- Reordenação de exercícios pós-criação (feature "Reordenar" do detalhe da sessão).
--
-- Por que RPC e não UPDATEs do cliente: exercise_order não tem unique (0001), e um
-- lote parcial via PostgREST deixaria ordem corrompida indistinguível de ordem
-- válida. Aqui a renumeração inteira acontece numa única transação — ou aplica
-- tudo, ou nada.
--
-- SECURITY INVOKER: a RLS "own exercises" (0001/0002) continua valendo dentro.
--
-- Errcodes que o app trata (planEditRepository):
--   42501 sessão inexistente/alheia · 55000 status não permite reordenar ·
--   22023 lista inválida · 40001 lista divergente do estado vivo (recarregar).

create or replace function public.reorder_planned_exercises(
  p_session_id  uuid,
  p_exercise_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_status text;
  v_total  int;
begin
  if v_user is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  -- Lista precisa ter 2+ IDs, sem nulos e sem repetição (count(distinct) ignora
  -- null, então nulo também cai aqui).
  if coalesce(array_length(p_exercise_ids, 1), 0) < 2
     or (select count(distinct x) from unnest(p_exercise_ids) x)
        <> array_length(p_exercise_ids, 1) then
    raise exception 'lista de exercícios inválida' using errcode = '22023';
  end if;

  -- Trava a sessão e valida posse + status. Sessão em andamento/concluída não
  -- reordena: o rascunho de execução no aparelho foi montado com a ordem antiga.
  select status into v_status
    from planned_sessions
   where id = p_session_id
     and user_id = v_user
     for update;
  if not found then
    raise exception 'sessão inexistente ou alheia' using errcode = '42501';
  end if;
  if v_status <> 'pending' then
    raise exception 'sessão % não pode ser reordenada', v_status using errcode = '55000';
  end if;

  -- Trava os exercícios e exige que a lista seja o conjunto EXATO do estado
  -- vivo. Divergência (exercício criado/removido em outro lugar) = 40001, o
  -- app recarrega e o usuário refaz sobre a lista atual.
  select count(*) into v_total
    from (select id from planned_exercises
           where session_id = p_session_id
             for update) t;
  if v_total <> array_length(p_exercise_ids, 1)
     or exists (
       select 1 from planned_exercises
        where session_id = p_session_id
          and id <> all (p_exercise_ids)
     ) then
    raise exception 'lista divergente do estado atual — recarregue'
      using errcode = '40001';
  end if;

  -- Renumera 1..N pela posição na lista. Efeito colateral desejado: conserta
  -- exercise_order duplicado pré-existente (não há unique na 0001).
  update planned_exercises
     set exercise_order = array_position(p_exercise_ids, id)
   where session_id = p_session_id;
end;
$$;

grant execute on function public.reorder_planned_exercises(uuid, uuid[]) to authenticated;
