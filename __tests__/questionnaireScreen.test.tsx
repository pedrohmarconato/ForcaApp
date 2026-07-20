// __tests__/questionnaireScreen.test.tsx
// Tela 02 após a remodelagem. Cobre o que a apresentação nova precisa manter:
//  - o botão de avançar só habilita com o formulário realmente válido;
//  - o contador de progresso reflete respostas REAIS, não uma estimativa;
//  - a submissão monta o mesmo payload de antes.

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

/**
 * Renderiza a tela e espera o fim do carregamento do storage seguro — só
 * depois dele o formulário aparece no lugar do indicador de progresso.
 */
const renderQuestionario = async () => {
  const utils = render(<QuestionnaireScreen />);
  await utils.findByLabelText('Nome completo');
  return utils;
};

describe('QuestionnaireScreen — progresso e validação', () => {
  beforeEach(() => jest.clearAllMocks());

  it('começa com o botão de avançar desabilitado', async () => {
    const { getByLabelText } = await renderQuestionario();

    expect(getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('o contador de progresso conta apenas blocos realmente respondidos', async () => {
    const { getByText, getByLabelText } = await renderQuestionario();

    // Nada respondido ainda
    expect(getByText('0 de 11')).toBeTruthy();

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    expect(getByText('1 de 11')).toBeTruthy();

    fireEvent.press(getByLabelText('Masculino'));
    expect(getByText('2 de 11')).toBeTruthy();

    // Data incompleta NÃO conta como bloco respondido
    fireEvent.changeText(getByLabelText('Dia de nascimento'), '15');
    expect(getByText('2 de 11')).toBeTruthy();

    fireEvent.changeText(getByLabelText('Mês de nascimento'), '03');
    fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
    expect(getByText('3 de 11')).toBeTruthy();
  });

  it('desmarcar todos os dias volta a desabilitar o avanço', async () => {
    const { getByLabelText, getByText } = await renderQuestionario();

    fireEvent.press(getByLabelText('Terça-feira'));
    expect(getByText('1 de 11')).toBeTruthy();

    fireEvent.press(getByLabelText('Terça-feira'));
    expect(getByText('0 de 11')).toBeTruthy();
    expect(getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('rejeita peso e altura não numéricos mantendo o avanço bloqueado', async () => {
    const { getByLabelText } = await renderQuestionario();

    fireEvent.changeText(getByLabelText('Peso em quilos'), 'oitenta');
    fireEvent.changeText(getByLabelText('Altura em centímetros'), 'alto');

    expect(getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });
});

describe('QuestionnaireScreen — submissão', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envia o payload esperado e navega para os ajustes finais', async () => {
    const { getByLabelText, getAllByLabelText } = await renderQuestionario();

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    fireEvent.changeText(getByLabelText('Dia de nascimento'), '5');
    fireEvent.changeText(getByLabelText('Mês de nascimento'), '3');
    fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
    fireEvent.press(getByLabelText('Masculino'));
    fireEvent.changeText(getByLabelText('Peso em quilos'), '82.5');
    fireEvent.changeText(getByLabelText('Altura em centímetros'), '181');
    fireEvent.press(getByLabelText('Intermediário (6 meses - 2 anos)'));
    fireEvent.press(getByLabelText('Ganho de Massa Muscular'));
    fireEvent.press(getByLabelText('Terça-feira'));
    fireEvent.press(getByLabelText('45-60 min'));

    // Três pares Sim/Não, na ordem: cardio, alongamento, lesões
    const sims = getAllByLabelText('Sim');
    const naos = getAllByLabelText('Não');
    fireEvent.press(sims[0]); // cardio
    fireEvent.press(sims[1]); // alongamento
    fireEvent.press(naos[2]); // sem lesões

    const avancar = getByLabelText('Conversar com IA');
    expect(avancar.props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(avancar);

    await waitFor(() => expect(mockSaveQuestionnaire).toHaveBeenCalledTimes(1));

    expect(mockSaveQuestionnaire).toHaveBeenCalledWith(
      expect.objectContaining({
        usuario_id: 'user-123',
        // dia e mês recebem zero à esquerda
        data_nascimento: '1990-03-05',
        genero: 'male',
        peso_kg: 82.5,
        altura_cm: 181,
        experiencia_treino: 'intermediate',
        objetivo: 'muscle_gain',
        dias_treino: ['tue'],
        inclui_cardio: true,
        inclui_alongamento: true,
        tem_lesoes: false,
        lesoes_detalhes: null,
        tempo_medio_treino_min: 60,
      }),
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        'PostQuestionnaireChat',
        expect.objectContaining({ formData: expect.objectContaining({ nome: 'Pedro Marconato' }) }),
      ),
    );
  });

  it('exige detalhe da lesão quando o usuário declara ter restrição', async () => {
    const { getByLabelText, getAllByLabelText } = await renderQuestionario();

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    fireEvent.changeText(getByLabelText('Dia de nascimento'), '5');
    fireEvent.changeText(getByLabelText('Mês de nascimento'), '3');
    fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
    fireEvent.press(getByLabelText('Masculino'));
    fireEvent.changeText(getByLabelText('Peso em quilos'), '82.5');
    fireEvent.changeText(getByLabelText('Altura em centímetros'), '181');
    fireEvent.press(getByLabelText('Intermediário (6 meses - 2 anos)'));
    fireEvent.press(getByLabelText('Ganho de Massa Muscular'));
    fireEvent.press(getByLabelText('Terça-feira'));
    fireEvent.press(getByLabelText('45-60 min'));
    fireEvent.press(getAllByLabelText('Sim')[0]); // cardio
    fireEvent.press(getAllByLabelText('Sim')[1]); // alongamento
    fireEvent.press(getAllByLabelText('Sim')[2]); // TEM lesões

    // Com lesão declarada e sem detalhe, o avanço continua bloqueado
    expect(getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    fireEvent.changeText(getByLabelText('Quais lesões ou restrições'), 'Dor no joelho');

    expect(getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });
});
