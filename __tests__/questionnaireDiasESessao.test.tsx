// __tests__/questionnaireDiasESessao.test.tsx
// Dois modos de falha reais da tela de questionário:
//
// 1. Dias da semana deslocados: os rótulos visuais seguiam seg→dom
//    (S,T,Q,Q,S,S,D) mas os values/fulls começavam no domingo — o usuário
//    tocava no 1º "S" achando que era Segunda e gravava Domingo. O plano
//    inteiro saía agendado no dia errado.
//
// 2. Logout forçado offline: com sessão presente e um erro qualquer na tela,
//    o probe de validade tratava QUALQUER exceção (rede fora, config ausente,
//    5xx) como sessão expirada e deslogava — contradizendo a política do
//    AuthContext ("deslogar offline é punição por falta de rede").

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, within } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: mockAddListener }),
}));

const mockSignOut = jest.fn(async () => ({}));
jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123' },
    session: { access_token: 'token-abc' },
    updateProfile: jest.fn(async () => ({})),
    signOut: mockSignOut,
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

const mockProbeSessionValidity = jest.fn(async (_opts: unknown): Promise<string> => 'indeterminate');
jest.mock('../src/services/auth/sessionProbe', () => ({
  probeSessionValidity: (opts: unknown) => mockProbeSessionValidity(opts),
}));

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

import QuestionnaireScreen from '../src/screens/QuestionnaireScreen';

const renderQuestionario = async () => {
  const utils = render(<QuestionnaireScreen />);
  await utils.findByLabelText('Nome completo');
  return utils;
};

type Utils = Awaited<ReturnType<typeof renderQuestionario>>;

/** Caminha até o passo dos dias da semana (pergunta 7 do stepper). */
const irAteOsDias = async (utils: Utils) => {
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
  await findByLabelText('Segunda-feira');
};

/** Preenche o fluxo inteiro (payload válido) — mesmo roteiro do teste de submissão. */
const preencherFormularioValido = async (utils: Utils) => {
  const { getByLabelText } = utils;
  await irAteOsDias(utils);
  fireEvent.press(getByLabelText('Segunda-feira'));
  fireEvent.press(getByLabelText('Continuar'));
  fireEvent.press(getByLabelText('45-60 min'));
  await waitFor(() => expect(utils.getByText('Incluir cardio no plano?')).toBeTruthy());
  fireEvent.press(getByLabelText('Sim')); // cardio
  // Dose declarada (0021): "sim" revela dias + minutos e só então avança.
  await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());
  fireEvent.press(getByLabelText('1 dia'));
  fireEvent.press(getByLabelText('30 min'));
  // Anamnese de cardio (02-01): obrigatória para liberar o Continuar do passo.
  fireEvent.press(getByLabelText('Sim, já pratico'));
  fireEvent.press(getByLabelText('Continuar'));
  await waitFor(() => expect(utils.getByText('Incluir alongamentos no plano?')).toBeTruthy());
  fireEvent.press(getByLabelText('Sim')); // alongamento
  await waitFor(() => expect(utils.getByText('Alguma lesão ou restrição?')).toBeTruthy());
  fireEvent.press(getByLabelText('Não')); // sem lesões
};

describe('QuestionnaireScreen — dias da semana', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cada botão de dia exibe a letra do dia que realmente grava', async () => {
    const utils = await renderQuestionario();
    await irAteOsDias(utils);
    const { getByLabelText } = utils;

    // Par (dia acessível → letra visual) da convenção brasileira seg→dom.
    const esperado: Array<[string, string]> = [
      ['Segunda-feira', 'S'],
      ['Terça-feira', 'T'],
      ['Quarta-feira', 'Q'],
      ['Quinta-feira', 'Q'],
      ['Sexta-feira', 'S'],
      ['Sábado', 'S'],
      ['Domingo', 'D'],
    ];
    for (const [full, letra] of esperado) {
      expect(within(getByLabelText(full)).getByText(letra)).toBeTruthy();
    }
  });

  it('a fileira começa na segunda-feira e termina no domingo', async () => {
    const utils = await renderQuestionario();
    await irAteOsDias(utils);
    const { getAllByLabelText } = utils;

    const fileira = getAllByLabelText(/-feira$|^Sábado$|^Domingo$/).map(
      (node) => node.props.accessibilityLabel,
    );
    expect(fileira).toEqual([
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
      'Sábado',
      'Domingo',
    ]);
  });

  it('tocar em Segunda-feira grava exatamente "mon" no payload', async () => {
    const utils = await renderQuestionario();
    await preencherFormularioValido(utils);

    fireEvent.press(utils.getByLabelText('Conversar com IA'));

    await waitFor(() => expect(mockSaveQuestionnaire).toHaveBeenCalledTimes(1));
    expect(mockSaveQuestionnaire).toHaveBeenCalledWith(
      expect.objectContaining({ dias_treino: ['mon'] }),
    );
  });
});

describe('QuestionnaireScreen — probe de sessão não pune falta de rede', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  /** Submete com a API falhando por rede, o que seta o estado de erro da tela
   *  e dispara o probe de sessão. */
  const submeterComApiFalhando = async () => {
    const utils = await renderQuestionario();
    await preencherFormularioValido(utils);
    mockSaveQuestionnaire.mockRejectedValueOnce(new Error('Network request failed'));
    fireEvent.press(utils.getByLabelText('Conversar com IA'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Erro ao Salvar', expect.any(String)),
    );
    return utils;
  };

  it('probe inconclusivo (rede fora / config ausente) NÃO desloga nem alerta sessão expirada', async () => {
    mockProbeSessionValidity.mockResolvedValue('indeterminate');

    await submeterComApiFalhando();
    await waitFor(() => expect(mockProbeSessionValidity).toHaveBeenCalled());

    // Fiação real: a tela precisa entregar o token da sessão ao probe —
    // um authToken undefined viraria 'indeterminate' silencioso para sempre.
    expect(mockProbeSessionValidity).toHaveBeenCalledWith(
      expect.objectContaining({ authToken: 'token-abc' }),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith('Sessão Expirada', expect.anything(), expect.anything());
  });

  it('probe inválido (401/403 reais) segue deslogando', async () => {
    mockProbeSessionValidity.mockResolvedValue('invalid');

    await submeterComApiFalhando();

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Sessão Expirada', expect.any(String), expect.anything()),
    );
  });
});
