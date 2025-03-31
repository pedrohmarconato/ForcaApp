import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../config/supabaseClient'; // Certifique-se que o caminho está correto
import AsyncStorage from '@react-native-async-storage/async-storage'; // <-- Garantir que está importado

// 1. Cria o Contexto
const AuthContext = createContext(undefined);

// 2. Cria o Provedor do Contexto
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [errorProfile, setErrorProfile] = useState(null);

  // Função fetchProfile (permanece igual à versão corrigida anterior)
  const fetchProfile = async (userId) => {
    if (!userId) {
      console.log("fetchProfile chamado sem userId, retornando.");
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    setErrorProfile(null);
    console.log("[AuthContext] Buscando perfil para o usuário ID:", userId);
    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single(); // ou .maybeSingle() se preferir não ter erro PGRST116

      if (error && !(error.code === 'PGRST116' && error.details?.includes('0 rows'))) { // Ignora erro se for '0 rows' com single()
          console.error("[AuthContext] Erro ao buscar perfil (Supabase):", { status, error });
          throw error; // Relança outros erros
      } else if (error && error.code === 'PGRST116') {
         console.warn("[AuthContext] Perfil não encontrado (PGRST116) para o usuário:", userId);
         setProfile(null); // Garante nulo se não encontrado com single()
      } else if (data) {
        console.log("[AuthContext] Perfil encontrado:", data);
        setProfile(data);
      } else {
         console.warn("[AuthContext] Perfil não encontrado (sem dados, sem erro PGRST116) para:", userId);
         setProfile(null);
      }
    } catch (error) {
       if (error.code !== 'PGRST116') { // Não loga erro novamente se já foi tratado acima
          console.error("[AuthContext] Erro na execução de fetchProfile:", error);
       }
      setErrorProfile("Não foi possível carregar os dados do perfil.");
      setProfile(null);
    } finally {
      setLoadingProfile(false);
      console.log("[AuthContext] fetchProfile finalizado para:", userId);
    }
  };


  // useEffect para sessão e listener (permanece igual à versão anterior)
  useEffect(() => {
    console.log("[AuthContext] useEffect inicial montado.");
    setLoadingSession(true);
    setLoadingProfile(false);
    setProfile(null);
    setErrorProfile(null);

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("[AuthContext] Sessão inicial recuperada:", initialSession ? initialSession.user.id : 'Nenhuma');
      setSession(initialSession);
      const initialUser = initialSession?.user ?? null;
      setUser(initialUser);
      if (initialUser) {
        fetchProfile(initialUser.id);
      }
      setLoadingSession(false);
    }).catch(error => {
      console.error("[AuthContext] Erro ao buscar sessão inicial:", error);
      setLoadingSession(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        console.log("[AuthContext] Auth State Changed:", _event, "Usuário:", currentSession?.user?.id ?? 'Nenhum');
        setSession(currentSession);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          if (!profile || profile.id !== currentUser.id) {
            console.log(`[AuthContext] Evento '${_event}', buscando perfil para`, currentUser.id);
            fetchProfile(currentUser.id);
          } else {
            console.log(`[AuthContext] Evento '${_event}', perfil já carregado para`, currentUser.id);
          }
        } else if (_event === 'SIGNED_OUT') {
          console.log("[AuthContext] Evento SIGNED_OUT, limpando perfil.");
          setProfile(null);
          setErrorProfile(null);
          setLoadingProfile(false);
        }
        setLoadingSession(false); // Garante que loading da sessão termine aqui também
      }
    );

    return () => {
      console.log("[AuthContext] useEffect desmontando, cancelando listener.");
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Funções de Autenticação

  const signIn = async (email, password) => {
    console.log("[AuthContext] Tentando signIn para:", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // Não retorna o erro aqui diretamente se já tratamos no LoginScreen,
    // mas pode ser útil retornar para outros usos. Mantendo por enquanto.
    if (error) console.error("[AuthContext] Erro retornado pelo signIn:", error.message);
    return { data, error }; // Retorna para o LoginScreen poder verificar
  };

  const signUp = async (email, password, options = {}) => {
    // ... (implementação signUp igual à anterior) ...
    console.log("[AuthContext] Tentando signUp para:", email);
    const { data, error } = await supabase.auth.signUp({ email, password, options });
     if (error) console.error("[AuthContext] Erro no signUp:", error.message);
    return { data, error };
  };

  const resetPassword = async (email) => {
    // ... (implementação resetPassword igual à anterior) ...
    console.log("[AuthContext] Tentando resetPassword para:", email);
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
     if (error) console.error("[AuthContext] Erro no resetPassword:", error.message);
    return { data, error };
  };

  const signOut = async () => {
    console.log("[AuthContext] Tentando signOut.");
    try {
      // <-- ADICIONADO AQUI -->
      // Limpa a preferência ANTES de deslogar
      console.log("[AuthContext] Removendo preferência 'Manter Conectado' no logout.");
      await AsyncStorage.removeItem('@userShouldStayLoggedIn');
    } catch (e) {
      console.error("[AuthContext] Erro ao remover preferência no logout:", e);
    }

    // Continua com o signOut do Supabase
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Erro no signOut:", error.message);
    }
    // O onAuthStateChange cuidará de limpar os estados
  };

  const refreshProfile = async () => {
     // ... (implementação refreshProfile igual à anterior) ...
    if (user) {
      console.log("[AuthContext] Chamada explícita para refreshProfile.");
      await fetchProfile(user.id);
    } else {
      console.warn("[AuthContext] refreshProfile chamado sem usuário logado.");
    }
  };


  // --- Valor fornecido pelo contexto (igual ao anterior) ---
  const value = {
    session,
    user,
    profile,
    loading: loadingSession || (!!session && loadingProfile),
    loadingSession,
    loadingProfile,
    errorProfile,
    signIn,
    signUp,
    resetPassword,
    signOut,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Hook useAuth (igual ao anterior) ---
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};