// __tests__/fase3-telas-erro.test.tsx
// Achado #9 do review do PR #4: erro de banco (migration ausente, RLS, 5xx)
// não pode aparecer como estado vazio ("Nenhum treino…"/"não encontrado")
// nas telas de sessão e detalhe.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// Fase 4: TrainingSession/WorkoutDetail agora usam useNavigation (botão Iniciar).
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockAuthState = {
  user: { id: 'user-123', email: 'pedro@exemplo.com' },
  profile: { full_name: 'Pedro Marconato' },
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('../src/services/trainingRepository', () => ({
  getTodaySession: jest.fn(async () => {
    throw new Error('relation planned_sessions does not exist');
  }),
  getSessionDetail: jest.fn(async () => {
    throw new Error('relation planned_sessions does not exist');
  }),
  formatExerciseTarget: jest.fn(() => ''),
}));

import TrainingSessionScreen from '../src/screens/TrainingSessionScreen';
import WorkoutDetailScreen from '../src/screens/WorkoutDetailScreen';

describe('Fase 3 — erro de banco não vira estado vazio', () => {
  it('TrainingSessionScreen mostra erro, não "Nenhum treino pendente"', async () => {
    const { getByText, queryByText } = render(<TrainingSessionScreen />);

    await waitFor(() =>
      expect(
        getByText('Não foi possível carregar seu treino. Verifique a conexão e tente novamente.')
      ).toBeTruthy()
    );
    expect(queryByText(/Nenhum treino pendente/)).toBeNull();
  });

  it('WorkoutDetailScreen mostra erro, não "Treino não encontrado"', async () => {
    const { getByText, queryByText } = render(
      <WorkoutDetailScreen route={{ params: { sessionId: 'sess-1' } }} />
    );

    await waitFor(() =>
      expect(
        getByText('Não foi possível carregar o treino. Verifique a conexão e tente novamente.')
      ).toBeTruthy()
    );
    expect(queryByText('Treino não encontrado.')).toBeNull();
  });
});
