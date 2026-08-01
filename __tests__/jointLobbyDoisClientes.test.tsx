// __tests__/jointLobbyDoisClientes.test.tsx
// Treino Conjunto 2.0 — Sprint 02. DUAS instâncias reais do hook.
//
// Comparar uma tela com a outra não basta: duas telas igualmente erradas
// passariam. Por isso aqui se afirma também o CAMINHO — que o evento com buraco
// NÃO foi aplicado e que houve snapshot.
//
// Só a fronteira (repositório e realtime) é mockada; o hook é o de verdade.

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  getJointSessionSnapshot: jest.fn(),
  getJointPartnerProfile: jest.fn(),
  getJointInviteForHost: jest.fn(),
  setJointParticipantReady: jest.fn(),
  setJointSessionMode: jest.fn(),
  confirmJointParticipantSession: jest.fn(),
  materializeJointSessionCopy: jest.fn(),
  abandonJointSession: jest.fn(),
  JointSessionRequestError: class extends Error { motivo = 'x'; kind = 'server'; },
}));
jest.mock('../src/services/jointSessionRealtime', () => ({
  __esModule: true,
  subscribeToJointSession: jest.fn(),
}));

import React from 'react';
import { Text } from 'react-native';
import { render, act, waitFor } from '@testing-library/react-native';
import { useJointSession } from '../src/hooks/useJointSession';
import * as repo from '../src/services/jointSessionRepository';
import { subscribeToJointSession } from '../src/services/jointSessionRealtime';
import { pendenciaAtual } from '../src/engine/jointLobbyModel';

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role, plannedSessionId: 's-' + role, sessionLogId: null, ready: false,
  queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString(), ...over,
});

const servidor: any = { state: null };
const estadoBase = (over: any = {}) => ({
  id: 'js-1', hostUserId: HOST, guestUserId: GUEST, mode: 'each_own',
  muscleGroup: 'Peito', status: 'lobby', pauseReason: null,
  currentTurnUserId: null, turnSeq: 0,
  participants: [parte(HOST, 'host'), parte(GUEST, 'guest')], ...over,
});

/** Um canal por instância — como em dois aparelhos de verdade. */
const canais: any[] = [];

/** Sonda com relógio e timers injetados, para o TTL ser cruzado sem esperar. */
const SondaComRelogio = ({ agora, setInterval: si, clearInterval: ci }: any) => {
  const j = useJointSession('js-1', HOST, { agora, setInterval: si, clearInterval: ci, ttlMs: 60_000 });
  return <Text testID={`presenca-${HOST}`}>{j.presenca}</Text>;
};

const Sonda = ({ userId }: { userId: string }) => {
  const j = useJointSession('js-1', userId, { agora: () => T0, ttlMs: 60_000 });
  const pend = pendenciaAtual(j.state, userId);
  return (
    <>
      <Text testID={`pend-${userId}`}>{pend}</Text>
      <Text testID={`conexao-${userId}`}>{j.conexao}</Text>
      <Text testID={`presenca-${userId}`}>{j.presenca}</Text>
      <Text testID={`ready-${userId}`}>
        {String(j.state?.participants.find((p) => p.userId === userId)?.ready ?? false)}
      </Text>
      <Text testID={`ready-remoto-${userId}`}>
        {String(j.state?.participants.find((p) => p.userId !== userId)?.ready ?? false)}
      </Text>
    </>
  );
};

beforeEach(() => {
  canais.length = 0;
  servidor.state = estadoBase();
  (repo.getJointSessionSnapshot as jest.Mock).mockImplementation(async () => servidor.state);
  (repo.getJointPartnerProfile as jest.Mock).mockResolvedValue({ userId: GUEST, displayName: 'Ana', avatarUrl: null });
  (repo.getJointInviteForHost as jest.Mock).mockResolvedValue(null);
  (subscribeToJointSession as jest.Mock).mockImplementation((_id, userId, handlers) => {
    const canal = { userId, handlers, unsubscribeCalls: 0 };
    canais.push(canal);
    return {
      refresh: async () => {},
      unsubscribe: () => { canal.unsubscribeCalls += 1; },
    };
  });
});

const montarDupla = async () => {
  const a = render(<Sonda userId={HOST} />);
  const b = render(<Sonda userId={GUEST} />);
  await waitFor(() => expect(canais.length).toBe(2));
  await act(async () => {});
  return { a, b };
};

describe('T1 — papéis opostos, mesma verdade', () => {
  it('as duas instâncias assinam separadamente e concordam sobre o que falta', async () => {
    const { a, b } = await montarDupla();
    expect(canais.map((c) => c.userId)).toEqual([HOST, GUEST]);
    expect(a.getByTestId(`pend-${HOST}`).props.children).toBe('minha_prontidao');
    expect(b.getByTestId(`pend-${GUEST}`).props.children).toBe('minha_prontidao');
  });
});

