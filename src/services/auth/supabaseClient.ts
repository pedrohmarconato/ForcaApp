import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import Config from 'react-native-config';

// Pegando as credenciais do Supabase das variáveis de ambiente
const supabaseUrl = Config.SUPABASE_URL;
const supabaseAnonKey = Config.SUPABASE_ANON_KEY;

// Verificando se as credenciais estão definidas
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Erro: As variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY devem ser definidas.');
}

// Criando o cliente do Supabase com AsyncStorage para persistência em ambiente mobile
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Função para verificar a conexão com o Supabase
export const verifySupabaseConnection = async () => {
  try {
    // Uma operação simples para verificar se o Supabase está respondendo
    const { data, error } = await supabase.from('user_profiles').select('id').limit(1);
    
    if (error) {
      return {
        success: false,
        message: `Erro ao conectar com o Supabase: ${error.message}`,
        details: { error }
      };
    }
    
    return {
      success: true,
      message: 'Conexão com o Supabase estabelecida com sucesso',
      details: { data }
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao verificar conexão: ${error.message}`,
      details: { error }
    };
  }
};