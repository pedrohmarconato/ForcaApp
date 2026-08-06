// __tests__/jointConcorrenciaCliente.test.tsx
// Treino Conjunto 2.0 — Sprint 02, rodada 3. F16 (snapshot antigo) e F15 (Share).
//
// CONTROLE NEGATIVO PRIMEIRO, em cada bloco.
//
// F16: `geracao` só separava sessão e unmount. Dentro da MESMA sessão, um
//      `buscar()` lento podia resolver DEPOIS de um estado mais novo e
//      sobrescrevê-lo — a tela voltava no tempo sem ninguém perceber.
// F15: `Share.share` sem single-flight abria duas folhas de compartilhamento
//      com dois toques enquanto a primeira ainda estava pendente.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  getJointSessionSnapshot: jest.fn(),
  getJointPartnerProfile: jest.fn(async () => null),
  getJointInviteForHost: jest.fn(async () => null),
  createJointSession: jest.fn(),
  setJointSessionMode: jest.fn(),
  confirmJointParticipantSession: jest.fn(),
  materializeJointSessionCopy: jest.fn(),
  setJointParticipantReady: jest.fn(),
  abandonJointSession: jest.fn(),
  JointSessionRequestError: class extends Error { motivo = 'x'; kind = 'server'; },
}));
jest.mock('../src/services/jointSessionRealtime', () => ({
  __esModule: true, subscribeToJointSession: jest.fn(),
}));

import React from 'react';
import { Share, Text } from 'react-native';
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';
import { useJointSession } from '../src/hooks/useJointSession';
import * as repo from '../src/services/jointSessionRepository';
import { subscribeToJointSession } from '../src/services/jointSessionRealtime';
import JointInviteScreen from '../src/screens/JointInviteScreen';

const HOST = 'u-host';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');
const canais: any[] = [];

const estado = (grupo: string) => ({
  id: 'js-1', hostUserId: HOST, guestUserId: 'u-guest', mode: 'each_own',
  muscleGroup: grupo, status: 'lobby', pauseReason: null,
  currentTurnUserId: null, turnSeq: 0,
  participants: [
    { userId: HOST, role: 'host', plannedSessionId: null, sessionLogId: null, ready: false,
      queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString() },
    { userId: 'u-guest', role: 'guest', plannedSessionId: null, sessionLogId: null, ready: false,
      queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString() },
  ],
});

const recarregarRef: { fn: null | (() => Promise<void>) } = { fn: null };
const Sonda = () => {
  const j = useJointSession('js-1', HOST, { agora: () => T0 });
  recarregarRef.fn = j.recarregar;
  return (
    <>
      <Text testID="grupo">{j.state?.muscleGroup ?? 'nenhum'}</Text>
      <Text testID="erro">{j.erro?.mensagem ?? 'sem-erro'}</Text>
      <Text testID="carregando">{String(j.carregando)}</Text>
      <Text testID="parceiro">{j.parceiro?.displayName ?? 'sem-parceiro'}</Text>
    </>
  );
};

beforeEach(() => {
  canais.length = 0;
  jest.clearAllMocks();
  (subscribeToJointSession as jest.Mock).mockImplementation((_id, _u, handlers) => {
    canais.push(handlers);
    return { refresh: async () => {}, unsubscribe: () => {} };
  });
});

