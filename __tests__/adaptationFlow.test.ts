// __tests__/adaptationFlow.test.ts
// Fase 5 — fluxo no store: concluir uma série FORA do alvo levanta uma adaptação
// pendente; resolver aplica o efeito à próxima série e grava a escolha (best-effort),
// sem nunca aplicar sem a decisão do aluno.
//
// Fase 4 (REQ-07/D-05/Pitfall 1): completeSet virou commit OTIMISTA — o
// `setLogId` de uma série recém-concluída não existe mais neste momento (só a
// fila confirma depois), então `pendingAdaptation.setLogId` fica `null` e a
// persistência da decisão de adaptação em `updateSetLogAdaptation` (tanto a
// automática quanto a de `resolveAdaptation`) fica em PAUSA nesta fase — o
// 04-02-PLAN.md reintroduz via fila com resolução tardia de setLogId. O
// EFEITO local (ajustar a próxima série, registrar `set.adaptation`) continua
// idêntico — só a chamada de rede direta que sai destes testes.

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
// Fase 6: o store passou a importar o repositório de replanejamento; mocka para
// não carregar o cliente Supabase real no jest (mesmo padrão dos demais services).
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
  applyConfirmedReplan: jest.fn(),
}));
// Fase 5: o store passou a importar agendaRepository e planEditRepository;
// mocka para não carregar o cliente Supabase real (mesmo padrão dos demais services).
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

import {
  startSessionLog,
  saveSetLog,
  getOpenSessionLog,
  getLastLoadByExercise,
  updateSetLogAdaptation,
  SessionExecutionRequestError,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import {
  buildDraftFromDetail,
  coerceDraftNumerics,
} from '../src/engine/sessionModel';
import { applyAdjustmentToNextSet, type Adjustment } from '../src/engine/intraSessionAdaptation';
import type { SessionDetail } from '../src/services/trainingRepository';


// Check-in obrigatório (22/07/2026): sessão NOVA para em awaiting_checkin; os
// testes desta suíte confirmam com defaults neutros para seguir o fluxo antigo.
const confirmarCheckInSePedido = async () => {
  const st = useActiveSessionStore.getState();
  if (st.status === 'awaiting_checkin') {
    await st.confirmCheckIn({ mood: 'normal', availableMinutes: null });
  }
};

const REDUZIR_45: Adjustment = {
  kind: 'load',
  direction: 'decrease',
  fromKg: 50,
  toKg: 45,
  deltaKg: -5,
  pct: 0.1,
  label: 'Reduzir para 45 kg',
  reason: 'Abaixo do alvo.',
};

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const makeDetail = (injuryFlags: string[] = []): SessionDetail => ({
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
      injury_flags: injuryFlags,
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-3', exercise_id: 'ex-1', set_order: 3, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(loadDraft).mockResolvedValue(null);
  mock(saveDraft).mockResolvedValue(undefined);
  mock(getLastLoadByExercise).mockResolvedValue({});
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'log-1', startedAt: '2026-07-20T10:00:00Z' });
  mock(updateSetLogAdaptation).mockResolvedValue(undefined);
  // Echo do que foi enviado (a RPC preserva o outcome que o store calculou).
  mock(saveSetLog).mockImplementation((p: any) =>
    Promise.resolve({
      setLogId: 'sl-1',
      actualReps: p.actualReps,
      actualLoadKg: p.actualLoadKg,
      actualRir: p.actualRir,
      outcome: p.outcome,
    }),
  );
});

const store = () => useActiveSessionStore.getState();

it('série abaixo do alvo levanta pendingAdaptation; on_target não levanta', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

  // dentro do alvo (9 de 8–10) → NÃO incomoda
  store().setReps('ex-1', 1, 9);
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);
  expect(store().pendingAdaptation).toBeNull();

  // abaixo do alvo (5 de 8–10) → levanta a adaptação
  store().setReps('ex-1', 2, 5);
  store().setLoad('ex-1', 2, 50);
  await store().completeSet('ex-1', 2);
  const pending = store().pendingAdaptation;
  expect(pending).not.toBeNull();
  expect(pending!.recommendation.outcome).toBe('under');
  // Fase 4 (D-05/Pitfall 1): setLogId ainda não existe no commit otimista —
  // fica null até a fila confirmar (resolução tardia, 04-02-PLAN.md).
  expect(pending!.setLogId).toBeNull();
});

