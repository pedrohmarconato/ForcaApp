// Reconstrói o rascunho editável a partir da semana 1 persistida. A função é
// pura: leitura do Supabase fica no store, e nenhum valor de progressão é
// deduzido quando o plano antigo não preservou progression_rules.

import type { CatalogMetric } from './exerciseCatalogService';
import type { PlannedExercise, SessionDetail } from './trainingRepository';
import type {
  ManualExerciseDraft,
  ManualExercisePriority,
  ManualPlanDraft,
  ManualProgression,
} from '../types/manualPlan';

export type ExistingManualPlanMetadata = {
  id: string;
  name: string;
  duration_weeks: number;
  progression_rules: unknown[] | null;
};

export type ManualPlanImportResult = {
  draft: ManualPlanDraft;
  progressionUnavailable: boolean;
};

const WARMUP_KEY = 'aquecimento_articular';
const STRETCH_KEY = 'alongamento_dinamico';
const VALID_METRICS = new Set<CatalogMetric>([
  'carga_reps',
  'tempo',
  'tempo_distancia',
]);

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const integer = (value: unknown): value is number =>
  finiteNumber(value) && Number.isInteger(value);

const priorityFromDatabase = (
  priority: PlannedExercise['priority'],
): ManualExercisePriority => {
  switch (priority) {
    case 'primary':
      return 'primario';
    case 'secondary':
      return 'secundario';
    case 'accessory':
    default:
      return 'acessorio';
  }
};

const metricFromExercise = (exercise: PlannedExercise): CatalogMetric =>
  VALID_METRICS.has(exercise.metric as CatalogMetric)
    ? (exercise.metric as CatalogMetric)
    : 'carga_reps';

const dayOffsetFromScheduledDate = (scheduledDate: string | null): number | null => {
  if (!scheduledDate) return null;
  const date = new Date(`${scheduledDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
};

const sessionDurationFromPlan = (minutes: number | null): number | null =>
  integer(minutes) && minutes >= 15 && minutes <= 180 ? minutes : null;

const exerciseFromPlan = (exercise: PlannedExercise): ManualExerciseDraft => {
  const firstSet = exercise.planned_sets?.[0];
  const durationSeconds = firstSet?.target_duration_seconds;
  const distanceMeters = firstSet?.target_distance_m;

  return {
    exercise_key: exercise.exercise_key ?? null,
    nome: exercise.name,
    equipamento: exercise.equipment ?? null,
    metrica: metricFromExercise(exercise),
    series: exercise.sets_planned,
    repeticoes: exercise.reps_raw ?? null,
    duracao_minutos: finiteNumber(durationSeconds) ? durationSeconds / 60 : null,
    distancia_km: finiteNumber(distanceMeters) ? distanceMeters / 1000 : null,
    tempo_descanso: exercise.rest_seconds ?? null,
    prioridade: priorityFromDatabase(exercise.priority),
    percentual_rm: exercise.target_rm_percent ?? null,
    observacoes: exercise.notes ?? null,
    tem_limitacao: (exercise.injury_flags?.length ?? 0) > 0,
  };
};

const emptyProgression = (): ManualProgression => ({
  series: null,
  cardio: null,
  intensidade: null,
  deload: null,
});

const progressionFromRules = (rules: unknown[]): ManualProgression => {
  const progression = emptyProgression();

  for (const rawRule of rules) {
    if (!rawRule || typeof rawRule !== 'object') continue;
    const rule = rawRule as Record<string, unknown>;
    switch (rule.tipo) {
      case 'delta_series':
        if (
          integer(rule.valor) &&
          integer(rule.semana_inicio) &&
          integer(rule.semana_fim)
        ) {
          progression.series = {
            ativa: true,
            valor: rule.valor,
            semana_inicio: rule.semana_inicio,
            semana_fim: rule.semana_fim,
          };
        }
        break;
      case 'delta_cardio_percentual':
        if (
          finiteNumber(rule.valor) &&
          ['duracao', 'distancia', 'ambos'].includes(String(rule.alvo))
        ) {
          progression.cardio = {
            ativa: true,
            valor: rule.valor,
            alvo: rule.alvo as 'duracao' | 'distancia' | 'ambos',
          };
        }
        break;
      case 'delta_rm_percentual':
        if (finiteNumber(rule.valor)) {
          progression.intensidade = { ativa: true, valor: rule.valor };
        }
        break;
      case 'deload_percentual':
        if (
          integer(rule.semana) &&
          finiteNumber(rule.fator_rm) &&
          finiteNumber(rule.fator_series)
        ) {
          progression.deload = {
            ativa: true,
            semana: rule.semana,
            fator_rm: rule.fator_rm,
            fator_series: rule.fator_series,
          };
        }
        break;
      default:
        break;
    }
  }

  return progression;
};

export const manualDraftFromExistingPlan = (
  metadata: ExistingManualPlanMetadata,
  sessions: SessionDetail[],
): ManualPlanImportResult => {
  const weekOne = sessions
    .filter((session) => session.week_number === 1 && session.plan_id === metadata.id)
    .slice()
    .sort((a, b) => a.order_in_week - b.order_in_week);
  if (weekOne.length === 0) {
    throw new Error('A semana 1 do plano não foi encontrada.');
  }

  const progressionUnavailable = metadata.progression_rules === null;
  const progression = progressionUnavailable
    ? emptyProgression()
    : progressionFromRules(metadata.progression_rules);

  return {
    progressionUnavailable,
    draft: {
      nome: metadata.name,
      duracao_semanas: metadata.duration_weeks,
      progressao: progression,
      treinos: weekOne.map((session) => {
        const exercises = session.planned_exercises ?? [];
        return {
          nome: session.title,
          dia_offset: dayOffsetFromScheduledDate(session.scheduled_date),
          // O contrato manual aceita 15..180. Estimativas fora dessa faixa
          // voltam a null para o mesmo servidor recalculá-las pelo volume.
          duracao_minutos: sessionDurationFromPlan(session.estimated_minutes),
          incluir_aquecimento: exercises.some(
            (exercise) => exercise.exercise_key === WARMUP_KEY,
          ),
          incluir_alongamento: exercises.some(
            (exercise) => exercise.exercise_key === STRETCH_KEY,
          ),
          exercicios: exercises
            .filter(
              (exercise) =>
                exercise.exercise_key !== WARMUP_KEY &&
                exercise.exercise_key !== STRETCH_KEY,
            )
            .map(exerciseFromPlan),
        };
      }),
    },
  };
};
