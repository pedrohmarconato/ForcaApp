// __tests__/refazerTreinoSheet.test.tsx
// Contrato do sheet "Refazer treino" do Perfil: confirmação que explica o
// arquivamento do plano atual, estado bloqueado quando há sessão em andamento
// (só aviso, sem CTA), estado de checagem com spinner e cancelamento sempre
// liberado (o usuário nunca fica preso no modal).

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RefazerTreinoSheet from '../src/components/profile/RefazerTreinoSheet';

const renderSheet = (overrides: Partial<React.ComponentProps<typeof RefazerTreinoSheet>> = {}) => {
  const onConfirmar = jest.fn();
  const onDismiss = jest.fn();
  const utils = render(
    <RefazerTreinoSheet
      visible
      bloqueadoPorSessaoEmAndamento={false}
      verificando={false}
      onConfirmar={onConfirmar}
      onDismiss={onDismiss}
      {...overrides}
    />,
  );
  return { ...utils, onConfirmar, onDismiss };
};

describe('RefazerTreinoSheet', () => {
  it('fechado não renderiza conteúdo', () => {
    const { queryByText } = renderSheet({ visible: false });
    expect(queryByText('Refazer seu treino?')).toBeNull();
  });

  it('estado normal mostra a confirmação e dispara onConfirmar e onDismiss', () => {
    const { getByLabelText, getByText, onConfirmar, onDismiss } = renderSheet();

    expect(getByText('Refazer seu treino?')).toBeTruthy();
    expect(
      getByText(
        'Seu plano atual é arquivado e um novo é gerado a partir de um questionário atualizado. Suas sessões concluídas continuam no seu histórico.',
      ),
    ).toBeTruthy();

    fireEvent.press(getByLabelText('Continuar para o questionário'));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Cancelar'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('estado bloqueado mostra só o aviso, sem CTA de confirmar, e Fechar dispensa', () => {
    const { getByLabelText, getByText, queryByText, onConfirmar, onDismiss } = renderSheet({
      bloqueadoPorSessaoEmAndamento: true,
    });

    expect(getByText('Treino em andamento')).toBeTruthy();
    expect(
      getByText('Você tem um treino em andamento. Termine ou saia dele antes de gerar um novo plano.'),
    ).toBeTruthy();
    expect(queryByText('Continuar para o questionário')).toBeNull();

    fireEvent.press(getByLabelText('Fechar'));
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('verificando mostra o estado de checagem e não expõe o CTA', () => {
    const { getByLabelText, getByText, queryByText, onConfirmar } = renderSheet({
      verificando: true,
      // Veredito velho da rodada anterior não pode reaparecer durante a checagem.
      bloqueadoPorSessaoEmAndamento: true,
    });

    expect(getByText('Checando se há um treino em andamento...')).toBeTruthy();
    expect(queryByText('Treino em andamento')).toBeNull();
    expect(queryByText('Refazer seu treino?')).toBeNull();
    expect(queryByText('Continuar para o questionário')).toBeNull();

    fireEvent.press(getByLabelText('Cancelar'));
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('cancelamento continua liberado durante a checagem', () => {
    const { getByTestId, getByLabelText, onDismiss } = renderSheet({ verificando: true });

    fireEvent.press(getByLabelText('Cancelar'));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('refazer-treino-backdrop'));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('fechar pelo fundo dispara onDismiss', () => {
    const { getByTestId, onDismiss } = renderSheet();
    fireEvent.press(getByTestId('refazer-treino-backdrop'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
