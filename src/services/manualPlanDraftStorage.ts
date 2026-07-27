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

// Campos recuperáveis são COAGIDOS antes de validar. Um rascunho gravado por
// build anterior com `duracao_minutos: 37.5` reprovava inteiro e o store
// gravava um plano vazio por cima — o aluno perdia tudo, em silêncio.
const coerceDraft = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  const draft = value as { treinos?: unknown };
  if (!Array.isArray(draft.treinos)) return value;
  for (const workout of draft.treinos) {
    if (!workout || typeof workout !== 'object') continue;
    const w = workout as { duracao_minutos?: unknown };
    if (typeof w.duracao_minutos === 'number' && Number.isFinite(w.duracao_minutos)) {
      w.duracao_minutos = Math.round(w.duracao_minutos);
    }
  }
  return value;
};

const parseDraft = (raw: string | null): ManualPlanDraft | null => {
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as { version?: unknown; draft?: unknown };
    const candidato = coerceDraft(envelope.draft);
    return envelope.version === VERSION && isDraft(candidato) ? candidato : null;
  } catch {
    return null;
  }
};

export type ManualPlanDraftLoad = {
  draft: ManualPlanDraft | null;
  /**
   * Havia bytes gravados para este usuário — mesmo que ilegíveis.
   *
   * O chamador precisa saber disso para NÃO sobrescrever um rascunho que
   * apenas não pôde ser lido: apagar por cima é irreversível.
   */
  hadStoredBytes: boolean;
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

export const readManualPlanDraft = async (
  userId: string,
): Promise<ManualPlanDraftLoad> => {
  const key = keyFor(userId);
  return withKeyQueue(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    return { draft: parseDraft(raw), hadStoredBytes: typeof raw === 'string' && raw.length > 0 };
  });
};

export const loadManualPlanDraft = async (
  userId: string,
): Promise<ManualPlanDraft | null> => (await readManualPlanDraft(userId)).draft;

export const clearManualPlanDraft = async (userId: string): Promise<void> => {
  const key = keyFor(userId);
  await withKeyQueue(key, () => AsyncStorage.removeItem(key));
};
