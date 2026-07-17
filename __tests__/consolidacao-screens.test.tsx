// __tests__/consolidacao-screens.test.tsx
// Fase 2 — Consolidação (atualizado na Fase 3). Garante que as telas VIVAS
// consomem as fontes CORRETAS:
//  - ProfileScreen / TrainingSessionScreen: useAuth vem de contexts/AuthContext.
//  - Telas de treino: dados vêm do cliente único (config/supabaseClient.js),
//    agora através das tabelas REAIS da Fase 3 (planned_sessions e filhas).

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// Variáveis prefixadas com "mock" são permitidas dentro de factories do jest.mock.
const mockAuthState = {
  user: { id: 'user-123', email: 'pedro@exemplo.com' },
  profile: { full_name: 'Pedro Marconato' },
  signOut: jest.fn(async () => ({})),
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

const mockSessaoBase = {
  id: 'sess-1',
  plan_id: 'plan-1',
  user_id: 'user-123',
  week_number: 1,
  title: 'Treino de Força A',
  session_type: 'Força',
  scheduled_date: '2026-07-20',
  estimated_minutes: 60,
  status: 'in_progress',
  muscle_groups: ['Pernas'],
};

const mockSessaoDetalhe = {
  ...mockSessaoBase,
  planned_exercises: [
    {
      id: 'ex-1',
      session_id: 'sess-1',
      exercise_order: 1,
      name: 'Agachamento Livre',
      priority: 'primary',
      sets_planned: 4,
      reps_raw: '8',
      rest_seconds: 90,
      target_rm_percent: 75,
      planned_sets: [
        { id: 'st-1', exercise_id: 'ex-1', set_order: 1, target_reps_min: 8, target_reps_max: 8, target_load_kg: null, target_rir: null },
      ],
    },
  ],
};

// Builder fluente: consultas de lista resolvem via await direto (thenable);
// consultas de detalhe usam .single().
const mockFluent = () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve({ data: mockSessaoDetalhe, error: null }),
    then: (resolve, reject) =>
      Promise.resolve({ data: [mockSessaoBase], error: null }).then(resolve, reject),
  };
  return builder;
};

jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    from: jest.fn((table) => {
      if (table === 'planned_sessions') {
        return mockFluent();
      }
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
      };
    }),
  },
}));

import ProfileScreen from '../src/screens/ProfileScreen';
import TrainingSessionScreen from '../src/screens/TrainingSessionScreen';
import WorkoutDetailScreen from '../src/screens/WorkoutDetailScreen';

describe('Fase 2 — ProfileScreen consome AuthContext (não Redux)', () => {
  it('renderiza o nome do perfil e o e-mail a partir do contexto de auth', () => {
    const { getByText } = render(<ProfileScreen />);

    expect(getByText('Pedro Marconato')).toBeTruthy();
    expect(getByText('pedro@exemplo.com')).toBeTruthy();
  });
});

describe('Fase 3 — TrainingSessionScreen lê a sessão real (planned_sessions)', () => {
  it('busca a sessão do usuário via cliente único e exibe título e exercício', async () => {
    const { getByText } = render(<TrainingSessionScreen />);

    await waitFor(() => {
      expect(getByText('Treino de Força A')).toBeTruthy();
      expect(getByText('Agachamento Livre')).toBeTruthy();
      expect(getByText('4 séries × 8 reps')).toBeTruthy();
    });
  });
});

describe('Fase 3 — WorkoutDetailScreen abre a sessão pelo sessionId', () => {
  it('exibe o treino buscado via config/supabaseClient', async () => {
    const { getByText } = render(
      <WorkoutDetailScreen route={{ params: { sessionId: 'sess-1' } }} />
    );

    await waitFor(() => {
      expect(getByText('Treino de Força A')).toBeTruthy();
      expect(getByText('Agachamento Livre')).toBeTruthy();
    });
  });
});