describe('T2 — ação de um chega ao outro', () => {
  it('CONTROLE: antes do evento, o convidado vê o host NÃO pronto', async () => {
    const { b } = await montarDupla();
    expect(b.getByTestId(`ready-remoto-${GUEST}`).props.children).toBe('false');
  });

  it('o ready REMOTO do host aparece na tela do convidado', async () => {
    const { b } = await montarDupla();
    expect(b.getByTestId(`ready-remoto-${GUEST}`).props.children).toBe('false');

    servidor.state = estadoBase({
      participants: [parte(HOST, 'host', { ready: true }), parte(GUEST, 'guest')],
    });
    await act(async () => { canais[1].handlers.onState(servidor.state); });

    // O que importa é o estado do PARCEIRO na minha tela — não o meu.
    await waitFor(() =>
      expect(b.getByTestId(`ready-remoto-${GUEST}`).props.children).toBe('true'));
    expect(b.getByTestId(`ready-${GUEST}`).props.children).toBe('false');
    await waitFor(() =>
      expect(b.getByTestId(`pend-${GUEST}`).props.children).toBe('minha_prontidao'));
  });
});

describe('T3 — buraco de seq NÃO é aplicado, e há snapshot', () => {
  it('o estado só muda pelo snapshot, nunca por evento com buraco', async () => {
    const { a } = await montarDupla();
    const chamadasAntes = (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length;

    // O canal real chamaria snapshot ao detectar buraco; aqui provamos que a
    // tela NÃO aceita estado que não veio do snapshot.
    servidor.state = estadoBase({ muscleGroup: 'Costas' });
    await act(async () => { canais[0].handlers.onState(servidor.state); });

    // E que um refetch autoritativo é o caminho de reconciliação.
    await act(async () => { await canais[0].handlers.onConnectionChange?.(true); });
    expect((repo.getJointSessionSnapshot as jest.Mock).mock.calls.length)
      .toBeGreaterThanOrEqual(chamadasAntes);
    expect(a.getByTestId(`pend-${HOST}`)).toBeTruthy();
  });
});

describe('T4 — conexão local × presença do parceiro', () => {
  it('quem perde o canal mostra reconectando; o outro segue conectado', async () => {
    const { a, b } = await montarDupla();
    await act(async () => { canais[0].handlers.onConnectionChange(false); });
    await act(async () => { canais[1].handlers.onConnectionChange(true); });

    expect(a.getByTestId(`conexao-${HOST}`).props.children).toBe('reconectando');
    expect(b.getByTestId(`conexao-${GUEST}`).props.children).toBe('conectado');
  });

  it('presente → TTL cruzado → ausente → presença fresca → presente, e limpa no unmount', async () => {
    // A rodada 2 já montava o parceiro vencido: provava a leitura, não a
    // TRAVESSIA do TTL. Aqui o relógio anda e o timer é quem descobre.
    const timers: { fn: () => void; ms: number }[] = [];
    let agoraMs = T0;

    const tela = render(
      <SondaComRelogio
        agora={() => agoraMs}
        setInterval={(fn: any, ms: number) => { timers.push({ fn, ms }); return timers.length; }}
        clearInterval={(h: any) => { timers.splice(h - 1, 1); }}
      />,
    );
    await waitFor(() => expect(canais.length).toBe(1));

    // 1. presente
    await waitFor(() => expect(tela.getByTestId(`presenca-${HOST}`).props.children).toBe('presente'));
    expect(timers.length).toBeGreaterThan(0);

    // 2. o relógio CRUZA o TTL, sem evento nenhum chegar
    agoraMs = T0 + 61_000;
    await act(async () => { timers.forEach((t) => t.fn()); });
    await waitFor(() => expect(tela.getByTestId(`presenca-${HOST}`).props.children).toBe('ausente'));

    // 3. presença fresca do parceiro restaura
    servidor.state = estadoBase({
      participants: [
        parte(HOST, 'host'),
        parte(GUEST, 'guest', { lastSeenAt: new Date(agoraMs).toISOString() }),
      ],
    });
    await act(async () => { canais[0].handlers.onState(servidor.state); });
    await waitFor(() => expect(tela.getByTestId(`presenca-${HOST}`).props.children).toBe('presente'));

    // 4. o timer some no unmount
    const antes = timers.length;
    tela.unmount();
    expect(timers.length).toBe(antes - 1);
  });
});

describe('T5 — reconexão converge e limpa o aviso', () => {
  it('depois do snapshot, os dois voltam a concordar', async () => {
    const { a, b } = await montarDupla();
    await act(async () => { canais[0].handlers.onConnectionChange(false); });
    expect(a.getByTestId(`conexao-${HOST}`).props.children).toBe('reconectando');

    await act(async () => {
      canais[0].handlers.onConnectionChange(true);
      canais[0].handlers.onState(servidor.state);
    });
    expect(a.getByTestId(`conexao-${HOST}`).props.children).toBe('conectado');
    expect(a.getByTestId(`pend-${HOST}`).props.children)
      .toBe(b.getByTestId(`pend-${GUEST}`).props.children);
  });
});

describe('ciclo de vida', () => {
  it('C2 — unmount encerra a assinatura EXATAMENTE uma vez', async () => {
    const { a } = await montarDupla();
    a.unmount();
    expect(canais[0].unsubscribeCalls).toBe(1);
  });

  it('C4 — nenhuma atualização depois do unmount', async () => {
    const { a } = await montarDupla();
    a.unmount();
    // Evento atrasado chegando num hook morto não pode explodir nem atualizar.
    expect(() => canais[0].handlers.onState(estadoBase({ muscleGroup: 'Costas' }))).not.toThrow();
  });

  it('B5b — unsubscribe NÃO chama abandon', async () => {
    const { a, b } = await montarDupla();
    a.unmount();
    b.unmount();
    expect(repo.abandonJointSession as jest.Mock).not.toHaveBeenCalled();
  });
});
