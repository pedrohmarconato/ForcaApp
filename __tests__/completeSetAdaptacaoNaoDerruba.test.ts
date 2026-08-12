// __tests__/completeSetAdaptacaoNaoDerruba.test.ts
// Regressão do achado da sessão de debug `typeerror-envio-series-treino`:
// `completeSet` conflava, no MESMO try/catch, a escrita no servidor (RPC save_set_log)
// e ~50 linhas de motor de adaptação PURAMENTE LOCAL. Uma exceção no motor — depois de
// o servidor já ter confirmado a gravação — caía no catch de rede, marcava `saveError`
// e devolvia `false`: o aluno lia "não foi possível registrar" no meio do treino com a
// série JÁ gravada em `set_logs`, e a série ficava eternamente pendente no rascunho.
//
// Contrato provado aqui: confirmada a escrita no servidor, a série conclui. O motor de
// adaptação é best-effort — se ele quebrar, perde-se a SUGESTÃO, nunca o REGISTRO.

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

    // A escrita no servidor aconteceu e foi confirmada — não pode ser reapresentada
    // ao aluno como falha.
    expect(mock(saveSetLog)).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);

    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).toBe('done');
    expect(set1.setLogId).toBe('sl-1');
    expect(set1.actualReps).toBe(5);

    // Nada de mensagem de erro no meio do treino.
    expect(store().saveError).toBeNull();
    // Sem sugestão (o motor quebrou), mas isso é perda de SUGESTÃO, não de REGISTRO.
    expect(store().pendingAdaptation).toBeNull();
    // A falha não é silenciosa: fica no log para diagnóstico.
    expect(warnSpy).toHaveBeenCalled();
  });

  it('evaluateSet lançando → mesmo contrato: registro preservado', async () => {
    mock(evaluateSet).mockImplementation(() => {
      throw new TypeError('boom no avaliador');
    });

    const ok = await concluirPrimeiraSerieForaDoAlvo();

    expect(mock(saveSetLog)).toHaveBeenCalledTimes(1);
    expect(ok).toBe(true);
    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).toBe('done');
    expect(store().saveError).toBeNull();
    expect(store().pendingAdaptation).toBeNull();
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
    expect(mock(saveSetLog)).toHaveBeenCalledTimes(2);
    const set2 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 2)!;
    expect(set2.status).toBe('done');
    expect(store().saveError).toBeNull();
  });
});

describe('completeSet: falha REAL de rede continua sendo reportada', () => {
  it('saveSetLog rejeitando → série NÃO concluída e erro visível (não regride)', async () => {
    mock(saveSetLog).mockRejectedValue(new Error('rede caiu'));

    const ok = await concluirPrimeiraSerieForaDoAlvo();

    expect(ok).toBe(false);
    const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
    expect(set1.status).not.toBe('done');
    expect(store().saveError).toBe('rede caiu');
  });
});
