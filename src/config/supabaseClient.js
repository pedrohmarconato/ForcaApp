import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env'; // Importa as variáveis do .env
import { supabaseSecureStorage } from '../services/auth/secureStorage';

// Validação básica para garantir que as variáveis foram carregadas
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase URL or Anon Key is missing. Check your .env file.");
}

// Cria e exporta o cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Sessão criptografada no Keychain (iOS) / Keystore (Android),
    // em vez de AsyncStorage em texto puro
    storage: supabaseSecureStorage,
    // Persiste a sessão entre reinícios do app
    persistSession: true,
    // Desabilita a detecção de sessão na URL (importante para RN)
    detectSessionInUrl: false,
    // Atualiza a sessão automaticamente em background
    autoRefreshToken: true,
  },
});
