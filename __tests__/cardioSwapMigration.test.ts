// __tests__/cardioSwapMigration.test.ts
// Fase 3 (REQ-06): troca de modalidade de cardio — harness de leitura do
// arquivo .sql bruto da migration 0034, SEM tocar banco vivo. Mesmo padrão de
// __tests__/recusaDeclarada.test.ts:101-112 (invariantes da migration 0020).
//
// Cada bloco aqui prova, por conteúdo textual do arquivo, uma garantia que a
// migration promete e que 03-02..03-05 vão assumir como verdadeira:
//
//  1. o vocabulário fechado de modalidade casa LITERALMENTE com
//     CARDIO_MODALIDADES — drift entre banco e app é o erro mais caro desta
//     fase (silencioso, só aparece quando alguém troca de fato);
//  2. a tabela satélite existe com a chave de idempotência certa e nunca
//     mistura escopo com planned_exercises/planned_sets;
//  3. RLS está ligada e a policy de posse existe;
//  4. a RPC tem as guardas na ordem certa (auth, vocabulário, posse do log,
//     posse do exercício, métrica cardio) e usa os errcodes que o app trata;
//  5. nenhuma função nova concede EXECUTE a anon (a lição da migration 0019).

import { readFileSync } from 'fs';
import { join } from 'path';

import { CARDIO_MODALIDADES } from '../src/constants/cardioModalidades';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0034_troca_modalidade_cardio.sql'),
  'utf8',
);

describe('vocabulário de modalidade de cardio (migration 0034)', () => {
  it('_forca_modalidade_cardio_valida contém as 9 modalidades EXATAS de CARDIO_MODALIDADES', () => {
    expect(CARDIO_MODALIDADES.length).toBe(9);
    for (const modalidade of CARDIO_MODALIDADES) {
      // Escapa parênteses literais dos nomes "Cardio Contínuo (LISS)" e
      // "Cardio Intervalado (HIIT)" para o regex não os interpretar como grupo.
      const escapado = modalidade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(sql).toMatch(new RegExp(`'${escapado}'`));
    }
  });

  it('não introduz nenhuma modalidade fora do catálogo do app', () => {
    const bloco = sql.match(
      /_forca_modalidade_cardio_valida[\s\S]*?p_modalidade in \(([\s\S]*?)\);/,
    );
    expect(bloco).not.toBeNull();
    const literais = [...(bloco?.[1].matchAll(/'([^']+)'/g) ?? [])].map((m) => m[1]);
    expect(literais.sort()).toEqual([...CARDIO_MODALIDADES].sort());
  });
});

describe('tabela satélite cardio_exercise_swaps', () => {
  it('é criada com idempotência por (session_log_id, planned_exercise_id)', () => {
    expect(sql).toMatch(/create table if not exists public\.cardio_exercise_swaps/);
    expect(sql).toMatch(/unique \(session_log_id, planned_exercise_id\)/);
  });

  it('referencia session_logs e planned_exercises com cascade, nunca reescreve o plano', () => {
    expect(sql).toMatch(
      /session_log_id\s+uuid not null references public\.session_logs \(id\) on delete cascade/,
    );
    expect(sql).toMatch(
      /planned_exercise_id uuid not null references public\.planned_exercises \(id\) on delete cascade/,
    );
    // Prova negativa do Pitfall 3 do RESEARCH.md: esta migration nunca faz
    // UPDATE em planned_exercises/planned_sets.
    expect(sql).not.toMatch(/update\s+public\.planned_exercises/i);
    expect(sql).not.toMatch(/update\s+public\.planned_sets/i);
  });

  it('tem RLS ligada com policy de posse "own cardio exercise swaps"', () => {
    expect(sql).toMatch(/alter table public\.cardio_exercise_swaps enable row level security/);
    expect(sql).toMatch(/"own cardio exercise swaps"/);
  });
});

describe('RPC swap_session_exercise', () => {
  it('guarda autenticação, vocabulário, posse do log e do exercício com os errcodes do app', () => {
    const errcode42501 = sql.match(/errcode = '42501'/g) ?? [];
    const errcode22023 = sql.match(/errcode = '22023'/g) ?? [];
    expect(errcode42501.length).toBeGreaterThanOrEqual(2);
    expect(errcode22023.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/errcode = 'P0002'/);
    expect(sql).toMatch(/errcode = 'P0001'/);
  });

  it('guarda que o exercício pertence à sessão do log (mesmo padrão de skip_session_exercise)', () => {
    expect(sql).toMatch(/pe\.session_id = v_log\.planned_session_id/);
  });

  it('guarda a métrica cardio — só exercício por tempo pode trocar de modalidade', () => {
    expect(sql).toMatch(/pe\.metric in \('tempo', 'tempo_distancia'\)/);
  });

  it('faz upsert idempotente por (session_log_id, planned_exercise_id)', () => {
    expect(sql).toMatch(/on conflict \(session_log_id, planned_exercise_id\)[\s\S]*?do update/);
  });
});

describe('grants — anon nunca executa as funções novas (lição da migration 0019)', () => {
  it('revoga de public/anon e concede a authenticated para as duas funções', () => {
    const revokes = sql.match(/revoke all on function/g) ?? [];
    const grants = sql.match(/grant execute on function .* to authenticated/g) ?? [];
    expect(revokes.length).toBeGreaterThanOrEqual(2);
    expect(grants.length).toBeGreaterThanOrEqual(2);
  });

  it('nenhum grant a anon aparece no arquivo inteiro', () => {
    expect(sql).not.toMatch(/grant execute.*to anon/i);
  });

  it('bloco de asserções finais confere has_function_privilege para anon', () => {
    expect(sql).toMatch(/has_function_privilege\('anon'/);
    expect(sql).toMatch(/has_function_privilege\('authenticated'/);
  });
});
