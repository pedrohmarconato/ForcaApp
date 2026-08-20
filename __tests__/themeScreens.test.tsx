import React from 'react';
import { readFileSync } from 'fs';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ThemeProvider } from '../src/theme/ThemeProvider';

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = { workoutIndex: 0 };
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  createNavigationContainerRef: () => ({
    isReady: jest.fn(() => false),
    navigate: jest.fn(),
  }),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    canGoBack: () => true,
    popToTop: jest.fn(),
  }),
  useRoute: () => ({ params: mockRouteParams }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const ReactLib = require('react');
    ReactLib.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View: SafeView } = require('react-native');
  return { SafeAreaView: SafeView };
});
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

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

let mockAuthState: any = {};
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

// ThemeProvider não chama mais useAuth() internamente (fix da coesão
// tema/auth) — quem instancia <ThemeProvider> direto precisa repassar
// userId/profile por prop, lidos do mesmo mockAuthState.
const authThemeProps = () => ({
  userId: mockAuthState?.user?.id ?? null,
  profile: mockAuthState?.profile ?? null,
});

jest.mock('../src/services/neonPreferenceRepository', () => ({
  neonPreferenceRepository: { saveNeonColor: jest.fn() },
}));
jest.mock('../src/services/jointInvitePending', () => ({
  consumirConvitePendente: jest.fn(async () => null),
}));
jest.mock('../src/hooks/useSessionOutboxDrain', () => ({
  useSessionOutboxDrain: jest.fn(),
}));
jest.mock('../src/navigation/AuthNavigator', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/navigation/MainNavigator', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../src/navigation/OnboardingNavigator', () => ({
  __esModule: true,
  default: () => null,
}));

const mockGetTodaySession = jest.fn();
const mockGetUpcomingSessions = jest.fn();
const mockGetCompletedSessions = jest.fn();
const mockGetSetLogsResumo = jest.fn();
const mockGetSessionDetail = jest.fn();
const mockGetSessionLogDetail = jest.fn();

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: (...args: unknown[]) => mockGetTodaySession(...args),
  getUpcomingSessions: (...args: unknown[]) => mockGetUpcomingSessions(...args),
  getSessionDetail: (...args: unknown[]) => mockGetSessionDetail(...args),
  getActivePlanId: jest.fn(async () => null),
  hasSessionInProgress: jest.fn(async () => false),
  formatExerciseTarget: jest.fn(() => '3 series'),
  fecharSessoesDeSemanasVencidas: jest.fn(async () => ({ fechadas: 0 })),
}));
jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: (...args: unknown[]) => mockGetCompletedSessions(...args),
  getSetLogsResumo: (...args: unknown[]) => mockGetSetLogsResumo(...args),
  getSessionLogDetail: (...args: unknown[]) => mockGetSessionLogDetail(...args),
  skipPlannedSession: jest.fn(),
  unskipPlannedSession: jest.fn(),
}));
jest.mock('../src/hooks/useDiaLocal', () => ({
  useDiaLocal: () => '2026-08-18',
}));
jest.mock('../src/utils/pushBadge', () => ({ updateTrainingBadge: jest.fn() }));
jest.mock('../src/config/featureFlags', () => ({
  isJointTrainingEnabled: () => false,
}));
jest.mock('../src/services/cardioGoalRepository', () => ({
  getCardioLogs: jest.fn(async () => []),
}));
jest.mock('../src/services/cardioPrescritoRepository', () => ({
  getPrescricaoSemanaCorrente: jest.fn(async () => null),
}));
jest.mock('../src/components/progress/CardioPrescritoSection', () => () => null);
jest.mock('../src/components/progress/CardioEvolucaoChart', () => () => null);
jest.mock('../src/services/planEditRepository', () => ({
  isPlanoDesatualizado: () => false,
  reordenarExercicios: jest.fn(),
}));
jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(() => new Promise(() => undefined)),
}));
const mockActiveReset = jest.fn();
const mockActiveStartOrResume = jest.fn();
const mockActiveComputeReplan = jest.fn();
const mockActiveSessionState: Record<string, unknown> = {
  draft: null,
  pendingCheckIn: null,
  status: 'idle',
  saveError: null,
  reset: mockActiveReset,
  startOrResume: mockActiveStartOrResume,
  computeReplan: mockActiveComputeReplan,
  confirmCheckIn: jest.fn(),
  finishSession: jest.fn(),
  clearError: jest.fn(),
  lastAutoDecision: null,
  pendingAdaptation: null,
  resolveAdaptation: jest.fn(),
  pendingReplan: null,
  replanBusy: false,
  requestTimeCut: jest.fn(),
  confirmReplan: jest.fn(),
  confirmReagendamento: jest.fn(),
  declineReplan: jest.fn(),
  declineReagendamento: jest.fn(),
  storageWarning: null,
  clearStorageWarning: jest.fn(),
  replanWarning: null,
  clearReplanWarning: jest.fn(),
  pendingCount: 0,
  quarantineCount: 0,
  skipExercise: jest.fn(),
  skipWholeSession: jest.fn(),
  activateSet: jest.fn(),
  unskipExercise: jest.fn(),
  swapExercise: jest.fn(),
};
jest.mock('../src/store/activeSessionStore', () => {
  const useActiveSessionStore = (selector: (state: typeof mockActiveSessionState) => unknown) =>
    selector(mockActiveSessionState);
  useActiveSessionStore.getState = () => mockActiveSessionState;
  return { useActiveSessionStore, suggestionFor: jest.fn() };
});

