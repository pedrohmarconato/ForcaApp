// __tests__/questionnaireScreen.test.tsx
// Tela 02 na Direção 03 (stepper conversacional). Cobre o que a apresentação
// nova precisa manter:
//  - cada passo só avança com o bloco realmente válido (mesmas regras de antes);
//  - escolha única avança sozinha; voltar preserva respostas;
//  - retomada: com rascunho salvo, abre no primeiro passo pendente;
//  - a submissão monta o MESMO payload de antes e reseta o chat antes de navegar.

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

/**
 * Renderiza a tela e espera o fim do carregamento do storage seguro — só
 * depois dele o stepper aparece, na pergunta 1 (nome).
 */
const renderQuestionario = async () => {
  const utils = render(<QuestionnaireScreen />);
  await utils.findByLabelText('Nome completo');
  return utils;
};

type Utils = Awaited<ReturnType<typeof renderQuestionario>>;

/** Caminha pelos 11 passos com valores válidos, parando no passo final (lesões). */
const preencherTudo = async (utils: Utils) => {
  const { getByLabelText, findByLabelText } = utils;
  // 1 — nome (Continuar)
  fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
  fireEvent.press(getByLabelText('Continuar'));
  // 2 — nascimento (Continuar)
  fireEvent.changeText(getByLabelText('Dia de nascimento'), '5');
  fireEvent.changeText(getByLabelText('Mês de nascimento'), '3');
  fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
  fireEvent.press(getByLabelText('Continuar'));
  // 3 — gênero (avanço automático)
  fireEvent.press(getByLabelText('Masculino'));
  await findByLabelText('Peso em quilos');
  // 4 — corpo (Continuar)
  fireEvent.changeText(getByLabelText('Peso em quilos'), '82.5');
  fireEvent.changeText(getByLabelText('Altura em centímetros'), '181');
  fireEvent.press(getByLabelText('Continuar'));
  // 5 — experiência (auto)
  fireEvent.press(getByLabelText('Intermediário (6 meses - 2 anos)'));
  await findByLabelText('Ganho de Massa Muscular');
  // 6 — objetivo (auto)
  fireEvent.press(getByLabelText('Ganho de Massa Muscular'));
  await findByLabelText('Terça-feira');
  // 7 — dias (Continuar)
  fireEvent.press(getByLabelText('Terça-feira'));
  fireEvent.press(getByLabelText('Continuar'));
  // 8 — tempo (auto)
  fireEvent.press(getByLabelText('45-60 min'));
  // 9 — cardio: "Sim" NÃO avança sozinho (0021) — revela a dose declarada, que
  // faz parte da resposta. Dias e minutos são obrigatórios; modalidade é
  // opcional (o catálogo pode nem estar disponível).
  await waitFor(() => expect(utils.getByText('Incluir cardio no plano?')).toBeTruthy());
  fireEvent.press(getByLabelText('Sim'));
  await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());
  // Só 1 dia de treino foi marcado acima, e a tela NÃO oferece mais dias de
  // cardio do que dias de treino — dose impossível seria cobrada do molde.
  fireEvent.press(getByLabelText('1 dia'));
  fireEvent.press(getByLabelText('30 min'));
  fireEvent.press(getByLabelText('Sim, já pratico'));
  fireEvent.changeText(getByLabelText('Distância confortável hoje (km)'), '5,5');
  fireEvent.press(getByLabelText('Completar uma corrida de 5km'));
  fireEvent.press(getByLabelText('Continuar'));
  // 10 — alongamento (auto)
  await waitFor(() => expect(utils.getByText('Incluir alongamentos no plano?')).toBeTruthy());
  fireEvent.press(getByLabelText('Sim'));
  // 11 — lesões (passo final, sem avanço automático)
  await waitFor(() => expect(utils.getByText('Alguma lesão ou restrição?')).toBeTruthy());
  fireEvent.press(getByLabelText('Não'));
};

