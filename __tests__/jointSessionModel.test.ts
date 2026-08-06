// __tests__/jointSessionModel.test.ts
// Treino Conjunto 2.0 — Sprint 01. Máquina de estados e redutor, sem I/O.
//
// Cada bloco nasceu de um modo de falha PROVÁVEL desta feature, escrito antes de
// a implementação existir:
//
//  1. evento repetido pela rede trocando o turno DUAS vezes;
//  2. evento fora de ordem aplicado por cima do estado bom (recebe 5, aplica 5,
//     e o 4 chega depois e volta o turno);
//  3. buraco de seq "remendado" — o mais traiçoeiro, porque o app parece
//     funcionar e as duas telas divergem em silêncio;
//  4. deadlock quando um dos dois termina a fila primeiro;
//  5. tela sem estado dominante único ("minha vez" e "descanso" ao mesmo tempo);
//  6. sessão terminal voltando a andar;
//  7. presença tratada como booleano local em vez de comparação com o TTL.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  JOINT_MODES,
  JOINT_STATUSES,
  JOINT_PAUSE_REASONS,
  PRESENCA_TTL_MS,
  aplicarEvento,
  ehMinhaVez,
  estadoDominante,
  isJointMode,
  isJointStatus,
  meuPapel,
  parceiroDe,
  parceiroSumiu,
  podeTransitar,
  presencaPerdida,
  proximoTurno,
  sessaoElegivelParaGrupo,
  vistosVazios,
  type JointEvent,
  type JointSessionState,
} from '../src/engine/jointSessionModel';

const HOST = 'user-host';
const GUEST = 'user-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const participante = (
  userId: string,
  role: 'host' | 'guest',
  extra: Partial<JointSessionState['participants'][number]> = {},
) => ({
  userId,
  role,
  plannedSessionId: `ps-${role}`,
  sessionLogId: `sl-${role}`,
  ready: true,
  queueFinishedAt: null,
  completedAt: null,
  lastSeenAt: new Date(T0).toISOString(),
  ...extra,
});

const estadoAtivo = (over: Partial<JointSessionState> = {}): JointSessionState => ({
  id: 'js-1',
  hostUserId: HOST,
  guestUserId: GUEST,
  mode: 'host_plan',
  muscleGroup: null,
  status: 'active',
  pauseReason: null,
  currentTurnUserId: HOST,
  turnSeq: 1,
  participants: [participante(HOST, 'host'), participante(GUEST, 'guest')],
  ...over,
});

const evento = (over: Partial<JointEvent> = {}): JointEvent => ({
  seq: 1,
  actorUserId: HOST,
  kind: 'turn_advanced',
  clientEventId: 'ev-1',
  turnSeqAfter: 2,
  ...over,
});

