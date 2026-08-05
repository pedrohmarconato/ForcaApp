// src/navigation/linkingConfig.ts
// Prefixos e config de rotas do deep link — SEM dependência de storage nativo.
//
// Por que este módulo existe separado de `linking.ts`: aquele precisa do
// convite pendente, e portanto do AsyncStorage. Quem só quer a config de rotas
// (o teste de URL tipada, uma tela que monta path) não deve arrastar storage
// junto. É a mesma razão que separou `inviteLink.ts`, e o mesmo erro reapareceu
// quando as duas frentes de deep link se encontraram: importar `LINKING_CONFIG`
// de `linking.ts` quebrava o teste da sessão ativa com "AsyncStorage is null".
//
// `linking.ts` reexporta o que está aqui, então quem já importava de lá continua
// a funcionar.

import { CAMINHO_CONVITE, PREFIXOS } from './inviteLink';

const webOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : undefined;

/**
 * Prefixos aceitos: o scheme do app (fonte única em `inviteLink`) mais o origin
 * do web quando existe. O origin NÃO é decoração: sem ele o container no PWA não
 * reconhece `/home/active-session/<id>` num refresh, e a recuperação por URL
 * morre. `PREFIXOS` continua sendo o scheme puro, porque é ele que
 * `parseInviteUrl` exige na validação do convite.
 */
export const LINKING_PREFIXES: string[] = [
  ...PREFIXOS,
  ...(webOrigin ? [webOrigin] : []),
];

/**
 * Config da árvore MAIN — a única que tem `Home → JointJoin`.
 *
 * A sessão ativa (ActiveSession) é recuperável por URL nos stacks Hoje (Home) e
 * Plano (Training): um refresh no web ou um deep link reabre a MESMA sessão pelo
 * `sessionId`, sem perder o estado de navegação. Paths EXPLÍCITOS por tab e por
 * stack — nada de inferência de nome.
 *
 * `initialRouteName` em cada stack: sem ele, o deep link / refresh do web em
 * `/home/active-session/<id>` reconstrói a pilha com SÓ [ActiveSession] — e o
 * "Voltar ao início" do resumo (canGoBack ? popToTop : nada) vira botão morto.
 * Com ele, o estado nasce [HomeMain > ActiveSession], canGoBack()==true e o
 * popToTop volta à aba certa. (Regressão reproduzida por getStateFromPath em
 * 04/08/2026: `Home[ActiveSession]` sem a correção, `Home[HomeMain >
 * ActiveSession]` com ela.)
 *
 * As rotas do convite moram dentro de `Home`, junto das demais. O link canônico
 * (`forcaapp://treino-conjunto/<code>`) não passa por aqui, e sim pelo
 * `getStateFromPath` de `linkingMain`, que monta o estado aninhado à mão.
 */
export const LINKING_CONFIG = {
  screens: {
    Home: {
      path: 'home',
      initialRouteName: 'HomeMain',
      screens: {
        HomeMain: '',
        WorkoutDetail: 'workout/:sessionId',
        ActiveSession: 'active-session/:sessionId',
        // Treino conjunto (Sprint 02).
        JointInvite: 'treino-conjunto/novo',
        JointJoin: `${CAMINHO_CONVITE}/:code`,
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
