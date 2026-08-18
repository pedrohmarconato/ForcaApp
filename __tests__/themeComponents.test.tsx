import React from 'react';
import {
  ActivityIndicator,
  Animated,
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
import type {
  DraftExercise,
  DraftSet,
  SessionDraft,
} from '../src/engine/sessionModel';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
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
