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

/** Monta um plano com uma sessão executável para a conta indicada. */
export const criarPlanoDeTeste = async (ctx, userId, titulo, grupos = ['Peito']) => {
  const plano = await ctx.admin
    .from('training_plans')
    .insert({ user_id: userId, name: `SMOKE ${titulo}`, status: 'active', purpose: 'solo' })
    .select('id')
    .single();
  if (plano.error) throw new Error(`plano: ${plano.error.message}`);

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
