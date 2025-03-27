import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { setupInterceptors } from './interceptors';
import Config from 'react-native-config';

// Configurações padrão para todas as requisições
const defaultConfig: AxiosRequestConfig = {
  baseURL: Config.API_BASE_URL || 'http://localhost:5000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

// Criando a instância do axios
export const createApiClient = (): AxiosInstance => {
  const instance = axios.create(defaultConfig);
  
  // Configurando interceptors
  setupInterceptors(instance);
  
  return instance;
};

// Instância padrão para uso em toda a aplicação
export const apiClient = createApiClient();