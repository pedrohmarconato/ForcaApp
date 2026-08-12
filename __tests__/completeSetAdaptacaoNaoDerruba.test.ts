// __tests__/completeSetAdaptacaoNaoDerruba.test.ts
// Regressão do achado da sessão de debug `typeerror-envio-series-treino`:
// `completeSet` conflava, no MESMO try/catch, a escrita no servidor (RPC save_set_log)
// e ~50 linhas de motor de adaptação PURAMENTE LOCAL. Uma exceção no motor — depois de
// o servidor já ter confirmado a gravação — caía no catch de rede, marcava `saveError`
// e devolvia `false`: o aluno lia "não foi possível registrar" no meio do treino com a
// série JÁ gravada em `set_logs`, e a série ficava eternamente pendente no rascunho.
//
// Contrato provado aqui: o motor de adaptação é best-effort — se ele quebrar, perde-se
// a SUGESTÃO, nunca o REGISTRO.
//
// Fase 4 (REQ-07/D-05): o "confirmada a escrita no servidor" do parágrafo acima é
// PRÉ-fase — a escrita virou item de fila (sessionOutboxDrain), e a série conclui
// LOCALMENTE de imediato, sem aguardar NENHUMA confirmação do servidor (nem sucesso
// nem falha). "ERRO do banco ao salvar a série NÃO marca como feita" deixou de ser o
// comportamento vigente: falha de rede/servidor não classificado NUNCA impede o
// registro local — vira item retentável na fila (Pitfall 2 do RESEARCH.md).

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(error: any, options: { kind?: 'transport' | 'server'; status?: number } = {}) {
      super(error?.message ?? String(error));
      this.kind = options.kind ?? (options.status === 0 ? 'transport' : 'server');
      this.code = typeof error?.code === 'string' ? error.code : null;
    }
  }
  return {
    startSessionLog: jest.fn(),
    saveSetLog: jest.fn(),
    finishSessionLog: jest.fn(),
    getOpenSessionLog: jest.fn(),
    getLastLoadByExercise: jest.fn(),
    updateSetLogAdaptation: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (e: unknown) =>
      e instanceof SessionExecutionRequestError && e.kind === 'transport',
  };
});
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
jest.mock('../src/services/agendaRepository', () => ({
  getAgendaDoAluno: jest.fn(async () => ({ agenda: [], origem: 'ausente' })),
}));
jest.mock('../src/services/planEditRepository', () => {
  class PlanEditError extends Error {
    code: string | null;
    constructor(message: string, code: string | null = null) {
      super(message);
      this.name = 'PlanEditError';
      this.code = code;
    }
  }
  return {
    PlanEditError,
    isPlanoDesatualizado: jest.fn(() => false),
    reagendarSessoesDaSemana: jest.fn(async () => ({ week: 1, moved: 0 })),
  };
});
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));
// Fase 4 (REQ-07): mesma razão de activeSessionStore.test.ts — o store agora
// fala com a fila real (sessionOutboxDrain/sessionOutboxStorage), que usa
// AsyncStorage de verdade. Mock oficial do pacote (implementação em memória).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Motor de adaptação: mock PARCIAL. Todo o resto do módulo continua real — só
// `evaluateSet`/`recommendByRules` viram espiões, para injetar a exceção que o
// bug original transformava em "falha de envio".
jest.mock('../src/engine/intraSessionAdaptation', () => {
  const real = jest.requireActual('../src/engine/intraSessionAdaptation');
  return {
    ...real,
    evaluateSet: jest.fn(real.evaluateSet),
    recommendByRules: jest.fn(real.recommendByRules),
  };
});

import {
  startSessionLog,
  saveSetLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  updateSetLogAdaptation,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft } from '../src/services/sessionDraftStorage';
import { evaluateSet, recommendByRules } from '../src/engine/intraSessionAdaptation';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';
// Fase 4 (REQ-07): completeSet enfileira em vez de aguardar a RPC (D-05) — o
// teste de "falha de rede" precisa drenar explicitamente para observar a fila.
import { drainAll } from '../src/services/sessionOutboxDrain';
import { loadOutbox } from '../src/services/sessionOutboxStorage';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const confirmarCheckInSePedido = async () => {
  const st = useActiveSessionStore.getState();
  if (st.status === 'awaiting_checkin') {
    await st.confirmCheckIn({ mood: 'normal', availableMinutes: null });
  }
};

const makeDetail = (): SessionDetail => ({
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: null,
  order_in_week: 1,
  title: 'Push A',
  session_type: 'Hipertrofia',
  scheduled_date: '2026-07-20',
  estimated_minutes: 60,
  status: 'pending',
  muscle_groups: ['Peito'],
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 'sess-1',
      exercise_order: 1,
      name: 'Supino Reto',
      muscle_group: 'Peito',
      priority: 'primary',
      equipment: 'Barra',
      load_increment_kg: 2.5,
      rest_seconds: 90,
      target_rm_percent: 75,
      sets_planned: 2,
      reps_raw: '8-10',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
  ],
});

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(loadDraft).mockResolvedValue(null);
  mock(saveDraft).mockResolvedValue(undefined);
  mock(getLastLoadByExercise).mockResolvedValue({});
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'log-1', startedAt: '2026-07-20T10:00:00Z' });
  mock(updateSetLogAdaptation).mockResolvedValue(undefined);
  mock(saveSetLog).mockImplementation((p: any) =>
    Promise.resolve({
      setLogId: 'sl-1',
      actualReps: p.actualReps,
      actualLoadKg: p.actualLoadKg,
      actualRir: p.actualRir,
      outcome: p.outcome,
    }),
  );
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

