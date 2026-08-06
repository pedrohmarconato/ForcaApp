-- 0029 — Tempo efetivo do revezamento (achado A3, MÉDIA).
--
-- Por que existe: a fórmula da 0028 (session_logs.active_seconds) soma TODOS
-- os intervalos entre os próprios eventos do log (início, cada série
-- concluída, fim), cada um limitado a 1200s. Em sessão SOLO isso é exatamente
-- o tempo efetivo. Em treino CONJUNTO no modo revezamento (0026), o mesmo
-- cálculo é ERRADO: entre duas séries PRÓPRIAS de um participante pode caber
-- o turno inteiro do parceiro — que hoje entra, capado em até 1200s, como se
-- fosse tempo ativo do dono do log. Confirmado no código vivo:
--   0028:115-133 — a CTE `eventos` só enxerga v_inicio, os `completed_at` dos
--   PRÓPRIOS set_logs e v_fim; nada ali sabe de quem estava com o turno.
--
-- Decisão do dono: para session_logs cujo planned_session pertence a um
-- treino conjunto (`planned_sessions.joint_session_id is not null`), excluir
-- do somatório os trechos em que a posse do turno era do PARCEIRO. Sessão
-- solo não muda — a fórmula abaixo, no ramo `v_joint_id is null`, é uma cópia
-- byte a byte da 0028.
--
-- Fonte da posse do turno: joint_session_events (0026), kinds 'started' e
-- 'turn_advanced' — os dois únicos que carregam `payload->>'next_turn_user_id'`
-- (allowlist em `_forca_joint_payload_valido`). Cada um desses eventos diz
-- quem PASSA a segurar o turno a partir do próprio `created_at`; o segmento
-- vale até o PRÓXIMO evento da mesma trilha. Um segmento SINTÉTICO
-- (-infinity, primeiro evento) atribuído ao PRÓPRIO dono cobre tudo que
-- aconteceu ANTES de o treino conjunto ativar — inclusive o log REAPROVEITADO
-- (0026:1184-1192): quando a ativação bilateral encontra uma execução aberta
-- pré-existente para o mesmo planned_session_id/user_id (ex.: um treino solo
-- esquecido em aberto), ela REUSA esse log em vez de criar um novo, e o
-- `started_at` dele fica ANTERIOR ao `started_at` do treino conjunto. Sem
-- segmento sintético, esse trecho ficaria sem dono de turno e seria zerado por
-- engano; com ele, o trecho conta para o PRÓPRIO dono, exatamente como sempre
-- contou (ainda sujeito ao teto de 1200s — o comportamento que a 0028 já
-- garantia para log esquecido em aberto não muda).
--
-- Teto preservado, aplicado no nível certo: o teto de 1200s por intervalo
-- BRUTO (entre dois eventos PRÓPRIOS consecutivos) é preservado, mas agora
-- soma-se primeiro TODAS as sobreposições do próprio dono DENTRO desse
-- intervalo bruto e só então aplica-se o teto UMA VEZ ao total — nunca por
-- sobreposição isolada. Sem isso, um intervalo bruto que cruza a fronteira
-- sintético→turno-real (o caso do log reaproveitado) tetaria duas vezes e
-- estufaria o número nesse cenário específico — o oposto do que esta
-- migration corrige.
--
-- Cenário provado (proof/0029, harness em __tests__/tempoEfetivoConjuntoMigration.test.ts):
-- revezamento A→B→A com durações reais distintas por trecho, mais a borda do
-- log reaproveitado com started_at antigo. Valores exatos e o comando usado
-- para reproduzir a prova (tabelas TEMP, sem tocar dado real) estão no
-- handoff desta migration — ver supabase/proofs/0029_tempo_efetivo_conjunto.sql.
--
-- Limitação conhecida, deliberadamente FORA do escopo desta migration: duas
-- RPCs da 0026 transferem `current_turn_user_id` por UPDATE direto, SEM emitir
-- 'turn_advanced' (só emitem 'queue_finished' / 'participant_completed', sem
-- `next_turn_user_id` no payload):
--   - `mark_joint_queue_finished` (0026:1351-1414), quando o parceiro ainda
--     não terminou a própria fila;
--   - `complete_joint_participant` (0026:1560-1633), no trecho final que
--     passa o turno a quem ainda não concluiu.
-- A posse reconstruída aqui não enxerga essas duas transferências: quem
-- assume o turno por uma delas continua sendo contado, pelo cálculo, como se
-- o turno ainda fosse do participante anterior. O ACEITE desta remediação
-- cobre o revezamento por `advance_joint_turn` (o caminho normal — toda série
-- confirma o turno, ver 0026:283-287) e a borda do log reaproveitado; NÃO
-- cobre a fila declarada encerrada sem um advance final. Registrado para
-- decisão do dono, não corrigido aqui — corrigir exigiria emitir
-- `next_turn_user_id` também nessas duas RPCs (mudança na 0026/0027/0028, que
-- ficam intocadas) ou uma segunda fonte de posse, o que estenderia o escopo
-- além do que este achado pediu.
--
-- Nada mais muda: finish_session (0028) já chama esta função interna
-- corretamente e não precisa ser recriada; grants/revokes de
-- `_forca_tempo_efetivo_segundos` (authenticated sim, public/anon não) são
-- preservados por CREATE OR REPLACE FUNCTION sem alteração de assinatura —
-- não há necessidade de re-emitir GRANT/REVOKE.

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
  v_inicio   timestamptz;
  v_fim      timestamptz;
  v_self     uuid;
  v_joint_id uuid;
  v_total    double precision := 0;
