import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  processColor,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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

jest.mock('../src/services/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn(() => Promise.resolve()) },
  ENDPOINTS: {
    PUSH: { NOTIFY_REPLAN: '/push/notify-replan-applied' },
  },
}));

const mockEnqueueAndDrain = jest.fn();
jest.mock('../src/services/sessionOutboxDrain', () => ({
  enqueueAndDrain: (...args: unknown[]) => mockEnqueueAndDrain(...args),
}));

jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));

jest.mock('../src/utils/haptics', () => ({
  notifySuccess: jest.fn(),
  tapLight: jest.fn(),
}));

let mockAuthState: {
  user: { id: string };
  profile: { id: string; neon_color: string };
} = {
  user: { id: 'theme-components-user' },
  profile: { id: 'theme-components-user', neon_color: 'yellow' },
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text: IconText } = require('react-native');

  return {
    Feather: ({ name, color }: { name: string; color: string }) =>
      ReactLib.createElement(
        IconText,
        { testID: `icon-${name}`, style: { color } },
        name,
      ),
  };
});

import SessionPlayer from '../src/components/session/SessionPlayer';
import SessionQueue from '../src/components/session/SessionQueue';
import SessionSummary from '../src/components/session/SessionSummary';
import AdaptationSheet from '../src/components/session/AdaptationSheet';
import CheckInSheet from '../src/components/session/CheckInSheet';
import ReplanBanner from '../src/components/session/ReplanBanner';
import AlertHost from '../src/components/AlertHost';
import UpdateBanner from '../src/components/UpdateBanner';
import type { Recommendation } from '../src/engine/intraSessionAdaptation';
import type {
  DraftExercise,
  DraftSet,
  SessionDraft,
} from '../src/engine/sessionModel';
import type {
  ReplanSession,
  WeeklyReplanProposal,
} from '../src/engine/weeklyReplanner';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import { useAlertStore } from '../src/store/alertStore';
import { useUpdateStore } from '../src/store/updateStore';
import Button from '../src/components/ui/Button';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { createTheme } from '../src/theme/theme';

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
  restEndsAt: null,
  exercises,
  lastLoadByExercise: { 'k:supino': 40 },
  declinedReplanFingerprints: [],
});

const setThemeColor = (neonColor: string) => {
  mockAuthState = {
    user: { id: 'theme-components-user' },
    profile: { id: 'theme-components-user', neon_color: neonColor },
  };
};

const renderThemed = (element: React.ReactElement, neonColor: string) => {
  setThemeColor(neonColor);
  const result = render(<ThemeProvider>{element}</ThemeProvider>);

  return {
    ...result,
    rerenderWithTheme: (nextElement: React.ReactElement, nextColor: string) => {
      setThemeColor(nextColor);
      result.rerender(<ThemeProvider>{nextElement}</ThemeProvider>);
    },
  };
};

const styleValue = (node: any, property: string) =>
  StyleSheet.flatten(node.props.style)?.[property];

const ancestorStyleValue = (node: any, property: string) => {
  let current = node;
  while (current) {
    const value = styleValue(current, property);
    if (value !== undefined) return value;
    current = current.parent;
  }
  throw new Error(`Estilo ${property} não encontrado na árvore ancestral`);
};

const collectProp = (tree: any, property: string, values: unknown[] = []) => {
  if (!tree || typeof tree !== 'object') return values;
  if (tree.props && tree.props[property] !== undefined) {
    values.push(tree.props[property]);
  }
  if (Array.isArray(tree)) {
    tree.forEach((child) => collectProp(child, property, values));
  } else if (tree.children) {
    tree.children.forEach((child: any) => collectProp(child, property, values));
  }
  return values;
};

const hasProcessedColor = (values: unknown[], color: unknown) =>
  values.some(
    (value) =>
      value === color ||
      (value &&
        typeof value === 'object' &&
        'payload' in value &&
        (value as { payload?: unknown }).payload === color),
  );

const PlayerWithStore = () => {
  const draft = useActiveSessionStore((state) => state.draft);
  if (!draft) return null;
  return <SessionPlayer draft={draft} suggestedLoadFor={() => 40} />;
};

const playerTree = () => (
  <ThemeProvider>
    <PlayerWithStore />
  </ThemeProvider>
);

