// __tests__/recusaDeclaradaFluxo.test.ts
// Recusa declarada (0020) do ponto de vista do FLUXO: store ↔ servidor.
//
// Modos de falha cobertos, todos escritos antes da implementação:
//  1. aplicar a recusa na tela e só depois tentar gravar — falha do servidor
//     deixaria o exercício "recusado" no aparelho e exigido no banco;
//  2. recusa gravada no servidor mas perdida na RETOMADA (o rascunho local não é
//     autoritativo): o aluno reencontra o exercício que dispensou;
//  3. recusar a sessão inteira e o rascunho local sobreviver — a próxima
//     abertura ressuscitaria a sessão recusada;
//  4. recusa por dor/rejeição voltar pela porta da redistribuição do replan.

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
    SessionExecutionRequestError,
    isTransportSessionExecutionError: (error: unknown) =>
      error instanceof SessionExecutionRequestError && error.kind === 'transport',
  };
});
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

import {
  startSessionLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  skipSessionExercise,
  unskipSessionExercise,
  skipPlannedSession,
} from '../src/services/sessionExecutionRepository';
import { loadDraft, clearDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import { sessionProgress } from '../src/engine/sessionModel';
import { planMissedRedistribution } from '../src/engine/weeklyReplanner';
import type { SessionDetail } from '../src/services/trainingRepository';
import type { ReplanSession } from '../src/engine/weeklyReplanner';

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

describe('modo de falha 1: servidor primeiro', () => {
  it('grava no servidor com motivo e nota antes de aplicar na tela', async () => {
    await abrirSessao();
    mock(skipSessionExercise).mockResolvedValue({
      plannedExerciseId: 'ex-2',
      reason: 'dor_ou_lesao',
      note: 'joelho',
    });

    const ok = await store().skipExercise('ex-2', 'dor_ou_lesao', 'joelho');

    expect(ok).toBe(true);
    expect(skipSessionExercise).toHaveBeenCalledWith({
      sessionLogId: 'sl-1',
      plannedExerciseId: 'ex-2',
      reason: 'dor_ou_lesao',
      note: 'joelho',
    });
    const corrida = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(corrida.skippedByUser).toBe(true);
    expect(corrida.skipReason).toBe('dor_ou_lesao');
    // A série pendente da corrida saiu da conta; a do supino continua.
    expect(sessionProgress(store().draft!)).toEqual({ done: 0, total: 1 });
  });

  it('falha do servidor NÃO marca a recusa na tela e reporta o erro', async () => {
    await abrirSessao();
    mock(skipSessionExercise).mockRejectedValue(new Error('log já finalizado'));

    const ok = await store().skipExercise('ex-2', 'nao_gosto');

    expect(ok).toBe(false);
    const corrida = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(corrida.skippedByUser).not.toBe(true);
    expect(store().saveError).toBe('log já finalizado');
    // As duas séries continuam exigidas: nada foi dispensado de fato.
    expect(sessionProgress(store().draft!)).toEqual({ done: 0, total: 2 });
  });

  it('desfazer também passa pelo servidor antes de voltar à tela', async () => {
    await abrirSessao();
    mock(skipSessionExercise).mockResolvedValue({
      plannedExerciseId: 'ex-2',
      reason: 'cansaco',
      note: null,
    });
    await store().skipExercise('ex-2', 'cansaco');
    mock(unskipSessionExercise).mockResolvedValue(true);

    await store().unskipExercise('ex-2');

    expect(unskipSessionExercise).toHaveBeenCalledWith({
      sessionLogId: 'sl-1',
      plannedExerciseId: 'ex-2',
    });
    expect(store().draft!.exercises[1].skippedByUser).toBe(false);
    expect(sessionProgress(store().draft!)).toEqual({ done: 0, total: 2 });
  });
});

describe('modo de falha 2: recusa some na retomada', () => {
  it('reconstrução pelo servidor reaplica a recusa registrada lá', async () => {
    mock(loadDraft).mockResolvedValue(null);
    mock(getLastLoadByExercise).mockResolvedValue({});
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-1',
      startedAt: '2026-07-30T10:00:00.000Z',
      setLogs: [],
      availableMinutes: null,
      adherenceSnapshot: null,
      mood: 'normal',
      exerciseSkips: [
        { plannedExerciseId: 'ex-2', reason: 'sem_equipamento', note: 'esteira ocupada' },
      ],
    });

    await store().startOrResume({
      sessionId: 'sess-1',
      userId: 'user-1',
      detail: makeDetail(),
    });

    expect(store().status).toBe('active');
    const corrida = store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!;
    expect(corrida.skippedByUser).toBe(true);
    expect(corrida.skipReason).toBe('sem_equipamento');
    expect(corrida.skipNote).toBe('esteira ocupada');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('rascunho local sem a recusa não apaga a recusa do servidor', async () => {
    // O aluno recusou, o app fechou antes de o rascunho gravar: o local está
    // desatualizado e o servidor é quem manda.
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
      exerciseSkips: [{ plannedExerciseId: 'ex-2', reason: 'nao_gosto', note: null }],
    });

    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });

    expect(store().draft!.exercises.find((e) => e.exerciseId === 'ex-2')!.skippedByUser).toBe(
      true,
    );
  });
});

