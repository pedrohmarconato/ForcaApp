// Rascunho do editor manual. Ele atravessa três telas e pode representar muitos
// minutos de digitação, portanto é persistido por usuário no aparelho.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ManualPlanDraft } from '../types/manualPlan';

const VERSION = 1;
const keyFor = (userId: string): string => `@manual_plan_draft_${userId}`;
const keyQueues = new Map<string, Promise<void>>();

const withKeyQueue = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = keyQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  keyQueues.set(key, turn);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (keyQueues.get(key) === turn) keyQueues.delete(key);
  }
};

const isDraft = (value: unknown): value is ManualPlanDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ManualPlanDraft>;
  const metrics = new Set(['carga_reps', 'tempo', 'tempo_distancia']);
  const priorities = new Set(['primario', 'secundario', 'acessorio']);
  return (
    typeof draft.nome === 'string' &&
    Number.isInteger(draft.duracao_semanas) &&
    !!draft.progressao &&
    typeof draft.progressao === 'object' &&
    Array.isArray(draft.treinos) &&
    draft.treinos.every((workout) =>
      !!workout &&
      typeof workout.nome === 'string' &&
      (workout.dia_offset === null || Number.isInteger(workout.dia_offset)) &&
      (workout.duracao_minutos === null || Number.isInteger(workout.duracao_minutos)) &&
      typeof workout.incluir_aquecimento === 'boolean' &&
      typeof workout.incluir_alongamento === 'boolean' &&
      Array.isArray(workout.exercicios) &&
      workout.exercicios.every((exercise) =>
        !!exercise &&
        (exercise.exercise_key === null || typeof exercise.exercise_key === 'string') &&
        typeof exercise.nome === 'string' &&
        (exercise.equipamento === null || typeof exercise.equipamento === 'string') &&
        metrics.has(exercise.metrica) &&
        Number.isInteger(exercise.series) &&
        priorities.has(exercise.prioridade) &&
        typeof exercise.tem_limitacao === 'boolean'
      )
    )
  );
};

const parseDraft = (raw: string | null): ManualPlanDraft | null => {
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as { version?: unknown; draft?: unknown };
    return envelope.version === VERSION && isDraft(envelope.draft)
      ? envelope.draft
      : null;
  } catch {
    return null;
  }
};

export const saveManualPlanDraft = async (
  userId: string,
  draft: ManualPlanDraft,
): Promise<void> => {
  const key = keyFor(userId);
  await withKeyQueue(key, () =>
    AsyncStorage.setItem(key, JSON.stringify({ version: VERSION, draft })),
  );
};

export const loadManualPlanDraft = async (
  userId: string,
): Promise<ManualPlanDraft | null> => {
  const key = keyFor(userId);
  return withKeyQueue(key, async () => parseDraft(await AsyncStorage.getItem(key)));
};

export const clearManualPlanDraft = async (userId: string): Promise<void> => {
  const key = keyFor(userId);
  await withKeyQueue(key, () => AsyncStorage.removeItem(key));
};