describe('QuestionnaireScreen — stepper e validação por passo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abre na pergunta 1 com o Continuar desabilitado até o nome existir', async () => {
    const { getByLabelText, getByText } = await renderQuestionario();

    expect(getByText('Pergunta 1 de 11')).toBeTruthy();
    expect(getByLabelText('Continuar').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    expect(getByLabelText('Continuar').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('escolha única avança sozinha para o próximo passo', async () => {
    const utils = await renderQuestionario();
    const { getByLabelText, findByLabelText } = utils;

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    fireEvent.press(getByLabelText('Continuar'));
    fireEvent.changeText(getByLabelText('Dia de nascimento'), '5');
    fireEvent.changeText(getByLabelText('Mês de nascimento'), '3');
    fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
    fireEvent.press(getByLabelText('Continuar'));

    // Tocar no gênero leva ao passo do corpo sem botão nenhum
    fireEvent.press(getByLabelText('Masculino'));
    expect(await findByLabelText('Peso em quilos')).toBeTruthy();
    expect(utils.getByText('Pergunta 4 de 11')).toBeTruthy();
  });

  it('data absurda (99/99/2000) mantém o Continuar travado — mesma validação de antes', async () => {
    const utils = await renderQuestionario();
    const { getByLabelText } = utils;

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    fireEvent.press(getByLabelText('Continuar'));

    fireEvent.changeText(getByLabelText('Dia de nascimento'), '99');
    fireEvent.changeText(getByLabelText('Mês de nascimento'), '99');
    fireEvent.changeText(getByLabelText('Ano de nascimento'), '2000');

    expect(getByLabelText('Continuar').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('peso e altura não numéricos mantêm o passo do corpo travado', async () => {
    const utils = await renderQuestionario();
    const { getByLabelText, findByLabelText } = utils;

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    fireEvent.press(getByLabelText('Continuar'));
    fireEvent.changeText(getByLabelText('Dia de nascimento'), '5');
    fireEvent.changeText(getByLabelText('Mês de nascimento'), '3');
    fireEvent.changeText(getByLabelText('Ano de nascimento'), '1990');
    fireEvent.press(getByLabelText('Continuar'));
    fireEvent.press(getByLabelText('Masculino'));
    await findByLabelText('Peso em quilos');

    fireEvent.changeText(getByLabelText('Peso em quilos'), 'oitenta');
    fireEvent.changeText(getByLabelText('Altura em centímetros'), 'alto');

    expect(getByLabelText('Continuar').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('desmarcar todos os dias volta a travar o Continuar do passo', async () => {
    const utils = await renderQuestionario();
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

    fireEvent.press(getByLabelText('Terça-feira'));
    expect(getByLabelText('Continuar').props.accessibilityState).toMatchObject({ disabled: false });

    fireEvent.press(getByLabelText('Terça-feira'));
    expect(getByLabelText('Continuar').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('quem ainda não pratica cardio não vê o campo de distância confortável', async () => {
    const utils = await renderQuestionario();
    const { getByLabelText, findByLabelText, queryByLabelText } = utils;

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
    fireEvent.press(getByLabelText('Terça-feira'));
    fireEvent.press(getByLabelText('Continuar'));
    fireEvent.press(getByLabelText('45-60 min'));
    await waitFor(() => expect(utils.getByText('Incluir cardio no plano?')).toBeTruthy());
    fireEvent.press(getByLabelText('Sim'));
    await waitFor(() => expect(utils.getByText('Quantos dias por semana?')).toBeTruthy());

    fireEvent.press(getByLabelText('Não, ainda não'));

    expect(queryByLabelText('Distância confortável hoje (km)')).toBeNull();
  });

  it('voltar uma pergunta preserva a resposta digitada', async () => {
    const utils = await renderQuestionario();
    const { getByLabelText } = utils;

    fireEvent.changeText(getByLabelText('Nome completo'), 'Pedro Marconato');
    fireEvent.press(getByLabelText('Continuar'));
    expect(utils.getByText('Pergunta 2 de 11')).toBeTruthy();

    fireEvent.press(getByLabelText('Voltar uma pergunta'));
    expect(utils.getByText('Pergunta 1 de 11')).toBeTruthy();
    expect(getByLabelText('Nome completo').props.value).toBe('Pedro Marconato');
  });
});

describe('QuestionnaireScreen — retomada do rascunho', () => {
  beforeEach(() => jest.clearAllMocks());

  it('com rascunho parcial salvo, abre no primeiro passo pendente', async () => {
    const secureStorageMock = jest.requireMock('../src/services/auth/secureStorage');
    (secureStorageMock.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        nome: 'Pedro Marconato',
        data_nascimento: '1990-03-05',
        genero: 'male',
        // peso/altura em diante ainda sem resposta
      }),
    );

    const utils = render(<QuestionnaireScreen />);

    // Nome, data e gênero já respondidos → retomada direto no passo do corpo.
    expect(await utils.findByLabelText('Peso em quilos')).toBeTruthy();
    expect(utils.getByText('Pergunta 4 de 11')).toBeTruthy();
  });
});

describe('QuestionnaireScreen — submissão', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envia o payload esperado e navega para os ajustes finais', async () => {
    const utils = await renderQuestionario();
    await preencherTudo(utils);

    const avancar = utils.getByLabelText('Conversar com IA');
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
        // Dose declarada (0021): é o que a validação do molde vai cobrar.
        cardio_dias_semana: 1,
        cardio_minutos_sessao: 30,
        cardio_pratica_atualmente: true,
        // Vírgula vira ponto — mesmo comportamento de numericTextToNumber (REQ-01).
        cardio_distancia_confortavel_km: 5.5,
        cardio_objetivo: 'completar_5k',
        // Nenhuma modalidade escolhida (o catálogo não está disponível no teste)
        // → null, nunca lista vazia: array vazio filtraria o cardápio por
        // "nada" e o aluno receberia plano sem cardio tendo pedido cardio.
        cardio_modalidades: null,
      }),
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        'PostQuestionnaireChat',
        expect.objectContaining({ formData: expect.objectContaining({ nome: 'Pedro Marconato' }) }),
      ),
    );
  });

  it('uma submissão nova apaga o chat persistido da rodada anterior antes de navegar', async () => {
    // Modo de falha real: geração falhou depois de o chat ser encerrado →
    // isChatEnded=true fica salvo → refazer o questionário abria o chat morto
    // ("Chat finalizado"). A submissão precisa resetar as duas chaves ANTES
    // da navegação, para a tela de chat inicializar uma conversa nova.
    const utils = await renderQuestionario();
    await preencherTudo(utils);

    fireEvent.press(utils.getByLabelText('Conversar com IA'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    const secureStorageMock = jest.requireMock('../src/services/auth/secureStorage');
    expect(secureStorageMock.removeItem).toHaveBeenCalledWith('@chat_messages_user-123');
    expect(secureStorageMock.removeItem).toHaveBeenCalledWith('@chat_state_user-123');

    // O reset tem que acontecer ANTES da navegação — depois dela a tela de
    // chat já pode ter lido o estado morto.
    const ordensRemove = (secureStorageMock.removeItem as jest.Mock).mock.invocationCallOrder;
    const ordemNavigate = mockNavigate.mock.invocationCallOrder[0];
    expect(Math.max(...ordensRemove)).toBeLessThan(ordemNavigate);
  });

  it('exige detalhe da lesão quando o usuário declara ter restrição', async () => {
    const utils = await renderQuestionario();
    await preencherTudo(utils);

    // Troca o "Não" por "Sim" no passo final: sem detalhe, o envio trava
    fireEvent.press(utils.getByLabelText('Sim'));
    expect(utils.getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    fireEvent.changeText(utils.getByLabelText('Quais lesões ou restrições'), 'Dor no joelho');

    expect(utils.getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it('enquanto salva, o formulário fica bloqueado por um véu de progresso (achado #1)', async () => {
    let resolverSave!: (valor: unknown) => void;
    mockSaveQuestionnaire.mockImplementationOnce(
      () => new Promise((resolve) => { resolverSave = resolve; }) as any,
    );

    const utils = await renderQuestionario();
    await preencherTudo(utils);

    fireEvent.press(utils.getByLabelText('Conversar com IA'));

    // O véu precisa estar de pé enquanto a promessa da API não responde:
    // é ele que impede edição tardia de divergir do payload já capturado
    await utils.findByTestId('veu-salvando');
    await waitFor(() => expect(mockSaveQuestionnaire).toHaveBeenCalledTimes(1));

    resolverSave({ success: true });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(utils.queryByTestId('veu-salvando')).toBeNull();
  });
});

describe('QuestionnaireScreen — opção de gerar o treino direto', () => {
  beforeEach(() => jest.clearAllMocks());

  it('os dois botões finais começam travados até o passo de lesões ser respondido', async () => {
    const utils = await renderQuestionario();
    await preencherTudo(utils);

    // preencherTudo respondeu "Não" — destrava. Voltar ao estado sem resposta
    // não é possível sem desmarcar; valida-se o caminho travado via lesão sem detalhe.
    fireEvent.press(utils.getByLabelText('Sim'));
    expect(utils.getByLabelText('Gerar treino direto').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(utils.getByLabelText('Conversar com IA').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('tocar em "Gerar treino direto" navega com skipChat: true', async () => {
    const utils = await renderQuestionario();
    await preencherTudo(utils);

    fireEvent.press(utils.getByLabelText('Gerar treino direto'));

    await waitFor(() => expect(mockSaveQuestionnaire).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));

    expect(mockNavigate).toHaveBeenCalledWith(
      'PostQuestionnaireChat',
      expect.objectContaining({ skipChat: true, formData: expect.any(Object) }),
    );
  });

  it('tocar em "Conversar com IA" continua navegando sem skipChat', async () => {
    const utils = await renderQuestionario();
    await preencherTudo(utils);

    fireEvent.press(utils.getByLabelText('Conversar com IA'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith(
      'PostQuestionnaireChat',
      expect.objectContaining({ formData: expect.any(Object) }),
    );
    // skipChat não deve estar presente (ou ser undefined) no caminho de conversa
    const chamada = mockNavigate.mock.calls[0];
    expect(chamada[1]).not.toHaveProperty('skipChat', true);
  });
});
