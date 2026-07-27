// O rascunho manual atravessa editor de plano, editor de treino e picker. Um
// store dedicado evita acoplar navegação ao estado e, com o storage local,
// preserva o trabalho quando o app fecha durante a montagem.

import { create } from 'zustand';

import apiClient, { ENDPOINTS, classifyApiError } from '../services/api/apiClient';
import { getCatalog, type CatalogEntry } from '../services/exerciseCatalogService';
import {
  clearManualPlanDraft,
  readManualPlanDraft,
  saveManualPlanDraft,
} from '../services/manualPlanDraftStorage';
import {
  createEmptyManualPlanDraft,
  createEmptyManualWorkout,
  hasCardioExercise,
  type ManualExerciseDraft,
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
  initEmpty: (userId: string, options?: InitOptions) => Promise<void>;
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
  progressao: { ...draft.progressao },
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

    initEmpty: async (userId, options = {}) => {
      const epoch = ++operationEpoch;
      set({
        userId,
        status: 'loading',
        saveError: null,
        catalogError: null,
        incluirCardio: options.incluirCardio ?? true,
        incluirAlongamento: options.incluirAlongamento ?? false,
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

    setPlanName: (name) => mutateDraft((draft) => {
      draft.nome = name;
    }),
    setDurationWeeks: (weeks) => mutateDraft((draft) => {
      draft.duracao_semanas = weeks;
      const deload = draft.progressao.deload;
      // A descarga acompanha o novo fim do plano. `Math.min(weeks, 4)` mandava
      // para a semana 4 mesmo encurtando de 16 para 8 — um número que não vinha
      // nem do aluno nem do plano.
      if (deload && deload.semana > weeks) deload.semana = weeks;
      // A janela de séries NÃO é achatada. Antes, `Math.min(semana, weeks)`
      // reescrevia 5→8 para 4→4 no encurtamento, e voltar a duração não
      // restaurava nada: a montagem do aluno tinha sido destruída no caminho.
      // Uma janela que passou do fim do plano fica visível como aviso e trava o
      // Salvar (isValidSeriesWindow); voltando a duração, ela volta a valer.
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
        // O default só entra onde não há regra alguma. O guard olhava apenas os
        // EXERCÍCIOS, então um plano importado com +10% na duração era rebaixado
        // para +5% em duração e distância assim que o aluno somava uma corrida.
        if (
          !hadCardio &&
          !draft.progressao.cardio &&
          shouldAutoEnableCardioProgression(draft)
        ) {
          draft.progressao.cardio = { ativa: true, valor: 5, alvo: 'ambos' };
        }
      });
      return true;
    },
    updateExercise: (workoutIndex, exerciseIndex, partial) => mutateDraft((draft) => {
      const hadCardio = shouldAutoEnableCardioProgression(draft);
      const exercise = draft.treinos[workoutIndex]?.exercicios[exerciseIndex];
      if (exercise) Object.assign(exercise, partial);
      if (
        !hadCardio &&
        !draft.progressao.cardio &&
        shouldAutoEnableCardioProgression(draft)
      ) {
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
        // `mutateDraft` troca a identidade do rascunho e zera a prévia a cada
        // edição. Sem esta guarda, a resposta de um rascunho já superado se
        // instalava como se fosse do plano atual — e ainda rebaixava para
        // 'ready' um salvamento em andamento. A prévia é o que o aluno confere
        // antes de confirmar: mostrar a errada é pior do que não mostrar.
        if (get().draft !== draft) return null;
        set({ previewData: response.data, status: 'ready' });
        return response.data;
      } catch (error) {
        if (get().draft !== draft) return null;
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
        set({ draft: null, previewData: null, status: 'saved' });
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
      });
    },
  };
});