describe('modo de falha 3: sessão recusada com rascunho vivo', () => {
  it('recusar a sessão limpa o rascunho local e encerra a tela', async () => {
    await abrirSessao();
    mock(skipPlannedSession).mockResolvedValue(undefined);

    const ok = await store().skipWholeSession('sem_tempo', null);

    expect(ok).toBe(true);
    expect(skipPlannedSession).toHaveBeenCalledWith({
      plannedSessionId: 'sess-1',
      reason: 'sem_tempo',
      note: null,
    });
    expect(store().draft).toBeNull();
    expect(store().status).toBe('finished');
    expect(clearDraft).toHaveBeenCalledWith('user-1', 'sess-1', 'sl-1');
  });

  it('falha do servidor mantém a sessão viva (nada de tela vazia sem lastro)', async () => {
    await abrirSessao();
    mock(skipPlannedSession).mockRejectedValue(new Error('sessão concluída não pode ser recusada'));

    const ok = await store().skipWholeSession('outro', null);

    expect(ok).toBe(false);
    expect(store().draft).not.toBeNull();
    expect(store().status).toBe('active');
    expect(clearDraft).not.toHaveBeenCalled();
    expect(store().saveError).toBe('sessão concluída não pode ser recusada');
  });
});

describe('modo de falha 4: o replan devolve o que foi recusado', () => {
  const semana = (): ReplanSession[] => [
    {
      // Perdida (data no passado): o volume dela tenta se realojar.
      id: 's-perdida',
      weekNumber: 1,
      title: 'Cardio B',
      sessionType: 'Cardio',
      scheduledDate: '2026-07-27',
      status: 'pending',
      estimatedMinutes: 40,
      exercises: [
        {
          id: 'p-1',
          name: 'Corrida',
          muscleGroup: 'Cardio',
          priority: 'accessory',
          exerciseOrder: 1,
          sets: [
            { id: 'ps-1', setOrder: 1 },
            { id: 'ps-2', setOrder: 2 },
            { id: 'ps-3', setOrder: 3 },
            { id: 'ps-4', setOrder: 4 },
          ],
        },
      ],
    },
    {
      // Receptora futura: tem Corrida, e é para cá que a redistribuição olharia.
      id: 's-futura',
      weekNumber: 1,
      title: 'Cardio C',
      sessionType: 'Cardio',
      scheduledDate: '2026-07-31',
      status: 'pending',
      estimatedMinutes: 40,
      exercises: [
        {
          id: 'f-1',
          name: 'Corrida',
          muscleGroup: 'Cardio',
          priority: 'accessory',
          exerciseOrder: 1,
          sets: [
            { id: 'fs-1', setOrder: 1 },
            { id: 'fs-2', setOrder: 2 },
            { id: 'fs-3', setOrder: 3 },
            { id: 'fs-4', setOrder: 4 },
          ],
        },
      ],
    },
  ];

  it('sem bloqueio, a Corrida da sessão futura recebe volume', () => {
    const plano = planMissedRedistribution({
      sessions: semana(),
      todayISO: '2026-07-30',
    });

    expect(plano?.additions.some((a) => a.exerciseId === 'f-1')).toBe(true);
  });

  it('recusada por dor, a Corrida NÃO recebe volume — a perda é registrada', () => {
    const plano = planMissedRedistribution({
      sessions: semana(),
      todayISO: '2026-07-30',
      // Casamento por NOME: o id do exercício é outro em cada sessão.
      blockedExerciseNames: ['Corrida'],
    });

    expect(plano?.additions ?? []).toEqual([]);
    // Nada é maquiado: o que não coube aparece como perda.
    expect((plano?.losses ?? []).some((l) => l.sets > 0)).toBe(true);
  });
});
