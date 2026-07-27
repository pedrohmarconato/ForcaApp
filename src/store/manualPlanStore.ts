// O rascunho manual atravessa editor de plano, editor de treino e picker. Um
// store dedicado evita acoplar navegação ao estado e, com o storage local,
// preserva o trabalho quando o app fecha durante a montagem.

import { create } from 'zustand';

import apiClient, { ENDPOINTS, classifyApiError } from '../services/api/apiClient';
import { getCatalog, type CatalogEntry } from '../services/exerciseCatalogService';
import { manualDraftFromExistingPlan } from '../services/manualPlanImport';
import {
  clearManualPlanDraft,
  readManualPlanDraft,
  saveManualPlanDraft,
} from '../services/manualPlanDraftStorage';
import {
  getPlanSessions,
  getSessionDetail,
  getTrainingPlanMetadata,
  type SessionDetail,
} from '../services/trainingRepository';
import {
  createEmptyManualPlanDraft,
  createEmptyManualWorkout,
  createManualPlanDraftFromQuestionnaire,
  hasCardioExercise,
  type ManualExerciseDraft,
  type ManualOnboardingQuestionnaire,
  type ManualPlanDraft,
  type ManualPlanPreview,
  type ManualProgression,
  shouldAutoEnableCardioProgression,
} from '../types/manualPlan';

type ManualPlanStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'previewing'
  | 'saving'
  // 'saved' existe para a tela distinguir "sem rascunho porque nunca houve" de
  // "sem rascunho porque acabou de virar plano". Sem essa distinção, o efeito
  // de inicialização re-disparava logo após o save e regravava um rascunho
  // fantasma no aparelho.
  | 'saved'
  | 'error';

type InitOptions = {
  forceNew?: boolean;
  incluirCardio?: boolean;
  incluirAlongamento?: boolean;
};

type DraftOrigin = 'empty' | 'onboarding' | 'existing';

type ResetOptions = { clearPersisted?: boolean };

type ManualPlanState = {
  userId: string | null;
  draft: ManualPlanDraft | null;
  status: ManualPlanStatus;
  saveError: string | null;
  catalog: CatalogEntry[];
  catalogError: string | null;
  previewData: ManualPlanPreview | null;
  incluirCardio: boolean;
  incluirAlongamento: boolean;
  draftOrigin: DraftOrigin | null;
  sourcePlanId: string | null;
  progressionUnavailable: boolean;
  /** Regras do plano original que o editor não representa (texto para a tela). */
  progressionChanges: string[];
  initEmpty: (userId: string, options?: InitOptions) => Promise<void>;
  initFromQuestionnaire: (
    userId: string,
    questionnaire: ManualOnboardingQuestionnaire,
  ) => Promise<void>;
  initFromPlan: (userId: string, planId: string) => Promise<void>;
  setPlanName: (name: string) => void;
  setDurationWeeks: (weeks: number) => void;
  setProgression: (partial: Partial<ManualProgression>) => void;
  disableProgression: () => void;
  addWorkout: () => boolean;
  removeWorkout: (workoutIndex: number) => void;
  renameWorkout: (workoutIndex: number, name: string) => void;
  setWorkoutDay: (workoutIndex: number, day: number | null) => void;
  setWorkoutDuration: (workoutIndex: number, minutes: number | null) => void;
  toggleWarmup: (workoutIndex: number) => void;
  toggleStretch: (workoutIndex: number) => void;
  addExercise: (workoutIndex: number, exercise: ManualExerciseDraft) => boolean;
  updateExercise: (
    workoutIndex: number,
    exerciseIndex: number,
    partial: Partial<ManualExerciseDraft>,
  ) => void;
  removeExercise: (workoutIndex: number, exerciseIndex: number) => void;
  reorderExercise: (workoutIndex: number, from: number, to: number) => void;
  preview: () => Promise<ManualPlanPreview | null>;
  save: () => Promise<string | null>;
  reset: (options?: ResetOptions) => Promise<void>;
};

let operationEpoch = 0;

const cloneDraft = (draft: ManualPlanDraft): ManualPlanDraft => ({
  ...draft,
  progressao: {
    series: draft.progressao.series ? { ...draft.progressao.series } : null,
    cardio: draft.progressao.cardio ? { ...draft.progressao.cardio } : null,
    intensidade: draft.progressao.intensidade ? { ...draft.progressao.intensidade } : null,
    deload: draft.progressao.deload ? { ...draft.progressao.deload } : null,
  },
  treinos: draft.treinos.map((treino) => ({
    ...treino,
    exercicios: treino.exercicios.map((exercicio) => ({ ...exercicio })),
  })),
});

