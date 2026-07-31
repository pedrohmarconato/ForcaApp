-- 0024 — RATE-01 do review defensivo de 31/07/2026.
--
-- O rate limit de hoje (`_rate_buckets` em backend/app.py) é um dict em
-- memória do processo. O próprio código já documenta as duas consequências:
-- restart zera os contadores e cada worker/réplica tem o seu. Some-se a isso
-- que a janela é por hora e não há teto diário nem monetário, e o custo de um
-- dia inteiro fica sem limite superior: 3 gerações/hora × 24h, cada uma com
-- até 2 tentativas semânticas do molde, mais os retries de rede do
-- `criar_mensagem_com_deadline`.
--
-- Esta migration move a contabilidade para o único storage compartilhado e
-- atômico que o stack já tem — o Postgres do Supabase — e a torna consumível
-- por uma RPC que decide ANTES de a chamada paga acontecer.
--
-- Duas decisões de projeto que valem explicação:
--
-- 1. Os limites são PARÂMETROS da RPC, não colunas nem constantes SQL. A
--    política de teto vive no backend (env), então mudar o limite não pede
--    migration nova nem deploy do banco.
--
-- 2. A RPC reserva antes e ajusta depois. O custo real de uma chamada só é
--    conhecido quando a resposta volta com os tokens, mas cobrar depois
--    deixaria a janela entre a decisão e o débito sem proteção. Então o
--    backend reserva o custo estimado (teto do modelo), e ao receber a
--    resposta chama de novo com `p_forcar = true` e o delta — que pode ser
--    negativo — para acertar o valor. Uma tentativa que falha permanece
--    contada: o modelo cobrou por ela.

-- ============================================================
-- Tabela de consumo diário
-- ============================================================
create table if not exists public.ai_usage_daily (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  dia        date        not null,
  rota       text        not null,
  chamadas   integer     not null default 0,
  custo_usd  numeric(12,6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, dia, rota),
  constraint ai_usage_daily_rota_valida
    check (rota in ('plan', 'chat', 'consolidate')),
  constraint ai_usage_daily_nao_negativo
    check (chamadas >= 0 and custo_usd >= 0)
);

comment on table public.ai_usage_daily is
  'Consumo diário de chamadas pagas à Anthropic, por usuário e rota. '
  'Escrito exclusivamente pela RPC register_ai_usage (SECURITY DEFINER). '
  'O dia é UTC (current_date no servidor), não o fuso do usuário.';

-- Consulta do usuário no dia corrente — o caminho que a RPC percorre a cada
-- chamada paga. A PK cobre (user_id, dia, rota); este índice serve a soma
-- sobre TODAS as rotas do dia, que é o que o teto realmente olha.
create index if not exists ai_usage_daily_user_dia
  on public.ai_usage_daily (user_id, dia);

alter table public.ai_usage_daily enable row level security;

-- Só leitura, e só do próprio consumo. Não há policy de INSERT/UPDATE de
-- propósito: a escrita passa obrigatoriamente pela RPC, que é quem aplica o
-- teto. Uma policy de escrita aqui permitiria ao cliente zerar o próprio
-- contador com um PATCH direto no PostgREST.
drop policy if exists ai_usage_daily_self_select on public.ai_usage_daily;
create policy ai_usage_daily_self_select
  on public.ai_usage_daily
  for select
  using (auth.uid() = user_id);

