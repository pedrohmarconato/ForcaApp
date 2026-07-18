// __tests__/loadDraftCoercion.test.ts
// Fase 4.2 (F8) — coerção na fronteira de LEITURA do rascunho persistido.
// Um rascunho gravado por versão ANTIGA do app (ou vindo de numeric-string do
// PostgREST antes da coerção) pode ter "40" em vez de 40. Ao RETOMAR OFFLINE esse
// rascunho local cru, "40" + incremento vira "402.5" no stepper (concatenação de
// string) ou NaN. loadDraft tem de COAGIR todo campo numérico ao carregar, sem
// confiar em quem gravou.

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) =>
    mockStore.has(k) ? mockStore.get(k)! : null,
  ),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

import {
  clearDraft,
  loadDraft,
  saveDraft,
} from '../src/services/sessionDraftStorage';
import { stepLoad } from '../src/engine/sessionModel';

// Rascunho LEGADO: numéricos gravados como STRING — exatamente o que contamina o stepper.
const legacyDraftJson = JSON.stringify({
  version: 1,
  plannedSessionId: 'sess-1',
  sessionLogId: 'sl-1',
  userId: 'user-1',
  title: 'Push A',
  weekNumber: '1',
  startedAt: 'T0',
  status: 'active',
  lastLoadByExercise: {},
  exercises: [
    {
      exerciseId: 'ex-1',
      name: 'Supino Reto',
      order: '1',
      equipment: 'Barra',
      isBodyweight: false,
      loadIncrementKg: '2.5',
      restSeconds: '90',
      priority: 'primary',
      targetRmPercent: '75',
      repsRaw: '8-10',
      sets: [
        {
          plannedSetId: 'st-1',
          setOrder: '1',
          targetRepsMin: '8',
          targetRepsMax: '10',
          targetLoadKg: null,
          targetRir: '2',
          actualReps: '8',
          actualLoadKg: '40',
          actualRir: '2',
          status: 'done',
          outcome: 'on_target',
          setLogId: 'setlog-1',
        },
      ],
    },
  ],
});

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

it('F8: loadDraft coage "40"/"2.5" para número → stepper dá 42.5 (não "402.5"/NaN)', async () => {
  mockStore.set('@active_session_draft_user-1', legacyDraftJson);

  const draft = await loadDraft('user-1', 'sess-1');
  expect(draft).not.toBeNull();

  const s1 = draft!.exercises[0].sets[0];
  const inc = draft!.exercises[0].loadIncrementKg;

  // Coeridos para NÚMERO, não string.
  expect(s1.actualLoadKg).toBe(40);
  expect(typeof s1.actualLoadKg).toBe('number');
  expect(inc).toBe(2.5);
  expect(typeof inc).toBe('number');

  // E o stepper opera como número: 40 + 2.5 = 42.5 (não "402.5" nem NaN).
  const passo = stepLoad(s1.actualLoadKg, inc, 1);
  expect(passo).toBe(42.5);
  expect(Number.isNaN(passo)).toBe(false);
});

it('F8: coage lastLoadByExercise legado { supino: "40" } → número (stepper não produz 402.5)', async () => {
  const legacyComMapa = JSON.parse(legacyDraftJson);
  legacyComMapa.lastLoadByExercise = { supino: '40', agachamento: 'abc' };
  mockStore.set('@active_session_draft_user-1', JSON.stringify(legacyComMapa));

  const draft = await loadDraft('user-1', 'sess-1');
  expect(draft).not.toBeNull();

  // String numérica legada vira NÚMERO; valor não-numérico é descartado do mapa.
  expect(draft!.lastLoadByExercise.supino).toBe(40);
  expect(typeof draft!.lastLoadByExercise.supino).toBe('number');
  expect('agachamento' in draft!.lastLoadByExercise).toBe(false);

  // A sugestão alimenta o stepper como número: 40 + 2.5 = 42.5 (não "402.5").
  expect(stepLoad(draft!.lastLoadByExercise.supino, 2.5, 1)).toBe(42.5);
});

it('descarta rascunho de versão desconhecida (não contamina com formato incompatível)', async () => {
  mockStore.set(
    '@active_session_draft_user-1',
    JSON.stringify({ version: 99, plannedSessionId: 'x' }),
  );
  expect(await loadDraft('user-1', 'sess-1')).toBeNull();
});

it('isola rascunhos por sessão e clearDraft não apaga outra sessão/execução', async () => {
  const draftA = JSON.parse(legacyDraftJson);
  const draftB = {
    ...draftA,
    plannedSessionId: 'sess-2',
    sessionLogId: 'sl-2',
  };
  await saveDraft(draftA);
  await saveDraft(draftB);

  await clearDraft('user-1', 'sess-1', 'sl-1');
  expect(await loadDraft('user-1', 'sess-1')).toBeNull();
  expect((await loadDraft('user-1', 'sess-2'))?.sessionLogId).toBe('sl-2');

  // CAS de storage: uma limpeza atrasada da execução antiga não remove a nova.
  const replacement = { ...draftA, sessionLogId: 'sl-new' };
  await saveDraft(replacement);
  await clearDraft('user-1', 'sess-1', 'sl-1');
  expect((await loadDraft('user-1', 'sess-1'))?.sessionLogId).toBe('sl-new');
});
