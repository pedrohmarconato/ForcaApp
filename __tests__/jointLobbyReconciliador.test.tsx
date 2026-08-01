// __tests__/jointLobbyReconciliador.test.tsx
// Treino Conjunto 2.0 — Sprint 02. O GAP atravessando o reconciliador REAL.
//
// A rodada 1 chamou `onState` direto e aceitou `snapshotCalls >= antes`: isso
// passa mesmo sem gap nenhum. Aqui o único mock é o `supabase` — o canal, o
// `jointSessionRealtime`, o redutor, o hook e as DUAS TELAS são de verdade.
//
// O que se prova:
//   1. o evento com buraco de `seq` NÃO é aplicado (o turno/estado não muda);
//   2. o reconciliador dispara um snapshot ADICIONAL (contagem estrita);
//   3. as duas telas reais, com hooks independentes, convergem pelo snapshot.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));

const canais: any[] = [];
jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    channel: jest.fn((nome: string) => {
      const handlers: Record<string, (p: any) => void> = {};
      let onStatus: (s: string) => void = () => {};
      const canal: any = {
        nome,
        on: jest.fn((_t: string, cfg: any, cb: any) => { handlers[cfg.table] = cb; return canal; }),
        subscribe: jest.fn((cb: any) => { onStatus = cb; canais.push({ canal, handlers, emitir: (s: string) => onStatus(s) }); return canal; }),
      };
      return canal;
    }),
    removeChannel: jest.fn(),
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  getJointSessionSnapshot: jest.fn(),
  getJointPartnerProfile: jest.fn(),
  getJointInviteForHost: jest.fn(),
  setJointSessionMode: jest.fn(),
  confirmJointParticipantSession: jest.fn(),
  materializeJointSessionCopy: jest.fn(),
  setJointParticipantReady: jest.fn(),
  abandonJointSession: jest.fn(),
  createJointSession: jest.fn(),
  JointSessionRequestError: class extends Error { motivo = 'x'; kind = 'server'; },
}));

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { JointLobbyView } from '../src/screens/JointLobbyScreen';
import * as repo from '../src/services/jointSessionRepository';

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role, plannedSessionId: `s-${role}`, sessionLogId: null, ready: false,
  queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString(), ...over,
});

const servidor: any = {};
const estado = (over: any = {}) => ({
  id: 'js-1', hostUserId: HOST, guestUserId: GUEST, mode: 'each_own',
  muscleGroup: 'Peito', status: 'lobby', pauseReason: null,
  currentTurnUserId: null, turnSeq: 1,
  participants: [parte(HOST, 'host'), parte(GUEST, 'guest')], ...over,
});

const sessaoPropria = { id: 's-host', title: 'Peito A', muscleGroups: ['Peito'], status: 'pending', jointSessionId: null };

const abrir = (meuUserId: string) =>
  render(
    <JointLobbyView
      navigation={{ goBack: jest.fn(), navigate: jest.fn() } as any}
      route={{ params: { jointSessionId: 'js-1' } }}
      meuUserId={meuUserId}
      minhasSessoes={[sessaoPropria]}
      confirmar={jest.fn()}
      anunciar={jest.fn()}
      agora={() => T0}
    />,
  );

beforeEach(() => {
  canais.length = 0;
  jest.clearAllMocks();
  servidor.state = estado();
  (repo.getJointSessionSnapshot as jest.Mock).mockImplementation(async () => servidor.state);
  (repo.getJointPartnerProfile as jest.Mock).mockResolvedValue({ userId: GUEST, displayName: 'Ana', avatarUrl: null });
  (repo.getJointInviteForHost as jest.Mock).mockResolvedValue(null);
});

/** Emite um INSERT de evento pelo canal real, como o Postgres faria. */
const emitirEvento = async (indice: number, evento: any) => {
  await act(async () => {
    canais[indice].handlers.joint_session_events({ new: evento });
    await Promise.resolve();
  });
};

