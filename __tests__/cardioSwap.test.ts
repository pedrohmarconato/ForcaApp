// __tests__/cardioSwap.test.ts
// Fase 3 (REQ-06) — troca de modalidade de cardio: motor puro `applyCardioSwapToDraft`.
//
// Modos de falha cobertos, escritos antes da implementação:
//  1. distância-ALVO da modalidade original sobrevivendo à troca (D-01) —
//     dado inventado: a tela mostraria uma meta de km que pertence a outro
//     exercício;
//  2. `metric` não acompanhando a nova modalidade (D-04) — o campo de
//     distância REALIZADA apareceria (ou sumiria) errado no player;
//  3. troca encadeada perdendo a origem VERDADEIRA (D-08) — o rótulo
//     "trocado de X" mostraria a modalidade intermediária, não a original;
//  4. mutação do draft/exercício/série originais — outro consumidor do
//     mesmo objeto veria a troca sem ter pedido.

import {
  applyCardioSwapToDraft,
  type DraftExercise,
  type DraftSet,
  type SessionDraft,
} from '../src/engine/sessionModel';

const serie = (setOrder: number, extra: Partial<DraftSet> = {}): DraftSet =>
  ({
    plannedSetId: `set-${setOrder}`,
    setOrder,
    targetRepsMin: 0,
    targetRepsMax: 0,
    targetLoadKg: null,
    targetRir: null,
    targetDurationSeconds: 1200,
    targetDistanceM: 5000,
    actualReps: null,
    actualLoadKg: null,
    actualRir: null,
    actualDurationSeconds: null,
    actualDistanceM: null,
    perceivedEffort: null,
    status: 'pending',
    outcome: null,
    setLogId: null,
    adaptation: null,
    activatedAt: null,
    completedAt: null,
    ...extra,
  }) as DraftSet;

const exercicio = (
  id: string,
  nome: string,
  sets: DraftSet[],
  extra: Partial<DraftExercise> = {},
): DraftExercise =>
  ({
    exerciseId: id,
    name: nome,
    order: 1,
    metric: 'tempo_distancia',
    equipment: 'Peso corporal',
    isBodyweight: true,
    hasInjury: false,
    loadIncrementKg: 0,
    restSeconds: 60,
    priority: 'accessory',
    targetRmPercent: null,
    repsRaw: null,
    sets,
    ...extra,
  }) as DraftExercise;

const rascunho = (exercises: DraftExercise[]): SessionDraft =>
  ({
    version: 1,
    plannedSessionId: 'ps-1',
    sessionLogId: 'sl-1',
    userId: 'u-1',
    title: 'Treino A',
    weekNumber: 1,
    startedAt: null,
    status: 'active',
    exercises,
    lastLoadByExercise: {},
  }) as SessionDraft;

describe('applyCardioSwapToDraft', () => {
  it('D-01: preserva targetDurationSeconds e zera targetDistanceM de toda série do exercício trocado', () => {
    const draft = rascunho([
      exercicio('ex-2', 'Corrida', [
        serie(1, { targetDurationSeconds: 1200, targetDistanceM: 5000 }),
        serie(2, { targetDurationSeconds: 1200, targetDistanceM: 5000 }),
      ]),
    ]);

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');
    const ex = trocado.exercises[0];

    expect(ex.sets[0].targetDurationSeconds).toBe(1200);
    expect(ex.sets[0].targetDistanceM).toBeNull();
    expect(ex.sets[1].targetDurationSeconds).toBe(1200);
    expect(ex.sets[1].targetDistanceM).toBeNull();
  });

  it('D-04: modalidade com distância vira metric "tempo_distancia"', () => {
    const draft = rascunho([exercicio('ex-2', 'Corrida', [serie(1)])]);

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');

    expect(trocado.exercises[0].metric).toBe('tempo_distancia');
  });

  it('D-04: modalidade só-tempo vira metric "tempo"', () => {
    const draft = rascunho([exercicio('ex-2', 'Corrida', [serie(1)])]);

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Pular Corda');

    expect(trocado.exercises[0].metric).toBe('tempo');
  });

  it('D-08: name vira a nova modalidade; swappedFrom vira o nome ORIGINAL', () => {
    const draft = rascunho([exercicio('ex-2', 'Corrida', [serie(1)])]);

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');
    const ex = trocado.exercises[0];

    expect(ex.name).toBe('Remo Ergômetro');
    expect(ex.swappedFrom).toBe('Corrida');
  });

  it('troca dupla não perde a origem: swappedFrom final continua a origem VERDADEIRA', () => {
    const draft = rascunho([exercicio('ex-2', 'Corrida', [serie(1)])]);

    const primeira = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');
    const segunda = applyCardioSwapToDraft(primeira, 'ex-2', 'Bicicleta Ergométrica');

    expect(segunda.exercises[0].name).toBe('Bicicleta Ergométrica');
    expect(segunda.exercises[0].swappedFrom).toBe('Corrida');
  });

  it('exercício de exerciseId diferente não é alterado', () => {
    const draft = rascunho([
      exercicio('ex-1', 'Supino Reto', [serie(1)], { metric: 'carga_reps' }),
      exercicio('ex-2', 'Corrida', [serie(1)]),
    ]);

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');

    expect(trocado.exercises[0]).toEqual(draft.exercises[0]);
    expect(trocado.exercises[0].name).toBe('Supino Reto');
  });

  it('CR-01 (decisão a): série já CONCLUÍDA não tem o alvo reescrito pela troca', () => {
    const draft = rascunho([
      exercicio('ex-2', 'Corrida', [
        serie(1, {
          status: 'done',
          actualDurationSeconds: 1200,
          actualDistanceM: 4800,
          outcome: 'on_target',
        }),
        serie(2),
      ]),
    ]);

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');

    // A série feita preserva TUDO que foi registrado nela — inclusive o alvo
    // de distância da modalidade em que foi realmente executada (histórico não
    // se reescreve). Só as pendentes recebem o alvo zerado (D-01).
    const feita = trocado.exercises[0].sets[0];
    expect(feita.status).toBe('done');
    expect(feita.targetDistanceM).toBe(5000);
    expect(feita.actualDistanceM).toBe(4800);
    expect(feita.actualDurationSeconds).toBe(1200);
    const pendente = trocado.exercises[0].sets[1];
    expect(pendente.targetDistanceM).toBeNull();
  });

  it('imutabilidade: o draft original não é mutado', () => {
    const draft = rascunho([exercicio('ex-2', 'Corrida', [serie(1), serie(2)])]);
    const exercisesOriginais = draft.exercises;
    const exercicioOriginal = draft.exercises[0];
    const setsOriginais = draft.exercises[0].sets;

    const trocado = applyCardioSwapToDraft(draft, 'ex-2', 'Remo Ergômetro');

    expect(draft.exercises).toBe(exercisesOriginais);
    expect(draft.exercises[0]).toBe(exercicioOriginal);
    expect(draft.exercises[0].sets).toBe(setsOriginais);
    expect(draft.exercises[0].name).toBe('Corrida');
    expect(draft.exercises[0].sets[0].targetDistanceM).toBe(5000);
    expect(trocado).not.toBe(draft);
    expect(trocado.exercises).not.toBe(exercisesOriginais);
  });
});
