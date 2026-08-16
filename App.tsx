// Na RAIZ do projeto: ForcaApp/App.tsx
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import AlertHost from './src/components/AlertHost';
import UpdateBanner from './src/components/UpdateBanner';
import ProvisioningBanner from './src/components/ProvisioningBanner';
import PushInviteHost from './src/components/PushInviteHost';
import theme from './src/theme/theme';
// SPIKE-ONLY (14-06) — remover em 14-07 (junto com o resto de
// modules/app-group-spike/) se o round-trip físico não confirmar App Groups
// no time pessoal gratuito (Pitfall 3, PITFALLS.md). O lado de escrita já
// roda no target de widget (targets/session-widget/widgets.swift); esta é a
// única chamada de leitura no app principal, necessária para observar o
// round-trip no runbook do plano 14-06.
import { readAppGroupSpikeValue } from 'app-group-spike';

export default function App() {
  // Fontes da identidade, empacotadas com o app (nunca via rede).
  // As chaves são exatamente os nomes declarados em `theme.fonts`.
  const [fontsLoaded, fontError] = useFonts({
    'BarlowSemiCondensed-ExtraBold': require('./assets/fonts/BarlowSemiCondensed-ExtraBold.ttf'),
    Inter: require('./assets/fonts/Inter-Variable.ttf'),
  });

  // SPIKE-ONLY (14-06) — remover em 14-07. Nunca pode atrasar ou derrubar o
  // boot do app: roda uma vez no mount, fora do caminho de fontsLoaded, e
  // qualquer rejeição da promise é capturada aqui mesmo.
  useEffect(() => {
    readAppGroupSpikeValue()
      .then((value) => {
        if (value !== null) {
          console.log(`[AppGroupSpike] read OK — value: ${value}`);
        } else {
          console.log('[AppGroupSpike] read returned null');
        }
      })
      .catch((error) => {
        console.warn('[AppGroupSpike] read FAILED —', error?.message ?? error);
      });
  }, []);

  // Se o carregamento falhar, seguimos com a fonte do sistema: um app sem a
  // tipografia de marca ainda é melhor do que uma tela travada.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={theme.colors.accent.main} />
      </View>
    );
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
      <UpdateBanner />
      <ProvisioningBanner />
      <AlertHost />
      {/* Depois de AlertHost: precisa que alertStore/AlertHost já estejam
          prontos para receber o showAlert() do convite único de opt-in
          (PUSH-01, Fase 13 Plano 05). */}
      <PushInviteHost />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface.canvas,
  },
});
