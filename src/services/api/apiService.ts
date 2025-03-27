// src/services/api/apiService.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// Configurações padrão da API
const API_CONFIG: AxiosRequestConfig = {
  baseURL: 'https://api.example.com', // Substituir com a URL real da API
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
};

class ApiService {
  private api: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.api = axios.create(API_CONFIG);
    
    // Interceptador para adicionar token de autenticação
    this.api.interceptors.request.use((config) => {
      if (this.authToken && config.headers) {
        config.headers.Authorization = `Bearer ${this.authToken}`;
      }
      return config;
    });
    
    // Interceptador para tratamento de erros
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        // Tratamento centralizado de erros
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Definir token de autenticação
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  // Métodos HTTP genéricos
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.get(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.post(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.put(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.api.delete(url, config);
    return response.data;
  }
}

// Exportar instância única do serviço
export const apiService = new ApiService();