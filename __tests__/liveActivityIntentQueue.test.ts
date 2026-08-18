// __tests__/liveActivityIntentQueue.test.ts
// Fase 16 Plano 16-02 — reconcileLiveActivityIntents(): lê a fila durável
// do App Group (fila gravada mesmo com o app force-quit, Plano 16-01) e
// aplica cada entrada pendente contra completeSet()/activateSet()/adjustRest()
// já existentes na store, com guarda de CAS por sessionLogId. Mesmo padrão de
// mocks de módulo de __tests__/activeSessionStore.test.ts — o store real é
// importado (não mockado inteiro), só os serviços de I/O externo são.
//
// Fase 16 Plano 16-07 (D1, 16-VERIFICATION.md gap 1): a leitura passou de
// drenagem destrutiva (drainQueuedLiveActivityIntents, lia e removia na
// mesma chamada) para leitura não-destrutiva (peekQueuedLiveActivityIntents)
// com confirmação seletiva (ackQueuedLiveActivityIntent) condicionada ao
// resultado real da aplicação. Os dois novos testes ao final do describe
// chamam completeSet() REAL (sem mock de ação, via withRealActions) para
// reproduzir o cenário exato do UAT físico force_quit_toque=FAIL: uma
// entrada cuja série alvo reprova canCompleteSet() (reps/carga ausentes)
// não pode ser perdida.

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(
      error: any,
      options: { kind?: 'transport' | 'server'; status?: number } = {},
    ) {
      super(error?.message ?? String(error));
      this.kind =
        options.kind ?? (options.status === 0 ? 'transport' : 'server');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    startSessionLog: jest.fn(),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(),
    getOpenSessionLog: jest.fn(),
    getLastLoadByExercise: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (error: unknown) =>
      error instanceof SessionExecutionRequestError &&
      error.kind === 'transport',
  };
});
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  // D2 (16-08-PLAN.md): setReps/setLoad agora chamam saveDraft(novo) fire-and-forget
  // (.catch(...) no retorno) — precisa resolver a uma Promise, não undefined.
  saveDraft: jest.fn().mockResolvedValue(undefined),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));
jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/services/planEditRepository', () => ({
  reagendarSessoesDaSemana: jest.fn(),
}));
jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve()) },
  ENDPOINTS: {
    PUSH: { NOTIFY_REPLAN: '/push/notify-replan-applied' },
  },
}));

const mockPeekQueuedLiveActivityIntents = jest.fn();
const mockAckQueuedLiveActivityIntent = jest.fn().mockResolvedValue(undefined);
jest.mock(
  '../modules/live-activity',
  () => ({
    peekQueuedLiveActivityIntents: (...args: unknown[]) =>
      mockPeekQueuedLiveActivityIntents(...args),
    ackQueuedLiveActivityIntent: (...args: unknown[]) =>
      mockAckQueuedLiveActivityIntent(...args),
  }),
  { virtual: true },
);

import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDraft } from '../src/engine/sessionModel';
import { saveSetLog } from '../src/services/sessionExecutionRepository';
import { saveDraft } from '../src/services/sessionDraftStorage';

const draft = (overrides: Partial<SessionDraft> = {}): SessionDraft => ({
  version: 1,
  plannedSessionId: 'session-1',
  sessionLogId: 'log-1',
  userId: 'user-1',
  title: 'Treino A',
  weekNumber: 1,
  startedAt: '2026-08-17T11:00:00.000Z',
  status: 'active',
  restEndsAt: null,
  exercises: [
    {
      exerciseId: 'ex-1',
      name: 'Supino reto',
      order: 1,
      metric: 'carga_reps',
      equipment: 'Barra',
      isBodyweight: false,
      hasInjury: false,
      loadIncrementKg: 2.5,
      restSeconds: 90,
      priority: 'primary',
      targetRmPercent: 75,
      repsRaw: '8-10',
      sets: [
        {
          plannedSetId: 'set-1',
          setOrder: 1,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetLoadKg: 40,
          targetRir: 2,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          status: 'active',
          outcome: null,
          setLogId: null,
          adaptation: null,
          activatedAt: null,
          completedAt: null,
        },
      ],
    },
    {
      exerciseId: 'ex-2',
      name: 'Agachamento',
      order: 2,
      metric: 'carga_reps',
      equipment: 'Barra',
      isBodyweight: false,
      hasInjury: false,
      loadIncrementKg: 2.5,
      restSeconds: 90,
      priority: 'primary',
      targetRmPercent: 75,
      repsRaw: '8-10',
      sets: [
        {
          plannedSetId: 'set-2',
          setOrder: 1,
          targetRepsMin: 8,
          targetRepsMax: 10,
          targetLoadKg: 60,
          targetRir: 2,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          status: 'pending',
          outcome: null,
          setLogId: null,
          adaptation: null,
          activatedAt: null,
          completedAt: null,
        },
      ],
    },
  ],
  lastLoadByExercise: {},
  ...overrides,
});