// ============================================================
// F16 — snapshot antigo NÃO vence estado mais novo
// ============================================================
describe('F16 — respostas fora de ordem na mesma sessão', () => {
  it('CONTROLE: o harness realmente inverte a ordem das Promises', async () => {
    // Se este controle parar de valer, o teste abaixo passa sem exercitar nada.
    const ordem: string[] = [];
    let liberarLenta: (v: any) => void = () => {};
    const lenta = new Promise((r) => { liberarLenta = r; }).then(() => ordem.push('lenta'));
    const rapida = Promise.resolve().then(() => ordem.push('rapida'));
    await rapida;
    liberarLenta(null);
    await lenta;
    expect(ordem).toEqual(['rapida', 'lenta']);
  });

  it('snapshot ANTIGO que resolve depois não sobrescreve o estado novo', async () => {
    // O primeiro `buscar()` (da montagem) fica pendurado.
    let liberarAntigo: (v: any) => void = () => {};
    (repo.getJointSessionSnapshot as jest.Mock).mockImplementationOnce(
      () => new Promise((r) => { liberarAntigo = r; }),
    );

    const tela = render(<Sonda />);
    await waitFor(() => expect(canais.length).toBe(1));

    // Enquanto ele não volta, chega um estado MAIS NOVO pelo canal (o
    // simulacro do realtime passa o selo do PEDIDO — maior que o do buscar).
    await act(async () => { canais[0].onState(estado('Costas'), 2); });
    expect(tela.getByTestId('grupo').props.children).toBe('Costas');

    // Agora o snapshot antigo resolve, trazendo o estado velho.
    await act(async () => {
      liberarAntigo(estado('Peito'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // A tela NÃO pode ter voltado no tempo.
    expect(tela.getByTestId('grupo').props.children).toBe('Costas');
  });

  // F22: rejeitar meia resposta é quase não rejeitar. Uma resposta atrasada não
  // pode mexer em erro, loading, parceiro nem convite — e o erro dela também
  // não pode vencer um sucesso mais recente.
  it('resposta ANTIGA não apaga o erro que chegou depois', async () => {
    let liberarAntigo: (v: any) => void = () => {};
    (repo.getJointSessionSnapshot as jest.Mock)
      .mockImplementationOnce(() => new Promise((r) => { liberarAntigo = r; }));

    const tela = render(<Sonda />);
    await waitFor(() => expect(canais.length).toBe(1));

    // Um erro NOVO chega enquanto o snapshot antigo ainda não voltou.
    (repo.getJointSessionSnapshot as jest.Mock)
      .mockRejectedValueOnce(new Error('falhou agora'));
    await act(async () => { await recarregarRef.fn!(); });
    await waitFor(() => expect(tela.getByTestId('erro').props.children).toBe('falhou agora'));

    // Agora o snapshot ANTIGO resolve com sucesso: não pode limpar o erro.
    await act(async () => {
      liberarAntigo(estado('Peito'));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(tela.getByTestId('erro').props.children).toBe('falhou agora');
  });

  it('ERRO antigo não apaga o sucesso que chegou depois', async () => {
    let falharAntigo: (e: any) => void = () => {};
    (repo.getJointSessionSnapshot as jest.Mock)
      .mockImplementationOnce(() => new Promise((_r, rej) => { falharAntigo = rej; }));

    const tela = render(<Sonda />);
    await waitFor(() => expect(canais.length).toBe(1));

    // Sucesso mais NOVO.
    (repo.getJointSessionSnapshot as jest.Mock).mockResolvedValueOnce(estado('Costas'));
    await act(async () => { await recarregarRef.fn!(); });
    await waitFor(() => expect(tela.getByTestId('grupo').props.children).toBe('Costas'));

    // O erro ATRASADO chega depois e deve ser descartado inteiro.
    await act(async () => {
      falharAntigo(new Error('erro velho'));
      await Promise.resolve(); await Promise.resolve();
    });
    expect(tela.getByTestId('erro').props.children).toBe('sem-erro');
    expect(tela.getByTestId('grupo').props.children).toBe('Costas');
  });

  it('resposta antiga não mexe em loading nem no parceiro', async () => {
    let liberarAntigo: (v: any) => void = () => {};
    (repo.getJointSessionSnapshot as jest.Mock)
      .mockImplementationOnce(() => new Promise((r) => { liberarAntigo = r; }));
    (repo.getJointPartnerProfile as jest.Mock).mockResolvedValue({
      userId: 'u-guest', displayName: 'ANTIGO', avatarUrl: null,
    });

    const tela = render(<Sonda />);
    await waitFor(() => expect(canais.length).toBe(1));

    (repo.getJointSessionSnapshot as jest.Mock).mockResolvedValueOnce(estado('Costas'));
    (repo.getJointPartnerProfile as jest.Mock).mockResolvedValue({
      userId: 'u-guest', displayName: 'NOVO', avatarUrl: null,
    });
    await act(async () => { await recarregarRef.fn!(); });
    await waitFor(() => expect(tela.getByTestId('parceiro').props.children).toBe('NOVO'));

    await act(async () => {
      liberarAntigo(estado('Peito'));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(tela.getByTestId('parceiro').props.children).toBe('NOVO');
    expect(tela.getByTestId('carregando').props.children).toBe('false');
  });

  it('snapshot mais NOVO continua sendo aplicado', async () => {
    (repo.getJointSessionSnapshot as jest.Mock).mockResolvedValue(estado('Peito'));
    const tela = render(<Sonda />);
    await waitFor(() => expect(tela.getByTestId('grupo').props.children).toBe('Peito'));

    // Um refetch POSTERIOR tira selo maior, então deve vencer. Quem refaz o
    // snapshot na reconexão é o módulo de realtime (mockado aqui); o refetch
    // próprio do hook é `recarregar`.
    (repo.getJointSessionSnapshot as jest.Mock).mockResolvedValue(estado('Ombro'));
    await act(async () => { await recarregarRef.fn!(); });
    await waitFor(() => expect(tela.getByTestId('grupo').props.children).toBe('Ombro'));
  });
});

// ============================================================
// F15 — Share com single-flight
// ============================================================
describe('F15 — Share não abre duas vezes', () => {
  const convite = {
    session: { id: 'js-1', status: 'inviting' },
    inviteCode: 'ABC234',
    inviteExpiresAt: new Date(T0 + 15 * 60_000).toISOString(),
  };
  const nav = () => ({ goBack: jest.fn(), navigate: jest.fn() });

  it('CONTROLE: o harness segura a Promise do Share', async () => {
    let liberar: (v: any) => void = () => {};
    const p = new Promise((r) => { liberar = r; });
    let resolvida = false;
    void p.then(() => { resolvida = true; });
    await Promise.resolve();
    expect(resolvida).toBe(false);
    liberar({ action: 'sharedAction' });
    await p;
    expect(resolvida).toBe(true);
  });

  it('dois toques com a Promise pendente abrem UMA folha', async () => {
    (repo.createJointSession as jest.Mock).mockResolvedValue(convite);
    let liberar: (v: any) => void = () => {};
    jest.spyOn(Share, 'share').mockReturnValue(new Promise((r) => { liberar = r; }) as any);

    const { getByTestId } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('compartilhar'));

    fireEvent.press(getByTestId('compartilhar'));
    fireEvent.press(getByTestId('compartilhar'));
    fireEvent.press(getByTestId('compartilhar'));
    expect(Share.share).toHaveBeenCalledTimes(1);

    await act(async () => { liberar({ action: Share.sharedAction }); });
  });

  it('durante o compartilhamento o botão fica desabilitado', async () => {
    (repo.createJointSession as jest.Mock).mockResolvedValue(convite);
    let liberar: (v: any) => void = () => {};
    jest.spyOn(Share, 'share').mockReturnValue(new Promise((r) => { liberar = r; }) as any);

    const { getByTestId } = render(<JointInviteScreen navigation={nav()} agora={() => T0} />);
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('compartilhar'));

    fireEvent.press(getByTestId('compartilhar'));
    await waitFor(() => expect(getByTestId('compartilhar').props.accessibilityState)
      .toMatchObject({ disabled: true }));

    await act(async () => { liberar({ action: Share.sharedAction }); });
    await waitFor(() => expect(getByTestId('compartilhar').props.accessibilityState)
      .toMatchObject({ disabled: false }));
  });

  it('dismiss libera o botão em silêncio; erro real libera com aviso', async () => {
    (repo.createJointSession as jest.Mock).mockResolvedValue(convite);
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction } as any);

    const { getByTestId, queryByTestId } = render(
      <JointInviteScreen navigation={nav()} agora={() => T0} />,
    );
    fireEvent.press(getByTestId('gerar-convite'));
    await waitFor(() => getByTestId('compartilhar'));
    fireEvent.press(getByTestId('compartilhar'));
    await waitFor(() => expect(getByTestId('compartilhar').props.accessibilityState)
      .toMatchObject({ disabled: false }));
    expect(queryByTestId('erro-convite')).toBeNull();

    (Share.share as jest.Mock).mockRejectedValue(new Error('sem app'));
    fireEvent.press(getByTestId('compartilhar'));
    await waitFor(() => expect(getByTestId('erro-convite')).toBeTruthy());
    expect(getByTestId('compartilhar').props.accessibilityState).toMatchObject({ disabled: false });
  });
});
