// Na RAIZ do projeto: ForcaApp/App.tsx
import 'react-native-gesture-handler';
import React, { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ThemeProvider } from './src/theme/ThemeProvider';
import RootNavigator from './src/navigation/RootNavigator';
import AlertHost from './src/components/AlertHost';
import UpdateBanner from './src/components/UpdateBanner';
import ProvisioningBanner from './src/components/ProvisioningBanner';
import LiveActivityUnavailableBanner from './src/components/LiveActivityUnavailableBanner';
import PushInviteHost from './src/components/PushInviteHost';
import {
  initLiveActivitySync,
  reconcileOrphanActivities,
  setLiveActivityNeonColor,
} from './src/native/liveActivitySync';
import { registerLiveActivityIntentListener } from './src/native/liveActivityIntentBridge';
import theme from './src/theme/theme';

// Ponte fora de src/theme/: só aqui o app cruza auth -> tema. ThemeProvider
// nunca importa AuthContext/supabaseClient (guarda estática em
// __tests__/themeModuleGraphSentinel.test.ts) — userId/profile chegam por
// prop, lidos aqui via useAuth() e repassados adiante.
type ThemedRootProps = {
  children: ReactNode;
};

const ThemedRoot = ({ children }: ThemedRootProps) => {
  const { user, profile } = useAuth();
  const userId = typeof user?.id === 'string' ? user.id : null;
  return (
    <ThemeProvider
      userId={userId}
      profile={profile}
      onThemeChange={setLiveActivityNeonColor}
    >
      {children}
    </ThemeProvider>
  );
};

export default function App() {
  // Fontes da identidade, empacotadas com o app (nunca via rede).
  // As chaves são exatamente os nomes declarados em `theme.fonts`.
  const [fontsLoaded, fontError] = useFonts({
    'BarlowSemiCondensed-ExtraBold': require('./assets/fonts/BarlowSemiCondensed-ExtraBold.ttf'),
    Inter: require('./assets/fonts/Inter-Variable.ttf'),
  });

  useEffect(() => {
    // Fase 16 (CMD, Plano 16-04): a reconciliação da fila de intents da
    // tela bloqueada SAIU do boot cru — chamá-la aqui rodava antes de
    // qualquer hidratação de `draft` (startOrResume(), só disparado depois,
    // quando o dono navega para a sessão ativa), e como a fila do App Group
    // é drenada de forma destrutiva, a entrada do toque no Lock Screen era
    // lida e perdida para sempre (16-VERIFICATION.md gap 1 / 16-REVIEW.md
    // CR-01). Essa reconciliação agora vive dentro de startOrResume()
    // (activeSessionStore.ts), em cada ramo que hidrata um draft ativo — a
    // fila só é lida quando já existe um draft candidato a recebê-la.
    void reconcileOrphanActivities();
    const unsubscribeSync = initLiveActivitySync();
    const unsubscribeIntents = registerLiveActivityIntentListener();
    return () => {
      unsubscribeSync();
      unsubscribeIntents();
    };
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
      <ThemedRoot>
        <StatusBar style="light" />
        <RootNavigator />
        <UpdateBanner />
        <ProvisioningBanner />
        <LiveActivityUnavailableBanner />
        <AlertHost />
        {/* Depois de AlertHost: precisa que alertStore/AlertHost já estejam
            prontos para receber o showAlert() do convite único de opt-in
            (PUSH-01, Fase 13 Plano 05). */}
        <PushInviteHost />
      </ThemedRoot>
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