/** Draft de exercício medido por tempo (metric 'tempo_distancia').
 *  Plano 16-11: canCompleteSet() exige, para métrica de tempo,
 *  actualDurationSeconds != null && > 0 (sessionModel.ts:272-273) — reps e
 *  carga não são exigidos e nem existem nesse caminho. É por isso que o
 *  Teste 2 do runbook físico é um caminho DISTINTO do Teste 1, e não uma
 *  repetição dele com outro exercício. */
const draftCardio = (overrides: Partial<SessionDraft> = {}): SessionDraft => ({
  ...draft(),
  exercises: [
    {
      exerciseId: 'ex-cardio',
      name: 'Caminhada inclinada',
      order: 1,
      metric: 'tempo_distancia',
      equipment: 'Esteira',
      isBodyweight: false,
      hasInjury: false,
      loadIncrementKg: 0,
      restSeconds: 60,
      priority: 'primary',
      targetRmPercent: null,
      repsRaw: null,
      sets: [
        {
          plannedSetId: 'set-cardio-1',
          setOrder: 1,
          targetRepsMin: null,
          targetRepsMax: null,
          targetLoadKg: null,
          targetRir: null,
          targetDurationSeconds: 1500,
          targetDistanceM: 3000,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          actualDurationSeconds: null,
          actualDistanceM: null,
          perceivedEffort: null,
          status: 'active',
          outcome: null,
          setLogId: null,
          adaptation: null,
          activatedAt: null,
          completedAt: null,
        },
      ],
    },
  ],
  ...overrides,
});

let completeSet: jest.Mock;
let activateSet: jest.Mock;
let adjustRest: jest.Mock;

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

/** Substitui só as três ações de gravação — reconcileLiveActivityIntents
 *  (não substituída) as lê de get() no momento da chamada. */
const withMockedActions = (draftValue: SessionDraft | null): void => {
  completeSet = jest.fn().mockResolvedValue(true);
  activateSet = jest.fn();
  adjustRest = jest.fn();
  useActiveSessionStore.setState({
    draft: draftValue,
    completeSet,
    activateSet,
    adjustRest,
  });
};

// Capturadas ANTES de qualquer withMockedActions() sobrescrever o slice —
// permitem restaurar as ações REAIS da store nos dois testes D1 abaixo, que
// precisam exercitar canCompleteSet() de verdade (Plano 16-07).
const realCompleteSet = useActiveSessionStore.getState().completeSet;
const realActivateSet = useActiveSessionStore.getState().activateSet;
const realAdjustRest = useActiveSessionStore.getState().adjustRest;
const realSetReps = useActiveSessionStore.getState().setReps;
const realSetLoad = useActiveSessionStore.getState().setLoad;
// Plano 16-11: setDuration é o único caminho que fecha canCompleteSet() de
// exercício de métrica tempo/tempo_distancia (sessionModel.ts:272-273) — sem
// restaurá-lo aqui, os testes de cardio abaixo herdariam um mock e provariam nada.
const realSetDuration = useActiveSessionStore.getState().setDuration;

/** Restaura explicitamente as ações reais da store — nunca herda um
 *  override deixado por um withMockedActions(...) anterior no mesmo módulo
 *  Zustand, já que os testes rodam sequencialmente no mesmo processo. */
