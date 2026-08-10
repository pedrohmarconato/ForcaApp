/**
 * Harness de integração real (G-03-3, OD-02, plano 03-07).
 *
 * Fala com um Postgres/PostgREST LOCAL de verdade — nada de mock do cliente
 * Supabase. Existe porque `__tests__/sessionExecutionRepository.test.ts`
 * mocka `supabase.from(...)`, então um nome de coluna errado num `select`
 * (ex.: `planned_sets(..., planned_exercise_id, ...)` quando a coluna real é
 * `exercise_id`) nunca chega a ser validado pelo PostgREST — o mock aceita
 * qualquer nome de propriedade. Este arquivo fecha esse ponto cego: ele roda
 * a função REAL `getSessionLogDetail` contra o schema real.
 *
 * Fora da suíte padrão de propósito (ver `testPathIgnorePatterns` em
 * package.json) — o projeto não tem CI (PROJECT.md) e este harness exige o
 * stack Supabase local de pé. NUNCA roda via `npm test`/`jest` puro.
 *
 * DESVIO documentado do desenho original do plano (03-07-SUMMARY.md tem o
 * detalhe completo): o role `service_role` deste stack local só tem
 * privilégios `Dxtm` (delete/references/trigger/maintain) nas tabelas de
 * `public` — SEM `select`/`insert` — então um client autenticado com a
 * `service_role` key não consegue nem semear fixtures nem ler
 * `session_logs`/`set_logs` (confirmado por `\dp` via psql local; o mesmo
 * padrão se repete em todas as tabelas do domínio, não é regressão desta
 * plan). Este harness usa a `service_role` key SÓ para o admin de auth
 * (`auth.admin.createUser`/`deleteUser`, endpoint GoTrue, não passa por
 * grant de tabela) e semeia/lê via uma sessão real de usuário autenticado
 * (`signInWithPassword`) — o mesmo caminho de RLS que a função usa em
 * produção, e mais fiel ao comportamento real do que rodar tudo sob
 * `service_role`.
 *
 * Como rodar:
 *   1. `supabase start` (sobe o stack local via OrbStack/Docker)
 *   2. `supabase status` — copie `SERVICE_ROLE_KEY` (e `ANON_KEY`, se for
 *      diferente do default de projeto novo do CLI — o default abaixo é a
 *      chave demo pública documentada pelo próprio Supabase CLI, a mesma em
 *      qualquer `supabase init` local, não é segredo).
 *   3. `export SUPABASE_INTEGRATION_SERVICE_ROLE_KEY="<valor copiado>"`
 *   4. `npm run test:integration:pg`
 *
 * `SUPABASE_INTEGRATION_URL` e `SUPABASE_INTEGRATION_ANON_KEY` são
 * opcionais (defaults = stack local padrão do Supabase CLI).
 */

const SUPABASE_INTEGRATION_URL =
  process.env.SUPABASE_INTEGRATION_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_INTEGRATION_SERVICE_ROLE_KEY =
  process.env.SUPABASE_INTEGRATION_SERVICE_ROLE_KEY;
// Chave demo pública padrão de QUALQUER stack Supabase local (mesmo valor
// impresso por `supabase status` em projeto novo) — não é segredo, só
// referencia o role "anon" para o endpoint /auth/v1/token.
const SUPABASE_INTEGRATION_ANON_KEY =
  process.env.SUPABASE_INTEGRATION_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// TRAVA DE SEGURANÇA — roda no import, antes de qualquer describe/it. Este
