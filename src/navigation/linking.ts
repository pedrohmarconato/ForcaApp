// src/navigation/linking.ts
// Configuração de deep link / URL tipada para a árvore principal.
//
// Por que existe: a sessão ativa (ActiveSession) precisa ser recuperável por URL
// nos stacks Hoje (Home) e Plano (Training) — um refresh no web ou um deep link
// reabre a MESMA sessão pelo `sessionId`, sem perder o estado de navegação.
//
// Paths EXPLÍCITOS por tab e por stack (nada de inferência de nome): cada URL
// reconstrói a aba e o stack corretos com o `sessionId` exato.
//
// `initialRouteName` em cada stack: sem ele, o deep link / refresh do web em
// `/home/active-session/<id>` reconstrói a pilha com SÓ [ActiveSession] — e o
// "Voltar ao início" do resumo (canGoBack ? popToTop : nada) vira botão morto.
// Com ele, o estado nasce [HomeMain > ActiveSession], canGoBack()==true e o
// popToTop volta à aba certa. (Regressão reproduzida por getStateFromPath em
// 04/08/2026: `Home[ActiveSession]` sem a correção, `Home[HomeMain >
// ActiveSession]` com ela.)

const webOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : undefined;

/** Prefixos aceitos: scheme do app + origin do web (quando disponível). */
export const LINKING_PREFIXES: string[] = [
  'forcaapp://',
  ...(webOrigin ? [webOrigin] : []),
];

export const LINKING_CONFIG = {
  screens: {
    Home: {
      path: 'home',
      initialRouteName: 'HomeMain',
      screens: {
        HomeMain: '',
        WorkoutDetail: 'workout/:sessionId',
        ActiveSession: 'active-session/:sessionId',
      },
    },
    Training: {
      path: 'training',
      initialRouteName: 'TrainingOverview',
      screens: {
        TrainingOverview: '',
        WorkoutDetail: 'workout/:sessionId',
        ActiveSession: 'active-session/:sessionId',
      },
    },
    Progress: {
      path: 'progress',
      screens: {
        ProgressMain: '',
        SessionHistory: 'history',
        SessionHistoryDetail: 'history/:sessionLogId',
      },
    },
    Profile: {
      path: 'profile',
      screens: {
        ProfileMain: '',
      },
    },
  },
};
