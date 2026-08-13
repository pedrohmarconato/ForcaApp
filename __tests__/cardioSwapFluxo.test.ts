// __tests__/cardioSwapFluxo.test.ts
// Troca de modalidade de cardio (Fase 3, REQ-06) do ponto de vista do FLUXO:
// store ↔ servidor. Molde exato de __tests__/recusaDeclaradaFluxo.test.ts —
// mesmos dois modos de falha ("servidor primeiro" e "troca some na retomada").
//
// Modos de falha cobertos, todos escritos antes da implementação:
//  1. aplicar a troca na tela e só depois tentar gravar — falha do servidor
//     deixaria o exercício "trocado" no aparelho e a modalidade original
//     exigida no banco;
//  2. troca gravada no servidor mas perdida na RETOMADA (o rascunho local
//     não é autoritativo): o aluno reencontra a modalidade que trocou;
//  3. rascunho local sem a troca não pode apagar a troca já registrada no
//     servidor — servidor é autoritativo.

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
    skipSessionExercise: jest.fn(),
    unskipSessionExercise: jest.fn(),
    skipPlannedSession: jest.fn(),
    unskipPlannedSession: jest.fn(),
    swapSessionExercise: jest.fn(),
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (error: unknown) =>
      error instanceof SessionExecutionRequestError && error.kind === 'transport',
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

import {
  startSessionLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  swapSessionExercise,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft, clearDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import type { SessionDetail } from '../src/services/trainingRepository';
// Fase 4 (REQ-07): swapExercise enfileira em vez de aguardar a RPC direto
// (D-05 estendido) — os testes que verificavam a chamada SÍNCRONA a
// swapSessionExercise agora drenam explicitamente para observar o payload.
import { drainAll } from '../src/services/sessionOutboxDrain';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;
const store = () => useActiveSessionStore.getState();

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
      planned_sets: [
        {
          id: 'st-1',
          exercise_id: 'ex-1',
          set_order: 1,
          target_reps_min: 8,
          target_reps_max: 10,
          target_load_kg: 40,
          target_rir: 2,
        },
      ],
    },
    {
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Corrida',
      muscle_group: 'Cardio',
      priority: 'accessory',
      equipment: 'Peso corporal',
      load_increment_kg: 0,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: null,
      method: null,
      notes: null,
      planned_sets: [
        {
          id: 'st-2',
          exercise_id: 'ex-2',
          set_order: 1,
          target_reps_min: null as unknown as number,
          target_reps_max: null as unknown as number,
          target_load_kg: null,
          target_rir: null,
        },
      ],
    },
  ],
});

const abrirSessao = async () => {
  mock(loadDraft).mockResolvedValue(null);
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(getLastLoadByExercise).mockResolvedValue({});
  mock(startSessionLog).mockResolvedValue({
    sessionLogId: 'sl-1',
    startedAt: '2026-07-30T10:00:00.000Z',
  });
  await store().startOrResume({
    sessionId: 'sess-1',
    userId: 'user-1',
    detail: makeDetail(),
  });
  if (store().status === 'awaiting_checkin') {
    await store().confirmCheckIn({ mood: 'normal', availableMinutes: null });
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.setState({
    draft: null,
    status: 'idle',
    saveError: null,
    pendingAdaptation: null,
    pendingReplan: null,
    replanBusy: false,
    sessionMood: null,
    checkInMinutes: null,
    pendingCheckIn: null,
    lastAutoDecision: null,
  });
});

describe('modo de falha 1: fila offline-first (D-05 estendido, Fase 4/REQ-07)', () => {
  it('aplica a troca na tela imediatamente e enfileira swapSessionExercise com a nova modalidade', async () => {
    await abrirSessao();
    mock(swapSessionExercise).mockResolvedValue({
      plannedExerciseId: 'ex-2',
      toModality: 'Remo Ergômetro',
      note: null,
    });

    const ok = await store().swapExercise('ex-2', 'Remo Ergômetro');

    expect(ok).toBe(true);
    const trocado = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(trocado.name).toBe('Remo Ergômetro');
    expect(trocado.swappedFrom).toBe('Corrida');

    // A gravação no servidor acontece em segundo plano, via fila (D-05
    // estendido) — drena explicitamente para observar o payload enviado.
    await drainAll('user-1');
    expect(swapSessionExercise).toHaveBeenCalledWith({
      sessionLogId: 'sl-1',
      plannedExerciseId: 'ex-2',
      toModality: 'Remo Ergômetro',
      note: null,
    });
  });

  it('falha do servidor NÃO desfaz a troca na tela nem seta saveError (D-05 estendido)', async () => {
    await abrirSessao();
    mock(swapSessionExercise).mockRejectedValue(new Error('log já finalizado'));

    const ok = await store().swapExercise('ex-2', 'Remo Ergômetro');

    // Fase 4 (REQ-07): a mudança local já aplicou antes de a fila tentar a
    // rede — falha de servidor NUNCA reverte a tela nem seta saveError a
    // partir de agora (só a guarda CR-01 local, que continua igual).
    expect(ok).toBe(true);
    const trocado = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(trocado.name).toBe('Remo Ergômetro');
    expect(store().saveError).toBeNull();

    await drainAll('user-1');
    expect(swapSessionExercise).toHaveBeenCalled();
  });
});

