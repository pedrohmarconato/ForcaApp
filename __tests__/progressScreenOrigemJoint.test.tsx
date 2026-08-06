// __tests__/progressScreenOrigemJoint.test.tsx
// Achado A4 (remediação Treino Conjunto 2.0) — "Recorde sem origem".
//
// progressStats/getCompletedSessions não distinguiam purpose='joint': um
// recorde ou uma sessão do histórico vindos de um treino EM DUPLA apareciam
// como se fossem solo, sem qualquer marcador visual. Este teste cobre as
// duas seções da aba Progresso que exibem esse dado (Recordes e Histórico).

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

  it('Recordes: mostra "Dupla" no recorde vindo de plano joint e NÃO mostra no solo', async () => {
    mockSetLogs = [
      {
        identity: 'k:supino',
        name: 'Supino Reto',
        loadKg: 50,
        reps: 8,
        completedAt: '2026-07-20T10:00:00Z',
        origemJoint: true,
      },
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

    await waitFor(() => expect(getByText('Supino Reto')).toBeTruthy());
    expect(getByText('Agachamento')).toBeTruthy();

    // Só o recorde de origem joint carrega o marcador — o solo não.
    expect(queryByText('Dupla')).toBeTruthy();
    expect(queryByText('Dupla')).not.toBeNull();
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