jest.mock('../src/utils/installDetection', () => ({
  isIOS: jest.fn(),
  isSafari: jest.fn(),
  isStandalone: jest.fn(),
}));

const mockManualPlanState = {
  catalog: [] as unknown[],
  catalogError: null as string | null,
  incluirCardio: true,
  incluirAlongamento: true,
  addExercise: jest.fn(),
  updateExercise: jest.fn(),
  userId: 'user-1',
  status: 'idle',
  saveError: null as string | null,
  previewData: null as any,
  draftOrigin: 'empty',
  sourcePlanId: null as string | null,
  progressionUnavailable: false,
  progressionChanges: [] as string[],
  initEmpty: jest.fn(),
  initFromQuestionnaire: jest.fn(),
  initFromPlan: jest.fn(),
  setPlanName: jest.fn(),
  setDurationWeeks: jest.fn(),
  setProgression: jest.fn(),
  disableProgression: jest.fn(),
  removeWorkout: jest.fn(),
  preview: jest.fn(),
  save: jest.fn(),
  draft: {
    nome: 'Plano atual',
    duracao_semanas: 4,
    treinos: [] as any[],
    progressao: {
      deload: null,
      series: null,
      cardio: null,
      intensidade: null,
    },
  },
};
jest.mock('../src/store/manualPlanStore', () => ({
  useManualPlanStore: (selector: (state: typeof mockManualPlanState) => unknown) =>
    selector(mockManualPlanState),
}));
jest.mock('../src/services/exerciseCatalogService', () => ({
  resolveExerciseName: jest.fn(async () => null),
  searchCatalog: (_query: string, catalog: unknown[]) => catalog,
}));

