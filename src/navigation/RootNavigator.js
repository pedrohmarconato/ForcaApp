import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native'; // Para tela de loading

import { useAuth } from '../contexts/AuthContext'; // Importa nosso hook
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

const RootNavigator = () => {
  const { session, loading } = useAuth(); // Pega session e loading do contexto

  // Se estiver carregando a sessão inicial, mostra um indicador
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // O NavigationContainer deve ficar aqui, envolvendo o navegador correto
  return (
    <NavigationContainer>
      {session && session.user ? <MainNavigator /> : <AuthNavigator />}
      {/* Se existe uma sessão com usuário, mostra MainNavigator, senão mostra AuthNavigator */}
    </NavigationContainer>
  );
};

export default RootNavigator;