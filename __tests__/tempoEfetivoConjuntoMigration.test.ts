// __tests__/tempoEfetivoConjuntoMigration.test.ts
// Harness da migration 0029 (mesmo padrão de tempoEfetivoMigration.test.ts):
// sem Postgres local, a conferência ESTRUTURAL é sobre o ARQUIVO .sql
// aplicado. A prova NUMÉRICA do achado A3 (cenário A/B alternado + borda do
// log reaproveitado) foi executada de verdade em HML com tabelas TEMP
// (pg_temp), documentada no cabeçalho da própria migration e no handoff desta
// remediação — este arquivo garante que uma edição futura não apague as
// invariantes estruturais que aquela prova depende.

import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0029_tempo_efetivo_conjunto.sql'),
  'utf8',
);

describe('invariantes estruturais da migration 0029 (achado A3)', () => {
  it('recria _forca_tempo_efetivo_segundos com a MESMA assinatura da 0028', () => {
    expect(sql).toMatch(
      /create or replace function public\._forca_tempo_efetivo_segundos\(\s*p_session_log_id uuid,\s*p_fim timestamptz default null\s*\)/,
    );
    expect(sql).toMatch(/security invoker/);
    expect(sql).toMatch(/set search_path = public, pg_temp/);
  });

  it('ramo solo (v_joint_id is null) é a fórmula da 0028, byte a byte', () => {
    expect(sql).toMatch(/if v_joint_id is null then/);
    expect(sql).toMatch(/least\(greatest\(extract\(epoch from diff\), 0\), 1200\)/);
    expect(sql).toMatch(/intervalos as \(\s*select ts - lag\(ts\) over \(order by ts\) as diff/);
  });

  it('descobre a sessão conjunta via planned_sessions.joint_session_id', () => {
    expect(sql).toMatch(
      /join public\.planned_sessions ps on ps\.id = sl\.planned_session_id/,
    );
    expect(sql).toMatch(/into v_joint_id/);
  });

  it('reconstrói a posse do turno só a partir de joint_session_events (started/turn_advanced)', () => {
    expect(sql).toMatch(/from public\.joint_session_events/);
    expect(sql).toMatch(/kind in \('started', 'turn_advanced'\)/);
    expect(sql).toMatch(/\(payload ->> 'next_turn_user_id'\)::uuid as holder/);
  });

  it('segmento sintético (-infinity) atribui ao PRÓPRIO dono o que é anterior à ativação (borda do log reaproveitado)', () => {
    expect(sql).toMatch(/select v_self as holder,\s*'-infinity'::timestamptz as desde/);
    expect(sql).toMatch(/0026:1184-1192/);
  });

  it('exclui o parceiro por construção do join (posse.holder = v_self, nunca o parceiro)', () => {
    expect(sql).toMatch(/join posse on posse\.holder = v_self/);
  });

  it('aplica o teto de 1200s UMA VEZ por intervalo bruto (least(sum(secs),1200) agrupado por ts_a,ts_b)', () => {
    expect(sql).toMatch(/least\(sum\(secs\), 1200\) as secs_capado/);
    expect(sql).toMatch(/group by ts_a, ts_b/);
  });

  it('mantém o ajuste de cardio (excedente além do teto) inalterado e fora do ramo condicional', () => {
    expect(sql).toMatch(/greatest\(actual_duration_seconds - 1200, 0\)/);
  });

  it('documenta a limitação deliberada: mark_joint_queue_finished/complete_joint_participant fora do escopo', () => {
    expect(sql).toMatch(/mark_joint_queue_finished/);
    expect(sql).toMatch(/complete_joint_participant/);
    expect(sql).toMatch(/FORA do escopo/);
  });

  it('não toca finish_session nem re-emite grant/revoke (CREATE OR REPLACE preserva ACL)', () => {
    expect(sql).not.toMatch(/create or replace function public\.finish_session/);
    expect(sql).not.toMatch(/^grant execute/m);
    expect(sql).not.toMatch(/^revoke all/m);
  });
});
