// __tests__/jointTrainingGate.test.tsx
// Achado P1 (review 2026-08-06): isJointTrainingEnabled() só tinha UM chamador
// (HomeScreen.tsx) — ele afastava o card da Home, mas a ROTA continuava
// registrada sem condição nenhuma em MainNavigator.tsx (JointInvite/JointJoin)
// e mapeada sem checagem em linkingConfig.ts (treino-conjunto/novo,
// treino-conjunto/:code). Com a flag OFF em produção, um convidado que abre o
// deep link cai direto no fluxo joint sem a migration 0026 aplicada.
//
// Decisão do dono: rota bloqueada mostra TELA DE AVISO (não redirect
// silencioso). O guard vive no REGISTRO da tela no MainNavigator — cobre
// navegação interna e deep link, porque os dois caem no mesmo Screen.
//
// CONTROLE primeiro: prova que hoje, sem o guard, a tela real monta mesmo com
// a flag OFF — é exatamente o achado. Continua valendo DEPOIS do fix também,
// porque a tela em si nunca teve — e não precisa ter — checagem própria: o
// guard é externo, na camada de registro.

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../src/services/jointSessionRepository', () => ({
  __esModule: true,
  createJointSession: jest.fn(),
  joinJointSession: jest.fn(),
}));

// Achado F2 (review 2026-08-06, BAIXA): as duas suítes acima provam o guard
// (render direto) e a AMARRAÇÃO no MainNavigator (regex sobre o texto-fonte,
// linhas ~60-69 daquela época). Regex só prova que a STRING está lá — um
// refactor que mude a COMPOSIÇÃO sem mudar a string (ex.: um registro duplicado
// e desprotegido de "JointInvite" somado ao registro correto) deixaria o texto
// batendo com o regex e o deep link fora do guard mesmo assim. Por isso as
// telas HomeScreen/WorkoutDetail/ActiveSession/SessionHistory(Detail)/
// JointLobby/Questionnaire/PostQuestionnaireChat/TrainingSession/Progress/
// Profile — irrelevantes para JointInvite/JointJoin — são mockadas aqui: o
// MainNavigator importado abaixo é o módulo de produção de verdade, não uma
// cópia, e só JointInviteScreen/JointJoinScreen permanecem reais.
jest.mock('../src/screens/HomeScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/WorkoutDetailScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/ActiveSessionScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/SessionHistoryScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/SessionHistoryDetailScreen', () => ({ __esModule: true, default: () => null }));
// JointLobby precisa de um marcador RENDERIZADO (não `default: () => null`
// como os demais irmãos irrelevantes acima): os testes do describe "JointLobby
// entra no gate como as demais rotas joint" (achado N4, mais abaixo) precisam
// provar que o gate MONTA a tela embrulhada quando a flag está ON — com
// `() => null` o queryByTestId do aviso dá null tanto se o gate deixou passar
// quanto se travou tudo, e o teste fica verde à toa. Tudo `require`ado dentro
// da factory porque jest.mock é hoisted para cima dos imports do arquivo.
jest.mock('../src/screens/JointLobbyScreen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'joint-lobby-stub' }),
  };
});
jest.mock('../src/screens/QuestionnaireScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/PostQuestionnaireChat', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/TrainingSessionScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/ProgressScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/screens/ProfileScreen', () => ({ __esModule: true, default: () => null }));

// `@react-navigation/stack` monta o pan gesture da transição sobre
// react-native-gesture-handler — precisa do mock oficial do pacote ANTES de
// qualquer import que puxe a árvore de navegação real, senão o módulo nativo
// (RNGestureHandlerModule.install) explode fora de app nativo. Import de
// efeito colateral, primeiro da lista, para entrar na mesma leva de imports
// hoisted acima dos demais.
import 'react-native-gesture-handler/jestSetup';

import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { NavigationContainer, getStateFromPath } from '@react-navigation/native';
import JointInviteScreen from '../src/screens/JointInviteScreen';
import JointJoinScreen from '../src/screens/JointJoinScreen';
import MainNavigator from '../src/navigation/MainNavigator';
import { LINKING_CONFIG } from '../src/navigation/linkingConfig';
import { __setJointTrainingEnvReader } from '../src/config/featureFlags';

const ler = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const nav = () => ({ goBack: jest.fn(), navigate: jest.fn() });

beforeEach(() => {
  __setJointTrainingEnvReader(() => undefined);
});

describe('CONTROLE — a tela em si não se protege (o guard tem que estar no registro)', () => {
  it('JointInviteScreen renderizado direto monta o fluxo real mesmo com a flag OFF', () => {
    __setJointTrainingEnvReader(() => 'false');
    const { getByTestId } = render(<JointInviteScreen navigation={nav()} />);
    expect(getByTestId('gerar-convite')).toBeTruthy();
  });

  it('JointJoinScreen renderizado direto monta o fluxo real mesmo com a flag OFF', () => {
    __setJointTrainingEnvReader(() => 'false');
    const { getByTestId } = render(<JointJoinScreen navigation={nav()} />);
    expect(getByTestId('campo-codigo')).toBeTruthy();
  });
});

describe('MainNavigator registra as duas rotas através do guard central (achado P1)', () => {
  const src = ler('src/navigation/MainNavigator.tsx');

  it('JointInvite é registrado através de withJointTrainingGate', () => {
    expect(src).toMatch(/name="JointInvite"\s+component=\{withJointTrainingGate\(JointInviteScreen\)/);
  });

  it('JointJoin é registrado através de withJointTrainingGate', () => {
    expect(src).toMatch(/name="JointJoin"\s+component=\{withJointTrainingGate\(JointJoinScreen\)/);
  });

  // Achado N4 (painel, 3 ângulos): JointInvite e JointJoin passam pelo guard,
  // mas JointLobby era registrada crua (`component={JointLobbyScreen}`). Hoje
  // não é explorável (sem path em linkingConfig.ts; só se chega via navigate()
  // depois de create/join, que já vivem atrás do gate) — mas qualquer
  // navegação futura direta bypassa a flag e quebra com erro cru de tabela
  // inexistente (prod 0022, migration 0026 ainda não aplicada).
  it('JointLobby é registrado através de withJointTrainingGate', () => {
    expect(src).toMatch(/name="JointLobby"\s+component=\{withJointTrainingGate\(JointLobbyScreen\)/);
  });
});

describe('withJointTrainingGate — flag OFF mostra o aviso; o fluxo real NÃO monta', () => {
  it('JointInvite gateado: com a flag OFF, "gerar-convite" não monta e o aviso aparece', () => {
    __setJointTrainingEnvReader(() => 'false');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointInviteScreen);
    const { queryByTestId, getByTestId } = render(<Gated navigation={nav()} />);

    expect(queryByTestId('gerar-convite')).toBeNull();
    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
  });

  it('JointJoin gateado: com a flag OFF, "campo-codigo" não monta e o aviso aparece', () => {
    __setJointTrainingEnvReader(() => 'false');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointJoinScreen);
    const { queryByTestId, getByTestId } = render(<Gated navigation={nav()} />);

    expect(queryByTestId('campo-codigo')).toBeNull();
    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
  });

  it('o botão "Voltar à Home" do aviso navega para HomeMain, sem redirect silencioso', () => {
    __setJointTrainingEnvReader(() => 'false');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointInviteScreen);
    const n = nav();
    const { getByTestId } = render(<Gated navigation={n} />);

    fireEvent.press(getByTestId('voltar-home'));
    expect(n.navigate).toHaveBeenCalledWith('HomeMain');
  });
});

describe('withJointTrainingGate — flag ON abre o fluxo normal (não regressão)', () => {
  it('JointInvite gateado: com a flag ON, o fluxo real monta e o aviso não aparece', async () => {
    __setJointTrainingEnvReader(() => 'true');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointInviteScreen);
    const { getByTestId, queryByTestId } = render(<Gated navigation={nav()} />);

    await waitFor(() => expect(getByTestId('gerar-convite')).toBeTruthy());
    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
  });

  it('JointJoin gateado: com a flag ON, o fluxo real monta e o aviso não aparece', async () => {
    __setJointTrainingEnvReader(() => 'true');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withJointTrainingGate } = require('../src/navigation/JointTrainingGate');
    const Gated = withJointTrainingGate(JointJoinScreen);
    const { getByTestId, queryByTestId } = render(<Gated navigation={nav()} />);

    await waitFor(() => expect(getByTestId('campo-codigo')).toBeTruthy());
    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
  });
});

