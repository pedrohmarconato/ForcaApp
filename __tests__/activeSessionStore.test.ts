// __tests__/activeSessionStore.test.ts
// Fase 4 — store da sessão ativa. Modos de falha cobertos (os casos de borda do brief):
// - RETOMAR: rascunho local com série feita sobrevive a fechar/reabrir
// - RETOMAR pelo servidor quando o rascunho local se perdeu (não duplica session_log)
// - PRIMEIRA CARGA sem histórico: não conclui até o aluno informar a carga
// - BODYWEIGHT: conclui só com reps, grava carga nula
// - ERRO do banco ao salvar a série NÃO marca como feita (não engole o erro)
// - outcome correto (under/on_target/over) calculado ao concluir

jest.mock('../src/services/sessionExecutionRepository', () => ({
  startSessionLog: jest.fn(),
  saveSetLog: jest.fn(),
  finishSessionLog: jest.fn(),
  getOpenSessionLog: jest.fn(),
  getLastLoadByExerciseName: jest.fn(),
}));
jest.mock('../src/services/sessionDraftStorage', () => ({
  saveDraft: jest.fn(),
  loadDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

import {
  startSessionLog,
  saveSetLog,
  finishSessionLog,
  getOpenSessionLog,
  getLastLoadByExerciseName,
} from '../src/services/sessionExecutionRepository';
import { saveDraft, loadDraft, clearDraft } from '../src/services/sessionDraftStorage';
import { useActiveSessionStore, suggestionFor } from '../src/store/activeSessionStore';
import { buildDraftFromDetail } from '../src/engine/sessionModel';
import type { SessionDetail } from '../src/services/trainingRepository';

const mock = <T,>(fn: T) => fn as unknown as jest.Mock;

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
      id: 'ex-1', session_id: 'sess-1', exercise_order: 1, name: 'Supino Reto',
      muscle_group: 'Peito', priority: 'primary', equipment: 'Barra',
      load_increment_kg: 2.5, rest_seconds: 90, target_rm_percent: 75,
      sets_planned: 2, reps_raw: '8-10', method: null, notes: null,
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
        { id: 'st-2', exercise_id: 'ex-1', set_order: 2, target_reps_min: 8, target_reps_max: 10, target_load_kg: null, target_rir: 2 },
      ],
    },
    {
      id: 'ex-2', session_id: 'sess-1', exercise_order: 2, name: 'Flexão',
      muscle_group: 'Peito', priority: 'accessory', equipment: 'Peso corporal',
      load_increment_kg: 2.5, rest_seconds: 60, target_rm_percent: null,
      sets_planned: 1, reps_raw: 'AMRAP', method: null, notes: null,
      planned_sets: [
        { id: 'st-3', exercise_id: 'ex-2', set_order: 1, target_reps_min: 10, target_reps_max: 20, target_load_kg: null, target_rir: 0 },
      ],
    },
  ],
});

const store = () => useActiveSessionStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  useActiveSessionStore.setState({ draft: null, status: 'idle', saveError: null });
  mock(getLastLoadByExerciseName).mockResolvedValue({});
  mock(loadDraft).mockResolvedValue(null);
  mock(getOpenSessionLog).mockResolvedValue(null);
  mock(startSessionLog).mockResolvedValue({ sessionLogId: 'sl-1', startedAt: 'T0' });
  mock(saveSetLog).mockResolvedValue({ setLogId: 'set-x' });
  mock(saveDraft).mockResolvedValue(undefined);
  mock(clearDraft).mockResolvedValue(undefined);
  mock(finishSessionLog).mockResolvedValue(undefined);
});