const store = () => useActiveSessionStore.getState();

// Série 1 de 2, ABAIXO do alvo (5 de 8–10): entra no ramo de adaptação, que é
// exatamente onde a exceção do bug original nascia.
const concluirPrimeiraSerieForaDoAlvo = async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
  await confirmarCheckInSePedido();
  store().setReps('ex-1', 1, 5);
  store().setLoad('ex-1', 1, 50);
  return store().completeSet('ex-1', 1);
};

describe('completeSet: falha no motor de adaptação NÃO vira falha de envio', () => {
  it('recommendByRules lançando TypeError → série concluída, sem erro na tela', async () => {
    mock(recommendByRules).mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'recommended')");
    });

    const ok = await concluirPrimeiraSerieForaDoAlvo();

    expect(ok).toBe(true);

    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).toBe('done');
    // Fase 4 (D-05): commit OTIMISTA — setLogId ainda não existe neste momento
    // (só a fila em segundo plano confirma); fica null até a próxima retomada
    // reconciliar via applyServerSetLogs.
    expect(set1.setLogId).toBeNull();
    expect(set1.actualReps).toBe(5);

    // Nada de mensagem de erro no meio do treino.
    expect(store().saveError).toBeNull();
    // Sem sugestão (o motor quebrou), mas isso é perda de SUGESTÃO, não de REGISTRO.
    expect(store().pendingAdaptation).toBeNull();
    // A falha não é silenciosa: fica no log para diagnóstico.
    expect(warnSpy).toHaveBeenCalled();

    // A escrita em si acontece na fila, em segundo plano (fire-and-forget, D-05)
    // — deixa a ÚNICA drenagem resultante assentar sem competir com uma 2ª
    // chamada explícita a drainAll (que dispararia um dispatch concorrente do
    // MESMO item, ver F2 em activeSessionStore.test.ts).
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mock(saveSetLog)).toHaveBeenCalledTimes(1);
  });

  it('evaluateSet lançando → mesmo contrato: registro preservado', async () => {
    mock(evaluateSet).mockImplementation(() => {
      throw new TypeError('boom no avaliador');
    });

    const ok = await concluirPrimeiraSerieForaDoAlvo();

    expect(ok).toBe(true);
    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).toBe('done');
    expect(store().saveError).toBeNull();
    expect(store().pendingAdaptation).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mock(saveSetLog)).toHaveBeenCalledTimes(1);
  });

  it('a série seguinte continua utilizável depois da falha de adaptação', async () => {
    mock(recommendByRules).mockImplementationOnce(() => {
      throw new TypeError('falha só na primeira série');
    });

    await concluirPrimeiraSerieForaDoAlvo();

    // Sem o commit de estado, o rascunho ficaria travado na série 1 e o aluno não
    // conseguiria seguir o treino.
    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).toBe('done');

    store().setReps('ex-1', 2, 9);
    store().setLoad('ex-1', 2, 50);
    const ok2 = await store().completeSet('ex-1', 2);

    expect(ok2).toBe(true);
    const set2 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 2)!;
    expect(set2.status).toBe('done');

    // Duas séries do MESMO exercício disparam duas drenagens fire-and-forget
    // independentes (D-05); FIFO por sessão (D-04) processa um item por vez —
    // drena até estabilizar em vez de fixar um número exato de chamadas.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await drainAll('user-1');
    await drainAll('user-1');

    expect(mock(saveSetLog)).toHaveBeenCalled();
    expect(store().saveError).toBeNull();
    const doc = await loadOutbox('user-1');
    expect(doc.items).toHaveLength(0);
    expect(doc.quarantine).toHaveLength(0);
  });
});

describe('completeSet: falha de rede NUNCA impede o registro local (D-05, pós-fase)', () => {
  it('saveSetLog rejeitando → série conclui local mesmo assim, sem saveError; item fica pendente na fila', async () => {
    mock(saveSetLog).mockRejectedValue(new Error('rede caiu'));

    const ok = await concluirPrimeiraSerieForaDoAlvo();

    // Fase 4 (REQ-07): este é o comportamento que o REQ-07 SUBSTITUI — antes,
    // uma falha de rede em save_set_log impedia a conclusão local e mostrava o
    // erro cru na tela. Agora vira item de fila (retentável, D-11) e a série
    // conclui na hora (D-05).
    expect(ok).toBe(true);
    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).toBe('done');
    expect(store().saveError).toBeNull();

    await drainAll('user-1');
    const doc = await loadOutbox('user-1');
    expect(doc.items).toHaveLength(1);
    expect(doc.items[0].kind).toBe('save_set_log');
  });
});
