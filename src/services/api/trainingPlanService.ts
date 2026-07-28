// src/services/api/trainingPlanService.ts
import apiClient, { ENDPOINTS } from './apiClient';
import { AcompanhamentoPerdidoError } from './planJobErrors';
import { logger } from '../../utils/logger';

// Geração de plano via LLM pode levar minutos — timeout dedicado, maior que
// o padrão do apiClient. Cadeia ponta a ponta (achado #3 do review do PR #19):
// auth ≤10s + Anthropic ≤150s + persistência ≤20s = ≤180s < ESTE timeout
// (190s) < nginx proxy_read_timeout (200s). 180s exatos não davam margem — o
// app abortava (ECONNABORTED) uma geração que ia concluir. (Trabalho futuro:
// job assíncrono idempotente para eliminar a requisição síncrona longa.)
const GENERATE_PLAN_TIMEOUT_MS = 190000;
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 60;

// Rede de celular cai por dezenas de segundos e volta. Tolerar só 3 falhas
// consecutivas (~15 s) descartava uma geração que o servidor estava
// concluindo: em 27/07/2026 o plano foi salvo 11 s depois do app desistir,
// ficou órfão no banco e o aluno voltou para o onboarding. A janela tolerada
// agora passa de 1 minuto, e a espera cresce em vez de martelar o servidor
// de 5 em 5 s enquanto a rede está fora.
const MAX_CONSECUTIVE_FAILURES = 7;
const POLL_BACKOFF_MS = [5000, 8000, 12000, 16000, 20000, 20000];

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
 * Tolera uma janela de rede ruim de mais de 1 minuto (backoff crescente entre
 * as tentativas) e trata 404 (job perdido após restart do servidor) como
 * fallback limpo.
 *
 * Desistir aqui NÃO significa que o plano não existe: o servidor segue
 * gerando. Quem chama precisa procurar o plano salvo no banco antes de
 * reportar falha ao aluno (ver PostQuestionnaireChat).
 */
export const waitForPlanJob = async (
  jobId: string,
  onProgress?: (progress: JobProgress) => void,
): Promise<JobProgress> => {
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    let esperaMs = POLL_INTERVAL_MS;

    try {
      const progress = await pollPlanJob(jobId);
      consecutiveFailures = 0;
      onProgress?.(progress);

      if (progress.status === 'salvo' || progress.status === 'erro') {
        return progress;
      }
    } catch (error: any) {
      consecutiveFailures++;
      const status = error?.response?.status;

      if (status === 404) {
        logger.warn('[TrainingPlanService] Job não encontrado no servidor (possível restart).');
        return {
          job_id: jobId,
          status: 'erro',
          progress: { step: 'perdido', detail: 'Sessão de geração expirada.' },
          plan_id: null,
          error: { code: 'job_lost', message: 'O servidor foi reiniciado. Verifique se o plano foi gerado ou tente novamente.' },
        };
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        throw new AcompanhamentoPerdidoError('Conexão instável: não consegui acompanhar a geração do plano.');
      }

      esperaMs = POLL_BACKOFF_MS[Math.min(consecutiveFailures - 1, POLL_BACKOFF_MS.length - 1)];
      logger.log(`[TrainingPlanService] Falha no poll (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}), nova tentativa em ${esperaMs / 1000}s...`);
    }

    await new Promise((resolve) => setTimeout(resolve, esperaMs));
  }

  throw new AcompanhamentoPerdidoError('Timeout aguardando a geração do plano.');
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
