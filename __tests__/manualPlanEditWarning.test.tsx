// Confirmação da edição — modos de falha cobertos:
// - avisar em todo plano novo, mesmo sem substituir plano;
// - arquivar o plano atual sem explicar que o histórico permanece;
// - permitir salvar a substituição sem confirmação explícita.

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

let mockRouteParams: Record<string, unknown> | undefined;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../src/config/supabaseClient', () => ({
  supabase: { auth: { getSession: jest.fn(), refreshSession: jest.fn(), signOut: jest.fn() } },
}));
jest.mock('../src/services/exerciseCatalogService', () => ({
  ...jest.requireActual('../src/services/exerciseCatalogService'),
  getCatalog: jest.fn(async () => []),
}));
jest.mock('../src/services/trainingRepository', () => ({
  getPlanSessions: jest.fn(async () => []),
  getSessionDetail: jest.fn(async () => null),
  getTrainingPlanMetadata: jest.fn(async () => null),
}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, updateProfile: jest.fn() }),
}));

import ManualPlanEditorScreen from '../src/screens/ManualPlanEditorScreen';
import { useManualPlanStore } from '../src/store/manualPlanStore';

describe('ManualPlanEditorScreen — aviso de substituição', () => {
  beforeEach(async () => {
    mockRouteParams = undefined;
    await useManualPlanStore.getState().reset({ clearPersisted: false });
    await useManualPlanStore.getState().initEmpty('user-1', { forceNew: true });
  });

  it('não mostra o aviso ao criar um plano do zero', () => {
    const screen = render(<ManualPlanEditorScreen />);

    expect(screen.queryByText(/Isto cria um plano novo/)).toBeNull();
    expect(screen.queryByLabelText('Entendi e quero criar o novo plano')).toBeNull();
  });

  it('mostra o aviso completo e exige confirmação quando fromPlanId existe', async () => {
    mockRouteParams = { fromPlanId: 'plan-old' };
    useManualPlanStore.setState({
      sourcePlanId: 'plan-old',
      draftOrigin: 'existing',
      initFromPlan: jest.fn(async () => undefined),
    } as any);

    const screen = render(<ManualPlanEditorScreen />);

    expect(await screen.findByText(
      'Isto cria um plano novo. O plano atual vai para o histórico e os treinos que você já fez continuam registrados.',
    )).toBeTruthy();
    expect(screen.getByLabelText('Entendi e quero criar o novo plano')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('manual-plan-save').props.accessibilityState.disabled).toBe(true),
    );
  });
});
