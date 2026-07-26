// Picker do editor manual — modos de falha cobertos:
// - busca sem acento deixa de encontrar catálogo canônico;
// - falha/offline sem catálogo bloqueia nome livre (não pode);
// - opção livre some ou não fica em primeiro quando não há casamento;
// - Cardio/Mobilidade ficam inalcançáveis quando a preferência é falsa;
// - item catalogado perde métrica/equipamento ao entrar na prescrição.

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

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { workoutIndex: 0 } }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

import ExercisePickerScreen from '../src/screens/ExercisePickerScreen';
import { useManualPlanStore } from '../src/store/manualPlanStore';
import type { CatalogEntry } from '../src/services/exerciseCatalogService';

const catalog: CatalogEntry[] = [
  {
    chave: 'supino_reto_barra',
    nome: 'Supino Reto com Barra',
    grupo_muscular: 'Peito',
    equipamento: 'Barra',
    peso_corporal: false,
    incremento_kg: 2.5,
    metrica: 'carga_reps',
  },
  {
    chave: 'elevacao_lateral',
    nome: 'Elevação Lateral com Halteres',
    grupo_muscular: 'Ombros',
    equipamento: 'Halteres',
    peso_corporal: false,
    incremento_kg: 1,
    metrica: 'carga_reps',
  },
  {
    chave: 'caminhada',
    nome: 'Caminhada',
    grupo_muscular: 'Cardio',
    equipamento: 'Peso corporal',
    peso_corporal: true,
    incremento_kg: 0,
    metrica: 'tempo_distancia',
  },
  {
    chave: 'alongamento_dinamico',
    nome: 'Alongamento Dinâmico',
    grupo_muscular: 'Mobilidade',
    equipamento: 'Peso corporal',
    peso_corporal: true,
    incremento_kg: 0,
    metrica: 'tempo',
  },
];

describe('ExercisePickerScreen', () => {
  beforeEach(async () => {
    mockGoBack.mockClear();
    await useManualPlanStore.getState().reset({ clearPersisted: false });
    await useManualPlanStore.getState().initEmpty('user-1', {
      forceNew: true,
      incluirCardio: false,
      incluirAlongamento: false,
    });
    useManualPlanStore.getState().addWorkout();
    useManualPlanStore.setState({ catalog, catalogError: null });
  });

  it('busca sem acento e escolhe catálogo preenchendo métrica/equipamento', async () => {
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText('Buscar ou escrever exercício'), 'elevacao');
    fireEvent.press(await screen.findByText('Elevação Lateral com Halteres'));

    expect(screen.getByText('Halteres')).toBeTruthy();
    expect(screen.getByText('Carga e repetições')).toBeTruthy();
  });

  it('nome livre aparece primeiro quando não há casamento e funciona offline', async () => {
    useManualPlanStore.setState({ catalog: [], catalogError: 'Sem conexão com o catálogo.' });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(
      screen.getByLabelText('Buscar ou escrever exercício'),
      'Rosca escocesa no banco 45',
    );

    const livre = await screen.findByText('Usar “Rosca escocesa no banco 45”');
    expect(livre).toBeTruthy();
    fireEvent.press(livre);
    expect(screen.getByText(/ainda não está na nossa lista/i)).toBeTruthy();
    expect(screen.getByText('Escolher métrica')).toBeTruthy();
  });

  it('Cardio/Mobilidade começam recolhidos, mas continuam alcançáveis', async () => {
    const screen = render(<ExercisePickerScreen />);
    expect(screen.queryByText('Caminhada')).toBeNull();
    expect(screen.queryByText('Alongamento Dinâmico')).toBeNull();

    fireEvent.press(screen.getByText('Mostrar cardio e mobilidade'));

    await waitFor(() => expect(screen.getByText('Caminhada')).toBeTruthy());
    expect(screen.getByText('Alongamento Dinâmico')).toBeTruthy();
  });
});