describe('vocabulário espelha a migration 0026', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/0026_treino_conjunto.sql'),
    'utf8',
  );

  it('os modos do TS são exatamente os do check de joint_sessions.mode', () => {
    for (const modo of JOINT_MODES) {
      expect(sql).toContain(`'${modo}'`);
    }
    // O check da coluna lista os três e nada mais.
    const check = sql.match(/mode text check \(mode in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const noSql = (check as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''));
    expect(noSql.sort()).toEqual([...JOINT_MODES].sort());
  });

  it('os status do TS são exatamente os do check de joint_sessions.status', () => {
    for (const status of JOINT_STATUSES) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it('os motivos de pausa batem com o check de pause_reason', () => {
    const check = sql.match(/pause_reason text check \(pause_reason in \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const noSql = (check as RegExpMatchArray)[1]
      .split(',')
      .map((s) => s.trim().replace(/'/g, ''));
    expect(noSql.sort()).toEqual([...JOINT_PAUSE_REASONS].sort());
  });

  it('o TTL de presença do TS é o mesmo de _forca_joint_presenca_ttl', () => {
    const m = sql.match(/select interval '(\d+) seconds'/);
    expect(m).not.toBeNull();
    expect(Number((m as RegExpMatchArray)[1]) * 1000).toBe(PRESENCA_TTL_MS);
  });
});

describe('o motor é puro', () => {
  it('não importa o cliente supabase nem serviço nenhum', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'src/engine/jointSessionModel.ts'),
      'utf8',
    );
    expect(fonte).not.toMatch(/from '\.\.\/config\/supabaseClient'/);
    expect(fonte).not.toMatch(/from '\.\.\/services\//);
    expect(fonte).not.toMatch(/\brequire\(/);
  });
});

describe('guardas de vocabulário', () => {
  it('recusa valor que só existe do lado do cliente', () => {
    expect(isJointMode('host_plan')).toBe(true);
    expect(isJointMode('meu_modo')).toBe(false);
    expect(isJointStatus('paused')).toBe(true);
    expect(isJointStatus('pausado')).toBe(false);
  });
});

describe('transições', () => {
  it('aceita as do banco', () => {
    expect(podeTransitar('inviting', 'lobby')).toBe(true);
    expect(podeTransitar('lobby', 'active')).toBe(true);
    expect(podeTransitar('active', 'paused')).toBe(true);
    expect(podeTransitar('paused', 'active')).toBe(true);
    expect(podeTransitar('active', 'completed')).toBe(true);
  });

  it('recusa as ilegais, inclusive sair de terminal', () => {
    expect(podeTransitar('inviting', 'active')).toBe(false);
    expect(podeTransitar('lobby', 'paused')).toBe(false);
    expect(podeTransitar('completed', 'active')).toBe(false);
    expect(podeTransitar('canceled', 'lobby')).toBe(false);
    expect(podeTransitar('abandoned', 'completed')).toBe(false);
  });
});

describe('papel e vez', () => {
  it('identifica papel e parceiro dos dois lados', () => {
    const s = estadoAtivo();
    expect(meuPapel(s, HOST)).toBe('host');
    expect(meuPapel(s, GUEST)).toBe('guest');
    expect(meuPapel(s, 'intruso')).toBeNull();
    expect(parceiroDe(s, HOST)?.userId).toBe(GUEST);
  });

  it('só é minha vez com o treino em execução', () => {
    expect(ehMinhaVez(estadoAtivo(), HOST)).toBe(true);
    expect(ehMinhaVez(estadoAtivo(), GUEST)).toBe(false);
    expect(ehMinhaVez(estadoAtivo({ status: 'paused' }), HOST)).toBe(false);
  });
});

describe('próximo turno', () => {
  it('alterna entre os dois', () => {
    expect(proximoTurno(estadoAtivo(), HOST)).toBe(GUEST);
    expect(proximoTurno(estadoAtivo(), GUEST)).toBe(HOST);
  });

  it('FICA com quem tem fila quando o parceiro já terminou (sem deadlock)', () => {
    const s = estadoAtivo({
      participants: [
        participante(HOST, 'host'),
        participante(GUEST, 'guest', { queueFinishedAt: '2026-08-01T10:30:00Z' }),
      ],
    });
    expect(proximoTurno(s, HOST)).toBe(HOST);
  });
});

describe('redutor de eventos', () => {
  it('aplica o avanço em ordem', () => {
    const s = estadoAtivo();
    const r = aplicarEvento(s, evento({ seq: 1, turnSeqAfter: 2 }), vistosVazios());
    expect(r.aplicado).toBe(true);
    expect(r.state.currentTurnUserId).toBe(GUEST);
    expect(r.state.turnSeq).toBe(2);
  });

  it('DESCARTA o mesmo evento repetido — o turno não anda duas vezes', () => {
    const s = estadoAtivo();
    const um = aplicarEvento(s, evento({ seq: 1 }), vistosVazios());
    const dois = aplicarEvento(um.state, evento({ seq: 1 }), um.vistos);
    expect(dois.aplicado).toBe(false);
    expect(dois.state.currentTurnUserId).toBe(GUEST);
    expect(dois.state.turnSeq).toBe(2);
  });

  it('DESCARTA evento com seq já visto (chegada fora de ordem)', () => {
    const s = estadoAtivo();
    const um = aplicarEvento(s, evento({ seq: 1, clientEventId: 'a' }), vistosVazios());
    const dois = aplicarEvento(
      um.state,
      evento({ seq: 1, clientEventId: 'b', actorUserId: GUEST }),
      um.vistos,
    );
    expect(dois.aplicado).toBe(false);
    expect(dois.state.turnSeq).toBe(2);
  });

  it('BURACO de seq não é remendado: pede snapshot e não aplica', () => {
    const s = estadoAtivo();
    const r = aplicarEvento(
      s,
      evento({ seq: 5, turnSeqAfter: 6, clientEventId: 'ev-5' }),
      vistosVazios(),
    );
    expect(r.precisaSnapshot).toBe(true);
    expect(r.aplicado).toBe(false);
    expect(r.state.currentTurnUserId).toBe(HOST);
    expect(r.state.turnSeq).toBe(1);
  });

  it('queue_finished passa o turno ao parceiro que ainda tem fila', () => {
    const s = estadoAtivo();
    const r = aplicarEvento(
      s,
      evento({ seq: 1, kind: 'queue_finished', actorUserId: HOST, turnSeqAfter: 2 }),
      vistosVazios(),
    );
    expect(r.state.currentTurnUserId).toBe(GUEST);
  });

  it('ACHADO F1: turn_advanced usa nextTurnUserId do servidor mesmo quando diverge da heurística local', () => {
    // Réplica do cenário confirmado: parceiro (GUEST) já encerrou a fila, o
    // ator (HOST) segura o turno. proximoTurno() — calibrada só para
    // advance_joint_turn — MANTÉM o turno com o ator neste caso. Mas os
    // handoffs novos da 0030 (mark_joint_queue_finished/complete_joint_participant)
    // podem legitimamente passar o turno ao parceiro mesmo com a fila dele já
    // encerrada (ex.: complete_joint_participant quando o ator conclui de vez).
    // O servidor manda via payload.next_turn_user_id — o reducer tem de obedecer.
    const s = estadoAtivo({
      currentTurnUserId: HOST,
      participants: [
        participante(HOST, 'host'),
        participante(GUEST, 'guest', { queueFinishedAt: '2026-08-01T10:30:00Z' }),
      ],
    });
    // Documenta a divergência: a heurística sozinha erraria (manteria HOST).
    expect(proximoTurno(s, HOST)).toBe(HOST);

    const r = aplicarEvento(
      s,
      evento({ seq: 1, actorUserId: HOST, nextTurnUserId: GUEST, turnSeqAfter: 2 }),
      vistosVazios(),
    );
    expect(r.aplicado).toBe(true);
    expect(r.state.currentTurnUserId).toBe(GUEST);
  });

  it('ACHADO F1 — fallback: evento sem nextTurnUserId preserva a heurística antiga intacta', () => {
    const s = estadoAtivo({
      currentTurnUserId: HOST,
      participants: [
        participante(HOST, 'host'),
        participante(GUEST, 'guest', { queueFinishedAt: '2026-08-01T10:30:00Z' }),
      ],
    });
    const r = aplicarEvento(
      s,
      evento({ seq: 1, actorUserId: HOST, turnSeqAfter: 2 }), // nextTurnUserId ausente
      vistosVazios(),
    );
    expect(r.state.currentTurnUserId).toBe(HOST); // comportamento antigo intacto
  });

  it('ACHADO F1 — caminho normal: nextTurnUserId coerente com a heurística devolve o mesmo resultado de antes', () => {
    const s = estadoAtivo(); // alternância simples, ninguém terminou fila (advance_joint_turn)
    const r = aplicarEvento(
      s,
      evento({ seq: 1, actorUserId: HOST, nextTurnUserId: GUEST, turnSeqAfter: 2 }),
      vistosVazios(),
    );
    expect(r.state.currentTurnUserId).toBe(GUEST);
    expect(r.state.currentTurnUserId).toBe(proximoTurno(s, HOST));
  });

  it('terminal zera o turno', () => {
    const s = estadoAtivo();
    const r = aplicarEvento(
      s,
      evento({ seq: 1, kind: 'completed', clientEventId: null }),
      vistosVazios(),
    );
    expect(r.state.status).toBe('completed');
    expect(r.state.currentTurnUserId).toBeNull();
  });
});

describe('estado dominante', () => {
  it('devolve exatamente um estado por situação', () => {
    expect(estadoDominante(estadoAtivo(), HOST)).toBe('minha_vez');
    expect(estadoDominante(estadoAtivo(), GUEST)).toBe('descanso');
    expect(estadoDominante(estadoAtivo({ status: 'paused' }), HOST)).toBe('pausado');
    expect(estadoDominante(estadoAtivo({ status: 'lobby' }), HOST)).toBe('aguardando_parceiro');
    expect(estadoDominante(estadoAtivo({ status: 'completed' }), HOST)).toBe('concluido');
    expect(estadoDominante(estadoAtivo({ status: 'abandoned' }), HOST)).toBe('encerrado');
    expect(estadoDominante(estadoAtivo({ status: 'canceled' }), HOST)).toBe('encerrado');
  });

  it('quem já concluiu acompanha, não recebe "minha vez"', () => {
    const s = estadoAtivo({
      currentTurnUserId: HOST,
      participants: [
        participante(HOST, 'host', { completedAt: '2026-08-01T11:00:00Z' }),
        participante(GUEST, 'guest'),
      ],
    });
    expect(estadoDominante(s, HOST)).toBe('aguardando_parceiro');
  });
});

describe('presença', () => {
  it('compara com o TTL, não com um booleano local', () => {
    const visto = new Date(T0).toISOString();
    expect(presencaPerdida(visto, T0 + 10_000)).toBe(false);
    expect(presencaPerdida(visto, T0 + PRESENCA_TTL_MS + 1)).toBe(true);
  });

  it('trata ausência e data inválida como perda', () => {
    expect(presencaPerdida(null, T0)).toBe(true);
    expect(presencaPerdida('nao-e-data', T0)).toBe(true);
  });

  it('só considera sumiço com o treino em execução', () => {
    const frio = estadoAtivo({
      participants: [
        participante(HOST, 'host'),
        participante(GUEST, 'guest', { lastSeenAt: new Date(T0 - 300_000).toISOString() }),
      ],
    });
    expect(parceiroSumiu(frio, HOST, T0)).toBe(true);
    expect(parceiroSumiu({ ...frio, status: 'paused' }, HOST, T0)).toBe(false);
    expect(parceiroSumiu({ ...frio, status: 'lobby' }, HOST, T0)).toBe(false);
  });
});

describe('elegibilidade do modo each_own', () => {
  it('aceita o grupo presente, ignorando acento e caixa', () => {
    expect(sessaoElegivelParaGrupo(['Peito', 'Tríceps'], 'peito')).toBe(true);
    expect(sessaoElegivelParaGrupo(['Peito', 'Tríceps'], 'TRICEPS')).toBe(true);
  });

  it('recusa grupo ausente, vazio ou sem sessão', () => {
    expect(sessaoElegivelParaGrupo(['Peito'], 'Costas')).toBe(false);
    expect(sessaoElegivelParaGrupo(['Peito'], '  ')).toBe(false);
    expect(sessaoElegivelParaGrupo([], 'Peito')).toBe(false);
    expect(sessaoElegivelParaGrupo(null, 'Peito')).toBe(false);
  });
});
