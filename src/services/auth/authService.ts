import { supabase } from './supabaseClient';
import { saveToken, removeToken } from './tokenStorage';

// Tipo de resposta para as operações de autenticação
interface AuthResponse {
  success: boolean;
  data?: any;
  error?: string;
  user?: any;
}

// Login com email e senha
export const signIn = async (email: string, password: string): Promise<AuthResponse> => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Salvando o token para uso futuro
    if (data?.session?.access_token) {
      await saveToken(data.session.access_token);
    }

    return {
      success: true,
      data,
      user: data?.user,
    };
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return {
      success: false,
      error: error.message || 'Falha ao fazer login',
    };
  }
};

// Cadastro de novo usuário
export const signUp = async (email: string, password: string, username?: string): Promise<AuthResponse> => {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) throw error;

    return {
      success: true,
      data,
      user: data?.user,
    };
  } catch (error) {
    console.error('Erro ao cadastrar:', error);
    return {
      success: false,
      error: error.message || 'Falha ao cadastrar',
    };
  }
};

// Logout
export const signOut = async (): Promise<AuthResponse> => {
  try {
    const { error } = await supabase.auth.signOut();
    
    if (error) throw error;
    
    // Removendo o token armazenado
    await removeToken();
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('Erro ao fazer logout:', error);
    return {
      success: false,
      error: error.message || 'Falha ao fazer logout',
    };
  }
};

// Recuperação de senha
export const resetPassword = async (email: string): Promise<AuthResponse> => {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    
    if (error) throw error;
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Erro ao solicitar redefinição de senha:', error);
    return {
      success: false,
      error: error.message || 'Falha ao solicitar redefinição de senha',
    };
  }
};

// Atualização de senha
export const updatePassword = async (newPassword: string): Promise<AuthResponse> => {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    if (error) throw error;
    
    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Erro ao atualizar senha:', error);
    return {
      success: false,
      error: error.message || 'Falha ao atualizar senha',
    };
  }
};

// Obter o usuário atual
export const getCurrentUser = async (): Promise<AuthResponse> => {
  try {
    const { data, error } = await supabase.auth.getUser();
    
    if (error) throw error;
    
    return {
      success: true,
      user: data?.user,
    };
  } catch (error) {
    console.error('Erro ao obter usuário atual:', error);
    return {
      success: false,
      error: error.message || 'Falha ao obter usuário atual',
    };
  }
};