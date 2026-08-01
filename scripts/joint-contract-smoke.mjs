// scripts/joint-contract-smoke.mjs
// Treino Conjunto 2.0 — Sprint 01. Contrato exercitado com JWT REAL via PostgREST.
//
//   node scripts/joint-contract-smoke.mjs
//
// POR QUE ESTE ARQUIVO EXISTE, e não mais um bloco no `begin/rollback`:
// a prova SQL conecta como `postgres` e troca de papel com `SET LOCAL ROLE`.
// Isso NÃO é fiel ao caminho real — o PostgREST entra como `authenticator` e
// assume `authenticated` com o JWT do usuário. A diferença deixou passar um
// furo real: o gatilho do guard chamava uma função revogada de `authenticated`,
// e o `finish_session` solo depois do abandono quebrava. A prova não viu.
//
// Então tudo que depende de PRIVILÉGIO ou de papel mora aqui:
//   B20a  as 14 RPCs recusadas para `anon`, por privilégio
//   B20b  um caso próprio por RPC como `authenticated` — sucesso ou o erro de
//         domínio daquela RPC, nunca `permission denied`
//   C3    troca de modo com a cópia MATERIALIZADA E CONFIRMADA
//   C18b  cancelamento libera a sessão real; abandono preserva o vínculo
//   C19   `finish_session` solo volta a funcionar depois de `abandoned`
//   A23a  `touch_joint_presence` recusa sessão terminal
//   C10b  série já consumida, reapresentada com o turno de volta ⟹ 22023
//   D4a   cópia de exercício de CARDIO preserva os alvos de tempo/distância
//   E8–E11 histórico, progresso e detalhe sob CADA JWT

import { createClient } from '@supabase/supabase-js';
import {
  assert,
  criarPlanoDeTeste,
  prepararAmbiente,
  rodarHarness,
} from './joint-smoke-shared.mjs';

const un = (r) => (Array.isArray(r.data) ? r.data[0] : r.data);
const code = (r) => r.error?.code ?? null;

/** As 14 RPCs de cliente, com argumentos sintaticamente válidos. */
const RPCS = (jointId, extra = {}) => [
  ['create_joint_session', {}],
  ['join_joint_session', { p_invite_code: 'ZZZZZZ' }],
  ['set_joint_session_mode', { p_joint_session_id: jointId, p_mode: 'each_own', p_muscle_group: 'Peito' }],
  ['confirm_joint_participant_session', { p_joint_session_id: jointId, p_planned_session_id: extra.plannedSessionId ?? jointId }],
  ['materialize_joint_session_copy', { p_joint_session_id: jointId }],
  ['set_joint_participant_ready', { p_joint_session_id: jointId, p_ready: true }],
  ['advance_joint_turn', { p_joint_session_id: jointId, p_client_event_id: 'x', p_expected_turn_seq: 1, p_set_log_id: jointId }],
  ['mark_joint_queue_finished', { p_joint_session_id: jointId }],
  ['pause_joint_session', { p_joint_session_id: jointId, p_reason: 'participant_request' }],
  ['resume_joint_session', { p_joint_session_id: jointId }],
  ['touch_joint_presence', { p_joint_session_id: jointId }],
  ['complete_joint_participant', { p_joint_session_id: jointId }],
  ['abandon_joint_session', { p_joint_session_id: jointId }],
  ['joint_session_partner_profile', { p_joint_session_id: jointId }],
];

