// __tests__/tempoEfetivo.test.ts
// Tempo efetivo de treino (migration 0028). Os nove vetores aqui são a
// ESPECIFICAÇÃO da métrica: aparecem literalmente no comentário da migration
// e o harness de SQL (tempoEfetivoMigration.test.ts) confere que continuam lá.
//
// Regra central: a duração exibida é a soma dos intervalos entre eventos reais
// da sessão (início, cada série concluída, fim), cada intervalo limitado a
// CAP_INTERVALO_SEGUNDOS (20 min). Sessão esquecida em aberto deixa de virar
// número absurdo; cardio acima do teto soma o excedente sem dupla contagem.

import { tempoEfetivoSegundos, CAP_INTERVALO_SEGUNDOS } from '../src/engine/tempoEfetivo';

const MIN = 60;
const HORA = 3600;

/** ISO de um instante relativo a 2026-07-15T19:00:00Z (âncora dos vetores). */
const em = (segundos: number): string =>
  new Date(Date.UTC(2026, 6, 15, 19, 0, 0) + segundos * 1000).toISOString();

const serie = (completedAt: string | null, durationSeconds: number | null = null) => ({
  completedAt,
  actualDurationSeconds: durationSeconds,
});

const linha = (
  startedAt: string | null,
  finishedAt: string | null,
  series: { completedAt: string | null; actualDurationSeconds?: number | null }[] = [],
) => ({ startedAt, finishedAt, series });

describe('tempoEfetivoSegundos', () => {
  it('vetor 1: sessão aberta por 13 h com séries nos primeiros 25 min nunca vira 13 h', () => {
    const res = tempoEfetivoSegundos(
      linha(
        em(0),
        em(13 * HORA),
        [
          serie(em(5 * MIN)),
          serie(em(10 * MIN)),
          serie(em(15 * MIN)),
          serie(em(20 * MIN)),
        ],
      ),
    );

    // 5 min + 5 min + 5 min + 5 min + teto de 20 min no intervalo final = 40 min.
    expect(res).toBe(40 * MIN);
    expect(res as number).toBeLessThanOrEqual(25 * MIN + 5 * CAP_INTERVALO_SEGUNDOS);
    expect(res as number).toBeLessThan(13 * HORA);
  });

  it('vetor 2: sessão histórica (started_at de série nulo/ausente) dá número plausível', () => {
    const res = tempoEfetivoSegundos(
      linha(
        em(0),
        em(35 * MIN),
        [
          serie(em(5 * MIN)),
          serie(em(10 * MIN)),
          serie(em(15 * MIN)),
          serie(em(20 * MIN)),
          serie(em(25 * MIN)),
          serie(em(30 * MIN)),
        ],
      ),
    );

    // A fórmula usa completed_at; o started_at por série nunca entra na conta.
    expect(res).toBe(35 * MIN);
  });

  it('vetor 3: sessão sem nenhuma série vale min(fim − início, teto)', () => {
    expect(tempoEfetivoSegundos(linha(em(0), em(45 * MIN)))).toBe(CAP_INTERVALO_SEGUNDOS);
    expect(tempoEfetivoSegundos(linha(em(0), em(10 * MIN)))).toBe(10 * MIN);
  });

  it('vetor 4: corrida de 40 min digitada conta integralmente (excedente além do teto)', () => {
    const res = tempoEfetivoSegundos(
      linha(em(0), em(40 * MIN), [serie(em(40 * MIN), 40 * MIN)]),
    );

    // Intervalo truncado em 20 min + excedente de 20 min = 40 min, sem dupla contagem.
    expect(res).toBe(40 * MIN);
  });

  it('vetor 5: cardio de 8 min (abaixo do teto) não sofre ajuste', () => {
    const res = tempoEfetivoSegundos(
      linha(em(0), em(8 * MIN), [serie(em(8 * MIN), 8 * MIN)]),
    );

    expect(res).toBe(8 * MIN);
  });

  it('vetor 6: retomada no dia seguinte vira um único intervalo limitado', () => {
    // Início 19:00 da segunda; última série 19:10; concluída ~15:00 da terça (20 h).
    const res = tempoEfetivoSegundos(
      linha(em(0), em(20 * HORA), [serie(em(5 * MIN)), serie(em(10 * MIN))]),
    );

    // 5 + 5 dos intervalos reais + 20 min (teto) do vão de 20 h = 30 min.
    expect(res).toBe(30 * MIN);
  });

  it('vetor 7: dado incoerente devolve null, sem exceção', () => {
    expect(tempoEfetivoSegundos(linha(em(10 * MIN), em(0)))).toBeNull(); // fim < início
    expect(tempoEfetivoSegundos(linha('nao-e-data', 'tambem-nao'))).toBeNull(); // data inválida
    expect(tempoEfetivoSegundos(linha(em(0), null))).toBeNull(); // fim ausente
    expect(tempoEfetivoSegundos(linha(null, em(10 * MIN)))).toBeNull(); // início ausente
    expect(
      tempoEfetivoSegundos(linha(em(0), em(10 * MIN), [serie('data-invalida')])),
    ).toBeNull();
  });

  it('vetor 8: dois completed_at idênticos (retry) geram intervalo zero, sem NaN', () => {
    const res = tempoEfetivoSegundos(
      linha(
        em(0),
        em(10 * MIN),
        [serie(em(5 * MIN)), serie(em(5 * MIN))],
      ),
    );

    expect(Number.isFinite(res)).toBe(true);
    expect(res).toBe(10 * MIN);
  });

  it('vetor 9: carimbo fora de ordem (skew) é neutralizado, nunca subtraído', () => {
    const res = tempoEfetivoSegundos(
      linha(
        em(0),
        em(12 * MIN),
        [serie(em(8 * MIN)), serie(em(4 * MIN))], // a 2ª série carimba ANTES da 1ª
      ),
    );

    expect(Number.isFinite(res)).toBe(true);
    expect(res as number).toBeGreaterThanOrEqual(0);
    expect(res).toBe(12 * MIN);
  });

  it('vetor bônus: cardio acima do teto soma excedente MESMO com intervalo truncado', () => {
    // Corrida de 50 min, e o intervalo até a conclusão também foi de 50 min.
    const res = tempoEfetivoSegundos(
      linha(em(0), em(50 * MIN), [serie(em(50 * MIN), 50 * MIN)]),
    );

    expect(res).toBe(50 * MIN);
  });

  it('vetor bônus: série de musculação sem duração (cardio) não entra no ajuste', () => {
    const res = tempoEfetivoSegundos(
      linha(
        em(0),
        em(30 * MIN),
        [
          serie(em(5 * MIN), null), // supino: reps, sem duração
          serie(em(10 * MIN), null),
        ],
      ),
    );

    expect(res).toBe(30 * MIN);
  });
});
