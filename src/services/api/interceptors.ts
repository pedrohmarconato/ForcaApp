// /home/pmarconato/ForcaApp/src/services/api/interceptors.ts
import axios, { AxiosInstance, AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
// Importa funções para obter o token atual e para renovar a autenticação
import { getToken } from '../auth/tokenStorage'; // Ajuste o caminho se necessário
import { refreshAuth } from '../auth/refreshToken'; // Ajuste o caminho se necessário

/**
 * Configura os interceptors de requisição e resposta para uma instância do Axios.
 * - Adiciona o token de autenticação às requisições.
 * - Tenta renovar o token automaticamente em caso de erro 401 (Não Autorizado).
 * @param instance A instância do Axios a ser configurada.
 */
export const setupInterceptors = (instance: AxiosInstance): void => {
  // --- Interceptor de Requisição ---
  // Executado antes de cada requisição ser enviada.
  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      // Adiciona o token de autenticação ao cabeçalho 'Authorization' se disponível.
      try {
        const token = await getToken(); // Busca o token armazenado
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
          console.debug("[Interceptor Request] Token adicionado aos cabeçalhos.");
        } else {
          console.debug("[Interceptor Request] Nenhum token encontrado para adicionar.");
        }
      } catch (error) {
        console.error("[Interceptor Request] Erro ao buscar token:", error);
        // Decide se quer parar a requisição ou continuar sem token
      }
      return config; // Retorna a configuração (modificada ou não)
    },
    (error: AxiosError) => {
      // Lida com erros que ocorrem ANTES da requisição ser enviada.
      console.error("[Interceptor Request] Erro na configuração da requisição:", error);
      return Promise.reject(error);
    }
  );

  // --- Interceptor de Resposta ---
  // Executado após uma resposta ser recebida (sucesso ou erro).
  instance.interceptors.response.use(
    (response: AxiosResponse) => {
      // Para respostas bem-sucedidas (status 2xx), apenas retorna a resposta.
      console.debug(`[Interceptor Response] Sucesso: Status ${response.status} para ${response.config.url}`);
      return response;
    },
    async (error: AxiosError) => {
      // Lida com erros na resposta (status fora de 2xx).
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }; // Adiciona tipo para _retry

      // Verifica se o erro é 401 (Não Autorizado) e se ainda não tentamos renovar (_retry).
      if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
        console.warn("[Interceptor Response] Erro 401 detectado. Tentando renovar token...");
        // Marca a requisição para evitar loop infinito de renovação.
        originalRequest._retry = true;

        try {
          // Tenta renovar o token usando a função importada.
          const newToken = await refreshAuth();
          console.log("[Interceptor Response] Token renovado com sucesso.");

          // Se a renovação foi bem-sucedida e temos um novo token:
          if (newToken && originalRequest.headers) {
            // Atualiza o cabeçalho da requisição original com o novo token.
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            console.debug("[Interceptor Response] Reenviando requisição original com novo token.");
            // Reenvia a requisição original com o novo token.
            return instance(originalRequest);
          } else {
             // Se refreshAuth não retornar um token (pode indicar falha controlada)
             console.error('[Interceptor Response] Função refreshAuth não retornou um novo token.');
             // Decide o que fazer: deslogar, redirecionar, etc.
             // Ex: window.location.href = '/login'; (Não aplicável diretamente em RN)
             // Em RN, você pode usar navegação ou um event emitter.
          }
        } catch (refreshError: any) {
          // Se a função refreshAuth() lançar um erro (ex: refresh token inválido/expirado).
          console.error('[Interceptor Response] Falha ao renovar token:', refreshError?.message || refreshError);
          // Aqui é um bom lugar para deslogar o usuário ou redirecioná-lo para o login.
          // Ex: dispatch(logoutAction()); ou navigation.navigate('Login');
          // Você pode implementar um EventEmitter aqui para notificar a aplicação globalmente.
          // Ex: authEventEmitter.emit('onAuthFailure');
        }
      } else if (error.response?.status === 401 && originalRequest?._retry) {
          console.error("[Interceptor Response] Erro 401 após tentativa de refresh. Não tentando novamente.");
          // Se já tentamos renovar e ainda deu 401, provavelmente o refresh falhou ou o novo token também é inválido.
          // Deslogar o usuário aqui também é uma opção.
      }

      // Para outros erros (não 401) ou se a renovação falhar, rejeita a promise com o erro original.
      return Promise.reject(error);
    }
  );

  console.log("[Interceptors] Interceptors de requisição e resposta configurados.");
};