describe('início da sessão', () => {
  it('começa fresco: cria session_log e persiste o rascunho', async () => {
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

    expect(store().status).toBe('active');
    expect(store().draft?.sessionLogId).toBe('sl-1');
    expect(startSessionLog).toHaveBeenCalledWith('sess-1');
    expect(saveDraft).toHaveBeenCalled();
    // todas as séries começam pendentes
    const todas = store().draft!.exercises.flatMap((e) => e.sets);
    expect(todas.every((s) => s.status === 'pending')).toBe(true);
  });

  it('início resiliente: falha ao semear histórico não derruba o start', async () => {
    mock(getLastLoadByExerciseName).mockRejectedValue(new Error('rede'));
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    expect(store().status).toBe('active');
  });

  it('erro ao criar o session_log deixa a tela em estado de erro (não finge início)', async () => {
    mock(startSessionLog).mockRejectedValue(new Error('sem rede'));
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    expect(store().status).toBe('error');
    expect(store().saveError).toMatch(/sem rede/);
  });
});

describe('concluir série', () => {
  const start = async () =>
    store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

  it('grava a série e calcula outcome on_target; próxima série passa a sugerir a carga usada', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(true);
    expect(saveSetLog).toHaveBeenCalledWith(
      expect.objectContaining({ plannedSetId: 'st-1', actualReps: 8, actualLoadKg: 40, outcome: 'on_target' }),
    );
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).toBe('done');
    expect(s1.outcome).toBe('on_target');
    // a série 2 do mesmo exercício agora sugere 40 (última usada)
    const ex = store().draft!.exercises[0];
    expect(suggestionFor(store().draft!, ex, ex.sets[1])).toBe(40);
  });

  it('outcome under quando reps abaixo do mínimo', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 5);
    store().setLoad('ex-1', 1, 40);
    await store().completeSet('ex-1', 1);
    expect(store().draft!.exercises[0].sets[0].outcome).toBe('under');
  });

  it('PRIMEIRA CARGA: sem histórico e sem kg informado, não conclui e avisa', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    // aluno NÃO informou a carga
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(false);
    expect(saveSetLog).not.toHaveBeenCalled();
    expect(store().draft!.exercises[0].sets[0].status).not.toBe('done');
    expect(store().saveError).toMatch(/carga/i);
  });

  it('BODYWEIGHT: conclui só com reps e grava carga nula', async () => {
    await start();
    store().activateSet('ex-2', 1);
    store().setReps('ex-2', 1, 15);
    const ok = await store().completeSet('ex-2', 1);

    expect(ok).toBe(true);
    expect(saveSetLog).toHaveBeenCalledWith(
      expect.objectContaining({ plannedSetId: 'st-3', actualReps: 15, actualLoadKg: null, outcome: 'on_target' }),
    );
  });

  it('ERRO do banco ao salvar: série NÃO vira "feita" e o erro aparece', async () => {
    mock(saveSetLog).mockRejectedValue(new Error('RLS negou'));
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);

    expect(ok).toBe(false);
    expect(store().saveError).toMatch(/RLS negou/);
    const s1 = store().draft!.exercises[0].sets[0];
    expect(s1.status).not.toBe('done');
    expect(s1.setLogId).toBeNull();
  });

  it('F2: duas conclusões CONCORRENTES da mesma série gravam UMA vez só', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const [r1, r2] = await Promise.all([
      store().completeSet('ex-1', 1),
      store().completeSet('ex-1', 1),
    ]);
    expect(saveSetLog).toHaveBeenCalledTimes(1);
    expect([r1, r2]).toContain(true);
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
  });

  it('idempotente: concluir uma série JÁ feita não regrava', async () => {
    await start();
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    await store().completeSet('ex-1', 1);
    mock(saveSetLog).mockClear();
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true);
    expect(saveSetLog).not.toHaveBeenCalled();
  });

  it('F3: insert confirmado + falha ao PERSISTIR o rascunho → série FICA feita (não re-tenta)', async () => {
    await start();
    // a falha de persistência é SÓ na gravação da série (não no start)
    mock(saveDraft).mockRejectedValueOnce(new Error('disco cheio'));
    store().activateSet('ex-1', 1);
    store().setReps('ex-1', 1, 8);
    store().setLoad('ex-1', 1, 40);
    const ok = await store().completeSet('ex-1', 1);
    expect(ok).toBe(true); // sucesso do servidor não é revertido por falha local
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(store().saveError).toBeNull();
  });
});

