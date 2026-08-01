-- 0025 — ajuste do teto de quota antes da promoção a produção.
--
-- A 0024 aplicava UM teto de chamadas para o dia inteiro, somando as três
-- rotas. Em homologação isso nunca apareceu porque não houve uso real; contra
-- tráfego de gente de verdade o número é enganoso, porque as três rotas não
-- custam a mesma coisa nem são usadas na mesma frequência:
--
--   chat        → Haiku, ~US$ 0,005 por chamada, DEZENAS por onboarding
--   consolidate → Haiku, uma vez por onboarding
--   plan        → Opus, a chamada cara, poucas por dia
--
-- Com teto único, uma conversa longa de onboarding consumia a cota e o
-- usuário era barrado justamente na geração do plano — a única chamada que
-- realmente importa. O limite de CHAMADAS passa a valer por rota; o limite de
-- CUSTO continua global, e é ele a trava que de fato contém o Opus.
--
-- A assinatura não muda: `p_limite_chamadas` passa a ser lido como o teto da
-- rota informada em `p_rota`. Trocar a semântica sem trocar a assinatura é
-- deliberado — quem chama continua passando um número por chamada, e não há
-- uma segunda função meio aplicada em algum ambiente.

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
  v_uid           uuid := auth.uid();
  v_chamadas_rota integer;
  v_custo_dia     numeric;
begin
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

  -- Continua serializando por USUÁRIO, e não por (usuário, rota): o teto de
  -- custo é global, então duas rotas concorrentes ainda precisam enxergar a
  -- mesma soma de dinheiro.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select
    coalesce(sum(chamadas) filter (where rota = p_rota), 0),  -- chamadas DA ROTA
    coalesce(sum(custo_usd), 0)                               -- custo do DIA inteiro
    into v_chamadas_rota, v_custo_dia
    from public.ai_usage_daily
   where user_id = v_uid
     and dia = current_date;

  if not p_forcar then
    if p_limite_chamadas is not null
       and v_chamadas_rota + p_chamadas > p_limite_chamadas then
      return jsonb_build_object(
        'permitido',      false,
        'motivo',         'chamadas',
        'rota',           p_rota,
        'chamadas_rota',  v_chamadas_rota,
        'custo_dia_usd',  round(v_custo_dia, 6)
      );
    end if;

    if p_limite_usd is not null
       and v_custo_dia + p_custo_usd > p_limite_usd then
      return jsonb_build_object(
        'permitido',      false,
        'motivo',         'custo',
        'rota',           p_rota,
        'chamadas_rota',  v_chamadas_rota,
        'custo_dia_usd',  round(v_custo_dia, 6)
      );
    end if;
  end if;

  insert into public.ai_usage_daily as alvo
    (user_id, dia, rota, chamadas, custo_usd, updated_at)
  values
    (v_uid, current_date, p_rota, p_chamadas, greatest(p_custo_usd, 0), now())
  on conflict (user_id, dia, rota) do update
    set chamadas   = alvo.chamadas + p_chamadas,
        custo_usd  = greatest(0, alvo.custo_usd + p_custo_usd),
        updated_at = now();

  return jsonb_build_object(
    'permitido',      true,
    'rota',           p_rota,
    'chamadas_rota',  v_chamadas_rota + p_chamadas,
    'custo_dia_usd',  round(greatest(0, v_custo_dia + p_custo_usd), 6)
  );
end;
$$;

comment on function public.register_ai_usage(text, integer, numeric, integer, numeric, boolean) is
  'Contabiliza uma tentativa paga de IA. p_limite_chamadas vale para a ROTA; '
  'p_limite_usd vale para o DIA inteiro, somando todas as rotas. '
  'Atômica por usuário (advisory lock). p_forcar = true registra sem barrar.';

-- `create or replace` preserva os grants da 0024, mas reafirmá-los é barato e
-- protege contra a função ter sido recriada à mão em algum ambiente.
revoke all on function public.register_ai_usage(text, integer, numeric, integer, numeric, boolean)
  from public, anon;
grant execute on function public.register_ai_usage(text, integer, numeric, integer, numeric, boolean)
  to authenticated;

-- ============================================================
-- Asserções
-- ============================================================
do $$
begin
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
