import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Erro: Credenciais Supabase ausentes nas variáveis de ambiente');
}

// Inicialização do cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Serviço de autenticação
export const authService = {
  signIn: async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({ email, password });
  },
  
  signUp: async (email: string, password: string, userData: Record<string, any>) => {
    return await supabase.auth.signUp({ 
      email, 
      password,
      options: { data: userData }
    });
  },
  
  signOut: async () => {
    return await supabase.auth.signOut();
  },
  
  resetPassword: async (email: string) => {
    return await supabase.auth.resetPasswordForEmail(email);
  },
  
  getCurrentUser: async () => {
    return await supabase.auth.getUser();
  }
};

// Serviço de perfil do usuário
export const profileService = {
  getProfile: async (userId: string) => {
    return await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
  },
  
  updateProfile: async (userId: string, data: Record<string, any>) => {
    return await supabase
      .from('user_profiles')
      .update(data)
      .eq('id', userId);
  }
};

// Serviço de treinos
export const workoutService = {
  getUserWorkouts: async (userId: string) => {
    return await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
  },
  
  getWorkoutDetails: async (workoutId: string) => {
    return await supabase
      .from('training_sessions')
      .select('*')
      .eq('training_plan_id', workoutId)
      .order('date', { ascending: true });
  }
};