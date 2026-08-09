// __tests__/doseCardioQuestionario.test.tsx
// Fase 2 da flexibilidade: a dose de cardio declarada no questionário (0021).
//
// Modos de falha cobertos, escritos antes da implementação:
//
//  1. "Sim" auto-avançar como antes — a dose nem chegaria a ser vista;
//  2. deixar passar sem dias/minutos: a dose é o que a validação do molde cobra,
//     e sem ela a Fase 2 não existe;
//  3. oferecer mais dias de cardio do que dias de treino — dose impossível é
//     cobrada do molde e queima as duas tentativas de geração;
//  4. dizer "sim", preencher a dose e voltar para "não": a dose sobreviveria no
//     payload e o banco recusaria o INSERT inteiro pela constraint
//     questionario_cardio_dose_coerente — o questionário não salvaria;
//  5. mandar lista vazia de modalidades em vez de null: o cardápio do prompt
//     seria filtrado por "nada" e o aluno receberia plano sem cardio.
//
// As modalidades vêm de src/constants/cardioModalidades.ts (lista local, sem
// rede — ver o comentário de lá); a sincronia com o catálogo do backend é
// garantida por cardioModalidadesSincronizadas.test.ts.

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: mockAddListener }),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
    session: { access_token: 'token-abc' },
    updateProfile: jest.fn(async () => ({})),
    signOut: jest.fn(async () => ({})),
    loadingSession: false,
  }),
}));

jest.mock('../src/services/auth/secureStorage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
  removeLegacyPlaintextCopy: jest.fn(async () => undefined),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  removeItem: jest.fn(async () => null),
}));

const mockSaveQuestionnaire = jest.fn(async (_payload: unknown) => ({ success: true as const }));
jest.mock('../src/services/api/questionnaireService', () => ({
  saveQuestionnaireDataAPI: (payload: unknown) => mockSaveQuestionnaire(payload),
}));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

import QuestionnaireScreen from '../src/screens/QuestionnaireScreen';

type Utils = ReturnType<typeof render>;

/** Vai até o passo do cardio marcando 3 dias de treino (seg, qua, sex). */
const irAteOCardio = async (utils: Utils, dias: string[] = ['Segunda-feira', 'Quarta-feira', 'Sexta-feira']) => {
  const { getByLabelText, findByLabelText } = utils;
  fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
  fireEvent.press(getByLabelText('Continuar'));
  fireEvent.changeText(getByLabelText('Dia de nascimento'), '5');
  fireEvent.changeText(getByLabelText('Mês de nascimento'), '3');
  fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
  fireEvent.press(getByLabelText('Continuar'));
  fireEvent.press(getByLabelText('Masculino'));
  await findByLabelText('Peso em quilos');
  fireEvent.changeText(getByLabelText('Peso em quilos'), '82.5');
  fireEvent.changeText(getByLabelText('Altura em centímetros'), '181');
  fireEvent.press(getByLabelText('Continuar'));
  fireEvent.press(getByLabelText('Intermediário (6 meses - 2 anos)'));
  await findByLabelText('Ganho de Massa Muscular');
  fireEvent.press(getByLabelText('Ganho de Massa Muscular'));
  await findByLabelText('Terça-feira');
  dias.forEach((d) => fireEvent.press(getByLabelText(d)));
  fireEvent.press(getByLabelText('Continuar'));
  fireEvent.press(getByLabelText('45-60 min'));
  await waitFor(() => expect(utils.getByText('Incluir cardio no plano?')).toBeTruthy());
};

const renderTela = async () => {
  const utils = render(<QuestionnaireScreen />);
  await utils.findByLabelText('Nome completo');
  return utils;
};

beforeEach(() => jest.clearAllMocks());

describe('a dose aparece e é exigida', () => {
  it('modo de falha 1: "Sim" NÃO avança sozinho — revela a dose no mesmo passo', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils);

    fireEvent.press(utils.getByLabelText('Sim'));

    await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());
    expect(utils.getByText('Quantos minutos por vez?')).toBeTruthy();
    // Continua no passo do cardio: a pergunta seguinte não apareceu.
    expect(utils.queryByText('Incluir alongamentos no plano?')).toBeNull();
  });

  it('modo de falha 2: sem dias e minutos o Continuar fica travado', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils);
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());
    // Anamnese de cardio (02-01): respondida cedo para isolar o gate de dias/minutos sob teste.
    fireEvent.press(utils.getByLabelText('Sim, já pratico'));

    expect(utils.getByLabelText('Continuar').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    fireEvent.press(utils.getByLabelText('2 dias'));
    expect(utils.getByLabelText('Continuar').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    fireEvent.press(utils.getByLabelText('30 min'));
    expect(utils.getByLabelText('Continuar').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('modo de falha 3: não oferece mais dias de cardio do que dias de treino', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils, ['Terça-feira', 'Quinta-feira']);
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());

    expect(utils.getByLabelText('1 dia')).toBeTruthy();
    expect(utils.getByLabelText('2 dias')).toBeTruthy();
    expect(utils.queryByLabelText('3 dias')).toBeNull();
  });

  it('modalidades do catálogo são opcionais e não travam o Continuar', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils);
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByLabelText('Corrida')).toBeTruthy());

    fireEvent.press(utils.getByLabelText('2 dias'));
    fireEvent.press(utils.getByLabelText('30 min'));
    // Anamnese de cardio (02-01): obrigatória para liberar o Continuar do passo.
    fireEvent.press(utils.getByLabelText('Sim, já pratico'));
    // Nenhuma modalidade marcada e já dá para seguir.
    expect(utils.getByLabelText('Continuar').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});

