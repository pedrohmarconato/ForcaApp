// src/navigation/linking.ts
// Deep link do app: URL tipada da sessão ativa (main) + convite do treino
// conjunto (Sprint 02). As duas frentes nasceram separadas e se encontram aqui.
//
// DUAS CONFIGS, UMA FONTE SÓ — e o motivo importa:
//
// `RootNavigator` monta DOIS `NavigationContainer`: um com `AuthNavigator`, e
// outro com `MainNavigator` OU `OnboardingNavigator`. Só a árvore Main tem
// `Home → JointJoin`. Entregar a mesma config para todos faria o container sem
// `Home` tentar hidratar um estado com rota que não existe ali.
//
// Então:
//   `linkingMain`         — mapeia a rota; só é passada quando o Main está montado.
//   `linkingInterceptor`  — Auth E Onboarding. NÃO tem a rota conjunta: valida,
//                           guarda o código e devolve `null`/não notifica.
//
// A validação do link é a MESMA função nos dois lados. O que muda é o destino:
// navegar agora, ou guardar para navegar quando a árvore certa existir.
//
// A URL TIPADA DA SESSÃO ATIVA vive em `LINKING_CONFIG`, que é a config da
// árvore Main: a sessão (ActiveSession) precisa ser recuperável por URL nos
// stacks Hoje (Home) e Plano (Training) — um refresh no web ou um deep link
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

import type { LinkingOptions } from '@react-navigation/native';
import { getStateFromPath as getStateFromPathPadrao } from '@react-navigation/native';
import { guardarConvitePendente } from '../services/jointInvitePending';
import { CAMINHO_CONVITE, parseInviteUrl, parseInvitePath } from './inviteLink';
import { LINKING_CONFIG, LINKING_PREFIXES } from './linkingConfig';

// Reexporta as puras para quem já importa daqui.
export {
  ALFABETO_CONVITE,
  CAMINHO_CONVITE,
  PREFIXOS,
  SCHEME,
  buildInviteLink,
  isCodigoDeConvite,
  parseInviteUrl,
  parseInvitePath,
} from './inviteLink';

// Prefixos e config de rotas vivem em `linkingConfig`, que não depende de
// storage — quem só quer a config não arrasta AsyncStorage junto. Reexportados
// aqui para quem já os importava deste módulo.
export { LINKING_CONFIG, LINKING_PREFIXES } from './linkingConfig';

/** Estado aninhado que a árvore Main precisa montar para abrir o convite. */
const estadoDoConvite = (codigo: string) => ({
  routes: [
    {
      name: 'Home',
      state: {
        routes: [{ name: 'JointJoin', params: { code: codigo } }],
      },
    },
  ],
});

/**
 * Config da árvore MAIN.
 *
 * `getStateFromPath` é registrado aqui, e é ELE que o container usa. Um parser
 * paralelo que ficasse verde enquanto o container usa outro caminho não provaria
 * nada — por isso a validação do convite acontece dentro desta função.
 */
export const linkingMain: LinkingOptions<any> = {
  prefixes: LINKING_PREFIXES,
  config: LINKING_CONFIG,
  getStateFromPath: (path, options) => {
    const codigo = parseInvitePath(path);
    if (codigo) return estadoDoConvite(codigo) as any;
    // Caminho de convite malformado não vira navegação nenhuma: devolver o
    // estado padrão aqui abriria rota com param inválido.
    if (typeof path === 'string' && path.replace(/^\//, '').startsWith(CAMINHO_CONVITE)) {
      return undefined;
    }
    return getStateFromPathPadrao(path, options);
  },
};

/**
 * Config das árvores AUTH e ONBOARDING — as que **não** têm `Home`.
 *
 * Ela nunca hidrata estado a partir do link: valida, guarda o código e devolve
 * `null`. O app segue o fluxo normal de login/onboarding, e quem consome o
 * pendente é a árvore Main, quando ela existir.
 */
export const linkingInterceptor: LinkingOptions<any> = {
  prefixes: LINKING_PREFIXES,
  config: { screens: {} },
  getInitialURL: async () => {
    const url = await urlInicialDoSistema();
    const codigo = parseInviteUrl(url);
    if (codigo) {
      await guardarConvitePendente(codigo);
      // `null`: nada a hidratar nesta árvore.
      return null;
    }
    return url ?? null;
  },
  subscribe: (listener) => {
    const aoReceber = ({ url }: { url: string }) => {
      const codigo = parseInviteUrl(url);
      if (codigo) {
        // Guarda e NÃO notifica o React Navigation: se notificasse, ele tentaria
        // resolver uma rota que esta árvore não tem.
        void guardarConvitePendente(codigo);
        return;
      }
      listener(url);
    };
    const assinatura = assinarUrl(aoReceber);
    // `subscribe` DEVE devolver o cleanup — sem ele o listener sobrevive à
    // troca de árvore e o app acumula assinaturas a cada login/logout.
    return () => assinatura.remove();
  },
};

// ------------------------------------------------------------------
// Fronteira com o Linking do React Native, isolada para os testes poderem
// injetar sem mockar o módulo inteiro.
// ------------------------------------------------------------------

type AssinaturaUrl = { remove: () => void };
type OuvinteUrl = (evento: { url: string }) => void;

let urlInicialDoSistema: () => Promise<string | null> = async () => {
  const { Linking } = await import('react-native');
  return Linking.getInitialURL();
};

let assinarUrl: (ouvinte: OuvinteUrl) => AssinaturaUrl = (ouvinte) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Linking } = require('react-native');
  return Linking.addEventListener('url', ouvinte) as AssinaturaUrl;
};

/** Só para teste: injeta a fronteira do Linking. */
export const __setLinkingBridge = (bridge: {
  getInitialURL?: () => Promise<string | null>;
  addEventListener?: (ouvinte: OuvinteUrl) => AssinaturaUrl;
}) => {
  if (bridge.getInitialURL) urlInicialDoSistema = bridge.getInitialURL;
  if (bridge.addEventListener) assinarUrl = bridge.addEventListener;
};
