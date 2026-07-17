// __tests__/trainingPlanService.test.ts
// Reproduz dois achados do review:
// (1) falha de rede NÃO pode virar plano fictício com success:true quando o
//     modo offline está desativado;
// (2) o questionário (dados de saúde) não pode aparecer em logs.

import { requestTrainingPlanGeneration } from '../src/services/api/trainingPlanService';
import apiClient from '../src/services/api/apiClient';
import { logger } from '../src/utils/logger';

jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  ENDPOINTS: { TRAINING: { GENERATE_PLAN: '/generate-plan' } },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedPost = apiClient.post as jest.Mock;
const DADOS_SAUDE = { nome: 'Fulano', peso_kg: 95, lesoes_detalhes: 'lesão medular C5' };

describe('trainingPlanService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('REPRODUÇÃO: erro de rede com modo offline DESATIVADO propaga erro (sem plano fictício)', async () => {
    mockedPost.mockRejectedValueOnce({ message: 'Network Error' });

    await expect(
      requestTrainingPlanGeneration('user-1', DADOS_SAUDE, []),
    ).rejects.toThrow();
  });

  it('erro de rede com modo offline ATIVADO retorna plano simulado explicitamente', async () => {
    process.env.EXPO_PUBLIC_ENABLE_OFFLINE_MODE = 'true';
    mockedPost.mockRejectedValueOnce({ message: 'Network Error' });

    const result = await requestTrainingPlanGeneration('user-1', DADOS_SAUDE, []);
    expect(result.success).toBe(true);
    expect(result.planId).toMatch(/^offline-/);
  });

  it('sucesso do backend repassa plan_id', async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: 'ok', plan_id: 'plano-123' } });

    const result = await requestTrainingPlanGeneration('user-1', DADOS_SAUDE, []);
    expect(result).toEqual({ success: true, message: 'ok', planId: 'plano-123' });
  });

  it('REPRODUÇÃO: dados de saúde do questionário NUNCA aparecem em logs', async () => {
    mockedPost.mockResolvedValueOnce({ data: { message: 'ok', plan_id: 'p1' } });

    await requestTrainingPlanGeneration('user-1', DADOS_SAUDE, ['mais peito']);

    for (const fn of [logger.log, logger.warn, logger.error]) {
      for (const call of (fn as jest.Mock).mock.calls) {
        const texto = JSON.stringify(call);
        expect(texto).not.toContain('lesão medular');
        expect(texto).not.toContain('peso_kg');
        expect(texto).not.toContain('Fulano');
      }
    }
  });
});