const withRealActions = (draftValue: SessionDraft | null): void => {
  useActiveSessionStore.setState({
    completeSet: realCompleteSet,
    activateSet: realActivateSet,
    adjustRest: realAdjustRest,
    setReps: realSetReps,
    setLoad: realSetLoad,
    setDuration: realSetDuration,
    draft: draftValue,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mock(saveSetLog).mockImplementation(async (params: any) => ({
    setLogId: 'set-real',
    actualReps: params.actualReps,
    actualLoadKg: params.actualLoadKg,
    actualRir: params.actualRir,
    outcome: params.outcome,
  }));
});

describe('reconcileLiveActivityIntents', () => {
  it('chamado com draft ainda null (ordem real do boot, sem setState prévio) não lê a fila nem perde a entrada', async () => {
    // Reproduz o estado inicial real da store no boot (`draft: null`,
    // declarado como valor inicial em activeSessionStore.ts) SEM
    // withMockedActions() — a fila jamais deve ser lida antes de haver um
    // draft ativo candidato a receber a intenção (16-VERIFICATION.md gap 1 /
    // 16-REVIEW.md CR-01).
    useActiveSessionStore.setState({ draft: null });
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-1', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(mockPeekQueuedLiveActivityIntents).not.toHaveBeenCalled();
  });

  it('depois que o draft é hidratado, uma nova chamada aplica a entrada que a chamada anterior (draft null) preservou', async () => {
    useActiveSessionStore.setState({ draft: null });
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-2', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();
    expect(mockPeekQueuedLiveActivityIntents).not.toHaveBeenCalled();

    // Só agora o draft é hidratado (equivalente a startOrResume() resolvendo
    // para um draft ativo) — a MESMA entrada, ainda intacta na fila
    // simulada (peek nunca a removeu), deve ser aplicada nesta segunda
    // chamada.
    withMockedActions(draft());
    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(mockPeekQueuedLiveActivityIntents).toHaveBeenCalledTimes(1);
    expect(completeSet).toHaveBeenCalledWith('ex-1', 1);
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-2');
  });

  it('completeSet com sessionLogId igual ao draft atual aplica completeSet sobre a série resolvida', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-3', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    // draft() tem a série ativa em ex-1/1 — completeSet deve resolver essa.
    expect(completeSet).toHaveBeenCalledWith('ex-1', 1);
    expect(activateSet).not.toHaveBeenCalled();
    expect(adjustRest).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-3');
  });

  it('entrada com sessionLogId diferente do draft atual não aplica nenhuma ação (CAS), mas confirma o ack (descarte definitivo)', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-4', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-DIFERENTE', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
    expect(adjustRest).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-4');
  });

  // Plano 16-12: este caso descarta porque `queuedAt: 'T1'` é ilegível para
  // Date.parse — NÃO porque sessionLogId nulo descarte sempre. Desde a 16-12
  // uma órfã com queuedAt VÁLIDO e posterior ao startedAt É adotada (ver o
  // describe '16-12' ao final). Não generalize este teste para "nulo = descarte".
  it('entrada com sessionLogId null e queuedAt ilegível não aplica nenhuma ação, mas confirma o ack (descarte definitivo)', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-5', kind: 'completeSet', deltaSeconds: null, sessionLogId: null, queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
    expect(adjustRest).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-5');
  });

  it('fila vazia não chama nenhuma ação, não confirma ack e não lança', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([]);

    await expect(
      useActiveSessionStore.getState().reconcileLiveActivityIntents(),
    ).resolves.toBeUndefined();

    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
    expect(adjustRest).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).not.toHaveBeenCalled();
  });

  it('peekQueuedLiveActivityIntents rejeitando resolve sem lançar', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockRejectedValue(new Error('bridge indisponível'));

    await expect(
      useActiveSessionStore.getState().reconcileLiveActivityIntents(),
    ).resolves.toBeUndefined();

    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
    expect(adjustRest).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).not.toHaveBeenCalled();
  });

  it('adjustRest com deltaSeconds: 45 chama adjustRest(45) com o valor exato e confirma o ack', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-6', kind: 'adjustRest', deltaSeconds: 45, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(adjustRest).toHaveBeenCalledWith(45);
    expect(completeSet).not.toHaveBeenCalled();
    expect(activateSet).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-6');
  });

  it('skipRest aplica activateSet sobre a próxima série pendente e confirma o ack', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-7', kind: 'skipRest', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(activateSet).toHaveBeenCalledWith('ex-2', 1);
    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-7');
  });

  it('D1: completeSet reprovado por validação real (reps/carga ausentes) NÃO confirma o ack — a entrada sobrevive para a próxima tentativa', async () => {
    withRealActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-real-1', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].status).toBe('active');
    expect(useActiveSessionStore.getState().saveError).toBe(
      'Informe repetições e carga antes de concluir a série.',
    );
    expect(mockAckQueuedLiveActivityIntent).not.toHaveBeenCalled();
  });

  it('D1: completeSet aplicado com sucesso via completeSet() real (reps/carga presentes) confirma o ack', async () => {
    withRealActions(draft());
    useActiveSessionStore.getState().setReps('ex-1', 1, 8);
    useActiveSessionStore.getState().setLoad('ex-1', 1, 40);
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-real-2', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].status).toBe('done');
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-real-2');
  });
});

