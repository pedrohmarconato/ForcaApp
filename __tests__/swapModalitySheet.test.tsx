// __tests__/swapModalitySheet.test.tsx
// SwapModalitySheet — sheet de escolha de modalidade (Fase 3, REQ-06, Plano
// 03-03 Task 1). Molde de teste: __tests__ de componente com
// @testing-library/react-native, mesmo padrão de outros sheets do repo.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import SwapModalitySheet from '../src/components/session/SwapModalitySheet';
import { CARDIO_MODALIDADES } from '../src/constants/cardioModalidades';

describe('SwapModalitySheet', () => {
  it('carregando (modalidades=null): mostra Skeleton, nenhum item, sem botão de confirmar', () => {
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={null}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Carregando modalidades aceitas')).toBeTruthy();
    expect(screen.queryByTestId('swap-modality-confirm')).toBeNull();
    for (const m of CARDIO_MODALIDADES) {
      expect(screen.queryByTestId(`swap-modality-${m}`)).toBeNull();
    }
  });

  it('vazio (D-02): EmptyState "Nenhuma modalidade cadastrada", nenhuma modalidade do catálogo aparece', () => {
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={[]}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('Nenhuma modalidade cadastrada')).toBeTruthy();
    for (const m of CARDIO_MODALIDADES) {
      expect(screen.queryByTestId(`swap-modality-${m}`)).toBeNull();
    }
  });

  it('erro: Notice tone danger com ação de recarregar', () => {
    const onRecarregar = jest.fn();
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={null}
        erro
        onRecarregar={onRecarregar}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('Não foi possível carregar as modalidades')).toBeTruthy();
    fireEvent.press(screen.getByText('Tentar novamente'));
    expect(onRecarregar).toHaveBeenCalled();
  });

  it('lista fechada: exatamente as modalidades aceitas aparecem, com testID e role radio', () => {
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={['Corrida', 'Remo Ergômetro', 'Pular Corda']}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    for (const m of ['Corrida', 'Remo Ergômetro', 'Pular Corda']) {
      const item = screen.getByTestId(`swap-modality-${m}`);
      expect(item).toBeTruthy();
      expect(item.props.accessibilityRole).toBe('radio');
    }
  });

  it('exclui a modalidade atual da lista (evita troca-para-si-mesma)', () => {
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={['Corrida', 'Caminhada']}
        onConfirm={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByTestId('swap-modality-Corrida')).toBeTruthy();
    expect(screen.queryByTestId('swap-modality-Caminhada')).toBeNull();
  });

  it('confirmar: seleciona uma modalidade e chama onConfirm com ela', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={['Corrida', 'Remo Ergômetro']}
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('swap-modality-Remo Ergômetro'));
    fireEvent.press(screen.getByTestId('swap-modality-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('Remo Ergômetro');
  });

  it('busy trava o botão de confirmar mesmo com seleção; reabrir reseta a seleção', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={['Corrida', 'Remo Ergômetro']}
        busy
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('swap-modality-Remo Ergômetro'));
    fireEvent.press(screen.getByTestId('swap-modality-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();

    // Reabrir (visible alterna false -> true) reseta a seleção — mesmo
    // padrão de SkipReasonSheet: reabrir nunca herda escolha anterior.
    screen.rerender(
      <SwapModalitySheet
        inline
        visible={false}
        exercicioAtualNome="Caminhada"
        modalidades={['Corrida', 'Remo Ergômetro']}
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    screen.rerender(
      <SwapModalitySheet
        inline
        visible
        exercicioAtualNome="Caminhada"
        modalidades={['Corrida', 'Remo Ergômetro']}
        onConfirm={onConfirm}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('swap-modality-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
