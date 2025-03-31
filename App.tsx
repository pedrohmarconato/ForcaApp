// Na RAIZ do projeto: ForcaApp/App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper'; // Importa o PaperProvider

import { AuthProvider } from './src/contexts/AuthContext'; // Importa o AuthProvider
import RootNavigator from './src/navigation/RootNavigator'; // Importa o RootNavigator

export default function App() {
  return (
    // Envolve a aplicação com o Provedor de Autenticação
    <AuthProvider>
      {/* Envolve a aplicação com o Provedor de Tema/UI (React Native Paper) */}
      <PaperProvider>
        {/* Componente para controlar a barra de status do dispositivo */}
        <StatusBar style="auto" />
        {/* Componente que define a navegação principal do app */}
        <RootNavigator />
      </PaperProvider>
    </AuthProvider>
  );
}