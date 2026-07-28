// src/services/planRecovery.ts
import { getActivePlanId } from './trainingRepository';
import { logger } from '../utils/logger';

// 6 consultas espaçadas de 10 s cobrem ~1 minuto além do momento em que o
// acompanhamento morreu — mais que a geração típica (~40 s) leva para
// terminar depois de o app perder o polling.
export const RECUPERACAO_TENTATIVAS = 6;
export const RECUPERACAO_INTERVALO_MS = 10000;

/**
 * Procura no banco o plano que o servidor pode ter salvo enquanto o app estava
 * sem acompanhar a geração.
 *
 * Perder o polling NÃO significa que a geração falhou: o job segue no servidor
 * e grava o plano com status 'active'. Sem esta busca, uma queda de rede de
 * segundos custava ao aluno uma nova geração no Opus por um plano que já
 * existia — e o plano gerado ficava órfão no banco (incidente 27/07/2026).
 *
 * O banco é outro host (Supabase): a leitura funciona mesmo quando o backend
 * da geração continua inacessível.
 *
 * Retorna o id do plano ativo, ou null se não houver nenhum ao fim da janela.
 */
export const recuperarPlanoSalvo = async (
  userId: string,
  tentativas: number = RECUPERACAO_TENTATIVAS,
  intervaloMs: number = RECUPERACAO_INTERVALO_MS,
): Promise<string | null> => {
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      const planoId = await getActivePlanId(userId);
      if (planoId) {
        logger.log(`[PlanRecovery] Plano ativo encontrado na tentativa ${tentativa + 1}.`);
        return planoId;
      }
    } catch {
      // Ainda offline: a próxima tentativa pode pegar a rede de volta. Falha
      // de leitura não pode encerrar a recuperação — é justamente o cenário
      // em que ela existe.
      logger.log(`[PlanRecovery] Consulta ${tentativa + 1} falhou (offline?), seguindo.`);
    }

    if (tentativa < tentativas - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervaloMs));
    }
  }

  logger.log('[PlanRecovery] Nenhum plano ativo encontrado na janela de recuperação.');
  return null;
};
