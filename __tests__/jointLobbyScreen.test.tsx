// __tests__/jointLobbyScreen.test.tsx
// Treino Conjunto 2.0 — Sprint 02. O lobby.
//
// Modos de falha cobertos:
//  1. o convidado receber um controle que a RPC recusa;
//  2. a incompatibilidade citar o que o parceiro tem — dado que ninguém vê;
//  3. sair por gesto/back CANCELANDO o treino sem confirmação;
//  4. a tela oferecer "tentar de novo" onde tentar de novo nunca funciona;
//  5. navegar para um player que ainda não existe.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));
jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const estadoFalso: any = { atual: null, erro: null };
jest.mock('../src/hooks/useJointSession', () => ({
  __esModule: true,
  useJointSession: () => estadoFalso.hook,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { JointLobbyView } from '../src/screens/JointLobbyScreen';
import type { SessaoElegivel } from '../src/engine/jointLobbyModel';

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role, plannedSessionId: null, sessionLogId: null, ready: false,
  queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString(), ...over,
});

const sessao = (over: Partial<SessaoElegivel> = {}): SessaoElegivel => ({
  id: 's-1', title: 'Peito A', muscleGroups: ['Peito'], status: 'pending',
  jointSessionId: null, ...over,
});

const montarHook = (over: any = {}) => ({
  state: {
    id: 'js-1', hostUserId: HOST, guestUserId: GUEST, mode: null, muscleGroup: null,
    status: 'lobby', pauseReason: null, currentTurnUserId: null, turnSeq: 0,
    participants: [parte(HOST, 'host'), parte(GUEST, 'guest')],
  },
  parceiro: { userId: GUEST, displayName: 'Ana', avatarUrl: null },
  convite: null, carregando: false, erro: null,
  conexao: 'conectado', presenca: 'presente', emCurso: null,
  recarregar: jest.fn(), escolherModo: jest.fn().mockResolvedValue(undefined),
  confirmarSessao: jest.fn().mockResolvedValue(undefined),
  materializarCopia: jest.fn().mockResolvedValue('copia-1'),
  definirPronto: jest.fn().mockResolvedValue(undefined),
  sair: jest.fn().mockResolvedValue(true),
  ...over,
});

const renderizar = (hook: any, meuUserId = HOST, minhasSessoes: SessaoElegivel[] = [sessao()]) => {
  estadoFalso.hook = hook;
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const confirmar = jest.fn((_t: string, _m: string, onSim: () => void) => onSim());
  const anunciar = jest.fn();
  const utils = render(
    <JointLobbyView
      navigation={navigation as any}
      route={{ params: { jointSessionId: 'js-1' } }}
      meuUserId={meuUserId}
      minhasSessoes={minhasSessoes}
      confirmar={confirmar}
      anunciar={anunciar}
    />,
  );
  return { ...utils, navigation, confirmar, anunciar, hook };
};

describe('identidade e sinais separados', () => {
  it('mostra o parceiro e distingue conexão de presença', () => {
    const { getByText } = renderizar(montarHook({ conexao: 'reconectando', presenca: 'ausente' }));
    expect(getByText('Ana')).toBeTruthy();
    expect(getByText('Reconectando')).toBeTruthy();      // conexão LOCAL
    expect(getByText('Sem sinal do parceiro')).toBeTruthy(); // presença do OUTRO
  });
});

describe('modo — só o anfitrião escolhe', () => {
  it('host vê os três modos como escolha', () => {
    const { getByTestId } = renderizar(montarHook(), HOST);
    expect(getByTestId('modo-escolha')).toBeTruthy();
    expect(getByTestId('modo-host_plan')).toBeTruthy();
  });

  it('convidado vê leitura, sem controle', () => {
    const { getByTestId, queryByTestId } = renderizar(montarHook(), GUEST);
    expect(getByTestId('modo-leitura')).toBeTruthy();
    expect(queryByTestId('modo-escolha')).toBeNull();
  });

  it('modo sem grupo (host_plan) vai direto', () => {
    const hook = montarHook();
    const { getByTestId } = renderizar(hook, HOST);
    fireEvent.press(getByTestId('modo-host_plan'));
    expect(hook.escolherModo).toHaveBeenCalledWith('host_plan', null);
  });

  // F2: `each_own` com grupo nulo é recusado pela RPC (22023). Tocar no modo só
  // ARMA a etapa do grupo; a chamada sai com os dois valores juntos.
  it('each_own NÃO chama a RPC antes de existir grupo', () => {
    const hook = montarHook();
    const { getByTestId } = renderizar(hook, HOST);
    fireEvent.press(getByTestId('modo-each_own'));
    expect(hook.escolherModo).not.toHaveBeenCalled();
    // E o seletor de grupo aparece imediatamente, sem depender do snapshot.
    expect(getByTestId('grupo-escolha')).toBeTruthy();
  });

  it('escolher o grupo envia modo E grupo juntos', () => {
    const hook = montarHook();
    const { getByTestId } = renderizar(hook, HOST, [sessao({ muscleGroups: ['Peito'] })]);
    fireEvent.press(getByTestId('modo-each_own'));
    fireEvent.press(getByTestId('grupo-Peito'));
    expect(hook.escolherModo).toHaveBeenCalledTimes(1);
    expect(hook.escolherModo).toHaveBeenCalledWith('each_own', 'Peito');
  });
});

describe('incompatibilidade — a saída depende do papel', () => {
  const comGrupo = (over: any = {}) => montarHook({
    state: { ...montarHook().state, mode: 'each_own', muscleGroup: 'Costas', ...over },
  });

  it('convidado recebe orientação, NÃO controle', () => {
    const { getByTestId, queryByText, getByText } = renderizar(
      comGrupo(), GUEST, [sessao({ muscleGroups: ['Peito'] })],
    );
    expect(getByTestId('incompatibilidade')).toBeTruthy();
    expect(getByText(/Peça para quem convidou/)).toBeTruthy();
    expect(queryByText('Trocar o grupo')).toBeNull();
  });

  it('host recebe controles reais', () => {
    const { getByText } = renderizar(comGrupo(), HOST, [sessao({ muscleGroups: ['Peito'] })]);
    expect(getByText('Trocar o grupo')).toBeTruthy();
    expect(getByText('Trocar o modo')).toBeTruthy();
  });

  it('mostra OS MEUS grupos e nunca os do parceiro', () => {
    const { getByText, queryByText } = renderizar(
      comGrupo(), GUEST, [sessao({ muscleGroups: ['Peito'] })],
    );
    expect(getByText(/Peito/)).toBeTruthy();
    expect(queryByText(/parceiro tem|grupos do parceiro/i)).toBeNull();
  });
});

describe('saída — bilateral, confirmada e transacional', () => {
  it('a confirmação diz que encerra para os DOIS', () => {
    const hook = montarHook();
    const { getByLabelText, confirmar } = renderizar(hook, HOST);
    fireEvent.press(getByLabelText('Voltar'));
    expect(confirmar).toHaveBeenCalled();
    expect(confirmar.mock.calls[0][1]).toMatch(/para você e para o seu parceiro/i);
  });

  it('cancelar a confirmação NÃO chama abandon e permanece', () => {
    const hook = montarHook();
    estadoFalso.hook = hook;
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { getByLabelText } = render(
      <JointLobbyView
        navigation={navigation as any}
        route={{ params: { jointSessionId: 'js-1' } }}
        meuUserId={HOST}
        minhasSessoes={[sessao()]}
        confirmar={() => { /* usuário desistiu */ }}
        anunciar={jest.fn()}
      />,
    );
    fireEvent.press(getByLabelText('Voltar'));
    expect(hook.sair).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('confirmar chama abandon UMA vez e só sai após sucesso', async () => {
    const hook = montarHook();
    const { getByLabelText, navigation } = renderizar(hook, HOST);
    fireEvent.press(getByLabelText('Voltar'));
    await waitFor(() => expect(hook.sair).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  });

  it('falha do abandon PERMANECE no lobby', async () => {
    const hook = montarHook({ sair: jest.fn().mockResolvedValue(false) });
    const { getByLabelText, navigation } = renderizar(hook, HOST);
    fireEvent.press(getByLabelText('Voltar'));
    await waitFor(() => expect(hook.sair).toHaveBeenCalled());
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('tabela de estados — nenhuma ação incompatível', () => {
  it.each([
    ['nao_encontrado', { state: null }, 'acao-voltar_home'],
    ['cancelado', { state: { ...montarHook().state, status: 'canceled' } }, 'acao-criar_ou_entrar'],
    ['abandonado', { state: { ...montarHook().state, status: 'abandoned' } }, 'acao-criar_ou_entrar'],
    ['concluido', { state: { ...montarHook().state, status: 'completed' } }, 'acao-ver_historico'],
  ])('%s oferece %s', (_nome, over, testId) => {
    const { getByTestId } = renderizar(montarHook(over as any), HOST);
    expect(getByTestId(testId as string)).toBeTruthy();
  });

  it('sem conexão oferece tentar de novo, e ele RECARREGA', () => {
    const hook = montarHook({ state: null, erro: { motivo: 'desconhecido', kind: 'transport', mensagem: 'off' } });
    const { getByTestId } = renderizar(hook, HOST);
    fireEvent.press(getByTestId('acao-tentar_de_novo'));
    expect(hook.recarregar).toHaveBeenCalled();
  });

  it('"não é seu" NÃO oferece tentar de novo', () => {
    const hook = montarHook({ state: null, erro: { motivo: 'nao_autorizado', kind: 'server', mensagem: 'x' } });
    const { queryByTestId, getByTestId } = renderizar(hook, HOST);
    expect(getByTestId('situacao-nao_e_seu')).toBeTruthy();
    expect(queryByTestId('acao-tentar_de_novo')).toBeNull();
  });
});

describe('handoff do Sprint 03', () => {
  it('em active mostra "treino iniciado" e NÃO navega para o player', () => {
    const hook = montarHook({ state: { ...montarHook().state, status: 'active' } });
    const { getByTestId, navigation } = renderizar(hook, HOST);
    expect(getByTestId('handoff-active')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('erro é anunciado, não só desenhado', () => {
  it('chama o anunciador de acessibilidade', async () => {
    const hook = montarHook({ erro: { motivo: 'estado_invalido', kind: 'server', mensagem: 'falhou' } });
    const { anunciar } = renderizar(hook, HOST);
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith('falhou'));
  });
});