const mockSecureGetItem = jest.fn();
const mockChatStorageGetItem = jest.fn();
jest.mock('../src/services/auth/secureStorage', () => ({
  getItem: (...args: unknown[]) => mockSecureGetItem(...args),
  setItem: jest.fn(async () => undefined),
  removeLegacyPlaintextCopy: jest.fn(async () => undefined),
  supabaseSecureStorage: {
    getItem: (...args: unknown[]) => mockChatStorageGetItem(...args),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
jest.mock('../src/services/auth/sessionProbe', () => ({
  probeSessionValidity: jest.fn(async () => 'valid'),
}));
jest.mock('../src/services/api/questionnaireService', () => ({
  saveQuestionnaireDataAPI: jest.fn(),
}));
jest.mock('../src/services/postQuestionnaireChatStorage', () => ({
  STORAGE_KEY_CHAT_PREFIX: '@post_questionnaire_chat_',
  STORAGE_KEY_CHAT_STATE_PREFIX: '@post_questionnaire_chat_state_',
  resetPostQuestionnaireChatState: jest.fn(),
}));

const mockTestClaudeApiConnection = jest.fn();
jest.mock('../src/services/api/claudeService', () => ({
  callClaudeApi: jest.fn(),
  testClaudeApiConnection: (...args: unknown[]) => mockTestClaudeApiConnection(...args),
}));
jest.mock('../src/services/api/trainingPlanService', () => ({
  consolidateChat: jest.fn(),
  startPlanJob: jest.fn(),
  waitForPlanJob: jest.fn(),
}));
jest.mock('../src/services/planRecovery', () => ({
  recuperarPlanoSalvo: jest.fn(),
  RECUPERACAO_TENTATIVAS: 1,
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('../src/services/cardioModalidadesAceitasRepository', () => ({
  getModalidadesAceitas: jest.fn(async () => []),
}));

import RootNavigator from '../src/navigation/RootNavigator';
import HomeScreen from '../src/screens/HomeScreen';
import ProgressScreen from '../src/screens/ProgressScreen';
import SessionHistoryScreen from '../src/screens/SessionHistoryScreen';
import SessionHistoryDetailScreen from '../src/screens/SessionHistoryDetailScreen';
import WorkoutDetailScreen from '../src/screens/WorkoutDetailScreen';
import InstallScreen from '../src/screens/InstallScreen';
import ExercisePickerScreen from '../src/screens/ExercisePickerScreen';
import * as installDetection from '../src/utils/installDetection';
import QuestionnaireScreen from '../src/screens/QuestionnaireScreen';
import PostQuestionnaireChat from '../src/screens/PostQuestionnaireChat';
import ManualPlanEditorScreen from '../src/screens/ManualPlanEditorScreen';
import ActiveSessionScreen from '../src/screens/ActiveSessionScreen';

const mockIsIOS = installDetection.isIOS as jest.Mock;
const mockIsSafari = installDetection.isSafari as jest.Mock;
const mockIsStandalone = installDetection.isStandalone as jest.Mock;

const readSource = (path: string) =>
  readFileSync(require.resolve(`../${path}`), 'utf8');

const renderWithTheme = (child: React.ReactElement) =>
  render(<ThemeProvider {...authThemeProps()}>{child}</ThemeProvider>);

const expectHookFactory = (path: string) => {
  const source = readSource(path);
  expect(source).not.toMatch(/import theme from ['"]\.\.\/theme\/theme['"]/);
  expect(source).toContain('useTheme');
  expect(source).toContain('useThemeStyles');
  expect(source).toMatch(/const createStyles\s*=\s*\(theme/);
  expect(source).toContain('useThemeStyles(createStyles)');
};

const hasBackground = (screen: ReturnType<typeof render>, color: string) =>
  screen.UNSAFE_getAllByType(View).some(
    (node) => StyleSheet.flatten(node.props.style)?.backgroundColor === color,
  );

const ancestorHasStyle = (
  node: ReturnType<ReturnType<typeof render>['getByText']>,
  property: string,
  value: string,
) => {
  let current: typeof node | null = node;
  while (current) {
    if (StyleSheet.flatten(current.props.style)?.[property] === value) return true;
    current = current.parent as typeof node | null;
  }
  return false;
};

const loggedIn = (neonColor: string, profileOverrides: Record<string, unknown> = {}) => ({
  user: { id: 'user-1' },
  session: { user: { id: 'user-1' } },
  profile: {
    id: 'user-1',
    full_name: 'Pedro',
    onboarding_completed: true,
    neon_color: neonColor,
    ...profileOverrides,
  },
  loadingSession: false,
  loadingProfile: false,
  errorProfile: null,
});

describe('raiz-home-progresso-historico', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = loggedIn('yellow');
    mockGetTodaySession.mockResolvedValue({
      id: 'session-1',
      title: 'Push A',
      session_type: 'Hipertrofia',
      week_number: 1,
      estimated_minutes: 50,
      scheduled_date: '2026-08-18',
      status: 'pending',
      muscle_groups: ['Peito'],
    });
    mockGetUpcomingSessions.mockResolvedValue([]);
    mockGetCompletedSessions.mockResolvedValue([
      {
        sessionLogId: 'log-1',
        plannedSessionId: 'session-0',
        title: 'Pull A',
        weekNumber: 1,
        muscleGroups: ['Costas'],
        startedAt: '2026-08-18T09:00:00Z',
        finishedAt: '2026-08-18T10:00:00Z',
      },
    ]);
    mockGetSetLogsResumo.mockResolvedValue([
      {
        identity: 'k:supino',
        name: 'Supino',
        loadKg: 40,
        reps: 8,
        completedAt: '2026-08-18T10:00:00Z',
        origemJoint: false,
      },
    ]);
  });

  it.each([
    'src/navigation/RootNavigator.js',
    'src/screens/HomeScreen.tsx',
    'src/screens/ProgressScreen.tsx',
    'src/screens/SessionHistoryScreen.tsx',
  ])('%s deriva estilos do tema corrente', (path) => {
    expectHookFactory(path);
  });

  it('RootNavigator usa yellow antes do profile correspondente e blue depois', async () => {
    mockAuthState = {
      ...loggedIn('yellow'),
      profile: null,
      loadingProfile: true,
    };
    const screen = renderWithTheme(<RootNavigator />);

    await waitFor(() =>
      expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#EBFF00'),
    );

    mockAuthState = { ...loggedIn('blue'), loadingProfile: true };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <RootNavigator />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#00E5FF'),
    );
  });

  it('Home troca os acentos sem remontar nem recarregar o plano', async () => {
    const screen = renderWithTheme(<HomeScreen />);
    await waitFor(() => expect(screen.getByTestId('icon-clock').props.style.color).toBe('#EBFF00'));
    expect(mockGetTodaySession).toHaveBeenCalledTimes(1);

    mockAuthState = loggedIn('green');
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <HomeScreen />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('icon-clock').props.style.color).toBe('#39FF14'));
    expect(mockGetTodaySession).toHaveBeenCalledTimes(1);
  });

  it('Progress troca dots/barras para green na mesma arvore', async () => {
    const screen = renderWithTheme(<ProgressScreen />);
    await waitFor(() => expect(hasBackground(screen, '#EBFF00')).toBe(true));

    mockAuthState = loggedIn('green');
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ProgressScreen />
      </ThemeProvider>,
    );

    await waitFor(() => expect(hasBackground(screen, '#39FF14')).toBe(true));
  });

  it('SessionHistory usa o acento corrente sem confundir loading com vazio', async () => {
    mockAuthState = loggedIn('red');
    mockGetCompletedSessions.mockImplementationOnce(() => new Promise(() => undefined));
    const screen = renderWithTheme(<SessionHistoryScreen />);

    expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#FF3131');
    expect(screen.queryByText(/nenhum treino concluido/i)).toBeNull();
  });
});

describe('detalhes-install-picker', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = loggedIn('red');
    mockIsStandalone.mockReturnValue(false);
    mockIsIOS.mockReturnValue(true);
    mockIsSafari.mockReturnValue(true);
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockManualPlanState.catalog = [];
    mockManualPlanState.catalogError = null;
    mockRouteParams = { workoutIndex: 0 };
  });

  afterAll(() => {
    if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
  });

  it.each([
    'src/screens/SessionHistoryDetailScreen.tsx',
    'src/screens/WorkoutDetailScreen.tsx',
    'src/screens/InstallScreen.tsx',
    'src/screens/ExercisePickerScreen.tsx',
  ])('%s deriva estilos do tema corrente', (path) => {
    expectHookFactory(path);
  });

  it('os loaders dos dois detalhes acompanham red', () => {
    mockGetSessionLogDetail.mockImplementationOnce(() => new Promise(() => undefined));
    const history = renderWithTheme(
      <SessionHistoryDetailScreen route={{ params: { sessionLogId: 'log-1' } }} />,
    );
    expect(history.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#FF3131');
    history.unmount();

    mockGetSessionDetail.mockImplementationOnce(() => new Promise(() => undefined));
    const workout = renderWithTheme(
      <WorkoutDetailScreen route={{ params: { sessionId: 'session-1' } }} />,
    );
    expect(workout.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#FF3131');
  });

  it('InstallScreen troca foco e texto de blue para green no caminho de instalacao', async () => {
    mockAuthState = loggedIn('blue');
    const screen = renderWithTheme(<InstallScreen homeRoute="Home" />);
    expect(screen.getByText('1').props.style.color).toBe('#00E5FF');
    expect(ancestorHasStyle(screen.getByText('1'), 'borderColor', 'rgba(0, 229, 255, 0.45)')).toBe(true);

    mockAuthState = loggedIn('green');
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <InstallScreen homeRoute="Home" />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('1').props.style.color).toBe('#39FF14'));
  });

  it('ExercisePicker troca a borda do nome livre sem perder a busca', async () => {
    mockAuthState = loggedIn('blue');
    const screen = renderWithTheme(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText(/Buscar ou escrever exerc/i), 'Rosca livre');
    const freeName = screen.getByText('Usar “Rosca livre”');
    expect(ancestorHasStyle(freeName, 'borderColor', 'rgba(0, 229, 255, 0.45)')).toBe(true);

    mockAuthState = loggedIn('green');
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ExercisePickerScreen />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(
        ancestorHasStyle(
          screen.getByText('Usar “Rosca livre”'),
          'borderColor',
          'rgba(57, 255, 20, 0.45)',
        ),
      ).toBe(true),
    );
  });

  it('mantem outcomes funcionais fora do acento', () => {
    const source = readSource('src/screens/SessionHistoryDetailScreen.tsx');
    expect(source).toContain('theme.colors.status.success');
    expect(source).toContain('theme.colors.status.warning');
    expect(source).toContain('theme.colors.status.info');
  });
});

