// Na RAIZ do projeto: ForcaApp/App.js (ou App.tsx)
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper'; // <-- Precisa disso

import { AuthProvider } from './src/contexts/AuthContext'; // <-- Precisa disso
import RootNavigator from './src/navigation/RootNavigator'; // <-- Precisa disso

export default function App() {
  return (
    <AuthProvider> {/* <-- Nosso contexto */}
      <PaperProvider> {/* <-- Provider da UI */}
        <StatusBar style="auto" />
        <RootNavigator /> {/* <-- Nosso navegador raiz */}
      </PaperProvider>
    </AuthProvider>
  );
}