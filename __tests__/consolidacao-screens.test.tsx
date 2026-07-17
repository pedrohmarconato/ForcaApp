// __tests__/consolidacao-screens.test.tsx
// Fase 2 — Consolidação. Estes testes garantem que as telas VIVAS consomem
// as fontes CORRETAS após a migração:
//  - ProfileScreen / TrainingSessionScreen: useAuth vem de contexts/AuthContext
//    (React Context), NÃO de hooks/useAuth (Redux desligado, quebra em runtime).
//  - TrainingSessionScreen / WorkoutDetailScreen: supabase vem de
//    config/supabaseClient.js (cliente único com SecureStore), NÃO de
//    services/supabase/supabase.ts (segundo cliente sem storage seguro).
//
// Estes testes FALHAM antes da migração (RED) e passam depois (GREEN).

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

// Builder fluente: suporta await direto (thenable) e .single().
const mockFluent = (resolver) => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve(resolver()),
    then: (resolve, reject) => Promise.resolve(resolver()).then(resolve, reject),
  };
  return builder;
};

const mockTrainingData = { id: 'treino-1', name: 'Treino de Força A', status: 'in_progress' };
const mockExercisesData = [
  { id: 'ex-1', name: 'Agachamento Livre', sets: 4, reps: 8 },
  { id: 'ex-2', name: 'Supino Reto', sets: 3, reps: 10 },
];

jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    from: jest.fn((table) => {
      if (table === 'training_sessions') {
        return mockFluent(() => ({ data: mockTrainingData, error: null }));
      }
      if (table === 'training_exercises') {
        return mockFluent(() => ({ data: mockExercisesData, error: null }));
      }
      return mockFluent(() => ({ data: null, error: null }));
    }),
  },
}));

import ProfileScreen from '../src/screens/ProfileScreen';
import TrainingSessionScreen from '../src/screens/TrainingSessionScreen';
import WorkoutDetailScreen from '../src/screens/WorkoutDetailScreen';

describe('Fase 2 — ProfileScreen consome AuthContext (não Redux)', () => {
  it('renderiza o nome do perfil e o e-mail a partir do contexto de auth', () => {
    const { getByText } = render(<ProfileScreen />);

    // O nome vem de profile.full_name fornecido pelo AuthContext
    expect(getByText('Pedro Marconato')).toBeTruthy();
    // O e-mail vem de user.email
    expect(getByText('pedro@exemplo.com')).toBeTruthy();
  });
});

describe('Fase 2 — TrainingSessionScreen consome AuthContext + cliente Supabase único', () => {
  it('busca o treino do usuário via config/supabaseClient e exibe o nome', async () => {
    const { getByText } = render(<TrainingSessionScreen />);

    await waitFor(() => {
      expect(getByText('Treino de Força A')).toBeTruthy();
    });
  });
});

describe('Fase 2 — WorkoutDetailScreen consome cliente Supabase único', () => {
  it('exibe o nome do treino recebido via config/supabaseClient', async () => {
    const { getByText } = render(
      <WorkoutDetailScreen route={{ params: { trainingId: 'treino-1' } }} />
    );

    await waitFor(() => {
      expect(getByText('Treino de Força A')).toBeTruthy();
    });
  });
});
