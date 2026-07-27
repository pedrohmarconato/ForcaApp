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

describe('manualPlanStore — regressões da auditoria', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useManualPlanStore.getState().reset();
    (storage.readManualPlanDraft as jest.Mock).mockResolvedValue({
      draft: null,
      hadStoredBytes: false,
    });
  });

  it('encurtar e voltar a duração devolve a janela de séries que o aluno montou', async () => {
    // `Math.min(semana, weeks)` achatava a janela no encurtamento e nada
    // guardava o original: voltar para 16 semanas deixava 4→4, ou seja +1 série
    // só na última semana, em vez do acumulativo 5→8 que o aluno tinha montado.
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
    const store = useManualPlanStore.getState();
    store.setDurationWeeks(16);
    store.setProgression({
      series: { ativa: true, valor: 1, semana_inicio: 5, semana_fim: 8 },
    });

    store.setDurationWeeks(4);
    store.setDurationWeeks(16);

    expect(useManualPlanStore.getState().draft?.progressao.series).toMatchObject({
      semana_inicio: 5,
      semana_fim: 8,
    });
  });

  it('encurtar a duração aproxima a descarga do novo fim, não do default 4', async () => {
    // `Math.min(weeks, 4)` mandava a descarga para a semana 4 sempre — mesmo
    // encurtando de 16 para 8, onde 8 é o fim novo e 4 não significa nada.
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
    const store = useManualPlanStore.getState();
    store.setDurationWeeks(16);
    store.setProgression({
      deload: { ativa: true, semana: 12, fator_rm: 0.6, fator_series: 0.6 },
    });

    store.setDurationWeeks(8);

    expect(useManualPlanStore.getState().draft?.progressao.deload?.semana).toBe(8);
  });

  it('adicionar cardio não sobrescreve a regra de cardio que o plano já tinha', async () => {
    // O guard só olhava os EXERCÍCIOS, nunca a regra. Um plano importado com
    // +10% só na duração virava +5% em duração e distância no instante em que o
    // aluno acrescentava a primeira corrida — decisão dele, desfeita pelo app.
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
    const store = useManualPlanStore.getState();
    store.addWorkout();
    store.setProgression({ cardio: { ativa: true, valor: 10, alvo: 'duracao' } });

    store.addExercise(0, exercise('Corrida', 'tempo_distancia'));

    expect(useManualPlanStore.getState().draft?.progressao.cardio).toEqual({
      ativa: true,
      valor: 10,
      alvo: 'duracao',
    });
  });

  it('prévia atrasada de um rascunho superado não volta para a tela', async () => {
    // O aluno toca "Ver como fica", muda a duração enquanto a resposta está em
    // voo e salva. `mutateDraft` já tinha zerado a prévia, mas a resposta velha
    // chegava e se instalava como se fosse do plano novo — e ainda rebaixava o
    // status de 'saving' para 'ready' no meio do salvamento.
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
    const store = useManualPlanStore.getState();
    store.addWorkout();
    store.addExercise(0, exercise('Supino'));

    let resolvePreview: (valor: unknown) => void = () => {};
    mockedPost.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePreview = resolve; }),
    );

    const emVoo = useManualPlanStore.getState().preview();
    useManualPlanStore.getState().setDurationWeeks(16);
    resolvePreview({ data: { semanas: [{ semana: 1, treinos: [] }] } });
    await emVoo;

    expect(useManualPlanStore.getState().previewData).toBeNull();
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
