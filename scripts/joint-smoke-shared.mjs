// scripts/joint-smoke-shared.mjs
// Infraestrutura compartilhada dos harnesses do Treino Conjunto (Sprint 01):
// credencial em memória, guarda de ambiente, contas sintéticas e limpeza.
//
// REGRAS QUE ESTE ARQUIVO EXISTE PARA CUMPRIR:
//  1. Falha FECHADA. Sem PAT, sem service_role ou com ref diferente do HML
//     canônico, o processo aborta ANTES de qualquer escrita.
//  2. Nunca ecoa segredo. Token, key, connection string e JWT não aparecem em
//     log, mensagem de erro ou stack trace.
//  3. Limpeza obrigatória. As contas sintéticas são apagadas em `finally`; se a
//     limpeza falhar, o processo sai não-zero imprimindo os user_id órfãos
//     (id não é segredo) em vez de terminar verde deixando resíduo em HML.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/** Homologação. Decidido pelo REF, nunca pelo nome (AGENTS.md). */
export const HML_REF = 'mjdjtiujhwklchalquhc';
/** Produção. Presente aqui só para ser negado explicitamente. */
const PROD_REF = 'zanqygwsgxkyjiuhrzju';

const abortar = (mensagem) => {
  console.error(`\n[ABORTADO] ${mensagem}\n`);
  process.exit(2);
};

const lerPat = () => {
  try {
    const pat = readFileSync(join(homedir(), '.supabase_pat'), 'utf8').trim();
    if (!pat) abortar('~/.supabase_pat está vazio.');
    return pat;
  } catch {
    abortar('~/.supabase_pat não encontrado — sem ele não há como falar com o projeto.');
    return '';
  }
};

/**
 * Busca a service_role key EM MEMÓRIA, via PAT. Não há service-role key no
 * ambiente e a Admin API exige uma; esta é a única via disponível. O valor nunca
 * é impresso nem gravado.
 */
const obterChaves = (ref) => {
  let json;
  try {
    json = execFileSync(
      'supabase',
      ['projects', 'api-keys', '--project-ref', ref, '--output', 'json'],
      { env: { ...process.env, SUPABASE_ACCESS_TOKEN: lerPat() }, encoding: 'utf8' },
    );
  } catch {
    abortar('não foi possível listar as chaves do projeto (PAT inválido ou CLI sem acesso).');
  }
  let linhas;
  try {
    linhas = JSON.parse(json);
  } catch {
    abortar('resposta inesperada do CLI ao listar as chaves.');
  }
  const service = linhas.find((k) => k?.name === 'service_role')?.api_key;
  const anon = linhas.find((k) => k?.name === 'anon')?.api_key;
  if (!service) abortar('service_role não encontrada para este projeto.');
  if (!anon) abortar('anon key não encontrada para este projeto.');
  return { service, anon };
};

/**
 * Confere o ambiente ANTES de qualquer escrita. O ref alvo tem de ser o HML
 * canônico; produção é negada por nome próprio, e não por ausência.
 */
export const prepararAmbiente = () => {
  const ref = process.env.FORCA_JOINT_SMOKE_REF ?? HML_REF;
  if (ref === PROD_REF) {
    abortar(`ref ${PROD_REF} é PRODUÇÃO. Este harness nunca roda lá.`);
  }
  if (ref !== HML_REF) {
    abortar(`ref ${ref} não é o HML canônico (${HML_REF}).`);
  }
  const { service, anon } = obterChaves(ref);
  const url = `https://${ref}.supabase.co`;
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { ref, url, anon, admin };
};

const senhaAleatoria = () =>
  `Fx${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}!9`;

/**
 * Cria N contas sintéticas confirmadas e devolve um cliente autenticado por
 * conta. `email_confirm: true` evita depender da caixa de e-mail.
 */
