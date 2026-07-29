// __tests__/reorderScopeSheet.test.tsx
// Sheet de escopo da reordenação de treinos (Fase 3): o usuário final escolhe
// se a nova ordem vale só para a semana editada ou também para as próximas.
// Fechar pelo fundo = voltar à edição sem salvar nada.

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ReorderScopeSheet from '../src/components/session/ReorderScopeSheet';

describe('ReorderScopeSheet', () => {
  it('escondido quando visible=false', () => {
    const { queryByText } = render(
      <ReorderScopeSheet visible={false} onChoose={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(queryByText('Só nesta semana')).toBeNull();
  });

  it('mostra as duas opções de escopo', () => {
    const { getByText } = render(
      <ReorderScopeSheet visible onChoose={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(getByText('Aplicar a nova ordem')).toBeTruthy();
    expect(getByText('Só nesta semana')).toBeTruthy();
    expect(getByText('Nesta e nas próximas semanas')).toBeTruthy();
  });

  it("escolher 'Só nesta semana' devolve escopo 'semana'", () => {
    const onChoose = jest.fn();
    const { getByText } = render(
      <ReorderScopeSheet visible onChoose={onChoose} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('Só nesta semana'));
    expect(onChoose).toHaveBeenCalledWith('semana');
  });

  it("escolher 'Nesta e nas próximas semanas' devolve escopo 'futuras'", () => {
    const onChoose = jest.fn();
    const { getByText } = render(
      <ReorderScopeSheet visible onChoose={onChoose} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('Nesta e nas próximas semanas'));
    expect(onChoose).toHaveBeenCalledWith('futuras');
  });

  it('fechar pelo fundo dispara onDismiss sem escolher', () => {
    const onChoose = jest.fn();
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <ReorderScopeSheet visible onChoose={onChoose} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByTestId('reorder-scope-backdrop'));
    expect(onDismiss).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
  });
});
