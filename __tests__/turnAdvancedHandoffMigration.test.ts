// __tests__/turnAdvancedHandoffMigration.test.ts
// Prova do achado P2 (MÉDIA) e da migration 0030.
//
// Sem Postgres local, a prova NUMÉRICA roda contra uma réplica JS mínima e
// fiel da reconstrução de posse do turno feita por
// `_forca_tempo_efetivo_segundos` na 0029 (linhas 139-190: CTEs `turnos`,
// `posse`, `pares`, `sobreposicoes`, `por_par`) — mesma lógica, mesmas
// fórmulas, só trocando SQL por JS. A conferência ESTRUTURAL, abaixo, é sobre
// o ARQUIVO .sql da 0030 aplicado.
//
// Cenário provado: "A encerra a fila antes de B" via `mark_joint_queue_finished`
// — o handoff da 0026 que o achado aponta como sem evento. Duas versões do
// mesmo fluxo de eventos são alimentadas na réplica:
//   1) o que as RPCs ATUAIS da 0026 produzem (sem 'turn_advanced' no handoff)
//      — documenta a perda: o tempo de B pós-handoff não é atribuído a B;
//   2) o que as RPCs da 0030 produzem (com 'turn_advanced' no handoff, mesmo
//      formato do caminho normal de `advance_joint_turn`) — prova o valor
//      correto de B.

import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Réplica fiel da reconstrução de posse (0029:139-190)
// ---------------------------------------------------------------------------

type JointEventoTurno = {
  seq: number;
  kind: string;
  createdAtMs: number;
  payload: { next_turn_user_id?: string };
};

type SegmentoPosse = {
  holder: string;
  desde: number; // ms; -Infinity representa '-infinity'::timestamptz
  ate: number; // ms; +Infinity representa 'infinity'::timestamptz
};

// Espelha a CTE `turnos` + o segmento sintético da CTE `posse` (0029:139-153).
function reconstruirPosseDoTurno(
  eventos: JointEventoTurno[],
  self: string,
): SegmentoPosse[] {
  const turnosBrutos = eventos
    .filter((e) => e.kind === 'started' || e.kind === 'turn_advanced')
    .slice()
    .sort((a, b) => a.seq - b.seq);

  const turnos: SegmentoPosse[] = turnosBrutos.map((e, i) => ({
    holder: e.payload.next_turn_user_id as string,
    desde: e.createdAtMs,
    ate: i + 1 < turnosBrutos.length ? turnosBrutos[i + 1].createdAtMs : Infinity,
  }));

  // coalesce((select min(desde) from turnos), 'infinity'::timestamptz)
  const minDesde = turnos.length > 0 ? Math.min(...turnos.map((t) => t.desde)) : Infinity;

  const sintetico: SegmentoPosse = { holder: self, desde: -Infinity, ate: minDesde };

  return [sintetico, ...turnos];
}

