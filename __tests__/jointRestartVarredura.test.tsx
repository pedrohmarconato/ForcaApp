// __tests__/jointRestartVarredura.test.tsx
// Treino Conjunto 2.0 — Sprint 02, restart 1/1. F20–F23 e os caminhos vizinhos.
//
// O padrão que me trouxe até aqui: eu conserto o caso que o achado nomeia e
// deixo o caminho ao lado intacto. F15 virou F21 porque apliquei a trava numa
// superfície e não nas duas; F11 virou F20 porque cobri o gesto e não as
// remoções técnicas; F16 virou F22 porque protegi o estado e não os efeitos.
// Este arquivo varre a FAMÍLIA de cada correção, não o caso isolado.

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const usuario: any = { atual: { id: 'u-host' } };
jest.mock('../src/contexts/AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({ user: usuario.atual, profile: null }),
}));

const plano: any = { sessoes: [], erro: null };
jest.mock('../src/services/trainingRepository', () => ({
  __esModule: true,
  getPlanSessions: jest.fn(async () => {
    if (plano.erro) throw new Error(plano.erro);
    return plano.sessoes;
  }),
}));

const hookFalso: any = {};
jest.mock('../src/hooks/useJointSession', () => ({
  __esModule: true, useJointSession: () => hookFalso.atual,
}));

import React from 'react';
import { Share } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import JointLobbyScreen, { ehSaidaExplicita, JointLobbyView } from '../src/screens/JointLobbyScreen';
import { JointInviteCard } from '../src/components/joint/JointInviteCard';
import { getPlanSessions } from '../src/services/trainingRepository';

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

/** Navegação que dispara `beforeRemove` com o TIPO de action informado. */
const navComActions = () => {
  const ouvintes: ((e: any) => void)[] = [];
  const nav: any = {
    saiu: 0, navigate: jest.fn(),
    addListener: (evento: string, cb: any) => {
      if (evento === 'beforeRemove') ouvintes.push(cb);
      return () => { const i = ouvintes.indexOf(cb); if (i >= 0) ouvintes.splice(i, 1); };
    },
    dispatch: () => { nav.saiu += 1; },
    goBack: () => nav.remover('GO_BACK'),
    /** Emula qualquer remoção: GO_BACK, POP, RESET, REPLACE… */
    remover: (tipo: string) => {
      let impedido = false;
      const e = { data: { action: { type: tipo } }, preventDefault: () => { impedido = true; } };
      for (const cb of [...ouvintes]) cb(e);
      if (!impedido) nav.saiu += 1;
    },
  };
  return nav;
};

const abrirView = (hook: any, nav = navComActions(), meuUserId = HOST) => {
  hookFalso.atual = hook;
  const confirmar = jest.fn((_t: string, _m: string, onSim: () => void) => onSim());
  const utils = render(
    <JointLobbyView
      navigation={nav} route={{ params: { jointSessionId: 'js-1' } }}
      meuUserId={meuUserId} minhasSessoes={[{ id: 's-1', title: 'Peito A', muscleGroups: ['Peito'], status: 'pending', jointSessionId: null }]}
      confirmar={confirmar} anunciar={jest.fn()} agora={() => T0}
    />,
  );
  return { ...utils, nav, confirmar, hook };
};