describe('player-fila-resumo', () => {
  let timingSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    setThemeColor('yellow');
    mockEnqueueAndDrain.mockResolvedValue({
      pendingCount: 0,
      quarantineCount: 0,
    });
    timingSpy = jest
      .spyOn(Animated, 'timing')
      .mockImplementation((value: any, config: any) => {
        value.setValue(config.toValue);
        return {
          start: jest.fn(),
          stop: jest.fn(),
          reset: jest.fn(),
        } as any;
      });
    useActiveSessionStore.getState().reset();
  });

  afterEach(() => {
    timingSpy.mockRestore();
  });

  it('troca player para blue sem remount e preserva spinner, chips, CTA, draft e serie ativa', async () => {
    let resolvePendingSave!: (value: unknown) => void;
    const pendingSave = new Promise<unknown>((resolve) => {
      resolvePendingSave = resolve;
    });
    mockEnqueueAndDrain.mockReturnValueOnce(pendingSave);
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [
        serie('set-active', 1, {
          status: 'active',
          actualReps: 8,
          actualLoadKg: 40,
          actualRir: 2,
        }),
      ]),
    ]);
    useActiveSessionStore.setState({ draft, status: 'active' });

    const screen = render(playerTree());
    const activeSetId =
      useActiveSessionStore.getState().draft?.exercises[0].sets[0].plannedSetId;
    const exerciseName = screen.getByText('Supino');
    const touchables = screen.UNSAFE_getAllByType(TouchableOpacity);
    const completeButton = touchables[touchables.length - 1];
    const yellowTheme = createTheme('yellow');
    const blueTheme = createTheme('blue');

    expect(styleValue(completeButton, 'backgroundColor')).toBe(
      yellowTheme.colors.accent.main,
    );
    expect(
      styleValue(
        screen.getByLabelText('Ainda aguentaria 2'),
        'backgroundColor',
      ),
    ).toBe(yellowTheme.colors.accent.soft);

    fireEvent.press(screen.getByText('Concluir série'));
    await waitFor(() =>
      expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy(),
    );
    expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(
      yellowTheme.colors.accent.on,
    );
    const draftAtThemeChange = useActiveSessionStore.getState().draft!;
    const exerciseAtThemeChange = draftAtThemeChange.exercises[0];
    const setAtThemeChange = exerciseAtThemeChange.sets[0];

    setThemeColor('blue');
    screen.rerender(playerTree());
    await waitFor(() =>
      expect(
        styleValue(
          screen.UNSAFE_getAllByType(TouchableOpacity)[
            screen.UNSAFE_getAllByType(TouchableOpacity).length - 1
          ],
          'backgroundColor',
        ),
      ).toBe(blueTheme.colors.accent.main),
    );

    expect(
      styleValue(
        screen.getByLabelText('Ainda aguentaria 2'),
        'backgroundColor',
      ),
    ).toBe(blueTheme.colors.accent.soft);
    expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe(
      blueTheme.colors.accent.on,
    );
    expect(
      screen.UNSAFE_getAllByType(TouchableOpacity)[
        screen.UNSAFE_getAllByType(TouchableOpacity).length - 1
      ],
    ).toBe(completeButton);
    expect(screen.getByText('Supino')).toBe(exerciseName);
    expect(useActiveSessionStore.getState().draft).toBe(draftAtThemeChange);
    expect(useActiveSessionStore.getState().draft?.exercises[0]).toBe(
      exerciseAtThemeChange,
    );
    expect(useActiveSessionStore.getState().draft?.exercises[0].sets[0]).toBe(
      setAtThemeChange,
    );
    expect(
      useActiveSessionStore.getState().draft?.exercises[0].sets[0].plannedSetId,
    ).toBe(activeSetId);

    await act(async () => {
      resolvePendingSave({ pendingCount: 0, quarantineCount: 0 });
      await pendingSave;
    });
  });

  it('troca o stroke do descanso para blue sem remontar nem alterar o draft', async () => {
    const draft = {
      ...draftCom([
        exercicio('ex-1', 'Supino', [
          serie('set-done', 1, {
            status: 'done',
            actualReps: 8,
            actualLoadKg: 40,
          }),
          serie('set-next', 2),
        ]),
      ]),
      restEndsAt: new Date(Date.now() + 90_000).toISOString(),
    };
    useActiveSessionStore.setState({ draft, status: 'active' });

    const screen = renderThemed(<PlayerWithStore />, 'yellow');
    const doneText = screen.getByText('Série registrada');
    const yellowTheme = createTheme('yellow');
    const blueTheme = createTheme('blue');

    expect(
      hasProcessedColor(
        collectProp(screen.toJSON(), 'stroke'),
        processColor(yellowTheme.colors.accent.main),
      ),
    ).toBe(true);

    screen.rerenderWithTheme(<PlayerWithStore />, 'blue');
    await waitFor(() =>
      expect(
        hasProcessedColor(
          collectProp(screen.toJSON(), 'stroke'),
          processColor(blueTheme.colors.accent.main),
        ),
      ).toBe(true),
    );

    expect(screen.getByText('Série registrada')).toBe(doneText);
    expect(useActiveSessionStore.getState().draft).toBe(draft);
    expect(
      useActiveSessionStore.getState().draft?.exercises[0].sets[1].plannedSetId,
    ).toBe('set-next');
  });

  it('troca row, mark e label ativos da fila para green sem mudar ordem ou seleção', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [
        serie('set-done', 1, {
          status: 'done',
          actualReps: 8,
          actualLoadKg: 40,
        }),
        serie('set-active', 2, { status: 'active' }),
      ]),
      exercicio('ex-2', 'Remada', [serie('set-pending', 1)]),
    ]);
    const screen = renderThemed(
      <SessionQueue draft={draft} metaFor={() => null} />,
      'yellow',
    );
    const yellowTheme = createTheme('yellow');
    const greenTheme = createTheme('green');
    const firstOrder = screen.getByText('01');
    const secondOrder = screen.getByText('02');
    const activeRow = screen.getByText('agora, no card acima').parent;

    expect(
      ancestorStyleValue(
        screen.getByText('agora, no card acima'),
        'backgroundColor',
      ),
    ).toBe(yellowTheme.colors.accent.soft);
    expect(styleValue(screen.getByText('→'), 'color')).toBe(
      yellowTheme.colors.text.accent,
    );
    expect(styleValue(screen.getByText('S2'), 'color')).toBe(
      yellowTheme.colors.text.accent,
    );

    screen.rerenderWithTheme(
      <SessionQueue draft={draft} metaFor={() => null} />,
      'green',
    );
    await waitFor(() =>
      expect(
        ancestorStyleValue(
          screen.getByText('agora, no card acima'),
          'backgroundColor',
        ),
      ).toBe(greenTheme.colors.accent.soft),
    );

    expect(styleValue(screen.getByText('→'), 'color')).toBe(
      greenTheme.colors.text.accent,
    );
    expect(styleValue(screen.getByText('S2'), 'color')).toBe(
      greenTheme.colors.text.accent,
    );
    expect(screen.getByText('01')).toBe(firstOrder);
    expect(screen.getByText('02')).toBe(secondOrder);
    expect(screen.getByText('agora, no card acima').parent).toBe(activeRow);
    expect(screen.getByText('Supino')).toBeTruthy();
    expect(screen.getByText('Remada')).toBeTruthy();
    const textValues = (tree: any, values: string[] = []): string[] => {
      if (typeof tree === 'string') {
        values.push(tree);
      } else if (Array.isArray(tree)) {
        tree.forEach((child) => textValues(child, values));
      } else if (tree?.children) {
        tree.children.forEach((child: any) => textValues(child, values));
      }
      return values;
    };
    expect(
      textValues(screen.toJSON()).filter((value) =>
        ['Supino', 'Remada'].includes(value),
      ),
    ).toEqual(['Supino', 'Remada']);
  });

  it('troca o texto accent do resumo para red sem perder os dados exibidos', async () => {
    const resumo = {
      series: { done: 3, total: 4 },
      volumeKg: 640,
      duracaoMin: 42,
    };
    const screen = renderThemed(
      <SessionSummary
        titulo="Push A"
        resumo={resumo}
        coachNote="Carga bem distribuída."
        onVoltar={jest.fn()}
      />,
      'yellow',
    );
    const accentText = screen.getByText('Sessão concluída');
    const title = screen.getByText('Push A');
    const yellowTheme = createTheme('yellow');
    const redTheme = createTheme('red');

    expect(styleValue(accentText, 'color')).toBe(
      yellowTheme.colors.text.accent,
    );
    expect(screen.getByText('/4')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('640')).toBeTruthy();
    expect(screen.getByText('min')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText('Treinador: ')).toBeTruthy();

    screen.rerenderWithTheme(
      <SessionSummary
        titulo="Push A"
        resumo={resumo}
        coachNote="Carga bem distribuída."
        onVoltar={jest.fn()}
      />,
      'red',
    );
    await waitFor(() =>
      expect(styleValue(screen.getByText('Sessão concluída'), 'color')).toBe(
        redTheme.colors.text.accent,
      ),
    );

    expect(screen.getByText('Push A')).toBe(title);
    expect(screen.getByText('/4')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('640')).toBeTruthy();
    expect(screen.getByText('min')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect(screen.getByText('Treinador: ')).toBeTruthy();
  });

  it('usa accent.on no texto do CTA sobre o preenchimento neon', () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [
        serie('set-active', 1, {
          status: 'active',
          actualReps: 8,
          actualLoadKg: 40,
        }),
      ]),
    ]);
    useActiveSessionStore.setState({ draft, status: 'active' });

    const screen = render(playerTree());
    expect(styleValue(screen.getByText('Concluir série'), 'color')).toBe(
      createTheme('yellow').colors.accent.on,
    );

    setThemeColor('blue');
    screen.rerender(playerTree());
    expect(styleValue(screen.getByText('Concluir série'), 'color')).toBe(
      createTheme('blue').colors.accent.on,
    );
  });
});

