import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { supabaseSecureStorage, migrateLegacySupabaseSession } from '../services/auth/secureStorage';

// Variáveis públicas do app (prefixo EXPO_PUBLIC_), inlinadas pelo babel-preset-expo.
// Mesmo padrão já usado em QuestionnaireScreen.tsx e apiClient.ts.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase URL or Anon Key is missing. Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no .env.");
}

// Migra a sessão legada do AsyncStorage (texto puro) para o SecureStore.
// Exportada como promise para que o AuthContext aguarde a migração antes
// de ler a sessão inicial — evita logout falso no primeiro boot pós-update.
export const storageReady = migrateLegacySupabaseSession(SUPABASE_URL);

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
