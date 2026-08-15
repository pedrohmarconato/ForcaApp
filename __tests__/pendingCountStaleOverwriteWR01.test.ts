// __tests__/pendingCountStaleOverwriteWR01.test.ts
// Achado WR-01 do code review da fase 04: todo call site que usa
// enqueueAndDrain faz `const { pendingCount, quarantineCount } =
// await enqueueAndDrain(...)` e, mais tarde no MESMO handler, `set({ ...,
// pendingCount, quarantineCount })` com esse valor DESTRUTURADO — o
// snapshot de CONTAGEM NO MOMENTO DO ENFILEIRAMENTO (D-05: antes da
// drenagem em segundo plano rodar). Se a drenagem em segundo plano
// (fire-and-forget, dentro de enqueueAndDrain) terminar rápido o
// suficiente para chamar `onSummaryChanged` (que já faz seu próprio
// `set({ pendingCount, quarantineCount })`) ANTES do `set()` final do
// chamador, esse `set()` final SOBRESCREVE o valor fresco com o snapshot
// obsoleto — o selo "N registros a caminho" pode mostrar uma contagem maior
// que a real até o próximo ciclo de drenagem corrigir.
//
// Mocka sessionOutboxDrain inteiro para tornar a corrida DETERMINÍSTICA (em
// vez de depender de timing real de promises/mocks de rede, que
// __tests__/activeSessionStore.test.ts evita de propósito por rodar contra a
// fila real) — o mock de enqueueAndDrain chama callbacks.onSummaryChanged
// SINCRONAMENTE, dentro do próprio await, simulando uma drenagem que já
// escreveu contagens FRESCAS antes de devolver seu snapshot (deliberadamente
// obsoleto) ao chamador.

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
    skipPlannedSession: jest.fn(),
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

// Achado WR-01: mock DEDICADO de sessionOutboxDrain (diferente do resto da
// suíte, que roda contra a fila real de propósito) — só assim a corrida
// entre onSummaryChanged e o set() final do chamador vira determinística.
jest.mock('../src/services/sessionOutboxDrain', () => ({
  enqueueAndDrain: jest.fn(),
}));

// PUSH-03: activeSessionStore agora importa apiClient (confirmReplan()
// dispara a notificacao best-effort). Mocka o modulo inteiro para nao
// carregar o cliente Supabase real no jest -- mesmo padrao de
// manualPlanStore.test.ts/replanFlow.test.ts.
jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve()) },
  ENDPOINTS: {
    PUSH: { NOTIFY_REPLAN: '/push/notify-replan-applied' },
  },
}));

import { startSessionLog, getOpenSessionLog, getLastLoadByExercise } from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft, clearDraft } from '../src/services/sessionDraftStorage';
import { enqueueAndDrain } from '../src/services/sessionOutboxDrain';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

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
      sets_planned: 1,
      reps_raw: '8-10',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
  ],
});

const store = () => useActiveSessionStore.getState();

const confirmarCheckInSePedido = async () => {
  const st = useActiveSessionStore.getState();
  if (st.status === 'awaiting_checkin') {
    await st.confirmCheckIn({ mood: 'normal', availableMinutes: null });
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(loadDraft).mockResolvedValue(null);
  mock(saveDraft).mockResolvedValue(undefined);
  mock(clearDraft).mockResolvedValue(undefined);
  mock(getLastLoadByExercise).mockResolvedValue({});
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'log-1', startedAt: '2026-07-20T10:00:00Z' });
});

describe('WR-01: pendingCount/quarantineCount não pode ser sobrescrito por snapshot obsoleto', () => {
  it('finishSession: onSummaryChanged (drenagem rápida) grava contagem fresca ANTES do set() final — o set() final não pode reverter para o snapshot do enfileiramento', async () => {
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

    // Simula: enqueueAndDrain enfileira (snapshot obsoleto: pendingCount=1,
    // quarantineCount=0), mas a drenagem em segundo plano (fire-and-forget,
    // dentro do MESMO await) já resolveu e escreveu a contagem FRESCA via
    // onSummaryChanged antes de devolver o snapshot antigo ao chamador —
    // exatamente o que uma drenagem rápida faria na vida real.
    mock(enqueueAndDrain).mockImplementation(async (_userId: string, _params: unknown, callbacks?: any) => {
      callbacks?.onSummaryChanged?.(99, 3);
      return { pendingCount: 1, quarantineCount: 0 };
    });

    const ok = await store().finishSession();

    expect(ok).toBe(true);
    // Se o set() final de finishSession ainda usar o snapshot destruturado
    // (1, 0) em vez de reler o estado corrente, ele reverte a contagem
    // fresca que onSummaryChanged já tinha gravado — isto é o achado WR-01.
    expect(store().pendingCount).toBe(99);
    expect(store().quarantineCount).toBe(3);
  });

  it('finishSession: SEM corrida (drenagem lenta, nunca chama onSummaryChanged) ainda reflete o snapshot do enfileiramento IMEDIATAMENTE (D-05 não pode regredir)', async () => {
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

    // Drenagem em segundo plano nunca resolve dentro deste teste (RPC "em
    // voo") — onSummaryChanged nunca dispara. O selo de pendência (D-05)
    // ainda precisa refletir o item recém-enfileirado IMEDIATAMENTE, sem
    // esperar a rede.
    mock(enqueueAndDrain).mockImplementation(async () => ({ pendingCount: 1, quarantineCount: 0 }));

    const ok = await store().finishSession();

    expect(ok).toBe(true);
    expect(store().pendingCount).toBe(1);
    expect(store().quarantineCount).toBe(0);
  });
});
