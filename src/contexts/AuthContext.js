import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../config/supabaseClient'; // Importa nosso cliente Supabase

// 1. Cria o Contexto
const AuthContext = createContext(null);

// 2. Cria o Provedor do Contexto (Componente que vai envolver o App)
export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null); // Guarda a sessão do Supabase
  const [user, setUser] = useState(null); // Guarda os dados do usuário
  const [loading, setLoading] = useState(true); // Indica se está carregando a sessão inicial

  useEffect(() => {
    // Tenta pegar a sessão existente ao iniciar o app
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null); // Define usuário se houver sessão
      setLoading(false); // Terminou de carregar
    }).catch(error => {
      console.error("Error getting initial session:", error);
      setLoading(false); // Terminou de carregar mesmo com erro
    });

    // Escuta mudanças no estado de autenticação (Login, Logout)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        console.log("Auth State Changed:", _event, session);
        setSession(session);
        setUser(session?.user ?? null); // Atualiza usuário
        setLoading(false); // Garante que parou de carregar
      }
    );

    // Função de limpeza: remove o listener quando o componente desmontar
    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []); // Roda apenas uma vez na montagem

  // Valores que o contexto vai fornecer para os componentes filhos
  const value = {
    session,
    user,
    loading,
    signOut: () => supabase.auth.signOut(), // Adiciona função de logout
    // Adicione aqui funções de signIn, signUp conforme precisar
  };

  // Fornece o 'value' para todos os componentes dentro do Provider
  // Só renderiza os filhos depois que o carregamento inicial terminar
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// 3. Hook customizado para usar o contexto facilmente
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};