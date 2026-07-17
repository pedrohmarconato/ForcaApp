// Na RAIZ do projeto: ForcaApp/App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';

import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <AuthProvider>
      <PaperProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </PaperProvider>
    </AuthProvider>
  );
}