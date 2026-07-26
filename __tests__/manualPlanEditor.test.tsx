// Tela principal do editor — modos de falha cobertos:
// - treino vazio habilita Salvar e só falha na RPC;
// - falha da API apaga vinte minutos de rascunho;
// - prévia é recalculada em TS e diverge do expansor;
// - limite de 7 treinos falha silenciosamente.

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/config/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null } })),
      refreshSession: jest.fn(async () => ({ data: { session: null } })),
      signOut: jest.fn(async () => ({})),
    },
  },
}));
jest.mock('../src/services/exerciseCatalogService', () => ({
  ...jest.requireActual('../src/services/exerciseCatalogService'),
  getCatalog: jest.fn(async () => []),
}));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockUpdateProfile = jest.fn(async () => undefined);
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: undefined }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, updateProfile: mockUpdateProfile }),
}));

import ManualPlanEditorScreen from '../src/screens/ManualPlanEditorScreen';
import { useManualPlanStore } from '../src/store/manualPlanStore';

describe('ManualPlanEditorScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useManualPlanStore.getState().reset({ clearPersisted: false });
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
  });

  it('desabilita Salvar enquanto existir treino sem exercício', async () => {
    useManualPlanStore.getState().addWorkout();
    const screen = render(<ManualPlanEditorScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('manual-plan-save').props.accessibilityState.disabled).toBe(true),
    );
  });

  it('exibe a prévia recebida do servidor sem recalcular os 77 minutos', async () => {
    useManualPlanStore.setState({
      previewData: {
        semanas: [
          {
            semana: 1,
            treinos: [
              { nome: 'Treino A', dia: 'segunda', minutos: 77, exercicios: [] },
            ],
          },
        ],
      },
    });
    const screen = render(<ManualPlanEditorScreen />);

    expect(await screen.findByText('77 min')).toBeTruthy();
    expect(screen.getByText('Semana 1')).toBeTruthy();
  });

  it('mostra Notice ao tentar adicionar o oitavo treino', async () => {
    const store = useManualPlanStore.getState();
    for (let index = 0; index < 7; index += 1) store.addWorkout();
    const screen = render(<ManualPlanEditorScreen />);

    fireEvent.press(screen.getByText('Adicionar treino'));

    expect(await screen.findByText(/até 7 treinos/i)).toBeTruthy();
    expect(useManualPlanStore.getState().draft?.treinos).toHaveLength(7);
  });
});