describe('setRir', () => {
  it('F12: clampa 0–10 no núcleo do store', async () => {
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    store().activateSet('ex-1', 1);
    store().setRir('ex-1', 1, 11);
    expect(store().draft!.exercises[0].sets[0].actualRir).toBe(10);
    store().setRir('ex-1', 1, -3);
    expect(store().draft!.exercises[0].sets[0].actualRir).toBe(0);
  });
});

describe('retomar sessão (fechar no meio e reabrir)', () => {
  it('rascunho local com série feita é retomado como está — sem novo session_log', async () => {
    // Simula um rascunho salvo no aparelho com a 1ª série já concluída.
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-existente';
    draft.exercises[0].sets[0] = {
      ...draft.exercises[0].sets[0],
      status: 'done', outcome: 'on_target', actualReps: 8, actualLoadKg: 40, setLogId: 'set-1',
    };
    mock(loadDraft).mockResolvedValue(draft);
    // reconcilia com o servidor: o MESMO log continua aberto → adota o local
    mock(getOpenSessionLog).mockResolvedValue({ sessionLogId: 'sl-existente', startedAt: 'T0', setLogs: [] });

    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

    expect(store().status).toBe('active');
    expect(store().draft?.sessionLogId).toBe('sl-existente');
    // a série feita sobreviveu
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(store().draft!.exercises[0].sets[0].actualLoadKg).toBe(40);
    // NÃO criou um novo log; reconciliou com o servidor antes de adotar (F1)
    expect(startSessionLog).not.toHaveBeenCalled();
    expect(getOpenSessionLog).toHaveBeenCalled();
  });

  it('F1: rascunho local ativo mas sessão JÁ FINALIZADA no servidor → não retoma (não grava em log fechado)', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-antigo';
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockResolvedValue(null); // finalizada em outro aparelho

    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

    expect(store().status).toBe('finished');
    expect(clearDraft).toHaveBeenCalledWith('user-1');
    expect(startSessionLog).not.toHaveBeenCalled();
  });

  it('F1: servidor indisponível na reconciliação → retomada OFFLINE com o local', async () => {
    const draft = buildDraftFromDetail(makeDetail(), 'user-1');
    draft.sessionLogId = 'sl-offline';
    draft.exercises[0].sets[0] = { ...draft.exercises[0].sets[0], status: 'done', actualReps: 8, actualLoadKg: 40 };
    mock(loadDraft).mockResolvedValue(draft);
    mock(getOpenSessionLog).mockRejectedValue(new Error('sem rede'));

    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

    expect(store().status).toBe('active');
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
  });

  it('sem rascunho local, reconstrói do servidor sem duplicar o session_log', async () => {
    mock(loadDraft).mockResolvedValue(null);
    mock(getOpenSessionLog).mockResolvedValue({
      sessionLogId: 'sl-servidor',
      startedAt: 'T0',
      setLogs: [
        { id: 'set-1', planned_set_id: 'st-1', actual_reps: 8, actual_load_kg: 40, actual_rir: 2, outcome: 'on_target' },
      ],
    });

    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });

    expect(store().draft?.sessionLogId).toBe('sl-servidor');
    expect(store().draft!.exercises[0].sets[0].status).toBe('done');
    expect(startSessionLog).not.toHaveBeenCalled();
  });
});

describe('concluir a sessão', () => {
  it('fecha o log e limpa o rascunho local', async () => {
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    const ok = await store().finishSession();

    expect(ok).toBe(true);
    expect(finishSessionLog).toHaveBeenCalled();
    expect(clearDraft).toHaveBeenCalledWith('user-1');
    expect(store().status).toBe('finished');
  });

  it('erro ao fechar não engole: mantém erro e não conclui', async () => {
    mock(finishSessionLog).mockRejectedValue(new Error('timeout'));
    await store().startOrResume({ sessionId: 'sess-1', userId: 'user-1', detail: makeDetail() });
    const ok = await store().finishSession();

    expect(ok).toBe(false);
    expect(store().saveError).toMatch(/timeout/);
    expect(store().status).not.toBe('finished');
  });
});
