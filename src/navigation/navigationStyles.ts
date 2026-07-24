// Estilo e transição de card compartilhados por TODOS os stack navigators.
//
// Por que flex: 1 explícito: no WEB, o card do @react-navigation/stack usa
// minHeight: '100%' por default (desenho para rolagem de página inteira no
// browser), mas o reset do Expo trava o <body> com overflow: hidden — o card
// estica junto com o conteúdo, o ScrollView interno fica sem viewport e NADA
// rola (bug do scroll do questionário no PWA, 22/07/2026). flex: 1 prende o
// card à altura da janela e devolve a rolagem aos ScrollViews/FlatLists.
// No nativo, flex: 1 já é o comportamento padrão — sem efeito colateral.
import type {
  StackCardInterpolationProps,
  StackNavigationOptions,
} from '@react-navigation/stack';

import theme from '../theme/theme';
import { easeImpulso } from '../utils/motion';

export const stackCardStyle = {
  flex: 1,
  backgroundColor: theme.colors.surface.canvas,
} as const;

// Direção 03: push = fade + deslize curto de 14px na curva impulso (260ms);
// pop mais rápido (150ms). Substitui o slide de tela inteira do default — a
// navegação responde sem teatralidade. O tipo vem das opções públicas do
// stack (TransitionSpec não é exportado da raiz do pacote).
type StackTransition = Required<
  Pick<StackNavigationOptions, 'transitionSpec' | 'cardStyleInterpolator'>
>;

const cardStyleInterpolator = ({ current }: StackCardInterpolationProps) => ({
  cardStyle: {
    opacity: current.progress,
    transform: [
      {
        translateX: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  },
});

export const stackTransition: StackTransition = {
  transitionSpec: {
    open: {
      animation: 'timing',
      config: { duration: theme.animation.durations.medium, easing: easeImpulso },
    },
    close: {
      animation: 'timing',
      config: { duration: theme.animation.durations.short, easing: easeImpulso },
    },
  },
  cardStyleInterpolator,
};
