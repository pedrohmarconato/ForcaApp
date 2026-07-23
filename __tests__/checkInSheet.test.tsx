// __tests__/checkInSheet.test.tsx
// Contrato do check-in obrigatório: sem as DUAS respostas o treino não começa;
// tempo cheio viaja como null; campo livre só vale com número positivo.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CheckInSheet from '../src/components/session/CheckInSheet';

const renderSheet = () => {
  const onConfirm = jest.fn();
  const utils = render(
    <CheckInSheet visible sessionTitle="Push A" onConfirm={onConfirm} />,
  );
  return { ...utils, onConfirm };
};

describe('CheckInSheet — obrigatoriedade', () => {
  it('começa desabilitado e não confirma sem as duas respostas', () => {
    const { getByLabelText, onConfirm } = renderSheet();

    const comecar = getByLabelText('Começar treino');
    expect(comecar.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(comecar);
    expect(onConfirm).not.toHaveBeenCalled();

    // Só o humor ainda não basta.
    fireEvent.press(getByLabelText('Cansado'));
    fireEvent.press(comecar);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('humor + chip de tempo confirmam com os minutos do chip', () => {
    const { getByLabelText, onConfirm } = renderSheet();

    fireEvent.press(getByLabelText('Cansado'));
    fireEvent.press(getByLabelText('45 minutos'));
    fireEvent.press(getByLabelText('Começar treino'));

    expect(onConfirm).toHaveBeenCalledWith({ mood: 'cansado', availableMinutes: 45 });
  });

  it('tempo cheio confirma com availableMinutes null', () => {
    const { getByLabelText, onConfirm } = renderSheet();

    fireEvent.press(getByLabelText('Com energia'));
    fireEvent.press(getByLabelText('Tempo cheio'));
    fireEvent.press(getByLabelText('Começar treino'));

    expect(onConfirm).toHaveBeenCalledWith({ mood: 'com_energia', availableMinutes: null });
  });

  it('campo livre exige número positivo e vence o chip anterior', () => {
    const { getByLabelText, onConfirm } = renderSheet();

    fireEvent.press(getByLabelText('Normal'));
    fireEvent.press(getByLabelText('60 minutos'));
    fireEvent.changeText(getByLabelText('Outro tempo em minutos'), 'abc');

    // Texto não-numérico é filtrado → sem resposta de tempo válida.
    const comecar = getByLabelText('Começar treino');
    fireEvent.press(comecar);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.changeText(getByLabelText('Outro tempo em minutos'), '25');
    fireEvent.press(comecar);
    expect(onConfirm).toHaveBeenCalledWith({ mood: 'normal', availableMinutes: 25 });
  });
});
