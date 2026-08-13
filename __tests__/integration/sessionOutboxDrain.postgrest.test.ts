/**
 * Harness de integração real (D-16 nível 2, plano 04-03).
 *
 * Fala com um Postgres/PostgREST LOCAL de verdade — nada de mock do cliente
 * Supabase, nem de `sessionExecutionRepository`. Existe porque
 * `__tests__/sessionOutboxDrain.test.ts` mocka `sessionExecutionRepository`
 * inteiro, então as duas garantias mais críticas da fila offline-first
 * (retry-não-duplica contra a guarda 0005, P0005 da 0036 vira quarentena sem
 * travar a drenagem) nunca são exercitadas contra o servidor de verdade —
 * exatamente o ponto cego que G-03-3 (03-07-PLAN.md) provou que um mock
 * nunca fecha sozinho.
 *
 * Fora da suíte padrão de propósito (ver `testPathIgnorePatterns` em
 * package.json, já configurado pelo 03-07) — o projeto não tem CI
 * (PROJECT.md) e este harness exige o stack Supabase local de pé. NUNCA
 * roda via `npm test`/`jest` puro.
 *
 * Molde herdado de `__tests__/integration/getSessionLogDetail.postgrest.test.ts`
 * (03-07), com UMA diferença central: lá a função sob teste era um SELECT sem
 * checagem de `auth.uid()`; aqui as RPCs (`save_set_log`,
 * `swap_session_exercise`) verificam `session_logs.user_id = auth.uid()`
 * internamente (migrations 0005/0036) — chamar via client `service_role`
 * faria `auth.uid()` retornar null e a RPC rejeitar como "alheio". Por isso,
 * igual ao 03-07 (ver DESVIO documentado lá: o role `service_role` deste
 * stack local só tem privilégios Dxtm em `public`, sem select/insert), este
 * harness usa DOIS clientes: um ADMIN (`service_role`, só para
 * `auth.admin.createUser`/`deleteUser` via GoTrue — não passa por grant de
 * tabela) e um USUÁRIO (`createClient` + `signInWithPassword`), sendo o
 * client USUÁRIO quem semeia as fixtures E quem é injetado via
 * `jest.mock('../../src/config/supabaseClient', ...)` — o mesmo caminho de
 * RLS/`auth.uid()` que a função usa em produção.
 *
 * Como rodar:
 *   1. `supabase start` (sobe o stack local via OrbStack/Docker)
 *   2. `supabase status` — copie `SERVICE_ROLE_KEY` (e `ANON_KEY`, se for
 *      diferente do default de projeto novo do CLI — o default abaixo é a
 *      chave demo pública documentada pelo próprio Supabase CLI).
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

// Alias do tipo REAL inferido por uma chamada concreta a `createClient` — usar
// `ReturnType<typeof createClient>` diretamente resolve para os defaults
// genéricos da função sobrecarregada (`never[]` nas tabelas), não para o tipo
// que a chamada acima de fato produz.
type UserClient = typeof admin;

// Client de sessão real (role "authenticated" após signInWithPassword) —
// usado para semear as fixtures e como o client injetado nas RPCs sob teste,
// exatamente o caminho de RLS/auth.uid() que a produção usa. `mockUserClient`
// existe porque cada `describe` cria seu PRÓPRIO usuário (isolamento entre
// Teste A e Teste B) — o mock aponta para uma variável mutável, trocada em
// cada `beforeAll`.
let mockUserClient: UserClient;
jest.mock('../../src/config/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockUserClient.from(...(args as [string])),
    rpc: (...args: unknown[]) =>
      mockUserClient.rpc(...(args as Parameters<typeof mockUserClient.rpc>)),
  },
}));

// AsyncStorage real do RN não existe neste ambiente Node puro
// (`jest.integration.config.js`, testEnvironment: 'node') — mock em memória,
// mesmo padrão de `__tests__/loadDraftCoercion.test.ts`.
const mockAsyncStorageStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) =>
    mockAsyncStorageStore.has(k) ? mockAsyncStorageStore.get(k)! : null,
  ),
  setItem: jest.fn(async (k: string, v: string) => {
    mockAsyncStorageStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockAsyncStorageStore.delete(k);
  }),
}));

import { enqueueItem, drainAll } from '../../src/services/sessionOutboxDrain';
import { loadOutbox } from '../../src/services/sessionOutboxStorage';

/** Cria um usuário de teste + client autenticado, isolado por describe. */
const criarUsuarioAutenticado = async (
  slug: string,
): Promise<{ userId: string; client: UserClient }> => {
  const email = `pgtest-04-03-${slug}-${Date.now()}@forca.test`;
  const password = 'senha-teste-integracao-123';

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !userData?.user) {
    throw new Error(`Falha ao criar usuário de teste (${slug}): ${userError?.message}`);
  }

  const client = createClient(SUPABASE_INTEGRATION_URL, SUPABASE_INTEGRATION_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    throw new Error(`Falha ao autenticar usuário de teste (${slug}): ${signInError.message}`);
  }

  return { userId: userData.user.id, client };
};

