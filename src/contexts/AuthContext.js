import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../config/supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 1. Cria o Contexto
const AuthContext = createContext(null);

// 2. Cria o Provedor do Contexto
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [errorProfile, setErrorProfile] = useState(null);

  // Função para buscar o perfil do usuário
  const fetchProfile = async (userId) => {
    if (!userId) return;
    setLoadingProfile(true);
    setErrorProfile(null);
    console.log("Buscando perfil para o usuário ID:", userId);
    try {
      const { data, error, status } = await supabase
        .from('dim_usuario')
        .select(`*`)
        .eq('usuario_id', userId)
        .single();

      if (error && status !== 406) {
        console.error("Erro ao buscar perfil (Supabase):", error);
        throw error;
      }

      if (data) {
        console.log("Perfil encontrado:", data);
        setProfile(data);
      } else {
        console.warn("Perfil não encontrado para o usuário:", userId);
        setProfile(null); // Mantém nulo se não encontrar
      }
    } catch (error) {
      console.error("Erro na função fetchProfile:", error);
      setErrorProfile("Não foi possível carregar os dados do perfil.");
      setProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  // Efeito para lidar com a sessão e o listener de autenticação
  useEffect(() => {
    setLoadingSession(true);
    setLoadingProfile(false);
    setProfile(null);
    setErrorProfile(null);

    // Busca sessão inicial
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("Sessão inicial:", initialSession);
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setLoadingSession(false);
      if (initialSession?.user) {
        fetchProfile(initialSession.user.id);
      }
    }).catch(error => {
      console.error("Erro ao buscar sessão inicial:", error);
      setLoadingSession(false);
    });

    // Listener para mudanças de estado de autenticação
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        console.log("Auth State Changed:", _event, currentSession);
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        setLoadingSession(false); // Garante que parou de carregar sessão

        if (currentUser && (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED' || _event === 'USER_UPDATED')) {
          // Busca perfil apenas se o usuário mudou ou se o perfil ainda não foi carregado
          if (!profile || profile.usuario_id !== currentUser.id) {
             fetchProfile(currentUser.id);
          }
        } else if (_event === 'SIGNED_OUT') {
          setProfile(null);
          setLoadingProfile(false);
          setErrorProfile(null);
        }
      }
    );

    // Limpeza do listener
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []); // Dependência vazia para rodar apenas uma vez

  // --- Funções de Autenticação --- // CÓDIGO REAL AQUI

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // O onAuthStateChange vai pegar o evento SIGNED_IN e chamar fetchProfile
    return { data, error };
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    // O onAuthStateChange vai pegar o evento (pode ser SIGNED_IN ou não, dependendo da confirmação)
    // O trigger no Supabase deve criar a linha em dim_usuario
    return { data, error };
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    // Idealmente, adicionar opções como redirectTo aqui se necessário
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) { console.error("Error signing out:", error); }
    // O onAuthStateChange vai pegar o evento SIGNED_OUT e limpar os estados
  };

  // --- Valor fornecido pelo contexto ---
  const value = {
    session,
    user,
    profile,
    // Loading geral é true se sessão OU perfil estiverem carregando
    loading: loadingSession || (session && loadingProfile),
    loadingSession, // Para casos específicos se necessário
    loadingProfile, // Para casos específicos se necessário
    errorProfile,
    signIn,
    signUp,
    resetPassword,
    signOut,
    // Função para explicitamente recarregar o perfil
    refreshProfile: () => user ? fetchProfile(user.id) : Promise.resolve(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// 3. Hook customizado para usar o contexto facilmente // CÓDIGO REAL AQUI
export const useAuth = () => {
  const context = useContext(AuthContext);
  // Esta verificação garante que o hook só é usado dentro do Provider
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  // Retorna o objeto 'value' definido acima
  return context;
};