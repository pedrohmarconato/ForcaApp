// __tests__/moodAdjustment.test.ts
// Check-in pré-treino (decisão do dono, 22/07/2026): "cansado" modula FORTE o
// volume do dia — vira um fator de capacidade efetiva sobre os minutos
// disponíveis, alimentando a MESMA escada de corte por tempo da Fase 6
// (planTimeCut: nunca corta primários, proposta via banner, nada sem confirmar).

import { effectiveMinutesForMood } from '../src/engine/moodAdjustment';
import { MOOD_CONFIG } from '../src/engine/config';
import { planTimeCut, type ReplanSession } from '../src/engine/weeklyReplanner';

describe('effectiveMinutesForMood', () => {
  it('normal e com_energia não mexem nos minutos (inclusive null = tempo cheio)', () => {
    expect(
      effectiveMinutesForMood({ mood: 'normal', availableMinutes: 45, estimatedMinutes: 60 }),
    ).toBe(45);
    expect(
      effectiveMinutesForMood({ mood: 'com_energia', availableMinutes: null, estimatedMinutes: 60 }),
    ).toBeNull();
    expect(
      effectiveMinutesForMood({ mood: null, availableMinutes: null, estimatedMinutes: 60 }),
    ).toBeNull();
  });

  it('cansado aplica o fator sobre os minutos informados', () => {
    expect(
      effectiveMinutesForMood({ mood: 'cansado', availableMinutes: 60, estimatedMinutes: 90 }),
    ).toBe(Math.floor(60 * MOOD_CONFIG.tiredCapacityFactor));
  });

  it('cansado com tempo cheio usa a estimativa da sessão como base', () => {
    expect(
      effectiveMinutesForMood({ mood: 'cansado', availableMinutes: null, estimatedMinutes: 60 }),
    ).toBe(Math.floor(60 * MOOD_CONFIG.tiredCapacityFactor));
  });

  it('cansado sem NENHUMA base não inventa minutos (filosofia do repo)', () => {
    expect(
      effectiveMinutesForMood({ mood: 'cansado', availableMinutes: null, estimatedMinutes: null }),
    ).toBeNull();
  });
});

describe('integração com a escada de corte (planTimeCut)', () => {
  const sessao: ReplanSession = {
    id: 'sess-1',
    weekNumber: 1,
    title: 'Push A',
    sessionType: 'Hipertrofia',
    scheduledDate: '2026-07-22',
    status: 'pending',
    estimatedMinutes: 60,
    exercises: [
      {
        id: 'ex-1',
        name: 'Supino Reto',
        muscleGroup: 'Peito',
        priority: 'primary',
        exerciseOrder: 1,
        sets: [
          { id: 'st-1', setOrder: 1 },
          { id: 'st-2', setOrder: 2 },
        ],
      },
      {
        id: 'ex-2',
        name: 'Crucifixo Inclinado',
        muscleGroup: 'Peito',
        priority: 'accessory',
        exerciseOrder: 2,
        sets: [{ id: 'st-3', setOrder: 1 }],
      },
    ] as ReplanSession['exercises'],
  };

  it('cansado com tempo cheio propõe cortar acessórios e preserva o primário', () => {
    const efetivo = effectiveMinutesForMood({
      mood: 'cansado',
      availableMinutes: null,
      estimatedMinutes: sessao.estimatedMinutes,
    });
    expect(efetivo).not.toBeNull();

    const cut = planTimeCut({ session: sessao, availableMinutes: efetivo as number });
    expect(cut).not.toBeNull();
    expect(cut!.keptPriorities).toContain('primary');
    expect(cut!.cutExercises.map((c) => c.exerciseId)).toEqual(['ex-2']);
  });

  it('com_energia com tempo cheio não propõe corte nenhum', () => {
    const efetivo = effectiveMinutesForMood({
      mood: 'com_energia',
      availableMinutes: null,
      estimatedMinutes: sessao.estimatedMinutes,
    });
    expect(efetivo).toBeNull(); // null → replanByRules nem chama planTimeCut
  });
});
