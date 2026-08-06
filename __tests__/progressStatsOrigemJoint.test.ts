// __tests__/progressStatsOrigemJoint.test.ts
// Achado R2 (review PR #73): recordesPorExercicio e volumePorSemana agregavam
// séries de planos purpose='joint' como se fossem solo — uma série 80kg×5 em
// dupla apagava o recorde solo 70kg×5 do mesmo exercício (Map por identity) e
// o volume semanal era inflado. O padrão correto já existia em
// getLastLoadByExercise (exclui purpose='joint'). Este teste cobre o motor
// puro; a exibição separada em seção própria ("Dupla") é TODO do dono.
import {
  recordesPorExercicio,
  volumePorSemana,
  type SetLogResumo,
} from '../src/engine/progressStats';

const log = (over: Partial<SetLogResumo> & { identity: string }): SetLogResumo => ({
  name: 'Supino Reto',
  loadKg: 70,
  reps: 5,
  completedAt: '2026-08-03T10:00:00Z', // segunda-feira da semana de referência
  ...over,
});

const SEGUNDA = Date.parse('2026-08-03T12:00:00Z');

describe('progressStats — série joint não contamina agregação solo (achado R2)', () => {
  it('recordesPorExercicio: joint NÃO apaga o recorde solo do mesmo exercício', () => {
    // Ordem no vetor: a série joint (80kg) é a mais recente — antes do fix,
    // ela vencia no Map por identity e o recorde solo 70×5 sumia.
    const logs = [
      log({ identity: 'k:supino', loadKg: 70, reps: 5, completedAt: '2026-08-01T10:00:00Z' }),
      log({ identity: 'k:supino', loadKg: 80, reps: 5, completedAt: '2026-08-04T10:00:00Z', origemJoint: true }),
    ];
    const recordes = recordesPorExercicio(logs);
    expect(recordes).toHaveLength(1);
    expect(recordes[0].loadKg).toBe(70);
    expect(recordes[0].origemJoint).toBe(false);
  });

  it('recordesPorExercicio: só séries joint do exercício não geram recorde solo', () => {
    const recordes = recordesPorExercicio([
      log({ identity: 'k:supino', loadKg: 80, reps: 5, origemJoint: true }),
    ]);
    expect(recordes).toHaveLength(0);
  });

  it('volumePorSemana: kg de séries joint ficam fora do volume solo', () => {
    const semanas = volumePorSemana(
      [
        log({ identity: 'k:supino', loadKg: 70, reps: 5, completedAt: new Date(SEGUNDA).toISOString() }),
        log({ identity: 'k:agachamento', loadKg: 80, reps: 5, completedAt: new Date(SEGUNDA + 86_400_000).toISOString(), origemJoint: true }),
      ],
      1,
      new Date(SEGUNDA),
    );
    expect(semanas[0].volumeKg).toBe(350); // só 70×5; o 80×5 joint não entra
  });

  it('volumePorSemana: semana com APENAS séries joint zera (0 séries solo = 0 kg)', () => {
    const semanas = volumePorSemana(
      [log({ identity: 'k:supino', loadKg: 80, reps: 5, origemJoint: true })],
      1,
      new Date(SEGUNDA),
    );
    expect(semanas[0].volumeKg).toBe(0);
  });
});