describe('MainNavigator real — deep link ponta a ponta até JointInvite/JointJoin (achado F2)', () => {
  // O estado inicial vem do MESMO getStateFromPath/LINKING_CONFIG que o app usa
  // em produção (linkingMain reexporta LINKING_CONFIG sem alterar a árvore
  // Home) — não um parser paralelo. `MainNavigator` é o componente default
  // exportado de produção; só as telas irrelevantes ao guard estão mockadas
  // (ver jest.mock no topo do arquivo).
  const estadoConvite = () => getStateFromPath('/home/treino-conjunto/novo', LINKING_CONFIG);
  const estadoEntrada = (codigo: string) => getStateFromPath(`/home/treino-conjunto/${codigo}`, LINKING_CONFIG);

  it('CONTROLE: o path real resolve para Home[HomeMain, JointInvite] — se isto quebrar, o resto do bloco testa a rota errada', () => {
    const estado: any = estadoConvite();
    expect(estado.routes[0].name).toBe('Home');
    const stack = estado.routes[0].state;
    expect(stack.routes.map((r: any) => r.name)).toEqual(['HomeMain', 'JointInvite']);
  });

  it('CONTROLE: o path real resolve para Home[HomeMain, JointJoin{code}]', () => {
    const estado: any = estadoEntrada('ABC234');
    const stack = estado.routes[0].state;
    const rota = stack.routes[stack.routes.length - 1];
    expect(rota.name).toBe('JointJoin');
    expect(rota.params).toEqual({ code: 'ABC234' });
  });

  it('flag OFF: deep link real para /home/treino-conjunto/novo NÃO abre o convite — mostra o aviso', () => {
    __setJointTrainingEnvReader(() => 'false');
    const { getByTestId, queryByTestId } = render(
      <NavigationContainer initialState={estadoConvite() as any}>
        <MainNavigator />
      </NavigationContainer>,
    );

    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
    expect(queryByTestId('gerar-convite')).toBeNull();
  });

  it('flag OFF: deep link real para /home/treino-conjunto/:code NÃO abre a entrada — mostra o aviso', () => {
    __setJointTrainingEnvReader(() => 'false');
    const { getByTestId, queryByTestId } = render(
      <NavigationContainer initialState={estadoEntrada('ABC234') as any}>
        <MainNavigator />
      </NavigationContainer>,
    );

    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
    expect(queryByTestId('campo-codigo')).toBeNull();
  });

  it('flag ON: deep link real para /home/treino-conjunto/novo abre o convite de verdade', async () => {
    __setJointTrainingEnvReader(() => 'true');
    const { getByTestId, queryByTestId } = render(
      <NavigationContainer initialState={estadoConvite() as any}>
        <MainNavigator />
      </NavigationContainer>,
    );

    await waitFor(() => expect(getByTestId('gerar-convite')).toBeTruthy());
    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
  });

  it('flag ON: deep link real para /home/treino-conjunto/:code abre a entrada de verdade', async () => {
    __setJointTrainingEnvReader(() => 'true');
    const { getByTestId, queryByTestId } = render(
      <NavigationContainer initialState={estadoEntrada('ABC234') as any}>
        <MainNavigator />
      </NavigationContainer>,
    );

    await waitFor(() => expect(getByTestId('campo-codigo')).toBeTruthy());
    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
  });
});

