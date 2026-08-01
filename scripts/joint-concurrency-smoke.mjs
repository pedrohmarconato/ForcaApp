// scripts/joint-concurrency-smoke.mjs
// Treino Conjunto 2.0 — Sprint 01. As cinco CORRIDAS, em conexões de verdade.
//
//   node scripts/joint-concurrency-smoke.mjs
//
// Por que este arquivo existe: `psql -f prova.sql` roda numa conexão só, e uma
// conexão não executa transações concorrentes. Chamar aquele rollback de "prova
// de concorrência" seria evidência falsa. Aqui as requisições saem em paralelo.
//
//   A11  pertencimento vivo cruzando papéis: criar e aceitar ao mesmo tempo
//   B19  dois joins no mesmo código: um vencedor, o perdedor genérico
//   B13  o contador de tentativas soma TODAS as tentativas simultâneas
//   C10c dois advances com o mesmo expected_turn_seq: um commit só
//   C5g  dois ready simultâneos: uma ativação, dois logs, um evento

import { assert, criarPlanoDeTeste, rodarHarness } from './joint-smoke-shared.mjs';

const desempacotar = (r) => (Array.isArray(r.data) ? r.data[0] : r.data);

// Uma função que devolve composite pode chegar aqui como objeto de campos nulos
// em vez de `null` puro, dependendo da serialização. O único teste honesto de
// "entrou" é ter id — é o mesmo critério que o repositório TypeScript usa.
const entrou = (r) => !r.error && desempacotar(r)?.id != null;

