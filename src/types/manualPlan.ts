import type { CatalogMetric } from '../services/exerciseCatalogService';

export type ManualExercisePriority = 'primario' | 'secundario' | 'acessorio';

export type ManualExerciseDraft = {
  exercise_key: string | null;
  nome: string;
  equipamento: string | null;
  /** Catálogo é autoritativo; para nome livre, este é o seletor explícito do aluno. */
  metrica: CatalogMetric;
  series: number;
  repeticoes: string | null;
  duracao_minutos: number | null;
  distancia_km: number | null;
  tempo_descanso: string | number | null;
  prioridade: ManualExercisePriority;
  percentual_rm: number | null;
  observacoes: string | null;
  tem_limitacao: boolean;
};

export type ManualWorkoutDraft = {
  nome: string;
  dia_offset: number | null;
  duracao_minutos: number | null;
  incluir_aquecimento: boolean;
  incluir_alongamento: boolean;
  exercicios: ManualExerciseDraft[];
};

export type SeriesProgression = {
  ativa: boolean;
  valor: number;
  semana_inicio: number;
  semana_fim: number;
};

export type CardioProgression = {
  ativa: boolean;
  valor: number;
  alvo: 'duracao' | 'distancia' | 'ambos';
};

export type IntensityProgression = { ativa: boolean; valor: number };

export type DeloadProgression = {
  ativa: boolean;
  semana: number;
  fator_rm: number;
  fator_series: number;
};

export type ManualProgression = {
  series: SeriesProgression | null;
  cardio: CardioProgression | null;
  intensidade: IntensityProgression | null;
  deload: DeloadProgression | null;
};

export type ManualPlanDraft = {
  nome: string;
  duracao_semanas: number;
  progressao: ManualProgression;
  treinos: ManualWorkoutDraft[];
};

export type ManualPlanPreviewExercise = { nome: string; alvo: string };
export type ManualPlanPreviewWorkout = {
  nome: string;
  dia: string;
  minutos: number | null;
  exercicios: ManualPlanPreviewExercise[];
};
export type ManualPlanPreview = {
  semanas: Array<{ semana: number; treinos: ManualPlanPreviewWorkout[] }>;
};

export type ManualOnboardingQuestionnaire = {
  dias_treino?: string[];
  tempo_medio_treino_min?: number | null;
  inclui_cardio?: boolean;
  inclui_alongamento?: boolean;
  objetivo?: string | null;
};

export const DEFAULT_MANUAL_PROGRESSION = (): ManualProgression => ({
  series: { ativa: false, valor: 1, semana_inicio: 5, semana_fim: 8 },
  cardio: null,
  intensidade: null,
  deload: { ativa: true, semana: 4, fator_rm: 0.8, fator_series: 0.8 },
});

export const createEmptyManualPlanDraft = (): ManualPlanDraft => ({
  nome: 'Meu plano',
  duracao_semanas: 12,
  progressao: DEFAULT_MANUAL_PROGRESSION(),
  treinos: [],
});

export const createEmptyManualWorkout = (
  index: number,
  options: { incluirAlongamento?: boolean } = {},
): ManualWorkoutDraft => ({
  nome: `Treino ${String.fromCharCode(65 + index)}`,
  dia_offset: null,
  duracao_minutos: null,
  incluir_aquecimento: false,
  incluir_alongamento: options.incluirAlongamento === true,
  exercicios: [],
});

const DAY_OFFSET_BY_VALUE: Record<string, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** Prefill estritamente derivado do questionário; exercícios nunca são escolhidos aqui. */
export const createManualPlanDraftFromQuestionnaire = (
  questionnaire: ManualOnboardingQuestionnaire,
): ManualPlanDraft => {
  const draft = createEmptyManualPlanDraft();
  const duration = questionnaire.tempo_medio_treino_min;
  const validDuration =
    typeof duration === 'number' &&
    Number.isInteger(duration) &&
    duration >= 15 &&
    duration <= 180
      ? duration
      : null;
  const seenDays = new Set<number>();

  for (const day of questionnaire.dias_treino ?? []) {
    const offset = DAY_OFFSET_BY_VALUE[day];
    if (offset == null || seenDays.has(offset) || draft.treinos.length >= 7) continue;
    seenDays.add(offset);
    const workout = createEmptyManualWorkout(draft.treinos.length, {
      incluirAlongamento: questionnaire.inclui_alongamento === true,
    });
    workout.dia_offset = offset;
    workout.duracao_minutos = validDuration;
    draft.treinos.push(workout);
  }

  return draft;
};

export const hasCardioExercise = (draft: ManualPlanDraft): boolean =>
  draft.treinos.some((treino) =>
    treino.exercicios.some((exercicio) => exercicio.metrica === 'tempo_distancia'),
  );

export const hasRmExercise = (draft: ManualPlanDraft): boolean =>
  draft.treinos.some((treino) =>
    treino.exercicios.some((exercicio) => (exercicio.percentual_rm ?? 0) > 0),
  );

export const isManualPlanSavable = (draft: ManualPlanDraft | null): boolean =>
  !!draft &&
  draft.nome.trim().length > 0 &&
  draft.treinos.length > 0 &&
  draft.treinos.every(
    (treino) => treino.nome.trim().length > 0 && treino.exercicios.length > 0,
  );