// ---------------------------------------------------------------------------
// Plano 16-11 — caminho de DURAÇÃO (Teste 2 do runbook físico).
//
// PROVENIÊNCIA DESTA EVIDÊNCIA (ler antes de tratar como equivalente ao UAT):
// estes testes exercitam a MESMA lógica de store que a sessão física
// exercitaria, mas NÃO substituem o teste no aparelho. Eles não passam pelo
// force-quit real, pela Lock Screen, pelo App Group nem pelo cold start do
// iOS — só pelo trecho JS entre setDuration() e completeSet() via
// reconcileLiveActivityIntents(). O dono declinou executar o Teste 2 no
// aparelho ("não temos esse tipo de treinamento"), então esta é evidência de
// TIPO DIFERENTE, registrada como tal, nunca como o teste físico cumprido.
// ---------------------------------------------------------------------------
describe('16-11: reconciliação de série medida por tempo (caminho setDuration)', () => {
  it('sem duração informada, completeSet real reprova e o ack NÃO é confirmado — a entrada sobrevive', async () => {
    withRealActions(draftCardio());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-dur-1', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].status).toBe('active');
    expect(mockAckQueuedLiveActivityIntent).not.toHaveBeenCalled();
  });

  it('com duração informada via setDuration, completeSet real conclui a série e confirma o ack', async () => {
    withRealActions(draftCardio());
    useActiveSessionStore.getState().setDuration('ex-cardio', 1, 1500);
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-dur-2', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].status).toBe('done');
    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].actualDurationSeconds).toBe(1500);
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-dur-2');
  });

  it('setDuration persiste em disco via saveDraft — o elo que o force-quit exige (fix da Plano 16-10)', () => {
    withRealActions(draftCardio());
    mock(saveDraft).mockClear();

    useActiveSessionStore.getState().setDuration('ex-cardio', 1, 1500);

    // Sem esta chamada, a duração viveria só em memória e morreria no
    // force-quit — exatamente o modo de falha que a Plano 16-10 corrigiu.
    expect(mock(saveDraft)).toHaveBeenCalled();
    const persistido = mock(saveDraft).mock.calls.at(-1)![0] as SessionDraft;
    expect(persistido.exercises[0].sets[0].actualDurationSeconds).toBe(1500);
  });

  it('a duração sobrevive a um ciclo de force-quit simulado (draft relido do disco) e conclui na reconciliação', async () => {
    withRealActions(draftCardio());
    mock(saveDraft).mockClear();
    useActiveSessionStore.getState().setDuration('ex-cardio', 1, 1500);

    // Simula o force-quit: descarta o estado em memória e reidrata APENAS a
    // partir do que saveDraft gravou. Se setDuration não tivesse persistido,
    // este draft voltaria com actualDurationSeconds null e o teste falharia.
    const persistido = mock(saveDraft).mock.calls.at(-1)![0] as SessionDraft;
    useActiveSessionStore.setState({ draft: null });
    withRealActions(JSON.parse(JSON.stringify(persistido)) as SessionDraft);

    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-dur-3', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-1', queuedAt: 'T1' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].status).toBe('done');
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-dur-3');
  });
});

