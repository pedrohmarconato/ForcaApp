// __tests__/comTimeout.test.ts
// Teto de tempo para promises: resolve quando a promise vence primeiro,
// rejeita quando o teto é atingido — a base do guard "falha ≠ zero" das duas
// portas de regeneração (Perfil e PostQuestionnaireChat).

import { comTimeout } from '../src/utils/comTimeout';

describe('comTimeout', () => {
  it('resolve com o valor da promise original quando ela vence primeiro', async () => {
    await expect(comTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('rejeita quando o teto é atingido antes da promise', async () => {
    await expect(comTimeout(new Promise(() => {}), 50)).rejects.toThrow('Tempo limite excedido');
  });
});
