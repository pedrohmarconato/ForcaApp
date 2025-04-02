// Na RAIZ do projeto: ForcaApp/App.tsx
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper'; // Importa o PaperProvider

// REMOVA OS IMPORTS DO REDUX DAQUI:
// import { Provider as ReduxProvider } from 'react-redux';
// import { store } from './src/store/store';

import { AuthProvider } from './src/contexts/AuthContext'; // Importa o AuthProvider
import RootNavigator from './src/navigation/RootNavigator'; // Importa o RootNavigator

export default function App() {
  return (
    // REMOVA O <ReduxProvider> DAQUI:
    // <ReduxProvider store={store}>
      <AuthProvider>
        <PaperProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </PaperProvider>
      </AuthProvider>
    // </ReduxProvider>
  );
}