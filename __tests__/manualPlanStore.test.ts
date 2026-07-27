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
  readManualPlanDraft: jest.fn(async () => ({ draft: null, hadStoredBytes: false })),
  clearManualPlanDraft: jest.fn(async () => undefined),
}));

jest.mock('../src/services/trainingRepository', () => ({
  getPlanSessions: jest.fn(async () => []),
  getSessionDetail: jest.fn(async () => null),
  getTrainingPlanMetadata: jest.fn(async () => null),
}));

import {
  getPlanSessions,
  getSessionDetail,
  getTrainingPlanMetadata,
} from '../src/services/trainingRepository';

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
    (storage.readManualPlanDraft as jest.Mock).mockResolvedValue({
      draft: null,
      hadStoredBytes: false,
    });
    (getPlanSessions as jest.Mock).mockResolvedValue([]);
    (getSessionDetail as jest.Mock).mockResolvedValue(null);
    (getTrainingPlanMetadata as jest.Mock).mockResolvedValue(null);
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

  it('importa somente a semana 1 do plano ativo para edição', async () => {
    (getPlanSessions as jest.Mock).mockResolvedValue([
      {
        id: 'session-week-1',
        plan_id: 'plan-old',
        user_id: 'user-1',
        week_number: 1,
        order_in_week: 1,
      },
      {
        id: 'session-week-2',
        plan_id: 'plan-old',
        user_id: 'user-1',
        week_number: 2,
        order_in_week: 1,
      },
    ]);
    (getTrainingPlanMetadata as jest.Mock).mockResolvedValue({
      id: 'plan-old',
      name: 'Plano original',
      duration_weeks: 8,
      progression_rules: [],
    });
    (getSessionDetail as jest.Mock).mockResolvedValue({
      id: 'session-week-1',
      plan_id: 'plan-old',
      user_id: 'user-1',
      week_number: 1,
      day_of_week: 'segunda',
      order_in_week: 1,
      title: 'Treino A',
      session_type: 'Personalizado',
      scheduled_date: '2026-07-20',
      estimated_minutes: 45,
      status: 'pending',
      muscle_groups: ['Peito'],
      planned_exercises: [
        {
          id: 'exercise-1',
          session_id: 'session-week-1',
          exercise_order: 1,
          name: 'Supino Reto com Barra',
          exercise_key: 'supino_reto_barra',
          metric: 'carga_reps',
          muscle_group: 'Peito',
          priority: 'primary',
          equipment: 'Barra',
          load_increment_kg: 2.5,
          rest_seconds: 90,
          target_rm_percent: null,
          sets_planned: 3,
          reps_raw: '8-12',
          method: null,
          notes: null,
          injury_flags: [],
          planned_sets: [],
        },
      ],
    });

    await useManualPlanStore.getState().initFromPlan('user-1', 'plan-old');

    expect(getSessionDetail).toHaveBeenCalledTimes(1);
    expect(getSessionDetail).toHaveBeenCalledWith('session-week-1');
    expect(useManualPlanStore.getState()).toMatchObject({
      draftOrigin: 'existing',
      sourcePlanId: 'plan-old',
      progressionUnavailable: false,
    });
    expect(useManualPlanStore.getState().draft).toMatchObject({
      nome: 'Plano original',
      duracao_semanas: 8,
      treinos: [{ nome: 'Treino A', dia_offset: 0 }],
    });
  });

  it('retoma o rascunho da edição em vez de reimportar o plano por cima', async () => {
    // initFromPlan GRAVA o rascunho em `plan_<id>` a cada mutação, mas nunca
    // lia de volta: bastava o app ser fechado no meio da edição para o trabalho
    // ser descartado e a tela reabrir com o plano original do servidor. No
    // onboarding o rascunho já vence o prefill; aqui ele era ignorado.
    (getPlanSessions as jest.Mock).mockResolvedValue([
      { id: 'session-week-1', plan_id: 'plan-old', user_id: 'user-1', week_number: 1, order_in_week: 1 },
    ]);
    (getTrainingPlanMetadata as jest.Mock).mockResolvedValue({
      id: 'plan-old',
      name: 'Plano original',
      duration_weeks: 8,
      progression_rules: [],
    });
    (getSessionDetail as jest.Mock).mockResolvedValue({
      id: 'session-week-1',
      plan_id: 'plan-old',
      user_id: 'user-1',
      week_number: 1,
      day_of_week: 'segunda',
      order_in_week: 1,
      title: 'Treino A',
      session_type: 'Personalizado',
      scheduled_date: '2026-07-20',
      estimated_minutes: 45,
      status: 'pending',
      muscle_groups: ['Peito'],
      planned_exercises: [],
    });

    const emAndamento = {
      ...useManualPlanStore.getState().draft!,
      nome: 'Plano original',
      duracao_semanas: 8,
      treinos: [
        {
          ...useManualPlanStore.getState().draft!.treinos[0],
          nome: 'Peito/Tríceps',
          duracao_minutos: 55,
        },
      ],
    };
    (storage.readManualPlanDraft as jest.Mock).mockImplementation(
      async (_userId: string, scope?: string | null) =>
        scope === 'plan_plan-old'
          ? { draft: emAndamento, hadStoredBytes: true }
          : { draft: null, hadStoredBytes: false },
    );

    await useManualPlanStore.getState().initFromPlan('user-1', 'plan-old');

    expect(useManualPlanStore.getState().draft?.treinos[0]).toMatchObject({
      nome: 'Peito/Tríceps',
      duracao_minutos: 55,
    });
    expect(useManualPlanStore.getState()).toMatchObject({
      draftOrigin: 'existing',
      sourcePlanId: 'plan-old',
    });
  });

  it('retoma rascunho persistido no onboarding em vez de sobrescrever com o prefill', async () => {
    const persisted = {
      ...useManualPlanStore.getState().draft!,
      nome: 'Rascunho de vinte minutos',
      treinos: [],
    };
    (storage.readManualPlanDraft as jest.Mock).mockResolvedValueOnce({
      draft: persisted,
      hadStoredBytes: true,
    });

    await useManualPlanStore.getState().initFromQuestionnaire('user-1', {
      dias_treino: ['mon', 'wed'],
      tempo_medio_treino_min: 45,
      inclui_cardio: false,
      inclui_alongamento: true,
    });

    expect(useManualPlanStore.getState().draft?.nome).toBe('Rascunho de vinte minutos');
    expect(storage.saveManualPlanDraft).not.toHaveBeenCalledWith('user-1', expect.objectContaining({
      treinos: expect.arrayContaining([expect.objectContaining({ dia_offset: 0 })]),
    }));
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
    // O escopo null é o rascunho de plano novo (a edição usa chave própria).
    expect(storage.clearManualPlanDraft).toHaveBeenCalledWith('user-1', null);
    expect(useManualPlanStore.getState().draft).toBeNull();
  });
});

