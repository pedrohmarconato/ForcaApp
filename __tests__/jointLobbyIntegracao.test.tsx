// __tests__/jointLobbyIntegracao.test.tsx
// Treino Conjunto 2.0 — Sprint 02. Tela REAL + hook REAL.
//
// Existe porque uma suíte inteira pode ficar verde com a tela ligada a callbacks
// diferentes dos testados: os testes de tela mockam o hook, e os de hook não
// montam a tela. Aqui só a fronteira (repositório e realtime) é mockada, e as
// asserções batem nos PARAMS das RPCs — o que o servidor realmente receberia.

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
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
  JointSessionRequestError: class extends Error { motivo = 'estado_invalido'; kind = 'server'; },
}));
jest.mock('../src/services/jointSessionRealtime', () => ({
  __esModule: true, subscribeToJointSession: jest.fn(),
}));

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import JointLobbyScreen from '../src/screens/JointLobbyScreen';
import * as repo from '../src/services/jointSessionRepository';
import { subscribeToJointSession } from '../src/services/jointSessionRealtime';

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');
const canais: any[] = [];
const servidor: any = { state: null };

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role, plannedSessionId: null, sessionLogId: null, ready: false,
  queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString(), ...over,
});

const estado = (over: any = {}) => ({
  id: 'js-1', hostUserId: HOST, guestUserId: GUEST, mode: null, muscleGroup: null,
  status: 'lobby', pauseReason: null, currentTurnUserId: null, turnSeq: 0,
  participants: [parte(HOST, 'host'), parte(GUEST, 'guest')], ...over,
});

const sessaoPropria = { id: 's-host', title: 'Peito A', muscleGroups: ['Peito'], status: 'pending', jointSessionId: null };

beforeEach(() => {
  canais.length = 0;
  servidor.state = estado();
  jest.clearAllMocks();
  (repo.getJointSessionSnapshot as jest.Mock).mockImplementation(async () => servidor.state);
  (repo.getJointPartnerProfile as jest.Mock).mockResolvedValue({ userId: GUEST, displayName: 'Ana', avatarUrl: null });
  (repo.getJointInviteForHost as jest.Mock).mockResolvedValue(null);
  (repo.setJointSessionMode as jest.Mock).mockImplementation(async () => {
    servidor.state = estado({ mode: 'each_own', muscleGroup: 'Peito' });
    return servidor.state;
  });
  (repo.confirmJointParticipantSession as jest.Mock).mockImplementation(async () => {
    servidor.state = estado({ mode: 'each_own', muscleGroup: 'Peito',
      participants: [parte(HOST, 'host', { plannedSessionId: 's-host' }), parte(GUEST, 'guest')] });
    return {};
  });
  (repo.setJointParticipantReady as jest.Mock).mockResolvedValue(servidor.state);
  (repo.abandonJointSession as jest.Mock).mockResolvedValue({ ...estado(), status: 'canceled' });
  (subscribeToJointSession as jest.Mock).mockImplementation((_id, userId, handlers) => {
    const c = { userId, handlers, unsub: 0 };
    canais.push(c);
    return { refresh: async () => {}, unsubscribe: () => { c.unsub += 1; } };
  });
});

const abrir = (meuUserId = HOST) => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const confirmar = jest.fn((_t: string, _m: string, onSim: () => void) => onSim());
  const utils = render(
    <JointLobbyScreen
      navigation={navigation as any}
      route={{ params: { jointSessionId: 'js-1' } }}
      meuUserId={meuUserId}
      minhasSessoes={[sessaoPropria]}
      confirmar={confirmar}
      anunciar={jest.fn()}
    />,
  );
  return { ...utils, navigation, confirmar };
};

