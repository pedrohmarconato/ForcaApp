// src/navigation/RootNavigator.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import { useAuth } from '../contexts/AuthContext';

const RootNavigator = () => {
  // ... (estados e useEffect permanecem os mesmos da versão anterior) ...
  const { session, profile, loadingSession, loadingProfile, errorProfile } = useAuth();
  const [shouldStayLoggedIn, setShouldStayLoggedIn] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  useEffect(() => {
    const checkStayLoggedInPreference = async () => {
      // ... (lógica do useEffect permanece a mesma) ...
      setIsLoadingPreference(true);
      try {
        const value = await AsyncStorage.getItem('@userShouldStayLoggedIn');
        setShouldStayLoggedIn(value === 'true');
        console.log('[RootNavigator] Valor encontrado para \'@userShouldStayLoggedIn\':', value);
      } catch (e) {
        console.error('[RootNavigator] Erro ao ler preferência:', e);
        setShouldStayLoggedIn(false);
      } finally {
        setIsLoadingPreference(false);
        // Removido console.log duplicado daqui
      }
    };
    checkStayLoggedInPreference();
  }, []); // Removida a dependência de loadingSession, geralmente não necessária aqui


  console.log('[RootNavigator] Renderizando: session=', !!session, 'shouldStayLoggedIn=', shouldStayLoggedIn, 'loadingSession=', loadingSession, 'isLoadingPreference=', isLoadingPreference, 'loadingProfile=', loadingProfile);


  if (loadingSession || isLoadingPreference) {
    console.log('[RootNavigator] Tela de Loading Inicial: loadingSession=' + loadingSession + ', isLoadingPreference=' + isLoadingPreference);
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  // Se não há sessão, direciona para autenticação
  if (!session) {
    console.log('[RootNavigator] Direcionando para Auth: session=false');
    if (shouldStayLoggedIn) {
        console.log('[RootNavigator] Limpando preferência @userShouldStayLoggedIn pois não há sessão.');
        AsyncStorage.removeItem('@userShouldStayLoggedIn');
    }
    return (
      <NavigationContainer>
        <AuthNavigator />
      </NavigationContainer>
    );
  }

  // Se chegou aqui, TEMOS uma sessão

  console.log('[RootNavigator] Sessão ativa detectada. Verificando perfil...');

  if (loadingProfile) {
     console.log('[RootNavigator] Sessão ativa, perfil carregando...');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Carregando dados do usuário...</Text>
      </View>
    );
  }

  if (errorProfile) {
     console.error('[RootNavigator] Sessão ativa, erro ao carregar perfil:', errorProfile);
     return (
       <View style={styles.loadingContainer}>
         <Text style={styles.errorText}>Erro ao carregar dados:</Text>
         <Text style={styles.errorText}>{typeof errorProfile === 'string' ? errorProfile : 'Tente novamente mais tarde.'}</Text>
       </View>
     );
  }

  // ----- REFAZENDO A LÓGICA DE DECISÃO FINAL -----
  // Determina qual navegador renderizar baseado no perfil
  let NavigatorComponent;
  if (profile && profile.onboarding_completed) {
    // Perfil existe e onboarding completo -> App principal
    console.log('[RootNavigator] Perfil encontrado e onboarding completo. Direcionando para MainNavigator.');
    NavigatorComponent = <MainNavigator />;
  } else if (profile && !profile.onboarding_completed) {
    // Perfil existe mas onboarding incompleto -> Telas de Onboarding
    console.log('[RootNavigator] Perfil encontrado, onboarding incompleto. Direcionando para OnboardingNavigator.');
    NavigatorComponent = <OnboardingNavigator />;
  } else {
    // Fallback: Perfil não existe (profile === null), mas tem sessão -> Onboarding
    console.log('[RootNavigator] Perfil não encontrado (ou onboarding_completed ausente). Direcionando para OnboardingNavigator.'); // Log aqui está OK
    NavigatorComponent = <OnboardingNavigator />;
  }

  // Retorna o componente navegador decidido dentro do Container
  return (
    <NavigationContainer>
      {NavigatorComponent}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
      fontSize: 16,
      color: 'red',
      textAlign: 'center',
      marginHorizontal: 20,
      marginBottom: 5,
  }
});

export default RootNavigator;