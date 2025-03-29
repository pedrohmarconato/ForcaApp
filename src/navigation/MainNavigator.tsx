import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Importa APENAS a(s) tela(s) principal(is) que existem
import Home from '../screens/Home';
// As linhas abaixo serão descomentadas/adicionadas QUANDO criarmos essas telas
// import Exercicios from '../screens/Exercicios';
// import Treinos from '../screens/Treinos';
// import ProfileScreen from '../screens/ProfileScreen'; // Exemplo

const Stack = createStackNavigator();

const MainNavigator = () => {
  return (
    // Define a tela inicial para quando o usuário está logado
    <Stack.Navigator initialRouteName="Home">
      {/* Inclui apenas as telas que existem */}
      <Stack.Screen name="Home" component={Home} />

      {/* As linhas abaixo serão descomentadas/adicionadas QUANDO criarmos essas telas */}
      {/* <Stack.Screen name="Exercicios" component={Exercicios} /> */}
      {/* <Stack.Screen name="Treinos" component={Treinos} /> */}
      {/* <Stack.Screen name="Profile" component={ProfileScreen} /> */}

    </Stack.Navigator>
  );
};

export default MainNavigator;