await rodarHarness('joint-contract', 3, async (ctx, [a, b, c]) => {
  const FAKE = '00000000-0000-0000-0000-0000000000ff';

  // ============================================================
  // B20a — as 14 RPCs, como `anon`, falham POR PRIVILÉGIO
  // ============================================================
  {
    const anon = createClient(ctx.url, ctx.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let checadas = 0;
    for (const [nome, params] of RPCS(FAKE)) {
      const r = await anon.rpc(nome, params);
      assert(r.error != null, `B20a: ${nome} NÃO falhou para anon`);
      const msg = `${r.error.message} ${r.error.code ?? ''}`.toLowerCase();
      assert(
        msg.includes('permission denied') || code(r) === '42501',
        `B20a: ${nome} falhou por outro motivo que não privilégio: ${r.error.message}`,
      );
      checadas += 1;
    }
    assert(checadas === 14, `B20a: ${checadas} RPCs checadas, esperado 14`);
    console.log('[joint-contract] B20a ok — as 14 RPCs recusadas a anon por privilégio');
  }

  // ============================================================
  // B20b — um caso por RPC como authenticated: nunca permission denied
  // ============================================================
  {
    let checadas = 0;
    for (const [nome, params] of RPCS(FAKE)) {
      const r = await a.client.rpc(nome, params);
      const msg = (r.error?.message ?? '').toLowerCase();
      assert(
        !msg.includes('permission denied'),
        `B20b: ${nome} devolveu permission denied para authenticated — RPC inalcançável`,
      );
      // Sucesso OU erro de domínio; nunca falha de privilégio.
      if (r.error) {
        assert(
          ['42501', '22023', '55000', 'FC001', '54000', 'P0001', 'P0002'].includes(code(r)),
          `B20b: ${nome} devolveu errcode fora do vocabulário: ${code(r)} ${r.error.message}`,
        );
      }
      checadas += 1;
    }
    assert(checadas === 14, `B20b: ${checadas} RPCs checadas, esperado 14`);
    console.log('[joint-contract] B20b ok — as 14 alcançáveis, todas dentro do vocabulário');
    // A conta `a` pode ter criado sessão no laço acima; encerra para o resto.
    const vivos = await ctx.admin
      .from('joint_session_participants')
      .select('joint_session_id')
      .eq('user_id', a.id)
      .eq('live', true);
    for (const v of vivos.data ?? []) {
      await a.client.rpc('abandon_joint_session', { p_joint_session_id: v.joint_session_id });
    }
  }

  // ============================================================
  // C3 / F1 — troca de modo com a cópia MATERIALIZADA E CONFIRMADA
  // ============================================================
  const planoA = await criarPlanoDeTeste(ctx, a.id, 'Peito A');
  const planoB = await criarPlanoDeTeste(ctx, b.id, 'Peito B');

  let joint;
  {
    const criada = await a.client.rpc('create_joint_session');
    joint = un(criada);
    const ent = await b.client.rpc('join_joint_session', { p_invite_code: joint.invite_code });
    assert(un(ent)?.id, 'C3: convidado não entrou');

    await a.client.rpc('set_joint_session_mode', { p_joint_session_id: joint.id, p_mode: 'host_plan' });
    const cA = await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: planoA.sessionId,
    });
    assert(!cA.error, `C3: confirm host falhou (${cA.error?.message})`);

    const copia = await b.client.rpc('materialize_joint_session_copy', { p_joint_session_id: joint.id });
    assert(!copia.error, `C3: materialize falhou (${copia.error?.message})`);
    const copiaId = un(copia).id;

    // O passo que a rodada 1 nunca exercitou — e onde o 23503 aparecia.
    const cB = await b.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: copiaId,
    });
    assert(!cB.error, `C3: confirm da cópia falhou (${cB.error?.message})`);

    const troca = await a.client.rpc('set_joint_session_mode', {
      p_joint_session_id: joint.id,
      p_mode: 'each_own',
      p_muscle_group: 'Peito',
    });
    assert(!troca.error, `C3/F1: troca de modo com cópia confirmada falhou (${code(troca)} ${troca.error?.message})`);

    const sobrou = await ctx.admin.from('planned_sessions').select('id').eq('id', copiaId);
    assert((sobrou.data ?? []).length === 0, 'C3: a cópia do modo anterior sobrou reutilizável');

    const real = await ctx.admin
      .from('planned_sessions')
      .select('joint_session_id')
      .eq('id', planoA.sessionId)
      .single();
    assert(real.data.joint_session_id === null, 'C3: a sessão real não foi liberada na troca de modo');
    console.log('[joint-contract] C3/F1 ok — troca de modo com cópia confirmada, sem 23503');
  }

  // ============================================================
  // C18b — cancelar no lobby libera a sessão real para outro treino
  // ============================================================
  {
    await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: planoA.sessionId,
    });
    const canc = await a.client.rpc('abandon_joint_session', { p_joint_session_id: joint.id });
    assert(!canc.error, `C18b: cancelamento falhou (${canc.error?.message})`);
    assert(un(canc).status === 'canceled', `C18b: status ${un(canc).status}, esperado canceled`);

    const nova = un(await a.client.rpc('create_joint_session'));
    await b.client.rpc('join_joint_session', { p_invite_code: nova.invite_code });
    await a.client.rpc('set_joint_session_mode', {
      p_joint_session_id: nova.id, p_mode: 'each_own', p_muscle_group: 'Peito',
    });
    const rec = await a.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: nova.id,
      p_planned_session_id: planoA.sessionId,
    });
    assert(!rec.error, `C18b: a sessão real ficou presa depois do cancelamento (${rec.error?.message})`);
    console.log('[joint-contract] C18b ok — cancelar no lobby libera a sessão real');
    joint = nova;
  }

  // ============================================================
  // Ativação e execução — base para C19, C10b, A23a e E8–E11
  // ============================================================
  await b.client.rpc('confirm_joint_participant_session', {
    p_joint_session_id: joint.id,
    p_planned_session_id: planoB.sessionId,
  });
  await a.client.rpc('set_joint_participant_ready', { p_joint_session_id: joint.id, p_ready: true });
  const ativou = await b.client.rpc('set_joint_participant_ready', { p_joint_session_id: joint.id, p_ready: true });
  assert(un(ativou).status === 'active', 'ativação bilateral falhou');

  const parts = await ctx.admin
    .from('joint_session_participants')
    .select('user_id, session_log_id')
    .eq('joint_session_id', joint.id);
  const logA = parts.data.find((p) => p.user_id === a.id).session_log_id;
  const logB = parts.data.find((p) => p.user_id === b.id).session_log_id;

  const serie = async (client, logId, setId, reps, carga, rir) =>
    un(await client.rpc('save_set_log', {
      p_session_log_id: logId, p_planned_set_id: setId,
      p_actual_reps: reps, p_actual_load_kg: carga, p_actual_rir: rir,
      p_outcome: 'on_target', p_started_at: null,
      p_actual_duration_seconds: null, p_actual_distance_m: null, p_perceived_effort: null,
    }));

  // Números DIFERENTES dos dois lados (E8).
  const slA = await serie(a.client, logA, planoA.setIds[0], 8, 60, 2);
  const av1 = await a.client.rpc('advance_joint_turn', {
    p_joint_session_id: joint.id, p_client_event_id: 'ct-a1',
    p_expected_turn_seq: 1, p_set_log_id: slA.id,
  });
  assert(!av1.error, `avanço A falhou (${av1.error?.message})`);

  const slB = await serie(b.client, logB, planoB.setIds[0], 12, 35, 1);
  const av2 = await b.client.rpc('advance_joint_turn', {
    p_joint_session_id: joint.id, p_client_event_id: 'ct-b1',
    p_expected_turn_seq: 2, p_set_log_id: slB.id,
  });
  assert(!av2.error, `avanço B falhou (${av2.error?.message})`);

  // ============================================================
  // C10b / F5 — série consumida, reapresentada COM O TURNO DE VOLTA
  // ============================================================
  {
    const seqAtual = un(av2).turn_seq;
    const replay = await a.client.rpc('advance_joint_turn', {
      p_joint_session_id: joint.id, p_client_event_id: 'ct-a-replay',
      p_expected_turn_seq: seqAtual, p_set_log_id: slA.id,
    });
    assert(replay.error != null, 'C10b: a série consumida foi aceita de novo');
    assert(
      code(replay) === '22023',
      `C10b: errcode ${code(replay)} (esperado 22023, não vazamento de 23505)`,
    );
    const depois = await ctx.admin
      .from('joint_sessions').select('turn_seq').eq('id', joint.id).single();
    assert(depois.data.turn_seq === seqAtual, 'C10b: o replay mexeu no turno');
    console.log('[joint-contract] C10b/F5 ok — série consumida devolve 22023, turno intacto');
  }

  // ============================================================
  // C19 / F2 — abandono e, depois dele, finish_session solo funciona
  // ============================================================
  {
    const ab = await a.client.rpc('abandon_joint_session', { p_joint_session_id: joint.id });
    assert(!ab.error, `C19: abandono falhou (${ab.error?.message})`);
    assert(un(ab).status === 'abandoned', `C19: status ${un(ab).status}`);

    const fim = await a.client.rpc('finish_session', { p_session_log_id: logA });
    assert(
      !fim.error,
      `C19/F2: finish_session solo após abandono falhou (${code(fim)} ${fim.error?.message})`,
    );
    const ps = await ctx.admin
      .from('planned_sessions').select('status').eq('id', planoA.sessionId).single();
    assert(ps.data.status === 'completed', `C19: sessão do host ficou ${ps.data.status}`);

    const js = await ctx.admin
      .from('joint_sessions').select('status').eq('id', joint.id).single();
    assert(js.data.status === 'abandoned', 'C19: o abandono virou conclusão conjunta');
    console.log('[joint-contract] C19/F2 ok — finish solo conclui após abandono, sem virar completed');

    // A23a / F3 — heartbeat recusado em terminal
    const t = await b.client.rpc('touch_joint_presence', { p_joint_session_id: joint.id });
    assert(t.error != null, 'A23a/F3: heartbeat aceito em sessão terminal');
    assert(code(t) === '55000', `A23a/F3: errcode ${code(t)}, esperado 55000`);
    console.log('[joint-contract] A23a/F3 ok — heartbeat recusado em terminal');
  }

  // ============================================================
  // E9–E11 — histórico, progresso e detalhe sob CADA JWT
  // ============================================================
  {
    await b.client.rpc('finish_session', { p_session_log_id: logB });

    // E9 — histórico (equivalente a getCompletedSessions)
    for (const [conta, meuLog, alheio] of [[a, logA, logB], [b, logB, logA]]) {
      const h = await conta.client
        .from('session_logs')
        .select('id, planned_sessions(title)')
        .eq('user_id', conta.id)
        .not('finished_at', 'is', null);
      assert(!h.error, `E9: ${h.error?.message}`);
      const ids = (h.data ?? []).map((r) => r.id);
      assert(ids.includes(meuLog), 'E9: o próprio registro não aparece no histórico');
      assert(!ids.includes(alheio), 'E9: VAZAMENTO — o registro do parceiro aparece no histórico');
    }

    // E10 — progresso (equivalente a getSetLogsResumo)
    const prog = async (conta) => {
      const r = await conta.client
        .from('set_logs')
        .select('actual_load_kg, actual_reps, session_logs!inner(user_id, finished_at)')
        .eq('session_logs.user_id', conta.id)
        .not('session_logs.finished_at', 'is', null);
      assert(!r.error, `E10: ${r.error?.message}`);
      return (r.data ?? []).map((x) => `${x.actual_load_kg}x${x.actual_reps}`);
    };
    const pa = await prog(a);
    const pb = await prog(b);
    assert(pa.includes('60x8'), `E10: números do host ausentes (${pa.join(',')})`);
    assert(pb.includes('35x12'), `E10: números do convidado ausentes (${pb.join(',')})`);
    assert(!pa.some((v) => pb.includes(v)), 'E10: os dois progressos compartilham números');

    // E11 — detalhe: o log do parceiro devolve zero linhas
    const det = await a.client.from('set_logs').select('id').eq('session_log_id', logB);
    assert(!det.error, `E11: ${det.error?.message}`);
    assert((det.data ?? []).length === 0, 'E11: VAZAMENTO — detalhe do log do parceiro visível');
    console.log('[joint-contract] E8–E11 ok — histórico, progresso e detalhe individuais sob cada JWT');
  }

  // ============================================================
  // D4a — cópia de CARDIO preserva alvos de tempo e distância
  // ============================================================
  {
    const plano = await ctx.admin
      .from('training_plans')
      .insert({ user_id: c.id, name: 'SMOKE cardio', status: 'active', purpose: 'solo' })
      .select('id').single();
    const sess = await ctx.admin
      .from('planned_sessions')
      .insert({ plan_id: plano.data.id, user_id: c.id, week_number: 1, title: 'Corrida', muscle_groups: ['Cardio'] })
      .select('id').single();
    const ex = await ctx.admin
      .from('planned_exercises')
      .insert({
        session_id: sess.data.id, exercise_order: 1, name: 'Esteira',
        exercise_key: 'esteira', metric: 'tempo_distancia',
        notes: 'nota privada', injury_flags: ['joelho'],
      })
      .select('id').single();
    await ctx.admin.from('planned_sets').insert({
      exercise_id: ex.data.id, set_order: 1,
      target_duration_seconds: 1800, target_distance_m: 5000, target_rir: null,
    });

    const j = un(await c.client.rpc('create_joint_session'));
    // `a` já concluiu o treino anterior; o pertencimento dela foi liberado.
    await a.client.rpc('join_joint_session', { p_invite_code: j.invite_code });
    await c.client.rpc('set_joint_session_mode', { p_joint_session_id: j.id, p_mode: 'host_plan' });
    await c.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: j.id, p_planned_session_id: sess.data.id,
    });
    const copia = await a.client.rpc('materialize_joint_session_copy', { p_joint_session_id: j.id });
    assert(!copia.error, `D4a cardio: materialize falhou (${copia.error?.message})`);

    const conferido = await ctx.admin
      .from('planned_sets')
      .select('target_duration_seconds, target_distance_m, target_load_kg, planned_exercises!inner(metric, exercise_key, notes, injury_flags, session_id)')
      .eq('planned_exercises.session_id', un(copia).id);
    assert(!conferido.error, `D4a cardio: ${conferido.error?.message}`);
    const linha = (conferido.data ?? [])[0];
    assert(linha != null, 'D4a cardio: a cópia não trouxe séries');
    assert(linha.target_duration_seconds === 1800, `D4a cardio: duração ${linha.target_duration_seconds}`);
    assert(Number(linha.target_distance_m) === 5000, `D4a cardio: distância ${linha.target_distance_m}`);
    assert(linha.target_load_kg === null, 'D4a cardio: copiou carga');
    assert(linha.planned_exercises.metric === 'tempo_distancia', 'D4a cardio: perdeu metric');
    assert(linha.planned_exercises.exercise_key === 'esteira', 'D4a cardio: perdeu exercise_key');
    assert(linha.planned_exercises.notes === null, 'D4a cardio: copiou notes');
    assert((linha.planned_exercises.injury_flags ?? []).length === 0, 'D4a cardio: copiou injury_flags');
    console.log('[joint-contract] D4a ok — cópia de cardio preserva tempo/distância e omite privado');

    await c.client.rpc('abandon_joint_session', { p_joint_session_id: j.id });
  }
});
