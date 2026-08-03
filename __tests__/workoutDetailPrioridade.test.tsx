// __tests__/workoutDetailPrioridade.test.tsx
// COMMIT C — Nível 3 (PRIORIDADE) no detalhe da sessão: card de proposta para
// subir o primário do grupo negligenciado ao 1º lugar real (depois do
// aquecimento). Motor REAL (musclePriority); só a fronteira de rede é mockada.
//
// Coberto: copy LITERAL do card, ausência do card fora de pending/sem sessão
// devida, "Manter como está" nunca toca a RPC, aplicar chama a RPC com a
// permutação exata e mostra o chip na linha, 40001 recarrega sem reenviar,
// falha genérica preserva a proposta, contexto indisponível é silencioso.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('../src/config/supabaseClient', () => ({ supabase: { rpc: jest.fn() } }));

const mockStoreState: {
  draft: { plannedSessionId: string } | null;
  pendingCheckIn: { sessionId: string } | null;
} = { draft: null, pendingCheckIn: null };

jest.mock('../src/store/activeSessionStore', () => ({
  useActiveSessionStore: (selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

jest.mock('../src/services/trainingRepository', () => ({
  getSessionDetail: jest.fn(),
  formatExerciseTarget: jest.fn(() => '4 séries × 8 reps'),
}));

jest.mock('../src/services/planEditRepository', () => {
  const actual = jest.requireActual('../src/services/planEditRepository');
  return { ...actual, reordenarExercicios: jest.fn(async () => {}) };
});

jest.mock('../src/services/weeklyReplanRepository', () => ({
  getWeekReplanContext: jest.fn(),
}));

// Dia local fixo para o teste (a tela usa a fonte viva do dia).
jest.mock('../src/hooks/useDiaLocal', () => ({
  useDiaLocal: () => '2020-01-08',
}));

import WorkoutDetailScreen from '../src/screens/WorkoutDetailScreen';
import { getSessionDetail } from '../src/services/trainingRepository';
import { PlanEditError, reordenarExercicios } from '../src/services/planEditRepository';
import { getWeekReplanContext, type WeekReplanContext } from '../src/services/weeklyReplanRepository';

const getSessionDetailMock = getSessionDetail as jest.Mock;
const reordenarMock = reordenarExercicios as jest.Mock;
const getWeekReplanContextMock = getWeekReplanContext as jest.Mock;

const exercicio = (p: {
  id: string;
  nome: string;
  ordem: number;
  grupo?: string;
  prioridade?: 'primary' | 'secondary' | 'accessory';
  metrica?: 'carga_reps' | 'tempo' | 'tempo_distancia';
}) => ({
  id: p.id,
  session_id: 'sess-1',
  exercise_order: p.ordem,
  name: p.nome,
  muscle_group: p.grupo ?? 'Costas',
  priority: p.prioridade ?? 'secondary' as const,
  equipment: null,
  load_increment_kg: 2.5,
  rest_seconds: null,
  target_rm_percent: null,
  sets_planned: 4,
  reps_raw: '8',
  method: null,
  notes: null,
  metric: p.metrica ?? 'carga_reps',
  planned_sets: [1, 2, 3, 4].map((i) => ({ id: `${p.id}-s${i}`, set_order: i })),
});

// Sessão pendente: aquecimento (acessório, tempo) → Rosca → Remada (primário
// de Costas fora do lugar). O card deve propor rem → depois do aquecimento.
const sessaoBase = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-1',
  week_number: 1,
  day_of_week: 'quinta',
  order_in_week: 3,
  title: 'Puxa',
  session_type: 'força',
  scheduled_date: '2020-01-09',
  estimated_minutes: 50,
  status: 'pending' as 'pending' | 'in_progress' | 'completed' | 'skipped',
  muscle_groups: ['Costas', 'Bíceps'],
  planned_exercises: [
    exercicio({ id: 'aq1', nome: 'Mobilidade', ordem: 1, grupo: null, prioridade: 'accessory', metrica: 'tempo' }),
    exercicio({ id: 'ros', nome: 'Rosca', ordem: 2, grupo: 'Bíceps' }),
    exercicio({ id: 'rem', nome: 'Remada Curvada', ordem: 3, grupo: 'Costas', prioridade: 'primary' }),
  ],
};

// Contexto da semana: segunda PERDIDA (Costas, zero séries) + a sessão atual.
const makeContext = (): WeekReplanContext => ({
  planId: 'plan-1',
  weekNumber: 1,
  userId: 'user-1',
  sessions: [
    {
      id: 'seg',
      weekNumber: 1,
      title: 'Treino A',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-05',
      status: 'pending',
      estimatedMinutes: 60,
      exercises: [
        {
          id: 'rem-seg',
          name: 'Remada Curvada',
          muscleGroup: 'Costas',
          priority: 'primary',
          exerciseOrder: 1,
          sets: [1, 2, 3, 4].map((i) => ({ id: `rem-seg-s${i}`, setOrder: i })),
          metric: 'carga_reps',
        },
      ],
    },
    {
      id: 'sess-1',
      weekNumber: 1,
      title: 'Puxa',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-09',
      status: 'pending',
      estimatedMinutes: 50,
      exercises: [
        { id: 'aq1', name: 'Mobilidade', muscleGroup: null, priority: 'accessory', exerciseOrder: 1, sets: [{ id: 'aq1-s1', setOrder: 1 }], metric: 'tempo' },
        { id: 'ros', name: 'Rosca', muscleGroup: 'Bíceps', priority: 'secondary', exerciseOrder: 2, sets: [{ id: 'ros-s1', setOrder: 1 }], metric: 'carga_reps' },
        { id: 'rem', name: 'Remada Curvada', muscleGroup: 'Costas', priority: 'primary', exerciseOrder: 3, sets: [1, 2, 3, 4].map((i) => ({ id: `rem-s${i}`, setOrder: i })), metric: 'carga_reps' },
      ],
    },
  ],
  completedSetsBySession: {},
  sessionLabelById: { seg: 'Treino A · 2020-01-05', 'sess-1': 'Puxa · 2020-01-09' },
  raw: [] as any,
  snapshotBySessionLogId: {},
});

const renderTela = async (sessao = sessaoBase, contexto: WeekReplanContext | null = makeContext()) => {
  getSessionDetailMock.mockResolvedValue(sessao);
  if (contexto != null) getWeekReplanContextMock.mockResolvedValue(contexto);
  const utils = render(<WorkoutDetailScreen route={{ params: { sessionId: 'sess-1' } }} />);
  await waitFor(() => expect(utils.getByText('Puxa')).toBeTruthy());
  return utils;
};

beforeEach(() => {
  getSessionDetailMock.mockReset();
  getWeekReplanContextMock.mockReset();
  reordenarMock.mockReset();
  reordenarMock.mockResolvedValue(undefined);
  mockStoreState.draft = null;
  mockStoreState.pendingCheckIn = null;
});

describe('WorkoutDetail — card de prioridade (Nível 3)', () => {
  it('mostra o card com o copy literal quando a semana tem grupo negligenciado', async () => {
    const utils = await renderTela();

    await waitFor(() => expect(utils.getByText('Costas ficou sem treino esta semana')).toBeTruthy());
    expect(
      utils.getByText('Quer começar por Remada Curvada? Ele sobe para 1º, com você descansado'),
    ).toBeTruthy();
    expect(utils.getByText('Nada de série a mais. O treino é o mesmo — só muda a ordem.')).toBeTruthy();
    expect(utils.getByText('Colocar primeiro')).toBeTruthy();
    expect(utils.getByText('Manter como está')).toBeTruthy();
    expect(getWeekReplanContextMock).toHaveBeenCalledWith('user-1', 'plan-1', 1);
  });

  it('sem sessão devida na semana → sem card', async () => {
    const contexto = makeContext();
    // Segunda com data FUTURA: nada venceu, nada a propor.
    (contexto.sessions[0] as { scheduledDate: string }).scheduledDate = '2020-01-12';
    const utils = await renderTela(sessaoBase, contexto);

    await waitFor(() => expect(getWeekReplanContextMock).toHaveBeenCalledTimes(1));
    expect(utils.queryByText('Colocar primeiro')).toBeNull();
  });

  it('grupo com séries executadas na semana → sem card', async () => {
    const contexto = makeContext();
    // A sessão de terça executou Costas: o grupo não está mais negligenciado.
    contexto.sessions.push({
      id: 'ter',
      weekNumber: 1,
      title: 'Puxa B',
      sessionType: 'Hipertrofia',
      scheduledDate: '2020-01-06',
      status: 'completed',
      estimatedMinutes: 50,
      exercises: [
        { id: 'pul', name: 'Pulley', muscleGroup: 'Costas', priority: 'secondary', exerciseOrder: 1, sets: [{ id: 'pul-s1', setOrder: 1 }], metric: 'carga_reps' },
      ],
    });
    contexto.completedSetsBySession = { ter: 3 };
    const utils = await renderTela(sessaoBase, contexto);

    await waitFor(() => expect(getWeekReplanContextMock).toHaveBeenCalledTimes(1));
    expect(utils.queryByText('Colocar primeiro')).toBeNull();
  });

  it('sessão em andamento → sem card e sem consulta ao contexto', async () => {
    const emAndamento = { ...sessaoBase, status: 'in_progress' as const };
    const utils = await renderTela(emAndamento);

    expect(utils.queryByText('Colocar primeiro')).toBeNull();
    expect(getWeekReplanContextMock).not.toHaveBeenCalled();
  });

  it('a própria sessão atrasada NÃO se declara "de fora" (achado nº 5 do review 67)', async () => {
    // Sessão aberta hoje, agendada ONTEM (devida, zero séries): o grupo dela
    // está prestes a ser treinado — afirmar "ficou de fora" seria mentira.
    const atrasada = {
      ...sessaoBase,
      scheduled_date: '2020-01-07',
      muscle_groups: ['Peito', 'Costas'],
      planned_exercises: [
        exercicio({ id: 'sup', nome: 'Supino', ordem: 1, grupo: 'Peito', prioridade: 'primary' }),
        exercicio({ id: 'rem', nome: 'Remada Curvada', ordem: 2, grupo: 'Costas', prioridade: 'primary' }),
      ],
    };
    const contexto = makeContext();
    // O contexto da semana só tem a própria sessão atrasada (e uma futura).
    contexto.sessions = [
      {
        id: 'sess-1',
        weekNumber: 1,
        title: 'Puxa',
        sessionType: 'Hipertrofia',
        scheduledDate: '2020-01-07',
        status: 'pending',
        estimatedMinutes: 50,
        exercises: [
          { id: 'sup', name: 'Supino', muscleGroup: 'Peito', priority: 'primary', exerciseOrder: 1, sets: [1, 2, 3, 4].map((i) => ({ id: `sup-s${i}`, setOrder: i })), metric: 'carga_reps' },
          { id: 'rem', name: 'Remada Curvada', muscleGroup: 'Costas', priority: 'primary', exerciseOrder: 2, sets: [1, 2, 3, 4].map((i) => ({ id: `rem-s${i}`, setOrder: i })), metric: 'carga_reps' },
        ],
      },
      {
        id: 'qui',
        weekNumber: 1,
        title: 'Empurra',
        sessionType: 'Hipertrofia',
        scheduledDate: '2020-01-10',
        status: 'pending',
        estimatedMinutes: 50,
        exercises: [
          { id: 'tri', name: 'Tríceps', muscleGroup: 'Tríceps', priority: 'primary', exerciseOrder: 1, sets: [{ id: 'tri-s1', setOrder: 1 }], metric: 'carga_reps' },
        ],
      },
    ];

    const utils = await renderTela(atrasada, contexto);
    await waitFor(() => expect(getWeekReplanContextMock).toHaveBeenCalledTimes(1));

    // Nenhum grupo "negligenciado" vem dela mesma: sem card, sem chip mentiroso.
    expect(utils.queryByText('Colocar primeiro')).toBeNull();
    expect(utils.queryByText(/ficou de fora/)).toBeNull();
  });

  it('grupo negligenciado por OUTRA sessão devida continua gerando o card mesmo com a atual atrasada', async () => {
    const atrasada = {
      ...sessaoBase,
      scheduled_date: '2020-01-07',
      planned_exercises: [
        exercicio({ id: 'ros', nome: 'Rosca', ordem: 1, grupo: 'Bíceps' }),
        exercicio({ id: 'rem', nome: 'Remada Curvada', ordem: 2, grupo: 'Costas', prioridade: 'primary' }),
      ],
    };
    const contexto = makeContext();
    // A atual está atrasada (ontem), mas a SEGUNDA também está (segunda 05):
    // Costas segue negligenciado por causa da seg — o card continua válido.
    (contexto.sessions[1] as { scheduledDate: string }).scheduledDate = '2020-01-07';

    const utils = await renderTela(atrasada, contexto);

    await waitFor(() => expect(utils.getByText('Colocar primeiro')).toBeTruthy());
  });

  it('draft ativo desta sessão → sem card (mesma guarda da reordenação)', async () => {
    mockStoreState.draft = { plannedSessionId: 'sess-1' };
    const utils = await renderTela();

    expect(utils.queryByText('Colocar primeiro')).toBeNull();
  });

  it('"Colocar primeiro" aplica a permutação exata, esconde o card e mostra o chip na linha', async () => {
    const utils = await renderTela();
    await waitFor(() => expect(utils.getByText('Colocar primeiro')).toBeTruthy());

    fireEvent.press(utils.getByText('Colocar primeiro'));

    await waitFor(() =>
      expect(reordenarMock).toHaveBeenCalledWith('sess-1', ['aq1', 'rem', 'ros']),
    );
    // Card sai de cena; o chip entra na linha do exercício promovido.
    await waitFor(() => expect(utils.queryByText('Colocar primeiro')).toBeNull());
    expect(utils.getByText('1º por prioridade · Costas ficou de fora')).toBeTruthy();
    // O detalhe foi relido do servidor (a ordem agora vem de lá).
    await waitFor(() => expect(getSessionDetailMock).toHaveBeenCalledTimes(2));
  });

  it('"Manter como está" esconde o card sem NUNCA tocar a RPC', async () => {
    const utils = await renderTela();
    await waitFor(() => expect(utils.getByText('Manter como está')).toBeTruthy());

    fireEvent.press(utils.getByText('Manter como está'));

    await waitFor(() => expect(utils.queryByText('Manter como está')).toBeNull());
    expect(reordenarMock).not.toHaveBeenCalled();
    expect(getSessionDetailMock).toHaveBeenCalledTimes(1);
  });

  it('plano desatualizado (40001) recarrega sem reenviar a proposta e sai do chip', async () => {
    reordenarMock.mockRejectedValueOnce(
      new PlanEditError('lista divergente do estado atual — recarregue', '40001'),
    );
    const utils = await renderTela();
    await waitFor(() => expect(utils.getByText('Colocar primeiro')).toBeTruthy());

    fireEvent.press(utils.getByText('Colocar primeiro'));

    await waitFor(() => expect(reordenarMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getSessionDetailMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(utils.getByText(/mudou em outro lugar/)).toBeTruthy());
    expect(utils.queryByText('1º por prioridade · Costas ficou de fora')).toBeNull();
  });

  it('falha genérica ao aplicar mostra aviso e PRESERVA o card para tentar de novo', async () => {
    reordenarMock.mockRejectedValueOnce(new Error('network request failed'));
    const utils = await renderTela();
    await waitFor(() => expect(utils.getByText('Colocar primeiro')).toBeTruthy());

    fireEvent.press(utils.getByText('Colocar primeiro'));

    await waitFor(() => expect(utils.getByText('Não foi possível salvar')).toBeTruthy());
    expect(utils.getByText('Colocar primeiro')).toBeTruthy();
    expect(utils.queryByText('1º por prioridade · Costas ficou de fora')).toBeNull();
    expect(getSessionDetailMock).toHaveBeenCalledTimes(1);
  });

  it('contexto da semana indisponível é silencioso: sem card e sem erro na tela', async () => {
    getWeekReplanContextMock.mockRejectedValue(new Error('sem rede'));
    const utils = await renderTela(sessaoBase, null);

    await waitFor(() => expect(getWeekReplanContextMock).toHaveBeenCalledTimes(1));
    expect(utils.queryByText('Colocar primeiro')).toBeNull();
    expect(utils.getByText('Iniciar treino')).toBeTruthy();
  });

  it('card não aparece durante o modo reordenar (a lista tem o foco da edição)', async () => {
    const utils = await renderTela();
    await waitFor(() => expect(utils.getByText('Colocar primeiro')).toBeTruthy());

    fireEvent.press(utils.getByText('Reordenar'));

    expect(utils.queryByText('Colocar primeiro')).toBeNull();
    expect(utils.getByLabelText('Mover Rosca para cima')).toBeTruthy();
  });
});
