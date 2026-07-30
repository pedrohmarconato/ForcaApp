// __tests__/cardioGoals.test.ts
// Fase 3: metas de cardio (desempenho + consistência).
//
// Esta fase produz NÚMERO em tela, então os modos de falha aqui são todos do
// tipo "a tela afirma o que o dado não sustenta". Escritos antes do motor:
//
//  1. comparar bases diferentes: usar o tempo de 1 km para uma meta de 5 km faz
//     o aluno parecer muito mais rápido do que é;
//  2. inventar número sem amostra: 0% ou "pace 0:00" onde não houve registro
//     válido — sem amostra o motor devolve null e a tela mostra "—";
//  3. misturar modalidades: pace de bike alimentando meta de corrida;
//  4. semana errada: minutos de semanas passadas somando na semana corrente, ou
//     convenção de semana diferente da do resto do app (segunda-feira);
//  5. contar SÉRIE como sessão: 3 séries de cardio no mesmo dia não são 3
//     sessões de cardio na semana;
//  6. série sem distância (bike sem hodômetro) entrando na meta de desempenho —
//     mas ela precisa continuar contando nos minutos da consistência;
//  7. não reconhecer a meta batida (ou declarar batida antes).

import {
  TOLERANCIA_DISTANCIA_MAX,
  TOLERANCIA_DISTANCIA_MIN,
  progressoConsistencia,
  progressoDesempenho,
  type CardioLog,
} from '../src/engine/cardioGoals';

const log = (
  name: string,
  durationSeconds: number | null,
  distanceM: number | null,
  completedAt: string,
): CardioLog => ({ identity: `k:${name}`, name, durationSeconds, distanceM, completedAt });

const META_5K = { modality: 'Corrida', targetDistanceM: 5000, targetDurationSeconds: 1800 };

