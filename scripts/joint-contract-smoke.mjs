// scripts/joint-contract-smoke.mjs
// Treino Conjunto 2.0 — Sprint 01. Contrato exercitado com JWT REAL via PostgREST.
//
//   node scripts/joint-contract-smoke.mjs
//
// POR QUE ESTE ARQUIVO EXISTE, e não mais um bloco no `begin/rollback`:
// a prova SQL conecta como `postgres` e troca de papel com `SET LOCAL ROLE`.
// Isso NÃO é fiel ao caminho real — o PostgREST entra como `authenticator` e
// assume `authenticated` com o JWT do usuário. A diferença deixou passar um furo
// real na rodada 1: o gatilho do guard chamava função revogada de
// `authenticated`, e `finish_session` solo depois do abandono quebrava.
//
// E POR QUE ELE FOI REESCRITO na rodada 3: a versão anterior chamava quase tudo
// com um UUID falso. Isso prova que a PRIMEIRA guarda dispara — não que o
// caminho legítimo funciona, nem que os helpers e gatilhos internos são
// alcançáveis. Cada caso aqui agora monta o ESTADO em que a RPC é legítima e
// afirma um resultado ESPECÍFICO, não "algum erro do vocabulário".
//
// Cobertura: B20a · B20b (tabela por RPC) · A23a (matriz nos TRÊS terminais) ·
// H1–H16 sob JWT real · C3/C18b com cópia confirmada, na troca E no
// cancelamento · C19 · C10b · E8 cardio bilateral · E9–E11 nas duas direções.

import { createClient } from '@supabase/supabase-js';
import {
  assert,
  criarPlanoCardio,
  criarPlanoDeTeste,
  errcode,
  gravarSerie,
  liberarConta,
  montarAtiva,
  montarConvite,
  montarLobby,
  prepararAmbiente,
  retrato,
  rodarHarness,
  un,
} from './joint-smoke-shared.mjs';

const FAKE = '00000000-0000-0000-0000-0000000000ff';

/** Assinaturas das 14 RPCs de cliente. */
const ASSINATURAS = (id) => [
  ['create_joint_session', {}],
  ['join_joint_session', { p_invite_code: 'ZZZZZZ' }],
  ['set_joint_session_mode', { p_joint_session_id: id, p_mode: 'each_own', p_muscle_group: 'Peito' }],
  ['confirm_joint_participant_session', { p_joint_session_id: id, p_planned_session_id: id }],
  ['materialize_joint_session_copy', { p_joint_session_id: id }],
  ['set_joint_participant_ready', { p_joint_session_id: id, p_ready: true }],
  ['advance_joint_turn', { p_joint_session_id: id, p_client_event_id: 'x', p_expected_turn_seq: 1, p_set_log_id: id }],
  ['mark_joint_queue_finished', { p_joint_session_id: id }],
  ['pause_joint_session', { p_joint_session_id: id, p_reason: 'participant_request' }],
  ['resume_joint_session', { p_joint_session_id: id }],
  ['touch_joint_presence', { p_joint_session_id: id }],
  ['complete_joint_participant', { p_joint_session_id: id }],
  ['abandon_joint_session', { p_joint_session_id: id }],
  ['joint_session_partner_profile', { p_joint_session_id: id }],
];

/** R3–R13: as mutantes que recebem `p_joint_session_id`. */
const MUTANTES = (id) => ASSINATURAS(id).slice(2, 13);

