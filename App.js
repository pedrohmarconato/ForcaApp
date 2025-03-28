import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { NavigationContainer } from '@react-navigation/native'; // Mantenha por enquanto
import { createStackNavigator } from '@react-navigation/stack'; // Mantenha por enquanto

// Importe o AuthProvider
import { AuthProvider } from './src/contexts/AuthContext';

// Importe suas telas (vamos ajustar a navegação depois)
import Home from './src/screens/Home';
import Exercicios from './src/screens/Exercicios';
import Treinos from './src/screens/Treinos';

const Stack = createStackNavigator(); // Mantenha por enquanto

export default function App() {
  return (
    // 1. Envolva tudo com AuthProvider
    <AuthProvider>
      <PaperProvider>
        {/* A navegação será movida depois, mas mantenha aqui por agora */}
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator initialRouteName="Home">
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="Exercicios" component={Exercicios} />
            <Stack.Screen name="Treinos" component={Treinos} />
          </Stack.Navigator>
        </NavigationContainer>
      </PaperProvider>
    </AuthProvider>
  );
}