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
  saveDraft: jest.fn().mockResolvedValue(undefined),
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

import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import { saveSetLog } from '../src/services/sessionExecutionRepository';
import { useActiveSessionStore } from '../src/store/activeSessionStore';
import SessionPlayer from '../src/components/session/SessionPlayer';
import type {
  SessionDraft,
  DraftExercise,
  DraftSet,
} from '../src/engine/sessionModel';
import theme from '../src/theme/theme';
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
  lastRepsByExercise: {},
  declinedReplanFingerprints: [],
});

/** Coleta todos os valores de opacity declarados nos estilos da árvore. */
const opacidadesDaArvore = (
  tree: any,
): (number | string | null | undefined)[] => {
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
  return (
    <ThemeProvider>
      <SessionPlayer draft={draft} suggestedLoadFor={() => 40} suggestedRepsFor={() => 8} />
    </ThemeProvider>
  );
};

const renderComDraft = (draft: SessionDraft) => {
  useActiveSessionStore.setState({ draft, status: 'active' });
  return render(<PlayerComStore />);
};

// Variante com suggestedLoadFor/suggestedRepsFor configuráveis — os 5 casos
// de D-03/D-04/D-06 (Task 2) precisam controlar a sugestão exibida em vez do
// fixo 40/8 do PlayerComStore acima.
const PlayerComStoreCustom = ({
  suggestedLoadFor = () => 40,
  suggestedRepsFor = () => 8,
}: {
  suggestedLoadFor?: (exercise: DraftExercise, set: DraftSet) => number | null;
  suggestedRepsFor?: (exercise: DraftExercise, set: DraftSet) => number | null;
}) => {
  const draft = useActiveSessionStore((s) => s.draft);
  if (!draft) return null;
  return (
    <SessionPlayer
      draft={draft}
      suggestedLoadFor={suggestedLoadFor}
      suggestedRepsFor={suggestedRepsFor}
    />
  );
};

/** D-03: o nó carrega a cor discreta de `styles.inheritedValue`? */
const temMarcaDeHerdado = (node: any): boolean => {
  const style = node.props?.style;
  const list = Array.isArray(style) ? style.flat(3) : [style];
  return list.some((s: any) => s && s.color === theme.colors.text.quiet);
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

  it('descanso ZERA (timer) → permanece em Pronto até ação explícita', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serieAtiva('st-1', 1), serie('st-2', 2)]),
    ]);
    const screen = renderComDraft(draft);

    fireEvent.press(screen.getByText('Concluir série'));
    await waitFor(() => expect(screen.getByText('DESCANSO')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(91000);
    });

    // D-09/D-10: o tempo expirado não ativa a próxima série sozinho.
    await waitFor(() => expect(screen.getByText('DESCANSO')).toBeTruthy());
    expect(screen.getByLabelText(/Descanso: \+/)).toBeTruthy();
    expect(
      useActiveSessionStore.getState().draft?.exercises[0].sets[1].status,
    ).toBe('pending');

    // Só a ação explícita do dono avança para a medição.
    fireEvent.press(screen.getByLabelText('Pular descanso'));
    await waitFor(() => expect(screen.getByText(/SÉRIE 2 DE 2/)).toBeTruthy());
    expect(opacidadesDaArvore(screen.toJSON()).some((o) => o === 0)).toBe(
      false,
    );
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
    expect(opacidadesDaArvore(screen.toJSON()).some((o) => o === 0)).toBe(
      false,
    );
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
    await waitFor(() =>
      expect(screen.getByText('Supino concluído')).toBeTruthy(),
    );
    expect(screen.getByText(/A SEGUIR/)).toBeTruthy();
    expect(screen.getByText('Flexão')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Pular descanso'));
    // Card do exercício B na medição (bodyweight não tem campo de carga).
    await waitFor(() => expect(screen.getByText('Peso corporal')).toBeTruthy());
    expect(opacidadesDaArvore(screen.toJSON()).some((o) => o === 0)).toBe(
      false,
    );
  });
});

// REQ-01 (Fase 1): distância digitada com vírgula pt-BR já persiste correta
// no player de sessão desde 925ba42. Este teste prova por EXECUÇÃO (não
// leitura estática) que o caminho principal segue correto — decide entre as
// duas hipóteses do RESEARCH.md (player quebrado vs. só o editor manual).
describe('cardio: distância digitada com vírgula (REQ-01)', () => {
  it('"2,4" no campo de distância vira actualDistanceM=2400', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Corrida', [serie('st-1', 1, { status: 'active' })], {
        metric: 'tempo_distancia',
      }),
    ]);
    const screen = renderComDraft(draft);

    fireEvent.changeText(
      screen.getByLabelText('Distância da série 1 em quilômetros'),
      '2,4',
    );

    expect(
      useActiveSessionStore.getState().draft?.exercises[0].sets[0]
        .actualDistanceM,
    ).toBe(2400);
  });
});

