// __tests__/progressScreenOrigemJoint.test.tsx
// Achado A4 (remediação Treino Conjunto 2.0) — "Recorde sem origem".
//
// progressStats/getCompletedSessions não distinguiam purpose='joint': um
// recorde ou uma sessão do histórico vindos de um treino EM DUPLA apareciam
// como se fossem solo, sem qualquer marcador visual. Este teste cobre as
// duas seções da aba Progresso que exibem esse dado (Recordes e Histórico).
//
// Investigação de flakiness (achado P5, 2026-08-06): falha relatada 1x em
// 30+ execuções (chip "Dupla" ausente em registro solo). 100 execuções
// seriais (--runInBand, 4 blocos de 25) rodaram sem nenhuma falha. Análise
// estática não achou poluição de estado inequívoca: (1) RNTL 13.3.3 chama
// afterEach(cleanup) automático, cada it já desmonta a árvore anterior;
// (2) mockSessoes/mockSetLogs são resetados em beforeEach e as factories
// capturam o valor no momento da chamada síncrona, sem leitura tardia;
// (3) recordesPorExercicio (src/engine/progressStats.ts:40-71) é função
// pura, sem cache; (4) Chip/ListRow são apresentacionais sem estado; (5) as
// keys de React em ProgressScreen.tsx:285 são distintas nos fixtures, sem
// colisão; (6) o único timer real (Animated.loop do Skeleton) tem cleanup
// correto. Hipótese mais provável para o 1-em-30+: jitter transitório de
// agendamento sob carga da máquina, não defeito determinístico.
// Classificação: flaky de infra, não reproduzido — se falhar de novo em CI,
// re-rodar isolado antes de suspeitar de regressão.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), [cb]);
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

let mockSessoes: any[] = [];
let mockSetLogs: any[] = [];

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => mockSessoes),
  getSetLogsResumo: jest.fn(async () => mockSetLogs),
}));

jest.mock('../src/services/cardioGoalRepository', () => ({
  getCardioLogs: jest.fn(async () => []),
  getMetasAtivas: jest.fn(async () => []),
  arquivarMeta: jest.fn(),
  definirMeta: jest.fn(),
  registrarMetaBatida: jest.fn(),
}));

import ProgressScreen from '../src/screens/ProgressScreen';

describe('ProgressScreen — marcador de origem conjunta (achado A4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessoes = [];
    mockSetLogs = [];
  });

  // R2 (review PR #73): a agregação de RECORDES é solo por definição — o
  // motor exclui séries purpose='joint' (antes, a série 80kg×5 em dupla
  // apagava o recorde solo 70×5 e aparecia marcada como "Dupla" na lista de
  // recordes solo). Exibição separada de recordes/volume da dupla em seção
  // própria é TODO do dono; enquanto não existir, a série joint simplesmente
  // não aparece aqui.
  it('Recordes: mistura joint+solo do mesmo exercício mostra o recorde SOLO, sem chip', async () => {
    mockSetLogs = [
      {
        identity: 'k:supino',
        name: 'Supino Reto',
        loadKg: 80,
        reps: 5,
        completedAt: '2026-07-22T10:00:00Z',
        origemJoint: true,
      },
      {
        identity: 'k:supino',
        name: 'Supino Reto',
        loadKg: 70,
        reps: 5,
        completedAt: '2026-07-20T10:00:00Z',
        origemJoint: false,
      },
      {
        identity: 'k:agachamento',
        name: 'Agachamento',
        loadKg: 90,
        reps: 5,
        completedAt: '2026-07-21T10:00:00Z',
        origemJoint: false,
      },
    ];

    const { getByText, queryAllByText, queryByText } = render(<ProgressScreen />);

    await waitFor(() => expect(getByText('Agachamento')).toBeTruthy());
    // O recorde mostrado para o Supino é o SOLO (70 kg), não o joint (80 kg).
    expect(getByText('70 kg × 5')).toBeTruthy();
    expect(queryByText('80 kg × 5')).toBeNull();
    // Sem chip "Dupla": a lista de recordes é só de registros solo agora.
    expect(queryAllByText('Dupla')).toHaveLength(0);
  });

  it('Recordes: série APENAS joint não gera recorde na lista solo', async () => {
    mockSetLogs = [
      {
        identity: 'k:supino',
        name: 'Supino Reto',
        loadKg: 80,
        reps: 5,
        completedAt: '2026-07-22T10:00:00Z',
        origemJoint: true,
      },
    ];

    const { getByText, queryByText } = render(<ProgressScreen />);

    // Nenhum recorde de carga é exibido (a lista vazia tem o texto próprio).
    await waitFor(() => expect(getByText('Seus recordes de carga aparecem aqui.')).toBeTruthy());
    expect(queryByText('Supino Reto')).toBeNull();
  });

  it('Recordes: nenhum marcador quando TODOS os recordes são solo', async () => {
    mockSetLogs = [
      {
        identity: 'k:agachamento',
        name: 'Agachamento',
        loadKg: 80,
        reps: 5,
        completedAt: '2026-07-21T10:00:00Z',
        origemJoint: false,
      },
    ];

    const { getByText, queryByText } = render(<ProgressScreen />);

    await waitFor(() => expect(getByText('Agachamento')).toBeTruthy());
    expect(queryByText('Dupla')).toBeNull();
  });

  it('Histórico: mostra "Dupla" na sessão vinda de plano joint e NÃO mostra na solo', async () => {
    mockSessoes = [
      {
        sessionLogId: 'sl-joint',
        plannedSessionId: 'ps-joint',
        title: 'Treino em Dupla A',
        weekNumber: 1,
        muscleGroups: ['Peito'],
        startedAt: '2026-07-20T09:00:00Z',
        finishedAt: '2026-07-20T10:00:00Z',
        activeSeconds: 3000,
        origemJoint: true,
      },
      {
        sessionLogId: 'sl-solo',
        plannedSessionId: 'ps-solo',
        title: 'Treino Solo B',
        weekNumber: 1,
        muscleGroups: ['Pernas'],
        startedAt: '2026-07-21T09:00:00Z',
        finishedAt: '2026-07-21T10:00:00Z',
        activeSeconds: 3000,
        origemJoint: false,
      },
    ];

    const { getByText, queryAllByText } = render(<ProgressScreen />);

    await waitFor(() => expect(getByText('Treino em Dupla A')).toBeTruthy());
    expect(getByText('Treino Solo B')).toBeTruthy();

    // Exatamente um marcador — o da sessão joint, não o da solo.
    expect(queryAllByText('Dupla')).toHaveLength(1);
  });
});
