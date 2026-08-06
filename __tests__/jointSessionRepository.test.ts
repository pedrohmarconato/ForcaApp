// __tests__/jointSessionRepository.test.ts
// Treino Conjunto 2.0 — Sprint 01. Fronteira com as RPCs da 0026.
//
// Modos de falha cobertos:
//  1. erro do banco engolido e a série aparecendo como "confirmada" na tela
//     enquanto o turno não passou — a divergência mais cara desta feature;
//  2. errcode traduzido errado, e a tela dizendo "tente de novo" para um caso
//     em que tentar de novo nunca vai funcionar;
//  3. nome de RPC ou de parâmetro divergindo da migration (erro que só aparece
//     em runtime, no aparelho do aluno);
//  4. convite inválido chegando como sucesso com dado nulo;
//  5. falha de rede confundida com recusa do servidor no meio do treino.

jest.mock('../src/config/supabaseClient', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { supabase } from '../src/config/supabaseClient';
import {
  JointSessionRequestError,
  abandonJointSession,
  advanceJointTurn,
  completeJointParticipant,
  confirmJointParticipantSession,
  createJointSession,
  getJointPartnerProfile,
  getJointSessionEvents,
  getJointSessionSnapshot,
  isTransportJointError,
  joinJointSession,
  markJointQueueFinished,
  materializeJointSessionCopy,
  pauseJointSession,
  resumeJointSession,
  setJointParticipantReady,
  setJointSessionMode,
  touchJointPresence,
} from '../src/services/jointSessionRepository';

const rpcMock = supabase.rpc as jest.Mock;
const fromMock = supabase.from as jest.Mock;

const SESSAO = {
  id: 'js-1',
  host_user_id: 'u-host',
  guest_user_id: 'u-guest',
  mode: 'host_plan',
  muscle_group: null,
  status: 'active',
  pause_reason: null,
  current_turn_user_id: 'u-host',
  turn_seq: 3,
};

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

const erroDoBanco = (code: string) => ({
  data: null,
  error: { message: `falhou ${code}`, code },
  status: 400,
});

describe('nomes de RPC e de parâmetro batem com a migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/0026_treino_conjunto.sql'),
    'utf8',
  );

  it('toda RPC chamada existe na 0026 com os parâmetros usados', async () => {
    rpcMock.mockResolvedValue({ data: SESSAO, error: null });

    await createJointSession();
    await joinJointSession('ABC234');
    await setJointSessionMode({ jointSessionId: 'js-1', mode: 'each_own', muscleGroup: 'Peito' });
    await setJointParticipantReady({ jointSessionId: 'js-1', ready: true });
    await advanceJointTurn({
      jointSessionId: 'js-1',
      clientEventId: 'ev-1',
      expectedTurnSeq: 3,
      setLogId: 'sl-1',
    });
    await markJointQueueFinished('js-1');
    await pauseJointSession({ jointSessionId: 'js-1', reason: 'presence_lost' });
    await resumeJointSession('js-1');
    await completeJointParticipant('js-1');
    await abandonJointSession('js-1');

    for (const [nome, params] of rpcMock.mock.calls) {
      expect(sql).toContain(`create or replace function public.${nome}(`);
      for (const parametro of Object.keys(params ?? {})) {
        expect(sql).toContain(parametro);
      }
    }
  });
});

describe('propagação de erro', () => {
  it.each([
    ['42501', 'nao_autorizado'],
    ['22023', 'argumento_invalido'],
    ['55000', 'estado_invalido'],
    ['FC001', 'turno_desatualizado'],
    ['54000', 'limite_de_tentativas'],
    ['P0001', 'fila_pendente'],
    ['P0002', 'nao_encontrado'],
  ])('errcode %s vira motivo %s', async (code, motivo) => {
    rpcMock.mockResolvedValueOnce(erroDoBanco(code));
    await expect(markJointQueueFinished('js-1')).rejects.toMatchObject({
      name: 'JointSessionRequestError',
      code,
      motivo,
    });
  });

  it('errcode desconhecido não é mascarado como sucesso', async () => {
    rpcMock.mockResolvedValueOnce(erroDoBanco('XX999'));
    await expect(markJointQueueFinished('js-1')).rejects.toMatchObject({
      motivo: 'desconhecido',
    });
  });

  it('falha de rede é classificada como transporte, não como recusa do servidor', async () => {
    rpcMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const erro = await advanceJointTurn({
      jointSessionId: 'js-1',
      clientEventId: 'ev-1',
      expectedTurnSeq: 1,
      setLogId: 'sl-1',
    }).catch((e) => e);
    expect(isTransportJointError(erro)).toBe(true);
  });

  it('resposta HTTP sem code continua sendo falha do servidor', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'forbidden' }, status: 403 });
    const erro = await resumeJointSession('js-1').catch((e) => e);
    expect(erro).toBeInstanceOf(JointSessionRequestError);
    expect(isTransportJointError(erro)).toBe(false);
    expect(erro.status).toBe(403);
  });
});

