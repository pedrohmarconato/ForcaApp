// __tests__/sessionHistory.test.tsx
// Fase 4 — histórico de sessões concluídas: a lista mostra o que foi feito e o
// detalhe traz reps/carga reais por exercício. Erro de banco ≠ lista vazia.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => {
  const ReactLib = require('react');
  return {
    useNavigation: () => ({ navigate: jest.fn() }),
    // simula o foco: roda o callback uma vez na montagem
    useFocusEffect: (cb: any) => ReactLib.useEffect(() => cb(), []),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
const mockAuthState = { user: { id: 'user-1', email: 'p@e.com' }, profile: {} };
jest.mock('../src/contexts/AuthContext', () => ({ useAuth: () => mockAuthState }));

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(),
  getSessionLogDetail: jest.fn(),
}));

import { getCompletedSessions, getSessionLogDetail } from '../src/services/sessionExecutionRepository';
import SessionHistoryScreen from '../src/screens/SessionHistoryScreen';
import SessionHistoryDetailScreen from '../src/screens/SessionHistoryDetailScreen';

const mock = <T,>(fn: T) => fn as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('SessionHistoryScreen', () => {
  it('lista as sessões concluídas', async () => {
    mock(getCompletedSessions).mockResolvedValue([
      {
        sessionLogId: 'sl-1', plannedSessionId: 'ps-1', title: 'Push A',
        weekNumber: 2, muscleGroups: ['Peito'], startedAt: '2026-07-17T09:00:00Z',
        finishedAt: '2026-07-17T10:00:00Z',
      },
    ]);

    const { getByText } = render(<SessionHistoryScreen />);
    await waitFor(() => expect(getByText('Push A')).toBeTruthy());
    expect(getByText(/Semana 2/)).toBeTruthy();
  });

  it('sem sessões, mostra vazio honesto (não erro)', async () => {
    mock(getCompletedSessions).mockResolvedValue([]);
    const { getByText } = render(<SessionHistoryScreen />);
    await waitFor(() => expect(getByText(/ainda não concluiu nenhum treino/i)).toBeTruthy());
  });

  it('erro de banco mostra erro — não "nenhum treino"', async () => {
    mock(getCompletedSessions).mockRejectedValue(new Error('relation does not exist'));
    const { getByText, queryByText } = render(<SessionHistoryScreen />);
    await waitFor(() => expect(getByText(/Não foi possível carregar seu histórico/)).toBeTruthy());
    expect(queryByText(/ainda não concluiu/i)).toBeNull();
  });
});

describe('SessionHistoryDetailScreen', () => {
  it('mostra reps/carga reais e o outcome por série', async () => {
    mock(getSessionLogDetail).mockResolvedValue({
      sessionLogId: 'sl-1', title: 'Push A', weekNumber: 2,
      startedAt: '2026-07-17T09:00:00Z', finishedAt: '2026-07-17T10:00:00Z',
      exercises: [
        {
          name: 'Supino Reto', order: 1,
          sets: [
            { setOrder: 1, actualReps: 8, actualLoadKg: 40, actualRir: 2, outcome: 'on_target' },
            { setOrder: 2, actualReps: 6, actualLoadKg: 40, actualRir: 0, outcome: 'under' },
          ],
        },
      ],
    });

    const { getByText } = render(
      <SessionHistoryDetailScreen route={{ params: { sessionLogId: 'sl-1', title: 'Push A' } }} />,
    );

    await waitFor(() => expect(getByText('Supino Reto')).toBeTruthy());
    expect(getByText(/Série 1: 8 reps × 40 kg · RIR 2/)).toBeTruthy();
    expect(getByText('No alvo')).toBeTruthy();
    expect(getByText('Abaixo')).toBeTruthy();
  });
});