// Espelha `eventos`/`pares`/`sobreposicoes`/`por_par` (0029:155-190), sem o
// ajuste de cardio (0029:193-199) — fora do escopo deste achado, já coberto
// pelo teste estrutural da própria 0029.
function tempoEfetivoPorPosse(
  posse: SegmentoPosse[],
  self: string,
  sessionStartMs: number,
  ownSetCompletionsMs: number[],
  sessionEndMs: number,
): number {
  const eventosBruto = [sessionStartMs, ...ownSetCompletionsMs, sessionEndMs].sort(
    (a, b) => a - b,
  );

  let total = 0;
  for (let i = 0; i < eventosBruto.length - 1; i++) {
    const tsA = eventosBruto[i];
    const tsB = eventosBruto[i + 1];

    let somaSobreposicoes = 0;
    for (const seg of posse) {
      if (seg.holder !== self) continue;
      if (!(seg.desde < tsB && seg.ate > tsA)) continue;
      const secs = Math.max((Math.min(tsB, seg.ate) - Math.max(tsA, seg.desde)) / 1000, 0);
      somaSobreposicoes += secs;
    }
    total += Math.min(somaSobreposicoes, 1200);
  }
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// Cenário: "A encerra a fila antes de B" (mark_joint_queue_finished)
// ---------------------------------------------------------------------------
//
// Linha do tempo (segundos desde a ativação, T0 = 0):
//   T0=0     'started', next_turn_user_id = A — A começa.
//   T1=600   A termina sua fila e chama mark_joint_queue_finished (é a vez
//            dela). B ainda tem pendências: o turno passa para B.
//   B trabalha sozinha dali em diante; conclui uma série própria em T=1200 e
//   sua sessão termina (finished_at) em T=1500.
// Tempo real que B segurou o turno: 1500 - 600 = 900s.

const T0 = 0;
const T1_HANDOFF = 600_000; // 600s em ms
const B_SET_COMPLETO = 1_200_000; // 1200s em ms
const B_FIM = 1_500_000; // 1500s em ms
const A = 'user-a';
const B = 'user-b';

describe('achado P2 — handoff de fila sem evento perde active_seconds de B', () => {
  it('SEM o evento no handoff (RPCs atuais da 0026): o tempo de B pós-handoff não é atribuído a B', () => {
    const eventosSemFix: JointEventoTurno[] = [
      { seq: 1, kind: 'started', createdAtMs: T0, payload: { next_turn_user_id: A } },
      // mark_joint_queue_finished da 0026 (1405-1411): UPDATE direto,
      // NENHUM evento 'turn_advanced' é emitido aqui.
      { seq: 2, kind: 'queue_finished', createdAtMs: T1_HANDOFF, payload: {} },
    ];

    const posseDeB = reconstruirPosseDoTurno(eventosSemFix, B);
    const ativoDeB = tempoEfetivoPorPosse(
      posseDeB,
      B,
      T0,
      [B_SET_COMPLETO],
      B_FIM,
    );

    // Documenta a perda: B trabalhou 900s (T1_HANDOFF→B_FIM) mas nenhum
    // segmento de posse com holder=B cobre esse trecho — só existe o
    // segmento sintético (-infinity, T0), que termina antes de qualquer
    // atividade de B começar.
    expect(ativoDeB).toBe(0);
  });

  it('COM o evento no handoff (RPCs da 0030): B recebe exatamente os 900s que segurou o turno', () => {
    const eventosComFix: JointEventoTurno[] = [
      { seq: 1, kind: 'started', createdAtMs: T0, payload: { next_turn_user_id: A } },
      { seq: 2, kind: 'queue_finished', createdAtMs: T1_HANDOFF, payload: {} },
      // mark_joint_queue_finished da 0030: mesmo UPDATE, agora precedido do
      // evento 'turn_advanced' no mesmo formato do caminho normal
      // (advance_joint_turn, 0026:1336-1339).
      {
        seq: 3,
        kind: 'turn_advanced',
        createdAtMs: T1_HANDOFF,
        payload: { next_turn_user_id: B },
      },
    ];

    const posseDeB = reconstruirPosseDoTurno(eventosComFix, B);
    const ativoDeB = tempoEfetivoPorPosse(
      posseDeB,
      B,
      T0,
      [B_SET_COMPLETO],
      B_FIM,
    );

    expect(ativoDeB).toBe((B_FIM - T1_HANDOFF) / 1000); // 900
  });

  it('sanidade: A continua com os 600s que segurou antes do handoff, nos dois fluxos', () => {
    const eventosSemFix: JointEventoTurno[] = [
      { seq: 1, kind: 'started', createdAtMs: T0, payload: { next_turn_user_id: A } },
      { seq: 2, kind: 'queue_finished', createdAtMs: T1_HANDOFF, payload: {} },
    ];
    const eventosComFix: JointEventoTurno[] = [
      ...eventosSemFix,
      {
        seq: 3,
        kind: 'turn_advanced',
        createdAtMs: T1_HANDOFF,
        payload: { next_turn_user_id: B },
      },
    ];

    for (const eventos of [eventosSemFix, eventosComFix]) {
      const posseDeA = reconstruirPosseDoTurno(eventos, A);
      const ativoDeA = tempoEfetivoPorPosse(posseDeA, A, T0, [], T1_HANDOFF);
      expect(ativoDeA).toBe(T1_HANDOFF / 1000); // 600 — A não é afetada pelo achado
    }
  });
});

// ---------------------------------------------------------------------------
// Conferência estrutural da migration 0030 (arquivo .sql aplicado)
// ---------------------------------------------------------------------------

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/0030_turn_advanced_no_handoff.sql'),
  'utf8',
);

