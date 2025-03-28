import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Suas telas principais existentes
import Home from '../screens/Home';
import Exercicios from '../screens/Exercicios';
import Treinos from '../screens/Treinos';
// Adicione outras telas aqui (Perfil, etc.) quando criá-las

const Stack = createStackNavigator();

const MainNavigator = () => {
  return (
    // Por enquanto, usamos a mesma estrutura que estava em App.js
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="Exercicios" component={Exercicios} />
      <Stack.Screen name="Treinos" component={Treinos} />
      {/* Adicione <Stack.Screen name="Profile" component={ProfileScreen} /> etc. */}
    </Stack.Navigator>
  );
};

export default MainNavigator;