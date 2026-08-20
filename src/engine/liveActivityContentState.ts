import {
  exerciseIdentity,
  findActiveSet,
  findNextPendingSet,
  findPendingSetAfter,
  isFirstSetOfExerciseInSession,
  isTimeBased,
  metricOf,
  suggestLoad,
  suggestReps,
  type SessionDraft,
  type SetRef,
} from './sessionModel';
import { posicaoNoBlocoDeMetrica } from './sessionFlow';
import { parseNeonColor, type NeonColorKey } from '../theme/theme';

export type LiveActivityPhase =
  'measuring' | 'resting' | 'readyOvertime' | 'blockOnly';

/** Contrato mínimo espelhado por ActivityKit/WidgetKit. */
export type LiveActivityContentState = {
  phase: LiveActivityPhase;
  neonColor: NeonColorKey;
  exerciseName: string;
  setIndex: number;
  setTotal: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetLoadKg: number | null;
  isBodyweight: boolean;
  restEndsAt: string | null;
  blockLabel: string | null;
  blockIndex: number | null;
  blockTotal: number | null;
  /** Carga EM EDIÇÃO (nunca a faixa-alvo estática) — só preenchida em measuring. */
  currentLoadKg: number | null;
  /** true quando currentLoadKg foi herdado (alvo/histórico), nunca digitado/ajustado nesta série. */
  isLoadInherited: boolean;
  /** Passo do stepper de carga do Lock Screen — só preenchido em measuring. */
  loadIncrementKg: number | null;
  /**
   * Reps EM EDIÇÃO (nunca a faixa-alvo estática) — só preenchida em measuring.
   * Ao contrário de currentLoadKg, existe também para exercício bodyweight
   * (reps sempre existem; só a carga é omitida para bodyweight).
   */
  currentReps: number | null;
  /** true quando currentReps foi herdado (histórico/alvo, D-17), nunca digitado/ajustado nesta série. */
  isRepsInherited: boolean;
  /**
   * Antecipação "A SEGUIR" (Fase 17, PRED-01) — a série ESTRITAMENTE DEPOIS da
   * que `current` já descreve (`findPendingSetAfter`), nunca a mesma série
   * repetida. Preenchida em measuring/resting/readyOvertime; null em
   * blockOnly (D-16: sem linha "a seguir" dentro do bloco de cardio/
   * alongamento) e quando não existe mais nenhuma série pendente depois.
   * Virada para bloco de cardio/alongamento: só `nextExerciseName` vem
   * preenchido, os outros cinco saem null (D-03 da Fase 15: nunca prescrição
   * de cardio antecipada).
   */
  nextExerciseName: string | null;
  nextSetIndex: number | null;
  nextSetTotal: number | null;
  /** Mesmo valor que suggestReps() resolveria para essa série (D-17), nunca a prescrição crua. */
  nextSuggestedReps: number | null;
  /** Mesmo valor que suggestLoad() resolveria para essa série (D-08), nunca a prescrição crua. */
  nextSuggestedLoadKg: number | null;
  nextIsBodyweight: boolean | null;
};

/** Seis campos de antecipação, todos null — fallback quando não há próxima série ou o parâmetro não é passado. */
const NULL_ANTICIPATED_FIELDS = {
  nextExerciseName: null,
  nextSetIndex: null,
  nextSetTotal: null,
  nextSuggestedReps: null,
  nextSuggestedLoadKg: null,
  nextIsBodyweight: null,
} as const;

type AnticipatedFields = Pick<
  LiveActivityContentState,
  | 'nextExerciseName'
  | 'nextSetIndex'
  | 'nextSetTotal'
  | 'nextSuggestedReps'
  | 'nextSuggestedLoadKg'
  | 'nextIsBodyweight'
>;

/**
 * Compõe os seis campos de antecipação "A SEGUIR" a partir da série
 * ESTRITAMENTE DEPOIS de `current` (`findPendingSetAfter`). Virada para bloco
 * de cardio/alongamento (D-03 da Fase 15, D-16): só o nome do bloco, nunca a
 * prescrição de tempo/distância. Reps via `suggestReps()` bifurcado pela
 * precedência híbrida D-17 sobre o PRÓPRIO set encontrado (não sobre
 * `current`); carga via `suggestLoad()` (D-08, precedência inalterada).
 */
const anticipatedFieldsFor = (draft: SessionDraft, current: SetRef): AnticipatedFields => {
  const pending = findPendingSetAfter(draft, current);
  if (!pending) return { ...NULL_ANTICIPATED_FIELDS };

  const { exercise, set } = pending;

  if (isTimeBased(metricOf(exercise))) {
    return { ...NULL_ANTICIPATED_FIELDS, nextExerciseName: exercise.name };
  }

  return {
    nextExerciseName: exercise.name,
    nextSetIndex: set.setOrder,
    nextSetTotal: exercise.sets.length,
    nextSuggestedReps: suggestReps({
      actualReps: set.actualReps,
      targetRepsMin: set.targetRepsMin > 0 ? set.targetRepsMin : null,
      lastReps: draft.lastRepsByExercise[exerciseIdentity(exercise)],
      isFirstSetOfExerciseInSession: isFirstSetOfExerciseInSession(exercise, set),
    }),
    nextSuggestedLoadKg: exercise.isBodyweight
      ? null
      : suggestLoad({
          actualLoadKg: set.actualLoadKg,
          targetLoadKg: set.targetLoadKg,
          lastLoad: draft.lastLoadByExercise[exerciseIdentity(exercise)],
        }),
    nextIsBodyweight: exercise.isBodyweight,
  };
};

