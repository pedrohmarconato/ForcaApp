-- 0030 — Emite 'turn_advanced' no handoff de fila/conclusão (achado P2, MÉDIA).
--
-- Por que existe: duas RPCs da 0026 transferem `current_turn_user_id` por
-- UPDATE direto em `joint_sessions`, SEM emitir o evento 'turn_advanced':
--   - `mark_joint_queue_finished` (0026:1405-1411), quando a própria fila é
--     declarada encerrada e o parceiro ainda não terminou a dele;
--   - `complete_joint_participant` (0026:1615-1621), quando um participante
--     conclui e o turno estava com ele, mas o parceiro ainda não concluiu.
-- A reconstrução da posse do turno feita pela 0029
-- (`_forca_tempo_efetivo_segundos`, linhas 132-146) monta os segmentos de
-- posse lendo SOMENTE os eventos 'started'/'turn_advanced' de
-- `joint_session_events`. Sem o evento no handoff, o tempo de B após esse
-- ponto não entra em nenhum segmento holder=B e desaparece do
-- `active_seconds` de B — documentado como limitação deliberada no cabeçalho
-- da própria 0029 (linhas 50-67).
--
-- Decisão do dono: corrigir na origem. Este arquivo recria as duas RPCs com
-- CREATE OR REPLACE FUNCTION, corpo IDÊNTICO ao da 0026 exceto pela emissão
-- de 'turn_advanced' no ponto exato do handoff, no MESMO formato do evento
-- emitido pelo caminho normal (`advance_joint_turn`, 0026:1336-1339): mesma
-- tabela (`joint_session_events`, via `_forca_joint_evento`), mesma chave de
-- payload (`next_turn_user_id`, já no allowlist de
-- `_forca_joint_payload_valido`, 0026:113). O evento é emitido ANTES do
-- UPDATE em `joint_sessions`, como no caminho normal — em nenhum dos dois
-- pontos a sessão está terminal (`status = 'active'` é pré-condição das duas
-- funções), então o gatilho `joint_sessions_terminal_imutavel` não interfere.
--
-- 0026/0027/0028/0029 intocadas. Assinatura, `security definer` e
-- `set search_path` preservados nas duas funções — CREATE OR REPLACE FUNCTION
-- sem alteração de assinatura preserva GRANT/REVOKE já emitidos pela 0026
-- (`revoke all ... from public, anon` + `grant execute ... to authenticated`
-- em 0026:1968-1987); não há necessidade de re-emitir.
--
-- Esta migration NÃO é aplicada a banco nenhum por este commit — arquivo e
-- prova apenas; a aplicação (HML/prod) é decisão do dono.
--
-- Prova: __tests__/turnAdvancedHandoffMigration.test.ts — réplica JS fiel da
-- reconstrução de posse da 0029:139-153 (segmentos por 'started'/
-- 'turn_advanced', atribuição de tempo por holder), no cenário "A encerra a
-- fila antes de B": um caso com o fluxo de eventos que as RPCs SEM esta
-- migration produzem (documenta a perda do tempo de B) e outro com o fluxo
-- que as RPCs desta migration produzem (prova o valor correto de B).

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
    -- Achado P2 (0030): o turno passa para o parceiro por este UPDATE — sem o
    -- evento abaixo, a 0029 perdia o tempo de posse do parceiro a partir daqui.
    --
    -- Achado F1 (revisão de painel) — assimetria deliberada: ao contrário de
    -- advance_joint_turn (0026:1336-1339, que passa v_sessao.turn_seq + 1 em
    -- p_turn_seq_after), esta emissão NÃO recebe p_turn_seq_after — a linha do
    -- evento grava turn_seq_after NULL mesmo com joint_sessions.turn_seq sendo
    -- incrementado pelo UPDATE logo abaixo. A 0029 ordena por seq/created_at
    -- (não depende deste campo) e o reducer local (jointSessionModel.ts,
    -- caso 'turn_advanced') trata turnSeqAfter null com fallback
    -- (?? state.turnSeq + 1); consumidor futuro que presuma turn_seq_after
    -- sempre presente vai encontrar NULL nos dois handoffs desta migration.
    -- Só comentário — zero mudança de comportamento neste arquivo.
    perform public._forca_joint_evento(
      p_joint_session_id, v_uid, 'turn_advanced',
      jsonb_build_object('next_turn_user_id', v_parceiro.user_id));

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
      -- Achado P2 (0030): idem — sem o evento, a 0029 perdia o tempo de posse
      -- do parceiro a partir deste handoff.
      --
      -- Achado F1: mesma assimetria deliberada do handoff em
      -- mark_joint_queue_finished (ver comentário lá) — esta emissão também
      -- não recebe p_turn_seq_after, então turn_seq_after fica NULL na linha
      -- do evento. Só comentário — zero mudança de comportamento.
      perform public._forca_joint_evento(
        p_joint_session_id, v_uid, 'turn_advanced',
        jsonb_build_object('next_turn_user_id', v_parceiro.user_id));

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

comment on function public.mark_joint_queue_finished(uuid) is
  'Encerra a própria fila do revezamento; passa o turno ao parceiro com evento turn_advanced (0030) quando ele ainda não terminou.';

comment on function public.complete_joint_participant(uuid) is
  'Conclui a participação de um dos dois no treino conjunto; passa o turno ao parceiro com evento turn_advanced (0030) quando ele ainda não concluiu.';