// harness usa a chave service_role (admin de auth); nunca pode apontar para
// staging (mjdjtiujhwklchalquhc) nem produção (zanqygwsgxkyjiuhrzju) — as
// duas URLs reais estão documentadas em AGENTS.md e NUNCA devem aparecer
// aqui, nem por engano de env var.
const LOOPBACK_ONLY = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
if (!LOOPBACK_ONLY.test(SUPABASE_INTEGRATION_URL)) {
  throw new Error(
    `SUPABASE_INTEGRATION_URL ('${SUPABASE_INTEGRATION_URL}') não é um endereço loopback. ` +
      'Este harness usa a chave service_role (admin de auth) e SÓ pode rodar contra o stack ' +
      'Supabase LOCAL (http://127.0.0.1 ou http://localhost). Abortando antes de qualquer chamada de rede.',
  );
}
if (!SUPABASE_INTEGRATION_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_INTEGRATION_SERVICE_ROLE_KEY ausente. Rode `supabase start`, copie o ' +
      'service_role key de `supabase status` (chave SERVICE_ROLE_KEY), exporte ' +
      'SUPABASE_INTEGRATION_SERVICE_ROLE_KEY e rode `npm run test:integration:pg` de novo.',
  );
}

import { createClient } from '@supabase/supabase-js';

// Client admin (service_role) — usado SÓ para o ciclo de vida do usuário de
// teste via GoTrue admin (auth.admin.*), que não passa por grant de tabela
// do schema public.
const admin = createClient(SUPABASE_INTEGRATION_URL, SUPABASE_INTEGRATION_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Client de sessão real (role "authenticated" após signInWithPassword) —
// usado para semear as fixtures e como o client injetado em
// getSessionLogDetail, exatamente o caminho de RLS que a função usa em
// produção.
const userClient = createClient(SUPABASE_INTEGRATION_URL, SUPABASE_INTEGRATION_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// jest hoisting garante que este mock é aplicado antes do import abaixo,
// mesmo com o import no topo do arquivo. Necessário porque
// src/config/supabaseClient.js usa react-native-url-polyfill/auto e
// SecureStore — inimportáveis num ambiente Node puro.
jest.mock('../../src/config/supabaseClient', () => ({ supabase: userClient }));

import { getSessionLogDetail } from '../../src/services/sessionExecutionRepository';

describe('getSessionLogDetail — integração real contra Postgres local (G-03-3)', () => {
  const email = `pgtest-g033-${Date.now()}@forca.test`;
  const password = 'senha-teste-integracao-123';
  let userId: string;
  let sessionLogId: string;

  beforeAll(async () => {
    const { data: userData, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userError || !userData?.user) {
      throw new Error(`Falha ao criar usuário de teste: ${userError?.message}`);
    }
    userId = userData.user.id;

    const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw new Error(`Falha ao autenticar usuário de teste: ${signInError.message}`);
    }

    const { data: planData, error: planError } = await userClient
      .from('training_plans')
      .insert({ user_id: userId, name: 'Plano de teste G-03-3' })
      .select('id')
      .single();
    if (planError || !planData) {
      throw new Error(`Falha ao inserir training_plans: ${planError?.message}`);
    }

    const { data: sessionData, error: sessionError } = await userClient
      .from('planned_sessions')
      .insert({
        plan_id: planData.id,
        user_id: userId,
        week_number: 1,
        title: 'Sessão de teste G-03-3',
      })
      .select('id')
      .single();
    if (sessionError || !sessionData) {
      throw new Error(`Falha ao inserir planned_sessions: ${sessionError?.message}`);
    }

    const { data: logData, error: logError } = await userClient
      .from('session_logs')
      .insert({ planned_session_id: sessionData.id, user_id: userId })
      .select('id')
      .single();
    if (logError || !logData) {
      throw new Error(`Falha ao inserir session_logs: ${logError?.message}`);
    }
    sessionLogId = logData.id;
  });

  afterAll(async () => {
    if (userId) {
      // cascade (on delete cascade em training_plans/planned_sessions/
      // session_logs, migration 0001) apaga o resto numa chamada só.
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('devolve o detalhe da sessão sem lançar 42703 (coluna ausente em planned_sets)', async () => {
    const detalhe = await getSessionLogDetail(sessionLogId);

    expect(detalhe).not.toBeNull();
    expect(detalhe?.sessionLogId).toBe(sessionLogId);
    expect(detalhe?.exercises).toEqual([]);
  });
});