export const criarContas = async (ctx, quantidade) => {
  const contas = [];
  for (let i = 0; i < quantidade; i += 1) {
    const email = `joint-smoke-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}@forca.test`;
    const password = senhaAleatoria();
    const { data, error } = await ctx.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`falha ao criar conta sintética #${i}: ${error.message}`);

    const client = createClient(ctx.url, ctx.anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw new Error(`falha ao autenticar a conta #${i}: ${login.error.message}`);

    contas.push({ id: data.user.id, email, client });
  }
  return contas;
};

/**
 * Apaga as contas sintéticas. O cascade de auth.users leva junto tudo que elas
 * geraram — planos, sessões, logs, sessões conjuntas e eventos.
 */
export const limparContas = async (ctx, contas) => {
  const orfaos = [];
  for (const conta of contas) {
    try {
      await conta.client.removeAllChannels?.();
      await conta.client.auth.signOut();
    } catch {
      /* sessão local; não impede a remoção */
    }
    const { error } = await ctx.admin.auth.admin.deleteUser(conta.id);
    if (error) orfaos.push(conta.id);
  }
  return orfaos;
};

/**
 * Envelope de execução: prepara, roda, limpa SEMPRE e traduz o resultado em
 * exit code. Limpeza falha ⇒ saída não-zero com os ids órfãos.
 */
export const rodarHarness = async (nome, quantidadeDeContas, corpo) => {
  const ctx = prepararAmbiente();
  console.log(`[${nome}] ambiente: ${ctx.ref} (HML)`);
  let contas = [];
  let falha = null;
  try {
    contas = await criarContas(ctx, quantidadeDeContas);
    console.log(`[${nome}] ${contas.length} contas sintéticas criadas`);
    await corpo(ctx, contas);
  } catch (erro) {
    falha = erro;
  } finally {
    const orfaos = await limparContas(ctx, contas);
    if (orfaos.length > 0) {
      console.error(`[${nome}] LIMPEZA FALHOU. user_id órfãos em HML: ${orfaos.join(', ')}`);
      process.exit(3);
    }
    console.log(`[${nome}] limpeza concluída — nenhum resíduo em HML`);
  }
  if (falha) {
    console.error(`\n[${nome}] FALHOU: ${falha.message}\n`);
    process.exit(1);
  }
  console.log(`\n[${nome}] OK — todas as asserções passaram\n`);
};

export const assert = (condicao, mensagem) => {
  if (!condicao) throw new Error(mensagem);
};

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Espera uma condição virar verdadeira, com prazo. Substitui `esperar(3000)` nas
 * asserções de entrega: uma janela fixa transforma latência de propagação em
 * falha intermitente, e um harness que às vezes reprova é um harness em que
 * ninguém confia — nem quando ele acusa um problema de verdade.
 */
export const aguardarAte = async (condicao, { prazoMs = 15_000, passoMs = 250 } = {}) => {
  const limite = Date.now() + prazoMs;
  while (Date.now() < limite) {
    if (await condicao()) return true;
    await esperar(passoMs);
  }
  return false;
};

