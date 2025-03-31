import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper'; // Usando Text do Paper
import AsyncStorage from '@react-native-async-storage/async-storage'; // Importa AsyncStorage

// Importe seus navegadores e o contexto de autenticação
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import { useAuth } from '../contexts/AuthContext'; // Verifique o caminho

const RootNavigator = () => {
  // Pega estados relevantes do contexto de autenticação
  const { session, profile, loadingSession, loadingProfile, errorProfile } = useAuth();

  // Estado para controlar a preferência de "Manter Conectado"
  const [shouldStayLoggedIn, setShouldStayLoggedIn] = useState(false);
  // Estado para controlar o carregamento dessa preferência do AsyncStorage
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Efeito para buscar a preferência do AsyncStorage quando o componente montar
  useEffect(() => {
    const checkStayLoggedInPreference = async () => {
      console.log("[RootNavigator] Verificando preferência 'Manter Conectado'...");
      setIsLoadingPreference(true); // Inicia carregamento da preferência
      try {
        const value = await AsyncStorage.getItem('@userShouldStayLoggedIn');
        console.log("[RootNavigator] Valor encontrado para '@userShouldStayLoggedIn':", value);
        setShouldStayLoggedIn(value === 'true'); // Define o estado baseado no valor encontrado
      } catch (e) {
        console.error("[RootNavigator] Falha ao carregar preferência 'Manter Conectado'", e);
        setShouldStayLoggedIn(false); // Assume não manter logado em caso de erro
      } finally {
        setIsLoadingPreference(false); // Finaliza o carregamento da preferência
      }
    };

    checkStayLoggedInPreference();
  }, []); // Array vazio significa que roda apenas uma vez na montagem

  // ----- Tela de Carregamento Inicial -----
  // Mostra loading enquanto a sessão OU a preferência ainda estão carregando.
  if (loadingSession || isLoadingPreference) {
    console.log(`[RootNavigator] Tela de Loading Inicial: loadingSession=${loadingSession}, isLoadingPreference=${isLoadingPreference}`);
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  // ----- Decisão Principal de Navegação -----
  // Neste ponto, loadingSession e isLoadingPreference são FALSE.

  // Caso 1: Usuário DEVE ser direcionado para Auth (sem sessão OU com sessão mas sem "Manter Logado")
  if (!session || !shouldStayLoggedIn) {
    console.log(`[RootNavigator] Direcionando para Auth: session=${!!session}, shouldStayLoggedIn=${shouldStayLoggedIn}`);
    // Importante: Limpar a preferência se a sessão expirou ou foi invalidada
    // (Opcional, mas boa prática para evitar loop se a sessão sumir mas a pref ficar)
    if (!session && shouldStayLoggedIn) {
        AsyncStorage.removeItem('@userShouldStayLoggedIn');
        console.log("[RootNavigator] Sessão não encontrada, limpando pref 'Manter Conectado'.");
    }
    return (
      <NavigationContainer>
         {/* Garante que apenas o AuthNavigator seja montado */}
        <AuthNavigator />
      </NavigationContainer>
    );
  }

  // Caso 2: Usuário TEM sessão E QUERIA ficar logado - Agora verificamos o perfil/onboarding
  console.log(`[RootNavigator] Usuário deveria ficar logado (session=${!!session}, shouldStayLoggedIn=${shouldStayLoggedIn}). Verificando perfil/onboarding...`);

  // Subcaso 2.1: Ainda carregando o perfil (só acontece se fetchProfile demorar mais que getSession)
  if (loadingProfile) {
    console.log("[RootNavigator] Tela de Loading do Perfil...");
     return (
       <View style={styles.loadingContainer}>
         <ActivityIndicator size="large" color="#0000ff" />
         <Text style={styles.loadingText}>Carregando dados do usuário...</Text>
       </View>
     );
  }

  // Subcaso 2.2: Erro ao carregar o perfil
  if (errorProfile) {
     console.error("[RootNavigator] Erro ao carregar perfil:", errorProfile);
     return (
       <View style={styles.loadingContainer}>
         <Text style={styles.errorText}>Erro ao carregar dados:</Text>
         <Text style={styles.errorText}>{typeof errorProfile === 'string' ? errorProfile : 'Tente novamente mais tarde.'}</Text>
         {/* Idealmente, adicionar botão de Logout ou Tentar Novamente aqui */}
         {/* Ex: <Button onPress={async () => { await signOut(); }}>Sair</Button> */}
       </View>
     );
  }

  // Subcaso 2.3: Perfil carregado com sucesso - Decide entre Onboarding e Main App
  console.log("[RootNavigator] Perfil verificado:", profile ? `Onboarding completo: ${profile.onboarding_completed}` : "Perfil não encontrado/nulo");
  return (
    <NavigationContainer>
      {/* A condição principal (session && shouldStayLoggedIn) já foi validada */}
      {profile && profile.onboarding_completed ? (
        // Perfil existe e onboarding completo -> App principal
        <MainNavigator />
      ) : profile && !profile.onboarding_completed ? (
        // Perfil existe mas onboarding incompleto -> Telas de Onboarding
        <OnboardingNavigator />
      ) : (
        // Caso Estranho: Tem sessão, deveria ficar logado, perfil carregou sem erro, MAS profile é null.
        // Isso indica que o trigger de criação de perfil pode ter falhado para este usuário.
        // O que mostrar? Onboarding? Auth? Uma tela de erro específica?
        // Vamos direcionar para Onboarding como um fallback seguro, assumindo que um perfil
        // sem onboarding completo ou inexistente deve passar pelo fluxo inicial.
        // Ou podemos mostrar um erro mais específico. Por segurança, Onboarding.
        <OnboardingNavigator />
        // Alternativa: Mostrar tela de erro específica
        // <View style={styles.loadingContainer}><Text style={styles.errorText}>Falha ao encontrar dados do perfil. Tente relogar.</Text></View>
      )}
    </NavigationContainer>
  );
};

// Estilos (mantidos do seu exemplo)
const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#fff', // Adiciona um fundo para cobrir qualquer coisa atrás
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16, // Tamanho um pouco maior
    },
    errorText: {
        color: 'red', // Ou use theme.colors.error
        textAlign: 'center',
        marginBottom: 5,
        fontSize: 16,
    }
});

export default RootNavigator;