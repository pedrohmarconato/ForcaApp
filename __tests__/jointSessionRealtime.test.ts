// __tests__/jointSessionRealtime.test.ts
// Treino Conjunto 2.0 — Sprint 01. Canal, reconexão, watchdog e limpeza.
//
// Relógio e timers são INJETADOS: nenhum `sleep`, nenhum teste que depende de
// tempo de parede. Modos de falha cobertos:
//
//  1. "reconexão" que só refaz o fetch e deixa o canal morto — a tela volta a
//     mostrar dado certo uma vez e depois emudece para sempre;
//  2. reconexão em rajada, sem backoff, martelando o servidor que caiu;
//  3. snapshot NÃO buscado ao reassinar — o que aconteceu durante a queda some;
//  4. buraco de seq remendado no lugar de pedir snapshot;
//  5. watchdog que dispara pausa a cada tique enquanto o parceiro está fora;
//  6. watchdog que nunca dispara e deixa a dupla avançando com um lado offline;
//  7. timer/canal órfão depois do unsubscribe — vaza bateria e continua
//     escrevendo presença de uma sessão que a pessoa já fechou.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { channel: jest.fn(), removeChannel: jest.fn(), from: jest.fn(), rpc: jest.fn() },
}));

import { supabase } from '../src/config/supabaseClient';
import { subscribeToJointSession } from '../src/services/jointSessionRealtime';
import * as repo from '../src/services/jointSessionRepository';
import type { JointSessionState } from '../src/engine/jointSessionModel';

const channelMock = supabase.channel as jest.Mock;
const removeChannelMock = supabase.removeChannel as jest.Mock;

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const estado = (over: Partial<JointSessionState> = {}): JointSessionState => ({
  id: 'js-1',
  hostUserId: HOST,
  guestUserId: GUEST,
  mode: 'host_plan',
  muscleGroup: null,
  status: 'active',
  pauseReason: null,
  currentTurnUserId: HOST,
  turnSeq: 1,
  participants: [
    {
      userId: HOST,
      role: 'host',
      plannedSessionId: 'ps-1',
      sessionLogId: 'sl-1',
      ready: true,
      queueFinishedAt: null,
      completedAt: null,
      lastSeenAt: new Date(T0).toISOString(),
    },
    {
      userId: GUEST,
      role: 'guest',
      plannedSessionId: 'ps-2',
      sessionLogId: 'sl-2',
      ready: true,
      queueFinishedAt: null,
      completedAt: null,
      lastSeenAt: new Date(T0).toISOString(),
    },
  ],
  ...over,
});

/** Relógio e agenda falsos: nada aqui espera tempo de verdade passar. */
const criarAgenda = () => {
  let agoraMs = T0;
  let id = 0;
  const timeouts = new Map<number, { fn: () => void; ms: number }>();
  const intervals = new Map<number, { fn: () => void; ms: number }>();
  return {
    deps: {
      agora: () => agoraMs,
      setTimeout: (fn: () => void, ms: number) => {
        timeouts.set(++id, { fn, ms });
        return id;
      },
      clearTimeout: (h: number) => {
        timeouts.delete(h);
      },
      setInterval: (fn: () => void, ms: number) => {
        intervals.set(++id, { fn, ms });
        return id;
      },
      clearInterval: (h: number) => {
        intervals.delete(h);
      },
    },
    avancar: (ms: number) => {
      agoraMs += ms;
    },
    dispararTimeouts: () => {
      const pendentes = [...timeouts.entries()];
      timeouts.clear();
      pendentes.forEach(([, t]) => t.fn());
      return pendentes.map(([, t]) => t.ms);
    },
    dispararIntervals: () => {
      [...intervals.values()].forEach((i) => i.fn());
    },
    timeoutsAtivos: () => timeouts.size,
    intervalsAtivos: () => intervals.size,
  };
};

type Canal = {
  handlers: Record<string, (payload: any) => void>;
  emitirStatus: (s: string) => void;
};

const montarCanal = (): { canal: any; controle: Canal } => {
  const handlers: Record<string, (payload: any) => void> = {};
  let onStatus: (s: string) => void = () => {};
  const canal: any = {
    on: jest.fn((_tipo: string, cfg: any, cb: (p: any) => void) => {
      handlers[cfg.table] = cb;
      return canal;
    }),
    subscribe: jest.fn((cb: (s: string) => void) => {
      onStatus = cb;
      return canal;
    }),
  };
  return { canal, controle: { handlers, emitirStatus: (s) => onStatus(s) } };
};

