// __tests__/jointLinkingBack.test.tsx
// Achado A5 (review PR #73): estadoDoConvite montava Home→[JointJoin] SEM
// HomeMain por baixo — contraste com linkingConfig.ts, que põe
// initialRouteName:'HomeMain' nos stacks, e com o bug idêntico já documentado
// para ActiveSession no topo de linking.ts (linhas 28-34). Cold start pelo
// link canônico forcaapp://treino-conjunto/<code> (ou PWA na rota funda)
// deixava o botão voltar do header de JointJoinScreen (goBack sem guarda,
// JointJoinScreen.tsx:67) morto. Este teste hidrata o estado REAL de
// linkingMain.getStateFromPath num NavigationContainer e pergunta canGoBack()
// à tela ativa — o mesmo ângulo que reproduziu a regressão da sessão ativa em
// 04/08/2026.

import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { CAMINHO_CONVITE, linkingMain } from '../src/navigation/linking';

const registrada = linkingMain.getStateFromPath!;

const RootStack = createStackNavigator();
const HomeStack = createStackNavigator();

const SondaBack = () => {
  const navigation = useNavigation();
  return <Text testID="back">{String(navigation.canGoBack())}</Text>;
};

const Arvore = ({ estado }: { estado: any }) => (
  <NavigationContainer initialState={estado}>
    <RootStack.Navigator>
      <RootStack.Screen name="Home">
        {() => (
          <HomeStack.Navigator>
            <HomeStack.Screen name="HomeMain" component={() => null} />
            <HomeStack.Screen name="JointJoin" component={SondaBack} />
          </HomeStack.Navigator>
        )}
      </RootStack.Screen>
    </RootStack.Navigator>
  </NavigationContainer>
);

describe('A5 — back do header de JointJoin vivo após cold start pelo link canônico', () => {
  it('o estado hidratado de treino-conjunto/ABC234 tem HomeMain por baixo; canGoBack()==true', async () => {
    const estado: any = registrada(`${CAMINHO_CONVITE}/ABC234`, (linkingMain as any).config);

    const { getByTestId } = render(<Arvore estado={estado} />);
    expect(getByTestId('back').props.children).toBe('true');
  });
});