const errorMessage = (error: unknown, fallback: string): string => {
  const responseMessage = (
    error as { response?: { data?: { error?: unknown } } }
  )?.response?.data?.error;
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;

  const classified = classifyApiError(error);
  switch (classified.kind) {
    case 'network':
      return 'Sem conexão com o servidor. Seu rascunho continua salvo.';
    case 'timeout':
      return 'O servidor demorou para responder. Tente novamente.';
    case 'unauthorized':
      return 'Sua sessão expirou. Entre novamente para salvar o plano.';
    case 'http_error':
      return classified.status >= 500
        ? 'Não foi possível concluir agora. Tente novamente em instantes.'
        : fallback;
    case 'canceled':
      return 'Operação cancelada.';
    case 'unexpected':
    default:
      return fallback;
  }
};

const removeCardioProgressionWhenUnused = (draft: ManualPlanDraft): void => {
  if (!hasCardioExercise(draft)) draft.progressao.cardio = null;
};

export const useManualPlanStore = create<ManualPlanState>((set, get) => {
  const persist = (draft: ManualPlanDraft): void => {
    const { userId } = get();
    if (userId) {
      void saveManualPlanDraft(userId, draft).catch(() => {
        set({
          saveError: 'Não foi possível atualizar o rascunho local. Mantenha o app aberto.',
        });
      });
    }
  };

  const mutateDraft = (mutation: (draft: ManualPlanDraft) => void): void => {
    const current = get().draft;
    if (!current) return;
    const draft = cloneDraft(current);
    mutation(draft);
    set({ draft, saveError: null, previewData: null });
    persist(draft);
  };

  return {
    userId: null,
    draft: null,
    status: 'idle',
    saveError: null,
    catalog: [],
    catalogError: null,
    previewData: null,
    incluirCardio: true,
    incluirAlongamento: false,
    draftOrigin: null,
    sourcePlanId: null,
    progressionUnavailable: false,
    progressionChanges: [],

    initEmpty: async (userId, options = {}) => {
      const epoch = ++operationEpoch;
      set({
        userId,
        draft: null,
        status: 'loading',
        saveError: null,
        catalogError: null,
        incluirCardio: options.incluirCardio ?? true,
        incluirAlongamento: options.incluirAlongamento ?? false,
        draftOrigin: 'empty',
        sourcePlanId: null,
        progressionUnavailable: false,
        progressionChanges: [],
      });
      const carregado = options.forceNew
        ? { draft: null, hadStoredBytes: false }
        : await readManualPlanDraft(userId);
      if (epoch !== operationEpoch) return;
      const draft = carregado.draft ?? createEmptyManualPlanDraft();
      set({ draft, status: 'ready' });
      // Só semeia o storage quando ele estava mesmo vazio. Se havia bytes que
      // não puderam ser lidos, gravar o rascunho vazio por cima seria destruir
      // trabalho do aluno de forma irreversível.
      if (!carregado.draft && !carregado.hadStoredBytes) persist(draft);

      try {
        const catalog = await getCatalog();
        if (epoch === operationEpoch) set({ catalog, catalogError: null });
      } catch {
        if (epoch === operationEpoch) {
          set({
            catalog: [],
            catalogError: 'Sem conexão com o catálogo. Você ainda pode escrever o nome livre.',
          });
        }
      }
    },

    initFromQuestionnaire: async (userId, questionnaire) => {
      const epoch = ++operationEpoch;
      set({
        userId,
        draft: null,
        status: 'loading',
        saveError: null,
        catalogError: null,
        previewData: null,
        incluirCardio: questionnaire.inclui_cardio === true,
        incluirAlongamento: questionnaire.inclui_alongamento === true,
        draftOrigin: 'onboarding',
        sourcePlanId: null,
        progressionUnavailable: false,
        progressionChanges: [],
      });
      let stored: ManualPlanDraft | null = null;
      let hadStoredBytes = false;
      try {
        const carregado = await readManualPlanDraft(userId);
        stored = carregado.draft;
        hadStoredBytes = carregado.hadStoredBytes;
      } catch {
        // Storage local indisponível não bloqueia o editor; o aviso abaixo
        // deixa explícito que manter o app aberto é necessário nesta sessão.
      }
      if (epoch !== operationEpoch) return;
      const draft = stored ?? createManualPlanDraftFromQuestionnaire(questionnaire);
      set({ draft, status: 'ready' });
      // Bytes ilegíveis não podem virar apagamento: só semeia quando o
      // armazenamento estava mesmo vazio.
      if (!stored && !hadStoredBytes) {
        try {
          await saveManualPlanDraft(userId, draft);
        } catch {
          if (epoch === operationEpoch) {
            set({
              saveError: 'Não foi possível salvar o rascunho local. Mantenha o app aberto.',
            });
          }
        }
      }

      try {
        const catalog = await getCatalog();
        if (epoch === operationEpoch) set({ catalog, catalogError: null });
      } catch {
        if (epoch === operationEpoch) {
          set({
            catalog: [],
            catalogError: 'Sem conexão com o catálogo. Você ainda pode escrever o nome livre.',
          });
        }
      }
    },

    initFromPlan: async (userId, planId) => {
      const epoch = ++operationEpoch;
      set({
        userId,
        draft: null,
        status: 'loading',
        saveError: null,
        catalogError: null,
        previewData: null,
        draftOrigin: 'existing',
        sourcePlanId: planId,
        progressionUnavailable: false,
        progressionChanges: [],
      });

      try {
        const [sessions, metadata] = await Promise.all([
          getPlanSessions(userId),
          getTrainingPlanMetadata(planId),
        ]);
        if (epoch !== operationEpoch) return;
        if (!metadata) throw new Error('Plano não encontrado.');

        const weekOne = sessions.filter(
          (session) => session.plan_id === planId && session.week_number === 1,
        );
        if (weekOne.length === 0) throw new Error('Semana 1 do plano não encontrada.');
        const details = await Promise.all(
          weekOne.map((session) => getSessionDetail(session.id)),
        );
        if (epoch !== operationEpoch) return;
        if (details.some((detail) => detail === null)) {
          throw new Error('Não foi possível ler todos os treinos da semana 1.');
        }

        const imported = manualDraftFromExistingPlan(
          metadata,
          details as SessionDetail[],
        );
        set({
          draft: imported.draft,
          status: 'ready',
          progressionUnavailable: imported.progressionUnavailable,
          progressionChanges: imported.progressionChanges,
          incluirCardio: true,
          incluirAlongamento: imported.draft.treinos.some(
            (workout) => workout.incluir_alongamento,
          ),
        });
        await saveManualPlanDraft(userId, imported.draft);

        try {
          const catalog = await getCatalog();
          if (epoch === operationEpoch) set({ catalog, catalogError: null });
        } catch {
          if (epoch === operationEpoch) {
            set({
              catalog: [],
              catalogError: 'Sem conexão com o catálogo. Você ainda pode escrever o nome livre.',
            });
          }
        }
      } catch {
        if (epoch === operationEpoch) {
          set({
            draft: null,
            status: 'error',
            saveError: 'Não foi possível carregar o plano atual para edição.',
          });
        }
      }
    },

    setPlanName: (name) => mutateDraft((draft) => {
      draft.nome = name;
    }),
    setDurationWeeks: (weeks) => mutateDraft((draft) => {
      draft.duracao_semanas = weeks;
      const deload = draft.progressao.deload;
      if (deload && deload.semana > weeks) deload.semana = Math.min(weeks, 4);
      const series = draft.progressao.series;
      if (series) {
        series.semana_inicio = Math.min(series.semana_inicio, weeks);
        series.semana_fim = Math.min(series.semana_fim, weeks);
      }
    }),
    setProgression: (partial) => mutateDraft((draft) => {
      draft.progressao = { ...draft.progressao, ...partial };
    }),
    disableProgression: () => mutateDraft((draft) => {
      draft.progressao = {
        series: null,
        cardio: null,
        intensidade: null,
        deload: null,
      };
    }),

    addWorkout: () => {
      const current = get().draft;
      if (!current) return false;
      if (current.treinos.length >= 7) {
        set({ saveError: 'Um plano pode ter até 7 treinos.' });
        return false;
      }
      mutateDraft((draft) => {
        draft.treinos.push(
          createEmptyManualWorkout(draft.treinos.length, {
            incluirAlongamento: get().incluirAlongamento,
          }),
        );
      });
      return true;
    },
    removeWorkout: (workoutIndex) => mutateDraft((draft) => {
      draft.treinos.splice(workoutIndex, 1);
      removeCardioProgressionWhenUnused(draft);
    }),
    renameWorkout: (workoutIndex, name) => mutateDraft((draft) => {
      if (draft.treinos[workoutIndex]) draft.treinos[workoutIndex].nome = name;
    }),
    setWorkoutDay: (workoutIndex, day) => mutateDraft((draft) => {
      if (draft.treinos[workoutIndex]) draft.treinos[workoutIndex].dia_offset = day;
    }),
    setWorkoutDuration: (workoutIndex, minutes) => mutateDraft((draft) => {
      if (draft.treinos[workoutIndex]) draft.treinos[workoutIndex].duracao_minutos = minutes;
    }),
    toggleWarmup: (workoutIndex) => mutateDraft((draft) => {
      const workout = draft.treinos[workoutIndex];
      if (workout) workout.incluir_aquecimento = !workout.incluir_aquecimento;
    }),
    toggleStretch: (workoutIndex) => mutateDraft((draft) => {
      const workout = draft.treinos[workoutIndex];
      if (workout) workout.incluir_alongamento = !workout.incluir_alongamento;
    }),
    addExercise: (workoutIndex, exercise) => {
      const workout = get().draft?.treinos[workoutIndex];
      if (!workout) return false;
      if (workout.exercicios.length >= 30) {
        set({ saveError: 'Cada treino pode ter até 30 exercícios.' });
        return false;
      }
      mutateDraft((draft) => {
        const hadCardio = shouldAutoEnableCardioProgression(draft);
        draft.treinos[workoutIndex].exercicios.push({ ...exercise });
        if (!hadCardio && shouldAutoEnableCardioProgression(draft)) {
          draft.progressao.cardio = { ativa: true, valor: 5, alvo: 'ambos' };
        }
      });
      return true;
    },
    updateExercise: (workoutIndex, exerciseIndex, partial) => mutateDraft((draft) => {
      const hadCardio = shouldAutoEnableCardioProgression(draft);
      const exercise = draft.treinos[workoutIndex]?.exercicios[exerciseIndex];
      if (exercise) Object.assign(exercise, partial);
      if (!hadCardio && shouldAutoEnableCardioProgression(draft)) {
        draft.progressao.cardio = { ativa: true, valor: 5, alvo: 'ambos' };
      } else {
        removeCardioProgressionWhenUnused(draft);
      }
    }),
    removeExercise: (workoutIndex, exerciseIndex) => mutateDraft((draft) => {
      draft.treinos[workoutIndex]?.exercicios.splice(exerciseIndex, 1);
      removeCardioProgressionWhenUnused(draft);
    }),
    reorderExercise: (workoutIndex, from, to) => mutateDraft((draft) => {
      const exercises = draft.treinos[workoutIndex]?.exercicios;
      if (!exercises || from < 0 || from >= exercises.length || to < 0 || to >= exercises.length) {
        return;
      }
      const [moved] = exercises.splice(from, 1);
      exercises.splice(to, 0, moved);
    }),

    preview: async () => {
      const draft = get().draft;
      if (!draft) return null;
      set({ status: 'previewing', saveError: null });
      try {
        const response = await apiClient.post<ManualPlanPreview>(
          ENDPOINTS.MANUAL_PLAN_PREVIEW,
          draft,
        );
        set({ previewData: response.data, status: 'ready' });
        return response.data;
      } catch (error) {
        set({
          status: 'error',
          saveError: errorMessage(error, 'Não foi possível gerar a prévia.'),
        });
        return null;
      }
    },
    save: async () => {
      const { draft, userId } = get();
      if (!draft || !userId) return null;
      set({ status: 'saving', saveError: null });
      try {
        const response = await apiClient.post<{ plan_id?: unknown }>(
          ENDPOINTS.MANUAL_PLAN,
          draft,
        );
        const planId = response.data.plan_id;
        if (typeof planId !== 'string' || !planId) {
          throw new Error('Resposta sem plan_id.');
        }
        try {
          await clearManualPlanDraft(userId);
        } catch {
          // O plano já foi persistido no servidor. Não transformar sucesso em
          // aparente falha (e induzir uma segunda criação); a limpeza é cache.
        }
        set({
          draft: null,
          previewData: null,
          status: 'saved',
          draftOrigin: null,
          sourcePlanId: null,
          progressionUnavailable: false,
          progressionChanges: [],
        });
        return planId;
      } catch (error) {
        set({
          status: 'error',
          saveError: errorMessage(error, 'Não foi possível salvar o plano.'),
        });
        return null;
      }
    },
    reset: async (options = {}) => {
      const userId = get().userId;
      ++operationEpoch;
      if (options.clearPersisted && userId) await clearManualPlanDraft(userId);
      set({
        userId: null,
        draft: null,
        status: 'idle',
        saveError: null,
        catalog: [],
        catalogError: null,
        previewData: null,
        incluirCardio: true,
        incluirAlongamento: false,
        draftOrigin: null,
        sourcePlanId: null,
        progressionUnavailable: false,
        progressionChanges: [],
      });
    },
  };
});
