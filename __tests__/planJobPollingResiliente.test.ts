// __tests__/planJobPollingResiliente.test.ts
// REPRODUÇÃO do incidente de 27/07/2026 (usuário no 4G):
// o backend gerou e SALVOU o plano (job e1b47e05…, plan 80aff988…), mas o app
// desistiu 11 s antes do fim porque tolerava só 3 falhas consecutivas de poll
// (~15 s de rede ruim). O plano ficou órfão no banco e o aluno preso no
// onboarding com "Falha persistente ao verificar progresso do plano".
//
// O polling precisa aguentar uma queda de rede de celular sem descartar uma
// geração que o servidor está concluindo.

import { waitForPlanJob } from '../src/services/api/trainingPlanService';
import apiClient from '../src/services/api/apiClient';

jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  ENDPOINTS: { TRAINING: { GENERATE_PLAN: '/generate-plan' } },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedGet = apiClient.get as jest.Mock;

const emAndamento = (status = 'expandindo') => ({
  data: {
    job_id: 'job-1',
    status,
    progress: { step: status, detail: 'Montando seus treinos...' },
    plan_id: null,
    error: null,
  },
});

const concluido = () => ({
  data: {
    job_id: 'job-1',
    status: 'salvo',
    progress: { step: 'salvo', detail: 'Plano salvo.' },
    plan_id: 'plan-80aff988',
    error: null,
  },
});

// Queda de rede do celular: axios rejeita SEM response HTTP.
const quedaDeRede = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

const erroHttp = (status: number) => ({ response: { status }, message: `HTTP ${status}` });

describe('waitForPlanJob — resiliência a rede instável', () => {
  let esperas: number[];

  beforeEach(() => {
    // mockReset (não clearAllMocks): as filas de mockResolvedValueOnce
    // sobrevivem ao clear e vazariam de um teste para o outro.
    mockedGet.mockReset();
    esperas = [];
    // Executa cada espera na hora e registra o intervalo pedido: o teste roda
    // em milissegundos sem depender de timers reais.
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
      esperas.push(ms ?? 0);
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    (global.setTimeout as unknown as jest.SpyInstance).mockRestore();
  });

  it('REPRODUÇÃO: 4 quedas seguidas no meio do polling não podem descartar o plano salvo', async () => {
    mockedGet
      .mockResolvedValueOnce(emAndamento('gerando_molde'))
      .mockResolvedValueOnce(emAndamento('expandindo'))
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockResolvedValueOnce(concluido());

    const resultado = await waitForPlanJob('job-1');

    expect(resultado.status).toBe('salvo');
    expect(resultado.plan_id).toBe('plan-80aff988');
  });

  it('tolera uma janela de rede ruim de pelo menos 1 minuto antes de desistir', async () => {
    mockedGet.mockRejectedValue(quedaDeRede());

    await expect(waitForPlanJob('job-1')).rejects.toThrow(/conexão instável/i);

    // Soma das esperas entre as tentativas: a janela tolerada de rede ruim.
    const janelaTolerada = esperas.reduce((a, b) => a + b, 0);
    expect(janelaTolerada).toBeGreaterThanOrEqual(60000);
  });

  it('a espera cresce a cada falha consecutiva em vez de martelar de 5 em 5 s', async () => {
    mockedGet.mockRejectedValue(quedaDeRede());

    await expect(waitForPlanJob('job-1')).rejects.toThrow();

    expect(esperas.length).toBeGreaterThan(1);
    expect(esperas[esperas.length - 1]).toBeGreaterThan(esperas[0]);
  });

  it('o contador de falhas zera quando o poll volta a responder', async () => {
    // 3 quedas, uma resposta boa, mais 3 quedas: nenhuma sequência atinge o
    // teto, então a geração continua até o fim.
    mockedGet
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockResolvedValueOnce(emAndamento('salvando'))
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockRejectedValueOnce(quedaDeRede())
      .mockResolvedValueOnce(concluido());

    const resultado = await waitForPlanJob('job-1');

    expect(resultado.status).toBe('salvo');
  });

  it('erro 5xx transitório do servidor também é tolerado, não desiste na 3ª', async () => {
    mockedGet
      .mockRejectedValueOnce(erroHttp(502))
      .mockRejectedValueOnce(erroHttp(502))
      .mockRejectedValueOnce(erroHttp(502))
      .mockRejectedValueOnce(erroHttp(504))
      .mockResolvedValueOnce(concluido());

    const resultado = await waitForPlanJob('job-1');

    expect(resultado.status).toBe('salvo');
  });

  it('404 continua sendo job perdido (servidor reiniciado), sem virar erro de rede', async () => {
    mockedGet.mockRejectedValueOnce(erroHttp(404));

    const resultado = await waitForPlanJob('job-1');

    expect(resultado.status).toBe('erro');
    expect(resultado.error?.code).toBe('job_lost');
  });

  it('job concluído no primeiro poll retorna sem nenhuma espera', async () => {
    mockedGet.mockResolvedValueOnce(concluido());

    const resultado = await waitForPlanJob('job-1');

    expect(resultado.plan_id).toBe('plan-80aff988');
    expect(esperas).toHaveLength(0);
  });

  it('reporta progresso a cada resposta boa do servidor', async () => {
    mockedGet
      .mockResolvedValueOnce(emAndamento('gerando_molde'))
      .mockResolvedValueOnce(concluido());

    const onProgress = jest.fn();
    await waitForPlanJob('job-1', onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[0][0].status).toBe('gerando_molde');
  });

  it('job que termina em erro no servidor é devolvido como erro, não como exceção', async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        job_id: 'job-1',
        status: 'erro',
        progress: { step: 'erro', detail: 'Falhou.' },
        plan_id: null,
        error: { code: 'ia_indisponivel', message: 'Erro ao comunicar com o serviço de IA.' },
      },
    });

    const resultado = await waitForPlanJob('job-1');

    expect(resultado.status).toBe('erro');
    expect(resultado.error?.code).toBe('ia_indisponivel');
  });
});