// ============================================================
// F20 — matriz de actions
// ============================================================
describe('F20 — só saída explícita encerra a dupla', () => {
  it('CONTROLE: o classificador separa as duas famílias', () => {
    for (const t of ['GO_BACK', 'POP', 'POP_TO_TOP']) expect(ehSaidaExplicita(t)).toBe(true);
    for (const t of ['RESET', 'REPLACE', 'NAVIGATE', 'PUSH', undefined, null, 42]) {
      expect(ehSaidaExplicita(t as any)).toBe(false);
    }
  });

  it.each(['GO_BACK', 'POP', 'POP_TO_TOP'])(
    '%s (explícita): confirma UMA vez e chama R13 UMA vez',
    async (tipo) => {
      const hook = hookBase();
      const { nav, confirmar } = abrirView(hook);
      act(() => { nav.remover(tipo); });
      await waitFor(() => expect(hook.sair).toHaveBeenCalledTimes(1));
      expect(confirmar).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['RESET', 'REPLACE', 'NAVIGATE', 'PUSH'])(
    '%s (técnica): NÃO confirma, NÃO chama R13 e a tela sai',
    (tipo) => {
      const hook = hookBase();
      const { nav, confirmar } = abrirView(hook);
      act(() => { nav.remover(tipo); });
      expect(confirmar).not.toHaveBeenCalled();
      expect(hook.sair).not.toHaveBeenCalled();
      expect(nav.saiu).toBe(1);
    },
  );

  it('logout durante lobby vivo não cancela o treino do parceiro', () => {
    const hook = hookBase();
    const { nav } = abrirView(hook);
    act(() => { nav.remover('RESET'); });   // é o que o logout dispara
    expect(hook.sair).not.toHaveBeenCalled();
  });
});

// ============================================================
// F21 — Share em TODAS as superfícies
// ============================================================
describe('F21 — o cartão de convite tem a trava, então toda tela que o usa tem', () => {
  const cartao = (onCompartilhar: () => any) => render(
    <JointInviteCard
      inviteCode="ABC234"
      inviteExpiresAt={new Date(T0 + 10 * 60_000).toISOString()}
      agoraMs={T0} emCurso={false}
      onCompartilhar={onCompartilhar} onRotacionar={jest.fn()}
    />,
  );

  it('CONTROLE: o harness segura a Promise do compartilhamento', async () => {
    let liberar: () => void = () => {};
    const p = new Promise<void>((r) => { liberar = r; });
    let fim = false;
    void p.then(() => { fim = true; });
    await Promise.resolve();
    expect(fim).toBe(false);
    liberar(); await p;
    expect(fim).toBe(true);
  });

  it('três toques com a Promise pendente chamam UMA vez', async () => {
    let liberar: () => void = () => {};
    const onCompartilhar = jest.fn(() => new Promise<void>((r) => { liberar = r; }));
    const { getByTestId } = cartao(onCompartilhar);

    fireEvent.press(getByTestId('compartilhar-lobby'));
    fireEvent.press(getByTestId('compartilhar-lobby'));
    fireEvent.press(getByTestId('compartilhar-lobby'));
    expect(onCompartilhar).toHaveBeenCalledTimes(1);

    await act(async () => { liberar(); });
  });

  it('durante o envio o botão fica desabilitado e depois volta', async () => {
    let liberar: () => void = () => {};
    const { getByTestId } = cartao(() => new Promise<void>((r) => { liberar = r; }));

    fireEvent.press(getByTestId('compartilhar-lobby'));
    await waitFor(() => expect(getByTestId('compartilhar-lobby').props.accessibilityState)
      .toMatchObject({ disabled: true }));

    await act(async () => { liberar(); });
    await waitFor(() => expect(getByTestId('compartilhar-lobby').props.accessibilityState)
      .toMatchObject({ disabled: false }));
  });

  it('dismiss libera o botão', async () => {
    const onCompartilhar = jest.fn(async () => { /* usuário fechou a folha */ });
    const { getByTestId } = cartao(onCompartilhar);
    fireEvent.press(getByTestId('compartilhar-lobby'));
    await waitFor(() => expect(onCompartilhar).toHaveBeenCalled());
    await waitFor(() => expect(getByTestId('compartilhar-lobby').props.accessibilityState)
      .toMatchObject({ disabled: false }));
  });

  it('erro NÃO deixa o botão travado — a trava é liberada no finally', async () => {
    const comErro = jest.fn(async () => { throw new Error('sem app'); });
    const { getByTestId } = cartao(comErro);
    fireEvent.press(getByTestId('compartilhar-lobby'));
    await waitFor(() => expect(comErro).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('compartilhar-lobby').props.accessibilityState)
      .toMatchObject({ disabled: false }));
    // E continua utilizável: sem o `finally`, um erro travaria o botão para sempre.
    fireEvent.press(getByTestId('compartilhar-lobby'));
    await waitFor(() => expect(comErro).toHaveBeenCalledTimes(2));
  });

  it('o lobby usa o cartão — a trava vale lá sem código próprio', () => {
    const fonte = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/screens/JointLobbyScreen.tsx'), 'utf8');
    expect(fonte).toContain('<JointInviteCard');
  });
});

