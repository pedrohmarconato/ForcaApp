// /home/pmarconato/ForcaApp/src/services/api/trainingPlanService.ts
import apiClient, { ENDPOINTS } from './apiClient';

/**
 * Envia uma solicitação para o backend para gerar um novo plano de treinamento.
 * Implementa um mecanismo de fallback para simular a geração em modo offline
 * caso ocorra um erro de rede ou se o modo offline estiver explicitamente habilitado.
 *
 * @param userId - Identificador único do usuário.
 * @param questionnaireData - Objeto contendo as respostas do questionário do usuário.
 * @param adjustments - Array de strings descrevendo ajustes solicitados (opcional).
 * @returns Uma Promise que resolve para um objeto contendo:
 *          - success (boolean): true se a operação foi bem-sucedida (ou simulada com sucesso).
 *          - message (string): Mensagem descritiva sobre o resultado.
 *          - planId (string | undefined): O ID do plano gerado (real ou simulado).
 */
export const requestTrainingPlanGeneration = async (
  userId: string,
  questionnaireData: any,
  adjustments: string[] = []
): Promise<{ success: boolean; message: string; planId?: string }> => {
  // Log inicial indicando o início da operação.
  console.log('[TrainingPlanService] Solicitando geração de plano para o usuário:', userId);

  try {
    // Tentativa de enviar os dados para o backend via POST.
    console.log('[TrainingPlanService] Enviando dados para API:', { questionnaireData, adjustments, userId });
    const response = await apiClient.post(
      ENDPOINTS.TRAINING.GENERATE_PLAN, // Usa o endpoint definido no apiClient
      { questionnaireData, adjustments, userId } // Dados enviados no corpo da requisição
    );

    // Log da resposta recebida do servidor em caso de sucesso.
    console.log('[TrainingPlanService] Resposta do servidor recebida com sucesso:', response.data);

    // Retorna um objeto indicando sucesso e incluindo dados da resposta.
    // Se a API não retornar uma mensagem, usa uma padrão.
    // Garante que um planId seja retornado, usando um temporário se a API não fornecer.
    return {
      success: true,
      message: response.data?.message || "Plano de treinamento gerado com sucesso pelo servidor.",
      planId: response.data?.plan_id || `temp-${Date.now()}` // Fallback para planId
    };

  } catch (error: any) {
    // Captura qualquer erro ocorrido durante a chamada da API.
    // Log detalhado do erro para facilitar a depuração.
    console.error('[TrainingPlanService] Erro ao solicitar geração do plano via API:', error.message, error.code, error.response?.data);

    // Verifica se o modo offline está habilitado via variável de ambiente.
    const isOfflineModeEnabled = process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE === 'true';
    // Verifica se o erro é um 'Network Error' (sem resposta do servidor).
    const isNetworkError = error.message === 'Network Error' && !error.response;

    // Ativa o modo fallback se o modo offline estiver habilitado OU se for um erro de rede.
    if (isOfflineModeEnabled || isNetworkError) {
      // Log informando que o modo fallback está sendo ativado e o motivo.
      console.warn(`[TrainingPlanService] ${isNetworkError ? 'Erro de rede detectado.' : ''} Ativando modo offline/fallback para geração de plano.`);

      // Simula um atraso (ex: 1.5 segundos) para que a UI não responda instantaneamente,
      // dando a impressão de uma operação assíncrona real.
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Retorna uma resposta simulada de sucesso para o modo offline.
      // Isso permite que a aplicação continue funcionando (ex: exibindo uma mensagem)
      // mesmo sem conexão com o backend.
      return {
        success: true, // Indica sucesso para a lógica da aplicação.
        message: "Plano gerado em modo offline (simulado). Conecte-se para sincronizar.",
        planId: `offline-${Date.now()}` // Gera um ID único para identificar planos offline.
      };
    }

    // Se o erro não for de rede e o modo offline não estiver habilitado,
    // o erro é considerado uma falha real da API ou lógica.
    // Propaga o erro para que a camada superior (ex: componente React Native) possa tratá-lo.
    console.error('[TrainingPlanService] Erro não tratado pelo fallback. Propagando o erro.');
    // Lança um novo erro com uma mensagem mais amigável, tentando extrair a mensagem de erro da API,
    // ou usando a mensagem do erro original, ou uma mensagem genérica.
    throw new Error(
      error.response?.data?.error || // Tenta usar a mensagem de erro específica da API (se houver)
      error.message || // Senão, usa a mensagem do objeto de erro
      'Falha ao comunicar com o servidor para gerar o plano de treinamento.' // Mensagem genérica
    );
  }
};

// Outras funções relacionadas ao serviço de plano de treinamento podem ser adicionadas aqui.
// Exemplo:
// export const getTrainingPlan = async (planId: string): Promise<any> => { ... }
// export const updateTrainingPlan = async (planId: string, updates: any): Promise<any> => { ... }