// ---------------------------------------------------------------------------
// Plano 16-12 — descarte silencioso de intent órfã (sessionLogId nulo).
//
// SINTOMA DE ORIGEM (sessão física real do dono, 2026-08-18): tocou "Concluir
// série" na Lock Screen com o app force-quit, reabriu, e a série "ficou como
// estava" — sem erro, sem toast, sem nada. Diagnóstico: CompleteSetIntent.swift:12
// captura o sessionLogId via `Activity<...>.activities.first?.attributes...`
// (encadeamento opcional → pode ser nil no cold-launch). A entrada entra na fila
// com sessionLogId null e a guarda de CAS a confirmava (ack = REMOÇÃO DEFINITIVA)
// sem nunca chamar completeSet().
//
// A distinção que o fix introduz: sessionLogId DIVERGENTE prova que a entrada é
// de outra sessão — descartar está certo. sessionLogId NULO prova apenas que a
// origem é desconhecida. A entrada órfã é adotada pelo draft ativo SÓ quando dá
// para provar temporalmente que nasceu dentro desta sessão (queuedAt >=
// startedAt). Sem essa prova, o descarte continua — perder uma série é ruim,
// aplicar numa sessão errada é pior (corrompe histórico em silêncio).
// ---------------------------------------------------------------------------
describe('16-12: intent órfã (sessionLogId nulo) não pode ser destruída em silêncio', () => {
  it('órfã enfileirada DENTRO da sessão ativa (queuedAt >= startedAt) é adotada e aplicada', async () => {
    withMockedActions(draft()); // startedAt: 2026-08-17T11:00:00.000Z
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-orfa-1', kind: 'completeSet', deltaSeconds: null, sessionLogId: null, queuedAt: '2026-08-17T12:00:00Z' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).toHaveBeenCalledWith('ex-1', 1);
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-orfa-1');
  });

  it('órfã ANTERIOR ao início da sessão atual é descartada — é de sessão antiga', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-orfa-2', kind: 'completeSet', deltaSeconds: null, sessionLogId: null, queuedAt: '2026-08-17T10:00:00Z' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-orfa-2');
  });

  it('órfã com startedAt nulo no draft é descartada — sem prova temporal, não adota', async () => {
    withMockedActions(draft({ startedAt: null }));
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-orfa-3', kind: 'completeSet', deltaSeconds: null, sessionLogId: null, queuedAt: '2026-08-17T12:00:00Z' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-orfa-3');
  });

  it('órfã com queuedAt malformado é descartada — Date.parse NaN nunca vira adoção', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-orfa-4', kind: 'completeSet', deltaSeconds: null, sessionLogId: null, queuedAt: 'nao-e-uma-data' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-orfa-4');
  });

  it('órfã adotada cujo completeSet REAL reprova NÃO confirma o ack — sobrevive para a próxima tentativa', async () => {
    withRealActions(draft()); // reps/carga ausentes → canCompleteSet() reprova
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-orfa-5', kind: 'completeSet', deltaSeconds: null, sessionLogId: null, queuedAt: '2026-08-17T12:00:00Z' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0].status).toBe('active');
    expect(mockAckQueuedLiveActivityIntent).not.toHaveBeenCalled();
  });

  it('sessionLogId DIVERGENTE segue descartado — a distinção nulo-vs-divergente não abre brecha de CAS', async () => {
    withMockedActions(draft());
    mockPeekQueuedLiveActivityIntents.mockResolvedValue([
      { id: 'evt-orfa-6', kind: 'completeSet', deltaSeconds: null, sessionLogId: 'log-OUTRA', queuedAt: '2026-08-17T12:00:00Z' },
    ]);

    await useActiveSessionStore.getState().reconcileLiveActivityIntents();

    expect(completeSet).not.toHaveBeenCalled();
    expect(mockAckQueuedLiveActivityIntent).toHaveBeenCalledWith('evt-orfa-6');
  });
});
