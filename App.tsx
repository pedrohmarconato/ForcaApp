// Na RAIZ do projeto: ForcaApp/App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';

import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import theme from './src/theme/theme';

export default function App() {
  // Fontes da identidade, empacotadas com o app (nunca via rede).
  // As chaves são exatamente os nomes declarados em `theme.fonts`.
  const [fontsLoaded, fontError] = useFonts({
    'BarlowSemiCondensed-ExtraBold': require('./assets/fonts/BarlowSemiCondensed-ExtraBold.ttf'),
    Inter: require('./assets/fonts/Inter-Variable.ttf'),
  });

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