describe('sheets-replan', () => {
  const recommendation: Recommendation = {
    outcome: 'under',
    deviationReps: 3,
    tier: 'grande',
    recommended: {
      kind: 'load',
      direction: 'decrease',
      fromKg: 50,
      toKg: 45,
      deltaKg: -5,
      pct: 0.12,
      label: 'Reduzir para 45 kg',
      reason: 'Você ficou abaixo da faixa-alvo.',
    },
    options: [
      {
        kind: 'load',
        direction: 'decrease',
        fromKg: 50,
        toKg: 45,
        deltaKg: -5,
        pct: 0.12,
        label: 'Reduzir para 45 kg',
        reason: 'Você ficou abaixo da faixa-alvo.',
      },
      { kind: 'keep', label: 'Manter a carga', reason: 'Recusar o ajuste.' },
    ],
  };

  const replanSession = (
    id: string,
    title: string,
    scheduledDate: string | null,
    exerciseCount: number,
    setsPerExercise: number,
  ): ReplanSession => ({
    id,
    weekNumber: 1,
    title,
    sessionType: null,
    scheduledDate,
    status: 'pending',
    estimatedMinutes: 60,
    exercises: Array.from({ length: exerciseCount }, (_, exerciseIndex) => ({
      id: `${id}-ex-${exerciseIndex}`,
      name: `Exercício ${exerciseIndex}`,
      muscleGroup: 'Peito',
      priority: exerciseIndex === exerciseCount - 1 ? 'accessory' : 'primary',
      exerciseOrder: exerciseIndex,
      sets: Array.from({ length: setsPerExercise }, (_, setIndex) => ({
        id: `${id}-set-${exerciseIndex}-${setIndex}`,
        setOrder: setIndex + 1,
      })),
    })),
  });

  const sessions: ReplanSession[] = [
    replanSession('hoje', 'Treino B', '2026-07-15', 4, 3),
  ];

  const proposal: WeeklyReplanProposal = {
    adherence: {
      sessionsDue: 2,
      sessionsCompleted: 1,
      sessionRate: 0.5,
      setsDue: 8,
      setsCompleted: 4,
      volumeRate: 0.5,
    },
    timeCut: {
      kind: 'time_cut',
      sessionId: 'hoje',
      availableMinutes: 40,
      estimatedMinutes: 60,
      ratio: 40 / 60,
      keptPriorities: ['primary', 'secondary'],
      cutExercises: [
        {
          exerciseId: 'hoje-ex-3',
          name: 'Tríceps Corda',
          priority: 'accessory',
          muscleGroup: 'Tríceps',
          setsCut: 3,
        },
      ],
    },
    hasChanges: true,
  };

  const callbacks = () => ({
    onChoose: jest.fn(),
    onDismiss: jest.fn(),
    onConfirm: jest.fn(),
    onConfirmReagendamento: jest.fn(),
    onDecline: jest.fn(),
    onDeclineReagendamento: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setThemeColor('yellow');
  });

  it('troca selected soft, border e text da AdaptationSheet sem tocar nos callbacks', async () => {
    const { onChoose, onDismiss } = callbacks();
    const screen = renderThemed(
      <AdaptationSheet
        recommendation={recommendation}
        exerciseName="Supino"
        onChoose={onChoose}
        onDismiss={onDismiss}
      />,
      'yellow',
    );
    const selectedOption = screen.getByTestId('adaptation-option-0');
    const selectedLabel = screen.getByText('Reduzir para 45 kg');
    const yellowTheme = createTheme('yellow');
    const blueTheme = createTheme('blue');

    expect(styleValue(selectedOption, 'backgroundColor')).toBe(
      yellowTheme.colors.accent.soft,
    );
    expect(styleValue(selectedOption, 'borderColor')).toBe(
      yellowTheme.colors.accent.border,
    );
    expect(styleValue(selectedLabel, 'color')).toBe(yellowTheme.colors.text.accent);

    screen.rerenderWithTheme(
      <AdaptationSheet
        recommendation={recommendation}
        exerciseName="Supino"
        onChoose={onChoose}
        onDismiss={onDismiss}
      />,
      'blue',
    );
    await waitFor(() =>
      expect(styleValue(screen.getByTestId('adaptation-option-0'), 'backgroundColor')).toBe(
        blueTheme.colors.accent.soft,
      ),
    );

    expect(screen.getByTestId('adaptation-option-0')).toBe(selectedOption);
    expect(styleValue(screen.getByTestId('adaptation-option-0'), 'borderColor')).toBe(
      blueTheme.colors.accent.border,
    );
    expect(styleValue(screen.getByText('Reduzir para 45 kg'), 'color')).toBe(
      blueTheme.colors.text.accent,
    );

    screen.rerenderWithTheme(
      <AdaptationSheet
        recommendation={null}
        exerciseName="Supino"
        onChoose={onChoose}
        onDismiss={onDismiss}
      />,
      'blue',
    );
    expect(screen.queryByText('Reduzir para 45 kg')).toBeNull();

    screen.rerenderWithTheme(
      <AdaptationSheet
        recommendation={recommendation}
        exerciseName="Supino"
        onChoose={onChoose}
        onDismiss={onDismiss}
      />,
      'blue',
    );
    expect(screen.getByTestId('adaptation-option-0')).toBeTruthy();
    expect(onChoose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('troca selected soft, border e text da CheckInSheet sem perder selecao ao esconder e reabrir', async () => {
    const { onConfirm } = callbacks();
    const screen = renderThemed(
      <CheckInSheet visible sessionTitle="Push A" onConfirm={onConfirm} />,
      'yellow',
    );
    const mood = screen.getByLabelText('Normal');
    const time = screen.getByLabelText('45 minutos');
    const yellowTheme = createTheme('yellow');
    const greenTheme = createTheme('green');

    fireEvent.press(mood);
    fireEvent.press(time);

    expect(styleValue(mood, 'backgroundColor')).toBe(yellowTheme.colors.accent.soft);
    expect(styleValue(mood, 'borderColor')).toBe(yellowTheme.colors.accent.border);
    expect(styleValue(screen.getByText('Normal'), 'color')).toBe(
      yellowTheme.colors.text.accent,
    );
    expect(styleValue(time, 'backgroundColor')).toBe(yellowTheme.colors.accent.soft);
    expect(styleValue(time, 'borderColor')).toBe(yellowTheme.colors.accent.border);
    expect(styleValue(screen.getByText('45 min'), 'color')).toBe(
      yellowTheme.colors.text.accent,
    );

    screen.rerenderWithTheme(
      <CheckInSheet visible sessionTitle="Push A" onConfirm={onConfirm} />,
      'green',
    );
    await waitFor(() =>
      expect(styleValue(screen.getByLabelText('Normal'), 'backgroundColor')).toBe(
        greenTheme.colors.accent.soft,
      ),
    );

    expect(screen.getByLabelText('Normal').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('45 minutos').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(styleValue(screen.getByText('Normal'), 'color')).toBe(
      greenTheme.colors.text.accent,
    );
    expect(styleValue(screen.getByText('45 min'), 'color')).toBe(
      greenTheme.colors.text.accent,
    );

    screen.rerenderWithTheme(
      <CheckInSheet visible={false} sessionTitle="Push A" onConfirm={onConfirm} />,
      'green',
    );
    expect(screen.toJSON()).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    screen.rerenderWithTheme(
      <CheckInSheet visible sessionTitle="Push A" onConfirm={onConfirm} />,
      'green',
    );
    expect(screen.getByLabelText('Normal').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByLabelText('45 minutos').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('troca icone, chip e CTA do ReplanBanner sem disparar callbacks nem perder busy', async () => {
    const { onConfirm, onConfirmReagendamento, onDecline, onDeclineReagendamento } =
      callbacks();
    const screen = renderThemed(
      <ReplanBanner
        proposal={proposal}
        reagendamento={null}
        sessions={sessions}
        busy={false}
        onConfirm={onConfirm}
        onConfirmReagendamento={onConfirmReagendamento}
        onDecline={onDecline}
        onDeclineReagendamento={onDeclineReagendamento}
      />,
      'yellow',
    );
    const yellowTheme = createTheme('yellow');
    const redTheme = createTheme('red');

    expect(styleValue(screen.getByTestId('icon-clock'), 'color')).toBe(
      yellowTheme.colors.accent.main,
    );
    expect(styleValue(screen.getByText('−3'), 'backgroundColor')).toBe(
      yellowTheme.colors.accent.soft,
    );
    expect(styleValue(screen.getByText('−3'), 'color')).toBe(
      yellowTheme.colors.text.accent,
    );
    expect(styleValue(screen.getByTestId('replan-confirm'), 'backgroundColor')).toBe(
      yellowTheme.colors.accent.main,
    );
    expect(styleValue(screen.getByText('Aplicar mudanças'), 'color')).toBe(
      yellowTheme.colors.accent.on,
    );

    screen.rerenderWithTheme(
      <ReplanBanner
        proposal={proposal}
        reagendamento={null}
        sessions={sessions}
        busy
        onConfirm={onConfirm}
        onConfirmReagendamento={onConfirmReagendamento}
        onDecline={onDecline}
        onDeclineReagendamento={onDeclineReagendamento}
      />,
      'red',
    );
    await waitFor(() =>
      expect(styleValue(screen.getByTestId('icon-clock'), 'color')).toBe(
        redTheme.colors.accent.main,
      ),
    );

    expect(styleValue(screen.getByText('−3'), 'backgroundColor')).toBe(
      redTheme.colors.accent.soft,
    );
    expect(styleValue(screen.getByText('−3'), 'color')).toBe(
      redTheme.colors.text.accent,
    );
    expect(screen.getByText('Aplicando...')).toBeTruthy();
    expect(screen.getByTestId('replan-confirm').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onConfirmReagendamento).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onDeclineReagendamento).not.toHaveBeenCalled();
  });

  it('troca o ramo de reagendamento sem alterar warning nem callbacks', async () => {
    const { onConfirm, onConfirmReagendamento, onDecline, onDeclineReagendamento } =
      callbacks();
    const reagendamento = {
      movidas: [{ id: 'hoje', de: '2026-07-15', para: '2026-07-17' }],
      semEncaixe: ['seg'],
    };
    const screen = renderThemed(
      <ReplanBanner
        proposal={proposal}
        reagendamento={reagendamento}
        sessions={sessions}
        busy={false}
        onConfirm={onConfirm}
        onConfirmReagendamento={onConfirmReagendamento}
        onDecline={onDecline}
        onDeclineReagendamento={onDeclineReagendamento}
      />,
      'yellow',
    );
    const yellowTheme = createTheme('yellow');
    const redTheme = createTheme('red');

    expect(screen.getByText('Treino B')).toBeTruthy();
    expect(styleValue(screen.getByTestId('icon-calendar'), 'color')).toBe(
      yellowTheme.colors.accent.main,
    );
    expect(styleValue(screen.getByTestId('replan-confirm-reagendamento'), 'backgroundColor')).toBe(
      yellowTheme.colors.accent.main,
    );
    expect(styleValue(screen.getByTestId('icon-alert-triangle'), 'color')).toBe(
      yellowTheme.colors.status.warning,
    );

    screen.rerenderWithTheme(
      <ReplanBanner
        proposal={proposal}
        reagendamento={reagendamento}
        sessions={sessions}
        busy
        onConfirm={onConfirm}
        onConfirmReagendamento={onConfirmReagendamento}
        onDecline={onDecline}
        onDeclineReagendamento={onDeclineReagendamento}
      />,
      'red',
    );
    await waitFor(() =>
      expect(styleValue(screen.getByTestId('icon-calendar'), 'color')).toBe(
        redTheme.colors.accent.main,
      ),
    );

    expect(screen.getByText('Reencaixando...')).toBeTruthy();
    expect(screen.getByTestId('replan-confirm-reagendamento').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(styleValue(screen.getByTestId('icon-alert-triangle'), 'color')).toBe(
      redTheme.colors.status.warning,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onConfirmReagendamento).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onDeclineReagendamento).not.toHaveBeenCalled();
  });

  it('mantem warning e danger funcionais byte a byte iguais quando o neon vira red', async () => {
    const { onConfirm, onConfirmReagendamento, onDecline, onDeclineReagendamento } =
      callbacks();
    const noChanges = { ...proposal, timeCut: null, hasChanges: false };
    const screen = renderThemed(
      <>
        <ReplanBanner
          proposal={noChanges}
          reagendamento={{ movidas: [], semEncaixe: ['hoje'] }}
          sessions={sessions}
          busy={false}
          onConfirm={onConfirm}
          onConfirmReagendamento={onConfirmReagendamento}
          onDecline={onDecline}
          onDeclineReagendamento={onDeclineReagendamento}
        />
        <Button
          label="Excluir treino"
          variant="danger"
          onPress={jest.fn()}
          testID="danger-button"
        />
      </>,
      'yellow',
    );
    const yellowTheme = createTheme('yellow');
    const redTheme = createTheme('red');
    const yellowWarning = styleValue(
      screen.getByTestId('icon-alert-triangle'),
      'color',
    );

    expect(yellowWarning).toBe(yellowTheme.colors.status.warning);
    const yellowDanger = styleValue(screen.getByText('Excluir treino'), 'color');
    expect(yellowDanger).toBe(yellowTheme.colors.status.danger);

    screen.rerenderWithTheme(
      <>
        <ReplanBanner
          proposal={noChanges}
          reagendamento={{ movidas: [], semEncaixe: ['hoje'] }}
          sessions={sessions}
          busy={false}
          onConfirm={onConfirm}
          onConfirmReagendamento={onConfirmReagendamento}
          onDecline={onDecline}
          onDeclineReagendamento={onDeclineReagendamento}
        />
        <Button
          label="Excluir treino"
          variant="danger"
          onPress={jest.fn()}
          testID="danger-button"
        />
      </>,
      'red',
    );
    await waitFor(() =>
      expect(styleValue(screen.getByTestId('icon-alert-triangle'), 'color')).toBe(
        redTheme.colors.status.warning,
      ),
    );

    expect(styleValue(screen.getByTestId('icon-alert-triangle'), 'color')).toBe(
      yellowWarning,
    );
    expect(styleValue(screen.getByText('Excluir treino'), 'color')).toBe(
      redTheme.colors.status.danger,
    );
    expect(styleValue(screen.getByText('Excluir treino'), 'color')).toBe(
      yellowDanger,
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onConfirmReagendamento).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onDeclineReagendamento).not.toHaveBeenCalled();
  });
});

type TestWindow = {
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  dispatchEvent: jest.Mock;
};

const createTestWindow = (): TestWindow => {
  const listeners = new Map<string, Set<(event: { type: string }) => void>>();
  const testWindow: TestWindow = {
    addEventListener: jest.fn((type: string, listener: (event: { type: string }) => void) => {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    }),
    removeEventListener: jest.fn(
      (type: string, listener: (event: { type: string }) => void) => {
        listeners.get(type)?.delete(listener);
      },
    ),
    dispatchEvent: jest.fn((event: { type: string }) => {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    }),
  };
  return testWindow;
};

describe('hosts-globais', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const customEventDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');
  let testWindow: TestWindow;

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    if (!customEventDescriptor) {
      Object.defineProperty(globalThis, 'CustomEvent', {
        configurable: true,
        value: class TestCustomEvent {
          type: string;

          constructor(type: string) {
            this.type = type;
          }
        },
      });
    }
  });

  afterAll(() => {
    if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    if (windowDescriptor) {
      Object.defineProperty(globalThis, 'window', windowDescriptor);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
    if (!customEventDescriptor) {
      delete (globalThis as { CustomEvent?: unknown }).CustomEvent;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setThemeColor('yellow');
    useAlertStore.setState({ current: null });
    useUpdateStore.setState({ waiting: false, dismissed: false });
    testWindow = createTestWindow();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: testWindow,
    });
  });

  it('AlertHost troca label accent sem alterar fila, prioridade, copy, acao ou callbacks', async () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const onDelete = jest.fn();
    const alert = {
      title: 'Concluir treino?',
      message: 'Ainda ha series nao registradas.',
      buttons: [
        { text: 'Continuar treino', style: 'cancel' as const, onPress: onCancel },
        { text: 'Concluir', onPress: onConfirm },
        { text: 'Excluir', style: 'destructive' as const, onPress: onDelete },
      ],
    };
    useAlertStore.getState().show(alert);

    const screen = renderThemed(<AlertHost />, 'yellow');
    const yellowTheme = createTheme('yellow');
    const blueTheme = createTheme('blue');
    const confirmButton = screen.getByTestId('alert-host-button-1');
    const confirmLabel = screen.getByText('Concluir');

    expect(styleValue(confirmLabel, 'color')).toBe(yellowTheme.colors.text.accent);
    expect(styleValue(screen.getByText('Excluir'), 'color')).toBe(
      yellowTheme.colors.status.danger,
    );
    expect(useAlertStore.getState().current).toBe(alert);
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Continuar treino' })).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Concluir' })).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Excluir' })).not.toHaveLength(0);

    screen.rerenderWithTheme(<AlertHost />, 'blue');
    await waitFor(() =>
      expect(styleValue(screen.getByText('Concluir'), 'color')).toBe(
        blueTheme.colors.text.accent,
      ),
    );

    expect(styleValue(screen.getByText('Excluir'), 'color')).toBe(
      blueTheme.colors.status.danger,
    );
    expect(screen.getByTestId('alert-host-button-1')).toBe(confirmButton);
    expect(screen.getByText('Concluir')).toBe(confirmLabel);
    expect(screen.getByText('Continuar treino')).toBeTruthy();
    expect(screen.getByText('Excluir')).toBeTruthy();
    expect(screen.getByText('Ainda ha series nao registradas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Concluir' })).not.toHaveLength(0);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Concluir'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useAlertStore.getState().current).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('UpdateBanner troca label primary/accent apos waiting e rerender sem duplicar listener nem mudar actions', async () => {
    useUpdateStore.getState().setWaiting(true);
    const screen = renderThemed(<UpdateBanner />, 'yellow');
    const yellowTheme = createTheme('yellow');
    const greenTheme = createTheme('green');
    const updateButton = screen.getByText('Atualizar');
    const dismissButton = screen.getByText('Depois');

    expect(styleValue(updateButton, 'color')).toBe(yellowTheme.colors.text.accent);
    expect(testWindow.addEventListener).toHaveBeenCalledTimes(1);
    expect(testWindow.addEventListener.mock.calls[0][0]).toBe('sw-update-available');

    screen.rerenderWithTheme(<UpdateBanner />, 'green');
    await waitFor(() =>
      expect(styleValue(screen.getByText('Atualizar'), 'color')).toBe(
        greenTheme.colors.text.accent,
      ),
    );

    expect(screen.getByText('Atualizar')).toBe(updateButton);
    expect(screen.getByText('Depois')).toBe(dismissButton);
    expect(testWindow.addEventListener).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Depois' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Depois' }));
    expect(screen.queryByText('Nova versão disponível')).toBeNull();
    act(() => {
      testWindow.dispatchEvent({ type: 'sw-update-available' });
    });
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
    expect(testWindow.addEventListener).toHaveBeenCalledTimes(1);

    testWindow.dispatchEvent.mockClear();
    fireEvent.press(screen.getByText('Atualizar'));
    expect(testWindow.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(testWindow.dispatchEvent.mock.calls[0][0].type).toBe('sw-apply-update');

    fireEvent.press(screen.getByText('Depois'));
    expect(useUpdateStore.getState().waiting).toBe(false);
    expect(useUpdateStore.getState().dismissed).toBe(true);

    screen.unmount();
    expect(testWindow.removeEventListener).toHaveBeenCalledTimes(1);
    expect(testWindow.removeEventListener.mock.calls[0][0]).toBe(
      'sw-update-available',
    );
  });
});
