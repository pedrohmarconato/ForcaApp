// scripts/joint-realtime-smoke.mjs
// Treino Conjunto 2.0 — Sprint 01. Prova EXECUTÁVEL do Realtime em HML.
//
//   node scripts/joint-realtime-smoke.mjs
//
// SQL não prova entrega de Realtime. Este harness abre três clientes reais —
// dois participantes e um intruso — e mede o que cada um recebe:
//
//   G2a  os DOIS participantes recebem as mudanças da sessão conjunta;
//   G2b  o intruso, inscrito no MESMO canal, recebe ZERO (a policy de SELECT é
//        o que o Realtime avalia por assinante);
//   G2c  depois de derrubar e reassinar, o snapshot autoritativo reconcilia.
//
// Ambiente, credencial em memória e limpeza obrigatória vêm de
// joint-smoke-shared.mjs. Nenhum segredo é impresso.

import {
  aguardarAte,
  assert,
  criarPlanoDeTeste,
  esperar,
  rodarHarness,
} from './joint-smoke-shared.mjs';

const JANELA_MS = 6_000;

const inscrever = (client, jointSessionId, caixa) =>
  new Promise((resolve, reject) => {
    const canal = client
      .channel(`smoke:${jointSessionId}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'joint_sessions',
          filter: `id=eq.${jointSessionId}`,
        },
        (payload) => caixa.push({ tabela: 'joint_sessions', payload }),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'joint_session_events',
          filter: `joint_session_id=eq.${jointSessionId}`,
        },
        (payload) => caixa.push({ tabela: 'joint_session_events', payload }),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve(canal);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`inscrição falhou: ${status}`));
        }
      });
    setTimeout(() => reject(new Error('inscrição não completou a tempo')), JANELA_MS);
  });

await rodarHarness('joint-realtime', 3, async (ctx, [a, b, c]) => {
  const planoA = await criarPlanoDeTeste(ctx, a.id, 'Peito A');
  const planoB = await criarPlanoDeTeste(ctx, b.id, 'Peito B');

  // ---- convite e lobby ----
  const criada = await a.client.rpc('create_joint_session');
  assert(!criada.error, `create_joint_session: ${criada.error?.message}`);
  const sessao = Array.isArray(criada.data) ? criada.data[0] : criada.data;
  const jointId = sessao.id;

  const entrou = await b.client.rpc('join_joint_session', {
    p_invite_code: sessao.invite_code,
  });
  assert(!entrou.error, `join_joint_session: ${entrou.error?.message}`);
  assert(entrou.data, 'convite válido devolveu nulo');

  // ---- três assinantes no mesmo canal lógico ----
  const caixaA = [];
  const caixaB = [];
  const caixaC = [];
  const canalA = await inscrever(a.client, jointId, caixaA);
  const canalB = await inscrever(b.client, jointId, caixaB);
  const canalC = await inscrever(c.client, jointId, caixaC);
  console.log('[joint-realtime] 2 participantes + 1 intruso inscritos');

  // ---- gera mudanças ----
  const modo = await a.client.rpc('set_joint_session_mode', {
    p_joint_session_id: jointId,
    p_mode: 'each_own',
    p_muscle_group: 'Peito',
  });
  assert(!modo.error, `set_joint_session_mode: ${modo.error?.message}`);

  const confA = await a.client.rpc('confirm_joint_participant_session', {
    p_joint_session_id: jointId,
    p_planned_session_id: planoA.sessionId,
  });
  assert(!confA.error, `confirm host: ${confA.error?.message}`);
  const confB = await b.client.rpc('confirm_joint_participant_session', {
    p_joint_session_id: jointId,
    p_planned_session_id: planoB.sessionId,
  });
  assert(!confB.error, `confirm guest: ${confB.error?.message}`);

  await a.client.rpc('set_joint_participant_ready', {
    p_joint_session_id: jointId,
    p_ready: true,
  });
  const ativou = await b.client.rpc('set_joint_participant_ready', {
    p_joint_session_id: jointId,
    p_ready: true,
  });
  assert(!ativou.error, `ready: ${ativou.error?.message}`);

  const entregou = await aguardarAte(() => caixaA.length > 0 && caixaB.length > 0);

  // ---- G2a / G2b ----
  assert(entregou, 'nem os dois participantes receberam mudanças dentro do prazo');
  assert(caixaA.length > 0, 'o anfitrião NÃO recebeu nenhuma mudança pelo Realtime');
  assert(caixaB.length > 0, 'o convidado NÃO recebeu nenhuma mudança pelo Realtime');
  // Margem para o intruso receber algo indevido antes de afirmar que não recebeu.
  await esperar(1_500);
  console.log(
    `[joint-realtime] entregas — anfitrião: ${caixaA.length}, convidado: ${caixaB.length}, intruso: ${caixaC.length}`,
  );
  assert(
    caixaC.length === 0,
    `VAZAMENTO: o intruso recebeu ${caixaC.length} mudança(s) de uma sessão que não é dele`,
  );

  // ---- G2c: reconexão reconcilia pelo snapshot ----
  await a.client.removeChannel(canalA);
  const antesDaQueda = caixaA.length;

  const pausou = await b.client.rpc('pause_joint_session', {
    p_joint_session_id: jointId,
    p_reason: 'participant_request',
  });
  assert(!pausou.error, `pause: ${pausou.error?.message}`);
  await esperar(2_500);
  assert(
    caixaA.length === antesDaQueda,
    'o canal removido continuou entregando — a queda não foi real',
  );

  // RECONEXÃO DE VERDADE: reassina um canal NOVO e só então busca o snapshot.
  // A rodada 1 fazia SELECT com o canal derrubado e chamava isso de reconexão —
  // provava que a leitura funciona, não que o cliente volta a receber.
  const caixaReconectada = [];
  const canalNovo = await inscrever(a.client, jointId, caixaReconectada);
  console.log('[joint-realtime] canal reassinado após a queda');

  const snapshot = await a.client
    .from('joint_sessions')
    .select('id, status, pause_reason, turn_seq')
    .eq('id', jointId)
    .single();
  assert(!snapshot.error, `snapshot: ${snapshot.error?.message}`);
  assert(
    snapshot.data.status === 'paused',
    `o snapshot autoritativo não trouxe a pausa (status ${snapshot.data.status})`,
  );

  // E o canal reassinado precisa ENTREGAR de novo — é isso que fecha G2.
  const retomou = await b.client.rpc('resume_joint_session', { p_joint_session_id: jointId });
  assert(!retomou.error, `resume: ${retomou.error?.message}`);
  assert(
    await aguardarAte(() => caixaReconectada.length > 0),
    'o canal reassinado NÃO voltou a entregar — reconexão incompleta',
  );
  assert(caixaC.length === 0, `VAZAMENTO: o intruso recebeu ${caixaC.length} após a retomada`);
  console.log(
    `[joint-realtime] reconexão completa — snapshot reconciliou e o canal novo entregou ${caixaReconectada.length}`,
  );
  await a.client.removeChannel(canalNovo);

  // ---- o intruso também não LÊ ----
  const leituraIntruso = await c.client
    .from('joint_sessions')
    .select('id')
    .eq('id', jointId);
  assert(!leituraIntruso.error, `leitura do intruso: ${leituraIntruso.error?.message}`);
  assert(
    (leituraIntruso.data ?? []).length === 0,
    'VAZAMENTO: o intruso conseguiu LER a sessão conjunta',
  );

  await b.client.removeChannel(canalB);
  await c.client.removeChannel(canalC);
});