-- ============================================================
-- RPC de consumo
-- ============================================================
create or replace function public.register_ai_usage(
  p_rota            text,
  p_chamadas        integer,
  p_custo_usd       numeric,
  p_limite_chamadas integer,
  p_limite_usd      numeric,
  p_forcar          boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_chamadas_dia integer;
  v_custo_dia    numeric;
begin
  -- Falha fechada: sem sessão não há contabilidade possível, e deixar passar
  -- seria exatamente o furo que a RPC existe para fechar.
  if v_uid is null then
    raise exception 'register_ai_usage exige usuário autenticado'
      using errcode = '28000';
  end if;

  if p_rota is null or p_rota not in ('plan', 'chat', 'consolidate') then
    raise exception 'rota inválida para contabilidade de IA: %', p_rota
      using errcode = '22023';
  end if;

  if p_chamadas is null or p_chamadas < 0 then
    raise exception 'p_chamadas deve ser >= 0'
      using errcode = '22023';
  end if;

  p_custo_usd := coalesce(p_custo_usd, 0);

  -- O teto é sobre o TOTAL do dia, somando todas as rotas. Um
  -- `insert ... on conflict` trava apenas a linha da rota, então duas
  -- requisições simultâneas em rotas diferentes leriam o mesmo total e ambas
  -- passariam. O advisory lock serializa por usuário pelo resto da transação
  -- — escopo estreito o bastante para não afetar outros usuários.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select coalesce(sum(chamadas), 0), coalesce(sum(custo_usd), 0)
    into v_chamadas_dia, v_custo_dia
    from public.ai_usage_daily
   where user_id = v_uid
     and dia = current_date;

  -- p_forcar = true é o ajuste pós-chamada: o gasto já aconteceu e precisa
  -- ser registrado mesmo que estoure o teto. Bloquear aqui só faria a
  -- contabilidade divergir da fatura.
  if not p_forcar then
    if p_limite_chamadas is not null
       and v_chamadas_dia + p_chamadas > p_limite_chamadas then
      return jsonb_build_object(
        'permitido',     false,
        'motivo',        'chamadas',
        'chamadas_dia',  v_chamadas_dia,
        'custo_dia_usd', round(v_custo_dia, 6)
      );
    end if;

    if p_limite_usd is not null
       and v_custo_dia + p_custo_usd > p_limite_usd then
      return jsonb_build_object(
        'permitido',     false,
        'motivo',        'custo',
        'chamadas_dia',  v_chamadas_dia,
        'custo_dia_usd', round(v_custo_dia, 6)
      );
    end if;
  end if;

  insert into public.ai_usage_daily as alvo
    (user_id, dia, rota, chamadas, custo_usd, updated_at)
  values
    (v_uid, current_date, p_rota, p_chamadas, greatest(p_custo_usd, 0), now())
  on conflict (user_id, dia, rota) do update
    -- p_custo_usd, e não excluded.custo_usd: o valor de `excluded` já passou
    -- pelo greatest() acima, o que zeraria um ajuste negativo. O greatest
    -- aqui protege o CHECK da coluna, não o sinal do delta.
    set chamadas   = alvo.chamadas + p_chamadas,
        custo_usd  = greatest(0, alvo.custo_usd + p_custo_usd),
        updated_at = now();

  return jsonb_build_object(
    'permitido',     true,
    'chamadas_dia',  v_chamadas_dia + p_chamadas,
    'custo_dia_usd', round(greatest(0, v_custo_dia + p_custo_usd), 6)
  );
end;
$$;

comment on function public.register_ai_usage(text, integer, numeric, integer, numeric, boolean) is
  'Contabiliza uma tentativa paga de IA e devolve se ela é permitida sob os '
  'tetos diários informados. Atômica por usuário (advisory lock). '
  'p_forcar = true registra sem barrar — use no ajuste de custo real.';

-- ============================================================
-- Grants (aprendizado da 0019: revoke de public NÃO corta anon)
-- ============================================================
revoke all on function public.register_ai_usage(text, integer, numeric, integer, numeric, boolean)
  from public, anon;
grant execute on function public.register_ai_usage(text, integer, numeric, integer, numeric, boolean)
  to authenticated;

revoke all on table public.ai_usage_daily from anon;
grant select on table public.ai_usage_daily to authenticated;

-- ============================================================
-- Asserções
-- ============================================================
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'ai_usage_daily'
  ) then
    raise exception 'asserção falhou: ai_usage_daily não existe';
  end if;

  if not exists (
    select 1 from pg_tables
     where schemaname = 'public' and tablename = 'ai_usage_daily' and rowsecurity
  ) then
    raise exception 'asserção falhou: RLS desligada em ai_usage_daily';
  end if;

  -- Nenhuma policy de escrita: se alguém adicionar uma, o cliente passa a
  -- poder zerar o próprio contador direto pelo PostgREST, contornando o teto.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ai_usage_daily'
       and cmd <> 'SELECT'
  ) then
    raise exception 'asserção falhou: ai_usage_daily tem policy de escrita';
  end if;

  if has_function_privilege('anon',
       'public.register_ai_usage(text, integer, numeric, integer, numeric, boolean)',
       'EXECUTE') then
    raise exception 'asserção falhou: anon executa register_ai_usage';
  end if;

  if not has_function_privilege('authenticated',
       'public.register_ai_usage(text, integer, numeric, integer, numeric, boolean)',
       'EXECUTE') then
    raise exception 'asserção falhou: authenticated não executa register_ai_usage';
  end if;
end
$$;