describe('I1/I2 — a tela chama as RPCs com os params certos', () => {
  it('escolher modo envia jointSessionId e modo', async () => {
    const { getByTestId } = abrir(HOST);
    await waitFor(() => getByTestId('modo-escolha'));
    fireEvent.press(getByTestId('modo-each_own'));
    await waitFor(() => expect(repo.setJointSessionMode).toHaveBeenCalledWith(
      expect.objectContaining({ jointSessionId: 'js-1', mode: 'each_own' })));
  });

  it('confirmar sessão envia o plannedSessionId escolhido', async () => {
    servidor.state = estado({ mode: 'each_own', muscleGroup: 'Peito' });
    const { getByTestId } = abrir(HOST);
    await waitFor(() => getByTestId('sessao-escolha'));
    fireEvent.press(getByTestId('sessao-s-host'));
    await waitFor(() => expect(repo.confirmJointParticipantSession).toHaveBeenCalledWith(
      { jointSessionId: 'js-1', plannedSessionId: 's-host' }));
  });

  it('prontidão envia o valor alternado', async () => {
    servidor.state = estado({ mode: 'each_own', muscleGroup: 'Peito',
      participants: [parte(HOST, 'host', { plannedSessionId: 's-host' }), parte(GUEST, 'guest')] });
    const { getByLabelText } = abrir(HOST);
    await waitFor(() => getByLabelText('Estou pronto'));
    fireEvent.press(getByLabelText('Estou pronto'));
    await waitFor(() => expect(repo.setJointParticipantReady).toHaveBeenCalledWith(
      { jointSessionId: 'js-1', ready: true }));
  });
});

describe('D4 — in-flight não duplica', () => {
  it('dois toques na prontidão com a Promise pendente chamam UMA vez', async () => {
    servidor.state = estado({ mode: 'each_own', muscleGroup: 'Peito',
      participants: [parte(HOST, 'host', { plannedSessionId: 's-host' }), parte(GUEST, 'guest')] });
    let resolver: (v: any) => void = () => {};
    (repo.setJointParticipantReady as jest.Mock).mockReturnValue(
      new Promise((r) => { resolver = r; }));

    const { getByLabelText } = abrir(HOST);
    await waitFor(() => getByLabelText('Estou pronto'));
    fireEvent.press(getByLabelText('Estou pronto'));
    fireEvent.press(getByLabelText('Estou pronto'));
    expect(repo.setJointParticipantReady).toHaveBeenCalledTimes(1);
    await act(async () => { resolver(servidor.state); });
  });
});

describe('D5 — falha refaz o SNAPSHOT autoritativo', () => {
  it('o ready que o servidor não aceitou não fica na tela', async () => {
    servidor.state = estado({ mode: 'each_own', muscleGroup: 'Peito',
      participants: [parte(HOST, 'host', { plannedSessionId: 's-host' }), parte(GUEST, 'guest')] });
    (repo.setJointParticipantReady as jest.Mock).mockRejectedValue(
      new (repo as any).JointSessionRequestError('sessão do parceiro inelegível'));

    const { getByLabelText, getByTestId } = abrir(HOST);
    await waitFor(() => getByLabelText('Estou pronto'));
    const antes = (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length;

    fireEvent.press(getByLabelText('Estou pronto'));

    // Refetch autoritativo depois da falha — e não um "desfazer" local.
    await waitFor(() => expect(
      (repo.getJointSessionSnapshot as jest.Mock).mock.calls.length).toBeGreaterThan(antes));
    await waitFor(() => expect(getByTestId('erro-lobby')).toBeTruthy());
  });
});

describe('I3 — saída e desmontagem pelo caminho real', () => {
  it('B5: confirma, chama abandon uma vez e sai', async () => {
    const { getByLabelText, navigation } = abrir(HOST);
    await waitFor(() => getByLabelText('Voltar'));
    fireEvent.press(getByLabelText('Voltar'));
    await waitFor(() => expect(repo.abandonJointSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('B5b: desmontar NÃO chama abandon e encerra a assinatura uma vez', async () => {
    const { unmount } = abrir(HOST);
    await waitFor(() => expect(canais.length).toBe(1));
    unmount();
    expect(canais[0].unsub).toBe(1);
    expect(repo.abandonJointSession).not.toHaveBeenCalled();
  });
});

describe('B7 pelo caminho real', () => {
  it('snapshot nulo vira "não existe mais", com voltar', async () => {
    servidor.state = null;
    const { getByTestId } = abrir(HOST);
    await waitFor(() => expect(getByTestId('situacao-nao_encontrado')).toBeTruthy());
    expect(getByTestId('acao-voltar_home')).toBeTruthy();
  });
});
