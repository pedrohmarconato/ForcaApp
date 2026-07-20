// src/services/api/trainingPlanService.ts
import apiClient, { ENDPOINTS } from './apiClient';
import { logger } from '../../utils/logger';

// Geração de plano via LLM pode levar minutos — timeout dedicado, maior que
// o padrão do apiClient. Cadeia ponta a ponta (achado #3 do review do PR #19):
// auth ≤10s + Anthropic ≤150s + persistência ≤20s = ≤180s < ESTE timeout
// (190s) < nginx proxy_read_timeout (200s). 180s exatos não davam margem — o
// app abortava (ECONNABORTED) uma geração que ia concluir. (Trabalho futuro:
// job assíncrono idempotente para eliminar a requisição síncrona longa.)
const GENERATE_PLAN_TIMEOUT_MS = 190000;

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
): Promise<{ success: boolean; message: string; planId?: string; offline?: boolean }> => {
  logger.log('[TrainingPlanService] Solicitando geração de plano para o usuário:', userId);

  try {
    // NUNCA logar o conteúdo do questionário: contém dados pessoais de saúde.
    const response = await apiClient.post(
      ENDPOINTS.TRAINING.GENERATE_PLAN,
      { questionnaireData, adjustments, userId },
      { timeout: GENERATE_PLAN_TIMEOUT_MS },
    );

    // O plan_id é o ID REAL do banco (uuid): sem ele não há sucesso.
    // IDs fabricados ("temp-...") quebrariam a FK de profiles.current_plan_id
    // depois de já termos reportado sucesso (achado #10 do review).
    const planId = response.data?.plan_id;
    if (typeof planId !== 'string' || planId.length === 0) {
      throw new Error('Resposta do servidor sem o identificador do plano.');
    }

    logger.log('[TrainingPlanService] Plano gerado pelo servidor. ID:', planId);

    return {
      success: true,
      message: response.data?.message || 'Plano de treinamento gerado com sucesso pelo servidor.',
      planId,
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
      // SEM planId: não existe plano no banco, e um ID fabricado quebraria a
      // FK uuid de profiles.current_plan_id (achado #10 do review).
      return {
        success: true,
        offline: true,
        message: 'Plano gerado em modo offline (simulado). Conecte-se para sincronizar.',
      };
    }

    throw new Error(
      error.response?.data?.error ||
      'Falha ao comunicar com o servidor para gerar o plano de treinamento.',
    );
  }
};
