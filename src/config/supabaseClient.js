import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env'; // Importa as variáveis do .env

// Validação básica para garantir que as variáveis foram carregadas
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase URL or Anon Key is missing. Check your .env file.");
}

// Cria e exporta o cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Especifica o AsyncStorage para guardar a sessão no React Native
    storage: AsyncStorage,
    // Persiste a sessão entre reinícios do app
    persistSession: true,
    // Desabilita a detecção de sessão na URL (importante para RN)
    detectSessionInUrl: false,
    // Atualiza a sessão automaticamente em background
    autoRefreshToken: true,
  },
});