let snapshotSpy: jest.SpyInstance;
let pauseSpy: jest.SpyInstance;
let touchSpy: jest.SpyInstance;

beforeEach(() => {
  channelMock.mockReset();
  removeChannelMock.mockReset();
  snapshotSpy = jest
    .spyOn(repo, 'getJointSessionSnapshot')
    .mockResolvedValue(estado());
  pauseSpy = jest.spyOn(repo, 'pauseJointSession').mockResolvedValue(estado({ status: 'paused' }));
  touchSpy = jest
    .spyOn(repo, 'touchJointPresence')
    .mockResolvedValue(new Date(T0).toISOString());
});

afterEach(() => {
  jest.restoreAllMocks();
});

const assinar = (agenda: ReturnType<typeof criarAgenda>, onState = jest.fn(), ttlMs = 60_000) => {
  const { canal, controle } = montarCanal();
  channelMock.mockReturnValue(canal);
  const sub = subscribeToJointSession('js-1', HOST, { onState }, { ...agenda.deps, ttlMs });
  return { sub, controle, onState, canal };
};

describe('assinatura', () => {
  it('filtra por joint_session_id nas três tabelas', () => {
    const agenda = criarAgenda();
    const { canal } = assinar(agenda);
    const filtros = (canal.on as jest.Mock).mock.calls.map(([, cfg]) => cfg);
    expect(filtros.map((f) => f.table).sort()).toEqual([
      'joint_session_events',
      'joint_session_participants',
      'joint_sessions',
    ]);
    for (const f of filtros) {
      expect(f.filter).toMatch(/=eq\.js-1$/);
    }
  });

  it('busca o snapshot autoritativo ao assinar — o que aconteceu na queda não se adivinha', async () => {
    const agenda = criarAgenda();
    const { controle, onState } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();
    expect(snapshotSpy).toHaveBeenCalledWith('js-1');
    expect(onState).toHaveBeenCalled();
  });
});

describe('reconexão', () => {
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    '%s REMOVE e recria o canal, não só refaz o fetch',
    (status) => {
      const agenda = criarAgenda();
      const { controle } = assinar(agenda);
      expect(channelMock).toHaveBeenCalledTimes(1);

      controle.emitirStatus(status);
      expect(removeChannelMock).not.toHaveBeenCalled(); // só no disparo do backoff

      agenda.dispararTimeouts();
      expect(removeChannelMock).toHaveBeenCalledTimes(1);
      expect(channelMock).toHaveBeenCalledTimes(2);
    },
  );

  it('usa backoff exponencial com teto, em vez de martelar o servidor caído', () => {
    const agenda = criarAgenda();
    const { controle } = assinar(agenda);
    const esperas: number[] = [];

    for (let i = 0; i < 8; i += 1) {
      controle.emitirStatus('CHANNEL_ERROR');
      esperas.push(...agenda.dispararTimeouts());
    }

    expect(esperas[0]).toBe(1_000);
    expect(esperas[1]).toBe(2_000);
    expect(esperas[2]).toBe(4_000);
    expect(Math.max(...esperas)).toBeLessThanOrEqual(30_000);
    for (let i = 1; i < esperas.length; i += 1) {
      expect(esperas[i]).toBeGreaterThanOrEqual(esperas[i - 1]);
    }
  });

  it('reassinar com sucesso zera o backoff', () => {
    const agenda = criarAgenda();
    const { controle } = assinar(agenda);
    controle.emitirStatus('CHANNEL_ERROR');
    agenda.dispararTimeouts();
    controle.emitirStatus('SUBSCRIBED');
    controle.emitirStatus('CHANNEL_ERROR');
    const esperas = agenda.dispararTimeouts();
    expect(esperas[0]).toBe(1_000);
  });

  it('não empilha reconexões para o mesmo episódio', () => {
    const agenda = criarAgenda();
    const { controle } = assinar(agenda);
    controle.emitirStatus('CHANNEL_ERROR');
    controle.emitirStatus('CHANNEL_ERROR');
    controle.emitirStatus('TIMED_OUT');
    expect(agenda.timeoutsAtivos()).toBe(1);
  });
});