describe('questionario-chat-editor-sessao', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = {};
    mockSecureGetItem.mockResolvedValue(null);
    mockChatStorageGetItem.mockResolvedValue(null);
    mockTestClaudeApiConnection.mockResolvedValue(true);
    mockActiveSessionState.status = 'idle';
    mockActiveSessionState.draft = null;
    mockManualPlanState.userId = 'user-1';
    mockManualPlanState.status = 'idle';
    mockManualPlanState.saveError = null;
    mockManualPlanState.draftOrigin = 'empty';
    mockManualPlanState.sourcePlanId = null;
    mockManualPlanState.previewData = null;
    mockManualPlanState.draft = {
      nome: 'Plano atual',
      duracao_semanas: 4,
      treinos: [],
      progressao: {
        deload: null,
        series: null,
        cardio: null,
        intensidade: null,
      },
    };
  });

  it.each([
    'src/screens/QuestionnaireScreen.tsx',
    'src/screens/PostQuestionnaireChat.tsx',
    'src/screens/ManualPlanEditorScreen.tsx',
    'src/screens/ActiveSessionScreen.tsx',
  ])('%s deriva estilos do tema corrente', (path) => {
    expectHookFactory(path);
  });

  it('Questionnaire troca selectionColor sem perder a resposta digitada', async () => {
    mockAuthState = {
      ...loggedIn('blue'),
      session: { user: { id: 'user-1' }, access_token: 'token' },
      updateProfile: jest.fn(),
      signOut: jest.fn(),
    };
    const screen = renderWithTheme(<QuestionnaireScreen />);
    await waitFor(() => expect(screen.getByText('Como podemos te chamar?')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Pedro');
    fireEvent.press(screen.getByText('Continuar'));
    const day = await screen.findByLabelText('Dia de nascimento');
    fireEvent.changeText(day, '18');
    expect(day.props.selectionColor).toBe('#00E5FF');

    mockAuthState = {
      ...mockAuthState,
      profile: { ...mockAuthState.profile, neon_color: 'green' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <QuestionnaireScreen />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Dia de nascimento').props.selectionColor).toBe('#39FF14'),
    );
    expect(screen.getByLabelText('Dia de nascimento').props.value).toBe('18');
  });

  it('Chat troca bolha e selectionColor sem perder mensagens ou input', async () => {
    mockAuthState = {
      ...loggedIn('blue'),
      user: {
        id: 'user-1',
        onboarding_completed: false,
        user_metadata: { full_name: 'Pedro' },
      },
      updateProfile: jest.fn(),
    };
    mockChatStorageGetItem.mockImplementation(async (key: string) => {
      if (key === '@questionnaire_data_user-1') {
        return JSON.stringify({ objetivo: 'muscle_gain', dias_treino: ['mon'] });
      }
      if (key === '@post_questionnaire_chat_user-1') {
        return JSON.stringify({
          messages: [{ role: 'user', parts: [{ text: 'Prefiro treinos curtos' }] }],
          interactionsCount: 1,
          isChatEnded: false,
          adjustments: ['Prefiro treinos curtos'],
        });
      }
      return null;
    });

    const screen = renderWithTheme(<PostQuestionnaireChat />);
    const message = await screen.findByText('Prefiro treinos curtos');
    expect(ancestorHasStyle(message, 'backgroundColor', '#00E5FF')).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Mensagem para o assistente'), 'Novo ajuste');

    mockAuthState = {
      ...mockAuthState,
      profile: { ...mockAuthState.profile, neon_color: 'green' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <PostQuestionnaireChat />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(
        ancestorHasStyle(screen.getByText('Prefiro treinos curtos'), 'backgroundColor', '#39FF14'),
      ).toBe(true),
    );
    const input = screen.getByLabelText('Mensagem para o assistente');
    expect(input.props.value).toBe('Novo ajuste');
    expect(input.props.selectionColor).toBe('#39FF14');
  });

  it('Editor troca o destaque sem perder a confirmacao local', async () => {
    mockRouteParams = { fromPlanId: 'plan-1' };
    mockAuthState = {
      ...loggedIn('blue'),
      updateProfile: jest.fn(),
    };
    mockManualPlanState.draftOrigin = 'existing';
    mockManualPlanState.sourcePlanId = 'plan-1';
    mockManualPlanState.previewData = {
      semanas: [{ semana: 1, treinos: [] }],
    };
    const screen = renderWithTheme(<ManualPlanEditorScreen />);
    expect(screen.getByText('Semana 1').props.style.color).toBe('#00E5FF');

    const confirmation = screen.getByLabelText('Entendi e quero criar o novo plano');
    fireEvent.press(confirmation);
    expect(screen.getByLabelText('Entendi e quero criar o novo plano').props.accessibilityState).toEqual({
      checked: true,
    });

    mockAuthState = {
      ...mockAuthState,
      profile: { ...mockAuthState.profile, neon_color: 'green' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ManualPlanEditorScreen />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByText('Semana 1').props.style.color).toBe('#39FF14'));
    expect(screen.getByLabelText('Entendi e quero criar o novo plano').props.accessibilityState).toEqual({
      checked: true,
    });
  });

  it('ActiveSession troca o loader sem reiniciar a carga ou o store', async () => {
    mockAuthState = loggedIn('blue');
    mockGetSessionDetail.mockImplementationOnce(() => new Promise(() => undefined));
    const screen = renderWithTheme(
      <ActiveSessionScreen route={{ params: { sessionId: 'session-1' } }} />,
    );
    expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#00E5FF');

    mockAuthState = {
      ...mockAuthState,
      profile: { ...mockAuthState.profile, neon_color: 'red' },
    };
    screen.rerender(
      <ThemeProvider {...authThemeProps()}>
        <ActiveSessionScreen route={{ params: { sessionId: 'session-1' } }} />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.UNSAFE_getByType(ActivityIndicator).props.color).toBe('#FF3131'),
    );
    expect(mockGetSessionDetail).toHaveBeenCalledTimes(1);
    expect(mockActiveReset).toHaveBeenCalledTimes(1);
  });

  it('mantem danger funcional separado quando red e o acento', () => {
    expect(readSource('src/screens/ManualPlanEditorScreen.tsx')).toContain(
      'theme.colors.status.danger',
    );
    expect(readSource('src/screens/ActiveSessionScreen.tsx')).toContain('tone="danger"');
  });
});
