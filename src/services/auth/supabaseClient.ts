import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
// react-native-url-polyfill é necessário para o Supabase funcionar corretamente em React Native
import 'react-native-url-polyfill/auto';

// 1. Ler as variáveis de ambiente COM o prefixo EXPO_PUBLIC_ do arquivo .env
//    Certifique-se de que seu arquivo .env na raiz do projeto tenha:
//    EXPO_PUBLIC_SUPABASE_URL=SUA_URL
//    EXPO_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
console.log("--- [supabaseClient] Lendo variáveis de ambiente Expo ---");
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// --- Logs para depuração ---
// Remova ou comente estes logs em produção se desejar
console.log(`[supabaseClient] EXPO_PUBLIC_SUPABASE_URL lido: ${supabaseUrl ? '*** (presente)' : '!!! (ausente)'}`);
console.log(`[supabaseClient] EXPO_PUBLIC_SUPABASE_ANON_KEY lido: ${supabaseAnonKey ? '*** (presente)' : '!!! (ausente)'}`);
// Descomente para ver os valores (cuidado ao comitar):
// console.log(`[supabaseClient] URL Value: ${supabaseUrl}`);
// console.log(`[supabaseClient] Key Value: ${supabaseAnonKey}`);
// -------------------------

// 2. Verificando rigorosamente se as variáveis foram carregadas
if (!supabaseUrl || typeof supabaseUrl !== 'string' || supabaseUrl.trim() === '') {
  const errorMsg = 'Erro Crítico: A variável de ambiente EXPO_PUBLIC_SUPABASE_URL não está definida ou está vazia no arquivo .env.';
  console.error(errorMsg);
  // Lançar um erro impede que o app continue sem configuração válida
  throw new Error(errorMsg);
}

if (!supabaseAnonKey || typeof supabaseAnonKey !== 'string' || supabaseAnonKey.trim() === '') {
  const errorMsg = 'Erro Crítico: A variável de ambiente EXPO_PUBLIC_SUPABASE_ANON_KEY não está definida ou está vazia no arquivo .env.';
  console.error(errorMsg);
  throw new Error(errorMsg);
}

// 3. Criando o cliente do Supabase
//    As variáveis supabaseUrl e supabaseAnonKey agora contêm os valores corretos (se definidos no .env)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Usa AsyncStorage para armazenar a sessão no dispositivo móvel
    storage: AsyncStorage,
    // Gerencia automaticamente a atualização de tokens
    autoRefreshToken: true,
    // Persiste a sessão entre reinicializações do aplicativo
    persistSession: true,
    // Não tenta detectar sessão na URL (relevante para web)
    detectSessionInUrl: false,
  },
});

console.log("[supabaseClient] Cliente Supabase inicializado com sucesso.");

// 4. Função auxiliar para verificar a conexão (mantida como estava)
//    Útil para diagnosticar problemas de conexão ou permissões de RLS
export const verifySupabaseConnection = async () => {
  try {
    console.log("[supabaseClient] Verificando conexão com Supabase...");
    // Tenta buscar um item de uma tabela pública ou uma com permissão de leitura simples
    // **IMPORTANTE:** Substitua 'nome_tabela_publica_ou_acessivel' pelo nome de uma tabela real
    // que o usuário anônimo ou logado DEVERIA poder acessar (mesmo que vazia).
    // Se não tiver uma tabela assim, esta verificação pode falhar por RLS.
    // Poderia ser a tabela 'profiles' se anônimos tiverem select, ou outra.
    // Usar '.select('*').limit(0)' é eficiente pois não busca dados.
    const { error } = await supabase.from('profiles') // <<< SUBSTITUA SE NECESSÁRIO
                         .select('id', { count: 'exact', head: true }); // Busca apenas contagem/existência

    if (error) {
      console.error("[supabaseClient] Erro na verificação de conexão:", error);
      return {
        success: false,
        message: `Erro ao conectar/consultar Supabase: ${error.message}`,
        details: { error }
      };
    }

    console.log("[supabaseClient] Conexão com Supabase verificada com sucesso.");
    return {
      success: true,
      message: 'Conexão com o Supabase estabelecida e consulta básica realizada com sucesso',
      details: {} // Não precisamos retornar dados aqui
    };
  } catch (error: any) {
     console.error("[supabaseClient] Erro inesperado na verificação de conexão:", error);
    return {
      success: false,
      message: `Erro inesperado ao verificar conexão: ${error.message || 'Erro desconhecido'}`,
      details: { error }
    };
  }
};