// Edição de plano existente — modos de falha cobertos:
// - importar uma semana progressiva em vez da semana 1 original;
// - perder prescrição, dia, limitação ou regras de progressão na conversão;
// - transformar aquecimento/alongamento injetados em exercícios editáveis e
//   duplicá-los a cada rodada de abrir → salvar → abrir;
// - inventar progressão quando planos antigos têm progression_rules nulo.

import {
  manualDraftFromExistingPlan,
  type ExistingManualPlanMetadata,
} from '../src/services/manualPlanImport';
import type {
  PlannedExercise,
  PlannedSet,
  SessionDetail,
} from '../src/services/trainingRepository';

const plannedSet = (
  partial: Partial<PlannedSet> = {},
): PlannedSet => ({
  id: `set-${Math.random()}`,
  exercise_id: 'exercise',
  set_order: 1,
  target_reps_min: 8,
  target_reps_max: 12,
  target_load_kg: null,
  target_rir: null,
  target_duration_seconds: null,
  target_distance_m: null,
  ...partial,
});

const plannedExercise = (
  exerciseKey: string | null,
  name: string,
  partial: Partial<PlannedExercise> = {},
): PlannedExercise => ({
  id: `exercise-${name}`,
  session_id: 'session-1',
  exercise_order: 1,
  name,
  exercise_key: exerciseKey,
  name_original: name,
  metric: 'carga_reps',
  muscle_group: 'Peito',
  priority: 'primary',
  equipment: 'Barra',
  load_increment_kg: 2.5,
  rest_seconds: 90,
  target_rm_percent: 72.5,
  sets_planned: 4,
  reps_raw: '8-12',
  method: null,
  notes: 'Controle a descida',
  injury_flags: [],
  planned_sets: [plannedSet()],
  ...partial,
});

const sessionWithInjectedBlocks = (
  exercises: PlannedExercise[] = [
    plannedExercise('supino_reto_barra', 'Supino Reto com Barra'),
  ],
): SessionDetail => ({
  id: 'session-1',
  plan_id: 'plan-old',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: 'sexta',
  order_in_week: 1,
  title: 'Treino Push',
  session_type: 'Personalizado',
  scheduled_date: '2026-07-24',
  estimated_minutes: 55,
  status: 'pending',
  muscle_groups: ['Peito'],
  planned_exercises: [
    plannedExercise('aquecimento_articular', 'Aquecimento Articular', {
      exercise_order: 1,
      metric: 'tempo',
      priority: 'accessory',
      sets_planned: 1,
      reps_raw: null,
      planned_sets: [plannedSet({ target_reps_min: null, target_reps_max: null, target_duration_seconds: 300 })],
    }),
    ...exercises.map((exercise, index) => ({ ...exercise, exercise_order: index + 2 })),
    plannedExercise('alongamento_dinamico', 'Alongamento Dinâmico', {
      exercise_order: exercises.length + 2,
      metric: 'tempo',
      priority: 'accessory',
      sets_planned: 1,
      reps_raw: null,
      planned_sets: [plannedSet({ target_reps_min: null, target_reps_max: null, target_duration_seconds: 300 })],
    }),
  ],
});

const metadata: ExistingManualPlanMetadata = {
  id: 'plan-old',
  name: 'Plano do professor',
  duration_weeks: 12,
  progression_rules: [
    {
      tipo: 'delta_series',
      valor: 1,
      semana_inicio: 5,
      semana_fim: 8,
      grupo_alvo: 'todos',
    },
    {
      tipo: 'deload_percentual',
      semana: 4,
      fator_rm: 0.8,
      fator_series: 0.7,
    },
  ],
};

describe('manualDraftFromExistingPlan', () => {
  it('preserva a prescrição da semana 1 e converte os blocos injetados em toggles', () => {
    const imported = manualDraftFromExistingPlan(metadata, [sessionWithInjectedBlocks()]);

    expect(imported.progressionUnavailable).toBe(false);
    expect(imported.draft).toMatchObject({
      nome: 'Plano do professor',
      duracao_semanas: 12,
      progressao: {
        series: { ativa: true, valor: 1, semana_inicio: 5, semana_fim: 8 },
        cardio: null,
        intensidade: null,
        deload: { ativa: true, semana: 4, fator_rm: 0.8, fator_series: 0.7 },
      },
    });
    expect(imported.draft.treinos[0]).toMatchObject({
      nome: 'Treino Push',
      dia_offset: 4,
      duracao_minutos: 55,
      incluir_aquecimento: true,
      incluir_alongamento: true,
    });
    expect(imported.draft.treinos[0].exercicios).toEqual([
      expect.objectContaining({
        exercise_key: 'supino_reto_barra',
        nome: 'Supino Reto com Barra',
        metrica: 'carga_reps',
        equipamento: 'Barra',
        series: 4,
        repeticoes: '8-12',
        tempo_descanso: 90,
        prioridade: 'primario',
        percentual_rm: 72.5,
        observacoes: 'Controle a descida',
        tem_limitacao: false,
      }),
    ]);
  });

  it('não duplica aquecimento nem alongamento após duas rodadas de edição', () => {
    const first = manualDraftFromExistingPlan(metadata, [sessionWithInjectedBlocks()]);

    // Simula o resultado do pipeline ao salvar: os toggles voltam a injetar
    // exatamente um bloco em cada ponta da sessão.
    const second = manualDraftFromExistingPlan(metadata, [
      sessionWithInjectedBlocks([
        plannedExercise(
          first.draft.treinos[0].exercicios[0].exercise_key,
          first.draft.treinos[0].exercicios[0].nome,
        ),
      ]),
    ]);

    expect(second.draft.treinos[0].incluir_aquecimento).toBe(true);
    expect(second.draft.treinos[0].incluir_alongamento).toBe(true);
    expect(second.draft.treinos[0].exercicios).toHaveLength(1);
    expect(second.draft.treinos[0].exercicios[0].exercise_key).toBe('supino_reto_barra');
  });

  it('desliga tudo e sinaliza indisponibilidade quando progression_rules é nulo', () => {
    const imported = manualDraftFromExistingPlan(
      { ...metadata, progression_rules: null },
      [sessionWithInjectedBlocks()],
    );

    expect(imported.progressionUnavailable).toBe(true);
    expect(imported.draft.progressao).toEqual({
      series: null,
      cardio: null,
      intensidade: null,
      deload: null,
    });
  });
});
