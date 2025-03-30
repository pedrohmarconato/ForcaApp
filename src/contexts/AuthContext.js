import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../config/supabaseClient'; // Certifique-se que o caminho está correto
// import AsyncStorage from '@react-native-async-storage/async-storage'; // Descomente se for usar AsyncStorage para algo mais

// 1. Cria o Contexto
// Usamos 'undefined' como valor inicial padrão para poder verificar se o contexto foi usado fora de um Provider
const AuthContext = createContext(undefined);

// 2. Cria o Provedor do Contexto
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true); // Indica carregamento inicial da sessão
  const [loadingProfile, setLoadingProfile] = useState(false); // Indica carregamento específico do perfil
  const [errorProfile, setErrorProfile] = useState(null); // Armazena erros relacionados ao perfil

  // Função para buscar o perfil do usuário
  const fetchProfile = async (userId) => {
    if (!userId) {
      console.log("fetchProfile chamado sem userId, retornando.");
      setProfile(null); // Garante que o perfil seja nulo se não houver ID
      return;
    }

    setLoadingProfile(true);
    setErrorProfile(null); // Limpa erro anterior
    console.log("[AuthContext] Buscando perfil para o usuário ID:", userId);

    try {
      // --- CORREÇÕES APLICADAS AQUI ---
      const { data, error, status } = await supabase
        .from('profiles')         // <--- CORRIGIDO: Usando a nova tabela 'profiles'
        .select('*')              // <--- Opcional: Para otimizar, selecione colunas específicas: 'id, username, full_name, avatar_url' etc.
        .eq('id', userId)         // <--- CORRIGIDO: Usando a coluna 'id' (que é a FK para auth.users)
        .single();                // Espera um único resultado

      // Trata erros da requisição ao Supabase
      // O status 406 era relevante para RLS, mas 404 (Not Found) agora indica tabela errada (corrigido)
      // Outros erros (rede, permissão se RLS estiver errada) ainda podem ocorrer
      if (error) {
        // Não considera mais 406 como "não encontrado", qualquer erro agora é um problema
        console.error("[AuthContext] Erro ao buscar perfil (Supabase):", { status, error });
        throw error; // Lança o erro para ser pego pelo catch abaixo
      }

      // Trata o caso de sucesso (com ou sem dados)
      if (data) {
        console.log("[AuthContext] Perfil encontrado:", data);
        setProfile(data); // Atualiza o estado com os dados do perfil
      } else {
        // Se data é null/undefined e não houve erro, significa que o usuário existe no Auth,
        // mas *não* há uma linha correspondente na tabela 'profiles'.
        // Isso pode acontecer se o trigger 'handle_new_user' falhou ou se o usuário foi criado antes do trigger existir.
        console.warn("[AuthContext] Perfil não encontrado na tabela 'profiles' para o usuário:", userId);
        setProfile(null); // Garante que o perfil fique nulo
      }

    } catch (error) {
      // Captura erros lançados acima ou erros na execução do try block
      console.error("[AuthContext] Erro na função fetchProfile:", error);
      // Define uma mensagem de erro amigável para a UI, se necessário
      setErrorProfile("Não foi possível carregar os dados do perfil.");
      setProfile(null); // Garante que o perfil está nulo em caso de erro
    } finally {
      // Garante que o estado de loading do perfil seja desativado
      setLoadingProfile(false);
      console.log("[AuthContext] fetchProfile finalizado para:", userId);
    }
  };

  // Efeito para lidar com a sessão e o listener de autenticação
  useEffect(() => {
    console.log("[AuthContext] useEffect inicial montado.");
    setLoadingSession(true);
    setLoadingProfile(false); // Reseta loading do perfil no início
    setProfile(null);       // Reseta perfil no início
    setErrorProfile(null);  // Reseta erro do perfil no início

    // 1. Busca a sessão inicial ao carregar o app
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      console.log("[AuthContext] Sessão inicial recuperada:", initialSession ? initialSession.user.id : 'Nenhuma');
      setSession(initialSession);
      const initialUser = initialSession?.user ?? null;
      setUser(initialUser);

      // Só busca o perfil se houver um usuário na sessão inicial
      if (initialUser) {
        fetchProfile(initialUser.id);
      }
      // Marca que o carregamento inicial da sessão terminou
      setLoadingSession(false);

    }).catch(error => {
      console.error("[AuthContext] Erro ao buscar sessão inicial:", error);
      setLoadingSession(false); // Garante que o loading termine mesmo com erro
    });

    // 2. Listener para mudanças futuras no estado de autenticação
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, currentSession) => {
        console.log("[AuthContext] Auth State Changed:", _event, "Usuário:", currentSession?.user?.id ?? 'Nenhum');
        setSession(currentSession); // Atualiza a sessão no estado
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser); // Atualiza o usuário no estado

        // Se o usuário estiver logado (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED)
        if (currentUser) {
          // Busca o perfil se ele ainda não existe no estado OU
          // se o ID do usuário atual for diferente do ID do perfil no estado (caso raro de troca de usuário sem logout)
          // --- CORREÇÃO APLICADA AQUI ---
          if (!profile || profile.id !== currentUser.id) { // <--- CORRIGIDO: Usa profile.id
            console.log(`[AuthContext] Evento '${_event}', buscando perfil para`, currentUser.id);
            fetchProfile(currentUser.id);
          } else {
            console.log(`[AuthContext] Evento '${_event}', perfil já carregado para`, currentUser.id);
          }
        } else if (_event === 'SIGNED_OUT') {
          // Se o evento for SIGNED_OUT, limpa o perfil e o erro relacionado
          console.log("[AuthContext] Evento SIGNED_OUT, limpando perfil.");
          setProfile(null);
          setErrorProfile(null);
          setLoadingProfile(false); // Garante que não fique carregando
        }

        // Garante que o loading da sessão seja falso após o listener ser acionado
        // (embora já deva estar falso após o getSession inicial)
        setLoadingSession(false);
      }
    );

    // Limpeza do listener quando o componente desmontar
    return () => {
      console.log("[AuthContext] useEffect desmontando, cancelando listener.");
      authListener?.subscription?.unsubscribe();
    };
  }, []); // Array de dependências vazio para rodar apenas na montagem e desmontagem

  // --- Funções de Autenticação Expostas ---

  const signIn = async (email, password) => {
    console.log("[AuthContext] Tentando signIn para:", email);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) console.error("[AuthContext] Erro no signIn:", error.message);
    // O onAuthStateChange cuidará de atualizar o estado e chamar fetchProfile
    return { data, error };
  };

  const signUp = async (email, password, options = {}) => {
    console.log("[AuthContext] Tentando signUp para:", email);
    // Passa opções adicionais, como 'data' para metadados que o trigger 'handle_new_user' pode usar
    const { data, error } = await supabase.auth.signUp({ email, password, options });
     if (error) console.error("[AuthContext] Erro no signUp:", error.message);
    // O onAuthStateChange cuidará de atualizar o estado.
    // O trigger no Supabase (handle_new_user) deve criar a linha em 'profiles'.
    return { data, error };
  };

  const resetPassword = async (email) => {
    console.log("[AuthContext] Tentando resetPassword para:", email);
    // Adicione { redirectTo: 'seu-link-de-redirecionamento' } se necessário
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
     if (error) console.error("[AuthContext] Erro no resetPassword:", error.message);
    return { data, error };
  };

  const signOut = async () => {
    console.log("[AuthContext] Tentando signOut.");
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[AuthContext] Erro no signOut:", error.message);
    }
    // O onAuthStateChange cuidará de limpar os estados (session, user, profile)
  };

  // Função para permitir que componentes solicitem uma atualização do perfil
  const refreshProfile = async () => {
    if (user) {
      console.log("[AuthContext] Chamada explícita para refreshProfile.");
      await fetchProfile(user.id); // Reexecuta a busca
    } else {
      console.warn("[AuthContext] refreshProfile chamado sem usuário logado.");
    }
  };


  // --- Valor fornecido pelo contexto ---
  // Agrupa todos os estados e funções que serão expostos pelo contexto
  const value = {
    session,
    user,
    profile,
    // Loading geral: Verdadeiro se a sessão inicial ainda não carregou OU se há uma sessão e o perfil está carregando
    loading: loadingSession || (!!session && loadingProfile),
    loadingSession, // Estado específico do carregamento da sessão
    loadingProfile, // Estado específico do carregamento do perfil
    errorProfile,   // Estado de erro do perfil
    signIn,
    signUp,
    resetPassword,
    signOut,
    refreshProfile, // Expõe a função de refresh
  };

  // Retorna o Provider envolvendo os children (componentes filhos)
  // O Provider disponibiliza o 'value' para todos os componentes que usarem o hook 'useAuth'
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// 3. Hook customizado para usar o contexto facilmente
export const useAuth = () => {
  const context = useContext(AuthContext);
  // Garante que o hook seja usado dentro de um AuthProvider
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context; // Retorna o objeto 'value' com todos os estados e funções
};