describe('meta de desempenho', () => {
  it('modo de falha 1: tempo de 1 km NÃO conta para uma meta de 5 km', () => {
    // 1 km em 5 min é pace 5:00/km — melhor que a meta (6:00/km). Se entrasse,
    // a tela diria que o aluno já bateu 5 km em 30 min.
    const p = progressoDesempenho([log('Corrida', 300, 1000, '2026-07-28T10:00:00Z')], META_5K);

    expect(p.amostras).toBe(0);
    expect(p.melhorDurationSeconds).toBeNull();
    expect(p.atingida).toBe(false);
  });

  it('aceita distância dentro da faixa equivalente e recusa fora dela', () => {
    const dentro = 5000 * TOLERANCIA_DISTANCIA_MIN;
    const fora = 5000 * TOLERANCIA_DISTANCIA_MAX + 1;

    expect(
      progressoDesempenho([log('Corrida', 1750, dentro, '2026-07-28T10:00:00Z')], META_5K).amostras,
    ).toBe(1);
    expect(
      progressoDesempenho([log('Corrida', 1750, fora, '2026-07-28T10:00:00Z')], META_5K).amostras,
    ).toBe(0);
  });

  it('modo de falha 2: sem amostra devolve null, nunca zero', () => {
    const p = progressoDesempenho([], META_5K);

    expect(p.amostras).toBe(0);
    expect(p.melhorDurationSeconds).toBeNull();
    expect(p.melhorPaceSecPerKm).toBeNull();
    expect(p.faltaSegundos).toBeNull();
    expect(p.fracao).toBeNull();
    expect(p.atingida).toBe(false);
  });

  it('modo de falha 3: outra modalidade não entra na conta', () => {
    const p = progressoDesempenho(
      [
        log('Bicicleta Ergométrica', 1500, 5000, '2026-07-28T10:00:00Z'),
        log('Corrida', 1900, 5000, '2026-07-29T10:00:00Z'),
      ],
      META_5K,
    );

    expect(p.amostras).toBe(1);
    expect(p.melhorDurationSeconds).toBe(1900);
  });

  it('modo de falha 6: série sem distância não entra na meta por distância', () => {
    const p = progressoDesempenho(
      [
        log('Corrida', 1500, null, '2026-07-28T10:00:00Z'),
        log('Corrida', 1900, 5000, '2026-07-29T10:00:00Z'),
      ],
      META_5K,
    );

    expect(p.amostras).toBe(1);
    expect(p.melhorDurationSeconds).toBe(1900);
  });

  it('guarda o MELHOR tempo entre as amostras válidas', () => {
    const p = progressoDesempenho(
      [
        log('Corrida', 2100, 5000, '2026-07-20T10:00:00Z'),
        log('Corrida', 1950, 5100, '2026-07-24T10:00:00Z'),
        log('Corrida', 2000, 4900, '2026-07-28T10:00:00Z'),
      ],
      META_5K,
    );

    expect(p.amostras).toBe(3);
    expect(p.melhorDurationSeconds).toBe(1950);
    expect(p.melhorDistanceM).toBe(5100);
    // Pace do melhor esforço: 1950 s / 5,1 km ≈ 382,35 s/km. O pace é o que
    // permite comparar esforços de distância levemente diferente.
    expect(Math.round(p.melhorPaceSecPerKm!)).toBe(382);
    expect(p.paceAlvoSecPerKm).toBe(360); // 1800 s / 5 km
    // "Falta" é medido NA DISTÂNCIA DA META, não no esforço dele:
    //   (382,35 − 360) s/km × 5 km ≈ 111,8 s → 112 s.
    // Usar 1950 − 1800 = 150 s seria comparar 5,1 km com 5 km — a base
    // diferente que esta feature existe para não misturar.
    expect(p.faltaSegundos).toBe(112);
  });

  it('modo de falha 7: bateu a meta quando o pace real alcança o alvo', () => {
    const p = progressoDesempenho([log('Corrida', 1780, 5000, '2026-07-28T10:00:00Z')], META_5K);

    expect(p.atingida).toBe(true);
    expect(p.faltaSegundos).toBe(0);
    expect(p.fracao).toBe(1);
  });

  it('déficit positivo subsegundo não aparece como zero', () => {
    const p = progressoDesempenho(
      // 1801 s em 5002 m normaliza para ~1800,28 s nos 5 km da meta.
      [log('Corrida', 1801, 5002, '2026-07-28T10:00:00Z')],
      META_5K,
    );

    expect(p.atingida).toBe(false);
    expect(p.faltaSegundos).toBe(1);
  });

  it('a fração nunca passa de 1 nem fica negativa', () => {
    const rapido = progressoDesempenho(
      [log('Corrida', 1200, 5000, '2026-07-28T10:00:00Z')],
      META_5K,
    );
    const lento = progressoDesempenho(
      [log('Corrida', 3600, 5000, '2026-07-28T10:00:00Z')],
      META_5K,
    );

    expect(rapido.fracao).toBe(1);
    expect(lento.fracao).toBeGreaterThan(0);
    expect(lento.fracao).toBeLessThan(1);
  });

  it('meta sem distância ou sem tempo não produz alvo (não inventa)', () => {
    const p = progressoDesempenho([log('Corrida', 1800, 5000, '2026-07-28T10:00:00Z')], {
      modality: 'Corrida',
      targetDistanceM: 0,
      targetDurationSeconds: 1800,
    });

    expect(p.paceAlvoSecPerKm).toBeNull();
    expect(p.fracao).toBeNull();
    expect(p.atingida).toBe(false);
  });

  it('casa a modalidade por nome normalizado (acento e caixa não importam)', () => {
    const p = progressoDesempenho([log('CORRIDA', 1750, 5000, '2026-07-28T10:00:00Z')], META_5K);

    expect(p.amostras).toBe(1);
  });
});

