import { supabase } from './supabaseClient';
import { saveToken } from './tokenStorage';

export const refreshAuth = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    
    if (error) throw error;
    
    const newToken = data?.session?.access_token;
    
    if (newToken) {
      await saveToken(newToken);
      return newToken;
    }
    
    return null;
  } catch (error) {
    console.error('Erro ao renovar token:', error);
    return null;
  }
};