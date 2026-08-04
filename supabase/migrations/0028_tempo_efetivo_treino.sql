-- 0028 — Tempo efetivo de treino.
--
-- Por que existe: a duração de um treino é hoje o relógio de parede bruto
-- (session_logs.finished_at − started_at, src/utils/weekSummary.ts). Duas
-- consequências confirmadas no código vivo:
--   1. Sessão esquecida em aberto vira número absurdo. finish_session carimba
--      finished_at = now() no instante em que o aluno aperta "concluir". Quem
--      começa às 19h, esquece e conclui na manhã seguinte grava um treino de
--      treze horas. Não há fechamento automático de sessão órfã no projeto.
--   2. O número não distingue treino de intervalo: banheiro, telefonema e
--      conversa no aparelho entram integralmente no "tempo de treino", e os
--      agregados do Perfil e do Progresso herdam a distorção.
--
-- A métrica nova é o TEMPO EFETIVO: soma dos intervalos entre eventos reais da
-- sessão (início, cada série concluída, fim), com CADA intervalo limitado a
-- CAP_INTERVALO_SEGUNDOS = 1200 (20 minutos). Um intervalo longo contribui no
-- máximo um teto, seja ele descanso, pausa ou abandono — o treino de treze
-- horas deixa de existir. max(…, 0) neutraliza carimbo fora de ordem por clock
-- skew ou retry; dois completed_at idênticos geram intervalo zero.
--
-- Correção de cardio: set_logs.actual_duration_seconds é digitado pelo aluno e
-- pode legitimamente passar de 20 minutos — uma corrida de 40 minutos seria
-- truncada pelo teto genérico. Soma-se apenas o EXCEDENTE além do teto, porque
-- os primeiros 20 minutos já foram contados pelo intervalo (sem dupla contagem).
--
-- Matéria-prima: set_logs.completed_at, not null default now() desde a 0001
-- (carimbo do servidor no instante em que a série é gravada). Toda sessão
-- histórica tem cronologia real de séries — nenhum backfill de série, nenhuma
-- coluna de origem nova. set_logs.started_at (0012) fica fora da fórmula: não
-- muda o resultado nos casos que motivaram o trabalho.
--
-- Arquitetura: calcular UMA vez, no fechamento, e persistir em
-- session_logs.active_seconds. Recalcular na leitura obrigaria o Perfil a
-- varrer dezenas de milhares de set_logs a cada foco de tela. A sessão em
-- andamento (sem finished_at, logo sem coluna para ler) aplica a MESMA fórmula
-- em TypeScript (src/engine/tempoEfetivo.ts) sobre o rascunho em memória,
-- usando o relógio como âncora final — duas implementações da mesma regra,
-- casadas pelos nove vetores abaixo.
--
-- A 0020 recriou finish_session; esta migration a recria de novo com o mesmo
-- contrato (idempotente, mesma ordem de lock, recusa de sessão skipped) e
-- acrescenta active_seconds ao update que já carimba finished_at. Dois pontos
-- em que esta migration se afasta do texto cru da spec:
--   a. O SET de um UPDATE é avaliado contra a linha ANTES da atualização; por
--      isso active_seconds recebe _forca_tempo_efetivo_segundos(id, now()) —
--      a âncora final explícita — e não a leitura do próprio finished_at.
--   b. A função interna TEM EXECUTE para authenticated: finish_session é
--      SECURITY INVOKER e a chama dentro do update. Sem o grant, concluir um
--      treino estouraria permission denied em runtime. Mesmo precedente da
--      0019/0020 com _forca_motivo_recusa_valido: interno, mas grant legítimo
--      a authenticated porque as RPCs o chamam. O app nunca chama a função
--      interna direto — lê a coluna.
--
-- Nove vetores (espelhados em __tests__/tempoEfetivo.test.ts e verificados
-- pelo harness __tests__/tempoEfetivoMigration.test.ts):
--   1. Sessão aberta 13h, 4 séries concluídas nos primeiros 25 min → ≤ 25min + 5×20min; nunca 13h
--   2. Sessão histórica com todo started_at de série nulo → número plausível, não nulo
--   3. Sessão sem nenhuma série → min(fim − início, 1200s)
--   4. Corrida de 40 min (actual_duration_seconds = 2400) → os 40 min contam integralmente
--   5. Cardio de 8 min (abaixo do teto) → sem ajuste; sem dupla contagem
--   6. Retomada no dia seguinte (intervalo de ~20h) → um único intervalo limitado
--   7. finished_at < started_at; data inválida → null, sem exceção
--   8. Dois completed_at idênticos (retry, 0005) → intervalo zero, sem NaN
--   9. completed_at anterior ao evento anterior (skew) → intervalo negativo neutralizado