it('resolver aplica o ajuste à próxima série, grava a escolha e limpa o pendente', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

  store().setReps('ex-1', 1, 5); // under → recomenda reduzir carga
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);

  const rec = store().pendingAdaptation!.recommendation.recommended;
  expect(rec.kind).toBe('load'); // há uma sugestão concreta de carga

  await store().resolveAdaptation(rec);

  // aplicou à próxima série (set_order 2)
  const set2 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 2)!;
  if (rec.kind !== 'load') throw new Error('esperava load');
  expect(set2.targetLoadKg).toBe(rec.toKg);
  // registrou a escolha na série concluída (set_order 1)
  const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
  expect(set1.adaptation).toEqual(rec);
  // Fase 4 (D-05/Pitfall 1): setLogId é null no commit otimista — resolveAdaptation
  // já guarda essa chamada com `if (pending.setLogId)`, então a persistência de
  // rede da decisão fica em PAUSA nesta fase (04-02-PLAN.md reintroduz via fila).
  expect(mock(updateSetLogAdaptation)).not.toHaveBeenCalled();
  expect(store().pendingAdaptation).toBeNull();
});

it('recusar (manter) grava a decisão mas NÃO altera o alvo da próxima série', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

  store().setReps('ex-1', 1, 5);
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);

  const keep = store().pendingAdaptation!.recommendation.options.find((o) => o.kind === 'keep')!;
  expect(keep).toBeDefined();
  await store().resolveAdaptation(keep);

  const set2 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 2)!;
  expect(set2.targetLoadKg).toBeNull(); // alvo original preservado (recusa respeitada)
  // Fase 4 (D-05/Pitfall 1): mesma pausa da persistência de rede — setLogId
  // null no commit otimista (04-02-PLAN.md reintroduz via fila).
  expect(mock(updateSetLogAdaptation)).not.toHaveBeenCalled();
  expect(store().pendingAdaptation).toBeNull();
});

it('MEDIUM: superávit com lesão → sem sheet, mas REGISTRA decisão automática (não fica null)', async () => {
  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail(['ombro']) });
    await confirmarCheckInSePedido();
  store().setReps('ex-1', 1, 12); // acima do alvo 8–10 (superávit)
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);
  // guardrail: lesão nunca sobe carga → "manter" → nada a decidir → sem sheet…
  expect(store().pendingAdaptation).toBeNull();
  // …mas a decisão automática de segurança é registrada (não é escolha do aluno)
  // LOCALMENTE — a persistência via updateSetLogAdaptation saiu de dentro de
  // completeSet nesta fase (D-05/Pitfall 1: setLogId ainda não existe no
  // commit otimista; 04-02-PLAN.md reintroduz via fila).
  const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
  expect(set1.adaptation).toMatchObject({ kind: 'keep', auto: true });
  expect(mock(updateSetLogAdaptation)).not.toHaveBeenCalled();
});

it('HIGH: draft legado lesionado (sem hasInjury) reconcilia e NUNCA recomenda aumento', async () => {
  // rascunho gravado por versão anterior à Fase 5: sem hasInjury, mas com sessionLogId.
  const legacy = buildDraftFromDetail(makeDetail(['ombro']), 'user-1');
  legacy.sessionLogId = 'log-1';
  delete (legacy.exercises[0] as any).hasInjury;
  mock(loadDraft).mockResolvedValue(coerceDraftNumerics(legacy));
  // rede falha por transporte → o store adota o rascunho local (caminho vulnerável).
  mock(getOpenSessionLog).mockRejectedValue(
    new SessionExecutionRequestError({ message: 'net' }, { kind: 'transport' }),
  );

  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail(['ombro']) });
    await confirmarCheckInSePedido();
  store().setReps('ex-1', 1, 15); // acima do alvo (superávit)
  store().setLoad('ex-1', 1, 50);
  await store().completeSet('ex-1', 1);

  // Sem a reconciliação, ctx.injury viria undefined e o motor recomendaria +55kg. Corrigido:
  expect(store().pendingAdaptation).toBeNull();
  const set1 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 1)!;
  expect(set1.adaptation).toMatchObject({ kind: 'keep', auto: true });
});

