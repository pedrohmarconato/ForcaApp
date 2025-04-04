// /home/pmarconato/ForcaApp/src/contexts/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../config/supabaseClient'; // Certifique-se que o caminho está correto
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  // --- Função signOut (definida antes para ser acessível em fetchProfile) ---
  // Movida para cima para clareza de escopo, mas a ordem de definição não importa em JS
  const signOut = async () => {
    console.log("[AuthContext] Tentando signOut.");
    try {
      console.log("[AuthContext] Removendo preferência 'Manter Conectado' no logout.");
      await AsyncStorage.removeItem('@userShouldStayLoggedIn');
    } catch (e) {
      console.error("[AuthContext] Erro ao remover preferência no logout:", e);
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Erro no signOut do Supabase:", error.message);
    }
    // O onAuthStateChange cuidará de limpar os estados session, user, profile
    console.log("[AuthContext] signOut chamado. onAuthStateChange deve limpar o estado.");
  };


  // --- Função fetchProfile com tratamento de erro 401 ---
  const fetchProfile = async (userId) => {
    if (!userId) {
      console.log("[AuthContext] fetchProfile chamado sem userId, retornando.");
      setProfile(null);
      setLoadingProfile(false); // Garante que o loading termine
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
        .single();

      // Tratamento de erro da resposta do Supabase
      if (error) {
        // Ignora erro específico de '0 rows' quando se usa .single()
        if (!(error.code === 'PGRST116' && error.details?.includes('0 rows'))) {
          console.error("[AuthContext] Erro ao buscar perfil (Supabase):", { status, error });
          // Lança o erro para ser pego pelo catch abaixo
          // Adiciona o status ao erro para facilitar a verificação no catch
          error.status = status;
          throw error;
        } else {
          // Caso de perfil não encontrado (PGRST116)
          console.warn("[AuthContext] Perfil não encontrado (PGRST116) para o usuário:", userId);
          setProfile(null);
        }
      } else if (data) {
        // Perfil encontrado com sucesso
        console.log("[AuthContext] Perfil encontrado:", data);
        setProfile(data);
      } else {
        // Caso raro: sem dados e sem erro PGRST116
        console.warn("[AuthContext] Perfil não encontrado (sem dados, sem erro PGRST116) para:", userId);
        setProfile(null);
      }
    } catch (error) {
      console.error("[AuthContext] Erro na execução de fetchProfile:", error);

      // --- AJUSTE PRINCIPAL AQUI ---
      // Verifica se o erro é de autenticação (status 401 - Unauthorized)
      // Isso geralmente inclui "JWT expired" mas pode incluir outros erros 401
      if (error && error.status === 401) {
        console.warn("[AuthContext] Erro 401 detectado (provavelmente JWT expirado). Deslogando usuário.");
        setErrorProfile("Sua sessão expirou. Por favor, faça login novamente."); // Mensagem para o usuário
        setProfile(null); // Limpa o perfil local
        // Chama a função signOut para limpar a sessão inválida
        await signOut();
        // O loadingProfile será setado para false no finally
      } else if (error.code !== 'PGRST116') {
        // Trata outros erros (exceto o já tratado PGRST116)
        setErrorProfile("Não foi possível carregar os dados do perfil.");
        setProfile(null);
      }
      // Se for PGRST116, já foi tratado no bloco 'if (error)' dentro do try, então não faz nada aqui.
      // --- FIM DO AJUSTE ---

    } finally {
      setLoadingProfile(false); // Garante que o loading termine em todos os casos
      console.log("[AuthContext] fetchProfile finalizado para:", userId);
    }
  };


  // useEffect para sessão e listener (sem alterações necessárias aqui)
  useEffect(() => {
    console.log("[AuthContext] useEffect inicial montado.");
    setLoadingSession(true);
    setLoadingProfile(false); // Reset inicial
    setProfile(null); // Reset inicial
    setErrorProfile(null); // Reset inicial

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("[AuthContext] Sessão inicial recuperada:", initialSession ? initialSession.user.id : 'Nenhuma');
      setSession(initialSession);
      const initialUser = initialSession?.user ?? null;
      setUser(initialUser);
      if (initialUser) {
        fetchProfile(initialUser.id); // Chama fetchProfile que agora trata 401
      } else {
        setLoadingProfile(false); // Se não há usuário, perfil não está carregando
      }
      setLoadingSession(false);
    }).catch(error => {
      console.error("[AuthContext] Erro ao buscar sessão inicial:", error);
      setLoadingSession(false);
      setLoadingProfile(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        console.log("[AuthContext] Auth State Changed:", _event, "Usuário:", currentSession?.user?.id ?? 'Nenhum');
        const currentUser = currentSession?.user ?? null;

        // Atualiza sessão e usuário ANTES de buscar perfil
        setSession(currentSession);
        setUser(currentUser);

        if (currentUser) {
          // Busca perfil se:
          // 1. Não há perfil carregado OU
          // 2. O perfil carregado é de outro usuário OU
          // 3. O evento é SIGNED_IN ou TOKEN_REFRESHED (para garantir dados atualizados)
          if (!profile || profile.id !== currentUser.id || _event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
            console.log(`[AuthContext] Evento '${_event}', buscando/atualizando perfil para`, currentUser.id);
            await fetchProfile(currentUser.id); // Chama fetchProfile que agora trata 401
          } else {
            console.log(`[AuthContext] Evento '${_event}', perfil já carregado e corresponde para`, currentUser.id);
            // Garante que loadingProfile esteja false se não buscou
            setLoadingProfile(false);
          }
        } else { // Se não há currentUser (ex: SIGNED_OUT)
          console.log("[AuthContext] Evento resultou em nenhum usuário, limpando perfil.");
          setProfile(null);
          setErrorProfile(null);
          setLoadingProfile(false);
        }
        // Garante que loading da sessão termine após processar o evento
        setLoadingSession(false);
      }
    );

    return () => {
      console.log("[AuthContext] useEffect desmontando, cancelando listener.");
      authListener?.subscription?.unsubscribe();
    };
  }, []); // Array de dependências vazio para rodar apenas na montagem/desmontagem

  // Funções de Autenticação (signIn, signUp, resetPassword - sem alterações)
  const signIn = async (email, password) => {
    console.log("[AuthContext] Tentando signIn para:", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) console.error("[AuthContext] Erro retornado pelo signIn:", error.message);
    return { data, error };
  };

  const signUp = async (email, password, options = {}) => {
    console.log("[AuthContext] Tentando signUp para:", email);
    const { data, error } = await supabase.auth.signUp({ email, password, options });
    if (error) console.error("[AuthContext] Erro no signUp:", error.message);
    return { data, error };
  };

  const resetPassword = async (email) => {
    console.log("[AuthContext] Tentando resetPassword para:", email);
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) console.error("[AuthContext] Erro no resetPassword:", error.message);
    return { data, error };
  };

  // Função refreshProfile (sem alterações)
  const refreshProfile = async () => {
    if (user) {
      console.log("[AuthContext] Chamada explícita para refreshProfile.");
      await fetchProfile(user.id); // Chama a versão atualizada de fetchProfile
    } else {
      console.warn("[AuthContext] refreshProfile chamado sem usuário logado.");
    }
  };


  // --- Valor fornecido pelo contexto ---
  const value = {
    session,
    user,
    profile,
    // Loading considera sessão E perfil (se houver sessão)
    loading: loadingSession || (!!session && loadingProfile),
    loadingSession,
    loadingProfile,
    errorProfile,
    signIn,
    signUp,
    resetPassword,
    signOut, // Exporta a função signOut atualizada
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// --- Hook useAuth (sem alterações) ---
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};