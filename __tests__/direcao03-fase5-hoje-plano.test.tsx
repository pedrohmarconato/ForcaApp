// __tests__/direcao03-fase5-hoje-plano.test.tsx
// Fase 5 da Direção 03 — momentum real na Home e caminho curto para o treino.
// Modos de falha cobertos:
//  1. streak de semanas "constante" inventando sequência (semana atual zerada
//     não pode QUEBRAR a sequência antes de acabar; buraco no meio quebra);
//  2. CTA principal da Home levando ao detalhe (caminho longo) em vez do
//     check-in da sessão (ActiveSession);
//  3. momentum exibido sem nenhuma semana constante (número sem lastro).

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { semanasConstantes } from '../src/engine/progressStats';

const sessao = (ano: number, mesIndex: number, dia: number) => ({
  startedAt: new Date(ano, mesIndex, dia, 8, 0).toISOString(),
  finishedAt: new Date(ano, mesIndex, dia, 9, 0).toISOString(),
});

describe('Fase 5 — semanasConstantes (streak honesto)', () => {
  // Sexta, 24/07/2026 — semana atual começa na segunda 20/07.
  const hoje = new Date(2026, 6, 24, 12, 0, 0);

  it('conta semanas consecutivas com treino, terminando na atual', () => {
    const sessoes = [
      sessao(2026, 6, 21), // semana atual
      sessao(2026, 6, 14), // anterior
      sessao(2026, 6, 8), // retrasada
    ];
    expect(semanasConstantes(sessoes, hoje)).toBe(3);
  });

  it('semana atual ainda zerada NÃO quebra a sequência das anteriores', () => {
    const sessoes = [sessao(2026, 6, 14), sessao(2026, 6, 8)];
    expect(semanasConstantes(sessoes, hoje)).toBe(2);
  });

  it('buraco no meio quebra a sequência', () => {
    const sessoes = [
      sessao(2026, 6, 21), // atual
      // semana de 13/07: vazia
      sessao(2026, 6, 1), // muito atrás
    ];
    expect(semanasConstantes(sessoes, hoje)).toBe(1);
  });

  it('sem nenhum treino, streak é zero', () => {
    expect(semanasConstantes([], hoje)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Home: CTA principal vai DIRETO para a sessão (check-in de foco).
// ---------------------------------------------------------------------------

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => {
      cb();
    }, [cb]);
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
    profile: { full_name: 'Pedro Marconato' },
  }),
}));

jest.mock('../src/hooks/useDiaLocal', () => ({
  useDiaLocal: () => '2026-07-24',
}));

const sessaoHoje = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-123',
  week_number: 3,
  day_of_week: 'fri',
  order_in_week: 1,
  title: 'Push A',
  session_type: null,
  scheduled_date: '2026-07-24',
  estimated_minutes: 45,
  status: 'pending',
  muscle_groups: ['Peito', 'Ombros'],
};

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => sessaoHoje),
  getUpcomingSessions: jest.fn(async () => []),
}));

jest.mock('../src/services/sessionExecutionRepository', () => ({
  getCompletedSessions: jest.fn(async () => [
    {
      sessionLogId: 'log-1',
      plannedSessionId: 'sess-0',
      title: 'Pull A',
      weekNumber: 3,
      muscleGroups: [],
      startedAt: new Date(2026, 6, 21, 8, 0).toISOString(),
      finishedAt: new Date(2026, 6, 21, 9, 0).toISOString(),
    },
    {
      sessionLogId: 'log-2',
      plannedSessionId: 'sess-x',
      title: 'Push A',
      weekNumber: 2,
      muscleGroups: [],
      startedAt: new Date(2026, 6, 14, 8, 0).toISOString(),
      finishedAt: new Date(2026, 6, 14, 9, 0).toISOString(),
    },
  ]),
}));

import HomeScreen from '../src/screens/HomeScreen';

describe('Fase 5 — Home: caminho curto e momentum', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('"Começar" leva DIRETO à sessão (check-in), não ao detalhe', async () => {
    const { findByLabelText } = render(<HomeScreen />);

    fireEvent.press(await findByLabelText('Começar'));
    expect(mockNavigate).toHaveBeenCalledWith('ActiveSession', { sessionId: 'sess-1' });
  });

  it('"Detalhes" continua abrindo o WorkoutDetail', async () => {
    const { findByLabelText } = render(<HomeScreen />);

    fireEvent.press(await findByLabelText('Detalhes'));
    expect(mockNavigate).toHaveBeenCalledWith('WorkoutDetail', { sessionId: 'sess-1' });
  });

  it('momentum real: 2 semanas seguidas viram "2 semanas no plano"', async () => {
    const { findByText } = render(<HomeScreen />);
    expect(await findByText('2 semanas no plano')).toBeTruthy();
  });
});