describe('eventos', () => {
  const emitirEvento = async (controle: Canal, seq: number, turnSeqAfter: number) => {
    controle.handlers.joint_session_events({
      new: {
        seq,
        actor_user_id: HOST,
        kind: 'turn_advanced',
        client_event_id: `ev-${seq}`,
        turn_seq_after: turnSeqAfter,
      },
    });
    await Promise.resolve();
    await Promise.resolve();
  };

  it('aplica o evento em ordem sem ir ao servidor', async () => {
    const agenda = criarAgenda();
    const { controle, onState } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();
    snapshotSpy.mockClear();
    onState.mockClear();

    await emitirEvento(controle, 1, 2);
    expect(snapshotSpy).not.toHaveBeenCalled();
    const ultimo = onState.mock.calls.at(-1)?.[0] as JointSessionState;
    expect(ultimo.currentTurnUserId).toBe(GUEST);
    expect(ultimo.turnSeq).toBe(2);
  });

  it('BURACO de seq pede snapshot em vez de remendar', async () => {
    const agenda = criarAgenda();
    const { controle, onState } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();
    snapshotSpy.mockClear();
    onState.mockClear();

    await emitirEvento(controle, 5, 6);
    expect(snapshotSpy).toHaveBeenCalledWith('js-1');
    const aplicados = onState.mock.calls.map(([s]) => (s as JointSessionState).turnSeq);
    expect(aplicados).not.toContain(6);
  });

  it('evento repetido não move o turno duas vezes', async () => {
    const agenda = criarAgenda();
    const { controle, onState } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();
    onState.mockClear();

    await emitirEvento(controle, 1, 2);
    const depois = onState.mock.calls.length;
    await emitirEvento(controle, 1, 2);
    expect(onState.mock.calls.length).toBe(depois);
  });
});

describe('watchdog de parceiro parado', () => {
  it('pausa quando o heartbeat do parceiro cessa e o TTL é cruzado', async () => {
    const agenda = criarAgenda();
    const { controle } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();

    agenda.dispararIntervals();
    expect(pauseSpy).not.toHaveBeenCalled(); // parceiro fresco

    agenda.avancar(61_000);
    agenda.dispararIntervals();
    expect(pauseSpy).toHaveBeenCalledWith({
      jointSessionId: 'js-1',
      reason: 'presence_lost',
    });
  });

  it('pede a pausa UMA vez por episódio, não a cada tique', async () => {
    const agenda = criarAgenda();
    const { controle } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();

    agenda.avancar(61_000);
    agenda.dispararIntervals();
    agenda.dispararIntervals();
    agenda.dispararIntervals();
    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it('quem pausa é o servidor: o watchdog só chama a RPC', async () => {
    const agenda = criarAgenda();
    const { controle, onState } = assinar(agenda);
    controle.emitirStatus('SUBSCRIBED');
    await Promise.resolve();
    await Promise.resolve();
    onState.mockClear();

    agenda.avancar(61_000);
    agenda.dispararIntervals();
    // O estado local NÃO vira 'paused' por conta própria.
    const estados = onState.mock.calls.map(([s]) => (s as JointSessionState).status);
    expect(estados).not.toContain('paused');
  });

  it('o heartbeat usa a RPC de presença, não escrita direta em tabela', async () => {
    const agenda = criarAgenda();
    assinar(agenda);
    agenda.dispararIntervals();
    expect(touchSpy).toHaveBeenCalledWith('js-1');
    expect((supabase.from as jest.Mock).mock.calls.length).toBe(0);
  });
});

describe('limpeza', () => {
  it('unsubscribe remove o canal e não deixa timer órfão', () => {
    const agenda = criarAgenda();
    const { sub, controle } = assinar(agenda);
    controle.emitirStatus('CHANNEL_ERROR'); // agenda um backoff pendente
    expect(agenda.intervalsAtivos()).toBe(2); // heartbeat + watchdog
    expect(agenda.timeoutsAtivos()).toBe(1);

    sub.unsubscribe();

    expect(agenda.intervalsAtivos()).toBe(0);
    expect(agenda.timeoutsAtivos()).toBe(0);
    expect(removeChannelMock).toHaveBeenCalled();
  });

  it('depois do unsubscribe, um status atrasado não recria canal', () => {
    const agenda = criarAgenda();
    const { sub, controle } = assinar(agenda);
    sub.unsubscribe();
    removeChannelMock.mockClear();
    channelMock.mockClear();

    controle.emitirStatus('CHANNEL_ERROR');
    agenda.dispararTimeouts();

    expect(channelMock).not.toHaveBeenCalled();
  });
});