describe('invariantes estruturais da migration 0030 (achado P2)', () => {
  it('cobre exatamente as duas RPCs do achado, e nenhuma outra', () => {
    const criacoes = sql.match(/^create or replace function public\.\w+/gm) ?? [];
    expect(criacoes).toEqual([
      'create or replace function public.mark_joint_queue_finished',
      'create or replace function public.complete_joint_participant',
    ]);
  });

  it('mark_joint_queue_finished emite turn_advanced ANTES do UPDATE que transfere o turno ao parceiro', () => {
    const inicio = sql.indexOf('function public.mark_joint_queue_finished');
    const fim = sql.indexOf('function public.complete_joint_participant');
    const corpo = sql.slice(inicio, fim);

    expect(corpo).toMatch(/if v_parceiro\.queue_finished_at is null then/);

    const idxEvento = corpo.indexOf("'turn_advanced'");
    const idxUpdate = corpo.indexOf('set current_turn_user_id = v_parceiro.user_id');
    expect(idxEvento).toBeGreaterThan(-1);
    expect(idxUpdate).toBeGreaterThan(-1);
    expect(idxEvento).toBeLessThan(idxUpdate);
  });

  it('complete_joint_participant emite turn_advanced ANTES do UPDATE que transfere o turno ao parceiro', () => {
    const inicio = sql.indexOf('function public.complete_joint_participant');
    const corpo = sql.slice(inicio);

    expect(corpo).toMatch(/if v_sessao\.current_turn_user_id = v_uid then/);

    const idxEvento = corpo.indexOf("'turn_advanced'");
    const idxUpdate = corpo.indexOf(
      'set current_turn_user_id = v_parceiro.user_id, turn_seq = turn_seq + 1',
    );
    expect(idxEvento).toBeGreaterThan(-1);
    expect(idxUpdate).toBeGreaterThan(-1);
    expect(idxEvento).toBeLessThan(idxUpdate);
  });

  it('as duas emissões usam o MESMO formato do caminho normal: _forca_joint_evento com payload next_turn_user_id', () => {
    const ocorrencias = sql.match(
      /perform public\._forca_joint_evento\(\s*p_joint_session_id, v_uid, 'turn_advanced',\s*jsonb_build_object\('next_turn_user_id', v_parceiro\.user_id\)\);/g,
    );
    expect(ocorrencias).toHaveLength(2);
  });

  it('preserva security definer e search_path nas duas funções recriadas', () => {
    const blocos = sql.split(/^create or replace function public\.\w+/m).slice(1);
    expect(blocos).toHaveLength(2);
    for (const bloco of blocos) {
      expect(bloco).toMatch(/security definer/);
      expect(bloco).toMatch(/set search_path = public, pg_temp/);
    }
  });

  it('não toca 0026-0029 nem re-emite grant/revoke (CREATE OR REPLACE preserva a ACL já emitida pela 0026)', () => {
    expect(sql).not.toMatch(/^grant execute/m);
    expect(sql).not.toMatch(/^revoke all/m);
    expect(sql).not.toMatch(/create or replace function public\.advance_joint_turn/);
    expect(sql).not.toMatch(/create or replace function public\._forca_tempo_efetivo_segundos/);
  });

  it('preserva o restante do corpo das duas funções (guardas, eventos e mensagens inalterados)', () => {
    // mark_joint_queue_finished: guardas e evento de queue_finished intactos.
    expect(sql).toMatch(/só quem está na vez encerra a própria fila/);
    expect(sql).toMatch(
      /perform public\._forca_joint_evento\(\s*p_joint_session_id, v_uid, 'queue_finished', jsonb_build_object\('queue_finished', true\)\);/,
    );
    // complete_joint_participant: finish_session, participant_completed e o
    // fechamento terminal ('completed') inalterados.
    expect(sql).toMatch(/perform public\.finish_session\(v_eu\.session_log_id\);/);
    expect(sql).toMatch(
      /perform public\._forca_joint_evento\(\s*p_joint_session_id, v_uid, 'participant_completed',/,
    );
    expect(sql).toMatch(
      /perform public\._forca_joint_evento\(\s*p_joint_session_id, v_uid, 'completed', jsonb_build_object\('to_status', 'completed'\)\);/,
    );
  });
});
