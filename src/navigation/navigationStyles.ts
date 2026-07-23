// Estilo de card compartilhado por TODOS os stack navigators.
//
// Por que flex: 1 explícito: no WEB, o card do @react-navigation/stack usa
// minHeight: '100%' por default (desenho para rolagem de página inteira no
// browser), mas o reset do Expo trava o <body> com overflow: hidden — o card
// estica junto com o conteúdo, o ScrollView interno fica sem viewport e NADA
// rola (bug do scroll do questionário no PWA, 22/07/2026). flex: 1 prende o
// card à altura da janela e devolve a rolagem aos ScrollViews/FlatLists.
// No nativo, flex: 1 já é o comportamento padrão — sem efeito colateral.
import theme from '../theme/theme';

export const stackCardStyle = {
  flex: 1,
  backgroundColor: theme.colors.surface.canvas,
} as const;