// Fase 17 (REG-01): D-03 (marca de herdado), D-04 (teclado só na estreia),
// D-05 (sem TextInput no fluxo padrão), D-06 (revelação direta do card).
describe('Fase 17 (REG-01): steppers sem teclado, marca de herdado, revelação direta', () => {
  it('(a) carga herdada (sem toque): mostra o valor como texto, sem TextInput, com a marca de herdado', () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [
        serie('st-1', 1, { status: 'active', targetLoadKg: 50 }),
      ]),
    ]);
    useActiveSessionStore.setState({ draft, status: 'active' });
    const screen = render(<PlayerComStoreCustom suggestedLoadFor={() => 50} />);

    const valor = screen.getByLabelText('Carga da série 1');
    expect(valor).toHaveTextContent('50 kg');
    // Nunca virou TextInput: elemento estático não tem prop `editable`.
    expect(valor.props.editable).toBeUndefined();
    expect(temMarcaDeHerdado(valor)).toBe(true);
  });

  it('(b) após o primeiro toque em "+", a carga vira firme (perde a marca de herdado)', () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [
        serie('st-1', 1, { status: 'active', targetLoadKg: 50 }),
      ]),
    ]);
    useActiveSessionStore.setState({ draft, status: 'active' });
    const screen = render(<PlayerComStoreCustom suggestedLoadFor={() => 50} />);

    fireEvent.press(screen.getByLabelText('Aumentar carga da série 1'));

    const valor = screen.getByLabelText('Carga da série 1');
    // stepLoad parte da sugestão (50, via targetLoadKg) + loadIncrementKg (2.5).
    expect(valor).toHaveTextContent('52,5 kg');
    expect(temMarcaDeHerdado(valor)).toBe(false);
    expect(
      useActiveSessionStore.getState().draft?.exercises[0].sets[0].actualLoadKg,
    ).toBe(52.5);
  });

  it('(c) sem histórico e sem alvo: carga continua TextInput editável com autoFocus (D-04)', () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serie('st-1', 1, { status: 'active' })]),
    ]);
    useActiveSessionStore.setState({
      draft: { ...draft, lastLoadByExercise: {} },
      status: 'active',
    });
    const screen = render(<PlayerComStoreCustom suggestedLoadFor={() => null} />);

    expect(screen.getByText(/informe a carga usada/i)).toBeTruthy();
    const campo = screen.getByLabelText('Carga da série 1');
    expect(campo.props.editable).toBe(true);
    expect(campo.props.autoFocus).toBe(true);
  });

  it('(d) série "next" com pré-preenchimento válido revela o card de medição direto, sem "Iniciar série" (D-06)', async () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [
        serie('st-1', 1, { targetRepsMin: 8, targetLoadKg: 50 }),
      ]),
    ]);
    useActiveSessionStore.setState({
      draft: { ...draft, lastLoadByExercise: {}, lastRepsByExercise: {} },
      status: 'active',
    });
    const screen = render(<PlayerComStoreCustom suggestedLoadFor={() => 50} />);

    expect(screen.queryByText('Iniciar série')).toBeNull();
    expect(screen.getByLabelText('Repetições da série 1')).toHaveTextContent('8');
    expect(screen.getByLabelText('Carga da série 1')).toHaveTextContent('50 kg');
    // completeSet funciona sobre a série pending sem passar por activateSet.
    fireEvent.press(screen.getByText('Concluir série'));
    await waitFor(() =>
      expect(
        useActiveSessionStore.getState().draft?.exercises[0].sets[0].status,
      ).not.toBe('pending'),
    );
  });

  it('(e) série "next" sem pré-preenchimento válido continua exigindo "Iniciar série" (sem regressão)', () => {
    const draft = draftCom([
      exercicio('ex-1', 'Supino', [serie('st-1', 1, { targetRepsMin: 8 })]),
    ]);
    useActiveSessionStore.setState({
      draft: { ...draft, lastLoadByExercise: {} },
      status: 'active',
    });
    const screen = render(<PlayerComStoreCustom suggestedLoadFor={() => null} />);

    expect(screen.getByText('Iniciar série')).toBeTruthy();
    expect(screen.queryByLabelText('Carga da série 1')).toBeNull();
    expect(screen.queryByLabelText('Repetições da série 1')).toBeNull();
  });
});
