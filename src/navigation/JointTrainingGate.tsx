// src/navigation/JointTrainingGate.tsx
// Achado P1 (review 2026-08-06): isJointTrainingEnabled() (achado A1) só tinha
// UM chamador — HomeScreen.tsx, que afastava o CARD da Home. A ROTA continuava
// registrada sem condição nenhuma em MainNavigator.tsx (JointInvite/JointJoin),
// e linkingConfig.ts mapeia treino-conjunto/novo e treino-conjunto/:code sem
// checagem própria. Com a flag OFF em produção, um convidado que abre o deep
// link cai direto no fluxo joint mesmo sem a migration 0026 aplicada.
//
// Guard CENTRAL aplicado no REGISTRO da tela (MainNavigator), não dentro dela:
// navegação interna ("Convidar alguém"/"Entrar com código" na Home) e deep
// link caem no MESMO Screen do navigator, então o guard aqui cobre os dois
// sem precisar tocar em linkingConfig.ts.
//
// Decisão do dono: flag OFF não redireciona em silêncio — mostra uma tela de
// aviso simples ("recurso indisponível"), com ação de voltar à Home.

import React from 'react';
import { Screen, ScreenTitle, EmptyState, Button } from '../components/ui';
import { StackHeader } from '../components/ui/Controls';
import { isJointTrainingEnabled } from '../config/featureFlags';

/**
 * Forma mínima de navegação que as telas de treino conjunto já esperam
 * (JointInviteScreenProps / JointJoinScreenProps): só o suficiente para voltar
 * à Home. JointInvite e JointJoin vivem dentro do HomeStack (MainNavigator.tsx)
 * — 'HomeMain' é sempre uma rota válida ali.
 */
type NavegacaoMinima = {
  navigate: (rota: string, params?: any) => void;
};

export type JointTrainingUnavailableScreenProps = {
  navigation: NavegacaoMinima;
};

/**
 * Tela de aviso exibida quando EXPO_PUBLIC_ENABLE_JOINT_TRAINING está OFF.
 * Minimalista, no mesmo padrão visual/textual das outras telas do fluxo joint
 * (Screen + StackHeader + EmptyState, tokens do tema) — nenhum estado novo
 * inventado para uma condição que só existe enquanto a migration 0026 não
 * chega a produção.
 */
export const JointTrainingUnavailableScreen = ({ navigation }: JointTrainingUnavailableScreenProps) => {
  const voltarParaHome = () => navigation.navigate('HomeMain');

  return (
    <Screen>
      <StackHeader title="Treinar junto" onBack={voltarParaHome} />
      <ScreenTitle title="Treino conjunto" />
      <EmptyState
        icon="users"
        title="Recurso indisponível"
        description="O treino conjunto está temporariamente fora do ar. Volte para a Home e continue seu treino normalmente."
        action={<Button label="Voltar à Home" variant="outline" onPress={voltarParaHome} testID="voltar-home" />}
        testID="aviso-treino-conjunto-indisponivel"
      />
    </Screen>
  );
};

/**
 * Guard central: envolve uma tela do fluxo joint (JointInviteScreen,
 * JointJoinScreen) e decide, no MOMENTO DO REGISTRO no navigator, se renderiza
 * a tela real ou o aviso. Usar isso na declaração do `component=` do Screen —
 * e não um `if` dentro da própria tela — é o que garante que TODO caminho até
 * a rota (navegação interna e deep link) passa pelo mesmo guard.
 */
export function withJointTrainingGate<P extends { navigation: NavegacaoMinima }>(
  ScreenComponent: React.ComponentType<P>,
): React.ComponentType<P> {
  const Gated = (props: P) => {
    if (!isJointTrainingEnabled()) {
      return <JointTrainingUnavailableScreen navigation={props.navigation} />;
    }
    return <ScreenComponent {...props} />;
  };
  Gated.displayName = `withJointTrainingGate(${ScreenComponent.displayName || ScreenComponent.name || 'Screen'})`;
  return Gated;
}