/** Monta um plano com uma sessão executável para a conta indicada. */
export const planoAtivoDe = async (ctx, userId, nome) => {
  // `training_plans_one_active_per_user_idx` só permite UM plano ativo por
  // usuário (0002). Reaproveitar é o comportamento correto: o app também tem um
  // plano ativo só, e forçar um segundo testaria uma situação que não existe.
  const existente = await ctx.admin
    .from('training_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);
  if (existente.error) throw new Error(`plano ativo: ${existente.error.message}`);
  if (existente.data?.[0]) return existente.data[0].id;

  const criado = await ctx.admin
    .from('training_plans')
    .insert({ user_id: userId, name: nome, status: 'active', purpose: 'solo' })
    .select('id')
    .single();
  if (criado.error) throw new Error(`plano: ${criado.error.message}`);
  return criado.data.id;
};

export const criarPlanoDeTeste = async (ctx, userId, titulo, grupos = ['Peito']) => {
  const plano = { data: { id: await planoAtivoDe(ctx, userId, `SMOKE ${titulo}`) } };

  const sessao = await ctx.admin
    .from('planned_sessions')
    .insert({
      plan_id: plano.data.id,
      user_id: userId,
      week_number: 1,
      title: titulo,
      muscle_groups: grupos,
    })
    .select('id')
    .single();
  if (sessao.error) throw new Error(`sessão: ${sessao.error.message}`);

  const exercicio = await ctx.admin
    .from('planned_exercises')
    .insert({
      session_id: sessao.data.id,
      exercise_order: 1,
      name: 'Supino reto',
      exercise_key: 'supino_reto',
      metric: 'carga_reps',
      notes: 'nota privada do parceiro',
      injury_flags: ['ombro_direito'],
    })
    .select('id')
    .single();
  if (exercicio.error) throw new Error(`exercício: ${exercicio.error.message}`);

  const series = await ctx.admin
    .from('planned_sets')
    .insert([
      {
        exercise_id: exercicio.data.id,
        set_order: 1,
        target_reps_min: 8,
        target_reps_max: 10,
        target_load_kg: 60,
        target_rir: 2,
      },
    ])
    .select('id');
  if (series.error) throw new Error(`séries: ${series.error.message}`);

  return { planId: plano.data.id, sessionId: sessao.data.id, setIds: series.data.map((s) => s.id) };
};

// ============================================================
// Construtores de cenário
// ============================================================
// Existem porque a rodada 2 reprovou por evidência sobredeclarada: exercitar uma
// RPC com um UUID falso prova que a PRIMEIRA guarda dispara, não que o caminho
// legítimo funciona. Um caso honesto precisa da sessão no estado certo, com o
// ator certo. Estes helpers montam esse estado.

export const un = (r) => (Array.isArray(r.data) ? r.data[0] : r.data);
export const errcode = (r) => r.error?.code ?? null;

/** Encerra qualquer pertencimento vivo, para a conta poder entrar em outro. */
export const liberarConta = async (ctx, conta) => {
  const vivos = await ctx.admin
    .from('joint_session_participants')
    .select('joint_session_id')
    .eq('user_id', conta.id)
    .eq('live', true);
  for (const v of vivos.data ?? []) {
    await conta.client.rpc('abandon_joint_session', { p_joint_session_id: v.joint_session_id });
  }
};

/** Convite aberto (`inviting`), só com o anfitrião. */
export const montarConvite = async (ctx, host) => {
  await liberarConta(ctx, host);
  const r = await host.client.rpc('create_joint_session');
  if (r.error) throw new Error(`montarConvite: ${r.error.message}`);
  return un(r);
};

/** Lobby com os dois dentro; opcionalmente com modo e sessões confirmadas. */
export const montarLobby = async (ctx, host, guest, opcoes = {}) => {
  const joint = await montarConvite(ctx, host);
  await liberarConta(ctx, guest);
  const ent = await guest.client.rpc('join_joint_session', { p_invite_code: joint.invite_code });
  if (ent.error || !un(ent)?.id) throw new Error('montarLobby: convidado não entrou');

  if (opcoes.mode) {
    const m = await host.client.rpc('set_joint_session_mode', {
      p_joint_session_id: joint.id,
      p_mode: opcoes.mode,
      p_muscle_group: opcoes.muscleGroup ?? null,
    });
    if (m.error) throw new Error(`montarLobby modo: ${m.error.message}`);
  }
  if (opcoes.confirmar) {
    const cH = await host.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: opcoes.sessaoHost,
    });
    if (cH.error) throw new Error(`montarLobby confirm host: ${cH.error.message}`);
    const cG = await guest.client.rpc('confirm_joint_participant_session', {
      p_joint_session_id: joint.id,
      p_planned_session_id: opcoes.sessaoGuest,
    });
    if (cG.error) throw new Error(`montarLobby confirm guest: ${cG.error.message}`);
  }
  return joint;
};

