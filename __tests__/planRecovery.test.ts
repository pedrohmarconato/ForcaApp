// __tests__/planRecovery.test.ts
// Rede caiu durante a geração: o servidor termina e grava o plano de qualquer
// forma. Quem perdeu o acompanhamento precisa ACHAR esse plano no banco — sem
// isso o aluno paga outra geração no Opus por um plano que já existe.

import { recuperarPlanoSalvo } from '../src/services/planRecovery';
import { getActivePlanId } from '../src/services/trainingRepository';

jest.mock('../src/services/trainingRepository', () => ({
  getActivePlanId: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedGetActivePlanId = getActivePlanId as jest.Mock;

describe('recuperarPlanoSalvo', () => {
  beforeEach(() => {
    mockedGetActivePlanId.mockReset();
  });

  it('acha o plano que o servidor salvou depois do app perder o polling', async () => {
    mockedGetActivePlanId.mockResolvedValueOnce('plan-80aff988');

    await expect(recuperarPlanoSalvo('user-1', 6, 0)).resolves.toBe('plan-80aff988');
    expect(mockedGetActivePlanId).toHaveBeenCalledTimes(1);
  });

  it('insiste enquanto o job ainda está rodando no servidor', async () => {
    // O plano só aparece na 3ª consulta: a geração terminou depois da queda.
    mockedGetActivePlanId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('plan-80aff988');

    await expect(recuperarPlanoSalvo('user-1', 6, 0)).resolves.toBe('plan-80aff988');
    expect(mockedGetActivePlanId).toHaveBeenCalledTimes(3);
  });

  it('celular ainda offline em algumas tentativas não aborta a recuperação', async () => {
    mockedGetActivePlanId
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce('plan-80aff988');

    await expect(recuperarPlanoSalvo('user-1', 6, 0)).resolves.toBe('plan-80aff988');
  });

  it('sem plano nenhum devolve null — a falha é real e a tela deve reportá-la', async () => {
    mockedGetActivePlanId.mockResolvedValue(null);

    await expect(recuperarPlanoSalvo('user-1', 4, 0)).resolves.toBeNull();
    expect(mockedGetActivePlanId).toHaveBeenCalledTimes(4);
  });

  it('uma única tentativa não espera entre consultas', async () => {
    mockedGetActivePlanId.mockResolvedValue(null);
    const esperas: number[] = [];
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
      esperas.push(ms ?? 0);
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);

    await recuperarPlanoSalvo('user-1', 1, 10000);

    expect(esperas).toHaveLength(0);
    spy.mockRestore();
  });

  it('a janela de recuperação padrão cobre uma geração que ainda vai terminar', async () => {
    mockedGetActivePlanId.mockResolvedValue(null);
    const esperas: number[] = [];
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void, ms?: number) => {
      esperas.push(ms ?? 0);
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);

    await recuperarPlanoSalvo('user-1');

    // Geração típica leva ~40 s e o teto do backend é 240 s: a janela precisa
    // dar tempo do job terminar depois que o polling morreu.
    const janela = esperas.reduce((a, b) => a + b, 0);
    expect(janela).toBeGreaterThanOrEqual(50000);
    spy.mockRestore();
  });
});
