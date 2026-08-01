// src/navigation/linking.ts
// Treino Conjunto 2.0 — Sprint 02. Deep link do convite.
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

import type { LinkingOptions } from '@react-navigation/native';
import { getStateFromPath as getStateFromPathPadrao } from '@react-navigation/native';
import { guardarConvitePendente } from '../services/jointInvitePending';
import { CAMINHO_CONVITE, PREFIXOS, parseInviteUrl, parseInvitePath } from './inviteLink';

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
 * Config da árvore MAIN — a única que tem `Home → JointJoin`.
 *
 * `getStateFromPath` é registrado aqui, e é ELE que o container usa. Um parser
 * paralelo que ficasse verde enquanto o container usa outro caminho não provaria
 * nada — por isso a validação do convite acontece dentro desta função.
 */
export const linkingMain: LinkingOptions<any> = {
  prefixes: PREFIXOS,
  config: {
    screens: {
      Home: {
        screens: {
          HomeMain: '',
          JointInvite: 'treino-conjunto/novo',
          JointJoin: `${CAMINHO_CONVITE}/:code`,
        },
      },
    },
  },
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
  prefixes: PREFIXOS,
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