describe('CR-01 (decisão a): troca bloqueada com série concluída', () => {
  it('recusa ANTES do servidor quando existe série done e reporta na UI', async () => {
    await abrirSessao();
    const draft = store().draft!;
    useActiveSessionStore.setState({
      draft: {
        ...draft,
        exercises: draft.exercises.map((e) =>
          e.exerciseId === 'ex-2'
            ? {
                ...e,
                sets: e.sets.map((s) => ({
                  ...s,
                  status: 'done',
                  actualDurationSeconds: 1200,
                  actualDistanceM: 4800,
                  outcome: 'on_target',
                })),
              }
            : e,
        ),
      },
      saveError: null,
    });

    const ok = await store().swapExercise('ex-2', 'Remo Ergômetro');

    expect(ok).toBe(false);
    // A RPC nem é chamada: a recusa é do cliente, antes de tocar o servidor.
    expect(swapSessionExercise).not.toHaveBeenCalled();
    const naoTrocado = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(naoTrocado.name).toBe('Corrida');
    expect(naoTrocado.sets.every((s) => s.status === 'done')).toBe(true);
    expect(store().saveError).toMatch(/série concluída/i);
  });

  it('série pendente não dispara a guarda: troca flui normalmente', async () => {
    await abrirSessao();
    mock(swapSessionExercise).mockResolvedValue({
      plannedExerciseId: 'ex-2',
      toModality: 'Remo Ergômetro',
      note: null,
    });

    const ok = await store().swapExercise('ex-2', 'Remo Ergômetro');

    expect(ok).toBe(true);
    expect(store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!.name).toBe(
      'Remo Ergômetro',
    );

    // Fase 4 (REQ-07): swapSessionExercise é chamado em segundo plano, via fila.
    await drainAll('user-1');
    expect(swapSessionExercise).toHaveBeenCalled();
  });
});

describe('modo de falha 2: troca some na retomada', () => {
  it('reconstrução pelo servidor reaplica a troca registrada lá', async () => {
    mock(loadDraft).mockResolvedValue(null);
    mock(getLastLoadByExercise).mockResolvedValue({});
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-1',
      startedAt: '2026-07-30T10:00:00.000Z',
      setLogs: [],
      availableMinutes: null,
      adherenceSnapshot: null,
      mood: 'normal',
      exerciseSkips: [],
      exerciseSwaps: [{ plannedExerciseId: 'ex-2', toModality: 'Remo Ergômetro', note: null }],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().status).toBe('active');
    const trocado = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(trocado.name).toBe('Remo Ergômetro');
    expect(trocado.swappedFrom).toBe('Corrida');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('rascunho local sem a troca não apaga a troca do servidor', async () => {
    const detail = makeDetail();
    mock(getLastLoadByExercise).mockResolvedValue({});
    mock(loadDraft).mockResolvedValue({
      version: 1,
      plannedSessionId: 'sess-1',
      sessionLogId: 'sl-1',
      userId: 'user-1',
      title: 'Push A',
      weekNumber: 1,
      startedAt: '2026-07-30T10:00:00.000Z',
      status: 'active',
      exercises: detail.planned_exercises.map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        order: ex.exercise_order,
        equipment: ex.equipment,
        isBodyweight: false,
        hasInjury: false,
        loadIncrementKg: 2.5,
        restSeconds: 60,
        priority: ex.priority,
        targetRmPercent: null,
        repsRaw: null,
        sets: ex.planned_sets.map((s) => ({
          plannedSetId: s.id,
          setOrder: s.set_order,
          targetRepsMin: s.target_reps_min ?? 0,
          targetRepsMax: s.target_reps_max ?? 0,
          targetLoadKg: null,
          targetRir: null,
          actualReps: null,
          actualLoadKg: null,
          actualRir: null,
          status: 'pending',
          outcome: null,
          setLogId: null,
          adaptation: null,
          activatedAt: null,
        })),
      })),
      lastLoadByExercise: {},
    });
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-1',
      startedAt: '2026-07-30T10:00:00.000Z',
      setLogs: [],
      availableMinutes: null,
      adherenceSnapshot: null,
      mood: null,
      exerciseSkips: [],
      exerciseSwaps: [{ plannedExerciseId: 'ex-2', toModality: 'Bicicleta Ergométrica', note: null }],
    });

    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });

    const trocado = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(trocado.name).toBe('Bicicleta Ergométrica');
    expect(trocado.swappedFrom).toBe('Corrida');
  });
});