describe('MainNavigator real — JointLobby entra no gate como as demais rotas joint (achado N4)', () => {
  // JointLobby NÃO tem path em linkingConfig.ts (achado do painel: hoje só se
  // chega nela por navigate() pós create/join, que já vivem atrás do gate) —
  // por isso o estado inicial é montado à mão, no MESMO formato que
  // getStateFromPath produz para JointInvite/JointJoin (ver describe acima),
  // trocando só o nome da rota final e seus params.
  const estadoLobby = () => ({
    routes: [
      {
        name: 'Home',
        state: {
          index: 1,
          routes: [{ name: 'HomeMain' }, { name: 'JointLobby', params: { jointSessionId: 'sessao-1' } }],
        },
      },
    ],
  });

  it('flag OFF: navegar direto para JointLobby NÃO monta a tela real — mostra o aviso do gate', () => {
    __setJointTrainingEnvReader(() => 'false');
    const { getByTestId, queryByTestId } = render(
      <NavigationContainer initialState={estadoLobby() as any}>
        <MainNavigator />
      </NavigationContainer>,
    );

    expect(getByTestId('aviso-treino-conjunto-indisponivel')).toBeTruthy();
    // Prova a metade que faltava: não basta o aviso aparecer, a tela real
    // embrulhada (stub) tem que estar AUSENTE — senão as duas coisas
    // poderiam estar montadas ao mesmo tempo e o teste não pegaria.
    expect(queryByTestId('joint-lobby-stub')).toBeNull();
  });

  it('flag ON: navegar para JointLobby não mostra o aviso do gate (não regressão)', () => {
    __setJointTrainingEnvReader(() => 'true');
    const { getByTestId, queryByTestId } = render(
      <NavigationContainer initialState={estadoLobby() as any}>
        <MainNavigator />
      </NavigationContainer>,
    );

    expect(queryByTestId('aviso-treino-conjunto-indisponivel')).toBeNull();
    // Achado da auto-revisão: com `default: () => null` no mock antigo, este
    // teste ficava verde mesmo se o gate travasse tudo — queryByTestId do
    // aviso já dava null porque o mock não renderizava NADA, não porque o
    // gate deixou a tela passar. Com o stub real, isto prova a montagem.
    expect(getByTestId('joint-lobby-stub')).toBeTruthy();
  });
});
