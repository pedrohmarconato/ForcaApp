// __tests__/sessionPlayerCleanup.test.tsx
// Sprint 1.1 — cancelar timers e animações no unmount:
//  - clearInterval do cronômetro de descanso;
//  - stopAnimation de cada Animated.Value que iniciou animação;
//  - nenhuma atualização de estado após o desmonte (sem timers pendentes).

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
jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', neon_color: 'yellow' },
  }),
}));

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import React from 'react';
import { Animated } from 'react-native';
import { saveSetLog } from '../src/services/sessionExecutionRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import SessionPlayer from '../src/components/session/SessionPlayer';
import type {
  SessionDraft,
  DraftExercise,
  DraftSet,
} from '../src/engine/sessionModel';
import { ThemeProvider } from '../src/theme/ThemeProvider';

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
});

const draftCom = (): SessionDraft => ({
  version: 1,
  plannedSessionId: 'sess-1',
  sessionLogId: 'sl-1',
  userId: 'user-1',
  title: 'Push A',
  weekNumber: 1,
  startedAt: '2026-07-20T10:00:00Z',
  status: 'active',
  restEndsAt: null,
  exercises: [
    exercicio('ex-1', 'Supino', [
      serie('st-1', 1, { status: 'active', actualReps: 8, actualLoadKg: 40 }),
      serie('st-2', 2),
    ]),
  ],
  lastLoadByExercise: { 'k:supino': 40 },
  lastRepsByExercise: {},
  declinedReplanFingerprints: [],
});

const PlayerComStore = () => {
  const draft = useActiveSessionStore((s) => s.draft);
  if (!draft) return null;
  return (
    <ThemeProvider>
      <SessionPlayer draft={draft} suggestedLoadFor={() => 40} suggestedRepsFor={() => 8} />
    </ThemeProvider>
  );
};

describe('cleanup de timers e animações no unmount', () => {
  it('desmontar com descanso ativo limpa o intervalo e para as animações', async () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const stopAnimationSpy = jest.spyOn(
      Animated.Value.prototype,
      'stopAnimation',
    );

    useActiveSessionStore.setState({ draft: draftCom(), status: 'active' });
    mock(saveSetLog).mockResolvedValue({
      setLogId: 'log-set',
      actualReps: 8,
      actualLoadKg: 40,
      actualRir: null,
      outcome: 'on_target',
    });

    const screen = render(<PlayerComStore />);
    fireEvent.press(screen.getByText('Concluir série'));
    // Descanso ativo: intervalo do cronômetro rodando.
    await waitFor(() => expect(screen.getByText('DESCANSO')).toBeTruthy());
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    screen.unmount();

    // O intervalo do descanso foi limpo no unmount.
    expect(clearIntervalSpy).toHaveBeenCalled();
    // Cada animação iniciada recebeu stopAnimation.
    expect(stopAnimationSpy.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Avançar o tempo após o desmonte não dispara nada (sem handles pendentes).
    await act(async () => {
      jest.advanceTimersByTime(100000);
    });
    clearIntervalSpy.mockRestore();
    stopAnimationSpy.mockRestore();
    jest.useRealTimers();
  });
});
