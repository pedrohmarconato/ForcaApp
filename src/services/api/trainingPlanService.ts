// src/services/api/trainingPlanService.ts
import apiClient, { ENDPOINTS } from './apiClient';
import { logger } from '../../utils/logger';

// Geração de plano via LLM pode levar minutos — timeout dedicado, maior que
// o padrão do apiClient. (Trabalho futuro: transformar em job assíncrono
// idempotente para eliminar requisição síncrona longa e risco de duplicação.)
const GENERATE_PLAN_TIMEOUT_MS = 180000; // 3 minutos

/**
 * Envia uma solicitação para o backend para gerar um novo plano de treinamento.
 *
 * O modo offline (plano SIMULADO) só é usado quando explicitamente habilitado
 * via EXPO_PUBLIC_ENABLE_OFFLINE_MODE=true — uma falha de rede real propaga
 * erro, nunca finge sucesso.
 *
 * @param userId - Identificador único do usuário.
 * @param questionnaireData - Respostas do questionário do usuário.
 * @param adjustments - Ajustes solicitados no chat (opcional).
 */
export const requestTrainingPlanGeneration = async (
  userId: string,
  questionnaireData: any,
  adjustments: string[] = []
): Promise<{ success: boolean; message: string; planId?: string }> => {
  logger.log('[TrainingPlanService] Solicitando geração de plano para o usuário:', userId);

  try {
    // NUNCA logar o conteúdo do questionário: contém dados pessoais de saúde.
    const response = await apiClient.post(
      ENDPOINTS.TRAINING.GENERATE_PLAN,
      { questionnaireData, adjustments, userId },
      { timeout: GENERATE_PLAN_TIMEOUT_MS },
    );

    logger.log('[TrainingPlanService] Plano gerado pelo servidor. ID:', response.data?.plan_id);

    return {
      success: true,
      message: response.data?.message || 'Plano de treinamento gerado com sucesso pelo servidor.',
      planId: response.data?.plan_id || `temp-${Date.now()}`,
    };
  } catch (error: any) {
    logger.error(
      '[TrainingPlanService] Falha na geração do plano:',
      error.response?.status || error.code || error.message,
    );

    // Modo offline SOMENTE quando explicitamente habilitado — nunca como
    // efeito colateral silencioso de uma falha de rede.
    // (Leitura por chave computada: o babel-preset-expo inline process.env.EXPO_PUBLIC_*,
    // o que impediria a configuração em tempo de execução/teste.)
    const OFFLINE_FLAG = 'EXPO_PUBLIC_ENABLE_OFFLINE_MODE';
    const isOfflineModeEnabled = process.env[OFFLINE_FLAG] === 'true';

    if (isOfflineModeEnabled) {
      logger.warn('[TrainingPlanService] Modo offline habilitado: retornando plano SIMULADO.');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return {
        success: true,
        message: 'Plano gerado em modo offline (simulado). Conecte-se para sincronizar.',
        planId: `offline-${Date.now()}`,
      };
    }

    throw new Error(
      error.response?.data?.error ||
      'Falha ao comunicar com o servidor para gerar o plano de treinamento.',
    );
  }
};