describe('convite', () => {
  it('devolve código e validade na criação', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        ...SESSAO,
        status: 'inviting',
        guest_user_id: null,
        current_turn_user_id: null,
        turn_seq: 0,
        invite_code: 'ABC234',
        invite_expires_at: '2026-08-01T10:15:00Z',
      },
      error: null,
    });
    const r = await createJointSession();
    expect(r.inviteCode).toBe('ABC234');
    expect(r.session.status).toBe('inviting');
    expect(r.session.guestUserId).toBeNull();
  });

  it('retorno NULO do join vira erro de convite inválido, nunca sucesso', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(joinJointSession('ZZZZZZ')).rejects.toMatchObject({
      motivo: 'convite_invalido',
    });
  });

  it('convite inválido e excesso de tentativas são indistinguíveis para quem chama', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const a = await joinJointSession('AAAAAA').catch((e) => e);
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const b = await joinJointSession('BBBBBB').catch((e) => e);
    expect(a.motivo).toBe(b.motivo);
    expect(a.message).toBe(b.message);
  });
});

describe('mapeamento de linha para domínio', () => {
  it('lê a sessão com turno e modo', async () => {
    rpcMock.mockResolvedValueOnce({ data: SESSAO, error: null });
    const s = await setJointParticipantReady({ jointSessionId: 'js-1', ready: true });
    expect(s).toMatchObject({
      id: 'js-1',
      hostUserId: 'u-host',
      guestUserId: 'u-guest',
      mode: 'host_plan',
      status: 'active',
      currentTurnUserId: 'u-host',
      turnSeq: 3,
    });
  });

  it('status desconhecido do servidor é erro, não é engolido', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ...SESSAO, status: 'zumbi' }, error: null });
    await expect(resumeJointSession('js-1')).rejects.toBeInstanceOf(JointSessionRequestError);
  });

  it('modo desconhecido cai para null em vez de contaminar a tela', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ...SESSAO, mode: 'modo_novo' }, error: null });
    const s = await resumeJointSession('js-1');
    expect(s.mode).toBeNull();
  });

  it('resposta em array (alguns setups) é tratada como objeto', async () => {
    rpcMock.mockResolvedValueOnce({ data: [SESSAO], error: null });
    const s = await abandonJointSession('js-1');
    expect(s.id).toBe('js-1');
  });
});

describe('participante e cópia', () => {
  it('confirma a sessão e devolve o participante', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        user_id: 'u-guest',
        role: 'guest',
        planned_session_id: 'ps-9',
        session_log_id: null,
        ready: false,
        queue_finished_at: null,
        completed_at: null,
        last_seen_at: '2026-08-01T10:00:00Z',
      },
      error: null,
    });
    const p = await confirmJointParticipantSession({
      jointSessionId: 'js-1',
      plannedSessionId: 'ps-9',
    });
    expect(p).toMatchObject({ userId: 'u-guest', role: 'guest', plannedSessionId: 'ps-9' });
  });

  it('a cópia não recebe id de origem — a fonte é a que o dono confirmou', async () => {
    rpcMock.mockResolvedValueOnce({ data: { id: 'ps-copia', title: 'Peito A' }, error: null });
    await materializeJointSessionCopy('js-1');
    const [, params] = rpcMock.mock.calls[0];
    expect(Object.keys(params)).toEqual(['p_joint_session_id']);
  });

  it('resposta sem id na cópia é erro, não sessão fantasma', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null });
    await expect(materializeJointSessionCopy('js-1')).rejects.toBeInstanceOf(
      JointSessionRequestError,
    );
  });
});