/** Sessão ATIVA, com os dois logs abertos. Devolve ids dos logs. */
export const montarAtiva = async (ctx, host, guest, sessaoHost, sessaoGuest, grupo = 'Peito') => {
  const joint = await montarLobby(ctx, host, guest, {
    mode: 'each_own',
    muscleGroup: grupo,
    confirmar: true,
    sessaoHost,
    sessaoGuest,
  });
  await host.client.rpc('set_joint_participant_ready', { p_joint_session_id: joint.id, p_ready: true });
  const r = await guest.client.rpc('set_joint_participant_ready', {
    p_joint_session_id: joint.id,
    p_ready: true,
  });
  if (r.error || un(r).status !== 'active') {
    throw new Error(`montarAtiva: ativação falhou (${r.error?.message ?? un(r)?.status})`);
  }
  const parts = await ctx.admin
    .from('joint_session_participants')
    .select('user_id, session_log_id')
    .eq('joint_session_id', joint.id);
  return {
    joint: un(r),
    logHost: parts.data.find((p) => p.user_id === host.id).session_log_id,
    logGuest: parts.data.find((p) => p.user_id === guest.id).session_log_id,
  };
};

/** Grava uma série pelo caminho normal do app. */
export const gravarSerie = async (client, logId, setId, valores) => {
  const r = await client.rpc('save_set_log', {
    p_session_log_id: logId,
    p_planned_set_id: setId,
    p_actual_reps: valores.reps ?? null,
    p_actual_load_kg: valores.carga ?? null,
    p_actual_rir: valores.rir ?? null,
    p_outcome: valores.outcome ?? 'on_target',
    p_started_at: null,
    p_actual_duration_seconds: valores.duracao ?? null,
    p_actual_distance_m: valores.distancia ?? null,
    p_perceived_effort: valores.esforco ?? null,
  });
  if (r.error) throw new Error(`gravarSerie: ${r.error.message}`);
  return un(r);
};

/** Retrato do estado autoritativo, para comparar antes/depois de um bypass. */
export const retrato = async (ctx, jointId) => {
  const s = await ctx.admin.from('joint_sessions').select('*').eq('id', jointId).single();
  const p = await ctx.admin
    .from('joint_session_participants')
    .select('*')
    .eq('joint_session_id', jointId)
    .order('role');
  const e = await ctx.admin
    .from('joint_session_events')
    .select('seq')
    .eq('joint_session_id', jointId);
  return JSON.stringify({ s: s.data, p: p.data, eventos: (e.data ?? []).length });
};

/** Plano de CARDIO com alvos de tempo e distância. */
export const criarPlanoCardio = async (ctx, userId, titulo) => {
  const plano = { data: { id: await planoAtivoDe(ctx, userId, `SMOKE ${titulo}`) } };
  const sessao = await ctx.admin
    .from('planned_sessions')
    .insert({ plan_id: plano.data.id, user_id: userId, week_number: 1, title: titulo, muscle_groups: ['Cardio'] })
    .select('id').single();
  if (sessao.error) throw new Error(`sessão cardio: ${sessao.error.message}`);
  const ex = await ctx.admin
    .from('planned_exercises')
    .insert({
      session_id: sessao.data.id, exercise_order: 1, name: 'Esteira',
      exercise_key: 'esteira', metric: 'tempo_distancia',
      notes: 'nota privada do parceiro', injury_flags: ['joelho'],
    })
    .select('id').single();
  if (ex.error) throw new Error(`exercício cardio: ${ex.error.message}`);
  const sets = await ctx.admin
    .from('planned_sets')
    .insert({ exercise_id: ex.data.id, set_order: 1, target_duration_seconds: 1800, target_distance_m: 5000 })
    .select('id');
  if (sets.error) throw new Error(`séries cardio: ${sets.error.message}`);
  return { planId: plano.data.id, sessionId: sessao.data.id, setIds: sets.data.map((x) => x.id) };
};
