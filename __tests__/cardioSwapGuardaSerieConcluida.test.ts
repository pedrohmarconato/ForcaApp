// __tests__/cardioSwapGuardaSerieConcluida.test.ts
// Fase 3 (REQ-06): fecha G-03-5-servidor (03-UAT.md teste 5, `server_gap`) —
// harness de leitura do arquivo .sql bruto da migration 0036, SEM tocar
// banco vivo. Molde EXATO de __tests__/cardioSwapMigration.test.ts.
//
// Cada bloco aqui prova, por conteúdo textual do arquivo, uma garantia que a
// migration promete:
//
//  1. `create or replace function public.swap_session_exercise` recria a
//     MESMA assinatura já instalada por 0034/0035, nunca um `drop function`;
//  2. a guarda NOVA de set_logs já registrado existe, com o join correto
//     via planned_sets (set_logs não tem FK direta para planned_exercises)
//     e o errcode novo P0005;
//  3. a guarda de métrica de 0035 (WR-03) continua presente e intocada — o
//     sinal alternativo muscle_group='Cardio' da 0034 continua removido;
//  4. os grants seguem o mesmo padrão de 0034/0035 (revoke de public/anon,
//     grant só a authenticated) — nenhum grant a anon em lugar nenhum;
//  5. o bloco de asserções runtime finais contém as duas checagens novas
//     além da checagem herdada de 0035.

import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0036_guarda_set_log_troca_cardio.sql'),
  'utf8',
);

describe('RPC swap_session_exercise recriada pela migration 0036', () => {
  it('é create or replace com a mesma assinatura, nunca um DDL drop function', () => {
    expect(sql).toMatch(/create or replace function public\.swap_session_exercise/);
    // Prova negativa de statement real (não de menção em comentário): nenhuma
    // linha começando com `drop function` existe no arquivo.
    expect(sql).not.toMatch(/^\s*drop function/im);
  });
});

describe('guarda nova — recusa troca quando já existe set_log para o exercício', () => {
  it('faz o join correto via planned_sets (set_logs não tem FK direta para planned_exercises)', () => {
    expect(sql).toMatch(/from public\.set_logs sl/);
    expect(sql).toMatch(/join public\.planned_sets ps on ps\.id = sl\.planned_set_id/);
    expect(sql).toMatch(/ps\.exercise_id = p_planned_exercise_id/);
  });

  it('recusa com o errcode novo P0005', () => {
    expect(sql).toMatch(/errcode = 'P0005'/);
  });
});

describe('guarda de métrica de 0035 continua presente e intocada', () => {
  it('pe.metric in (\'tempo\', \'tempo_distancia\') continua presente', () => {
    expect(sql).toMatch(/pe\.metric in \('tempo', 'tempo_distancia'\)/);
  });

  it('sinal alternativo muscle_group=\'Cardio\' NÃO aparece em lugar nenhum do arquivo', () => {
    expect(sql).not.toMatch(/muscle_group = 'Cardio'/);
  });
});

describe('grants — mesmo padrão de 0034/0035', () => {
  it('revoga de public/anon e concede a authenticated para a assinatura recriada', () => {
    expect(sql).toMatch(/revoke all on function/);
    expect(sql).toMatch(
      /grant execute on function public\.swap_session_exercise\(uuid, uuid, text, text\) to authenticated/,
    );
  });

  it('nenhum grant a anon aparece no arquivo inteiro', () => {
    expect(sql).not.toMatch(/grant execute.*to anon/i);
  });
});

describe('bloco de asserções runtime finais', () => {
  it('contém as duas checagens novas além da checagem herdada de 0035', () => {
    const bloco = sql.match(/do \$\$[\s\S]*?\$\$;\s*$/);
    expect(bloco).not.toBeNull();
    const corpo = bloco?.[0] ?? '';
    // Dentro do bloco `do $$ ... $$`, os literais aparecem com aspas
    // duplicadas (escape de string SQL): `''tempo''`, não `'tempo'`.
    expect(corpo).toMatch(/pe\.metric in \(''tempo'', ''tempo_distancia''\)/);
    expect(corpo).toMatch(/from public\.set_logs sl/);
    expect(corpo).toMatch(/errcode = ''P0005''/);
  });
});
