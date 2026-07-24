// __tests__/direcao03-fase4-progresso.test.ts
// Fase 4 da Direção 03 — motor puro da aba Progresso. Modos de falha:
//  1. recorde escolhido por reps em vez de carga (ou empate resolvido errado);
//  2. volume vazando para a semana errada na fronteira (domingo 23:59 × segunda 00:00);
//  3. semana sem amostra virando 0 "inventado" — precisa existir com volume 0
//     explícito de contagem vazia (0 séries = 0 kg é fato, não invenção);
//  4. constância com rótulo/ordem errados (mais antiga primeiro, atual por último).

import {
  recordesPorExercicio,
  volumePorSemana,
  constanciaSemanal,
  type SetLogResumo,
} from '../src/engine/progressStats';

const log = (
  identity: string,
  name: string,
  loadKg: number | null,
  reps: number | null,
  completedAt: string,
): SetLogResumo => ({ identity, name, loadKg, reps, completedAt });

describe('Fase 4 — recordesPorExercicio', () => {
  it('o recorde é a MAIOR carga; empate de carga decide por reps; depois pelo mais recente', () => {
    const logs = [
      log('k:supino', 'Supino reto', 40, 12, '2026-07-01T10:00:00Z'),
      log('k:supino', 'Supino reto', 42.5, 8, '2026-07-10T10:00:00Z'),
      log('k:supino', 'Supino reto', 42.5, 10, '2026-07-08T10:00:00Z'), // mesma carga, mais reps
      log('k:agacho', 'Agachamento', 70, 8, '2026-07-12T10:00:00Z'),
    ];

    const recordes = recordesPorExercicio(logs);

    expect(recordes).toHaveLength(2);
    // Ordenado pelo recorde mais recente primeiro
    expect(recordes[0]).toMatchObject({ name: 'Agachamento', loadKg: 70, reps: 8 });
    expect(recordes[1]).toMatchObject({ name: 'Supino reto', loadKg: 42.5, reps: 10 });
  });

  it('série sem carga ou sem reps nunca vira recorde', () => {
    const logs = [
      log('k:prancha', 'Prancha', null, null, '2026-07-10T10:00:00Z'),
      log('k:flexao', 'Flexão', null, 20, '2026-07-10T10:00:00Z'),
    ];
    expect(recordesPorExercicio(logs)).toEqual([]);
  });

  it('respeita o limite pedido', () => {
    const logs = [
      log('a', 'A', 10, 5, '2026-07-01T10:00:00Z'),
      log('b', 'B', 20, 5, '2026-07-02T10:00:00Z'),
      log('c', 'C', 30, 5, '2026-07-03T10:00:00Z'),
    ];
    expect(recordesPorExercicio(logs, 2)).toHaveLength(2);
  });
});

describe('Fase 4 — volumePorSemana', () => {
  // Quinta, 24/07/2026 (semana começa na segunda 20/07, local).
  const hoje = new Date(2026, 6, 24, 12, 0, 0);

  it('soma reps×carga por semana e marca a semana atual', () => {
    const logs = [
      // Semana atual (20–26/07): 10×40 + 8×42.5 = 740
      log('k:supino', 'Supino', 40, 10, new Date(2026, 6, 21, 9, 0).toISOString()),
      log('k:supino', 'Supino', 42.5, 8, new Date(2026, 6, 23, 9, 0).toISOString()),
      // Semana anterior (13–19/07): 12×40 = 480
      log('k:supino', 'Supino', 40, 12, new Date(2026, 6, 15, 9, 0).toISOString()),
    ];

    const semanas = volumePorSemana(logs, 2, hoje);
    expect(semanas).toHaveLength(2);
    expect(semanas[0].volumeKg).toBe(480);
    expect(semanas[0].atual).toBe(false);
    expect(semanas[1].volumeKg).toBe(740);
    expect(semanas[1].atual).toBe(true);
    expect(semanas[1].rotulo).toBe('AGORA');
  });

  it('fronteira: domingo 23:59 fica na semana velha; segunda 00:00 na nova', () => {
    const logs = [
      log('x', 'X', 100, 1, new Date(2026, 6, 19, 23, 59).toISOString()), // dom anterior
      log('x', 'X', 100, 2, new Date(2026, 6, 20, 0, 0).toISOString()), // seg atual
    ];

    const semanas = volumePorSemana(logs, 2, hoje);
    expect(semanas[0].volumeKg).toBe(100);
    expect(semanas[1].volumeKg).toBe(200);
  });

  it('semana sem série concluída existe com volume 0 (fato observado, não invenção)', () => {
    const semanas = volumePorSemana([], 3, hoje);
    expect(semanas).toHaveLength(3);
    expect(semanas.every((s) => s.volumeKg === 0)).toBe(true);
  });
});

describe('Fase 4 — constanciaSemanal', () => {
  const hoje = new Date(2026, 6, 24, 12, 0, 0); // sexta na semana de 20/07

  it('semanas da mais antiga para a atual, com dias e contagem reais', () => {
    const sessoes = [
      { startedAt: new Date(2026, 6, 20, 8, 0).toISOString(), finishedAt: new Date(2026, 6, 20, 9, 0).toISOString() }, // seg atual
      { startedAt: new Date(2026, 6, 15, 8, 0).toISOString(), finishedAt: new Date(2026, 6, 15, 9, 0).toISOString() }, // qua anterior
      { startedAt: new Date(2026, 6, 17, 8, 0).toISOString(), finishedAt: new Date(2026, 6, 17, 9, 0).toISOString() }, // sex anterior
    ];

    const semanas = constanciaSemanal(sessoes, 2, hoje);
    expect(semanas).toHaveLength(2);

    expect(semanas[0].atual).toBe(false);
    expect(semanas[0].concluidas).toBe(2);
    expect(semanas[0].diasComTreino[2]).toBe(true); // QUA
    expect(semanas[0].diasComTreino[4]).toBe(true); // SEX

    expect(semanas[1].atual).toBe(true);
    expect(semanas[1].rotulo).toBe('AGORA');
    expect(semanas[1].concluidas).toBe(1);
    expect(semanas[1].diasComTreino[0]).toBe(true); // SEG
  });

  it('sessão sem finishedAt não conta (não é treino concluído)', () => {
    const sessoes = [
      { startedAt: new Date(2026, 6, 21, 8, 0).toISOString(), finishedAt: null },
    ];
    const semanas = constanciaSemanal(sessoes, 1, hoje);
    expect(semanas[0].concluidas).toBe(0);
  });
});