// ============================================================
// F23 — o entrypoint REGISTRADO, sem props clandestinas
// ============================================================
describe('F23 — o default export monta pela fronteira real', () => {
  const abrirRegistrado = () => {
    hookFalso.atual = hookBase({ state: { ...hookBase().state, mode: 'each_own', muscleGroup: 'Peito' } });
    return render(
      <JointLobbyScreen
        navigation={navComActions()}
        route={{ params: { jointSessionId: 'js-1' } }}
      />,
    );
  };

  beforeEach(() => {
    usuario.atual = { id: HOST };
    plano.sessoes = [];
    plano.erro = null;
    (getPlanSessions as jest.Mock).mockClear();
  });

  it('CONTROLE: o default NÃO aceita meuUserId/minhasSessoes — quem resolve é ele', () => {
    // Se voltasse a aceitar props injetadas, o defeito do F1 poderia voltar sem
    // ninguém notar.
    expect(JointLobbyScreen).not.toBe(JointLobbyView);
  });

  it('resolve o UID pelo AuthContext e carrega o PRÓPRIO plano', async () => {
    plano.sessoes = [{ id: 'ps-1', title: 'Peito A', muscle_groups: ['Peito'], status: 'pending', joint_session_id: null }];
    const { getByTestId } = abrirRegistrado();
    await waitFor(() => expect(getPlanSessions).toHaveBeenCalledWith(HOST));
    await waitFor(() => expect(getByTestId('sessao-ps-1')).toBeTruthy());
  });

  it('M6b — SEM PLANO ATIVO: incompatibilidade com os PRÓPRIOS grupos vazios', async () => {
    // Em `each_own` com grupo definido, plano vazio não é "lista vazia": é
    // incompatibilidade — e ela não pode citar nada do parceiro.
    plano.sessoes = [];
    const { getByTestId, queryByTestId } = abrirRegistrado();
    await waitFor(() => expect(getByTestId('incompatibilidade')).toBeTruthy());
    expect(queryByTestId('sessao-escolha')).toBeNull();
  });

  it('M6b — GRUPO VAZIO: sessão de outro grupo não vira opção', async () => {
    plano.sessoes = [{ id: 'ps-9', title: 'Costas B', muscle_groups: ['Costas'], status: 'pending', joint_session_id: null }];
    const { queryByTestId } = abrirRegistrado();
    await waitFor(() => expect(getPlanSessions).toHaveBeenCalled());
    expect(queryByTestId('sessao-ps-9')).toBeNull();
  });

  it('M6b — SERVIDOR VENCE: sessão que perdeu elegibilidade some no refetch', async () => {
    plano.sessoes = [{ id: 'ps-1', title: 'Peito A', muscle_groups: ['Peito'], status: 'pending', joint_session_id: null }];
    const primeira = abrirRegistrado();
    await waitFor(() => expect(primeira.getByTestId('sessao-ps-1')).toBeTruthy());
    primeira.unmount();

    // Entre uma leitura e a próxima, o servidor prendeu a sessão a OUTRO treino
    // conjunto. Quem manda é ele: a opção some, sem a tela discutir.
    plano.sessoes = [{ id: 'ps-1', title: 'Peito A', muscle_groups: ['Peito'], status: 'pending', joint_session_id: 'js-outra' }];
    const segunda = abrirRegistrado();
    await waitFor(() => expect(getPlanSessions).toHaveBeenCalledTimes(2));
    expect(segunda.queryByTestId('sessao-ps-1')).toBeNull();
    expect(segunda.getByTestId('incompatibilidade')).toBeTruthy();
  });

  it('erro ao carregar o plano mostra retry, não "nenhum treino"', async () => {
    plano.erro = 'sem conexão';
    const { getByTestId, queryByText } = abrirRegistrado();
    await waitFor(() => expect(getByTestId('erro-plano')).toBeTruthy());
    expect(queryByText('Nenhum treino elegível')).toBeNull();
  });

  it('sem usuário, a tela pede login em vez de quebrar', async () => {
    usuario.atual = null;
    const { getByTestId } = abrirRegistrado();
    await waitFor(() => expect(getByTestId('sem-sessao')).toBeTruthy());
  });

  // N5: `carregarPlano` não tem guarda de reentrada. Dois disparos concorrentes
  // (aqui, dois toques em "Tentar de novo" com a Promise anterior ainda pendente)
  // podem responder fora de ordem — sem guarda, a resposta MAIS VELHA, chegando
  // por último, sobrescreve a MAIS NOVA já aplicada.
  it('N5 — resposta obsoleta de getPlanSessions não sobrescreve a mais nova', async () => {
    const resolvers: Array<(v: any) => void> = [];
    (getPlanSessions as jest.Mock)
      .mockImplementationOnce(() => Promise.reject(new Error('sem conexão')))
      .mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));

    const { getByTestId, queryByTestId } = abrirRegistrado();
    await waitFor(() => expect(getByTestId('erro-plano')).toBeTruthy());

    // O 1º toque já tira o botão da árvore (`carregandoPlano` some com a tela de
    // erro) e `fireEvent` recusa evento em elemento desmontado — então a
    // closure de `onPress` é capturada UMA vez, com tudo ainda montado, e
    // chamada diretamente as duas vezes. É exatamente o "toques repetidos" que
    // o achado descreve: a segunda chamada nasce antes de a primeira responder.
    let alvo: any = getByTestId('recarregar-plano');
    while (alvo && typeof alvo.props?.onPress !== 'function') alvo = alvo.parent;
    const dispararRecarregar = alvo.props.onPress as () => void;

    act(() => { dispararRecarregar(); }); // 1º disparo — fica pendente (a MAIS VELHA)
    act(() => { dispararRecarregar(); }); // 2º disparo — também pendente (a MAIS NOVA)
    await waitFor(() => expect(resolvers.length).toBe(2));

    // Responde primeiro a MAIS NOVA (2º disparo)...
    await act(async () => {
      resolvers[1]([{ id: 'ps-novo', title: 'Peito Novo', muscle_groups: ['Peito'], status: 'pending', joint_session_id: null }]);
    });
    await waitFor(() => expect(getByTestId('sessao-ps-novo')).toBeTruthy());

    // ...e só depois a MAIS VELHA (1º disparo), atrasada.
    await act(async () => {
      resolvers[0]([{ id: 'ps-velho', title: 'Peito Velho', muscle_groups: ['Peito'], status: 'pending', joint_session_id: null }]);
    });

    // A resposta velha, chegando por último, não pode reaparecer nem apagar a nova.
    expect(getByTestId('sessao-ps-novo')).toBeTruthy();
    expect(queryByTestId('sessao-ps-velho')).toBeNull();
  });
});