begin
  select started_at, finished_at, user_id
    into v_inicio, v_fim, v_self
    from public.session_logs
   where id = p_session_log_id;

  -- Âncora final explícita: ver 0028 (o SET de um UPDATE lê a linha ANTES da
  -- própria atualização).
  if p_fim is not null then
    v_fim := p_fim;
  end if;

  if v_fim is null or v_fim < v_inicio then
    return null;
  end if;

  -- Sessão conjunta? planned_sessions.joint_session_id (0026) é o vínculo;
  -- log solo não tem e cai no ramo antigo, inalterado.
  select ps.joint_session_id
    into v_joint_id
    from public.session_logs sl
    join public.planned_sessions ps on ps.id = sl.planned_session_id
   where sl.id = p_session_log_id;

  if v_joint_id is null then
    with eventos as (
      select v_inicio as ts
      union all
      select completed_at
        from public.set_logs
       where session_log_id = p_session_log_id
      union all
      select v_fim
    ),
    intervalos as (
      select ts - lag(ts) over (order by ts) as diff
        from eventos
    )
    select coalesce(sum(least(greatest(extract(epoch from diff), 0), 1200)), 0)
      into v_total
      from intervalos;
  else
    -- Linha do tempo de posse do turno: cada 'started'/'turn_advanced' diz
    -- quem passa a segurar o turno a partir do próprio created_at
    -- (payload->>'next_turn_user_id'); vale até o próximo evento da trilha.
    -- O segmento sintético (-infinity, primeiro evento) cobre o que aconteceu
    -- ANTES da ativação — inclusive o log reaproveitado (0026:1184-1192) — e
    -- fica com o PRÓPRIO dono, nunca com o parceiro, por não haver dado de
    -- posse anterior à ativação.
    with turnos as (
      select
        (payload ->> 'next_turn_user_id')::uuid as holder,
        created_at as desde,
        lead(created_at) over (order by seq) as ate
        from public.joint_session_events
       where joint_session_id = v_joint_id
         and kind in ('started', 'turn_advanced')
    ),
    posse as (
      select v_self as holder,
             '-infinity'::timestamptz as desde,
             coalesce((select min(desde) from turnos), 'infinity'::timestamptz) as ate
      union all
      select holder, desde, coalesce(ate, 'infinity'::timestamptz) from turnos
    ),
    eventos as (
      select v_inicio as ts
      union all
      select completed_at
        from public.set_logs
       where session_log_id = p_session_log_id
      union all
      select v_fim
    ),
    pares as (
      select ts as ts_a, lead(ts) over (order by ts) as ts_b
        from eventos
    ),
    -- Sobreposição de cada intervalo BRUTO (ts_a,ts_b) com cada segmento em
    -- que o turno era do PRÓPRIO dono (holder = v_self) — o do parceiro nunca
    -- entra aqui, por construção do join.
    sobreposicoes as (
      select pares.ts_a, pares.ts_b,
             greatest(extract(epoch from (
               least(pares.ts_b, posse.ate) - greatest(pares.ts_a, posse.desde)
             )), 0) as secs
        from pares
        join posse on posse.holder = v_self
                  and posse.desde  < pares.ts_b
                  and posse.ate    > pares.ts_a
       where pares.ts_b is not null
    ),
    -- Teto de 1200s aplicado UMA VEZ por intervalo bruto, sobre a SOMA das
    -- sobreposições próprias dentro dele — não por sobreposição isolada (ver
    -- cabeçalho: evita destetar duas vezes o intervalo do log reaproveitado).
    por_par as (
      select ts_a, ts_b, least(sum(secs), 1200) as secs_capado
        from sobreposicoes
       group by ts_a, ts_b
    )
    select coalesce(sum(secs_capado), 0) into v_total from por_par;
  end if;

  -- Ajuste de cardio: inalterado, mesmo em treino conjunto — o excedente além
  -- do teto é sempre do dono da série, nunca do parceiro.
  select v_total + coalesce(sum(greatest(actual_duration_seconds - 1200, 0)), 0)
    into v_total
    from public.set_logs
   where session_log_id = p_session_log_id
     and actual_duration_seconds is not null;

  return round(v_total)::integer;
end;
$$;

comment on function public._forca_tempo_efetivo_segundos(uuid, timestamptz) is
  'Interna: tempo efetivo de treino (fórmula da 0028, revezamento corrigido pela 0029 — exclui o turno do parceiro via joint_session_events). O app lê session_logs.active_seconds; nunca chama esta função direto.';
