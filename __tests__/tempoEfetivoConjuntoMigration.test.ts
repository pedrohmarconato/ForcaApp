// __tests__/tempoEfetivoConjuntoMigration.test.ts
// Harness da migration 0029 (achado A3, e achado P3 do review desta
// remediação).
//
// Sem Postgres local: a conferência ESTRUTURAL abaixo (assinatura, ramo solo
// inalterado, origem de v_joint_id, limitação documentada, ACL preservada) é
// sobre o ARQUIVO .sql aplicado — coisas que uma réplica JS não tem como
// provar, porque ela não lê o SQL real.
//
// O NÚCLEO — posse do turno / soma por sobreposição / teto de 1200s
// (0029:139-190) — deixou de ser regex (achado P3: "regex não é prova"; trocar
// `least(sum(secs),1200)` por `sum(least(secs,1200))` character a character em
// outro lugar do arquivo passava verde sem que o cálculo estivesse certo) e
// virou uma réplica JS COMPORTAMENTAL, em test-utils/tempoEfetivoConjuntoReplica.ts
// — a mesma réplica que __tests__/turnAdvancedHandoffMigration.test.ts (achado
// P2) já usa, para não duplicar a lógica em dois arquivos.
//
// Os três casos abaixo são os exigidos pelo achado P3:
//   - A=9/B=6: revezamento A→B→A com trechos distintos, mesma narrativa do
//     cabeçalho da 0029 ("revezamento A→B→A com durações reais distintas por
//     trecho").
//   - borda 1206→1200: um único segmento de posse acima do teto é capado
//     exatamente em 1200, nunca menos nem mais.
//   - a distinção em si: dois segmentos do MESMO holder dentro do MESMO
//     intervalo bruto (800s + 600s, nenhum dos dois isoladamente acima do
//     teto) têm de tetar JUNTOS em 1200 (least(sum(secs),1200) — a fórmula da
//     0029) e não somar 1400 (sum(least(secs,1200)) — a fórmula que o achado
//     aponta como capaz de passar despercebida).

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  reconstruirPosseDoTurno,
  tempoEfetivoPorPosse,
  type JointEventoTurno,
} from '../test-utils/tempoEfetivoConjuntoReplica';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0029_tempo_efetivo_conjunto.sql'),
  'utf8',
);

describe('invariantes estruturais da migration 0029 (achado A3) — o que a réplica JS não prova', () => {
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

describe('núcleo comportamental — posse/soma/teto do revezamento (achado P3)', () => {
  const A = 'user-a';
  const B = 'user-b';

  it('A=9/B=6 — revezamento A→B→A com trechos distintos (mesma narrativa do cabeçalho da 0029)', () => {
    // T0=0s  started            → turno de A
    // T1=4s  turn_advanced      → turno de B   (A segurou [0,4)   = 4s)
    // T2=10s turn_advanced      → turno de A   (B segurou [4,10)  = 6s)
    // T3=15s fim da sessão                     (A segurou [10,15) = 5s)
    // active(A) = 4 + 5 = 9 · active(B) = 6
    const eventos: JointEventoTurno[] = [
      { seq: 1, kind: 'started', createdAtMs: 0, payload: { next_turn_user_id: A } },
      { seq: 2, kind: 'turn_advanced', createdAtMs: 4_000, payload: { next_turn_user_id: B } },
      { seq: 3, kind: 'turn_advanced', createdAtMs: 10_000, payload: { next_turn_user_id: A } },
    ];
    const sessionStartMs = 0;
    const sessionEndMs = 15_000;

    const ativoDeA = tempoEfetivoPorPosse(
      reconstruirPosseDoTurno(eventos, A),
      A,
      sessionStartMs,
      [],
      sessionEndMs,
    );
    const ativoDeB = tempoEfetivoPorPosse(
      reconstruirPosseDoTurno(eventos, B),
      B,
      sessionStartMs,
      [],
      sessionEndMs,
    );

    expect(ativoDeA).toBe(9);
    expect(ativoDeB).toBe(6);
  });

  it('borda 1206→1200 — um único segmento de posse acima do teto é capado exatamente em 1200', () => {
    // Turno único de A por toda a sessão, 1206s de duração real — igual ao
    // caso "log reaproveitado" do proof/0029 (intervalo bruto gigante, capado
    // uma vez), só que com o número exato no limite do teto.
    const eventos: JointEventoTurno[] = [
      { seq: 1, kind: 'started', createdAtMs: 0, payload: { next_turn_user_id: A } },
    ];
    const sessionStartMs = 0;
    const sessionEndMs = 1_206_000; // 1206s

    const ativoDeA = tempoEfetivoPorPosse(
      reconstruirPosseDoTurno(eventos, A),
      A,
      sessionStartMs,
      [],
      sessionEndMs,
    );

    expect(ativoDeA).toBe(1200);
  });

  it('DISTINGUE least(sum(secs),1200) de sum(least(secs,1200)): 800s + 600s do MESMO holder no MESMO intervalo bruto tetam JUNTOS em 1200, não somam 1400', () => {
    // T0=0s     started       → turno de A     (A segura [0,800)      = 800s)
    // T1=800s   turn_advanced → turno de B     (B segura [800,1300)   = 500s, irrelevante p/ A)
    // T2=1300s  turn_advanced → turno de A     (A segura [1300,1900)  = 600s)
    // T3=1900s  fim da sessão
    //
    // A NÃO completa nenhuma série própria entre T0 e T3 — sem evento
    // "próprio" no meio, os dois trechos de A (800s e 600s) caem no MESMO
    // intervalo bruto (0,1900), exatamente o cenário em que a 0029 exige somar
    // primeiro e tetar depois:
    //   least(sum(800,600), 1200)      = least(1400, 1200) = 1200  (0029, correto)
    //   sum(least(800,1200),least(600,1200)) = sum(800, 600) = 1400 (regressão, ERRADO)
    // Nenhum dos dois segmentos isolado excede 1200s, então só a ORDEM das
    // operações (somar-depois-tetar vs tetar-cada-depois-somar) distingue os
    // dois resultados — é exatamente o que este teste tem de rejeitar.
    const eventos: JointEventoTurno[] = [
      { seq: 1, kind: 'started', createdAtMs: 0, payload: { next_turn_user_id: A } },
      { seq: 2, kind: 'turn_advanced', createdAtMs: 800_000, payload: { next_turn_user_id: B } },
      { seq: 3, kind: 'turn_advanced', createdAtMs: 1_300_000, payload: { next_turn_user_id: A } },
    ];
    const sessionStartMs = 0;
    const sessionEndMs = 1_900_000;

    const ativoDeA = tempoEfetivoPorPosse(
      reconstruirPosseDoTurno(eventos, A),
      A,
      sessionStartMs,
      [],
      sessionEndMs,
    );

    expect(ativoDeA).toBe(1200); // aceita 1200 (least(sum,1200)) e rejeita 1400 (sum(least,1200))
  });
});
