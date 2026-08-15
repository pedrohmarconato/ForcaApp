// src/components/PushInviteHost.tsx
// Convite ÚNICO de opt-in de push, mostrado via alertShim (WEB-01) em
// momento oportuno — a peça que faltava de PUSH-01 no ROADMAP (13-CONTEXT.md,
// "Frontend: convite ÚNICO via alertShim"). Molde estrutural: UpdateBanner.tsx
// (componente global montado uma vez em App.tsx, decide sozinho se deve
// aparecer, sem props). Diferença: aqui a decisão de aparecer depende de
// auth (usuário com onboarding completo, `profile.current_plan_id` presente)
// + estado real de permissão do navegador (`Notification.permission ===
// 'default'`, nunca perguntado) + uma flag persistida (`push_invite_shown`)
// que nunca é limpa — é um convite único por instalação, não recorrente a
// cada login/reabertura do app (decisão travada de 13-CONTEXT.md).
//
// Critério 2 (literal, mesmo do botão "Ativar notificações" do Perfil em
// pushSubscription.ts/ProfileScreen.tsx): subscribeToPush() é a PRIMEIRA
// expressão síncrona do onPress do botão "Ativar" do Modal web
// (AlertHost.tsx) — o toque nesse botão TAMBÉM é um gesto de usuário
// genuíno (AlertHost.tsx despacha b.onPress() de forma síncrona a partir do
// onPress do TouchableOpacity), e o iOS descarta o gesto se qualquer
// await/checagem vier antes do PushManager.subscribe() (Pitfall 3 de
// 13-RESEARCH.md).

import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../contexts/AuthContext';
import { showAlert } from '../utils/alertShim';
import { isPushSupported, subscribeToPush } from '../services/pushSubscription';
import apiClient, { ENDPOINTS } from '../services/api/apiClient';
import { logger } from '../utils/logger';

/** Atraso antes de exibir o convite — não competir com o primeiro paint da
 * tela que acabou de montar após o onboarding. */
const INVITE_DELAY_MS = 2000;

const PushInviteHost = () => {
  const { user, profile } = useAuth();

  useEffect(() => {
    // Onboarding incompleto (sem plano ainda) ou deslogado: nunca dispara —
    // o momento oportuno é depois que o aluno já tem um plano ativo, nunca
    // durante o questionário inicial. Permissão já decidida (granted/denied)
    // por qualquer caminho (inclusive o botão do Perfil): também nunca
    // dispara — o convite é único, não repete depois de uma decisão.
    if (
      !user ||
      !profile?.current_plan_id ||
      !isPushSupported() ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'default'
    ) {
      return undefined;
    }

    let cancelado = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    AsyncStorage.getItem('push_invite_shown')
      .then((jaMostrado) => {
        if (cancelado || jaMostrado === 'true') return;

        timeoutId = setTimeout(() => {
          if (cancelado) return;
          showAlert(
            'Ativar notificações?',
            'Receba lembretes de treino e avisos de replanejamento direto no seu iPhone.',
            [
              {
                text: 'Agora não',
                style: 'cancel',
                onPress: () => {
                  // Convite único independente da decisão: recusar também
                  // grava a flag, para nunca reaparecer.
                  AsyncStorage.setItem('push_invite_shown', 'true').catch((err) => {
                    logger.warn('[pushInvite] falha ao persistir recusa do convite:', err);
                  });
                },
              },
              {
                text: 'Ativar',
                onPress: () => {
                  // Critério 2 (literal): subscribeToPush() é a PRIMEIRA
                  // expressão síncrona deste handler — nenhum await/checagem
                  // antes, ou o iOS descarta o gesto do usuário.
                  subscribeToPush()
                    .then((subJson) => apiClient.post(ENDPOINTS.PUSH.SUBSCRIBE, subJson))
                    .catch((err) => {
                      logger.warn('[pushInvite] falha ao ativar pelo convite:', err);
                    });
                  AsyncStorage.setItem('push_invite_shown', 'true').catch((err) => {
                    logger.warn('[pushInvite] falha ao persistir aceite do convite:', err);
                  });
                },
              },
            ],
          );
        }, INVITE_DELAY_MS);
      })
      .catch((err) => {
        logger.warn('[pushInvite] falha ao ler flag de convite já mostrado:', err);
      });

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user?.id, profile?.current_plan_id]);

  // Não renderiza nada diretamente — só orquestra o showAlert, que já é o
  // Modal do AlertHost, já montado em App.tsx.
  return null;
};

export default PushInviteHost;
