// src/navigation/RootNavigator.js
import React, { useState, useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { linkingInterceptor, linkingMain } from './linking';
import { consumirConvitePendente } from '../services/jointInvitePending';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import theme from '../theme/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import { useAuth } from '../contexts/AuthContext';

/**
 * Ref da árvore MAIN. O convite pendente é despachado por aqui, e só depois de o
 * dispatch ser ACEITO o pendente é removido — se a ref ainda não estiver pronta,
 * o código sobrevive para a próxima tentativa.
 */
export const mainNavigationRef = createNavigationContainerRef();

const despacharConvite = (codigo) => {
  if (!mainNavigationRef.isReady()) return false;
  mainNavigationRef.navigate('Home', { screen: 'JointJoin', params: { code: codigo } });
  return true;
};

const RootNavigator = () => {
  // ... (estados e useEffect permanecem os mesmos da versão anterior) ...
  const { session, profile, loadingSession, loadingProfile, errorProfile } = useAuth();
  const [shouldStayLoggedIn, setShouldStayLoggedIn] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Calculado aqui em cima (não perto do JSX final) porque o hook abaixo
  // depende dele e TODO hook precisa rodar incondicionalmente, antes de
  // qualquer `return` antecipado (loading/Auth/erro de perfil) — Rules of
  // Hooks. `ehMain` só depende de `profile`, já disponível neste ponto.
  const ehMain = Boolean(profile && profile.onboarding_completed);

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

  // Onboarding e Main são o MESMO <NavigationContainer> (mesma posição/tipo no
  // retorno da função, lá embaixo) — React não o desmonta quando `ehMain` vira
  // `true`, e o `onReady` do react-navigation dispara UMA VEZ NA VIDA do
  // componente (a promise interna de prontidão é fixada na 1ª render; ver
  // `useThenable` em @react-navigation/native). Login/onboarding terminando no
  // MESMO processo (sem cold start) nunca reexecutava `onReady`, e o convite
  // guardado em `guardarConvitePendente` ficava preso até o TTL de 15 min
  // (achado N2).
  //
  // Este efeito cobre esse caminho: quando `ehMain` vira `true` com o
  // container JÁ pronto (cold start já resolvido por `onReady` abaixo), tenta
  // consumir de novo. `mainNavigationRef.isReady()` só é `true` depois que o
  // navigator de baixo registrou o listener de foco — se ainda não estiver,
  // esta tentativa é um no-op seguro e o `onReady` (que só dispara quando o
  // container fica pronto) cobre o caso restante.
  useEffect(() => {
    if (ehMain && mainNavigationRef.isReady()) {
      void consumirConvitePendente(despacharConvite);
    }
  }, [ehMain]);


  console.log('[RootNavigator] Renderizando: session=', !!session, 'shouldStayLoggedIn=', shouldStayLoggedIn, 'loadingSession=', loadingSession, 'isLoadingPreference=', isLoadingPreference, 'loadingProfile=', loadingProfile);


  if (loadingSession || isLoadingPreference) {
    console.log('[RootNavigator] Tela de Loading Inicial: loadingSession=' + loadingSession + ', isLoadingPreference=' + isLoadingPreference);
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent.main} />
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
    // Esta árvore NÃO tem `Home/JointJoin`. A config interceptora guarda o
    // código do convite e devolve `null`, em vez de tentar hidratar uma rota
    // que não existe aqui.
    return (
      <NavigationContainer linking={linkingInterceptor}>
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
        <ActivityIndicator size="large" color={theme.colors.accent.main} />
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

  // O segundo container hospeda Main OU Onboarding, e só a Main tem
  // `Home/JointJoin`. Passar `linkingMain` para o Onboarding faria ele tentar
  // montar uma rota ausente — por isso a escolha é explícita.
  // (`ehMain` já foi calculado no topo da função — ver comentário lá.)

  return (
    <NavigationContainer
      ref={ehMain ? mainNavigationRef : undefined}
      linking={ehMain ? linkingMain : linkingInterceptor}
      onReady={() => {
        // Consome o convite que chegou antes da hora — sem entrar sozinho: a
        // tela abre preenchida e espera a ação do usuário.
        if (ehMain) void consumirConvitePendente(despacharConvite);
      }}
    >
      {NavigatorComponent}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface.canvas,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.text.secondary,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
  },
  errorText: {
    marginHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.xxs,
    color: theme.colors.status.danger,
    fontFamily: theme.fonts.ui,
    fontSize: theme.typography.fontSizes.base,
    textAlign: 'center',
  },
});

export default RootNavigator;