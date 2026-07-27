// Picker do editor manual — modos de falha cobertos:
// - busca sem acento deixa de encontrar catálogo canônico;
// - falha/offline sem catálogo bloqueia nome livre (não pode);
// - opção livre some ou não fica em primeiro quando não há casamento;
// - Cardio/Mobilidade ficam inalcançáveis quando a preferência é falsa;
// - item catalogado perde métrica/equipamento ao entrar na prescrição;
// - separador decimal digitado tecla a tecla é engolido e multiplica o valor.

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
  resolveExerciseName: jest.fn(async () => null),
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
import {
  resolveExerciseName,
  type CatalogEntry,
} from '../src/services/exerciseCatalogService';

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
    // Offline o resolvedor devolve null e o nome livre continua valendo.
    expect(await screen.findByText(/ainda não está na nossa lista/i)).toBeTruthy();
    expect(screen.getByText('Escolher métrica')).toBeTruthy();
  });

  it('nome que o servidor canoniza vira item do catálogo, não nome livre', async () => {
    // Os aliases não viajam no payload: o app não tem como saber sozinho que
    // "Bent Over Row" é "Remada Curvada com Barra". Sem consultar o resolvedor,
    // o app afirmava "não está na nossa lista" e a métrica escolhida pelo aluno
    // era descartada em silêncio na gravação.
    (resolveExerciseName as jest.Mock).mockResolvedValueOnce({
      chave: 'remada_curvada_barra',
      nome: 'Remada Curvada com Barra',
      grupo_muscular: 'Costas',
      equipamento: 'Barra',
      peso_corporal: false,
      incremento_kg: 2.5,
      metrica: 'carga_reps',
    });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(
      screen.getByLabelText('Buscar ou escrever exercício'),
      'Bent Over Row',
    );
    fireEvent.press(await screen.findByText('Usar “Bent Over Row”'));

    // Aparece no header e no card de resumo.
    expect((await screen.findAllByText('Remada Curvada com Barra')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/ainda não está na nossa lista/i)).toBeNull();
    expect(screen.getByText('Barra')).toBeTruthy();
  });

  // Digitação real: o usuário digita UMA tecla por vez, sempre por cima do que o
  // campo está exibindo. Um campo controlado por String(numero) reconstrói o texto
  // a partir do número a cada tecla, então o separador decimal nunca sobrevive:
  // "0" -> 0 -> "0"; "," -> Number("0.") = 0 -> "0"; "7" -> "07" -> 7; "5" -> 75.
  // O aluno digita 0,75 min (45 s de prancha) e o rascunho grava 75 minutos.
  // Seleciona tudo e digita por cima — o gesto de quem troca um valor sugerido.
  const digitarTecla = (input: any, texto: string) => {
    fireEvent.changeText(input, '');
    for (const tecla of texto) {
      fireEvent.changeText(input, `${input.props.value ?? ''}${tecla}`);
    }
  };

  const prancha: CatalogEntry = {
    chave: 'prancha',
    nome: 'Prancha',
    grupo_muscular: 'Abdômen',
    equipamento: 'Peso corporal',
    peso_corporal: true,
    incremento_kg: 0,
    metrica: 'tempo',
  };

  it.each([
    ['vírgula', '0,75'],
    ['ponto', '0.75'],
  ])('duração decimal digitada com %s chega ao rascunho como 0,75 e não como 75', async (_rotulo, digitado) => {
    useManualPlanStore.setState({ catalog: [...catalog, prancha], catalogError: null });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText('Buscar ou escrever exercício'), 'prancha');
    fireEvent.press(await screen.findByText('Prancha'));

    const campo = screen.getByLabelText('Duração por série (min)');
    digitarTecla(campo, digitado);
    fireEvent.press(screen.getByText('Adicionar ao treino'));

    const exercicio = useManualPlanStore.getState().draft!.treinos[0].exercicios[0];
    expect(exercicio.duracao_minutos).toBe(0.75);
  });

  it('distância decimal digitada tecla a tecla não vira 45 km', async () => {
    useManualPlanStore.setState({ catalog, catalogError: null });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.press(screen.getByText('Mostrar cardio e mobilidade'));
    fireEvent.press(await screen.findByText('Caminhada'));

    const campo = screen.getByLabelText('Distância por série (km, opcional)');
    digitarTecla(campo, '4,5');
    fireEvent.press(screen.getByText('Adicionar ao treino'));

    const exercicio = useManualPlanStore.getState().draft!.treinos[0].exercicios[0];
    expect(exercicio.distancia_km).toBe(4.5);
  });

  it('o piso de 0,25 min prometido pela própria tela é alcançável pelo teclado', async () => {
    useManualPlanStore.setState({ catalog: [...catalog, prancha], catalogError: null });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText('Buscar ou escrever exercício'), 'prancha');
    fireEvent.press(await screen.findByText('Prancha'));

    const campo = screen.getByLabelText('Duração por série (min)');
    digitarTecla(campo, '0,25');
    fireEvent.press(screen.getByText('Adicionar ao treino'));

    // 0,25 é exatamente o piso que a tela anuncia — e o backend exige desde a
    // camada do motor. Antes o campo entregava 25 minutos, dentro da faixa e
    // portanto sem aviso nenhum: o erro passava calado pela validação.
    const exercicio = useManualPlanStore.getState().draft!.treinos[0].exercicios[0];
    expect(exercicio.duracao_minutos).toBe(0.25);
    expect(screen.queryByText(/precisa ficar entre 15 segundos/i)).toBeNull();
  });

  it('descanso de 600s não é interrompido pelo preset de 60s no meio da digitação', async () => {
    // "6" -> 6; "60" -> casa com o preset 60s e o campo se limpava sozinho;
    // o "0" seguinte caía num campo vazio e virava tempo_descanso: 0 — que o
    // mapper traduz para rest_seconds NULL. O aluno pede 10 min de descanso e
    // a sessão não mostra descanso nenhum, sem aviso em lugar algum.
    useManualPlanStore.setState({ catalog, catalogError: null });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText('Buscar ou escrever exercício'), 'elevacao');
    fireEvent.press(await screen.findByText('Elevação Lateral com Halteres'));

    digitarTecla(screen.getByLabelText('Outro descanso (segundos)'), '600');
    fireEvent.press(screen.getByText('Adicionar ao treino'));

    const exercicio = useManualPlanStore.getState().draft!.treinos[0].exercicios[0];
    expect(exercicio.tempo_descanso).toBe(600);
  });

  it('escolher um preset limpa o campo de descanso livre', async () => {
    useManualPlanStore.setState({ catalog, catalogError: null });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText('Buscar ou escrever exercício'), 'elevacao');
    fireEvent.press(await screen.findByText('Elevação Lateral com Halteres'));

    const livre = screen.getByLabelText('Outro descanso (segundos)');
    digitarTecla(livre, '600');
    fireEvent.press(screen.getByText('45s'));

    expect(screen.getByLabelText('Outro descanso (segundos)').props.value).toBe('');
    fireEvent.press(screen.getByText('Adicionar ao treino'));
    expect(
      useManualPlanStore.getState().draft!.treinos[0].exercicios[0].tempo_descanso,
    ).toBe(45);
  });

  it('tocar de novo na métrica já ativa não apaga o que foi digitado', async () => {
    // Os três botões ficam lado a lado; errar a mira e tocar no que já está
    // aceso devolvia duração para 20, zerava a distância e reescrevia as
    // repetições — sem confirmação e sem desfazer.
    useManualPlanStore.setState({ catalog: [], catalogError: 'Sem conexão com o catálogo.' });
    const screen = render(<ExercisePickerScreen />);
    fireEvent.changeText(screen.getByLabelText('Buscar ou escrever exercício'), 'Corrida na areia');
    fireEvent.press(await screen.findByText('Usar “Corrida na areia”'));
    await screen.findByText('Escolher métrica');

    fireEvent.press(screen.getByText('Tempo e distância'));
    digitarTecla(screen.getByLabelText('Duração por série (min)'), '35');
    digitarTecla(screen.getByLabelText('Distância por série (km, opcional)'), '6');

    // Segundo toque no botão que já está selecionado. O primeiro nó com esse
    // texto é o resumo do card; o segundo é o botão da linha de métricas.
    fireEvent.press(screen.getAllByText('Tempo e distância')[1]);
    fireEvent.press(screen.getByText('Adicionar ao treino'));

    const exercicio = useManualPlanStore.getState().draft!.treinos[0].exercicios[0];
    expect(exercicio.duracao_minutos).toBe(35);
    expect(exercicio.distancia_km).toBe(6);
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