await rodarHarness('joint-contract', 4, async (ctx, [a, b, c, d]) => {
  // ============================================================
  // B20a — as 14 RPCs, como `anon`, falham POR PRIVILÉGIO
  // ============================================================
  {
    const anon = createClient(ctx.url, ctx.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const [nome, params] of ASSINATURAS(FAKE)) {
      const r = await anon.rpc(nome, params);
      assert(r.error != null, `B20a: ${nome} NÃO falhou para anon`);
      const msg = `${r.error.message} ${r.error.code ?? ''}`.toLowerCase();
      assert(
        msg.includes('permission denied') || errcode(r) === '42501',
        `B20a: ${nome} falhou por outro motivo que não privilégio: ${r.error.message}`,
      );
    }
    console.log('[joint-contract] B20a ok — 14/14 recusadas a anon por privilégio');
  }

  const planoA = await criarPlanoDeTeste(ctx, a.id, 'Peito A');
  const planoB = await criarPlanoDeTeste(ctx, b.id, 'Peito B');

  // ============================================================
  // B20b — UM CASO POR RPC, cada um no estado em que ela é legítima,
  //        com resultado ESPECÍFICO. Nada de UUID falso.
  // ============================================================
  {
    const resultados = [];
    const registrar = (rpc, estado, ator, esperado, obtido) => {
      assert(
        obtido === esperado,
        `B20b [${rpc}] estado=${estado} ator=${ator}: obtido ${obtido}, esperado ${esperado}`,
      );
      resultados.push(rpc);
    };

    // R1 — sem pertencimento vivo ⟹ SUCESSO
    await liberarConta(ctx, a);
    const r1 = await a.client.rpc('create_joint_session');
    registrar('create_joint_session', 'sem pertencimento', 'host', 'sucesso', r1.error ? errcode(r1) : 'sucesso');
    const joint = un(r1);

    // R2 — código válido, conta livre ⟹ SUCESSO
    await liberarConta(ctx, b);
    const r2 = await b.client.rpc('join_joint_session', { p_invite_code: joint.invite_code });
    registrar('join_joint_session', 'inviting', 'convidado livre',
      'sucesso', r2.error ? errcode(r2) : (un(r2)?.id ? 'sucesso' : 'nulo'));

    // R3 — host, lobby ⟹ SUCESSO
    const r3 = await a.client.rpc('set_joint_session_mode', {
      p_joint_session_id: joint.id, p_mode: 'host_plan',
    });
    registrar('set_joint_session_mode', 'lobby', 'host', 'sucesso', r3.error ? errcode(r3) : 'sucesso');

    // R4 — dono confirma a própria sessão ⟹ SUCESSO
    const r4 = await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id, p_planned_session_id: planoA.sessionId,
    });
    registrar('confirm_joint_participant_session', 'lobby/host_plan', 'dono da fonte',
      'sucesso', r4.error ? errcode(r4) : 'sucesso');

    // R5 — quem NÃO é dono da fonte materializa ⟹ SUCESSO
    const r5 = await b.client.rpc('materialize_joint_session_copy', { p_joint_session_id: joint.id });
    registrar('materialize_joint_session_copy', 'lobby/host_plan', 'convidado',
      'sucesso', r5.error ? errcode(r5) : 'sucesso');
    const copiaId = un(r5).id;
    await b.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id, p_planned_session_id: copiaId,
    });

    // R6 — participante com sessão escolhida ⟹ SUCESSO (e ativa)
    await a.client.rpc('set_joint_participant_ready', { p_joint_session_id: joint.id, p_ready: true });
    const r6 = await b.client.rpc('set_joint_participant_ready', { p_joint_session_id: joint.id, p_ready: true });
    registrar('set_joint_participant_ready', 'lobby, ambos com sessão', 'convidado',
      'sucesso', r6.error ? errcode(r6) : 'sucesso');
    assert(un(r6).status === 'active', 'B20b: R6 não ativou');

    const parts = await ctx.admin
      .from('joint_session_participants').select('user_id, session_log_id')
      .eq('joint_session_id', joint.id);
    const logA = parts.data.find((p) => p.user_id === a.id).session_log_id;
    const logB = parts.data.find((p) => p.user_id === b.id).session_log_id;

    // R11 — participante em sessão ativa ⟹ SUCESSO
    const r11 = await a.client.rpc('touch_joint_presence', { p_joint_session_id: joint.id });
    registrar('touch_joint_presence', 'active', 'participante', 'sucesso', r11.error ? errcode(r11) : 'sucesso');

    // R7 — quem está na vez, com série própria e seq certo ⟹ SUCESSO
    const serie = await gravarSerie(a.client, logA, planoA.setIds[0], { reps: 8, carga: 60, rir: 2 });
    const r7 = await a.client.rpc('advance_joint_turn', {
      p_joint_session_id: joint.id, p_client_event_id: 'b20b-a1',
      p_expected_turn_seq: 1, p_set_log_id: serie.id,
    });
    registrar('advance_joint_turn', 'active, minha vez', 'host', 'sucesso', r7.error ? errcode(r7) : 'sucesso');

    // R9 — participante em sessão ativa ⟹ SUCESSO
    const r9 = await a.client.rpc('pause_joint_session', {
      p_joint_session_id: joint.id, p_reason: 'participant_request',
    });
    registrar('pause_joint_session', 'active', 'participante', 'sucesso', r9.error ? errcode(r9) : 'sucesso');

    // R10 — sessão pausada ⟹ SUCESSO
    const r10 = await a.client.rpc('resume_joint_session', { p_joint_session_id: joint.id });
    registrar('resume_joint_session', 'paused', 'participante', 'sucesso', r10.error ? errcode(r10) : 'sucesso');

    // R8 — quem está na vez, MAS com fila pendente ⟹ P0001 (erro de domínio
    //      próprio, não genérico: a RPC percorreu tudo e chegou à regra dela)
    const r8 = await b.client.rpc('mark_joint_queue_finished', { p_joint_session_id: joint.id });
    registrar('mark_joint_queue_finished', 'active, na vez, fila pendente', 'convidado',
      'P0001', r8.error ? errcode(r8) : 'sucesso');

    // R12 — participante com fila pendente ⟹ P0001 (mesma lógica)
    const r12 = await b.client.rpc('complete_joint_participant', { p_joint_session_id: joint.id });
    registrar('complete_joint_participant', 'active, fila pendente', 'convidado',
      'P0001', r12.error ? errcode(r12) : 'sucesso');

    // R14 — participante ⟹ SUCESSO, com o nome do parceiro
    const r14 = await a.client.rpc('joint_session_partner_profile', { p_joint_session_id: joint.id });
    registrar('joint_session_partner_profile', 'active', 'participante',
      'sucesso', r14.error ? errcode(r14) : 'sucesso');
    assert(un(r14)?.user_id === b.id, 'B20b: R14 não devolveu o parceiro certo');

    // R13 — participante em sessão viva ⟹ SUCESSO
    const r13 = await a.client.rpc('abandon_joint_session', { p_joint_session_id: joint.id });
    registrar('abandon_joint_session', 'active', 'participante', 'sucesso', r13.error ? errcode(r13) : 'sucesso');
    assert(un(r13).status === 'abandoned', 'B20b: R13 não levou a abandoned');

    assert(resultados.length === 14, `B20b: ${resultados.length} RPCs exercitadas, esperado 14`);
    console.log('[joint-contract] B20b ok — 14/14 no estado legítimo, resultado específico por RPC');

    // C19 / H11 — depois de `abandoned`, o fluxo solo conclui
    const fim = await a.client.rpc('finish_session', { p_session_log_id: logA });
    assert(!fim.error, `C19: finish_session pós-abandono falhou (${errcode(fim)} ${fim.error?.message})`);
    const ps = await ctx.admin.from('planned_sessions').select('status').eq('id', planoA.sessionId).single();
    assert(ps.data.status === 'completed', `C19: sessão do host ficou ${ps.data.status}`);
    const js = await ctx.admin.from('joint_sessions').select('status').eq('id', joint.id).single();
    assert(js.data.status === 'abandoned', 'C19: abandono virou conclusão conjunta');
    await b.client.rpc('finish_session', { p_session_log_id: logB });
    console.log('[joint-contract] C19/H11 ok — finish solo conclui após abandoned');
  }

  // ============================================================
  // A23a — matriz R3–R13 × os TRÊS estados terminais, com retrato
  // ============================================================
  {
    const terminais = {};

    // canceled — abandono a partir do lobby
    {
      const j = await montarLobby(ctx, c, d, {});
      await c.client.rpc('abandon_joint_session', { p_joint_session_id: j.id });
      terminais.canceled = j.id;
    }
    // abandoned — abandono a partir de active
    {
      const planoC = await criarPlanoDeTeste(ctx, c.id, 'Term C');
      const planoD = await criarPlanoDeTeste(ctx, d.id, 'Term D');
      const { joint } = await montarAtiva(ctx, c, d, planoC.sessionId, planoD.sessionId);
      await c.client.rpc('abandon_joint_session', { p_joint_session_id: joint.id });
      terminais.abandoned = joint.id;
    }
    // completed — os dois concluem de verdade
    {
      const planoC = await criarPlanoDeTeste(ctx, c.id, 'Fim C');
      const planoD = await criarPlanoDeTeste(ctx, d.id, 'Fim D');
      const { joint, logHost, logGuest } = await montarAtiva(ctx, c, d, planoC.sessionId, planoD.sessionId);
      await gravarSerie(c.client, logHost, planoC.setIds[0], { reps: 8, carga: 50, rir: 2 });
      await gravarSerie(d.client, logGuest, planoD.setIds[0], { reps: 10, carga: 30, rir: 1 });
      await c.client.rpc('complete_joint_participant', { p_joint_session_id: joint.id });
      const fim = await d.client.rpc('complete_joint_participant', { p_joint_session_id: joint.id });
      assert(un(fim).status === 'completed', `A23a: sessão não concluiu (${un(fim)?.status})`);
      terminais.completed = joint.id;
    }

    for (const [estado, jointId] of Object.entries(terminais)) {
      const antes = await retrato(ctx, jointId);
      let recusadas = 0;
      for (const [nome, params] of MUTANTES(jointId)) {
        const r = await c.client.rpc(nome, params);
        assert(r.error != null, `A23a[${estado}]: ${nome} foi ACEITA em sessão terminal`);
        assert(
          errcode(r) === '55000',
          `A23a[${estado}]: ${nome} devolveu ${errcode(r)} (esperado 55000): ${r.error.message}`,
        );
        recusadas += 1;
      }
      assert(recusadas === 11, `A23a[${estado}]: ${recusadas} mutantes checadas, esperado 11`);
      const depois = await retrato(ctx, jointId);
      assert(antes === depois, `A23a[${estado}]: uma RPC recusada MUDOU o estado`);

      // A23b — a leitura do parceiro continua servindo o histórico
      const perfil = await c.client.rpc('joint_session_partner_profile', { p_joint_session_id: jointId });
      assert(!perfil.error && un(perfil)?.user_id, `A23b[${estado}]: perfil do parceiro sumiu`);
    }
    console.log('[joint-contract] A23a/A23b ok — 11 mutantes × 3 terminais, estado intacto, R14 legível');
  }

  // ============================================================
  // H1–H16 sob JWT REAL
  // ============================================================
  {
    await liberarConta(ctx, a); await liberarConta(ctx, b);
    const pA = await criarPlanoDeTeste(ctx, a.id, 'Guard A');
    const pB = await criarPlanoDeTeste(ctx, b.id, 'Guard B');

    // --- no LOBBY: H4, H5 ---
    const lobby = await montarLobby(ctx, a, b, {
      mode: 'each_own', muscleGroup: 'Peito', confirmar: true,
      sessaoHost: pA.sessionId, sessaoGuest: pB.sessionId,
    });
    const logsAntes = await ctx.admin
      .from('session_logs').select('id').eq('planned_session_id', pA.sessionId);

    const h4 = await a.client.rpc('start_session', {
      p_planned_session_id: pA.sessionId, p_mood: null, p_available_minutes: null,
    });
    assert(errcode(h4) === '42501', `H4: start_session no lobby devolveu ${errcode(h4)}`);
    const h5 = await a.client.from('session_logs').insert({
      planned_session_id: pA.sessionId, user_id: a.id,
    });
    assert(errcode(h5) === '42501', `H5: insert direto devolveu ${errcode(h5)}`);
    const logsDepois = await ctx.admin
      .from('session_logs').select('id').eq('planned_session_id', pA.sessionId);
    assert(
      (logsAntes.data ?? []).length === (logsDepois.data ?? []).length,
      'H4/H5: um bypass recusado criou log mesmo assim',
    );

    // --- ATIVA: H1, H2, H3, H6, H7, H8, H9, H10, H13, H16 ---
    await a.client.rpc('set_joint_participant_ready', { p_joint_session_id: lobby.id, p_ready: true });
    const at = await b.client.rpc('set_joint_participant_ready', { p_joint_session_id: lobby.id, p_ready: true });
    assert(un(at).status === 'active', 'H: ativação falhou');
    const partsG = await ctx.admin
      .from('joint_session_participants').select('user_id, session_log_id')
      .eq('joint_session_id', lobby.id);
    const logGA = partsG.data.find((p) => p.user_id === a.id).session_log_id;

    // H13 — as RPCs conjuntas ATRAVESSAM o guard: os dois logs existem.
    assert(
      partsG.data.every((p) => p.session_log_id != null),
      'H13: a ativação bilateral não criou os dois logs — o guard barrou a própria máquina',
    );

    const antes = await retrato(ctx, lobby.id);
    // Cada caso declara o errcode que ELE realmente produz. `unskip` é o único
    // que não é recusado pelo guard: a sessão está `in_progress`, então a
    // pré-condição da própria RPC ("não está recusada") dispara antes. Continua
    // sendo recusa e o estado continua intacto — mas afirmar 42501 ali seria
    // inventar evidência sobre quem barrou.
    const casos = [
      ['H1 update joint_session_id', '42501', () => a.client.from('planned_sessions')
        .update({ joint_session_id: FAKE }).eq('id', pA.sessionId)],
      ['H2 null joint_session_id', '42501', () => a.client.from('planned_sessions')
        .update({ joint_session_id: null }).eq('id', pA.sessionId)],
      ['H3 update status=completed', '42501', () => a.client.from('planned_sessions')
        .update({ status: 'completed' }).eq('id', pA.sessionId)],
      // Conclusão silenciosa e recusa silenciosa são caminhos DIFERENTES do
      // cliente; os dois precisam bater no gatilho.
      ['H3 update status=skipped', '42501', () => a.client.from('planned_sessions')
        .update({ status: 'skipped' }).eq('id', pA.sessionId)],
      ['H6 finish_session', '42501', () => a.client.rpc('finish_session', { p_session_log_id: logGA })],
      ['H7 update finished_at', '42501', () => a.client.from('session_logs')
        .update({ finished_at: new Date().toISOString() }).eq('id', logGA)],
      ['H8 skip_planned_session (guard)', '42501', () => a.client.rpc('skip_planned_session', {
        p_planned_session_id: pA.sessionId, p_reason: 'cansaco', p_note: null })],
      ['H8 unskip_planned_session (pré-condição da RPC)', '55000',
        () => a.client.rpc('unskip_planned_session', { p_planned_session_id: pA.sessionId })],
      ['H9 delete session_log', '42501', () => a.client.from('session_logs').delete().eq('id', logGA)],
      ['H9 delete planned_session', '42501',
        () => a.client.from('planned_sessions').delete().eq('id', pA.sessionId)],
      // H10 é recusado pela FK `RESTRICT` de joint_session_participants ANTES de
      // o gatilho opinar — o contrato dizia que o guard barrava, e estava errado
      // sobre o mecanismo. A trilha fica protegida do mesmo jeito, com o guard
      // como segunda linha (quando a sessão é terminal e a FK já foi solta).
      ['H10 delete training_plan', '23503',
        () => a.client.from('training_plans').delete().eq('id', pA.planId)],
    ];
    for (const [rotulo, esperado, executar] of casos) {
      const r = await executar();
      assert(r.error != null, `${rotulo}: o bypass NÃO foi recusado`);
      assert(
        errcode(r) === esperado,
        `${rotulo}: devolveu ${errcode(r)} (esperado ${esperado}): ${r.error.message}`,
      );
    }
    // H16 — nenhum bypass recusado alterou nada
    assert(antes === (await retrato(ctx, lobby.id)), 'H16: um bypass recusado mudou o estado');
    const logAindaAberto = await ctx.admin
      .from('session_logs').select('finished_at').eq('id', logGA).single();
    assert(logAindaAberto.data.finished_at === null, 'H16: um bypass fechou o log');
    console.log('[joint-contract] H1–H10, H13, H16 ok — 11 bypasses recusados sob JWT real (9 pelo guard, 1 por pré-condição, 1 por FK), estado intacto');

    // --- TERMINAL: H2 e H9 depois de `abandoned` ---
    // Depois do encerramento a trilha é justamente o que não pode sumir. Os
    // guards de status/finished_at soltam (é o que faz C19 funcionar), mas os
    // de VÍNCULO e de DELETE continuam valendo — e isso precisa ter regressão
    // versionada, não só ter passado num teste avulso.
    {
      const abn = await a.client.rpc('abandon_joint_session', { p_joint_session_id: lobby.id });
      assert(un(abn).status === 'abandoned', `H terminal: status ${un(abn)?.status}`);
      const antesT = await retrato(ctx, lobby.id);

      const casosTerminais = [
        ['H2 terminal: null joint_session_id', () => a.client.from('planned_sessions')
          .update({ joint_session_id: null }).eq('id', pA.sessionId)],
        ['H2 terminal: trocar joint_session_id', () => a.client.from('planned_sessions')
          .update({ joint_session_id: FAKE }).eq('id', pA.sessionId)],
        ['H9 terminal: delete planned_session', () => a.client.from('planned_sessions')
          .delete().eq('id', pA.sessionId)],
        ['H9 terminal: delete session_log', () => a.client.from('session_logs')
          .delete().eq('id', logGA)],
      ];
      for (const [rotulo, executar] of casosTerminais) {
        const r = await executar();
        assert(r.error != null, `${rotulo}: NÃO foi recusado depois do encerramento`);
        assert(errcode(r) === '42501', `${rotulo}: devolveu ${errcode(r)} (esperado 42501): ${r.error.message}`);
      }
      assert(antesT === (await retrato(ctx, lobby.id)), 'H terminal: uma recusa mudou o estado');

      const vinculo = await ctx.admin
        .from('planned_sessions').select('joint_session_id').eq('id', pA.sessionId).single();
      assert(vinculo.data.joint_session_id === lobby.id, 'H terminal: o vínculo foi rompido');
      console.log('[joint-contract] H2/H9 terminais ok — 4 recusas após abandoned, trilha intacta');
    }

    // --- H12: fluxo solo INTACTO, sob JWT real ---
    await liberarConta(ctx, c);
    const solo = await criarPlanoDeTeste(ctx, c.id, 'Solo puro');
    const s1 = await c.client.rpc('start_session', {
      p_planned_session_id: solo.sessionId, p_mood: 'normal', p_available_minutes: 60,
    });
    assert(!s1.error, `H12: start_session solo falhou (${s1.error?.message})`);
    const soloLog = un(s1).id;
    const s2 = await gravarSerie(c.client, soloLog, solo.setIds[0], { reps: 10, carga: 40, rir: 2 });
    assert(s2.id, 'H12: save_set_log solo falhou');
    const s3 = await c.client.rpc('finish_session', { p_session_log_id: soloLog });
    assert(!s3.error, `H12: finish_session solo falhou (${s3.error?.message})`);
    const solo2 = await criarPlanoDeTeste(ctx, c.id, 'Solo recusa');
    const s4 = await c.client.rpc('skip_planned_session', {
      p_planned_session_id: solo2.sessionId, p_reason: 'cansaco', p_note: null,
    });
    assert(!s4.error, `H12: skip_planned_session solo falhou (${s4.error?.message})`);
    const s5 = await c.client.rpc('unskip_planned_session', { p_planned_session_id: solo2.sessionId });
    assert(!s5.error, `H12: unskip solo falhou (${s5.error?.message})`);
    const s6 = await c.client.from('planned_sessions')
      .update({ status: 'skipped', skip_source: 'replan', skipped_at: new Date().toISOString() })
      .eq('id', solo2.sessionId);
    assert(!s6.error, `H12: update direto do replanejador falhou (${s6.error?.message})`);
    console.log('[joint-contract] H12 ok — fluxo solo íntegro sob JWT real, inclusive o replanejador');

  }

  // ============================================================
  // H15 — apagar conta funciona e não leva o histórico do parceiro
  // ============================================================
  {
    const contas = [];
    const email = `joint-h15-${Date.now()}@forca.test`;
    const criada = await ctx.admin.auth.admin.createUser({
      email, password: 'Fx-h15-descartavel!9', email_confirm: true,
    });
    assert(!criada.error, `H15: não criou a conta (${criada.error?.message})`);
    const efemero = createClient(ctx.url, ctx.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await efemero.auth.signInWithPassword({ email, password: 'Fx-h15-descartavel!9' });
    contas.push(criada.data.user.id);

    await liberarConta(ctx, d);
    const pE = await criarPlanoDeTeste(ctx, criada.data.user.id, 'H15 efêmero');
    const pD = await criarPlanoDeTeste(ctx, d.id, 'H15 parceiro');
    const efemeroConta = { id: criada.data.user.id, client: efemero };
    const { joint, logGuest } = await montarAtiva(ctx, efemeroConta, d, pE.sessionId, pD.sessionId);
    await gravarSerie(d.client, logGuest, pD.setIds[0], { reps: 11, carga: 22, rir: 3 });

    const apagou = await ctx.admin.auth.admin.deleteUser(criada.data.user.id);
    assert(!apagou.error, `H15: apagar a conta falhou (${apagou.error?.message}) — retenção indevida`);

    const sobrou = await ctx.admin.from('joint_sessions').select('id').eq('id', joint.id);
    assert((sobrou.data ?? []).length === 0, 'H15: a sessão conjunta sobreviveu ao apagamento');
    const logParceiro = await ctx.admin.from('session_logs').select('id').eq('id', logGuest);
    assert((logParceiro.data ?? []).length === 1, 'H15: o log do PARCEIRO foi apagado junto');
    const vinculo = await ctx.admin
      .from('planned_sessions').select('joint_session_id').eq('id', pD.sessionId).single();
    assert(vinculo.data.joint_session_id === null, 'H15: o vínculo do parceiro não virou nulo');
    console.log('[joint-contract] H15 ok — conta apagada, histórico do parceiro intacto, vínculo nulo');
  }

  // ============================================================
  // C18b / F11 — CANCELAMENTO com cópia materializada E confirmada
  // ============================================================
  {
    await liberarConta(ctx, a); await liberarConta(ctx, b);
    const pA = await criarPlanoDeTeste(ctx, a.id, 'Cancel A');
    const j = await montarLobby(ctx, a, b, { mode: 'host_plan' });
    await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: j.id, p_planned_session_id: pA.sessionId,
    });
    const copia = await b.client.rpc('materialize_joint_session_copy', { p_joint_session_id: j.id });
    assert(!copia.error, `F11: materialize falhou (${copia.error?.message})`);
    const copiaId = un(copia).id;
    const conf = await b.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: j.id, p_planned_session_id: copiaId,
    });
    assert(!conf.error, `F11: confirm da cópia falhou (${conf.error?.message})`);

    // O branch `canceled` do abandon_joint_session, com a FK ocupada.
    const canc = await a.client.rpc('abandon_joint_session', { p_joint_session_id: j.id });
    assert(!canc.error, `F11: cancelamento com cópia confirmada falhou (${errcode(canc)} ${canc.error?.message})`);
    assert(un(canc).status === 'canceled', `F11: status ${un(canc).status}`);

    const restou = await ctx.admin.from('planned_sessions').select('id').eq('id', copiaId);
    assert((restou.data ?? []).length === 0, 'F11: a cópia sobreviveu ao cancelamento');
    const real = await ctx.admin
      .from('planned_sessions').select('joint_session_id').eq('id', pA.sessionId).single();
    assert(real.data.joint_session_id === null, 'F11: a sessão real ficou presa após o cancelamento');

    // E ela volta a ser usável em outro treino conjunto.
    const j2 = await montarLobby(ctx, a, b, { mode: 'each_own', muscleGroup: 'Peito' });
    const rec = await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: j2.id, p_planned_session_id: pA.sessionId,
    });
    assert(!rec.error, `F11: sessão real não reutilizável (${rec.error?.message})`);
    await a.client.rpc('abandon_joint_session', { p_joint_session_id: j2.id });
    console.log('[joint-contract] C18b/F11 ok — cancelamento com cópia CONFIRMADA libera tudo');
  }

  // ============================================================
  // E8 cardio bilateral + E9–E11 nas DUAS direções
  // ============================================================
  {
    await liberarConta(ctx, a); await liberarConta(ctx, b);
    const cardioA = await criarPlanoCardio(ctx, a.id, 'Corrida A');
    const cardioB = await criarPlanoCardio(ctx, b.id, 'Corrida B');
    const { joint, logHost, logGuest } = await montarAtiva(
      ctx, a, b, cardioA.sessionId, cardioB.sessionId, 'Cardio',
    );

    // E8 — dois set_logs de CARDIO com números diferentes nos três campos.
    const sA = await gravarSerie(a.client, logHost, cardioA.setIds[0], {
      duracao: 1800, distancia: 5200, esforco: 'forte',
    });
    const sB = await gravarSerie(b.client, logGuest, cardioB.setIds[0], {
      duracao: 1500, distancia: 4100, esforco: 'moderado',
    });
    assert(sA.actual_duration_seconds !== sB.actual_duration_seconds, 'E8 cardio: durações iguais');
    assert(Number(sA.actual_distance_m) !== Number(sB.actual_distance_m), 'E8 cardio: distâncias iguais');
    assert(sA.perceived_effort !== sB.perceived_effort, 'E8 cardio: esforços iguais');
    assert(sA.actual_reps == null && sB.actual_reps == null, 'E8 cardio: gravou repetição em cardio');
    console.log(
      `[joint-contract] E8 cardio ok — ${sA.actual_duration_seconds}s/${sA.actual_distance_m}m/${sA.perceived_effort}`
      + ` vs ${sB.actual_duration_seconds}s/${sB.actual_distance_m}m/${sB.perceived_effort}`,
    );

    await a.client.rpc('complete_joint_participant', { p_joint_session_id: joint.id });
    await b.client.rpc('complete_joint_participant', { p_joint_session_id: joint.id });

    // E9/E10/E11 — nas DUAS direções, cada uma sob o próprio JWT.
    //
    // ANCORADAS NO LOG DESTE CENÁRIO e conferindo VALOR, não contagem: as contas
    // do harness já têm execuções anteriores, então "trouxe alguma linha"
    // passaria verde com dado de outro treino. O que prova registro individual é
    // cada um ver os PRÓPRIOS números — e exatamente eles.
    const esperados = new Map([
      [logHost, { duracao: 1800, distancia: 5200, esforco: 'forte' }],
      [logGuest, { duracao: 1500, distancia: 4100, esforco: 'moderado' }],
    ]);
    const pares = [[a, logHost, b, logGuest], [b, logGuest, a, logHost]];
    for (const [eu, meuLog, parceiro, logDoParceiro] of pares) {
      const hist = await eu.client
        .from('session_logs').select('id').eq('user_id', eu.id).not('finished_at', 'is', null);
      assert(!hist.error, `E9: ${hist.error?.message}`);
      const ids = (hist.data ?? []).map((r) => r.id);
      assert(ids.includes(meuLog), 'E9: o próprio registro não aparece');
      assert(!ids.includes(logDoParceiro), 'E9: VAZAMENTO — registro do parceiro no histórico');

      // E10 — progresso ancorado NESTE log, com os valores exatos.
      const meu = esperados.get(meuLog);
      const prog = await eu.client
        .from('set_logs')
        .select('actual_duration_seconds, actual_distance_m, perceived_effort, actual_reps, session_logs!inner(user_id)')
        .eq('session_logs.user_id', eu.id)
        .eq('session_log_id', meuLog);
      assert(!prog.error, `E10: ${prog.error?.message}`);
      assert((prog.data ?? []).length === 1, `E10: ${prog.data?.length} linhas para o log do cenário`);
      const linha = prog.data[0];
      assert(linha.actual_duration_seconds === meu.duracao,
        `E10: duração ${linha.actual_duration_seconds}, esperado ${meu.duracao}`);
      assert(Number(linha.actual_distance_m) === meu.distancia,
        `E10: distância ${linha.actual_distance_m}, esperado ${meu.distancia}`);
      assert(linha.perceived_effort === meu.esforco,
        `E10: esforço ${linha.perceived_effort}, esperado ${meu.esforco}`);
      assert(linha.actual_reps == null, 'E10: cardio gravou repetição');

      // E11 — detalhe PRÓPRIO conferido valor a valor; do parceiro, zero linhas.
      const detalhe = await eu.client
        .from('set_logs')
        .select('actual_duration_seconds, actual_distance_m, perceived_effort')
        .eq('session_log_id', meuLog);
      assert((detalhe.data ?? []).length === 1, 'E11: o próprio detalhe não é visível');
      assert(detalhe.data[0].actual_duration_seconds === meu.duracao, 'E11: detalhe próprio divergente');
      assert(detalhe.data[0].perceived_effort === meu.esforco, 'E11: esforço próprio divergente');

      const alheio = esperados.get(logDoParceiro);
      assert(meu.duracao !== alheio.duracao, 'E11: os dois lados têm os mesmos números');
      const detalheAlheio = await eu.client
        .from('set_logs')
        .select('actual_duration_seconds, actual_distance_m, perceived_effort')
        .eq('session_log_id', logDoParceiro);
      assert(!detalheAlheio.error, `E11: ${detalheAlheio.error?.message}`);
      assert(
        (detalheAlheio.data ?? []).length === 0,
        `E11: VAZAMENTO — ${eu.id} enxerga ${detalheAlheio.data?.length} linha(s) de ${parceiro.id}`,
      );
    }
    console.log('[joint-contract] E9–E11 ok — valores próprios exatos nas duas direções, zero acesso cruzado');
  }
});