describe('presença e perfil do parceiro', () => {
  it('o heartbeat não recebe parâmetro de usuário (não dá para spoofar o parceiro)', async () => {
    rpcMock.mockResolvedValueOnce({ data: '2026-08-01T10:00:30Z', error: null });
    await touchJointPresence('js-1');
    const [nome, params] = rpcMock.mock.calls[0];
    expect(nome).toBe('touch_joint_presence');
    expect(Object.keys(params)).toEqual(['p_joint_session_id']);
  });

  it('o perfil do parceiro traz três campos e nada mais', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { user_id: 'u-guest', display_name: 'Ana', avatar_url: null },
      error: null,
    });
    const p = await getJointPartnerProfile('js-1');
    expect(Object.keys(p ?? {}).sort()).toEqual(['avatarUrl', 'displayName', 'userId']);
  });

  it('sem parceiro devolve null', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await getJointPartnerProfile('js-1')).toBeNull();
  });
});

describe('snapshot autoritativo', () => {
  const builder = (result: { data?: unknown; error: unknown; status?: number }) => {
    const b: any = {};
    const chain = () => b;
    b.select = jest.fn(chain);
    b.eq = jest.fn(chain);
    b.gt = jest.fn(chain);
    b.order = jest.fn(chain);
    b.limit = jest.fn(chain);
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  };

  it('monta estado com os dois participantes', async () => {
    fromMock.mockReturnValueOnce(
      builder({
        data: [
          {
            ...SESSAO,
            joint_session_participants: [
              {
                user_id: 'u-host',
                role: 'host',
                planned_session_id: 'ps-1',
                session_log_id: 'sl-1',
                ready: true,
                queue_finished_at: null,
                completed_at: null,
                last_seen_at: '2026-08-01T10:00:00Z',
              },
              {
                user_id: 'u-guest',
                role: 'guest',
                planned_session_id: 'ps-2',
                session_log_id: 'sl-2',
                ready: true,
                queue_finished_at: null,
                completed_at: null,
                last_seen_at: '2026-08-01T10:00:00Z',
              },
            ],
          },
        ],
        error: null,
      }),
    );
    const s = await getJointSessionSnapshot('js-1');
    expect(s?.participants).toHaveLength(2);
    expect(s?.participants.map((p) => p.role).sort()).toEqual(['guest', 'host']);
  });

  it('sessão inexistente ou alheia devolve null (a RLS já filtrou)', async () => {
    fromMock.mockReturnValueOnce(builder({ data: [], error: null }));
    expect(await getJointSessionSnapshot('js-x')).toBeNull();
  });

  it('erro na leitura propaga', async () => {
    fromMock.mockReturnValueOnce(
      builder({ data: null, error: { message: 'boom', code: '42501' }, status: 403 }),
    );
    await expect(getJointSessionSnapshot('js-1')).rejects.toMatchObject({
      motivo: 'nao_autorizado',
    });
  });
});

// ACHADO F4 (verificador do F1): getJointSessionEvents não selecionava `payload`
// nem mapeava `nextTurnUserId` — código sem chamador hoje, mas quem ligar esse
// caminho de reconciliação por gap de seq alimentaria o reducer com eventos sem
// a verdade do servidor sobre o turno, caindo no fallback local em silêncio.
describe('eventos desde seq', () => {
  const builder = (result: { data?: unknown; error: unknown; status?: number }) => {
    const b: any = {};
    const chain = () => b;
    b.select = jest.fn(chain);
    b.eq = jest.fn(chain);
    b.gt = jest.fn(chain);
    b.order = jest.fn(chain);
    b.limit = jest.fn(chain);
    b.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
    return b;
  };

  it('leva payload.next_turn_user_id ao JointEvent (achado do verificador do F1)', async () => {
    const b = builder({
      data: [
        {
          seq: 7,
          actor_user_id: 'u-host',
          kind: 'turn_advanced',
          client_event_id: 'ev-7',
          turn_seq_after: 4,
          payload: { next_turn_user_id: 'u-x' },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(b);
    const [evento] = await getJointSessionEvents('js-1', 6);
    expect(evento.nextTurnUserId).toBe('u-x');
    expect(b.select).toHaveBeenCalledWith(expect.stringContaining('payload'));
  });

  it('payload nulo ou sem o campo devolve nextTurnUserId indefinido, sem lançar', async () => {
    const b = builder({
      data: [
        {
          seq: 8,
          actor_user_id: 'u-guest',
          kind: 'set_confirmed',
          client_event_id: null,
          turn_seq_after: null,
          payload: null,
        },
        {
          seq: 9,
          actor_user_id: 'u-guest',
          kind: 'set_confirmed',
          client_event_id: null,
          turn_seq_after: null,
          payload: {},
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(b);
    const eventos = await getJointSessionEvents('js-1', 6);
    expect(eventos.map((e) => e.nextTurnUserId)).toEqual([undefined, undefined]);
  });
});