describe('T3 — gap atravessa o reconciliador real', () => {
  it('evento com buraco NÃO é aplicado e dispara snapshot ADICIONAL', async () => {
    const tela = abrir(HOST);
    await waitFor(() => expect(canais.length).toBe(1));
    await act(async () => { canais[0].emitir('SUBSCRIBED'); });
    await waitFor(() => expect(repo.getJointSessionSnapshot).toHaveBeenCalled());

    // O servidor mudou para um estado que o snapshot revelaria.
    servidor.state = estado({ muscleGroup: 'Costas' });
    const antes = (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length;

    // seq 5 quando o cliente está no 0: BURACO. O redutor real recusa aplicar.
    await emitirEvento(0, {
      seq: 5, actor_user_id: GUEST, kind: 'turn_advanced',
      client_event_id: 'ev-5', turn_seq_after: 6,
    });

    // 1) snapshot ADICIONAL — contagem estrita, não ">=".
    await waitFor(() => expect(
      (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length,
    ).toBe(antes + 1));

    // 2) o estado veio do SNAPSHOT (grupo Costas), não do evento. A prova
    // visível: com o grupo em Costas e só uma sessão de Peito, a tela passa a
    // mostrar a incompatibilidade — consequência que o evento não produziria.
    await waitFor(() => expect(tela.getByTestId('incompatibilidade')).toBeTruthy());
  });

  it('evento EM ORDEM é aplicado sem ir ao servidor', async () => {
    abrir(HOST);
    await waitFor(() => expect(canais.length).toBe(1));
    await act(async () => { canais[0].emitir('SUBSCRIBED'); });
    await waitFor(() => expect(repo.getJointSessionSnapshot).toHaveBeenCalled());
    const antes = (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length;

    await emitirEvento(0, {
      seq: 1, actor_user_id: GUEST, kind: 'ready',
      client_event_id: 'ev-1', turn_seq_after: null,
    });

    // Sem buraco não há snapshot extra — é o contraste que prova que o
    // snapshot do caso anterior veio do GAP, e não de qualquer evento.
    expect((repo.getJointSessionSnapshot as jest.Mock).mock.calls.length).toBe(antes);
  });
});

describe('T1/T5 — duas TELAS reais, hooks e canais independentes', () => {
  it('cada tela abre o próprio canal e converge pelo snapshot', async () => {
    const telaHost = abrir(HOST);
    const telaGuest = abrir(GUEST);
    await waitFor(() => expect(canais.length).toBe(2));

    await act(async () => {
      canais[0].emitir('SUBSCRIBED');
      canais[1].emitir('SUBSCRIBED');
    });

    // Papéis opostos na MESMA verdade: o host controla o modo, o convidado lê.
    await waitFor(() => expect(telaHost.getByTestId('modo-escolha')).toBeTruthy());
    await waitFor(() => expect(telaGuest.getByTestId('modo-leitura')).toBeTruthy());

    // Um gap no canal do convidado reconcilia SÓ o dele, sem tocar o do host.
    servidor.state = estado({ muscleGroup: 'Costas' });
    const antes = (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length;
    await emitirEvento(1, {
      seq: 9, actor_user_id: HOST, kind: 'turn_advanced',
      client_event_id: 'ev-9', turn_seq_after: 10,
    });
    await waitFor(() => expect(
      (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length,
    ).toBe(antes + 1));

    // E as duas telas continuam coerentes com o servidor.
    await waitFor(() => expect(telaGuest.getByTestId('incompatibilidade')).toBeTruthy());
  });

  it('a queda do canal de um lado não mexe no outro', async () => {
    const telaHost = abrir(HOST);
    abrir(GUEST);
    await waitFor(() => expect(canais.length).toBe(2));
    await act(async () => {
      canais[0].emitir('SUBSCRIBED');
      canais[1].emitir('SUBSCRIBED');
    });
    await waitFor(() => expect(telaHost.getByTestId('modo-escolha')).toBeTruthy());

    await act(async () => { canais[1].emitir('CHANNEL_ERROR'); });

    // O host segue funcionando; nada explode do lado dele.
    expect(telaHost.getByTestId('modo-escolha')).toBeTruthy();
  });
});