const contentStateFor = (
  draft: SessionDraft,
  phase: LiveActivityPhase,
  exercise: NonNullable<ReturnType<typeof findActiveSet>>['exercise'],
  set: NonNullable<ReturnType<typeof findActiveSet>>['set'],
  restEndsAt: string | null,
  neonColor: NeonColorKey,
  blockPosition: { indice: number; total: number } | null = null,
  anticipated: AnticipatedFields | null = null,
): LiveActivityContentState => {
  const isMeasuringPhase = phase === 'measuring';
  const isMeasuring = isMeasuringPhase && !exercise.isBodyweight;
  const currentLoadKg = isMeasuring
    ? suggestLoad({
        actualLoadKg: set.actualLoadKg,
        targetLoadKg: set.targetLoadKg,
        lastLoad: draft.lastLoadByExercise[exerciseIdentity(exercise)],
      })
    : null;
  // Reps sempre existem (inclusive bodyweight) — só a carga é omitida para
  // bodyweight, por isso usa isMeasuringPhase, não isMeasuring.
  const currentReps = isMeasuringPhase
    ? suggestReps({
        actualReps: set.actualReps,
        targetRepsMin: set.targetRepsMin > 0 ? set.targetRepsMin : null,
        lastReps: draft.lastRepsByExercise[exerciseIdentity(exercise)],
        isFirstSetOfExerciseInSession: isFirstSetOfExerciseInSession(exercise, set),
      })
    : null;

  return {
    phase,
    neonColor,
    exerciseName: exercise.name,
    setIndex: set.setOrder,
    setTotal: exercise.sets.length,
    targetRepsMin: phase === 'blockOnly' ? null : set.targetRepsMin,
    targetRepsMax: phase === 'blockOnly' ? null : set.targetRepsMax,
    targetLoadKg: phase === 'blockOnly' ? null : set.targetLoadKg,
    isBodyweight: exercise.isBodyweight,
    restEndsAt: restEndsAt ? new Date(restEndsAt).toISOString() : null,
    blockLabel: phase === 'blockOnly' ? exercise.name : null,
    blockIndex: phase === 'blockOnly' ? (blockPosition?.indice ?? null) : null,
    blockTotal: phase === 'blockOnly' ? (blockPosition?.total ?? null) : null,
    currentLoadKg,
    isLoadInherited: isMeasuring && set.actualLoadKg == null,
    loadIncrementKg: isMeasuring ? exercise.loadIncrementKg : null,
    currentReps,
    isRepsInherited: isMeasuringPhase && set.actualReps == null,
    nextExerciseName: anticipated?.nextExerciseName ?? null,
    nextSetIndex: anticipated?.nextSetIndex ?? null,
    nextSetTotal: anticipated?.nextSetTotal ?? null,
    nextSuggestedReps: anticipated?.nextSuggestedReps ?? null,
    nextSuggestedLoadKg: anticipated?.nextSuggestedLoadKg ?? null,
    nextIsBodyweight: anticipated?.nextIsBodyweight ?? null,
  };
};

/** Deriva o estado nativo sem I/O e sem produzir timer para measuring. */
export const buildLiveActivityContentState = (
  draft: SessionDraft,
  now: Date = new Date(),
  neonColor: unknown = 'yellow',
): LiveActivityContentState | null => {
  const validatedNeonColor = parseNeonColor(neonColor);
  const active = findActiveSet(draft);
  const next = findNextPendingSet(draft);
  const current = active ?? next;
  const restEndsAtMs = draft.restEndsAt
    ? Date.parse(draft.restEndsAt)
    : Number.NaN;
  const validRestEndsAt = Number.isFinite(restEndsAtMs)
    ? draft.restEndsAt
    : null;

  if (!current) return null;

  if (isTimeBased(metricOf(current.exercise))) {
    return contentStateFor(
      draft,
      'blockOnly',
      current.exercise,
      current.set,
      validRestEndsAt,
      validatedNeonColor,
      posicaoNoBlocoDeMetrica(draft, current.exercise.exerciseId),
    );
  }

  if (validRestEndsAt) {
    const phase = restEndsAtMs > now.getTime() ? 'resting' : 'readyOvertime';
    return contentStateFor(
      draft,
      phase,
      current.exercise,
      current.set,
      validRestEndsAt,
      validatedNeonColor,
      null,
      anticipatedFieldsFor(draft, current),
    );
  }

  // `active` é estado de UI puramente local (só setado por activateSet()) e
  // NUNCA é restaurado ao reconstruir o rascunho a partir do servidor
  // (retomada após relançamento do app): a série em andamento volta a
  // 'pending' até o aluno tocar de novo para revelar os campos. Se este
  // fallback exigisse `active` em vez de `current` (= active ?? next), o
  // card nunca apareceria numa sessão nova (série 1 nasce 'pending') nem
  // numa retomada — e como toda atualização SEGUINTE passa por
  // publishUpdate/updateActivity (que não cria Activity nova quando nenhuma
  // existe), o card ficaria ausente pelo resto da sessão. `current` sempre
  // existe aqui (já filtrado por `if (!current) return null` acima).
  return contentStateFor(
    draft,
    'measuring',
    current.exercise,
    current.set,
    null,
    validatedNeonColor,
    null,
    anticipatedFieldsFor(draft, current),
  );
};