-- ============================================================
-- 1. Coluna derivada
-- ============================================================
alter table public.session_logs
  add column if not exists active_seconds integer;

comment on column public.session_logs.active_seconds is
  'DERIVADA, nunca digitada: tempo efetivo de treino em segundos — soma dos intervalos entre eventos reais (início, séries concluídas, fim), cada intervalo limitado a 1200s. Calculada pela finish_session e pelo backfill desta migration; o app lê a coluna, não recalcula.';

-- ============================================================
-- 2. Cálculo (função interna)
-- ============================================================
-- Fórmula: Σ min(max(Eᵢ₊₁ − Eᵢ, 0), 1200) sobre a linha do tempo em ordem
-- crescente (início → completed_at das séries → fim), mais
-- Σ max(actual_duration_seconds − 1200, 0) sobre séries de cardio/isometria.
-- Devolve null quando a sessão não tem fim ou quando fim < início.
-- Escopo por dono vem 100% da RLS (security invoker, como todo o projeto):
-- sem policy, uma chamada direta com id alheio devolve null/0, nunca dado de
-- outro usuário. Achado BAIXA do painel de revisão — registro, sem mudança.
create or replace function public._forca_tempo_efetivo_segundos(
  p_session_log_id uuid,
  p_fim timestamptz default null
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inicio timestamptz;
  v_fim    timestamptz;
  v_total  double precision := 0;
begin
  select started_at, finished_at
    into v_inicio, v_fim
    from public.session_logs
   where id = p_session_log_id;

  -- Âncora final explícita: finish_session carimba finished_at = now() e calcula
  -- na MESMA instrução — o SET do UPDATE é avaliado contra a linha antes da
  -- atualização, então a função não pode ler o finished_at novo da própria linha.
  if p_fim is not null then
    v_fim := p_fim;
  end if;

  if v_fim is null or v_fim < v_inicio then
    return null;
  end if;

  with eventos as (
    select v_inicio as ts
    union all
    select completed_at
      from public.set_logs
     where session_log_id = p_session_log_id
    union all
    select v_fim
  ),
  -- A janela (lag) mora numa CTE própria: o Postgres rejeita função de janela
  -- DENTRO de agregado (sum(...lag() over()...)). Separar as duas foi o que a
  -- execução real em homologação exigiu — o plpgsql só valida o corpo ao rodar.
  intervalos as (
    select ts - lag(ts) over (order by ts) as diff
      from eventos
  )
  select coalesce(sum(least(greatest(extract(epoch from diff), 0), 1200)), 0)
    into v_total
    from intervalos;

  select v_total + coalesce(sum(greatest(actual_duration_seconds - 1200, 0)), 0)
    into v_total
    from public.set_logs
   where session_log_id = p_session_log_id
     and actual_duration_seconds is not null;

  return round(v_total)::integer;
end;
$$;

comment on function public._forca_tempo_efetivo_segundos(uuid, timestamptz) is
  'Interna: tempo efetivo de treino (fórmula da 0028). O app lê session_logs.active_seconds; nunca chama esta função direto.';

-- ============================================================
-- 3. finish_session: mesmo contrato da 0020, agora persistindo o tempo efetivo
-- ============================================================
/*
 * Mesma semântica idempotente da 0020: se a sessão foi recusada, um finish
 * atrasado não a converte em concluída; se o log já foi fechado, retorna sem
 * efeito. A ordem de lock (planned_session → session_log) é preservada.
 */
create or replace function public.finish_session(p_session_log_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_log    public.session_logs;
  v_sessao public.planned_sessions;
begin
  if auth.uid() is null then
    raise exception 'autenticação obrigatória' using errcode = '42501';
  end if;

  select * into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid();
  if not found then
    raise exception 'session_log % inexistente ou alheio', p_session_log_id
      using errcode = 'P0002';
  end if;

  select * into v_sessao
    from public.planned_sessions
   where id = v_log.planned_session_id
     and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'sessão do log % inexistente ou alheia', p_session_log_id
      using errcode = 'P0002';
  end if;

  select * into v_log
    from public.session_logs
   where id = p_session_log_id
     and user_id = auth.uid()
   for update;
  if v_log.finished_at is not null then
    return;
  end if;
  if v_sessao.status = 'skipped' then
    raise exception 'sessão recusada não pode ser concluída' using errcode = '55000';
  end if;

  update public.session_logs
     set finished_at = now(),
         active_seconds = public._forca_tempo_efetivo_segundos(id, now())
   where id = p_session_log_id;

  update public.planned_sessions
     set status = 'completed'
   where id = v_log.planned_session_id;
end;
$$;

-- ============================================================
-- 4. Backfill das sessões já fechadas
-- ============================================================
-- Recebe "duração" só quem é TREINO CONCLUÍDO de fato: log com séries, ou
-- (sem séries) conclusão real de sessão vazia — plano 'completed' e único log.
-- Tudo o resto é artefato de recusa e fica sem active_seconds → "—" no
-- histórico:
--   1. Recusa simples (plano 'skipped'): o log fechado pela skip_planned_session
--      (0020:513-517) nunca foi um treino.
--   2. FANTASMA da recusa desfeita: unskip volta o plano a 'pending' sem reabrir
--      o log antigo (0020:537-539); um retreino posterior abre log novo e leva o
--      plano a 'completed'. O log antigo — sem séries, com irmão no mesmo plano —
--      não pode ganhar até 1200 s fabricados: filtrar pelo status ATUAL do plano
--      não o pega (o status já virou 'completed'). Achado MÉDIA da reavaliação.
--   3. Recusa desfeita e nunca retreinada (plano 'pending'): nada foi feito.
update public.session_logs
   set active_seconds = public._forca_tempo_efetivo_segundos(id)
 where finished_at is not null
   and active_seconds is null
   and (
     -- Log com trabalho real (séries registradas) recebe o cálculo.
     exists (select 1 from public.set_logs sl where sl.session_log_id = session_logs.id)
     or (
       -- Sem séries, só é treino concluído se a sessão planejada foi de fato
       -- concluída E não existe irmão no mesmo plano.
       exists (
         select 1 from public.planned_sessions ps
          where ps.id = session_logs.planned_session_id
            and ps.status = 'completed'
       )
       and not exists (
         select 1 from public.session_logs l2
          where l2.planned_session_id = session_logs.planned_session_id
            and l2.id <> session_logs.id
       )
     )
   );

-- ============================================================
-- 5. Grants — revoke de public E de anon (aprendizado da 0019), grant a authenticated
-- ============================================================
-- A função interna recebe EXECUTE a authenticated de PROPÓSITO (ver cabeçalho,
-- desvio b): finish_session é security invoker e a chama dentro do update.
revoke all on function public._forca_tempo_efetivo_segundos(uuid, timestamptz) from public, anon;
revoke all on function public.finish_session(uuid) from public, anon;

grant execute on function public._forca_tempo_efetivo_segundos(uuid, timestamptz) to authenticated;
grant execute on function public.finish_session(uuid) to authenticated;

-- ============================================================
-- 6. Asserções: o que esta migration promete existe de fato
-- ============================================================
do $$
declare
  v_fn text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'session_logs'
       and column_name = 'active_seconds'
  ) then
    raise exception 'asserção falhou: session_logs.active_seconds não existe';
  end if;

  foreach v_fn in array array[
    'public.finish_session(uuid)',
    'public._forca_tempo_efetivo_segundos(uuid, timestamptz)'
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