describe('sessionOutboxDrain — integração real contra Postgres local (D-16 nível 2)', () => {
  describe('Teste A — retry não duplica contra a guarda 0005 real', () => {
    let userId: string;
    let userClient: UserClient;
    let sessionLogId: string;
    let plannedSetId: string;

    beforeAll(async () => {
      const seed = await criarUsuarioAutenticado('a');
      userId = seed.userId;
      userClient = seed.client;
      mockUserClient = userClient;

      const { data: planData, error: planError } = await userClient
        .from('training_plans')
        .insert({ user_id: userId, name: 'Plano de teste 04-03-A' })
        .select('id')
        .single();
      if (planError || !planData) {
        throw new Error(`Falha ao inserir training_plans: ${planError?.message}`);
      }

      const { data: sessionData, error: sessionError } = await userClient
        .from('planned_sessions')
        .insert({
          plan_id: (planData as { id: string }).id,
          user_id: userId,
          week_number: 1,
          title: 'Sessão de teste 04-03-A',
        })
        .select('id')
        .single();
      if (sessionError || !sessionData) {
        throw new Error(`Falha ao inserir planned_sessions: ${sessionError?.message}`);
      }

      const { data: exerciseData, error: exerciseError } = await userClient
        .from('planned_exercises')
        .insert({
          session_id: (sessionData as { id: string }).id,
          exercise_order: 1,
          name: 'Supino reto',
        })
        .select('id')
        .single();
      if (exerciseError || !exerciseData) {
        throw new Error(`Falha ao inserir planned_exercises: ${exerciseError?.message}`);
      }

      const { data: setData, error: setError } = await userClient
        .from('planned_sets')
        .insert({
          exercise_id: (exerciseData as { id: string }).id,
          set_order: 1,
          target_reps_min: 8,
          target_reps_max: 12,
        })
        .select('id')
        .single();
      if (setError || !setData) {
        throw new Error(`Falha ao inserir planned_sets: ${setError?.message}`);
      }
      plannedSetId = (setData as { id: string }).id;

      const { data: logData, error: logError } = await userClient
        .from('session_logs')
        .insert({ planned_session_id: (sessionData as { id: string }).id, user_id: userId })
        .select('id')
        .single();
      if (logError || !logData) {
        throw new Error(`Falha ao inserir session_logs: ${logError?.message}`);
      }
      sessionLogId = (logData as { id: string }).id;
    });

    afterAll(async () => {
      if (userId) {
        // cascade (on delete cascade em training_plans/planned_sessions/
        // planned_exercises/planned_sets/session_logs/set_logs, migration 0001)
        // apaga o resto numa chamada só.
        await admin.auth.admin.deleteUser(userId);
      }
    });

    it('reenviar o mesmo save_set_log não duplica — guarda 0005 preservada do lado do cliente', async () => {
      mockUserClient = userClient;

      await enqueueItem(userId, {
        sessionLogId,
        kind: 'save_set_log',
        payload: {
          sessionLogId,
          plannedSetId,
          actualReps: 10,
          actualLoadKg: 40,
          actualRir: 2,
          outcome: 'on_target',
        },
      });
      await drainAll(userId);

      const { data: primeiraLeitura, error: primeiroErro } = await userClient
        .from('set_logs')
        .select('id, actual_reps, actual_load_kg')
        .eq('session_log_id', sessionLogId);
      if (primeiroErro) throw new Error(`Falha ao ler set_logs (1ª leitura): ${primeiroErro.message}`);
      expect(primeiraLeitura).toHaveLength(1);
      const primeiraLinha = (primeiraLeitura as Array<{ id: string; actual_reps: number; actual_load_kg: number }>)[0];
      expect(primeiraLinha.actual_reps).toBe(10);

      // Reenfileira o MESMO alvo (sessionLogId+plannedSetId) — payload varia
      // levemente (actualReps diferente) para provar que o servidor preserva a
      // PRIMEIRA gravação, não o cliente reimplementando a guarda.
      await enqueueItem(userId, {
        sessionLogId,
        kind: 'save_set_log',
        payload: {
          sessionLogId,
          plannedSetId,
          actualReps: 99,
          actualLoadKg: 999,
          actualRir: 0,
          outcome: 'over',
        },
      });
      await drainAll(userId);

      const { data: segundaLeitura, error: segundoErro } = await userClient
        .from('set_logs')
        .select('id, actual_reps, actual_load_kg')
        .eq('session_log_id', sessionLogId);
      if (segundoErro) throw new Error(`Falha ao ler set_logs (2ª leitura): ${segundoErro.message}`);
      expect(segundaLeitura).toHaveLength(1);
      const segundaLinha = (segundaLeitura as Array<{ id: string; actual_reps: number; actual_load_kg: number }>)[0];
      // Ainda a linha da PRIMEIRA gravação — first-write-wins do servidor
      // (0005), não uma reimplementação do lado do cliente (D-02/D-13).
      expect(segundaLinha.id).toBe(primeiraLinha.id);
      expect(segundaLinha.actual_reps).toBe(10);
      expect(segundaLinha.actual_load_kg).toBe(40);
    });
  });

  /**
   * ACHADO BLOQUEANTE (D-16 nível 2, diagnosticado nesta plan, 2026-08-13):
   * este teste FALHA contra o Postgres local real — não é flakiness nem erro
   * de asserção, é exatamente o ponto cego que este nível de prova existe
   * para fechar (mock nunca mentiu, mas nunca teria pego isso também).
   *
   * Causa raiz confirmada (logs cruzados de `supabase_db`/`supabase_rest` +
   * `errcodes.txt` oficial do Postgres 17.6 dentro do container): o Postgres
   * RAISE da migration 0036 roda e loga corretamente
   * `exercício <id> já tem série registrada nesta sessão; troca de
   * modalidade recusada` com `errcode = 'P0005'` — mas 'P0005' NÃO é um
   * código oficial da tabela de erros do Postgres (`errcodes.txt` só define
   * P0000-P0004, os códigos reservados do PL/pgSQL: raise_exception,
   * no_data_found, too_many_rows, assert_failure). PostgREST 14.5 mascara
   * QUALQUER SQLSTATE que não reconhece na sua própria tabela de erros
   * conhecidos, devolvendo ao cliente um 500 genérico
   * `{"message":"Something went wrong"}` SEM `code`/`details`/`hint` — por
   * segurança, para não vazar erro interno não classificado — mesmo com o
   * Postgres tendo processado e logado o RAISE perfeitamente. Confirmado por
   * teste direto (RPC chamada fora da fila): `save_set_log` com
   * `session_log_id` inexistente (código OFICIAL 'P0002', também usado nesta
   * mesma função) devolve `{"code":"P0002","message":"session_log ...
   * inexistente ou alheio"}` normalmente — só o código INVENTADO 'P0005' é
   * mascarado. Os outros 4 códigos do `DEFINITIVE_CODES`
   * (`sessionOutboxPolicy.ts`) são todos oficiais (42501, 22023, 22004
   * também confirmados na tabela oficial) e não sofrem este problema.
   *
   * Efeito em produção, se a migration 0036 fosse promovida como está: o
   * cliente NUNCA verá `.code === 'P0005'` — `classifyAndApply` cai no ramo
   * de erro não classificado (Pitfall 2) e fica REAGENDANDO a troca
   * indefinidamente até expirar por idade (D-11, `maxAgeDays: 7`), quando
   * então quarentena por "expirado sem classificação definitiva" (motivo
   * certo, código errado/ausente) — só depois de até 7 dias tentando uma
   * operação que sempre vai falhar do mesmo jeito. A guarda do SERVIDOR (a
   * defesa em profundidade que a 0036 promete no header) nunca falha
   * FUNCIONALMENTE (a troca é mesmo recusada), mas o CLIENTE nunca sabe
   * disso a tempo — some da tela como "pendente" por até 7 dias em vez de
   * quarentena imediata.
   *
   * NÃO fica a critério deste executor decidir a correção: a migration 0036
   * ainda não foi promovida a staging/produção (ver header do arquivo:
   * "aplicação é decisão explícita do dono"), e o valor 'P0005' foi uma
   * escolha DELIBERADA e documentada (OD-01) para dar ao cliente um código
   * distinto — mudar o código muda esse contrato explícito. Proposta
   * (requer decisão do dono, ver checkpoint retornado por esta execução):
   * nova migration de FOLLOW-UP (0037, `create or replace`, mesmo padrão da
   * própria 0035/0036) trocando `errcode = 'P0005'` por um SQLSTATE OFICIAL
   * ainda não usado nesta RPC — `'23505'` (unique_violation, classe 23,
   * confirmado em `errcodes.txt`) é semanticamente adequado (a troca colide
   * com uma série já existente) e não mascarado por PostgREST — mais
   * `sessionOutboxPolicy.ts`'s `DEFINITIVE_CODES` atualizado para o novo
   * valor. Este teste (e o "código do primeiro `if`" da asserção interna do
   * arquivo de migration) fica como está — asserção CORRETA, não ajustada
   * para "passar" — até essa decisão ser tomada e a migration de correção
   * aplicada localmente.
   */
  describe('Teste B — P0005 da 0036 vira quarentena sem travar a drenagem', () => {
    let userId: string;
    let userClient: UserClient;
    let sessionLogId: string;
    let exercicioAId: string;
    let exercicioBId: string;
    let plannedSetAId: string;
    let plannedSetBId: string;

    beforeAll(async () => {
      const seed = await criarUsuarioAutenticado('b');
      userId = seed.userId;
      userClient = seed.client;
      mockUserClient = userClient;

      const { data: planData, error: planError } = await userClient
        .from('training_plans')
        .insert({ user_id: userId, name: 'Plano de teste 04-03-B' })
        .select('id')
        .single();
      if (planError || !planData) {
        throw new Error(`Falha ao inserir training_plans: ${planError?.message}`);
      }

      const { data: sessionData, error: sessionError } = await userClient
        .from('planned_sessions')
        .insert({
          plan_id: (planData as { id: string }).id,
          user_id: userId,
          week_number: 1,
          title: 'Sessão de teste 04-03-B',
        })
        .select('id')
        .single();
      if (sessionError || !sessionData) {
        throw new Error(`Falha ao inserir planned_sessions: ${sessionError?.message}`);
      }
      const plannedSessionId = (sessionData as { id: string }).id;

      // Dois exercícios de CARDIO (metric='tempo_distancia' — a única guarda que
      // swap_session_exercise aceita, migration 0035), cada um com 1 planned_set
      // medido por duração (target_reps_min pode ser null quando há duração).
      const { data: exA, error: exAError } = await userClient
        .from('planned_exercises')
        .insert({
          session_id: plannedSessionId,
          exercise_order: 1,
          name: 'Corrida',
          metric: 'tempo_distancia',
        })
        .select('id')
        .single();
      if (exAError || !exA) throw new Error(`Falha ao inserir exercício A: ${exAError?.message}`);
      exercicioAId = (exA as { id: string }).id;

      const { data: exB, error: exBError } = await userClient
        .from('planned_exercises')
        .insert({
          session_id: plannedSessionId,
          exercise_order: 2,
          name: 'Remo',
          metric: 'tempo_distancia',
        })
        .select('id')
        .single();
      if (exBError || !exB) throw new Error(`Falha ao inserir exercício B: ${exBError?.message}`);
      exercicioBId = (exB as { id: string }).id;

      const { data: setA, error: setAError } = await userClient
        .from('planned_sets')
        .insert({ exercise_id: exercicioAId, set_order: 1, target_duration_seconds: 600 })
        .select('id')
        .single();
      if (setAError || !setA) throw new Error(`Falha ao inserir planned_set A: ${setAError?.message}`);
      plannedSetAId = (setA as { id: string }).id;

      const { data: setB, error: setBError } = await userClient
        .from('planned_sets')
        .insert({ exercise_id: exercicioBId, set_order: 1, target_duration_seconds: 600 })
        .select('id')
        .single();
      if (setBError || !setB) throw new Error(`Falha ao inserir planned_set B: ${setBError?.message}`);
      plannedSetBId = (setB as { id: string }).id;

      const { data: logData, error: logError } = await userClient
        .from('session_logs')
        .insert({ planned_session_id: plannedSessionId, user_id: userId })
        .select('id')
        .single();
      if (logError || !logData) throw new Error(`Falha ao inserir session_logs: ${logError?.message}`);
      sessionLogId = (logData as { id: string }).id;

      // Grava uma série REAL no exercício A (via enqueueItem+drainAll, mesmo
      // caminho de produção) — é essa série que faz o swap_session_exercise
      // subsequente bater no P0005 da 0036.
      mockUserClient = userClient;
      await enqueueItem(userId, {
        sessionLogId,
        kind: 'save_set_log',
        payload: {
          sessionLogId,
          plannedSetId: plannedSetAId,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          outcome: 'on_target',
          actualDurationSeconds: 610,
        },
      });
      await drainAll(userId);

      const { data: confirmaSerieA, error: confirmaErro } = await userClient
        .from('set_logs')
        .select('id')
        .eq('session_log_id', sessionLogId);
      if (confirmaErro || !confirmaSerieA || confirmaSerieA.length !== 1) {
        throw new Error(
          `Seed do Teste B falhou: série do exercício A não foi gravada (${confirmaErro?.message ?? 'nenhuma linha'}).`,
        );
      }
    });

    afterAll(async () => {
      if (userId) {
        await admin.auth.admin.deleteUser(userId);
      }
    });

    it('swap que bate no P0005 vai para quarentena; save_set_log independente do exercício B drena normalmente', async () => {
      mockUserClient = userClient;

      // Enfileira DOIS itens independentes: o swap no exercício A (vai bater
      // no P0005, porque A já tem série gravada) e um save_set_log no
      // exercício B (sem relação com o P0005).
      await enqueueItem(userId, {
        sessionLogId,
        kind: 'swap_session_exercise',
        payload: {
          sessionLogId,
          plannedExerciseId: exercicioAId,
          toModality: 'Bicicleta Ergométrica',
          note: null,
        },
      });
      await enqueueItem(userId, {
        sessionLogId,
        kind: 'save_set_log',
        payload: {
          sessionLogId,
          plannedSetId: plannedSetBId,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          outcome: 'on_target',
          actualDurationSeconds: 590,
        },
      });

      await drainAll(userId);

      // (1) O item de swap foi para a quarentena do documento local.
      const doc = await loadOutbox(userId);
      expect(doc.items).toHaveLength(0);
      expect(doc.quarantine).toHaveLength(1);
      expect(doc.quarantine[0].kind).toBe('swap_session_exercise');
      expect(doc.quarantine[0].code).toBe('P0005');

      // (2) O item de save_set_log do exercício B foi processado normalmente
      // — a quarentena de UM item não travou a drenagem do OUTRO.
      const { data: serieB, error: serieBError } = await userClient
        .from('set_logs')
        .select('id, planned_set_id')
        .eq('session_log_id', sessionLogId)
        .eq('planned_set_id', plannedSetBId);
      if (serieBError) throw new Error(`Falha ao ler set_logs do exercício B: ${serieBError.message}`);
      expect(serieB).toHaveLength(1);

      // A troca do exercício A NÃO foi persistida (recusada pela guarda 0036).
      const { data: trocaA, error: trocaAError } = await userClient
        .from('cardio_exercise_swaps')
        .select('id')
        .eq('session_log_id', sessionLogId)
        .eq('planned_exercise_id', exercicioAId);
      if (trocaAError) throw new Error(`Falha ao ler cardio_exercise_swaps: ${trocaAError.message}`);
      expect(trocaA).toHaveLength(0);
    });
  });
});
