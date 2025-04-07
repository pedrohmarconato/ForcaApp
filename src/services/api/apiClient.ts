// /home/pmarconato/ForcaApp/src/services/api/apiClient.ts
import axios from 'axios';

// Obtém a URL base da API a partir das variáveis de ambiente (ex: .env)
const apiBaseUrlFromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

// Define a URL base efetiva para as chamadas da API.
// Se a variável de ambiente EXPO_PUBLIC_API_BASE_URL não estiver definida,
// utiliza 'http://localhost:5001/api' como padrão.
// Isso é útil para desenvolvimento local, apontando para o servidor Flask.
const effectiveApiBaseUrl = apiBaseUrlFromEnv || 'http://localhost:5001/api';

// Cria uma instância configurada do Axios (cliente HTTP)
const apiClient = axios.create({
  baseURL: effectiveApiBaseUrl, // Define a URL base para todas as requisições feitas com esta instância
  // Outras configurações globais do Axios podem ser adicionadas aqui. Exemplo:
  // headers: { 'Content-Type': 'application/json' },
  // timeout: 10000, // Timeout de 10 segundos
});

// Log para depuração: informa qual URL base está sendo usada ao iniciar o app.
console.log(`[ApiClient] Configurado para usar a URL base: ${effectiveApiBaseUrl}`);

// Interceptor de Requisição: Executa antes de cada requisição ser enviada.
apiClient.interceptors.request.use(config => {
  // Útil para adicionar dados comuns a todas as requisições (ex: token de autenticação)
  // ou para logar informações da requisição.
  console.log(`[ApiClient] Iniciando requisição para: ${config.url}`);
  // É essencial retornar a configuração (config) para que a requisição prossiga.
  return config;
}, error => {
  // Trata erros que ocorrem durante a configuração da requisição.
  console.error('[ApiClient] Erro ao preparar requisição:', error);
  // Rejeita a promessa para que o erro seja tratado onde a chamada foi feita.
  return Promise.reject(error);
});

// Interceptor de Resposta: Executa após receber uma resposta (ou erro) do servidor.
apiClient.interceptors.response.use(response => {
  // Executado para respostas com status de sucesso (2xx).
  // Útil para logar ou transformar dados da resposta globalmente.
  console.log(`[ApiClient] Resposta recebida de: ${response.config.url}, Status: ${response.status}`);
  // É essencial retornar a resposta (response) para que ela chegue ao local da chamada.
  return response;
}, error => {
  // Executado para respostas com status de erro (fora da faixa 2xx).
  // Tratamento centralizado de erros de resposta da API.
  console.error('[ApiClient] Erro na resposta:', error.response?.status, error.response?.data || error.message);

  // Verifica especificamente por 'Network Error', que geralmente indica que o servidor
  // não está acessível (offline, URL errada, problema de CORS não tratado pelo servidor).
  if (error.message === 'Network Error' && !error.response) {
    console.error('[ApiClient] Erro de rede detectado. O servidor backend pode estar offline ou inacessível.');
    // Poderia adicionar lógica aqui para notificar o usuário ou tentar novamente.
  }
  // Rejeita a promessa com o erro para que ele seja tratado no local da chamada (ex: no service).
  return Promise.reject(error);
});


// Define uma estrutura para organizar os endpoints da API.
export const ENDPOINTS = {
  TRAINING: {
    GENERATE_PLAN: '/generate-training-plan', // Endpoint para gerar plano de treino
    // Exemplo: GET_PLAN: '/training-plan/:planId',
  },
  USER: {
    // Exemplo: GET_PROFILE: '/user/profile',
  }
  // Adicione outros módulos da API aqui (ex: PROGRESS, AUTH)
};

// Exporta a instância configurada do apiClient para ser usada nos services.
export default apiClient;