describe('manualPlanStore — regressões da auditoria', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useManualPlanStore.getState().reset();
    (storage.readManualPlanDraft as jest.Mock).mockResolvedValue({
      draft: null,
      hadStoredBytes: false,
    });
  });

  it('não semeia rascunho vazio por cima de bytes que não puderam ser lidos', async () => {
    // Apagar por cima é irreversível: se havia algo gravado e a leitura falhou,
    // o pior desfecho possível é sobrescrever com o plano vazio.
    (storage.readManualPlanDraft as jest.Mock).mockResolvedValue({
      draft: null,
      hadStoredBytes: true,
    });

    await useManualPlanStore.getState().initEmpty('user-1');

    expect(useManualPlanStore.getState().draft).not.toBeNull();
    expect(storage.saveManualPlanDraft).not.toHaveBeenCalled();
  });

  it('semeia o rascunho quando o armazenamento estava mesmo vazio', async () => {
    await useManualPlanStore.getState().initEmpty('user-1');
    expect(storage.saveManualPlanDraft).toHaveBeenCalledTimes(1);
  });

  it('salvar deixa o status em "saved" para a tela não re-inicializar', async () => {
    await useManualPlanStore.getState().initEmpty('user-1');
    useManualPlanStore.getState().addWorkout();
    useManualPlanStore.getState().addExercise(0, exercise('Supino'));
    mockedPost.mockResolvedValue({ data: { plan_id: 'plano-1' } });

    const planId = await useManualPlanStore.getState().save();

    expect(planId).toBe('plano-1');
    expect(useManualPlanStore.getState().draft).toBeNull();
    expect(useManualPlanStore.getState().status).toBe('saved');
  });

  it('cardio por tempo puro (HIIT) preserva a progressão em vez de apagá-la', async () => {
    // `hasCardioExercise` olhava só para `tempo_distancia`: com HIIT, Pular
    // Corda ou Escada bastava editar qualquer exercício para a regra de cardio
    // ser apagada em silêncio, sem controle visível para desfazer.
    await useManualPlanStore.getState().initEmpty('user-1');
    useManualPlanStore.getState().addWorkout();
    useManualPlanStore.getState().addExercise(0, exercise('Cardio Intervalado (HIIT)', 'tempo'));
    useManualPlanStore.getState().setProgression({
      cardio: { ativa: true, valor: 5, alvo: 'ambos' },
    });

    useManualPlanStore.getState().updateExercise(0, 0, { series: 4 });

    expect(useManualPlanStore.getState().draft?.progressao.cardio).toEqual({
      ativa: true,
      valor: 5,
      alvo: 'ambos',
    });
  });

  it('exercício por tempo não LIGA sozinho a progressão de cardio', async () => {
    // Só cardio de deslocamento liga sozinho. Uma prancha religando uma regra
    // que o aluno desligou de propósito é o app desfazendo a decisão dele.
    await useManualPlanStore.getState().initEmpty('user-1');
    useManualPlanStore.getState().addWorkout();
    useManualPlanStore.getState().addExercise(0, exercise('Prancha', 'tempo'));
    expect(useManualPlanStore.getState().draft?.progressao.cardio).toBeNull();

    useManualPlanStore.getState().addExercise(0, exercise('Corrida', 'tempo_distancia'));
    expect(useManualPlanStore.getState().draft?.progressao.cardio).toEqual({
      ativa: true,
      valor: 5,
      alvo: 'ambos',
    });
  });

  it('exercício além do teto de 30 devolve false em vez de sumir calado', async () => {
    await useManualPlanStore.getState().initEmpty('user-1');
    useManualPlanStore.getState().addWorkout();
    for (let i = 0; i < 30; i += 1) {
      expect(useManualPlanStore.getState().addExercise(0, exercise(`Ex ${i}`))).toBe(true);
    }
    expect(useManualPlanStore.getState().addExercise(0, exercise('Ex 31'))).toBe(false);
    expect(useManualPlanStore.getState().draft?.treinos[0].exercicios).toHaveLength(30);
    expect(useManualPlanStore.getState().saveError).toContain('30 exercícios');
  });
});

