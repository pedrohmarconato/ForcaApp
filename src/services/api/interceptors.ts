import { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { getToken } from '../auth/tokenStorage';
import { refreshAuth } from '../auth/refreshToken';

export const setupInterceptors = (instance: AxiosInstance): void => {
  // Interceptor de request
  instance.interceptors.request.use(
    async (config) => {
      // Adiciona o token de autenticação se disponível
      const token = await getToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Interceptor de resposta
  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config;
      
      // Verifica se o erro é de autenticação (401) e tenta renovar o token
      if (error.response?.status === 401 && originalRequest && !originalRequest.headers?._retry) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers._retry = true;
        
        try {
          // Tenta renovar o token
          const newToken = await refreshAuth();
          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return instance(originalRequest);
          }
        } catch (refreshError) {
          // Se não conseguir renovar o token, redireciona para login
          // Você pode implementar um EventEmitter aqui para notificar a aplicação
          console.error('Falha ao renovar token:', refreshError);
        }
      }
      
      return Promise.reject(error);
    }
  );
};