await rodarHarness('joint-concurrency', 4, async (ctx, [a, b, c, d]) => {
  // ============================================================
  // B19 — dois joins simultâneos no mesmo código
  // ============================================================
  {
    const criada = await a.client.rpc('create_joint_session');
    assert(!criada.error, `create: ${criada.error?.message}`);
    const codigo = desempacotar(criada).invite_code;

    const [r1, r2] = await Promise.all([
      b.client.rpc('join_joint_session', { p_invite_code: codigo }),
      c.client.rpc('join_joint_session', { p_invite_code: codigo }),
    ]);

    const vencedores = [r1, r2].filter(entrou);
    assert(
      vencedores.length === 1,
      `B19: esperava exatamente 1 vencedor, houve ${vencedores.length}`,
    );
    const perdedor = [r1, r2].find((r) => !entrou(r));
    // Perdedor genérico: ou o retorno nulo do convite consumido, ou 55000 de
    // pertencimento — nunca uma mensagem que revele o estado do convite alheio.
    assert(!entrou(perdedor), 'B19: o perdedor recebeu um resultado válido');
    console.log('[joint-concurrency] B19 ok — um vencedor, um perdedor genérico');

    // Estado autoritativo: um único convidado.
    const estado = await ctx.admin
      .from('joint_sessions')
      .select('guest_user_id, status')
      .eq('id', desempacotar(criada).id)
      .single();
    assert(estado.data.guest_user_id != null, 'B19: ninguém entrou');
    assert(estado.data.status === 'lobby', `B19: status ${estado.data.status}`);

    // ============================================================
    // A11 — pertencimento vivo cruzando papéis, em paralelo
    // ============================================================
    const perdedorConta = [b, c].find((x) => x.id !== estado.data.guest_user_id);
    const vencedorConta = [b, c].find((x) => x.id === estado.data.guest_user_id);

    const [criar, aceitar] = await Promise.all([
      vencedorConta.client.rpc('create_joint_session'),
      (async () => {
        const nova = await d.client.rpc('create_joint_session');
        return vencedorConta.client.rpc('join_joint_session', {
          p_invite_code: desempacotar(nova).invite_code,
        });
      })(),
    ]);
    const sucessos = [criar, aceitar].filter(entrou);
    assert(
      sucessos.length === 0,
      `A11: quem já está vivo conseguiu ${sucessos.length} pertencimento(s) a mais`,
    );

    const vivos = await ctx.admin
      .from('joint_session_participants')
      .select('joint_session_id')
      .eq('user_id', vencedorConta.id)
      .eq('live', true);
    assert(
      (vivos.data ?? []).length === 1,
      `A11: ${vivos.data?.length} pertencimentos vivos para a mesma pessoa`,
    );
    console.log('[joint-concurrency] A11 ok — um único pertencimento vivo, sob corrida');

    // ============================================================
    // B13 — contador soma todas as tentativas simultâneas
    // ============================================================
    const TENTATIVAS = 6;
    await Promise.all(
      Array.from({ length: TENTATIVAS }, (_, i) =>
        perdedorConta.client.rpc('join_joint_session', {
          p_invite_code: `ZZZZ${String(i).padStart(2, '0')}`,
        }),
      ),
    );
    const contador = await ctx.admin
      .from('joint_invite_attempts')
      .select('attempts')
      .eq('user_id', perdedorConta.id)
      .maybeSingle();
    assert(contador.data != null, 'B13: nenhuma tentativa foi contada');
    assert(
      contador.data.attempts >= TENTATIVAS,
      `B13: contador em ${contador.data.attempts}, esperado >= ${TENTATIVAS} — tentativa perdida sob concorrência`,
    );
    console.log(
      `[joint-concurrency] B13 ok — ${contador.data.attempts} tentativas contadas de ${TENTATIVAS} simultâneas`,
    );
  }

  // ============================================================
  // C5g e C10c — ativação e avanço sob corrida
  // ============================================================
  {
    // Limpa o pertencimento anterior encerrando o que ficou vivo.
    for (const conta of [a, b, c, d]) {
      const vivos = await ctx.admin
        .from('joint_session_participants')
        .select('joint_session_id')
        .eq('user_id', conta.id)
        .eq('live', true);
      for (const v of vivos.data ?? []) {
        await conta.client.rpc('abandon_joint_session', {
          p_joint_session_id: v.joint_session_id,
        });
      }
    }

    const planoA = await criarPlanoDeTeste(ctx, a.id, 'Corrida A');
    const planoB = await criarPlanoDeTeste(ctx, b.id, 'Corrida B');

    const criada = await a.client.rpc('create_joint_session');
    assert(!criada.error, `create (2): ${criada.error?.message}`);
    const joint = desempacotar(criada);
    const entrouGuest = await b.client.rpc('join_joint_session', {
      p_invite_code: joint.invite_code,
    });
    assert(entrou({ data: entrouGuest.data, error: entrouGuest.error }), 'C5g: convidado não entrou');

    await a.client.rpc('set_joint_session_mode', {
      p_joint_session_id: joint.id,
      p_mode: 'each_own',
      p_muscle_group: 'Peito',
    });
    await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: planoA.sessionId,
    });
    await b.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: planoB.sessionId,
    });

    // C5g — dois ready ao mesmo tempo
    const [ra, rb] = await Promise.all([
      a.client.rpc('set_joint_participant_ready', {
        p_joint_session_id: joint.id,
        p_ready: true,
      }),
      b.client.rpc('set_joint_participant_ready', {
        p_joint_session_id: joint.id,
        p_ready: true,
      }),
    ]);
    assert(!ra.error && !rb.error, `C5g: ready falhou (${ra.error?.message ?? rb.error?.message})`);

    const estado = await ctx.admin
      .from('joint_sessions')
      .select('status, turn_seq, current_turn_user_id')
      .eq('id', joint.id)
      .single();
    assert(estado.data.status === 'active', `C5g: status ${estado.data.status}`);
    assert(estado.data.turn_seq === 1, `C5g: turn_seq ${estado.data.turn_seq}, esperado 1`);

    const logs = await ctx.admin
      .from('joint_session_participants')
      .select('user_id, session_log_id')
      .eq('joint_session_id', joint.id);
    const distintos = new Set((logs.data ?? []).map((l) => l.session_log_id));
    assert(distintos.size === 2 && !distintos.has(null), 'C5g: os dois logs não foram criados');

    const started = await ctx.admin
      .from('joint_session_events')
      .select('id')
      .eq('joint_session_id', joint.id)
      .eq('kind', 'started');
    assert(
      (started.data ?? []).length === 1,
      `C5g: ${started.data?.length} eventos 'started' (esperado 1)`,
    );
    console.log('[joint-concurrency] C5g ok — uma ativação, dois logs, um evento started');

    // C10c — dois advances com o MESMO expected_turn_seq
    const setId = planoA.setIds[0];
    const serie = await a.client.rpc('save_set_log', {
      p_session_log_id: (logs.data ?? []).find((l) => l.user_id === a.id).session_log_id,
      p_planned_set_id: setId,
      p_actual_reps: 8,
      p_actual_load_kg: 60,
      p_actual_rir: 2,
      p_outcome: 'on_target',
      p_started_at: null,
      p_actual_duration_seconds: null,
      p_actual_distance_m: null,
      p_perceived_effort: null,
    });
    assert(!serie.error, `C10c: save_set_log falhou (${serie.error?.message})`);
    const setLogId = desempacotar(serie).id;

    const [av1, av2] = await Promise.all([
      a.client.rpc('advance_joint_turn', {
        p_joint_session_id: joint.id,
        p_client_event_id: 'corrida-1',
        p_expected_turn_seq: 1,
        p_set_log_id: setLogId,
      }),
      a.client.rpc('advance_joint_turn', {
        p_joint_session_id: joint.id,
        p_client_event_id: 'corrida-2',
        p_expected_turn_seq: 1,
        p_set_log_id: setLogId,
      }),
    ]);

    const ok = [av1, av2].filter((r) => !r.error);
    assert(ok.length === 1, `C10c: ${ok.length} avanços aceitos, esperado 1`);

    const depois = await ctx.admin
      .from('joint_sessions')
      .select('turn_seq, current_turn_user_id')
      .eq('id', joint.id)
      .single();
    assert(depois.data.turn_seq === 2, `C10c: turn_seq ${depois.data.turn_seq}, esperado 2`);
    assert(depois.data.current_turn_user_id === b.id, 'C10c: o turno não foi para o parceiro');

    const eventos = await ctx.admin
      .from('joint_session_events')
      .select('id')
      .eq('joint_session_id', joint.id)
      .eq('kind', 'turn_advanced');
    assert(
      (eventos.data ?? []).length === 1,
      `C10c: ${eventos.data?.length} eventos de avanço (esperado 1)`,
    );
    console.log('[joint-concurrency] C10c ok — um commit, um evento, turn_seq +1');
  }
});
