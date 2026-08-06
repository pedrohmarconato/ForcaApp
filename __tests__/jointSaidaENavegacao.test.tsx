// __tests__/jointSaidaENavegacao.test.tsx
// Treino Conjunto 2.0 — Sprint 02, rodada 3. Saída (F11) e histórico (F12).
//
// CADA BLOCO COMEÇA PELO CONTROLE NEGATIVO — o teste que falharia com o defeito
// descrito. É a correção do meu próprio viés: eu vinha escrevendo a asserção a
// partir do que queria provar, e não do que o código faz.
//
// F11: o header chamava `sair()` + `goBack()` SEM armar a liberação, então o
//      `beforeRemove` real interceptava e pedia confirmação e R13 de novo.
// F12: `SessionHistory` vive no ProgressStack; o lobby vive no HomeStack. Um
//      `navigate('SessionHistory')` dali é ação NÃO TRATADA.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const estadoFalso: any = {};
jest.mock('../src/hooks/useJointSession', () => ({
  __esModule: true, useJointSession: () => estadoFalso.hook,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { JointLobbyView } from '../src/screens/JointLobbyScreen';

const HOST = 'u-host';
const GUEST = 'u-guest';
const T0 = Date.parse('2026-08-01T10:00:00.000Z');

const parte = (userId: string, role: 'host' | 'guest', over: any = {}) => ({
  userId, role, plannedSessionId: 's-1', sessionLogId: null, ready: false,
  queueFinishedAt: null, completedAt: null, lastSeenAt: new Date(T0).toISOString(), ...over,
});

const hookBase = (over: any = {}) => ({
  state: {
    id: 'js-1', hostUserId: HOST, guestUserId: GUEST, mode: 'each_own',
    muscleGroup: 'Peito', status: 'lobby', pauseReason: null,
    currentTurnUserId: null, turnSeq: 0,
    participants: [parte(HOST, 'host'), parte(GUEST, 'guest')],
  },
  parceiro: { userId: GUEST, displayName: 'Ana', avatarUrl: null },
  convite: null, carregando: false, erro: null,
  conexao: 'conectado', presenca: 'presente', emCurso: null,
  recarregar: jest.fn(), escolherModo: jest.fn().mockResolvedValue(undefined),
  confirmarSessao: jest.fn().mockResolvedValue(undefined),
  materializarCopia: jest.fn().mockResolvedValue('c-1'),
  definirPronto: jest.fn().mockResolvedValue(undefined),
  rotacionarConvite: jest.fn().mockResolvedValue(undefined),
  sair: jest.fn().mockResolvedValue(true),
  ...over,
});

/**
 * Navegação que se comporta como a real: `goBack` dispara `beforeRemove` nos
 * ouvintes, e só remove a tela se ninguém chamar `preventDefault`.
 *
 * Sem isto, o teste da rodada 2 nunca emitia `beforeRemove` no `goBack` — e foi
 * exatamente por isso que a dupla confirmação passou despercebida.
 */
const navegacaoRealista = () => {
  const ouvintes: Record<string, ((e: any) => void)[]> = {};
  const nav: any = {
    saiu: 0,
    despachos: [] as any[],
    navigate: jest.fn(),
    addListener: (evento: string, cb: any) => {
      (ouvintes[evento] ??= []).push(cb);
      return () => {
        ouvintes[evento] = (ouvintes[evento] ?? []).filter((x) => x !== cb);
      };
    },
    dispatch: (action: any) => {
      nav.despachos.push(action);
      nav.saiu += 1;
    },
    goBack: () => {
      const action = { type: 'GO_BACK' };
      let impedido = false;
      const e = { data: { action }, preventDefault: () => { impedido = true; } };
      for (const cb of ouvintes.beforeRemove ?? []) cb(e);
      if (!impedido) nav.saiu += 1;
    },
  };
  return nav;
};

const abrir = (hook: any, meuUserId = HOST, nav = navegacaoRealista(), confirmar?: any) => {
  estadoFalso.hook = hook;
  const conf = confirmar ?? jest.fn((_t: string, _m: string, onSim: () => void) => onSim());
  const utils = render(
    <JointLobbyView
      navigation={nav}
      route={{ params: { jointSessionId: 'js-1' } }}
      meuUserId={meuUserId}
      minhasSessoes={[{ id: 's-1', title: 'Peito A', muscleGroups: ['Peito'], status: 'pending', jointSessionId: null }]}
      confirmar={conf}
      anunciar={jest.fn()}
      agora={() => T0}
    />,
  );
  return { ...utils, nav, confirmar: conf, hook };
};

// ============================================================
// F11 — uma máquina de saída só
// ============================================================
describe('F11 — saída pelo header não duplica confirmação nem R13', () => {
  it('CONTROLE: o goBack do header emite beforeRemove de verdade', () => {
    // Guarda do próprio harness: se este teste parar de valer, os demais
    // voltam a passar sem exercitar o interceptador.
    const nav = navegacaoRealista();
    const vistos: any[] = [];
    nav.addListener('beforeRemove', (e: any) => vistos.push(e));
    nav.goBack();
    expect(vistos).toHaveLength(1);
  });

  it('confirma UMA vez e chama R13 UMA vez', async () => {
    const hook = hookBase();
    const { getByLabelText, confirmar, nav } = abrir(hook);
    fireEvent.press(getByLabelText('Voltar'));
    await waitFor(() => expect(hook.sair).toHaveBeenCalledTimes(1));
    expect(confirmar).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(nav.saiu).toBeGreaterThan(0));
  });

  it('falha do R13 permanece: nenhuma saída e nenhuma segunda confirmação', async () => {
    const hook = hookBase({ sair: jest.fn().mockResolvedValue(false) });
    const { getByLabelText, confirmar, nav } = abrir(hook);
    fireEvent.press(getByLabelText('Voltar'));
    await waitFor(() => expect(hook.sair).toHaveBeenCalledTimes(1));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(nav.saiu).toBe(0);
  });

  it('cancelar a confirmação não chama R13 nem sai', () => {
    const hook = hookBase();
    const { getByLabelText, nav } = abrir(hook, HOST, navegacaoRealista(), () => {});
    fireEvent.press(getByLabelText('Voltar'));
    expect(hook.sair).not.toHaveBeenCalled();
    expect(nav.saiu).toBe(0);
  });
});

describe('F11 — terminal e not_found saem SEM R13', () => {
  it.each([
    ['cancelado', { state: { ...hookBase().state, status: 'canceled' } }],
    ['abandonado', { state: { ...hookBase().state, status: 'abandoned' } }],
    ['concluido', { state: { ...hookBase().state, status: 'completed' } }],
    ['nao_encontrado', { state: null }],
  ])('%s: voltar não pede confirmação nem encerra a dupla', (_nome, over) => {
    const hook = hookBase(over as any);
    const { getAllByLabelText, confirmar, nav } = abrir(hook);
    // A tela de erro tem o "Voltar" do header E o da ação; o primeiro é o header.
    fireEvent.press(getAllByLabelText('Voltar')[0]);
    expect(confirmar).not.toHaveBeenCalled();
    expect(hook.sair).not.toHaveBeenCalled();
    expect(nav.saiu).toBeGreaterThan(0);
  });
});

// ============================================================
// F12 — histórico é cross-stack
// ============================================================
describe('F12 — "Ver histórico" atravessa para a aba Progresso', () => {
  it('CONTROLE: navigate("SessionHistory") direto seria não tratado', () => {
    // SessionHistory pertence ao ProgressStack; o lobby vive no HomeStack.
    const nav = require('../src/navigation/MainNavigator');
    const fonte = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/navigation/MainNavigator.tsx'), 'utf8');
    // A rota NÃO está na HomeStack — é isso que torna o navigate simples inválido.
    const homeStack = fonte.slice(fonte.indexOf('HomeStackParamList'), fonte.indexOf('TrainingStackParamList'));
    expect(homeStack).not.toContain('SessionHistory');
    expect(nav).toBeTruthy();
  });

  it('navega aninhado: Progresso → SessionHistory', () => {
    const hook = hookBase({ state: { ...hookBase().state, status: 'completed' } });
    const { getByTestId, nav } = abrir(hook);
    fireEvent.press(getByTestId('acao-ver_historico'));
    expect(nav.navigate).toHaveBeenCalledWith('Progress', { screen: 'SessionHistory' });
  });
});

// ============================================================
// F13 · F14 · F19 — fluxo
// ============================================================
describe('F13 — trocar o grupo produz mudança E chama a RPC', () => {
  const incompativel = () => hookBase({
    state: { ...hookBase().state, mode: 'each_own', muscleGroup: 'Costas' },
  });

  it('CONTROLE: sem tocar em nada, o grupo dominante continua sendo o do servidor', () => {
    const { getByTestId } = abrir(incompativel());
    // A incompatibilidade existe justamente porque `state.muscleGroup` manda.
    expect(getByTestId('incompatibilidade')).toBeTruthy();
  });

  it('"Trocar o grupo" reabre o seletor sem nada marcado', () => {
    const { getByText, getByTestId } = abrir(incompativel());
    fireEvent.press(getByText('Trocar o grupo'));
    expect(getByTestId('grupo-escolha')).toBeTruthy();
    expect(getByTestId('grupo-Peito').props.accessibilityState)
      .toMatchObject({ selected: false });
  });

  it('a nova escolha chama R3 com each_own e o grupo novo', () => {
    const hook = incompativel();
    const { getByText, getByTestId } = abrir(hook);
    fireEvent.press(getByText('Trocar o grupo'));
    fireEvent.press(getByTestId('grupo-Peito'));
    expect(hook.escolherModo).toHaveBeenCalledWith('each_own', 'Peito');
  });

  it('"Trocar o modo" chama R3 com o outro modo', () => {
    const hook = incompativel();
    const { getByText } = abrir(hook);
    fireEvent.press(getByText('Trocar o modo'));
    expect(hook.escolherModo).toHaveBeenCalledWith('host_plan', null);
  });
});

describe('F14 — quem recebe a estrutura espera o dono', () => {
  const receptor = (fonteConfirmada: boolean) => hookBase({
    state: {
      ...hookBase().state,
      mode: 'host_plan',
      participants: [
        parte(HOST, 'host', { plannedSessionId: fonteConfirmada ? 'ps-fonte' : null }),
        parte(GUEST, 'guest', { plannedSessionId: null }),
      ],
    },
  });

  it('CONTROLE: sem a fonte, o receptor não tem picker nem botão de materializar', () => {
    const { queryByTestId } = abrir(receptor(false), GUEST);
    expect(queryByTestId('sessao-escolha')).toBeNull();
    expect(queryByTestId('materializar')).toBeNull();
  });

  it('a pendência diz para AGUARDAR, não "escolha o seu treino"', () => {
    const { getByTestId, queryAllByText } = abrir(receptor(false), GUEST);
    expect(getByTestId('pendencia')).toBeTruthy();
    // `queryByText` lança com múltiplas ocorrências — e o rótulo aparece no
    // aviso e na barra de prontidão, que é justamente o ponto: os dois falam a
    // mesma coisa.
    expect(queryAllByText('Escolha o seu treino')).toHaveLength(0);
    expect(queryAllByText('Aguarde Ana escolher o treino').length).toBeGreaterThan(0);
  });

  it('com a fonte confirmada, o botão de materializar aparece', () => {
    const { getByTestId } = abrir(receptor(true), GUEST);
    expect(getByTestId('materializar')).toBeTruthy();
  });
});

describe('F19 — erro do próprio plano é distinto de lista vazia', () => {
  const comErro = (erro: string | null, sessoes: any[]) => {
    // `host_plan` com o host como dono: o seletor da própria sessão é
    // renderizado sem passar pela incompatibilidade (que só existe em each_own).
    estadoFalso.hook = hookBase({
      state: { ...hookBase().state, mode: 'host_plan', muscleGroup: null },
    });
    const onRecarregarPlano = jest.fn();
    const utils = render(
      <JointLobbyView
        navigation={navegacaoRealista()}
        route={{ params: { jointSessionId: 'js-1' } }}
        meuUserId={HOST}
        minhasSessoes={sessoes}
        confirmar={jest.fn()}
        anunciar={jest.fn()}
        agora={() => T0}
        erroPlano={erro}
        onRecarregarPlano={onRecarregarPlano}
      />,
    );
    return { ...utils, onRecarregarPlano };
  };

  it('CONTROLE: lista vazia SEM erro mostra "nenhum treino elegível"', () => {
    const { queryByTestId, getByText } = comErro(null, []);
    expect(queryByTestId('erro-plano')).toBeNull();
    expect(getByText('Nenhum treino elegível')).toBeTruthy();
  });

  it('erro mostra falha e oferece tentar de novo', () => {
    const { getByTestId, queryByText, onRecarregarPlano } = comErro('sem conexão', []);
    expect(getByTestId('erro-plano')).toBeTruthy();
    expect(queryByText('Nenhum treino elegível')).toBeNull();
    fireEvent.press(getByTestId('recarregar-plano'));
    expect(onRecarregarPlano).toHaveBeenCalledTimes(1);
  });
});
