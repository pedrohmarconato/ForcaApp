// Store do editor — modos de falha cobertos:
// - mutações de telas diferentes podem perder/reordenar o exercício errado;
// - toggle desligado pode continuar enviando regra ativa ao backend;
// - primeiro cardio precisa ligar a progressão cardio padrão, sem impô-la depois;
// - erro de preview/save não pode apagar o rascunho persistido;
// - sucesso devolve o plan_id real e só então limpa o armazenamento.

import apiClient from '../src/services/api/apiClient';
import * as storage from '../src/services/manualPlanDraftStorage';
import { useManualPlanStore } from '../src/store/manualPlanStore';
import type { ManualExerciseDraft } from '../src/types/manualPlan';

jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  ENDPOINTS: {
    MANUAL_PLAN: '/manual-plan',
    MANUAL_PLAN_PREVIEW: '/manual-plan/preview',
  },
  classifyApiError: jest.fn(() => ({ kind: 'network', message: 'rede' })),
}));

jest.mock('../src/services/exerciseCatalogService', () => ({
  getCatalog: jest.fn(async () => []),
}));

jest.mock('../src/services/manualPlanDraftStorage', () => ({
  saveManualPlanDraft: jest.fn(async () => undefined),
  loadManualPlanDraft: jest.fn(async () => null),
  clearManualPlanDraft: jest.fn(async () => undefined),
}));

const mockedPost = apiClient.post as jest.Mock;

const exercise = (
  nome: string,
  metrica: ManualExerciseDraft['metrica'] = 'carga_reps',
): ManualExerciseDraft => ({
  exercise_key: null,
  nome,
  equipamento: null,
  metrica,
  series: 3,
  repeticoes: metrica === 'carga_reps' ? '8-12' : null,
  duracao_minutos: metrica === 'carga_reps' ? null : 20,
  distancia_km: metrica === 'tempo_distancia' ? 2 : null,
  tempo_descanso: 90,
  prioridade: 'primario',
  percentual_rm: null,
  observacoes: null,
  tem_limitacao: false,
});

describe('manualPlanStore', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (storage.loadManualPlanDraft as jest.Mock).mockResolvedValue(null);
    await useManualPlanStore.getState().reset({ clearPersisted: false });
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
  });

  it('adiciona, remove e reordena treinos e exercícios sem mutar o item errado', () => {
    const store = useManualPlanStore.getState();
    expect(store.addWorkout()).toBe(true);
    expect(store.addWorkout()).toBe(true);
    store.renameWorkout(0, 'Push');
    store.renameWorkout(1, 'Pull');
    store.addExercise(0, exercise('Supino'));
    store.addExercise(0, exercise('Crucifixo'));
    store.reorderExercise(0, 1, 0);

    let draft = useManualPlanStore.getState().draft!;
    expect(draft.treinos.map((item) => item.nome)).toEqual(['Push', 'Pull']);
    expect(draft.treinos[0].exercicios.map((item) => item.nome)).toEqual([
      'Crucifixo',
      'Supino',
    ]);

    store.removeExercise(0, 1);
    store.removeWorkout(1);
    draft = useManualPlanStore.getState().draft!;
    expect(draft.treinos).toHaveLength(1);
    expect(draft.treinos[0].exercicios.map((item) => item.nome)).toEqual([
      'Crucifixo',
    ]);
  });

  it('limita o oitavo treino e mantém os sete já digitados', () => {
    const store = useManualPlanStore.getState();
    for (let index = 0; index < 7; index += 1) expect(store.addWorkout()).toBe(true);

    expect(store.addWorkout()).toBe(false);
    expect(useManualPlanStore.getState().draft?.treinos).toHaveLength(7);
    expect(useManualPlanStore.getState().saveError).toMatch(/7 treinos/);
  });

  it('toggle de progressão produz exatamente as regras do contrato', () => {
    const store = useManualPlanStore.getState();
    expect(store.draft?.progressao.deload?.ativa).toBe(true);
    expect(store.draft?.progressao.series?.ativa).toBe(false);

    store.setProgression({
      series: { ativa: true, valor: 1, semana_inicio: 5, semana_fim: 8 },
      intensidade: { ativa: true, valor: 2.5 },
    });
    expect(useManualPlanStore.getState().draft?.progressao).toEqual(
      expect.objectContaining({
        series: { ativa: true, valor: 1, semana_inicio: 5, semana_fim: 8 },
        intensidade: { ativa: true, valor: 2.5 },
      }),
    );

    store.disableProgression();
    const progressao = useManualPlanStore.getState().draft?.progressao;
    expect(Object.values(progressao ?? {}).every((rule) => rule === null)).toBe(true);
  });

  it('primeiro cardio liga +5% padrão; remover o último remove a regra', () => {
    const store = useManualPlanStore.getState();
    store.addWorkout();
    store.addExercise(0, exercise('Caminhada', 'tempo_distancia'));

    expect(useManualPlanStore.getState().draft?.progressao.cardio).toEqual({
      ativa: true,
      valor: 5,
      alvo: 'ambos',
    });

    store.removeExercise(0, 0);
    expect(useManualPlanStore.getState().draft?.progressao.cardio).toBeNull();
  });

  it('não religa cardio que o aluno desligou ao editar outro exercício', () => {
    const store = useManualPlanStore.getState();
    store.addWorkout();
    store.addExercise(0, exercise('Caminhada', 'tempo_distancia'));
    store.setProgression({ cardio: null });
    store.addExercise(0, exercise('Supino'));
    store.removeExercise(0, 1);

    expect(useManualPlanStore.getState().draft?.progressao.cardio).toBeNull();
  });

  it('preview mantém exatamente os números do servidor, sem recalcular', async () => {
    const serverPreview = {
      semanas: [
        { semana: 1, treinos: [{ nome: 'A', dia: 'segunda', minutos: 77, exercicios: [] }] },
      ],
    };
    mockedPost.mockResolvedValueOnce({ data: serverPreview });

    await expect(useManualPlanStore.getState().preview()).resolves.toEqual(serverPreview);
    expect(useManualPlanStore.getState().previewData).toEqual(serverPreview);
    expect(mockedPost).toHaveBeenCalledWith(
      '/manual-plan/preview',
      useManualPlanStore.getState().draft,
    );
  });

  it('erro ao salvar preserva o rascunho e sucesso limpa só depois do plan_id', async () => {
    useManualPlanStore.getState().addWorkout();
    useManualPlanStore.getState().addExercise(0, exercise('Supino'));
    const antes = useManualPlanStore.getState().draft;
    mockedPost.mockRejectedValueOnce(new Error('rede caiu'));

    await expect(useManualPlanStore.getState().save()).resolves.toBeNull();
    expect(useManualPlanStore.getState().draft).toEqual(antes);
    expect(storage.clearManualPlanDraft).not.toHaveBeenCalled();

    mockedPost.mockResolvedValueOnce({ data: { plan_id: 'plan-user-1' } });
    await expect(useManualPlanStore.getState().save()).resolves.toBe('plan-user-1');
    expect(storage.clearManualPlanDraft).toHaveBeenCalledWith('user-1');
    expect(useManualPlanStore.getState().draft).toBeNull();
  });
});
