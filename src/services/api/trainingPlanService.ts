// /home/pmarconato/ForcaApp/src/services/api/trainingPlanService.ts
import { apiClient } from './apiClient'; // Importa a instância configurada do Axios
import { ENDPOINTS } from './endpoints'; // Importa as definições centralizadas de endpoints
import axios from 'axios'; // Importa Axios para usar tipos como AxiosError

// Interface para os dados enviados ao backend para gerar o plano
interface GeneratePlanPayload {
  questionnaireData: any; // TODO: Definir uma interface mais específica para os dados do questionário
  adjustments: string[];  // Ajustes coletados do chat ou outra fonte
}

// Interface para a resposta esperada do backend após a geração do plano
interface GeneratePlanResponse {
  status: string;    // Ex: "success", "error"
  message: string;    // Mensagem de confirmação ou detalhe do erro
  plan_id?: string;    // ID do plano gerado (opcional, dependendo da resposta da API)
  // Adicione outros campos que sua API possa retornar
}

/**
 * Solicita a geração do plano de treinamento no backend.
 * Envia os dados do questionário e quaisquer ajustes necessários.
 *
 * @param payload - Os dados (questionário, ajustes) a serem enviados para a API.
 * @returns Uma Promise que resolve com a resposta da API (`GeneratePlanResponse`) em caso de sucesso.
 * @throws Lança um erro (com mensagem tratada) se a chamada de API falhar ou o backend retornar um erro lógico.
 */
export const requestTrainingPlanGeneration = async (
  payload: GeneratePlanPayload
): Promise<GeneratePlanResponse> => {
  console.log('[TrainingPlanService] Solicitando geração de plano...');
  // Evite logar o payload completo em produção se contiver dados sensíveis. Logar chaves ou contagens é mais seguro.
  console.debug('[TrainingPlanService] Payload (info):', {
    questionnaireKeysCount: Object.keys(payload.questionnaireData || {}).length,
    adjustmentsCount: payload.adjustments?.length ?? 0,
  });

  try {
    // Usa o apiClient importado para fazer a requisição POST
    // Utiliza o endpoint centralizado de ENDPOINTS.ts
    const response = await apiClient.post<GeneratePlanResponse>(
      ENDPOINTS.TRAINING.GENERATE_PLAN, // <<< USA O ENDPOINT CENTRALIZADO
      payload
    );

    console.log('[TrainingPlanService] Resposta da API recebida:', response.data);

    // Verifica se a resposta HTTP foi bem-sucedida (status 2xx) E se a lógica do backend indica sucesso
    // Ajuste a condição `response.data?.status === 'success'` conforme a estrutura real da sua API
    if (response.status >= 200 && response.status < 300 && response.data?.status === 'success') {
      return response.data; // Retorna os dados da resposta em caso de sucesso
    } else {
      // Trata casos onde o status HTTP é 2xx mas a resposta indica falha lógica (ex: validação falhou no backend)
      const errorMessage = response.data?.message || 'O backend retornou uma resposta inesperada ou indicou falha.';
      console.warn(`[TrainingPlanService] Resposta da API não indica sucesso explícito: ${errorMessage}`);
      // Lança um erro para ser tratado pelo código que chamou esta função
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    console.error('[TrainingPlanService] Erro ao solicitar geração do plano:', error);

    let errorMessage = 'Erro de comunicação com o servidor ao solicitar o plano.';

    // Tenta extrair uma mensagem de erro mais específica do erro Axios
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // O servidor respondeu com um status de erro (4xx, 5xx)
        // Tenta pegar a mensagem de erro do corpo da resposta da API
        errorMessage = error.response.data?.error // Campo 'error' comum
                       || error.response.data?.message // Campo 'message' comum
                       || `Erro ${error.response.status} do servidor ao acessar ${error.config?.url}.`; // Fallback
        console.error(`[TrainingPlanService] Erro ${error.response.status} da API: ${errorMessage}`, error.response.data);
      } else if (error.request) {
        // A requisição foi feita mas não houve resposta (problema de rede, servidor offline, timeout)
        errorMessage = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e se a API está online.';
        console.error(`[TrainingPlanService] ${errorMessage}`);
      } else {
        // Erro na configuração da requisição (antes de ser enviada)
        errorMessage = `Erro ao configurar a requisição para o plano: ${error.message}`;
        console.error(`[TrainingPlanService] ${errorMessage}`);
      }
    } else {
      // Erro não relacionado ao Axios (ex: erro de lógica no código antes da chamada)
      errorMessage = error.message || 'Ocorreu um erro inesperado durante a solicitação do plano.';
      console.error(`[TrainingPlanService] Erro não-Axios: ${errorMessage}`);
    }

    // Lança um novo erro com a mensagem tratada para ser capturado e exibido ao usuário no componente/tela
    throw new Error(errorMessage);
  }
};