describe('a dose chega ao payload', () => {
  const terminarEEnviar = async (utils: Utils) => {
    await waitFor(() => expect(utils.getByText('Incluir alongamentos no plano?')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByText('Alguma lesão ou restrição?')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('Não'));
    fireEvent.press(utils.getByLabelText('Gerar treino direto'));
    await waitFor(() => expect(mockSaveQuestionnaire).toHaveBeenCalled());
    return mockSaveQuestionnaire.mock.calls[0][0] as Record<string, unknown>;
  };

  it('dias, minutos e modalidades escolhidas viajam para o banco', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils);
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByLabelText('Corrida')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('3 dias'));
    fireEvent.press(utils.getByLabelText('45 min'));
    fireEvent.press(utils.getByLabelText('Corrida'));
    // Anamnese de cardio (02-01): obrigatória para liberar o Continuar do passo.
    fireEvent.press(utils.getByLabelText('Sim, já pratico'));
    fireEvent.press(utils.getByLabelText('Continuar'));

    const payload = await terminarEEnviar(utils);

    expect(payload).toMatchObject({
      inclui_cardio: true,
      cardio_dias_semana: 3,
      cardio_minutos_sessao: 45,
      cardio_modalidades: ['Corrida'],
    });
  });

  it('modo de falha 5: sem modalidade escolhida vai null, nunca lista vazia', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils);
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('2 dias'));
    fireEvent.press(utils.getByLabelText('30 min'));
    // Anamnese de cardio (02-01): obrigatória para liberar o Continuar do passo.
    fireEvent.press(utils.getByLabelText('Sim, já pratico'));
    fireEvent.press(utils.getByLabelText('Continuar'));

    const payload = await terminarEEnviar(utils);

    expect(payload.cardio_modalidades).toBeNull();
  });

  it('modo de falha 4: voltar para "não" limpa a dose antes de enviar', async () => {
    const utils = await renderTela();
    await irAteOCardio(utils);

    // Diz sim, preenche a dose inteira...
    fireEvent.press(utils.getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByLabelText('Corrida')).toBeTruthy());
    fireEvent.press(utils.getByLabelText('3 dias'));
    fireEvent.press(utils.getByLabelText('45 min'));
    fireEvent.press(utils.getByLabelText('Corrida'));
    // ...e muda de ideia no mesmo passo.
    fireEvent.press(utils.getByLabelText('Não'));

    const payload = await terminarEEnviar(utils);

    expect(payload).toMatchObject({
      inclui_cardio: false,
      cardio_dias_semana: null,
      cardio_minutos_sessao: null,
      cardio_modalidades: null,
    });
  });

  it('retomada de rascunho incoerente também não reenvia dose com cardio desligado', async () => {
    const secureStorageMock = jest.requireMock('../src/services/auth/secureStorage');
    (secureStorageMock.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify({
      nome: 'Pedro Marconato',
      data_nascimento: '1990-03-05',
      genero: 'male',
      peso_kg: 82.5,
      altura_cm: 181,
      experiencia_treino: 'intermediate',
      objetivo: 'muscle_gain',
      dias_treino: ['mon', 'wed', 'fri'],
      tempo_medio_treino_min: 60,
      inclui_cardio: false,
      cardio_dias_semana: 3,
      cardio_minutos_sessao: 45,
      cardio_modalidades: ['Corrida'],
      inclui_alongamento: false,
      tem_lesoes: false,
      lesoes_detalhes: null,
    }));

    const utils = render(<QuestionnaireScreen />);
    await utils.findByText('Alguma lesão ou restrição?');
    fireEvent.press(utils.getByLabelText('Gerar treino direto'));
    await waitFor(() => expect(mockSaveQuestionnaire).toHaveBeenCalled());

    expect(mockSaveQuestionnaire.mock.calls[0][0]).toMatchObject({
      inclui_cardio: false,
      cardio_dias_semana: null,
      cardio_minutos_sessao: null,
      cardio_modalidades: null,
    });
  });
});
