import {
  exerciseIdentity,
  findActiveSet,
  findNextPendingSet,
  isTimeBased,
  metricOf,
  suggestLoad,
  type SessionDraft,
} from './sessionModel';
import { posicaoNoBlocoDeMetrica } from './sessionFlow';

export type LiveActivityPhase =
  | 'measuring'
  | 'resting'
  | 'readyOvertime'
  | 'blockOnly';

/** Contrato mínimo espelhado por ActivityKit/WidgetKit. */
export type LiveActivityContentState = {
  phase: LiveActivityPhase;
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
};

const contentStateFor = (
  draft: SessionDraft,
  phase: LiveActivityPhase,
  exercise: NonNullable<ReturnType<typeof findActiveSet>>['exercise'],
  set: NonNullable<ReturnType<typeof findActiveSet>>['set'],
  restEndsAt: string | null,
  blockPosition: { indice: number; total: number } | null = null,
): LiveActivityContentState => {
  const isMeasuring = phase === 'measuring' && !exercise.isBodyweight;
  const currentLoadKg = isMeasuring
    ? suggestLoad({
        actualLoadKg: set.actualLoadKg,
        targetLoadKg: set.targetLoadKg,
        lastLoad: draft.lastLoadByExercise[exerciseIdentity(exercise)],
      })
    : null;

  return {
    phase,
    exerciseName: exercise.name,
    setIndex: set.setOrder,
    setTotal: exercise.sets.length,
    targetRepsMin: phase === 'blockOnly' ? null : set.targetRepsMin,
    targetRepsMax: phase === 'blockOnly' ? null : set.targetRepsMax,
    targetLoadKg: phase === 'blockOnly' ? null : set.targetLoadKg,
    isBodyweight: exercise.isBodyweight,
    restEndsAt: restEndsAt ? new Date(restEndsAt).toISOString() : null,
    blockLabel: phase === 'blockOnly' ? exercise.name : null,
    blockIndex: phase === 'blockOnly' ? blockPosition?.indice ?? null : null,
    blockTotal: phase === 'blockOnly' ? blockPosition?.total ?? null : null,
    currentLoadKg,
    isLoadInherited: isMeasuring && set.actualLoadKg == null,
    loadIncrementKg: isMeasuring ? exercise.loadIncrementKg : null,
  };
};

/** Deriva o estado nativo sem I/O e sem produzir timer para measuring. */
export const buildLiveActivityContentState = (
  draft: SessionDraft,
  now: Date = new Date(),
): LiveActivityContentState | null => {
  const active = findActiveSet(draft);
  const next = findNextPendingSet(draft);
  const current = active ?? next;
  const restEndsAtMs = draft.restEndsAt ? Date.parse(draft.restEndsAt) : Number.NaN;
  const validRestEndsAt = Number.isFinite(restEndsAtMs) ? draft.restEndsAt : null;

  if (!current) return null;

  if (isTimeBased(metricOf(current.exercise))) {
    return contentStateFor(
      draft,
      'blockOnly',
      current.exercise,
      current.set,
      validRestEndsAt,
      posicaoNoBlocoDeMetrica(draft, current.exercise.exerciseId),
    );
  }

  if (validRestEndsAt) {
    const phase = restEndsAtMs > now.getTime() ? 'resting' : 'readyOvertime';
    return contentStateFor(draft, phase, current.exercise, current.set, validRestEndsAt);
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
  return contentStateFor(draft, 'measuring', current.exercise, current.set, null);
};
