import { useState, useEffect, createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { authService } from '../services/supabase/supabase';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, username: string) => Promise<any>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<any>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Carregar sessão inicial
    const loadSession = async () => {
      try {
        setLoading(true);
        const { data, error } = await authService.getCurrentUser();
        
        if (data?.user) {
          setUser(data.user);
          // Buscar detalhes adicionais do perfil se necessário
        }
      } catch (error) {
        console.error('Erro ao carregar sessão:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    // Configurar listener para mudanças de autenticação
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setUser(newSession?.user ?? null);
        setSession(newSession);
      }
    );

    // Cleanup listener
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  // Implementação das funções de autenticação
  const authFunctions = {
    signIn: async (email, password) => {
      setLoading(true);
      try {
        return await authService.signIn(email, password);
      } finally {
        setLoading(false);
      }
    },
    signUp: async (email, password, username) => {
      setLoading(true);
      try {
        return await authService.signUp(email, password, { username });
      } finally {
        setLoading(false);
      }
    },
    signOut: async () => {
      setLoading(true);
      try {
        await authService.signOut();
      } finally {
        setLoading(false);
      }
    },
    resetPassword: async (email) => {
      setLoading(true);
      try {
        return await authService.resetPassword(email);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        session, 
        loading, 
        ...authFunctions 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};