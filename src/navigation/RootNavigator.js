import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, StyleSheet } from 'react-native'; // Importa StyleSheet
import { Text } from 'react-native-paper'; // Para mensagem de erro

import { useAuth } from '../contexts/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator'; // ADICIONADO

const RootNavigator = () => {
  // Pega todos os estados relevantes do contexto
  const { session, profile, loadingSession, loadingProfile, errorProfile } = useAuth();

  // 1. Loading Inicial (Sessão OU Perfil)
  if (loadingSession || (session && loadingProfile)) { // Mostra loading se a sessão está carregando, OU se JÁ tem sessão mas o perfil AINDA está carregando
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  // 2. Erro ao carregar perfil (após login)
  // Mostra erro se tem sessão, não está mais carregando perfil, mas deu erro
  if (session && !loadingProfile && errorProfile) {
     return (
       <View style={styles.loadingContainer}>
         <Text style={styles.errorText}>Erro ao carregar perfil:</Text>
         <Text style={styles.errorText}>{errorProfile}</Text>
         {/* Adicionar um botão de tentar novamente ou logout seria bom aqui */}
       </View>
     );
  }

  // 3. Decisão Principal: Logado ou Não? Onboarding completo?
  return (
    <NavigationContainer>
      {!session?.user ? ( // Se NÃO há usuário na sessão
        <AuthNavigator />
      ) : profile && profile.onboarding_completed ? ( // Se HÁ usuário E perfil E onboarding completo
        <MainNavigator />
      ) : profile && !profile.onboarding_completed ? ( // Se HÁ usuário E perfil E onboarding NÃO completo
         <OnboardingNavigator />
      ) : (
        // Caso de Borda: Tem sessão mas o perfil é null (trigger pode não ter rodado?)
        // Mostra loading ou uma mensagem específica? Por segurança, mostramos loading.
        // Se isso persistir, indica problema no trigger/criação do perfil.
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Verificando dados...</Text>
        </View>
      )}
    </NavigationContainer>
  );
};

// ADICIONADO: Estilos para loading e erro
const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    loadingText: {
        marginTop: 10,
    },
    errorText: {
        color: 'red', // Ou use theme.colors.error
        textAlign: 'center',
        marginBottom: 5,
    }
});

export default RootNavigator;