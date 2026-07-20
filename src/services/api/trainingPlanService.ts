// src/services/api/trainingPlanService.ts
import apiClient, { ENDPOINTS } from './apiClient';
import { logger } from '../../utils/logger';

const GENERATE_PLAN_TIMEOUT_MS = 180000;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 60; // 5 min max

export type Diretrizes = {
  preferencias: string[];
  restricoes: Array<{
    descricao: string;
    tipo: string;
    exercicio_afetado?: string;
    grupo_afetado?: string;
  }>;
  excecoes_estruturais: Array<{
    tipo: string;
    descricao: string;
    detalhes?: Record<string, unknown>;
  }>;
  observacoes_gerais?: string;
};

export type JobStatus =
  | 'created'
  | 'gerando_molde'
  | 'expandindo'
  | 'salvando'
  | 'salvo'
  | 'erro';

export type JobProgress = {
  job_id: string;
  status: JobStatus;
  progress: { step: string; detail: string };
  plan_id: string | null;
  error: { code: string; message: string } | null;
};

/**
 * Consolida o histórico do chat + questionário em diretrizes estruturadas.
 * Chama o backend (Haiku) para analisar a conversa e extrair preferências,
 * restrições e exceções estruturais.
 */
export const consolidateChat = async (
  messages: Array<{ role: string; content: string }>,
  questionnaireData: unknown,
): Promise<Diretrizes> => {
  logger.log('[TrainingPlanService] Consolidando chat em diretrizes...');

  try {
    const response = await apiClient.post(ENDPOINTS.CONSOLIDATE_CHAT, {
      messages,
      questionnaireData,
    }, { timeout: 30000 });

    const diretrizes = response.data?.diretrizes;
    if (!diretrizes || typeof diretrizes !== 'object') {
      throw new Error('Resposta inválida da consolidação.');
    }

    logger.log('[TrainingPlanService] Diretrizes consolidadas com sucesso.');
    return diretrizes as Diretrizes;
  } catch (error: any) {
    logger.error('[TrainingPlanService] Falha na consolidação:', error.message);
    throw new Error(
      error.response?.data?.error || 'Falha ao consolidar preferências do chat.',
    );
  }
};

/**
 * Dispara a geração assíncrona de plano (job-based).
 * Retorna o job_id para polling.
 */
export const startPlanJob = async (
  questionnaireData: any,
  diretrizes: Diretrizes,
): Promise<string> => {
  logger.log('[TrainingPlanService] Iniciando job de geração...');

  const response = await apiClient.post(
    ENDPOINTS.TRAINING.GENERATE_PLAN,
    { questionnaireData, diretrizes },
    { timeout: 30000 },
  );

  const jobId = response.data?.job_id;
  if (typeof jobId !== 'string' || jobId.length === 0) {
    throw new Error('Resposta do servidor sem job_id.');
  }

  logger.log('[TrainingPlanService] Job criado:', jobId);
  return jobId;
};

/**
 * Polling do status de um job de geração.
 */
export const pollPlanJob = async (jobId: string): Promise<JobProgress> => {
  const response = await apiClient.get(
    `${ENDPOINTS.TRAINING.GENERATE_PLAN}/${jobId}`,
  );
  return response.data as JobProgress;
};

/**
 * Polling loop: espera o job terminar (salvo ou erro).
 */
export const waitForPlanJob = async (
  jobId: string,
  onProgress?: (progress: JobProgress) => void,
): Promise<JobProgress> => {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const progress = await pollPlanJob(jobId);
    onProgress?.(progress);

    if (progress.status === 'salvo' || progress.status === 'erro') {
      return progress;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Timeout aguardando a geração do plano.');
};

/**
 * Envia uma solicitação para o backend para gerar um novo plano de treinamento
 * (modo síncrono antigo, mantido para compatibilidade).
 *
 * @deprecated Use startPlanJob + waitForPlanJob quando o backend estiver com
 * FORCA_USE_MOLDE_ARCHITECTURE=true.
 */
export const requestTrainingPlanGeneration = async (
  userId: string,
  questionnaireData: any,
  adjustments: string[] = [],
): Promise<{ success: boolean; message: string; planId?: string; offline?: boolean }> => {
  logger.log('[TrainingPlanService] Solicitando geração de plano (modo síncrono) para:', userId);

  try {
    const response = await apiClient.post(
      ENDPOINTS.TRAINING.GENERATE_PLAN,
      { questionnaireData, adjustments, userId },
      { timeout: GENERATE_PLAN_TIMEOUT_MS },
    );

    const planId = response.data?.plan_id;
    if (typeof planId !== 'string' || planId.length === 0) {
      throw new Error('Resposta do servidor sem o identificador do plano.');
    }

    logger.log('[TrainingPlanService] Plano gerado. ID:', planId);

    return {
      success: true,
      message: response.data?.message || 'Plano de treinamento gerado com sucesso.',
      planId,
    };
  } catch (error: any) {
    logger.error(
      '[TrainingPlanService] Falha na geração do plano:',
      error.response?.status || error.code || error.message,
    );

    const OFFLINE_FLAG = 'EXPO_PUBLIC_ENABLE_OFFLINE_MODE';
    const isOfflineModeEnabled = process.env[OFFLINE_FLAG] === 'true';

    if (isOfflineModeEnabled) {
      logger.warn('[TrainingPlanService] Modo offline: plano SIMULADO.');
      await new Promise((resolve) => setTimeout(resolve, 1500));
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