describe('manualPlanStore — escopo do rascunho', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useManualPlanStore.getState().reset();
    (storage.readManualPlanDraft as jest.Mock).mockResolvedValue({
      draft: null,
      hadStoredBytes: false,
    });
  });

  it('editar o plano ativo não grava por cima do rascunho de plano novo', async () => {
    // Com uma chave só, abrir "Editar plano" gravava o plano importado por
    // cima do rascunho que o aluno estava montando — trabalho perdido, sem
    // aviso e sem volta.
    await useManualPlanStore.getState().initEmpty('user-1');
    useManualPlanStore.getState().addWorkout();

    const chavesDoRascunhoNovo = (storage.saveManualPlanDraft as jest.Mock).mock.calls.map(
      (chamada) => chamada[2] ?? null,
    );
    expect(chavesDoRascunhoNovo.every((escopo) => escopo === null)).toBe(true);

    (storage.saveManualPlanDraft as jest.Mock).mockClear();
    useManualPlanStore.setState({ draftOrigin: 'existing', sourcePlanId: 'plano-antigo' });
    useManualPlanStore.getState().addWorkout();

    const escoposDaEdicao = (storage.saveManualPlanDraft as jest.Mock).mock.calls.map(
      (chamada) => chamada[2],
    );
    expect(escoposDaEdicao).not.toHaveLength(0);
    expect(escoposDaEdicao.every((escopo) => escopo === 'plan_plano-antigo')).toBe(true);
  });
});
