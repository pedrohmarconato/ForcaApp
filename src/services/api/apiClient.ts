// /home/pmarconato/ForcaApp/src/services/api/apiClient.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
// Importa a função de configuração de interceptors do arquivo dedicado
import { setupInterceptors } from './interceptors';
// AsyncStorage não é mais diretamente necessário aqui, mas pode ser mantido se outras partes do arquivo o usarem no futuro.
// import AsyncStorage from '@react-native-async-storage/async-storage';

// --- Configuração Principal do Cliente ---

// 1. Leia a variável de ambiente do arquivo .env usando process.env
//    Certifique-se de que EXPO_PUBLIC_API_BASE_URL está no seu .env!
const apiBaseUrlFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

// Log para ajudar a depurar (opcional)
console.log(`[apiClient] Lendo EXPO_PUBLIC_API_BASE_URL: ${apiBaseUrlFromEnv || 'NÃO DEFINIDA'}`);

// 2. Use a variável lida ou um fallback (ajuste o fallback se necessário)
//    IMPORTANTE: Para testes locais com Expo Go, use o IP da sua máquina na rede local.
//    Ex: 'http://192.168.1.10:5001/api' (ajuste porta e caminho base se diferente)
//    O fallback é útil para desenvolvimento local quando a variável de ambiente não está definida.
const effectiveApiBaseUrl = apiBaseUrlFromEnv || 'http://192.168.1.10:5001/api'; // <-- AJUSTE O FALLBACK AQUI SE NECESSÁRIO

// 3. Configurações padrão para todas as requisições
const defaultConfig: AxiosRequestConfig = {
  baseURL: effectiveApiBaseUrl, // <<< USA A VARIÁVEL CORRIGIDA OU O FALLBACK
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json', // Adiciona Accept header para indicar o tipo de resposta esperado
  },
};

// 4. Criando a instância do axios
export const createApiClient = (): AxiosInstance => {
  console.log(`[apiClient] Criando instância com baseURL: ${defaultConfig.baseURL}`);
  const instance = axios.create(defaultConfig);

  // 5. Configurando interceptors usando a função importada de interceptors.ts
  //    Isso aplica a lógica de adição de token e refresh de token.
  setupInterceptors(instance);
  console.log("[apiClient] Interceptors configurados via ./interceptors.ts.");

  return instance;
};

// 6. Instância padrão para uso em toda a aplicação
//    Esta é a instância que outros serviços devem importar.
export const apiClient = createApiClient();

console.log("[apiClient] Instância apiClient criada e exportada.");