describe('meta de consistência', () => {
  // Semana de referência: quinta 30/07/2026 → semana de 27/07 (seg) a 02/08.
  const REFERENCIA = new Date('2026-07-30T12:00:00');

  it('soma os minutos de cardio da semana corrente', () => {
    const p = progressoConsistencia(
      [
        log('Corrida', 1800, 5000, '2026-07-27T10:00:00'),
        log('Bicicleta Ergométrica', 1200, null, '2026-07-29T10:00:00'),
      ],
      { weeklyMinutes: 120, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.minutos).toBe(50);
    expect(p.fracaoMinutos).toBeCloseTo(50 / 120, 5);
    expect(p.atingida).toBe(false);
  });

  it('modo de falha 4: semana anterior não entra na conta', () => {
    const p = progressoConsistencia(
      [
        log('Corrida', 3600, 10000, '2026-07-24T10:00:00'), // sexta da semana anterior
        log('Corrida', 600, 2000, '2026-07-28T10:00:00'), // terça desta semana
      ],
      { weeklyMinutes: 60, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.minutos).toBe(10);
  });

  it('modo de falha 4b: a semana começa na SEGUNDA, como no resto do app', () => {
    // Domingo 26/07 pertence à semana anterior; segunda 27/07 já é esta.
    const p = progressoConsistencia(
      [
        log('Corrida', 600, 2000, '2026-07-26T10:00:00'),
        log('Corrida', 600, 2000, '2026-07-27T10:00:00'),
      ],
      { weeklyMinutes: 60, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.minutos).toBe(10);
  });

  it('modo de falha 5: três séries no mesmo dia contam UMA sessão', () => {
    const p = progressoConsistencia(
      [
        log('Corrida', 300, 1000, '2026-07-28T10:00:00'),
        log('Corrida', 300, 1000, '2026-07-28T10:10:00'),
        log('Corrida', 300, 1000, '2026-07-28T10:20:00'),
        log('Corrida', 600, 2000, '2026-07-30T10:00:00'),
      ],
      { weeklyMinutes: null, weeklySessions: 3 },
      REFERENCIA,
    );

    expect(p.sessoes).toBe(2);
    expect(p.minutos).toBe(25);
    expect(p.fracaoSessoes).toBeCloseTo(2 / 3, 5);
  });

  it('modo de falha 6 (outro lado): cardio sem distância CONTA nos minutos', () => {
    const p = progressoConsistencia(
      [log('Bicicleta Ergométrica', 1800, null, '2026-07-28T10:00:00')],
      { weeklyMinutes: 30, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.minutos).toBe(30);
    expect(p.atingida).toBe(true);
  });

  it('semana sem registro é ZERO (fato), não ausência de dado', () => {
    const p = progressoConsistencia([], { weeklyMinutes: 90, weeklySessions: 2 }, REFERENCIA);

    // Aqui o zero é honesto: o aluno não fez cardio nesta semana.
    expect(p.minutos).toBe(0);
    expect(p.sessoes).toBe(0);
    expect(p.fracaoMinutos).toBe(0);
    expect(p.fracaoSessoes).toBe(0);
    expect(p.atingida).toBe(false);
  });

  it('duração positiva menor que um minuto nunca vira zero', () => {
    const p = progressoConsistencia(
      [log('Cardio Intervalado (HIIT)', 20, null, '2026-07-28T10:00:00')],
      { weeklyMinutes: 60, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.minutos).toBeCloseTo(1 / 3, 5);
    expect(p.fracaoMinutos).toBeGreaterThan(0);
  });

  it('eixo não declarado devolve null (a tela não mostra barra sem meta)', () => {
    const p = progressoConsistencia(
      [log('Corrida', 1800, 5000, '2026-07-28T10:00:00')],
      { weeklyMinutes: 60, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.fracaoSessoes).toBeNull();
    expect(p.fracaoMinutos).toBeCloseTo(0.5, 5);
  });

  it('só é atingida quando TODOS os eixos declarados foram cumpridos', () => {
    const logs = [
      log('Corrida', 3600, 10000, '2026-07-27T10:00:00'),
      log('Corrida', 3600, 10000, '2026-07-29T10:00:00'),
    ];

    // 120 min em 2 sessões: minutos batidos, sessões não.
    expect(
      progressoConsistencia(logs, { weeklyMinutes: 120, weeklySessions: 3 }, REFERENCIA).atingida,
    ).toBe(false);
    expect(
      progressoConsistencia(logs, { weeklyMinutes: 120, weeklySessions: 2 }, REFERENCIA).atingida,
    ).toBe(true);
  });

  it('duração ausente ou absurda não contamina a soma', () => {
    const p = progressoConsistencia(
      [
        log('Corrida', null, 5000, '2026-07-28T10:00:00'),
        log('Corrida', -600, 5000, '2026-07-28T11:00:00'),
        log('Corrida', 600, 2000, '2026-07-29T10:00:00'),
      ],
      { weeklyMinutes: 60, weeklySessions: null },
      REFERENCIA,
    );

    expect(p.minutos).toBe(10);
  });
});
