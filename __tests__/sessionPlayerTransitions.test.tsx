// __tests__/sessionPlayerTransitions.test.tsx
// Transições do player com o componente MONTADO e timers controlados (sem
// sleep real): completar série → descanso → próximo card; pular descanso;
// fronteira entre exercícios. O próximo card deve estar montado e VISÍVEL em
// cada transição — nenhum frame com opacidade zero (card escuro).

jest.mock('../src/services/sessionExecutionRepository', () => {
  class SessionExecutionRequestError extends Error {
    kind: 'transport' | 'server';
    code: string | null;
    constructor(error: any, options: { kind?: 'transport' | 'server' } = {}) {
      super(error?.message ?? String(error));
      this.kind = options.kind ?? 'server';
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
    isTransportSessionExecutionError: () => false,
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

import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import { saveSetLog } from '../src/services/sessionExecutionRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import SessionPlayer from '../src/components/session/SessionPlayer';
import type { SessionDraft, DraftExercise, DraftSet } from '../src/engine/sessionModel';

const mock = <T,>(fn: T) => fn as unknown as jest.Mock;

const serie = (
  plannedSetId: string,
  setOrder: number,
  over: Partial<DraftSet> = {},
): DraftSet => ({
  plannedSetId,
  setOrder,
  targetRepsMin: 8,
  targetRepsMax: 10,
  targetLoadKg: null,
  targetRir: 2,
  actualReps: null,
  actualLoadKg: null,
  actualRir: null,
  status: 'pending',
  outcome: null,
  setLogId: null,
  adaptation: null,
  ...over,
});

const exercicio = (
  exerciseId: string,
  name: string,
  sets: DraftSet[],
  over: Partial<DraftExercise> = {},
): DraftExercise => ({
  exerciseId,
  name,
  order: 1,
  exerciseKey: null,
  metric: 'carga_reps',
  equipment: 'Barra',
  isBodyweight: false,
  hasInjury: false,
  loadIncrementKg: 2.5,
  restSeconds: 90,
  priority: 'primary',
  targetRmPercent: null,
  repsRaw: '8-10',
  sets,
  ...over,
});

const draftCom = (exercises: DraftExercise[]): SessionDraft => ({
  version: 1,
  plannedSessionId: 'sess-1',
  sessionLogId: 'sl-1',
  userId: 'user-1',
  title: 'Push A',
  weekNumber: 1,
  startedAt: '2026-07-20T10:00:00Z',
  status: 'active',
  exercises,
  lastLoadByExercise: { 'k:supino': 40 },
  declinedReplanFingerprints: [],
});

/** Coleta todos os valores de opacity declarados nos estilos da árvore. */
const opacidadesDaArvore = (tree: any): (number | string | null | undefined)[] => {
  const out: (number | string | null | undefined)[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    const style = node.props?.style;
    const list = Array.isArray(style) ? style : style ? [style] : [];
    for (const s of list) {
      if (s && typeof s === 'object' && 'opacity' in s) out.push(s.opacity);
    }
    if (node.props?.style) {
      const nested = node.props.style;
      const flat = Array.isArray(nested) ? nested.flat(3) : [nested];
      for (const s of flat) {
        if (s && typeof s === 'object' && 'opacity' in s) out.push(s.opacity);
      }
    }
    node.children?.forEach(walk);
  };
  walk(tree);
  return out;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  useActiveSessionStore.getState().reset();
  mock(saveSetLog).mockResolvedValue({
    setLogId: 'log-set',
    actualReps: 8,
    actualLoadKg: 40,
    actualRir: null,
    outcome: 'on_target',
    actualDurationSeconds: null,
    actualDistanceM: null,
    perceivedEffort: null,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// O player renderiza o rascunho VIVO do store (o prop é a fotografia passada
// pela tela a cada render). O wrapper assina o store para as mutações do
// completeSet/activateSet refletirem na árvore.
const PlayerComStore = () => {
  const draft = useActiveSessionStore((s) => s.draft);
  if (!draft) return null;
  return <SessionPlayer draft={draft} suggestedLoadFor={() => 40} />;
};

const renderComDraft = (draft: SessionDraft) => {
  useActiveSessionStore.setState({ draft, status: 'active' });
  return render(<PlayerComStore />);
};

// Série ativa JÁ medida (reps + carga preenchidos) para o Concluir passar.
const serieAtiva = (plannedSetId: string, setOrder: number): DraftSet =>
  serie(plannedSetId, setOrder, {
    status: 'active',
    actualReps: 8,
    actualLoadKg: 40,
  });

describe('transições gravação → descanso → próximo card (sem opacity 0)', () => {
  it('completar a série abre o card de DESCANSO montado e visível', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serieAtiva('st-1', 1), serie('st-2', 2)]),
    ]);
    const screen = renderComDraft(draft);

    fireEvent.press(screen.getByText('Concluir série'));
    await waitFor(() => expect(screen.getByText('DESCANSO')).toBeTruthy());

    // Nenhum nó da árvore com opacity 0 (card escuro).
    const opacidades = opacidadesDaArvore(screen.toJSON());
    expect(opacidades.some((o) => o === 0)).toBe(false);
  });

  it('descanso ZERA (timer) → próximo card montado automaticamente', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serieAtiva('st-1', 1), serie('st-2', 2)]),
    ]);
    const screen = renderComDraft(draft);

    fireEvent.press(screen.getByText('Concluir série'));
    await waitFor(() => expect(screen.getByText('DESCANSO')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(91000);
    });

    // Próxima série do MESMO exercício aparece na medição.
    await waitFor(() => expect(screen.getByText(/SÉRIE 2 DE 2/)).toBeTruthy());
    expect(opacidadesDaArvore(screen.toJSON()).some((o) => o === 0)).toBe(false);
  });

  it('Pular descanso → próximo card IMEDIATAMENTE (sem esperar timer)', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serieAtiva('st-1', 1), serie('st-2', 2)]),
    ]);
    const screen = renderComDraft(draft);

    fireEvent.press(screen.getByText('Concluir série'));
    await waitFor(() => expect(screen.getByText('DESCANSO')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Pular descanso'));
    await waitFor(() => expect(screen.getByText(/SÉRIE 2 DE 2/)).toBeTruthy());
    expect(opacidadesDaArvore(screen.toJSON()).some((o) => o === 0)).toBe(false);
  });

  it('fronteira entre EXERCÍCIOS: última série de A → descanso anuncia B → B aparece', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serieAtiva('st-1', 1)]),
      exercicio('ex-2', 'Flexão', [serie('st-2', 1), serie('st-3', 2)], {
        isBodyweight: true,
        equipment: 'Peso corporal',
      }),
    ]);
    const screen = renderComDraft(draft);

    fireEvent.press(screen.getByText('Concluir série'));
    // Última série do Supino: descanso anuncia a troca de exercício.
    await waitFor(() => expect(screen.getByText('Supino concluído')).toBeTruthy());
    expect(screen.getByText(/A SEGUIR/)).toBeTruthy();
    expect(screen.getByText('Flexão')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Pular descanso'));
    // Card do exercício B na medição (bodyweight não tem campo de carga).
    await waitFor(() => expect(screen.getByText('Peso corporal')).toBeTruthy());
    expect(opacidadesDaArvore(screen.toJSON()).some((o) => o === 0)).toBe(false);
  });
});