it('HIGH: retomada online preserva e REAPLICA a adaptation à próxima série', async () => {
  // Estado local: série 1 concluída com adaptação reduzir p/ 45; série 2 já ajustada.
  const base = buildDraftFromDetail(makeDetail(), 'user-1');
  base.sessionLogId = 'log-1';
  base.exercises[0].sets[0] = {
    ...base.exercises[0].sets[0],
    status: 'done',
    setLogId: 'sl-1',
    actualReps: 5,
    actualLoadKg: 50,
    actualRir: null,
    outcome: 'under',
  };
  const local = applyAdjustmentToNextSet(base, 'ex-1', 1, REDUZIR_45);
  mock(loadDraft).mockResolvedValue(local);
  // servidor tem a série 1 gravada COM a adaptation.
  mock(getOpenSessionLog).mockResolvedValue({
    sessionLogId: 'log-1',
    startedAt: '2026-07-20T10:00:00Z',
    setLogs: [
      {
        id: 'sl-1',
        planned_set_id: 'st-1',
        actual_reps: 5,
        actual_load_kg: 50,
        actual_rir: null,
        outcome: 'under',
        adaptation: REDUZIR_45,
        completed_at: '2026-07-20T10:05:00Z',
      },
    ],
  });

  await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

  const sets = store().draft!.exercises[0].sets;
  expect(sets.find((s) => s.setOrder === 1)!.adaptation).toEqual(REDUZIR_45); // restaurada
  expect(sets.find((s) => s.setOrder === 2)!.targetLoadKg).toBe(45); // reaplicada
});

describe('última série do exercício: sem proposta nem decisão automática (emenda G)', () => {
  it('completar a ÚLTIMA série com superávit → pendingAdaptation null E lastAutoDecision null', async () => {
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    await confirmarCheckInSePedido();

    // Começa limpo.
    expect(store().lastAutoDecision).toBeNull();

    // Série 3 é a ÚLTIMA (a série 1 e 2 já estão feitas).
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 50);
    await store().completeSet('ex-1', 1);
    store().setReps('ex-1', 2, 8);
    store().setLoad('ex-1', 2, 50);
    await store().completeSet('ex-1', 2);

    // Superávit na última série (12 de 8–10): haveria recomendação de aumento,
    // mas SEM próxima série do mesmo exercício NÃO abre proposta nem decisão.
    store().setReps('ex-1', 3, 12);
    store().setLoad('ex-1', 3, 50);
    await store().completeSet('ex-1', 3);

    expect(store().pendingAdaptation).toBeNull();
    expect(store().lastAutoDecision).toBeNull();
    // A série foi concluída e avançou normalmente.
    const set3 = store().draft!.exercises[0].sets.find((s) => s.setOrder === 3)!;
    expect(set3.status).toBe('done');
  });

  it('última série SEM próxima do mesmo exercício, mas com pendentes de OUTRO → também não abre', async () => {
    const detail = makeDetail();
    // Acrescenta um segundo exercício com série pendente para provar que a
    // regra é por EXERCÍCIO, não por sessão inteira.
    detail.planned_exercises.push({
      id: 'ex-2',
      session_id: 'sess-1',
      exercise_order: 2,
      name: 'Flexão',
      muscle_group: 'Peito',
      priority: 'secondary',
      equipment: 'Peso corporal',
      load_increment_kg: 0,
      rest_seconds: 60,
      target_rm_percent: null,
      sets_planned: 1,
      reps_raw: '12-15',
      method: null,
      notes: null,
      injury_flags: [],
      planned_sets: [
        { id: 'st-4', exercise_id: 'ex-2', set_order: 1, target_reps_min: 12, target_reps_max: 15, target_load_kg: null, target_rir: null },
      ],
    });
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail });
    await confirmarCheckInSePedido();

    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 50);
    await store().completeSet('ex-1', 1);
    store().setReps('ex-1', 2, 8);
    store().setLoad('ex-1', 2, 50);
    await store().completeSet('ex-1', 2);

    // Última série do ex-1 (superávit): há pendente em ex-2, mas não em ex-1.
    store().setReps('ex-1', 3, 12);
    store().setLoad('ex-1', 3, 50);
    await store().completeSet('ex-1', 3);

    expect(store().pendingAdaptation).toBeNull();
    expect(store().lastAutoDecision).toBeNull();
  });
});
