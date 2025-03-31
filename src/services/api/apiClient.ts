import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { setupInterceptors } from './interceptors'; // Garanta que este arquivo também não usa 'react-native-config'

// --- CERTIFIQUE-SE DE QUE NÃO HÁ 'import Config from 'react-native-config';' NESTE ARQUIVO ---

// 1. Leia a variável de ambiente do arquivo .env usando process.env
//    Certifique-se de que EXPO_PUBLIC_API_BASE_URL está no seu .env!
const apiBaseUrlFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

// Log para ajudar a depurar (opcional)
console.log(`[apiClient] Lendo EXPO_PUBLIC_API_BASE_URL: ${apiBaseUrlFromEnv || 'NÃO DEFINIDA'}`);

// 2. Use a variável lida ou um fallback
const effectiveApiBaseUrl = apiBaseUrlFromEnv || 'http://localhost:5000/api'; // Fallback para dev local

// 3. Configurações padrão para todas as requisições
const defaultConfig: AxiosRequestConfig = {
  baseURL: effectiveApiBaseUrl, // <<< USA A VARIÁVEL CORRIGIDA
  timeout: 30000, // 30 segundos
  headers: {
    'Content-Type': 'application/json',
    // Adicione outros headers padrão aqui se necessário
  },
};

// 4. Criando a instância do axios
export const createApiClient = (): AxiosInstance => {
  console.log(`[apiClient] Criando instância com baseURL: ${defaultConfig.baseURL}`);
  const instance = axios.create(defaultConfig);

  // 5. Configurando interceptors (Verifique './interceptors' também!)
  setupInterceptors(instance);

  return instance;
};

// 6. Instância padrão para uso em toda a aplicação
export const apiClient = createApiClient();

console.log("[apiClient] Instância apiClient criada.");