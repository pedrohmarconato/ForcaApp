// __tests__/tempoEfetivoMigration.test.ts
// Harness da migration 0028 (mesmo padrão de recusaDeclarada.test.ts:101): sem
// Postgres local, a conferência é sobre o ARQUIVO .sql aplicado. Os asserts
// abaixo são as INVARIANTES da métrica — se uma edição futura apagar o teto, o
// greatest, o ajuste de cardio, o backfill ou o revoke de anon, este teste
// quebra e a regressão chega ao banco só pela porta de revisão.
//
// Os nove vetores de comportamento vivem em tempoEfetivo.test.ts (TypeScript)
// e no cabeçalho desta migration (comentário SQL). Este harness verifica que a
// migration continua documentando os vetores e mantém as invariantes
// estruturais da finish_session recriada (idempotência e recusa de skipped).

import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0028_tempo_efetivo_treino.sql'),
  'utf8',
);

describe('invariantes estruturais da migration 0028', () => {
  it('cria a coluna derivada active_seconds', () => {
    expect(sql).toMatch(/add column if not exists active_seconds integer/);
    expect(sql).toMatch(/DERIVADA, nunca digitada/);
  });

  it('mantém o teto de 20 minutos (1200 s) na fórmula', () => {
    expect(sql).toMatch(/least\(greatest\(extract\(epoch from diff\), 0\), 1200\)/);
  });

  it('neutraliza intervalo negativo (skew/retry) com greatest(…, 0)', () => {
    expect(sql).toMatch(/greatest\(extract\(epoch from diff\), 0\)/);
    // A janela mora numa CTE própria: Postgres rejeita janela DENTRO de agregado.
    expect(sql).toMatch(/intervalos as \(\s*select ts - lag\(ts\) over \(order by ts\) as diff/);
  });

  it('mantém o ajuste de cardio (excedente além do teto, sem dupla contagem)', () => {
    expect(sql).toMatch(/greatest\(actual_duration_seconds - 1200, 0\)/);
  });

  it('mantém o backfill das sessões já fechadas', () => {
    expect(sql).toMatch(/where finished_at is not null\s*and active_seconds is null/);
    expect(sql).toMatch(/set active_seconds = public\._forca_tempo_efetivo_segundos\(id\)/);
  });

  it('backfill só dá duração a treino concluído: log com séries, ou conclusão real de sessão vazia', () => {
    expect(sql).toMatch(/exists \(select 1 from public\.set_logs sl where sl\.session_log_id = session_logs\.id\)/);
    expect(sql).toMatch(/ps\.status = 'completed'/);
  });

  it('backfill NÃO dá duração ao fantasma da recusa desfeita (skip→unskip→retreino)', () => {
    // unskip volta o plano a 'pending' sem reabrir o log antigo (0020:537-539);
    // um retreino abre log novo e leva o plano a 'completed'. O log antigo (sem
    // séries, com irmão no MESMO plano) não pode ganhar até 1200 s fabricados —
    // filtrar pelo status atual do plano não o pega. Este é o subcaso que a
    // validação sintética de staging agora exercita com dados.
    expect(sql).toMatch(/not exists \(\s*select 1 from public\.session_logs l2\s*where l2\.planned_session_id = session_logs\.planned_session_id\s*and l2\.id <> session_logs\.id/);
    expect(sql).toMatch(/and not exists \(\s*select 1 from public\.session_logs l2/);
  });

  it('mantém o revoke de public E de anon nas duas funções (aprendizado da 0019)', () => {
    expect(sql).toMatch(/revoke all on function public\._forca_tempo_efetivo_segundos\(uuid, timestamptz\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.finish_session\(uuid\) from public, anon/);
  });

  it('documenta os nove vetores no cabeçalho (fonte única da especificação)', () => {
    const nove = sql.match(/Nove vetores/);
    expect(nove).not.toBeNull();
    for (const n of ['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.', '9.']) {
      expect(sql).toContain(n);
    }
  });
});

describe('invariantes preservadas da finish_session (0020 → 0028)', () => {
  it('permanece idempotente (log já fechado retorna sem efeito)', () => {
    expect(sql).toMatch(/if v_log\.finished_at is not null then\s*return;\s*end if;/);
  });

  it('mantém a recusa de concluir sessão skipped', () => {
    expect(sql).toMatch(/if v_sessao\.status = 'skipped' then/);
    expect(sql).toMatch(/raise exception 'sessão recusada não pode ser concluída'/);
  });

  it('persiste o tempo efetivo no MESMO update que carimba finished_at, com âncora explícita', () => {
    // O SET do UPDATE é avaliado contra a linha antes da atualização: sem a
    // âncora now() explícita, a função leria finished_at ainda nulo e gravaria
    // null em toda sessão concluída.
    expect(sql).toMatch(/set finished_at = now\(\),\s*active_seconds = public\._forca_tempo_efetivo_segundos\(id, now\(\)\)/);
  });
});

describe('desvios deliberados da spec (documentados no cabeçalho)', () => {
  it('concede EXECUTE da função interna a authenticated — finish_session a chama (security invoker)', () => {
    expect(sql).toMatch(/grant execute on function public\._forca_tempo_efetivo_segundos\(uuid, timestamptz\) to authenticated/);
    expect(sql).toMatch(/revoke all on function public\._forca_tempo_efetivo_segundos\(uuid, timestamptz\) from public, anon/);
  });

  it('concede EXECUTE de finish_session a authenticated', () => {
    expect(sql).toMatch(/grant execute on function public\.finish_session\(uuid\) to authenticated/);
  });

  it('o bloco de asserções verifica anon sem EXECUTE e authenticated com EXECUTE', () => {
    expect(sql).toMatch(/has_function_privilege\('anon', v_fn, 'EXECUTE'\)/);
    expect(sql).toMatch(/has_function_privilege\('authenticated', v_fn, 'EXECUTE'\)/);
  });
});
